/**
 * Flight Crew Fitness — app.js
 * Version: 4.1 | Build: 20260615
 * Aviation-phased workout tracker for pilots and flight crew
 */

const FCF_VERSION = 'v4.1';
const FCF_BUILD   = '20260615';

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SB = supabase.createClient(
  'https://dnxkydxbyihgsictbzjz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRueGt5ZHhieWloZ3NpY3Riemp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3ODk4MTEsImV4cCI6MjA5NjM2NTgxMX0.oLUGuorQkbQ_u679NpE8FGBVAUmVE1K_rxl8q4B0n7k'
);

// ─── APP STATE ────────────────────────────────────────────────────────────────
const ST = {
  tab:         'preflight',
  env:         'comm',
  flightHrs:   0,
  waterIn:     0,
  muscleGroup: 'Lower Body',
  fatigue:     'go',        // 'go' | 'marginal' | 'nogo'
  level:       'intermediate', // 'beginner' | 'intermediate' | 'advanced'
  workout:     null,
  sets:        {},
  expanded:    {},
  wisdomIdx:   0,
  chartInst:   {},
};

// Exercise count limits by level and phase
const LEVEL_EX = {
  beginner:     { taxi: 2, takeoff: 1, enroute: 1, landing: 1 },
  intermediate: { taxi: 2, takeoff: 2, enroute: 2, landing: 2 },
  advanced:     { taxi: 3, takeoff: 2, enroute: 4, landing: 3 },
};

// ─── HYDRATION ────────────────────────────────────────────────────────────────
const HYDRO_RATE = 0.3;
function hydroTarget()  { return Math.max(ST.flightHrs * HYDRO_RATE, 0.5); }
function hydroDeficit() { return Math.max(hydroTarget() - ST.waterIn, 0);  }
function hydroPct()     { return Math.min(ST.waterIn / Math.max(hydroTarget(), 0.5), 1); }
function hydroStatus() {
  const p = hydroPct();
  if (p >= 1)   return { label:'NOMINAL', color:'var(--green)', icon:'✅', cls:'status-ok'   };
  if (p >= 0.6) return { label:'CAUTION', color:'var(--amber)', icon:'⚠️', cls:'status-warn' };
  return              { label:'DEFICIT',  color:'var(--red)',   icon:'🚨', cls:'status-no'   };
}
function hydroAdvice() {
  const def = hydroDeficit();
  if (def <= 0)   return null;
  if (def < 0.25) return `Sip ${Math.round(def*1000)}ml now — you're almost there.`;
  if (def < 0.5)  return `Drink ${Math.round(def*1000)}ml before starting. Dehydration cuts strength output by up to 20%.`;
  return `You're ${def.toFixed(1)}L behind. Drink 500ml now, then sip throughout your session. Cognitive and physical performance decline measurably at this deficit.`;
}

// ─── MUSCLE GROUPS ────────────────────────────────────────────────────────────
const MUSCLE_GROUPS = ['Lower Body','Upper Push','Upper Pull','Power / Plyo','Full Body','Longevity','Cardio'];

// ─── EXERCISE BUILDER ─────────────────────────────────────────────────────────
const ex = (id, name, target, sets, note, timed) =>
  ({ id, name, target, sets: sets||3, note, timed: !!timed });

// ─── WORKOUT DATA ─────────────────────────────────────────────────────────────
// All workout data is plain objects — no forward references
// Phases: taxi (warmup), takeoff (heavy), enroute (volume), landing (cooldown)

const WORKOUTS = {};

// ════════════════════════════════════════════════════════════════════════
// COMMERCIAL GYM
// ════════════════════════════════════════════════════════════════════════
WORKOUTS.comm = {};

WORKOUTS.comm['Lower Body'] = {
  taxi: [
    ex('c_lb_t1','Hip 90/90 Stretch','60s/side',1,'Sit on floor, both legs at 90°. Rotate slowly between internal and external hip rotation. Critical for pilots who sit compressed all day.',true),
    ex('c_lb_t2','Ankle Circles + Dorsiflexion','20 reps',1,'Rotate each ankle 10x each direction, then pull toes to shin. Ankle mobility directly affects squat depth.'),
    ex('c_lb_t3','Goblet Squat Warmup','2×10',2,'Light KB or DB at chest. Slow descent, pause at the bottom. Own the position before loading.'),
  ],
  takeoff: [
    ex('c_lb_to1','Back Squat','5×5',5,'Work up to a challenging set of 5. Bar on traps, break parallel, drive through heels. 3-4 min rest. This is your primary compound.'),
    ex('c_lb_to2','Romanian Deadlift','4×6',4,'Hip hinge. Moderate-heavy. Bar stays close to legs. Deep hamstring stretch at the bottom. 2-3 min rest.'),
  ],
  enroute: [
    ex('c_lb_er1','Bulgarian Split Squat','3×8/leg',3,'Rear foot elevated on bench. Drive through front heel. High transfer to strength and jump performance. 90s rest.'),
    ex('c_lb_er2','Leg Press','3×12',3,'Moderate weight. Full ROM — don\'t lock knees. Quad-dominant volume. 60-90s rest.'),
    ex('c_lb_er3','Standing Calf Raise','4×12',4,'Full ROM — stretch at bottom, pause at top. Use a step for full range. 60s rest.'),
    ex('c_lb_er4','Lateral Band Walk','2×15/side',2,'Band above knees. Stay low. Activates glute med — prevents knee cave under load.'),
  ],
  landing: [
    ex('c_lb_l1','Pigeon Pose','90s/side',1,'External hip rotation stretch. Hold completely still. Releases hip flexors and piriformis after a leg session.',true),
    ex('c_lb_l2','Supine Hamstring Stretch','60s/side',1,'Lying on back, pull one leg toward chest. Knee straight. Hold still — don\'t bounce.',true),
    ex('c_lb_l3','Child\'s Pose + Reach','90s',1,'Arms extended, sit back toward heels. Breathe into your lower back. Decompresses the lumbar after squats.',true),
  ],
};

WORKOUTS.comm['Upper Push'] = {
  taxi: [
    ex('c_up_t1','Wall Slide','2×10',2,'Forearms against wall, slide up to full overhead. Fixes forward-rounded cockpit posture. Do these slowly.'),
    ex('c_up_t2','Band Pull-Apart','2×20',2,'Arms straight in front, pull band apart to chest. Activates rear delts and sets scapular position before pressing.'),
    ex('c_up_t3','Thoracic Extension (chair)','10 reps',1,'Hands behind head, extend over chair back. Counteracts thoracic kyphosis pilots develop. Hold each extension 2s.'),
  ],
  takeoff: [
    ex('c_up_to1','Flat Barbell Bench Press','5×5',5,'Work up to a heavy 5. Elbows 45-70° — not flared. Control the descent, explode up. 3-4 min rest.'),
    ex('c_up_to2','Standing Overhead Press','4×5',4,'Standing — not seated. Full lockout overhead. Core braced. 3 min rest.'),
  ],
  enroute: [
    ex('c_up_er1','Incline DB Press','3×10',3,'30-45° incline. Full stretch at the bottom. Upper chest and anterior delt volume. 90s rest.'),
    ex('c_up_er2','Close Grip Bench','3×8',3,'Hands shoulder-width. Tricep emphasis. 90s rest.'),
    ex('c_up_er3','Lateral Raise','3×15',3,'Light and strict — no momentum. Shoulder width at top. Shoulder health work, not ego work. 60s.'),
    ex('c_up_er4','DB Tricep Overhead','3×12',3,'Both hands on one DB. Full stretch at top. 60s rest.'),
  ],
  landing: [
    ex('c_up_l1','Doorframe Chest Stretch','60s/side',1,'Arm at 90° in doorframe, rotate body away. Counters internal rotation from pressing. Hold still.',true),
    ex('c_up_l2','Lat Overhead Stretch','60s/side',1,'Reach one arm overhead, grab a rack or door frame, lean away. Lengthens lat and shoulder.',true),
    ex('c_up_l3','Diaphragmatic Breathing','10 breaths',1,'Lie on back. Inhale 4 counts (belly first), hold 2, exhale 6. Activates parasympathetic system — downregulates CNS after heavy pressing.',true),
  ],
};

WORKOUTS.comm['Upper Pull'] = {
  taxi: [
    ex('c_ul_t1','Arm Circles (progressive)','10/direction',1,'Small to large, both directions. Warms rotator cuff before pulling loads.'),
    ex('c_ul_t2','Scapular Pullup','2×10',2,'Hang from bar. Without bending elbows, depress and retract scapulae — pull shoulder blades down and back. Foundation of every pull.'),
    ex('c_ul_t3','Prone Y-T-W Raises','2×10',2,'Lying face-down on bench. Light plates. Raise in Y, T, W shapes. Activates lower traps and rear delts — often weakest link in pilots.'),
  ],
  takeoff: [
    ex('c_ul_to1','Conventional Deadlift','5×3',5,'Work up to heavy triples. Full reset each rep. Maximum posterior chain loading. 3-4 min rest. Keep back neutral.'),
    ex('c_ul_to2','Barbell Row (Pendlay)','4×6',4,'Bar to floor between reps. Upper back, lats, rear delts. Overhand grip. 3 min rest.'),
  ],
  enroute: [
    ex('c_ul_er1','Lat Pulldown','3×10',3,'Full overhead stretch, pull to upper chest. Slow on the way back up. 90s rest.'),
    ex('c_ul_er2','Seated Cable Row','3×12',3,'Retract fully at the end — shoulder blades together. Don\'t round forward. 90s rest.'),
    ex('c_ul_er3','Face Pull','3×20',3,'Cable at face height. Pull to forehead, elbows high and wide. External rotation finish. Essential shoulder health. 60s.'),
    ex('c_ul_er4','EZ Bar Curl','3×12',3,'Strict — no swing. Control the eccentric. 60s rest.'),
  ],
  landing: [
    ex('c_ul_l1','Lat Hang Stretch','45s',1,'Hang from pullup bar, completely relaxed. Decompresses shoulder and spine after heavy pulling.',true),
    ex('c_ul_l2','Thoracic Rotation (seated)','60s/side',1,'Seated, cross arms on chest. Rotate slowly through mid-back only. Restores spinal mobility after loading.',true),
    ex('c_ul_l3','Diaphragmatic Breathing','10 breaths',1,'Inhale 4, hold 2, exhale 6. CNS down-regulation protocol.',true),
  ],
};

