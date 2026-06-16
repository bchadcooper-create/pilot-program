/**
 * Flight Crew Fitness — app.js
 * Full operational engine with aviation-phased workout structure
 */

// ─── SUPABASE ────────────────────────────────────────────────────────────────
const SB = supabase.createClient(
  'https://dnxkydxbyihgsictbzjz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRueGt5ZHhieWloZ3NpY3Riemp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3ODk4MTEsImV4cCI6MjA5NjM2NTgxMX0.oLUGuorQkbQ_u679NpE8FGBVAUmVE1K_rxl8q4B0n7k'
);

// ─── APP STATE ────────────────────────────────────────────────────────────────
const ST = {
  tab:         'preflight',
  env:         'comm',         // 'room' | 'hotel' | 'comm'
  flightHrs:   0,
  waterIn:     0,
  muscleGroup: 'Lower Body',
  workout:     null,           // generated flight plan
  sets:        {},             // { exId: [{reps,weight,seconds}] }
  expanded:    {},
  modal:       null,
  chartInst:   {},
  wisdomIdx:   0,
  todayBio:    null,           // last logged biometrics
};

// ─── HYDRATION LOGIC ─────────────────────────────────────────────────────────
// FAA + aviation medicine standard: 0.3L per flight hour minimum
const HYDRO_RATE = 0.3; // liters per flight hour

function hydroTarget()  { return Math.max(ST.flightHrs * HYDRO_RATE, 0.5); }
function hydroDeficit() { return Math.max(hydroTarget() - ST.waterIn, 0); }
function hydroPct()     { return Math.min(ST.waterIn / Math.max(hydroTarget(), 0.5), 1); }

function hydroStatus() {
  const pct = hydroPct();
  if (pct >= 1)   return { label: 'NOMINAL', color: 'var(--green)',   icon: '✅', cls: 'status-ok' };
  if (pct >= 0.6) return { label: 'CAUTION', color: 'var(--amber)',   icon: '⚠️', cls: 'status-warn' };
  return              { label: 'DEFICIT',  color: 'var(--red)',     icon: '🚨', cls: 'status-no' };
}

function hydroAdvice() {
  const def = hydroDeficit();
  if (def <= 0) return null;
  if (def < 0.25) return `Sip ${Math.round(def*1000)}ml now. You're close — don't stop yet.`;
  if (def < 0.5)  return `Drink ${Math.round(def*1000)}ml before starting your workout. Dehydration impairs strength output by up to 20%.`;
  return `You're ${def.toFixed(1)}L behind. Drink 500ml now, then sip throughout your session. Cognitive and physical performance both decline rapidly at this deficit.`;
}

// ─── MUSCLE GROUPS ────────────────────────────────────────────────────────────
const MUSCLE_GROUPS = [
  'Lower Body', 'Upper Push', 'Upper Pull', 'Power / Plyo',
  'Full Body',  'Longevity',  'Cardio',
];

// ─── WORKOUT DATA ─────────────────────────────────────────────────────────────
// Structure: WORKOUTS[env][muscleGroup] → { taxi, takeoff, enroute, landing }
// taxi    = warm-up / mobility (Pilot Protocol)
// takeoff = primary compound (heavy)
// enroute = secondary / volume work
// landing = decompression / CNS down-regulation

const W = {};

// Helper
const ex = (id, name, target, sets, note, timed) =>
  ({ id, name, target, sets: sets || 3, note, timed: !!timed });

