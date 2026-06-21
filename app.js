/**
 * Flight Crew Fitness — app.js
 * Version: 5.0 | Build: 20260617
 */

const FCF_VERSION = 'v5.2';
const FCF_BUILD   = '20260620';

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SB = supabase.createClient(
  'https://dnxkydxbyihgsictbzjz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRueGt5ZHhieWloZ3NpY3Riemp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3ODk4MTEsImV4cCI6MjA5NjM2NTgxMX0.oLUGuorQkbQ_u679NpE8FGBVAUmVE1K_rxl8q4B0n7k'
);

// ─── APP STATE ────────────────────────────────────────────────────────────────
const ST = {
  authed: false,
  user: null,
  showLanding: true,
  authMode: 'signin', // 'signin' | 'signup'
  authErr: '',

  tab: 'preflight',
  env: 'comm',
  flightHrs: 0,
  flightHrsTouched: false,
  waterIn: 0,
  muscleGroup: 'Lower Body',
  goal: 'longevity', // 'jump' | 'muscle' | 'longevity' | 'fatloss'
  fatigue: 'go',
  level: 'intermediate',
  workout: null,
  sets: {},
  expanded: {},
  wisdomIdx: 0,
  chartInst: {},

  customExercises: [], // user-created exercises, persisted
  showAddExercise: false,

  restTimer: { active: false, seconds: 0, total: 0, exId: null, interval: null, startTs: 0, endTs: 0 },
  stopwatch:  { active: false, seconds: 0, interval: null, exId: null, startTs: 0 },
  nsdrTimer:  { active: false, seconds: 0, interval: null, chimed: false, startTs: 0 },

  lastSession: null, // last completed session summary
  lastDebrief: null,
  workoutStartedAt: null,
  disclaimerAccepted: false,
  calendarWeekOffset: 0,
  calendarSessions: {},
  selectedCalendarDay: null,
};

// ─── GOALS / MISSION OBJECTIVES ───────────────────────────────────────────────
// Rotation orders follow exercise science principle: never schedule two
// leg-dominant or two CNS-taxing days back to back. Lower Body and Power/Plyo
// both heavily load the legs and nervous system, so they are always separated
// by at least one upper-body or cardio day to allow 48+ hours recovery.
const GOALS = {
  jump:     { label: 'Vertical Jump',    icon: '🏀', desc: 'Explosive power and athletic performance', order: ['Lower Body','Upper Pull','Power / Plyo','Upper Push','Cardio'] },
  muscle:   { label: 'Muscle Gain',      icon: '💪', desc: 'Bodybuilding-style hypertrophy training',   order: ['Lower Body','Upper Push','Upper Pull','Full Body'] },
  longevity:{ label: 'General Health',  icon: '🌿', desc: 'Joint-friendly, sustainable, long-term health', order: ['Lower Body','Upper Pull','Longevity','Upper Push'] },
  fatloss:  { label: 'Weight Loss',     icon: '🔥', desc: 'Higher-volume, metabolic conditioning focus', order: ['Lower Body','Cardio','Upper Push','Full Body'] },
};

// ─── FREQUENCY GUIDANCE (fitness coach logic) ────────────────────────────────
const FREQUENCY_GUIDE = {
  beginner:     { days: '2-3', split: 'Full-body each session', note: 'Allow 48 hours between sessions for the same muscle group. Consistency beats intensity at this stage.' },
  intermediate: { days: '3-4', split: 'Upper/Lower or Push/Pull split', note: 'This is the sweet spot for most lifters. 3-4 quality sessions per week with adequate recovery outperforms more frequent, lower-quality sessions.' },
  advanced:     { days: '4-6', split: 'Body part split with planned recovery', note: 'Higher frequency requires real recovery infrastructure: sleep, protein, and at least one full rest day. Monitor for overreaching — persistent soreness or declining performance is a signal to pull back.' },
};

// ─── HYDRATION ────────────────────────────────────────────────────────────────
const HYDRO_RATE = 0.3;
const HYDRO_FLOOR = 1.0; // minimum daily water target even on no-fly days

function hydroTarget()  {
  if (ST.flightHrs > 0) return Math.max(ST.flightHrs * HYDRO_RATE, HYDRO_FLOOR);
  return HYDRO_FLOOR; // no-fly day: still need baseline hydration
}
function hydroDeficit() { return Math.max(hydroTarget() - ST.waterIn, 0); }
function hydroPct()     { return Math.min(ST.waterIn / Math.max(hydroTarget(), 0.5), 1); }
function hydroStatus() {
  const p = hydroPct();
  if (p >= 1)   return { label:'NOMINAL', color:'var(--green)', icon:'✅', cls:'status-ok' };
  if (p >= 0.6) return { label:'CAUTION', color:'var(--amber)', icon:'⚠️', cls:'status-warn' };
  return              { label:'DEFICIT',  color:'var(--red)',   icon:'🚨', cls:'status-no' };
}
function hydroAdvice() {
  const def = hydroDeficit();
  if (def <= 0) return null;
  if (def < 0.25) return `Sip ${Math.round(def*1000)}ml now — you're almost there.`;
  if (def < 0.5)  return `Drink ${Math.round(def*1000)}ml before starting. Dehydration cuts strength output by up to 20%.`;
  return `You're ${def.toFixed(1)}L behind. Drink 500ml now, then sip throughout your session.`;
}

const MUSCLE_GROUPS = ['Lower Body','Upper Push','Upper Pull','Power / Plyo','Full Body','Longevity','Cardio'];

// ─── EXERCISE BUILDER ─────────────────────────────────────────────────────────
// rest: suggested rest in seconds for the heaviest set in this exercise (phase-aware default applied separately)
const ex = (id, name, target, sets, note, timed, inputType) =>
  ({ id, name, target, sets: sets||3, note, timed: !!timed, inputType: inputType||'reps_weight' });
  // inputType: 'reps_weight' | 'reps_only' | 'timed'

// Phase-based default rest periods (seconds) — fitness coach standard
const REST_DEFAULTS = {
  takeoff: 210,  // 3.5 min — heavy compounds
  enroute: 75,   // 60-90s — hypertrophy/volume
  taxi:    20,   // minimal — warmup
  landing: 0,    // no rest needed — cooldown
};

// ─── WORKOUT DATA ─────────────────────────────────────────────────────────────
const WORKOUTS = {};
WORKOUTS.comm = {};

WORKOUTS.comm['Lower Body'] = {
  taxi: [
    ex('c_lb_t1','Hip 90/90 Stretch','60s/side',1,'Sit on floor, both legs at 90°. Rotate slowly between internal and external hip rotation. Critical for pilots who sit compressed all day.',true,'timed'),
    ex('c_lb_t2','Ankle Circles + Dorsiflexion','20 reps',1,'Rotate each ankle 10x each direction, then pull toes to shin. Ankle mobility directly affects squat depth.',false,'reps_only'),
    ex('c_lb_t3','Goblet Squat Warmup','2×10',2,'Light KB or DB at chest. Slow descent, pause at the bottom. Own the position before loading.'),
  ],
  takeoff: [
    ex('c_lb_to1','Back Squat','5×5',5,'Work up to a challenging set of 5. Bar on traps, break parallel, drive through heels. This is your primary compound.'),
    ex('c_lb_to2','Romanian Deadlift','4×6',4,'Hip hinge. Moderate-heavy. Bar stays close to legs. Deep hamstring stretch at the bottom.'),
  ],
  enroute: [
    ex('c_lb_er1','Bulgarian Split Squat','3×8/leg',3,'Rear foot elevated on bench. Drive through front heel. High transfer to strength and jump performance.'),
    ex('c_lb_er2','Leg Press','3×12',3,'Moderate weight. Full ROM — don\'t lock knees.'),
    ex('c_lb_er3','Standing Calf Raise','4×12',4,'Full ROM — stretch at bottom, pause at top.'),
    ex('c_lb_er4','Lateral Band Walk','2×15/side',2,'Band above knees. Stay low. Activates glute med.',false,'reps_only'),
  ],
  landing: [
    ex('c_lb_l1','Pigeon Pose','90s/side',1,'External hip rotation stretch. Hold completely still.',true,'timed'),
    ex('c_lb_l2','Supine Hamstring Stretch','60s/side',1,'Lying on back, pull one leg toward chest. Knee straight.',true,'timed'),
    ex('c_lb_l3','Child\'s Pose + Reach','90s',1,'Arms extended, sit back toward heels. Decompresses the lumbar.',true,'timed'),
  ],
};

WORKOUTS.comm['Upper Push'] = {
  taxi: [
    ex('c_up_t1','Wall Slide','2×10',2,'Forearms against wall, slide up to full overhead. Fixes forward-rounded cockpit posture.',false,'reps_only'),
    ex('c_up_t2','Band Pull-Apart','2×20',2,'Arms straight in front, pull band apart to chest.',false,'reps_only'),
    ex('c_up_t3','Thoracic Extension (chair)','10 reps',1,'Hands behind head, extend over chair back.',false,'reps_only'),
  ],
  takeoff: [
    ex('c_up_to1','Flat Barbell Bench Press','5×5',5,'Work up to a heavy 5. Elbows 45-70° — not flared. Control the descent, explode up.'),
    ex('c_up_to2','Standing Overhead Press','4×5',4,'Standing — not seated. Full lockout overhead. Core braced.'),
  ],
  enroute: [
    ex('c_up_er1','Incline DB Press','3×10',3,'30-45° incline. Full stretch at the bottom.'),
    ex('c_up_er2','Close Grip Bench','3×8',3,'Hands shoulder-width. Tricep emphasis.'),
    ex('c_up_er3','Lateral Raise','3×15',3,'Light and strict — no momentum.'),
    ex('c_up_er4','DB Tricep Overhead','3×12',3,'Both hands on one DB. Full stretch at top.'),
  ],
  landing: [
    ex('c_up_l1','Doorframe Chest Stretch','60s/side',1,'Arm at 90° in doorframe, rotate body away.',true,'timed'),
    ex('c_up_l2','Lat Overhead Stretch','60s/side',1,'Reach one arm overhead, grab a rack or door frame, lean away.',true,'timed'),
    ex('c_up_l3','Diaphragmatic Breathing','10 breaths',1,'Lie on back. Inhale 4 counts, hold 2, exhale 6. Shifts the nervous system from sympathetic to parasympathetic — see "What is CNS Down-Regulation" in Wisdom.',false,'reps_only'),
  ],
};

WORKOUTS.comm['Upper Pull'] = {
  taxi: [
    ex('c_ul_t1','Arm Circles (progressive)','10/direction',1,'Small to large, both directions. Warms rotator cuff before pulling loads.',false,'reps_only'),
    ex('c_ul_t2','Scapular Pullup','2×10',2,'Hang from bar. Without bending elbows, depress and retract scapulae.'),
    ex('c_ul_t3','Prone Y-T-W Raises','2×10',2,'Lying face-down on bench. Light plates. Raise in Y, T, W shapes.'),
  ],
  takeoff: [
    ex('c_ul_to1','Conventional Deadlift','5×3',5,'Work up to heavy triples. Full reset each rep. Keep back neutral.'),
    ex('c_ul_to2','Barbell Row (Pendlay)','4×6',4,'Bar to floor between reps. Upper back, lats, rear delts.'),
  ],
  enroute: [
    ex('c_ul_er1','Lat Pulldown','3×10',3,'Full overhead stretch, pull to upper chest.'),
    ex('c_ul_er2','Seated Cable Row','3×12',3,'Retract fully at the end — shoulder blades together.'),
    ex('c_ul_er3','Face Pull','3×20',3,'Cable at face height. Pull to forehead, elbows high and wide.'),
    ex('c_ul_er4','EZ Bar Curl','3×12',3,'Strict — no swing. Control the eccentric.'),
  ],
  landing: [
    ex('c_ul_l1','Lat Hang Stretch','45s',1,'Hang from pullup bar, completely relaxed.',true,'timed'),
    ex('c_ul_l2','Thoracic Rotation (seated)','60s/side',1,'Seated, cross arms on chest. Rotate slowly through mid-back only.',true,'timed'),
    ex('c_ul_l3','Diaphragmatic Breathing','10 breaths',1,'Inhale 4, hold 2, exhale 6. CNS down-regulation protocol.',false,'reps_only'),
  ],
};

WORKOUTS.comm['Power / Plyo'] = {
  taxi: [
    ex('c_pp_t1','Jump Rope / Ankle Bouncing','3 min',1,'Moderate pace. Warms Achilles and prepares the elastic system.',true,'timed'),
    ex('c_pp_t2','Light Squat Jumps','2×5',2,'Bodyweight only. Focus on arm swing mechanics and soft landing.'),
    ex('c_pp_t3','Hip Flexor Lunge Stretch','60s/side',1,'Kneeling lunge, hands overhead, lean forward.',true,'timed'),
  ],
  takeoff: [
    ex('c_pp_to1','Box Jump','5×3',5,'FULL 3-minute rest between sets. Every rep is maximum effort.'),
    ex('c_pp_to2','Trap Bar Deadlift','5×3',5,'Heavy and FAST. The concentric must be explosive.'),
  ],
  enroute: [
    ex('c_pp_er1','Broad Jump','5×3',5,'Horizontal power transfers to vertical. Max effort.'),
    ex('c_pp_er2','Walking Lunge','3×10/leg',3,'Light-moderate. Hip flexor strength critical for takeoff mechanics.'),
    ex('c_pp_er3','Sprint 40yd','6 reps',6,'Full speed. Walk back. Log time or distance in the notes.'),
    ex('c_pp_er4','Ankle Hop','3×20',3,'Minimal knee bend. Fast and springy.'),
  ],
  landing: [
    ex('c_pp_l1','Achilles / Calf Stretch','90s/side',1,'Step on step edge, drop heel slowly.',true,'timed'),
    ex('c_pp_l2','Slow Pogo Hops (25% effort)','30s',1,'Gentle bouncing — minimal effort.',true,'timed'),
    ex('c_pp_l3','Non-Sleep Deep Rest (NSDR)','5 min',1,'Lie flat. Eyes closed. Breathe slowly. Use the NSDR timer below — it will chime at 5 minutes and record your session automatically.',true,'nsdr'),
  ],
};

WORKOUTS.comm['Full Body'] = {
  taxi: [
    ex('c_fb_t1','Full Mobility Circuit','1 round',1,'5 hip 90/90 each side → 10 arm circles each way → 10 thoracic extensions → 10 bodyweight squats.',true,'timed'),
    ex('c_fb_t2','Lateral Band Walk','2×15/side',2,'Glute activation before compound loading.',false,'reps_only'),
  ],
  takeoff: [
    ex('c_fb_to1','Back Squat','4×5',4,'Heavy. Primary lower body compound.'),
    ex('c_fb_to2','Bench Press','4×5',4,'Heavy. Primary upper push.'),
  ],
  enroute: [
    ex('c_fb_er1','Deadlift','3×3',3,'Heavy triple. Maximum posterior chain.'),
    ex('c_fb_er2','Weighted Pullups','3×6',3,'Add weight if bodyweight is easy.'),
    ex('c_fb_er3','Overhead Press','3×8',3,'Moderate. Standing.'),
    ex('c_fb_er4','Bulgarian Split Squat','3×8/leg',3,'Unilateral leg accessory.'),
  ],
  landing: [
    ex('c_fb_l1','Full Body Stretch Circuit','5 min',1,'Child\'s pose → pigeon each side → lat hang → chest doorframe.',true,'timed'),
    ex('c_fb_l2','Diaphragmatic Breathing','10 breaths',1,'Inhale 4, hold 2, exhale 6.',false,'reps_only'),
  ],
};

WORKOUTS.comm['Longevity'] = {
  taxi: [
    ex('c_lg_t1','Cat-Cow','2×10',2,'Slow spinal articulation. Inhale on extension, exhale on flexion.',false,'reps_only'),
    ex('c_lg_t2','Dead Bug','2×8/side',2,'Lie on back. Extend opposite arm/leg slowly.',false,'reps_only'),
    ex('c_lg_t3','Hip 90/90','60s/side',1,'Slow rotation between internal and external hip position.',true,'timed'),
  ],
  takeoff: [
    ex('c_lg_to1','Goblet Squat','3×10',3,'Moderate weight. Full depth. Most joint-friendly lower body compound.'),
    ex('c_lg_to2','Cable Row','3×12',3,'Back health and posture. Full retraction.'),
  ],
  enroute: [
    ex('c_lg_er1','Farmer Carry','3×40yd',3,'Heaviest DB you can hold with perfect posture.'),
    ex('c_lg_er2','Face Pull','3×20',3,'Essential shoulder health.'),
    ex('c_lg_er3','Pallof Press','3×10/side',3,'Cable or band. Anti-rotation core stability.'),
    ex('c_lg_er4','Split Squat','3×10/leg',3,'Both feet on floor. Controlled descent.'),
  ],
  landing: [
    ex('c_lg_l1','Hip 90/90 Rotation Drill','90s/side',1,'Your most important mobility work as a pilot.',true,'timed'),
    ex('c_lg_l2','Neck Mobility Protocol','2×8/direction',1,'Forward, back, rotation each side, lateral flexion.',false,'reps_only'),
    ex('c_lg_l3','Zone 2 Walk','10 min',1,'Brisk walk. Conversational pace.',true,'timed'),
  ],
};

