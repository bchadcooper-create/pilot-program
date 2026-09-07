// Supabase Edge Function: fcf-ai-coach
//
// Pro-only AI coaching. Three modes, one function:
//
//   weekly_summary      — Crew-Specific Progression Analytics
//                          Looks across workout history + trip structure to find
//                          patterns tied to pairing position (e.g. "day 3 of trip"
//                          strength drops), not just generic weekly recap.
//
//   fatigue_calibration — Fatigue and Readiness Calibration
//                          Explains WHY today's readiness/duty context suggests
//                          scaling volume, using the same inputs the rule-based
//                          Pilot Condition system already has, but reasoned in
//                          natural language with trip-specific context.
//
//   fuel_logistics       — Tactical Fueling and Turnaround Logistics
//                          Given today's classified schedule + what's been eaten,
//                          recommends flight-bag vs terminal-food decisions per gap.
//
// All three are Pro-gated. Free users never reach this function (client-side
// gate + this function re-checks subscription server-side).
//
// Deploy: supabase functions deploy fcf-ai-coach
// Reuses the Anthropic secret already set for fcf-food-recognition.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get('fcf-food-recognition');
const ANTHROPIC_MODEL   = 'claude-sonnet-4-6'; // reasoning over structured history — worth the upgrade from Haiku
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Prompts per mode ──────────────────────────────────────────────────────────

const PROMPTS = {
  weekly_summary: `You are a strength and conditioning coach for a commercial airline pilot or flight crew member.
You will receive their workout history (with dates and trip/pairing context), body weight trend, and Oura biometrics
for the past several weeks.

Find patterns that are SPECIFIC to their flying schedule — not generic fitness advice. Look especially for:
- A recurring drop in performance (weight lifted, session completion, RPE) on a particular day-of-trip
  (e.g. "day 3 of 4-day pairings" or "the day after a red-eye")
- Whether certain trip types (long layovers vs quick turns) correlate with skipped or shortened sessions
- Whether recovery markers (HRV, sleep) on specific days predict the following day's training quality
- Any genuine plateau (3+ weeks flat or declining on a lift) and a plausible cause from the data you have

If the data doesn't support a specific pattern, say so plainly — do not invent one. A pilot will spot a fabricated
insight immediately and it destroys trust in the whole feature.

Write 3-5 sentences, conversational, direct, no bullet points, no headers. Address them as "you". End with ONE
concrete, actionable suggestion for the coming week — not a vague encouragement.`,

  fatigue_calibration: `You are advising a pilot or flight crew member on whether to scale today's planned workout.
You will receive: today's readiness/recovery signal (Oura or self-reported), their current trip context (day
number in pairing, duty hours so far, upcoming report time if any), and recent training load.

Give ONE short paragraph (2-3 sentences) explaining whether today calls for full intensity, a scaled session, or
rest — and WHY, referencing the specific trip context, not generic "listen to your body" advice. If duty schedule
and recovery both look fine, say so briefly and confidently rather than manufacturing caution.

Do not repeat back the raw numbers you were given — synthesize them into a judgment.`,

  fuel_logistics: `You are advising a pilot or flight crew member on nutrition timing during today's duty day.
You will receive their flight schedule for today (classified legs, layovers, ground time) and what they have
already logged eating today.

Identify the best remaining window today to get real food (not just a snack) versus where they should rely on
something already packed. Be specific about which gap in their schedule is usable and why others aren't (too
short after report/deplaning buffers, restaurants likely closed at that hour, etc.).

Write 2-3 sentences, direct, practical. If there is no good window left today, say that plainly and suggest what
to pack for tomorrow instead of pretending a bad option is fine.`,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });

    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });

    // Server-side Pro gate — the client should never reach here on free tier,
    // but never trust the client alone for a paid feature.
    const { data: sub } = await supabase
      .from('subscriptions').select('tier, status').eq('user_id', user.id).maybeSingle();
    const isPro = sub?.tier === 'pro' && (sub?.status === 'active' || sub?.status === 'grace');
    if (!isPro) {
      return new Response(JSON.stringify({ error: 'pro_required' }), { status: 402, headers: CORS });
    }

    const body = await req.json();
    const { mode, context } = body;
    if (!mode || !PROMPTS[mode]) {
      return new Response(JSON.stringify({ error: 'invalid_mode' }), { status: 400, headers: CORS });
    }
    if (!context) {
      return new Response(JSON.stringify({ error: 'context_required' }), { status: 400, headers: CORS });
    }

    // Weekly summary is cached for 24h per user — it's a review of the past
    // week, not something that needs to regenerate on every tab open.
    if (mode === 'weekly_summary') {
      const { data: cached } = await supabase
        .from('user_profiles').select('profile_data').eq('user_id', user.id).maybeSingle();
      const cachedAt = cached?.profile_data?.weeklyCoachGeneratedAt;
      if (cachedAt && (Date.now() - new Date(cachedAt).getTime()) < 24 * 60 * 60 * 1000) {
        return new Response(JSON.stringify({
          text: cached.profile_data.weeklyCoachText,
          cached: true
        }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      ANTHROPIC_MODEL,
        max_tokens: 500,
        system:     PROMPTS[mode],
        messages: [{
          role:    'user',
          content: JSON.stringify(context, null, 2)
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', err);
      return new Response(JSON.stringify({ error: 'ai_failed', detail: err }), { status: 502, headers: CORS });
    }

    const aiResp = await response.json();
    const text   = aiResp.content?.[0]?.text?.trim() || '';

    // Cache weekly summary
    if (mode === 'weekly_summary' && text) {
      try {
        const { data: profileData } = await supabase
          .from('user_profiles').select('profile_data').eq('user_id', user.id).maybeSingle();
        const profile = profileData?.profile_data || {};
        profile.weeklyCoachText = text;
        profile.weeklyCoachGeneratedAt = new Date().toISOString();
        await supabase.from('user_profiles').upsert({
          user_id: user.id, profile_data: profile, updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      } catch (e) { console.error('Cache write error:', e); }
    }

    return new Response(JSON.stringify({ text, cached: false }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('fcf-ai-coach error:', err);
    return new Response(JSON.stringify({ error: 'internal_error', detail: String(err) }), { status: 500, headers: CORS });
  }
});