// ── COMMERCIAL GYM ────────────────────────────────────────────────────────────
W.comm = {

  'Lower Body': {
    taxi: [
      ex('taxi_hip90',   'Hip 90/90 Stretch',        '60s/side', 1, 'Sit on floor, both legs at 90°. Slowly rotate between internal and external hip rotation. Critical for pilots — you sit compressed all day.', true),
      ex('taxi_anklemob','Ankle Circles + Dorsiflexion','20 reps', 1, 'Seated, rotate each ankle 10x each direction. Then pull toes to shin (dorsiflexion). Ankle mobility directly affects squat depth.'),
      ex('taxi_gbsquat', 'Goblet Squat Warmup',       '2×10',     2, 'Light KB or DB at chest. Slow descent, pause at the bottom. Own the bottom position before loading.'),
      ex('taxi_lateral', 'Lateral Band Walk',         '2×15/side',2, 'Band above knees. Stay low, controlled steps. Activates glute med — prevents knee cave under load.'),
    ],
    takeoff: [
      ex('to_squat',  'Back Squat',           '5×5',    5, 'Primary compound. Work up to a challenging set of 5 across all 5 sets. 3-4 min rest. Bar on traps, break parallel, drive through heels. This is your heavy work.'),
      ex('to_rdl',    'Romanian Deadlift',    '4×6',    4, 'Hip hinge. Moderate-heavy. Bar stays close to legs. Deep hamstring stretch at the bottom. 2-3 min rest. These are your posterior chain.'),
    ],
    enroute: [
      ex('er_bss',    'Bulgarian Split Squat', '3×8/leg', 3, 'Rear foot elevated on bench. Drive through front heel. One of the highest-transfer exercises for lower body strength and jump performance. 90s rest.'),
      ex('er_lgpress','Leg Press',             '3×12',    3, 'Moderate weight. Full ROM — don\'t lock knees. Quad-dominant volume after the hip-dominant RDL. 60-90s rest.'),
      ex('er_calf',   'Standing Calf Raise',   '4×12',    4, 'Full ROM — stretch at bottom, pause at top. Calves are chronically underworked. Use a step for full range. 60s rest.', false),
    ],
    landing: [
      ex('land_pigeon', 'Pigeon Pose (each side)', '90s/side', 1, 'External hip rotation stretch. Hold completely still — this releases the hip flexors and piriformis after a leg session. Breathe into the stretch.', true),
      ex('land_hamstr', 'Supine Hamstring Stretch', '60s/side', 1, 'Lying on back, pull one leg toward chest with a strap or towel. Knee straight. Hold still. Don\'t bounce.', true),
      ex('land_child',  'Child\'s Pose w/ Reach',  '90s',      1, 'Arms extended, sit back toward heels. Breathe deeply into your lower back. Decompresses the lumbar — essential after squats.', true),
    ],
  },

  'Upper Push': {
    taxi: [
      ex('taxi_wslide', 'Wall Slide',             '2×10',     2, 'Forearms against wall, slide up to full overhead. Fixes the forward-rounded posture from the cockpit. Do these slowly.'),
      ex('taxi_bandrear','Band Pull-Apart',        '2×20',     2, 'Arms straight in front, pull band apart to chest. Activates rear delts and sets scapular position before pressing.'),
      ex('taxi_thpush', 'Thoracic Extension (chair)', '10 reps', 1, 'Hands behind head, extend over chair back. Counteracts the thoracic kyphosis (hunched posture) pilots develop. Hold each extension 2s.'),
    ],
    takeoff: [
      ex('to_bench',  'Flat Barbell Bench Press', '5×5',  5, 'Work up to a heavy set of 5. Elbows 45-70° — not flared. Control the descent, explode up. 3-4 min rest. This is your primary upper push.'),
      ex('to_ohp',    'Standing Overhead Press',  '4×5',  4, 'Standing — not seated. Full lockout overhead. Core braced. Arm drive overhead is important for jump mechanics. 3 min rest.'),
    ],
    enroute: [
      ex('er_incdb',  'Incline DB Press',     '3×10',  3, '30-45° incline. Full stretch at the bottom, controlled ascent. Upper chest and anterior delt volume. 90s rest.'),
      ex('er_cgbench','Close Grip Bench',     '3×8',   3, 'Hands shoulder-width. Tricep emphasis. Superset option with the incline. 90s rest.'),
      ex('er_latrise','Lateral Raise',        '3×15',  3, 'Light and strict — no momentum. Shoulder width at top. This is shoulder health work, not ego work. 60s.'),
    ],
    landing: [
      ex('land_cheststr','Doorframe Chest Stretch','60s/side',1,'In a doorframe, arm at 90°, rotate body away. Counters the internal rotation that comes from pressing. Hold still — breathe.', true),
      ex('land_cwslide','Lat Stretch (overhead reach)','60s/side',1,'Reach one arm overhead, grab a rack, lean away. Lengthens the lat and shoulder. Don\'t rush this.', true),
      ex('land_breath', 'Diaphragmatic Breathing',   '10 deep breaths',1,'Lie on back. Inhale 4 counts (nose, belly first). Hold 2. Exhale 6 counts. Activates the parasympathetic system — downregulates the CNS after heavy work.'),
    ],
  },

  'Upper Pull': {
    taxi: [
      ex('taxi_armcircle','Arm Circles (progressive)', '10/dir', 1, 'Small to large. Both directions. Warms the rotator cuff and prepares the shoulder joint before pulling loads.'),
      ex('taxi_scap',     'Scapular Pullup',           '2×10',   2, 'Hang from bar. Without bending elbows, depress and retract scapulae — pull shoulder blades down and back. This is the foundation of every pull.'),
      ex('taxi_facelay',  'Prone Y-T-W Raises',        '2×10',   2, 'Lying face-down on bench. Small light plates. Raise in Y, T, and W shapes. Activates lower traps and rear delts — often the weakest link for pilots who sit all day.'),
    ],
    takeoff: [
      ex('to_dead',   'Conventional Deadlift',  '5×3',    5, 'Work up to heavy triples. Full reset each rep — not touch-and-go. This is maximum posterior chain loading. 3-4 min rest. Keep back neutral.'),
      ex('to_barrow', 'Barbell Row (Pendlay)',   '4×6',    4, 'Bar to floor between reps. Upper back, lats, and rear delts. Overhand grip. Don\'t cheat the ROM. 3 min rest.'),
    ],
    enroute: [
      ex('er_latpd',  'Lat Pulldown',         '3×10',  3, 'Full overhead stretch, pull to upper chest. Slow on the way back up. 90s rest.'),
      ex('er_cabrow', 'Seated Cable Row',      '3×12',  3, 'Retract fully at the end — shoulder blades together. Don\'t round forward on the return. 90s rest.'),
      ex('er_facepull','Face Pull',            '3×20',  3, 'Cable at face height. Pull to forehead, elbows high and wide. External rotation finish. This is essential shoulder health work. 60s.'),
      ex('er_curl',   'EZ Bar Curl',           '3×12',  3, 'Strict — no swing. Control the eccentric. 60s rest. Biceps are secondary movers in all pulls.'),
    ],
    landing: [
      ex('land_lstretch','Lat Hang Stretch',         '45s',     1, 'Hang from pullup bar, completely relaxed — no tension. Decompresses the shoulder and spine after heavy pulling. Breathe.', true),
      ex('land_throta', 'Thoracic Rotation (seated)','60s/side',1,'Seated, cross arms on chest. Rotate slowly through mid-back only. Restores spinal mobility after loading. 5 slow reps each side.', true),
    ],
  },

  'Power / Plyo': {
    taxi: [
      ex('taxi_jump_prep','Jump Rope / Ankle Bouncing', '3 min',  1, 'Moderate pace — not sprinting. Warms the Achilles and prepares the elastic/reactive system for plyometric work. Don\'t skip this.', true),
      ex('taxi_sqjump_light','Light Squat Jumps',       '2×5',    2, 'Bodyweight only. Focus on arm swing mechanics and landing softly. Each jump should feel controlled.'),
      ex('taxi_hipflx',  'Hip Flexor Lunge Stretch',   '60s/side',1,'Kneeling lunge, hands overhead, lean forward. Hip flexors are always tight in pilots. This must be addressed before sprint and jump work.', true),
    ],
    takeoff: [
      ex('to_boxjump','Box Jump',         '5×3',   5, 'FULL 3-minute rest between sets. Every rep is maximum effort — loaded countermovement, explosive drive. Step down slowly. This is your nervous system — treat it accordingly.'),
      ex('to_tbdl',   'Trap Bar Deadlift','5×3',   5, 'Heavy and FAST. The concentric must be explosive — slow off the floor loses the stimulus. Work up to a heavy triple. 3-4 min rest. This builds the engine for jumping.'),
    ],
    enroute: [
      ex('er_broad',  'Broad Jump',       '5×3',   5, 'Horizontal power transfers to vertical. Max effort — arm swing, explosive hip extension. Stick the landing. Full rest between sets.'),
      ex('er_lunge2', 'Walking Lunge',    '3×10/leg',3,'Light-moderate. Hip flexor strength is critical for jump takeoff mechanics. Focus on length of stride.'),
      ex('er_sprint', 'Sprint 40yd',      '6 reps', 6,'Full speed. Walk back. 90s between each. Ground force application and sprint mechanics directly improve jump height. Log reps in weight field.'),
    ],
    landing: [
      ex('land_ankstr','Achilles / Calf Stretch',  '90s/side',1,'Step on a step edge, drop heel slowly. Hold. CNS cool-down begins here. Breathe deeply.', true),
      ex('land_pogo',  'Slow Pogo Hops (25% effort)','30s',   1,'Gentle bouncing on both feet — minimal effort. Active recovery for the elastic system. Signals the end of power work.', true),
      ex('land_nsdr',  'Non-Sleep Deep Rest',       '5 min',  1,'Lie flat. Eyes closed. Breathe slowly. Research shows 10-20 min NSDR post-workout accelerates motor learning and strength retention. Set a timer.', true),
    ],
  },

  'Full Body': {
    taxi: [
      ex('taxi_fb_warmup','Full Mobility Circuit','1 round',1,'5 hip 90/90 each side → 10 arm circles each way → 10 thoracic extensions → 10 bodyweight squats. Run through once slowly. This primes every system.'),
    ],
    takeoff: [
      ex('to_squat_fb', 'Back Squat',        '4×5',  4, 'Primary compound. Heavy. 3 min rest.'),
      ex('to_bench_fb', 'Bench Press',        '4×5',  4, 'Upper push. Heavy. 3 min rest.'),
      ex('to_dead_fb',  'Deadlift',           '3×3',  3, 'Heavy triple. 4 min rest. This is your max CNS effort.'),
    ],
    enroute: [
      ex('er_pullup_fb','Weighted Pullups',   '3×6',  3, 'Upper pull accessory. Add weight if bodyweight is easy. 2 min rest.'),
      ex('er_ohp_fb',   'Overhead Press',     '3×8',  3, 'Moderate. Standing. 90s rest.'),
      ex('er_bss_fb',   'Bulgarian Split Squat','3×8/leg',3,'Unilateral leg accessory. 90s rest.'),
    ],
    landing: [
      ex('land_fb_str','Full Body Stretch Circuit','5 min',1,'Child\'s pose → pigeon each side → lat hang → chest doorframe. Slow, held positions. You loaded everything today — you need to unload everything.', true),
    ],
  },

  'Longevity': {
    taxi: [
      ex('taxi_lon_cat','Cat-Cow',            '2×10', 2,'Slow spinal articulation. Inhale on extension, exhale on flexion. Wakes up the spine gently.'),
      ex('taxi_lon_dead','Dead Bug',          '2×8/side',2,'Lie on back. Extend opposite arm/leg slowly. Lower back stays pressed to floor the entire time. Core stability is spine protection.'),
    ],
    takeoff: [
      ex('to_goblet','Goblet Squat',          '3×10', 3,'Moderate weight. Full depth. This is the most joint-friendly lower body compound. 2 min rest.'),
      ex('to_cabrow','Cable Row',             '3×12', 3,'Back health and posture. Full retraction at the end. 90s rest.'),
      ex('to_carry', 'Farmer Carry',          '3×40yd',3,'Heaviest DB you can hold with perfect posture. This builds grip, core, and spinal stability simultaneously. Walk slow and tall.'),
    ],
    enroute: [
      ex('er_splitlon','Split Squat',         '3×10/leg',3,'Both feet on floor. Controlled descent. Joint-friendly alternative to BSS. 90s rest.'),
      ex('er_facelon', 'Face Pull',           '3×20',3,'Critical shoulder health. Every pilot should do these every session.'),
      ex('er_pallon',  'Pallof Press',        '3×10/side',3,'Cable or band at chest height. Extend arms straight out — resist rotation. Anti-rotation core stability. 60s.'),
    ],
    landing: [
      ex('land_lon_hip','Hip 90/90 Rotation Drill','90s/side',1,'Slow, controlled. This is your most important mobility work as a pilot. Hip restriction leads to lumbar compensation.', true),
      ex('land_lon_nk','Neck Mobility Protocol','2×8/direction',1,'Forward, back, rotation each side, lateral flexion. Gentle and slow. Cervical spine gets compressed in cockpit posture.'),
      ex('land_lon_zone2','Zone 2 Walk',      '10 min',1,'Brisk walk. Conversational pace. This is active recovery — it clears lactate, reduces cortisol, and aids sleep quality. Do this after every session when possible.', true),
    ],
  },

  'Cardio': {
    taxi: [
      ex('taxi_card_walk','Brisk Walk (ramp up)','3 min',1,'Start slow, build pace over 3 minutes. Get the cardiovascular system moving before interval work.', true),
    ],
    takeoff: [
      ex('to_rowint',  'Rowing Machine Intervals','6×500m',6,'Hard effort — record your split time each interval. 90s rest. Rowing is the most complete aerobic machine: legs, core, and pull all working.'),
    ],
    enroute: [
      ex('er_bikeint', 'Assault Bike Intervals','8×30s',8,'All-out 30 seconds. 60s easy spin. Record calories per round. The bike doesn\'t lie.'),
      ex('er_zone2run','Treadmill Zone 2 Run', '20 min',1,'Conversational pace — you can speak in full sentences. 65-70% max HR. This builds your aerobic base.', true),
    ],
    landing: [
      ex('land_card_cool','Cool-Down Walk',   '5 min',1,'Slow your pace gradually. Don\'t stop abruptly — keep blood moving to prevent pooling.', true),
      ex('land_card_str','Static Stretching', '5 min',1,'Hip flexors, hamstrings, calves. Aerobic work tightens these. Hold each 45+ seconds.', true),
    ],
  },
};

// ── HOTEL GYM ─────────────────────────────────────────────────────────────────
W.hotel = {
  'Lower Body': {
    taxi: W.comm['Lower Body'].taxi.slice(0, 3),
    takeoff: [
      ex('to_h_goblet','Heavy Goblet Squat',  '5×6',  5,'Heaviest DB available. Full depth. This is your primary compound today. 3 min rest.'),
      ex('to_h_drdl',  'DB Romanian Deadlift','4×8',  4,'Hip hinge. Feel the hamstring stretch. Moderate-heavy. 2 min rest.'),
    ],
    enroute: [
      ex('er_h_bss',   'Bulgarian Split Squat','3×10/leg',3,'Use a bench. Bodyweight or light DBs. Best hotel leg exercise available.'),
      ex('er_h_stepup','Weighted Step-Up',     '3×12/leg',3,'Drive through the working heel. Full hip extension at top.'),
      ex('er_h_calf',  'Single-Leg Calf Raise','3×15',3,'Step edge for full ROM.'),
    ],
    landing: W.comm['Lower Body'].landing,
  },
  'Upper Push': {
    taxi: W.comm['Upper Push'].taxi,
    takeoff: [
      ex('to_h_dbpress','DB Bench Press','4×8', 4,'Heaviest DBs. Full ROM. 2-3 min rest.'),
      ex('to_h_dbohp',  'DB Overhead Press','4×8',4,'Standing. Full lockout. 2 min rest.'),
    ],
    enroute: [
      ex('er_h_incdb',  'DB Incline Press','3×10',3,'30-45°. Upper chest.'),
      ex('er_h_latrise','DB Lateral Raise','3×15',3,'Light and strict.'),
      ex('er_h_dbtri',  'DB Tricep Overhead','3×12',3,'Both hands on one DB. Full stretch.'),
    ],
    landing: W.comm['Upper Push'].landing,
  },
  'Upper Pull': {
    taxi: W.comm['Upper Pull'].taxi,
    takeoff: [
      ex('to_h_pull',  'Pullups',          '5×max',5,'Every set near-failure. Full hang at bottom. Add weight if sets exceed 8.'),
      ex('to_h_dbrow', 'DB Row',           '4×10/side',4,'Chest on bench. Heavy. Full retraction.'),
    ],
    enroute: [
      ex('er_h_chin',  'Chinups',          '3×max',3,'Supinated grip. Bicep emphasis.'),
      ex('er_h_dbcurl','DB Curl',          '3×12', 3,'Controlled eccentric. Supinate at top.'),
      ex('er_h_facedb','Bent-Over Face Pull','3×15',3,'Light DBs. External rotation at finish.'),
    ],
    landing: W.comm['Upper Pull'].landing,
  },
  'Power / Plyo': {
    taxi: W.comm['Power / Plyo'].taxi,
    takeoff: [
      ex('to_h_bjump','Bench/Box Jump',    '5×3',  5,'Highest stable surface. Max effort. FULL 3 min rest. This is the most important hotel power exercise.'),
      ex('to_h_broad', 'Broad Jump',       '5×3',  5,'Max horizontal distance. Stick the landing. Full rest.'),
    ],
    enroute: [
      ex('er_h_sqjump','Squat Jump',       '4×5',  4,'Bodyweight. Explode. Land soft.'),
      ex('er_h_sprint','Sprints (hall/out)','6×20yd',6,'Full speed. Full rest. No jog.'),
    ],
    landing: W.comm['Power / Plyo'].landing,
  },
  'Full Body':  { taxi: W.comm['Full Body'].taxi,  takeoff: W.comm['Full Body'].takeoff.slice(0,2), enroute: W.comm['Full Body'].enroute.slice(0,3), landing: W.comm['Full Body'].landing },
  'Longevity':  W.comm['Longevity'],
  'Cardio':     W.comm['Cardio'],
};