WORKOUTS.comm['Power / Plyo'] = {
  taxi: [
    ex('c_pp_t1','Jump Rope / Ankle Bouncing','3 min',1,'Moderate pace. Warms Achilles and prepares the elastic system. Don\'t skip this.',true),
    ex('c_pp_t2','Light Squat Jumps','2×5',2,'Bodyweight only. Focus on arm swing mechanics and soft landing. Each jump should feel controlled.'),
    ex('c_pp_t3','Hip Flexor Lunge Stretch','60s/side',1,'Kneeling lunge, hands overhead, lean forward. Hip flexors are always tight in pilots. Must be addressed before sprint and jump work.',true),
  ],
  takeoff: [
    ex('c_pp_to1','Box Jump','5×3',5,'FULL 3-minute rest between sets. Every rep is maximum effort — loaded countermovement, explosive drive. Step down slowly. Treat your nervous system accordingly.'),
    ex('c_pp_to2','Trap Bar Deadlift','5×3',5,'Heavy and FAST. The concentric must be explosive. Work up to a heavy triple. 3-4 min rest. This builds the engine for jumping.'),
  ],
  enroute: [
    ex('c_pp_er1','Broad Jump','5×3',5,'Horizontal power transfers to vertical. Max effort — arm swing, explosive hip extension. Stick the landing. Full rest between sets.'),
    ex('c_pp_er2','Walking Lunge','3×10/leg',3,'Light-moderate. Hip flexor strength critical for jump takeoff mechanics.'),
    ex('c_pp_er3','Sprint 40yd','6 reps',6,'Full speed. Walk back. 90s minimum rest. Ground force application directly improves jump height.'),
    ex('c_pp_er4','Ankle Hop','3×20',3,'Minimal knee bend. Fast and springy. Achilles stiffness training — important for jump efficiency.'),
  ],
  landing: [
    ex('c_pp_l1','Achilles / Calf Stretch','90s/side',1,'Step on step edge, drop heel slowly. CNS cool-down begins here. Breathe deeply.',true),
    ex('c_pp_l2','Slow Pogo Hops (25% effort)','30s',1,'Gentle bouncing — minimal effort. Active recovery for the elastic system. Signals end of power work.',true),
    ex('c_pp_l3','Non-Sleep Deep Rest (NSDR)','5 min',1,'Lie flat. Eyes closed. Breathe slowly. Research shows NSDR post-workout accelerates motor learning and strength retention. Set a timer.',true),
  ],
};

WORKOUTS.comm['Full Body'] = {
  taxi: [
    ex('c_fb_t1','Full Mobility Circuit','1 round',1,'5 hip 90/90 each side → 10 arm circles each way → 10 thoracic extensions → 10 bodyweight squats. Run through once slowly.',true),
    ex('c_fb_t2','Lateral Band Walk','2×15/side',2,'Glute activation before compound loading.'),
  ],
  takeoff: [
    ex('c_fb_to1','Back Squat','4×5',4,'Heavy. Primary lower body compound. 3 min rest.'),
    ex('c_fb_to2','Bench Press','4×5',4,'Heavy. Primary upper push. 3 min rest.'),
  ],
  enroute: [
    ex('c_fb_er1','Deadlift','3×3',3,'Heavy triple. Maximum posterior chain. 4 min rest.'),
    ex('c_fb_er2','Weighted Pullups','3×6',3,'Add weight if bodyweight is easy. 2 min rest.'),
    ex('c_fb_er3','Overhead Press','3×8',3,'Moderate. Standing. 90s rest.'),
    ex('c_fb_er4','Bulgarian Split Squat','3×8/leg',3,'Unilateral leg accessory. 90s rest.'),
  ],
  landing: [
    ex('c_fb_l1','Full Body Stretch Circuit','5 min',1,'Child\'s pose → pigeon each side → lat hang → chest doorframe. Slow, held positions. You loaded everything today.',true),
    ex('c_fb_l2','Diaphragmatic Breathing','10 breaths',1,'Inhale 4, hold 2, exhale 6. Full CNS down-regulation.',true),
  ],
};

WORKOUTS.comm['Longevity'] = {
  taxi: [
    ex('c_lg_t1','Cat-Cow','2×10',2,'Slow spinal articulation. Inhale on extension, exhale on flexion. Gentle spine wake-up.'),
    ex('c_lg_t2','Dead Bug','2×8/side',2,'Lie on back. Extend opposite arm/leg slowly. Lower back stays pressed to floor throughout.'),
    ex('c_lg_t3','Hip 90/90','60s/side',1,'Slow rotation between internal and external hip position.',true),
  ],
  takeoff: [
    ex('c_lg_to1','Goblet Squat','3×10',3,'Moderate weight. Full depth. Most joint-friendly lower body compound. 2 min rest.'),
    ex('c_lg_to2','Cable Row','3×12',3,'Back health and posture. Full retraction. 90s rest.'),
  ],
  enroute: [
    ex('c_lg_er1','Farmer Carry','3×40yd',3,'Heaviest DB you can hold with perfect posture. Builds grip, core, and spinal stability simultaneously.'),
    ex('c_lg_er2','Face Pull','3×20',3,'Essential shoulder health. Every pilot should do these every session.'),
    ex('c_lg_er3','Pallof Press','3×10/side',3,'Cable or band. Extend arms straight out — resist rotation. Anti-rotation core stability.'),
    ex('c_lg_er4','Split Squat','3×10/leg',3,'Both feet on floor. Controlled descent. Joint-friendly lower body.'),
  ],
  landing: [
    ex('c_lg_l1','Hip 90/90 Rotation Drill','90s/side',1,'Your most important mobility work as a pilot. Hip restriction leads to lumbar compensation.',true),
    ex('c_lg_l2','Neck Mobility Protocol','2×8/direction',1,'Forward, back, rotation each side, lateral flexion. Gentle and slow. Cervical spine gets compressed in cockpit posture.'),
    ex('c_lg_l3','Zone 2 Walk','10 min',1,'Brisk walk. Conversational pace. Clears lactate, reduces cortisol, aids sleep quality.',true),
  ],
};

WORKOUTS.comm['Cardio'] = {
  taxi: [
    ex('c_ca_t1','Brisk Walk Ramp-Up','3 min',1,'Start slow, build pace. Get the cardiovascular system moving before interval work.',true),
  ],
  takeoff: [
    ex('c_ca_to1','Rowing Machine Intervals','6×500m',6,'Hard effort. Record split time each interval. 90s rest. Rowing is the most complete aerobic machine.'),
    ex('c_ca_to2','Assault Bike Intervals','8×30s',8,'All-out 30 seconds. 60s easy spin. Record calories per round.'),
  ],
  enroute: [
    ex('c_ca_er1','Treadmill Zone 2 Run','20 min',1,'Conversational pace — speak in full sentences. 65-70% max HR. Builds aerobic base.',true),
    ex('c_ca_er2','Step-Up (light)','3×15/leg',3,'Active recovery strength during aerobic session. Light load.'),
  ],
  landing: [
    ex('c_ca_l1','Cool-Down Walk','5 min',1,'Slow your pace gradually. Don\'t stop abruptly — keep blood moving.',true),
    ex('c_ca_l2','Static Stretching Circuit','5 min',1,'Hip flexors, hamstrings, calves. Hold each 45+ seconds.',true),
  ],
};

// ════════════════════════════════════════════════════════════════════════
// HOTEL GYM
// ════════════════════════════════════════════════════════════════════════
WORKOUTS.hotel = {};

WORKOUTS.hotel['Lower Body'] = {
  taxi: WORKOUTS.comm['Lower Body'].taxi.slice(0,3),
  takeoff: [
    ex('h_lb_to1','Heavy Goblet Squat','5×6',5,'Heaviest DB available. Full depth. This is your primary compound today. 3 min rest.'),
    ex('h_lb_to2','DB Romanian Deadlift','4×8',4,'Hip hinge. Feel the hamstring stretch. Moderate-heavy. 2 min rest.'),
  ],
  enroute: [
    ex('h_lb_er1','Bulgarian Split Squat','3×10/leg',3,'Use a bench. Bodyweight or light DBs. Best hotel leg exercise available. 90s rest.'),
    ex('h_lb_er2','Weighted Step-Up','3×12/leg',3,'Drive through the working heel. Full hip extension at top. 90s rest.'),
    ex('h_lb_er3','Single-Leg Calf Raise','3×15',3,'Step edge for full ROM. 60s rest.'),
    ex('h_lb_er4','DB Lateral Lunge','3×10/side',3,'Step to side, sit into the hip. Hip mobility and adductor strength.'),
  ],
  landing: WORKOUTS.comm['Lower Body'].landing,
};

WORKOUTS.hotel['Upper Push'] = {
  taxi: WORKOUTS.comm['Upper Push'].taxi,
  takeoff: [
    ex('h_up_to1','DB Bench Press','4×8',4,'Heaviest DBs. Full ROM. 2-3 min rest.'),
    ex('h_up_to2','DB Overhead Press','4×8',4,'Standing. Full lockout. 2 min rest.'),
  ],
  enroute: [
    ex('h_up_er1','DB Incline Press','3×10',3,'30-45°. Upper chest focus. 90s rest.'),
    ex('h_up_er2','DB Lateral Raise','3×15',3,'Light and strict. Shoulder health. 60s.'),
    ex('h_up_er3','DB Tricep Overhead','3×12',3,'Both hands on one DB. Full stretch. 60s.'),
    ex('h_up_er4','DB Front Raise','3×12',3,'Alternating. Light weight. 60s.'),
  ],
  landing: WORKOUTS.comm['Upper Push'].landing,
};

WORKOUTS.hotel['Upper Pull'] = {
  taxi: WORKOUTS.comm['Upper Pull'].taxi.slice(0,2),
  takeoff: [
    ex('h_ul_to1','Pullups','5×max',5,'Every set near-failure. Full hang at bottom. Add weight if sets exceed 8. 2-3 min rest.'),
    ex('h_ul_to2','DB Row','4×10/side',4,'Chest on bench. Heavy. Full retraction. 2 min rest.'),
  ],
  enroute: [
    ex('h_ul_er1','Chinups','3×max',3,'Supinated grip. Bicep emphasis. 90s rest.'),
    ex('h_ul_er2','DB Curl','3×12',3,'Controlled eccentric. Supinate at top. 60s.'),
    ex('h_ul_er3','Bent-Over DB Face Pull','3×15',3,'Light DBs. External rotation at finish. Shoulder health. 60s.'),
    ex('h_ul_er4','DB Hammer Curl','3×12',3,'Neutral grip. Brachialis emphasis. 60s.'),
  ],
  landing: WORKOUTS.comm['Upper Pull'].landing,
};

WORKOUTS.hotel['Power / Plyo'] = {
  taxi: WORKOUTS.comm['Power / Plyo'].taxi,
  takeoff: [
    ex('h_pp_to1','Bench/Box Jump','5×3',5,'Highest stable surface. Max effort. FULL 3 min rest. Most important hotel power exercise.'),
    ex('h_pp_to2','Broad Jump','5×3',5,'Max horizontal distance. Stick the landing. Full rest.'),
  ],
  enroute: [
    ex('h_pp_er1','DB Jump Squat','4×5',4,'Light DBs. Explosive concentric. Land soft. 2 min rest.'),
    ex('h_pp_er2','Sprint (hall/outside)','6×20yd',6,'Full speed. Walk back. Full rest. No jogging.'),
    ex('h_pp_er3','Split Jump','3×6',3,'Lunge position, jump and switch. Hip flexor power. 90s rest.'),
    ex('h_pp_er4','Depth Drop','3×5',3,'Step off low bench, land softly, absorb — reactive strength. 2 min rest.'),
  ],
  landing: WORKOUTS.comm['Power / Plyo'].landing,
};