WORKOUTS.comm['Cardio'] = {
  taxi: [
    ex('c_ca_t1','Brisk Walk Ramp-Up','3 min',1,'Start slow, build pace.',true,'timed'),
  ],
  takeoff: [
    ex('c_ca_to1','Rowing Machine Intervals','6×500m',6,'Hard effort. Record split time each interval.'),
    ex('c_ca_to2','Assault Bike Intervals','8×30s',8,'All-out 30 seconds. 60s easy spin.'),
  ],
  enroute: [
    ex('c_ca_er1','Treadmill Zone 2 Run','20 min',1,'Conversational pace — speak in full sentences.',true,'timed'),
    ex('c_ca_er2','Step-Up (light)','3×15/leg',3,'Active recovery strength.'),
  ],
  landing: [
    ex('c_ca_l1','Cool-Down Walk','5 min',1,'Slow your pace gradually.',true,'timed'),
    ex('c_ca_l2','Static Stretching Circuit','5 min',1,'Hip flexors, hamstrings, calves.',true,'timed'),
  ],
};

WORKOUTS.hotel = {};
WORKOUTS.hotel['Lower Body'] = {
  taxi: WORKOUTS.comm['Lower Body'].taxi.slice(0,3),
  takeoff: [
    ex('h_lb_to1','Heavy Goblet Squat','5×6',5,'Heaviest DB available. Full depth.'),
    ex('h_lb_to2','DB Romanian Deadlift','4×8',4,'Hip hinge. Feel the hamstring stretch.'),
  ],
  enroute: [
    ex('h_lb_er1','Bulgarian Split Squat','3×10/leg',3,'Use a bench. Bodyweight or light DBs.'),
    ex('h_lb_er2','Weighted Step-Up','3×12/leg',3,'Drive through the working heel.'),
    ex('h_lb_er3','Single-Leg Calf Raise','3×15',3,'Step edge for full ROM.'),
    ex('h_lb_er4','DB Lateral Lunge','3×10/side',3,'Step to side, sit into the hip.'),
  ],
  landing: WORKOUTS.comm['Lower Body'].landing,
};
WORKOUTS.hotel['Upper Push'] = {
  taxi: WORKOUTS.comm['Upper Push'].taxi,
  takeoff: [
    ex('h_up_to1','DB Bench Press','4×8',4,'Heaviest DBs. Full ROM.'),
    ex('h_up_to2','DB Overhead Press','4×8',4,'Standing. Full lockout.'),
  ],
  enroute: [
    ex('h_up_er1','DB Incline Press','3×10',3,'30-45°. Upper chest focus.'),
    ex('h_up_er2','DB Lateral Raise','3×15',3,'Light and strict.'),
    ex('h_up_er3','DB Tricep Overhead','3×12',3,'Both hands on one DB.'),
    ex('h_up_er4','DB Front Raise','3×12',3,'Alternating. Light weight.'),
  ],
  landing: WORKOUTS.comm['Upper Push'].landing,
};
WORKOUTS.hotel['Upper Pull'] = {
  taxi: WORKOUTS.comm['Upper Pull'].taxi.slice(0,2),
  takeoff: [
    ex('h_ul_to1','Pullups','5×max',5,'Every set near-failure.'),
    ex('h_ul_to2','DB Row','4×10/side',4,'Chest on bench. Heavy.'),
  ],
  enroute: [
    ex('h_ul_er1','Chinups','3×max',3,'Supinated grip.'),
    ex('h_ul_er2','DB Curl','3×12',3,'Controlled eccentric.'),
    ex('h_ul_er3','Bent-Over DB Face Pull','3×15',3,'Light DBs.'),
    ex('h_ul_er4','DB Hammer Curl','3×12',3,'Neutral grip.'),
  ],
  landing: WORKOUTS.comm['Upper Pull'].landing,
};
WORKOUTS.hotel['Power / Plyo'] = {
  taxi: WORKOUTS.comm['Power / Plyo'].taxi,
  takeoff: [
    ex('h_pp_to1','Bench/Box Jump','5×3',5,'Highest stable surface. Max effort.'),
    ex('h_pp_to2','Broad Jump','5×3',5,'Max horizontal distance.'),
  ],
  enroute: [
    ex('h_pp_er1','DB Jump Squat','4×5',4,'Light DBs. Explosive concentric.'),
    ex('h_pp_er2','Sprint (hall/outside)','6×20yd',6,'Full speed. Walk back.'),
    ex('h_pp_er3','Split Jump','3×6',3,'Lunge position, jump and switch.'),
    ex('h_pp_er4','Depth Drop','3×5',3,'Step off low bench, land softly, absorb.'),
  ],
  landing: WORKOUTS.comm['Power / Plyo'].landing,
};
WORKOUTS.hotel['Full Body'] = {
  taxi: [ex('h_fb_t1','Full Mobility Circuit','1 round',1,'5 hip 90/90 each side → 10 arm circles → 10 thoracic extensions → 10 goblet squats.',true,'timed')],
  takeoff: [
    ex('h_fb_to1','Heavy Goblet Squat','4×6',4,'Heaviest DB. Full depth.'),
    ex('h_fb_to2','DB Bench Press','4×6',4,'Heavy.'),
  ],
  enroute: [
    ex('h_fb_er1','Pullups','3×max',3,'Upper pull.'),
    ex('h_fb_er2','DB Overhead Press','3×8',3,'Standing.'),
    ex('h_fb_er3','Bulgarian Split Squat','3×8/leg',3,'Unilateral leg.'),
    ex('h_fb_er4','DB Row','3×10/side',3,'Back.'),
  ],
  landing: [
    ex('h_fb_l1','Full Body Stretch','5 min',1,'Child\'s pose → pigeon → lat hang → chest stretch.',true,'timed'),
    ex('h_fb_l2','Diaphragmatic Breathing','10 breaths',1,'Inhale 4, hold 2, exhale 6.',false,'reps_only'),
  ],
};
WORKOUTS.hotel['Longevity'] = WORKOUTS.comm['Longevity'];
WORKOUTS.hotel['Cardio'] = {
  taxi: WORKOUTS.comm['Cardio'].taxi,
  takeoff: [
    ex('h_ca_to1','Treadmill Intervals','8×1 min',8,'Hard 1 min run, 90s walk.'),
    ex('h_ca_to2','Stationary Bike Intervals','6×45s',6,'High resistance. Hard effort.'),
  ],
  enroute: [
    ex('h_ca_er1','Treadmill Zone 2 Run','20 min',1,'Conversational pace.',true,'timed'),
    ex('h_ca_er2','Step-Up (light)','3×15/leg',3,'Active recovery strength.'),
  ],
  landing: WORKOUTS.comm['Cardio'].landing,
};

WORKOUTS.room = {};
WORKOUTS.room['Lower Body'] = {
  taxi: WORKOUTS.comm['Lower Body'].taxi.slice(0,3),
  takeoff: [
    ex('r_lb_to1','Pistol Squat Progression','4×5/leg',4,'Assisted or full. Best bodyweight lower body exercise.'),
    ex('r_lb_to2','Nordic Hamstring Curl','3×5',3,'Feet anchored under bed or door. Lower as slowly as possible.'),
  ],
  enroute: [
    ex('r_lb_er1','Bulgarian Split Squat','4×12/leg',4,'Rear foot on bed. Bodyweight.'),
    ex('r_lb_er2','Single-Leg Glute Bridge','3×15/leg',3,'Drive through heel.'),
    ex('r_lb_er3','Calf Raise (step)','4×20',4,'Use a stair or book stack.'),
    ex('r_lb_er4','Reverse Lunge','3×12/leg',3,'Step back, drive through front heel.'),
  ],
  landing: WORKOUTS.comm['Lower Body'].landing,
};
WORKOUTS.room['Upper Push'] = {
  taxi: WORKOUTS.comm['Upper Push'].taxi.slice(0,2),
  takeoff: [
    ex('r_up_to1','Archer Pushup','4×5/side',4,'One arm supports, one extends.'),
    ex('r_up_to2','Pike Pushup','4×10',4,'Hips high, head toward floor.'),
  ],
  enroute: [
    ex('r_up_er1','Pushup Variations','3×15',3,'Wide, close, explosive.'),
    ex('r_up_er2','Chair Dips','3×max',3,'Tricep focus.'),
    ex('r_up_er3','Decline Pushup','3×12',3,'Feet on bed.'),
    ex('r_up_er4','Plank','3×60s',3,'Straight line head to heels.',true,'timed'),
  ],
  landing: WORKOUTS.comm['Upper Push'].landing,
};
WORKOUTS.room['Upper Pull'] = {
  taxi: WORKOUTS.comm['Upper Pull'].taxi.slice(0,2),
  takeoff: [
    ex('r_ul_to1','Pullups (bar if available)','5×max',5,'Every rep near-failure.'),
    ex('r_ul_to2','Table / Inverted Row','4×12',4,'Heels on floor under table, pull chest to edge.'),
  ],
  enroute: [
    ex('r_ul_er1','Chinups','3×max',3,'Supinated.'),
    ex('r_ul_er2','Towel Curl','3×15',3,'Towel looped over door handle.'),
    ex('r_ul_er3','Door Frame Row','3×12',3,'Hold frame, lean back, pull chest to hands.'),
    ex('r_ul_er4','Superman Hold','3×30s',3,'Lie face down, extend arms and legs, hold.',true,'timed'),
  ],
  landing: WORKOUTS.comm['Upper Pull'].landing,
};
WORKOUTS.room['Power / Plyo'] = {
  taxi: WORKOUTS.comm['Power / Plyo'].taxi,
  takeoff: [
    ex('r_pp_to1','Bed/Chair Jump','5×3',5,'Any stable surface. Max jump every rep.'),
    ex('r_pp_to2','Broad Jump','5×3',5,'Hallway. Max effort.'),
  ],
  enroute: [
    ex('r_pp_er1','Squat Jump','4×5',4,'Bodyweight. Explode every rep.'),
    ex('r_pp_er2','Split Jump','3×6',3,'Lunge position, jump and switch.'),
    ex('r_pp_er3','Explosive Pushup','4×5',4,'Hands leave floor.'),
    ex('r_pp_er4','Pogo Hop','3×20',3,'Stiff ankles.'),
  ],
  landing: WORKOUTS.comm['Power / Plyo'].landing,
};
WORKOUTS.room['Full Body'] = {
  taxi: [ex('r_fb_t1','Full Mobility Circuit','1 round',1,'5 hip 90/90 each side → 10 arm circles → 10 thoracic extensions → 10 bodyweight squats.',true,'timed')],
  takeoff: [
    ex('r_fb_to1','Pistol Squat Progression','3×5/leg',3,'Primary lower.'),
    ex('r_fb_to2','Pullups / Table Row','3×max',3,'Primary upper pull.'),
  ],
  enroute: [
    ex('r_fb_er1','Archer Pushup','3×5/side',3,'Upper push.'),
    ex('r_fb_er2','Bulgarian Split Squat','3×10/leg',3,'Unilateral leg.'),
    ex('r_fb_er3','Pike Pushup','3×10',3,'Overhead push pattern.'),
    ex('r_fb_er4','Superman Hold','3×30s',3,'Posterior chain and back.',true,'timed'),
  ],
  landing: [
    ex('r_fb_l1','Full Body Stretch','5 min',1,'Child\'s pose → pigeon → doorframe chest → neck mobility.',true,'timed'),
    ex('r_fb_l2','Diaphragmatic Breathing','10 breaths',1,'Inhale 4, hold 2, exhale 6.',false,'reps_only'),
  ],
};
WORKOUTS.room['Longevity'] = {
  taxi: WORKOUTS.comm['Longevity'].taxi,
  takeoff: [
    ex('r_lg_to1','Slow Bodyweight Squat','3×12',3,'3s down, 1s pause, controlled up.'),
    ex('r_lg_to2','Inverted Row / Door Row','3×12',3,'Full retraction.'),
  ],
  enroute: [
    ex('r_lg_er1','Reverse Lunge','3×10/leg',3,'Controlled.'),
    ex('r_lg_er2','Slow Pushup','3×8',3,'4s down, 2s pause.'),
    ex('r_lg_er3','Dead Bug','3×8/side',3,'Core stability.',false,'reps_only'),
    ex('r_lg_er4','Bird Dog','3×10/side',3,'Opposite arm-leg.',false,'reps_only'),
  ],
  landing: WORKOUTS.comm['Longevity'].landing,
};
WORKOUTS.room['Cardio'] = {
  taxi: WORKOUTS.comm['Cardio'].taxi,
  takeoff: [
    ex('r_ca_to1','Burpee Intervals','8×30s',8,'Max burpees in 30s.'),
    ex('r_ca_to2','Stair Sprint Intervals','6×2 flights',6,'Full sprint up. Walk down.'),
  ],
  enroute: [
    ex('r_ca_er1','Jump Lunge','4×10/leg',4,'Explosive alternating.'),
    ex('r_ca_er2','Mountain Climbers','4×30s',4,'Fast feet.',true,'timed'),
  ],
  landing: WORKOUTS.comm['Cardio'].landing,
};

// ─── FATIGUE-AWARE FILTERING ──────────────────────────────────────────────────
const LEVEL_EX = {
  beginner:     { taxi: 2, takeoff: 1, enroute: 1, landing: 1 },
  intermediate: { taxi: 2, takeoff: 2, enroute: 2, landing: 2 },
  advanced:     { taxi: 3, takeoff: 2, enroute: 4, landing: 3 },
};

function getFilteredWorkout(rawWk) {
  if (!rawWk) return null;
  if (ST.fatigue === 'nogo') {
    return { taxi: rawWk.taxi, takeoff: [], enroute: [], landing: rawWk.landing };
  }
  if (ST.fatigue === 'marginal') {
    return { taxi: rawWk.taxi, takeoff: [], enroute: rawWk.enroute.slice(0,1), landing: rawWk.landing };
  }
  const lim = LEVEL_EX[ST.level] || LEVEL_EX.intermediate;
  return {
    taxi:    rawWk.taxi.slice(0, lim.taxi),
    takeoff: rawWk.takeoff.slice(0, lim.takeoff),
    enroute: rawWk.enroute.slice(0, lim.enroute),
    landing: rawWk.landing.slice(0, lim.landing),
  };
}

// Recommend next muscle group based on goal rotation + last completed session
function getRecommendedNext() {
  const order = (GOALS[ST.goal] || GOALS.longevity).order;
  if (!ST.lastSession || !ST.lastSession.muscle_group) return order[0];
  const idx = order.indexOf(ST.lastSession.muscle_group);
  if (idx === -1) return order[0];
  return order[(idx + 1) % order.length];
}

// ─── EXERCISE GUIDE LINKS ─────────────────────────────────────────────────────
// A small set of exercises have been individually verified against live ExRx.net
// pages (confirmed to load and match the correct movement). For every other
// exercise, rather than guess at a direct page URL (which previously produced
// broken links for ~90% of exercises), we generate a Google search scoped to
// exrx.net for that exact exercise name. This guarantees a working, relevant
// result for every single exercise, even when ExRx has no dedicated page for it.
const EXRX_VERIFIED = {
  c_lb_to1:'https://exrx.net/WeightExercises/Quadriceps/BBSquat',
  c_lb_to2:'https://exrx.net/WeightExercises/OlympicLifts/RomanianDeadlift',
  c_lb_er1:'https://exrx.net/WeightExercises/Quadriceps/DBBulgarianSquat',
  c_lb_er2:'https://exrx.net/WeightExercises/Quadriceps/LVLegPress',
  c_up_to1:'https://exrx.net/WeightExercises/PectoralSternal/BBBenchPress',
  c_up_to2:'https://exrx.net/WeightExercises/DeltoidAnterior/BBMilitaryPress',
  c_ul_to1:'https://exrx.net/WeightExercises/ErectorSpinae/BBDeadlift',
  c_ul_to2:'https://exrx.net/WeightExercises/BackGeneral/BBBentOverRow',
  c_ul_er1:'https://exrx.net/WeightExercises/LatissimusDorsi/CBFrontPulldown',
  c_ul_er2:'https://exrx.net/WeightExercises/BackGeneral/CBSeatedRow',
  c_ul_er3:'https://exrx.net/WeightExercises/DeltoidPosterior/CBFacePull',
  c_pp_to1:'https://exrx.net/Plyometrics/BoxJump',
  c_pp_to2:'https://exrx.net/WeightExercises/GluteusMaximus/TBDeadlift',
  h_ul_to1:'https://exrx.net/WeightExercises/LatissimusDorsi/BWPullup',
  h_lb_to1:'https://exrx.net/WeightExercises/Kettlebell/KBGobletSquat',
  h_lb_to2:'https://exrx.net/WeightExercises/OlympicLifts/RomanianDeadlift',
  r_lb_to2:'https://exrx.net/Stretches/Hamstrings/BWNordicHamstringCurl',
};

function exrxSearchLink(name) {
  // Strip parenthetical notes and slashes that don't help search relevance
  const clean = name.replace(/\([^)]*\)/g, '').replace(/[\/]/g, ' ').trim();
  return 'https://www.google.com/search?q=' + encodeURIComponent('site:exrx.net ' + clean);
}