// ── HOTEL ROOM (minimal/bodyweight) ──────────────────────────────────────────
W.room = {
  'Lower Body': {
    taxi: W.comm['Lower Body'].taxi.slice(0, 3),
    takeoff: [
      ex('to_r_pistol','Pistol Squat Progression','4×5/leg',4,'Assisted or full. Best bodyweight lower body exercise. Use a TRX/door handle for support if needed. 2-3 min rest.'),
      ex('to_r_nordic','Nordic Hamstring Curl',   '3×5',    3,'Feet anchored under bed/door. Lower as slowly as possible. Extremely high hamstring stimulus. 2 min rest.'),
    ],
    enroute: [
      ex('er_r_bss',  'Bulgarian Split Squat','4×12/leg',4,'Rear foot on bed. Bodyweight. Slow on the way down.'),
      ex('er_r_gbrid','Single-Leg Glute Bridge','3×15/leg',3,'Drive through heel. Full hip extension.'),
      ex('er_r_calf', 'Calf Raise (step)',      '4×20',   4,'Use a stair or book stack. Full ROM.'),
    ],
    landing: W.comm['Lower Body'].landing,
  },
  'Upper Push': {
    taxi: W.comm['Upper Push'].taxi.slice(0,2),
    takeoff: [
      ex('to_r_archer','Archer Pushup',        '4×5/side',4,'One arm supports, one extends. Unilateral chest. 2 min rest.'),
      ex('to_r_pike',  'Pike Pushup',           '4×10',    4,'Hips high, head toward floor. Overhead strength pattern.'),
    ],
    enroute: [
      ex('er_r_pu',   'Pushup Variations',    '3×15',  3,'Wide, close, explosive. Max effort.'),
      ex('er_r_dip',  'Chair/Bed Dips',       '3×max', 3,'Tricep focus.'),
      ex('er_r_plank','Plank Progression',    '3×60s', 3,'Front plank, then side plank each side.', true),
    ],
    landing: W.comm['Upper Push'].landing,
  },
  'Upper Pull': {
    taxi: W.comm['Upper Pull'].taxi.slice(0,2),
    takeoff: [
      ex('to_r_pull',  'Pullups (if bar available)','5×max',5,'Every rep near-failure.'),
      ex('to_r_invrow','Table/Inverted Row',       '4×12', 4,'Heels on floor, pull chest to table edge.'),
    ],
    enroute: [
      ex('er_r_chin',   'Chinups',           '3×max',3,'Supinated. Bicep emphasis.'),
      ex('er_r_twlcurl','Towel Curl',        '3×15', 3,'Towel looped over door handle. Lean back and curl. Good isolation with no equipment.'),
    ],
    landing: W.comm['Upper Pull'].landing,
  },
  'Power / Plyo': {
    taxi: W.comm['Power / Plyo'].taxi,
    takeoff: [
      ex('to_r_bjump','Bed/Chair Jump',    '5×3',  5,'Any stable surface. Max jump every rep. Step down. FULL 3 min rest.'),
      ex('to_r_broad', 'Broad Jump',       '5×3',  5,'Hallway. Max effort. Full rest.'),
    ],
    enroute: [
      ex('er_r_sqjump','Squat Jump',       '4×5',  4,'Bodyweight. Explode every rep.'),
      ex('er_r_spljump','Split Jump',      '3×6',  3,'Lunge position, jump and switch. Hip flexor power.'),
    ],
    landing: W.comm['Power / Plyo'].landing,
  },
  'Full Body':  { taxi: W.comm['Full Body'].taxi, takeoff: [W.room['Lower Body'].takeoff[0], W.room['Upper Pull'].takeoff[0], W.room['Upper Push'].takeoff[0]], enroute: [W.room['Lower Body'].enroute[0], W.room['Upper Push'].enroute[0]], landing: W.comm['Full Body'].landing },
  'Longevity': {
    taxi: W.comm['Longevity'].taxi,
    takeoff: [
      ex('to_rl_squat','Slow Bodyweight Squat','3×12',3,'3s down, 1s pause, controlled up. Joint-friendly.'),
      ex('to_rl_invrow','Inverted Row',        '3×12',3,'Table or door. Full retraction.'),
    ],
    enroute: [
      ex('er_rl_split','Reverse Lunge',   '3×10/leg',3,'Controlled. Knee tracks over toe.'),
      ex('er_rl_pu',   'Slow Pushup',     '3×8',    3,'4s down, 2s pause. Joint-friendly.'),
      ex('er_rl_dead', 'Dead Bug',        '3×8/side',3,'Core stability. Lower back health.'),
    ],
    landing: W.comm['Longevity'].landing,
  },
  'Cardio': {
    taxi: W.comm['Cardio'].taxi,
    takeoff: [
      ex('to_rc_burp', 'Burpee Intervals',     '8×30s', 8,'Max burpees in 30s. Rest 30s. Count reps.'),
    ],
    enroute: [
      ex('er_rc_stair','Stair Sprint Intervals','6×2 flights',6,'Full sprint up. Walk down. 60s rest.'),
      ex('er_rc_jlunge','Jump Lunge',          '4×10/leg',4,'Explosive alternating.'),
    ],
    landing: W.comm['Cardio'].landing,
  },
};

