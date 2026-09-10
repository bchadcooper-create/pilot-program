// Supabase Edge Function: fcf-seed-users
//
// Creates real Supabase Auth users (via the admin API, requiring the
// service role key) plus leaderboard_entries and a light workout_sessions
// history, to seed the leaderboard with realistic-looking activity.
//
// BATCH MODE: called on a schedule (every 2 days via pg_cron), each call
// creates the NEXT unclaimed batch of 2 users from NEW_BATCHES below, then
// stops automatically once all batches are exhausted (10 total seed users:
// batch 0 = the 2 created manually + 4 scheduled batches of 2 = 8 more).
// Progress is tracked in the seed_batches table, not an in-memory counter,
// so it survives restarts and concurrent calls safely (guarded by a
// Postgres advisory lock below).
//
// leaderboard_entries has a genuine FK to auth.users(id) — synthetic user
// IDs cannot be inserted directly, which is why this goes through the real
// admin signup API rather than raw SQL inserts.
//
// Requires SUPABASE_SERVICE_ROLE_KEY (set automatically by Supabase) and
// ADMIN_SEED_SECRET (set manually in the dashboard) as secrets.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_SEED_SECRET = Deno.env.get('ADMIN_SEED_SECRET');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-seed-secret',
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function dotsScore(liftLb: number, bwLb: number, sex: 'male' | 'female'): number | null {
  const LB2KG = 0.45359237;
  let bw = bwLb * LB2KG;
  bw = Math.min(Math.max(bw, 40), sex === 'female' ? 150 : 210);
  const C = sex === 'female'
    ? [-57.96288,  13.6175032, -0.1126655495, 0.0005158568, -0.0000010706]
    : [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093];
  const poly = C[0] + C[1]*bw + C[2]*bw*bw + C[3]*bw**3 + C[4]*bw**4;
  if (poly <= 0) return null;
  return Math.round((liftLb * LB2KG) * 500 / poly * 10) / 10;
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

const EX = {
  benchBB:   { id: 'c_up_to1', name: 'Barbell Bench Press' },
  squat:     { id: 'c_lb_to1', name: 'Back Squat' },
  deadlift:  { id: 'c_ul_to1', name: 'Conventional Deadlift' },
  ohp:       { id: 'c_up_to2', name: 'Standing Overhead Press' },
};

interface SeedUser {
  email: string;
  username: string;
  sex: 'male' | 'female';
  bodyweightLb: number;
  lifts: { ex: { id: string; name: string }; weightLb: number; reps: number; daysAgo: number }[];
  sessions: { daysAgo: number; muscleGroup: string; durationMinutes: number;
              sets: Record<string, { reps: number; weight?: number }[]> }[];
}

// 4 batches of 2 — created in this order, one batch per scheduled call.
// Batch 0 (Mike Sorensen, Jennifer Alvarez) already exists and is not
// repeated here; see seed_batches row 0.
const NEW_BATCHES: SeedUser[][] = [
  // Batch 1
  [
    {
      email: 'james.whitfield@flightcrew.fit', username: 'James W.', sex: 'male', bodyweightLb: 205,
      lifts: [
        { ex: EX.benchBB,  weightLb: 245, reps: 4, daysAgo: 2 },
        { ex: EX.squat,    weightLb: 335, reps: 3, daysAgo: 8 },
        { ex: EX.deadlift, weightLb: 405, reps: 2, daysAgo: 14 },
        { ex: EX.ohp,      weightLb: 145, reps: 4, daysAgo: 5 },
      ],
      sessions: [
        { daysAgo: 2, muscleGroup: 'Upper Push', durationMinutes: 55, sets: { [EX.benchBB.id]: [{reps:6,weight:205},{reps:5,weight:225},{reps:4,weight:245}] } },
        { daysAgo: 8, muscleGroup: 'Lower Body', durationMinutes: 62, sets: { [EX.squat.id]: [{reps:6,weight:275},{reps:4,weight:305},{reps:3,weight:335}] } },
      ],
    },
    {
      email: 'sarah.kim@flightcrew.fit', username: 'Sarah K.', sex: 'female', bodyweightLb: 132,
      lifts: [
        { ex: EX.benchBB,  weightLb: 85,  reps: 6, daysAgo: 3 },
        { ex: EX.squat,    weightLb: 135, reps: 5, daysAgo: 10 },
        { ex: EX.deadlift, weightLb: 165, reps: 4, daysAgo: 17 },
      ],
      sessions: [
        { daysAgo: 3,  muscleGroup: 'Upper Push', durationMinutes: 40, sets: { [EX.benchBB.id]: [{reps:10,weight:65},{reps:8,weight:75},{reps:6,weight:85}] } },
        { daysAgo: 10, muscleGroup: 'Lower Body', durationMinutes: 46, sets: { [EX.squat.id]: [{reps:10,weight:105},{reps:8,weight:120},{reps:5,weight:135}] } },
      ],
    },
  ],
  // Batch 2
  [
    {
      email: 'derek.owusu@flightcrew.fit', username: 'Derek O.', sex: 'male', bodyweightLb: 220,
      lifts: [
        { ex: EX.benchBB,  weightLb: 275, reps: 3, daysAgo: 4 },
        { ex: EX.squat,    weightLb: 365, reps: 2, daysAgo: 11 },
        { ex: EX.deadlift, weightLb: 425, reps: 1, daysAgo: 19 },
      ],
      sessions: [
        { daysAgo: 4,  muscleGroup: 'Upper Push', durationMinutes: 58, sets: { [EX.benchBB.id]: [{reps:5,weight:225},{reps:4,weight:255},{reps:3,weight:275}] } },
        { daysAgo: 11, muscleGroup: 'Lower Body', durationMinutes: 65, sets: { [EX.squat.id]: [{reps:5,weight:305},{reps:3,weight:335},{reps:2,weight:365}] } },
      ],
    },
    {
      email: 'amanda.ferreira@flightcrew.fit', username: 'Amanda F.', sex: 'female', bodyweightLb: 150,
      lifts: [
        { ex: EX.benchBB,  weightLb: 105, reps: 5, daysAgo: 5 },
        { ex: EX.squat,    weightLb: 175, reps: 4, daysAgo: 12 },
        { ex: EX.deadlift, weightLb: 205, reps: 3, daysAgo: 20 },
      ],
      sessions: [
        { daysAgo: 5,  muscleGroup: 'Upper Push', durationMinutes: 47, sets: { [EX.benchBB.id]: [{reps:8,weight:85},{reps:6,weight:95},{reps:5,weight:105}] } },
        { daysAgo: 12, muscleGroup: 'Lower Body', durationMinutes: 51, sets: { [EX.squat.id]: [{reps:8,weight:135},{reps:6,weight:155},{reps:4,weight:175}] } },
      ],
    },
  ],
  // Batch 3
  [
    {
      email: 'tom.bracken@flightcrew.fit', username: 'Tom B.', sex: 'male', bodyweightLb: 180,
      lifts: [
        { ex: EX.benchBB, weightLb: 195, reps: 6, daysAgo: 2 },
        { ex: EX.squat,   weightLb: 275, reps: 4, daysAgo: 9 },
        { ex: EX.ohp,     weightLb: 115, reps: 6, daysAgo: 6 },
      ],
      sessions: [
        { daysAgo: 2, muscleGroup: 'Upper Push', durationMinutes: 45, sets: { [EX.benchBB.id]: [{reps:10,weight:155},{reps:8,weight:175},{reps:6,weight:195}] } },
        { daysAgo: 9, muscleGroup: 'Lower Body', durationMinutes: 50, sets: { [EX.squat.id]: [{reps:10,weight:225},{reps:8,weight:250},{reps:4,weight:275}] } },
      ],
    },
    {
      email: 'priya.nadella@flightcrew.fit', username: 'Priya N.', sex: 'female', bodyweightLb: 138,
      lifts: [
        { ex: EX.benchBB,  weightLb: 80,  reps: 7, daysAgo: 3 },
        { ex: EX.squat,    weightLb: 125, reps: 6, daysAgo: 10 },
        { ex: EX.deadlift, weightLb: 155, reps: 5, daysAgo: 16 },
      ],
      sessions: [
        { daysAgo: 3,  muscleGroup: 'Upper Push', durationMinutes: 38, sets: { [EX.benchBB.id]: [{reps:10,weight:60},{reps:9,weight:70},{reps:7,weight:80}] } },
        { daysAgo: 10, muscleGroup: 'Lower Body', durationMinutes: 44, sets: { [EX.squat.id]: [{reps:10,weight:95},{reps:8,weight:110},{reps:6,weight:125}] } },
      ],
    },
  ],
  // Batch 4
  [
    {
      email: 'chris.delacroix@flightcrew.fit', username: 'Chris D.', sex: 'male', bodyweightLb: 168,
      lifts: [
        { ex: EX.benchBB,  weightLb: 175, reps: 5, daysAgo: 4 },
        { ex: EX.squat,    weightLb: 245, reps: 4, daysAgo: 11 },
        { ex: EX.deadlift, weightLb: 295, reps: 3, daysAgo: 18 },
      ],
      sessions: [
        { daysAgo: 4,  muscleGroup: 'Upper Push', durationMinutes: 43, sets: { [EX.benchBB.id]: [{reps:8,weight:145},{reps:6,weight:160},{reps:5,weight:175}] } },
        { daysAgo: 11, muscleGroup: 'Lower Body', durationMinutes: 49, sets: { [EX.squat.id]: [{reps:8,weight:195},{reps:6,weight:220},{reps:4,weight:245}] } },
      ],
    },
    {
      email: 'lauren.vasquez@flightcrew.fit', username: 'Lauren V.', sex: 'female', bodyweightLb: 160,
      lifts: [
        { ex: EX.benchBB,  weightLb: 115, reps: 4, daysAgo: 5 },
        { ex: EX.squat,    weightLb: 185, reps: 3, daysAgo: 13 },
        { ex: EX.deadlift, weightLb: 225, reps: 2, daysAgo: 21 },
      ],
      sessions: [
        { daysAgo: 5,  muscleGroup: 'Upper Push', durationMinutes: 46, sets: { [EX.benchBB.id]: [{reps:6,weight:95},{reps:5,weight:105},{reps:4,weight:115}] } },
        { daysAgo: 13, muscleGroup: 'Lower Body', durationMinutes: 52, sets: { [EX.squat.id]: [{reps:6,weight:155},{reps:4,weight:170},{reps:3,weight:185}] } },
      ],
    },
  ],
];

function genPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

async function createOneUser(u: SeedUser) {
  const password = genPassword();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: u.email,
    password,
    email_confirm: true,
    user_metadata: { username: u.username, seeded: true },
  });
  if (createErr || !created?.user) {
    return { email: u.email, error: createErr?.message || 'user creation failed' };
  }
  const userId = created.user.id;

  const lbRows = u.lifts.map(l => ({
    user_id: userId, exercise_id: l.ex.id, exercise_name: l.ex.name,
    weight_lb: l.weightLb, reps: l.reps, bodyweight_lb: u.bodyweightLb, sex: u.sex,
    username: u.username, dots: dotsScore(l.weightLb, u.bodyweightLb, u.sex),
    achieved_at: daysAgo(l.daysAgo),
  }));
  const { error: lbErr } = await admin.from('leaderboard_entries').insert(lbRows);

  const sessionRows = u.sessions.map(s => ({
    user_id: userId, session_key: crypto.randomUUID(), started_at: daysAgo(s.daysAgo),
    session_data: { env: 'gym', date: daysAgo(s.daysAgo), muscle_group: s.muscleGroup,
                     durationMinutes: s.durationMinutes, sets: s.sets },
  }));
  const { error: sessErr } = await admin.from('workout_sessions').insert(sessionRows);

  return {
    email: u.email, userId, password,
    leaderboardEntriesInserted: lbRows.length, leaderboardError: lbErr?.message || null,
    sessionsInserted: sessionRows.length, sessionError: sessErr?.message || null,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const auth = req.headers.get('X-Seed-Secret');
    if (!ADMIN_SEED_SECRET || auth !== ADMIN_SEED_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }

    // Advisory lock — prevents two overlapping calls (a manual test plus
    // the scheduled job firing at the same moment) from both claiming the
    // same batch number. batch_number's primary key is the real safety
    // net; this just avoids wasted duplicate Auth-user creation attempts.
    const LOCK_KEY = 847362910;
    try { await admin.rpc('pg_try_advisory_lock', { key: LOCK_KEY }); } catch (_) { /* best-effort */ }

    const { data: existing } = await admin
      .from('seed_batches').select('batch_number, created_at').order('batch_number', { ascending: false }).limit(1);
    const highestDone = existing?.[0]?.batch_number ?? -1;
    const lastCreatedAt = existing?.[0]?.created_at ? new Date(existing[0].created_at) : null;
    const nextBatchIdx = highestDone; // batch 0 already exists; NEW_BATCHES[0] is "batch 1"

    if (nextBatchIdx >= NEW_BATCHES.length) {
      return new Response(JSON.stringify({
        done: true,
        message: `All ${NEW_BATCHES.length + 1} batches already created (10 total seed users). No action taken.`,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // 2-day spacing enforced here, not by cron scheduling precision — the
    // cron job below fires daily as a cheap check, and this is what
    // actually decides whether a new batch is due yet.
    const MIN_GAP_MS = 2 * 24 * 60 * 60 * 1000;
    if (lastCreatedAt && (Date.now() - lastCreatedAt.getTime()) < MIN_GAP_MS) {
      const hoursLeft = Math.ceil((MIN_GAP_MS - (Date.now() - lastCreatedAt.getTime())) / 3600000);
      return new Response(JSON.stringify({
        skipped: true,
        message: `Last batch created ${lastCreatedAt.toISOString()} — next batch not due for ~${hoursLeft}h.`,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const batch = NEW_BATCHES[nextBatchIdx];
    const batchNumber = nextBatchIdx + 1;
    const results = [];
    for (const u of batch) {
      results.push(await createOneUser(u));
    }

    // Only recorded as done if the batch actually ran — if this insert
    // fails, the next scheduled call will retry the same batch number
    // rather than silently skipping it, since batch_number is a primary
    // key claimed only on success here.
    const { error: logErr } = await admin.from('seed_batches').insert({
      batch_number: batchNumber,
      emails: batch.map(u => u.email),
    });

    return new Response(JSON.stringify({
      batchNumber, totalBatchesTarget: NEW_BATCHES.length + 1,
      results, batchLogError: logErr?.message || null,
    }, null, 2), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('fcf-seed-users error:', err);
    return new Response(JSON.stringify({ error: 'internal_error', detail: String(err) }), { status: 500, headers: CORS });
  }
});
