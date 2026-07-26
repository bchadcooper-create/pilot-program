// Supabase Edge Function: fcf-food-recognition
// Two things live here because they share the same meal-builder entry
// point and the same rate-limit accounting, not because they're related
// technically:
//   action: "photo"   — send a food photo, get back a best-guess food ID
//                        + macros from Claude's vision API. Counted
//                        against the free-tier daily photo cap.
//   action: "barcode"  — send a decoded UPC, get back product nutrition
//                        from Open Food Facts. Free — no AI call, no cost,
//                        not counted against the photo cap.
//
// Deploy with: supabase functions deploy fcf-food-recognition
// Requires the secret Chad already set: fcf-food-recognition = <Anthropic API key>
// (Supabase secrets are project-wide, so the name just needs to match
// what's read below — see ANTHROPIC_KEY_NAME.)
//
// Unlike usda-food, this function runs as the CALLING USER (their JWT is
// forwarded, not a service role key) so it can identify who's asking and
// enforce the per-user daily limit via the same RLS a client would have.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_KEY_NAME = 'fcf-food-recognition'; // the Supabase secret name Chad set
const ANTHROPIC_API_KEY = Deno.env.get(ANTHROPIC_KEY_NAME);
const ANTHROPIC_MODEL = 'claude-sonnet-5';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

// Matches LB_ADMIN_EMAIL in app.js — the Super User account gets
// unlimited photos for testing. Keep these two in sync if the admin
// account ever changes.
const ADMIN_EMAIL = 'b.chad.cooper@gmail.com';
const DAILY_PHOTO_LIMIT = 5;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Claude is asked for strict JSON. Models occasionally wrap it in a code
// fence or add a stray sentence despite instructions — strip both rather
// than fail the whole request over formatting.
function extractJSON(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object found in model response');
  return JSON.parse(raw.slice(start, end + 1));
}