// ─── WISDOM CARDS ─────────────────────────────────────────────────────────────
const WISDOM = [
  { title:"Hydration SOP", text:"The FAA and aviation medicine literature set 0.3L per flight hour as the baseline hydration requirement. At altitude, cabin humidity drops below 20% — drier than the Sahara. You lose fluid faster than you feel thirsty. By the time thirst kicks in, you're already 1-2% dehydrated, which is enough to measurably impair reaction time, working memory, and decision-making — all things that matter in the cockpit and in the gym.", link:"https://pubmed.ncbi.nlm.nih.gov/14681719/" },
  { title:"Seated Correction", text:"Sustained sitting compresses the intervertebral discs, shuts off the glutes, and tightens the hip flexors — a triple threat for lower back problems. Set a timer for every 60 minutes in the cockpit or hotel room. Perform 10 glute squeezes, 5 standing hip hinges, and a 20-second thoracic extension over a chair. This micro-break protocol is used by NASA long-duration spaceflight physicians.", link:"https://pubmed.ncbi.nlm.nih.gov/28870953/" },
  { title:"Landing Prep", text:"4-7-8 breathing (inhale 4 counts, hold 7, exhale 8) directly activates the vagus nerve and shifts your autonomic nervous system from sympathetic (fight-or-flight) to parasympathetic (rest-and-digest). Use this during approach if workload permits, or immediately post-landing. It drops cortisol, lowers heart rate, and clears the cognitive 'noise' of a high-task environment within 3-5 breath cycles.", link:"https://www.health.harvard.edu/mind-and-mood/relaxation-techniques-breath-control-helps-quell-errant-stress-response" },
  { title:"BP Accuracy", text:"Blood pressure measurement has a significant protocol effect — meaning the method changes the number. Wait 5 minutes of complete rest in a quiet environment before measuring. Sit with both feet flat on the floor, back supported, arm at heart level. Do not talk. Take three readings 1-2 minutes apart and average the last two. Coffee, exercise, or conversation within 30 minutes can falsely elevate readings by 10-20 mmHg.", link:"https://www.ahajournals.org/doi/10.1161/HYP.0000000000000065" },
  { title:"Glucose Baseline", text:"Fasting glucose should be measured upon waking, before food or coffee, after at least 8 hours with no caloric intake. The clinical normal range is 70-99 mg/dL fasting. 100-125 is pre-diabetic. 126+ is the diabetic threshold. For pilots, metabolic health is a medical certificate issue — tracking this longitudinally gives you early signal before it becomes a problem. Note: stress, poor sleep, and shift-work schedules all chronically elevate fasting glucose.", link:"https://pubmed.ncbi.nlm.nih.gov/30559192/" },
  { title:"Blue Light", text:"The photoreceptors in your retina (specifically intrinsically photosensitive retinal ganglion cells, or ipRGCs) are maximally sensitive to blue light at 480nm. Exposure to screens or cabin lighting at this wavelength after dark delays melatonin onset by 90-180 minutes and suppresses total melatonin output by up to 50%. For pilots with disrupted circadian rhythms, this is compounded. Blue light blocking glasses (amber lens, 450nm filter) or Night Shift mode after 6pm are evidence-based countermeasures.", link:"https://pubmed.ncbi.nlm.nih.gov/17950011/" },
  { title:"The Why", text:"The squat is not a leg exercise — it is a full-system loading event. The lumbar spine, thoracic spine, hip flexors, glutes, hamstrings, quadriceps, calves, and core all contribute to a properly executed squat. For pilots, the squat also trains the postural chain that degrades from prolonged seat time. Regular loaded squatting has been shown to increase bone mineral density, improve insulin sensitivity, and elevate anabolic hormone output for hours post-session.", link:"https://pubmed.ncbi.nlm.nih.gov/24236446/" },
  { title:"Walk Benefit", text:"A 10-minute moderate-paced walk after a meal reduces the postprandial glucose spike by 30-40% according to multiple randomized controlled trials. The mechanism: muscle contractions during walking act as a non-insulin-dependent glucose uptake pathway via GLUT4 transporter translocation. For pilots eating irregular meals at irregular times, a post-meal walk is one of the highest-leverage metabolic interventions available regardless of hotel, airport, or terminal.", link:"https://pubmed.ncbi.nlm.nih.gov/35687729/" },
  { title:"Sleep Health", text:"Wake time consistency is the master regulator of circadian rhythm — more so than bedtime. Your body sets its entire hormonal cascade (cortisol, melatonin, GH, testosterone) based on anchored wake time. Even after a red-eye or irregular schedule, anchoring your wake time within a 30-minute window rebuilds circadian alignment within 2-3 days. Irregular sleep timing — even with adequate total hours — has been associated with metabolic syndrome, impaired immune function, and cognitive decline.", link:"https://pubmed.ncbi.nlm.nih.gov/26158019/" },
  { title:"Stress Relief", text:"Box breathing (4 counts in, 4 hold, 4 out, 4 hold) is a US Navy SEAL operational protocol and is endorsed by multiple military and aviation psychology programs for acute stress reduction. It activates the baroreceptor reflex, slowing heart rate and modulating the sympathetic surge. Research shows measurable reductions in salivary cortisol after just 3-5 cycles. Use it pre-approach, pre-conversation, or before a heavy set.", link:"https://pubmed.ncbi.nlm.nih.gov/31368925/" },
  { title:"Protein Priority", text:"30g of high-quality protein per meal maximizes muscle protein synthesis (MPS) in most adults via leucine threshold activation of the mTOR signaling pathway. Spreading intake across 3-4 meals is more effective than front-loading or back-loading. For pilots in caloric environments (airports, hotels, crew meals), this requires intentional selection: eggs, Greek yogurt, chicken breast, cottage cheese. Protein also has the highest thermic effect of any macronutrient (25-30% of calories burned in digestion).", link:"https://pubmed.ncbi.nlm.nih.gov/26797090/" },
  { title:"Fiber Intake", text:"30 grams of dietary fiber daily is the minimum target supported by current metabolic health research. Fiber feeds the gut microbiome, blunts glucose spikes, reduces LDL cholesterol, and promotes satiety — a relevant mechanism for pilots navigating calorie-dense airport food. Soluble fiber (oats, legumes, apples) is particularly effective for glucose control. Insoluble fiber (vegetables, whole grains) supports motility. Most Americans eat 10-15g/day — half the minimum.", link:"https://pubmed.ncbi.nlm.nih.gov/31174214/" },
  { title:"Zone 2 Training", text:"Zone 2 cardio (roughly 60-70% of max HR, conversational pace) is the training zone that builds mitochondrial density, improves fat oxidation efficiency, and enhances cardiac output — the foundation beneath all higher-intensity work. Elite endurance athletes spend 80% of their training volume here. For general health, 150-180 minutes per week of Zone 2 is the evidence-based target. Benefits include reduced all-cause mortality risk, improved insulin sensitivity, and CNS recovery facilitation.", link:"https://pubmed.ncbi.nlm.nih.gov/34510508/" },
  { title:"Mobility Focus", text:"Thoracic extension mobility is the single most important structural quality for pilots. Prolonged forward flexion in cockpit seats causes the thoracic spine to lock into kyphosis (rounding). When this happens, compensatory load transfers to the lumbar spine and cervical spine — the two most common sites of pilot musculoskeletal injury. Thoracic extension over a foam roller, chair, or wall slide (10 reps daily) directly counteracts this. 10 minutes a day prevents years of pain.", link:"https://pubmed.ncbi.nlm.nih.gov/25379884/" },
  { title:"Caffeine Cutoff", text:"Caffeine has a half-life of 5-7 hours and a quarter-life of 10-14 hours. A 200mg coffee at 2pm still has 100mg circulating at 7-9pm — enough to delay sleep onset, reduce slow-wave (deep) sleep, and reduce total sleep time even if you fall asleep normally. For shift workers and pilots with irregular schedules, the cutoff matters more, not less. Adenosine (the sleep pressure molecule caffeine blocks) continues to accumulate regardless — caffeine only masks it, and the debt is paid during sleep.", link:"https://pubmed.ncbi.nlm.nih.gov/23034071/" },
  { title:"Sun Exposure", text:"Morning light exposure (ideally within 30-60 minutes of waking) anchors the circadian clock via retinal photoreceptor activation. Even on overcast days, outdoor light is 10,000+ lux versus 200-400 lux indoors. This morning signal sets the timer for melatonin release 14-16 hours later. For pilots crossing time zones, morning light at the destination is the fastest available intervention for circadian resynchronization — faster than melatonin supplementation alone.", link:"https://pubmed.ncbi.nlm.nih.gov/28578993/" },
  { title:"Strength Baseline", text:"The three fundamental movement patterns that transfer most broadly to longevity, performance, and injury resistance are: a loaded squat (posterior chain and leg strength), a horizontal or vertical pull (back, scapular health, grip), and a hip hinge (deadlift pattern — posterior chain and spinal loading). If you do nothing else, maintain competency in these three patterns. Research consistently shows grip strength and lower body power as the two strongest predictors of all-cause mortality in aging populations.", link:"https://pubmed.ncbi.nlm.nih.gov/25530455/" },
  { title:"Active Recovery", text:"On layovers, the reflex is to rest — but passive sitting on top of 8 hours of cockpit sitting is counterproductive. Light movement (Zone 2 walk, mobility work, easy swimming) actively clears blood lactate, reduces muscle soreness markers, improves lymphatic flow, and restores parasympathetic tone better than complete rest. The threshold is low: 20-30 minutes of easy movement is sufficient to gain all recovery benefits without adding training stress.", link:"https://pubmed.ncbi.nlm.nih.gov/22675826/" },
  { title:"Waist Standard", text:"The clinically validated measurement protocol: stand relaxed, locate the top of the hip bone (iliac crest), and measure at the umbilicus level at end of normal exhale. Do not suck in. Do not wear clothing. Use a flexible tape, snug but not compressing. Clinically, waist circumference above 40 inches (men) or 35 inches (women) is a primary risk marker for metabolic syndrome, cardiovascular disease, and type 2 diabetes — independent of BMI. It is a better predictor of visceral fat than bodyweight alone.", link:"https://www.nhlbi.nih.gov/health/educational/lose_wt/risk.htm" },
  { title:"Meal Timing", text:"The 3-hour pre-sleep food cutoff is supported by research on postprandial thermogenesis, gastroesophageal reflux, core body temperature, and insulin dynamics. Core body temperature must drop 1-2°F for sleep onset. Digestion elevates core temperature and keeps insulin elevated, both of which delay or disrupt sleep onset and architecture. Late eating is also associated with higher overnight glucose, more fat storage, and reduced growth hormone secretion during slow-wave sleep.", link:"https://pubmed.ncbi.nlm.nih.gov/31139149/" },
  { title:"CNS Recovery", text:"Strength is built during recovery, not during training. The training session is the stimulus — the adaptation happens in the 24-72 hours following. Insufficient recovery (less than 7 hours sleep, inadequate protein, high stress) means the stimulus was wasted. For pilots with irregular sleep schedules: prioritize protein intake on duty days even if training is missed. The anabolic window is longer than once thought — protein consumed within 4-6 hours of the previous session still supports adaptation.", link:"https://pubmed.ncbi.nlm.nih.gov/23343676/" },
  { title:"Posture Cue", text:"The correct scapular position is 'back and down' — not artificially retracted, just out of the forward-rounded default that cockpit posture enforces. A practical cue: imagine trying to put your shoulder blades into your back pockets. This places the glenoid fossa (shoulder socket) in optimal position for overhead reach and reduces impingement risk. Reinforce this cue before every pressing or pulling set — it takes deliberate practice for pilots who have years of forward-rounded habits.", link:"https://pubmed.ncbi.nlm.nih.gov/19362276/" },
  { title:"Decompression", text:"Child's pose with arms extended creates gentle lumbar traction and counters the spinal compression accumulated during prolonged seating. The mechanism is intradiscal pressure reduction — research using intradiscal pressure transducers shows standing reduces disc pressure by 60% versus sitting, and lying prone/supine reduces it further. 90 seconds in a held stretch position has been shown to produce measurable intradiscal fluid rehydration.", link:"https://pubmed.ncbi.nlm.nih.gov/3951250/" },
  { title:"Glucose Spikes", text:"Refined carbohydrates and added sugars create rapid glucose spikes followed by reactive hypoglycemia — the energy crash 90-120 minutes later. For pilots, this pattern impairs alertness during the crash phase in a way that is not always consciously perceived but measurably affects performance on cognitive tasks. Whole food carbohydrates (fruit, vegetables, legumes, whole grains) have slower digestion rates due to fiber and structure. Pairing any carbohydrate source with protein and fat further blunts the spike.", link:"https://pubmed.ncbi.nlm.nih.gov/32025084/" },
  { title:"Hydration Status", text:"Urine color is a validated, free, always-available hydration biomarker. The Armstrong color chart (widely used in sports medicine) assigns values: pale straw (1-3) = well hydrated; yellow (4-6) = mild dehydration; dark amber (7-8) = significant dehydration requiring immediate action. Note: B vitamins and some medications cause fluorescent yellow urine regardless of hydration status. Assess in the morning before supplementation for the most accurate reading.", link:"https://pubmed.ncbi.nlm.nih.gov/9694420/" },
  { title:"Cold Exposure", text:"Brief cold exposure at the end of a shower (30-90 seconds, as cold as possible) activates norepinephrine release, improves metabolic rate, and has been associated with improved mood and alertness via beta-endorphin release. Critically for pilots: cold exposure has been shown to accelerate post-exercise muscle recovery by reducing inflammatory markers and perceived soreness. The mechanism is vasoconstriction followed by vasodilation — a flushing effect on metabolic waste products.", link:"https://pubmed.ncbi.nlm.nih.gov/23789999/" },
  { title:"Mindfulness", text:"Two minutes of focused attention meditation (eyes closed, attention on breath, non-judgmental acknowledgment of thoughts) measurably reduces cortisol within a single session and improves sustained attention on cognitive tasks. For pilots, decision fatigue accumulates across a duty day in ways that are not subjectively perceived. Short mindfulness breaks — even 2 minutes between legs — have shown sustained effects on working memory and task switching in high-cognitive-load professionals.", link:"https://pubmed.ncbi.nlm.nih.gov/24395196/" },
  { title:"Joint Longevity", text:"Tempo training — controlling the speed of both the concentric (lifting) and eccentric (lowering) phases — dramatically increases tendon and connective tissue stimulus relative to fast, uncontrolled repetitions. Tendons adapt more slowly than muscle (weeks to months versus days). A 3-second eccentric is the minimum for connective tissue stimulus. For pilots building longevity-focused training programs, this means trading some load for control — a worthwhile trade at any age.", link:"https://pubmed.ncbi.nlm.nih.gov/19260172/" },
  { title:"Blood Pressure", text:"Reducing sodium intake by 1,000mg/day lowers systolic blood pressure by an average of 5-6 mmHg in sodium-sensitive individuals. Simultaneously increasing potassium-rich foods (leafy greens, avocado, sweet potato, legumes) adds another 3-4 mmHg reduction via renal sodium excretion. Combined, this dietary shift matches the effect of a low-dose antihypertensive medication — without the side effects. For pilots, BP control is a medical certificate issue. Diet is your first-line intervention.", link:"https://pubmed.ncbi.nlm.nih.gov/23410606/" },
  { title:"Core Stability", text:"The spine has no intrinsic stability — it relies entirely on the surrounding musculature. Planks, dead bugs, and pallof presses train 'anti-movement' core function: resisting extension, rotation, and flexion under load. This is more functionally protective than crunches or sit-ups, which train flexion under load into an already-flexed spine. Stuart McGill's spinal biomechanics research (the definitive work in this field) supports anti-movement core training as the primary intervention for back pain prevention.", link:"https://pubmed.ncbi.nlm.nih.gov/20512940/" },
  { title:"Mental Focus", text:"The blue light and stimulation from screens suppresses melatonin and elevates alerting signals (dopamine, norepinephrine) in the 60-90 minutes before sleep. But the effect compounds with content: news, social media, and work email have additional cortisol-raising effects that persist into sleep. The intervention is a hard stop on all screens 60 minutes pre-sleep, replacing with reading (physical book), journaling, or a podcast. Habitual implementation reduces sleep onset latency significantly within 2 weeks.", link:"https://pubmed.ncbi.nlm.nih.gov/24850726/" },
  { title:"Dynamic Warmup", text:"A dynamic warmup (leg swings, arm circles, bodyweight squats, hip hinges, lateral movements) raises core temperature, increases synovial fluid viscosity in joints, improves neuromuscular activation, and reduces injury risk. Research consistently shows dynamic warmup outperforms static stretching pre-workout for power output and injury prevention. Save static stretching for after the session. 5-8 minutes of progressive movement is sufficient.", link:"https://pubmed.ncbi.nlm.nih.gov/22525657/" },
  { title:"Metabolic Health", text:"Skeletal muscle is the largest insulin-sensitive tissue in the body — greater muscle mass directly increases the body's capacity to clear glucose from the bloodstream. A 1kg increase in lean mass has been associated with a 3-5% improvement in insulin sensitivity independent of weight change. Resistance training 3x per week for 10 weeks has been shown to improve HbA1c, fasting glucose, and insulin resistance in both healthy and pre-diabetic populations.", link:"https://pubmed.ncbi.nlm.nih.gov/24729333/" },
  { title:"Tension Relief", text:"The upper trapezius and levator scapulae are the two muscles that carry the most cumulative tension in pilots. They work continuously to stabilize the head and shoulder girdle against gravity during prolonged sitting. Post-flight manual massage or foam rolling these muscles (30-60 seconds of sustained pressure at tender points) reduces trigger point activity and restores blood flow. Self-massage tools (lacrosse ball against a wall) replicate 80% of manual therapy effects.", link:"https://pubmed.ncbi.nlm.nih.gov/25615030/" },
  { title:"Weight Consistency", text:"Body weight fluctuates by 2-4 lbs daily based on hydration, food volume, and glycogen stores. To extract meaningful trend data: weigh daily upon waking, after using the restroom, before eating or drinking, on the same scale. Use a 7-day rolling average, not day-to-day comparison. This eliminates noise and reveals the true trend. Apps like Happy Scale (iOS) do this automatically. Month-over-month trend is the signal. Day-to-day number is noise.", link:"https://pubmed.ncbi.nlm.nih.gov/24571926/" },
  { title:"Vitamin D", text:"Vitamin D deficiency is endemic in pilots and flight crew due to cockpit glass UV filtration, irregular outdoor exposure, and night operations. Adequate vitamin D (serum 25-OH vitamin D of 40-60 ng/mL) supports testosterone production, immune function, bone health, and mood regulation. Supplementation of 2,000-5,000 IU D3 daily (with K2 for vascular protection) is widely recommended by integrative and functional medicine practitioners for those with limited sun exposure. Get levels tested annually.", link:"https://pubmed.ncbi.nlm.nih.gov/27750060/" },
  { title:"Aerobic Base", text:"The aerobic energy system is the foundation beneath everything else — it fuels recovery between sets, between intervals, and between duty days. Building it requires consistent low-intensity work: Zone 2 (conversational pace, 60-70% max HR) for 150-180 minutes per week. The adaptation is mitochondrial — you are literally building more cellular energy factories. This takes 6-12 weeks of consistent training to see significant improvement, but the benefits are durable and compound over years.", link:"https://pubmed.ncbi.nlm.nih.gov/29340679/" },
  { title:"Posture Correction", text:"Chin tucks (gently draw chin straight back, not down) reverse the 'forward head posture' that develops from cockpit and screen time. For every inch the head moves forward from the neutral spine position, effective head weight on the cervical spine increases by 10 lbs. A 3-inch forward head posture (common in pilots) means 30+ extra lbs of cervical load constantly. 10 chin tucks per hour during screen use, combined with thoracic extension work, is an effective rehabilitation protocol.", link:"https://pubmed.ncbi.nlm.nih.gov/22577198/" },
  { title:"Training Volume", text:"Progressive overload — systematically increasing volume, intensity, or density over time — is the single non-negotiable principle of strength adaptation. The nervous system and muscle tissue only adapt to stimuli that exceed their current capacity. A structured approach: add one rep to each set before increasing weight. When all sets hit the top of the target rep range, add 2.5-5 lbs. This 'double progression' method is highly effective for intermediate trainees and produces consistent, trackable gains.", link:"https://pubmed.ncbi.nlm.nih.gov/28834797/" },
  { title:"Cognitive Load", text:"Even mild dehydration (1-2% body weight loss) measurably impairs working memory, attention, and psychomotor speed in healthy adults — the exact cognitive domains most critical in aviation. Critically, thirst perception lags behind physiological need, especially in air-conditioned environments and with age. Pilots over 40 have reduced thirst sensitivity. The takeaway: drink on a schedule, not on thirst. The 0.3L/flight hour guideline exists precisely because the internal signal cannot be trusted.", link:"https://pubmed.ncbi.nlm.nih.gov/21736786/" },
  { title:"Fasting Benefits", text:"Time-restricted eating (TRE) — compressing caloric intake into a 8-10 hour window — reduces oxidative stress, improves insulin sensitivity, and appears to support circadian alignment in shift workers. It doesn't require caloric restriction — the benefits emerge from the fasting period itself (autophagy upregulation, AMPK activation, reduced overnight insulin). For pilots: a 10am-8pm eating window on most days captures most benefits without requiring rigid restriction during duty days.", link:"https://pubmed.ncbi.nlm.nih.gov/31777947/" },
  { title:"Posture Reset", text:"The hip hinge is the most fundamental protective movement pattern for the lower back. Every time you pick something up off the floor — bags, boxes, gear — the choice is between a hip hinge (load through the posterior chain, spine neutral) and a lumbar flexion bend (load through the disc-annular complex). Over a career, this choice made thousands of times is the difference between a healthy spine at 60 and a chronic pain condition. Practice the pattern deliberately until it becomes reflex.", link:"https://pubmed.ncbi.nlm.nih.gov/21224706/" },
  { title:"Post-Flight Snack", text:"The 30-60 minute window post-exercise is when muscle protein synthesis and glycogen resynthesis rates are maximally elevated. A post-workout snack of 20-40g protein + 30-50g carbohydrate maximizes both. Practical options requiring no preparation: Greek yogurt + banana, chocolate milk, protein shake + fruit. For pilots finishing a late flight: this window also applies to the post-duty physiological stress response — protein intake supports recovery even when exercise itself was limited.", link:"https://pubmed.ncbi.nlm.nih.gov/23360586/" },
  { title:"Breathing SOP", text:"Nasal breathing has measurable physiological advantages over mouth breathing: it filters and humidifies air, produces nitric oxide (which dilates airways and blood vessels), increases CO2 tolerance (which paradoxically improves O2 delivery to tissues), and activates the diaphragm more fully. During low-to-moderate intensity exercise, nasal-only breathing is achievable with practice and has been associated with lower heart rate at equivalent workloads and improved respiratory efficiency.", link:"https://pubmed.ncbi.nlm.nih.gov/31087013/" },
  { title:"The Flare", text:"Physical readiness is not separate from professional performance — it is a component of it. Cardiovascular fitness correlates with cognitive reserve under load. Strength correlates with metabolic health markers that affect energy, mood, and recovery. Sleep quality — heavily influenced by exercise and nutrition — determines next-day decision-making capacity. Every training session is an investment in the instrument rated pilot: you. The aircraft has maintenance schedules. You should too.", link:"https://pubmed.ncbi.nlm.nih.gov/23907573/" },
  { title:"Sleep Strategy", text:"Complete darkness during sleep (blackout conditions) is associated with deeper slow-wave sleep and higher melatonin secretion. Even small amounts of light through closed eyelids activate retinal photoreceptors and reduce sleep depth. Hotel rooms rarely achieve true darkness. Solution: pack a quality sleep mask on every trip. Combined with earplugs or a white noise app and the 8-hours-pre-sleep caffeine cutoff, this three-intervention protocol has the highest evidence base for improving sleep quality in shift workers.", link:"https://pubmed.ncbi.nlm.nih.gov/21311168/" },
  { title:"Flexibility", text:"Consistency in mobility work produces compounding returns that intensity cannot replicate. Connective tissue (tendons, ligaments, fascia) responds to sustained, repeated low-load stretching over weeks and months — not to aggressive, infrequent sessions. 10 minutes of daily mobility work produces more functional range of motion in 8 weeks than 60-minute weekly sessions. The dose-response curve for flexibility favors frequency over duration dramatically.", link:"https://pubmed.ncbi.nlm.nih.gov/22030953/" },
  { title:"Strength Metric", text:"Tracking maximum weight lifted per exercise over time is the most direct measure of training effectiveness and the only way to confirm progressive overload is occurring. Without tracking, psychological bias leads most people to believe they are progressing when they are plateaued. Minimum tracking requirement: date, exercise, sets × reps, weight. This app does it automatically. Review your logs monthly — if any exercise hasn't progressed in 4 weeks, something needs to change: sleep, nutrition, programming, or effort.", link:"https://pubmed.ncbi.nlm.nih.gov/28834797/" },
  { title:"Recovery Metric", text:"Resting heart rate (RHR) measured upon waking — before getting out of bed — is a sensitive marker of autonomic nervous system status and recovery quality. A RHR elevated 5+ beats above your personal baseline indicates incomplete recovery: too much training, too little sleep, illness, or high stress. This is not a reason to push through — it is physiological data. Reduce training intensity or take a rest day. Tracking RHR via a wearable (Oura Ring, Garmin, Apple Watch) makes this effortless.", link:"https://pubmed.ncbi.nlm.nih.gov/28827680/" },
  { title:"Final SOP", text:"The goal is not a perfect week. It is a sustainable system. Consistency over 6-12 months outperforms any program, any supplement, or any single intervention by an order of magnitude. Your body adapts to the stimulus you give it consistently — not to the best effort you made once. A pilot who trains 3 days per week with moderate effort for a year will have better health outcomes than one who trains 6 days per week for 2 months then burns out. Build the system. Fly the system.", link:"https://pubmed.ncbi.nlm.nih.gov/30543830/" },
];

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function switchTab(tab) {
  ST.tab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  renderPage();
}

