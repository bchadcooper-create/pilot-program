# ✈ Flight Crew Fitness

A mobile-first PWA workout tracker built for pilots and flight crew.
7 training goals · 84 workout templates · Works offline · Cloud sync

---

## What's New in This Version

- **Flight Crew Fitness** branding
- **Corrected workout rotations** — no two leg-heavy days back-to-back in any goal
- **Exercise images** — Wikimedia Commons GIFs in guide modal + ExRx.net links
- **Fitness level limits** — Beginner=3, Intermediate=4, Advanced=5 exercises per session
- **Timed exercises** — Plank, carries, cardio, holds use seconds instead of reps/weight
- **Waist tracking** — log and chart waist alongside bodyweight
- **Custom exercises** — add any exercise to any workout
- **Offline support** — service worker caches app for use without internet

---

## Setup (One Time — ~10 Minutes)

### Step 1 — Supabase

1. Go to [supabase.com](https://supabase.com) → free account → **New Project**
2. **Project Settings → API** → copy Project URL and anon key
3. Go to **SQL Editor** → paste and run the SQL below

### Step 2 — Run This SQL

```sql
-- Current workout state
create table if not exists current_workout (
  user_id uuid references auth.users primary key,
  workout_data jsonb,
  updated_at timestamptz
);

-- Completed sessions
create table if not exists workout_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users,
  session_key text,
  session_data jsonb,
  started_at timestamptz,
  workout_key text,
  unique(user_id, session_key)
);

-- User profile
create table if not exists user_profiles (
  user_id uuid references auth.users primary key,
  profile_data jsonb,
  updated_at timestamptz
);

-- Body weight + waist log
create table if not exists weight_log (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users,
  weight_lb numeric,
  waist_in numeric,
  logged_at timestamptz default now()
);

-- Row Level Security
alter table current_workout enable row level security;
alter table workout_sessions enable row level security;
alter table user_profiles enable row level security;
alter table weight_log enable row level security;

DROP POLICY IF EXISTS "own data" ON public.current_workout;
CREATE POLICY "own data" ON public.current_workout
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own data" ON public.workout_sessions;
CREATE POLICY "own data" ON public.workout_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own data" ON public.user_profiles;
CREATE POLICY "own data" ON public.user_profiles
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own data" ON public.weight_log;
CREATE POLICY "own data" ON public.weight_log
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**If you already have a weight_log table from the previous version**, add the waist column:
```sql
alter table weight_log add column if not exists waist_in numeric;
```

### Step 3 — Edit index.html

Open `index.html` in any text editor. Find near the top:

```javascript
const SB_URL  = 'YOUR_SUPABASE_URL';
const SB_ANON = 'YOUR_SUPABASE_ANON_KEY';
```

Replace with your actual values and save.

### Step 4 — Upload to GitHub

Upload all 3 files to your `pilot-program` GitHub repo:
- `index.html`
- `manifest.json`
- `sw.js`

Settings → Pages → Deploy from main branch → wait 2 min.

Your URL: `https://bchadcooper-create.github.io/pilot-program`

### Step 5 — iPhone Home Screen

1. Open **Safari** → go to your URL
2. Share button → **Add to Home Screen** → Add
3. Opens full-screen, works offline after first load

---

## Workout Rotations (Corrected)

All goals now alternate muscle groups so you never hit the same group two days in a row.

| Goal | Day A | Day B | Day C | Day D |
|------|-------|-------|-------|-------|
| Fat Loss | Legs + Upper | **Upper Only** | Legs + Upper | **Cardio** |
| Muscle Gain | Legs | **Chest + Tri** | **Back + Bi** | **Shoulders + Arms** |
| Strength | Squat (Legs) | **Bench (Upper)** | **Pull (Upper)** | Deadlift (Legs) |
| Vertical Jump | Lower Strength | **Upper + Core** | Power/Plyo | Sprint/Reactive |
| Longevity | Lower + Mobility | **Upper Pull** | **Upper Push + Core** | Carries + Cardio |
| Tactical | Strength | Conditioning | Overhead + Carries | Run + Lift |
| Cardio | Zone 2 | Intervals | Long Run | Strength + Cardio |

**Key fix:** Strength moved deadlift from C→D. Jump moved upper to B and plyo to C. Longevity moved carries to D. Fat Loss made B upper-only.

---

## Fitness Level Exercise Counts

- **Beginner** — 3 exercises per session (core movements only)
- **Intermediate** — 4 exercises per session
- **Advanced** — 5 exercises per session (full template)

Change your level anytime in Profile.

---

## Timed Exercises

These exercises record **seconds** instead of reps and weight:
Plank, Wall Sit, Hollow Body Hold, L-Sit, Farmer Carry, all stretches, all cardio (walk, run, bike, row, stair).

---

## Troubleshooting

**404 on home screen icon:** Delete old icon, re-add from Safari. Make sure manifest.json has `"start_url": "/pilot-program/"`.

**Offline not working:** Must visit the app once with internet to cache it. After that it works offline.

**Can't sign in:** Check email for Supabase confirmation link (check spam).

**Waist column error:** Run `alter table weight_log add column if not exists waist_in numeric;` in SQL Editor.
