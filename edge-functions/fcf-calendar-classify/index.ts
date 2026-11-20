// Supabase Edge Function: fcf-calendar-classify
//
// Takes a list of raw calendar events and classifies them using Claude.
// Returns structured events with type, confidence, and extracted fields.
//
// Only re-runs when the fingerprint of the event list has changed: the
// web app caches the last fingerprint in the user profile and skips this
// call if the calendar hasn't changed since last classification.
//
// Uses the same Anthropic secret as food recognition (fcf-food-recognition).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get('fcf-food-recognition'); // reuse same secret
const ANTHROPIC_MODEL   = 'claude-haiku-4-5-20251001'; // cheapest, pure JSON classification
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Event types: flight, trip, layover, reserve, training, duty, personal, rest, unknown.
// "trip" was added Nov 20 2026: some crew calendars show a whole pairing as one
// block titled with its number ("10215") and no flight inside it.

const SYSTEM_PROMPT = `You are analyzing calendar events for a commercial airline pilot or flight crew member.
Classify each event into one of these types:
- flight: A single flight leg. Extract departure airport (IATA or city), arrival airport, flight number if visible.
- trip: A whole trip or pairing shown as ONE block, not a single leg. Usually titled with only a pairing or
  sequence number (for example "10215" or "11143 (Historical)"), lasting from several hours to several days,
  with notes like "C/I: 17:18 C/O: 22:11 Credit: 013:54 L/O: RDM,RDM" (check-in, check-out, credit, layover
  airports). Put the layover airports, comma separated, in location.
- layover: Time at a non-home airport between duty days.
- reserve: On-call reserve duty (may say "Reserve", "RSV", "Standby", "SBY").
- training: Simulator, recurrent training, CRM, ground school, check ride.
- duty: Check-in time, pre/post flight duty, sign-in/sign-out.
- personal: Personal appointment, birthday, holiday, bid or admin reminder, medical, family, social, errands.
- rest: Scheduled rest period between duty days.
- unknown: Cannot determine from the available information.

Each event has a short number "n". Respond ONLY with a JSON array, one element per event, no markdown, no
explanation. Each element:
{"n": <the event's n>, "type": "<one of the types above>", "confidence": <0.0-1.0>,
 "origin": "<IATA code or city, flights only>", "destination": "<IATA code or city, flights only>",
 "flightNumber": "<e.g. AA1234>", "location": "<airport, hotel or city>"}
Leave out origin, destination, flightNumber and location when they do not apply. Never repeat the title or id.`;