// ─── RENDER DISPATCH ──────────────────────────────────────────────────────────
function renderPage() {
  const p = document.getElementById('mainPage');
  p.innerHTML = '';
  if      (ST.tab === 'preflight') renderPreflight(p);
  else if (ST.tab === 'flight')    renderFlight(p);
  else if (ST.tab === 'trends')    renderTrends(p);
  else if (ST.tab === 'wisdom')    renderWisdom(p);
}

// ─── PREFLIGHT TAB ────────────────────────────────────────────────────────────
function renderPreflight(p) {
  const hs = hydroStatus();
  const def = hydroDeficit();
  const advice = hydroAdvice();
  const pct = hydroPct();
  const wk = W[ST.env]?.[ST.muscleGroup];

  // ── READINESS CHECK ──
  const canFly = ST.flightHrs > 0 && ST.waterIn >= 0;
  const hydroOk = pct >= 1;
  const profileOk = !!ST.muscleGroup;

  p.innerHTML = `
  <div class="section-label">PREFLIGHT BRIEFING</div>

  <!-- READINESS CHECKLIST -->
  <div class="card card-dark mb12">
    <div class="section-label" style="margin-top:0">READINESS CHECK</div>
    <div class="check-item">
      <div class="check-icon">${ST.flightHrs > 0 ? '✅' : '⬜'}</div>
      <div class="check-text">Flight hours logged today</div>
      <div class="check-status ${ST.flightHrs > 0 ? 'status-ok' : 'status-warn'}">${ST.flightHrs > 0 ? ST.flightHrs + ' HRS' : 'ENTER'}</div>
    </div>
    <div class="check-item">
      <div class="check-icon">${hydroOk ? '✅' : pct >= 0.6 ? '⚠️' : '🚨'}</div>
      <div class="check-text">Hydration status</div>
      <div class="check-status ${hs.cls}">${hs.label}</div>
    </div>
    <div class="check-item">
      <div class="check-icon">${profileOk ? '✅' : '⬜'}</div>
      <div class="check-text">Mission profile selected</div>
      <div class="check-status ${profileOk ? 'status-ok' : 'status-warn'}">${profileOk ? ST.muscleGroup.toUpperCase() : 'SELECT'}</div>
    </div>
    <div class="check-item" style="border-bottom:none">
      <div class="check-icon">${ST.env ? '✅' : '⬜'}</div>
      <div class="check-text">Environment configured</div>
      <div class="check-status status-ok">${ST.env === 'comm' ? 'COMM GYM' : ST.env === 'hotel' ? 'HOTEL GYM' : 'HOTEL ROOM'}</div>
    </div>
  </div>

  <!-- ENVIRONMENT -->
  <div class="section-label">MISSION ENVIRONMENT</div>
  <div class="env-toggle">
    <div class="env-btn ${ST.env==='room'?'sel':''}" onclick="setEnv('room')">
      <div class="ei">🛏️</div><div class="el">HOTEL ROOM</div>
    </div>
    <div class="env-btn ${ST.env==='hotel'?'sel':''}" onclick="setEnv('hotel')">
      <div class="ei">🏨</div><div class="el">HOTEL GYM</div>
    </div>
    <div class="env-btn ${ST.env==='comm'?'sel':''}" onclick="setEnv('comm')">
      <div class="ei">🏋️</div><div class="el">COMM GYM</div>
    </div>
  </div>

  <!-- HYDRATION -->
  <div class="section-label">HYDRATION PAYLOAD</div>
  <div class="card mb12">
    <div class="field-row" style="margin-bottom:10px">
      <div class="field" style="margin-bottom:0">
        <label>Flight Hours Today</label>
        <input type="number" inputmode="decimal" step="0.5" min="0" max="16" value="${ST.flightHrs||''}" placeholder="e.g. 4.5"
          oninput="ST.flightHrs=parseFloat(this.value)||0;refreshPreflight()">
      </div>
      <div class="field" style="margin-bottom:0">
        <label>Water Consumed (L)</label>
        <input type="number" inputmode="decimal" step="0.1" min="0" max="10" value="${ST.waterIn||''}" placeholder="e.g. 1.2"
          oninput="ST.waterIn=parseFloat(this.value)||0;refreshPreflight()">
      </div>
    </div>
    <div class="fb" style="margin-bottom:6px">
      <span style="font-family:var(--mono);font-size:11px;color:var(--muted)">TARGET: <span style="color:var(--text)">${hydroTarget().toFixed(1)}L</span></span>
      <span style="font-family:var(--mono);font-size:11px;color:${hs.color}">${hs.label}</span>
    </div>
    <div class="hydro-bar-wrap">
      <div class="hydro-bar ${hydroOk?'hydro-ok':'hydro-warn'}" style="width:${Math.round(pct*100)}%"></div>
    </div>
    <div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:4px;text-align:right">${Math.round(pct*100)}% of daily target</div>
    ${advice ? `<div class="alert alert-warn mt8"><div class="alert-icon">💧</div><div>${advice}</div></div>` : `<div class="alert alert-ok mt8"><div class="alert-icon">✅</div><div>Hydration nominal. You are cleared for workout operations.</div></div>`}
  </div>

  <!-- MISSION PROFILE -->
  <div class="section-label">MISSION PROFILE — MUSCLE GROUP</div>
  <div class="mg-wrap">
    ${MUSCLE_GROUPS.map(mg => `<div class="mg-pill ${ST.muscleGroup===mg?'sel':''}" onclick="setMG('${mg}')">${mg}</div>`).join('')}
  </div>

  <!-- FLIGHT PLAN PREVIEW -->
  ${wk ? `
  <div class="card card-dark mb12">
    <div class="section-label" style="margin-top:0">FLIGHT PLAN PREVIEW</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${[['🚕 TAXI',wk.taxi],['🛫 TAKEOFF',wk.takeoff],['✈️ EN ROUTE',wk.enroute],['🛬 LANDING',wk.landing]].map(([label,exs])=>`
      <div style="background:var(--bg);border-radius:8px;padding:10px">
        <div style="font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:0.08em;margin-bottom:6px">${label}</div>
        ${exs.map(e=>`<div style="font-size:11px;color:var(--text);margin-bottom:2px">· ${e.name}</div>`).join('')}
      </div>`).join('')}
    </div>
  </div>
  <button class="btn btn-gold" onclick="engageWorkout()">⚡ ENGAGE WORKOUT</button>
  ` : `<div class="alert alert-info"><div class="alert-icon">ℹ️</div><div>Select a mission profile above to generate your flight plan.</div></div>`}
  `;
}