WORKOUTS.hotel['Full Body'] = {
  taxi: [ex('h_fb_t1','Full Mobility Circuit','1 round',1,'5 hip 90/90 each side → 10 arm circles → 10 thoracic extensions → 10 goblet squats. Slow.',true)],
  takeoff: [
    ex('h_fb_to1','Heavy Goblet Squat','4×6',4,'Heaviest DB. Full depth. Primary lower. 3 min rest.'),
    ex('h_fb_to2','DB Bench Press','4×6',4,'Heavy. Primary upper push. 3 min rest.'),
  ],
  enroute: [
    ex('h_fb_er1','Pullups','3×max',3,'Upper pull. 90s rest.'),
    ex('h_fb_er2','DB Overhead Press','3×8',3,'Standing. 90s rest.'),
    ex('h_fb_er3','Bulgarian Split Squat','3×8/leg',3,'Unilateral leg. 90s rest.'),
    ex('h_fb_er4','DB Row','3×10/side',3,'Back. 90s rest.'),
  ],
  landing: [
    ex('h_fb_l1','Full Body Stretch','5 min',1,'Child\'s pose → pigeon → lat hang → chest stretch. Held positions.',true),
    ex('h_fb_l2','Diaphragmatic Breathing','10 breaths',1,'Inhale 4, hold 2, exhale 6.',true),
  ],
};

WORKOUTS.hotel['Longevity'] = WORKOUTS.comm['Longevity'];

WORKOUTS.hotel['Cardio'] = {
  taxi: WORKOUTS.comm['Cardio'].taxi,
  takeoff: [
    ex('h_ca_to1','Treadmill Intervals','8×1 min',8,'Hard 1 min run, 90s walk. Record pace each rep.'),
    ex('h_ca_to2','Stationary Bike Intervals','6×45s',6,'High resistance. Hard effort. 60s easy.'),
  ],
  enroute: [
    ex('h_ca_er1','Treadmill Zone 2 Run','20 min',1,'Conversational pace. Steady state after intervals.',true),
    ex('h_ca_er2','Step-Up (light)','3×15/leg',3,'Active recovery strength.'),
  ],
  landing: WORKOUTS.comm['Cardio'].landing,
};

// ════════════════════════════════════════════════════════════════════════
// HOTEL ROOM (bodyweight / minimal)
// ════════════════════════════════════════════════════════════════════════
WORKOUTS.room = {};

WORKOUTS.room['Lower Body'] = {
  taxi: WORKOUTS.comm['Lower Body'].taxi.slice(0,3),
  takeoff: [
    ex('r_lb_to1','Pistol Squat Progression','4×5/leg',4,'Assisted or full. Best bodyweight lower body exercise. Hold door handle for support if needed. 2-3 min rest.'),
    ex('r_lb_to2','Nordic Hamstring Curl','3×5',3,'Feet anchored under bed or door. Lower as slowly as possible. Extremely high hamstring stimulus. 2 min rest.'),
  ],
  enroute: [
    ex('r_lb_er1','Bulgarian Split Squat','4×12/leg',4,'Rear foot on bed. Bodyweight. Slow on the way down. 90s rest.'),
    ex('r_lb_er2','Single-Leg Glute Bridge','3×15/leg',3,'Drive through heel. Full hip extension. 60s rest.'),
    ex('r_lb_er3','Calf Raise (step)','4×20',4,'Use a stair or book stack. Full ROM. 60s rest.'),
    ex('r_lb_er4','Reverse Lunge','3×12/leg',3,'Step back, drive through front heel. Upright torso. 60s rest.'),
  ],
  landing: WORKOUTS.comm['Lower Body'].landing,
};

WORKOUTS.room['Upper Push'] = {
  taxi: WORKOUTS.comm['Upper Push'].taxi.slice(0,2),
  takeoff: [
    ex('r_up_to1','Archer Pushup','4×5/side',4,'One arm supports, one extends. Unilateral chest. 2 min rest.'),
    ex('r_up_to2','Pike Pushup','4×10',4,'Hips high, head toward floor. Overhead strength pattern. 2 min rest.'),
  ],
  enroute: [
    ex('r_up_er1','Pushup Variations','3×15',3,'Wide, close, explosive — mix it up. Max effort each set.'),
    ex('r_up_er2','Chair Dips','3×max',3,'Tricep focus. Full lockout at top.'),
    ex('r_up_er3','Decline Pushup','3×12',3,'Feet on bed. Upper chest and shoulder emphasis.'),
    ex('r_up_er4','Plank','3×60s',3,'Straight line head to heels. Brace hard.',true),
  ],
  landing: WORKOUTS.comm['Upper Push'].landing,
};

WORKOUTS.room['Upper Pull'] = {
  taxi: WORKOUTS.comm['Upper Pull'].taxi.slice(0,2),
  takeoff: [
    ex('r_ul_to1','Pullups (bar if available)','5×max',5,'Every rep near-failure. Full hang at bottom.'),
    ex('r_ul_to2','Table / Inverted Row','4×12',4,'Heels on floor under table, pull chest to edge. Full retraction.'),
  ],
  enroute: [
    ex('r_ul_er1','Chinups','3×max',3,'Supinated. Bicep emphasis.'),
    ex('r_ul_er2','Towel Curl','3×15',3,'Towel looped over door handle. Lean back and curl. Good isolation with zero equipment.'),
    ex('r_ul_er3','Door Frame Row','3×12',3,'Hold frame, lean back, pull chest to hands.'),
    ex('r_ul_er4','Superman Hold','3×30s',3,'Lie face down, extend arms and legs, hold. Lower back and glute activation.',true),
  ],
  landing: WORKOUTS.comm['Upper Pull'].landing,
};

WORKOUTS.room['Power / Plyo'] = {
  taxi: WORKOUTS.comm['Power / Plyo'].taxi,
  takeoff: [
    ex('r_pp_to1','Bed/Chair Jump','5×3',5,'Any stable surface. Max jump every rep. Step down. FULL 3 min rest.'),
    ex('r_pp_to2','Broad Jump','5×3',5,'Hallway. Max effort. Full rest.'),
  ],
  enroute: [
    ex('r_pp_er1','Squat Jump','4×5',4,'Bodyweight. Explode every rep. Land soft.'),
    ex('r_pp_er2','Split Jump','3×6',3,'Lunge position, jump and switch. Hip flexor power.'),
    ex('r_pp_er3','Explosive Pushup','4×5',4,'Hands leave floor. Upper body power.'),
    ex('r_pp_er4','Pogo Hop','3×20',3,'Stiff ankles. Fast and springy. Achilles stiffness training.'),
  ],
  landing: WORKOUTS.comm['Power / Plyo'].landing,
};

WORKOUTS.room['Full Body'] = {
  taxi: [ex('r_fb_t1','Full Mobility Circuit','1 round',1,'5 hip 90/90 each side → 10 arm circles → 10 thoracic extensions → 10 bodyweight squats.',true)],
  takeoff: [
    ex('r_fb_to1','Pistol Squat Progression','3×5/leg',3,'Primary lower. Best available.'),
    ex('r_fb_to2','Pullups / Table Row','3×max',3,'Primary upper pull.'),
  ],
  enroute: [
    ex('r_fb_er1','Archer Pushup','3×5/side',3,'Upper push.'),
    ex('r_fb_er2','Bulgarian Split Squat','3×10/leg',3,'Unilateral leg.'),
    ex('r_fb_er3','Pike Pushup','3×10',3,'Overhead push pattern.'),
    ex('r_fb_er4','Superman Hold','3×30s',3,'Posterior chain and back.',true),
  ],
  landing: [
    ex('r_fb_l1','Full Body Stretch','5 min',1,'Child\'s pose → pigeon → doorframe chest → neck mobility.',true),
    ex('r_fb_l2','Diaphragmatic Breathing','10 breaths',1,'Inhale 4, hold 2, exhale 6.',true),
  ],
};

WORKOUTS.room['Longevity'] = {
  taxi: WORKOUTS.comm['Longevity'].taxi,
  takeoff: [
    ex('r_lg_to1','Slow Bodyweight Squat','3×12',3,'3s down, 1s pause, controlled up. Joint-friendly. 2 min rest.'),
    ex('r_lg_to2','Inverted Row / Door Row','3×12',3,'Full retraction. Back health. 2 min rest.'),
  ],
  enroute: [
    ex('r_lg_er1','Reverse Lunge','3×10/leg',3,'Controlled. Knee tracks over toe. 90s rest.'),
    ex('r_lg_er2','Slow Pushup','3×8',3,'4s down, 2s pause. Joint-friendly pressing. 90s.'),
    ex('r_lg_er3','Dead Bug','3×8/side',3,'Core stability. Lower back health. 60s.'),
    ex('r_lg_er4','Bird Dog','3×10/side',3,'Opposite arm-leg. Spinal stability. 60s.'),
  ],
  landing: WORKOUTS.comm['Longevity'].landing,
};

WORKOUTS.room['Cardio'] = {
  taxi: WORKOUTS.comm['Cardio'].taxi,
  takeoff: [
    ex('r_ca_to1','Burpee Intervals','8×30s',8,'Max burpees in 30s. Rest 30s. Count reps each round.'),
    ex('r_ca_to2','Stair Sprint Intervals','6×2 flights',6,'Full sprint up. Walk down. 60s rest.'),
  ],
  enroute: [
    ex('r_ca_er1','Jump Lunge','4×10/leg',4,'Explosive alternating. 90s rest.'),
    ex('r_ca_er2','Mountain Climbers','4×30s',4,'Fast feet. Hips level. 45s rest.',true),
  ],
  landing: WORKOUTS.comm['Cardio'].landing,
};

// ─── FATIGUE PROTOCOL ─────────────────────────────────────────────────────────
// When fatigue = 'marginal': skip takeoff, reduce enroute to 1 exercise
// When fatigue = 'nogo': only taxi (mobility) and landing (decompression)
function getFilteredWorkout(rawWk) {
  if (!rawWk) return null;
  if (ST.fatigue === 'nogo') {
    return {
      taxi:    rawWk.taxi,
      takeoff: [],
      enroute: [],
      landing: rawWk.landing,
    };
  }
  if (ST.fatigue === 'marginal') {
    return {
      taxi:    rawWk.taxi,
      takeoff: [], // skip heavy work
      enroute: rawWk.enroute.slice(0,1), // one light exercise only
      landing: rawWk.landing,
    };
  }
  // GO — apply level limits
  const lim = LEVEL_EX[ST.level] || LEVEL_EX.intermediate;
  return {
    taxi:    rawWk.taxi.slice(0, lim.taxi),
    takeoff: rawWk.takeoff.slice(0, lim.takeoff),
    enroute: rawWk.enroute.slice(0, lim.enroute),
    landing: rawWk.landing.slice(0, lim.landing),
  };
}

