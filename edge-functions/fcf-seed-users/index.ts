// Supabase Edge Function: fcf-seed-users
//
// ONE-TIME ADMIN UTILITY — not part of the app, never called by client code.
// Creates real Supabase Auth users (via the admin API, requiring the
// service role key) plus leaderboard_entries and a light workout_sessions
// history, to seed the leaderboard with realistic-looking activity for the
// bandwagon effect on first launch.
//
// leaderboard_entries has a genuine FK to auth.users(id) — synthetic user
// IDs cannot be inserted directly, which is why this goes through the real
// admin signup API rather than raw SQL inserts.
//
// Deploy, call once via curl with the admin secret, then consider deleting
// this function — it should not remain live indefinitely, since anyone
// with ADMIN_SEED_SECRET could use it to create arbitrary auth accounts.
//
// Requires SUPABASE_SERVICE_ROLE_KEY (Supabase sets this automatically for
// every project) and ADMIN_SEED_SECRET (set manually in the dashboard —
// never hardcode it here) as secrets before deploying.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_SEED_SECRET = Deno.env.get('ADMIN_SEED_SECRET'); // set before deploying — never hardcode

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-seed-secret',
};

// Service-role client — full admin privileges, bypasses RLS. Never expose
// this client or its key to the browser.
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

// Canonical exercise IDs from app.js LEADERBOARD_EXERCISES — must match
// exactly, since the leaderboard groups/labels entries by these IDs.
const EX = {
  benchBB:   { id: 'c_up_to1', name: 'Barbell Bench Press' },
  squat:     { id: 'c_lb_to1', name: 'Back Squat' },
  deadlift:  { id: 'c_ul_to1', name: 'Conventional Deadlift' },
  ohp:       { id: 'c_up_to2', name: 'Standing Overhead Press' },
};

interface SeedUser {
  email: string;
  password: string;
  username: string;
  sex: 'male' | 'female';
  bodyweightLb: number;
  lifts: { ex: { id: string; name: string }; weightLb: number; reps: number; daysAgo: number }[];
  sessions: { daysAgo: number; muscleGroup: string; durationMinutes: number;
              sets: Record<string, { reps: number; weight?: number }[]> }[];
}

const SEED_USERS: SeedUser[] = [
  {
    email: 'mike.sorensen@flightcrew.fit',
    password: '', // generated at runtime, returned in the response — not stored anywhere else
    username: 'Mike S.',
    sex: 'male',
    bodyweightLb: 195,
    lifts: [
      { ex: EX.benchBB,  weightLb: 225, reps: 5, daysAgo: 3  },
      { ex: EX.squat,    weightLb: 315, reps: 3, daysAgo: 9  },
      { ex: EX.deadlift, weightLb: 365, reps: 1, daysAgo: 16 },
      { ex: EX.ohp,      weightLb: 135, reps: 5, daysAgo: 6  },
    ],
    sessions: [
      { daysAgo: 3,  muscleGroup: 'Upper Push', durationMinutes: 52,
        sets: { [EX.benchBB.id]: [{reps:8,weight:185},{reps:6,weight:205},{reps:5,weight:225}], [EX.ohp.id]: [{reps:8,weight:95},{reps:6,weight:115}] } },
      { daysAgo: 6,  muscleGroup: 'Upper Push', durationMinutes: 48,
        sets: { [EX.ohp.id]: [{reps:8,weight:95},{reps:6,weight:115},{reps:5,weight:135}] } },
      { daysAgo: 9,  muscleGroup: 'Lower Body', durationMinutes: 61,
        sets: { [EX.squat.id]: [{reps:8,weight:225},{reps:5,weight:275},{reps:3,weight:315}] } },
      { daysAgo: 16, muscleGroup: 'Lower Body', durationMinutes: 55,
        sets: { [EX.deadlift.id]: [{reps:5,weight:275},{reps:3,weight:325},{reps:1,weight:365}] } },
    ],
  },
  {
    email: 'jennifer.alvarez@flightcrew.fit',
    password: '',
    username: 'Jen A.',
    sex: 'female',
    bodyweightLb: 145,
    lifts: [
      { ex: EX.benchBB,  weightLb: 95,  reps: 8, daysAgo: 4  },
      { ex: EX.squat,    weightLb: 155, reps: 5, daysAgo: 11 },
      { ex: EX.deadlift, weightLb: 185, reps: 3, daysAgo: 18 },
    ],
    sessions: [
      { daysAgo: 4,  muscleGroup: 'Upper Push', durationMinutes: 44,
        sets: { [EX.benchBB.id]: [{reps:10,weight:75},{reps:8,weight:85},{reps:8,weight:95}] } },
      { daysAgo: 11, muscleGroup: 'Lower Body', durationMinutes: 50,
        sets: { [EX.squat.id]: [{reps:10,weight:115},{reps:8,weight:135},{reps:5,weight:155}] } },
      { daysAgo: 18, muscleGroup: 'Lower Body', durationMinutes: 47,
        sets: { [EX.deadlift.id]: [{reps:8,weight:135},{reps:5,weight:165},{reps:3,weight:185}] } },
    ],
  },
];

function genPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const auth = req.headers.get('X-Seed-Secret');
    if (!ADMIN_SEED_SECRET || auth !== ADMIN_SEED_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }

    const results: any[] = [];

    for (const u of SEED_USERS) {
      const password = genPassword();

      // 1. Real Supabase Auth account via the admin API — this is the only
      //    correct way to create a user that satisfies leaderboard_entries'
      //    FK to auth.users(id); email is pre-confirmed since these
      //    accounts never need to actually receive a confirmation email.
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: u.email,
        password,
        email_confirm: true,
        user_metadata: { username: u.username, seeded: true },
      });
      if (createErr || !created?.user) {
        results.push({ email: u.email, error: createErr?.message || 'user creation failed' });
        continue;
      }
      const userId = created.user.id;

      // 2. Leaderboard entries — the actual rows the leaderboard UI reads.
      const lbRows = u.lifts.map(l => ({
        user_id: userId,
        exercise_id: l.ex.id,
        exercise_name: l.ex.name,
        weight_lb: l.weightLb,
        reps: l.reps,
        bodyweight_lb: u.bodyweightLb,
        sex: u.sex,
        username: u.username,
        dots: dotsScore(l.weightLb, u.bodyweightLb, u.sex),
        achieved_at: daysAgo(l.daysAgo),
      }));
      const { error: lbErr } = await admin.from('leaderboard_entries').insert(lbRows);

      // 3. Light workout session history, same session_data shape the app
      //    itself writes (env/date/muscle_group/durationMinutes/sets),
      //    minus the workoutSnapshot display-cache field, which is only
      //    used for rendering that user's own debrief screen — not needed
      //    for accounts nobody will ever log into.
      const sessionRows = u.sessions.map(s => ({
        user_id: userId,
        session_key: crypto.randomUUID(),
        started_at: daysAgo(s.daysAgo),
        session_data: {
          env: 'gym',
          date: daysAgo(s.daysAgo),
          muscle_group: s.muscleGroup,
          durationMinutes: s.durationMinutes,
          sets: s.sets,
        },
      }));
      const { error: sessErr } = await admin.from('workout_sessions').insert(sessionRows);

      results.push({
        email: u.email,
        userId,
        password, // returned once here so it can be recorded/discarded — never logged elsewhere
        leaderboardEntriesInserted: lbRows.length,
        leaderboardError: lbErr?.message || null,
        sessionsInserted: sessionRows.length,
        sessionError: sessErr?.message || null,
      });
    }

    return new Response(JSON.stringify({ results }, null, 2), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('fcf-seed-users error:', err);
    return new Response(JSON.stringify({ error: 'internal_error', detail: String(err) }), { status: 500, headers: CORS });
  }
});