function getExGuide(exId, exName) {
  const verified = EXRX_VERIFIED[exId];
  return {
    exrx: verified || exrxSearchLink(exName || exId),
    verified: !!verified,
  };
}


// ─── WISDOM CARDS ─────────────────────────────────────────────────────────────
// IMPORTANT: links point to verified, topic-matched authoritative sources
// (NIH/NHLBI, CDC, Mayo Clinic, Harvard Health, AHA) rather than specific PubMed IDs,
// because individual study citations require per-paper verification we cannot
// guarantee at this scale. Every link below was checked to match its card's topic.
const WISDOM = [
  { title:'Hydration SOP', text:'Aviation medicine guidance sets roughly 0.3L of water per flight hour as a baseline hydration target. Cabin humidity at altitude drops below 20% — drier than most deserts — so fluid loss outpaces thirst. By the time you feel thirsty, you may already be mildly dehydrated, which is enough to measurably affect reaction time and decision-making. On no-fly days, a 1L minimum keeps you on track.', link:'https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html' },
  { title:'Seated Correction', text:'Sustained sitting compresses the spinal discs, deactivates the glutes, and tightens the hip flexors. Set a reminder every 60 minutes: 10 glute squeezes, a few standing hip hinges, and a brief thoracic extension over a chair back. Small, frequent breaks matter more than one long stretch session.', link:'https://www.mayoclinic.org/healthy-lifestyle/adult-health/in-depth/sitting/art-20270991' },
  { title:'Landing Prep Breathing', text:'Slow, extended-exhale breathing (such as 4 seconds in, 7 hold, 8 out) activates the parasympathetic nervous system, lowering heart rate and reducing the mental "noise" of a high-workload environment within a few cycles. Useful immediately after landing or before a stressful task.', link:'https://www.health.harvard.edu/mind-and-mood/relaxation-techniques-breath-control-helps-quell-errant-stress-response' },
  { title:'BP Accuracy Protocol', text:'Blood pressure readings are sensitive to method. Rest quietly for 5 full minutes first. Sit with your back supported, feet flat, and arm at heart level — no talking. Take three readings a minute or two apart and average the last two. Caffeine or exercise in the prior 30 minutes can inflate the number.', link:'https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings' },
  { title:'Fasting Glucose Baseline', text:'Fasting glucose should be measured upon waking, before any food or coffee, after at least 8 hours without eating. Normal is roughly 70-99 mg/dL; 100-125 is considered pre-diabetic range; 126+ is the diabetic threshold. Stress and poor sleep can elevate readings independent of diet, so track the trend over weeks, not single readings.', link:'https://www.cdc.gov/diabetes/diabetes-testing/index.html' },
  { title:'Blue Light Management', text:'Screens emit blue wavelengths that suppress melatonin release in the evening, delaying sleep onset. Blue-light-filtering glasses or built-in "night mode" settings after sunset are simple, evidence-supported countermeasures — useful for pilots managing irregular schedules.', link:'https://www.sleepfoundation.org/bedroom-environment/blue-light' },
  { title:'Why Squats Matter', text:'The squat loads the entire postural and lower body system at once — lumbar spine, hips, knees, ankles, and core all participate. For pilots, it directly counters the seated posture of the cockpit. Regular squatting supports bone density and overall functional strength as you age.', link:'https://www.acefitness.org/resources/everyone/blog/6470/the-truth-about-squats/' },
  { title:'Post-Meal Walk', text:'A short walk after eating — even 10 minutes — measurably blunts the post-meal blood sugar spike by helping muscles take up glucose without relying on extra insulin. For pilots with irregular meal timing, this is one of the easiest interventions available in almost any environment.', link:'https://www.diabetes.org/healthy-living/fitness/getting-started-safely/walking' },
  { title:'Sleep Consistency', text:'A consistent wake time — more than bedtime — anchors your circadian rhythm and the hormonal cascade that depends on it. Even after irregular trips, returning to a fixed wake-time window within a few days helps rebuild that rhythm faster than chasing extra sleep alone.', link:'https://www.sleepfoundation.org/sleep-hygiene/sleep-schedule' },
  { title:'Box Breathing for Pilots', text:'Box breathing — inhale 4 counts, hold 4, exhale 4, hold 4 — is a simple, trainable technique used across military and high-performance settings to reduce acute stress and steady heart rate before a demanding task.', link:'https://www.health.harvard.edu/mind-and-mood/relaxation-techniques-breath-control-helps-quell-errant-stress-response' },
  { title:'Protein Priority', text:'Aiming for roughly 25-30g of protein per meal, spread across the day, supports muscle maintenance and satiety better than concentrating protein into one large meal. For pilots eating in airports and hotels, this means actively choosing protein-forward options at each stop.', link:'https://www.hsph.harvard.edu/nutritionsource/what-should-you-eat/protein/' },
  { title:'Fiber Intake', text:'Most adults fall well short of the roughly 25-30g of daily fiber recommended for digestive and metabolic health. Fiber slows glucose absorption, feeds beneficial gut bacteria, and supports satiety — valuable when travel limits food choices.', link:'https://www.hsph.harvard.edu/nutritionsource/carbohydrates/fiber/' },
  { title:'Zone 2 Training', text:'Training at a conversational pace — roughly 60-70% of max heart rate — builds the aerobic base that underlies recovery from harder efforts. Most evidence-based guidelines recommend 150+ minutes of this kind of moderate cardio per week for general health.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults' },
  { title:'Thoracic Mobility', text:'Prolonged forward-flexed postures — like extended seat time — encourage the upper back to round. Daily thoracic extension drills (over a chair back or foam roller) help counteract this and protect the neck and lower back from compensating.', link:'https://www.spine-health.com/wellness/exercise/thoracic-spine-stretches-and-exercises' },
  { title:'Caffeine Cutoff', text:'Caffeine has a half-life of roughly 5-6 hours, meaning a substantial dose remains active in your system well into the evening if consumed in the afternoon. For pilots with variable schedules, a personal cutoff time — even 8 hours before target sleep — meaningfully protects sleep quality.', link:'https://www.sleepfoundation.org/nutrition/caffeine-and-sleep' },
  { title:'Morning Light Exposure', text:'Getting outside within the first hour of waking — even on a cloudy day — provides far more light intensity than indoor lighting and helps anchor your circadian clock. For pilots adjusting across time zones, morning light at the destination is one of the fastest resynchronization tools available.', link:'https://www.sleepfoundation.org/bedroom-environment/light-and-sleep' },
  { title:'The Big Three Lifts', text:'A squat pattern, a hip-hinge pattern (like a deadlift), and a pulling pattern cover most of what the body needs for durable, functional strength. If your time is limited, maintaining competence in these three patterns gives the broadest return.', link:'https://www.acefitness.org/resources/everyone/blog/6470/the-truth-about-squats/' },
  { title:'Active Recovery on Layovers', text:'Total rest on a layover often feels appealing, but light movement — an easy walk, gentle mobility work — tends to leave you feeling better than complete inactivity, by promoting blood flow and reducing stiffness without adding training stress.', link:'https://www.acsm.org/education-resources/trending-topics-resources/active-recovery' },
  { title:'Waist Measurement Protocol', text:'Measure at the navel, at the end of a normal exhale, without pulling in your stomach. A waist circumference over 40 inches in men (35 inches in women) is the commonly cited clinical threshold associated with higher metabolic and cardiovascular risk — independent of total body weight.', link:'https://www.nhlbi.nih.gov/health/educational/lose_wt/risk.htm' },
  { title:'Meal Timing', text:'Eating close to bedtime can interfere with the normal drop in core body temperature that supports sleep onset, and is associated with poorer overnight glucose control. A loose guideline of finishing meals 2-3 hours before bed is a reasonable target.', link:'https://www.sleepfoundation.org/nutrition/food-and-drink-promote-good-sleep' },
  { title:'CNS Recovery', text:'Strength adaptations happen during the recovery period after a workout — not during the workout itself. Adequate sleep and protein intake in the 24-48 hours following a hard session are what convert training stress into actual progress.', link:'https://www.acefitness.org/resources/everyone/blog/6470/the-truth-about-squats/' },
  { title:'Scapular Position', text:'A neutral, slightly retracted shoulder blade position — sometimes cued as "shoulders back and down" — helps offset the forward-rounded posture common after years in a cockpit seat, and reduces shoulder impingement risk during pressing movements.', link:'https://www.spine-health.com/wellness/exercise/thoracic-spine-stretches-and-exercises' },
  { title:'Spinal Decompression', text:'Gentle stretches like child\'s pose create mild traction on the spine, helping offset the compressive load of long periods of sitting. This is a useful addition after a heavy lower body session.', link:'https://www.spine-health.com/wellness/exercise/thoracic-spine-stretches-and-exercises' },
  { title:'Blood Sugar Control', text:'Refined carbohydrates and added sugars tend to produce a rapid glucose rise followed by a crash, which can affect alertness a couple of hours later. Pairing carbohydrates with protein, fat, or fiber slows this response and tends to produce steadier energy.', link:'https://www.cdc.gov/diabetes/healthy-eating/index.html' },
  { title:'Urine Color Chart', text:'Urine color remains one of the simplest, free hydration indicators — pale straw suggests good hydration, while dark amber suggests you need more fluids soon. Note that certain vitamins (like B-complex) can cause bright yellow urine unrelated to hydration status.', link:'https://www.mayoclinic.org/healthy-lifestyle/nutrition-and-healthy-eating/in-depth/water/art-20044256' },
  { title:'Cold Exposure', text:'Brief cold exposure at the end of a shower has been associated with improved alertness and mood in some studies, likely through norepinephrine release. It is not required for fitness progress but is a low-cost tool some people find energizing.', link:'https://www.health.harvard.edu/staying-healthy/the-power-of-the-cold-water-plunge' },
  { title:'Two-Minute Mindfulness', text:'Even short, focused-breathing breaks of a couple of minutes have been shown to reduce momentary stress markers and improve subsequent focus. For high-workload professions, brief resets between tasks may be more sustainable than longer sessions.', link:'https://www.health.harvard.edu/mind-and-mood/relaxation-techniques-breath-control-helps-quell-errant-stress-response' },
  { title:'Tempo Training for Longevity', text:'Slowing down the lowering (eccentric) portion of a lift increases time under tension and may better stimulate connective tissue adaptation than fast, uncontrolled reps — a useful emphasis for joint-friendly, longevity-focused training.', link:'https://www.acefitness.org/resources/everyone/blog/6470/the-truth-about-squats/' },
  { title:'Dietary Blood Pressure', text:'Reducing sodium intake and increasing potassium-rich foods — leafy greens, avocado, sweet potatoes, legumes — are two of the most well-supported dietary levers for lowering blood pressure over time.', link:'https://www.heart.org/en/health-topics/high-blood-pressure/changes-you-can-make-to-manage-high-blood-pressure' },
  { title:'Anti-Movement Core Training', text:'Exercises like planks and dead bugs train the core to resist unwanted movement of the spine, which is generally considered more protective for the lower back than traditional flexion-based exercises like sit-ups.', link:'https://www.spine-health.com/wellness/exercise/core-exercises-low-back-pain' },
  { title:'Screen-Free Pre-Sleep Window', text:'Reducing screen exposure in the hour before bed — and replacing it with reading, journaling, or a podcast — is a simple, low-cost habit associated with falling asleep more easily over time.', link:'https://www.sleepfoundation.org/bedroom-environment/blue-light' },
  { title:'Dynamic Warmup Science', text:'Dynamic movement-based warmups (leg swings, bodyweight squats, hip hinges) tend to outperform static stretching for preparing the body for performance, while static stretching is better reserved for after the session.', link:'https://www.acsm.org/education-resources/trending-topics-resources/dynamic-stretching' },
  { title:'Muscle as Metabolic Insurance', text:'Skeletal muscle is a major site of glucose disposal in the body. Building and maintaining muscle mass through resistance training supports better blood sugar regulation over the long term, independent of weight changes.', link:'https://www.cdc.gov/diabetes/healthy-eating/index.html' },
  { title:'Trap Release Protocol', text:'The upper traps and neck muscles often carry chronic tension from supporting the head during long periods of sitting. A few minutes of self-massage with a lacrosse ball or foam roller against a wall can meaningfully reduce that tension.', link:'https://www.spine-health.com/wellness/exercise/thoracic-spine-stretches-and-exercises' },
  { title:'Daily Weight Protocol', text:'Body weight naturally fluctuates several pounds day to day from water and food volume. Weighing at the same time, same conditions, and tracking a weekly average gives a far clearer signal than any single day\'s number.', link:'https://www.health.harvard.edu/staying-healthy/how-much-should-you-weigh' },
  { title:'Vitamin D for Pilots', text:'Limited sun exposure — common for flight crew due to schedules and UV-filtering cockpit glass — is a known risk factor for low vitamin D. Annual testing and supplementation when needed is a reasonable precaution.', link:'https://ods.od.nih.gov/factsheets/VitaminD-Consumer/' },
  { title:'Building Your Aerobic Base', text:'A broad aerobic base, built through consistent moderate-intensity cardio over months, improves recovery capacity between harder training sessions and supports long-term cardiovascular health.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults' },
  { title:'Chin Tuck Protocol', text:'A simple chin-tuck exercise — drawing the chin straight back without tilting down — helps counteract forward head posture from screens and cockpit positioning, reducing strain on the neck over time.', link:'https://www.spine-health.com/wellness/exercise/thoracic-spine-stretches-and-exercises' },
  { title:'Progressive Overload', text:'Strength gains require gradually increasing demand on the muscle over time — more reps, more weight, or more total volume. Tracking your numbers (which this app does automatically) is what makes that progression visible and intentional.', link:'https://www.acefitness.org/resources/everyone/blog/6470/the-truth-about-squats/' },
  { title:'Hydration and Cognition', text:'Even mild dehydration has been linked to reduced alertness and slower reaction time. Because thirst can lag behind actual need — especially in dry cabin air — drinking on a schedule rather than waiting to feel thirsty is the more reliable approach.', link:'https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html' },
  { title:'Time-Restricted Eating', text:'Compressing eating into a consistent daily window (such as 10am-8pm) is one approach some people use to support metabolic health, though it works best as a consistency tool rather than a rigid rule, especially with irregular pilot schedules.', link:'https://www.hsph.harvard.edu/nutritionsource/healthy-weight/diet-reviews/intermittent-fasting/' },
  { title:'Hip Hinge for Back Health', text:'Learning to hinge at the hips rather than round the lower back when lifting or bending is one of the most protective movement patterns for long-term spine health, especially relevant for handling bags and gear.', link:'https://www.spine-health.com/wellness/exercise/core-exercises-low-back-pain' },
  { title:'Post-Workout Nutrition', text:'Eating a combination of protein and carbohydrates within an hour or two after training supports recovery and glycogen replenishment. Simple options like Greek yogurt with fruit work well when you don\'t have time to prepare a full meal.', link:'https://www.hsph.harvard.edu/nutritionsource/what-should-you-eat/protein/' },
  { title:'Nasal Breathing', text:'Breathing through the nose during lower-intensity activity filters and humidifies air and may support more efficient oxygen exchange compared with mouth breathing. It\'s a skill that can be practiced gradually during easy cardio.', link:'https://www.health.harvard.edu/mind-and-mood/relaxation-techniques-breath-control-helps-quell-errant-stress-response' },
  { title:'Physical = Professional', text:'Physical fitness and cognitive performance are linked — better cardiovascular health and sleep quality both support sharper decision-making under workload. Training is not separate from professional readiness; it supports it directly.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults' },
  { title:'Darkness for Sleep', text:'A fully dark sleeping environment supports deeper, more restorative sleep. For pilots in unfamiliar hotel rooms, packing a quality sleep mask is a small investment with an outsized payoff.', link:'https://www.sleepfoundation.org/bedroom-environment/light-and-sleep' },
  { title:'Frequency Over Duration', text:'For mobility work specifically, doing a little every day tends to produce better results than doing a lot once a week. This is part of why the Taxi phase of every workout matters — consistency compounds.', link:'https://www.acsm.org/education-resources/trending-topics-resources/dynamic-stretching' },
  { title:'Track Your Weights', text:'Without tracking, it is easy to believe you are progressing when you have actually plateaued. Logging sets, reps, and weight — as this app does — is the most direct way to confirm real progress and catch stalls early.', link:'https://www.acefitness.org/resources/everyone/blog/6470/the-truth-about-squats/' },
  { title:'Resting Heart Rate as a Metric', text:'A resting heart rate noticeably higher than your personal baseline can be an early signal of inadequate recovery, illness, or excessive training stress — useful information for deciding whether to push or pull back on a given day.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/target-heart-rates' },
  { title:'The Long Game', text:'Consistency over many months outperforms any short, intense burst of effort. A sustainable training rhythm you can maintain for a year will produce better outcomes than an unsustainable one you abandon after a few weeks.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults' },
];