// ─── WISDOM CARDS ─────────────────────────────────────────────────────────────
const WISDOM = [
  { title:'Hydration SOP', text:'The FAA and aviation medicine literature set 0.3L per flight hour as the baseline hydration requirement. At altitude, cabin humidity drops below 20% — drier than the Sahara. You lose fluid faster than you feel thirsty. By the time thirst kicks in, you\'re already 1-2% dehydrated — enough to measurably impair reaction time, working memory, and decision-making. Things that matter in the cockpit and in the gym.', link:'https://pubmed.ncbi.nlm.nih.gov/14681719/' },
  { title:'Seated Correction', text:'Sustained sitting compresses intervertebral discs, shuts off the glutes, and tightens the hip flexors — a triple threat for lower back problems. Set a timer for every 60 minutes in the cockpit or hotel room. Perform 10 glute squeezes, 5 standing hip hinges, and a 20-second thoracic extension over a chair. This micro-break protocol is used by NASA long-duration spaceflight physicians to maintain musculoskeletal health.', link:'https://pubmed.ncbi.nlm.nih.gov/28870953/' },
  { title:'Landing Prep Breathing', text:'4-7-8 breathing (inhale 4 counts, hold 7, exhale 8) directly activates the vagus nerve and shifts your autonomic nervous system from sympathetic to parasympathetic. Use this during approach if workload permits, or immediately post-landing. It drops cortisol, lowers heart rate, and clears cognitive noise within 3-5 breath cycles. It is also an effective pre-sleep protocol for shift workers with disrupted schedules.', link:'https://www.health.harvard.edu/mind-and-mood/relaxation-techniques-breath-control-helps-quell-errant-stress-response' },
  { title:'BP Accuracy Protocol', text:'Blood pressure has a significant protocol effect — method changes the number. Wait 5 full minutes of quiet rest before measuring. Sit with back supported, feet flat, arm at heart level. No talking. Take three readings 1-2 minutes apart and average the last two. Coffee, exercise, or conversation within 30 minutes can falsely elevate readings by 10-20 mmHg. For pilots, BP is a medical certificate issue — accurate data matters.', link:'https://www.ahajournals.org/doi/10.1161/HYP.0000000000000065' },
  { title:'Fasting Glucose Baseline', text:'Fasting glucose should be measured upon waking, before any food or coffee, after 8+ hours with no caloric intake. Clinical ranges: 70-99 = normal, 100-125 = pre-diabetic, 126+ = diabetic threshold. For pilots, metabolic health is a medical certificate issue — longitudinal tracking gives you early signal before it becomes a problem. Note: stress, poor sleep, and shift-work schedules chronically elevate fasting glucose independent of diet.', link:'https://pubmed.ncbi.nlm.nih.gov/30559192/' },
  { title:'Blue Light Management', text:'Retinal photoreceptors are maximally sensitive to blue light at 480nm. Screen exposure after dark delays melatonin onset by 90-180 minutes and suppresses total melatonin output by up to 50%. For pilots with disrupted circadian rhythms, this is compounded. Blue light blocking glasses (amber lens, 450nm filter) or Night Shift/f.lux after 6pm are evidence-based countermeasures. The research supports implementation within days — not weeks.', link:'https://pubmed.ncbi.nlm.nih.gov/17950011/' },
  { title:'Why Squats Matter', text:'The squat is not a leg exercise — it is a full-system loading event. The lumbar spine, thoracic spine, hip flexors, glutes, hamstrings, quadriceps, calves, and core all contribute to a properly executed squat. For pilots, the squat also trains the postural chain that degrades from prolonged seat time. Regular loaded squatting increases bone mineral density, improves insulin sensitivity, and elevates anabolic hormone output for hours post-session.', link:'https://pubmed.ncbi.nlm.nih.gov/24236446/' },
  { title:'Post-Meal Walk', text:'A 10-minute moderate-paced walk after a meal reduces the postprandial glucose spike by 30-40% according to multiple randomized controlled trials. The mechanism: muscle contractions during walking act as a non-insulin-dependent glucose uptake pathway via GLUT4 transporter translocation. For pilots eating irregular meals at irregular times, a post-meal walk is one of the highest-leverage metabolic interventions available regardless of hotel, airport, or terminal.', link:'https://pubmed.ncbi.nlm.nih.gov/35687729/' },
  { title:'Sleep Consistency', text:'Wake time consistency is the master regulator of circadian rhythm — more so than bedtime. Your body sets its entire hormonal cascade (cortisol, melatonin, GH, testosterone) based on anchored wake time. Even after a red-eye or irregular schedule, anchoring your wake time within a 30-minute window rebuilds circadian alignment within 2-3 days. Irregular sleep timing — even with adequate total hours — is associated with metabolic syndrome and cognitive decline.', link:'https://pubmed.ncbi.nlm.nih.gov/26158019/' },
  { title:'Box Breathing for Pilots', text:'Box breathing (4 counts in, 4 hold, 4 out, 4 hold) is a US Navy SEAL operational protocol endorsed by multiple military and aviation psychology programs for acute stress reduction. It activates the baroreceptor reflex, slowing heart rate and modulating the sympathetic surge. Research shows measurable reductions in salivary cortisol after just 3-5 cycles. Use it pre-approach, pre-conversation, or before a heavy set.', link:'https://pubmed.ncbi.nlm.nih.gov/31368925/' },
  { title:'Protein Priority', text:'30g of high-quality protein per meal maximizes muscle protein synthesis in most adults via leucine threshold activation of the mTOR pathway. Spreading intake across 3-4 meals outperforms front- or back-loading. For pilots in caloric environments (airports, hotels, crew meals), this requires intentional selection: eggs, Greek yogurt, chicken breast, cottage cheese. Protein also has the highest thermic effect of any macronutrient — 25-30% of calories are burned in digestion.', link:'https://pubmed.ncbi.nlm.nih.gov/26797090/' },
  { title:'Fiber Intake', text:'30 grams of dietary fiber daily is the minimum target supported by current metabolic health research. Fiber feeds the gut microbiome, blunts glucose spikes, reduces LDL cholesterol, and promotes satiety. Soluble fiber (oats, legumes, apples) is particularly effective for glucose control. Insoluble fiber (vegetables, whole grains) supports motility. Most Americans eat 10-15g/day — half the clinical minimum.', link:'https://pubmed.ncbi.nlm.nih.gov/31174214/' },
  { title:'Zone 2 Training', text:'Zone 2 (roughly 60-70% max HR, conversational pace) is the training zone that builds mitochondrial density, improves fat oxidation, and enhances cardiac output. Elite endurance athletes spend 80% of training volume here. For general health, 150-180 minutes per week is the evidence-based target. Benefits include reduced all-cause mortality risk, improved insulin sensitivity, and CNS recovery facilitation. It takes 6-12 weeks of consistent training to see significant improvement.', link:'https://pubmed.ncbi.nlm.nih.gov/34510508/' },
  { title:'Thoracic Mobility', text:'Thoracic extension mobility is the single most important structural quality for pilots. Prolonged forward flexion locks the thoracic spine into kyphosis. When this happens, compensatory load transfers to the lumbar and cervical spine — the two most common sites of pilot musculoskeletal injury. Thoracic extension over a foam roller or chair (10 reps daily) directly counteracts this. 10 minutes a day prevents years of chronic pain.', link:'https://pubmed.ncbi.nlm.nih.gov/25379884/' },
  { title:'Caffeine Cutoff', text:'Caffeine has a half-life of 5-7 hours and a quarter-life of 10-14 hours. A 200mg coffee at 2pm still has 100mg circulating at 7-9pm — enough to delay sleep onset, reduce slow-wave sleep, and decrease total sleep time even if you fall asleep normally. For shift workers and pilots with irregular schedules, the cutoff matters more, not less. Adenosine continues to accumulate regardless — caffeine only masks it, and the debt is paid during sleep.', link:'https://pubmed.ncbi.nlm.nih.gov/23034071/' },
  { title:'Morning Light Exposure', text:'Morning light exposure within 30-60 minutes of waking anchors the circadian clock via retinal photoreceptor activation. Even on overcast days, outdoor light is 10,000+ lux versus 200-400 lux indoors. This morning signal sets the timer for melatonin release 14-16 hours later. For pilots crossing time zones, morning light at the destination is the fastest available intervention for circadian resynchronization — faster than melatonin supplementation alone.', link:'https://pubmed.ncbi.nlm.nih.gov/28578993/' },
  { title:'The Big Three Lifts', text:'The three fundamental movement patterns that transfer most broadly to longevity, performance, and injury resistance: a loaded squat (leg and posterior chain strength), a horizontal or vertical pull (back and scapular health), and a hip hinge (deadlift — posterior chain and spinal loading). If you do nothing else, maintain competency in these three. Grip strength and lower body power are the two strongest predictors of all-cause mortality in aging populations.', link:'https://pubmed.ncbi.nlm.nih.gov/25530455/' },
  { title:'Active Recovery on Layovers', text:'On layovers, the reflex is to rest — but passive sitting on top of 8 hours of cockpit sitting is counterproductive. Light movement (Zone 2 walk, mobility work, easy swimming) actively clears blood lactate, reduces muscle soreness markers, improves lymphatic flow, and restores parasympathetic tone better than complete rest. The threshold is low: 20-30 minutes of easy movement gains all recovery benefits without adding training stress.', link:'https://pubmed.ncbi.nlm.nih.gov/22675826/' },
  { title:'Waist Measurement Protocol', text:'Stand relaxed. Locate the top of the hip bone (iliac crest). Measure at the umbilicus level at end of normal exhale. Do not suck in. Do not wear clothing. Use a flexible tape — snug but not compressing. Clinically, waist above 40 inches (men) or 35 inches (women) is a primary risk marker for metabolic syndrome, cardiovascular disease, and type 2 diabetes — independent of BMI. It is a better predictor of visceral fat than bodyweight alone.', link:'https://www.nhlbi.nih.gov/health/educational/lose_wt/risk.htm' },
  { title:'Meal Timing', text:'The 3-hour pre-sleep food cutoff is supported by research on postprandial thermogenesis, gastroesophageal reflux, core body temperature, and insulin dynamics. Core body temperature must drop 1-2°F for sleep onset. Digestion elevates core temperature and keeps insulin elevated — both of which delay or disrupt sleep onset and architecture. Late eating is also associated with higher overnight glucose, increased fat storage, and reduced growth hormone secretion.', link:'https://pubmed.ncbi.nlm.nih.gov/31139149/' },
  { title:'CNS Recovery', text:'Strength is built during recovery, not during training. The session is the stimulus — adaptation happens in the 24-72 hours following. Insufficient recovery (less than 7 hours sleep, inadequate protein, high stress) means the stimulus was wasted. For pilots with irregular sleep: prioritize protein intake on duty days even if training is missed. The anabolic window is longer than once thought — protein consumed within 4-6 hours of the previous session still supports adaptation.', link:'https://pubmed.ncbi.nlm.nih.gov/23343676/' },
  { title:'Scapular Position', text:'The correct scapular position is "back and down" — not artificially retracted, just out of the forward-rounded cockpit default. A practical cue: imagine trying to put your shoulder blades into your back pockets. This places the shoulder socket in optimal position for overhead reach and reduces impingement risk. Reinforce this before every pressing or pulling set. For pilots with years of forward-rounded habits, this requires deliberate daily practice.', link:'https://pubmed.ncbi.nlm.nih.gov/19362276/' },
  { title:'Spinal Decompression', text:'Child\'s pose with arms extended creates gentle lumbar traction and counters the spinal compression accumulated during prolonged seating. Intradiscal pressure research shows standing reduces disc pressure by 60% versus sitting, and lying prone/supine reduces it further. 90 seconds in a held stretch position produces measurable intradiscal fluid rehydration. This is not optional after a leg session or a long duty day — it is maintenance.', link:'https://pubmed.ncbi.nlm.nih.gov/3951250/' },
  { title:'Blood Sugar Control', text:'Refined carbohydrates and added sugars create rapid glucose spikes followed by reactive hypoglycemia — the energy crash 90-120 minutes later. For pilots, this pattern impairs alertness during the crash phase in a way not always consciously perceived but measurably affecting cognitive performance. Whole food carbohydrates (fruit, vegetables, legumes, whole grains) have slower digestion due to fiber. Pairing any carbohydrate with protein and fat further blunts the spike.', link:'https://pubmed.ncbi.nlm.nih.gov/32025084/' },
  { title:'Urine Color Chart', text:'Urine color is a validated, free, always-available hydration biomarker. Pale straw (1-3) = well hydrated. Yellow (4-6) = mild dehydration. Dark amber (7-8) = significant dehydration requiring immediate action. Note: B vitamins and some medications cause fluorescent yellow urine regardless of hydration status. Assess in the morning before supplementation for the most accurate reading. This is the simplest daily biomarker available.', link:'https://pubmed.ncbi.nlm.nih.gov/9694420/' },
  { title:'Cold Exposure', text:'Brief cold exposure at the end of a shower (30-90 seconds, as cold as possible) activates norepinephrine release, improves metabolic rate, and has been associated with improved mood via beta-endorphin release. For pilots: cold exposure accelerates post-exercise muscle recovery by reducing inflammatory markers and perceived soreness. The mechanism is vasoconstriction followed by vasodilation — a flushing effect on metabolic waste products.', link:'https://pubmed.ncbi.nlm.nih.gov/23789999/' },
  { title:'Two-Minute Mindfulness', text:'Two minutes of focused attention meditation (eyes closed, attention on breath, non-judgmental awareness of thoughts) measurably reduces cortisol within a single session and improves sustained attention on cognitive tasks. Decision fatigue accumulates across a duty day in ways not subjectively perceived. Short mindfulness breaks — even 2 minutes between legs — have shown sustained effects on working memory and task switching in high-cognitive-load professionals.', link:'https://pubmed.ncbi.nlm.nih.gov/24395196/' },
  { title:'Tempo Training for Longevity', text:'Controlling the speed of both the concentric (lifting) and eccentric (lowering) phases dramatically increases tendon and connective tissue stimulus relative to fast, uncontrolled repetitions. Tendons adapt more slowly than muscle (weeks to months versus days). A 3-second eccentric is the minimum for connective tissue stimulus. For pilots building longevity-focused programs, this means trading some load for control — a worthwhile trade at any age after 40.', link:'https://pubmed.ncbi.nlm.nih.gov/19260172/' },
  { title:'Dietary Blood Pressure', text:'Reducing sodium by 1,000mg/day lowers systolic BP by an average of 5-6 mmHg in sodium-sensitive individuals. Simultaneously increasing potassium-rich foods (leafy greens, avocado, sweet potato, legumes) adds another 3-4 mmHg via renal sodium excretion. Combined, this dietary shift matches the effect of a low-dose antihypertensive — without side effects. For pilots, BP control is a medical certificate issue. Diet is your first-line intervention.', link:'https://pubmed.ncbi.nlm.nih.gov/23410606/' },
  { title:'Anti-Movement Core Training', text:'The spine has no intrinsic stability — it relies entirely on surrounding musculature. Planks, dead bugs, and Pallof presses train "anti-movement" core function: resisting extension, rotation, and flexion under load. This is more functionally protective than crunches, which train flexion into an already-flexed spine. Stuart McGill\'s spinal biomechanics research (the definitive work in this field) supports anti-movement training as the primary intervention for back pain prevention.', link:'https://pubmed.ncbi.nlm.nih.gov/20512940/' },
  { title:'Screen-Free Pre-Sleep Window', text:'Blue light and stimulating content from screens suppresses melatonin and elevates alerting signals in the 60-90 minutes before sleep. The effect compounds with content: news, social media, and work email have additional cortisol-raising effects that persist into sleep. A hard stop on all screens 60 minutes pre-sleep, replaced with reading (physical book), journaling, or a podcast, reduces sleep onset latency significantly within 2 weeks of consistent implementation.', link:'https://pubmed.ncbi.nlm.nih.gov/24850726/' },
  { title:'Dynamic Warmup Science', text:'A dynamic warmup (leg swings, arm circles, bodyweight squats, hip hinges, lateral movements) raises core temperature, increases synovial fluid viscosity in joints, improves neuromuscular activation, and reduces injury risk. Research consistently shows dynamic warmup outperforms static stretching pre-workout for power output and injury prevention. Save static stretching for after the session when tissue is warm. 5-8 minutes of progressive movement is sufficient.', link:'https://pubmed.ncbi.nlm.nih.gov/22525657/' },
  { title:'Muscle as Metabolic Insurance', text:'Skeletal muscle is the largest insulin-sensitive tissue in the body — greater muscle mass directly increases the body\'s capacity to clear glucose from the bloodstream. A 1kg increase in lean mass improves insulin sensitivity by 3-5% independent of weight change. Resistance training 3x per week for 10 weeks has been shown to improve HbA1c, fasting glucose, and insulin resistance in both healthy and pre-diabetic populations.', link:'https://pubmed.ncbi.nlm.nih.gov/24729333/' },
  { title:'Trap Release Protocol', text:'The upper trapezius and levator scapulae carry the most cumulative tension in pilots. They work continuously to stabilize the head and shoulder girdle against gravity during prolonged sitting. Post-flight manual massage or foam rolling these muscles (30-60 seconds of sustained pressure at tender points) reduces trigger point activity and restores blood flow. A lacrosse ball against a wall replicates 80% of manual therapy effects with no cost.', link:'https://pubmed.ncbi.nlm.nih.gov/25615030/' },
  { title:'Daily Weight Protocol', text:'Body weight fluctuates 2-4 lbs daily based on hydration, food volume, and glycogen stores. To extract meaningful trend data: weigh daily upon waking, after using the restroom, before eating or drinking, on the same scale. Use a 7-day rolling average — not day-to-day comparison. This eliminates noise and reveals the true trend. Month-over-month is the signal. Day-to-day is noise. The trend matters; the number doesn\'t.', link:'https://pubmed.ncbi.nlm.nih.gov/24571926/' },
  { title:'Vitamin D for Pilots', text:'Vitamin D deficiency is endemic in pilots and flight crew due to cockpit glass UV filtration, irregular outdoor exposure, and night operations. Adequate vitamin D (serum 25-OH vitamin D of 40-60 ng/mL) supports testosterone production, immune function, bone health, and mood regulation. Supplementation of 2,000-5,000 IU D3 daily (with K2 for vascular protection) is widely recommended for those with limited sun exposure. Get levels tested annually.', link:'https://pubmed.ncbi.nlm.nih.gov/27750060/' },
  { title:'Building Your Aerobic Base', text:'The aerobic energy system is the foundation beneath everything else — it fuels recovery between sets, between intervals, and between duty days. Building it requires consistent low-intensity work: Zone 2 for 150-180 minutes per week. The adaptation is mitochondrial — you are building more cellular energy factories. This takes 6-12 weeks of consistent training to see significant improvement, but the benefits are durable and compound over years.', link:'https://pubmed.ncbi.nlm.nih.gov/29340679/' },
  { title:'Chin Tuck Protocol', text:'Chin tucks (gently draw chin straight back, not down) reverse the "forward head posture" that develops from cockpit and screen time. For every inch the head moves forward from neutral, effective cervical spine load increases by 10 lbs. A 3-inch forward head posture — common in pilots — means 30+ extra lbs of constant cervical load. 10 chin tucks per hour during screen use, combined with thoracic extension work, is an effective protocol.', link:'https://pubmed.ncbi.nlm.nih.gov/22577198/' },
  { title:'Progressive Overload', text:'Progressive overload — systematically increasing volume, intensity, or density over time — is the single non-negotiable principle of strength adaptation. The nervous system and muscle tissue only adapt to stimuli that exceed their current capacity. A structured approach: add one rep to each set before increasing weight. When all sets hit the top of the target rep range, add 2.5-5 lbs. This "double progression" method produces consistent, trackable gains for intermediate trainees.', link:'https://pubmed.ncbi.nlm.nih.gov/28834797/' },
  { title:'Hydration and Cognition', text:'Even mild dehydration (1-2% body weight loss) measurably impairs working memory, attention, and psychomotor speed — the exact cognitive domains most critical in aviation. Thirst perception lags behind physiological need, especially in air-conditioned environments and with age. Pilots over 40 have reduced thirst sensitivity. The takeaway: drink on a schedule, not on thirst. The 0.3L/flight hour guideline exists precisely because the internal signal cannot be trusted.', link:'https://pubmed.ncbi.nlm.nih.gov/21736786/' },
  { title:'Time-Restricted Eating', text:'Compressing caloric intake into an 8-10 hour window reduces oxidative stress, improves insulin sensitivity, and appears to support circadian alignment in shift workers. Benefits emerge from the fasting period itself — autophagy upregulation, AMPK activation, reduced overnight insulin — not from caloric restriction. For pilots: a 10am-8pm eating window on most days captures most benefits without requiring rigid restriction during duty days.', link:'https://pubmed.ncbi.nlm.nih.gov/31777947/' },
  { title:'Hip Hinge for Back Health', text:'The hip hinge is the most fundamental protective movement pattern for the lower back. Every time you pick something up — bags, boxes, gear — the choice is between a hip hinge (load through the posterior chain, spine neutral) and a lumbar flexion bend (load through the disc-annular complex). Over a career, this choice made thousands of times is the difference between a healthy spine at 60 and a chronic pain condition. Practice it deliberately until it becomes reflex.', link:'https://pubmed.ncbi.nlm.nih.gov/21224706/' },
  { title:'Post-Workout Nutrition', text:'The 30-60 minute window post-exercise is when muscle protein synthesis and glycogen resynthesis rates are maximally elevated. A post-workout combination of 20-40g protein + 30-50g carbohydrate maximizes both. Practical options: Greek yogurt + banana, chocolate milk, protein shake + fruit. For pilots finishing a late flight: this window also applies to the post-duty physiological stress response — protein intake supports recovery even when exercise itself was limited.', link:'https://pubmed.ncbi.nlm.nih.gov/23360586/' },
  { title:'Nasal Breathing', text:'Nasal breathing has measurable physiological advantages over mouth breathing: it filters and humidifies air, produces nitric oxide (which dilates airways and blood vessels), increases CO2 tolerance (which paradoxically improves O2 delivery to tissues), and activates the diaphragm more fully. During low-to-moderate intensity exercise, nasal-only breathing is achievable with practice and has been associated with lower heart rate at equivalent workloads and improved respiratory efficiency.', link:'https://pubmed.ncbi.nlm.nih.gov/31087013/' },
  { title:'Physical = Professional', text:'Physical readiness is not separate from professional performance — it is a component of it. Cardiovascular fitness correlates with cognitive reserve under load. Strength correlates with metabolic health markers that affect energy, mood, and recovery. Sleep quality — heavily influenced by exercise and nutrition — determines next-day decision-making capacity. Every training session is an investment in the most critical instrument you operate: yourself. The aircraft has maintenance schedules. You should too.', link:'https://pubmed.ncbi.nlm.nih.gov/23907573/' },
  { title:'Darkness for Sleep', text:'Complete darkness during sleep is associated with deeper slow-wave sleep and higher melatonin secretion. Even small amounts of light through closed eyelids activate retinal photoreceptors and reduce sleep depth. Hotel rooms rarely achieve true darkness. Solution: pack a quality sleep mask on every trip. Combined with earplugs or a white noise app and the pre-sleep caffeine cutoff, this three-intervention protocol has the strongest evidence base for improving sleep quality in shift workers.', link:'https://pubmed.ncbi.nlm.nih.gov/21311168/' },
  { title:'Frequency Over Duration', text:'Consistency in mobility work produces compounding returns that intensity cannot replicate. Connective tissue responds to sustained, repeated low-load stretching over weeks and months — not to aggressive, infrequent sessions. 10 minutes of daily mobility work produces more functional range of motion in 8 weeks than 60-minute weekly sessions. The dose-response curve for flexibility dramatically favors frequency over duration. This is why the Pilot Protocol taxi phase matters every single session.', link:'https://pubmed.ncbi.nlm.nih.gov/22030953/' },
  { title:'Track Your Weights', text:'Tracking maximum weight lifted over time is the most direct measure of training effectiveness and the only way to confirm progressive overload is occurring. Without tracking, psychological bias leads most people to believe they are progressing when they are plateaued. Minimum tracking: date, exercise, sets × reps, weight. This app does it automatically. Review logs monthly — if any exercise hasn\'t progressed in 4 weeks, something needs to change: sleep, nutrition, programming, or effort.', link:'https://pubmed.ncbi.nlm.nih.gov/28834797/' },
  { title:'Resting Heart Rate as a Metric', text:'Resting heart rate measured upon waking — before getting out of bed — is a sensitive marker of autonomic nervous system status and recovery quality. An RHR elevated 5+ beats above your personal baseline indicates incomplete recovery: too much training, too little sleep, illness, or high stress. This is physiological data — not a reason to push through. Reduce training intensity or take a rest day. Tracking RHR via a wearable (Oura, Garmin, Apple Watch) makes this effortless and automatic.', link:'https://pubmed.ncbi.nlm.nih.gov/28827680/' },
  { title:'The Long Game', text:'The goal is not a perfect week. It is a sustainable system. Consistency over 6-12 months outperforms any program, any supplement, or any single intervention by an order of magnitude. Your body adapts to the stimulus you give it consistently — not to the best effort you made once. A pilot who trains 3 days per week with moderate effort for a year will have better health outcomes than one who trains 6 days per week for 2 months then burns out. Build the system. Fly the system.', link:'https://pubmed.ncbi.nlm.nih.gov/30543830/' },
];

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function switchTab(tab) {
  ST.tab = tab;
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );
  renderPage();
}