function refreshPreflight() { if (ST.tab === 'preflight') renderPreflight(document.getElementById('mainPage')); }
function setEnv(env) { ST.env = env; ST.workout = null; refreshPreflight(); }
function setMG(mg) { ST.muscleGroup = mg; ST.workout = null; refreshPreflight(); }

function engageWorkout() {
  const wk = W[ST.env]?.[ST.muscleGroup];
  if (!wk) return;
  ST.workout = wk;
  ST.sets = {};
  ST.expanded = {};
  // Initialize set data
  const allEx = [...wk.taxi, ...wk.takeoff, ...wk.enroute, ...wk.landing];
  allEx.forEach(ex => {
    if (ex.timed) {
      ST.sets[ex.id] = [{ seconds: '' }];
    } else {
      ST.sets[ex.id] = Array.from({ length: ex.sets }, () => ({ reps: '', weight: '' }));
    }
  });
  switchTab('flight');
}

// ─── FLIGHT TAB ───────────────────────────────────────────────────────────────
const PHASES = [
  { key: 'taxi',    label: 'TAXI',     sub: 'Mobilization — Pilot Protocol warmup',        icon: '🚕', cls: 'phase-taxi'    },
  { key: 'takeoff', label: 'TAKEOFF',  sub: 'Primary compound — the heavy work',            icon: '🛫', cls: 'phase-takeoff' },
  { key: 'enroute', label: 'EN ROUTE', sub: 'Secondary movements — volume and hypertrophy', icon: '✈️', cls: 'phase-enroute' },
  { key: 'landing', label: 'LANDING',  sub: 'Descent — decompression and CNS down-reg',    icon: '🛬', cls: 'phase-landing' },
];