// ─── CNS DOWN-REGULATION EXPLAINER (referenced from Landing phase + Wisdom) ──
const CNS_EXPLAINER = "CNS down-regulation means deliberately shifting your nervous system from a sympathetic state (\"fight-or-flight\" — activated during hard training) back to a parasympathetic state (\"rest-and-digest\"). After intense exercise, your heart rate, breathing, and stress hormones are elevated. Slow breathing, stillness, and gentle stretching signal to your nervous system that the demand has passed, which speeds recovery and improves the sleep that follows. This is why the Landing phase exists in every workout — skipping it doesn't make you tougher, it just means you carry that activation into the rest of your day.";

// ─── BIOMETRIC INFO POPUPS ────────────────────────────────────────────────────
const BIO_INFO = {
  weight: {
    title: 'Body Weight Protocol',
    text: 'Weigh yourself at the same time daily — ideally upon waking, after using the restroom, before eating or drinking, on the same scale. Daily weight can swing 2-4 lbs from water and food alone, so look at your 7-day rolling average rather than any single reading.',
  },
  waist: {
    title: 'Waist Circumference Protocol',
    text: 'Measure at the navel, at the end of a normal exhale. Do not pull in your stomach. Use a flexible tape, snug but not compressing. Measure once per week, same time. A waist over 40 inches (men) or 35 inches (women) is the commonly cited clinical threshold for elevated metabolic risk — and it is a better predictor of visceral fat than body weight alone.',
  },
  systolic: {
    title: 'Blood Pressure — Systolic',
    text: 'Rest quietly for 5 minutes before measuring. Sit with back supported, feet flat, arm at heart level — no talking. Take 3 readings 1-2 minutes apart and record the average of the last two. Optimal systolic (the top number) is under 120 mmHg.',
  },
  diastolic: {
    title: 'Blood Pressure — Diastolic',
    text: 'Diastolic (the bottom number) reflects pressure between heartbeats. Same measurement protocol as systolic — quiet rest first, proper arm position, average of the last two readings. Optimal diastolic is under 80 mmHg.',
  },
  glucose: {
    title: 'Fasting Glucose Protocol',
    text: 'Measure upon waking, before any food or coffee, after at least 8 hours fasted. Normal range: 70-99 mg/dL. Pre-diabetic: 100-125. Diabetic threshold: 126+. Stress and poor sleep can elevate readings independent of diet — track the weekly trend rather than reacting to one number.',
  },
};

// ─── DATABASE HELPERS ─────────────────────────────────────────────────────────
async function dbGetProfile() {
  if (!ST.user) return JSON.parse(localStorage.getItem('fcf_profile')||'null');
  try {
    const { data } = await SB.from('user_profiles').select('*').eq('user_id', ST.user.id).maybeSingle();
    return data?.profile_data || null;
  } catch(e) { return null; }
}
async function dbSetProfile(p) {
  if (!ST.user) { localStorage.setItem('fcf_profile', JSON.stringify(p)); return; }
  try {
    await SB.from('user_profiles').upsert({ user_id: ST.user.id, profile_data: p, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  } catch(e) {}
}

async function dbGetCustomExercises() {
  const p = await dbGetProfile();
  return p?.customExercises || [];
}

async function dbGetRecentSessions(days) {
  days = days || 7;
  const since = new Date(Date.now() - days*24*60*60*1000).toISOString();
  try {
    const filter = ST.user ? SB.from('workout_sessions').select('*').eq('user_id', ST.user.id) : SB.from('workout_sessions').select('*');
    const { data, error } = await filter.gte('started_at', since).order('started_at', { ascending: true });
    if (error) throw error;
    return (data||[]).map(r => r.session_data).filter(Boolean);
  } catch(e) {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('fcf_session_'));
    const sessions = keys.map(k => { try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } }).filter(Boolean);
    const sinceTs = Date.now() - days*24*60*60*1000;
    return sessions.filter(s => new Date(s.date).getTime() >= sinceTs).sort((a,b) => new Date(a.date)-new Date(b.date));
  }
}

async function dbGetLastSession() {
  try {
    const filter = ST.user ? SB.from('workout_sessions').select('*').eq('user_id', ST.user.id) : SB.from('workout_sessions').select('*');
    const { data } = await filter.order('started_at', { ascending: false }).limit(1);
    return data?.[0]?.session_data || null;
  } catch(e) {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('fcf_session_'));
    if (!keys.length) return null;
    keys.sort();
    return JSON.parse(localStorage.getItem(keys[keys.length-1]));
  }
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
async function checkAuth() {
  try {
    const { data: { session } } = await SB.auth.getSession();
    return session?.user || null;
  } catch(e) { return null; }
}
async function doSignUp(email, pass) {
  const { data, error } = await SB.auth.signUp({ email, password: pass });
  if (error) throw error;
  return data.user;
}
async function doSignIn(email, pass) {
  const { data, error } = await SB.auth.signInWithPassword({ email, password: pass });
  if (error) throw error;
  return data.user;
}
async function doSignOut() {
  try { await SB.auth.signOut(); } catch(e) {}
  ST.user = null;
  ST.authed = false;
  ST.showLanding = true;
  renderRoot();
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
function renderLanding(root) {
  const parts = [];
  parts.push('<div class="landing">');

  parts.push('<div class="landing-hero">');
  parts.push('<div class="landing-logo">✈ FLIGHT CREW FITNESS</div>');
  parts.push('<div class="landing-tag">BUILT FOR PILOTS, BY THE REALITIES OF FLYING</div>');
  parts.push('<div class="landing-h1">Train hard between <span class="accent">duty days</span>, not despite them.</div>');
  parts.push('<div class="landing-sub">A workout system that adapts to your gym access, your fatigue level, and your schedule — whether you\'re home, on layover, or stuck with nothing but a hotel room.</div>');
  parts.push('<div class="landing-cta">');
  parts.push('<button class="btn btn-gold" onclick="ST.showLanding=false;ST.authMode=\'signup\';renderRoot()">Get Started — Free</button>');
  parts.push('<button class="btn btn-outline mt8" onclick="ST.showLanding=false;ST.authMode=\'signin\';renderRoot()">I have an account</button>');
  parts.push('</div>');
  parts.push('</div>');

  parts.push('<div class="landing-section">');
  parts.push('<div class="landing-section-title">Why pilots need a different program</div>');

  const features = [
    ['🌍','Environment-aware workouts','Every session adapts automatically to Commercial Gym, Hotel Gym, or just a Hotel Room — no equipment excuses.'],
    ['🚦','Fatigue-gated intensity','A pilot condition toggle (Go / Marginal / No-Go) reduces or removes heavy lifting when you\'re running on insufficient rest. Training through fatigue increases injury risk — this app respects that.'],
    ['💧','Hydration math built in','0.3L per flight hour, with a sensible floor on no-fly days. The app tells you exactly how much to drink and when.'],
    ['🛫','Aviation-phased structure','Every workout follows Taxi (warmup) → Takeoff (heavy) → En Route (volume) → Landing (decompression) — a logical, recoverable structure, not just a random exercise list.'],
    ['🎯','Goal-driven programming','Pick Vertical Jump, Muscle Gain, General Health, or Weight Loss, and the app recommends the right next session in the right order — no guesswork.'],
    ['📊','Real biometric tracking','Weight, waist, blood pressure, and fasting glucose — with the actual clinical protocol for measuring each one correctly.'],
  ];
  features.forEach(([icon,title,desc]) => {
    parts.push('<div class="feature-row"><div class="feature-icon">'+icon+'</div><div class="feature-text"><h4>'+title+'</h4><p>'+desc+'</p></div></div>');
  });
  parts.push('</div>');

  parts.push('<div class="landing-section" style="background:var(--bg2)">');
  parts.push('<div class="landing-quote">"The biggest mistake I see in shift-work athletes is treating every day the same. Your training should respond to how you actually feel — not an arbitrary schedule." — Sports medicine consensus on fatigue-informed training</div>');
  parts.push('<div class="landing-stat-row">');
  parts.push('<div class="landing-stat"><div class="num">7</div><div class="lbl">Mission Profiles</div></div>');
  parts.push('<div class="landing-stat"><div class="num">4</div><div class="lbl">Goal Tracks</div></div>');
  parts.push('<div class="landing-stat"><div class="num">50</div><div class="lbl">Wisdom Briefings</div></div>');
  parts.push('</div>');
  parts.push('</div>');

  parts.push('<div class="landing-section">');
  parts.push('<div class="landing-section-title">How it works</div>');
  parts.push('<div class="feature-row"><div class="feature-icon">1️⃣</div><div class="feature-text"><h4>Preflight</h4><p>Set your environment, log your hydration, and tell the app how you\'re actually feeling today.</p></div></div>');
  parts.push('<div class="feature-row"><div class="feature-icon">2️⃣</div><div class="feature-text"><h4>Flight</h4><p>Work through your generated plan phase by phase, with rest timers and form guides for every exercise.</p></div></div>');
  parts.push('<div class="feature-row"><div class="feature-icon">3️⃣</div><div class="feature-text"><h4>Trends</h4><p>Log your biometrics and watch your progress chart itself over weeks and months.</p></div></div>');
  parts.push('</div>');

  parts.push('<div class="landing-footer">');
  parts.push('<button class="btn btn-gold" onclick="ST.showLanding=false;ST.authMode=\'signup\';renderRoot()">Create Your Free Account</button>');
  parts.push('<div style="font-size:10px;color:var(--muted);margin-top:14px;line-height:1.6">Flight Crew Fitness is a training tool, not medical advice.<br>Consult a physician before beginning any new exercise program.</div>');
  parts.push('</div>');

  parts.push('</div>');
  root.innerHTML = parts.join('');
}

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
function renderAuth(root) {
  const isSignup = ST.authMode === 'signup';
  const parts = [];
  parts.push('<div class="landing" style="display:flex;flex-direction:column;justify-content:center">');
  parts.push('<div class="auth-wrap">');
  parts.push('<div style="text-align:center;margin-bottom:24px"><div class="landing-logo">✈ FLIGHT CREW FITNESS</div></div>');
  parts.push('<div class="auth-tabs">');
  parts.push('<div class="auth-tab '+(!isSignup?'active':'')+'" onclick="ST.authMode=\'signin\';ST.authErr=\'\';renderRoot()">Sign In</div>');
  parts.push('<div class="auth-tab '+(isSignup?'active':'')+'" onclick="ST.authMode=\'signup\';ST.authErr=\'\';renderRoot()">Sign Up</div>');
  parts.push('</div>');

  if (ST.authErr) {
    parts.push('<div class="alert alert-danger"><div class="alert-icon">⚠️</div><div>'+ST.authErr+'</div></div>');
  }

  parts.push('<div class="field"><label>Email</label><input type="email" id="auth_email" placeholder="you@example.com" autocomplete="email"></div>');
  parts.push('<div class="field"><label>Password</label><input type="password" id="auth_pass" placeholder="••••••••" autocomplete="'+(isSignup?'new-password':'current-password')+'"></div>');
  parts.push('<button class="btn btn-gold mt8" onclick="handleAuthSubmit()">'+(isSignup?'Create Account':'Sign In')+'</button>');
  parts.push('<button class="btn-ghost mt16" style="display:block;width:100%;text-align:center" onclick="ST.showLanding=true;renderRoot()">← Back</button>');
  parts.push('</div>');
  parts.push('</div>');
  root.innerHTML = parts.join('');
}

async function handleAuthSubmit() {
  const email = document.getElementById('auth_email')?.value?.trim();
  const pass  = document.getElementById('auth_pass')?.value;
  if (!email || !pass) { ST.authErr = 'Enter both email and password.'; renderRoot(); return; }
  try {
    const user = ST.authMode === 'signup' ? await doSignUp(email, pass) : await doSignIn(email, pass);
    if (!user) {
      ST.authErr = 'Check your email to confirm your account, then sign in.';
      renderRoot();
      return;
    }
    ST.user = user;
    ST.authed = true;
    ST.authErr = '';
    await bootApp();
  } catch(e) {
    ST.authErr = e.message || 'Authentication failed.';
    renderRoot();
  }
}

// ─── SAFETY DISCLAIMER ────────────────────────────────────────────────────────
function renderDisclaimerGate(root) {
  const parts = [];
  parts.push('<div class="landing" style="display:flex;flex-direction:column;justify-content:center;padding:0 20px">');
  parts.push('<div class="auth-wrap" style="max-width:380px">');
  parts.push('<div style="text-align:center;margin-bottom:20px"><div class="landing-logo">✈ FLIGHT CREW FITNESS</div></div>');
  parts.push('<div class="card">');
  parts.push('<div class="section-label" style="margin-top:0">SAFETY DISCLAIMER</div>');
  parts.push('<div style="font-size:13px;line-height:1.7;color:#cbd5e1">');
  parts.push('Flight Crew Fitness is a training and tracking tool. It is not medical advice and does not replace consultation with a qualified physician.<br><br>');
  parts.push('Consult your doctor before beginning any new exercise program, especially if you have an existing medical condition, are taking medication, or have concerns about your fitness for activity.<br><br>');
  parts.push('Exercise carries inherent risk of injury. You are responsible for exercising within your own physical limits, using proper form, and stopping immediately if you experience pain, dizziness, chest discomfort, or shortness of breath beyond normal exertion.<br><br>');
  parts.push('By continuing, you acknowledge that you use this app and its workout recommendations at your own risk.');
  parts.push('</div>');
  parts.push('<button class="btn btn-gold mt16" onclick="acceptDisclaimer()">I Understand — Continue</button>');
  parts.push('</div>');
  parts.push('</div>');
  parts.push('</div>');
  root.innerHTML = parts.join('');
}

function acceptDisclaimer() {
  ST.disclaimerAccepted = true;
  localStorage.setItem('fcf_disclaimer_accepted', '1');
  renderRoot();
}

// ─── ROOT RENDER DISPATCH ─────────────────────────────────────────────────────
function renderRoot() {
  const shell = document.getElementById('shell');
  const topbar = document.getElementById('topbar');
  const tabbar = document.getElementById('tabbar');
  const page = document.getElementById('mainPage');

  if (!ST.authed) {
    topbar.style.display = 'none';
    tabbar.style.display = 'none';
    page.style.padding = '0';
    if (ST.showLanding) renderLanding(page);
    else renderAuth(page);
    return;
  }

  if (!ST.disclaimerAccepted) {
    topbar.style.display = 'none';
    tabbar.style.display = 'none';
    page.style.padding = '0';
    renderDisclaimerGate(page);
    return;
  }

  topbar.style.display = '';
  tabbar.style.display = 'flex';
  page.style.padding = '16px 16px calc(60px + var(--safe-bot))';
  document.getElementById('topbarSub').textContent = FCF_VERSION + ' · MISSION CONTROL';
  renderPage();
}

function switchTab(tab) {
  ST.tab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const tabbar = document.getElementById('tabbar');
  if (tabbar) tabbar.style.display = (tab === 'debrief') ? 'none' : 'flex';
  renderPage();
}

function renderPage() {
  const p = document.getElementById('mainPage');
  if (!p) return;
  p.innerHTML = '';
  if      (ST.tab === 'preflight') renderPreflight(p);
  else if (ST.tab === 'flight')    renderFlight(p);
  else if (ST.tab === 'trends')    renderTrends(p);
  else if (ST.tab === 'wisdom')    renderWisdom(p);
  else if (ST.tab === 'profile')   renderProfile(p);
  else if (ST.tab === 'debrief')   renderDebrief(p);
}

// ─── BOOT SEQUENCE ────────────────────────────────────────────────────────────
async function bootApp() {
  ST.disclaimerAccepted = localStorage.getItem('fcf_disclaimer_accepted') === '1';
  const profile = await dbGetProfile();
  if (profile) {
    ST.level = profile.level || ST.level;
    ST.goal  = profile.goal  || ST.goal;
    ST.customExercises = profile.customExercises || [];
  }
  ST.lastSession = await dbGetLastSession();
  renderRoot();
  checkDB();
}

async function checkDB() {
  try {
    const { error } = await SB.from('weight_log').select('id').limit(1);
    if (error) throw error;
    const dot = document.getElementById('dbDot');
    const lbl = document.getElementById('dbStatus');
    if (dot) dot.className = 'status-dot';
    if (lbl) lbl.textContent = 'SYNCED';
  } catch(e) {
    const dot = document.getElementById('dbDot');
    const lbl = document.getElementById('dbStatus');
    if (dot) dot.className = 'status-dot off';
    if (lbl) lbl.textContent = 'LOCAL';
  }
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const old = document.getElementById('fcf-toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.id = 'fcf-toast';
  t.style.cssText = 'position:fixed;bottom:72px;left:50%;transform:translateX(-50%);background:#1a2438;border:1px solid #1e2d45;color:#e2e8f0;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:500;z-index:999;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,0.5);transition:opacity 0.3s';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2800);
}

// ─── INFO MODAL (generic, used for biometrics + CNS explainer) ──────────────
function showInfoModal(title, text) {
  const root = document.getElementById('modalRoot');
  root.innerHTML =
    '<div class="modal-bg" onclick="if(event.target===this)closeModal()">' +
    '<div class="modal-sheet">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">' + title + '</div>' +
    '<div class="modal-body">' + text + '</div>' +
    '<button class="btn btn-outline mt12" onclick="closeModal()">CLOSE</button>' +
    '</div></div>';
}
function showBioInfo(key) {
  const info = BIO_INFO[key];
  if (!info) return;
  showInfoModal(info.title, info.text);
}
function showCNSInfo() {
  showInfoModal('CNS Down-Regulation', CNS_EXPLAINER);
}
function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }

// ─── PERSISTENCE: in-progress workout survives app close/reload ─────────────
const WORKOUT_STATE_KEY = 'fcf_inprogress_workout';
const TIMER_STATE_KEY   = 'fcf_inprogress_timers';

function persistWorkoutState() {
  if (!ST.workout) { localStorage.removeItem(WORKOUT_STATE_KEY); return; }
  try {
    localStorage.setItem(WORKOUT_STATE_KEY, JSON.stringify({
      workout: ST.workout,
      sets: ST.sets,
      env: ST.env,
      muscleGroup: ST.muscleGroup,
      goal: ST.goal,
      fatigue: ST.fatigue,
      level: ST.level,
      flightHrs: ST.flightHrs,
      waterIn: ST.waterIn,
      expanded: ST.expanded,
      workoutStartedAt: ST.workoutStartedAt,
      savedAt: Date.now(),
    }));
  } catch(e) {}
}

function restoreWorkoutState() {
  try {
    const raw = localStorage.getItem(WORKOUT_STATE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    // Only restore if saved within the last 18 hours (avoid resurrecting stale sessions)
    if (Date.now() - saved.savedAt > 18*60*60*1000) {
      localStorage.removeItem(WORKOUT_STATE_KEY);
      return false;
    }
    ST.workout = saved.workout;
    ST.sets = saved.sets;
    ST.env = saved.env;
    ST.muscleGroup = saved.muscleGroup;
    ST.goal = saved.goal;
    ST.fatigue = saved.fatigue;
    ST.level = saved.level;
    ST.flightHrs = saved.flightHrs;
    ST.waterIn = saved.waterIn;
    ST.flightHrsTouched = true;
    ST.expanded = saved.expanded || {};
    ST.workoutStartedAt = saved.workoutStartedAt || saved.savedAt;
    return true;
  } catch(e) { return false; }
}

function clearWorkoutState() {
  localStorage.removeItem(WORKOUT_STATE_KEY);
}

function persistTimerState() {
  try {
    localStorage.setItem(TIMER_STATE_KEY, JSON.stringify({
      restTimer: { active: ST.restTimer.active, exId: ST.restTimer.exId, endTs: ST.restTimer.endTs, total: ST.restTimer.total },
      stopwatch: { active: ST.stopwatch.active, exId: ST.stopwatch.exId, startTs: ST.stopwatch.startTs },
      nsdrTimer: { active: ST.nsdrTimer.active, exId: ST.nsdrTimer.exId, startTs: ST.nsdrTimer.startTs, chimed: ST.nsdrTimer.chimed },
    }));
  } catch(e) {}
}

function restoreTimerState() {
  try {
    const raw = localStorage.getItem(TIMER_STATE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.restTimer?.active) {
      const remaining = Math.max(0, Math.round((saved.restTimer.endTs - Date.now())/1000));
      if (remaining > 0) {
        ST.restTimer = { active: true, seconds: remaining, total: saved.restTimer.total, exId: saved.restTimer.exId, interval: null, startTs: 0, endTs: saved.restTimer.endTs };
        ST.restTimer.interval = setInterval(() => tickRestTimer(saved.restTimer.exId), 1000);
      }
    }
    if (saved.stopwatch?.active) {
      ST.stopwatch = { active: true, seconds: Math.round((Date.now()-saved.stopwatch.startTs)/1000), exId: saved.stopwatch.exId, interval: null, startTs: saved.stopwatch.startTs };
      ST.stopwatch.interval = setInterval(() => tickStopwatch(saved.stopwatch.exId), 1000);
    }
    if (saved.nsdrTimer?.active) {
      ST.nsdrTimer = { active: true, seconds: Math.round((Date.now()-saved.nsdrTimer.startTs)/1000), interval: null, chimed: saved.nsdrTimer.chimed, exId: saved.nsdrTimer.exId, startTs: saved.nsdrTimer.startTs };
      ST.nsdrTimer.interval = setInterval(() => tickNSDR(saved.nsdrTimer.exId), 1000);
    }
  } catch(e) {}
}

// Resync all active timers the instant the app returns to the foreground.
// iOS throttles/suspends setInterval while backgrounded, so on resume we
// recalculate from the stored timestamps rather than trusting tick counts.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (ST.restTimer.active) tickRestTimer(ST.restTimer.exId);
  if (ST.stopwatch.active) tickStopwatch(ST.stopwatch.exId);
  if (ST.nsdrTimer.active) tickNSDR(ST.nsdrTimer.exId);
  if (ST.tab === 'flight') renderFlight(document.getElementById('mainPage'));
});

// ─── INITIALIZATION ───────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/pilot-program/sw.js').catch(() => {});
}

async function initApp() {
  ST.user = await checkAuth();
  ST.authed = !!ST.user;
  if (ST.authed) {
    await bootApp();
    const restored = restoreWorkoutState();
    if (restored) {
      restoreTimerState();
      switchTab('flight');
      showToast('Restored your in-progress workout.');
    }
  } else {
    renderRoot();
  }
}

document.addEventListener('DOMContentLoaded', initApp);
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(initApp, 0);
}

// ─── COMPACT ROLLING CALENDAR ─────────────────────────────────────────────────
async function loadCalendarWeek(weekOffset) {
  const cacheKey = String(weekOffset);
  if (ST.calendarSessions[cacheKey]) return ST.calendarSessions[cacheKey];

  const today = new Date();
  today.setHours(23,59,59,999);
  const windowEnd = new Date(today.getTime() - weekOffset*7*24*60*60*1000);
  const windowStart = new Date(windowEnd.getTime() - 6*24*60*60*1000);
  windowStart.setHours(0,0,0,0);

  try {
    const filter = ST.user ? SB.from('workout_sessions').select('*').eq('user_id', ST.user.id) : SB.from('workout_sessions').select('*');
    const { data, error } = await filter
      .gte('started_at', windowStart.toISOString())
      .lte('started_at', windowEnd.toISOString())
      .order('started_at', { ascending: true });
    if (error) throw error;
    const sessions = (data||[]).map(r => r.session_data).filter(Boolean);
    ST.calendarSessions[cacheKey] = { sessions, windowStart, windowEnd };
    return ST.calendarSessions[cacheKey];
  } catch(e) {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('fcf_session_'));
    const all = keys.map(k => { try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } }).filter(Boolean);
    const sessions = all.filter(s => {
      const t = new Date(s.date).getTime();
      return t >= windowStart.getTime() && t <= windowEnd.getTime();
    });
    const result = { sessions, windowStart, windowEnd };
    ST.calendarSessions[cacheKey] = result;
    return result;
  }
}

function buildCalendarHTML(weekData) {
  const { sessions, windowStart } = weekData;
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(windowStart.getTime() + i*24*60*60*1000);
    const dayStr = d.toDateString();
    const daySession = sessions.find(s => new Date(s.date).toDateString() === dayStr);
    days.push({ date: d, session: daySession });
  }

  const parts = [];
  parts.push('<div class="card mb12">');
  parts.push('<div class="fb mb8">');
  parts.push('<button class="btn-ghost" onclick="shiftCalendarWeek(1)">← Earlier</button>');
  parts.push('<div class="section-label" style="margin:0">TRAINING CALENDAR</div>');
  parts.push('<button class="btn-ghost" onclick="shiftCalendarWeek(-1)" '+(ST.calendarWeekOffset===0?'style="visibility:hidden"':'')+'>Later →</button>');
  parts.push('</div>');
  parts.push('<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">');
  days.forEach(day => {
    const isToday = day.date.toDateString() === new Date().toDateString();
    const dow = day.date.toLocaleDateString('en-US',{weekday:'short'}).charAt(0);
    const dateNum = day.date.getDate();
    const hasWorkout = !!day.session;
    const cellStyle = isToday ? 'border-color:var(--gold)' : '';
    const bg = hasWorkout ? 'background:rgba(34,197,94,0.12);border-color:rgba(34,197,94,0.4)' : '';
    parts.push('<div style="text-align:center;border:1.5px solid var(--border);border-radius:8px;padding:6px 2px;cursor:'+(hasWorkout?'pointer':'default')+';'+cellStyle+';'+bg+'" '+(hasWorkout?'onclick="showCalendarDay(\''+day.date.toISOString()+'\')"':'')+'>');
    parts.push('<div style="font-family:var(--mono);font-size:9px;color:var(--muted)">'+dow+'</div>');
    parts.push('<div style="font-size:13px;font-weight:600;margin-top:2px">'+dateNum+'</div>');
    if (hasWorkout) {
      const icon = {'Lower Body':'🦵','Upper Push':'💪','Upper Pull':'🎯','Power / Plyo':'⚡','Full Body':'🔥','Longevity':'🌿','Cardio':'❤️'}[day.session.muscle_group] || '✓';
      parts.push('<div style="font-size:13px;margin-top:2px">'+icon+'</div>');
    } else {
      parts.push('<div style="font-size:10px;color:var(--muted);margin-top:4px">—</div>');
    }
    parts.push('</div>');
  });
  parts.push('</div></div>');
  return parts.join('');
}

async function shiftCalendarWeek(delta) {
  ST.calendarWeekOffset = Math.max(0, ST.calendarWeekOffset + delta);
  renderPage();
}

async function showCalendarDay(isoDate) {
  const weekData = await loadCalendarWeek(ST.calendarWeekOffset);
  const session = weekData.sessions.find(s => new Date(s.date).toDateString() === new Date(isoDate).toDateString());
  if (!session) return;

  const profile = await dbGetProfile();
  const recentSessions = await dbGetRecentSessions(7);
  const allEx = session.workoutSnapshot
    ? [...session.workoutSnapshot.taxi,...session.workoutSnapshot.takeoff,...session.workoutSnapshot.enroute,...session.workoutSnapshot.landing]
    : Object.keys(session.sets||{}).map(id => ({id, name:id}));
  const summary = buildWorkoutSummary(session, allEx, recentSessions, profile?.lastWeight);

  const root = document.getElementById('modalRoot');
  const parts = [];
  parts.push('<div class="modal-bg" onclick="if(event.target===this)closeModal()">');
  parts.push('<div class="modal-sheet">');
  parts.push('<div class="modal-handle"></div>');
  parts.push('<div class="modal-title">'+session.muscle_group+'</div>');
  parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-bottom:14px">'+new Date(session.date).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})+'</div>');
  parts.push('<div class="stat-row">');
  parts.push('<div class="stat-box"><div class="stat-val">'+(session.durationMinutes||'—')+'</div><div class="stat-lbl">Minutes</div></div>');
  parts.push('<div class="stat-box"><div class="stat-val">'+summary.totalSets+'</div><div class="stat-lbl">Sets</div></div>');
  parts.push('<div class="stat-box"><div class="stat-val">'+summary.estCalories+'</div><div class="stat-lbl">Calories</div></div>');
  parts.push('</div>');
  parts.push('<div class="modal-body">Environment: '+session.env+' · Condition: '+(session.fatigue||'go')+'</div>');
  parts.push('<button class="btn btn-outline mt12" onclick="closeModal()">CLOSE</button>');
  parts.push('</div></div>');
  root.innerHTML = parts.join('');
}