// ─── RENDER DISPATCH ──────────────────────────────────────────────────────────
function renderPage() {
  const p = document.getElementById('mainPage');
  if (!p) return;
  p.innerHTML = '';
  if      (ST.tab === 'preflight') renderPreflight(p);
  else if (ST.tab === 'flight')    renderFlight(p);
  else if (ST.tab === 'trends')    renderTrends(p);
  else if (ST.tab === 'wisdom')    renderWisdom(p);
}

// ─── PREFLIGHT ────────────────────────────────────────────────────────────────
function renderPreflight(p) {
  const hs    = hydroStatus();
  const pct   = hydroPct();
  const def   = hydroDeficit();
  const adv   = hydroAdvice();
  const rawWk = WORKOUTS[ST.env]?.[ST.muscleGroup];
  const wk    = getFilteredWorkout(rawWk);

  const levelLabel    = {beginner:'Beginner',intermediate:'Intermediate',advanced:'Advanced'}[ST.level];
  const fatigueLabel  = {go:'🟢 GO',marginal:'🟡 MARGINAL',nogo:'🔴 NO-GO'}[ST.fatigue];
  const lim           = LEVEL_EX[ST.level] || LEVEL_EX.intermediate;
  const totalEx       = wk ? (wk.taxi.length + wk.takeoff.length + wk.enroute.length + wk.landing.length) : 0;

  // Build HTML as array to avoid template literal depth issues
  const parts = [];

  parts.push(`<div class="section-label">PREFLIGHT BRIEFING — ${FCF_VERSION}</div>`);

  // Readiness checklist
  parts.push(`<div class="card card-dark mb12">
    <div class="section-label" style="margin-top:0">READINESS CHECK</div>
    <div class="check-item">
      <div class="check-icon">${ST.flightHrs > 0 ? '✅' : '⬜'}</div>
      <div class="check-text">Flight hours logged today</div>
      <div class="check-status ${ST.flightHrs > 0 ? 'status-ok' : 'status-warn'}">${ST.flightHrs > 0 ? ST.flightHrs + ' HRS' : 'ENTER'}</div>
    </div>
    <div class="check-item">
      <div class="check-icon">${pct >= 1 ? '✅' : pct >= 0.6 ? '⚠️' : '🚨'}</div>
      <div class="check-text">Hydration status</div>
      <div class="check-status ${hs.cls}">${hs.label}</div>
    </div>
    <div class="check-item">
      <div class="check-icon">${rawWk ? '✅' : '⬜'}</div>
      <div class="check-text">Mission profile selected</div>
      <div class="check-status ${rawWk ? 'status-ok' : 'status-warn'}">${ST.muscleGroup.toUpperCase()}</div>
    </div>
    <div class="check-item" style="border-bottom:none">
      <div class="check-icon">${ST.fatigue === 'go' ? '✅' : ST.fatigue === 'marginal' ? '⚠️' : '🔴'}</div>
      <div class="check-text">Pilot condition</div>
      <div class="check-status ${ST.fatigue === 'go' ? 'status-ok' : ST.fatigue === 'marginal' ? 'status-warn' : 'status-no'}">${fatigueLabel}</div>
    </div>
  </div>`);

  // Pilot condition toggle
  parts.push(`<div class="section-label">PILOT CONDITION</div>
  <div class="card mb12">
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.5">Your physical readiness today. This gates the workout intensity — fatigue increases injury risk and impairs adaptation.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px">
      <div class="env-btn ${ST.fatigue==='go'?'sel':''}" onclick="ST.fatigue='go';renderPage()">
        <div class="ei">🟢</div><div class="el">GO</div><div style="font-size:9px;color:var(--muted);margin-top:2px">Full protocol</div>
      </div>
      <div class="env-btn ${ST.fatigue==='marginal'?'sel':''}" onclick="ST.fatigue='marginal';renderPage()">
        <div class="ei">🟡</div><div class="el">MARGINAL</div><div style="font-size:9px;color:var(--muted);margin-top:2px">Light only</div>
      </div>
      <div class="env-btn ${ST.fatigue==='nogo'?'sel':''}" onclick="ST.fatigue='nogo';renderPage()">
        <div class="ei">🔴</div><div class="el">NO-GO</div><div style="font-size:9px;color:var(--muted);margin-top:2px">Mobility only</div>
      </div>
    </div>`);

  if (ST.fatigue === 'marginal') {
    parts.push(`<div class="alert alert-warn"><div class="alert-icon">⚠️</div><div>Marginal condition: Heavy Takeoff phase is removed. One light En Route exercise only. Focus on quality movement, not load. Your body is telling you something — listen.</div></div>`);
  } else if (ST.fatigue === 'nogo') {
    parts.push(`<div class="alert" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#fca5a5"><div class="alert-icon">🔴</div><div>NO-GO condition: Only Taxi (mobility) and Landing (decompression) phases active. Training under significant fatigue increases injury risk, impairs adaptation, and extends recovery time. A fatigued pilot does not push heavy sets — they recover. This is physiology, not weakness.</div></div>`);
  }
  parts.push(`</div>`); // close card

  // Fitness level
  parts.push(`<div class="section-label">FITNESS LEVEL</div>
  <div class="card mb12">
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Controls exercises per session: Beginner=${LEVEL_EX.beginner.taxi+LEVEL_EX.beginner.takeoff+LEVEL_EX.beginner.enroute+LEVEL_EX.beginner.landing} total, Intermediate=${LEVEL_EX.intermediate.taxi+LEVEL_EX.intermediate.takeoff+LEVEL_EX.intermediate.enroute+LEVEL_EX.intermediate.landing} total, Advanced=${LEVEL_EX.advanced.taxi+LEVEL_EX.advanced.takeoff+LEVEL_EX.advanced.enroute+LEVEL_EX.advanced.landing} total</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
      <div class="env-btn ${ST.level==='beginner'?'sel':''}" onclick="ST.level='beginner';renderPage()">
        <div class="ei">🌱</div><div class="el">BEGINNER</div>
      </div>
      <div class="env-btn ${ST.level==='intermediate'?'sel':''}" onclick="ST.level='intermediate';renderPage()">
        <div class="ei">⚡</div><div class="el">INTERMED.</div>
      </div>
      <div class="env-btn ${ST.level==='advanced'?'sel':''}" onclick="ST.level='advanced';renderPage()">
        <div class="ei">🔥</div><div class="el">ADVANCED</div>
      </div>
    </div>
  </div>`);

  // Environment
  parts.push(`<div class="section-label">MISSION ENVIRONMENT</div>
  <div class="env-toggle" style="margin-bottom:14px">
    <div class="env-btn ${ST.env==='room'?'sel':''}" onclick="ST.env='room';renderPage()">
      <div class="ei">🛏️</div><div class="el">HOTEL ROOM</div>
    </div>
    <div class="env-btn ${ST.env==='hotel'?'sel':''}" onclick="ST.env='hotel';renderPage()">
      <div class="ei">🏨</div><div class="el">HOTEL GYM</div>
    </div>
    <div class="env-btn ${ST.env==='comm'?'sel':''}" onclick="ST.env='comm';renderPage()">
      <div class="ei">🏋️</div><div class="el">COMM GYM</div>
    </div>
  </div>`);

  // Hydration
  parts.push(`<div class="section-label">HYDRATION PAYLOAD</div>
  <div class="card mb12">
    <div class="field-row" style="margin-bottom:10px">
      <div class="field" style="margin-bottom:0">
        <label>Flight Hours Today</label>
        <input type="number" inputmode="decimal" step="0.5" min="0" max="16" value="${ST.flightHrs||''}" placeholder="e.g. 4.5"
          oninput="ST.flightHrs=parseFloat(this.value)||0;renderPage()">
      </div>
      <div class="field" style="margin-bottom:0">
        <label>Water Consumed (L)</label>
        <input type="number" inputmode="decimal" step="0.1" min="0" max="10" value="${ST.waterIn||''}" placeholder="e.g. 1.2"
          oninput="ST.waterIn=parseFloat(this.value)||0;renderPage()">
      </div>
    </div>
    <div class="fb" style="margin-bottom:6px">
      <span style="font-family:var(--mono);font-size:11px;color:var(--muted)">TARGET: <span style="color:var(--text)">${hydroTarget().toFixed(1)}L</span></span>
      <span style="font-family:var(--mono);font-size:11px;color:${hs.color}">${hs.label}</span>
    </div>
    <div class="hydro-bar-wrap">
      <div class="hydro-bar ${pct>=1?'hydro-ok':'hydro-warn'}" style="width:${Math.round(pct*100)}%"></div>
    </div>
    <div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:4px;text-align:right">${Math.round(pct*100)}% of target</div>
    ${adv
      ? `<div class="alert alert-warn mt8"><div class="alert-icon">💧</div><div>${adv}</div></div>`
      : `<div class="alert alert-ok mt8"><div class="alert-icon">✅</div><div>Hydration nominal. Cleared for workout operations.</div></div>`}
  </div>`);

  // Mission profile
  parts.push(`<div class="section-label">MISSION PROFILE</div>
  <div class="mg-wrap">`);
  MUSCLE_GROUPS.forEach(mg => {
    parts.push(`<div class="mg-pill ${ST.muscleGroup===mg?'sel':''}" onclick="ST.muscleGroup='${mg}';renderPage()">${mg}</div>`);
  });
  parts.push(`</div>`);

  // Flight plan preview
  if (wk) {
    parts.push(`<div class="section-label">FLIGHT PLAN PREVIEW — ${totalEx} EXERCISES (${levelLabel}${ST.fatigue!=='go'?' / '+fatigueLabel:''})</div>
    <div class="card card-dark mb12">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">`);

    const phases = [
      ['🚕 TAXI', wk.taxi],
      ['🛫 TAKEOFF', wk.takeoff],
      ['✈️ EN ROUTE', wk.enroute],
      ['🛬 LANDING', wk.landing],
    ];
    phases.forEach(([label, exs]) => {
      parts.push(`<div style="background:var(--bg);border-radius:8px;padding:10px">
        <div style="font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:0.08em;margin-bottom:6px">${label}</div>`);
      if (exs.length === 0) {
        parts.push(`<div style="font-size:11px;color:var(--muted);font-style:italic">— skipped —</div>`);
      } else {
        exs.forEach(e => {
          parts.push(`<div style="font-size:11px;color:var(--text);margin-bottom:3px">· ${e.name}</div>`);
        });
      }
      parts.push(`</div>`);
    });

    parts.push(`</div></div>
    <button class="btn btn-gold" onclick="engageWorkout()">⚡ ENGAGE WORKOUT</button>`);
  } else {
    parts.push(`<div class="alert alert-info"><div class="alert-icon">ℹ️</div><div>Select a mission profile above to generate your flight plan.</div></div>`);
  }

  p.innerHTML = parts.join('');
}