// Reads the model's reply. If the reply was cut off part way (it happened:
// "Unterminated string in JSON"), keep every complete element before the cut
// instead of throwing the whole batch away.
function parseClassified(rawText: string): any[] {
  const clean = String(rawText || '').replace(/```json|```/g, '').trim();
  try { const v = JSON.parse(clean); return Array.isArray(v) ? v : []; } catch (_e) { /* try to salvage below */ }
  const start = clean.indexOf('[');
  const lastObj = clean.lastIndexOf('}');
  if (start < 0 || lastObj < 0) return [];
  try { const v = JSON.parse(clean.slice(start, lastObj + 1) + ']'); return Array.isArray(v) ? v : []; } catch (_e) { return []; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // Auth: require a valid user JWT
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
        // Calendar hasn't changed: return cached result immediately (free for cache hits)
        return new Response(JSON.stringify({
          classified: cachedClassified,
          fingerprint,
          cached: true
        }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }

      // Free tier: check subscription before running a fresh AI classification
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('tier, status')
        .eq('user_id', user.id)
        .maybeSingle();
      // The owner's account is treated as Pro here, as it is in the app.
      const isDevTestAccount = user.id === '7e41ca46-6e00-4c54-bc3f-2e45d923fe0b';
      const isPro = isDevTestAccount ||
        (sub?.tier === 'pro' && (sub?.status === 'active' || sub?.status === 'grace'));

      if (!isPro) {
        // Free users get 1 fresh AI classification per calendar month.
        // Cache hits above are always free: this only counts new AI calls.
        const lastClassifiedAt = cached?.profile_data?.calendarClassifiedAt;
        if (lastClassifiedAt) {
          const lastDate = new Date(lastClassifiedAt);
          const now = new Date();
          const sameMonth = lastDate.getFullYear() === now.getFullYear() &&
                            lastDate.getMonth() === now.getMonth();
          if (sameMonth) {
            // Return cached result with a limit notice
            return new Response(JSON.stringify({
              classified: cachedClassified || [],
              fingerprint,
              cached: true,
              limitReached: true,
              limitMessage: 'Free plan includes 1 calendar classification per month. Upgrade to Pro for unlimited.'
            }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
          }
        }
      }
    }

    // A compact event list for the prompt: only the fields the AI needs.
    // BUG FIX (reported Nov 20 2026: "Says zero flights on Apple Calendar").
    // The logs showed "Unterminated string in JSON at position 8771" on a
    // batch of 40: the reply ran out of room (max_tokens 4096) around the
    // 38th event, the parse failed, and all 40 events were marked unknown.
    // Apple's event ids are long, and the reply had to repeat each one.
    // Three changes: each event is now referred to by a short number "n"
    // instead of its id, batches are 25 events, not 40, and a reply that is
    // still cut off keeps every complete element before the cut.
    const eventSummaries = events.map((e: any, i: number) => ({
      n:        i,
      title:    e.title,
      calendar: e.calendar,
      start:    e.start,
      end:      e.end,
      location: e.location || null,
      notes:    e.notes ? String(e.notes).slice(0, 300) : null,
      isAllDay: e.isAllDay,
    }));

    // Batches run in parallel, each with its own call, so one bad batch
    // cannot wipe out the others and the request stays well under the
    // 150 second limit (a 45 second timeout per call).
    const BATCH_SIZE = 25;
    const batches: any[][] = [];
    for (let i = 0; i < eventSummaries.length; i += BATCH_SIZE) {
      batches.push(eventSummaries.slice(i, i + BATCH_SIZE));
    }

    const classifyBatch = async (batch: any[]): Promise<any[]> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);
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
            content: `Classify these ${batch.length} calendar events:\n${JSON.stringify(batch)}`
          }]
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));
      if (!response.ok) {
        console.error('Anthropic error for batch:', await response.text());
        return [];
      }
      const aiResp = await response.json();
      const rawText = (aiResp.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text || '').join('') || '[]';
      const out = parseClassified(rawText);
      if (out.length < batch.length) console.warn('Batch came back short', { asked: batch.length, got: out.length, stop: aiResp.stop_reason });
      return out;
    };

    const batchResults = await Promise.all(batches.map(async (batch) => {
      let got: any[] = [];
      try { got = await classifyBatch(batch); } catch (batchErr) { console.error('Batch classification error:', batchErr); }
      // Anything the first try did not cover gets one more try, on its own.
      const have = new Set(got.map((c: any) => c && c.n));
      const missing = batch.filter((e: any) => !have.has(e.n));
      if (missing.length) {
        try { got = got.concat(await classifyBatch(missing)); } catch (retryErr) { console.error('Batch retry error:', retryErr); }
      }
      return got;
    }));

    const TYPES = ['flight', 'trip', 'layover', 'reserve', 'training', 'duty', 'personal', 'rest', 'unknown'];
    const byN = new Map<number, any>();
    for (const c of batchResults.flat()) {
      if (c && Number.isInteger(c.n) && TYPES.includes(c.type)) byN.set(c.n, c);
    }

    // Merge classification back with the original event data
    let failed = 0;
    const merged = events.map((e: any, i: number) => {
      const c = byN.get(i);
      if (!c) { failed++; return { ...e, type: 'unknown', confidence: 0 }; }
      return {
        ...e,
        type: c.type,
        confidence: typeof c.confidence === 'number' ? c.confidence : 0.5,
        origin: c.origin || null,
        destination: c.destination || null,
        flightNumber: c.flightNumber || null,
        location: c.location || e.location || null,
      };
    });

    // Cache the result so the calendar is not re-classified on every boot.
    // A result with events that could not be classified is NOT remembered
    // under this fingerprint: before, a failed run was cached and served
    // back until the calendar itself changed.
    if (fingerprint) {
      try {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('profile_data')
          .eq('user_id', user.id)
          .maybeSingle();

        const profile = profileData?.profile_data || {};
        profile.calendarFingerprint = failed ? null : fingerprint;
        profile.calendarClassified  = merged;
        profile.calendarClassifiedAt = new Date().toISOString();

        await supabase.from('user_profiles').upsert({
          user_id:      user.id,
          profile_data: profile,
          updated_at:   new Date().toISOString()
        }, { onConflict: 'user_id' });
      } catch (cacheErr) {
        console.error('Cache write error:', cacheErr);
        // Non-fatal: still return the classified result
      }
    }

    return new Response(JSON.stringify({ classified: merged, fingerprint, cached: false, unclassified: failed }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('fcf-calendar-classify error:', err);
    return new Response(JSON.stringify({ error: 'Internal error', detail: String(err) }), { status: 500, headers: CORS });
  }
});