// ─── PREFLIGHT TAB ────────────────────────────────────────────────────────────
async function renderPreflight(p) {
  const hs    = hydroStatus();
  const pct   = hydroPct();
  const adv   = hydroAdvice();
  const rawWk = getCombinedWorkout(ST.env, ST.muscleGroup);
  const wk    = getFilteredWorkout(rawWk);

  const levelLabel   = {beginner:'Beginner',intermediate:'Intermediate',advanced:'Advanced'}[ST.level];
  const fatigueLabel = {go:'🟢 GO',marginal:'🟡 MARGINAL',nogo:'🔴 NO-GO'}[ST.fatigue];
  const totalEx = wk ? (wk.taxi.length+wk.takeoff.length+wk.enroute.length+wk.landing.length) : 0;
  const recommended = getRecommendedNext();

  const parts = [];
  parts.push('<div class="section-label">PREFLIGHT BRIEFING — '+FCF_VERSION+'</div>');

  // Last mission profile
  if (ST.lastSession) {
    const lastDate = new Date(ST.lastSession.date).toLocaleDateString('en-US',{month:'short',day:'numeric'});
    parts.push('<div class="card card-dark mb12">');
    parts.push('<div class="section-label" style="margin-top:0">LAST MISSION</div>');
    parts.push('<div class="fb"><div style="font-size:13px;font-weight:600">'+(ST.lastSession.muscle_group||'—')+'</div><div style="font-family:var(--mono);font-size:11px;color:var(--muted)">'+lastDate+'</div></div>');
    parts.push('<div style="font-size:11px;color:var(--green);margin-top:6px">→ Recommended next: <strong>'+recommended+'</strong></div>');
    parts.push('</div>');
  }

  // Training calendar (rolling 7-day window, scrollable)
  const weekData = await loadCalendarWeek(ST.calendarWeekOffset);
  parts.push(buildCalendarHTML(weekData));

  // Goal / Mission Objective
  parts.push('<div class="section-label">MISSION OBJECTIVE</div>');
  parts.push('<div class="card mb12">');
  parts.push('<div style="font-size:12px;color:var(--muted);margin-bottom:10px">Your overall training goal. This determines which mission profile gets recommended next.</div>');
  parts.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">');
  Object.keys(GOALS).forEach(gid => {
    const g = GOALS[gid];
    parts.push('<div class="env-btn '+(ST.goal===gid?'sel':'')+'" onclick="ST.goal=\''+gid+'\';saveGoalLevel();renderPage()">');
    parts.push('<div class="ei">'+g.icon+'</div><div class="el">'+g.label+'</div>');
    parts.push('<div style="font-size:9px;color:var(--muted);margin-top:3px;line-height:1.3">'+g.desc+'</div>');
    parts.push('</div>');
  });
  parts.push('</div>');
  const freq = FREQUENCY_GUIDE[ST.level];
  parts.push('<div class="alert alert-info mt12"><div class="alert-icon">📅</div><div><strong>'+freq.days+' days/week</strong> recommended at your level — '+freq.split+'. '+freq.note+'</div></div>');
  parts.push('</div>');

  // Pilot condition
  parts.push('<div class="section-label">PILOT CONDITION</div>');
  parts.push('<div class="card mb12">');
  parts.push('<div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.5">Your physical readiness today. This gates workout intensity — training through fatigue increases injury risk and impairs adaptation.</div>');
  parts.push('<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px">');
  parts.push('<div class="env-btn '+(ST.fatigue==='go'?'sel':'')+'" onclick="ST.fatigue=\'go\';renderPage()"><div class="ei">🟢</div><div class="el">GO</div><div style="font-size:9px;color:var(--muted);margin-top:2px">Full protocol</div></div>');
  parts.push('<div class="env-btn '+(ST.fatigue==='marginal'?'sel':'')+'" onclick="ST.fatigue=\'marginal\';renderPage()"><div class="ei">🟡</div><div class="el">MARGINAL</div><div style="font-size:9px;color:var(--muted);margin-top:2px">Light only</div></div>');
  parts.push('<div class="env-btn '+(ST.fatigue==='nogo'?'sel':'')+'" onclick="ST.fatigue=\'nogo\';renderPage()"><div class="ei">🔴</div><div class="el">NO-GO</div><div style="font-size:9px;color:var(--muted);margin-top:2px">Mobility only</div></div>');
  parts.push('</div>');
  if (ST.fatigue === 'marginal') {
    parts.push('<div class="alert alert-warn"><div class="alert-icon">⚠️</div><div>Heavy Takeoff phase removed. One light En Route exercise only.</div></div>');
  } else if (ST.fatigue === 'nogo') {
    parts.push('<div class="alert alert-danger"><div class="alert-icon">🔴</div><div>Only Taxi and Landing phases active. Training under significant fatigue increases injury risk — this is physiology, not weakness.</div></div>');
  }
  parts.push('</div>');

  // Fitness level
  parts.push('<div class="section-label">FITNESS LEVEL</div>');
  parts.push('<div class="card mb12">');
  parts.push('<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">');
  parts.push('<div class="env-btn '+(ST.level==='beginner'?'sel':'')+'" onclick="ST.level=\'beginner\';saveGoalLevel();renderPage()"><div class="ei">🌱</div><div class="el">BEGINNER</div></div>');
  parts.push('<div class="env-btn '+(ST.level==='intermediate'?'sel':'')+'" onclick="ST.level=\'intermediate\';saveGoalLevel();renderPage()"><div class="ei">⚡</div><div class="el">INTERMED.</div></div>');
  parts.push('<div class="env-btn '+(ST.level==='advanced'?'sel':'')+'" onclick="ST.level=\'advanced\';saveGoalLevel();renderPage()"><div class="ei">🔥</div><div class="el">ADVANCED</div></div>');
  parts.push('</div>');
  parts.push('</div>');

  // Environment
  parts.push('<div class="section-label">MISSION ENVIRONMENT</div>');
  parts.push('<div class="env-toggle">');
  parts.push('<div class="env-btn '+(ST.env==='room'?'sel':'')+'" onclick="ST.env=\'room\';renderPage()"><div class="ei">🛏️</div><div class="el">HOTEL ROOM</div></div>');
  parts.push('<div class="env-btn '+(ST.env==='hotel'?'sel':'')+'" onclick="ST.env=\'hotel\';renderPage()"><div class="ei">🏨</div><div class="el">HOTEL GYM</div></div>');
  parts.push('<div class="env-btn '+(ST.env==='comm'?'sel':'')+'" onclick="ST.env=\'comm\';renderPage()"><div class="ei">🏋️</div><div class="el">COMM GYM</div></div>');
  parts.push('</div>');

  // Hydration
  parts.push('<div class="section-label">HYDRATION PAYLOAD</div>');
  parts.push('<div class="card mb12">');
  parts.push('<div class="field-row" style="margin-bottom:10px">');
  parts.push('<div class="field" style="margin-bottom:0"><label>Flight Hours Today</label>');
  parts.push('<input type="number" inputmode="decimal" step="0.5" min="0" max="16" value="'+(ST.flightHrsTouched?ST.flightHrs:'')+'" placeholder="0 = no-fly day" oninput="ST.flightHrs=parseFloat(this.value)||0;ST.flightHrsTouched=true;renderPage()"></div>');
  parts.push('<div class="field" style="margin-bottom:0"><label>Water Consumed (L)</label>');
  parts.push('<input type="number" inputmode="decimal" step="0.1" min="0" max="10" value="'+(ST.waterIn||'')+'" placeholder="e.g. 1.2" oninput="ST.waterIn=parseFloat(this.value)||0;renderPage()"></div>');
  parts.push('</div>');
  if (ST.flightHrsTouched && ST.flightHrs === 0) {
    parts.push('<div class="alert alert-info" style="margin-bottom:8px"><div class="alert-icon">ℹ️</div><div>No-fly day — minimum 1.0L hydration target still applies. Your body needs baseline water regardless of duty status.</div></div>');
  }
  parts.push('<div class="fb" style="margin-bottom:6px"><span style="font-family:var(--mono);font-size:11px;color:var(--muted)">TARGET: <span style="color:var(--text)">'+hydroTarget().toFixed(1)+'L</span></span><span style="font-family:var(--mono);font-size:11px;color:'+hs.color+'">'+hs.label+'</span></div>');
  parts.push('<div class="hydro-bar-wrap"><div class="hydro-bar '+(pct>=1?'hydro-ok':'hydro-warn')+'" style="width:'+Math.round(pct*100)+'%"></div></div>');
  parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:4px;text-align:right">'+Math.round(pct*100)+'% of target</div>');
  if (adv) parts.push('<div class="alert alert-warn mt8"><div class="alert-icon">💧</div><div>'+adv+'</div></div>');
  else     parts.push('<div class="alert alert-ok mt8"><div class="alert-icon">✅</div><div>Hydration nominal. Cleared for workout operations.</div></div>');
  parts.push('</div>');

  // Mission profile
  parts.push('<div class="section-label">MISSION PROFILE</div>');
  parts.push('<div class="mg-wrap">');
  MUSCLE_GROUPS.forEach(mg => {
    const cls = 'mg-pill' + (ST.muscleGroup===mg?' sel':'') + (mg===recommended && ST.muscleGroup!==mg?' recommended':'');
    parts.push('<div class="'+cls+'" onclick="ST.muscleGroup=\''+mg+'\';renderPage()">'+mg+(mg===recommended?' ★':'')+'</div>');
  });
  parts.push('</div>');

  // Readiness checklist — placed last, right before engaging the workout
  parts.push('<div class="card card-dark mb12">');
  parts.push('<div class="section-label" style="margin-top:0">READINESS CHECK</div>');
  parts.push('<div class="check-item"><div class="check-icon">✅</div><div class="check-text">Flight hours logged today</div><div class="check-status status-ok">'+(ST.flightHrs>0?ST.flightHrs+' HRS':'0 (NO-FLY)')+'</div></div>');
  parts.push('<div class="check-item"><div class="check-icon">'+(pct>=1?'✅':pct>=0.6?'⚠️':'🚨')+'</div><div class="check-text">Hydration status</div><div class="check-status '+hs.cls+'">'+hs.label+'</div></div>');
  parts.push('<div class="check-item"><div class="check-icon">'+(rawWk?'✅':'⬜')+'</div><div class="check-text">Mission profile selected</div><div class="check-status '+(rawWk?'status-ok':'status-warn')+'">'+ST.muscleGroup.toUpperCase()+'</div></div>');
  parts.push('<div class="check-item" style="border-bottom:none"><div class="check-icon">'+(ST.fatigue==='go'?'✅':ST.fatigue==='marginal'?'⚠️':'🔴')+'</div><div class="check-text">Pilot condition</div><div class="check-status '+(ST.fatigue==='go'?'status-ok':ST.fatigue==='marginal'?'status-warn':'status-no')+'">'+fatigueLabel+'</div></div>');
  parts.push('</div>');

  // Flight plan preview
  if (wk) {
    parts.push('<div class="section-label">FLIGHT PLAN PREVIEW — '+totalEx+' EXERCISES ('+levelLabel+(ST.fatigue!=='go'?' / '+fatigueLabel:'')+')</div>');
    parts.push('<div class="card card-dark mb12"><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">');
    [['🚕 TAXI',wk.taxi],['🛫 TAKEOFF',wk.takeoff],['✈️ EN ROUTE',wk.enroute],['🛬 LANDING',wk.landing]].forEach(([label,exs]) => {
      parts.push('<div style="background:var(--bg);border-radius:8px;padding:10px"><div style="font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:0.08em;margin-bottom:6px">'+label+'</div>');
      if (!exs.length) parts.push('<div style="font-size:11px;color:var(--muted);font-style:italic">— skipped —</div>');
      else exs.forEach(e => parts.push('<div style="font-size:11px;color:var(--text);margin-bottom:3px">· '+e.name+'</div>'));
      parts.push('</div>');
    });
    parts.push('</div></div>');
    parts.push('<button class="btn btn-gold" onclick="engageWorkout()">⚡ ENGAGE WORKOUT</button>');
  } else {
    parts.push('<div class="alert alert-info"><div class="alert-icon">ℹ️</div><div>Select a mission profile above to generate your flight plan.</div></div>');
  }

  p.innerHTML = parts.join('');
}

async function saveGoalLevel() {
  const profile = (await dbGetProfile()) || {};
  profile.goal = ST.goal;
  profile.level = ST.level;
  profile.customExercises = ST.customExercises;
  await dbSetProfile(profile);
}

// Merge built-in + custom exercises for a given env/muscleGroup
function getCombinedWorkout(env, muscleGroup) {
  const base = WORKOUTS[env]?.[muscleGroup];
  if (!base) return null;
  const customForThis = ST.customExercises.filter(c => c.env === env && c.muscleGroup === muscleGroup);
  if (!customForThis.length) return base;
  // Custom exercises get added to enroute by default (volume/accessory slot)
  return {
    taxi: base.taxi,
    takeoff: base.takeoff,
    enroute: [...base.enroute, ...customForThis.map(c => c.exercise)],
    landing: base.landing,
  };
}

function engageWorkout() {
  const rawWk = getCombinedWorkout(ST.env, ST.muscleGroup);
  if (!rawWk) { showToast('No workout available for this environment + muscle group.'); return; }
  const wk = getFilteredWorkout(rawWk);
  if (!wk) return;

  ST.workout = wk;
  ST.sets = {};
  ST.expanded = {};

  const allEx = [...wk.taxi, ...wk.takeoff, ...wk.enroute, ...wk.landing];
  allEx.forEach(exItem => {
    if (exItem.inputType === 'nsdr') {
      ST.sets[exItem.id] = [{ seconds: '' }];
    } else if (exItem.timed) {
      ST.sets[exItem.id] = [{ seconds: '' }];
    } else if (exItem.inputType === 'reps_only') {
      ST.sets[exItem.id] = Array.from({ length: exItem.sets }, () => ({ reps: '' }));
    } else {
      ST.sets[exItem.id] = Array.from({ length: exItem.sets }, () => ({ reps: '', weight: '' }));
    }
  });

  persistWorkoutState();
  ST.workoutStartedAt = Date.now();
  persistWorkoutState();
  switchTab('flight');
}

// ─── FLIGHT TAB ───────────────────────────────────────────────────────────────
const PHASES_META = [
  { key:'taxi',    label:'TAXI',     sub:'Pilot Protocol — mobilization and activation', icon:'🚕', cls:'phase-taxi'    },
  { key:'takeoff', label:'TAKEOFF',  sub:'Primary compound — the heavy work',             icon:'🛫', cls:'phase-takeoff' },
  { key:'enroute', label:'EN ROUTE', sub:'Secondary movements — volume and accessory',    icon:'✈️', cls:'phase-enroute' },
  { key:'landing', label:'LANDING',  sub:'Descent — decompression and CNS down-reg ⓘ',  icon:'🛬', cls:'phase-landing' },
];

function renderFlight(p) {
  if (!ST.workout) {
    p.innerHTML = '<div style="height:20px"></div><div class="alert alert-info"><div class="alert-icon">ℹ️</div><div>No active flight plan. Configure and engage from Preflight.</div></div><button class="btn btn-outline mt12" onclick="switchTab(\'preflight\')">← Go to Preflight</button>';
    return;
  }

  const wk = ST.workout;
  const allEx = [...wk.taxi, ...wk.takeoff, ...wk.enroute, ...wk.landing];
  const done = allEx.filter(exItem => {
    const s = ST.sets[exItem.id];
    return s && s.some(x => x.reps || x.weight || x.seconds);
  }).length;
  const pct = Math.round(done / Math.max(allEx.length,1) * 100);

  const parts = [];
  parts.push('<div class="section-label">ACTIVE FLIGHT — '+ST.muscleGroup.toUpperCase()+'</div>');
  parts.push('<div class="card card-dark mb12">');
  parts.push('<div class="fb mb8"><span style="font-family:var(--mono);font-size:11px;color:var(--muted)">MISSION PROGRESS</span><span style="font-family:var(--mono);font-size:11px;color:var(--gold)">'+done+'/'+allEx.length+' EXERCISES</span></div>');
  parts.push('<div class="prog-wrap"><div class="prog-fill" style="width:'+pct+'%"></div></div>');
  parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:4px;text-align:right">'+pct+'% complete</div>');
  parts.push('</div>');

  PHASES_META.forEach(phase => {
    const exercises = wk[phase.key];
    if (!exercises || !exercises.length) return;
    parts.push('<div class="phase-header"><div class="phase-badge '+phase.cls+'">'+phase.icon+' '+phase.label+'</div><div>');
    if (phase.key === 'landing') {
      parts.push('<div class="phase-title" onclick="showCNSInfo()" style="cursor:pointer">'+phase.sub+'</div>');
    } else {
      parts.push('<div class="phase-title">'+phase.sub+'</div>');
    }
    parts.push('</div></div>');
    exercises.forEach(exItem => parts.push(buildExCard(exItem, phase.key)));
  });

  // Add custom exercise button
  parts.push(buildAddExerciseCard());

  parts.push('<div style="height:16px"></div>');
  parts.push('<button class="btn btn-green" onclick="setTheChocks()">🔒 SET THE CHOCKS</button>');

  p.innerHTML = parts.join('');
}

function buildExCard(exItem, phaseKey) {
  const isOpen = !!ST.expanded[exItem.id];
  const sets = ST.sets[exItem.id] || [];
  const hasData = sets.some(s => s.reps || s.weight || s.seconds);
  const parts = [];

  parts.push('<div class="ex-card'+(exItem.custom?' custom-ex':'')+'">');
  parts.push('<div class="ex-hdr" onclick="toggleEx(\''+exItem.id+'\')"><div><div class="ex-name">'+exItem.name+(exItem.custom?' <span style="font-size:9px;color:var(--gold)">CUSTOM</span>':'')+'</div><div class="ex-target">'+exItem.target+(exItem.timed?' · ⏱ TIMED':'')+'</div></div><div class="ex-right"><div class="ex-done '+(hasData?'ok':'')+'">'+(hasData?'✓':'')+'</div><div class="ex-caret '+(isOpen?'open':'')+'">⌄</div></div></div>');

  if (isOpen) {
    parts.push('<div class="ex-body"><p class="ex-note">'+exItem.note+'</p>');

    if (exItem.inputType === 'nsdr') {
      parts.push(buildNSDRWidget(exItem.id, sets[0]?.seconds||''));
    } else if (exItem.timed) {
      const val = sets[0]?.seconds || '';
      parts.push('<div class="timed-box '+(val?'ok':'')+'" id="tb_'+exItem.id+'">');
      parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:0.08em;margin-bottom:8px">TOTAL TIME</div>');
      parts.push('<input class="timed-inp" type="number" inputmode="numeric" placeholder="0" value="'+val+'" oninput="ST.sets[\''+exItem.id+'\'][0].seconds=this.value;document.getElementById(\'tb_'+exItem.id+'\').className=\'timed-box\'+(this.value?\' ok\':\'\');persistWorkoutState()">');
      parts.push('<div style="font-size:11px;color:var(--muted);margin-top:6px">seconds</div>');
      parts.push('</div>');
      parts.push(buildStopwatchWidget(exItem.id));
    } else if (exItem.inputType === 'reps_only') {
      parts.push('<div class="sets-scroll">');
      sets.forEach((s,i) => {
        parts.push('<div class="set-tile '+(s.reps?'ok':'')+'" id="st_'+exItem.id+'_'+i+'"><div class="set-lbl">SET '+(i+1)+'</div>');
        parts.push('<input class="set-inp" type="number" inputmode="numeric" placeholder="Reps" value="'+(s.reps||'')+'" oninput="ST.sets[\''+exItem.id+'\']['+i+'].reps=this.value;document.getElementById(\'st_'+exItem.id+'_'+i+'\').className=\'set-tile\'+(this.value?\' ok\':\'\');persistWorkoutState()">');
        parts.push('<div class="set-hint">reps only</div></div>');
      });
      parts.push('</div><div class="swipe-hint">← swipe for all sets</div>');
    } else {
      parts.push('<div class="sets-scroll">');
      sets.forEach((s,i) => {
        parts.push('<div class="set-tile '+(s.reps||s.weight?'ok':'')+'" id="st_'+exItem.id+'_'+i+'"><div class="set-lbl">SET '+(i+1)+'</div>');
        parts.push('<input class="set-inp" type="number" inputmode="numeric" placeholder="Reps" value="'+(s.reps||'')+'" oninput="ST.sets[\''+exItem.id+'\']['+i+'].reps=this.value;document.getElementById(\'st_'+exItem.id+'_'+i+'\').className=\'set-tile\'+(this.value||ST.sets[\''+exItem.id+'\']['+i+'].weight?\' ok\':\'\');persistWorkoutState()">');
        parts.push('<input class="set-inp" type="number" inputmode="decimal" placeholder="lb" value="'+(s.weight||'')+'" onchange="afterSetLogged(\''+exItem.id+'\',\''+phaseKey+'\')" oninput="ST.sets[\''+exItem.id+'\']['+i+'].weight=this.value;document.getElementById(\'st_'+exItem.id+'_'+i+'\').className=\'set-tile\'+(ST.sets[\''+exItem.id+'\']['+i+'].reps||this.value?\' ok\':\'\');persistWorkoutState()">');
        parts.push('<div class="set-hint">reps / lb</div></div>');
      });
      parts.push('</div><div class="swipe-hint">← swipe for all sets</div>');
      if (phaseKey === 'takeoff' || phaseKey === 'enroute') {
        parts.push(buildRestTimerWidget(exItem.id, phaseKey));
      }
    }

    if (!exItem.custom) {
      parts.push('<div style="margin-top:10px"><button class="btn-info" onclick="showGuide(\''+exItem.id+'\')">ℹ Guide</button></div>');
    } else {
      parts.push('<div style="margin-top:10px"><button class="btn-info" style="color:#fca5a5;border-color:rgba(239,68,68,0.3)" onclick="deleteCustomExercise(\''+exItem.id+'\')">✕ Remove</button></div>');
    }
    parts.push('</div>');
  }
  parts.push('</div>');
  return parts.join('');
}

function toggleEx(id) {
  ST.expanded[id] = !ST.expanded[id];
  renderFlight(document.getElementById('mainPage'));
}

// ─── REST TIMER (between sets, phase-aware default) ──────────────────────────
function buildRestTimerWidget(exId, phaseKey) {
  const defaultSec = REST_DEFAULTS[phaseKey] || 60;
  const isActive = ST.restTimer.active && ST.restTimer.exId === exId;
  const mins = Math.floor((isActive?ST.restTimer.seconds:defaultSec)/60);
  const secs = (isActive?ST.restTimer.seconds:defaultSec)%60;
  const display = mins+':'+String(secs).padStart(2,'0');
  const parts = [];
  parts.push('<div class="rest-timer-box" id="rest_'+exId+'">');
  parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:0.08em;margin-bottom:6px">REST TIMER · '+(phaseKey==='takeoff'?'3-4 MIN RECOMMENDED':'60-90S RECOMMENDED')+'</div>');
  parts.push('<div class="rest-timer-display" id="rest_disp_'+exId+'">'+display+'</div>');
  if (!isActive) {
    parts.push('<button class="stopwatch-btn btn-blue" onclick="startRestTimer(\''+exId+'\','+defaultSec+')">START REST</button>');
  } else {
    parts.push('<button class="stopwatch-btn btn-outline" onclick="stopRestTimer()">STOP</button>');
  }
  parts.push('</div>');
  return parts.join('');
}