// ─── ENGAGE WORKOUT ───────────────────────────────────────────────────────────
function engageWorkout() {
  const rawWk = WORKOUTS[ST.env]?.[ST.muscleGroup];
  if (!rawWk) {
    showToast('No workout available for this environment + muscle group.');
    return;
  }
  const wk = getFilteredWorkout(rawWk);
  if (!wk) return;

  ST.workout = wk;
  ST.sets = {};
  ST.expanded = {};

  const allEx = [...wk.taxi, ...wk.takeoff, ...wk.enroute, ...wk.landing];
  allEx.forEach(ex => {
    ST.sets[ex.id] = ex.timed
      ? [{ seconds: '' }]
      : Array.from({ length: ex.sets }, () => ({ reps: '', weight: '' }));
  });

  switchTab('flight');
}

// ─── FLIGHT TAB ───────────────────────────────────────────────────────────────
const PHASES_META = [
  { key:'taxi',    label:'TAXI',     sub:'Pilot Protocol — mobilization and activation', icon:'🚕', cls:'phase-taxi'    },
  { key:'takeoff', label:'TAKEOFF',  sub:'Primary compound — the heavy work',             icon:'🛫', cls:'phase-takeoff' },
  { key:'enroute', label:'EN ROUTE', sub:'Secondary movements — volume and accessory',    icon:'✈️', cls:'phase-enroute' },
  { key:'landing', label:'LANDING',  sub:'Descent — decompression and CNS down-reg',     icon:'🛬', cls:'phase-landing' },
];