function renderFlight(p) {
  if (!ST.workout) {
    p.innerHTML = `
      <div class="alert alert-info mt16"><div class="alert-icon">ℹ️</div>
      <div>No active flight plan. Go to <strong>Preflight</strong> to configure and engage your workout.</div></div>
      <button class="btn btn-outline mt12" onclick="switchTab('preflight')">← Go to Preflight</button>`;
    return;
  }

  const wk = ST.workout;
  const allEx = [...wk.taxi, ...wk.takeoff, ...wk.enroute, ...wk.landing];
  const done = allEx.filter(ex => {
    const s = ST.sets[ex.id];
    if (!s) return false;
    return s.some(x => x.reps || x.weight || x.seconds);
  }).length;
  const pct = Math.round(done / allEx.length * 100);

  let html = `
  <div class="section-label">ACTIVE FLIGHT — ${ST.muscleGroup.toUpperCase()}</div>
  <div class="card card-dark mb12">
    <div class="fb mb8">
      <span style="font-family:var(--mono);font-size:11px;color:var(--muted)">MISSION PROGRESS</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--gold)">${done}/${allEx.length} EXERCISES</span>
    </div>
    <div class="prog-wrap"><div class="prog-fill" style="width:${pct}%"></div></div>
    <div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:4px;text-align:right">${pct}% complete</div>
  </div>`;

  PHASES.forEach(phase => {
    const exercises = wk[phase.key];
    if (!exercises || !exercises.length) return;
    html += `
    <div class="phase-header">
      <div class="phase-badge ${phase.cls}">${phase.icon} ${phase.label}</div>
      <div><div class="phase-title">${phase.sub}</div></div>
    </div>`;
    exercises.forEach(ex => {
      html += renderExCard(ex, phase);
    });
  });

  html += `<div style="height:16px"></div><button class="btn btn-green" onclick="secureFlight()">🔒 SECURE FLIGHT</button>`;
  p.innerHTML = html;
}

function renderExCard(ex, phase) {
  const isOpen = !!ST.expanded[ex.id];
  const sets = ST.sets[ex.id] || [];
  const hasData = sets.some(s => s.reps || s.weight || s.seconds);

  let bodyHTML = '';
  if (isOpen) {
    if (ex.timed) {
      const val = sets[0]?.seconds || '';
      bodyHTML = `
      <div class="ex-body">
        <p class="ex-note">${ex.note}</p>
        <div class="timed-box ${val?'ok':''}" id="tb_${ex.id}">
          <div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:0.08em;margin-bottom:8px">TOTAL TIME</div>
          <input class="timed-inp" type="number" inputmode="numeric" placeholder="0" value="${val}"
            oninput="ST.sets['${ex.id}'][0].seconds=this.value;document.getElementById('tb_${ex.id}').className='timed-box'+(this.value?' ok':'')">
          <div style="font-size:11px;color:var(--muted);margin-top:6px">seconds</div>
        </div>
        <button class="btn-info" onclick="showModal('${ex.id}')">ℹ Guide</button>
      </div>`;
    } else {
      const sHTML = sets.map((s, i) => `
        <div class="set-tile ${s.reps||s.weight?'ok':''}" id="st_${ex.id}_${i}">
          <div class="set-lbl">SET ${i+1}</div>
          <input class="set-inp" type="number" inputmode="numeric" placeholder="Reps" value="${s.reps||''}"
            oninput="ST.sets['${ex.id}'][${i}].reps=this.value;document.getElementById('st_${ex.id}_${i}').className='set-tile'+(this.value||ST.sets['${ex.id}'][${i}].weight?'ok':'')">
          <input class="set-inp" type="number" inputmode="decimal" placeholder="lb" value="${s.weight||''}"
            oninput="ST.sets['${ex.id}'][${i}].weight=this.value;document.getElementById('st_${ex.id}_${i}').className='set-tile'+(ST.sets['${ex.id}'][${i}].reps||this.value?'ok':'')">
          <div class="set-hint">reps / lb</div>
        </div>`).join('');
      bodyHTML = `
      <div class="ex-body">
        <p class="ex-note">${ex.note}</p>
        <div class="sets-scroll">${sHTML}</div>
        <div class="swipe-hint">← swipe for all sets</div>
        <div style="margin-top:10px"><button class="btn-info" onclick="showModal('${ex.id}')">ℹ Guide</button></div>
      </div>`;
    }
  }

  return `
  <div class="ex-card">
    <div class="ex-hdr" onclick="toggleEx('${ex.id}')">
      <div>
        <div class="ex-name">${ex.name}</div>
        <div class="ex-target">${ex.target}${ex.timed?' · ⏱ TIMED':''}</div>
      </div>
      <div class="ex-right">
        <div class="ex-done ${hasData?'ok':''}">${hasData?'✓':''}</div>
        <div class="ex-caret ${isOpen?'open':''}">⌄</div>
      </div>
    </div>
    ${bodyHTML}
  </div>`;
}

function toggleEx(id) {
  ST.expanded[id] = !ST.expanded[id];
  renderFlight(document.getElementById('mainPage'));
}

async function secureFlight() {
  const wk = ST.workout;
  if (!wk) return;
  const allEx = [...wk.taxi, ...wk.takeoff, ...wk.enroute, ...wk.landing];
  const logged = allEx.filter(ex => ST.sets[ex.id]?.some(s => s.reps || s.weight || s.seconds));
  if (logged.length === 0) {
    alert('No sets logged. Log at least one exercise before securing.');
    return;
  }
  const session = {
    date: new Date().toISOString(),
    env: ST.env,
    muscle_group: ST.muscleGroup,
    sets: ST.sets,
    flight_hrs: ST.flightHrs,
    water_in: ST.waterIn,
  };
  try {
    const { error } = await SB.from('workout_sessions').insert([{
      session_key: String(Date.now()),
      session_data: session,
      workout_key: ST.muscleGroup,
    }]);
    if (error) throw error;
    showToast('✅ Flight secured. Well done.');
  } catch(e) {
    showToast('⚠️ Saved locally (DB offline).');
    const key = 'fcf_session_' + Date.now();
    localStorage.setItem(key, JSON.stringify(session));
  }
  ST.workout = null;
  ST.sets = {};
  switchTab('preflight');
}

// ─── MODAL / GUIDE ────────────────────────────────────────────────────────────
const EXRX = {
  'to_squat': 'https://exrx.net/WeightExercises/Quadriceps/BBSquat',
  'to_rdl':   'https://exrx.net/WeightExercises/OlympicLifts/RomanianDeadlift',
  'er_bss':   'https://exrx.net/WeightExercises/Quadriceps/DBBulgarianSquat',
  'er_lgpress':'https://exrx.net/WeightExercises/Quadriceps/LVLegPress',
  'to_bench': 'https://exrx.net/WeightExercises/PectoralSternal/BBBenchPress',
  'to_ohp':   'https://exrx.net/WeightExercises/DeltoidAnterior/BBMilitaryPress',
  'to_dead':  'https://exrx.net/WeightExercises/ErectorSpinae/BBDeadlift',
  'to_barrow':'https://exrx.net/WeightExercises/BackGeneral/BBBentOverRow',
  'er_latpd': 'https://exrx.net/WeightExercises/LatissimusDorsi/CBFrontPulldown',
  'er_cabrow':'https://exrx.net/WeightExercises/BackGeneral/CBSeatedRow',
  'er_facepull':'https://exrx.net/WeightExercises/DeltoidPosterior/CBFacePull',
  'to_boxjump':'https://exrx.net/Plyometrics/BoxJump',
  'to_tbdl':  'https://exrx.net/WeightExercises/GluteusMaximus/TBDeadlift',
};

