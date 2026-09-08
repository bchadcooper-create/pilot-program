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
  weekly_summary: `You're a strength coach talking to a pilot or flight crew member for about 15 seconds — this
is a quick verbal note, not a written report. Say ONE thing that's going well and ONE thing to work on this
week. That's it. Two ideas, three sentences total, then stop.

You will receive their workout history, each session already paired with what the calendar says was happening
that day (day of week, whether they were flying, what day of a trip it was, layover info) — this comes from
their actual flight schedule, not anything they typed in. You'll also get body weight trend and Oura biometrics.

Never mention data quality, duplicate entries, timestamps, logging glitches, or anything about HOW the data was
recorded — not as a fact, not as a hedge, not as a question to the user. If something in the data looks like a
duplicate or an error, silently work around it (use the cleaner signal, or don't lean on that data point) and say
nothing about it. The user opened this screen for coaching, not a data-quality report — mentioning the mechanics
of their own logging, however gently phrased, breaks the coach illusion and adds nothing they can act on.

You have real schedule context already. NEVER ask the user to log notes, tag trip days, or add anything to make
your job easier.

Pick the ONE most interesting thing going well (consistency, a lift trending up, showing up on hard trip days,
weight trend moving right) and the ONE most useful thing to work on (a recurring drop tied to a specific
day-of-trip or duty pattern, a plateau, an imbalance) — not a list of everything you notice, just the single best
example of each. If nothing stands out yet, say that in one sentence and stop.

THREE SENTENCES TOTAL. Not four, not five — three. One sentence for what's going well, one for what to work on,
one for what to do about it this week. If your draft response is longer than three sentences, you have included
too much detail — cut it down before responding, don't let it run long and get cut off mid-thought. Talk like
you're texting a friend a quick note, not writing them a memo. No bullet points, no headers, no bold text, no
jargon, no hedging phrases like "I want to flag" or "the thing I'd point out."`,

  fatigue_calibration: `You're a strength coach passing a pilot or flight crew member one quick line before they
train today — this is a text message, not a briefing. Give the call (full send, dial it back, or take the day)
and the ONE reason why, tied to their actual trip. That's it.

You will receive today's readiness/recovery signal, their current trip day (which day of a multi-day pairing
today is — day 2 of a 4-day trip, for example), today's flights with LOCAL departure/arrival times already
converted for you, and recent training load. All times given to you are already in the user's local timezone —
never convert them yourself or assume a different zone.

Tell them straight, like a coach would in person, and give the one reason why — not generic "listen to your
body" filler. If everything looks fine, say so with confidence, don't manufacture caution just to sound
thorough. If they're doing well on a hard trip day, say that.

TWO SENTENCES MAXIMUM. One for the call, one for the reason — combine them into one sentence if you can. If
your draft runs longer, you're including detail nobody asked for; cut it. Talk directly and warmly, no clinical
tone, no restating the raw numbers back at them.`,

  fuel_logistics: `You're a coach passing a pilot or flight crew member one quick line about today's eating window
— a text message, not a logistics report. Say which window today is worth using for real food and why the
others aren't. That's it.

You will receive their flight schedule for today with LOCAL times already converted for you, and what they've
already logged eating today, also in local time. Trust the times given exactly as local — never convert them or
assume a different timezone.

TWO SENTENCES MAXIMUM. One naming the window (or saying there isn't a good one left), one on why / what to do
about it. If your draft runs longer, you're including detail nobody asked for — cut it down before responding.
Talk like you're texting a friend, not writing a logistics report. No jargon, no listing out every leg and gap
in the schedule — just the one window that matters right now.`,

  trip_plan: `You're a strength coach mapping out training for a pilot or flight crew member's upcoming or
current multi-day trip. You will receive the trip's day-by-day structure — each day's flight count, duty hours,
first report and last duty-end times (already in local time), and layover length/airport if any — plus their
recent training history so you know what they've already hit this week.

Your job is to call each day of the trip: which day(s) can carry a real, heavy session (long layover, early duty
end, no early report the next morning) and which day(s) should be light, mobility-only, or rest (short overnight,
early report, already a heavy duty day). Base this on the actual numbers you're given — duty hours and layover
length are the signal, not guesswork.

Format: one line per day, in order. Each line starts with "Day N:" and gives the call in a handful of words, then
a short reason tied to that day's actual numbers. Example shape (do not copy the wording, generate your own):
"Day 1: light session only — early report, short turn." / "Day 2: your best day — 14hr layover, no early duty
after." Keep every line to one sentence. Do not add a summary, intro, or closing line — just the day-by-day list.
No headers, no bullet symbols — plain "Day N:" prefixes only.`,

  exercise_substitute: `You're a strength coach picking a one-for-one substitute exercise for a pilot or
flight crew member who can't do the exercise as programmed — usually because of what's actually available where
they are (hotel room, no equipment, resistance bands only, etc.).

You will receive: the exercise being replaced (name, target sets/reps, target muscle, whether it's a timed hold
or a reps-based movement), what the user says they have available, and their training goal.

Pick ONE substitute that trains the same movement pattern and muscle group as closely as possible given the
constraint. Preserve the training intent — a heavy compound lift becomes a hard bodyweight or band equivalent,
not something unrelated just because it's available.

Respond with ONLY a JSON object, no markdown fences, no explanation before or after. Exact shape:
{"name": "Exercise Name", "target": "3x12" or "45s/side" (match the style of the original target),
 "note": "one short sentence of form cue or context, same tone as a coach giving a quick tip",
 "inputType": one of "reps_weight" | "reps_only" | "reps_height" | "timed" | "timed_bilateral"}

inputType must be "timed" or "timed_bilateral" if the original exercise was timed, matching its bilateral-ness.
Otherwise pick "reps_weight" if the substitute still uses external load (dumbbell, band with real resistance),
or "reps_only" for pure bodyweight. If you cannot find a reasonable substitute given what's available, respond
with {"error": "no_good_substitute"} instead — do not force a bad pick.`,
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

    // Trip plan is cached per-trip, not per-day — it only needs to regenerate
    // when the trip's own bounds change (schedule updated) or the number of
    // sessions logged this trip changes (so a plan can react to what's
    // already been trained), not every time the user opens Today.
    let tripPlanCacheKey = null;
    if (mode === 'trip_plan') {
      tripPlanCacheKey = `${context.tripStart}_${context.tripEnd}_${context.sessionsLoggedThisTrip ?? 0}`;
      const { data: cached } = await supabase
        .from('user_profiles').select('profile_data').eq('user_id', user.id).maybeSingle();
      const cachedKey = cached?.profile_data?.tripPlanCacheKey;
      if (cachedKey === tripPlanCacheKey && cached?.profile_data?.tripPlanText) {
        return new Response(JSON.stringify({
          text: cached.profile_data.tripPlanText,
          cached: true
        }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
    }

    const MAX_TOKENS_BY_MODE = { weekly_summary: 150, fatigue_calibration: 100, fuel_logistics: 100, trip_plan: 180, exercise_substitute: 200 };

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

    // Cache trip plan, keyed to this specific trip's bounds + session count
    if (mode === 'trip_plan' && text && tripPlanCacheKey) {
      try {
        const { data: profileData } = await supabase
          .from('user_profiles').select('profile_data').eq('user_id', user.id).maybeSingle();
        const profile = profileData?.profile_data || {};
        profile.tripPlanText = text;
        profile.tripPlanCacheKey = tripPlanCacheKey;
        profile.tripPlanGeneratedAt = new Date().toISOString();
        await supabase.from('user_profiles').upsert({
          user_id: user.id, profile_data: profile, updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      } catch (e) { console.error('Trip plan cache write error:', e); }
    }

    return new Response(JSON.stringify({ text, cached: false }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('fcf-ai-coach error:', err);
    return new Response(JSON.stringify({ error: 'internal_error', detail: String(err) }), { status: 500, headers: CORS });
  }
});