function renderFlight(p) {
  if (!ST.workout) {
    p.innerHTML = `
      <div style="height:20px"></div>
      <div class="alert alert-info"><div class="alert-icon">ℹ️</div>
      <div>No active flight plan. Configure and engage from Preflight.</div></div>
      <button class="btn btn-outline mt12" onclick="switchTab('preflight')">← Go to Preflight</button>`;
    return;
  }

  const wk = ST.workout;
  const allEx = [...wk.taxi, ...wk.takeoff, ...wk.enroute, ...wk.landing];
  const done  = allEx.filter(ex => {
    const s = ST.sets[ex.id];
    return s && s.some(x => x.reps || x.weight || x.seconds);
  }).length;
  const pct = Math.round(done / Math.max(allEx.length, 1) * 100);

  const parts = [];
  parts.push(`<div class="section-label">ACTIVE FLIGHT — ${ST.muscleGroup.toUpperCase()}</div>`);
  parts.push(`<div class="card card-dark mb12">
    <div class="fb mb8">
      <span style="font-family:var(--mono);font-size:11px;color:var(--muted)">MISSION PROGRESS</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--gold)">${done}/${allEx.length} EXERCISES</span>
    </div>
    <div class="prog-wrap"><div class="prog-fill" style="width:${pct}%"></div></div>
    <div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:4px;text-align:right">${pct}% complete</div>
  </div>`);

  PHASES_META.forEach(phase => {
    const exercises = wk[phase.key];
    if (!exercises || !exercises.length) return;

    parts.push(`<div class="phase-header">
      <div class="phase-badge ${phase.cls}">${phase.icon} ${phase.label}</div>
      <div><div class="phase-title">${phase.sub}</div></div>
    </div>`);

    exercises.forEach(ex => {
      parts.push(buildExCard(ex));
    });
  });

  parts.push(`<div style="height:16px"></div>`);
  parts.push(`<button class="btn btn-green" onclick="secureFlight()">🔒 SECURE FLIGHT</button>`);

  p.innerHTML = parts.join('');
}

function buildExCard(ex) {
  const isOpen = !!ST.expanded[ex.id];
  const sets   = ST.sets[ex.id] || [];
  const hasData = sets.some(s => s.reps || s.weight || s.seconds);
  const parts = [];

  parts.push(`<div class="ex-card">`);
  parts.push(`<div class="ex-hdr" onclick="toggleEx('${ex.id}')">
    <div>
      <div class="ex-name">${ex.name}</div>
      <div class="ex-target">${ex.target}${ex.timed ? ' · ⏱ TIMED' : ''}</div>
    </div>
    <div class="ex-right">
      <div class="ex-done ${hasData?'ok':''}">${hasData?'✓':''}</div>
      <div class="ex-caret ${isOpen?'open':''}">⌄</div>
    </div>
  </div>`);

  if (isOpen) {
    parts.push(`<div class="ex-body">`);
    parts.push(`<p class="ex-note">${ex.note}</p>`);

    if (ex.timed) {
      const val = sets[0]?.seconds || '';
      parts.push(`<div class="timed-box ${val?'ok':''}" id="tb_${ex.id}">
        <div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:0.08em;margin-bottom:8px">TOTAL TIME</div>
        <input class="timed-inp" type="number" inputmode="numeric" placeholder="0" value="${val}"
          oninput="ST.sets['${ex.id}'][0].seconds=this.value;document.getElementById('tb_${ex.id}').className='timed-box'+(this.value?' ok':'')">
        <div style="font-size:11px;color:var(--muted);margin-top:6px">seconds</div>
      </div>`);
    } else {
      parts.push(`<div class="sets-scroll">`);
      sets.forEach((s, i) => {
        parts.push(`<div class="set-tile ${s.reps||s.weight?'ok':''}" id="st_${ex.id}_${i}">
          <div class="set-lbl">SET ${i+1}</div>
          <input class="set-inp" type="number" inputmode="numeric" placeholder="Reps" value="${s.reps||''}"
            oninput="ST.sets['${ex.id}'][${i}].reps=this.value;document.getElementById('st_${ex.id}_${i}').className='set-tile'+(this.value||ST.sets['${ex.id}'][${i}].weight?'ok':'')">
          <input class="set-inp" type="number" inputmode="decimal" placeholder="lb" value="${s.weight||''}"
            oninput="ST.sets['${ex.id}'][${i}].weight=this.value;document.getElementById('st_${ex.id}_${i}').className='set-tile'+(ST.sets['${ex.id}'][${i}].reps||this.value?'ok':'')">
          <div class="set-hint">reps / lb</div>
        </div>`);
      });
      parts.push(`</div>`);
      parts.push(`<div class="swipe-hint">← swipe for all sets</div>`);
    }

    parts.push(`<div style="margin-top:10px">
      <button class="btn-info" onclick="showGuide('${ex.id}')">ℹ Guide</button>
    </div>`);
    parts.push(`</div>`); // ex-body
  }

  parts.push(`</div>`); // ex-card
  return parts.join('');
}

function toggleEx(id) {
  ST.expanded[id] = !ST.expanded[id];
  renderFlight(document.getElementById('mainPage'));
}