function showModal(exId) {
  const allEx = ST.workout ? [...ST.workout.taxi,...ST.workout.takeoff,...ST.workout.enroute,...ST.workout.landing] : [];
  const ex = allEx.find(e => e.id === exId);
  if (!ex) return;
  const link = EXRX[exId];
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
  <div class="modal-bg" onclick="if(event.target===this)closeModal()">
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">${ex.name}</div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--gold);margin-bottom:12px;letter-spacing:0.08em">${ex.target}</div>
      <div class="modal-body">${ex.note}</div>
      ${link ? `<a class="modal-link" href="${link}" target="_blank" rel="noopener">📹 View Exercise on ExRx.net →</a>` : ''}
      <button class="btn btn-outline mt12" onclick="closeModal()">CLOSE</button>
    </div>
  </div>`;
}
function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }

// ─── TRENDS TAB ───────────────────────────────────────────────────────────────
function renderTrends(p) {
  p.innerHTML = `
  <div class="section-label">BIOMETRICS — LOG & TRENDS</div>

  <!-- HOW TO COLLECT -->
  <div class="card card-dark mb12">
    <div class="section-label" style="margin-top:0">DATA COLLECTION PROTOCOL</div>
    <div class="check-item">
      <div class="check-icon">⚖️</div>
      <div><div class="check-text" style="font-weight:600">Body Weight</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">Same scale, same time daily. Upon waking, after restroom, before eating or drinking. Use 7-day rolling average — daily fluctuations of 2-4 lbs are normal.</div></div>
    </div>
    <div class="check-item">
      <div class="check-icon">📏</div>
      <div><div class="check-text" style="font-weight:600">Waist Circumference</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">At the umbilicus (navel), end of normal exhale. Do not suck in. Once per week, same time. &lt;40 in (men) is the clinical threshold for metabolic risk.</div></div>
    </div>
    <div class="check-item">
      <div class="check-icon">🩺</div>
      <div><div class="check-text" style="font-weight:600">Blood Pressure</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">5 minutes of quiet rest first. Sit with back supported, feet flat, arm at heart level. No talking. Take 3 readings, 1-2 min apart — record the average of the last two. Optimal: &lt;120/80 mmHg.</div></div>
    </div>
    <div class="check-item" style="border-bottom:none">
      <div class="check-icon">🔬</div>
      <div><div class="check-text" style="font-weight:600">Fasting Glucose</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">Upon waking, before any food or coffee. 8+ hours fasted. Normal: 70-99 mg/dL. Pre-diabetic: 100-125. Diabetic: 126+. Measure weekly for trend data.</div></div>
    </div>
  </div>

  <!-- LOG ENTRY -->
  <div class="section-label">LOG TODAY'S DATA</div>
  <div class="card mb12">
    <div class="field-row" style="margin-bottom:10px">
      <div class="field" style="margin-bottom:0">
        <label>Weight (lb)</label>
        <input type="number" inputmode="decimal" id="inp_wt" placeholder="e.g. 232">
      </div>
      <div class="field" style="margin-bottom:0">
        <label>Waist (in)</label>
        <input type="number" inputmode="decimal" id="inp_waist" placeholder="e.g. 38.5">
      </div>
    </div>
    <div class="field-row" style="margin-bottom:10px">
      <div class="field" style="margin-bottom:0">
        <label>Systolic BP</label>
        <input type="number" inputmode="numeric" id="inp_sys" placeholder="e.g. 122">
      </div>
      <div class="field" style="margin-bottom:0">
        <label>Diastolic BP</label>
        <input type="number" inputmode="numeric" id="inp_dia" placeholder="e.g. 78">
      </div>
    </div>
    <div class="field" style="margin-bottom:12px">
      <label>Fasting Glucose (mg/dL)</label>
      <input type="number" inputmode="numeric" id="inp_gluc" placeholder="e.g. 95">
    </div>
    <button class="btn btn-gold" onclick="saveBio()">LOG DATA</button>
  </div>

  <!-- CHARTS -->
  <div class="section-label">TRENDS</div>
  <div class="card mb8">
    <div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-bottom:6px">BODY WEIGHT (lb)</div>
    <div class="chart-wrap"><canvas id="chartWt"></canvas></div>
  </div>
  <div class="card mb8">
    <div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-bottom:6px">WAIST CIRCUMFERENCE (in)</div>
    <div class="chart-wrap"><canvas id="chartWaist"></canvas></div>
  </div>
  <div class="card mb8">
    <div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-bottom:6px">BLOOD PRESSURE (mmHg)</div>
    <div class="chart-wrap"><canvas id="chartBP"></canvas></div>
  </div>
  <div class="card mb8">
    <div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-bottom:6px">FASTING GLUCOSE (mg/dL)</div>
    <div class="chart-wrap"><canvas id="chartGluc"></canvas></div>
  </div>`;

  loadAndDrawCharts();
}

async function saveBio() {
  const wt    = parseFloat(document.getElementById('inp_wt')?.value);
  const waist = parseFloat(document.getElementById('inp_waist')?.value)||null;
  const sys   = parseInt(document.getElementById('inp_sys')?.value)||null;
  const dia   = parseInt(document.getElementById('inp_dia')?.value)||null;
  const gluc  = parseInt(document.getElementById('inp_gluc')?.value)||null;

  if (!wt && !waist && !sys && !gluc) {
    showToast('Enter at least one value to log.');
    return;
  }

  const row = {
    weight_lb:      wt||null,
    waist_in:       waist,
    systolic_bp:    sys,
    diastolic_bp:   dia,
    fasting_glucose:gluc,
  };

  try {
    const { error } = await SB.from('weight_log').insert([row]);
    if (error) throw error;
    showToast('✅ Biometrics recorded.');
  } catch(e) {
    showToast('⚠️ Saved locally.');
    const local = JSON.parse(localStorage.getItem('fcf_bio')||'[]');
    local.push({ ...row, logged_at: new Date().toISOString() });
    localStorage.setItem('fcf_bio', JSON.stringify(local));
  }
  loadAndDrawCharts();
}

async function loadAndDrawCharts() {
  let data = [];
  try {
    const { data: d } = await SB.from('weight_log').select('*').order('logged_at', { ascending: true });
    data = d || [];
  } catch(e) {
    data = JSON.parse(localStorage.getItem('fcf_bio')||'[]');
  }

  if (!data.length) return;

  const labels = data.map(d => new Date(d.logged_at).toLocaleDateString('en-US', { month:'short', day:'numeric' }));
  const CHART_DEFAULTS = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: '#1a2438' }, ticks: { font: { size: 9, family: 'Share Tech Mono' }, color: '#64748b', maxRotation: 45 } },
      y: { grid: { color: '#1a2438' }, ticks: { font: { size: 9, family: 'Share Tech Mono' }, color: '#64748b' } },
    }
  };

  function makeChart(id, dataArr, color, refLine) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const key = 'chart_' + id;
    if (ST.chartInst[key]) ST.chartInst[key].destroy();
    const datasets = [{ data: dataArr, borderColor: color, backgroundColor: color+'22', tension: 0.35, fill: true, pointRadius: 4, pointBackgroundColor: color }];
    if (refLine) datasets.push({ data: dataArr.map(() => refLine.val), borderColor: refLine.color, borderDash: [5,3], pointRadius: 0, fill: false, label: refLine.label });
    ST.chartInst[key] = new Chart(canvas.getContext('2d'), {
      type: 'line', data: { labels, datasets },
      options: { ...CHART_DEFAULTS, plugins: { legend: { display: !!refLine } } }
    });
  }

  makeChart('chartWt',    data.map(d => d.weight_lb),       '#3b82f6', { val: null });
  makeChart('chartWaist', data.map(d => d.waist_in),        '#c9a84c', { val: 40, color: '#ef4444', label: 'Risk Threshold (40in)' });
  makeChart('chartGluc',  data.map(d => d.fasting_glucose), '#22c55e', { val: 100, color: '#f59e0b', label: 'Pre-diabetic (100)' });

  // BP dual-line
  const bpCanvas = document.getElementById('chartBP');
  if (bpCanvas) {
    if (ST.chartInst['chart_chartBP']) ST.chartInst['chart_chartBP'].destroy();
    ST.chartInst['chart_chartBP'] = new Chart(bpCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Systolic', data: data.map(d => d.systolic_bp), borderColor: '#ef4444', backgroundColor: '#ef444422', tension: 0.35, fill: false, pointRadius: 4, pointBackgroundColor: '#ef4444' },
          { label: 'Diastolic', data: data.map(d => d.diastolic_bp), borderColor: '#f59e0b', backgroundColor: '#f59e0b22', tension: 0.35, fill: false, pointRadius: 4, pointBackgroundColor: '#f59e0b' },
          { label: 'Systolic Target', data: data.map(() => 120), borderColor: '#ef444466', borderDash: [4,3], pointRadius: 0, fill: false },
          { label: 'Diastolic Target', data: data.map(() => 80), borderColor: '#f59e0b66', borderDash: [4,3], pointRadius: 0, fill: false },
        ]
      },
      options: { ...CHART_DEFAULTS, plugins: { legend: { display: true, labels: { font: { size: 9, family: 'Share Tech Mono' }, color: '#64748b' } } } }
    });
  }
}

// ─── WISDOM TAB ───────────────────────────────────────────────────────────────
function renderWisdom(p) {
  const card = WISDOM[ST.wisdomIdx];
  p.innerHTML = `
  <div class="section-label">FLIGHT DECK WISDOM</div>
  <div class="wisdom-card">
    <div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--gold);letter-spacing:0.1em;margin-bottom:12px">
        BRIEFING ${String(ST.wisdomIdx+1).padStart(2,'0')} / ${WISDOM.length}
      </div>
      <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:14px">${card.title}</div>
      <div style="font-size:13px;line-height:1.8;color:#94a3b8">${card.text}</div>
    </div>
    <div>
      <a class="modal-link" href="${card.link}" target="_blank" rel="noopener">
        📖 Read the research →
      </a>
    </div>
  </div>
  <div class="wisdom-counter">${ST.wisdomIdx+1} of ${WISDOM.length}</div>
  <div class="wisdom-nav">
    <button class="btn btn-outline" onclick="ST.wisdomIdx=(ST.wisdomIdx-1+${WISDOM.length})%${WISDOM.length};renderWisdom(document.getElementById('mainPage'))">← PREV</button>
    <button class="btn btn-outline" onclick="ST.wisdomIdx=(ST.wisdomIdx+1)%${WISDOM.length};renderWisdom(document.getElementById('mainPage'))">NEXT →</button>
  </div>
  <div style="margin-top:16px">
    <div class="section-label">JUMP TO TOPIC</div>
    <div class="mg-wrap">
      ${WISDOM.map((w,i) => `<div class="mg-pill ${i===ST.wisdomIdx?'sel':''}" onclick="ST.wisdomIdx=${i};renderWisdom(document.getElementById('mainPage'))" style="font-size:11px">${w.title}</div>`).join('')}
    </div>
  </div>`;
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1a2438;border:1px solid #1e2d45;color:#e2e8f0;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:500;z-index:999;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,0.5)';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ─── DB STATUS ────────────────────────────────────────────────────────────────
async function checkDB() {
  try {
    await SB.from('weight_log').select('id').limit(1);
    document.getElementById('dbDot').className = 'status-dot';
    document.getElementById('dbStatus').textContent = 'SYNCED';
  } catch(e) {
    document.getElementById('dbDot').className = 'status-dot off';
    document.getElementById('dbStatus').textContent = 'LOCAL';
  }
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
window.onload = () => {
  renderPage();
  checkDB();
};