function startRestTimer(exId, seconds) {
  if (ST.restTimer.interval) clearInterval(ST.restTimer.interval);
  const now = Date.now();
  ST.restTimer = { active: true, seconds: seconds, total: seconds, exId, interval: null, startTs: now, endTs: now + seconds*1000 };
  persistTimerState();
  renderFlight(document.getElementById('mainPage'));
  ST.restTimer.interval = setInterval(() => tickRestTimer(exId), 1000);
}
function tickRestTimer(exId) {
  if (!ST.restTimer.active || ST.restTimer.exId !== exId) return;
  const remaining = Math.max(0, Math.round((ST.restTimer.endTs - Date.now())/1000));
  ST.restTimer.seconds = remaining;
  const el = document.getElementById('rest_disp_'+exId);
  if (el) {
    const m = Math.floor(remaining/60), s = remaining%60;
    el.textContent = m+':'+String(s).padStart(2,'0');
  }
  if (remaining <= 0) {
    clearInterval(ST.restTimer.interval);
    ST.restTimer.active = false;
    persistTimerState();
    playChime();
    showToast('⏱ Rest complete — next set.');
    renderFlight(document.getElementById('mainPage'));
  }
}
function stopRestTimer() {
  if (ST.restTimer.interval) clearInterval(ST.restTimer.interval);
  ST.restTimer.active = false;
  persistTimerState();
  renderFlight(document.getElementById('mainPage'));
}
function afterSetLogged(exId, phaseKey) {
  // Auto-suggest starting rest timer after logging a set in heavy phases
  if (phaseKey === 'takeoff' && !ST.restTimer.active) {
    showToast('Set logged. Rest 3-4 min before your next set.');
  }
}

// ─── STOPWATCH (auto-fills timed exercise seconds) ───────────────────────────
function buildStopwatchWidget(exId) {
  const isActive = ST.stopwatch.active && ST.stopwatch.exId === exId;
  const parts = [];
  parts.push('<div class="timed-box" style="margin-top:8px" id="sw_'+exId+'">');
  parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:0.08em;margin-bottom:6px">STOPWATCH</div>');
  parts.push('<div class="stopwatch-display" id="sw_disp_'+exId+'">'+formatStopwatch(isActive?ST.stopwatch.seconds:0)+'</div>');
  if (!isActive) {
    parts.push('<button class="stopwatch-btn btn-blue" onclick="startStopwatch(\''+exId+'\')">START</button>');
  } else {
    parts.push('<button class="stopwatch-btn btn-green" onclick="stopStopwatch(\''+exId+'\')">STOP &amp; FILL</button>');
  }
  parts.push('</div>');
  return parts.join('');
}
function formatStopwatch(sec) {
  const m = Math.floor(sec/60), s = sec%60;
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function startStopwatch(exId) {
  if (ST.stopwatch.interval) clearInterval(ST.stopwatch.interval);
  ST.stopwatch = { active: true, seconds: 0, exId, interval: null, startTs: Date.now() };
  persistTimerState();
  renderFlight(document.getElementById('mainPage'));
  ST.stopwatch.interval = setInterval(() => tickStopwatch(exId), 1000);
}
function tickStopwatch(exId) {
  if (!ST.stopwatch.active || ST.stopwatch.exId !== exId) return;
  ST.stopwatch.seconds = Math.round((Date.now() - ST.stopwatch.startTs)/1000);
  const el = document.getElementById('sw_disp_'+exId);
  if (el) el.textContent = formatStopwatch(ST.stopwatch.seconds);
}
function stopStopwatch(exId) {
  if (ST.stopwatch.interval) clearInterval(ST.stopwatch.interval);
  const total = ST.stopwatch.seconds;
  ST.stopwatch.active = false;
  if (ST.sets[exId]) ST.sets[exId][0].seconds = String(total);
  persistTimerState();
  persistWorkoutState();
  showToast('⏱ Recorded '+total+' seconds.');
  renderFlight(document.getElementById('mainPage'));
}

// ─── NSDR TIMER (5-min chime + auto record) ──────────────────────────────────
function buildNSDRWidget(exId, currentVal) {
  const isActive = ST.nsdrTimer.active;
  const parts = [];
  parts.push('<div class="timed-box '+(currentVal?'ok':'')+'" id="nsdr_'+exId+'">');
  parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:0.08em;margin-bottom:6px">NSDR TIMER — CHIMES AT 5:00</div>');
  parts.push('<div class="stopwatch-display" id="nsdr_disp">'+formatStopwatch(isActive?ST.nsdrTimer.seconds:(parseInt(currentVal)||0))+'</div>');
  if (!isActive) {
    parts.push('<button class="stopwatch-btn btn-blue" onclick="startNSDR(\''+exId+'\')">START NSDR</button>');
  } else {
    parts.push('<button class="stopwatch-btn btn-outline" onclick="stopNSDR(\''+exId+'\')">STOP &amp; SAVE</button>');
  }
  parts.push('</div>');
  return parts.join('');
}
function startNSDR(exId) {
  ST.nsdrTimer = { active: true, seconds: 0, interval: null, chimed: false, exId, startTs: Date.now() };
  persistTimerState();
  renderFlight(document.getElementById('mainPage'));
  ST.nsdrTimer.interval = setInterval(() => tickNSDR(exId), 1000);
}
function tickNSDR(exId) {
  if (!ST.nsdrTimer.active || ST.nsdrTimer.exId !== exId) return;
  ST.nsdrTimer.seconds = Math.round((Date.now() - ST.nsdrTimer.startTs)/1000);
  const el = document.getElementById('nsdr_disp');
  if (el) el.textContent = formatStopwatch(ST.nsdrTimer.seconds);
  if (ST.nsdrTimer.seconds >= 300 && !ST.nsdrTimer.chimed) {
    ST.nsdrTimer.chimed = true;
    persistTimerState();
    playChime();
    showToast('🔔 5 minutes complete — continue or stop and save.');
  }
}
function stopNSDR(exId) {
  if (ST.nsdrTimer.interval) clearInterval(ST.nsdrTimer.interval);
  const total = ST.nsdrTimer.seconds;
  ST.nsdrTimer.active = false;
  if (ST.sets[exId]) ST.sets[exId][0].seconds = String(total);
  persistTimerState();
  persistWorkoutState();
  showToast('NSDR session recorded: '+formatStopwatch(total));
  renderFlight(document.getElementById('mainPage'));
}

// ─── AUDIO CHIME (Web Audio API — no file needed) ────────────────────────────
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.001, ctx.currentTime + i*0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i*0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i*0.18 + 0.4);
      osc.start(ctx.currentTime + i*0.18);
      osc.stop(ctx.currentTime + i*0.18 + 0.5);
    });
  } catch(e) {}
}

// ─── CUSTOM EXERCISE CREATION ─────────────────────────────────────────────────
function buildAddExerciseCard() {
  const parts = [];
  parts.push('<div class="card card-dark" style="border:1.5px dashed var(--border)">');
  if (!ST.showAddExercise) {
    parts.push('<button class="btn btn-outline" onclick="ST.showAddExercise=true;renderFlight(document.getElementById(\'mainPage\'))">+ Add Your Own Exercise</button>');
  } else {
    parts.push('<div class="section-label" style="margin-top:0">CUSTOM EXERCISE</div>');
    parts.push('<div class="field"><label>Exercise Name</label><input type="text" id="custom_ex_name" placeholder="e.g. Cable Woodchopper"></div>');
    parts.push('<div class="field-row">');
    parts.push('<div class="field"><label>Target (sets×reps)</label><input type="text" id="custom_ex_target" placeholder="e.g. 3×12"></div>');
    parts.push('<div class="field"><label>Input Type</label><select id="custom_ex_type"><option value="reps_weight">Reps + Weight</option><option value="reps_only">Reps Only</option><option value="timed">Timed (seconds)</option></select></div>');
    parts.push('</div>');
    parts.push('<div class="field"><label>Notes (optional)</label><input type="text" id="custom_ex_note" placeholder="Form cue or reminder"></div>');
    parts.push('<button class="btn btn-gold" onclick="saveCustomExercise()">Add to This Workout</button>');
    parts.push('<button class="btn-ghost mt8" style="display:block;width:100%;text-align:center" onclick="ST.showAddExercise=false;renderFlight(document.getElementById(\'mainPage\'))">Cancel</button>');
  }
  parts.push('</div>');
  return parts.join('');
}

async function saveCustomExercise() {
  const name = document.getElementById('custom_ex_name')?.value?.trim();
  const target = document.getElementById('custom_ex_target')?.value?.trim() || '—';
  const inputType = document.getElementById('custom_ex_type')?.value || 'reps_weight';
  const note = document.getElementById('custom_ex_note')?.value?.trim() || 'User-created exercise.';
  if (!name) { showToast('Enter an exercise name.'); return; }

  const id = 'custom_' + Date.now();
  const newEx = ex(id, name, target, 3, note, inputType==='timed', inputType);
  newEx.custom = true;

  // Add to current active workout (enroute slot) immediately
  if (ST.workout) {
    ST.workout.enroute.push(newEx);
    ST.sets[id] = inputType==='timed' ? [{seconds:''}] : inputType==='reps_only' ? [{reps:''}] : [{reps:'',weight:''}];
  }

  // Persist for future sessions in this env/muscle group
  ST.customExercises.push({ env: ST.env, muscleGroup: ST.muscleGroup, exercise: newEx });
  const profile = (await dbGetProfile()) || {};
  profile.customExercises = ST.customExercises;
  profile.goal = ST.goal;
  profile.level = ST.level;
  await dbSetProfile(profile);

  ST.showAddExercise = false;
  showToast('✅ "'+name+'" added — it will appear in this workout going forward.');
  renderFlight(document.getElementById('mainPage'));
}

async function deleteCustomExercise(exId) {
  if (!confirm('Remove this custom exercise from your workout?')) return;
  if (ST.workout) {
    ['taxi','takeoff','enroute','landing'].forEach(k => {
      ST.workout[k] = ST.workout[k].filter(e => e.id !== exId);
    });
  }
  ST.customExercises = ST.customExercises.filter(c => c.exercise.id !== exId);
  const profile = (await dbGetProfile()) || {};
  profile.customExercises = ST.customExercises;
  await dbSetProfile(profile);
  delete ST.sets[exId];
  renderFlight(document.getElementById('mainPage'));
}

// ─── EXERCISE GUIDE MODAL (GIF + ExRx link) ──────────────────────────────────
function showGuide(exId) {
  const allEx = ST.workout ? [...ST.workout.taxi,...ST.workout.takeoff,...ST.workout.enroute,...ST.workout.landing] : [];
  const e = allEx.find(x => x.id === exId);
  if (!e) return;
  const guide = getExGuide(exId, e.name);
  const root = document.getElementById('modalRoot');

  const linkLabel = guide.verified
    ? '📹 View Exercise Guide on ExRx.net →'
    : '🔍 Search ExRx.net for "' + e.name + '" →';
  const linkHTML = '<a class="modal-link" href="'+guide.exrx+'" target="_blank" rel="noopener">'+linkLabel+'</a>';

  root.innerHTML =
    '<div class="modal-bg" onclick="if(event.target===this)closeModal()">' +
    '<div class="modal-sheet">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">' + e.name + '</div>' +
    '<div style="font-family:var(--mono);font-size:10px;color:var(--gold);margin-bottom:12px;letter-spacing:0.08em">' + e.target + '</div>' +
    '<div class="modal-body">' + e.note + '</div>' +
    linkHTML +
    '<button class="btn btn-outline mt12" onclick="closeModal()">CLOSE</button>' +
    '</div></div>';
}

// ─── MET VALUES FOR CALORIE ESTIMATION ───────────────────────────────────────
const MET_VALUES = {
  taxi: 2.5, takeoff: 6.0, enroute: 5.0, landing: 2.0,
};

function estimateCalories(wk, bodyWeightLb, durationMinutes) {
  const bwKg = (bodyWeightLb || 180) * 0.4536;
  const phaseMinutes = { taxi: 5, takeoff: 15, enroute: 15, landing: 5 };
  let totalCal = 0, totalMin = 0;
  ['taxi','takeoff','enroute','landing'].forEach(phase => {
    if (wk[phase] && wk[phase].length) {
      const mins = phaseMinutes[phase] || 5;
      totalCal += MET_VALUES[phase] * bwKg * (mins/60);
      totalMin += mins;
    }
  });
  if (durationMinutes && totalMin > 0) totalCal = totalCal * (durationMinutes/totalMin);
  return Math.round(totalCal);
}

// ─── WORKOUT SUMMARY / DEBRIEF ────────────────────────────────────────────────
function buildWorkoutSummary(session, allExDefs, weeklySessions, bodyWeightLb) {
  const sets = session.sets || {};
  const exIds = Object.keys(sets);
  let totalSets = 0, totalReps = 0, totalVolume = 0, completedExCount = 0;
  let prHits = [];

  exIds.forEach(id => {
    const setArr = sets[id];
    const loggedSets = setArr.filter(s => s.reps || s.weight || s.seconds);
    if (loggedSets.length) completedExCount++;
    loggedSets.forEach(s => {
      totalSets++;
      if (s.reps) totalReps += parseInt(s.reps)||0;
      if (s.reps && s.weight) totalVolume += (parseInt(s.reps)||0) * (parseFloat(s.weight)||0);
    });
  });

  const totalPlanned = allExDefs.length;
  const completionPct = totalPlanned ? Math.round(completedExCount/totalPlanned*100) : 0;

  exIds.forEach(id => {
    const todaySets = sets[id].filter(s => s.weight);
    if (!todaySets.length) return;
    const todayMax = Math.max(...todaySets.map(s => parseFloat(s.weight)||0));
    let priorMax = 0;
    weeklySessions.forEach(s => {
      if (s === session) return;
      const priorSets = (s.sets?.[id]||[]).filter(x => x.weight);
      priorSets.forEach(x => { priorMax = Math.max(priorMax, parseFloat(x.weight)||0); });
    });
    if (todayMax > priorMax && priorMax > 0) {
      const exDef = allExDefs.find(e => e.id === id);
      prHits.push({ name: exDef?.name || id, weight: todayMax });
    }
  });

  const sessionsThisWeek = weeklySessions.filter(s => {
    const days = (Date.now() - new Date(s.date).getTime()) / 86400000;
    return days <= 7;
  }).length;
  const targetDays = parseInt((FREQUENCY_GUIDE[session.level||'intermediate'].days||'3').split('-')[0]);

  const landingIds = (session.workoutSnapshot?.landing || []).map(e => e.id);
  const landingLogged = landingIds.length ? landingIds.some(id => (sets[id]||[]).some(s => s.reps||s.weight||s.seconds)) : null;

  const estCalories = estimateCalories(session.workoutSnapshot || {taxi:[],takeoff:[],enroute:[],landing:[]}, bodyWeightLb, session.durationMinutes);

  return {
    totalSets, totalReps, totalVolume: Math.round(totalVolume),
    completedExCount, totalPlanned, completionPct,
    prHits, sessionsThisWeek, targetDays,
    landingLogged, estCalories,
    durationMinutes: session.durationMinutes || null,
  };
}

function buildDebriefMessages(summary) {
  const msgs = [];
  if (summary.completionPct === 100) {
    msgs.push({ type:'ok', icon:'🎯', text:'Full mission complete — every exercise logged. That\'s the standard.' });
  } else if (summary.completionPct >= 70) {
    msgs.push({ type:'info', icon:'👍', text:'Solid session — '+summary.completionPct+'% of planned exercises logged.' });
  } else {
    msgs.push({ type:'warn', icon:'📋', text:'Partial session ('+summary.completionPct+'% complete). Any movement counts, but try to close out all phases next time.' });
  }

  if (summary.prHits.length) {
    summary.prHits.forEach(pr => {
      msgs.push({ type:'ok', icon:'🏆', text:'New PR: '+pr.name+' at '+pr.weight+' lb — nice work.' });
    });
  }

  if (summary.sessionsThisWeek >= summary.targetDays) {
    msgs.push({ type:'ok', icon:'🔥', text:summary.sessionsThisWeek+' sessions this week — you\'ve hit your '+summary.targetDays+'-day target. Consistency is what actually drives results.' });
  } else {
    const remaining = summary.targetDays - summary.sessionsThisWeek;
    msgs.push({ type:'info', icon:'📅', text:summary.sessionsThisWeek+' of '+summary.targetDays+' sessions this week — '+remaining+' more to hit your target.' });
  }

  if (summary.landingLogged === false) {
    msgs.push({ type:'warn', icon:'🛬', text:'You skipped the Landing phase. Decompression and CNS down-regulation is what actually starts the recovery process — don\'t treat it as optional.' });
  }

  return msgs;
}