function cleanNumber(v: unknown) {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) return json({ error: 'missing Authorization header' }, 401);
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json({ error: 'SUPABASE_URL / SUPABASE_ANON_KEY not available to function' }, 500);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'not authenticated' }, 401);
    const user = userData.user;
    const isSuperUser = (user.email || '').toLowerCase() === ADMIN_EMAIL;

    const body = await req.json();
    const action = body.action;

    if (action === 'barcode') {
      const barcode = String(body.barcode || '').trim();
      if (!barcode) return json({ error: 'barcode required' }, 400);

      const offRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
      const offData = await offRes.json();
      if (offData.status !== 1 || !offData.product) {
        return json({ error: 'not_found', message: 'No product found for that barcode.' }, 404);
      }
      const p = offData.product;
      const n = p.nutriments || {};
      const result = {
        source: 'barcode',
        barcode,
        description: p.product_name || p.generic_name || 'Unknown product',
        brandName: p.brands || null,
        servingDescription: p.serving_size || '100 g',
        confidence: 1, // exact product match — not a guess, never triggers the confirm prompt
        nutrients: {
          calories: cleanNumber(n['energy-kcal_serving'] ?? n['energy-kcal_100g']),
          protein: cleanNumber(n['proteins_serving'] ?? n['proteins_100g']),
          carbs: cleanNumber(n['carbohydrates_serving'] ?? n['carbohydrates_100g']),
          fat: cleanNumber(n['fat_serving'] ?? n['fat_100g']),
          fiber: cleanNumber(n['fiber_serving'] ?? n['fiber_100g']),
          sugar: cleanNumber(n['sugars_serving'] ?? n['sugars_100g']),
        },
      };

      // Tracked for future analytics only — barcode scans are not rate
      // limited today, so this read-then-write is best-effort and never
      // blocks the response (fire-and-forget below).
      if (!isSuperUser) {
        const today = new Date().toISOString().slice(0, 10);
        supabase.from('food_photo_usage')
          .select('barcode_count').eq('user_id', user.id).eq('usage_date', today).maybeSingle()
          .then(({ data }) =>
            supabase.from('food_photo_usage')
              .upsert({ user_id: user.id, usage_date: today, barcode_count: (data?.barcode_count || 0) + 1 },
                { onConflict: 'user_id,usage_date' })
          ).catch(() => {});
      }

      return json(result);
    }

    if (action === 'photo') {
      const image = body.image; // base64, no data: prefix
      const mediaType = body.mediaType || 'image/jpeg';
      if (!image) return json({ error: 'image required' }, 400);
      if (!ANTHROPIC_API_KEY) return json({ error: `${ANTHROPIC_KEY_NAME} secret not configured` }, 500);

      let usedToday = 0;
      const today = new Date().toISOString().slice(0, 10);
      if (!isSuperUser) {
        const { data: usageRow } = await supabase.from('food_photo_usage')
          .select('photo_count').eq('user_id', user.id).eq('usage_date', today).maybeSingle();
        usedToday = usageRow?.photo_count || 0;
        if (usedToday >= DAILY_PHOTO_LIMIT) {
          return json({ error: 'limit_reached', used: usedToday, limit: DAILY_PHOTO_LIMIT }, 429);
        }
      }

      const prompt = `You are a nutrition estimation assistant for a fitness app. Look at this food photo and identify what's being eaten.

Respond with ONLY a JSON object, no other text, in exactly this shape:
{
  "description": "short plain description of the food/meal, e.g. 'grilled chicken breast with steamed broccoli and rice'",
  "servingDescription": "your best estimate of the portion shown, e.g. '1 plate, ~6oz protein'",
  "confidence": 0.0 to 1.0,
  "nutrients": { "calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number, "sugar": number }
}

Confidence guidance: use 0.85+ only for a single, clearly identifiable, commonly-portioned food. Use below 0.8 for mixed dishes, ambiguous portions, poor lighting, partially visible food, or anything home-made/restaurant-plated where the exact ingredients aren't certain. Be conservative — an overconfident wrong guess is worse than an honest low score.

Nutrient numbers should be your best real estimate for the portion shown, not placeholders.`;

      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
              { type: 'text', text: prompt },
            ],
          }],
        }),
      });

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        return json({ error: 'vision_api_failed', detail: errText }, 502);
      }
      const anthropicData = await anthropicRes.json();
      const textBlock = (anthropicData.content || []).find((b: any) => b.type === 'text');
      if (!textBlock) return json({ error: 'no text in model response' }, 502);

      let parsed;
      try {
        parsed = extractJSON(textBlock.text);
      } catch (e) {
        return json({ error: 'could not parse model response as JSON', detail: String(e) }, 502);
      }

      const result = {
        source: 'photo',
        description: String(parsed.description || 'Unidentified food'),
        servingDescription: String(parsed.servingDescription || ''),
        confidence: Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0)),
        nutrients: {
          calories: cleanNumber(parsed.nutrients?.calories),
          protein: cleanNumber(parsed.nutrients?.protein),
          carbs: cleanNumber(parsed.nutrients?.carbs),
          fat: cleanNumber(parsed.nutrients?.fat),
          fiber: cleanNumber(parsed.nutrients?.fiber),
          sugar: cleanNumber(parsed.nutrients?.sugar),
        },
      };

      // Only counts against quota on a successful analysis — a failed
      // vision call shouldn't cost the user one of their 5.
      let newUsed = usedToday;
      if (!isSuperUser) {
        newUsed = usedToday + 1;
        await supabase.from('food_photo_usage')
          .upsert({ user_id: user.id, usage_date: today, photo_count: newUsed },
            { onConflict: 'user_id,usage_date' });
      }

      return json({ ...result, quota: { used: isSuperUser ? 0 : newUsed, limit: DAILY_PHOTO_LIMIT, unlimited: isSuperUser } });
    }

    return json({ error: 'invalid action, expected "photo" or "barcode"' }, 400);
  } catch (e) {
    return json({ error: e.message || 'unknown error' }, 500);
  }
});
