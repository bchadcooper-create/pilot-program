// Supabase Edge Function: fcf-calendar-classify
//
// Takes a list of raw calendar events and classifies them using Claude.
// Returns structured events with type, confidence, and extracted fields.
//
// Only re-runs when the fingerprint of the event list has changed — the
// web app caches the last fingerprint in the user profile and skips this
// call if the calendar hasn't changed since last classification.
//
// Deploy with: supabase functions deploy fcf-calendar-classify
// Uses the same Anthropic secret as food recognition:
//   supabase secrets set fcf-food-recognition=<your Anthropic API key>

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get('fcf-food-recognition'); // reuse same secret
const ANTHROPIC_MODEL   = 'claude-haiku-4-5-20251001'; // cheapest — pure JSON classification
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Event type definitions ────────────────────────────────────────────────────
//
// flight      — a flight leg (origin → destination)
// layover     — time between flights at a non-home airport
// reserve     — on-call reserve duty
// training    — sim, recurrent, CRM, ground school
// duty        — check-in, pre-flight, post-flight duty time
// personal    — dentist, school pickup, dinner, etc.
// rest        — rest period between duty days
// unknown     — can't determine

const SYSTEM_PROMPT = `You are analyzing calendar events for a commercial airline pilot or flight crew member.
Classify each event into one of these types:
- flight: A flight leg. Extract departure airport (IATA or city), arrival airport, flight number if visible.
- layover: Time at a non-home airport between duty days.
- reserve: On-call reserve duty (may say "Reserve", "RSV", "Standby", "SBY").
- training: Simulator, recurrent training, CRM, ground school, check ride.
- duty: Check-in time, pre/post flight duty, sign-in/sign-out.
- personal: Personal appointment — medical, family, social, errands.
- rest: Scheduled rest period between duty days.
- unknown: Cannot determine from the available information.

Respond ONLY with a JSON array. No markdown, no explanation. Each element must have:
{
  "id": "<original event id>",
  "type": "<one of the types above>",
  "confidence": <0.0-1.0>,
  "origin": "<IATA code or city, flights only, or null>",
  "destination": "<IATA code or city, flights only, or null>",
  "flightNumber": "<e.g. AA1234, or null>",
  "location": "<airport name, hotel, city, or null>"
}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // Auth — require a valid user JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });

    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });

    const body = await req.json();
    const { events, fingerprint } = body;

    if (!events || !Array.isArray(events) || events.length === 0) {
      return new Response(JSON.stringify({ classified: [], fingerprint }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Check if we already have a cached classification for this fingerprint
    if (fingerprint) {
      const { data: cached } = await supabase
        .from('user_profiles')
        .select('profile_data')
        .eq('user_id', user.id)
        .maybeSingle();
      
      const cachedFingerprint = cached?.profile_data?.calendarFingerprint;
      const cachedClassified  = cached?.profile_data?.calendarClassified;
      
      if (cachedFingerprint === fingerprint && cachedClassified?.length) {
        // Calendar hasn't changed — return cached result immediately
        return new Response(JSON.stringify({
          classified: cachedClassified,
          fingerprint,
          cached: true
        }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
    }

    // Build a compact event list for the prompt — only fields the AI needs
    const eventSummaries = events.map((e: any) => ({
      id:       e.id,
      title:    e.title,
      calendar: e.calendar,
      start:    e.start,
      end:      e.end,
      location: e.location || null,
      notes:    e.notes   || null,
      isAllDay: e.isAllDay,
    }));

    // Claude Haiku — cheap, fast, pure JSON output
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      ANTHROPIC_MODEL,
        max_tokens: 4096,
        system:     SYSTEM_PROMPT,
        messages: [{
          role:    'user',
          content: `Classify these ${eventSummaries.length} calendar events:\n${JSON.stringify(eventSummaries, null, 2)}`
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', err);
      return new Response(JSON.stringify({ error: 'AI classification failed', detail: err }), { status: 502, headers: CORS });
    }

    const aiResp  = await response.json();
    const rawText = aiResp.content?.[0]?.text || '[]';

    // Parse the JSON — strip any accidental markdown fences
    let classified: any[] = [];
    try {
      const clean = rawText.replace(/```json|```/g, '').trim();
      classified  = JSON.parse(clean);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, rawText);
      return new Response(JSON.stringify({ error: 'Failed to parse AI response', raw: rawText }), { status: 502, headers: CORS });
    }

    // Merge classification back with the original event data
    const classifiedMap = new Map(classified.map((c: any) => [c.id, c]));
    const merged = events.map((e: any) => {
      const cls = classifiedMap.get(e.id) || { type: 'unknown', confidence: 0 };
      return { ...e, ...cls };
    });

    // Cache the result in the user profile so we don't re-classify on every boot
    if (fingerprint) {
      try {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('profile_data')
          .eq('user_id', user.id)
          .maybeSingle();
        
        const profile = profileData?.profile_data || {};
        profile.calendarFingerprint = fingerprint;
        profile.calendarClassified  = merged;
        profile.calendarClassifiedAt = new Date().toISOString();
        
        await supabase.from('user_profiles').upsert({
          user_id:      user.id,
          profile_data: profile,
          updated_at:   new Date().toISOString()
        }, { onConflict: 'user_id' });
      } catch (cacheErr) {
        console.error('Cache write error:', cacheErr);
        // Non-fatal — still return the classified result
      }
    }

    return new Response(JSON.stringify({ classified: merged, fingerprint, cached: false }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('fcf-calendar-classify error:', err);
    return new Response(JSON.stringify({ error: 'Internal error', detail: String(err) }), { status: 500, headers: CORS });
  }
});