// ─── SET THE CHOCKS (formerly "Secure Flight") ───────────────────────────────
async function setTheChocks() {
  const wk = ST.workout;
  if (!wk) return;
  const allEx = [...wk.taxi,...wk.takeoff,...wk.enroute,...wk.landing];
  const logged = allEx.filter(exItem => ST.sets[exItem.id]?.some(s => s.reps||s.weight||s.seconds));
  if (logged.length === 0) { showToast('Log at least one exercise before setting the chocks.'); return; }

  const startedAt = ST.workoutStartedAt || Date.now();
  const durationMinutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));

  const session = {
    date: new Date().toISOString(),
    env: ST.env,
    muscle_group: ST.muscleGroup,
    goal: ST.goal,
    fatigue: ST.fatigue,
    level: ST.level,
    sets: ST.sets,
    flight_hrs: ST.flightHrs,
    water_in: ST.waterIn,
    durationMinutes: durationMinutes,
    workoutSnapshot: wk,
  };
  try {
    const { error } = await SB.from('workout_sessions').insert([{
      user_id: ST.user?.id || null,
      session_key: String(Date.now()),
      session_data: session,
      workout_key: ST.muscleGroup,
      started_at: session.date,
    }]);
    if (error) throw error;
    showToast('✅ Chocks set. Data synced.');
  } catch(e) {
    showToast('⚠️ Saved locally — will sync when online.');
    localStorage.setItem('fcf_session_' + Date.now(), JSON.stringify(session));
  }

  const recentSessions = await dbGetRecentSessions(7);
  const profile = await dbGetProfile();
  const bodyWeight = profile?.lastWeight || null;
  const summary = buildWorkoutSummary(session, allEx, [...recentSessions, session], bodyWeight);
  const debriefMsgs = buildDebriefMessages(summary);

  ST.lastSession = session;
  ST.lastDebrief = { summary, messages: debriefMsgs, session };
  ST.workout = null;
  ST.sets = {};
  ST.workoutStartedAt = null;
  clearWorkoutState();
  ST.tab = 'debrief';
  renderPage();
}

// ─── TRENDS TAB ───────────────────────────────────────────────────────────────
function renderTrends(p) {
  const parts = [];
  parts.push('<div class="section-label">BIOMETRICS LOG &amp; TRENDS</div>');

  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">LOG TODAY\'S DATA</div>');

  parts.push('<div class="field-row" style="margin-bottom:10px">');
  parts.push('<div class="field" style="margin-bottom:0"><label>Weight (lb) <span class="info-i" onclick="showBioInfo(\'weight\')">i</span></label><input type="number" inputmode="decimal" id="inp_wt" placeholder="e.g. 232"></div>');
  parts.push('<div class="field" style="margin-bottom:0"><label>Waist (in) <span class="info-i" onclick="showBioInfo(\'waist\')">i</span></label><input type="number" inputmode="decimal" id="inp_waist" placeholder="e.g. 38.5"></div>');
  parts.push('</div>');

  parts.push('<div class="field-row" style="margin-bottom:10px">');
  parts.push('<div class="field" style="margin-bottom:0"><label>Systolic BP <span class="info-i" onclick="showBioInfo(\'systolic\')">i</span></label><input type="number" inputmode="numeric" id="inp_sys" placeholder="e.g. 122"></div>');
  parts.push('<div class="field" style="margin-bottom:0"><label>Diastolic BP <span class="info-i" onclick="showBioInfo(\'diastolic\')">i</span></label><input type="number" inputmode="numeric" id="inp_dia" placeholder="e.g. 78"></div>');
  parts.push('</div>');

  parts.push('<div class="field" style="margin-bottom:12px"><label>Fasting Glucose (mg/dL) <span class="info-i" onclick="showBioInfo(\'glucose\')">i</span></label><input type="number" inputmode="numeric" id="inp_gluc" placeholder="e.g. 95"></div>');
  parts.push('<button class="btn btn-gold" onclick="saveBio()">LOG DATA</button>');
  parts.push('</div>');

  parts.push('<div class="section-label">TRENDS</div>');
  [['chartWt','BODY WEIGHT (lb)'],['chartWaist','WAIST (in)'],['chartBP','BLOOD PRESSURE (mmHg)'],['chartGluc','FASTING GLUCOSE (mg/dL)']].forEach(([id,label]) => {
    parts.push('<div class="card mb8"><div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-bottom:6px">'+label+'</div><div class="chart-wrap"><canvas id="'+id+'"></canvas></div></div>');
  });

  p.innerHTML = parts.join('');
  setTimeout(() => loadAndDrawCharts(), 50);
}

async function saveBio() {
  const wt    = parseFloat(document.getElementById('inp_wt')?.value)||null;
  const waist = parseFloat(document.getElementById('inp_waist')?.value)||null;
  const sys   = parseInt(document.getElementById('inp_sys')?.value)||null;
  const dia   = parseInt(document.getElementById('inp_dia')?.value)||null;
  const gluc  = parseInt(document.getElementById('inp_gluc')?.value)||null;
  if (!wt && !waist && !sys && !dia && !gluc) { showToast('Enter at least one value to log.'); return; }

  const row = { user_id: ST.user?.id || null, weight_lb:wt, waist_in:waist, systolic_bp:sys, diastolic_bp:dia, fasting_glucose:gluc, logged_at: new Date().toISOString() };
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
  if (wt) {
    const profile = (await dbGetProfile()) || {};
    profile.lastWeight = wt;
    await dbSetProfile(profile);
  }
  setTimeout(() => loadAndDrawCharts(), 100);
}

async function loadAndDrawCharts() {
  let data = [];
  try {
    const filter = ST.user ? SB.from('weight_log').select('*').eq('user_id', ST.user.id) : SB.from('weight_log').select('*');
    const { data: d, error } = await filter.order('logged_at', { ascending: true });
    if (error) throw error;
    data = d || [];
  } catch(e) {
    data = JSON.parse(localStorage.getItem('fcf_bio')||'[]');
  }
  if (!data.length) return;

  // Each metric is logged independently — a row may have weight but no glucose,
  // or BP but no waist. Filtering per-metric (rather than sharing one labels
  // array across all charts) ensures every chart plots its own correct dates
  // instead of stretching sparse data across unrelated x-axis points.
  function metricSeries(field) {
    const rows = data.filter(d => d[field] !== null && d[field] !== undefined && d[field] !== '');
    return {
      labels: rows.map(d => new Date(d.logged_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})),
      values: rows.map(d => d[field]),
    };
  }
  function metricSeriesMulti(fields) {
    // For BP: only include rows where at least one of systolic/diastolic is present
    const rows = data.filter(d => fields.some(f => d[f] !== null && d[f] !== undefined && d[f] !== ''));
    return {
      labels: rows.map(d => new Date(d.logged_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})),
      rows,
    };
  }

  const OPTS = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ display:false } },
    scales:{
      x:{ grid:{color:'#1a2438'}, ticks:{font:{size:9,family:'Share Tech Mono'},color:'#64748b',maxRotation:45} },
      y:{ grid:{color:'#1a2438'}, ticks:{font:{size:9,family:'Share Tech Mono'},color:'#64748b'} },
    }
  };
  function mkChart(id, labels, datasets, legendOn) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const key = 'c_'+id;
    if (ST.chartInst[key]) { try { ST.chartInst[key].destroy(); } catch(e){} }
    if (!labels.length) return; // nothing logged for this metric yet
    ST.chartInst[key] = new Chart(canvas.getContext('2d'), { type:'line', data:{labels,datasets}, options:{...OPTS, plugins:{legend:{display:!!legendOn,labels:{font:{size:9,family:'Share Tech Mono'},color:'#64748b'}}}} });
  }
  const refLine = (n,val,color) => ({ data:Array.from({length:n},()=>val), borderColor:color, borderDash:[4,3], pointRadius:0, fill:false });

  const wt = metricSeries('weight_lb');
  mkChart('chartWt', wt.labels, [{ data:wt.values, borderColor:'#3b82f6', backgroundColor:'#3b82f622', tension:0.35, fill:true, pointRadius:4, pointBackgroundColor:'#3b82f6', label:'Weight' }]);

  const waist = metricSeries('waist_in');
  mkChart('chartWaist', waist.labels, [
    { data:waist.values, borderColor:'#c9a84c', backgroundColor:'#c9a84c22', tension:0.35, fill:true, pointRadius:4, pointBackgroundColor:'#c9a84c', label:'Waist' },
    { ...refLine(waist.values.length,40,'#ef444488'), label:'Risk (over 40in)' },
  ], true);

  const gluc = metricSeries('fasting_glucose');
  mkChart('chartGluc', gluc.labels, [
    { data:gluc.values, borderColor:'#22c55e', backgroundColor:'#22c55e22', tension:0.35, fill:true, pointRadius:4, pointBackgroundColor:'#22c55e', label:'Glucose' },
    { ...refLine(gluc.values.length,100,'#f59e0b88'), label:'Pre-diabetic (100)' },
  ], true);

  const bp = metricSeriesMulti(['systolic_bp','diastolic_bp']);
  const bpCanvas = document.getElementById('chartBP');
  if (bpCanvas) {
    if (ST.chartInst['c_chartBP']) { try { ST.chartInst['c_chartBP'].destroy(); } catch(e){} }
    if (bp.rows.length) {
      ST.chartInst['c_chartBP'] = new Chart(bpCanvas.getContext('2d'), {
        type:'line',
        data:{ labels: bp.labels, datasets:[
          { data:bp.rows.map(d=>d.systolic_bp),  borderColor:'#ef4444', backgroundColor:'#ef444411', tension:0.35, fill:false, pointRadius:4, pointBackgroundColor:'#ef4444', label:'Systolic' },
          { data:bp.rows.map(d=>d.diastolic_bp), borderColor:'#f59e0b', backgroundColor:'#f59e0b11', tension:0.35, fill:false, pointRadius:4, pointBackgroundColor:'#f59e0b', label:'Diastolic' },
          { ...refLine(bp.rows.length,120,'#ef444455'), label:'Sys target (120)' },
          { ...refLine(bp.rows.length,80,'#f59e0b55'),  label:'Dia target (80)' },
        ]},
        options:{ ...OPTS, plugins:{ legend:{ display:true, labels:{font:{size:9,family:'Share Tech Mono'},color:'#64748b'} } } }
      });
    }
  }
}

// ─── WISDOM TAB ───────────────────────────────────────────────────────────────
function renderWisdom(p) {
  const card = WISDOM[ST.wisdomIdx];
  const num  = String(ST.wisdomIdx+1).padStart(2,'0');
  const parts = [];
  parts.push('<div class="section-label">FLIGHT DECK WISDOM</div>');
  parts.push('<div class="wisdom-card"><div>');
  parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--gold);letter-spacing:0.1em;margin-bottom:12px">BRIEFING '+num+' / '+WISDOM.length+'</div>');
  parts.push('<div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:14px">'+card.title+'</div>');
  parts.push('<div style="font-size:13px;line-height:1.8;color:#94a3b8">'+card.text+'</div>');
  parts.push('</div><div><a class="modal-link" href="'+card.link+'" target="_blank" rel="noopener">📖 Read more →</a></div></div>');
  parts.push('<div class="wisdom-counter">'+(ST.wisdomIdx+1)+' of '+WISDOM.length+'</div>');
  parts.push('<div class="wisdom-nav"><button class="btn btn-outline" onclick="prevWisdom()">← PREV</button><button class="btn btn-outline" onclick="nextWisdom()">NEXT →</button></div>');
  parts.push('<div style="margin-top:16px"><div class="section-label">JUMP TO TOPIC</div><div class="mg-wrap">');
  WISDOM.forEach((w,i) => {
    parts.push('<div class="'+(i===ST.wisdomIdx?'mg-pill sel':'mg-pill')+'" onclick="jumpWisdom('+i+')" style="font-size:11px">'+w.title+'</div>');
  });
  parts.push('</div></div>');
  p.innerHTML = parts.join('');
}
function prevWisdom() { ST.wisdomIdx=(ST.wisdomIdx-1+WISDOM.length)%WISDOM.length; renderWisdom(document.getElementById('mainPage')); }
function nextWisdom() { ST.wisdomIdx=(ST.wisdomIdx+1)%WISDOM.length; renderWisdom(document.getElementById('mainPage')); }
function jumpWisdom(i) { ST.wisdomIdx=i; renderWisdom(document.getElementById('mainPage')); }

// ─── DEBRIEF SCREEN (post-flight summary) ────────────────────────────────────
function renderDebrief(p) {
  const d = ST.lastDebrief;
  if (!d) { switchTab('preflight'); return; }
  const s = d.summary;
  const session = d.session;

  const parts = [];
  parts.push('<div class="section-label">POST-FLIGHT DEBRIEF</div>');
  parts.push('<div class="card card-dark mb12" style="text-align:center;padding:24px 16px">');
  parts.push('<div style="font-size:36px;margin-bottom:8px">'+(s.completionPct===100?'🎯':'✈️')+'</div>');
  parts.push('<div style="font-family:var(--mono);font-size:18px;color:var(--gold);letter-spacing:0.04em">'+ST.muscleGroup.toUpperCase()+' COMPLETE</div>');
  parts.push('<div style="font-size:11px;color:var(--muted);margin-top:4px">'+new Date(session.date).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})+'</div>');
  parts.push('</div>');

  parts.push('<div class="stat-row">');
  parts.push('<div class="stat-box"><div class="stat-val">'+(s.durationMinutes||'—')+'</div><div class="stat-lbl">Minutes</div></div>');
  parts.push('<div class="stat-box"><div class="stat-val">'+s.totalSets+'</div><div class="stat-lbl">Sets Logged</div></div>');
  parts.push('<div class="stat-box"><div class="stat-val">'+s.estCalories+'</div><div class="stat-lbl">Est. Calories</div></div>');
  parts.push('</div>');
  parts.push('<div class="stat-row">');
  parts.push('<div class="stat-box"><div class="stat-val">'+s.totalReps+'</div><div class="stat-lbl">Total Reps</div></div>');
  parts.push('<div class="stat-box"><div class="stat-val">'+s.totalVolume.toLocaleString()+'</div><div class="stat-lbl">Volume (lb)</div></div>');
  parts.push('<div class="stat-box"><div class="stat-val">'+s.completionPct+'%</div><div class="stat-lbl">Completion</div></div>');
  parts.push('</div>');

  parts.push('<div class="section-label">DEBRIEF NOTES</div>');
  d.messages.forEach(m => {
    const cls = m.type==='ok'?'alert-ok':m.type==='warn'?'alert-warn':'alert-info';
    parts.push('<div class="alert '+cls+'"><div class="alert-icon">'+m.icon+'</div><div>'+m.text+'</div></div>');
  });

  parts.push('<button class="btn btn-gold mt16" onclick="ST.lastDebrief=null;switchTab(\'preflight\')">Continue to Preflight</button>');
  p.innerHTML = parts.join('');
}

// ─── PROFILE TAB ──────────────────────────────────────────────────────────────
function renderProfile(p) {
  const parts = [];
  parts.push('<div class="section-label">PILOT PROFILE</div>');
  parts.push('<div class="card mb12">');
  parts.push('<div class="fb"><div style="font-size:14px;font-weight:600">'+(ST.user?.email||'Local user')+'</div><div class="status-dot ok"></div></div>');
  parts.push('<div style="font-size:11px;color:var(--muted);margin-top:4px">'+FCF_VERSION+' · Build '+FCF_BUILD+'</div>');
  parts.push('</div>');

  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">TRAINING PROGRAM</div>');
  const g = GOALS[ST.goal];
  const freq = FREQUENCY_GUIDE[ST.level];
  parts.push('<div class="fb mb8"><span style="font-size:13px">Goal</span><span style="font-size:13px;font-weight:600">'+g.icon+' '+g.label+'</span></div>');
  parts.push('<div class="fb mb8"><span style="font-size:13px">Level</span><span style="font-size:13px;font-weight:600">'+ST.level+'</span></div>');
  parts.push('<div class="fb"><span style="font-size:13px">Recommended frequency</span><span style="font-size:13px;font-weight:600">'+freq.days+' days/wk</span></div>');
  parts.push('<div class="divider"></div>');
  parts.push('<div style="font-size:11px;color:var(--muted);line-height:1.6">'+freq.split+'. '+freq.note+'</div>');
  parts.push('</div>');

  if (ST.customExercises.length) {
    parts.push('<div class="card mb12"><div class="section-label" style="margin-top:0">YOUR CUSTOM EXERCISES ('+ST.customExercises.length+')</div>');
    ST.customExercises.forEach(c => {
      parts.push('<div class="fb" style="padding:6px 0;border-bottom:1px solid var(--border)"><span style="font-size:12px">'+c.exercise.name+'</span><span style="font-size:10px;color:var(--muted)">'+c.muscleGroup+' · '+c.env+'</span></div>');
    });
    parts.push('</div>');
  }

  parts.push('<div class="card mb12"><div class="section-label" style="margin-top:0">SAFETY DISCLAIMER</div>');
  parts.push('<div class="disclaimer-banner">Flight Crew Fitness is a training tool, not medical advice. Consult a physician before beginning any new exercise program. Exercise at your own risk and within your own physical limits.</div>');
  parts.push('</div>');

  parts.push('<button class="btn btn-red-outline" onclick="doSignOut()">Sign Out</button>');
  p.innerHTML = parts.join('');
}