const EXRX_MAP = {
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
};

function showGuide(exId) {
  const allEx = ST.workout
    ? [...ST.workout.taxi,...ST.workout.takeoff,...ST.workout.enroute,...ST.workout.landing]
    : [];
  const e = allEx.find(x => x.id === exId);
  if (!e) return;
  const link = EXRX_MAP[exId];
  const root = document.getElementById('modalRoot');
  const linkHTML = link
    ? `<a class="modal-link" href="${link}" target="_blank" rel="noopener">📹 View on ExRx.net →</a>`
    : '';
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
function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }

async function secureFlight() {
  const wk = ST.workout;
  if (!wk) return;
  const allEx = [...wk.taxi,...wk.takeoff,...wk.enroute,...wk.landing];
  const logged = allEx.filter(ex => ST.sets[ex.id]?.some(s => s.reps||s.weight||s.seconds));
  if (logged.length === 0) {
    showToast('Log at least one exercise before securing.');
    return;
  }
  const session = {
    date: new Date().toISOString(),
    env: ST.env,
    muscle_group: ST.muscleGroup,
    fatigue: ST.fatigue,
    level: ST.level,
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
    showToast('✅ Flight secured. Data synced.');
  } catch(e) {
    showToast('⚠️ Saved locally — will sync when online.');
    localStorage.setItem('fcf_session_' + Date.now(), JSON.stringify(session));
  }
  ST.workout = null;
  ST.sets = {};
  switchTab('preflight');
}

// ─── TRENDS TAB ───────────────────────────────────────────────────────────────
function renderTrends(p) {
  const parts = [];
  parts.push(`<div class="section-label">BIOMETRICS LOG & TRENDS</div>`);

  // Protocol card
  parts.push(`<div class="card card-dark mb12">
    <div class="section-label" style="margin-top:0">DATA COLLECTION PROTOCOL</div>
    <div class="check-item">
      <div class="check-icon">⚖️</div>
      <div><div class="check-text" style="font-weight:600">Body Weight</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">Same scale, same time daily. Upon waking, after restroom, before eating or drinking. Use 7-day rolling average — daily fluctuations of 2-4 lbs are normal water weight and glycogen, not fat.</div></div>
    </div>
    <div class="check-item">
      <div class="check-icon">📏</div>
      <div><div class="check-text" style="font-weight:600">Waist Circumference</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">At the navel (umbilicus), at the end of a normal exhale. Do not suck in. Once per week, same time. Under 40 inches (men) is the clinical threshold for metabolic risk.</div></div>
    </div>
    <div class="check-item">
      <div class="check-icon">🩺</div>
      <div><div class="check-text" style="font-weight:600">Blood Pressure</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">5 minutes of complete quiet rest first. Sit with back supported, feet flat, arm at heart level. No talking. Three readings, 1-2 min apart — average the last two. Optimal: under 120/80 mmHg.</div></div>
    </div>
    <div class="check-item" style="border-bottom:none">
      <div class="check-icon">🔬</div>
      <div><div class="check-text" style="font-weight:600">Fasting Glucose</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">Upon waking, before any food or coffee, 8+ hours fasted. Normal: 70-99 mg/dL. Pre-diabetic: 100-125. Diabetic: 126+. Measure weekly for trend. Note: stress and poor sleep elevate glucose independent of diet.</div></div>
    </div>
  </div>`);

  // Log form
  parts.push(`<div class="section-label">LOG TODAY'S DATA</div>
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
  </div>`);

  // Chart containers
  parts.push(`<div class="section-label">TRENDS</div>`);
  ['chartWt','chartWaist','chartBP','chartGluc'].forEach(id => {
    const labels = {chartWt:'BODY WEIGHT (lb)',chartWaist:'WAIST (in)',chartBP:'BLOOD PRESSURE (mmHg)',chartGluc:'FASTING GLUCOSE (mg/dL)'};
    parts.push(`<div class="card mb8"><div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-bottom:6px">${labels[id]}</div><div class="chart-wrap"><canvas id="${id}"></canvas></div></div>`);
  });

  p.innerHTML = parts.join('');

  // Draw charts after DOM is ready
  setTimeout(() => loadAndDrawCharts(), 50);
}

async function saveBio() {
  const wt    = parseFloat(document.getElementById('inp_wt')?.value)||null;
  const waist = parseFloat(document.getElementById('inp_waist')?.value)||null;
  const sys   = parseInt(document.getElementById('inp_sys')?.value)||null;
  const dia   = parseInt(document.getElementById('inp_dia')?.value)||null;
  const gluc  = parseInt(document.getElementById('inp_gluc')?.value)||null;

  if (!wt && !waist && !sys && !dia && !gluc) {
    showToast('Enter at least one value to log.');
    return;
  }

  const row = { weight_lb:wt, waist_in:waist, systolic_bp:sys, diastolic_bp:dia, fasting_glucose:gluc };

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
  setTimeout(() => loadAndDrawCharts(), 100);
}

async function loadAndDrawCharts() {
  let data = [];
  try {
    const { data: d, error } = await SB.from('weight_log').select('*').order('logged_at', { ascending: true });
    if (error) throw error;
    data = d || [];
  } catch(e) {
    // Fallback to localStorage
    data = JSON.parse(localStorage.getItem('fcf_bio')||'[]');
  }
  if (!data.length) return;

  const labels = data.map(d => new Date(d.logged_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}));

  const OPTS = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ display:false } },
    scales:{
      x:{ grid:{color:'#1a2438'}, ticks:{font:{size:9,family:'Share Tech Mono'},color:'#64748b',maxRotation:45} },
      y:{ grid:{color:'#1a2438'}, ticks:{font:{size:9,family:'Share Tech Mono'},color:'#64748b'} },
    }
  };

  function mkChart(id, datasets, legendOn) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const key = 'c_'+id;
    if (ST.chartInst[key]) { try { ST.chartInst[key].destroy(); } catch(e){} }
    ST.chartInst[key] = new Chart(canvas.getContext('2d'), {
      type:'line',
      data:{ labels, datasets },
      options:{ ...OPTS, plugins:{ legend:{ display:!!legendOn, labels:{font:{size:9,family:'Share Tech Mono'},color:'#64748b'} } } }
    });
  }

  const refLine = (val, color) => ({ data:data.map(()=>val), borderColor:color, borderDash:[4,3], pointRadius:0, fill:false });

  mkChart('chartWt', [
    { data:data.map(d=>d.weight_lb), borderColor:'#3b82f6', backgroundColor:'#3b82f622', tension:0.35, fill:true, pointRadius:4, pointBackgroundColor:'#3b82f6', label:'Weight' },
  ]);
  mkChart('chartWaist', [
    { data:data.map(d=>d.waist_in), borderColor:'#c9a84c', backgroundColor:'#c9a84c22', tension:0.35, fill:true, pointRadius:4, pointBackgroundColor:'#c9a84c', label:'Waist' },
    { ...refLine(40,'#ef444488'), label:'Risk (40in)' },
  ], true);
  mkChart('chartGluc', [
    { data:data.map(d=>d.fasting_glucose), borderColor:'#22c55e', backgroundColor:'#22c55e22', tension:0.35, fill:true, pointRadius:4, pointBackgroundColor:'#22c55e', label:'Glucose' },
    { ...refLine(100,'#f59e0b88'), label:'Pre-diabetic (100)' },
  ], true);
  mkChart('chartBP', [
    { data:data.map(d=>d.systolic_bp),  borderColor:'#ef4444', backgroundColor:'#ef444411', tension:0.35, fill:false, pointRadius:4, pointBackgroundColor:'#ef4444', label:'Systolic' },
    { data:data.map(d=>d.diastolic_bp), borderColor:'#f59e0b', backgroundColor:'#f59e0b11', tension:0.35, fill:false, pointRadius:4, pointBackgroundColor:'#f59e0b', label:'Diastolic' },
    { ...refLine(120,'#ef444455'), label:'Sys target (120)' },
    { ...refLine(80,'#f59e0b55'),  label:'Dia target (80)' },
  ], true);
}

// ─── WISDOM TAB ───────────────────────────────────────────────────────────────
function renderWisdom(p) {
  const card = WISDOM[ST.wisdomIdx];
  const num  = String(ST.wisdomIdx + 1).padStart(2, '0');
  const total = String(WISDOM.length);

  const parts = [];
  parts.push('<div class="section-label">FLIGHT DECK WISDOM</div>');
  parts.push('<div class="wisdom-card">');
  parts.push('<div>');
  parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--gold);letter-spacing:0.1em;margin-bottom:12px">BRIEFING ' + num + ' / ' + total + '</div>');
  parts.push('<div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:14px">' + card.title + '</div>');
  parts.push('<div style="font-size:13px;line-height:1.8;color:#94a3b8">' + card.text + '</div>');
  parts.push('</div>');
  parts.push('<div>');
  parts.push('<a class="modal-link" href="' + card.link + '" target="_blank" rel="noopener">📖 Read the research →</a>');
  parts.push('</div>');
  parts.push('</div>');
  parts.push('<div class="wisdom-counter">' + (ST.wisdomIdx+1) + ' of ' + WISDOM.length + '</div>');
  parts.push('<div class="wisdom-nav">');
  parts.push('<button class="btn btn-outline" onclick="prevWisdom()">← PREV</button>');
  parts.push('<button class="btn btn-outline" onclick="nextWisdom()">NEXT →</button>');
  parts.push('</div>');

  // Topic index
  parts.push('<div style="margin-top:16px"><div class="section-label">JUMP TO TOPIC</div><div class="mg-wrap">');
  WISDOM.forEach((w, i) => {
    const cls = i === ST.wisdomIdx ? 'mg-pill sel' : 'mg-pill';
    parts.push('<div class="' + cls + '" onclick="jumpWisdom(' + i + ')" style="font-size:11px">' + w.title + '</div>');
  });
  parts.push('</div></div>');

  p.innerHTML = parts.join('');
}

function prevWisdom()    { ST.wisdomIdx = (ST.wisdomIdx - 1 + WISDOM.length) % WISDOM.length; renderWisdom(document.getElementById('mainPage')); }
function nextWisdom()    { ST.wisdomIdx = (ST.wisdomIdx + 1) % WISDOM.length; renderWisdom(document.getElementById('mainPage')); }
function jumpWisdom(i)   { ST.wisdomIdx = i; renderWisdom(document.getElementById('mainPage')); }

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

// ─── DB STATUS ────────────────────────────────────────────────────────────────
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

// ─── BOOT ─────────────────────────────────────────────────────────────────────
// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/pilot-program/sw.js').catch(() => {});
}

// DOMContentLoaded is more reliable than window.onload for SPAs
document.addEventListener('DOMContentLoaded', function() {
  renderPage();
  checkDB();
});

// Fallback if DOMContentLoaded already fired
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(renderPage, 0);
  setTimeout(checkDB, 100);
}
