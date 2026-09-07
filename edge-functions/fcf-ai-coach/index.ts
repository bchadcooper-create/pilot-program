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
  weekly_summary: `You're a strength coach who works with airline pilots and flight crew — someone who's seen enough
trip schedules to talk about them like a normal part of training, not a data scientist presenting findings.
You will receive their workout history (with dates and trip/pairing context), body weight trend, and Oura
biometrics for the past several weeks.

Talk like a coach who actually looked at this and has something real to say — not a report, not a list of
observations. Look especially for:
- A recurring drop in performance (weight lifted, session completion, RPE) on a particular day-of-trip
  (e.g. "day 3 of 4-day pairings" or "the day after a red-eye")
- Whether certain trip types (long layovers vs quick turns) correlate with skipped or shortened sessions
- Whether recovery markers (HRV, sleep) on specific days predict the following day's training quality
- Any genuine plateau (3+ weeks flat or declining on a lift) and a plausible cause from the data you have

If the data's too thin or messy to find a real pattern, say so the way a coach would — plainly, and tell them
what would help ("log a few more sessions with trip context and I'll have something for you"). Don't pad it out
with a data-quality audit; one sentence on what's missing is enough, then move on.

STRICT LENGTH LIMIT: 3-4 sentences, no more. Conversational, warm, direct — like you're talking to them, not
writing them a memo. No bullet points, no headers, no bold text, no jargon like "tripContext" or "data quality
issue". End with ONE clear thing to do this week.`,

  fatigue_calibration: `You're a strength coach checking in with a pilot or flight crew member before they train today.
You will receive: today's readiness/recovery signal (Oura or self-reported), their current trip context (day
number in pairing, duty hours so far, upcoming report time if any), and recent training load.

Tell them straight, like a coach would in person — full send today, dial it back, or take the day: and give
them the one reason why, tied to their actual trip, not generic "listen to your body" filler. If everything
looks fine, say so with confidence, don't manufacture caution just to sound thorough.

2-3 sentences. Talk to them directly, warmly, no clinical tone. Don't just restate the numbers back at them —
tell them what it means for today.`,

  fuel_logistics: `You're a coach who understands the realities of eating well on a flying schedule, talking to a
pilot or flight crew member about today's duty day. You will receive their flight schedule for today (classified
legs, layovers, ground time) and what they have already logged eating today.

Tell them plainly which window today is actually worth using for real food, and why the others aren't (too
tight after report/deplaning, restaurants likely closed by then, etc.) — the way you'd tell a friend, not a
logistics report. If there's genuinely no good window left, say that straight and tell them what to grab or pack
instead.

2-3 sentences, warm and practical, no jargon.`,
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
    // DEV OVERRIDE — matches the client-side override in app.js isPro(),
    // scoped to the same single account for testing AI coach features
    // while App Store Connect IAP products are still being verified.
    // REMOVE both overrides together before public release.
    const isDevTestAccount = user.id === '7e41ca46-6e00-4c54-bc3f-2e45d923fe0b';
    const isPro = isDevTestAccount || (sub?.tier === 'pro' && (sub?.status === 'active' || sub?.status === 'grace'));
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

    const MAX_TOKENS_BY_MODE = { weekly_summary: 220, fatigue_calibration: 180, fuel_logistics: 180 };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS_BY_MODE[mode] || 200,
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
