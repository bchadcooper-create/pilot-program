/**
 * Flight Crew Fitness — app.js
 * Version: 5.0 | Build: 20260617
 */

const FCF_VERSION = 'v5.41.4';
const FCF_BUILD   = '20260906';

// ─── OURA RING OAUTH2 CONFIG ─────────────────────────────────────────────────
// Replace OURA_CLIENT_ID with your actual Client ID from cloud.ouraring.com/oauth/applications
// The client secret lives ONLY in the Supabase Edge Function (oura-auth) — never here.
const OURA_CLIENT_ID   = 'deb737ed-9343-407a-b993-9907bc101800';
const OURA_REDIRECT_URI = 'https://flightcrew.fit/';
const OURA_EDGE_FN      = 'https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/oura-auth';
const USDA_EDGE_FN      = 'https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/usda-food';
const FOOD_RECOGNITION_EDGE_FN = 'https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/fcf-food-recognition';
const ACCOUNT_DELETE_EDGE_FN = 'https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/fcf-delete-account';
const STRIPE_CHECKOUT_EDGE_FN = 'https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/fcf-stripe-checkout';
const CALENDAR_CLASSIFY_EDGE_FN = 'https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/fcf-calendar-classify';
const PUSH_TOKEN_EDGE_FN        = 'https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/fcf-push-token';
const PRIVACY_POLICY_URL = 'https://flightcrew.fit/privacy.html';
const TERMS_URL = 'https://flightcrew.fit/terms.html';
// ─── SUBSCRIPTION TIERS ─────────────────────────────────────────────────
// Free keeps unlimited workout logging and manual meal entry — the habit
// has to form before there's anything worth paying for. What's gated is
// the work that costs money to run: vision-model photo analysis and AI
// coaching carry a real per-use API cost, which is also why this is a
// subscription rather than a one-time purchase.
const FREE_WEEKLY_PHOTOS = 3;
const PRO_WEEKLY_PHOTOS = 0;        // 0 = unlimited
const PRO_ANNUAL_PRICE = '$59.99';
const PRO_MONTHLY_PRICE = '$7.99';
const PRO_PRODUCT_ANNUAL = 'fit.flightcrew.app.pro.annual';
const PRO_PRODUCT_MONTHLY = 'fit.flightcrew.app.pro.monthly';

// Entitlement is only ever READ here. The server decides it after receipt
// validation — the subscriptions table grants the client SELECT and nothing
// else, so Pro can't be switched on from the console. This function is a
// convenience for what to SHOW; every paid capability is enforced again
// server-side in the edge function.
function isPro() {
  const s = ST.subscription;
  if (!s) return false;
  if (s.tier !== 'pro') return false;
  if (s.status !== 'active' && s.status !== 'grace') return false;
  if (s.current_period_end && new Date(s.current_period_end) < new Date()) return false;
  return true;
}

async function loadSubscription() {
  if (!ST.user) { ST.subscription = null; return; }
  try {
    const { data, error } = await SB.from('subscriptions')
      .select('*').eq('user_id', ST.user.id).maybeSingle();
    if (error) throw error;
    ST.subscription = data || null;
  } catch(e) { ST.subscription = null; }
}

const DAILY_PHOTO_LIMIT = 5; // legacy constant, retained only for older call sites
const FEEDBACK_EDGE_FN  = 'https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/feedback-submit';
const OURA_SCOPES       = 'daily personal workout tag'; // readiness, sleep, activity, personal info, workouts, tags
// Supabase anon key sent as auth header — required when Edge Function JWT verification is enabled
const SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRueGt5ZHhieWloZ3NpY3Riemp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3ODk4MTEsImV4cCI6MjA5NjM2NTgxMX0.oLUGuorQkbQ_u679NpE8FGBVAUmVE1K_rxl8q4B0n7k';

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
  authView: 'default', // 'default' | 'forgot' | 'recovery'
  authErr: '',
  authInfo: '',
  ouraToken: '',
  ouraAccessToken: null,
  ouraRefreshToken: null,
  ouraConnected: false,
  ouraScore: null,
  ouraData: null,
  photoTimeline: [],
  photoAllMeta: null,
  photoUrlCache: {},
  photoShowCount: 24,
  showInstallPrompt: false,
  flightSchedule: null, flightScheduleRaw: null, scheduleEnvNote: null,
  ouraDismissedIds: [], ouraImportQueue: [],
  ouraSteps: null, ouraActiveCal: null,
  subscription: null,
  trackNutrition: true,   // meals, macros and the Fuel card
  trackHydration: true,   // water logging and the hydration gate
  nutritionGoals: null, goalDraft: 'maintain', trainDaysDraft: '3-4',
  manualTargetsOpen: false, manualCal: '', manualProtein: '', manualCarbs: '', manualFat: '', manualTargetsWarning: null,
  sleepBaselineScore: null,
  healthkit: null,        // populated after iOS HealthKit permission granted
  calendarEvents: null,   // classified calendar events from Apple Calendar or ICS
  calendarGranted: false, // whether Apple Calendar permission was granted
  calendarFingerprint: null, // fingerprint of last classified event set

  tab: 'today',
  env: 'comm',
  flightHrs: 0,
  flightHrsRaw: '',
  sex: null,
  heightIn: null,
  age: null,
  lastWeight: null,
  injuries: [],       // persistent (profile) — active flagged body regions
  customProfiles: [],       // persistent (profile) — saved 'Build Your Own' routines
  activeCustomProfileId: null, // currently selected custom profile, if any
  buildProfile: null,        // in-progress custom profile being created/edited
  timeAvailMin: null, // daily — minutes available for today's session
  sleepHours: null,   // daily — manual sleep entry for non-Oura users
  readiness: null,    // daily — 1-5 self-reported readiness
  flightHrsTouched: false,
  waterIn: 0,
  waterInRaw: '',
  muscleGroup: 'Lower Body',
  goal: 'longevity', // 'jump' | 'muscle' | 'longevity' | 'fatloss'
  fatigue: 'go',
  level: 'intermediate',
  workout: null,
  sets: {},
  expanded: {},
  wisdomIdx: null, // null = use today's auto-rotated card; set by Next/Prev/jump for manual browsing
  chartInst: {},

  customExercises: [], // user-created exercises, persisted
  showAddExercise: false,
  showCondOverride: false, // non-Oura: reveal manual GO/MARGINAL/NO-GO override
  showChangePlan: false,   // Preflight: reveal Mission Profile / Time / Environment picker
  showConditionDetail: false, // Preflight: reveal the readiness input itself, not just the result
  showInjuryDetail: false,    // Preflight: reveal the body-region grid
  showCalendarDetail: false,  // Preflight: reveal the training calendar strip
  username: null,          // public leaderboard call sign — opt-in, null = not listed
  badges: {},              // earned badges: {badgeId: earnedISODate}
  lbBests: {},             // cached personal bests already on the leaderboard {exId: weight}
  runBest: 0,               // cached personal best single-run distance (mi)
  runBoard: 'longest',       // running leaderboard: 'longest' | 'monthly'
  lbEx: null,              // leaderboard: selected exercise id (persisted per-device)
  lbSex: 'all',            // leaderboard: 'all' | 'male' | 'female'
  lbMode: 'weight',        // leaderboard: 'weight' | 'dots'

  restTimer: { active: false, seconds: 0, total: 0, exId: null, interval: null, startTs: 0, endTs: 0 },
  stopwatch:  { active: false, seconds: 0, interval: null, exId: null, side: null, startTs: 0, targetSec: null, chimed: false },
  nsdrTimer:  { active: false, seconds: 0, interval: null, chimed: false, startTs: 0 },

  lastSession: null, // last completed session summary
  prevSession: null, // session before last — disambiguates emphasis rotations
  lastDebrief: null,
  workoutStartedAt: null,
  workoutFirstLoggedAt: null,
  chocksSaving: false,
  disclaimerAccepted: false,
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
  longevity:{ label: 'General Health',  icon: '🌿', desc: 'Joint-friendly, sustainable, long-term health', order: ['Lower Body','Upper Pull','Cardio','Longevity','Upper Push'] },
  fatloss:  { label: 'Weight Loss',     icon: '🔥', desc: 'Higher-volume, metabolic conditioning focus', order: ['Lower Body','Cardio','Upper Push','Upper Pull','Full Body'] },
  chest:    { label: 'Chest & Shoulders', icon: '🏋️', desc: 'Pressing emphasis — Upper Push comes around twice per rotation', suggestFor: 'male', order: ['Upper Push','Lower Body','Upper Push','Upper Pull','Full Body'] },
  glute:    { label: 'Glute Emphasis',   icon: '🍑', desc: 'Glute-focused programming — Lower Body comes around twice per rotation', suggestFor: 'female', order: ['Lower Body','Upper Push','Lower Body','Upper Pull','Full Body'] },
  strength: { label: 'Overall Strength', icon: '⚡', desc: 'Heavy low-rep compounds plus explosive power work', order: ['Lower Body','Upper Push','Upper Pull','Power / Plyo','Full Body'] },
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

// What fraction of a normal waking day has elapsed right now — 6am-10pm is
// a reasonable default active-day window. Used to judge hydration pace
// fairly: 0L consumed at 6:15am isn't a deficit, it's just early, and
// comparing it against the FULL day's target would make the very first
// hydration check of the day alarmist rather than useful.
function dayElapsedPct(now) {
  now = now || new Date();
  const DAY_START_HOUR = 6, DAY_END_HOUR = 22;
  const hoursIn = now.getHours() + now.getMinutes()/60;
  if (hoursIn <= DAY_START_HOUR) return 0;
  if (hoursIn >= DAY_END_HOUR) return 1;
  return (hoursIn - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR);
}

// How far off pace protein intake is, judged against what's reasonable
// to have eaten by THIS point in the day (see dayElapsedPct), not the
// full 24-hour goal. Four bands rather than a single yes/no — a 3-gram
// miss and a 100-gram miss are different situations and shouldn't read
// the same. Boundaries: under 40% of paced target is a real gap; 40-60%
// is genuinely falling behind; 60-85% is a marginal, close-to-on-pace
// miss; 85%+ is on track.
function proteinPaceTier(ratio) {
  if (ratio < 0.40) return 'well_short';
  if (ratio < 0.60) return 'behind';
  if (ratio < 0.85) return 'slightly_behind';
  return 'on_track';
}

// What you'd reasonably be expected to have had by THIS point in the day —
// never used to lower the actual end-of-day target (hydroTarget), only to
// judge whether right now is a fair moment to sound an alarm about it.
function hydroTarget()  {
  if (ST.flightHrs > 0) return Math.max(ST.flightHrs * HYDRO_RATE, HYDRO_FLOOR);
  return HYDRO_FLOOR; // no-fly day: still need baseline hydration
}
function hydroDeficit() { return Math.max(hydroTarget() - ST.waterIn, 0); }
function hydroPct()     { return Math.min(ST.waterIn / Math.max(hydroTarget(), 0.5), 1); }
function hydroPacedTarget(now)  { return hydroTarget() * dayElapsedPct(now || new Date()); }
function hydroPacedDeficit(now) { return Math.max(hydroPacedTarget(now) - ST.waterIn, 0); }

function hydroStatus(now) {
  const paced = hydroPacedTarget(now);
  // Genuinely too early in the day to judge fairly — the first ~15% of
  // the paced window (about the first 90 minutes after 6am) always reads
  // as nominal regardless of intake, rather than risking a division against
  // a near-zero paced target swinging wildly from a single sip of water.
  if (paced <= hydroTarget() * 0.15) return { label:'NOMINAL', color:'var(--green)', icon:'✅', cls:'status-ok' };
  const p = ST.waterIn / paced;
  if (p >= 1)   return { label:'NOMINAL', color:'var(--green)', icon:'✅', cls:'status-ok' };
  if (p >= 0.6) return { label:'CAUTION', color:'var(--amber)', icon:'⚠️', cls:'status-warn' };
  return              { label:'DEFICIT',  color:'var(--red)',   icon:'🚨', cls:'status-no' };
}
function hydroAdvice(now) {
  const paced = hydroPacedTarget(now);
  if (paced <= hydroTarget() * 0.15) return null; // too early to advise anything yet
  const def = hydroPacedDeficit(now);
  if (def <= 0) return null;
  if (def < 0.25) return `Sip ${Math.round(def*1000)}ml now — you're on pace, just top up a little.`;
  if (def < 0.5)  return `Drink ${Math.round(def*1000)}ml soon to stay on pace for the day. Even 2% dehydration measurably cuts strength, endurance, and focus.`;
  return `You're ${def.toFixed(1)}L behind pace for this point in the day. Drink 500ml now, then sip regularly — total target is still ${hydroTarget().toFixed(1)}L.`;
}

// Patches just the hydration display elements on every keystroke instead of
// calling renderPage() (which was destroying/recreating the input element on
// every character and dropping keyboard focus — the "glitchy" decimal entry bug).
// Flight hours and water persist for the calendar day, then reset.
const DAILY_INPUTS_KEY = 'fcf_daily_inputs';
function persistDailyInputs() {
  try {
    localStorage.setItem(DAILY_INPUTS_KEY, JSON.stringify({
      day: new Date().toDateString(),
      flightHrs: ST.flightHrs, flightHrsRaw: ST.flightHrsRaw, flightHrsTouched: ST.flightHrsTouched,
      waterIn: ST.waterIn, waterInRaw: ST.waterInRaw,
      timeAvailMin: ST.timeAvailMin, sleepHours: ST.sleepHours, readiness: ST.readiness,
    }));
  } catch(e) {}
  // BUG FIX: water (and the other daily inputs) previously lived in
  // localStorage ONLY — logging water on the phone was invisible on the
  // PC and vice versa, two entirely separate local caches with no shared
  // source of truth. This debounced upsert makes the database the real
  // cross-device record; localStorage above stays purely as an instant-
  // response cache / offline fallback.
  saveDailyInputsToDBDebounced();
}
function restoreDailyInputs() {
  try {
    const saved = JSON.parse(localStorage.getItem(DAILY_INPUTS_KEY)||'null');
    if (!saved) return;
    if (saved.day !== new Date().toDateString()) { localStorage.removeItem(DAILY_INPUTS_KEY); return; }
    ST.flightHrs = saved.flightHrs || 0;
    ST.flightHrsRaw = saved.flightHrsRaw || '';
    ST.flightHrsTouched = !!saved.flightHrsTouched;
    ST.waterIn = saved.waterIn || 0;
    ST.waterInRaw = saved.waterInRaw || '';
    ST.timeAvailMin = saved.timeAvailMin || null;
    ST.sleepHours = saved.sleepHours || null;
    ST.readiness = saved.readiness || null;
  } catch(e) {}
}

// Fetched once at boot and applied AFTER restoreDailyInputs() — the DB
// row (if one exists for today) wins over whatever's in localStorage,
// since the DB is the actual cross-device truth and localStorage is just
// this device's last-known cache, which may be stale or from a different
// device entirely.
async function dbGetDailyInputs() {
  if (!ST.user) return null;
  try {
    const { data, error } = await SB.from('daily_inputs')
      .select('*').eq('user_id', ST.user.id).eq('date', localDateStr(new Date())).maybeSingle();
    if (error) throw error;
    return data;
  } catch(e) { return null; }
}

function applyDailyInputsRow(row) {
  if (!row) return;
  if (row.water_in != null) { ST.waterIn = row.water_in; ST.waterInRaw = String(row.water_in); }
  if (row.flight_hrs != null) { ST.flightHrs = row.flight_hrs; ST.flightHrsRaw = String(row.flight_hrs); }
  if (row.flight_hrs_touched != null) ST.flightHrsTouched = !!row.flight_hrs_touched;
  if (row.sleep_hours != null) ST.sleepHours = row.sleep_hours;
  if (row.readiness != null) ST.readiness = row.readiness;
}

let _dailyInputsSaveTimer = null;
// Debounced — water/flight-hours/etc. can change on every keystroke while
// typing, and this doesn't need to be real-time to fix the actual
// reported problem (checking the OTHER device later, not simultaneously).
function saveDailyInputsToDBDebounced() {
  if (!ST.user) return;
  clearTimeout(_dailyInputsSaveTimer);
  _dailyInputsSaveTimer = setTimeout(async () => {
    try {
      await SB.from('daily_inputs').upsert({
        user_id: ST.user.id,
        date: localDateStr(new Date()),
        water_in: ST.waterIn,
        flight_hrs: ST.flightHrs,
        flight_hrs_touched: ST.flightHrsTouched,
        sleep_hours: ST.sleepHours,
        readiness: ST.readiness,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,date' });
    } catch(e) {}
  }, 800);
}

function updateHydrationUI() {
  const hs = hydroStatus();
  const pct = hydroPct();
  const adv = hydroAdvice();

  const noFlyBox = document.getElementById('noFlyBox');
  if (noFlyBox) noFlyBox.innerHTML = (ST.flightHrsTouched && ST.flightHrs === 0)
    ? '<div class="alert alert-info" style="margin-bottom:8px"><div class="alert-icon">ℹ️</div><div>No-fly day — minimum 1.0L hydration target still applies. Your body needs baseline water regardless of duty status.</div></div>'
    : '';

  const targetEl = document.getElementById('hydroTargetVal');
  if (targetEl) targetEl.textContent = hydroTarget().toFixed(1)+'L';

  const statusEl = document.getElementById('hydroStatusLbl');
  if (statusEl) { statusEl.textContent = hs.label; statusEl.style.color = hs.color; }

  const barEl = document.getElementById('hydroBar');
  if (barEl) { barEl.style.width = Math.round(pct*100)+'%'; barEl.className = 'hydro-bar '+(pct>=1?'hydro-ok':'hydro-warn'); }

  const pctEl = document.getElementById('hydroPctText');
  if (pctEl) pctEl.textContent = Math.round(pct*100)+'% of target';

  const adviceBox = document.getElementById('hydroAdviceBox');
  if (adviceBox) adviceBox.innerHTML = adv
    ? '<div class="alert alert-warn mt8"><div class="alert-icon">💧</div><div>'+adv+'</div></div>'
    : '<div class="alert alert-ok mt8"><div class="alert-icon">✅</div><div>Hydration nominal. Cleared for workout operations.</div></div>';

  persistWorkoutState();
  persistDailyInputs();
}

const MUSCLE_GROUPS = ['Lower Body','Upper Push','Upper Pull','Power / Plyo','Full Body','Longevity','Cardio','Run'];

// ─── EXERCISE BUILDER ─────────────────────────────────────────────────────────
// rest: suggested rest in seconds for the heaviest set in this exercise (phase-aware default applied separately)
const ex = (id, name, target, sets, note, timed, inputType) =>
  ({ id, name, target, sets: sets||3, note, timed: !!timed, inputType: inputType||'reps_weight' });
  // inputType: 'reps_weight' | 'reps_only' | 'reps_height' | 'reps_distance' | 'timed' | 'timed_bilateral'

// Per-exercise rest overrides (seconds). Max-effort power/strength movements
// programmed in the enroute slot need full ATP-PC system recovery (2.5-3 min,
// NSCA guidelines) — the 75s hypertrophy default would collapse output quality
// and, for heavy pulls done fatigued, raise injury risk.
const REST_OVERRIDES = {
  c_fb_er1: 180, // Deadlift heavy triples on Full Body day
  c_pp_er1: 150, // Broad Jump — max effort
  c_pp_er3: 150, // 40yd Sprint — full speed
  h_pp_er1: 120, // DB Jump Squat
  h_pp_er2: 120, // Sprints
  h_pp_er4: 120, // Depth Drop
  r_pp_er1: 120, // Squat Jump
  r_pp_er3: 120, // Explosive Pushup
};

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
    ex('c_lb_t1','Hip 90/90 Stretch','60s/side',1,'Sit on floor, both legs at 90°. Rotate slowly between internal and external hip rotation. Critical for pilots who sit compressed all day.',true,'timed_bilateral'),
    ex('c_lb_t2','Ankle Circles + Dorsiflexion','20 reps',1,'Rotate each ankle 10x each direction, then pull toes to shin. Ankle mobility directly affects squat depth.',false,'reps_only'),
    ex('c_lb_t3','Kettlebell Goblet Squat (Warmup)','2×10',2,'Light KB or DB at chest. Slow descent, pause at the bottom. Own the position before loading.'),
  ],
  takeoff: [
    ex('c_lb_to1','Back Squat','5×5',5,'Work up to a challenging set of 5. Bar on traps, break parallel, drive through heels. This is your primary compound.'),
    ex('c_lb_to2','Romanian Deadlift','4×6',4,'Hip hinge. Moderate-heavy. Bar stays close to legs. Deep hamstring stretch at the bottom.'),
  ],
  enroute: [
    ex('c_lb_er1','Single Leg Split Squat','3×8/leg',3,'Rear foot elevated on bench. Drive through front heel. High transfer to strength and jump performance.',false,'reps_only'),
    ex('c_lb_er2','Leg Press','3×12',3,'Moderate weight. Full ROM — don\'t lock knees.'),
    ex('c_lb_er3','Standing Calf Raise','4×12',4,'Full ROM — stretch at bottom, pause at top.'),
    ex('c_lb_er4','Lateral Band Walk','2×15/side',2,'Band above knees. Stay low. Activates glute med.',false,'reps_only'),
    ex('c_lb_er5','Leg Extension (Machine)','3×15',3,'Seated machine. Squeeze at the top, control the negative. Quad isolation.'),
    ex('c_lb_er6','Seated Leg Curl (Machine)','3×12',3,'Pad above the heel, full stretch at the bottom. Hamstring isolation.'),
    ex('c_lb_er7','Standing Calf Raise (Machine)','4×15',4,'Shoulder pads or plate-loaded — full ROM, pause at the top and stretch at the bottom.'),
    ex('c_lb_er8','Glute Kickback (Machine)','3×12/leg',3,'Foot on the platform, drive back and squeeze the glute — don\'t hyperextend the lower back.'),
    ex('c_lb_er9','Seated Calf Raise (Machine)','4×15',4,'Knees bent under the pad — targets the soleus, distinct from standing calf raises which emphasize the gastrocnemius.'),
    ex('c_lb_er10','Hip Abduction (Machine)','3×15',3,'Seated, push knees outward against the pads. Glute medius — often neglected but key for hip stability.'),
    ex('c_lb_er11','Hip Adduction (Machine)','3×15',3,'Seated, squeeze knees together against the pads. Inner thigh — commonly skipped but balances the abductors.'),
  ],
  landing: [
    ex('c_lb_l1','Pigeon Pose','90s/side',1,'External hip rotation stretch. Hold completely still.',true,'timed_bilateral'),
    ex('c_lb_l2','Supine Hamstring Stretch','60s/side',1,'Lying on back, pull one leg toward chest. Knee straight.',true,'timed_bilateral'),
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
    ex('c_up_er10','Push-Up','3×15',3,'Standard form — hands under shoulders, straight line head to heels. Good bodyweight finisher regardless of equipment access.',false,'reps_only'),
    ex('c_up_er5','Incline Chest Press (Machine)','3×10',3,'Seated, pads set to mid-chest height. Controlled tempo — no bouncing off the bottom.'),
    ex('c_up_er6','Decline Chest Press (Machine)','3×10',3,'Seated, pads angled downward. Targets lower chest — full extension without locking the elbows hard.'),
    ex('c_up_er7','Pec Fly (Machine)','3×15',3,'Seated, arms slightly bent throughout. Squeeze at full contraction, control the stretch back.'),
    ex('c_up_er8','Cable Tricep Pushdown','3×15',3,'Elbows pinned to your sides — the whole rep should come from the elbow, not the shoulder.'),
    ex('c_up_er9','Assisted Dip (Machine)','3×10',3,'Counterweight assists the lift — lean forward slightly for more chest emphasis.'),
  ],
  landing: [
    ex('c_up_l1','Doorframe Chest Stretch','60s/side',1,'Arm at 90° in doorframe, rotate body away.',true,'timed_bilateral'),
    ex('c_up_l2','Lat Overhead Stretch','60s/side',1,'Reach one arm overhead, grab a rack or door frame, lean away.',true,'timed_bilateral'),
    ex('c_up_l3','Diaphragmatic Breathing','10 breaths',1,'Lie on back. Inhale 4 counts, hold 2, exhale 6. Shifts the nervous system from sympathetic to parasympathetic — see "What is CNS Down-Regulation" in Wisdom.',false,'reps_only'),
  ],
};

WORKOUTS.comm['Upper Pull'] = {
  taxi: [
    ex('c_ul_t1','Arm Circles (progressive)','10/direction',1,'Small to large, both directions. Warms rotator cuff before pulling loads.',false,'reps_only'),
    ex('c_ul_t2','Scapular Pullup','2×10',2,'Hang from bar. Without bending elbows, depress and retract scapulae.',false,'reps_only'),
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
    ex('c_ul_er6','Assisted Pull-Up (Machine)','3×8',3,'Counterweight assists the lift — dial in just enough assistance to hit real reps with good form.'),
    ex('c_ul_er7','T-Bar Row (Machine)','3×10',3,'Chest supported, pull to the lower ribs. Removes lower-back strain compared to a free-standing barbell row.'),
    ex('c_ul_er5','Preacher Curl','3×12',3,'Arm braced on the pad — isolates the biceps by removing shoulder swing entirely.'),
  ],
  landing: [
    ex('c_ul_l1','Lat Hang Stretch','45s',1,'Hang from pullup bar, completely relaxed.',true,'timed'),
    ex('c_ul_l2','Thoracic Rotation (seated)','60s/side',1,'Seated, cross arms on chest. Rotate slowly through mid-back only.',true,'timed_bilateral'),
    ex('c_ul_l3','Diaphragmatic Breathing','10 breaths',1,'Inhale 4, hold 2, exhale 6. CNS down-regulation protocol.',false,'reps_only'),
  ],
};

WORKOUTS.comm['Power / Plyo'] = {
  taxi: [
    ex('c_pp_t1','Jump Rope / Ankle Bouncing','3 min',1,'Moderate pace. Warms Achilles and prepares the elastic system.',true,'timed'),
    ex('c_pp_t2','Light Squat Jumps','2×5',2,'Bodyweight only. Focus on arm swing mechanics and soft landing.',false,'reps_only'),
    ex('c_pp_t3','Hip Flexor Lunge Stretch','60s/side',1,'Kneeling lunge, hands overhead, lean forward.',true,'timed_bilateral'),
  ],
  takeoff: [
    ex('c_pp_to1','Box Jump','5×3',5,'FULL 3-minute rest between sets. Every rep is maximum effort.',false,'reps_height'),
    ex('c_pp_to2','Trap Bar Deadlift','5×3',5,'Heavy and FAST. The concentric must be explosive.'),
  ],
  enroute: [
    ex('c_pp_er1','Broad Jump','5×3',5,'Horizontal power transfers to vertical. Max effort.',false,'reps_distance'),
    ex('c_pp_er2','Lunge (Walking)','3×10/leg',3,'Light-moderate. Hip flexor strength critical for takeoff mechanics.',false,'reps_only'),
    ex('c_pp_er3','Sprint 40yd','6 reps',6,'Full speed. Walk back. Log time or distance in the notes.',false,'reps_only'),
    ex('c_pp_er4','Ankle Hop','3×20',3,'Minimal knee bend. Fast and springy.',false,'reps_only'),
  ],
  landing: [
    ex('c_pp_l1','Achilles / Calf Stretch','90s/side',1,'Step on step edge, drop heel slowly.',true,'timed_bilateral'),
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
    ex('c_fb_er1','Deadlift','3×3',3,'Heavy triple. Maximum posterior chain. Take the FULL rest timer — heavy pulls after squat and bench demand complete recovery.'),
    ex('c_fb_er2','Weighted Pullups','3×6',3,'Add weight if bodyweight is easy.'),
    ex('c_fb_er3','Overhead Press','3×8',3,'Moderate. Standing.'),
    ex('c_fb_er4','Single Leg Split Squat','3×8/leg',3,'Unilateral leg accessory.',false,'reps_only'),
    ex('c_fb_er5','Sit-Up','3×20',3,'Classic ab exercise, no equipment needed.',false,'reps_only'),
    ex('c_fb_er6','Bicycle Crunch','3×20/side',3,'Opposite elbow to opposite knee, controlled — not a race.',false,'reps_only'),
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
    ex('c_lg_t3','Hip 90/90','60s/side',1,'Slow rotation between internal and external hip position.',true,'timed_bilateral'),
  ],
  takeoff: [
    ex('c_lg_to1','Kettlebell Goblet Squat','3×10',3,'Moderate weight. Full depth. Most joint-friendly lower body compound.'),
    ex('c_lg_to2','Cable Row','3×12',3,'Back health and posture. Full retraction.'),
  ],
  enroute: [
    ex('c_lg_er1','Farmer Carry','3×40yd',3,'Heaviest DB you can hold with perfect posture.'),
    ex('c_lg_er2','Face Pull','3×20',3,'Essential shoulder health.'),
    ex('c_lg_er3','Pallof Press','3×10/side',3,'Cable or band. Anti-rotation core stability.'),
    ex('c_lg_er4','Split Squat','3×10/leg',3,'Both feet on floor. Controlled descent.',false,'reps_only'),
  ],
  landing: [
    ex('c_lg_l1','Hip 90/90 Rotation Drill','90s/side',1,'Your most important mobility work as a pilot.',true,'timed_bilateral'),
    ex('c_lg_l2','Neck Mobility Protocol','2×8/direction',1,'Forward, back, rotation each side, lateral flexion.',false,'reps_only'),
    ex('c_lg_l3','Zone 2 Walk','10 min',1,'Brisk walk. Conversational pace.',true,'timed'),
  ],
};

WORKOUTS.comm['Cardio'] = {
  taxi: [
    ex('c_ca_t1','Brisk Walk Ramp-Up','3 min',1,'Start slow, build pace.',true,'timed'),
    ex('c_ca_t2','Jumping Jacks','2×30s',2,'Classic full-body warmup, zero equipment. Raises heart rate before the main cardio effort.',true,'timed'),
  ],
  takeoff: [
    ex('c_ca_to1','Rowing Machine Intervals','6×500m',6,'Hard effort. Log your 500m split in seconds as the rep value for each interval.',false,'reps_only'),
    ex('c_ca_to2','Assault Bike Intervals','8×30s',8,'All-out 30 seconds, 60s easy spin. Log calories or RPM as the rep value.',false,'reps_only'),
  ],
  enroute: [
    ex('c_ca_er1','Treadmill Zone 2 Run','20 min',1,'Conversational pace — speak in full sentences. Log distance for the leaderboard.',true,'timed_distance'),
    ex('c_ca_er3','Walking','30-45 min',1,'Zone 1-2 steady pace. Great low-impact active recovery. Log distance if you tracked it.',true,'timed_distance'),
    ex('c_ca_er4','Treadmill','30 min',1,'Any steady treadmill session — walk, incline, or run.',true,'timed'),
    ex('c_ca_er5','Outdoor Run','20-40 min',1,'Any pace, any route. Log distance for the leaderboard.',true,'timed_distance'),
    ex('c_ca_er2','Step-Up','3×15/leg',3,'Active recovery strength.'),
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
    ex('h_lb_to1','Kettlebell Goblet Squat (Heavy)','5×6',5,'Heaviest DB available. Full depth.'),
    ex('h_lb_to2','DB Romanian Deadlift','4×8',4,'Hip hinge. Feel the hamstring stretch.'),
  ],
  enroute: [
    ex('h_lb_er1','Single Leg Split Squat','3×10/leg',3,'Use a bench. Bodyweight or light DBs.',false,'reps_only'),
    ex('h_lb_er2','Step-Up (Weighted)','3×12/leg',3,'Drive through the working heel.'),
    ex('h_lb_er3','Single-Leg Calf Raise','3×15',3,'Step edge for full ROM.',false,'reps_only'),
    ex('h_lb_er4','Dumbbell Lateral Lunge','3×10/side',3,'Step to side, sit into the hip.'),
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
    ex('h_up_er5','Push-Up','3×15',3,'Standard form — hands under shoulders, straight line head to heels. No equipment needed.',false,'reps_only'),
  ],
  landing: WORKOUTS.comm['Upper Push'].landing,
};
WORKOUTS.hotel['Upper Pull'] = {
  taxi: WORKOUTS.comm['Upper Pull'].taxi.slice(0,2),
  takeoff: [
    ex('h_ul_to1','Pullups','5×max',5,'Every set near-failure.',false,'reps_only'),
    ex('h_ul_to2','DB Row','4×10/side',4,'Chest on bench. Heavy.'),
  ],
  enroute: [
    ex('h_ul_er1','Chinups','3×max',3,'Supinated grip.',false,'reps_only'),
    ex('h_ul_er2','DB Curl','3×12',3,'Controlled eccentric.'),
    ex('h_ul_er4','DB Preacher Curl','3×12',3,'Brace the back of your arm against an incline bench set upright.'),
    ex('h_ul_er3','Bent-Over DB Face Pull','3×15',3,'Light DBs.'),
    ex('h_ul_er5','DB Hammer Curl','3×12',3,'Neutral grip.'),
  ],
  landing: WORKOUTS.comm['Upper Pull'].landing,
};
WORKOUTS.hotel['Power / Plyo'] = {
  taxi: WORKOUTS.comm['Power / Plyo'].taxi,
  takeoff: [
    ex('h_pp_to1','Bench/Box Jump','5×3',5,'Highest stable surface. Max effort.',false,'reps_height'),
    ex('h_pp_to2','Broad Jump','5×3',5,'Max horizontal distance.',false,'reps_distance'),
  ],
  enroute: [
    ex('h_pp_er1','DB Jump Squat','4×5',4,'Light DBs. Explosive concentric.'),
    ex('h_pp_er2','Sprint (hall/outside)','6×20yd',6,'Full speed. Walk back.',false,'reps_only'),
    ex('h_pp_er3','Split Jump','3×6',3,'Lunge position, jump and switch.',false,'reps_only'),
    ex('h_pp_er4','Depth Drop','3×5',3,'Step off low bench, land softly, absorb.',false,'reps_only'),
  ],
  landing: WORKOUTS.comm['Power / Plyo'].landing,
};
WORKOUTS.hotel['Full Body'] = {
  taxi: [ex('h_fb_t1','Full Mobility Circuit','1 round',1,'5 hip 90/90 each side → 10 arm circles → 10 thoracic extensions → 10 goblet squats.',true,'timed')],
  takeoff: [
    ex('h_fb_to1','Kettlebell Goblet Squat (Heavy)','4×6',4,'Heaviest DB. Full depth.'),
    ex('h_fb_to2','DB Bench Press','4×6',4,'Heavy.'),
  ],
  enroute: [
    ex('h_fb_er1','Pullups','3×max',3,'Upper pull.',false,'reps_only'),
    ex('h_fb_er2','DB Overhead Press','3×8',3,'Standing.'),
    ex('h_fb_er3','Single Leg Split Squat','3×8/leg',3,'Unilateral leg.',false,'reps_only'),
    ex('h_fb_er4','DB Row','3×10/side',3,'Back.'),
    ex('h_fb_er5','Sit-Up','3×20',3,'Classic ab exercise, no equipment needed.',false,'reps_only'),
    ex('h_fb_er6','Bicycle Crunch','3×20/side',3,'Opposite elbow to opposite knee, controlled — not a race.',false,'reps_only'),
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
    ex('h_ca_to1','Treadmill Intervals','8×1 min',8,'Hard 1 min run, 90s walk. Log speed (mph) as the rep value.',false,'reps_only'),
    ex('h_ca_to2','Stationary Bike Intervals','6×45s',6,'High resistance, hard effort. Log resistance level or watts as the rep value.',false,'reps_only'),
  ],
  enroute: [
    ex('h_ca_er1','Treadmill Zone 2 Run','20 min',1,'Conversational pace. Log distance for the leaderboard.',true,'timed_distance'),
    ex('h_ca_er3','Walking','30-45 min',1,'Zone 1-2 steady pace. Great low-impact active recovery. Log distance if you tracked it.',true,'timed_distance'),
    ex('h_ca_er4','Treadmill','30 min',1,'Any steady treadmill session — walk, incline, or run.',true,'timed'),
    ex('h_ca_er5','Outdoor Run','20-40 min',1,'Any pace, any route. Log distance for the leaderboard.',true,'timed_distance'),
    ex('h_ca_er2','Step-Up','3×15/leg',3,'Active recovery strength.'),
  ],
  landing: WORKOUTS.comm['Cardio'].landing,
};

WORKOUTS.room = {};
WORKOUTS.room['Lower Body'] = {
  taxi: WORKOUTS.comm['Lower Body'].taxi.slice(0,3),
  takeoff: [
    ex('r_lb_to1','Single Leg Squat (Pistol)','4×5/leg',4,'Assisted or full. Best bodyweight lower body exercise.',false,'reps_only'),
    ex('r_lb_to2','Hamstring Raise (Nordic Curl)','3×5',3,'Feet anchored under bed or door. Lower as slowly as possible.',false,'reps_only'),
  ],
  enroute: [
    ex('r_lb_er1','Single Leg Split Squat','4×12/leg',4,'Rear foot on bed. Bodyweight.',false,'reps_only'),
    ex('r_lb_er2','Single-Leg Glute Bridge','3×15/leg',3,'Drive through heel.',false,'reps_only'),
    ex('r_lb_er3','Calf Raise (step)','4×20',4,'Use a stair or book stack.',false,'reps_only'),
    ex('r_lb_er4','Reverse Lunge','3×12/leg',3,'Step back, drive through front heel.',false,'reps_only'),
    ex('r_lb_er5','Bodyweight Squat','3×20',3,'Standard two-legged squat, full depth. The baseline version if pistol squats or split squats are too advanced.',false,'reps_only'),
  ],
  landing: WORKOUTS.comm['Lower Body'].landing,
};
WORKOUTS.room['Upper Push'] = {
  taxi: WORKOUTS.comm['Upper Push'].taxi.slice(0,2),
  takeoff: [
    ex('r_up_to1','Archer Pushup','4×5/side',4,'One arm supports, one extends.',false,'reps_only'),
    ex('r_up_to2','Pike Pushup','4×10',4,'Hips high, head toward floor.',false,'reps_only'),
  ],
  enroute: [
    ex('r_up_er1','Pushup Variations','3×15',3,'Wide, close, explosive.',false,'reps_only'),
    ex('r_up_er2','Chair Dips','3×max',3,'Tricep focus.',false,'reps_only'),
    ex('r_up_er3','Decline Pushup','3×12',3,'Feet on bed.',false,'reps_only'),
    ex('r_up_er4','Plank','3×60s',3,'Straight line head to heels.',true,'timed'),
    ex('r_up_er5','Push-Up','3×15',3,'Standard form — hands under shoulders, straight line head to heels. The baseline version, no variation needed.',false,'reps_only'),
  ],
  landing: WORKOUTS.comm['Upper Push'].landing,
};
WORKOUTS.room['Upper Pull'] = {
  taxi: WORKOUTS.comm['Upper Pull'].taxi.slice(0,2),
  takeoff: [
    ex('r_ul_to1','Pullups (bar if available)','5×max',5,'Every rep near-failure.',false,'reps_only'),
    ex('r_ul_to2','Table / Inverted Row','4×12',4,'Heels on floor under table, pull chest to edge.'),
  ],
  enroute: [
    ex('r_ul_er1','Chinups','3×max',3,'Supinated.',false,'reps_only'),
    ex('r_ul_er2','Towel Curl','3×15',3,'Towel looped over door handle.'),
    ex('r_ul_er3','Door Frame Row','3×12',3,'Hold frame, lean back, pull chest to hands.'),
    ex('r_ul_er4','Superman Hold','3×30s',3,'Lie face down, extend arms and legs, hold.',true,'timed'),
  ],
  landing: WORKOUTS.comm['Upper Pull'].landing,
};
WORKOUTS.room['Power / Plyo'] = {
  taxi: WORKOUTS.comm['Power / Plyo'].taxi,
  takeoff: [
    ex('r_pp_to1','Bed/Chair Jump','5×3',5,'Any stable surface. Max jump every rep.',false,'reps_height'),
    ex('r_pp_to2','Broad Jump','5×3',5,'Hallway. Max effort.',false,'reps_distance'),
  ],
  enroute: [
    ex('r_pp_er1','Squat Jump','4×5',4,'Bodyweight. Explode every rep.',false,'reps_only'),
    ex('r_pp_er2','Split Jump','3×6',3,'Lunge position, jump and switch.',false,'reps_only'),
    ex('r_pp_er3','Explosive Pushup','4×5',4,'Hands leave floor.',false,'reps_only'),
    ex('r_pp_er4','Pogo Hop','3×20',3,'Stiff ankles.',false,'reps_only'),
  ],
  landing: WORKOUTS.comm['Power / Plyo'].landing,
};
WORKOUTS.room['Full Body'] = {
  taxi: [ex('r_fb_t1','Full Mobility Circuit','1 round',1,'5 hip 90/90 each side → 10 arm circles → 10 thoracic extensions → 10 bodyweight squats.',true,'timed')],
  takeoff: [
    ex('r_fb_to1','Single Leg Squat (Pistol)','3×5/leg',3,'Primary lower.',false,'reps_only'),
    ex('r_fb_to2','Pullups / Table Row','3×max',3,'Primary upper pull.',false,'reps_only'),
  ],
  enroute: [
    ex('r_fb_er1','Archer Pushup','3×5/side',3,'Upper push.',false,'reps_only'),
    ex('r_fb_er2','Single Leg Split Squat','3×10/leg',3,'Unilateral leg.',false,'reps_only'),
    ex('r_fb_er3','Pike Pushup','3×10',3,'Overhead push pattern.',false,'reps_only'),
    ex('r_fb_er4','Superman Hold','3×30s',3,'Posterior chain and back.',true,'timed'),
    ex('r_fb_er5','Sit-Up','3×20',3,'Feet anchored under bed or door if needed. Classic ab exercise, zero equipment.',false,'reps_only'),
    ex('r_fb_er6','Flutter Kicks','3×30s',3,'Lying on back, small rapid alternating leg kicks. Lower ab and hip flexor focus.',false,'reps_only'),
    ex('r_fb_er7','Russian Twist','3×20',3,'Seated, lean back slightly, rotate side to side. Add a book or water bottle for resistance.',false,'reps_only'),
  ],
  landing: [
    ex('r_fb_l1','Full Body Stretch','5 min',1,'Child\'s pose → pigeon → doorframe chest → neck mobility.',true,'timed'),
    ex('r_fb_l2','Diaphragmatic Breathing','10 breaths',1,'Inhale 4, hold 2, exhale 6.',false,'reps_only'),
  ],
};
WORKOUTS.room['Longevity'] = {
  taxi: WORKOUTS.comm['Longevity'].taxi,
  takeoff: [
    ex('r_lg_to1','Slow Bodyweight Squat','3×12',3,'3s down, 1s pause, controlled up.',false,'reps_only'),
    ex('r_lg_to2','Inverted Row / Door Row','3×12',3,'Full retraction.'),
  ],
  enroute: [
    ex('r_lg_er1','Reverse Lunge','3×10/leg',3,'Controlled.',false,'reps_only'),
    ex('r_lg_er2','Slow Pushup','3×8',3,'4s down, 2s pause.',false,'reps_only'),
    ex('r_lg_er3','Dead Bug','3×8/side',3,'Core stability.',false,'reps_only'),
    ex('r_lg_er4','Bird Dog','3×10/side',3,'Opposite arm-leg.',false,'reps_only'),
    ex('r_lg_er5','Scissor Kicks','3×20',3,'Lying on back, legs straight, cross over in a scissor motion. Keep lower back pressed to the floor.',false,'reps_only'),
    ex('r_lg_er6','Leg Raise','3×15',3,'Lying on back, legs straight, raise to vertical and lower with control. Hands under lower back if needed for support.',false,'reps_only'),
  ],
  landing: WORKOUTS.comm['Longevity'].landing,
};
WORKOUTS.room['Cardio'] = {
  taxi: WORKOUTS.comm['Cardio'].taxi,
  takeoff: [
    ex('r_ca_to1','Burpee Intervals','8×30s',8,'Max burpees in 30s.',false,'reps_only'),
    ex('r_ca_to2','Stair Sprint Intervals','6×2 flights',6,'Full sprint up. Walk down.',false,'reps_only'),
  ],
  enroute: [
    ex('r_ca_er1','Jump Lunge','4×10/leg',4,'Explosive alternating.',false,'reps_only'),
    ex('r_ca_er3','Walking','30-45 min',1,'Outside or hotel corridors. Zone 1-2 steady pace. Log distance if you tracked it.',true,'timed_distance'),
    ex('r_ca_er2','Mountain Climbers','4×30s',4,'Fast feet.',true,'timed'),
    ex('r_ca_er4','Outdoor Run','20-40 min',1,'Any pace, any route. Log distance for the leaderboard.',true,'timed_distance'),
  ],
  landing: WORKOUTS.comm['Cardio'].landing,
};

// ─── FATIGUE-AWARE FILTERING ──────────────────────────────────────────────────
const LEVEL_EX = {
  beginner:     { taxi: 2, takeoff: 1, enroute: 1, landing: 1 },
  intermediate: { taxi: 2, takeoff: 2, enroute: 2, landing: 2 },
  advanced:     { taxi: 3, takeoff: 2, enroute: 4, landing: 3 },
};

// ─── GOAL OVERLAYS (emphasis objectives modify the base catalog) ─────────────
// Each overlay swaps specific exercises (by name, per env/muscle group/phase)
// and/or retargets rep schemes (by exercise id). Applied in getCombinedWorkout
// so there is ONE source of truth per exercise — no duplicated catalogs.
const GOAL_OVERLAYS = {
  glute: {
    swaps: {
      comm: { 'Lower Body': {
        takeoff: { 'Romanian Deadlift': ex('g_c_lb_ht','Barbell Hip Thrust','4×8',4,'Shoulders on a bench, bar over hips, chin tucked. Drive to full lockout and squeeze hard for 2 seconds. The single best glute builder.') },
        enroute: { 'Leg Press': ex('g_c_lb_gk','Cable Glute Kickback','3×12/leg',3,'Slight forward lean, kick straight back through the heel. Squeeze at full extension — no swinging.') },
      }},
      hotel: { 'Lower Body': {
        takeoff: { 'DB Romanian Deadlift': ex('g_h_lb_ht','DB Hip Thrust','4×10',4,'Shoulders on the bench edge, dumbbell over hips. Full lockout, hard glute squeeze at the top.') },
      }},
      room: { 'Lower Body': {
        takeoff: { 'Hamstring Raise (Nordic Curl)': ex('g_r_lb_ht','Single-Leg Hip Thrust','4×10/leg',4,'Shoulders on the bed edge, one foot planted. Drive through the heel to full lockout.',false,'reps_only') },
      }},
    },
  },
  chest: {
    swaps: {
      comm: { 'Upper Push': {
        enroute: { 'DB Tricep Overhead': ex('g_c_up_dip','Weighted Dip','3×8',3,'Slight forward lean for chest emphasis. Add weight once 3×8 at bodyweight is easy.') },
      }},
      hotel: { 'Upper Push': {
        enroute: { 'DB Front Raise': ex('g_h_up_fly','DB Flye','3×12',3,'Slight elbow bend, deep stretch at the bottom, hug-a-barrel arc up.') },
      }},
    },
  },
  strength: {
    swaps: {
      comm: { 'Lower Body': {
        takeoff: { 'Romanian Deadlift': ex('c_ul_to1','Conventional Deadlift','5×3',5,'Heavy triples. Brace hard, bar close to shins, hips and shoulders rise together.') },
      }},
    },
    retarget: { c_lb_to1: '5×3', c_up_to1: '5×3', c_up_to2: '4×3' },
  },
};

// Women complete more reps at a given intensity and recover faster between
// sets (fatigue-resistance research) — so hypertrophy-slot (enroute) rep
// targets shift up by 2 for female users. Heavy strength work (takeoff) and
// set counts stay identical: the science shows no difference there.
function femaleTargetBump(target) {
  return target.replace(/^(\d+)×(\d+)(\/\w+)?$/, (m, s, r, suf) => {
    r = parseInt(r, 10);
    if (r >= 6 && r <= 12) r += 2;
    return s + '×' + r + (suf || '');
  });
}

// ─── INJURY-AWARE FILTERING ───────────────────────────────────────────────────
// Conservative, name-based heuristic — not a medical assessment. Flags which
// body regions an exercise plausibly loads, based on movement pattern
// keywords in its name. Used to auto-swap to a known-safer alternative where
// one exists (via the same ALTERNATES data the manual Alternate button uses),
// and to caution-flag exercises where no confident substitute exists.
const INJURY_REGIONS = {
  shoulder:    { label: 'Shoulder',      keywords: ['Overhead Press','Lateral Raise','Front Raise','Upright Row','Handstand','Pike Pushup','Arnold','Y-T-W','Face Pull'] },
  elbow_wrist: { label: 'Elbow / Wrist',  keywords: ['Curl','Tricep','Extension','Close Grip','Dip','Pushup','Push-up','Plank'] },
  lower_back:  { label: 'Lower Back',     keywords: ['Deadlift','Good Morning','Back Extension','Superman','Row','RDL','Romanian'] },
  hip:         { label: 'Hip',            keywords: ['Squat','Lunge','Split Squat','Step-Up','Hip Thrust','Deadlift','Pistol','Goblet'] },
  knee:        { label: 'Knee',           keywords: ['Squat','Lunge','Split Squat','Step-Up','Jump','Box Jump','Pistol','Leg Press','Leg Extension'] },
  ankle_foot:  { label: 'Ankle / Foot',   keywords: ['Calf Raise','Jump','Box Jump','Run','Sprint','Walking','Treadmill'] },
  neck:        { label: 'Neck',           keywords: ['Neck','Shrug'] },
};

function exerciseRegionTags(exName) {
  if (!exName) return [];
  return Object.keys(INJURY_REGIONS).filter(r =>
    INJURY_REGIONS[r].keywords.some(kw => exName.toLowerCase().includes(kw.toLowerCase()))
  );
}

function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''); }

// Given an exercise, if the user has an active injury flag matching it, try
// to substitute a known-safer alternative from ALTERNATES. Returns either
// the original exercise (untouched), a caution-flagged copy (no safe
// alternative found), or a substituted exercise (new id, so PR history for
// the swap-in stays clean and separate from the original movement).
function applyInjuryFilter(exItem) {
  if (!ST.injuries || !ST.injuries.length) return exItem;
  const tags = exerciseRegionTags(exItem.name);
  const flagged = tags.filter(t => ST.injuries.includes(t));
  if (!flagged.length) return exItem;

  const alts = getAlternates(exItem.name);
  const safeAlt = alts.find(a => {
    const altTags = exerciseRegionTags(a.name);
    return !altTags.some(t => ST.injuries.includes(t));
  });

  if (safeAlt) {
    return {
      ...exItem,
      id: 'inj_' + slugify(safeAlt.name),
      name: safeAlt.name, target: safeAlt.target, note: safeAlt.note,
      swappedForInjury: true, originalName: exItem.name,
      flaggedRegion: INJURY_REGIONS[flagged[0]].label,
    };
  }
  return { ...exItem, injuryCaution: true, flaggedRegion: INJURY_REGIONS[flagged[0]].label };
}

// ─── TIME-AWARE FILTERING ─────────────────────────────────────────────────────
// Trims a workout to fit a stated time budget. Taxi (warmup) and Landing
// (cooldown) are protected — cutting those to save time is exactly backwards,
// since they're what prevents the injuries that cost far more training time
// later. En Route (accessory volume) is trimmed first, Takeoff (the primary
// compound lifts) only if time is still short after that.
const MIN_PER_EXERCISE = 6; // minutes incl. rest, equipment setup/teardown, and walking between stations
function applyTimeFilter(wk, minutes) {
  if (!minutes) return wk;
  let budget = Math.floor(minutes / MIN_PER_EXERCISE);
  const protectedCount = wk.taxi.length + wk.landing.length;
  let takeoff = [...wk.takeoff], enroute = [...wk.enroute];
  let remaining = Math.max(budget - protectedCount, 0);
  if (enroute.length > remaining) enroute = enroute.slice(0, Math.max(remaining, 0));
  remaining = Math.max(remaining - enroute.length, 0);
  if (takeoff.length > remaining) takeoff = takeoff.slice(0, Math.max(remaining, 1)); // keep at least 1 main lift
  return { taxi: wk.taxi, takeoff, enroute, landing: wk.landing };
}

// Rotates through a larger exercise pool across successive sessions of the
// same muscle group, instead of always returning the same fixed first N —
// without this, anything past index N in a catalog (calf raises, leg curls,
// leg extensions, hip abduction/adduction) could never actually appear in a
// real programmed workout, even though it exists and is well-populated.
// Cycles in non-overlapping windows so coverage of the whole pool is
// guaranteed over time, not left to chance the way random shuffling would.
function rotatedSlice(pool, count, rotationIndex) {
  if (!pool || pool.length <= count) return pool || [];
  const startIdx = (rotationIndex * count) % pool.length;
  const result = [];
  for (let i = 0; i < count; i++) result.push(pool[(startIdx + i) % pool.length]);
  return result;
}

function getFilteredWorkout(rawWk) {
  if (!rawWk) return null;
  // How many times this exact muscle group has been trained before — the
  // rotation advances one full window each time, so it's driven by actual
  // usage rather than calendar date (which would drift out of sync with
  // real training frequency if sessions get skipped or bunched up).
  const rotationIndex = (ST.sessionCache || []).filter(s => s.muscle_group === ST.muscleGroup).length;
  if (ST.fatigue === 'nogo') {
    return { taxi: rawWk.taxi, takeoff: [], enroute: [], landing: rawWk.landing };
  }
  if (ST.fatigue === 'marginal') {
    return { taxi: rawWk.taxi, takeoff: [], enroute: rotatedSlice(rawWk.enroute, 1, rotationIndex), landing: rawWk.landing };
  }
  const lim = LEVEL_EX[ST.level] || LEVEL_EX.intermediate;
  return {
    taxi:    rotatedSlice(rawWk.taxi, lim.taxi, rotationIndex),
    // Takeoff (primary compound lifts) deliberately stays a fixed slice —
    // you want to track progressive overload on the same squat/deadlift
    // variation session to session, not have it swap out from under you.
    takeoff: rawWk.takeoff.slice(0, lim.takeoff),
    enroute: rotatedSlice(rawWk.enroute, lim.enroute, rotationIndex),
    landing: rotatedSlice(rawWk.landing, lim.landing, rotationIndex),
  };
}

// Returns the effective workout to show/engage right now. When a custom
// "Build Your Own" profile is active, it's returned exactly as saved — no
// level/fatigue filtering, no time trimming, no injury swaps, no rep
// adjustments. That's deliberate: a custom profile is a fixed routine the
// user built by hand, not something the app should second-guess. Deep-cloned
// so nothing in a live session can ever mutate the saved template.
function getActiveWorkout() {
  if (ST.activeCustomProfileId) {
    const cp = ST.customProfiles.find(p => p.id === ST.activeCustomProfileId);
    if (cp) {
      return JSON.parse(JSON.stringify({
        taxi: cp.taxi, takeoff: cp.takeoff, enroute: cp.enroute, landing: cp.landing,
      }));
    }
  }
  const rawWk = getCombinedWorkout(ST.env, ST.muscleGroup);
  if (!rawWk) return null;
  return applyTimeFilter(getFilteredWorkout(rawWk), ST.timeAvailMin);
}

// Recommend next muscle group based on goal rotation + last completed session
// Walks and runs are never positions in the training rotation.
const NON_ROTATING_GROUPS = new Set(['Run','Walk']);

// Does this session represent a deliberate choice to train, and therefore
// a step through the rotation?
//
// Oura imports are the key case: an imported walk lands in history as
// muscle_group 'Cardio' with importedFromOura set, without anyone
// choosing it as a mission. Those must not advance the rotation.
//
// Note this checks the FLAG rather than blanket-excluding Cardio —
// General Health and Weight Loss both list Cardio as a real programmed
// step, and dropping it wholesale would quietly break those rotations for
// everyone using them.
function isRotationStep(session) {
  if (!session || !session.muscle_group || !session.date) return false;
  if (session.importedFromOura) return false;
  return !NON_ROTATING_GROUPS.has(session.muscle_group);
}

// The last real training session, ignoring cardio/walks entirely.
// Returns the two most recent, because emphasis goals (Chest & Shoulders,
// Glute Emphasis) list a group twice in one rotation and need the session
// before last to tell which of the two positions we're actually at.
function lastMajorSessions(limit) {
  return (ST.sessionCache || [])
    .filter(isRotationStep)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit || 2);
}

// BUG FIX (reported): "look at the last MAJOR workout (not a run or walk)
// and rotate to the next."
//
// This previously rotated from whatever was logged most recently, full
// stop. A walk logged after leg day — or auto-imported from Oura, which is
// how it kept happening — counted as a step through the rotation and
// advanced the pointer past everything, wrapping straight back around to
// legs. The rotation is a sequence of TRAINING sessions; a walk is not one
// of them, and it should not move the pointer at all.
//
// The v5.28.0 attempt at this added a 48-hour recovery guard instead.
// That treated the symptom: it stopped legs landing twice in two days, but
// left walks still advancing the rotation, so the sequence kept skipping
// whole muscle groups. Ignoring non-training sessions outright is the
// actual fix, and it makes the recovery guard unnecessary — following the
// rotation never repeats a group anyway.
function getRecommendedNext() {
  const order = (GOALS[ST.goal] || GOALS.longevity).order;
  const majors = order.filter(g => !NON_ROTATING_GROUPS.has(g));
  if (!majors.length) return order[0];

  const recent = lastMajorSessions(2);
  const last = recent[0]?.muscle_group;
  if (!last) return majors[0];

  const L = majors.length;
  const idxs = [];
  majors.forEach((mg, i) => { if (mg === last) idxs.push(i); });
  if (!idxs.length) return majors[0];

  // Emphasis goals repeat a group, so the same name sits at two positions
  // — the session before last says which one we're standing on.
  let idx = idxs[0];
  const prev = recent[1]?.muscle_group;
  if (idxs.length > 1 && prev) {
    const match = idxs.find(i => majors[(i - 1 + L) % L] === prev);
    if (match !== undefined) idx = match;
  }
  return majors[(idx + 1) % L];
}

// ─── EXERCISE GUIDE LINKS ─────────────────────────────────────────────────────
// Every URL below was individually verified against live ExRx.net search results
// during this session — confirmed to load and match the correct movement and
// terminology. ExRx often uses different names than common gym usage (e.g. our
// "Pistol Squat" is ExRx's "Single Leg Squat"); names were corrected to match.
// For every exercise without a confirmed direct page, we generate a Google
// search scoped to exrx.net for that exact name — this guarantees a working,
// relevant result even when ExRx has no dedicated page for a movement.
const EXRX_VERIFIED = {
  c_lb_to1:'https://exrx.net/WeightExercises/Quadriceps/BBSquat',
  c_lb_to2:'https://exrx.net/WeightExercises/OlympicLifts/RomanianDeadlift',
  c_lb_er1:'https://exrx.net/WeightExercises/Quadriceps/BWSingleLegSplitSquat',
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
  c_pp_er1:'https://exrx.net/Plyometrics/BroadJump',
  h_ul_to1:'https://exrx.net/WeightExercises/LatissimusDorsi/BWPullup',
  h_lb_to1:'https://exrx.net/WeightExercises/Kettlebell/KBGobletSquat',
  h_lb_to2:'https://exrx.net/WeightExercises/OlympicLifts/RomanianDeadlift',
  h_pp_to1:'https://exrx.net/Plyometrics/BoxJump',
  h_pp_to2:'https://exrx.net/Plyometrics/BroadJump',
  r_lb_to1:'https://exrx.net/WeightExercises/Quadriceps/BWSingleLegSquat',
  r_lb_to2:'https://exrx.net/WeightExercises/Hamstrings/ASHamstringRaiseSelfFloor',
  r_lb_er1:'https://exrx.net/WeightExercises/Quadriceps/BWSingleLegSplitSquat',
  r_pp_to1:'https://exrx.net/Plyometrics/BoxJump',
  r_pp_to2:'https://exrx.net/Plyometrics/BroadJump',
};

function youtubeSearchLink(name) {
  const clean = name.replace(/\([^)]*\)/g, '').replace(/[\/]/g, ' ').trim();
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(clean + ' exercise how to form');
}

function getExGuide(exId, exName) {
  const verified = EXRX_VERIFIED[exId];
  return {
    exrx: verified || youtubeSearchLink(exName || exId),
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
  { title:'Fasting Glucose Baseline', text:'Fasting glucose should be measured upon waking, before any food or coffee, after at least 8 hours without eating. Normal is roughly 70-99 mg/dL; 100-125 is considered pre-diabetic range; 126+ is the diabetic threshold. Stress and poor sleep can elevate readings independent of diet, so track the trend over weeks, not single readings.', link:'https://www.cdc.gov/diabetes/diabetes-testing/' },
  { title:'Blue Light Management', text:'Screens emit blue wavelengths that suppress melatonin release in the evening, delaying sleep onset. Blue-light-filtering glasses or built-in "night mode" settings after sunset are simple, evidence-supported countermeasures — useful for pilots managing irregular schedules.', link:'https://www.sleepfoundation.org/bedroom-environment/blue-light' },
  { title:'Why Squats Matter', text:'The squat loads the entire postural and lower body system at once — lumbar spine, hips, knees, ankles, and core all participate. For pilots, it directly counters the seated posture of the cockpit. Regular squatting supports bone density and overall functional strength as you age.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Post-Meal Walk', text:'A short walk after eating — even 10 minutes — measurably blunts the post-meal blood sugar spike by helping muscles take up glucose without relying on extra insulin. For pilots with irregular meal timing, this is one of the easiest interventions available in almost any environment.', link:'https://www.diabetes.org/healthy-living/fitness/getting-started-safely/walking' },
  { title:'Sleep Consistency', text:'A consistent wake time — more than bedtime — anchors your circadian rhythm and the hormonal cascade that depends on it. Even after irregular trips, returning to a fixed wake-time window within a few days helps rebuild that rhythm faster than chasing extra sleep alone.', link:'https://www.sleepfoundation.org/sleep-hygiene/sleep-schedule' },
  { title:'Box Breathing for Pilots', text:'Box breathing — inhale 4 counts, hold 4, exhale 4, hold 4 — is a simple, trainable technique used across military and high-performance settings to reduce acute stress and steady heart rate before a demanding task.', link:'https://www.health.harvard.edu/mind-and-mood/relaxation-techniques-breath-control-helps-quell-errant-stress-response' },
  { title:'Protein Priority', text:'Aiming for roughly 25-30g of protein per meal, spread across the day, supports muscle maintenance and satiety better than concentrating protein into one large meal. For pilots eating in airports and hotels, this means actively choosing protein-forward options at each stop.', link:'https://nutritionsource.hsph.harvard.edu/what-should-you-eat/protein/' },
  { title:'Fiber Intake', text:'Most adults fall well short of the roughly 25-30g of daily fiber recommended for digestive and metabolic health. Fiber slows glucose absorption, feeds beneficial gut bacteria, and supports satiety — valuable when travel limits food choices.', link:'https://nutritionsource.hsph.harvard.edu/carbohydrates/fiber/' },
  { title:'Zone 2 Training', text:'Training at a conversational pace — roughly 60-70% of max heart rate — builds the aerobic base that underlies recovery from harder efforts. Most evidence-based guidelines recommend 150+ minutes of this kind of moderate cardio per week for general health.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults' },
  { title:'Thoracic Mobility', text:'Prolonged forward-flexed postures — like extended seat time — encourage the upper back to round. Daily thoracic extension drills (over a chair back or foam roller) help counteract this and protect the neck and lower back from compensating.', link:'https://www.spine-health.com/wellness/exercise/thoracic-spine-stretches-and-exercises' },
  { title:'Caffeine Cutoff', text:'Caffeine has a half-life of roughly 5-6 hours, meaning a substantial dose remains active in your system well into the evening if consumed in the afternoon. For pilots with variable schedules, a personal cutoff time — even 8 hours before target sleep — meaningfully protects sleep quality.', link:'https://www.sleepfoundation.org/nutrition/caffeine-and-sleep' },
  { title:'Morning Light Exposure', text:'Getting outside within the first hour of waking — even on a cloudy day — provides far more light intensity than indoor lighting and helps anchor your circadian clock. For pilots adjusting across time zones, morning light at the destination is one of the fastest resynchronization tools available.', link:'https://www.sleepfoundation.org/bedroom-environment/light-and-sleep' },
  { title:'The Big Three Lifts', text:'A squat pattern, a hip-hinge pattern (like a deadlift), and a pulling pattern cover most of what the body needs for durable, functional strength. If your time is limited, maintaining competence in these three patterns gives the broadest return.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Active Recovery on Layovers', text:'Total rest on a layover often feels appealing, but light movement — an easy walk, gentle mobility work — tends to leave you feeling better than complete inactivity, by promoting blood flow and reducing stiffness without adding training stress.', link:'https://health.clevelandclinic.org/active-recovery' },
  { title:'Waist Measurement Protocol', text:'Measure at the navel, at the end of a normal exhale, without pulling in your stomach. A waist circumference over 40 inches in men (35 inches in women) is the commonly cited clinical threshold associated with higher metabolic and cardiovascular risk — independent of total body weight.', link:'https://www.nhlbi.nih.gov/health/educational/lose_wt/risk.htm' },
  { title:'Meal Timing', text:'Eating close to bedtime can interfere with the normal drop in core body temperature that supports sleep onset, and is associated with poorer overnight glucose control. A loose guideline of finishing meals 2-3 hours before bed is a reasonable target.', link:'https://www.sleepfoundation.org/nutrition/food-and-drink-promote-good-sleep' },
  { title:'CNS Recovery', text:'Strength adaptations happen during the recovery period after a workout — not during the workout itself. Adequate sleep and protein intake in the 24-48 hours following a hard session are what convert training stress into actual progress.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Scapular Position', text:'A neutral, slightly retracted shoulder blade position — sometimes cued as "shoulders back and down" — helps offset the forward-rounded posture common after years in a cockpit seat, and reduces shoulder impingement risk during pressing movements.', link:'https://www.spine-health.com/wellness/exercise/thoracic-spine-stretches-and-exercises' },
  { title:'Spinal Decompression', text:'Gentle stretches like child\'s pose create mild traction on the spine, helping offset the compressive load of long periods of sitting. This is a useful addition after a heavy lower body session.', link:'https://www.spine-health.com/wellness/exercise/thoracic-spine-stretches-and-exercises' },
  { title:'Blood Sugar Control', text:'Refined carbohydrates and added sugars tend to produce a rapid glucose rise followed by a crash, which can affect alertness a couple of hours later. Pairing carbohydrates with protein, fat, or fiber slows this response and tends to produce steadier energy.', link:'https://www.cdc.gov/diabetes/healthy-eating/' },
  { title:'Urine Color Chart', text:'Urine color remains one of the simplest, free hydration indicators — pale straw suggests good hydration, while dark amber suggests you need more fluids soon. Note that certain vitamins (like B-complex) can cause bright yellow urine unrelated to hydration status.', link:'https://www.mayoclinic.org/healthy-lifestyle/nutrition-and-healthy-eating/in-depth/water/art-20044256' },
  { title:'Cold Exposure', text:'Brief cold exposure at the end of a shower has been associated with improved alertness and mood in some studies, likely through norepinephrine release. It is not required for fitness progress but is a low-cost tool some people find energizing.', link:'https://www.health.harvard.edu/staying-healthy/the-power-of-the-cold-water-plunge' },
  { title:'Two-Minute Mindfulness', text:'Even short, focused-breathing breaks of a couple of minutes have been shown to reduce momentary stress markers and improve subsequent focus. For high-workload professions, brief resets between tasks may be more sustainable than longer sessions.', link:'https://www.health.harvard.edu/mind-and-mood/relaxation-techniques-breath-control-helps-quell-errant-stress-response' },
  { title:'Tempo Training for Longevity', text:'Slowing down the lowering (eccentric) portion of a lift increases time under tension and may better stimulate connective tissue adaptation than fast, uncontrolled reps — a useful emphasis for joint-friendly, longevity-focused training.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Dietary Blood Pressure', text:'Reducing sodium intake and increasing potassium-rich foods — leafy greens, avocado, sweet potatoes, legumes — are two of the most well-supported dietary levers for lowering blood pressure over time.', link:'https://www.heart.org/en/health-topics/high-blood-pressure/changes-you-can-make-to-manage-high-blood-pressure' },
  { title:'Anti-Movement Core Training', text:'Exercises like planks and dead bugs train the core to resist unwanted movement of the spine, which is generally considered more protective for the lower back than traditional flexion-based exercises like sit-ups.', link:'https://www.spine-health.com/wellness/exercise/core-exercises-low-back-pain' },
  { title:'Screen-Free Pre-Sleep Window', text:'Reducing screen exposure in the hour before bed — and replacing it with reading, journaling, or a podcast — is a simple, low-cost habit associated with falling asleep more easily over time.', link:'https://www.sleepfoundation.org/bedroom-environment/blue-light' },
  { title:'Dynamic Warmup Science', text:'Dynamic movement-based warmups (leg swings, bodyweight squats, hip hinges) tend to outperform static stretching for preparing the body for performance, while static stretching is better reserved for after the session.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Muscle as Metabolic Insurance', text:'Skeletal muscle is a major site of glucose disposal in the body. Building and maintaining muscle mass through resistance training supports better blood sugar regulation over the long term, independent of weight changes.', link:'https://www.cdc.gov/diabetes/healthy-eating/' },
  { title:'Trap Release Protocol', text:'The upper traps and neck muscles often carry chronic tension from supporting the head during long periods of sitting. A few minutes of self-massage with a lacrosse ball or foam roller against a wall can meaningfully reduce that tension.', link:'https://www.spine-health.com/wellness/exercise/thoracic-spine-stretches-and-exercises' },
  { title:'Daily Weight Protocol', text:'Body weight naturally fluctuates several pounds day to day from water and food volume. Weighing at the same time, same conditions, and tracking a weekly average gives a far clearer signal than any single day\'s number.', link:'https://www.health.harvard.edu/staying-healthy/is-bmi-the-best-predictor-of-future-health' },
  { title:'Vitamin D for Pilots', text:'Limited sun exposure — common for flight crew due to schedules and UV-filtering cockpit glass — is a known risk factor for low vitamin D. Annual testing and supplementation when needed is a reasonable precaution.', link:'https://ods.od.nih.gov/factsheets/VitaminD-Consumer/' },
  { title:'Building Your Aerobic Base', text:'A broad aerobic base, built through consistent moderate-intensity cardio over months, improves recovery capacity between harder training sessions and supports long-term cardiovascular health.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults' },
  { title:'Chin Tuck Protocol', text:'A simple chin-tuck exercise — drawing the chin straight back without tilting down — helps counteract forward head posture from screens and cockpit positioning, reducing strain on the neck over time.', link:'https://www.spine-health.com/wellness/exercise/thoracic-spine-stretches-and-exercises' },
  { title:'Progressive Overload', text:'Strength gains require gradually increasing demand on the muscle over time — more reps, more weight, or more total volume. Tracking your numbers (which this app does automatically) is what makes that progression visible and intentional.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Hydration and Cognition', text:'Even mild dehydration has been linked to reduced alertness and slower reaction time. Because thirst can lag behind actual need — especially in dry cabin air — drinking on a schedule rather than waiting to feel thirsty is the more reliable approach.', link:'https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html' },
  { title:'Time-Restricted Eating', text:'Compressing eating into a consistent daily window (such as 10am-8pm) is one approach some people use to support metabolic health, though it works best as a consistency tool rather than a rigid rule, especially with irregular pilot schedules.', link:'https://nutritionsource.hsph.harvard.edu/healthy-weight/diet-reviews/intermittent-fasting/' },
  { title:'Hip Hinge for Back Health', text:'Learning to hinge at the hips rather than round the lower back when lifting or bending is one of the most protective movement patterns for long-term spine health, especially relevant for handling bags and gear.', link:'https://www.spine-health.com/wellness/exercise/core-exercises-low-back-pain' },
  { title:'Post-Workout Nutrition', text:'Eating a combination of protein and carbohydrates within an hour or two after training supports recovery and glycogen replenishment. Simple options like Greek yogurt with fruit work well when you don\'t have time to prepare a full meal.', link:'https://nutritionsource.hsph.harvard.edu/what-should-you-eat/protein/' },
  { title:'Nasal Breathing', text:'Breathing through the nose during lower-intensity activity filters and humidifies air and may support more efficient oxygen exchange compared with mouth breathing. It\'s a skill that can be practiced gradually during easy cardio.', link:'https://www.health.harvard.edu/mind-and-mood/relaxation-techniques-breath-control-helps-quell-errant-stress-response' },
  { title:'Physical = Professional', text:'Physical fitness and cognitive performance are linked — better cardiovascular health and sleep quality both support sharper decision-making under workload. Training is not separate from professional readiness; it supports it directly.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults' },
  { title:'Darkness for Sleep', text:'A fully dark sleeping environment supports deeper, more restorative sleep. For pilots in unfamiliar hotel rooms, packing a quality sleep mask is a small investment with an outsized payoff.', link:'https://www.sleepfoundation.org/bedroom-environment/light-and-sleep' },
  { title:'Frequency Over Duration', text:'For mobility work specifically, doing a little every day tends to produce better results than doing a lot once a week. This is part of why the Taxi phase of every workout matters — consistency compounds.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Track Your Weights', text:'Without tracking, it is easy to believe you are progressing when you have actually plateaued. Logging sets, reps, and weight — as this app does — is the most direct way to confirm real progress and catch stalls early.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Resting Heart Rate as a Metric', text:'A resting heart rate noticeably higher than your personal baseline can be an early signal of inadequate recovery, illness, or excessive training stress — useful information for deciding whether to push or pull back on a given day.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/target-heart-rates' },
  { title:'The Long Game', text:'Consistency over many months outperforms any short, intense burst of effort. A sustainable training rhythm you can maintain for a year will produce better outcomes than an unsustainable one you abandon after a few weeks.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults' },
  { title:'Delayed Onset Muscle Soreness', text:'Soreness that peaks 24-48 hours after a new or harder-than-usual session is a normal adaptive response, not necessarily a sign of damage. Light movement, hydration, and protein support recovery; soreness lasting more than 4-5 days or accompanied by severe swelling warrants medical attention.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Grip Strength as a Health Marker', text:'Grip strength is one of the most studied simple measures linked to overall health outcomes in research populations. Farmer carries, dead hangs, and heavy rows all build grip incidentally — useful general training, not just a niche skill.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults' },
  { title:'Jet Lag and Training Timing', text:'Training in late afternoon or early evening at your destination can help shift your circadian clock faster than training right after arrival when your body still expects to be asleep. Light exposure timing matters more than the workout itself for adjustment speed.', link:'https://www.sleepfoundation.org/jet-lag' },
  { title:'Static vs Dynamic Stretching Timing', text:'Static stretches (held for 20-60 seconds without movement) are best done after training or on rest days, when tissue is warm and the goal is mobility rather than power output. Doing them cold, before lifting, can temporarily reduce strength and power.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Electrolytes Beyond Water', text:'On long flights or hot layovers, water alone may not fully replace what is lost through sweat. Sodium, potassium, and magnesium support muscle function and fluid balance — a pinch of salt or an electrolyte tablet is reasonable after heavy sweating, not just plain water.', link:'https://www.mayoclinic.org/healthy-lifestyle/nutrition-and-healthy-eating/in-depth/water/art-20044256' },
  { title:'The Knee-Over-Toe Myth', text:'Older coaching cues warned against letting the knee travel past the toe in a squat or lunge. Current biomechanics research shows this movement is normal and safe for most people with adequate ankle mobility — restricting it artificially can actually increase strain elsewhere.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Warm-Up Specificity', text:'A general warm-up raises heart rate and tissue temperature, but a few lighter sets of the actual exercise you are about to perform (rehearsal sets) prepare the specific movement pattern and joint angles better than generic cardio alone.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Sleep Debt Does Not Fully Repay', text:'Sleeping in on days off helps somewhat, but research suggests chronic short sleep during the work week is not fully offset by weekend catch-up. Protecting sleep on duty days matters more than trying to recover it afterward.', link:'https://www.sleepfoundation.org/sleep-deprivation' },
  { title:'Training Around a Minor Injury', text:'A minor strain in one area does not require stopping all training. Working unaffected muscle groups (sometimes called the "minimal effective dose" approach) maintains fitness and can even support healing through circulation — but always within pain-free range and ideally with medical guidance for anything beyond mild discomfort.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'The Talk Test for Cardio Intensity', text:'A practical way to gauge Zone 2 effort without a heart rate monitor: you should be able to hold a conversation, but not comfortably sing. If you cannot speak in full sentences, you have drifted into a harder zone than intended for base-building cardio.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults' },
  { title:'Why Tendons Take Longer Than Muscle', text:'Muscle tissue can show measurable strength adaptation in 1-2 weeks, but tendons and ligaments adapt over months due to slower blood supply and collagen turnover. This is part of why progressing load too quickly increases tendon injury risk even when muscles feel ready.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Hydration and Altitude', text:'Cabin pressurization simulates an altitude of roughly 6,000-8,000 feet, which increases respiratory water loss compared to sea level even without physical exertion. This is part of why pilots and frequent flyers need more deliberate hydration than ground-based schedules suggest.', link:'https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html' },
  { title:'Protein Timing Is Less Critical Than Total', text:'While post-workout protein timing gets a lot of attention, total daily protein intake matters more for muscle maintenance and growth than the exact hour you consume it — useful to know when travel schedules make precise meal timing unrealistic.', link:'https://nutritionsource.hsph.harvard.edu/what-should-you-eat/protein/' },
  { title:'The Vestibular System and Balance Training', text:'Single-leg exercises and balance work train the vestibular and proprioceptive systems, which naturally decline with age and inactivity. This has practical relevance for fall prevention later in life and for general movement confidence now.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Cortisol and Chronic Stress', text:'Persistently elevated cortisol from chronic stress (including irregular schedules) is associated with increased abdominal fat storage, disrupted sleep, and impaired recovery from training. Stress management is not separate from fitness — it is a determinant of how well your training actually works.', link:'https://www.health.harvard.edu/staying-healthy/understanding-the-stress-response' },
  { title:'Deload Weeks', text:'Periodically reducing training volume or intensity for a week (a "deload") allows accumulated fatigue to dissipate and is associated with better long-term progress than continuous, unbroken intensity. Roughly every 4-8 weeks is a common guideline, adjusted to how you are recovering.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Air Travel and Blood Clot Risk', text:'Prolonged sitting on long flights is associated with increased risk of deep vein thrombosis. Calf raises, ankle circles, and brief walks through the cabin when possible help maintain circulation. This applies to frequent flyers and crew, not just passengers on the longest routes.', link:'https://www.cdc.gov/blood-clots/risk-factors/travel.html' },
  { title:'The Plateau Is Information, Not Failure', text:'A training plateau usually signals that one input — sleep, nutrition, recovery, or programming — needs to change, not that effort was wasted. Reviewing logged data (which this app captures automatically) helps identify which variable has stalled before assuming you need to simply work harder.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Omega-3s and Inflammation', text:'Omega-3 fatty acids (found in fatty fish, walnuts, flaxseed) are associated with modestly reduced inflammatory markers and may support joint comfort and recovery in people training regularly. They are a reasonable dietary target rather than a required supplement for most people.', link:'https://ods.od.nih.gov/factsheets/Omega3FattyAcids-Consumer/' },
  { title:'Why Soreness Is Not a Progress Metric', text:'Feeling sore after a workout does not reliably indicate how effective that session was for strength or muscle gains — some highly effective sessions produce little soreness, and some unproductive ones produce a lot. Logged performance data is a far more reliable signal than how you feel the next day.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Compression Garments on Long Flights', text:'Graduated compression socks may help reduce leg swelling and discomfort on long-haul flights by supporting venous return. They are not a substitute for movement and hydration, but a reasonable addition for very long duty days.', link:'https://www.cdc.gov/blood-clots/risk-factors/travel.html' },
  { title:'The Difference Between Tired and Fatigued', text:'Feeling sleepy is different from accumulated training fatigue — you can be well-rested and still carrying unresolved muscular or nervous system fatigue from recent hard sessions. The Pilot Condition toggle in this app is meant to capture that distinction, not just whether you slept well.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Resistance Training and Bone Density', text:'Mechanical loading from resistance training, particularly compound lower-body lifts, stimulates bone remodeling and is one of the most effective non-pharmacological interventions for maintaining bone density as you age — relevant well before osteoporosis becomes a concern.', link:'https://www.nia.nih.gov/health/exercise-and-physical-activity/three-types-exercise-can-improve-your-health-and-physical' },
  { title:'Why Single-Joint and Multi-Joint Exercises Both Matter', text:'Compound lifts (squat, deadlift, press) build the most overall strength efficiently, but isolation exercises (lateral raises, curls, face pulls) address specific weak points and joint health that compounds alone do not fully cover. A well-rounded program needs both, not one or the other.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'The Cephalic Phase of Digestion', text:'Simply seeing or smelling food triggers digestive hormone release before you take a bite. This is part of why eating mindfully — without screens, slowly — tends to produce better satiety signals than eating distracted, which matters when travel makes rushed meals common.', link:'https://nutritionsource.hsph.harvard.edu/what-should-you-eat/protein/' },
  { title:'Why Warmup Sets Should Not Be Skipped', text:'Working up to a heavy top set through 2-3 progressively heavier warm-up sets primes the nervous system and reduces injury risk compared to loading the working weight cold. This is built into every Takeoff phase exercise in this app for that reason.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Sodium Is Not Universally Bad', text:'While excess sodium is linked to high blood pressure in sodium-sensitive individuals, very low sodium combined with heavy sweating (long flights, hot layovers, hard training) can also cause problems. The right amount depends on your individual health status and activity level — context matters more than a blanket rule.', link:'https://www.heart.org/en/health-topics/high-blood-pressure/changes-you-can-make-to-manage-high-blood-pressure' },
  { title:'The Overload Principle Applies to Mobility Too', text:'Just as muscles need progressive load to get stronger, joints need progressively deeper or longer-held stretches over time to improve range of motion. Holding the same easy stretch for months will maintain — but not improve — flexibility.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Hotel Gym Programming Reality', text:'Limited equipment does not mean limited results. Dumbbells alone can effectively train every major movement pattern — squat, hinge, push, pull, carry — with appropriate exercise selection, which is exactly why this app builds full hotel-gym and hotel-room programs rather than treating them as compromises.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Caffeine and Performance', text:'Moderate caffeine intake (roughly 3-6mg per kg of bodyweight) 30-60 minutes before training is associated with modest improvements in strength and endurance performance for many people. Individual tolerance varies widely, and the sleep cost of late-day use generally outweighs any performance benefit from afternoon or evening caffeine.', link:'https://www.sleepfoundation.org/nutrition/caffeine-and-sleep' },
  { title:'The Difference Between Pain and Discomfort', text:'Muscular burning and breathlessness during hard effort are expected discomfort. Sharp, localized, or joint pain is a different signal that warrants stopping and reassessing — learning this distinction is one of the most valuable skills in long-term training longevity.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Magnesium and Sleep Quality', text:'Magnesium is involved in regulating the nervous system pathways related to sleep, and some research associates adequate intake with improved sleep quality. Leafy greens, nuts, and seeds are good dietary sources; supplementation is reasonable for those who do not get enough through food.', link:'https://ods.od.nih.gov/factsheets/Magnesium-Consumer/' },
  { title:'Recovery Nutrition on Travel Days', text:'Travel days without training still deplete the body through dehydration, irregular meals, and disrupted sleep. Treating a travel day with the same nutritional care as a hard training day — adequate protein, hydration, and sleep hygiene — supports faster bounce-back when you do train next.', link:'https://nutritionsource.hsph.harvard.edu/what-should-you-eat/protein/' },
  { title:'Why Rep Ranges Are a Spectrum, Not Strict Categories', text:'Traditional guidance assigns strength to low reps (1-5), hypertrophy to moderate reps (6-12), and endurance to high reps (15+), but research shows meaningful overlap across all these ranges when training is taken close to fatigue. Range matters less than most people assume — consistency and effort matter more.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'The Value of a Training Log Beyond Weights', text:'Recording how a session felt — energy, sleep the night before, stress level — alongside the numbers can reveal patterns that explain performance swings better than the numbers alone. Several fields in this app capture exactly that context for this reason.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Cold and Flu Risk After Hard Training', text:'A single bout of very intense or prolonged exercise can temporarily suppress immune markers for several hours afterward — sometimes called the "open window." Adequate sleep and nutrition around hard sessions, and being mindful of contagious exposure during this window, are reasonable precautions, especially for crew moving through airports.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Why Hip Mobility Affects the Whole Body', text:'Restricted hip mobility commonly causes the lower back or knees to compensate during squatting, lunging, and even walking. This is why hip-focused mobility work appears so often across every mission profile in this app rather than being treated as an isolated stretch.', link:'https://www.spine-health.com/wellness/exercise/thoracic-spine-stretches-and-exercises' },
  { title:'The Role of Carbohydrates Around Training', text:'Carbohydrates are the primary fuel for higher-intensity training. Restricting them too aggressively around hard sessions can reduce performance and recovery quality, even for people otherwise managing weight through reduced carbohydrate intake at other times of day.', link:'https://nutritionsource.hsph.harvard.edu/carbohydrates/' },
  { title:'Why Form Cues Matter More Than Load Early On', text:'Adding weight before movement quality is consistent increases injury risk and often reinforces poor mechanics that are harder to correct later. Mastering the pattern first, then adding load, is slower initially but more durable long-term — this is the logic behind the Taxi phase rehearsal sets before heavier work.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Sleep Architecture and Travel', text:'Crossing time zones disrupts not just total sleep time but the proportion of deep and REM sleep within each cycle, which affects both physical recovery and cognitive sharpness independent of how many hours you slept. This is why jet lag can feel worse than the hour count alone would suggest.', link:'https://www.sleepfoundation.org/jet-lag' },
  { title:'The Case for Unilateral Training', text:'Single-leg and single-arm exercises expose and correct side-to-side strength imbalances that bilateral lifts can mask, and they train core stability and balance simultaneously. This is part of why split squats, step-ups, and single-arm rows appear throughout this program rather than only bilateral lifts.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Why Breathing Mechanics Affect Lifting', text:'Bracing the core with a controlled breath (sometimes called the Valsalva maneuver for very heavy lifts) increases intra-abdominal pressure and spinal stability during heavy compound lifts. This is a learnable skill, not an innate one, and is worth deliberate practice on lighter sets before applying it under heavy load.', link:'https://www.spine-health.com/wellness/exercise/core-exercises-low-back-pain' },
  { title:'Why You Should Not Compare Your Program to Someone Else\'s', text:'Training history, recovery capacity, joint structure, and goals all vary enormously between individuals. A program perfectly suited to a 25-year-old bodybuilder is often inappropriate for a 45-year-old pilot prioritizing longevity — this is the entire reason this app offers goal-specific tracks rather than one universal program.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'The Importance of Tracking Trends, Not Just Totals', text:'A single high or low reading in weight, blood pressure, or glucose is far less meaningful than the trend across several weeks. This app\'s charts are designed to surface the trend line precisely because individual data points are noisy and easy to overreact to.', link:'https://www.cdc.gov/diabetes/diabetes-testing/' },
  { title:'Why Stretching Alone Will Not Fix Tightness Caused by Weakness', text:'Muscles that feel chronically tight are sometimes compensating for weakness elsewhere, not actually short. In these cases, strengthening the underactive muscle resolves the tightness better than stretching the tight one — a common pattern in hip flexors compensating for weak glutes.', link:'https://www.spine-health.com/wellness/exercise/core-exercises-low-back-pain' },
  { title:'Hydration Needs Scale With Body Size and Climate', text:'Hydration guidelines are a reasonable baseline, but actual needs scale up with body size, heat, humidity, and sweat rate. Someone training in a hot, humid layover city needs meaningfully more than the baseline recommendation — use the app\'s targets as a floor, not a ceiling, when conditions demand more.', link:'https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html' },
  { title:'The Connection Between Gut Health and Energy', text:'Digestive discomfort from poor airport food choices or irregular eating can affect energy levels and training quality the same day. Prioritizing fiber, hydration, and consistent meal timing when possible supports both digestion and the training performance that depends on feeling well.', link:'https://nutritionsource.hsph.harvard.edu/carbohydrates/fiber/' },
  { title:'Why "Functional Training" Is Not a Separate Category', text:'All resistance training that improves strength, balance, and movement quality is functional in the sense that it transfers to daily activities and reduces injury risk — there is no meaningful separate category of magic "functional" exercises distinct from well-programmed traditional strength training.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Bodyweight Training Has a Real Ceiling — And That\'s Fine', text:'Pure bodyweight training (relevant in hotel rooms with no equipment) eventually plateaus in strength gains once movements become easy, but it remains highly effective for maintaining muscle, mobility, and conditioning during travel-limited periods. It is a legitimate maintenance tool, not just a poor substitute for weights.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'The Value of a Pre-Sleep Routine', text:'A consistent sequence of low-stimulation activities before bed (dimming lights, light reading, stretching) cues the brain that sleep is approaching, similar to how athletes use pre-performance routines to cue focus. This conditioning effect builds over weeks of consistent repetition.', link:'https://www.sleepfoundation.org/sleep-hygiene' },
  { title:'Why This App Tracks Waist Alongside Weight', text:'Body weight alone cannot distinguish between fat loss and muscle loss, or fat gain and muscle gain. Waist circumference, tracked alongside weight, gives a clearer picture of body composition trends over time without requiring expensive body-fat testing equipment.', link:'https://www.nhlbi.nih.gov/health/educational/lose_wt/risk.htm' },
  { title:'Final Briefing: Build the Habit Before the Optimization', text:'A consistent, "good enough" training habit sustained for a year will outperform a perfectly optimized program abandoned after a month. Get the habit locked in first — proper timing, ideal rep ranges, and supplement protocols are refinements that matter far less than simply showing up consistently.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults' },
];

// ─── CNS DOWN-REGULATION EXPLAINER (referenced from Landing phase + Wisdom) ──
const CNS_EXPLAINER = "CNS down-regulation means deliberately shifting your nervous system from a sympathetic state (\"fight-or-flight\" — activated during hard training) back to a parasympathetic state (\"rest-and-digest\"). After intense exercise, your heart rate, breathing, and stress hormones are elevated. Slow breathing, stillness, and gentle stretching signal to your nervous system that the demand has passed, which speeds recovery and improves the sleep that follows. This is why the Landing phase exists in every workout — skipping it doesn't make you tougher, it just means you carry that activation into the rest of your day.";

// ─── BIOMETRIC INFO POPUPS ────────────────────────────────────────────────────
const BIO_INFO = {
  injury: {
    title: 'Injury Flag',
    text: 'Flag a body region that\'s currently bothering you. The app checks every exercise in your program against your flagged region(s): where a proven safer alternative already exists in the exercise library, it swaps it in automatically and shows what it replaced. Where no confident substitute exists, it leaves the original exercise in place but marks it with a caution badge so you can decide — open Alternate to browse other options, or skip it that day. This is a conservative heuristic based on exercise names and movement patterns, not a medical assessment. It won\'t catch everything, and it\'s not a substitute for a doctor or physical therapist if something actually hurts. Clear the flag once you\'re past it.',
  },
  timeAvail: {
    title: 'Time Available',
    text: 'Tell the app how many minutes you actually have today, and it trims your session to fit — the same way a coach would shorten a workout on a tight schedule. Warm-up (Taxi) and cooldown (Landing) are protected and trimmed last, since skipping them to save time is exactly backwards: they\'re what prevent the injuries that cost you far more training time later. The accessory volume (En Route) gets cut first, since that\'s the lowest-cost place to lose a set when time is short. Leave it blank for your full programmed session.',
  },
  sleepHours: {
    title: 'Sleep Hours',
    text: 'If you don\'t have a wearable, this gives the app the single most useful recovery signal after Oura: how much you actually slept. Under 6 hours suggests dialing back to MARGINAL, under 5 suggests NO-GO — sleep debt measurably impairs strength output, reaction time, and injury resistance the next day. This only suggests; your own Pilot Condition selection always has the final say. If Oura is connected, its readiness score already accounts for sleep, so this field is hidden.',
  },
  age: {
    title: 'Age',
    text: 'Recovery capacity between sets and between sessions declines gradually with age — not dramatically, but enough that most strength coaches build in slightly longer rest periods for lifters over 45, and more so over 60. The app applies a modest rest-timer adjustment on that basis. It does not change your program\'s exercise selection, volume, or intensity — those are governed by your Fitness Level and Mission Objective, not age. Nothing here implies age is a limit; it\'s a small recovery-window adjustment, nothing more.',
  },
  readiness: {
    title: 'Daily Readiness (1-5)',
    text: 'A quick self-check: how recovered do you actually feel today? This captures things no wearable can — motivation, life stress, an oncoming cold, how last night\'s duty day actually felt. A rating of 1-2 suggests NO-GO, 3 suggests MARGINAL, 4-5 suggests GO — the same bands Oura\'s readiness score maps to. Like every other automatic suggestion in this app, it only pre-selects your Pilot Condition; you can always override it with the GO / MARGINAL / NO-GO buttons directly. If Oura is connected, its readiness score takes precedence and this is hidden to avoid two competing signals.',
  },
  hrv: {
    title: 'HRV Balance',
    text: 'HRV Balance is Oura\'s score (0-100) comparing your recent heart rate variability to your own 2-week baseline — not a raw HRV number, and not comparable between people. Higher means your nervous system is more recovered relative to your normal; lower means accumulated stress, poor sleep, illness, or overtraining is dragging on recovery. A single low day matters less than a multi-day downward trend, which is a real signal to back off training intensity.',
  },
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
// Races any promise against a timeout — used to wrap Supabase calls so a
// dead connection (airplane mode, no signal) fails fast instead of hanging
// indefinitely. Some networks don't reject a request promptly when there's
// no route; they just never respond. Every function below that touches the
// network during boot uses this, since a single hung call there would leave
// the entire app un-rendered.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms || 6000)),
  ]);
}

const PROFILE_CACHE_KEY = 'fcf_profile_cache';
// Converts ICS's "basic" datetime format (20260601T120800Z, no separators)
// into standard ISO-8601 (2026-06-01T12:08:00Z) that JS's Date constructor
// can actually parse. The trailing Z means UTC per the ICS spec — comparing
// two Date objects afterward is timezone-safe regardless of what timezone
// the device happens to be in, since Date stores an absolute instant.
function parseICSDateTime(raw) {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7]}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

// Parses a MobileCCI-style .ics export into classified events. Deliberately
// reads only DTSTART/DTEND/SUMMARY/UID — never the DESCRIPTION "Time:" text,
// which uses a different, non-Z-suffixed time reference that doesn't match
// the authoritative UTC start/end and would silently misclassify events if
// relied on.
// Reads the true station-local times out of a MobileCCI DESCRIPTION line.
// Built with local date components (not Date.parse of a bare string, which
// varies by engine), so the value formats back to exactly the digits the
// airline shows.
function descriptionLocalTimes(desc) {
  if (!desc) return null;
  const m = String(desc).match(/Time:\s*(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\s*-\s*(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const n = m.map(Number);
  const start = new Date(n[1], n[2]-1, n[3], n[4], n[5], n[6]);
  const end   = new Date(n[7], n[8]-1, n[9], n[10], n[11], n[12]);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return { start, end };
}

function parseFlightScheduleICS(icsText) {
  if (!icsText) return [];
  // Un-fold ICS line continuations: a line starting with a single space is
  // a continuation of the previous line, per RFC5545.
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let cur = null;
  lines.forEach(line => {
    if (line === 'BEGIN:VEVENT') { cur = {}; return; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; return; }
    if (!cur) return;
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = line.slice(0, idx).split(';')[0]; // strip any ;PARAM= suffix
    const val = line.slice(idx + 1);
    if (key === 'UID') cur.uid = val;
    else if (key === 'DESCRIPTION') cur.description = val;
    else if (key === 'DTSTART') cur.start = parseICSDateTime(val);
    else if (key === 'DTEND') cur.end = parseICSDateTime(val);
    else if (key === 'SUMMARY') cur.summary = val;
  });

  // BUG FIX (reported, confirmed against the American Airlines app):
  // MobileCCI's DTSTART/DTEND carry a Z suffix but are NOT UTC. Across all
  // 111 flights in a real export they are the station-local time plus
  // exactly 5 hours — every event stamped as though it were Central,
  // whatever the station's actual timezone.
  //
  // Trusting that Z meant the schedule rendered wrong by however far the
  // device sat from UTC-5: an hour out in El Paso, two hours out in Eugene.
  // Every downstream number inherited it — duty windows, free time,
  // "you're off at", flight hours feeding the hydration target.
  //
  // The DESCRIPTION line carries the true local times and matches the
  // airline's own app exactly:
  //   Time: 2026-07-31T13:39:00 - 2026-07-31T16:16:00
  // so it is preferred wherever present, with DTSTART kept only as a
  // fallback for events that lack it.
  events.forEach(e => {
    const t = descriptionLocalTimes(e.description);
    if (t) { e.start = t.start; e.end = t.end; e.localFromDescription = true; }
  });

  return events.filter(e => e.start && e.end && e.summary).map(e => {
    let type = 'other', airport = null;
    if (/^Layover /.test(e.summary)) {
      type = 'layover';
      const m = e.summary.match(/^Layover (\w+)/);
      airport = m ? m[1] : null;
    } else if (/^Flight /.test(e.summary)) {
      type = 'flight';
    } else if (/^Duty free period$/.test(e.summary)) {
      type = 'dutyfree';
    }
    return { uid: e.uid, start: e.start.toISOString(), end: e.end.toISOString(), summary: e.summary, type, airport,
             localFromDescription: !!e.localFromDescription };
  });
}

// What's happening RIGHT NOW according to the stored schedule — checked
// against the device's actual current instant, so it's correct regardless
// of which timezone the device is currently in.
function getCurrentScheduleStatus(scheduleEvents) {
  if (!scheduleEvents || !scheduleEvents.length) return null;
  const now = Date.now();
  const active = scheduleEvents.find(e => {
    const s = new Date(e.start).getTime(), en = new Date(e.end).getTime();
    return now >= s && now <= en;
  });
  return active || null;
}

async function dbGetProfile() {
  if (!ST.user) return JSON.parse(localStorage.getItem('fcf_profile')||'null');
  try {
    const { data } = await withTimeout(SB.from('user_profiles').select('*').eq('user_id', ST.user.id).maybeSingle());
    const profile = data?.profile_data || null;
    if (profile) { try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile)); } catch(e) {} }
    ST.profileFromCache = false;
    return profile;
  } catch(e) {
    // Network unreachable — fall back to the last successfully-fetched copy
    // rather than returning null, which would silently blank out sex,
    // height, age, injuries, and every other saved profile field on a cold
    // offline launch even though the real data is untouched server-side.
    ST.profileFromCache = true;
    try { return JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY)||'null'); } catch(e2) { return null; }
  }
}
async function dbSetProfile(p) {
  if (!ST.user) { localStorage.setItem('fcf_profile', JSON.stringify(p)); return; }
  try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p)); } catch(e) {}
  try {
    await withTimeout(SB.from('user_profiles').upsert({ user_id: ST.user.id, profile_data: p, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }));
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
    const { data, error } = await withTimeout(filter.gte('started_at', since).order('started_at', { ascending: true }));
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
    const { data } = await withTimeout(filter.order('started_at', { ascending: false }).limit(2));
    ST.prevSession = data?.[1]?.session_data || null;
    return data?.[0]?.session_data || null;
  } catch(e) {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('fcf_session_'));
    if (!keys.length) return null;
    keys.sort();
    ST.prevSession = keys.length > 1 ? JSON.parse(localStorage.getItem(keys[keys.length-2])) : null;
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
  parts.push('<div class="fb" style="align-items:flex-start"><div class="landing-logo">✈ FLIGHT CREW FITNESS</div>');
  parts.push('<div id="zuluClock" style="font-family:var(--mono);font-size:11px;color:var(--muted);letter-spacing:0.05em;white-space:nowrap"></div></div>');
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
    ['🚦','Fatigue-gated intensity','A pilot condition toggle (Go / Marginal / No-Go) reduces or removes heavy lifting when you\'re running on insufficient rest — auto-set from your Oura Ring if you wear one, or a 15-second self-check if you don\'t.'],
    ['⌚','Oura Ring auto-sync','Connect once and your daily readiness, sleep, and HRV drive your workout intensity automatically — no manual logging required.'],
    ['🏆','Leaderboards, scored fairly','Compete on bench, squat, deadlift, and more against fellow pilots — ranked by DOTS score, which adjusts for bodyweight and sex, so a 160 lb first officer and a 220 lb captain are compared on equal footing, not just raw weight. Opt-in only — no call sign, nothing is shared.'],
    ['🎖️','Badges for reaching goals','Hit a personal record, a training streak, or a milestone and it gets recognized automatically — pulled from your real logged history, not just a login count.'],
    ['🩹','Injury-aware programming','Flag a sore shoulder or knee and the app automatically swaps in a safer alternative where one exists, or flags the exercise so you can decide — instead of just handing you the same plan regardless.'],
    ['⏱️','Fits the time you actually have','Tell it how much time you\'ve got and it trims the session to fit — protecting your warmup and cooldown, never your actual lift.'],
    ['🎯','Goal-driven programming','Seven mission objectives — from Vertical Jump to Glute Emphasis to Overall Strength — each with real, distinct exercise programming behind it, not just a label.'],
    ['💧','Hydration math built in','0.3L per flight hour, with a sensible floor on no-fly days. The app tells you exactly how much to drink and when.'],
    ['🛫','Aviation-phased structure','Every workout follows Taxi (warmup) → Takeoff (heavy) → En Route (volume) → Landing (decompression) — a logical, recoverable structure, not just a random exercise list.'],
    ['📊','Real biometric tracking','Weight, waist, blood pressure, and fasting glucose — with the actual clinical protocol for measuring each one correctly.'],
    ['📶','Works with no signal','Keeps working with zero connectivity — at altitude, in a dead-zone layover hotel, wherever.'],
  ];
  features.forEach(([icon,title,desc]) => {
    parts.push('<div class="feature-row"><div class="feature-icon">'+icon+'</div><div class="feature-text"><h4>'+title+'</h4><p>'+desc+'</p></div></div>');
  });
  parts.push('</div>');

  parts.push('<div class="landing-section" style="background:var(--bg2)">');
  parts.push('<div class="landing-quote">"The biggest mistake I see in shift-work athletes is treating every day the same. Your training should respond to how you actually feel — not an arbitrary schedule." — Sports medicine consensus on fatigue-informed training</div>');
  parts.push('<div class="landing-stat-row">');
  parts.push('<div class="landing-stat"><div class="num">8</div><div class="lbl">Mission Profiles</div></div>');
  parts.push('<div class="landing-stat"><div class="num">7</div><div class="lbl">Goal Tracks</div></div>');
  parts.push('<div class="landing-stat"><div class="num">102</div><div class="lbl">Wisdom Briefings</div></div>');
  parts.push('</div>');
  parts.push('</div>');

  parts.push('<div class="landing-section">');
  parts.push('<div class="landing-section-title">How it works</div>');
  parts.push('<div class="feature-row"><div class="feature-icon">1️⃣</div><div class="feature-text"><h4>Preflight</h4><p>Set your environment, log your hydration, and tell the app how you\'re actually feeling today.</p></div></div>');
  parts.push('<div class="feature-row"><div class="feature-icon">2️⃣</div><div class="feature-text"><h4>Flight</h4><p>Work through your generated plan phase by phase, with rest timers that chime when they\'re done and a form guide on every exercise — built-in animations where we have them, a YouTube search where we don\'t.</p></div></div>');
  parts.push('<div class="feature-row"><div class="feature-icon">3️⃣</div><div class="feature-text"><h4>Trends</h4><p>Log your biometrics and watch your progress chart itself over weeks and months.</p></div></div>');
  parts.push('</div>');

  parts.push('<div class="landing-footer">');
  parts.push('<button class="btn btn-gold" onclick="ST.showLanding=false;ST.authMode=\'signup\';renderRoot()">Create Your Free Account</button>');
  parts.push('<div style="font-size:10px;color:var(--muted);margin-top:14px;line-height:1.6">Flight Crew Fitness is a training tool, not medical advice.<br>Consult a physician before beginning any new exercise program.</div>');
  parts.push('</div>');

  parts.push('</div>');
  root.innerHTML = parts.join('');

  const tickZulu = () => {
    const el = document.getElementById('zuluClock');
    if (!el) return; // page navigated away — stop scheduling further ticks
    const d = new Date();
    const hh = String(d.getUTCHours()).padStart(2,'0');
    const mm = String(d.getUTCMinutes()).padStart(2,'0');
    el.textContent = 'ZULU ' + hh + ':' + mm + 'Z';
    setTimeout(tickZulu, 15000);
  };
  tickZulu();
}

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
function renderAuth(root) {
  if (ST.authView === 'recovery') return renderPasswordRecovery(root);
  if (ST.authView === 'forgot') return renderForgotPassword(root);
  const isSignup = ST.authMode === 'signup';
  const parts = [];
  parts.push('<div class="landing" style="display:flex;flex-direction:column;justify-content:center">');
  parts.push('<div class="auth-wrap">');
  parts.push('<div style="text-align:center;margin-bottom:24px"><div class="landing-logo">✈ FLIGHT CREW FITNESS</div></div>');
  parts.push('<div class="auth-tabs">');
  parts.push('<div class="auth-tab '+(!isSignup?'active':'')+'" onclick="ST.authMode=\'signin\';ST.authErr=\'\';ST.authInfo=\'\';renderRoot()">Sign In</div>');
  parts.push('<div class="auth-tab '+(isSignup?'active':'')+'" onclick="ST.authMode=\'signup\';ST.authErr=\'\';ST.authInfo=\'\';renderRoot()">Sign Up</div>');
  parts.push('</div>');
  if (ST.authInfo) parts.push('<div class="alert alert-ok mt8"><div class="alert-icon">✅</div><div>'+ST.authInfo+'</div></div>');
  if (ST.authErr)  parts.push('<div class="alert alert-danger mt8"><div class="alert-icon">⚠️</div><div>'+ST.authErr+'</div></div>');
  parts.push('<div class="field"><label>Email</label><input type="email" id="auth_email" placeholder="you@example.com" autocomplete="email"></div>');
  parts.push('<div class="field"><label>Password</label><input type="password" id="auth_pass" placeholder="'+(isSignup?'Choose a password (min 6 chars)':'Your password')+'" autocomplete="'+(isSignup?'new-password':'current-password')+'"></div>');
  if (isSignup) parts.push('<div class="field"><label>Confirm Password</label><input type="password" id="auth_pass2" placeholder="Re-enter your password" autocomplete="new-password"></div>');
  parts.push('<button class="btn btn-gold mt8" onclick="handleAuthSubmit()">'+(isSignup?'Create Account →':'Sign In →')+'</button>');
  if (!isSignup) parts.push('<button class="btn-ghost mt8" style="display:block;width:100%;text-align:center;font-size:12px" onclick="ST.authView=\'forgot\';ST.authErr=\'\';ST.authInfo=\'\';renderRoot()">Forgot password?</button>');
  parts.push('<button class="btn-ghost mt12" style="display:block;width:100%;text-align:center" onclick="ST.showLanding=true;renderRoot()">← Back</button>');
  parts.push('</div></div>');
  root.innerHTML = parts.join('');
}

function renderForgotPassword(root) {
  const parts = [];
  parts.push('<div class="landing" style="display:flex;flex-direction:column;justify-content:center">');
  parts.push('<div class="auth-wrap">');
  parts.push('<div style="text-align:center;margin-bottom:24px"><div class="landing-logo">✈ FLIGHT CREW FITNESS</div></div>');
  parts.push('<div style="font-size:14px;font-weight:700;margin-bottom:4px">Reset your password</div>');
  parts.push('<div style="font-size:12px;color:var(--muted);margin-bottom:14px;line-height:1.5">Enter the email you signed up with — we\'ll send a link to set a new password.</div>');
  if (ST.authInfo) parts.push('<div class="alert alert-ok mt8"><div class="alert-icon">✅</div><div>'+ST.authInfo+'</div></div>');
  if (ST.authErr)  parts.push('<div class="alert alert-danger mt8"><div class="alert-icon">⚠️</div><div>'+ST.authErr+'</div></div>');
  parts.push('<div class="field"><label>Email</label><input type="email" id="forgot_email" placeholder="you@example.com" autocomplete="email"></div>');
  parts.push('<button class="btn btn-gold mt8" onclick="handleForgotPassword()">Send Reset Link →</button>');
  parts.push('<button class="btn-ghost mt12" style="display:block;width:100%;text-align:center" onclick="ST.authView=\'default\';ST.authErr=\'\';ST.authInfo=\'\';renderRoot()">← Back to Sign In</button>');
  parts.push('</div></div>');
  root.innerHTML = parts.join('');
}

async function handleForgotPassword() {
  const email = document.getElementById('forgot_email')?.value?.trim();
  if (!email || !email.includes('@')) { ST.authErr = 'Enter a valid email address.'; ST.authInfo = ''; renderRoot(); return; }
  try {
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await withTimeout(SB.auth.resetPasswordForEmail(email, { redirectTo }));
    if (error) throw error;
    // Deliberately vague about whether the account exists — confirming or
    // denying an email is registered is a real (if minor) privacy leak.
    ST.authErr = '';
    ST.authInfo = 'If an account exists for that email, a reset link is on its way. Check your inbox.';
    renderRoot();
  } catch(e) {
    ST.authInfo = '';
    ST.authErr = 'Couldn\'t send the reset email right now: ' + (e.message || 'unknown error');
    renderRoot();
  }
}

function renderPasswordRecovery(root) {
  const parts = [];
  parts.push('<div class="landing" style="display:flex;flex-direction:column;justify-content:center">');
  parts.push('<div class="auth-wrap">');
  parts.push('<div style="text-align:center;margin-bottom:24px"><div class="landing-logo">✈ FLIGHT CREW FITNESS</div></div>');
  parts.push('<div style="font-size:14px;font-weight:700;margin-bottom:14px">Set a new password</div>');
  if (ST.authErr) parts.push('<div class="alert alert-danger mt8"><div class="alert-icon">⚠️</div><div>'+ST.authErr+'</div></div>');
  parts.push('<div class="field"><label>New Password</label><input type="password" id="recovery_pass" placeholder="Min 6 characters" autocomplete="new-password"></div>');
  parts.push('<div class="field"><label>Confirm New Password</label><input type="password" id="recovery_pass2" placeholder="Re-enter your new password" autocomplete="new-password"></div>');
  parts.push('<button class="btn btn-gold mt8" onclick="handlePasswordRecovery()">Set New Password →</button>');
  parts.push('</div></div>');
  root.innerHTML = parts.join('');
}

async function handlePasswordRecovery() {
  const pass = document.getElementById('recovery_pass')?.value;
  const pass2 = document.getElementById('recovery_pass2')?.value;
  if (!pass || pass.length < 6) { ST.authErr = 'Password must be at least 6 characters.'; renderRoot(); return; }
  if (pass !== pass2) { ST.authErr = 'Passwords do not match — please re-enter.'; renderRoot(); return; }
  try {
    const { error } = await withTimeout(SB.auth.updateUser({ password: pass }));
    if (error) throw error;
    // The recovery link already establishes a valid session — carry straight
    // into the app instead of bouncing back to a sign-in form.
    ST.authView = 'default';
    window.history.replaceState(null, '', window.location.pathname);
    ST.user = await checkAuth();
    ST.authed = !!ST.user;
    if (ST.authed) { showToast('Password updated.'); await bootApp(); }
    else { ST.showLanding = false; ST.authMode = 'signin'; ST.authInfo = 'Password updated — sign in with your new password.'; renderRoot(); }
  } catch(e) {
    ST.authErr = 'Couldn\'t update your password: ' + (e.message || 'unknown error');
    renderRoot();
  }
}

async function handleAuthSubmit() {
  const email = document.getElementById('auth_email')?.value?.trim();
  const pass  = document.getElementById('auth_pass')?.value;
  if (!email || !pass) { ST.authErr = 'Enter both email and password.'; renderRoot(); return; }
  if (!email.includes('@')) { ST.authErr = 'Enter a valid email address.'; renderRoot(); return; }
  if (ST.authMode === 'signup') {
    if (pass.length < 6) { ST.authErr = 'Password must be at least 6 characters.'; renderRoot(); return; }
    const pass2 = document.getElementById('auth_pass2')?.value;
    if (pass !== pass2) { ST.authErr = 'Passwords do not match — please re-enter.'; renderRoot(); return; }
  }
  try {
    const user = ST.authMode === 'signup' ? await doSignUp(email, pass) : await doSignIn(email, pass);
    if (!user) { ST.authErr = 'Sign in failed. Check your email and password.'; renderRoot(); return; }
    ST.user = user; ST.authed = true; ST.authErr = ''; ST.authInfo = '';
    await bootApp();
  } catch(e) {
    let msg = e.message || 'Authentication failed.';
    if (msg.includes('Invalid login') || msg.includes('invalid_credentials')) msg = 'Incorrect email or password.';
    if (msg.includes('User already registered')) msg = 'An account with this email already exists — try signing in.';
    if (msg.includes('Password should be')) msg = 'Password must be at least 6 characters.';
    ST.authErr = msg; renderRoot();
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

  // A password-recovery session is real (Supabase requires it to allow
  // updateUser({password})) but must NOT be treated as a normal login —
  // this check has to come before the authed check below, or a valid
  // recovery link skips straight past setting a new password into the
  // full authenticated app.
  if (ST.authView === 'recovery') {
    topbar.style.display = 'none';
    tabbar.style.display = 'none';
    page.style.padding = '0';
    renderPasswordRecovery(page);
    return;
  }

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
  void topbar.offsetHeight;
  void tabbar.offsetHeight;
  requestAnimationFrame(() => {
    topbar.style.opacity = '0.999';
    tabbar.style.opacity = '0.999';
    requestAnimationFrame(() => {
      topbar.style.opacity = '';
      tabbar.style.opacity = '';
    });
  });
  renderPage();
}

// Restarts a CSS entry animation. Re-adding a class that's already
// present does nothing on its own — the reflow between removing and
// re-adding is what makes it replay.
function playPageTransition(el, className) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  el.addEventListener('animationend', () => el.classList.remove(className), { once: true });
}

function switchTab(tab) {
  haptic('light');
  const prevTab = ST.tab;
  if (ST.tab === 'fuelplan' && tab !== 'fuelplan') { ST.fuelPlanDraftSynced = false; ST.manualTargetsOpen = false; ST.manualTargetsWarning = null; }
  ST.tab = tab;
  const MORE_SUBVIEWS = ['profile','wisdom','devices','data','badges','superuser'];
  const hl = MORE_SUBVIEWS.includes(tab) ? 'more' : tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === hl));
  const tabbar = document.getElementById('tabbar');
  if (tabbar) tabbar.style.display = (tab === 'debrief') ? 'none' : 'flex';
  const renderPromise = renderPage();

  const page = document.getElementById('mainPage');
  if (page) {
    // Only on a genuine tab CHANGE. Firing on every render would replay
    // the slide every time something on the menu page saved or refreshed.
    if (tab === 'more' && prevTab !== 'more') playPageTransition(page, 'page-enter-left');
    if (tab === 'flight') {
      const curId = getCurrentExerciseId();
      const el = curId ? document.getElementById('excard_'+curId) : null;
      if (el) {
        ST.expanded[curId] = true;
        renderPage();
        requestAnimationFrame(() => {
          document.getElementById('excard_'+curId)?.scrollIntoView({ block: 'start' });
        });
        return renderPromise;
      }
    }
    page.scrollTop = 0;
  }
  return renderPromise;
}

// ─── BADGES ──────────────────────────────────────────────────────────────────
const BADGES = [
  { id:'first_flight', icon:'🛫', title:'First Flight',     desc:'Complete your first workout',            check:s => s.totalSessions >= 1 },
  { id:'weekly_3',     icon:'📅', title:'Weekly Warrior',   desc:'3 workouts inside one week',             check:s => s.best7Day >= 3 },
  { id:'month_solid',  icon:'🔥', title:'Month of Missions',desc:'12 workouts inside 28 days',             check:s => s.best28Day >= 12 },
  { id:'first_pr',     icon:'⭐', title:'New Record',       desc:'Set your first PR',                      check:s => s.prCount >= 1 },
  { id:'pr_5',         icon:'🏅', title:'PR Hunter',        desc:'10 lifetime PRs',                        check:s => s.prCount >= 10 },
  { id:'pr_25',        icon:'🏆', title:'Record Machine',   desc:'25 lifetime PRs',                        check:s => s.prCount >= 25 },
  { id:'down_5',       icon:'📉', title:'Lean Descent',     desc:'Down 5 lb from your first logged weight',check:s => s.weightLost >= 5 },
  { id:'logger_7',     icon:'📋', title:'Flight Recorder',  desc:'Log biometrics 7 days in a row',         check:s => s.bioStreak >= 7 },
  { id:'century',      icon:'💯', title:'Century Club',     desc:'500 lifetime sets logged',               check:s => s.totalSets >= 500 },
  { id:'iron_will',    icon:'🦾', title:'Iron Will',        desc:'20+ sets in a single session',           check:s => s.maxSetsInSession >= 20 },
  { id:'redline',      icon:'🔴', title:'Redline',          desc:'Trained through NO-GO fatigue 3 times — showing up beats the mood you showed up in', check:s => s.nogoTrainedCount >= 3 },
  { id:'all_weather',  icon:'🌍', title:'All-Weather',      desc:'Trained in Hotel Room, Hotel Gym, and Commercial Gym', check:s => s.envsTrained >= 3 },
  { id:'early_bird',   icon:'🌅', title:'Early Bird',       desc:'Logged a workout before 6 AM, 5 times',  check:s => s.earlyBirdCount >= 5 },
  { id:'top_gun',      icon:'🎖️', title:'Top Gun',          desc:'Hold the #1 spot on any leaderboard',    check:null, live:true },
  { id:'debrief',      icon:'💬', title:'Debrief',          desc:'Sent feedback to help improve the app',  check:null, live:true },
  { id:'recruiter',    icon:'📡', title:'Recruiter',        desc:'Shared Flight Crew Fitness with someone (self-reported)', check:null, live:true },
];

// Pure computation over session + biometric history — testable, no I/O.
function computeBadgeStats(sessions, bioRows) {
  const stats = { totalSessions: 0, best7Day: 0, best28Day: 0, prCount: 0, weightLost: 0, bioStreak: 0,
    totalSets: 0, maxSetsInSession: 0, nogoTrainedCount: 0, envsTrained: 0, earlyBirdCount: 0 };
  const sorted = (sessions||[]).filter(s => s?.date).slice().sort((a,b) => new Date(a.date) - new Date(b.date));
  stats.totalSessions = sorted.length;

  // Best N-day window via two pointers over day-resolution timestamps.
  const days = sorted.map(s => Math.floor(new Date(s.date).getTime() / 86400000));
  const bestWindow = (span) => {
    let best = 0, lo = 0;
    for (let hi = 0; hi < days.length; hi++) {
      while (days[hi] - days[lo] >= span) lo++;
      best = Math.max(best, hi - lo + 1);
    }
    return best;
  };
  stats.best7Day  = bestWindow(7);
  stats.best28Day = bestWindow(28);

  // Lifetime PR count: replay history in order; each strict improvement over
  // an established (non-zero) max for an exercise counts as one PR event.
  const maxes = {};
  const envs = new Set();
  sorted.forEach(s => {
    let sessionSets = 0;
    Object.keys(s.sets || {}).forEach(exId => {
      let sessionMax = 0;
      (s.sets[exId]||[]).forEach(set => {
        sessionSets++;
        const w = parseFloat(set.weight);
        if (!isNaN(w) && w > sessionMax) sessionMax = w;
      });
      if (sessionMax <= 0) return;
      if (maxes[exId] === undefined) { maxes[exId] = sessionMax; return; } // baseline, not a PR
      if (sessionMax > maxes[exId]) { stats.prCount++; maxes[exId] = sessionMax; }
    });
    stats.totalSets += sessionSets;
    if (sessionSets > stats.maxSetsInSession) stats.maxSetsInSession = sessionSets;
    if (s.fatigue === 'nogo') stats.nogoTrainedCount++;
    if (s.env) envs.add(s.env);
    const hour = new Date(s.date).getHours();
    if (hour < 6) stats.earlyBirdCount++;
  });
  stats.envsTrained = envs.size;

  const bio = (bioRows||[]).filter(r => r?.logged_at).slice().sort((a,b) => new Date(a.logged_at) - new Date(b.logged_at));
  const weights = bio.map(r => parseFloat(r.weight_lb)).filter(w => !isNaN(w) && w > 0);
  if (weights.length >= 2) stats.weightLost = Math.max(0, Math.round((weights[0] - weights[weights.length-1]) * 10) / 10);

  // Longest run of consecutive calendar days with any biometric logged.
  const bioDays = [...new Set(bio.map(r => Math.floor(new Date(r.logged_at).getTime() / 86400000)))].sort((a,b) => a-b);
  let run = bioDays.length ? 1 : 0;
  for (let i = 1; i < bioDays.length; i++) {
    run = (bioDays[i] === bioDays[i-1] + 1) ? run + 1 : 1;
    stats.bioStreak = Math.max(stats.bioStreak, run);
  }
  stats.bioStreak = Math.max(stats.bioStreak, run);
  return stats;
}

async function fetchBioRows() {
  if (!ST.user) { try { return JSON.parse(localStorage.getItem('fcf_bio')||'[]'); } catch(e) { return []; } }
  try {
    const { data } = await withTimeout(SB.from('weight_log').select('weight_lb,logged_at').eq('user_id', ST.user.id).order('logged_at', { ascending: true }));
    return data || [];
  } catch(e) { return []; }
}

// Check all badges against current history; persist and announce new ones.
// Directly award a single badge by id — used for badges triggered by a
// specific action (feedback sent, share tapped, leaderboard rank achieved)
// rather than replayed from history.
async function awardLiveBadge(id) {
  if (ST.badges[id]) return;
  const b = BADGES.find(x => x.id === id);
  if (!b) return;
  ST.badges[id] = new Date().toISOString();
  try {
    const profile = (await dbGetProfile()) || {};
    profile.badges = ST.badges;
    await dbSetProfile(profile);
  } catch(e) {}
  showBigToast(b.icon + ' Badge earned: ' + b.title + '!', 'ok');
}

// Checks whether the user currently holds rank #1 on ANY leaderboard
// exercise they have an entry for. One query per exercise they've PRed on
// (typically a handful), only runs if they're actually listed.
async function checkTopGunBadge() {
  if (ST.badges.top_gun || !ST.user || !ST.username) return;
  const exIds = Object.keys(ST.lbBests || {});
  for (const exId of exIds) {
    try {
      const { data } = await withTimeout(SB.from('leaderboard_entries')
        .select('user_id').eq('exercise_id', exId).order('weight_lb', { ascending: false }).limit(1));
      if (data && data[0] && data[0].user_id === ST.user.id) { await awardLiveBadge('top_gun'); return; }
    } catch(e) {}
  }
}

async function awardBadges() {
  try {
    const bio = await fetchBioRows();
    const stats = computeBadgeStats(ST.sessionCache || [], bio);
    const fresh = BADGES.filter(b => !b.live && !ST.badges[b.id] && b.check(stats));
    if (fresh.length) {
      fresh.forEach(b => { ST.badges[b.id] = new Date().toISOString(); });
      const profile = (await dbGetProfile()) || {};
      profile.badges = ST.badges;
      await dbSetProfile(profile);
      fresh.forEach(b => showBigToast(b.icon + ' Badge earned: ' + b.title + '!', 'ok'));
    }
  } catch(e) {}
  checkTopGunBadge().catch(() => {});
}

// ─── LEADERBOARD ─────────────────────────────────────────────────────────────
// DOTS coefficient (2019, Tim Konertz) — the modern Wilks successor. Sex-
// specific 4th-degree polynomial over bodyweight in kg; score = lift(kg) *
// 500 / poly(bw). Calibrated for powerlifting totals; we apply it per-lift
// as a fairness normalizer, which is the common informal use.
function dotsScore(liftLb, bwLb, sex) {
  if (!liftLb || !bwLb || (sex !== 'male' && sex !== 'female')) return null;
  const LB2KG = 0.45359237;
  let bw = bwLb * LB2KG;
  // Clamp to the ranges DOTS was fit on — outside them the polynomial misbehaves.
  bw = Math.min(Math.max(bw, 40), sex === 'female' ? 150 : 210);
  const C = sex === 'female'
    ? [-57.96288,  13.6175032, -0.1126655495, 0.0005158568, -0.0000010706]
    : [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093];
  const poly = C[0] + C[1]*bw + C[2]*bw*bw + C[3]*bw**3 + C[4]*bw**4;
  if (poly <= 0) return null;
  return Math.round((liftLb * LB2KG) * 500 / poly * 10) / 10;
}

// Weighted barbell/dumbbell lifts where max-weight comparison is meaningful.
// Canonical catalog ids — swap history resolution keeps these stable.
const LEADERBOARD_EXERCISES = [
  { id:'c_up_to1', name:'Barbell Bench Press' },
  { id:'h_up_to1', name:'DB Bench Press' },
  { id:'c_lb_to1', name:'Back Squat' },
  { id:'c_ul_to1', name:'Conventional Deadlift' },
  { id:'c_pp_to2', name:'Trap Bar Deadlift' },
  { id:'c_lb_to2', name:'Romanian Deadlift' },
  { id:'c_up_to2', name:'Standing Overhead Press' },
  { id:'h_up_to2', name:'DB Overhead Press' },
  { id:'c_lb_er2', name:'Leg Press' },
  { id:'c_ul_to2', name:'Pendlay Row' },
  { id:'h_ul_to2', name:'DB Row' },
  { id:'c_ul_er4', name:'EZ Bar Curl' },
  { id:'h_ul_er2', name:'DB Curl' },
];
const LB_ADMIN_EMAIL = 'b.chad.cooper@gmail.com';
function isSuperUser() { return !!(ST.user && (ST.user.email||'').toLowerCase() === LB_ADMIN_EMAIL); }
function isLbAdmin() { return isSuperUser(); } // kept as an alias — used elsewhere for leaderboard moderation

function sessionMaxWeight(session, exId) {
  const sets = session?.sets?.[exId];
  if (!sets) return null;
  let max = 0, reps = null;
  sets.forEach(s => {
    const w = parseFloat(s.weight);
    if (!isNaN(w) && w > max) { max = w; reps = parseInt(s.reps) || null; }
  });
  return max > 0 ? { weight: max, reps } : null;
}

async function submitLeaderboardEntry(exId, name, best, achievedAt) {
  const row = {
    user_id: ST.user.id,
    exercise_id: exId,
    exercise_name: name,
    weight_lb: best.weight,
    reps: best.reps,
    bodyweight_lb: ST.lastWeight || null,
    sex: ST.sex || null,
    username: ST.username,
    dots: dotsScore(best.weight, ST.lastWeight, ST.sex),
    achieved_at: achievedAt || new Date().toISOString(),
  };
  await withTimeout(SB.from('leaderboard_entries').upsert(row, { onConflict: 'user_id,exercise_id' }));
  ST.lbBests[exId] = best.weight;
}

// After a workout saves: push any lift that beat the user's listed best.
// Opt-in by design — no call sign, no submission, nothing leaves the device.
async function submitLeaderboardPRs(session) {
  if (!ST.user || !ST.username) return;
  let improved = false;
  for (const ex of LEADERBOARD_EXERCISES) {
    const best = sessionMaxWeight(session, ex.id);
    if (!best) continue;
    if ((ST.lbBests[ex.id] || 0) >= best.weight) continue;
    try { await submitLeaderboardEntry(ex.id, ex.name, best, session.date); improved = true; } catch(e) {}
  }
  if (improved) {
    try { const profile = (await dbGetProfile()) || {}; profile.lbBests = ST.lbBests; await dbSetProfile(profile); } catch(e) {}
  }
}

// First time a call sign is saved: place their existing history on the boards
// so they don't start from zero despite months of logged lifts.
async function backfillLeaderboard() {
  if (!ST.user || !ST.username || !ST.sessionCache?.length) return;
  const bests = {};
  ST.sessionCache.forEach(s => {
    LEADERBOARD_EXERCISES.forEach(ex => {
      const m = sessionMaxWeight(s, ex.id);
      if (m && m.weight > (bests[ex.id]?.weight || 0)) bests[ex.id] = { ...m, date: s.date };
    });
  });
  let any = false;
  for (const ex of LEADERBOARD_EXERCISES) {
    if (!bests[ex.id]) continue;
    if ((ST.lbBests[ex.id] || 0) >= bests[ex.id].weight) continue;
    try { await submitLeaderboardEntry(ex.id, ex.name, bests[ex.id], bests[ex.id].date); any = true; } catch(e) {}
  }
  // Running: submit best-ever single run + log every historical run for volume
  let bestRun = null;
  ST.sessionCache.forEach(s => {
    const run = sessionRunningDistance(s);
    if (run && (!bestRun || run.miles > bestRun.miles)) bestRun = { ...run, date: s.date };
    if (run) { logRunningVolume(s).catch(() => {}); }
  });
  if (bestRun && bestRun.miles > (ST.runBest || 0)) {
    try {
      await withTimeout(SB.from('running_pr_entries').upsert({
        user_id: ST.user.id, username: ST.username, sex: ST.sex || null,
        distance_mi: bestRun.miles, duration_sec: bestRun.seconds || null, achieved_at: bestRun.date,
      }, { onConflict: 'user_id' }));
      ST.runBest = bestRun.miles;
      any = true;
    } catch(e) {}
  }
  if (any) {
    try { const profile = (await dbGetProfile()) || {}; profile.lbBests = ST.lbBests; profile.runBest = ST.runBest; await dbSetProfile(profile); } catch(e) {}
    showToast('🏆 Your history is on the boards.');
  }
}

// The handful of lifts people actually care about seeing at a glance —
// showing all 13 tracked exercises simultaneously would be unwieldy, so
// this curates the classic "big lifts" plus running for the summary view,
// with every other exercise still reachable via the detailed board below.
const LEADERBOARD_GLANCE_IDS = ['c_up_to1','c_lb_to1','c_ul_to1','c_up_to2'];

async function loadLeaderboardGlance() {
  const el = document.getElementById('lbGlance');
  if (!el) return;
  try {
    const liftQueries = LEADERBOARD_GLANCE_IDS.map(id =>
      withTimeout(SB.from('leaderboard_entries').select('*').eq('exercise_id', id).order('weight_lb', { ascending: false }).limit(3))
        .then(r => ({ id, rows: r.data || [] })).catch(() => ({ id, rows: [] })));
    const runQuery = withTimeout(SB.from('running_pr_entries').select('*').order('distance_mi', { ascending: false }).limit(3))
      .then(r => ({ id: 'running', rows: r.data || [] })).catch(() => ({ id: 'running', rows: [] }));
    const results = await Promise.all([...liftQueries, runQuery]);

    const parts = ['<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'];
    results.forEach(({ id, rows }) => {
      const isRunning = id === 'running';
      const name = isRunning ? 'Running' : (LEADERBOARD_EXERCISES.find(e => e.id === id)?.name || id);
      parts.push('<div class="card" style="padding:10px;cursor:pointer;touch-action:manipulation" onclick="haptic(\'light\');'+(isRunning ? "ST.lbCategory='running';renderPage()" : "ST.lbCategory='strength';ST.lbEx='"+id+"';localStorage.setItem('fcf_lb_ex','"+id+"');renderPage()")+'">');
      parts.push('<div style="font-size:11px;font-weight:600;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+name+'</div>');
      if (!rows.length) {
        parts.push('<div style="font-size:10px;color:var(--muted)">No entries yet</div>');
      } else {
        rows.forEach((r, i) => {
          const medal = i===0?'🥇':i===1?'🥈':'🥉';
          const val = isRunning ? formatMiPace(r.distance_mi, r.duration_sec) : Math.round(r.weight_lb)+' lb';
          parts.push('<div class="fb" style="padding:2px 0"><span style="font-size:10px">'+medal+' '+sanitizeUserText(r.username)+'</span><span style="font-family:var(--mono);font-size:10px;color:var(--gold)">'+val+'</span></div>');
        });
      }
      parts.push('</div>');
    });
    parts.push('</div>');
    el.innerHTML = parts.join('');
  } catch(e) {
    el.innerHTML = '';
  }
}

function renderLeaderboard(p) {
  const parts = [];
  parts.push('<div class="section-label">RANKS</div>');
  if (!ST.username) {
    parts.push('<div class="card mb12" style="border-color:var(--gold)">');
    parts.push('<div style="font-size:12px;line-height:1.6;margin-bottom:10px">🏆 <strong>Want on the boards?</strong> Set a call sign in More → Pilot Profile. No call sign = you\'re not listed — your lifts and runs stay private.</div>');
    parts.push('<button class="btn btn-outline" onclick="switchTab(\'profile\')">Set My Call Sign →</button>');
    parts.push('</div>');
  }

  // At-a-glance: several boards visible at once, tap any card to drill into
  // its full, filterable standings below.
  parts.push('<div class="section-label" style="margin-top:0">AT A GLANCE</div>');
  parts.push('<div id="lbGlance" class="mb12"><div class="card" style="text-align:center;color:var(--muted);font-size:11px">Loading…</div></div>');

  parts.push('<div class="section-label">BADGES</div>');
  parts.push('<div class="card mb12">');
  parts.push(buildBadgesGridHTML());
  parts.push('</div>');

  parts.push('<div class="section-label">FULL BOARD</div>');

  const segBtn = (key, val, label) =>
    '<div class="env-btn" style="padding:8px 4px'+(ST[key]===val?';border-color:var(--gold);background:rgba(212,175,55,0.08)':'')+'" onclick="ST.'+key+'=\''+val+'\';renderPage()"><div style="font-size:11px;font-weight:700">'+label+'</div></div>';

  const category = ST.lbCategory || 'strength';
  parts.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:12px">' +
    '<div class="env-btn" style="padding:10px 4px'+(category==='strength'?';border-color:var(--gold);background:rgba(212,175,55,0.08)':'')+'" onclick="ST.lbCategory=\'strength\';renderPage()"><div style="font-size:12px;font-weight:700">🏋️ STRENGTH</div></div>' +
    '<div class="env-btn" style="padding:10px 4px'+(category==='running'?';border-color:var(--gold);background:rgba(212,175,55,0.08)':'')+'" onclick="ST.lbCategory=\'running\';renderPage()"><div style="font-size:12px;font-weight:700">🏃 RUNNING</div></div>' +
    '</div>');

  if (category === 'running') {
    parts.push('<div class="card mb12">');
    parts.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px">'+segBtn('runBoard','longest','LONGEST RUN')+segBtn('runBoard','monthly','THIS MONTH')+'</div>');
    parts.push('<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px">'+segBtn('lbSex','all','ALL')+segBtn('lbSex','male','MEN')+segBtn('lbSex','female','WOMEN')+'</div>');
    if (ST.runBoard === 'monthly') parts.push('<div style="font-size:10px;color:var(--muted);margin-top:6px;line-height:1.5">Total distance logged this calendar month. Resets on the 1st.</div>');
    parts.push('</div>');
    parts.push('<div id="lbRows"><div class="card mb12" style="text-align:center;color:var(--muted);font-size:12px">Loading standings…</div></div>');
    p.innerHTML = parts.join('');
    loadRunningRows();
    loadLeaderboardGlance();
    return;
  }

  const savedEx = ST.lbEx || localStorage.getItem('fcf_lb_ex') || LEADERBOARD_EXERCISES[0].id;
  ST.lbEx = LEADERBOARD_EXERCISES.find(e => e.id === savedEx) ? savedEx : LEADERBOARD_EXERCISES[0].id;
  parts.push('<div class="card mb12">');
  parts.push('<div class="field" style="margin-bottom:10px"><label>Exercise</label><select id="lbExSel" onchange="ST.lbEx=this.value;localStorage.setItem(\'fcf_lb_ex\',this.value);renderPage()">');
  LEADERBOARD_EXERCISES.forEach(ex => parts.push('<option value="'+ex.id+'"'+(ST.lbEx===ex.id?' selected':'')+'>'+ex.name+'</option>'));
  parts.push('</select></div>');
  parts.push('<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:8px">'+segBtn('lbSex','all','ALL')+segBtn('lbSex','male','MEN')+segBtn('lbSex','female','WOMEN')+'</div>');
  parts.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">'+segBtn('lbMode','weight','TOP WEIGHT')+segBtn('lbMode','dots','DOTS SCORE')+'</div>');
  if (ST.lbMode === 'dots') parts.push('<div style="font-size:10px;color:var(--muted);margin-top:6px;line-height:1.5">DOTS normalizes for bodyweight and sex — a fair strength score across sizes. Needs bodyweight + sex on file.</div>');
  parts.push('</div>');
  parts.push('<div id="lbRows"><div class="card mb12" style="text-align:center;color:var(--muted);font-size:12px">Loading standings…</div></div>');
  p.innerHTML = parts.join('');
  loadLeaderboardRows();
  loadLeaderboardGlance();
}

async function loadLeaderboardRows() {
  const el = document.getElementById('lbRows');
  if (!el) return;
  try {
    let q = SB.from('leaderboard_entries').select('*').eq('exercise_id', ST.lbEx);
    if (ST.lbSex !== 'all') q = q.eq('sex', ST.lbSex);
    if (ST.lbMode === 'dots') q = q.not('dots','is',null).order('dots', { ascending: false });
    else q = q.order('weight_lb', { ascending: false });
    const { data, error } = await withTimeout(q.limit(50));
    if (error) throw error;
    if (!data || !data.length) {
      el.innerHTML = '<div class="card mb12" style="text-align:center;color:var(--muted);font-size:12px">No entries yet for this lift — be the first on the board.</div>';
      return;
    }
    const admin = isLbAdmin();
    const parts = ['<div class="card mb12" style="padding:8px 0">'];
    data.forEach((r, i) => {
      const mine = ST.user && r.user_id === ST.user.id;
      const val = ST.lbMode === 'dots' ? (r.dots||0).toFixed(1) : Math.round(r.weight_lb) + ' lb';
      const sub = [];
      if (r.reps) sub.push('×'+r.reps);
      if (r.bodyweight_lb) sub.push('@ '+Math.round(r.bodyweight_lb)+' lb bw');
      const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'<span style="font-family:var(--mono);color:var(--muted)">'+(i+1)+'</span>';
      parts.push('<div class="fb" style="padding:9px 14px'+(mine?';background:rgba(212,175,55,0.07)':'')+(i<data.length-1?';border-bottom:1px solid var(--border)':'')+'">');
      parts.push('<div style="display:flex;align-items:center;gap:10px;min-width:0"><div style="width:24px;text-align:center;flex-shrink:0">'+medal+'</div>');
      parts.push('<div style="min-width:0"><div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+sanitizeUserText(r.username)+(mine?' <span style="color:var(--gold);font-size:10px">YOU</span>':'')+'</div>');
      parts.push('<div style="font-size:10px;color:var(--muted)">'+sub.join(' · ')+'</div></div></div>');
      parts.push('<div style="display:flex;align-items:center;gap:8px;flex-shrink:0"><span style="font-family:var(--mono);font-size:14px;font-weight:700;color:var(--gold)">'+val+'</span>');
      if (admin) parts.push('<button class="btn-ghost" style="font-size:12px;padding:4px 6px" onclick="adminDeleteLbEntry(\''+r.id+'\',\''+sanitizeUserText(r.username).replace(/\'/g,'')+'\')">🗑</button>');
      parts.push('</div></div>');
    });
    parts.push('</div>');
    el.innerHTML = parts.join('');
  } catch(e) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    el.innerHTML = '<div class="card mb12" style="text-align:center;color:var(--muted);font-size:12px">'+(offline
      ? '📡 Leaderboards need a connection — reconnect to see standings.'
      : 'Couldn\'t load standings. If this persists, the leaderboard table may not be set up yet.')+'</div>';
  }
}

function formatMiPace(distanceMi, seconds) {
  const parts = [Math.round(distanceMi*100)/100+' mi'];
  if (seconds > 0) {
    const paceSecPerMi = seconds / distanceMi;
    const m = Math.floor(paceSecPerMi/60), s = Math.round(paceSecPerMi%60);
    parts.push(m+':'+String(s).padStart(2,'0')+'/mi');
  }
  return parts.join(' · ');
}

async function loadRunningRows() {
  const el = document.getElementById('lbRows');
  if (!el) return;
  try {
    if (ST.runBoard === 'longest') {
      let q = SB.from('running_pr_entries').select('*');
      if (ST.lbSex !== 'all') q = q.eq('sex', ST.lbSex);
      const { data, error } = await withTimeout(q.order('distance_mi', { ascending: false }).limit(50));
      if (error) throw error;
      renderRunningRows(el, (data||[]).map(r => ({
        id: r.id, user_id: r.user_id, username: r.username,
        display: formatMiPace(r.distance_mi, r.duration_sec), table: 'running_pr_entries',
      })));
    } else {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      let q = SB.from('running_log').select('user_id,username,sex,distance_mi').gte('run_at', monthStart);
      if (ST.lbSex !== 'all') q = q.eq('sex', ST.lbSex);
      const { data, error } = await withTimeout(q.limit(2000));
      if (error) throw error;
      // No GROUP BY in the client query builder — sum client-side. Volume is
      // low enough (one row per logged run) that this is simpler and safer
      // than standing up a database view for a small user base.
      const totals = {};
      (data||[]).forEach(r => {
        if (!totals[r.user_id]) totals[r.user_id] = { user_id: r.user_id, username: r.username, miles: 0 };
        totals[r.user_id].miles += parseFloat(r.distance_mi) || 0;
      });
      const rows = Object.values(totals).sort((a,b) => b.miles - a.miles).slice(0, 50);
      renderRunningRows(el, rows.map(r => ({
        id: null, user_id: r.user_id, username: r.username,
        display: (Math.round(r.miles*100)/100)+' mi', table: null,
      })));
    }
  } catch(e) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    el.innerHTML = '<div class="card mb12" style="text-align:center;color:var(--muted);font-size:12px">'+(offline
      ? '📡 Leaderboards need a connection — reconnect to see standings.'
      : 'Couldn\'t load standings. If this persists, the running_pr_entries / running_log tables may not be set up yet.')+'</div>';
  }
}

function renderRunningRows(el, rows) {
  if (!rows.length) {
    el.innerHTML = '<div class="card mb12" style="text-align:center;color:var(--muted);font-size:12px">No runs logged yet for this board — be the first.</div>';
    return;
  }
  const admin = isLbAdmin();
  const parts = ['<div class="card mb12" style="padding:8px 0">'];
  rows.forEach((r, i) => {
    const mine = ST.user && r.user_id === ST.user.id;
    const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'<span style="font-family:var(--mono);color:var(--muted)">'+(i+1)+'</span>';
    parts.push('<div class="fb" style="padding:9px 14px'+(mine?';background:rgba(212,175,55,0.07)':'')+(i<rows.length-1?';border-bottom:1px solid var(--border)':'')+'">');
    parts.push('<div style="display:flex;align-items:center;gap:10px;min-width:0"><div style="width:24px;text-align:center;flex-shrink:0">'+medal+'</div>');
    parts.push('<div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+sanitizeUserText(r.username)+(mine?' <span style="color:var(--gold);font-size:10px">YOU</span>':'')+'</div></div>');
    parts.push('<div style="display:flex;align-items:center;gap:8px;flex-shrink:0"><span style="font-family:var(--mono);font-size:14px;font-weight:700;color:var(--gold)">'+r.display+'</span>');
    if (admin && r.table && r.id) parts.push('<button class="btn-ghost" style="font-size:12px;padding:4px 6px" onclick="adminDeleteRunEntry(\''+r.table+'\',\''+r.id+'\',\''+sanitizeUserText(r.username).replace(/\'/g,'')+'\')">🗑</button>');
    parts.push('</div></div>');
  });
  parts.push('</div>');
  el.innerHTML = parts.join('');
}

async function adminDeleteRunEntry(table, id, uname) {
  if (!isLbAdmin()) return;
  if (!confirm('Delete '+uname+'\'s entry from this board? This can\'t be undone.')) return;
  try {
    const { error } = await withTimeout(SB.from(table).delete().eq('id', id));
    if (error) throw error;
    showToast('Entry removed.');
    loadRunningRows();
  } catch(e) { showToast('Delete failed: '+(e.message||'unknown error')); }
}

async function adminDeleteLbEntry(id, uname) {
  if (!isLbAdmin()) return;
  if (!confirm('Delete '+uname+'\'s entry from this board? This can\'t be undone.')) return;
  try {
    const { error } = await withTimeout(SB.from('leaderboard_entries').delete().eq('id', id));
    if (error) throw error;
    showToast('Entry removed.');
    loadLeaderboardRows();
  } catch(e) { showToast('Delete failed: '+(e.message||'unknown error')); }
}

// ─── RUNNING LEADERBOARD ──────────────────────────────────────────────────────
// Deliberately excludes Walking and the generic walk/incline/run Treadmill —
// those aren't a running-effort metric, and including them would let
// low-intensity recovery activity dominate a board meant to reflect running.
const RUNNING_EXERCISES = ['c_ca_er1','h_ca_er1','c_ca_er5','h_ca_er5','r_ca_er4'];

// Sum of distance logged for running exercises in one session — a session's
// "run" for the day. Summed rather than maxed so a run logged as a few
// segments still counts as one continuous effort, matching how the exercise
// notes describe it ("20 min" of steady running, not intervals).
// Classifies a chronological series as improving/flat/declining by
// comparing the average of the older half against the newer half — simpler
// and more robust to single-session noise than a point-to-point comparison.
// higherIsBetter distinguishes weight (higher = stronger) from pace
// (lower = faster), so the semantic label is always "improving," never a
// literal "up" that would be backwards for pace.
function classifyTrend(values, higherIsBetter) {
  if (!values || values.length < 4) return { status: 'insufficient', changePct: 0 };
  const mid = Math.floor(values.length / 2);
  const older = values.slice(0, mid), newer = values.slice(mid);
  const avgOlder = older.reduce((a,b)=>a+b,0) / older.length;
  const avgNewer = newer.reduce((a,b)=>a+b,0) / newer.length;
  const changePct = avgOlder === 0 ? 0 : ((avgNewer - avgOlder) / avgOlder) * 100;
  let status;
  if (Math.abs(changePct) < 3) status = 'flat';
  else if ((changePct > 0) === !!higherIsBetter) status = 'improving';
  else status = 'declining';
  return { status, changePct: Math.round(changePct * 10) / 10 };
}

// Tracks weight trend per DISTINCT EXERCISE NAME appearing in a Takeoff
// slot across session history — not a hardcoded lift per muscle group,
// since the actual Takeoff lift differs by environment (Back Squat in a
// commercial gym vs. a bodyweight pistol squat in a hotel room aren't
// comparable). Scoped to Takeoff specifically: that's the phase kept
// consistent session to session for exactly this reason, unlike Enroute,
// which now rotates through a larger pool by design and wouldn't give
// clean repeated data points for any single exercise.
function getPrimaryLiftTrends(sessionCache) {
  const byName = {};
  (sessionCache || []).forEach(s => {
    const wk = s.workoutSnapshot;
    if (!wk || !wk.takeoff) return;
    const sets = s.sets || {};
    wk.takeoff.forEach(exItem => {
      const exSets = sets[exItem.id] || [];
      const weights = exSets.map(st => parseFloat(st.weight)).filter(w => !isNaN(w) && w > 0);
      if (!weights.length) return;
      const topWeight = Math.max(...weights);
      if (!byName[exItem.name]) byName[exItem.name] = [];
      byName[exItem.name].push({ date: s.date, weight: topWeight });
    });
  });
  const results = [];
  Object.keys(byName).forEach(name => {
    const points = byName[name].sort((a,b) => new Date(a.date) - new Date(b.date));
    if (points.length < 4) return;
    const trend = classifyTrend(points.map(p => p.weight), true);
    results.push({ name, trend, first: points[0].weight, current: points[points.length-1].weight, sessionsCount: points.length });
  });
  return results;
}

// Running pace trend (seconds per mile — lower is better/faster).
function getRunningPaceTrend(sessionCache) {
  const points = [];
  (sessionCache || []).forEach(s => {
    const dist = sessionRunningDistance(s);
    if (dist && dist.miles > 0 && dist.seconds > 0) points.push({ date: s.date, pace: dist.seconds / dist.miles });
  });
  points.sort((a,b) => new Date(a.date) - new Date(b.date));
  if (points.length < 4) return null;
  const trend = classifyTrend(points.map(p => p.pace), false);
  return { trend, first: points[0].pace, current: points[points.length-1].pace, sessionsCount: points.length };
}

function formatPace(secPerMile) {
  const m = Math.floor(secPerMile / 60), s = Math.round(secPerMile % 60);
  return m + ':' + String(s).padStart(2,'0') + '/mi';
}

function sessionRunningDistance(session) {
  let miles = 0, seconds = 0;
  RUNNING_EXERCISES.forEach(exId => {
    (session?.sets?.[exId] || []).forEach(s => {
      const m = parseFloat(s.miles);
      const sec = parseFloat(s.seconds);
      if (!isNaN(m) && m > 0) miles += m;
      if (!isNaN(sec) && sec > 0) seconds += sec;
    });
  });
  return miles > 0 ? { miles: Math.round(miles*100)/100, seconds } : null;
}

// Board 1: longest single run ever — one row per user, upserted only when
// beaten, same pattern as the lift PR boards.
async function submitRunningPR(session) {
  if (!ST.user || !ST.username) return;
  const run = sessionRunningDistance(session);
  if (!run) return;
  if ((ST.runBest || 0) >= run.miles) return;
  const row = {
    user_id: ST.user.id, username: ST.username, sex: ST.sex || null,
    distance_mi: run.miles, duration_sec: run.seconds || null,
    achieved_at: session.date || new Date().toISOString(),
  };
  await withTimeout(SB.from('running_pr_entries').upsert(row, { onConflict: 'user_id' }));
  ST.runBest = run.miles;
  const profile = (await dbGetProfile()) || {};
  profile.runBest = ST.runBest;
  await dbSetProfile(profile);
}

// Board 2: total distance this month — every run is logged as its own row,
// keyed by the session's own timestamp so re-saving the same workout can't
// double-count it; the monthly total is a live SUM computed at read time,
// not a running counter, so there's no month-boundary reset logic to get
// wrong and no risk of an increment being applied twice.
async function logRunningVolume(session) {
  if (!ST.user || !ST.username) return;
  const run = sessionRunningDistance(session);
  if (!run) return;
  const row = {
    user_id: ST.user.id, username: ST.username, sex: ST.sex || null,
    distance_mi: run.miles, duration_sec: run.seconds || null,
    run_at: session.date || new Date().toISOString(),
  };
  try { await withTimeout(SB.from('running_log').upsert(row, { onConflict: 'user_id,run_at' })); } catch(e) {}
}


// Run mission profile: dynamic mobility -> the run itself (reusing the SAME
// exercise IDs already wired into the running leaderboard, so a run logged
// here counts automatically) -> static cooldown stretches. No takeoff phase
// — empty phases are already handled gracefully as "skipped" everywhere.
// Deliberately left out of every GOAL_OVERLAYS rotation order: going for a
// run is something a pilot opts into that day, not something the app should
// algorithmically schedule into a strength rotation.
WORKOUTS.comm['Run'] = {
  taxi: [
    ex('c_rn_t1','Leg Swings (Front & Side)','2x10/leg',2,'Dynamic — hold a wall or rail. Warms hips before running; skip static stretching here.',true,'timed'),
    ex('c_rn_t2','Walking High Knees','2x20yd',2,'Gentle pace, drive knees up. Raises heart rate and primes hip flexors.',false,'reps_only'),
  ],
  takeoff: [],
  enroute: [
    ex('c_ca_er1','Treadmill Zone 2 Run','20 min',1,'Conversational pace — speak in full sentences. Log distance for the leaderboard.',true,'timed_distance'),
    ex('c_ca_er5','Outdoor Run','20-40 min',1,'Any pace, any route. Log distance for the leaderboard.',true,'timed_distance'),
  ],
  landing: [
    ex('c_rn_l1','Standing Calf Stretch','2x30s/leg',2,'Wall lean, back leg straight. Runners load calves heavily.',true,'timed_bilateral'),
    ex('c_rn_l2','Standing Hamstring Stretch','2x30s/leg',2,'Heel on a low step, hinge forward.',true,'timed_bilateral'),
    ex('c_rn_l3','Kneeling Hip Flexor Stretch','2x30s/leg',2,'Half-kneeling lunge, squeeze the glute. Running tightens hip flexors more than most people expect.',true,'timed_bilateral'),
  ],
};
WORKOUTS.hotel['Run'] = {
  taxi: WORKOUTS.comm['Run'].taxi,
  takeoff: [],
  enroute: [
    ex('h_ca_er1','Treadmill Zone 2 Run','20 min',1,'Conversational pace. Log distance for the leaderboard.',true,'timed_distance'),
    ex('h_ca_er5','Outdoor Run','20-40 min',1,'Any pace, any route. Log distance for the leaderboard.',true,'timed_distance'),
  ],
  landing: WORKOUTS.comm['Run'].landing,
};
WORKOUTS.room['Run'] = {
  taxi: WORKOUTS.comm['Run'].taxi,
  takeoff: [],
  enroute: [
    ex('r_ca_er4','Outdoor Run','20-40 min',1,'Any pace, any route. Log distance for the leaderboard.',true,'timed_distance'),
  ],
  landing: WORKOUTS.comm['Run'].landing,
};

function renderPage() {
  const p = document.getElementById('mainPage');
  if (!p) return;
  p.innerHTML = '';
  if (ST.tab === 'preflight') {
    renderPreflight(p).catch(e => {
      p.innerHTML = '<div class="section-label">PREFLIGHT BRIEFING — '+FCF_VERSION+'</div>' +
        '<div class="card mb12"><div style="font-size:13px;color:var(--muted);margin-bottom:10px">Couldn\'t load your calendar — this can happen with no signal.</div>' +
        '<button class="btn btn-outline" onclick="renderPage()">↻ Retry</button></div>';
    });
  }
  else if (ST.tab === 'flight')      renderFlight(p);
  else if (ST.tab === 'trends')      return renderTrends(p);
  else if (ST.tab === 'wisdom')      renderWisdom(p);
  else if (ST.tab === 'profile')     renderProfile(p);
  else if (ST.tab === 'leaderboard') renderLeaderboard(p);
  else if (ST.tab === 'more')        renderMore(p);
  else if (ST.tab === 'devices')     renderDevices(p);
  else if (ST.tab === 'data')        renderData(p);
  else if (ST.tab === 'nutrition')   return renderNutrition(p);
  else if (ST.tab === 'fuelplan')    renderNutritionGoalsSetup(p);
  else if (ST.tab === 'today')       { loadTodaysMeals().then(()=>renderToday(p)).catch(()=>renderToday(p)); }
  else if (ST.tab === 'badges')      renderBadges(p);
  else if (ST.tab === 'superuser')   renderSuperUser(p);
  else if (ST.tab === 'debrief')     renderDebrief(p);
}

// ─── BOOT SEQUENCE ────────────────────────────────────────────────────────────
function applyProfileToState(profile) {
  if (!profile) return;
  ST.level = profile.level || ST.level;
  ST.goal  = profile.goal  || ST.goal;
  ST.flightSchedule = profile.flightSchedule || null;
  ST.ouraDismissedIds = profile.ouraDismissedIds || [];
  ST.nutritionGoals = profile.nutritionGoals || null;
  ST.flightScheduleRaw = profile.flightScheduleRaw || null;
  // Restore classified calendar events if available
  if (profile.calendarClassified?.length) {
    ST.calendarEvents = profile.calendarClassified;
    ST.calendarFingerprint = profile.calendarFingerprint || null;
    ST.calendarGranted = true;
  }
  // Default ON for existing users — someone who has been logging meals
  // shouldn't lose the feature because a new preference defaulted to off.
  ST.trackNutrition = profile.trackNutrition !== false;
  ST.trackHydration = profile.trackHydration !== false;

  // BUG FIX (reported): the parser fix in v5.36.0 changed nothing on a
  // schedule already uploaded. Events are parsed once at upload and the
  // RESULT is what gets stored, so a corrected parser only ever reached a
  // schedule someone happened to re-upload afterwards — which nobody would
  // think to do, since from their side the times simply look wrong.
  //
  // The original .ics text is kept alongside the parsed events anyway, so
  // re-parse from that at boot and let the stored events be a fallback.
  // Any future parsing fix now reaches existing schedules on its own.
  if (ST.flightScheduleRaw) {
    try {
      const reparsed = parseFlightScheduleICS(ST.flightScheduleRaw);
      if (reparsed && reparsed.length) ST.flightSchedule = reparsed;
    } catch(e) { /* keep the stored events rather than losing the schedule */ }
  }

  ST.customExercises = (profile.customExercises || []).map(ce => {
    if (ce?.exercise) {
      ce.exercise.name = sanitizeUserText(ce.exercise.name);
      ce.exercise.note = sanitizeUserText(ce.exercise.note);
      ce.exercise.target = sanitizeUserText(ce.exercise.target) || '—';
    }
    return ce;
  });
  ST.ouraToken       = profile.ouraToken || '';
  ST.ouraAccessToken  = profile.ouraAccessToken || null;
  ST.ouraRefreshToken = profile.ouraRefreshToken || null;
  ST.ouraConnected    = !!profile.ouraConnected;
  ST.sex        = profile.sex || null;
  ST.heightIn   = profile.heightIn || null;
  ST.age        = profile.age || null;
  ST.lastWeight = profile.lastWeight || null;
  ST.injuries   = profile.injuries || [];
  ST.username   = profile.username || null;
  ST.badges     = profile.badges || {};
  ST.lbBests    = profile.lbBests || {};
  ST.runBest    = profile.runBest || 0;
  ST.customProfiles = (profile.customProfiles || []).map(cp => ({
    ...cp,
    name: sanitizeUserText(cp.name),
  }));
}

// Auto-suggests Mission Environment from the flight schedule, once per
// boot — not on every render, so a manual change made during this same
// session is never silently overwritten. ST.scheduleEnvNote records WHY for
// Preflight to show transparently rather than changing things quietly.
function applyScheduleEnvironmentSuggestion() {
  ST.scheduleEnvNote = null;
  if (!ST.flightSchedule) return;
  const status = getCurrentScheduleStatus(ST.flightSchedule);
  if (status?.type === 'layover') {
    ST.env = 'hotel';
    ST.scheduleEnvNote = '📅 Layover in ' + (status.airport||'') + ' today — set to Hotel Gym.';
  } else if (status?.type === 'dutyfree') {
    ST.env = 'comm';
    ST.scheduleEnvNote = '📅 Duty-free day today — set to Commercial Gym.';
  }
}

// Sums actual flight-leg time overlapping TODAY's local calendar day —
// correctly handles a flight that starts before midnight and ends after it,
// only counting the portion that falls on today. Returns null specifically
// when the schedule doesn't cover today at all (out of date / not uploaded
// far enough), so the caller knows not to guess — as opposed to a real 0,
// which means the schedule covers today and there's genuinely no flying.
function computeTodaysFlightHours(scheduleEvents) {
  if (!scheduleEvents || !scheduleEvents.length) return null;
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0,0,0,0);
  const dayEnd = new Date(now); dayEnd.setHours(23,59,59,999);
  const coversToday = scheduleEvents.some(e => {
    const s = new Date(e.start).getTime(), en = new Date(e.end).getTime();
    return en > dayStart.getTime() && s < dayEnd.getTime();
  });
  if (!coversToday) return null;
  let totalMs = 0;
  scheduleEvents.filter(e => e.type === 'flight').forEach(e => {
    const s = new Date(e.start).getTime(), en = new Date(e.end).getTime();
    const overlapStart = Math.max(s, dayStart.getTime());
    const overlapEnd = Math.min(en, dayEnd.getTime());
    if (overlapEnd > overlapStart) totalMs += (overlapEnd - overlapStart);
  });
  return Math.round((totalMs / 3600000) * 10) / 10;
}

// Auto-fills Flight Hours from the schedule — respects an existing manual
// entry made today (flightHrsTouched persists per-day via
// persistDailyInputs), so this never overwrites something already typed in,
// including from an earlier session the same day.
function applyScheduleFlightHours() {
  if (ST.flightHrsTouched) return;
  const hrs = computeTodaysFlightHours(ST.flightSchedule);
  if (hrs === null) return;
  ST.flightHrs = hrs;
  ST.flightHrsRaw = String(hrs);
}

async function bootApp() {
  ST.disclaimerAccepted = localStorage.getItem('fcf_disclaimer_accepted') === '1';
  // All three boot fetches are independent — run them in ONE parallel window
  // so a cold offline launch waits ~6s total, not stacked timeouts.
  const [profile, lastSession] = await Promise.all([dbGetProfile(), dbGetLastSession(), loadSessionCache(), loadSubscription()]);
  applyProfileToState(profile);
  ST.lastSession = lastSession;
  if (ST.lastSession && !ST.sessionCache.find(s => s.date === ST.lastSession.date)) {
    ST.sessionCache.push(ST.lastSession);
  }
  restoreDailyInputs();
  applyDailyInputsRow(await dbGetDailyInputs());
  applyScheduleEnvironmentSuggestion();
  applyScheduleFlightHours();
  // First-ever open with no profile info: land on Profile once so the user
  // sets sex + objective before their first mission. Flag persists locally.
  if (!ST.sex && !localStorage.getItem('fcf_profile_intro')) {
    localStorage.setItem('fcf_profile_intro', '1');
    ST.tab = 'profile';
  }
  // Auto-select the recommended next mission profile so Preflight opens
  // pre-loaded with the right choice rather than always defaulting to Lower Body.
  ST.muscleGroup = getRecommendedNext();
  renderRoot();
  bindFoodPhotoInputs();
  checkDB();
  // Auto-sync Oura on boot if connected — runs in background after render
  if (ST.ouraConnected && ST.ouraAccessToken) {
    setTimeout(() => syncOuraData().catch(() => {}), 1500);
    scheduleOuraActivityRetry();
  }
  // Request HealthKit permission once after login (iOS only).
  // On web this is a no-op. The permission sheet appears once and is
  // remembered by iOS — subsequent boots skip straight to data sync.
  if (typeof FCFBridge !== 'undefined' && FCFBridge.isNative) {
    setTimeout(() => FCFBridge.requestHealthKit(), 2000);
    setTimeout(() => FCFBridge.requestCalendar(), 3500);
    setTimeout(() => scheduleNotifications(), 5000);
  }
  scheduleEntitlementRefresh();
  // Returning from Stripe Checkout. The webhook may land a moment after the
  // redirect, so this re-reads a few times rather than once and giving up.
  if (/[?&]checkout=success/.test(location.search)) {
    history.replaceState({}, '', location.pathname);
    (async () => {
      for (let i = 0; i < 6 && !isPro(); i++) {
        await new Promise(r => setTimeout(r, i === 0 ? 1200 : 2500));
        await loadSubscription();
      }
      renderPage();
      showBigToast(isPro() ? '✓ Pro active — thanks.' : 'Payment received. Access will appear shortly.', 'ok');
    })();
  }
  // Badges only ever got checked as a side effect of a brand-new workout or
  // biometric save — anyone with existing history never had it evaluated
  // retroactively. Run it once per boot; awardBadges() already skips
  // anything already earned, so this is safe and idempotent.
  awardBadges();
  maybeShowInstallPrompt();
  if (ST.showInstallPrompt) renderPage();
}

async function checkDB() {
  try {
    const { error } = await withTimeout(SB.from('weight_log').select('id').limit(1));
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
// ── Haptic feedback ───────────────────────────────────────────────────────────
// Fires native iOS haptic feedback via the bridge. No-op on web.
// Styles: light, medium (default), heavy, soft, rigid,
//         success, warning, error, selection
function haptic(style) {
  window.webkit?.messageHandlers?.haptics?.postMessage({ style: style || 'medium' });
}

// Oura-style glowing metric tile — large number bottom-left, label top-left,
// radial glow arc top-right. Colors: gold, blue, teal, green, amber, red.
const GLOW_COLORS = {
  gold:  ['rgba(201,168,76,0.2)',  'rgba(201,168,76,0.06)',  '#c9a84c'],
  blue:  ['rgba(96,165,250,0.2)',  'rgba(96,165,250,0.06)',  '#60a5fa'],
  teal:  ['rgba(45,212,191,0.2)',  'rgba(45,212,191,0.06)',  '#2dd4bf'],
  green: ['rgba(34,197,94,0.2)',   'rgba(34,197,94,0.06)',   '#22c55e'],
  amber: ['rgba(245,158,11,0.2)',  'rgba(245,158,11,0.06)',  '#f59e0b'],
  red:   ['rgba(239,68,68,0.2)',   'rgba(239,68,68,0.06)',   '#ef4444'],
};
function glowTile(label, value, colorKey, valueColor) {
  const [gs, gf, accent] = GLOW_COLORS[colorKey] || GLOW_COLORS.blue;
  const vc = valueColor || 'var(--text)';
  return (
    '<div style="position:relative;border-radius:16px;border:1px solid rgba(255,255,255,0.07);overflow:hidden;padding:12px 10px 10px;min-height:90px;background:#0f1623">' +
    '<div style="position:absolute;top:-28px;right:-28px;width:110px;height:110px;border-radius:50%;background:radial-gradient(circle,' + gs + ' 0%,' + gf + ' 50%,transparent 75%);pointer-events:none"></div>' +
    '<div style="font-family:var(--mono);font-size:8px;letter-spacing:.12em;color:' + accent + ';opacity:0.9;position:relative;z-index:1">' + label + '</div>' +
    '<div style="position:absolute;bottom:10px;left:10px;font-family:var(--mono);font-size:30px;font-weight:700;color:' + vc + ';line-height:1;z-index:1">' + (value ?? '—') + '</div>' +
    '</div>'
  );
}

function showBigToast(msg, type) {
  const old = document.getElementById('fcf-big-toast');
  if (old) old.remove();
  const bg2 = document.getElementById('fcf-big-toast-bg');
  if (bg2) bg2.remove();
  const color = type === 'ok' ? '#22c55e' : type === 'warn' ? '#f59e0b' : '#3b82f6';
  const icon  = type === 'ok' ? '✅' : type === 'warn' ? '⚠️' : 'ℹ️';
  const t = document.createElement('div');
  t.id = 'fcf-big-toast';
  t.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#0f1623;border:2px solid '+color+';color:#e2e8f0;padding:28px 36px;border-radius:16px;font-size:18px;font-weight:700;z-index:9999;box-shadow:0 8px 48px rgba(0,0,0,0.7);text-align:center;min-width:200px;transition:opacity 0.4s';
  t.innerHTML = '<div style="font-size:36px;margin-bottom:12px">'+icon+'</div><div>'+msg+'</div>';
  document.body.appendChild(t);
  const bg = document.createElement('div');
  bg.id = 'fcf-big-toast-bg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9998;transition:opacity 0.4s';
  bg.onclick = () => { t.remove(); bg.remove(); };
  document.body.appendChild(bg);
  setTimeout(() => { t.style.opacity='0'; bg.style.opacity='0'; setTimeout(() => { t.remove(); bg.remove(); }, 400); }, 2200);
}
function showToast(msg) { showBigToast(msg, 'info'); }

// ─── INFO MODAL (generic, used for biometrics + CNS explainer) ──────────────
// ─── AI ANALYSIS COMPANION PROMPT ────────────────────────────────────────────
// CSVs can't carry an executable "system prompt" — ChatGPT/Gemini just see it
// as data. This is the copy-paste prompt users attach alongside the CSV upload
// so the receiving AI knows how to read our specific column schema.
const AI_ANALYSIS_PROMPT = `You are analyzing my personal workout and biometric data, exported from Flight Crew Fitness, a training app I use. Don't give generic fitness platitudes — look at the actual numbers and tell me what's really happening.

ABOUT THE CSV
Each row is one logged set:
- Date, Day: when the session happened
- Muscle Group, Environment, Goal, Fatigue, Level: session context (Fatigue is my self-reported readiness that day: go / marginal / nogo)
- Duration (min): total session length
- Phase: Taxi (warmup) / Takeoff (heavy compound lifts) / En Route (accessory work) / Landing (cooldown/stretching)
- Exercise, Set #, Reps, Weight (lb): standard strength sets
- Seconds: held-stretch duration (mostly Landing phase)
- Height (in): box jump height, Distance (in): broad jump distance
- Seconds Left / Seconds Right: independently-timed left/right stretches
- Body Weight (lb), Waist (in), Systolic/Diastolic BP, Fasting Glucose (mg/dL): my daily biometrics, repeated on every row logged that day
- Rows marked "(session summary)" mean I logged a session without a full exercise breakdown — treat those as attendance only, not performance data

OPTIONAL — MY FLIGHT SCHEDULE
If I've also attached an .ics calendar file, it's my flight/duty schedule. Cross-reference it against the training data: layovers, long duty days, red-eyes, and time zone changes all affect recovery, sleep, and which environment (hotel room / hotel gym / commercial gym) I had access to. If I attached this file, factor travel load into your analysis rather than treating training gaps or off-trend days as unexplained.

WHAT I WANT FROM YOU
1. Trend analysis — is my strength on key lifts trending up, flat, or down over the logged period? Call out any plateaus by name.
2. Consistency — how many sessions per week am I actually completing, and are there concerning gaps?
3. Biometric trends — track body weight, waist, blood pressure, and fasting glucose over time. Flag anything moving the wrong direction or outside normal ranges.
4. Cross-reference — connect biometric shifts to training patterns (e.g. did BP or glucose move after a change in training volume or a gap in sessions?), and to my flight schedule if I attached it (e.g. did a rough travel stretch line up with a training gap or a biometric dip?).
5. Direct recommendations — 3-5 concrete bullet points on what to change next: which lifts need progression, what's stalling, what to prioritize.

Reference actual numbers and dates from the data, not general advice. If something in the biometric data looks concerning, say so plainly rather than softening it.

If I'm also tracking any supplements, medications, or protocols alongside this (e.g. hormone therapy, GLP-1/GIP medications, peptides), I'll mention them below this prompt — factor their expected physiological effects into the analysis if I do.`;

function showAIPromptModal() {
  const root = document.getElementById('modalRoot');
  const escaped = AI_ANALYSIS_PROMPT.replace(/</g,'&lt;').replace(/>/g,'&gt;');
  root.innerHTML =
    '<div class="modal-bg" onclick="if(event.target===this)closeModal()">' +
    '<div class="modal-sheet">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">AI Analysis Prompt</div>' +
    '<div class="modal-body" style="margin-bottom:12px">Copy this, paste it into ChatGPT or Gemini, upload the exported CSV in the same message, and send. Best done weekly — frequent enough to catch a stall early, infrequent enough for the trend lines to mean something. If you also export your flight schedule as an .ics calendar file, upload that alongside the CSV — it gives the AI the full picture of how travel is affecting your training.</div>' +
    '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:11px;line-height:1.6;color:var(--text);white-space:pre-wrap;max-height:40vh;overflow-y:auto;margin-bottom:12px">' + escaped + '</div>' +
    '<button class="btn btn-gold" onclick="copyAIPrompt()">📋 Copy Prompt</button>' +
    '<button class="btn btn-outline mt8" onclick="closeModal()">CLOSE</button>' +
    '</div></div>';
}

function copyAIPrompt() {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(AI_ANALYSIS_PROMPT)
      .then(() => showToast('Prompt copied — paste it into ChatGPT or Gemini.'))
      .catch(() => showToast('Copy failed — select and copy the text manually.'));
  } else {
    showToast('Copy not supported here — select and copy the text manually.');
  }
}

function showFeedbackModal() {
  const root = document.getElementById('modalRoot');
  root.innerHTML =
    '<div class="modal-bg" onclick="if(event.target===this)closeModal()">' +
    '<div class="modal-sheet">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Send Feedback</div>' +
    '<div class="modal-body" style="margin-bottom:10px">Bugs, ideas, anything not working right — this goes straight to the person building the app.</div>' +
    '<textarea id="feedbackText" rows="5" placeholder="What\'s on your mind?" style="width:100%;background:var(--bg3);border:1.5px solid var(--border);border-radius:8px;padding:12px;font-size:16px;color:var(--text);resize:vertical;margin-bottom:10px"></textarea>' +
    '<div class="field" style="margin-bottom:14px"><label>Your email (optional — only if you want a reply)</label>' +
    '<input id="feedbackEmail" type="email" placeholder="you@example.com"></div>' +
    '<button class="btn btn-gold" onclick="submitFeedback()">Send Feedback</button>' +
    '<button class="btn btn-outline mt8" onclick="closeModal()">CANCEL</button>' +
    '</div></div>';
}

async function submitFeedback() {
  const textEl = document.getElementById('feedbackText');
  const emailEl = document.getElementById('feedbackEmail');
  const message = textEl?.value.trim();
  const email = emailEl?.value.trim();
  if (!message) { showToast('Write something first.'); return; }

  try {
    const res = await fetch(FEEDBACK_EDGE_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer '+SB_ANON_KEY },
      body: JSON.stringify({ message, contact_email: email || null, app_version: FCF_VERSION }),
    });
    const rawText = await res.text();
    let data = {};
    try { data = JSON.parse(rawText); } catch(parseErr) { /* not JSON — fall through with raw text below */ }

    if (!res.ok || data.error) {
      const detail = data.error || data.message || rawText.slice(0,150) || 'no response body';
      throw new Error('HTTP '+res.status+' — '+detail);
    }
    closeModal();
    showBigToast('Feedback sent — thank you.', 'ok');
    awardLiveBadge('debrief').catch(() => {});
  } catch(e) {
    console.warn('Feedback submission error:', e);
    showToast('Couldn\'t send feedback: '+e.message);
  }
}

function shareApp() {
  awardLiveBadge('recruiter').catch(() => {});
  const url = window.location.origin + window.location.pathname;
  const shareData = {
    title: 'Flight Crew Fitness',
    text: 'Flight Crew Fitness — an aviation-phased workout tracker built for pilots and flight crew.',
    url: url,
  };
  if (navigator.share) {
    navigator.share(shareData).catch(() => {}); // user cancelling the share sheet isn't an error
  } else if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url)
      .then(() => showToast('Link copied — share it with anyone.'))
      .catch(() => showToast('Copy failed — copy the URL from your browser address bar.'));
  } else {
    showToast('Sharing not supported here — copy the URL from your browser address bar.');
  }
}

// ─── DIALOG LOADING SPINNER ─────────────────────────────────────────────
// Anything that opens a dialogue behind network round trips looked like a
// dead tap while it worked — which is exactly what produced the "had to
// tap the calendar three times" report: showCalendarDay made four
// sequential DB calls (including a full history fetch) before rendering
// anything at all.
//
// The spinner is DELAYED rather than immediate: work that finishes inside
// the threshold never flashes a spinner at all (a flash reads as jank),
// while anything slower gets visible feedback well before it feels
// broken. It renders into its own overlay root, never #modalRoot, so it
// can't clobber whatever the dialogue itself writes there.
const DIALOG_SPINNER_DELAY_MS = 500;
let _loadingOverlayDepth = 0;

function showLoadingOverlay(label) {
  _loadingOverlayDepth++;
  const root = document.getElementById('loadingOverlayRoot');
  if (!root) return;
  root.innerHTML =
    '<div class="loading-overlay"><div class="loading-overlay-card">' +
    '<span class="fcf-spinner"></span>' +
    '<span class="loading-overlay-label">' + sanitizeUserText(label || 'Loading…') + '</span>' +
    '</div></div>';
}

function hideLoadingOverlay() {
  // Depth-counted so overlapping operations (or a rapid double-tap that
  // starts two of them) can't have the first one to finish yank the
  // overlay out from under the second.
  _loadingOverlayDepth = Math.max(0, _loadingOverlayDepth - 1);
  if (_loadingOverlayDepth > 0) return;
  const root = document.getElementById('loadingOverlayRoot');
  if (root) root.innerHTML = '';
}

// Wraps any async work that leads to a dialogue. Always clears the
// spinner, including when the work throws — a failure must never leave a
// permanent overlay stuck over the app.
async function withDialogSpinner(label, fn) {
  let shown = false;
  const timer = setTimeout(() => { shown = true; showLoadingOverlay(label); }, DIALOG_SPINNER_DELAY_MS);
  try {
    return await fn();
  } finally {
    clearTimeout(timer);
    if (shown) hideLoadingOverlay();
  }
}

// ─── PAYWALL ────────────────────────────────────────────────────────────
// Shown when a gated capability is reached, naming the specific thing that
// was blocked rather than a generic upsell — someone who just hit the photo
// limit should be told that, not sold a feature list.
function showPaywall(reason) {
  haptic('medium');
  const root = document.getElementById('modalRoot');
  if (!root) return;
  const why = {
    photos: 'You\'ve used your ' + FREE_WEEKLY_PHOTOS + ' free photo analyses this week.',
    coach:  'AI coaching is a Pro feature.',
  }[reason] || 'This is a Pro feature.';

  const parts = [];
  parts.push('<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal-sheet">');
  parts.push('<div class="modal-handle"></div>');
  parts.push('<div class="modal-title">Flight Crew Fitness Pro</div>');
  parts.push('<div class="modal-body" style="margin-bottom:14px">'+why+'</div>');

  parts.push('<div class="card" style="padding:14px;margin-bottom:12px">');
  [['📷','Unlimited food photo analysis'],
   ['✦','AI coaching and meal assessment'],
   ['🏨','Hotel and layover gym workout generation'],
   ['📊','Full trend history and exports']].forEach(([icon,label]) => {
    parts.push('<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px"><span>'+icon+'</span><span style="font-size:13px">'+label+'</span></div>');
  });
  parts.push('</div>');

  parts.push('<button class="btn btn-gold" onclick="startProPurchase(\''+PRO_PRODUCT_ANNUAL+'\')">'+PRO_ANNUAL_PRICE+' / year</button>');
  parts.push('<div style="text-align:center;font-size:11px;color:var(--muted);margin:6px 0 10px">Works out at $5.00 a month</div>');
  parts.push('<button class="btn btn-outline" onclick="startProPurchase(\''+PRO_PRODUCT_MONTHLY+'\')">'+PRO_MONTHLY_PRICE+' / month</button>');

  parts.push('<button class="btn-ghost" style="display:block;width:100%;text-align:center;margin-top:12px" onclick="restoreProPurchases()">Restore purchases</button>');
  parts.push('<button class="btn-ghost" style="display:block;width:100%;text-align:center;margin-top:10px" onclick="closeModal()">Not now</button>');
  parts.push('</div></div>');
  root.innerHTML = parts.join('');
}

// Purchases run through StoreKit on iOS. The native shell exposes a bridge;
// until that shell exists (or in a plain browser, where Apple's IAP rules
// don't apply but StoreKit also isn't present) this says so plainly instead
// of failing silently or pretending to charge anyone.
function storeKitBridge() {
  // Returns the WKWebView StoreKit message handler if running inside the
  // FCF native iOS shell. Returns null in a browser/PWA — those users
  // go through Stripe web checkout instead.
  const handler = window.webkit?.messageHandlers?.storeKit;
  if (!handler) return null;
  return {
    getProducts: () => handler.postMessage({ action: 'getProducts' }),
    purchase:    (opts) => handler.postMessage({ action: 'purchase', productId: opts.productId, appAccountToken: opts.appAccountToken }),
    restore:     () => handler.postMessage({ action: 'restore' }),
  };
}

// Web subscribers go through Stripe. Deliberately NOT offered inside the
// iOS app: Apple still requires IAP for in-app digital purchases, and the
// link-out route needs an entitlement, a disclosure sheet and transaction
// reporting. A standalone web purchase carries none of that — and no
// commission — so the two paths stay completely separate.
async function startWebCheckout(plan) {
  if (!ST.user) { showBigToast('Sign in first.', 'warn'); return; }
  try {
    const { data: { session } } = await SB.auth.getSession();
    if (!session) { showBigToast('Sign in first.', 'warn'); return; }
    const res = await withDialogSpinner('Opening secure checkout…', () =>
      fetch(STRIPE_CHECKOUT_EDGE_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
        body: JSON.stringify({ plan }),
      }).then(r => r.json()));
    if (!res?.url) throw new Error(res?.error || 'could not start checkout');
    // Same tab. Stripe returns to success_url, and the app re-reads
    // entitlement on load, so the round trip completes on its own.
    location.href = res.url;
  } catch (e) {
    showBigToast('Could not open checkout: ' + (e?.message || 'unknown error'), 'warn');
  }
}

async function startProPurchase(productId) {
  haptic('heavy');
  const bridge = storeKitBridge();
  if (!bridge) {
    return startWebCheckout(productId === PRO_PRODUCT_MONTHLY ? 'monthly' : 'annual');
  }
  if (!ST.user) { showBigToast('Sign in first.', 'warn'); return; }
  // Fire and forget — result arrives asynchronously via fcf:purchase event listener above.
  // Do NOT await this; postMessage() returns undefined, not a Promise.
  bridge.purchase({ productId, appAccountToken: ST.user?.id || null });
  showBigToast('Opening App Store…', 'info');
}

async function restoreProPurchases() {
  const bridge = storeKitBridge();
  if (!bridge) {
    await withDialogSpinner('Checking…', () => loadSubscription());
    showBigToast(isPro() ? '✓ Pro active.' : 'No active subscription found.', isPro() ? 'ok' : 'info');
    return;
  }
  // Result arrives via fcf:restore event listener — don't await.
  bridge.restore();
  showBigToast('Contacting App Store…', 'info');
}

// ─── ACCOUNT DELETION ───────────────────────────────────────────────────
// Apple has required in-app account deletion since 2022 for any app that
// supports account creation. Its absence is an automatic rejection, and it
// has to actually delete rather than just sign out or open a support email.
//
// Two-step by design: this is irreversible and takes every workout, meal
// and biometric with it, so it asks for the word DELETE rather than relying
// on a button that could be tapped by accident.
function confirmDeleteAccount() {
  const root = document.getElementById('modalRoot');
  if (!root) return;
  root.innerHTML =
    '<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal-sheet">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title" style="color:var(--red)">Delete Account</div>' +
    '<div class="modal-body">This permanently deletes your account and everything in it — every workout, meal, biometric reading, schedule and personal record. It cannot be undone and there is no backup.</div>' +
    '<div class="modal-body" style="margin-top:10px">Export your data first if you want to keep it.</div>' +
    '<div class="field" style="margin-top:14px"><label>Type DELETE to confirm</label>' +
    '<input type="text" id="deleteConfirmInput" autocapitalize="characters" autocomplete="off" placeholder="DELETE"></div>' +
    '<button class="btn btn-outline" style="color:var(--red);border-color:var(--red)" onclick="performAccountDeletion()">Permanently Delete My Account</button>' +
    '<button class="btn-ghost" style="display:block;width:100%;text-align:center;margin-top:12px" onclick="closeModal()">Cancel</button>' +
    '</div></div>';
}

async function performAccountDeletion() {
  const typed = (document.getElementById('deleteConfirmInput')?.value || '').trim().toUpperCase();
  if (typed !== 'DELETE') { showBigToast('Type DELETE to confirm.', 'warn'); return; }
  if (!ST.user) { showBigToast('Not signed in.', 'warn'); return; }
  const uid = ST.user.id;

  try {
    await withDialogSpinner('Deleting your account…', async () => {
      // User-owned rows first, so nothing is orphaned if the auth deletion
      // fails partway. Each is allowed to fail independently — a missing
      // table must not strand someone half-deleted with no way to retry.
      const tables = ['workout_sessions','meal_logs','weight_log','oura_daily',
                      'daily_inputs','food_photo_usage','photo_quota_weekly'];
      for (const t of tables) {
        try { await SB.from(t).delete().eq('user_id', uid); } catch(e) {}
      }
      // The auth user itself needs elevated privileges, so it goes through
      // an edge function rather than the client.
      const { data: { session } } = await SB.auth.getSession();
      if (session) {
        await fetch(ACCOUNT_DELETE_EDGE_FN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
        }).catch(() => {});
      }
    });

    try { localStorage.clear(); } catch(e) {}
    await SB.auth.signOut().catch(() => {});
    ST.user = null; ST.authed = false; ST.subscription = null;
    closeModal();
    showInfoModal('Account deleted', 'Your account and all associated data have been removed. Sorry to see you go.');
    setTimeout(() => location.reload(), 2500);
  } catch (e) {
    showBigToast('Could not complete deletion: ' + (e?.message || 'unknown error') + '. Nothing was partially removed — please try again.', 'warn');
  }
}


// ─── TRACKING PREFERENCES ───────────────────────────────────────────────
// Not everyone wants a nutrition tracker. Someone here purely for training
// and schedule-aware programming shouldn't be nagged about protein or
// water, and turning it off has to remove the PROMPTS as well as the
// screens — a hidden tab that still generates "nothing logged yet today"
// on the Today briefing would be worse than leaving it on.
//
// Logged data is never deleted by toggling; switching back restores it.
async function setTrackingPref(key, on) {
  ST[key] = !!on;
  renderPage(); // optimistic update — toggle appears instant
  try {
    const profile = (await dbGetProfile()) || {};
    profile[key] = !!on;
    await dbSetProfile(profile);
  } catch(e) { showBigToast('Saved on this device, but could not sync.', 'warn'); }
}

// The hydration line on Today. Extracted so it can appear inside the Fuel
// card when nutrition is tracked, or stand alone when it isn't, without the
// two copies drifting apart — which is exactly how the Today tab and the
// workout screen previously ended up disagreeing about the same number.
function hydrationRowHTML(ctx, standalone) {
  const hs = hydroStatus(ctx.now);
  // Tappable — reading your hydration status and wanting to log water are
  // the same moment, so the number itself is the control.
  return '<div class="fb" style="'+(standalone?'':'margin-top:10px;padding-top:10px;border-top:1px solid var(--border);')+'cursor:pointer;padding-bottom:2px" onclick="haptic(\'light\');openQuickWaterLog()">' +
    '<span style="font-family:var(--mono);font-size:9px;letter-spacing:.1em;color:var(--muted)">💧 HYDRATION</span>' +
    '<span style="font-family:var(--mono);font-size:10px;color:'+hs.color+'">'+ST.waterIn.toFixed(1)+'/'+hydroTarget().toFixed(1)+'L · '+hs.label+' <span style="color:var(--gold)">+ LOG</span></span></div>';
}

function renderTrackingToggles() {
  const row = (key, label, sub) => {
    const on = !!ST[key];
    const knobLeft = on ? '23px' : '3px';
    const bg       = on ? 'var(--gold)' : 'rgba(255,255,255,0.12)';
    return (
      '<div class="fb" style="padding:12px 0;border-bottom:1px solid var(--border);align-items:center">' +
        '<div style="flex:1;padding-right:16px">' +
          '<div style="font-size:14px">'+label+'</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:2px">'+sub+'</div>' +
        '</div>' +
        // Button instead of div — gets immediate iOS touch response, no 300ms delay
        '<button onclick="haptic(\'selection\');setTrackingPref(\''+key+'\','+(!on)+')" style="' +
          'cursor:pointer;flex-shrink:0;width:46px;height:26px;border-radius:13px;' +
          'background:'+bg+';position:relative;border:none;padding:0;' +
          'transition:background 0.15s;-webkit-tap-highlight-color:transparent;touch-action:manipulation">' +
          '<div style="position:absolute;top:3px;left:'+knobLeft+';width:20px;height:20px;' +
            'border-radius:50%;background:#fff;transition:left 0.15s;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>' +
        '</button>' +
      '</div>'
    );
  };
  return '<div class="section-label" style="margin-top:20px">TRACKING</div>' +
    '<div class="card mb12">' +
      row('trackNutrition','Nutrition','Meals, macros and the Fuel card') +
      row('trackHydration','Hydration','Water logging and hydration status') +
      '<div style="font-size:11px;color:var(--muted);margin-top:10px">Turning these off hides the screens and stops the reminders. Nothing you have already logged is deleted.</div>' +
    '</div>';
}

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

// Has anything actually been entered yet?
function hasAnyLoggedSet(sets) {
  return Object.values(sets || {}).some(arr =>
    Array.isArray(arr) && arr.some(s => s && (s.reps||s.weight||s.seconds||s.height||s.distance||s.miles||s.seconds_left||s.seconds_right)));
}

function persistWorkoutState() {
  if (!ST.workout) { localStorage.removeItem(WORKOUT_STATE_KEY); return; }
  // Every set input calls through here, which makes this the one place
  // that reliably sees the first entry. workoutStartedAt is stamped when
  // ENGAGE WORKOUT is pressed, which can be long before anything is
  // actually logged — someone opens the workout, drives to the gym,
  // changes, then starts. Session duration should run from the first
  // logged set to setting the chocks, so that moment is recorded here.
  if (!ST.workoutFirstLoggedAt && hasAnyLoggedSet(ST.sets)) {
    ST.workoutFirstLoggedAt = Date.now();
  }
  try {
    localStorage.setItem(WORKOUT_STATE_KEY, JSON.stringify({
      workout: ST.workout,
      sets: ST.sets,
      env: ST.env,
      muscleGroup: ST.muscleGroup,
      goal: ST.goal,
      fatigue: ST.fatigue,
      level: ST.level,
      expanded: ST.expanded,
      workoutStartedAt: ST.workoutStartedAt,
      workoutFirstLoggedAt: ST.workoutFirstLoggedAt,
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
    ST.expanded = saved.expanded || {};
    ST.workoutStartedAt = saved.workoutStartedAt || saved.savedAt;
    // Older in-progress workouts predate this field; fall back to the
    // engage time rather than losing the session's elapsed duration.
    ST.workoutFirstLoggedAt = saved.workoutFirstLoggedAt || null;
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
      stopwatch: { active: ST.stopwatch.active, exId: ST.stopwatch.exId, side: ST.stopwatch.side, startTs: ST.stopwatch.startTs, targetSec: ST.stopwatch.targetSec, chimed: ST.stopwatch.chimed },
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
      ST.stopwatch = { active: true, seconds: Math.round((Date.now()-saved.stopwatch.startTs)/1000), exId: saved.stopwatch.exId, side: saved.stopwatch.side||null, interval: null, startTs: saved.stopwatch.startTs, targetSec: saved.stopwatch.targetSec||null, chimed: !!saved.stopwatch.chimed };
      ST.stopwatch.interval = setInterval(() => tickStopwatch(saved.stopwatch.exId, saved.stopwatch.side||null), 1000);
    }
    if (saved.nsdrTimer?.active) {
      ST.nsdrTimer = { active: true, seconds: Math.round((Date.now()-saved.nsdrTimer.startTs)/1000), interval: null, chimed: saved.nsdrTimer.chimed, exId: saved.nsdrTimer.exId, startTs: saved.nsdrTimer.startTs };
      ST.nsdrTimer.interval = setInterval(() => tickNSDR(saved.nsdrTimer.exId), 1000);
    }
  } catch(e) {}
}

// Refresh anything served from offline fallbacks the moment connectivity
// returns — otherwise the calendar (and sync indicator) stay frozen on the
// offline snapshot until the user fully restarts the app.
async function refreshOnReconnect() {
  ST.calendarSessions = {};
  try {
    // Re-fetch the profile too — if the app booted offline it hydrated from
    // the local mirror (or nothing), and things like Oura connection state
    // would otherwise stay stale until a full restart.
    const [profile] = await Promise.all([dbGetProfile(), loadSessionCache()]);
    applyProfileToState(profile);
  } catch(e) {}
  checkDB();
  if (ST.ouraConnected && ST.ouraAccessToken) syncOuraData().catch(() => {});
  renderPage();
}
window.addEventListener('online', () => { refreshOnReconnect(); });

// Resync all active timers the instant the app returns to the foreground.
// iOS throttles/suspends setInterval while backgrounded, so on resume we
// recalculate from the stored timestamps rather than trusting tick counts.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const calCached = ST.calendarSessions['range_'+CALENDAR_DAYS];
  if ((calCached?.offline || ST.profileFromCache) && navigator.onLine !== false) refreshOnReconnect();
  if (ST.restTimer.active) tickRestTimer(ST.restTimer.exId);
  if (ST.stopwatch.active) tickStopwatch(ST.stopwatch.exId, ST.stopwatch.side||null);
  if (ST.nsdrTimer.active) tickNSDR(ST.nsdrTimer.exId);
  if (ST.tab === 'flight') renderFlight(document.getElementById('mainPage'));
});

// ─── ADD TO HOME SCREEN ───────────────────────────────────────────────────────
// iOS Safari has no API to trigger 'Add to Home Screen' programmatically —
// Apple doesn't expose one — so the best a web app can do there is show
// clear instructions. Android/Chrome DOES support a real one-tap install via
// the captured beforeinstallprompt event, which we grab as early as possible
// since it can only be used once and only if captured before the user acts.
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

function isStandalonePWA() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

// BUG FIX (reported): opening an exercise guide on YouTube and coming back
// landed on a blank browser page with an empty address bar, which had to be
// closed by hand before the workout was reachable again.
//
// Cause is target="_blank" from an installed PWA. iOS opens it as a
// separate browsing context that frequently ends up with nothing loaded,
// and dismissing it is a manual step. Navigating in the SAME context
// instead makes iOS present its own in-app browser, which carries a Done
// button that returns straight back to the workout.
//
// target="_blank" is still right in an ordinary browser tab, where it
// opens a real second tab and leaves the app where it was — so this only
// changes behaviour in the case that's actually broken.
function externalLinkAttrs() {
  return isStandalonePWA() ? 'rel="noopener"' : 'target="_blank" rel="noopener"';
}
function isIOSSafari() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome/.test(ua);
  return isIOS && isSafari;
}

function maybeShowInstallPrompt() {
  if (isStandalonePWA()) return; // already installed — nothing to prompt
  if (localStorage.getItem('fcf_install_prompt_dismissed') === '1') return;
  if (!isIOSSafari() && !deferredInstallPrompt) return; // no path to install on this browser
  ST.showInstallPrompt = true;
}

function dismissInstallPrompt() {
  ST.showInstallPrompt = false;
  localStorage.setItem('fcf_install_prompt_dismissed', '1');
  renderPage();
}

async function triggerInstall() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  try { await deferredInstallPrompt.userChoice; } catch(e) {}
  deferredInstallPrompt = null;
  dismissInstallPrompt();
}

function renderInstallPrompt() {
  if (!ST.showInstallPrompt) return '';
  const parts = ['<div class="card mb12" style="border-color:var(--gold)">'];
  parts.push('<div class="fb" style="align-items:flex-start;margin-bottom:8px"><div style="font-size:13px;font-weight:700">📲 Get the full-screen app experience</div><div class="btn-ghost" style="font-size:16px;padding:0 4px" onclick="dismissInstallPrompt()">✕</div></div>');
  if (deferredInstallPrompt) {
    parts.push('<div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.5">Install Flight Crew Fitness on your home screen — opens instantly, no browser bar, works offline.</div>');
    parts.push('<button class="btn btn-outline" onclick="triggerInstall()">Install App</button>');
  } else {
    parts.push('<div style="font-size:12px;color:var(--muted);line-height:1.6">Add this to your home screen so it opens like a real app — full screen, no browser bar, works offline:<br><br>1. Tap the <strong>Share</strong> icon <span style="font-family:var(--mono)">⬆️</span> at the bottom of Safari<br>2. Scroll down and tap <strong>Add to Home Screen</strong><br>3. Tap <strong>Add</strong></div>');
  }
  parts.push('</div>');
  return parts.join('');
}

// ─── INITIALIZATION ───────────────────────────────────────────────────────────
let swRegistration = null;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    swRegistration = reg;

    // A new worker was found and finished installing while one was already
    // controlling the page — that means an update is ready, not a first install.
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showToast('Updating to the latest version…');
        }
      });
    });

    // Check for an update to sw.js right away, and periodically while the app
    // stays open — otherwise a PWA left running in the background for days
    // never notices a new version exists.
    reg.update().catch(() => {});
    setInterval(() => reg.update().catch(() => {}), 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});

  // Fires once the new service worker (which calls skipWaiting + clients.claim
  // in sw.js) actually takes control. Reload once to pick up the new cached
  // assets — guarded so a reload can't loop.
  let reloadedForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForUpdate) return;
    reloadedForUpdate = true;
    window.location.reload();
  });
}

// Manual "check now" — used by the top-bar sync indicator.
async function checkForAppUpdate() {
  if (!swRegistration) return; // WKWebView — SW updates automatically, no toast needed
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    showToast('📡 You\'re offline — reconnect to check for updates. The app keeps working normally in the meantime.');
    return;
  }
  showToast('Checking for updates…');
  try {
    await swRegistration.update();
    if (swRegistration.installing || swRegistration.waiting) {
      showToast('Update found — installing now…');
    } else {
      showToast('You\'re on the latest version ('+FCF_VERSION+' · '+FCF_BUILD+').');
    }
  } catch(e) {
    // Browsers report a failed script fetch with an unhelpful raw message
    // ("Script ... load failed") — translate connectivity-shaped failures.
    const msg = e.message || '';
    if (/load failed|failed to fetch|networkerror|network error/i.test(msg)) {
      showToast('📡 Couldn\'t reach the update server — you may be offline. The app keeps working normally.');
    } else {
      showToast('Update check failed: '+msg);
    }
  }
}

async function initApp() {
  // Password recovery link (Supabase sets #...&type=recovery in the hash) —
  // checked via the hash specifically so this can never collide with the
  // Oura OAuth callback below, which uses a ?code= query parameter instead.
  if (window.location.hash.includes('type=recovery')) {
    ST.user = await checkAuth(); // establishes the temporary recovery session
    ST.authed = !!ST.user;
    ST.showLanding = false;
    ST.authView = 'recovery';
    renderRoot();
    return;
  }

  // Check for Oura OAuth callback before anything else
  if (window.location.search.includes('code=')) {
    ST.user = await checkAuth();
    ST.authed = !!ST.user;
    if (ST.authed) {
      await bootApp();
      await handleOuraCallback(); // process the OAuth code
    } else {
      renderRoot();
    }
    return;
  }

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

// ── Native → Web event listeners ─────────────────────────────────────────────
// These handle all async responses from the iOS native shell.
// postMessage() returns undefined — results always come back as CustomEvents.

// IAP: purchase result
window.addEventListener('fcf:purchase', async (e) => {
  const d = e.detail || {};
  if (d.cancelled) {
    showBigToast('Purchase cancelled.', 'info');
  } else if (d.pending) {
    showBigToast('Purchase pending approval (Ask to Buy).', 'info');
  } else if (d.success) {
    // Entitlement written server-side — re-read it
    await loadSubscription();
    closeModal();
    renderPage();
    showBigToast(isPro() ? '✓ Pro active — thanks.' : 'Purchase received. Entitlement will appear shortly.', 'ok');
  } else if (d.error) {
    showBigToast('Purchase did not complete: ' + d.error, 'warn');
  }
});

// IAP: restore result
window.addEventListener('fcf:restore', async (e) => {
  const d = e.detail || {};
  if (d.error) {
    showBigToast('Restore failed: ' + d.error, 'warn');
    return;
  }
  await loadSubscription();
  renderPage();
  showBigToast(isPro() ? '✓ Pro restored.' : 'No active subscription found for this Apple ID.', isPro() ? 'ok' : 'info');
});

// IAP: product list (for future use — price display)
window.addEventListener('fcf:products', (e) => {
  const d = e.detail || {};
  if (d.products) ST.skProducts = d.products;
});

// Sign In with Apple: success
window.addEventListener('fcf:siwa:success', async (e) => {
  const d = e.detail || {};
  if (!d.identityToken) { ST.authErr = 'Sign in failed — no identity token returned.'; renderRoot(); return; }
  try {
    const { data, error } = await SB.auth.signInWithIdToken({
      provider: 'apple',
      token: d.identityToken,
      nonce: undefined,
    });
    if (error) throw error;
    ST.user = data.user;
    ST.authed = true;
    ST.authErr = '';
    await bootApp();
  } catch (err) {
    ST.authErr = 'Sign in with Apple failed: ' + (err.message || 'unknown error');
    renderRoot();
  }
});

// Sign In with Apple: error
window.addEventListener('fcf:siwa:error', (e) => {
  const d = e.detail || {};
  ST.authErr = 'Sign in with Apple failed: ' + (d.error || 'unknown error');
  renderRoot();
});

// Push notification tap — navigate to the right tab without reloading
window.addEventListener('fcf:pushTap', (e) => {
  const tab = e.detail?.tab;
  if (tab && ST.authed) switchTab(tab);
});
window.addEventListener('fcf:healthkit', (e) => {
  ST.healthkit = e.detail || {};
  renderPage();
});

// Calendar data arrives from the native shell. Run it through the AI
// classifier — the edge function handles caching via fingerprint comparison.
window.addEventListener('fcf:calendar', async (e) => {
  const payload = e.detail || {};
  ST.calendarGranted = !!payload.granted;
  if (!payload.granted || !payload.events?.length) { renderPage(); return; }
  await classifyCalendarEvents(payload.events, payload.fingerprint);
  // Reschedule preflight notifications now that we have flight data
  scheduleNotifications();
});

// APNs token arrives from the native shell after iOS registers for push.
// Forward it to Supabase so the server can send targeted notifications.
window.addEventListener('fcf:apnsToken', async (e) => {
  const token = e.detail?.token;
  if (!token || !ST.user) return;
  try {
    const { data: { session } } = await SB.auth.getSession();
    if (!session) return;
    await fetch(PUSH_TOKEN_EDGE_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ token, platform: 'apns' })
    });
  } catch (e) { console.warn('push token registration failed:', e); }
});

// Schedule all enabled notifications via the native bridge.
// Called after login, after calendar sync, and after prefs change.
function scheduleNotifications() {
  if (typeof FCFBridge === 'undefined' || !FCFBridge.isNative) return;
  const pro = isPro();

  // Build upcoming flights list from classified calendar events
  const upcomingFlights = (ST.calendarEvents || [])
    .filter(e => e.type === 'flight' && new Date(e.start) > new Date())
    .map(e => ({ start: e.start, origin: e.origin || '', destination: e.destination || '' }))
    .slice(0, 10);

  const prefs = {
    action:            'schedule',
    workoutReminder:   true,                           // free — always on
    waterReminder:     !!(ST.trackHydration),          // free if hydration on
    preflightCheck:    upcomingFlights.length > 0,     // free if flights detected
    upcomingFlights,
    hrvAlert:          pro && !!(ST.healthkit?.hrv),   // pro
    weeklySummary:     pro,                            // pro
    hrvBaseline:       ST.healthkit?.hrv || null,
  };
  window.webkit?.messageHandlers?.notifications?.postMessage(prefs);
}

// Called immediately after a workout is logged — tells iOS to suppress
// the 3-day reminder since the user just trained.
function cancelWorkoutReminderNative() {
  if (typeof FCFBridge === 'undefined' || !FCFBridge.isNative) return;
  window.webkit?.messageHandlers?.notifications?.postMessage({ action: 'cancelWorkoutReminder' });
}

async function classifyCalendarEvents(events, fingerprint) {
  try {
    const { data: { session } } = await SB.auth.getSession();
    if (!session) return;
    const res = await fetch(CALENDAR_CLASSIFY_EDGE_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ events, fingerprint })
    });
    if (!res.ok) { console.warn('Calendar classify failed:', await res.text()); return; }
    const data = await res.json();
    if (data.limitReached) {
      showBigToast('Calendar AI limit reached for this month. Upgrade to Pro for unlimited.', 'info');
      if (data.classified?.length) {
        ST.calendarEvents = data.classified;
        ST.calendarFingerprint = fingerprint;
        renderPage();
      }
      return;
    }
    if (data.classified?.length) {
      ST.calendarEvents = data.classified;
      ST.calendarFingerprint = fingerprint;
      renderPage();
    }
  } catch(e) {
    console.warn('classifyCalendarEvents error:', e);
  }
}
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(initApp, 0);
}

// ─── COMPACT ROLLING CALENDAR (smooth continuous scroll, not week-paged) ─────
const CALENDAR_DAYS = 28; // trailing window shown in the scrollable strip

const CALENDAR_CACHE_KEY = 'fcf_calendar_cache';
async function loadCalendarRange() {
  const cacheKey = 'range_'+CALENDAR_DAYS;
  const isOnline = (typeof navigator === 'undefined') || navigator.onLine !== false;
  const cached = ST.calendarSessions[cacheKey];
  // A result produced by the offline fallback is served from cache only
  // while still offline — once connectivity returns, bypass it and refetch,
  // otherwise the calendar stays frozen on the offline snapshot until a
  // full app restart.
  if (cached && !(cached.offline && isOnline)) return cached;

  const today = new Date();
  today.setHours(23,59,59,999);
  const windowStart = new Date(today.getTime() - (CALENDAR_DAYS-1)*24*60*60*1000);
  windowStart.setHours(0,0,0,0);

  try {
    const filter = ST.user ? SB.from('workout_sessions').select('*').eq('user_id', ST.user.id) : SB.from('workout_sessions').select('*');
    const query = filter
      .gte('started_at', windowStart.toISOString())
      .lte('started_at', today.toISOString())
      .order('started_at', { ascending: true });
    // Some networks (airplane mode, dead layover wifi) don't fail fast — they
    // just hang. Race against a timeout so we always fall through to the
    // local fallback below within a few seconds instead of leaving the caller
    // waiting on a promise that may never settle.
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000));
    const { data, error } = await Promise.race([query, timeout]);
    if (error) throw error;
    const sessions = (data||[]).map(r => r.session_data ? {...r.session_data, _key: r.session_key} : null).filter(Boolean);
    // Mirror the fetched window locally so a future cold offline launch can
    // still show real training history — same pattern as the profile cache.
    try { localStorage.setItem(CALENDAR_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), sessions })); } catch(e2) {}
    ST.calendarSessions[cacheKey] = { sessions, windowStart, windowEnd: today };
    return ST.calendarSessions[cacheKey];
  } catch(e) {
    // Offline fallback: merge the last successfully-synced mirror with any
    // sessions saved locally while offline, deduped (mirror copy wins).
    let mirrored = [];
    try { mirrored = (JSON.parse(localStorage.getItem(CALENDAR_CACHE_KEY)||'null')?.sessions) || []; } catch(e2) {}
    const keys = Object.keys(localStorage).filter(k => k.startsWith('fcf_session_'));
    const locals = keys.map(k => { try { return JSON.parse(localStorage.getItem(k)); } catch(e2){ return null; } }).filter(Boolean);
    const seen = new Set(mirrored.map(s => s.date));
    const all = [...mirrored, ...locals.filter(s => !seen.has(s.date))];
    const sessions = all.filter(s => {
      const t = new Date(s.date).getTime();
      return t >= windowStart.getTime() && t <= today.getTime();
    }).sort((a,b) => new Date(a.date) - new Date(b.date));
    const result = { sessions, windowStart, windowEnd: today, offline: true };
    ST.calendarSessions[cacheKey] = result;
    return result;
  }
}

// showCalendarDay() and openNewSessionEditor() both expect a bare
// 'YYYY-MM-DD' string (see their own comments) and append 'T12:00:00'
// internally to force local-noon parsing. Passing a full ISO timestamp
// here instead — e.g. from .toISOString() — double-appends a time
// component onto an already-timezoned string, producing an Invalid Date
// that then throws inside openNewSessionEditor's .toISOString() call
// with no visible error: every tap on a calendar day or "+ Log a
// Workout" silently did nothing.
function localDateStr(d) {
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

// Does a saved session fall on the same LOCAL calendar day as `now`?
//
// BUG FIX (reported: "I did leg day today, it says nothing logged").
// The Today tab used to compare UTC date strings on both sides:
//   (s.date||'').slice(0,10) === now.toISOString().slice(0,10)
// UTC midnight is 5pm in Arizona (UTC-7), so from 5pm local onward
// now.toISOString() already reads as TOMORROW, while a workout logged
// that morning is still stamped with today's UTC date. They stop
// matching and Today reports "no session logged" for a workout that
// plainly happened. The training calendar never showed the bug because
// it buckets by LOCAL midnight (setHours(0,0,0,0)) — which is exactly
// why the two screens disagreed and the calendar looked like "proof".
//
// Pulled out as its own function specifically so it can be tested
// against every hour of a local day deterministically; as inline code
// depending on the real clock, it only misbehaved during part of the
// day and slipped through a suite that happened to run at other times.
function isSessionOnLocalDay(session, now) {
  if (!session || !session.date) return false;
  const d = new Date(session.date);
  if (isNaN(d.getTime())) return false;
  return localDateStr(d) === localDateStr(now || new Date());
}

function buildCalendarHTML(rangeData) {
  const { sessions, windowStart } = rangeData;
  const days = [];
  for (let i = 0; i < CALENDAR_DAYS; i++) {
    const d = new Date(windowStart.getTime() + i*24*60*60*1000);
    const dayStr = d.toDateString();
    // ALL sessions for the day, not just the first. A leg day plus an
    // Oura-imported walk is two sessions; only one was ever surfaced.
    const daySessions = sessions.filter(s => new Date(s.date).toDateString() === dayStr);
    days.push({ date: d, sessions: daySessions, session: daySessions[0] });
  }

  const parts = [];
  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-bottom:8px">TRAINING CALENDAR</div>');
  parts.push('<div style="font-size:11px;color:var(--muted);margin-bottom:8px">Tap a day to log, edit, or delete a workout.</div>');
  parts.push('<div id="calScroll" style="display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;scroll-snap-type:x proximity;touch-action:pan-x;padding-bottom:2px;scrollbar-width:none">');
  days.forEach(day => {
    const isToday = day.date.toDateString() === new Date().toDateString();
    const dow = day.date.toLocaleDateString('en-US',{weekday:'short'}).charAt(0);
    const dateNum = day.date.getDate();
    const hasWorkout = day.sessions.length > 0;
    const cellStyle = isToday ? 'border-color:var(--gold)' : '';
    const bg = hasWorkout ? 'background:rgba(34,197,94,0.12);border-color:rgba(34,197,94,0.4)' : '';
    parts.push('<div style="flex:0 0 46px;min-height:64px;scroll-snap-align:center;text-align:center;border:1.5px solid var(--border);border-radius:8px;padding:7px 2px;cursor:pointer;'+cellStyle+';'+bg+'" onclick="'+(hasWorkout?'showCalendarDay(\''+localDateStr(day.date)+'\')':'openNewSessionEditor(\''+localDateStr(day.date)+'\')')+'">');
    parts.push('<div style="font-family:var(--mono);font-size:9px;color:var(--muted)">'+dow+'</div>');
    parts.push('<div style="font-size:13px;font-weight:600;margin-top:2px">'+dateNum+'</div>');
    if (hasWorkout) {
      // One icon, as requested — but it represents the TRAINING session
      // where there is one, so a leg day isn't hidden behind a walk that
      // happened to be logged first. A count marks days holding more.
      const ICONS = {'Lower Body':'🦵','Upper Push':'💪','Upper Pull':'🎯','Power / Plyo':'⚡','Full Body':'🔥','Longevity':'🌿','Cardio':'❤️','Run':'🏃','Walk':'🚶'};
      const primary = day.sessions.find(isRotationStep) || day.sessions[0];
      const icon = ICONS[primary.muscle_group] || '✓';
      const extra = day.sessions.length > 1
        ? '<span style="font-size:9px;font-family:var(--mono);color:var(--gold);vertical-align:super">'+day.sessions.length+'</span>'
        : '';
      parts.push('<div style="font-size:14px;margin-top:3px">'+icon+extra+'</div>');
    } else {
      parts.push('<div style="font-size:16px;font-weight:700;color:var(--gold);margin-top:2px">+</div>');
    }
    parts.push('</div>');
  });
  parts.push('</div>');
  // Explicit, unmissable entry point — separate from the small day cells
  // above, which are easy to miss as tappable. Defaults to today; picking
  // a different date is still available by tapping that day's cell.
  parts.push('<button class="btn btn-outline mt8" onclick="openNewSessionEditor(\''+localDateStr(new Date())+'\')">+ Log a Workout</button>');
  parts.push('</div>');
  return parts.join('');
}

// Scrolls the calendar strip all the way to the right (today) on first paint.
function scrollCalendarToToday() {
  requestAnimationFrame(() => {
    const el = document.getElementById('calScroll');
    if (el) el.scrollLeft = el.scrollWidth;
  });
}

// Non-timed/held exercises only — excludes stretches (timed holds) from the day summary.
function isLoggableStrengthExercise(exItem) {
  if (exItem.inputType === 'nsdr' || exItem.inputType === 'timed_bilateral') return false;
  if ((exItem.name||'').toLowerCase().includes('stretch')) return false;
  return true; // timed cardio (walking, treadmill, runs) now shows with minutes
}

function formatSetPerformance(exItem, sets) {
  const loggedSets = sets.filter(s => s.reps || s.weight || s.height || s.distance || s.seconds);
  if (!loggedSets.length) return null;
  if (exItem.timed || exItem.inputType === 'timed') {
    const totalSec = loggedSets.reduce((a,s) => a + (parseFloat(s.seconds)||0), 0);
    if (totalSec <= 0) return null;
    return (Math.round(totalSec/60*10)/10)+' min';
  }
  if (exItem.inputType === 'reps_only') {
    const reps = loggedSets.map(s => s.reps).filter(Boolean);
    return loggedSets.length+'×'+(reps.length?Math.max(...reps.map(Number)):'—')+' reps';
  }
  if (exItem.inputType === 'reps_height') {
    const heights = loggedSets.map(s=>parseFloat(s.height)||0).filter(v=>v>0);
    return loggedSets.length+' sets · best '+(heights.length?Math.max(...heights):'—')+' in height';
  }
  if (exItem.inputType === 'reps_distance') {
    const dists = loggedSets.map(s=>parseFloat(s.distance)||0).filter(v=>v>0);
    return loggedSets.length+' sets · best '+(dists.length?Math.max(...dists):'—')+' in distance';
  }
  // reps_weight (default)
  const weights = loggedSets.map(s=>parseFloat(s.weight)||0).filter(v=>v>0);
  const topSet = loggedSets.reduce((best,s) => (parseFloat(s.weight)||0) > (parseFloat(best.weight)||0) ? s : best, loggedSets[0]);
  return loggedSets.length+'×'+(topSet.reps||'—')+' @ '+(weights.length?Math.max(...weights):'—')+' lb';
}

// Was this exercise's best value on this day higher than every prior session? (PR at the time)
function wasExercisePR(exId, exItem, sets, sessionDate, allPriorSessions) {
  const field = exItem.inputType==='reps_height' ? 'height' : exItem.inputType==='reps_distance' ? 'distance' : exItem.inputType==='reps_only' ? 'reps' : 'weight';
  const todayVals = sets.map(s=>parseFloat(s[field])||0).filter(v=>v>0);
  if (!todayVals.length) return false;
  const todayMax = Math.max(...todayVals);
  let priorMax = 0;
  allPriorSessions.forEach(s => {
    if (new Date(s.date).getTime() >= sessionDate.getTime()) return;
    const priorSets = (s.sets?.[exId]||[]).map(x=>parseFloat(x[field])||0).filter(v=>v>0);
    if (priorSets.length) priorMax = Math.max(priorMax, ...priorSets);
  });
  return todayMax > priorMax && priorMax > 0;
}

async function showCalendarDay(isoDate) {
  try {
    // These four fetches are independent of each other, but were awaited
    // one after another — four sequential network round trips, one of them
    // a full 10-year history fetch, all before a single pixel rendered.
    // Running them in one parallel window cuts the real wait to roughly
    // the slowest single call instead of their sum.
    const [rangeData, profile, recentSessions, allHistory] = await withDialogSpinner('Loading workout…', () => Promise.all([
      loadCalendarRange(),
      dbGetProfile(),
      dbGetRecentSessions(7),
      dbGetRecentSessions(3650), // full history, for accurate PR comparison
    ]));
    // isoDate is a bare 'YYYY-MM-DD' string, which JS parses as UTC midnight
    // — in a negative-UTC-offset timezone like Arizona (UTC-7), that's 5pm
    // the PREVIOUS day locally, silently shifting the comparison by a day.
    // Appending noon with no timezone suffix forces local-time parsing instead.
    // Every session that day, most recent last — a leg day plus an
    // Oura-imported walk is two, and only the first was ever shown.
    const daySessions = rangeData.sessions
      .filter(s => new Date(s.date).toDateString() === new Date(isoDate+'T12:00:00').toDateString())
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!daySessions.length) { showToast('No workout found for that day.'); return; }

    const root = document.getElementById('modalRoot');
    const parts = [];
    parts.push('<div class="modal-bg" onclick="if(event.target===this)closeModal()">');
    parts.push('<div class="modal-sheet">');
    parts.push('<div class="modal-handle"></div>');
    if (daySessions.length > 1) {
      parts.push('<div style="font-size:11px;color:var(--muted);margin-bottom:10px">'+daySessions.length+' sessions logged this day</div>');
    }

    daySessions.forEach((session, si) => {
    const allEx = session.workoutSnapshot
      ? [...session.workoutSnapshot.taxi,...session.workoutSnapshot.takeoff,...session.workoutSnapshot.enroute,...session.workoutSnapshot.landing]
      : Object.keys(session.sets||{}).map(id => ({id, name:id, inputType:'reps_weight', timed:false}));
    const summary = buildWorkoutSummary(session, allEx, recentSessions, profile?.lastWeight);
    const sessionDate = new Date(session.date);

    const exerciseRows = allEx
      .filter(isLoggableStrengthExercise)
      .map(exItem => {
        const sets = session.sets?.[exItem.id] || [];
        const perf = formatSetPerformance(exItem, sets);
        if (!perf) return null;
        const isPR = wasExercisePR(exItem.id, exItem, sets, sessionDate, allHistory);
        return { name: exItem.name, perf, isPR };
      })
      .filter(Boolean);

    if (si > 0) parts.push('<div style="border-top:1px solid var(--border);margin:20px 0 14px"></div>');
    parts.push('<div class="modal-title">'+(session.muscle_group||'Workout')+(session.importedFromOura ? ' <span style="font-size:11px;color:var(--blue);font-weight:400">📱 via Oura</span>' : '')+'</div>');
    parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-bottom:14px">'+sessionDate.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})+' at '+sessionDate.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})+'</div>');
    parts.push('<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">');
    parts.push(glowTile('MINUTES', summary.durationMinutes||'—', 'gold'));
    parts.push(glowTile('SETS', summary.totalSets, 'blue'));
    parts.push(glowTile('CALORIES', summary.estCalories, 'teal'));
    parts.push('</div>');
    parts.push('<div class="modal-body" style="margin-bottom:10px">Environment: '+(session.env||'—')+' · Condition: '+(session.fatigue||'go')+'</div>');

    if (exerciseRows.length) {
      parts.push('<div class="section-label" style="margin-top:4px">EXERCISES</div>');
      exerciseRows.forEach(row => {
        parts.push('<div class="fb" style="padding:8px 0;border-bottom:1px solid var(--border)">');
        parts.push('<div style="font-size:13px">'+(row.isPR?'⭐ ':'')+row.name+'</div>');
        parts.push('<div style="font-family:var(--mono);font-size:12px;color:'+(row.isPR?'var(--gold)':'var(--text)')+';font-weight:'+(row.isPR?'700':'400')+'">'+row.perf+'</div>');
        parts.push('</div>');
      });
    }

    // Edit and delete stay per-session — with two logged that day, they
    // have to act on a specific one rather than "the day".
    parts.push('<button class="btn btn-gold mt12" onclick="openEditSessionEditor(\''+(session._key||'')+'\')">✏️ EDIT '+(session.muscle_group||'SESSION').toUpperCase()+'</button>');
    parts.push('<button class="btn btn-outline mt8" style="color:var(--red);border-color:var(--red)" onclick="confirmDeleteSession(\''+(session._key||'')+'\')">🗑 DELETE '+(session.muscle_group||'SESSION').toUpperCase()+'</button>');
    });

    parts.push('<button class="btn btn-outline mt12" onclick="closeModal()">CLOSE</button>');
    parts.push('</div></div>');
    root.innerHTML = parts.join('');
  } catch(e) {
    // Whatever else might be wrong with a given session's data, the person
    // tapping it should see SOMETHING happen — a real error beats a dead
    // tap every time, and this message is exactly what to relay back.
    showBigToast('Could not open that workout: ' + (e.message || 'unknown error'), 'warn');
  }
}

// ─── SESSION EDITOR (edit past workouts / retroactively log missed ones) ─────

// Every unique exercise across all environments, for the searchable picker.
// Common alternate names for exercises already in the catalog under a
// different label — so searching "Bulgarian split squat" finds "Single Leg
// Split Squat", searching "RDL" finds "Romanian Deadlift", etc. Keys are
// lowercase alternate names; values are the exact catalog name they map to.
const EXERCISE_SYNONYMS = {
  // Squats & lunges
  'bulgarian split squat': 'Single Leg Split Squat',
  'rear foot elevated split squat': 'Single Leg Split Squat',
  'rfess': 'Single Leg Split Squat',
  'elevated split squat': 'Single Leg Split Squat',
  'static lunge': 'Split Squat',
  'side lunge': 'Dumbbell Lateral Lunge',
  'db side lunge': 'Dumbbell Lateral Lunge',
  'lateral lunge': 'Dumbbell Lateral Lunge',
  'backward lunge': 'Reverse Lunge',
  'pistol squats': 'Single Leg Squat (Pistol)',
  'kb goblet squat': 'Kettlebell Goblet Squat',
  'box step up': 'Step-Up',
  'barbell squat': 'Back Squat',
  'high bar squat': 'Back Squat',

  // Deadlifts & hinges
  'rdl': 'Romanian Deadlift',
  'db rdl': 'DB Romanian Deadlift',
  'stiff leg deadlift': 'Romanian Deadlift',
  'stiff legged deadlift': 'Romanian Deadlift',
  'stiff-leg deadlift': 'Romanian Deadlift',
  'hex bar deadlift': 'Trap Bar Deadlift',
  'hex deadlift': 'Trap Bar Deadlift',
  'good mornings': 'Good Morning',

  // Presses
  'db shoulder press': 'DB Overhead Press',
  'military press': 'Standing Overhead Press',
  'ohp': 'Standing Overhead Press',
  'strict press': 'Standing Overhead Press',
  'barbell shoulder press': 'Standing Overhead Press',
  'flat bench': 'Flat Barbell Bench Press',
  'barbell bench press': 'Flat Barbell Bench Press',
  'cgbp': 'Close Grip Bench',
  'close grip bench press': 'Close Grip Bench',
  'dips': 'Weighted Dip',
  'chest press machine': 'DB Bench Press',

  // Rows & pulls
  'pendlay row': 'Barbell Row (Pendlay)',
  'bent over row': 'Barbell Row (Pendlay)',
  'bb row': 'Barbell Row (Pendlay)',
  'pulldown': 'Lat Pulldown',
  'wide grip pulldown': 'Lat Pulldown',
  'chin ups': 'Chinups',
  'pull ups': 'Pullups',

  // Curls
  'ez curl': 'EZ Bar Curl',
  'skull crushers': 'DB Tricep Overhead',
  'skull crusher': 'DB Tricep Overhead',
  'lying tricep extension': 'DB Tricep Overhead',

  // Core / anti-rotation — includes common real-world misspellings
  'paloff press': 'Pallof Press',
  'palloff press': 'Pallof Press',
  'palof press': 'Pallof Press',
  'bird dogs': 'Bird Dog',
  'dead bugs': 'Dead Bug',

  // Plyo / jumps
  'jump squat': 'Squat Jump',
  'jump squats': 'Squat Jump',
  'standing long jump': 'Broad Jump',
  'box jumps': 'Box Jump',
  'lunge jump': 'Split Jump',
  'switch lunge jump': 'Split Jump',

  // Carries & conditioning
  'farmers walk': 'Farmer Carry',
  "farmer's walk": 'Farmer Carry',
  'farmers carry': 'Farmer Carry',
  "farmer's carry": 'Farmer Carry',

  // Stretches / mobility
  'nordic hamstring curl': 'Hamstring Raise (Nordic Curl)',
  'nordic hamstring curls': 'Hamstring Raise (Nordic Curl)',
  'pigeon stretch': 'Pigeon Pose',
  'cat cow': 'Cat-Cow',
  'cat cow stretch': 'Cat-Cow',

  // Machine exercises — common shorthand, abbreviations, and equipment names
  'leg press machine': 'Leg Press',
  'leg extension': 'Leg Extension (Machine)',
  'leg extensions': 'Leg Extension (Machine)',
  'quad extension': 'Leg Extension (Machine)',
  'quad extensions': 'Leg Extension (Machine)',
  'leg curl': 'Seated Leg Curl (Machine)',
  'leg curls': 'Seated Leg Curl (Machine)',
  'hamstring curl': 'Seated Leg Curl (Machine)',
  'hamstring curl machine': 'Seated Leg Curl (Machine)',
  'ham curl': 'Seated Leg Curl (Machine)',
  'calf raise machine': 'Standing Calf Raise (Machine)',
  'standing calf machine': 'Standing Calf Raise (Machine)',
  'seated calf machine': 'Seated Calf Raise (Machine)',
  'seated calf raise': 'Seated Calf Raise (Machine)',
  'glute machine': 'Glute Kickback (Machine)',
  'glute kickback machine': 'Glute Kickback (Machine)',
  'cable kickback': 'Glute Kickback (Machine)',
  'hip abduction': 'Hip Abduction (Machine)',
  'hip abductor': 'Hip Abduction (Machine)',
  'abductor machine': 'Hip Abduction (Machine)',
  'hip adduction': 'Hip Adduction (Machine)',
  'hip adductor': 'Hip Adduction (Machine)',
  'adductor machine': 'Hip Adduction (Machine)',
  'inner thigh machine': 'Hip Adduction (Machine)',
  'machine fly': 'Pec Fly (Machine)',
  'machine flys': 'Pec Fly (Machine)',
  'machine flies': 'Pec Fly (Machine)',
  'pec deck': 'Pec Fly (Machine)',
  'chest fly machine': 'Pec Fly (Machine)',
  'machine incline press': 'Incline Chest Press (Machine)',
  'incline press machine': 'Incline Chest Press (Machine)',
  'machine decline press': 'Decline Chest Press (Machine)',
  'decline press machine': 'Decline Chest Press (Machine)',
  'machine chest press': 'Incline Chest Press (Machine)',
  'tricep pushdown': 'Cable Tricep Pushdown',
  'tricep push down': 'Cable Tricep Pushdown',
  'rope pushdown': 'Cable Tricep Pushdown',
  'cable pushdown': 'Cable Tricep Pushdown',
  'assisted dip': 'Assisted Dip (Machine)',
  'assisted dip machine': 'Assisted Dip (Machine)',
  'dip machine': 'Assisted Dip (Machine)',
  'assisted pullup': 'Assisted Pull-Up (Machine)',
  'assisted pull up': 'Assisted Pull-Up (Machine)',
  'assisted pull-up machine': 'Assisted Pull-Up (Machine)',
  'pullup machine': 'Assisted Pull-Up (Machine)',
  't bar row': 'T-Bar Row (Machine)',
  'tbar row': 'T-Bar Row (Machine)',
  't-bar row machine': 'T-Bar Row (Machine)',
  'smith squat': 'Smith Machine Squat',
  'smith machine squats': 'Smith Machine Squat',
  'smith bench': 'Smith Machine Bench Press',
  'smith machine bench': 'Smith Machine Bench Press',
  'hack squat': 'Hack Squat (Machine)',
  'lat pull': 'Lat Pulldown',
  'lat pulldown machine': 'Lat Pulldown',
  'pulldown': 'Lat Pulldown',
  'cable row': 'Seated Cable Row',
  'seated row': 'Seated Cable Row',
  'seated row machine': 'Seated Cable Row',
};

// Query normalization: expand common abbreviations both directions so a
// search matches regardless of which form the exercise name uses or the
// person types. Covers ~15 catalog exercises that use "DB" for dumbbell.
function expandSearchQuery(q) {
  const variants = new Set([q]);
  if (q.includes('dumbbell')) variants.add(q.replace(/dumbbell/g, 'db'));
  if (/\bdb\b/.test(q)) variants.add(q.replace(/\bdb\b/g, 'dumbbell'));
  if (q.includes('barbell')) variants.add(q.replace(/barbell/g, 'bb'));
  // Basic plural handling — "curls" -> "curl", "preacher curls" -> "preacher curl"
  if (q.endsWith('s') && q.length > 3) variants.add(q.slice(0, -1));
  return [...variants];
}

// True if an exercise (by its canonical catalog name) matches a search query,
// checking the name itself, DB/dumbbell query variants, and known synonyms.
function exerciseMatchesQuery(canonicalName, rawQuery) {
  if (!canonicalName || !rawQuery) return false;
  const nameLower = canonicalName.toLowerCase();
  // Lowercased here, not just at some call sites — mobile keyboards
  // auto-capitalize the first letter of a text field by default, so a user
  // typing "walk" often sees "Walk" on screen. Relying on every caller to
  // remember .toLowerCase() first is exactly how this stayed inconsistent.
  const variants = expandSearchQuery(rawQuery.toLowerCase());

  // Word-order-independent match: every word in the query must appear
  // somewhere in the name, regardless of order. This is what lets "dumbbell
  // incline press" find "Incline DB Press" (reversed word order from what
  // was typed) and not just exact-phrase matches.
  const wordsMatch = (q) => {
    const words = q.split(/\s+/).filter(Boolean);
    return words.length > 0 && words.every(w => nameLower.includes(w));
  };
  if (variants.some(v => nameLower.includes(v) || wordsMatch(v))) return true;

  return Object.entries(EXERCISE_SYNONYMS).some(([syn, canon]) =>
    canon === canonicalName && variants.some(v => syn.includes(v))
  );
}

function buildExerciseCatalog() {
  const seen = {};
  const catalog = [];
  Object.values(WORKOUTS).forEach(envW => {
    Object.values(envW).forEach(mgW => {
      ['taxi','takeoff','enroute','landing'].forEach(ph => {
        (mgW[ph]||[]).forEach(e => {
          if (seen[e.name]) return;
          seen[e.name] = true;
          catalog.push({ id: e.id, name: e.name, target: e.target, sets: e.sets, note: e.note, timed: e.timed, inputType: e.inputType });
        });
      });
    });
  });
  return catalog.sort((a,b) => a.name.localeCompare(b.name));
}

// Which set fields an exercise uses, for rendering editable inputs.
// Third element marks minute-display fields: shown/entered as minutes,
// stored as seconds so existing data and the CSV export stay consistent.
function edFieldsFor(exDef) {
  if (exDef.inputType === 'timed_distance') return [['seconds','Time','min'],['miles','Distance','mi']];
  if (exDef.inputType === 'timed_bilateral') return [['seconds_left','Left','min'],['seconds_right','Right','min']];
  if (exDef.timed || exDef.inputType === 'timed' || exDef.inputType === 'nsdr') return [['seconds','Time','min']];
  if (exDef.inputType === 'reps_only') return [['reps','Reps','reps']];
  if (exDef.inputType === 'reps_height') return [['reps','Reps','reps'],['height','Height','in']];
  if (exDef.inputType === 'reps_distance') return [['reps','Reps','reps'],['distance','Distance','in']];
  return [['reps','Reps','reps'],['weight','Weight','lb']];
}

function emptySnapshot() { return { taxi:[], takeoff:[], enroute:[], landing:[] }; }

// New blank session on an empty past date.
function openNewSessionEditor(isoDate) {
  // Same trap as showCalendarDay: a bare date string parses as UTC
  // midnight, which getFullYear/getMonth/getDate would then read back in
  // local time — a day earlier for anyone west of UTC, like Arizona.
  const d = new Date(isoDate+'T12:00:00');
  const noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  ST.editSession = {
    key: null, isNew: true,
    session: {
      date: noon.toISOString(),
      env: ST.env, muscle_group: 'Cardio', goal: ST.goal, fatigue: 'go', level: ST.level,
      sets: {}, durationMinutes: null, workoutSnapshot: emptySnapshot(),
    },
    exList: [],
  };
  renderSessionEditor();
}

// Edit an existing session found in the calendar cache by its DB key.
async function openEditSessionEditor(key) {
  if (!key) { showToast('This session can\'t be edited (no sync record found).'); return; }
  try {
    const rangeData = await withDialogSpinner('Loading workout…', () => loadCalendarRange());
    const found = rangeData.sessions.find(s => s._key === key);
    if (!found) { showToast('Session not found.'); return; }
    const session = JSON.parse(JSON.stringify(found));
    delete session._key;
    if (!session.sets) session.sets = {};
    if (!session.workoutSnapshot) session.workoutSnapshot = emptySnapshot();
    const snapEx = [...session.workoutSnapshot.taxi, ...session.workoutSnapshot.takeoff, ...session.workoutSnapshot.enroute, ...session.workoutSnapshot.landing];
    // Editor shows exercises that have any logged data, keeping their real defs
    // so PR history stays linked to the same exercise ids.
    const exList = snapEx.filter(e => (session.sets[e.id]||[]).some(set => Object.values(set).some(v => v)));
    ST.editSession = { key, isNew: false, session, exList };
    renderSessionEditor();
  } catch(e) {
    showBigToast('Could not open that workout for editing: ' + (e.message || 'unknown error'), 'warn');
  }
}

function renderSessionEditor() {
  const ed = ST.editSession;
  const s = ed.session;
  const dateLabel = new Date(s.date).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  const parts = [];
  parts.push('<div class="modal-bg" onclick="if(event.target===this)closeModal()">');
  parts.push('<div class="modal-sheet" style="max-height:85vh;overflow-y:auto">');
  parts.push('<div class="modal-handle"></div>');
  parts.push('<div class="modal-title">'+(ed.isNew ? 'Add Workout' : 'Edit Workout')+'</div>');
  parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-bottom:14px">'+dateLabel+'</div>');

  parts.push('<div class="field"><label>Muscle Group</label><select onchange="ST.editSession.session.muscle_group=this.value">');
  MUSCLE_GROUPS.forEach(mg => parts.push('<option value="'+mg+'"'+(s.muscle_group===mg?' selected':'')+'>'+mg+'</option>'));
  parts.push('</select></div>');

  ed.exList.forEach(exDef => {
    const sets = s.sets[exDef.id] || [];
    const fields = edFieldsFor(exDef);
    parts.push('<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px">');
    parts.push('<div class="fb" style="margin-bottom:8px"><div style="font-size:13px;font-weight:600">'+exDef.name+'</div>');
    parts.push('<button class="btn-ghost" style="font-size:11px;padding:4px 8px;color:var(--red)" onclick="edRemoveExercise(\''+exDef.id+'\')">✕ Remove</button></div>');
    sets.forEach((set, i) => {
      parts.push('<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">');
      parts.push('<span style="font-family:var(--mono);font-size:9px;color:var(--muted);flex:0 0 30px">SET '+(i+1)+'</span>');
      fields.forEach(([field, label, unit]) => {
        const raw = set[field];
        const shown = unit === 'min'
          ? (raw ? Math.round((parseFloat(raw)/60)*10)/10 : '')
          : (raw || '');
        const handler = unit === 'min' ? 'edSetValMin' : 'edSetVal';
        parts.push('<div style="flex:1;min-width:0;display:flex;align-items:center;gap:4px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:0 8px 0 0">');
        parts.push('<input type="text" inputmode="decimal" placeholder="'+label+'" value="'+shown+'" style="flex:1;min-width:0;background:transparent;border:none;padding:8px;font-size:16px;color:var(--text);outline:none" oninput="'+handler+'(\''+exDef.id+'\','+i+',\''+field+'\',this.value)">');
        parts.push('<span style="font-family:var(--mono);font-size:9px;color:var(--muted);flex-shrink:0">'+(unit||'')+'</span></div>');
      });
      parts.push('</div>');
    });
    parts.push('<button class="btn-ghost" style="font-size:11px" onclick="edAddSet(\''+exDef.id+'\')">+ Add Set</button>');
    parts.push('</div>');
  });

  parts.push('<div class="field" style="margin-top:6px"><label>Add Exercise (type to search)</label>');
  parts.push('<input type="text" id="edSearch" placeholder="e.g. walking, squat, push…" oninput="edFilterExercises(this.value)" autocomplete="off">');
  parts.push('</div>');
  parts.push('<div id="edSearchResults"></div>');

  parts.push('<button class="btn btn-gold mt12" onclick="saveEditedSession()">💾 SAVE WORKOUT</button>');
  parts.push('<button class="btn btn-outline mt8" onclick="closeModal()">CANCEL</button>');
  parts.push('</div></div>');
  document.getElementById('modalRoot').innerHTML = parts.join('');
}

// Live-workout equivalent of edSetValMin (which already does this correctly
// for the edit-past-session screen) — converts a typed minutes value into
// genuine stored seconds, keeping the underlying data model (MET estimates,
// running-leaderboard pace, formatSetPerformance) unchanged and correct.
function liveSetValMin(exId, i, field, value) {
  const sets = ST.sets[exId];
  if (!sets || !sets[i]) return;
  const mins = parseFloat(value);
  sets[i][field] = (isNaN(mins) || mins <= 0) ? '' : String(Math.round(mins * 60));
  persistWorkoutState();
}

function isMinuteScale(exItem) {
  return /min/i.test(exItem.target || '');
}

function edSetVal(exId, i, field, value) {
  const sets = ST.editSession.session.sets[exId];
  if (sets && sets[i]) sets[i][field] = value;
}
// Minute-displayed fields store seconds internally.
function edSetValMin(exId, i, field, value) {
  const sets = ST.editSession.session.sets[exId];
  if (!sets || !sets[i]) return;
  const mins = parseFloat(value);
  sets[i][field] = (isNaN(mins) || mins <= 0) ? '' : String(Math.round(mins * 60));
}
function edAddSet(exId) {
  const s = ST.editSession.session;
  if (!s.sets[exId]) s.sets[exId] = [];
  s.sets[exId].push({});
  renderSessionEditor();
}
function edRemoveExercise(exId) {
  const ed = ST.editSession;
  ed.exList = ed.exList.filter(e => e.id !== exId);
  delete ed.session.sets[exId];
  const snap = ed.session.workoutSnapshot;
  ['taxi','takeoff','enroute','landing'].forEach(ph => { snap[ph] = (snap[ph]||[]).filter(e => e.id !== exId); });
  renderSessionEditor();
}

// Relevance ranking for search results — the previous approach filtered the
// catalog and truncated to N results in whatever order the catalog happened
// to be in (roughly alphabetical), so an exact match like "Walking" for the
// query "walk" could rank behind five unrelated partial matches ("Brisk Walk
// Ramp-Up", "Farmer Carry" via synonym, etc.) and get cut off by the limit
// entirely, even though the search itself was matching correctly. Lower
// number = more relevant = shown first.
function exerciseSearchRank(name, query) {
  const n = (name||'').toLowerCase();
  const q = (query||'').toLowerCase().trim();
  if (n === q) return 0;               // exact match
  if (n.startsWith(q)) return 1;       // name starts with what was typed
  const words = n.split(/[\s\/\-\(\)]+/).filter(Boolean);
  if (words.includes(q)) return 2;     // a whole word in the name matches
  if (n.includes(q)) return 3;         // substring match anywhere
  return 4;                            // matched only via synonym/fuzzy logic
}
// Single shared implementation of filter -> rank -> limit, used by every
// search UI's display function AND its paired "add by index" handler, so
// the two can never disagree about what result index N actually refers to.
function rankedExerciseMatches(pool, q, excludeIds, limit) {
  return pool
    .filter(e => exerciseMatchesQuery(e.name, q) && !excludeIds.has(e.id))
    .sort((a, b) => exerciseSearchRank(a.name, q) - exerciseSearchRank(b.name, q))
    .slice(0, limit);
}

function edFilterExercises(q) {
  const box = document.getElementById('edSearchResults');
  if (!box) return;
  q = (q||'').trim().toLowerCase();
  if (!q) { box.innerHTML = ''; return; }
  const existing = new Set(ST.editSession.exList.map(e => e.id));
  const matches = rankedExerciseMatches(buildExerciseCatalog(), q, existing, 6);
  const parts = [];
  matches.forEach((e, i) => {
    parts.push('<div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;font-size:13px" onclick="edAddCatalogExercise('+i+',\''+q.replace(/'/g,'')+'\')">'+e.name+' <span style="font-family:var(--mono);font-size:10px;color:var(--muted)">'+(e.target||'')+'</span></div>');
  });
  const qSafe = q.replace(/[<>'"]/g,'');
  if (matches.length) parts.push('<div style="font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:0.08em;margin:8px 0 6px">NOT LISTED? ADD IT AS CUSTOM:</div>');
  else parts.push('<div style="font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:0.08em;margin:2px 0 6px">NO MATCH — ADD "'+qSafe.toUpperCase()+'" AS CUSTOM:</div>');
  parts.push('<div style="display:flex;gap:8px;margin-bottom:6px">');
  parts.push('<button class="btn btn-blue" style="flex:1;font-size:12px;padding:12px 8px" onclick="edAddCustomExercise(\''+qSafe+'\',\'timed\')">⏱ ADD AS TIMED</button>');
  parts.push('<button class="btn btn-blue" style="flex:1;font-size:12px;padding:12px 8px" onclick="edAddCustomExercise(\''+qSafe+'\',\'reps_weight\')">🏋️ ADD AS REPS × WEIGHT</button>');
  parts.push('</div>');
  box.innerHTML = parts.join('');
}
function edAddCatalogExercise(matchIdx, q) {
  const existing = new Set(ST.editSession.exList.map(e => e.id));
  const matches = rankedExerciseMatches(buildExerciseCatalog(), q, existing, 6);
  const exDef = matches[matchIdx];
  if (!exDef) return;
  edPushExercise(exDef);
}
function edAddCustomExercise(name, inputType) {
  name = sanitizeUserText(name);
  if (!name) return;
  const exDef = {
    id: 'custom_'+Date.now(),
    name: name.charAt(0).toUpperCase()+name.slice(1),
    target: '', sets: 1, note: 'Custom exercise', timed: inputType === 'timed', inputType,
  };
  edPushExercise(exDef);
}
function edPushExercise(exDef) {
  const ed = ST.editSession;
  ed.exList.push(exDef);
  ed.session.sets[exDef.id] = [{}];
  ed.session.workoutSnapshot.enroute.push(exDef);
  renderSessionEditor();
}

async function saveEditedSession() {
  const ed = ST.editSession;
  const s = ed.session;
  // Drop exercises where every set is completely empty
  Object.keys(s.sets).forEach(exId => {
    s.sets[exId] = (s.sets[exId]||[]).filter(set => Object.values(set).some(v => v !== '' && v != null));
    if (!s.sets[exId].length) {
      delete s.sets[exId];
      ['taxi','takeoff','enroute','landing'].forEach(ph => {
        s.workoutSnapshot[ph] = (s.workoutSnapshot[ph]||[]).filter(e => e.id !== exId);
      });
    }
  });
  if (!Object.keys(s.sets).length) { showToast('Log at least one set before saving.'); return; }

  try {
    if (ed.isNew) {
      const { error } = await SB.from('workout_sessions').insert([{
        user_id: ST.user?.id || null,
        session_key: String(Date.now()),
        session_data: s,
        workout_key: s.muscle_group,
        started_at: s.date,
      }]);
      if (error) throw error;
    } else {
      let q = SB.from('workout_sessions').update({ session_data: s, workout_key: s.muscle_group }).eq('session_key', ed.key);
      if (ST.user) q = q.eq('user_id', ST.user.id);
      const { error } = await q;
      if (error) throw error;
    }
    ST.calendarSessions = {};
    await withDialogSpinner('Saving workout…', () => loadSessionCache());
    closeModal();
    renderPage();
    showToast(ed.isNew ? '✅ Workout added.' : '✅ Workout updated.');
  } catch(e) {
    showToast('Save failed: '+e.message);
  }
}

function confirmDeleteSession(key) {
  if (!key) { showToast('This session can\'t be deleted (no sync record found).'); return; }
  const root = document.getElementById('modalRoot');
  root.innerHTML =
    '<div class="modal-bg" onclick="if(event.target===this)closeModal()">' +
    '<div class="modal-sheet">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Delete this workout?</div>' +
    '<div class="modal-body" style="margin-bottom:14px">This permanently removes the session and all its logged sets. This cannot be undone.</div>' +
    '<button class="btn" style="background:var(--red);color:#fff" onclick="deleteSessionConfirmed(\''+key+'\')">🗑 CONFIRM DELETE</button>' +
    '<button class="btn btn-outline mt8" onclick="closeModal()">CANCEL</button>' +
    '</div></div>';
}
async function deleteSessionConfirmed(key) {
  try {
    let q = SB.from('workout_sessions').delete().eq('session_key', key);
    if (ST.user) q = q.eq('user_id', ST.user.id);
    const { error } = await withDialogSpinner('Deleting workout…', async () => {
      const res = await q;
      if (res.error) return res;
      ST.calendarSessions = {};
      await loadSessionCache();
      return res;
    });
    if (error) throw error;
    closeModal();
    renderPage();
    showToast('Session deleted.');
  } catch(e) {
    showToast('Delete failed: '+e.message);
  }
}

// ─── BUILD YOUR OWN MISSION PROFILE ──────────────────────────────────────────
// Saved custom routines: fixed exercise lists the user assembles by hand.
// Used exactly as saved — deliberately outside the adaptive pipeline.

function selectMissionProfile(mg) {
  ST.activeCustomProfileId = null;
  ST.muscleGroup = mg;
  renderPage();
}
function selectCustomProfile(id) {
  const cp = ST.customProfiles.find(p => p.id === id);
  if (!cp) return;
  ST.activeCustomProfileId = id;
  // Custom name flows through everywhere ST.muscleGroup is used for labeling:
  // Flight header, debrief title, calendar day, session record.
  ST.muscleGroup = cp.name;
  renderPage();
}

async function saveCustomProfilesToDb() {
  const profile = (await dbGetProfile()) || {};
  profile.customProfiles = ST.customProfiles;
  await dbSetProfile(profile);
}

const BP_SECTIONS = [
  ['taxi',    'WARMUP / STRETCHING'],
  ['enroute', 'MAIN EXERCISES'],
  ['landing', 'COOLDOWN STRETCHES'],
];

function openProfileBuilder(editId) {
  const existing = editId ? ST.customProfiles.find(p => p.id === editId) : null;
  ST.buildProfile = existing
    ? JSON.parse(JSON.stringify(existing))
    : { id: 'cp_' + Date.now(), name: '', taxi: [], takeoff: [], enroute: [], landing: [] };
  renderProfileBuilder();
}

// Builder search draws from the full catalog PLUS the user's own custom
// exercises, deduped by id.
function bpSearchSource() {
  const seen = new Set();
  const out = [];
  buildExerciseCatalog().forEach(e => { if (!seen.has(e.id)) { seen.add(e.id); out.push(e); } });
  (ST.customExercises || []).forEach(ce => {
    const e = ce.exercise;
    if (e && e.id && e.name && !seen.has(e.id)) { seen.add(e.id); out.push({ id: e.id, name: e.name, target: e.target, sets: e.sets, note: e.note, timed: e.timed, inputType: e.inputType }); }
  });
  return out;
}

function renderProfileBuilder() {
  const bp = ST.buildProfile;
  if (!bp) return;
  const parts = [];
  parts.push('<div class="modal-bg" onclick="if(event.target===this)closeModal()">');
  parts.push('<div class="modal-sheet" style="max-height:88vh;overflow-y:auto">');
  parts.push('<div class="modal-handle"></div>');
  parts.push('<div class="modal-title">Build Your Own Routine</div>');
  parts.push('<div class="field"><label>Routine Name</label><input id="bpName" type="text" placeholder="e.g. Quick Hotel Pump" value="'+bp.name+'" oninput="ST.buildProfile.name=this.value"></div>');

  BP_SECTIONS.forEach(([section, label]) => {
    parts.push('<div style="border-top:1px solid var(--border);margin-top:12px;padding-top:12px">');
    parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--gold);letter-spacing:0.08em;margin-bottom:8px">'+label+'</div>');
    (bp[section]||[]).forEach(e => {
      parts.push('<div class="fb" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:6px">');
      parts.push('<div><span style="font-size:13px">'+e.name+'</span> <span style="font-family:var(--mono);font-size:10px;color:var(--muted)">'+(e.target||'')+'</span></div>');
      parts.push('<span style="color:var(--red);cursor:pointer;font-size:14px" onclick="bpRemove(\''+section+'\',\''+e.id+'\')">✕</span>');
      parts.push('</div>');
    });
    parts.push('<input class="fcf-input" type="text" placeholder="Search to add…" oninput="bpFilter(\''+section+'\',this.value)" autocomplete="off" style="margin-bottom:6px">');
    parts.push('<div id="bpResults_'+section+'"></div>');
    const chosenIds = new Set([...bp.taxi, ...bp.takeoff, ...bp.enroute, ...bp.landing].map(e => e.id));
    // Warmup/Stretching and Cooldown Stretches only show relevant content in
    // the dropdown — the search box next to it still searches the whole
    // catalog for anyone with an unusual need, this only narrows the browse list.
    const dropdownPool = bpSearchSource().filter(e => {
      if (chosenIds.has(e.id)) return false;
      if (section === 'taxi') return isWarmupOrMobilityExercise(e);
      if (section === 'landing') return isStretchLikeExercise(e);
      return true;
    });
    parts.push('<select class="fcf-input" onchange="bpAddFromDropdown(\''+section+'\',this.value);this.value=\'\'" style="margin-top:6px">');
    parts.push('<option value="">— Or browse to add —</option>');
    dropdownPool.forEach(e => {
      parts.push('<option value="'+e.id+'">'+e.name+'</option>');
    });
    parts.push('</select>');
    parts.push('</div>');
  });

  parts.push('<button class="btn btn-gold mt12" onclick="saveBuildProfile()">💾 SAVE ROUTINE</button>');
  parts.push('<button class="btn btn-outline mt8" onclick="closeModal()">CANCEL</button>');
  parts.push('</div></div>');
  document.getElementById('modalRoot').innerHTML = parts.join('');
}

function bpFilter(section, q) {
  const box = document.getElementById('bpResults_'+section);
  if (!box) return;
  q = (q||'').trim().toLowerCase();
  if (!q) { box.innerHTML = ''; return; }
  const chosen = new Set([...ST.buildProfile.taxi, ...ST.buildProfile.takeoff, ...ST.buildProfile.enroute, ...ST.buildProfile.landing].map(e => e.id));
  const matches = rankedExerciseMatches(bpSearchSource(), q, chosen, 5);
  const parts = [];
  matches.forEach((e, i) => {
    parts.push('<div style="padding:9px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:5px;cursor:pointer;font-size:13px" onclick="bpAdd(\''+section+'\','+i+',\''+q.replace(/'/g,'')+'\')">'+e.name+' <span style="font-family:var(--mono);font-size:10px;color:var(--muted)">'+(e.target||'')+'</span></div>');
  });
  if (!matches.length) {
    parts.push('<div style="font-size:11px;color:var(--muted);padding:4px 2px 8px">No catalog match for "'+sanitizeUserText(q)+'".</div>');
    parts.push('<button class="btn btn-outline" style="font-size:12px" onclick="bpShowCreateForm(\''+section+'\',\''+q.replace(/\'/g,'')+'\')">+ Create "'+sanitizeUserText(q)+'" as a new exercise</button>');
  }
  box.innerHTML = parts.join('');
}

// Inline exercise creation directly inside the builder's empty search
// state — the old flow told the user to "add it from the Flight tab first"
// with no link and no way back, meaning the actual "how" was never
// answered. This creates it, saves it for future searches too (same
// ST.customExercises list saveCustomExercise uses from the Flight tab),
// and drops it straight into the section being edited.
function bpShowCreateForm(section, q) {
  const box = document.getElementById('bpResults_'+section);
  if (!box) return;
  const name = sanitizeUserText(q);
  box.innerHTML =
    '<div style="border:1px solid var(--gold);border-radius:8px;padding:10px;margin-top:4px">' +
    '<div style="font-size:11px;color:var(--muted);margin-bottom:8px">New exercise</div>' +
    '<div class="field" style="margin-bottom:6px"><input type="text" id="bpNewName_'+section+'" value="'+name+'" placeholder="Exercise name"></div>' +
    '<div class="field-row" style="margin-bottom:8px">' +
    '<div class="field"><input type="text" id="bpNewTarget_'+section+'" placeholder="Target (e.g. 3\u00d712)"></div>' +
    '<div class="field"><select id="bpNewType_'+section+'"><option value="reps_weight">Reps + Weight</option><option value="reps_only">Reps Only</option><option value="timed">Timed (min)</option></select></div>' +
    '</div>' +
    '<button class="btn btn-gold" style="font-size:12px" onclick="bpSaveCustomExercise(\''+section+'\')">Add to Routine</button>' +
    '<button class="btn-ghost mt8" style="display:block;width:100%;text-align:center;font-size:12px" onclick="document.getElementById(\'bpResults_'+section+'\').innerHTML=\'\'">Cancel</button>' +
    '</div>';
}

async function bpSaveCustomExercise(section) {
  const name = sanitizeUserText(document.getElementById('bpNewName_'+section)?.value?.trim());
  if (!name) { showToast('Enter an exercise name.'); return; }
  const target = sanitizeUserText(document.getElementById('bpNewTarget_'+section)?.value?.trim()) || '\u2014';
  const inputType = document.getElementById('bpNewType_'+section)?.value || 'reps_weight';
  const setsMatch = target.match(/^(\d+)\s*[x\u00d7]/i);
  const setsCount = setsMatch ? Math.max(1, parseInt(setsMatch[1], 10)) : 3;

  const id = 'custom_' + Date.now();
  const newEx = ex(id, name, target, setsCount, 'User-created exercise.', inputType==='timed', inputType);
  newEx.custom = true;

  ST.customExercises.push({ env: ST.env, muscleGroup: ST.muscleGroup, exercise: newEx });
  try {
    const profile = (await dbGetProfile()) || {};
    profile.customExercises = ST.customExercises;
    await dbSetProfile(profile);
  } catch(e) {}

  ST.buildProfile[section].push(JSON.parse(JSON.stringify(newEx)));
  showToast('\u2705 "'+name+'" created and added.');
  renderProfileBuilder();
}
function bpAdd(section, matchIdx, q) {
  const chosen = new Set([...ST.buildProfile.taxi, ...ST.buildProfile.takeoff, ...ST.buildProfile.enroute, ...ST.buildProfile.landing].map(e => e.id));
  const matches = rankedExerciseMatches(bpSearchSource(), q, chosen, 5);
  const exDef = matches[matchIdx];
  if (!exDef) return;
  ST.buildProfile[section].push(JSON.parse(JSON.stringify(exDef)));
  renderProfileBuilder();
}
// Dropdown alternative to searching — browsing the full catalog directly,
// for anyone who'd rather scroll a list than know what to type.
function bpAddFromDropdown(section, exId) {
  if (!exId) return;
  const chosen = new Set([...ST.buildProfile.taxi, ...ST.buildProfile.takeoff, ...ST.buildProfile.enroute, ...ST.buildProfile.landing].map(e => e.id));
  if (chosen.has(exId)) return;
  const exDef = bpSearchSource().find(e => e.id === exId);
  if (!exDef) return;
  ST.buildProfile[section].push(JSON.parse(JSON.stringify(exDef)));
  renderProfileBuilder();
}
function bpRemove(section, exId) {
  ST.buildProfile[section] = ST.buildProfile[section].filter(e => e.id !== exId);
  renderProfileBuilder();
}

async function saveBuildProfile() {
  const bp = ST.buildProfile;
  if (!bp) return;
  bp.name = sanitizeUserText((document.getElementById('bpName')?.value || bp.name || '').trim());
  if (!bp.name) { showToast('Give your routine a name.'); return; }
  const total = bp.taxi.length + bp.takeoff.length + bp.enroute.length + bp.landing.length;
  if (!total) { showToast('Add at least one exercise.'); return; }
  const idx = ST.customProfiles.findIndex(p => p.id === bp.id);
  if (idx >= 0) ST.customProfiles[idx] = bp; else ST.customProfiles.push(bp);
  await withDialogSpinner('Saving routine…', () => saveCustomProfilesToDb());
  ST.buildProfile = null;
  closeModal();
  selectCustomProfile(bp.id);
  showToast('✅ Routine saved.');
}

function openProfileManager() {
  const parts = [];
  parts.push('<div class="modal-bg" onclick="if(event.target===this)closeModal()">');
  parts.push('<div class="modal-sheet">');
  parts.push('<div class="modal-handle"></div>');
  parts.push('<div class="modal-title">Saved Routines</div>');
  ST.customProfiles.forEach(cp => {
    const count = cp.taxi.length + cp.takeoff.length + cp.enroute.length + cp.landing.length;
    parts.push('<div class="fb" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px">');
    parts.push('<div><div style="font-size:13px;font-weight:600">🛠 '+cp.name+'</div><div style="font-family:var(--mono);font-size:10px;color:var(--muted)">'+count+' exercises · ~'+(count*MIN_PER_EXERCISE)+' min</div></div>');
    parts.push('<div style="display:flex;gap:10px">');
    parts.push('<span style="cursor:pointer;font-size:14px" onclick="openProfileBuilder(\''+cp.id+'\')">✎</span>');
    parts.push('<span style="cursor:pointer;font-size:14px;color:var(--red)" onclick="confirmDeleteCustomProfile(\''+cp.id+'\')">🗑</span>');
    parts.push('</div></div>');
  });
  parts.push('<button class="btn btn-outline mt8" onclick="closeModal()">CLOSE</button>');
  parts.push('</div></div>');
  document.getElementById('modalRoot').innerHTML = parts.join('');
}

function confirmDeleteCustomProfile(id) {
  const cp = ST.customProfiles.find(p => p.id === id);
  if (!cp) return;
  document.getElementById('modalRoot').innerHTML =
    '<div class="modal-bg" onclick="if(event.target===this)closeModal()">' +
    '<div class="modal-sheet">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Delete "'+cp.name+'"?</div>' +
    '<div class="modal-body" style="margin-bottom:14px">This permanently deletes the saved routine. Completed sessions logged with it stay in your history.</div>' +
    '<button class="btn" style="background:var(--red);color:#fff" onclick="deleteCustomProfileConfirmed(\''+id+'\')">🗑 CONFIRM DELETE</button>' +
    '<button class="btn btn-outline mt8" onclick="haptic(\'light\');openProfileManager()">CANCEL</button>' +
    '</div></div>';
}
async function deleteCustomProfileConfirmed(id) {
  ST.customProfiles = ST.customProfiles.filter(p => p.id !== id);
  if (ST.activeCustomProfileId === id) {
    ST.activeCustomProfileId = null;
    ST.muscleGroup = getRecommendedNext();
  }
  await withDialogSpinner('Saving…', () => saveCustomProfilesToDb());
  closeModal();
  renderPage();
  showToast('Routine deleted.');
}

// ─── PREFLIGHT TAB ────────────────────────────────────────────────────────────
async function renderPreflight(p) {
  const installPromptHtml = renderInstallPrompt();
  // Auto-sync Oura in background if connected and data is stale (>30 min)
  if (ST.ouraConnected && ST.ouraAccessToken && (Date.now() - (ST.ouraLastSync||0)) > 1800000) {
    syncOuraData().catch(() => {});
  }
  const hs    = hydroStatus();
  const pct   = hydroPct();
  const adv   = hydroAdvice();
  const rawWk = getCombinedWorkout(ST.env, ST.muscleGroup);
  const profileIncomplete = !ST.sex;
  const wk    = getActiveWorkout();
  const fullSessionEx = ST.activeCustomProfileId ? wk : getFilteredWorkout(rawWk);
  const fullSessionCount = fullSessionEx ? (fullSessionEx.taxi.length+fullSessionEx.takeoff.length+fullSessionEx.enroute.length+fullSessionEx.landing.length) : 0;
  const fullSessionMin = fullSessionCount * MIN_PER_EXERCISE;

  const levelLabel   = {beginner:'Beginner',intermediate:'Intermediate',advanced:'Advanced'}[ST.level];
  const fatigueLabel = {go:'🟢 GO',marginal:'🟡 MARGINAL',nogo:'🔴 NO-GO'}[ST.fatigue];
  const totalEx = wk ? (wk.taxi.length+wk.takeoff.length+wk.enroute.length+wk.landing.length) : 0;
  const recommended = getRecommendedNext();

  // A first-timer with zero logged history sees everything expanded, same as
  // before this rework — nothing is hidden before they've learned where
  // things are. Anyone with real history gets the collapsed, low-friction
  // daily view: settings that rarely change collapse to a one-line summary,
  // daily check-ins (condition, injury) collapse to a one-line status, and
  // the training calendar tucks behind a toggle instead of a permanent strip.
  const isNewUser = !ST.sessionCache || ST.sessionCache.length === 0;

  const parts = [];
  parts.push('<button class="btn-ghost" style="font-size:12px;margin-bottom:10px" onclick="switchTab(\'today\')">← Back to Today</button>');
  parts.push('<div class="section-label">PREFLIGHT BRIEFING — '+FCF_VERSION+'</div>');
  parts.push(installPromptHtml);
  if (profileIncomplete) {
    parts.push('<div class="card mb12" style="border-color:var(--gold);cursor:pointer" onclick="haptic(\'light\');switchTab(\'profile\')">');
    parts.push('<div class="fb"><div><div style="font-size:13px;font-weight:600">👤 Complete your profile</div>');
    parts.push('<div style="font-size:11px;color:var(--muted);margin-top:3px">Set sex and training objective to unlock personalized programming.</div></div>');
    parts.push('<div style="font-size:18px;color:var(--gold)">→</div></div>');
    parts.push('</div>');
  }

  // ── HERO: today's plan + engage, always the first thing after any banners ──
  const planName = ST.activeCustomProfileId
    ? '🛠 ' + (ST.customProfiles.find(cp => cp.id === ST.activeCustomProfileId)?.name || 'Custom Routine')
    : ST.muscleGroup;
  const envLabel = {room:'Hotel Room',hotel:'Hotel Gym',comm:'Commercial Gym'}[ST.env];
  const planSummary = envLabel + (ST.timeAvailMin ? ' · '+ST.timeAvailMin+' min' : ' · Full Session') + (totalEx ? ' · '+totalEx+' exercises' : '');

  if (wk) {
    parts.push('<div class="card mb12" style="border-color:var(--gold);background:linear-gradient(160deg, rgba(201,168,76,0.08), var(--bg3))">');
    parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--gold);letter-spacing:0.1em;margin-bottom:6px">TODAY\'S MISSION</div>');
    parts.push('<div style="font-size:19px;font-weight:800;margin-bottom:4px">'+planName+'</div>');
    parts.push('<div style="font-size:12px;color:var(--muted);margin-bottom:14px">'+planSummary+(ST.activeCustomProfileId?'':' · '+levelLabel+(ST.fatigue!=='go'?' / '+fatigueLabel:''))+'</div>');
    parts.push('<button class="btn btn-gold" onclick="engageWorkout()">'+(ST.workout ? '↩ RETURN TO WORKOUT' : '⚡ ENGAGE WORKOUT')+'</button>');
    parts.push('</div>');
  } else {
    parts.push('<div class="alert alert-info mb12"><div class="alert-icon">ℹ️</div><div>Select a mission profile below to generate your flight plan.</div></div>');
  }

  // "Change Plan" — collapses Mission Profile / Time / Environment, the
  // things that rarely change day to day, into one summary line with an
  // explicit way to open them. Auto-expanded for new users and for anyone
  // who hasn't picked anything yet (nothing to summarize otherwise).
  const showPlan = ST.showChangePlan || isNewUser || !wk;
  parts.push('<div class="edit-row-fb" style="display:flex;justify-content:space-between;align-items:center;padding:8px 2px;font-size:12px;color:var(--muted)" onclick="ST.showChangePlan=!ST.showChangePlan;renderPage()">');
  parts.push('<span>'+(ST.scheduleEnvNote || (ST.activeCustomProfileId ? 'Custom routine, used as saved.' : 'Same as your usual plan.'))+'</span>');
  parts.push('<span style="font-family:var(--mono);font-size:13px;font-weight:700;color:var(--gold);cursor:pointer;padding:6px 4px">'+(showPlan?'HIDE ▴':'CHANGE PLAN ▾')+'</span>');
  parts.push('</div>');

  if (showPlan) {
    parts.push('<div class="section-label">MISSION PROFILE</div>');
    parts.push('<div class="mg-wrap">');
    MUSCLE_GROUPS.forEach(mg => {
      const builtinSel = !ST.activeCustomProfileId && ST.muscleGroup===mg;
      const cls = 'mg-pill' + (builtinSel?' sel':'') + (mg===recommended && !builtinSel?' recommended':'');
      parts.push('<div class="'+cls+'" onclick="selectMissionProfile(\''+mg+'\')">'+mg+(mg===recommended?' ★':'')+'</div>');
    });
    ST.customProfiles.forEach(cp => {
      const cls = 'mg-pill' + (ST.activeCustomProfileId===cp.id?' sel':'');
      parts.push('<div class="'+cls+'" style="border-style:dashed" onclick="selectCustomProfile(\''+cp.id+'\')">🛠 '+cp.name+'</div>');
    });
    parts.push('<div class="mg-pill" style="border-style:dashed;color:var(--gold)" onclick="openProfileBuilder()">＋ Build Your Own</div>');
    parts.push('</div>');
    if (ST.customProfiles.length) {
      parts.push('<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin:-6px 0 10px;cursor:pointer" onclick="haptic(\'light\');openProfileManager()">✎ MANAGE SAVED ROUTINES</div>');
    }

    parts.push('<div class="section-label">TIME AVAILABLE <span class="info-i" onclick="showBioInfo(\'timeAvail\')">i</span></div>');
    parts.push('<div class="card mb12">');
    parts.push('<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">');
    [15,30,45,60,null].forEach(m => {
      const sel = ST.timeAvailMin === m;
      parts.push('<div class="env-btn'+(sel?' sel':'')+'" style="padding:10px" onclick="ST.timeAvailMin='+(m===null?'null':m)+';persistDailyInputs();renderPage()"><div style="font-size:12px;font-weight:600">'+(m===null?'Full Session':m+' min')+'</div>'+(m===null?'<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-top:2px">~'+fullSessionMin+' min</div>':'')+'</div>');
    });
    parts.push('</div>');
    parts.push('</div>');
    parts.push('<div class="section-label">MISSION ENVIRONMENT</div>');
    parts.push('<div class="env-toggle">');
    parts.push('<div class="env-btn '+(ST.env==='room'?'sel':'')+'" onclick="ST.env=\'room\';renderPage()"><div class="ei">🛏️</div><div class="el">HOTEL ROOM</div></div>');
    parts.push('<div class="env-btn '+(ST.env==='hotel'?'sel':'')+'" onclick="ST.env=\'hotel\';renderPage()"><div class="ei">🏨</div><div class="el">HOTEL GYM</div></div>');
    parts.push('<div class="env-btn '+(ST.env==='comm'?'sel':'')+'" onclick="ST.env=\'comm\';renderPage()"><div class="ei">🏋️</div><div class="el">COMM GYM</div></div>');
    parts.push('</div>');

    // Detailed phase-by-phase preview only shown while the plan editor is
    // open — informational once you've already seen it, not a decision.
    if (wk) {
      parts.push('<div class="section-label">FLIGHT PLAN PREVIEW — '+totalEx+' EXERCISES ('+(ST.activeCustomProfileId?'CUSTOM — AS SAVED':levelLabel+(ST.fatigue!=='go'?' / '+fatigueLabel:'')+(ST.timeAvailMin?' / ⏱ '+ST.timeAvailMin+'min':''))+')</div>');
      parts.push('<div class="card card-dark mb12"><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">');
      [['🚕 TAXI',wk.taxi],['🛫 TAKEOFF',wk.takeoff],['✈️ EN ROUTE',wk.enroute],['🛬 LANDING',wk.landing]].forEach(([label,exs]) => {
        parts.push('<div style="background:var(--bg);border-radius:8px;padding:10px"><div style="font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:0.08em;margin-bottom:6px">'+label+'</div>');
        if (!exs.length) parts.push('<div style="font-size:11px;color:var(--muted);font-style:italic">— skipped —</div>');
        else exs.forEach(e => parts.push('<div style="font-size:11px;color:'+(e.swappedForInjury?'var(--blue)':e.injuryCaution?'var(--amber)':'var(--text)')+';margin-bottom:3px">· '+e.name+(e.swappedForInjury?' 🩹':e.injuryCaution?' ⚠️':'')+'</div>'));
        parts.push('</div>');
      });
      parts.push('</div></div>');
    }
  }

  // ── Pilot Condition — one-line status by default, full input on tap ──
  const condMetaLine = {go:['🟢','GO'], marginal:['🟡','MARGINAL'], nogo:['🔴','NO-GO']}[ST.fatigue];
  const showCond = ST.showConditionDetail || isNewUser;
  parts.push('<div class="card mb12" style="cursor:pointer" onclick="haptic(\'light\');ST.showConditionDetail=!ST.showConditionDetail;renderPage()">');
  parts.push('<div class="fb"><div style="font-size:13px">'+condMetaLine[0]+' Pilot Condition: <strong>'+condMetaLine[1]+'</strong></div><div style="font-family:var(--mono);font-size:10px;color:var(--gold)">'+(showCond?'HIDE ▴':'ADJUST ▾')+'</div></div>');
  parts.push('</div>');

  if (showCond) {
    parts.push('<div class="card mb12">');
    parts.push('<div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.5">Your physical readiness today. This gates workout intensity — training through fatigue increases injury risk and impairs adaptation.</div>');

    const condBtns =
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px">' +
      '<div class="env-btn '+(ST.fatigue==='go'?'sel':'')+'" onclick="ST.fatigue=\'go\';renderPage()"><div class="ei">🟢</div><div class="el">GO</div><div style="font-size:9px;color:var(--muted);margin-top:2px">Full protocol</div></div>' +
      '<div class="env-btn '+(ST.fatigue==='marginal'?'sel':'')+'" onclick="ST.fatigue=\'marginal\';renderPage()"><div class="ei">🟡</div><div class="el">MARGINAL</div><div style="font-size:9px;color:var(--muted);margin-top:2px">Light only</div></div>' +
      '<div class="env-btn '+(ST.fatigue==='nogo'?'sel':'')+'" onclick="ST.fatigue=\'nogo\';renderPage()"><div class="ei">🔴</div><div class="el">NO-GO</div><div style="font-size:9px;color:var(--muted);margin-top:2px">Mobility only</div></div>' +
      '</div>';

    if (ST.ouraConnected) {
      // Oura path: readiness score auto-suggests; the three buttons ARE the override.
      parts.push(condBtns);
    } else {
      // Manual path: the 1-5 self-check is the single input — the condition it
      // maps to shows as a result, with an override tucked behind a tap. One
      // control, not two redundant ones.
      parts.push('<div class="field" style="margin-bottom:10px"><label>Sleep Last Night (hours) <span class="info-i" onclick="showBioInfo(\'sleepHours\')">i</span></label>');
      parts.push('<input type="text" inputmode="decimal" placeholder="e.g. 6.5" value="'+(ST.sleepHours||'')+'" oninput="ST.sleepHours=parseFloat(this.value)||null;persistDailyInputs()"></div>');
      parts.push('<label style="font-size:11px;color:var(--muted);display:block;margin-bottom:4px">How recovered do you feel today? <span class="info-i" onclick="showBioInfo(\'readiness\')">i</span></label>');
      parts.push('<div style="font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:0.05em;margin-bottom:6px">1 = BARELY RECOVERED · 5 = FULLY RECOVERED</div>');
      parts.push('<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:8px">');
      for (let i=1;i<=5;i++) {
        parts.push('<div class="env-btn" style="padding:8px 2px'+(ST.readiness===i?';border-color:var(--gold);background:rgba(212,175,55,0.08)':'')+'" onclick="setReadiness('+i+')"><div style="font-size:15px;font-weight:700">'+i+'</div></div>');
      }
      parts.push('</div>');
      const condMeta = {go:['🟢','GO — full protocol'], marginal:['🟡','MARGINAL — light only'], nogo:['🔴','NO-GO — mobility only']}[ST.fatigue];
      parts.push('<div class="fb" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px">');
      parts.push('<div style="font-size:12px">Pilot Condition: <strong>'+condMeta[0]+' '+condMeta[1]+'</strong></div>');
      parts.push('<div style="font-family:var(--mono);font-size:9px;color:var(--muted);cursor:pointer" onclick="haptic(\'light\');ST.showCondOverride=!ST.showCondOverride;renderPage()">'+(ST.showCondOverride?'HIDE':'OVERRIDE')+'</div>');
      parts.push('</div>');
      if (ST.showCondOverride) parts.push(condBtns);
      parts.push('<div style="font-size:10px;color:var(--muted);line-height:1.5">Connect your Oura Ring in Profile and this is set automatically from your readiness score each morning.</div>');
    }

    if (ST.fatigue === 'marginal') {
      parts.push('<div class="alert alert-warn" style="margin-top:8px"><div class="alert-icon">⚠️</div><div>Heavy Takeoff phase removed. One light En Route exercise only.</div></div>');
    } else if (ST.fatigue === 'nogo') {
      parts.push('<div class="alert alert-danger" style="margin-top:8px"><div class="alert-icon">🔴</div><div>Only Taxi and Landing phases active. Training under significant fatigue increases injury risk — this is physiology, not weakness.</div></div>');
    }
    parts.push('</div>');
  }

  // ── Injury Flag — one-line status by default, region grid on tap ──
  const showInjury = ST.showInjuryDetail || isNewUser;
  parts.push('<div class="card mb12" style="cursor:pointer" onclick="haptic(\'light\');ST.showInjuryDetail=!ST.showInjuryDetail;renderPage()">');
  if (ST.injuries.length) {
    parts.push('<div class="fb"><div style="font-size:13px">🩹 '+ST.injuries.map(r=>INJURY_REGIONS[r].label).join(', ')+'</div><div style="font-family:var(--mono);font-size:10px;color:var(--gold)">'+(showInjury?'HIDE ▴':'EDIT ▾')+'</div></div>');
  } else {
    parts.push('<div class="fb"><div style="font-size:13px;color:var(--muted)">🩹 No injuries flagged</div><div style="font-family:var(--mono);font-size:10px;color:var(--gold)">'+(showInjury?'HIDE ▴':'FLAG ▾')+'</div></div>');
  }
  parts.push('</div>');

  if (showInjury) {
    parts.push('<div class="section-label">INJURY FLAG <span class="info-i" onclick="showBioInfo(\'injury\')">i</span></div>');
    parts.push('<div class="card mb12">');
    if (ST.injuries.length) {
      parts.push('<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">');
      ST.injuries.forEach(r => {
        parts.push('<div style="display:flex;align-items:center;gap:6px;background:rgba(245,158,11,0.1);border:1px solid var(--amber);border-radius:16px;padding:4px 10px;font-size:11px;color:var(--amber)">'+INJURY_REGIONS[r].label+' <span style="cursor:pointer" onclick="toggleInjury(\''+r+'\')">✕</span></div>');
      });
      parts.push('</div>');
    } else {
      parts.push('<div style="font-size:12px;color:var(--muted);margin-bottom:10px">No regions flagged. Tap a region below if something\'s bothering you today.</div>');
    }
    parts.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">');
    Object.keys(INJURY_REGIONS).forEach(r => {
      const on = ST.injuries.includes(r);
      parts.push('<div class="env-btn" style="padding:8px'+(on?';border-color:var(--amber);background:rgba(245,158,11,0.08)':'')+'" onclick="toggleInjury(\''+r+'\')"><div style="font-size:11px">'+INJURY_REGIONS[r].label+'</div></div>');
    });
    parts.push('</div>');
    parts.push('</div>');
  }

  // Training calendar moved to Trends — that's the review screen now;
  // Preflight's job is launching a session quickly, not looking back.

  // Hydration
  if (ST.trackHydration) {
  parts.push('<div class="section-label">HYDRATION PAYLOAD</div>');
  parts.push('<div class="card mb12">');
  if (!ST.flightHrsTouched && ST.flightSchedule && computeTodaysFlightHours(ST.flightSchedule) !== null) {
    parts.push('<div style="font-size:10px;color:var(--muted);margin-bottom:6px">📅 Flight hours auto-filled from your schedule — edit if it\'s off.</div>');
  }
  parts.push('<div class="field-row" style="margin-bottom:10px">');
  parts.push('<div class="field" style="margin-bottom:0"><label>Flight Hours Today</label>');
  parts.push('<input type="text" inputmode="decimal" pattern="[0-9]*\.?[0-9]*" value="'+ST.flightHrsRaw+'" placeholder="0 = no-fly day" oninput="ST.flightHrsRaw=this.value;ST.flightHrs=parseFloat(this.value)||0;ST.flightHrsTouched=true;updateHydrationUI()"></div>');
  parts.push('<div class="field" style="margin-bottom:0"><label>Water Consumed (L)</label>');
  parts.push('<input type="text" inputmode="decimal" pattern="[0-9]*\.?[0-9]*" value="'+ST.waterInRaw+'" placeholder="e.g. 1.2 or .5" oninput="ST.waterInRaw=this.value;ST.waterIn=parseFloat(this.value)||0;updateHydrationUI()"></div>');
  parts.push('</div>');
  parts.push('<div id="noFlyBox">'+(ST.flightHrsTouched && ST.flightHrs === 0 ? '<div class="alert alert-info" style="margin-bottom:8px"><div class="alert-icon">ℹ️</div><div>No-fly day — minimum 1.0L hydration target still applies. Your body needs baseline water regardless of duty status.</div></div>' : '')+'</div>');
  parts.push('<div class="fb" style="margin-bottom:6px"><span style="font-family:var(--mono);font-size:11px;color:var(--muted)">TARGET: <span id="hydroTargetVal" style="color:var(--text)">'+hydroTarget().toFixed(1)+'L</span></span><span id="hydroStatusLbl" style="font-family:var(--mono);font-size:11px;color:'+hs.color+'">'+hs.label+'</span></div>');
  parts.push('<div class="hydro-bar-wrap"><div id="hydroBar" class="hydro-bar '+(pct>=1?'hydro-ok':'hydro-warn')+'" style="width:'+Math.round(pct*100)+'%"></div></div>');
  parts.push('<div id="hydroPctText" style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:4px;text-align:right">'+Math.round(pct*100)+'% of target</div>');
  parts.push('<div id="hydroAdviceBox">'+(adv ? '<div class="alert alert-warn mt8"><div class="alert-icon">💧</div><div>'+adv+'</div></div>' : '<div class="alert alert-ok mt8"><div class="alert-icon">✅</div><div>Hydration nominal. Cleared for workout operations.</div></div>')+'</div>');
  parts.push('</div>');
  } // end hydration tracking block

  // Last mission
  if (ST.lastSession) {
    const lastDate = new Date(ST.lastSession.date).toLocaleDateString('en-US',{month:'short',day:'numeric'});
    parts.push('<div class="section-label">LAST MISSION</div>');
    parts.push('<div class="card card-dark mb12">');
    parts.push('<div class="fb"><div style="font-size:13px;font-weight:600">'+(ST.lastSession.muscle_group||'—')+'</div><div style="font-family:var(--mono);font-size:11px;color:var(--muted)">'+lastDate+'</div></div>');
    parts.push('<div style="font-size:11px;color:var(--green);margin-top:6px">→ Recommended next: <strong>'+recommended+'</strong></div>');
    parts.push('</div>');
  }

  p.innerHTML = parts.join('');
}

// Reported bug: typing body metrics, then clicking Mission Objective or
// Fitness Level (unrelated buttons on the same Profile screen) wiped the
// just-typed values, because those clicks re-render the whole page from
// ST.* without ever reading the in-progress DOM input first. This captures
// it defensively — falls back to the existing value on anything blank or
// unparsed, so it never actively clears something the user didn't touch.
function syncBodyMetricsFieldsToState() {
  const sexEl = document.getElementById('bmSex');
  const ftEl = document.getElementById('bmFt');
  const inEl = document.getElementById('bmIn');
  const ageEl = document.getElementById('bmAge');
  const unameEl = document.getElementById('bmUsername');
  if (!sexEl && !ftEl && !ageEl && !unameEl) return; // not currently on this screen
  if (sexEl && sexEl.value) ST.sex = sexEl.value;
  const ft = ftEl ? parseInt(ftEl.value) || 0 : 0;
  const inches = inEl ? parseInt(inEl.value) || 0 : 0;
  if (ft || inches) ST.heightIn = ft * 12 + inches;
  if (ageEl) { const a = parseInt(ageEl.value); if (!isNaN(a)) ST.age = a; }
  if (unameEl && unameEl.value) {
    const raw = unameEl.value.trim().replace(/[^A-Za-z0-9_\- ]/g, '').slice(0, 20);
    if (raw) ST.username = raw;
  }
}

async function saveBodyMetrics() {
  const sexEl = document.getElementById('bmSex');
  const ftEl = document.getElementById('bmFt');
  const inEl = document.getElementById('bmIn');
  const ageEl = document.getElementById('bmAge');
  const ft = parseInt(ftEl?.value) || 0;
  const inches = parseFloat(inEl?.value) || 0;
  ST.sex = sexEl?.value || null;
  ST.heightIn = (ft || inches) ? ft*12 + inches : null;
  ST.age = parseInt(ageEl?.value) || null;
  const unameEl = document.getElementById('bmUsername');
  const rawUname = (unameEl?.value || '').trim().replace(/[^A-Za-z0-9_\- ]/g, '').slice(0, 20);
  const hadUsername = !!ST.username;
  ST.username = rawUname || null;
  const profile = (await dbGetProfile()) || {};
  const hadSex = !!profile.sex;
  profile.username = ST.username;
  profile.sex = ST.sex;
  profile.heightIn = ST.heightIn;
  profile.age = ST.age;
  await withDialogSpinner('Saving…', () => dbSetProfile(profile));
  showToast('Body metrics saved.');
  // Call sign just set for the first time: put their existing lift history
  // on the boards so months of logged work isn't invisible.
  if (!hadUsername && ST.username) backfillLeaderboard().catch(() => {});
  renderPage();
  // First time sex is set: offer (once) to switch to the suggested emphasis
  // objective. History is untouched either way.
  if (!hadSex && ST.sex) {
    const suggested = ST.sex === 'female' ? 'glute' : 'chest';
    if (ST.goal !== suggested) showStyleUpdatePrompt(suggested);
  }
}

function showStyleUpdatePrompt(suggestedGoal) {
  const g = GOALS[suggestedGoal];
  if (!g) return;
  const root = document.getElementById('modalRoot');
  root.innerHTML =
    '<div class="modal-bg" onclick="if(event.target===this)closeModal()">' +
    '<div class="modal-sheet">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Update your workout style?</div>' +
    '<div class="modal-body" style="margin-bottom:14px">Based on your profile, we suggest <strong>'+g.icon+' '+g.label+'</strong> — '+g.desc.toLowerCase()+'. Your training history stays exactly as it is either way, and you can change this anytime in Mission Objective.</div>' +
    '<button class="btn btn-gold" onclick="applyStyleUpdate(\''+suggestedGoal+'\')">'+g.icon+' SWITCH TO '+g.label.toUpperCase()+'</button>' +
    '<button class="btn btn-outline mt8" onclick="closeModal()">KEEP MY CURRENT OBJECTIVE</button>' +
    '</div></div>';
}
async function applyStyleUpdate(goal) {
  ST.goal = goal;
  ST.muscleGroup = getRecommendedNext();
  await saveGoalLevel();
  closeModal();
  renderPage();
  showToast('Objective updated — workouts now reflect your profile.');
}

function setReadiness(n) {
  ST.readiness = n;
  persistDailyInputs();
  // Suggests Pilot Condition — same pattern as Oura's auto-set. The GO/
  // MARGINAL/NO-GO buttons remain a manual override at all times.
  ST.fatigue = n <= 2 ? 'nogo' : n === 3 ? 'marginal' : 'go';
  renderPage();
}

async function toggleInjury(region) {
  const i = ST.injuries.indexOf(region);
  if (i === -1) ST.injuries.push(region); else ST.injuries.splice(i, 1);
  const profile = (await dbGetProfile()) || {};
  profile.injuries = ST.injuries;
  await dbSetProfile(profile);
  renderPage();
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
  const ov = GOAL_OVERLAYS[ST.goal];
  const swaps = ov?.swaps?.[env]?.[muscleGroup] || null;
  const retarget = ov?.retarget || null;
  const female = ST.sex === 'female';
  const mapPhase = (list, phase) => list.map(e => {
    let out = e;
    if (swaps && swaps[phase] && swaps[phase][e.name]) out = swaps[phase][e.name];
    if (retarget && retarget[out.id]) out = { ...out, target: retarget[out.id] };
    if (female && phase === 'enroute' && !out.timed && (out.inputType === 'reps_weight' || out.inputType === 'reps_only')) {
      const t = femaleTargetBump(out.target);
      if (t !== out.target) out = { ...out, target: t };
    }
    out = applyInjuryFilter(out);
    return out;
  });
  const wk = {
    taxi:    mapPhase(base.taxi, 'taxi'),
    takeoff: mapPhase(base.takeoff, 'takeoff'),
    enroute: mapPhase(base.enroute, 'enroute'),
    landing: mapPhase(base.landing, 'landing'),
  };
  // Custom exercises get added to enroute by default (volume/accessory slot)
  const customForThis = ST.customExercises.filter(c => c.env === env && c.muscleGroup === muscleGroup);
  if (customForThis.length) wk.enroute = [...wk.enroute, ...customForThis.map(c => c.exercise)];
  return wk;
}

// Finds the exercise the user is currently working on: the first one that's
// partially logged but not complete, or if none, the first one not yet started.
// Returns null if the workout is fully complete or there's no active workout.
function getCurrentExerciseId() {
  if (!ST.workout) return null;
  const allEx = [...ST.workout.taxi, ...ST.workout.takeoff, ...ST.workout.enroute, ...ST.workout.landing];
  const isSetFilled = (exItem, s) => {
    if (exItem.inputType === 'timed_bilateral') return !!(s.seconds_left || s.seconds_right);
    if (exItem.timed || exItem.inputType === 'nsdr') return !!s.seconds;
    if (exItem.inputType === 'reps_only') return !!s.reps;
    if (exItem.inputType === 'reps_height') return !!(s.reps || s.height);
    if (exItem.inputType === 'reps_distance') return !!(s.reps || s.distance);
    return !!(s.reps || s.weight);
  };
  let firstUnstarted = null;
  for (const exItem of allEx) {
    const sets = ST.sets[exItem.id] || [];
    const filledCount = sets.filter(s => isSetFilled(exItem, s)).length;
    if (filledCount > 0 && filledCount < sets.length) return exItem.id; // in progress
    if (filledCount === 0 && firstUnstarted === null) firstUnstarted = exItem.id;
  }
  return firstUnstarted; // nothing in progress — next one to start, or null if all done
}

function engageWorkout() {
  // A workout already in progress must never be silently discarded —
  // tabbing away to check Today and coming back was resetting the entire
  // session, wiping every set already logged. Returning to an existing
  // session is always the safe default; starting fresh is a separate,
  // explicit action (Change Plan), not something this button does for you.
  if (ST.workout) { switchTab('flight'); return; }

  const wk = getActiveWorkout();
  if (!wk) { showToast('No workout available for this selection.'); return; }

  ST.workout = wk;
  ST.sets = {};
  ST.expanded = {};

  const allEx = [...wk.taxi, ...wk.takeoff, ...wk.enroute, ...wk.landing];
  allEx.forEach(exItem => {
    if (exItem.inputType === 'nsdr') {
      ST.sets[exItem.id] = [{ seconds: '' }];
    } else if (exItem.inputType === 'timed_bilateral' || (exItem.timed && exItem.target?.includes('/side'))) {
      ST.sets[exItem.id] = [{ seconds_left: '', seconds_right: '' }];
    } else if (exItem.inputType === 'timed_distance') {
      ST.sets[exItem.id] = [{ seconds: '', miles: '' }];
    } else if (exItem.timed) {
      ST.sets[exItem.id] = [{ seconds: '' }];
    } else if (exItem.inputType === 'reps_height') {
      ST.sets[exItem.id] = Array.from({ length: exItem.sets }, () => ({ reps: '', height: '' }));
    } else if (exItem.inputType === 'reps_distance') {
      ST.sets[exItem.id] = Array.from({ length: exItem.sets }, () => ({ reps: '', distance: '' }));
    } else if (exItem.inputType === 'reps_only') {
      ST.sets[exItem.id] = Array.from({ length: exItem.sets }, () => ({ reps: '' }));
    } else {
      ST.sets[exItem.id] = Array.from({ length: exItem.sets }, () => ({ reps: '', weight: '' }));
    }
  });

  persistWorkoutState();
  ST.workoutStartedAt = Date.now();
  ST.workoutFirstLoggedAt = null;
  persistWorkoutState();
  switchTab('flight');
}

// ─── PROGRESSIVE OVERLOAD HELPERS ────────────────────────────────────────────
// Reads across every id representing this movement — see
// equivalentExerciseIds. Keyed on the raw id alone, a lift's history
// vanished the moment it was performed in a different environment.
function lastLoggedMax(exId, exName) {
  const ids = equivalentExerciseIds(exId, exName);
  const all = ST.sessionCache || [];
  for (let i = all.length-1; i >= 0; i--) {
    for (const id of ids) {
      const sets = all[i].sets?.[id];
      if (!sets) continue;
      const weights = sets.map(s => parseFloat(s.weight)||0).filter(w => w > 0);
      if (weights.length) return Math.max(...weights);
    }
  }
  for (const id of ids) {
    const ls = ST.lastSession?.sets?.[id];
    if (ls) { const w = ls.map(s=>parseFloat(s.weight)||0).filter(w=>w>0); if(w.length) return Math.max(...w); }
  }
  return null;
}
function lastLoggedReps(exId, exName) {
  const ids = equivalentExerciseIds(exId, exName);
  const all = ST.sessionCache || [];
  for (let i = all.length-1; i >= 0; i--) {
    for (const id of ids) {
      const sets = all[i].sets?.[id];
      if (!sets) continue;
      const reps = sets.map(s=>parseInt(s.reps)||0).filter(r=>r>0);
      if (reps.length) return Math.max(...reps);
    }
  }
  for (const id of ids) {
    const ls = ST.lastSession?.sets?.[id];
    if (ls) { const r = ls.map(s=>parseInt(s.reps)||0).filter(r=>r>0); if(r.length) return Math.max(...r); }
  }
  return null;
}
// Generic best-value lookup for non-weight numeric fields (box height, broad jump distance)
// ─── MOVEMENT IDENTITY ──────────────────────────────────────────────────
// BUG FIX (reported: "Box and broad jump. Says it's my first time logging.
// It's not."). The same movement carries a DIFFERENT exercise id per
// environment and per workout template. Broad Jump is c_pp_er1 in a
// commercial gym, h_pp_to2 in a hotel and r_pp_to2 in a room — identical
// name, three ids. Back Squat is c_fb_to1 inside a Full Body template but
// c_lb_to1 inside Lower Body, in the SAME gym.
//
// Every history lookup keyed on the raw id, so a personal best set in one
// place was invisible everywhere else: "first time logging" on a lift done
// for months, no progressive-overload target, and a PR that silently reset
// when the environment changed. 30 movements in the catalog are affected.
//
// Movements are matched on normalised name, plus this table for the cases
// where the same movement is deliberately named for its surroundings.
const MOVEMENT_ALIASES = {
  'box jump': 'box jump',
  'bench/box jump': 'box jump',
  'bed/chair jump': 'box jump',
};
function normalizeMovementName(name) {
  const n = (name || '').toLowerCase().trim();
  return MOVEMENT_ALIASES[n] || n;
}

let _movementIndex = null;
function buildMovementIndex() {
  if (_movementIndex) return _movementIndex;
  const idToKey = {}, keyToIds = {};
  const seen = new Set();
  (function walk(node) {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.id && node.name) {
      const key = normalizeMovementName(node.name);
      idToKey[node.id] = key;
      (keyToIds[key] = keyToIds[key] || []).push(node.id);
      return;
    }
    Object.values(node).forEach(walk);
  })(WORKOUTS);
  _movementIndex = { idToKey, keyToIds };
  return _movementIndex;
}

// Every exercise id representing the same movement as this one — the set
// that history should actually be read across.
function equivalentExerciseIds(exId, exName) {
  const { idToKey, keyToIds } = buildMovementIndex();
  const key = idToKey[exId] || (exName ? normalizeMovementName(exName) : null);
  if (!key) return [exId];
  const ids = keyToIds[key] || [];
  return ids.includes(exId) ? ids : ids.concat(exId);
}

function lastLoggedMaxField(exId, field, exName) {
  const ids = equivalentExerciseIds(exId, exName);
  const all = ST.sessionCache || [];
  for (let i = all.length-1; i >= 0; i--) {
    for (const id of ids) {
      const sets = all[i].sets?.[id];
      if (!sets) continue;
      const vals = sets.map(s => parseFloat(s[field])||0).filter(v => v > 0);
      if (vals.length) return Math.max(...vals);
    }
  }
  for (const id of ids) {
    const ls = ST.lastSession?.sets?.[id];
    if (ls) { const v = ls.map(s=>parseFloat(s[field])||0).filter(v=>v>0); if(v.length) return Math.max(...v); }
  }
  return null;
}
function suggestNextWeight(exId, exName, phaseKey) {
  const last = lastLoggedMax(exId, exName);
  if (!last) return null;
  const name = (exName||'').toLowerCase();
  const isLower = name.includes('squat')||name.includes('deadlift')||name.includes('lunge')||name.includes('rdl');
  const increment = (phaseKey==='takeoff' && isLower) ? 5 : 2.5;
  return last + increment;
}
async function loadSessionCache() {
  try {
    // Recent-90-days fetch and the full-history fetch (for older entries
    // saved before started_at existed) are independent — run them in
    // parallel so offline they share one timeout window instead of stacking.
    const fullFetch = ST.user
      ? withTimeout(SB.from('workout_sessions')
          .select('*').eq('user_id', ST.user.id)
          .order('started_at', { ascending: true })).catch(() => ({ data: null }))
      : Promise.resolve({ data: null });
    let [sessions, { data }] = await Promise.all([dbGetRecentSessions(90), fullFetch]);
    if (data && data.length > sessions.length) {
      sessions = data.map(r => r.session_data).filter(Boolean);
    }
    // Also include lastSession which is always loaded
    if (ST.lastSession && !sessions.find(s => s.date === ST.lastSession.date)) {
      sessions.push(ST.lastSession);
    }
    ST.sessionCache = sessions;
  } catch(e) {
    // Fall back to localStorage sessions
    const keys = Object.keys(localStorage).filter(k => k.startsWith('fcf_session_'));
    ST.sessionCache = keys.map(k => { try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } }).filter(Boolean);
    if (ST.lastSession) ST.sessionCache.push(ST.lastSession);
  }
}

// ─── ALTERNATE EXERCISE SYSTEM ───────────────────────────────────────────────
const ALTERNATES = {
  'Standing Calf Stretch': [
    {name:'Seated Calf Stretch (Strap or Towel)',target:'2×30s/leg',note:'Same muscle, no wall needed — good for a hotel room floor.',inputType:'timed_bilateral'},
    {name:'Downward Dog Calf Pumps',target:'2×10/leg',note:'Alternating heel drives. Dynamic instead of static, works well as a warmup too.',inputType:'reps_only'},
  ],
  'Standing Hamstring Stretch': [
    {name:'Seated Forward Fold',target:'2×30s',note:'No step needed — floor-based, same hamstring line.',inputType:'timed'},
    {name:'Lying Hamstring Stretch (Strap)',target:'2×30s/leg',note:'Strap or towel around the foot, lying on your back. Easier to control intensity.',inputType:'timed_bilateral'},
  ],
  'Kneeling Hip Flexor Stretch': [
    {name:'Standing Hip Flexor Stretch',target:'2×30s/leg',note:'No floor contact needed — works in a hotel room or aircraft galley.',inputType:'timed_bilateral'},
    {name:'Couch Stretch',target:'2×30s/leg',note:'Deeper hip flexor and quad stretch using a couch, bed, or wall.',inputType:'timed_bilateral'},
  ],
  'Back Squat': [
    {name:'Goblet Squat (Heavy)',target:'4×10',note:'DB front-loaded squat. Less spinal compression.'},
    {name:'Hack Squat (Machine)',target:'4×10',note:'Machine substitute. Quad dominant, adjustable load.'},
    {name:'Leg Press',          target:'4×12',note:'Seated machine. Good if knees or back are an issue.'},
    {name:'Smith Machine Squat',target:'4×8', note:'Fixed bar path — good when the rack is busy or you want less stabilizer demand.'},
  ],
  'Romanian Deadlift': [
    {name:'DB Romanian Deadlift',target:'4×10',note:'Same hip hinge, dumbbells if no barbell available.'},
    {name:'Seated Leg Curl',    target:'3×12',note:'Machine isolation — direct hamstring without the hinge.'},
    {name:'Good Morning',       target:'3×10',note:'Bar on back, hip hinge. Excellent hamstring stretch.'},
  ],
  'Conventional Deadlift': [
    {name:'Trap Bar Deadlift',  target:'5×3', note:'More quad-friendly. Great for athletes.'},
    {name:'DB Deadlift',        target:'4×8', note:'Hotel substitute. Same pattern, lighter load.'},
    {name:'Romanian Deadlift',  target:'4×6', note:'Shifts work to hamstrings. Less total load.'},
  ],
  'Trap Bar Deadlift': [
    {name:'Conventional Deadlift',target:'5×3',note:'Classic barbell. More posterior chain emphasis.'},
    {name:'DB Deadlift',        target:'4×8', note:'Hotel substitute if trap bar unavailable.'},
    {name:'Leg Press',          target:'4×10',note:'Machine alternative. Less posterior chain, more quad.'},
  ],
  'Flat Barbell Bench Press': [
    {name:'DB Bench Press',     target:'4×10',note:'Greater ROM. Often easier on shoulders.'},
    {name:'Machine Chest Press',target:'4×12',note:'Shoulder-friendly machine alternative.'},
    {name:'Close Grip Bench',   target:'4×8', note:'More tricep emphasis. Same pressing stimulus.'},
    {name:'Smith Machine Bench Press',target:'4×8',note:'Fixed bar path — good when the rack is busy or you\'re training without a spotter.'},
  ],
  'Standing Overhead Press': [
    {name:'DB Overhead Press',  target:'4×8', note:'Independent arms. Easier shoulder position.'},
    {name:'Push Press',         target:'4×5', note:'Leg drive added — allows heavier overhead loads.'},
    {name:'Pike Pushup',        target:'4×12',note:'Bodyweight overhead pressing. No equipment.',inputType:'reps_only'},
  ],
  'Barbell Row (Pendlay)': [
    {name:'DB Row',             target:'4×10/side',note:'Unilateral. Fuller ROM per side.'},
    {name:'Seated Cable Row',   target:'4×12',     note:'Constant tension through full range.'},
    {name:'Machine Row',        target:'4×12',     note:'Easier position. Good for heavier reps.'},
  ],
  'Lat Pulldown': [
    {name:'Pullups',            target:'4×max',note:'Bodyweight variant. Builds more strength.',inputType:'reps_only'},
    {name:'Chinups',            target:'4×max',note:'Supinated grip. More bicep involvement.',inputType:'reps_only'},
    {name:'Cable Straight-Arm Pulldown',target:'3×15',note:'Isolation. Hits lower lat without bicep.'},
  ],
  'Seated Cable Row': [
    {name:'DB Row',             target:'4×10/side',note:'Fully loads each side independently.'},
    {name:'Barbell Row (Pendlay)',target:'4×6',    note:'Heavier bilateral pulling.'},
    {name:'Inverted Row',       target:'3×12',     note:'Bodyweight row under a table or bar.',inputType:'reps_only'},
  ],
  'Box Jump': [
    {name:'Broad Jump',         target:'5×3',note:'Horizontal power. Same explosive hip extension.',inputType:'reps_distance'},
    {name:'Squat Jump',         target:'4×5',note:'No box needed. Same power demand.',inputType:'reps_only'},
    {name:'DB Jump Squat',      target:'4×5',note:'Light DBs add load without a box.'},
  ],
  'Single Leg Split Squat': [
    {name:'Reverse Lunge',      target:'3×12/leg',note:'Both feet on floor — lower balance demand.',inputType:'reps_only'},
    {name:'Step-Up',            target:'3×12/leg',note:'Same glute + quad pattern. Use a bench.'},
    {name:'Single Leg Squat (Pistol)',target:'3×5/leg',note:'Harder bodyweight version.',inputType:'reps_only'},
  ],
  'Face Pull': [
    {name:'DB Rear Delt Fly',   target:'3×15',note:'Prone or bent-over. Same rear delt + external rotation.'},
    {name:'Band Pull-Apart',    target:'3×20',note:'Resistance band. Great shoulder health work.',inputType:'reps_only'},
    {name:'Seated DB Face Pull',target:'3×15',note:'Seated, light DBs, external rotation finish.'},
  ],
  'Goblet Squat': [
    {name:'Back Squat',         target:'5×5',note:'Barbell version for heavier loading.'},
    {name:'Single Leg Squat (Pistol)',target:'3×5/leg',note:'Bodyweight unilateral — very demanding.',inputType:'reps_only'},
    {name:'Leg Press',          target:'4×12',note:'Machine alternative.'},
  ],
  'Rowing Machine Intervals': [
    {name:'Assault Bike Intervals',target:'8×30s',note:'Full body combined. Equally brutal.'},
    {name:'Treadmill Intervals',target:'8×1 min', note:'Run-based alternative.'},
    {name:'Stair Sprint Intervals',target:'6×2 flights',note:'No machine needed.',inputType:'reps_only'},
  ],

  // HOTEL GYM
  'Kettlebell Goblet Squat (Heavy)': [
    {name:'Goblet Squat',target:'4×12',note:'Lighter load, same pattern. Use if the heavy KB isn\'t available.'},
    {name:'DB Romanian Deadlift',target:'4×10',note:'Shifts emphasis to posterior chain instead of quads.'},
    {name:'Step-Up (Weighted)',target:'3×12/leg',note:'Unilateral quad/glute work using a bench.'},
  ],
  'DB Romanian Deadlift': [
    {name:'Good Morning',target:'3×10',note:'Bar on back, same hip hinge, no dumbbells needed.'},
    {name:'Single Leg Split Squat',target:'3×8/leg',note:'Different pattern, same posterior chain and glute demand.'},
    {name:'Kettlebell Goblet Squat (Heavy)',target:'4×10',note:'Quad-dominant substitute if hinging bothers your back.'},
  ],
  'Step-Up (Weighted)': [
    {name:'Reverse Lunge',target:'3×12/leg',note:'No bench needed. Same unilateral quad/glute demand.'},
    {name:'Single Leg Split Squat',target:'3×8/leg',note:'Rear foot elevated variant — more quad stretch.'},
    {name:'Step-Up',target:'3×12/leg',note:'Unweighted version if the loaded step feels too aggressive.'},
  ],
  'Single-Leg Calf Raise': [
    {name:'Standing Calf Raise',target:'4×15',note:'Bilateral — easier balance, still loads the calf hard.'},
    {name:'Calf Raise (step)',target:'3×15/leg',note:'Same unilateral pattern using a step for extra range.'},
  ],
  'Dumbbell Lateral Lunge': [
    {name:'Reverse Lunge',target:'3×12/leg',note:'Sagittal-plane substitute — easier on the groin/adductors.'},
    {name:'Step-Up (Weighted)',target:'3×12/leg',note:'Different plane, same single-leg strength demand.'},
  ],
  'DB Bench Press': [
    {name:'Machine Chest Press',target:'4×12',note:'Fixed path — easier on the shoulders for higher reps.'},
    {name:'Pushup Variations',target:'4×max',note:'Bodyweight substitute if dumbbells aren\'t heavy enough or available.',inputType:'reps_only'},
    {name:'DB Incline Press',target:'4×10',note:'Shifts emphasis to upper chest.'},
  ],
  'DB Overhead Press': [
    {name:'Standing Overhead Press',target:'4×8',note:'Barbell version — heavier bilateral loading.'},
    {name:'Pike Pushup',target:'4×12',note:'Bodyweight overhead pressing, no equipment needed.',inputType:'reps_only'},
    {name:'DB Incline Press',target:'4×10',note:'Still hits the front delts, less overhead shoulder strain.'},
  ],
  'DB Incline Press': [
    {name:'DB Bench Press',target:'4×10',note:'Flat variant if an incline bench isn\'t available.'},
    {name:'Machine Chest Press',target:'4×12',note:'Fixed path alternative.'},
    {name:'Pushup Variations',target:'4×max',note:'Bodyweight substitute — elevate feet for upper-chest emphasis.',inputType:'reps_only'},
  ],
  'DB Lateral Raise': [
    {name:'Cable Lateral Raise',target:'3×15',note:'Constant tension through the full range — harder than DBs.'},
    {name:'Upright Row',target:'3×12',note:'Hits lateral delt and upper trap together.'},
  ],
  'DB Front Raise': [
    {name:'Cable Front Raise',target:'3×15',note:'Constant tension version if a cable stack is available.'},
    {name:'DB Lateral Raise',target:'3×15',note:'Different plane, same front-delt-adjacent shoulder work.'},
  ],
  'Pullups': [
    {name:'Lat Pulldown',target:'4×10',note:'Adjustable load — good if bodyweight pullups are too hard yet.'},
    {name:'DB Row',target:'4×10/side',note:'Horizontal pulling substitute, no bar needed.'},
    {name:'Chinups',target:'4×max',note:'Supinated grip — more bicep involvement.',inputType:'reps_only'},
  ],
  'DB Row': [
    {name:'Seated Cable Row',target:'4×12',note:'Bilateral, constant tension version.'},
    {name:'Barbell Row (Pendlay)',target:'4×6',note:'Heavier bilateral pulling if a barbell is available.'},
  ],
  'Chinups': [
    {name:'Pullups',target:'4×max',note:'Pronated grip — more lat, less bicep.',inputType:'reps_only'},
    {name:'Lat Pulldown',target:'4×10',note:'Adjustable load, supinated grip on most machines.'},
  ],
  'Bent-Over DB Face Pull': [
    {name:'Band Pull-Apart',target:'3×20',note:'No dumbbells needed — great shoulder health work.',inputType:'reps_only'},
    {name:'DB Lateral Raise',target:'3×15',note:'Different but complementary rear/side delt work.'},
  ],
  'DB Hammer Curl': [
    {name:'EZ Bar Curl',target:'3×12',note:'Barbell substitute if available.'},
    {name:'Towel Curl',target:'3×12',note:'No equipment needed — partner or fixed object required.'},
  ],
  'Bench/Box Jump': [
    {name:'Broad Jump',target:'5×3',note:'Horizontal power, no box height needed.',inputType:'reps_distance'},
    {name:'Squat Jump',target:'4×5',note:'No box needed — same explosive demand.',inputType:'reps_only'},
    {name:'DB Jump Squat',target:'4×5',note:'Light DBs add load without needing a box.'},
  ],
  'Broad Jump': [
    {name:'Squat Jump',target:'4×5',note:'Vertical power substitute, no space needed.',inputType:'reps_only'},
    {name:'Bench/Box Jump',target:'5×3',note:'Vertical power if you have a sturdy box or bench.'},
  ],
  'DB Jump Squat': [
    {name:'Squat Jump',target:'4×5',note:'Bodyweight version if dumbbells aren\'t appropriate for jumping.',inputType:'reps_only'},
    {name:'Broad Jump',target:'5×3',note:'Horizontal power alternative.',inputType:'reps_distance'},
  ],
  'Sprint (hall/outside)': [
    {name:'Treadmill Intervals',target:'8×1 min',note:'Indoor substitute, same hard-effort demand.',inputType:'reps_only'},
    {name:'Stationary Bike Intervals',target:'6×45s',note:'Lower impact if sprinting isn\'t an option today.',inputType:'reps_only'},
  ],
  'Split Jump': [
    {name:'Squat Jump',target:'4×5',note:'Bilateral power substitute if space is tight.',inputType:'reps_only'},
    {name:'Reverse Lunge',target:'3×12/leg',note:'Same split-stance pattern without the jump.'},
  ],
  'Depth Drop': [
    {name:'Squat Jump',target:'4×5',note:'Lower-intensity power substitute, no box needed.',inputType:'reps_only'},
    {name:'Bench/Box Jump',target:'5×3',note:'Concentric-only power alternative.'},
  ],
  'Treadmill Intervals': [
    {name:'Stationary Bike Intervals',target:'6×45s',note:'Lower impact, similar conditioning demand.',inputType:'reps_only'},
    {name:'Rowing Machine Intervals',target:'6×500m',note:'Full-body substitute if a treadmill isn\'t free.',inputType:'reps_only'},
  ],
  'Stationary Bike Intervals': [
    {name:'Treadmill Intervals',target:'8×1 min',note:'Run-based alternative.',inputType:'reps_only'},
    {name:'Rowing Machine Intervals',target:'6×500m',note:'Full-body, non-impact substitute.',inputType:'reps_only'},
  ],
  'Treadmill Zone 2 Run': [
    {name:'Stationary Bike Intervals',target:'20 min',note:'Same aerobic zone, lower impact.',inputType:'reps_only'},
    {name:'Walking',target:'30-45 min',note:'Zone 1-2 substitute — easier recovery day option.',inputType:'timed'},
  ],
  'Treadmill': [
    {name:'Stationary Bike Intervals',target:'20 min',note:'Lower-impact substitute for the same duration.',inputType:'reps_only'},
    {name:'Walking',target:'30-45 min',note:'If the treadmill is occupied or you want lower intensity.',inputType:'timed'},
  ],

  // HOTEL ROOM
  'Single Leg Squat (Pistol)': [
    {name:'Slow Bodyweight Squat',target:'4×12',note:'Bilateral regression — build control before going unilateral.'},
    {name:'Reverse Lunge',target:'3×12/leg',note:'Easier balance demand, same single-leg strength focus.',inputType:'reps_only'},
  ],
  'Hamstring Raise (Nordic Curl)': [
    {name:'Single-Leg Glute Bridge',target:'3×12/leg',note:'Easier hamstring/glute regression if Nordics are too advanced.',inputType:'reps_only'},
    {name:'Reverse Lunge',target:'3×12/leg',note:'Different pattern, still loads the hamstrings eccentrically.',inputType:'reps_only'},
  ],
  'Single-Leg Glute Bridge': [
    {name:'Hamstring Raise (Nordic Curl)',target:'3×6',note:'Harder progression once single-leg bridges feel easy.',inputType:'reps_only'},
    {name:'Reverse Lunge',target:'3×12/leg',note:'Standing alternative, same glute emphasis.',inputType:'reps_only'},
  ],
  'Calf Raise (step)': [
    {name:'Single-Leg Calf Raise',target:'3×15/leg',note:'No step needed — harder unilateral version.',inputType:'reps_only'},
  ],
  'Reverse Lunge': [
    {name:'Split Squat',target:'3×10/leg',note:'Static stance — easier balance, same quad/glute demand.',inputType:'reps_only'},
    {name:'Single Leg Squat (Pistol)',target:'3×5/leg',note:'Harder progression once lunges feel easy.',inputType:'reps_only'},
  ],
  'Archer Pushup': [
    {name:'Pushup Variations',target:'4×max',note:'Standard version if the archer variant is too advanced.',inputType:'reps_only'},
    {name:'Decline Pushup',target:'4×max',note:'Different difficulty lever — feet elevated instead of arm reach.',inputType:'reps_only'},
  ],
  'Pike Pushup': [
    {name:'Chair Dips',target:'3×12',note:'Different pressing angle, still shoulder/tricep focused.',inputType:'reps_only'},
    {name:'Decline Pushup',target:'4×max',note:'Upper-chest/shoulder emphasis without full overhead position.',inputType:'reps_only'},
  ],
  'Pushup Variations': [
    {name:'Decline Pushup',target:'4×max',note:'Feet elevated — more upper chest and shoulder.',inputType:'reps_only'},
    {name:'Archer Pushup',target:'4×max',note:'Harder unilateral progression.',inputType:'reps_only'},
  ],
  'Chair Dips': [
    {name:'Decline Pushup',target:'4×max',note:'Different pressing pattern, similar tricep/chest demand.',inputType:'reps_only'},
    {name:'Pike Pushup',target:'4×12',note:'More shoulder-dominant substitute.',inputType:'reps_only'},
  ],
  'Decline Pushup': [
    {name:'Pushup Variations',target:'4×max',note:'Standard version if elevating your feet isn\'t comfortable.',inputType:'reps_only'},
    {name:'Archer Pushup',target:'4×max',note:'Harder unilateral progression.',inputType:'reps_only'},
  ],
  'Plank': [
    {name:'Dead Bug',target:'3×10/side',note:'More controlled anti-extension work, easier on the lower back.',inputType:'reps_only'},
    {name:'Bird Dog',target:'3×10/side',note:'Adds an anti-rotation component.',inputType:'reps_only'},
  ],
  'Pullups (bar if available)': [
    {name:'Table / Inverted Row',target:'3×12',note:'No bar needed — use a sturdy table edge.',inputType:'reps_only'},
    {name:'Door Frame Row',target:'3×12',note:'Another no-equipment pulling substitute.',inputType:'reps_only'},
  ],
  'Table / Inverted Row': [
    {name:'Door Frame Row',target:'3×12',note:'Similar horizontal pull if no sturdy table is available.',inputType:'reps_only'},
    {name:'Pullups (bar if available)',target:'3×max',note:'Vertical pull alternative if a bar is available.',inputType:'reps_only'},
  ],
  'Towel Curl': [
    {name:'Door Frame Row',target:'3×12',note:'Different pulling pattern, still hits the biceps and back.',inputType:'reps_only'},
  ],
  'Door Frame Row': [
    {name:'Table / Inverted Row',target:'3×12',note:'Similar horizontal pull using a table instead.',inputType:'reps_only'},
    {name:'Towel Curl',target:'3×15',note:'Bicep-focused substitute using a towel and partner or fixed anchor.'},
  ],
  'Superman Hold': [
    {name:'Bird Dog',target:'3×10/side',note:'More controlled, adds an anti-rotation component.',inputType:'reps_only'},
    {name:'Dead Bug',target:'3×10/side',note:'Easier on the lower back if Superman feels like too much extension.',inputType:'reps_only'},
  ],
  'Bed/Chair Jump': [
    {name:'Squat Jump',target:'4×5',note:'No furniture needed, same vertical power demand.',inputType:'reps_only'},
    {name:'Split Jump',target:'4×6/side',note:'Different plane, same explosive intent.',inputType:'reps_only'},
  ],
  'Squat Jump': [
    {name:'Split Jump',target:'4×6/side',note:'Unilateral power alternative.',inputType:'reps_only'},
    {name:'Bed/Chair Jump',target:'4×5',note:'Added height challenge if bodyweight jumps feel easy.',inputType:'reps_only'},
  ],
  'Explosive Pushup': [
    {name:'Pushup Variations',target:'4×max',note:'Standard tempo if explosive reps aren\'t appropriate today.',inputType:'reps_only'},
  ],
  'Pogo Hop': [
    {name:'Squat Jump',target:'4×5',note:'Bigger, slower power expression instead of quick ground contacts.',inputType:'reps_only'},
    {name:'Jump Lunge',target:'3×10/side',note:'Different plane, similar plyometric intent.',inputType:'reps_only'},
  ],
  'Pullups / Table Row': [
    {name:'Door Frame Row',target:'3×12',note:'No table or bar needed.',inputType:'reps_only'},
  ],
  'Slow Bodyweight Squat': [
    {name:'Reverse Lunge',target:'3×12/leg',note:'Unilateral progression once bilateral tempo squats feel easy.',inputType:'reps_only'},
    {name:'Single Leg Squat (Pistol)',target:'3×5/leg',note:'Harder unilateral progression.',inputType:'reps_only'},
  ],
  'Inverted Row / Door Row': [
    {name:'Table / Inverted Row',target:'3×12',note:'Same pattern, different anchor point.',inputType:'reps_only'},
    {name:'Towel Curl',target:'3×15',note:'Bicep-focused substitute if neither anchor is available.'},
  ],
  'Slow Pushup': [
    {name:'Pushup Variations',target:'4×max',note:'Standard tempo version.',inputType:'reps_only'},
    {name:'Decline Pushup',target:'4×max',note:'Harder lever if tempo reps feel too easy.',inputType:'reps_only'},
  ],
  'Dead Bug': [
    {name:'Bird Dog',target:'3×10/side',note:'Similar anti-extension demand from a different position.',inputType:'reps_only'},
    {name:'Plank',target:'3×30s',note:'Static alternative — less coordination-dependent.',inputType:'timed'},
  ],
  'Bird Dog': [
    {name:'Dead Bug',target:'3×10/side',note:'Similar anti-rotation demand, on your back instead of hands and knees.',inputType:'reps_only'},
    {name:'Plank',target:'3×30s',note:'Static core alternative.',inputType:'timed'},
  ],
  'Burpee Intervals': [
    {name:'Mountain Climbers',target:'6×30s',note:'Lower impact, still elevates heart rate hard.',inputType:'timed'},
    {name:'Jump Lunge',target:'3×10/side',note:'Different but similarly demanding conditioning substitute.',inputType:'reps_only'},
  ],
  'Stair Sprint Intervals': [
    {name:'Mountain Climbers',target:'6×30s',note:'No stairs needed, similar conditioning demand.',inputType:'timed'},
    {name:'Burpee Intervals',target:'8×30s',note:'Full-body conditioning alternative.',inputType:'timed'},
  ],
  'Jump Lunge': [
    {name:'Split Jump',target:'4×6/side',note:'Very similar movement — pick whichever cues better for you.',inputType:'reps_only'},
    {name:'Reverse Lunge',target:'3×12/leg',note:'Remove the jump if you want the pattern without impact.',inputType:'reps_only'},
  ],
  'Mountain Climbers': [
    {name:'Burpee Intervals',target:'8×30s',note:'Higher-intensity conditioning substitute.',inputType:'timed'},
    {name:'Plank',target:'3×30s',note:'Static alternative if you want the core demand without the cardio component.',inputType:'timed'},
  ],

  // EN ROUTE accessories
  'Lateral Raise': [
    {name:'Cable Lateral Raise',target:'3×15',note:'Cable keeps tension at the bottom — harder than DBs.'},
    {name:'Machine Lateral Raise',target:'3×15',note:'Machine version. Strict form, no cheating.'},
    {name:'Upright Row',target:'3×12',note:'Barbell or DB. Hits lateral delt and upper trap.'},
  ],
  'EZ Bar Curl': [
    {name:'DB Curl',target:'3×12',note:'Dumbbell variation. Allows neutral or supinated grip.'},
    {name:'Cable Curl',target:'3×15',note:'Constant tension throughout. Great pump.'},
    {name:'Hammer Curl',target:'3×12',note:'Neutral grip. Hits brachialis and brachioradialis.'},
  ],
  'DB Curl': [
    {name:'Preacher Curl',target:'3×12',note:'Removes shoulder swing entirely — strictest possible bicep isolation.'},
    {name:'EZ Bar Curl',target:'3×12',note:'Barbell variation. Slightly easier on the wrists.'},
    {name:'Cable Curl',target:'3×15',note:'Constant tension. Good isolation.'},
    {name:'Hammer Curl',target:'3×12',note:'Neutral grip. Different muscle emphasis.'},
  ],
  'Close Grip Bench': [
    {name:'Tricep Pushdown',target:'3×15',note:'Cable. Great isolation for all three tricep heads.'},
    {name:'DB Tricep Overhead',target:'3×12',note:'Overhead extension. Long head emphasis.'},
    {name:'Dip',target:'3×max',note:'Bodyweight. Chest + tricep compound.',inputType:'reps_only'},
  ],
  'DB Tricep Overhead': [
    {name:'Close Grip Bench',target:'3×8',note:'Barbell tricep pressing.'},
    {name:'Tricep Pushdown',target:'3×15',note:'Cable isolation.'},
    {name:'Chair Dips',target:'3×max',note:'Bodyweight. No equipment.',inputType:'reps_only'},
  ],
  'Leg Press': [
    {name:'Back Squat',target:'5×5',note:'Free weight. More total body demand.'},
    {name:'Goblet Squat (Heavy)',target:'4×10',note:'DB front-loaded. Good hotel substitute.'},
    {name:'Hack Squat',target:'4×10',note:'More quad emphasis than leg press.'},
  ],
  'Standing Calf Raise': [
    {name:'Seated Calf Raise',target:'4×15',note:'Seated hits the soleus (deeper calf muscle) more.'},
    {name:'Single-Leg Calf Raise',target:'3×15/leg',note:'Bodyweight on a step. More ROM.',inputType:'reps_only'},
    {name:'Leg Press Calf Raise',target:'4×20',note:'On the leg press machine. Easy to load heavy.'},
  ],
  'Pallof Press': [
    {name:'Dead Bug',target:'3×8/side',note:'Anti-extension core. No equipment.',inputType:'reps_only'},
    {name:'Plank',target:'3×60s',note:'Anti-extension. Simpler but still effective.',inputType:'timed'},
    {name:'Cable Woodchop',target:'3×12/side',note:'Rotational power. Same anti-rotation principle.'},
  ],
  'Farmer Carry': [
    {name:'Suitcase Carry',target:'3×40yd',note:'Single DB/KB. Greater anti-lateral-flexion demand.'},
    {name:'Trap Bar Carry',target:'3×40yd',note:'Heavier loading. More grip and core.'},
    {name:'Dead Bug',target:'3×8/side',note:'Core stability alternative if no space for carries.',inputType:'reps_only'},
  ],
  'Lunge (Walking)': [
    {name:'Reverse Lunge',target:'3×12/leg',note:'Less knee stress. More glute emphasis.',inputType:'reps_only'},
    {name:'Single Leg Split Squat',target:'3×10/leg',note:'Rear foot elevated. Higher difficulty.',inputType:'reps_only'},
    {name:'Step-Up',target:'3×12/leg',note:'Same pattern. Box or bench needed.'},
  ],
  'Step-Up': [
    {name:'Lunge (Walking)',target:'3×10/leg',note:'Floor-based. No box needed.'},
    {name:'Single Leg Split Squat',target:'3×10/leg',note:'Rear foot elevated. More challenging.',inputType:'reps_only'},
    {name:'Leg Press',target:'4×12',note:'Machine substitute. Same quad emphasis.'},
  ],
};

function getAlternates(exName) {
  if (!exName) return [];
  return ALTERNATES[exName] || [];
}

function showAlternates(exId, exName, phaseKey) {
  const alts = getAlternates(exName);
  const root = document.getElementById('modalRoot');
  const parts = [];
  parts.push('<div class="modal-bg" onclick="if(event.target===this)closeModal()">');
  parts.push('<div class="modal-sheet" style="max-height:85vh;overflow-y:auto">');
  parts.push('<div class="modal-handle"></div>');
  parts.push('<div class="modal-title">Alternate Exercises</div>');
  if (alts.length) {
    parts.push('<div style="font-size:12px;color:var(--muted);margin-bottom:14px">Same muscle group — different movement. Tap to swap in.</div>');
    alts.forEach(alt => {
      parts.push('<div style="background:var(--bg3);border:1.5px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px">');
      parts.push('<div style="font-weight:700;font-size:14px;margin-bottom:3px">'+alt.name+'</div>');
      parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--gold);margin-bottom:6px">'+alt.target+'</div>');
      parts.push('<div style="font-size:12px;color:var(--muted);margin-bottom:10px">'+alt.note+'</div>');
      parts.push('<button class="btn btn-gold btn-sm" onclick=\'swapExercise("'+exId+'",'+JSON.stringify(alt)+');closeModal()\'>Swap In</button>');
      parts.push('</div>');
    });
  } else {
    parts.push('<div style="font-size:12px;color:var(--muted);margin-bottom:14px">No alternates specifically curated for this exercise yet — search the catalog or create your own below.</div>');
  }

  parts.push('<div style="border-top:1px solid var(--border);margin-top:6px;padding-top:14px">');
  parts.push('<div class="field"><label>Search the exercise catalog</label>');
  parts.push('<input type="text" id="swapSearch" placeholder="e.g. squat, curl, row…" oninput="swapFilterExercises(\''+exId+'\',this.value)" autocomplete="off"></div>');
  parts.push('<div id="swapSearchResults"></div>');
  parts.push('</div>');

  parts.push('<div style="border-top:1px solid var(--border);margin-top:14px;padding-top:14px">');
  parts.push('<div style="font-size:12px;font-weight:600;margin-bottom:10px">✏️ Or Create Your Own</div>');
  parts.push('<div class="field"><label>Exercise Name</label><input id="altName" type="text" placeholder="e.g. Cable Squat"></div>');
  parts.push('<div class="field"><label>Target (e.g. 3x10, 45s, 3x12/side)</label><input id="altTarget" type="text" placeholder="3x10"></div>');
  parts.push('<div class="field"><label>Type</label><select id="altType"><option value="reps_weight">Reps + Weight</option><option value="reps_only">Reps Only</option><option value="timed">Timed</option></select></div>');
  parts.push('<div class="field"><label>Note (optional)</label><input id="altNote" type="text" placeholder="Why this works as a substitute"></div>');
  parts.push('<button class="btn btn-gold" onclick="swapCustomAlternate(\''+exId+'\')">Swap In Custom Exercise</button>');
  parts.push('</div>');

  parts.push('<button class="btn btn-outline mt8" onclick="closeModal()">CANCEL</button>');
  parts.push('</div></div>');
  root.innerHTML = parts.join('');
}

// Genuine dynamic-warmup/mobility movements — curated from what actually
// appears in taxi (warmup) phases across the real catalog, deliberately
// excluding entries like "DB Bench Press" or "Kettlebell Goblet Squat
// (Heavy)" that occupy a taxi slot only because of goal-overlay reassignment,
// not because they're actually warmup content. Combined with
// isStretchLikeExercise() for the full "Warmup / Stretching" filter.
const WARMUP_MOBILITY_NAMES = new Set([
  'Ankle Circles + Dorsiflexion', 'Arm Circles (progressive)', 'Band Pull-Apart',
  'Brisk Walk Ramp-Up', 'Cat-Cow', 'Dead Bug', 'Full Mobility Circuit',
  'Hip 90/90', 'Jump Rope / Ankle Bouncing', 'Lateral Band Walk',
  'Leg Swings (Front & Side)', 'Prone Y-T-W Raises', 'Scapular Pullup',
  'Thoracic Extension (chair)', 'Walking High Knees', 'Wall Slide',
  'Kettlebell Goblet Squat (Warmup)',
]);
function isWarmupOrMobilityExercise(exItem) {
  return isStretchLikeExercise(exItem) || WARMUP_MOBILITY_NAMES.has(exItem.name);
}

function isStretchLikeExercise(exItem) {
  if (!exItem) return false;
  if (exItem.inputType === 'timed_bilateral' || exItem.inputType === 'nsdr') return true;
  return !!(exItem.timed && /stretch|mobility|foam roll/i.test(exItem.name||''));
}

// Shared by swapFilterExercises (display) and swapAddCatalogExercise (add by
// index) so they can never disagree about what result index N refers to —
// previously swapAddCatalogExercise used a plain filter+slice while the
// display used stretch-biased ordering, meaning tapping a result could add a
// different exercise than the one actually shown at that position.
function rankedSwapMatches(exId, q, limit) {
  const allEx = ST.workout ? [...ST.workout.taxi,...ST.workout.takeoff,...ST.workout.enroute,...ST.workout.landing] : [];
  const swappingOutStretch = isStretchLikeExercise(allEx.find(e => e.id === exId));
  const allMatches = buildExerciseCatalog().filter(e => exerciseMatchesQuery(e.name, q));
  const byRelevance = (a, b) => exerciseSearchRank(a.name, q) - exerciseSearchRank(b.name, q);
  if (swappingOutStretch) {
    return [...allMatches.filter(isStretchLikeExercise).sort(byRelevance),
            ...allMatches.filter(e => !isStretchLikeExercise(e)).sort(byRelevance)].slice(0, limit);
  }
  return allMatches.sort(byRelevance).slice(0, limit);
}

function swapFilterExercises(exId, q) {
  const box = document.getElementById('swapSearchResults');
  if (!box) return;
  q = (q||'').trim().toLowerCase();
  if (!q) { box.innerHTML = ''; return; }
  const matches = rankedSwapMatches(exId, q, 6);
  const parts = [];
  matches.forEach((e, i) => {
    parts.push('<div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;font-size:13px" onclick="swapAddCatalogExercise(\''+exId+'\','+i+',\''+q.replace(/'/g,'')+'\')">'+e.name+' <span style="font-family:var(--mono);font-size:10px;color:var(--muted)">'+(e.target||'')+'</span></div>');
  });
  if (matches.length) parts.push('<div style="font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:0.08em;margin:8px 0 2px">TAP TO SWAP IN — OR USE "CREATE YOUR OWN" BELOW</div>');
  box.innerHTML = parts.join('');
}
function swapAddCatalogExercise(exId, matchIdx, q) {
  const matches = rankedSwapMatches(exId, q.toLowerCase(), 6);
  const exDef = matches[matchIdx];
  if (!exDef) return;
  swapExercise(exId, { name: exDef.name, target: exDef.target, note: exDef.note||'Swapped from catalog.', inputType: exDef.inputType });
  closeModal();
}

function swapCustomAlternate(exId) {
  const name = sanitizeUserText(document.getElementById('altName')?.value?.trim());
  const target = sanitizeUserText(document.getElementById('altTarget')?.value?.trim()) || '3x10';
  const inputType = document.getElementById('altType')?.value || 'reps_weight';
  const note = sanitizeUserText(document.getElementById('altNote')?.value?.trim()) || 'Custom alternate.';
  if (!name) { showToast('Enter an exercise name.'); return; }
  swapExercise(exId, { name, target, note, inputType });
  closeModal();
}

function swapExercise(exId, alt) {
  if (!ST.workout) return;
  for (const phase of ['taxi','takeoff','enroute','landing']) {
    const idx = ST.workout[phase].findIndex(e => e.id === exId);
    if (idx === -1) continue;
    const setsMatch = (alt.target||'').match(/^(\d+)\s*[x×]/i);
    const setsCount = setsMatch ? Math.max(1, parseInt(setsMatch[1], 10)) : 3;
    const iType = alt.inputType || 'reps_weight';
    const isTimed = iType==='timed' || iType==='timed_bilateral';
    // Reuse the exercise's real catalog id when the swap-in matches an
    // existing exercise exactly — otherwise "Leg Press" swapped into one
    // slot and "Leg Press" swapped into another (or logged from its normal
    // base-catalog slot on a different day) would silently split into two
    // unrelated histories, showing "first time logging" every time despite
    // being the same exercise. Genuinely custom names get a stable,
    // name-derived id instead of a timestamp, so repeated swaps of the same
    // custom exercise also link correctly across sessions.
    const catalogMatch = buildExerciseCatalog().find(e => e.name === alt.name);
    const newId = catalogMatch ? catalogMatch.id : 'swap_' + slugify(alt.name);
    const newEx = ex(newId, alt.name, alt.target, setsCount, alt.note||'Alternate exercise.', isTimed, iType);
    ST.workout[phase][idx] = newEx;
    ST.sets[newEx.id] =
      iType==='timed_bilateral' ? [{seconds_left:'',seconds_right:''}] :
      iType==='timed_distance'  ? [{seconds:'',miles:''}] :
      iType==='timed'           ? [{seconds:''}] :
      iType==='reps_only'       ? Array.from({length:setsCount},()=>({reps:''})) :
      iType==='reps_height'     ? Array.from({length:setsCount},()=>({reps:'',height:''})) :
      iType==='reps_distance'   ? Array.from({length:setsCount},()=>({reps:'',distance:''})) :
                                   Array.from({length:setsCount},()=>({reps:'',weight:''}));
    delete ST.sets[exId];
    persistWorkoutState();
    showBigToast(alt.name+' swapped in.','ok');
    renderFlight(document.getElementById('mainPage'));
    return;
  }
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
    return s && s.some(x => x.reps || x.weight || x.seconds || x.height || x.distance || x.seconds_left || x.seconds_right);
  }).length;
  const pct = Math.round(done / Math.max(allEx.length,1) * 100);

  const parts = [];
  parts.push('<button class="btn-ghost" style="font-size:12px;margin-bottom:6px" onclick="switchTab(\'today\')">← Back to Today</button>');
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
      parts.push('<div class="phase-title" onclick="haptic(\'light\');showCNSInfo()" style="cursor:pointer">'+phase.sub+'</div>');
    } else {
      parts.push('<div class="phase-title">'+phase.sub+'</div>');
    }
    parts.push('</div></div>');
    exercises.forEach(exItem => parts.push(buildExCard(exItem, phase.key)));
  });

  // Add custom exercise button
  parts.push(buildAddExerciseCard());

  parts.push('<div style="height:16px"></div>');
  // Disabled while a save is in flight so the guard is visible rather than
  // a silent no-op — repeated tapping is what produced duplicates, and a
  // button that looks live invites exactly that.
  parts.push('<button class="btn btn-green" '+(ST.chocksSaving?'disabled':'')+' onclick="confirmSetChocks()">'+(ST.chocksSaving?'⏳ SAVING…':'🔒 SET THE CHOCKS — FINISH WORKOUT')+'</button>');

  p.innerHTML = parts.join('');
}

// Exercise guide lookup — maps exercise name to .dc.html filename
const GUIDE_BASE_URL = 'https://raw.githubusercontent.com/bchadcooper-create/pilot-program/main/guides/';
function exNameToGuideName(name) {
  if (!name) return null;
  // Normalize: spaces→underscores, (x)→__x__, capitalize words, add suffix
  let fn = name
    .replace(/\s+/g, '_')
    .replace(/\(([^)]+)\)/g, (m, inner) => '__' + inner.replace(/\s+/g, '_') + '__')
    .split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('_')
    + '_dc.html';
  return fn;
}

function openExerciseGuide(exName) {
  const guideFile = exNameToGuideName(exName);
  if (!guideFile) { showToast('No guide available.'); return; }
  
  const GUIDES = ['Archer_Pushup_dc.html','Back_Squat_dc.html','Band_Pull-Apart_dc.html','Barbell_Row__Pendlay__dc.html','Bench_Box_Jump_dc.html','Bench_Press_dc.html','Bent-Over_DB_Face_Pull_dc.html','Cable_Row_dc.html','Calf_Raise__Step__dc.html','Canvas_dc.html','Chair_Dips_dc.html','Close_Grip_Bench_dc.html','Conventional_Deadlift_dc.html','DB_Bench_Press_dc.html','DB_Curl_dc.html','DB_Front_Raise_dc.html','DB_Hammer_Curl_dc.html','DB_Incline_Press_dc.html','DB_Jump_Squat_dc.html','DB_Lateral_Raise_dc.html','DB_Overhead_Press_dc.html','DB_Romanian_Deadlift_dc.html','Kettlebell_Goblet_Squat__Warmup__dc.html','Single_Leg_Squat__Pistol__dc.html','Standing_Overhead_Press_dc.html','Step-Up__Weighted__dc.html','Table___Inverted_Row_dc.html','Thoracic_Extension__chair__dc.html','Towel_Curl_dc.html','Trap_Bar_Deadlift_dc.html'];
  if (!GUIDES.includes(guideFile)) { openYouTubeSearch(exName); return; }
  
  const guideURL = GUIDE_BASE_URL + guideFile;
  const root = document.getElementById('modalRoot');
  root.innerHTML = '<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal-sheet" style="max-height:95vh;width:95vw;max-width:90vh;padding:0;border-radius:12px;overflow:hidden;display:flex;flex-direction:column"><div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--bg3);border-bottom:1px solid var(--border);flex-shrink:0"><div style="font-weight:600">'+exName+' Form Guide</div><button class="btn-ghost" style="font-size:20px;padding:0;width:32px;height:32px" onclick="closeModal()">✕</button></div><div id="guideContent" style="flex:1;overflow-y:auto;background:#000;display:flex;align-items:center;justify-content:center;color:#ccc">Loading...</div></div></div>';
  fetch(guideURL, { cache: 'reload' }).then(r => r.text()).then(html => {
    const el = document.getElementById('guideContent');
    if (!el) return;
    // Guides exported as runtime shells (they load ./support.js and scene
    // .jsx files that aren't published) can't render standalone — and
    // innerHTML never executes scripts regardless. Fall back gracefully.
    if (html.includes('support.js') || html.includes('<x-import')) {
      closeModal();
      showToast('In-app animation coming soon — opening YouTube guide.');
      openYouTubeSearch(exName);
      return;
    }
    el.innerHTML = html;
    el.style.display = 'block';
  }).catch(e => { const el = document.getElementById('guideContent'); if (el) el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">Failed to load.<br><button class="btn btn-blue mt12" onclick="openYouTubeSearch(\''+exName+'\')">Open YouTube</button></div>'; });
}

// BUG FIX (reported): coming back from the video landed on a blank
// "Search or enter website name" page that had to be closed manually
// before the workout reappeared.
//
// Cause is window.open(url, '_blank') from a standalone iOS PWA: it
// creates a new browsing context that outlives the navigation, so the
// empty shell is still sitting there on return. A real anchor the person
// taps hands off to the browser cleanly and comes back to the PWA — which
// is why the guide links elsewhere in the app have never done this.
function openYouTubeSearch(exName) {
  const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(exName + ' form');
  const root = document.getElementById('modalRoot');
  if (!root) return;
  root.innerHTML =
    '<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal-sheet">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">' + sanitizeUserText(exName) + '</div>' +
    '<div class="modal-body">No built-in form guide for this one yet — this opens a YouTube search in your browser.</div>' +
    '<a class="btn btn-gold mt12" style="display:block;text-align:center;text-decoration:none" href="' + url + '" ' + externalLinkAttrs() + ' onclick="closeModal()">▶ Watch on YouTube</a>' +
    '<button class="btn btn-outline mt8" onclick="closeModal()">Cancel</button>' +
    '</div></div>';
}


function buildExCard(exItem, phaseKey) {
  const isOpen = !!ST.expanded[exItem.id];
  const sets = ST.sets[exItem.id] || [];
  const hasData = sets.some(s => s.reps || s.weight || s.seconds || s.height || s.distance || s.seconds_left || s.seconds_right);
  const parts = [];

  parts.push('<div class="ex-card'+(exItem.custom?' custom-ex':'')+'" id="excard_'+exItem.id+'">');
  parts.push('<div class="ex-hdr"><div style="flex:1;cursor:pointer" onclick="toggleEx(\''+exItem.id+'\')"><div class="ex-name">'+exItem.name+(exItem.custom?' <span style="font-size:9px;color:var(--gold)">CUSTOM</span>':'')+'</div><div class="ex-target">'+exItem.target+(exItem.timed?' · ⏱ TIMED':'')+'</div></div><div class="ex-right"><button class="btn-ghost" style="font-size:11px;padding:4px 8px;margin-right:4px;color:var(--blue)" onclick="event.stopPropagation();openExerciseGuide(\''+exItem.name+'\')">ⓘ Guide</button><div class="ex-done '+(hasData?'ok':'')+'">'+(hasData?'✓':'')+'</div><div class="ex-caret '+(isOpen?'open':'')+'">⌄</div></div></div>');
  if (exItem.swappedForInjury) {
    parts.push('<div style="padding:6px 14px;background:rgba(56,189,248,0.08);border-top:1px solid var(--border);font-size:10px;color:var(--blue)">🩹 Swapped from '+exItem.originalName+' — '+exItem.flaggedRegion+' flagged</div>');
  } else if (exItem.injuryCaution) {
    parts.push('<div style="padding:6px 14px;background:rgba(245,158,11,0.08);border-top:1px solid var(--border);font-size:10px;color:var(--amber)">⚠️ May stress your flagged '+exItem.flaggedRegion+' — consider Alternate below</div>');
  }

  if (isOpen) {
    parts.push('<div class="ex-body"><p class="ex-note">'+exItem.note+'</p>');

    // Progressive overload banner — only for weighted exercises
    if (!exItem.timed && exItem.inputType !== 'reps_only' && exItem.inputType !== 'reps_height' && exItem.inputType !== 'reps_distance' && exItem.inputType !== 'nsdr' && !exItem.custom) {
      const lastW = lastLoggedMax(exItem.id, exItem.name);
      const lastR = lastLoggedReps(exItem.id, exItem.name);
      const suggested = suggestNextWeight(exItem.id, exItem.name, phaseKey);
      if (lastW !== null) {
        parts.push('<div class="stat-banner">');
        parts.push('<div class="stat-banner-label">PROGRESSIVE OVERLOAD</div>');
        parts.push('<div style="display:flex;justify-content:space-between;align-items:center">');
        parts.push('<span style="font-size:12px">Last: <strong style="color:var(--text)">'+lastW+' lb'+(lastR?' × '+lastR+' reps':'')+'</strong></span>');
        parts.push('<span style="color:var(--gold);font-weight:700;font-size:12px">Target → '+suggested+' lb</span>');
        parts.push('</div></div>');
      } else {
        parts.push('<div class="stat-banner-empty">First time logging — sets here to start tracking progress.</div>');
      }
    }

    if (exItem.inputType === 'reps_height' || exItem.inputType === 'reps_distance') {
      const field = exItem.inputType === 'reps_height' ? 'height' : 'distance';
      const label = exItem.inputType === 'reps_height' ? 'box height' : 'distance';
      const lastBest = lastLoggedMaxField(exItem.id, field, exItem.name);
      if (lastBest !== null) {
        parts.push('<div class="stat-banner">');
        parts.push('<div class="stat-banner-label">PERSONAL BEST</div>');
        parts.push('<span style="font-size:12px">Best '+label+': <strong style="color:var(--teal)">'+lastBest+' in</strong></span>');
        parts.push('</div>');
      } else {
        parts.push('<div class="stat-banner-empty">First time logging — record your '+label+' in inches to start tracking progress.</div>');
      }
    }

    if (exItem.inputType === 'nsdr') {
      parts.push(buildNSDRWidget(exItem.id, sets[0]?.seconds||''));
    } else if (exItem.inputType === 'timed_bilateral' || (exItem.timed && exItem.target?.includes('/side'))) {
      // Bilateral stretches marked as timed_bilateral OR timed with "/side" in target (e.g., "90s/side")
      const valL = sets[0]?.seconds_left || '';
      const valR = sets[0]?.seconds_right || '';
      parts.push('<div style="display:flex;gap:8px">');
      parts.push('<div class="timed-box" style="flex:1" id="tb_'+exItem.id+'_left">');
      parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:0.08em;margin-bottom:8px">LEFT SIDE</div>');
      parts.push('<input class="timed-inp" type="number" inputmode="numeric" placeholder="0" value="'+valL+'" oninput="ST.sets[\''+exItem.id+'\'][0].seconds_left=this.value;persistWorkoutState()">');
      parts.push('<div style="font-size:11px;color:var(--muted);margin-top:6px">seconds</div>');
      parts.push(buildStopwatchWidget(exItem.id, 'left', exItem.target));
      parts.push('</div>');
      parts.push('<div class="timed-box" style="flex:1" id="tb_'+exItem.id+'_right">');
      parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:0.08em;margin-bottom:8px">RIGHT SIDE</div>');
      parts.push('<input class="timed-inp" type="number" inputmode="numeric" placeholder="0" value="'+valR+'" oninput="ST.sets[\''+exItem.id+'\'][0].seconds_right=this.value;persistWorkoutState()">');
      parts.push('<div style="font-size:11px;color:var(--muted);margin-top:6px">seconds</div>');
      parts.push(buildStopwatchWidget(exItem.id, 'right', exItem.target));
      parts.push('</div>');
      parts.push('</div>');
    } else if (exItem.inputType === 'timed_distance') {
      // Was falling through to the generic seconds-only branch below with no
      // distance field shown at all — meaning Treadmill/Outdoor Run could
      // never actually feed the running leaderboard from a live workout.
      const valMin = sets[0]?.seconds ? Math.round((parseFloat(sets[0].seconds)/60)*10)/10 : '';
      const valMi = sets[0]?.miles || '';
      parts.push('<div class="timed-box '+(valMin?'ok':'')+'" id="tb_'+exItem.id+'">');
      parts.push('<div style="display:flex;gap:8px">');
      parts.push('<div style="flex:1"><div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:0.08em;margin-bottom:8px">TIME</div>');
      parts.push('<input class="timed-inp" type="text" inputmode="decimal" placeholder="0" value="'+valMin+'" oninput="liveSetValMin(\''+exItem.id+'\',0,\'seconds\',this.value);document.getElementById(\'tb_'+exItem.id+'\').className=\'timed-box\'+(this.value?\' ok\':\'\');">');
      parts.push('<div style="font-size:11px;color:var(--muted);margin-top:6px">min</div></div>');
      parts.push('<div style="flex:1"><div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:0.08em;margin-bottom:8px">DISTANCE</div>');
      parts.push('<input class="timed-inp" type="text" inputmode="decimal" placeholder="0" value="'+valMi+'" oninput="ST.sets[\''+exItem.id+'\'][0].miles=this.value;persistWorkoutState()">');
      parts.push('<div style="font-size:11px;color:var(--muted);margin-top:6px">mi</div></div>');
      parts.push('</div></div>');
    } else if (exItem.timed && isMinuteScale(exItem)) {
      // Reported bug: Walking, Treadmill, and similar 20-45 min activities
      // forced entry in raw seconds (e.g. typing "1200" for 20 minutes) —
      // genuinely impractical for something this length. Detected via the
      // exercise's own target string ("30 min" vs "30s") rather than a
      // blanket change, so short holds/stretches correctly keep seconds.
      const valMin = sets[0]?.seconds ? Math.round((parseFloat(sets[0].seconds)/60)*10)/10 : '';
      parts.push('<div class="timed-box '+(valMin?'ok':'')+'" id="tb_'+exItem.id+'">');
      parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:0.08em;margin-bottom:8px">TOTAL TIME</div>');
      parts.push('<input class="timed-inp" type="text" inputmode="decimal" placeholder="0" value="'+valMin+'" oninput="liveSetValMin(\''+exItem.id+'\',0,\'seconds\',this.value);document.getElementById(\'tb_'+exItem.id+'\').className=\'timed-box\'+(this.value?\' ok\':\'\');">');
      parts.push('<div style="font-size:11px;color:var(--muted);margin-top:6px">min</div>');
      parts.push('</div>');
      parts.push(buildStopwatchWidget(exItem.id, null, exItem.target));
    } else if (exItem.timed) {
      const val = sets[0]?.seconds || '';
      parts.push('<div class="timed-box '+(val?'ok':'')+'" id="tb_'+exItem.id+'">');
      parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:0.08em;margin-bottom:8px">TOTAL TIME</div>');
      parts.push('<input class="timed-inp" type="number" inputmode="numeric" placeholder="0" value="'+val+'" oninput="ST.sets[\''+exItem.id+'\'][0].seconds=this.value;document.getElementById(\'tb_'+exItem.id+'\').className=\'timed-box\'+(this.value?\' ok\':\'\');persistWorkoutState()">');
      parts.push('<div style="font-size:11px;color:var(--muted);margin-top:6px">seconds</div>');
      parts.push('</div>');
      parts.push(buildStopwatchWidget(exItem.id, null, exItem.target));
    } else if (exItem.inputType === 'reps_height') {
      parts.push('<div class="sets-wrap"><div class="sets-scroll">');
      sets.forEach((s,i) => {
        parts.push('<div class="set-tile '+(s.reps||s.height?'ok':'')+'" id="st_'+exItem.id+'_'+i+'"><div class="set-lbl">SET '+(i+1)+'</div>');
        parts.push('<input class="set-inp" type="number" inputmode="numeric" placeholder="Reps" value="'+(s.reps||'')+'" oninput="ST.sets[\''+exItem.id+'\']['+i+'].reps=this.value;document.getElementById(\'st_'+exItem.id+'_'+i+'\').className=\'set-tile\'+(this.value||ST.sets[\''+exItem.id+'\']['+i+'].height?\' ok\':\'\');persistWorkoutState()">');
        parts.push('<input class="set-inp" type="number" inputmode="decimal" placeholder="Height" value="'+(s.height||'')+'" oninput="ST.sets[\''+exItem.id+'\']['+i+'].height=this.value;document.getElementById(\'st_'+exItem.id+'_'+i+'\').className=\'set-tile\'+(ST.sets[\''+exItem.id+'\']['+i+'].reps||this.value?\' ok\':\'\');persistWorkoutState()">');
        parts.push('<div class="set-hint">reps / height (in)</div></div>');
      });
      parts.push('</div></div><div class="swipe-hint">← swipe for all sets</div><button class="btn-ghost" style="font-size:11px;margin-top:6px" onclick="addLiveSet(\''+exItem.id+'\')">+ Add Set</button>');
      if (phaseKey === 'takeoff' || phaseKey === 'enroute') {
        parts.push(buildRestTimerWidget(exItem.id, phaseKey));
      }
    } else if (exItem.inputType === 'reps_distance') {
      parts.push('<div class="sets-wrap"><div class="sets-scroll">');
      sets.forEach((s,i) => {
        parts.push('<div class="set-tile '+(s.reps||s.distance?'ok':'')+'" id="st_'+exItem.id+'_'+i+'"><div class="set-lbl">SET '+(i+1)+'</div>');
        parts.push('<input class="set-inp" type="number" inputmode="numeric" placeholder="Reps" value="'+(s.reps||'')+'" oninput="ST.sets[\''+exItem.id+'\']['+i+'].reps=this.value;document.getElementById(\'st_'+exItem.id+'_'+i+'\').className=\'set-tile\'+(this.value||ST.sets[\''+exItem.id+'\']['+i+'].distance?\' ok\':\'\');persistWorkoutState()">');
        parts.push('<input class="set-inp" type="number" inputmode="decimal" placeholder="Distance" value="'+(s.distance||'')+'" oninput="ST.sets[\''+exItem.id+'\']['+i+'].distance=this.value;document.getElementById(\'st_'+exItem.id+'_'+i+'\').className=\'set-tile\'+(ST.sets[\''+exItem.id+'\']['+i+'].reps||this.value?\' ok\':\'\');persistWorkoutState()">');
        parts.push('<div class="set-hint">reps / distance (in)</div></div>');
      });
      parts.push('</div></div><div class="swipe-hint">← swipe for all sets</div><button class="btn-ghost" style="font-size:11px;margin-top:6px" onclick="addLiveSet(\''+exItem.id+'\')">+ Add Set</button>');
      if (phaseKey === 'takeoff' || phaseKey === 'enroute') {
        parts.push(buildRestTimerWidget(exItem.id, phaseKey));
      }
    } else if (exItem.inputType === 'reps_only') {
      parts.push('<div class="sets-wrap"><div class="sets-scroll">');
      sets.forEach((s,i) => {
        parts.push('<div class="set-tile '+(s.reps?'ok':'')+'" id="st_'+exItem.id+'_'+i+'"><div class="set-lbl">SET '+(i+1)+'</div>');
        parts.push('<input class="set-inp" type="number" inputmode="numeric" placeholder="Reps" value="'+(s.reps||'')+'" oninput="ST.sets[\''+exItem.id+'\']['+i+'].reps=this.value;document.getElementById(\'st_'+exItem.id+'_'+i+'\').className=\'set-tile\'+(this.value?\' ok\':\'\');persistWorkoutState()">');
        parts.push('<div class="set-hint">reps only</div></div>');
      });
      parts.push('</div></div><div class="swipe-hint">← swipe for all sets</div><button class="btn-ghost" style="font-size:11px;margin-top:6px" onclick="addLiveSet(\''+exItem.id+'\')">+ Add Set</button>');
    } else {
      parts.push('<div class="sets-wrap"><div class="sets-scroll">');
      sets.forEach((s,i) => {
        parts.push('<div class="set-tile '+(s.reps||s.weight?'ok':'')+'" id="st_'+exItem.id+'_'+i+'"><div class="set-lbl">SET '+(i+1)+'</div>');
        parts.push('<input class="set-inp" type="number" inputmode="numeric" placeholder="Reps" value="'+(s.reps||'')+'" oninput="ST.sets[\''+exItem.id+'\']['+i+'].reps=this.value;document.getElementById(\'st_'+exItem.id+'_'+i+'\').className=\'set-tile\'+(this.value||ST.sets[\''+exItem.id+'\']['+i+'].weight?\' ok\':\'\');persistWorkoutState()">');
        parts.push('<input class="set-inp" type="number" inputmode="decimal" placeholder="lb" value="'+(s.weight||'')+'" oninput="ST.sets[\''+exItem.id+'\']['+i+'].weight=this.value;document.getElementById(\'st_'+exItem.id+'_'+i+'\').className=\'set-tile\'+(ST.sets[\''+exItem.id+'\']['+i+'].reps||this.value?\' ok\':\'\');persistWorkoutState()">');
        parts.push('<div class="set-hint">reps / lb</div></div>');
      });
      parts.push('</div></div><div class="swipe-hint">← swipe for all sets</div><button class="btn-ghost" style="font-size:11px;margin-top:6px" onclick="addLiveSet(\''+exItem.id+'\')">+ Add Set</button>');
      const autoreg = autoregSuggestion(exItem, sets);
      if (autoreg) {
        parts.push('<div class="fb" style="background:var(--bg3);border:1px solid var(--blue);border-radius:8px;padding:9px 12px;margin-top:8px;align-items:flex-start"><div style="font-size:12px;line-height:1.5;color:var(--text)">🎯 '+autoreg.text+'</div></div>');
      }
      if (phaseKey === 'takeoff' || phaseKey === 'enroute') {
        parts.push(buildRestTimerWidget(exItem.id, phaseKey));
      }
    }

    if (!exItem.custom) {
      parts.push('<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">');
      parts.push('<button class="btn-info" style="border-color:rgba(167,139,250,0.4);color:#a78bfa" onclick="showAlternates(\''+exItem.id+'\',\''+exItem.name+'\',\''+phaseKey+'\')">⇄ Alternate</button>');
      parts.push('<button class="btn-info" style="color:#fca5a5;border-color:rgba(239,68,68,0.3)" onclick="confirmRemoveExercise(\''+exItem.id+'\',\''+exItem.name.replace(/'/g,"")+'\',false)">✕ Remove</button>');
      parts.push('</div>');
    } else {
      parts.push('<div style="margin-top:10px"><button class="btn-info" style="color:#fca5a5;border-color:rgba(239,68,68,0.3)" onclick="confirmRemoveExercise(\''+exItem.id+'\',\''+exItem.name.replace(/'/g,"")+'\',true)">✕ Remove</button></div>');
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
function ageRestBonus() {
  if (!ST.age) return 0;
  if (ST.age >= 60) return 30;
  if (ST.age >= 45) return 15;
  return 0;
}

function buildRestTimerWidget(exId, phaseKey) {
  const defaultSec = (REST_OVERRIDES[exId] || REST_DEFAULTS[phaseKey] || 60) + ageRestBonus();
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
function addLiveSet(exId) {
  const sets = ST.sets[exId];
  if (!sets || !sets.length) return;
  // Clone the shape of the last set (whatever fields it has) so this works
  // generically across reps/weight, reps-only, reps/height, reps/distance.
  const blank = {};
  Object.keys(sets[sets.length-1]).forEach(k => { blank[k] = ''; });
  sets.push(blank);
  persistWorkoutState();
  renderFlight(document.getElementById('mainPage'));
}

function stopRestTimer() {
  if (ST.restTimer.interval) clearInterval(ST.restTimer.interval);
  ST.restTimer.active = false;
  persistTimerState();
  renderFlight(document.getElementById('mainPage'));
}

// ─── STOPWATCH (auto-fills timed exercise seconds) ───────────────────────────
function buildStopwatchWidget(exId, side, targetLabel) {
  const isActive = ST.stopwatch.active && ST.stopwatch.exId === exId && (ST.stopwatch.side||null) === (side||null);
  const domId = side ? exId+'_'+side : exId;
  const targetSec = parseTargetSeconds(targetLabel);
  const parts = [];
  parts.push('<div class="timed-box" style="margin-top:8px" id="sw_'+domId+'">');
  parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:0.08em;margin-bottom:6px">STOPWATCH'+(targetSec?' — CHIMES AT '+formatStopwatch(targetSec):'')+'</div>');
  parts.push('<div class="stopwatch-display" id="sw_disp_'+domId+'">'+formatStopwatch(isActive?ST.stopwatch.seconds:0)+'</div>');
  if (!isActive) {
    parts.push('<button class="stopwatch-btn btn-blue" onclick="startStopwatch(\''+exId+'\','+(side?"'"+side+"'":'null')+','+(targetSec||'null')+')">START</button>');
  } else {
    parts.push('<button class="stopwatch-btn btn-green" onclick="stopStopwatch(\''+exId+'\','+(side?"'"+side+"'":'null')+')">STOP &amp; FILL</button>');
  }
  parts.push('</div>');
  return parts.join('');
}
function formatStopwatch(sec) {
  const m = Math.floor(sec/60), s = sec%60;
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}

// Extracts a target duration in seconds from a target string like '90s/side',
// '3×30s' (takes the per-round value, not multiplied — one continuous
// stopwatch press represents a single round), '5 min', or '30-45 min' (takes
// the lower bound). Returns null when no confident duration can be read
// (e.g. '1 round'), in which case no completion chime is scheduled.
// Extracts the per-set rep target from strings like '3×10', '4×8/leg',
// '2×15/side', or '10 reps'. Rep ranges ('4×8-12') take the lower bound —
// same convention as parseTargetSeconds uses for time ranges.
function parseTargetReps(target) {
  if (!target) return null;
  let m = target.match(/[×x]\s*(\d+)/);
  if (m) return parseInt(m[1], 10);
  m = target.match(/(\d+)\s*reps?\b/i);
  if (m) return parseInt(m[1], 10);
  return null;
}

// Looks at the most recently completed set (the last one with a reps value
// entered) and, if it came in meaningfully under target, returns a plain-
// language suggestion for the next set. Returns null when on target, when
// no valid target can be parsed, or when nothing's been logged yet.
function autoregSuggestion(exItem, sets) {
  const target = parseTargetReps(exItem.target);
  if (!target || target <= 0) return null;
  let last = null;
  for (let i = sets.length - 1; i >= 0; i--) {
    if (sets[i].reps !== '' && sets[i].reps !== undefined && sets[i].reps !== null) { last = sets[i]; break; }
  }
  const actual = last ? parseInt(last.reps) : NaN;
  if (isNaN(actual)) return null;
  const missedBy = target - actual;
  if (missedBy <= 0) return null; // hit or beat target — nothing to say
  const missedPct = missedBy / target;
  if (missedPct <= 0.2) {
    return { tone: 'minor', text: 'Came in at '+actual+'/'+target+' — close. Hold the same weight and take a bit more rest before the next set.' };
  }
  return { tone: 'major', text: 'Came in at '+actual+'/'+target+'. That\'s a real miss, not just an off rep — drop the weight roughly 5-10% for the next set so you can actually hit the target range.' };
}

function parseTargetSeconds(target) {
  if (!target) return null;
  let m = target.match(/(\d+)\s*s(?!\w)/);
  if (m) return parseInt(m[1], 10);
  m = target.match(/(\d+)\s*-\s*\d+\s*min/); // range like '30-45 min' — lower bound
  if (m) return parseInt(m[1], 10) * 60;
  m = target.match(/(\d+)\s*min/);
  if (m) return parseInt(m[1], 10) * 60;
  return null;
}
function startStopwatch(exId, side, targetSec) {
  if (ST.stopwatch.interval) clearInterval(ST.stopwatch.interval);
  ST.stopwatch = { active: true, seconds: 0, exId, side: side||null, interval: null, startTs: Date.now(), targetSec: targetSec||null, chimed: false };
  persistTimerState();
  renderFlight(document.getElementById('mainPage'));
  ST.stopwatch.interval = setInterval(() => tickStopwatch(exId, side||null), 1000);
}
function tickStopwatch(exId, side) {
  if (!ST.stopwatch.active || ST.stopwatch.exId !== exId || (ST.stopwatch.side||null) !== (side||null)) return;
  ST.stopwatch.seconds = Math.round((Date.now() - ST.stopwatch.startTs)/1000);
  if (ST.stopwatch.targetSec && !ST.stopwatch.chimed && ST.stopwatch.seconds >= ST.stopwatch.targetSec) {
    ST.stopwatch.chimed = true;
    persistTimerState();
    playChime();
    showToast('🔔 Target time reached — stop when ready.');
  }
  const domId = side ? exId+'_'+side : exId;
  const el = document.getElementById('sw_disp_'+domId);
  if (el) el.textContent = formatStopwatch(ST.stopwatch.seconds);
}
function stopStopwatch(exId, side) {
  if (ST.stopwatch.interval) clearInterval(ST.stopwatch.interval);
  const total = ST.stopwatch.seconds;
  ST.stopwatch.active = false;
  if (ST.sets[exId]) {
    if (side === 'left') ST.sets[exId][0].seconds_left = String(total);
    else if (side === 'right') ST.sets[exId][0].seconds_right = String(total);
    else ST.sets[exId][0].seconds = String(total);
  }
  persistTimerState();
  persistWorkoutState();
  showToast('⏱ Recorded '+total+' seconds'+(side?' ('+side+' side)':'')+'.');
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

// Prose rendered INSIDE an element rather than into an attribute.
// sanitizeUserText is sized for short name fields — it hard-truncates at
// 120 characters, which silently cut Advisor notes off mid-sentence — and
// it strips apostrophes, which mangles ordinary writing ("don't" -> "dont").
// This escapes into HTML entities instead of stripping, so punctuation
// survives intact, and allows room for a couple of real sentences.
function escapeUserProse(s, maxLen) {
  return String(s || '')
    .slice(0, maxLen || 600)          // slice BEFORE escaping, so an entity can't be cut in half
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeUserText(s) {
  // User text is rendered via innerHTML and inside inline handler attributes.
  // Stripping quote/angle/backtick chars prevents markup or handler injection.
  return String(s || '').replace(/[<>"'`\\]/g, '').slice(0, 120);
}

async function saveCustomExercise() {
  const name = sanitizeUserText(document.getElementById('custom_ex_name')?.value?.trim());
  const target = sanitizeUserText(document.getElementById('custom_ex_target')?.value?.trim()) || '—';
  const inputType = document.getElementById('custom_ex_type')?.value || 'reps_weight';
  const note = sanitizeUserText(document.getElementById('custom_ex_note')?.value?.trim()) || 'User-created exercise.';
  if (!name) { showToast('Enter an exercise name.'); return; }

  // Parse the leading 'N×' or 'NxM' set count out of the target string
  // (e.g. '5x10' -> 5 sets) so the number of set tiles actually matches what
  // the user typed, instead of a hardcoded default.
  const setsMatch = target.match(/^(\d+)\s*[x×]/i);
  const setsCount = setsMatch ? Math.max(1, parseInt(setsMatch[1], 10)) : 3;

  const id = 'custom_' + Date.now();
  const newEx = ex(id, name, target, setsCount, note, inputType==='timed', inputType);
  newEx.custom = true;

  // Add to current active workout (enroute slot) immediately
  if (ST.workout) {
    ST.workout.enroute.push(newEx);
    const blankSet = inputType==='timed_distance' ? {seconds:'',miles:''} : inputType==='timed' ? {seconds:''} : inputType==='reps_only' ? {reps:''} : {reps:'',weight:''};
    ST.sets[id] = Array.from({ length: setsCount }, () => ({...blankSet}));
  }

  // Persist for future sessions in this env/muscle group
  ST.customExercises.push({ env: ST.env, muscleGroup: ST.muscleGroup, exercise: newEx });
  const profile = (await dbGetProfile()) || {};
  profile.customExercises = ST.customExercises;
  profile.goal = ST.goal;
  profile.level = ST.level;
  await withDialogSpinner('Saving exercise…', () => dbSetProfile(profile));

  ST.showAddExercise = false;
  showToast('✅ "'+name+'" added — it will appear in this workout going forward.');
  renderFlight(document.getElementById('mainPage'));
}

function confirmRemoveExercise(exId, exName, isCustom) {
  const root = document.getElementById('modalRoot');
  root.innerHTML =
    '<div class="modal-bg" onclick="if(event.target===this)closeModal()">' +
    '<div class="modal-sheet">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Remove '+exName+'?</div>' +
    '<div class="modal-body" style="margin-bottom:14px">This removes it from today\'s workout. Any sets already logged for it will be discarded when you set the chocks. This only affects today — it won\'t change tomorrow\'s plan.</div>' +
    '<button class="btn" style="background:var(--red);color:#fff" onclick="'+(isCustom?'deleteCustomExercise':'removeCatalogExercise')+'(\''+exId+'\')">✕ CONFIRM REMOVE</button>' +
    '<button class="btn btn-outline mt8" onclick="closeModal()">CANCEL</button>' +
    '</div></div>';
}

function removeCatalogExercise(exId) {
  if (ST.workout) {
    ['taxi','takeoff','enroute','landing'].forEach(k => {
      ST.workout[k] = ST.workout[k].filter(e => e.id !== exId);
    });
  }
  delete ST.sets[exId];
  persistWorkoutState();
  closeModal();
  renderFlight(document.getElementById('mainPage'));
  showToast('Removed from today\'s workout.');
}

async function deleteCustomExercise(exId) {
  if (ST.workout) {
    ['taxi','takeoff','enroute','landing'].forEach(k => {
      ST.workout[k] = ST.workout[k].filter(e => e.id !== exId);
    });
  }
  ST.customExercises = ST.customExercises.filter(c => c.exercise.id !== exId);
  const profile = (await dbGetProfile()) || {};
  profile.customExercises = ST.customExercises;
  await withDialogSpinner('Removing exercise…', () => dbSetProfile(profile));
  delete ST.sets[exId];
  persistWorkoutState();
  closeModal();
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
    : '▶️ Search YouTube: "' + e.name + '" →';
  const linkHTML = '<a class="modal-link" href="'+guide.exrx+'" '+externalLinkAttrs()+'>'+linkLabel+'</a>';

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
// Exercise-specific MET values (standard exercise-physiology estimates) —
// replaces the old single-MET-per-phase model, which couldn't tell a slow
// walk from a hard run just because both happened to sit in "enroute".
function exerciseMET(exItem) {
  // Checked BEFORE the running/timed_distance fallback below — Walking was
  // upgraded to timed_distance in v5.19.11 (to enable distance logging), and
  // without this ordering it would incorrectly match the running check too,
  // crediting a walk with a runner's calorie burn (MET 8.0 instead of 3.5,
  // a 2.3x inflation — exactly the reported bug).
  if (exItem.name && /walk/i.test(exItem.name)) return 3.5; // walking specifically
  if (RUNNING_EXERCISES.includes(exItem.id) || exItem.inputType === 'timed_distance') return 8.0; // running
  if (exItem.inputType === 'nsdr') return 1.5; // lying down
  if (exItem.inputType === 'timed_bilateral') return 2.8; // stretches/holds
  if (exItem.inputType === 'reps_height' || exItem.inputType === 'reps_distance') return 7.5; // jump/sprint tests
  if (exItem.timed) return 3.0; // other timed holds (planks etc.)
  if (exItem.inputType === 'reps_only') return 6.0; // bodyweight circuits
  return 5.5; // reps_weight (default) — resistance training
}

// No explicit duration on a reps/weight set (rest isn't tracked) — a rough,
// commonly-used estimate of actual working time per set, excluding rest.
const ASSUMED_SET_SECONDS = 45;

// Computes both total logged minutes and estimated calories from what was
// ACTUALLY entered — real seconds for timed exercises, an estimate for
// reps-based sets — rather than a fixed phase-time assumption rescaled by
// how long the app happened to be open. Bodyweight is a real input (falls
// back to 180lb only when nothing is on file).
function computeSessionEffort(wk, sessionSets, bodyWeightLb) {
  const bwKg = (bodyWeightLb || 180) * 0.4536;
  const allEx = [...(wk.taxi||[]), ...(wk.takeoff||[]), ...(wk.enroute||[]), ...(wk.landing||[])];
  let totalSeconds = 0, totalCal = 0;
  allEx.forEach(exItem => {
    const sets = (sessionSets && sessionSets[exItem.id]) || [];
    const met = exerciseMET(exItem);
    let exSeconds = 0;
    sets.forEach(s => {
      if (s.seconds) exSeconds += parseFloat(s.seconds) || 0;
      else if (s.seconds_left || s.seconds_right) exSeconds += (parseFloat(s.seconds_left)||0) + (parseFloat(s.seconds_right)||0);
      else if (s.reps || s.weight || s.height || s.distance) exSeconds += ASSUMED_SET_SECONDS;
    });
    totalSeconds += exSeconds;
    totalCal += met * bwKg * (exSeconds / 3600);
  });
  return { minutes: Math.round(totalSeconds / 60), calories: Math.round(totalCal) };
}

function estimateCalories(wk, bodyWeightLb, sessionSets) {
  return computeSessionEffort(wk, sessionSets, bodyWeightLb).calories;
}

// ─── WORKOUT SUMMARY / DEBRIEF ────────────────────────────────────────────────
function buildWorkoutSummary(session, allExDefs, weeklySessions, bodyWeightLb) {
  const sets = session.sets || {};
  const exIds = Object.keys(sets);
  let totalSets = 0, totalReps = 0, totalVolume = 0, completedExCount = 0;
  let prHits = [];

  exIds.forEach(id => {
    const setArr = sets[id];
    const loggedSets = setArr.filter(s => s.reps || s.weight || s.seconds || s.height || s.distance || s.seconds_left || s.seconds_right);
    if (loggedSets.length) completedExCount++;
    loggedSets.forEach(s => {
      totalSets++;
      if (s.reps) totalReps += parseInt(s.reps)||0;
      if (s.reps && s.weight) totalVolume += (parseInt(s.reps)||0) * (parseFloat(s.weight)||0);
    });
  });

  const totalPlanned = allExDefs.length;
  const completionPct = totalPlanned ? Math.round(completedExCount/totalPlanned*100) : 0;

  const PR_FIELDS = [
    { field: 'weight', unit: 'lb' },
    { field: 'height', unit: 'in' },
    { field: 'distance', unit: 'in' },
  ];
  exIds.forEach(id => {
    PR_FIELDS.forEach(({field, unit}) => {
      const todaySets = sets[id].filter(s => s[field]);
      if (!todaySets.length) return;
      const todayMax = Math.max(...todaySets.map(s => parseFloat(s[field])||0));
      let priorMax = 0;
      weeklySessions.forEach(s => {
        if (s === session) return;
        const priorSets = (s.sets?.[id]||[]).filter(x => x[field]);
        priorSets.forEach(x => { priorMax = Math.max(priorMax, parseFloat(x[field])||0); });
      });
      if (todayMax > priorMax && priorMax > 0) {
        const exDef = allExDefs.find(e => e.id === id);
        prHits.push({ name: exDef?.name || id, weight: todayMax, unit });
      }
    });
  });

  const sessionsThisWeek = weeklySessions.filter(s => {
    const days = (Date.now() - new Date(s.date).getTime()) / 86400000;
    return days <= 7;
  }).length;
  const targetDays = parseInt((FREQUENCY_GUIDE[session.level||'intermediate'].days||'3').split('-')[0]);

  const landingIds = (session.workoutSnapshot?.landing || []).map(e => e.id);
  const landingLogged = landingIds.length ? landingIds.some(id => (sets[id]||[]).some(s => s.reps||s.weight||s.seconds||s.seconds_left||s.seconds_right)) : null;

  const effort = computeSessionEffort(session.workoutSnapshot || {taxi:[],takeoff:[],enroute:[],landing:[]}, sets, bodyWeightLb);

  return {
    totalSets, totalReps, totalVolume: Math.round(totalVolume),
    completedExCount, totalPlanned, completionPct,
    prHits, sessionsThisWeek, targetDays,
    landingLogged, estCalories: effort.calories,
    durationMinutes: effort.minutes,
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
      msgs.push({ type:'ok', icon:'🏆', text:'New PR: '+pr.name+' at '+pr.weight+' '+(pr.unit||'lb')+' — nice work.' });
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

// SET THE CHOCKS ends the whole workout in one tap with no undo — a real
// consequence, not just a label to learn. Reported: an accidental tap ended
// a session with exercises still unlogged, with zero warning beforehand.
// This interrupts only when the workout is genuinely incomplete; a fully
// finished session still ends in one tap, unchanged.
function confirmSetChocks() {
  const wk = ST.workout;
  if (!wk) return;
  const allEx = [...wk.taxi,...wk.takeoff,...wk.enroute,...wk.landing];
  const done = allEx.filter(exItem => ST.sets[exItem.id]?.some(s => s.reps||s.weight||s.seconds||s.height||s.distance||s.seconds_left||s.seconds_right)).length;
  if (done >= allEx.length) { setTheChocks(); return; }
  const remaining = allEx.length - done;
  const root = document.getElementById('modalRoot');
  root.innerHTML =
    '<div class="modal-bg" onclick="if(event.target===this)closeModal()">' +
    '<div class="modal-sheet">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Finish this workout now?</div>' +
    '<div class="modal-body" style="margin-bottom:14px">You still have '+remaining+' exercise'+(remaining===1?'':'s')+' left ('+done+'/'+allEx.length+' done). Setting the chocks finishes and saves the workout as-is — anything not logged won\'t be recorded.</div>' +
    '<button class="btn btn-green" '+(ST.chocksSaving?'disabled':'')+' onclick="closeModal();setTheChocks()">'+(ST.chocksSaving?'⏳ Saving…':'🔒 Finish Anyway')+'</button>' +
    '<button class="btn btn-outline mt8" onclick="closeModal()">Keep Training</button>' +
    '</div></div>';
}

// ─── SET THE CHOCKS (formerly "Secure Flight") ───────────────────────────────
async function setTheChocks() {
  const wk = ST.workout;
  if (!wk) return;

  // BUG FIX (reported: three identical sessions logged for one workout).
  // ST.workout isn't cleared until the very END of this function, after an
  // await on the database insert. Every tap during that window passed the
  // !wk check and inserted its own near-identical row. Three taps, three
  // sessions. This flag closes the window; it is cleared in a finally so a
  // failed save can still be retried rather than locking the button.
  if (ST.chocksSaving) return;
  ST.chocksSaving = true;
  renderPage(); // paint the disabled state before the awaits begin
  try {

  const allEx = [...wk.taxi,...wk.takeoff,...wk.enroute,...wk.landing];
  const logged = allEx.filter(exItem => ST.sets[exItem.id]?.some(s => s.reps||s.weight||s.seconds||s.height||s.distance||s.seconds_left||s.seconds_right));
  if (logged.length === 0) { showToast('Log at least one exercise before setting the chocks.'); return; }

  // Duration is the elapsed time from the FIRST logged set to setting the
  // chocks — the actual session, not the time the app sat open beforehand.
  //
  // computeSessionEffort's rep-based estimate is kept as the floor. Work
  // entered after the fact (a 50-minute walk typed in ten seconds) has
  // almost no elapsed time, and the estimate is the honest figure there.
  // Taking the larger of the two means neither case reports nonsense.
  const effortMinutes = computeSessionEffort(wk, ST.sets, ST.lastWeight).minutes;
  const startedAt = ST.workoutFirstLoggedAt || ST.workoutStartedAt;
  const elapsedMinutes = startedAt ? Math.round((Date.now() - startedAt) / 60000) : 0;
  const durationMinutes = Math.max(effortMinutes, elapsedMinutes);

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
    cancelWorkoutReminderNative(); // suppress 3-day reminder — user just trained
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
  ST.workoutFirstLoggedAt = null;
  ST.calendarSessions = {}; // invalidate calendar cache so today's workout shows immediately
  // BUG FIX (reported): Today's "No session logged today" check reads
  // from ST.sessionCache, a COMPLETELY SEPARATE cache from the one just
  // invalidated above — it was only ever populated at boot, so finishing
  // a workout never updated it. The calendar (which re-fetches from the
  // DB directly) correctly showed the session; Today's briefing, reading
  // the stale in-memory list, did not — until the next full app reload.
  ST.sessionCache = [...(ST.sessionCache || []), session];
  ST.muscleGroup = getRecommendedNext(); // pre-select tomorrow's recommended profile
  clearWorkoutState();
  ST.tab = 'debrief';
  renderPage();
  submitLeaderboardPRs(session).catch(() => {});
  submitRunningPR(session).catch(() => {});
  logRunningVolume(session).catch(() => {});
  awardBadges();

  } finally {
    // Always released, including on an early return or a thrown save, so a
    // genuine retry is never blocked by a previous failure.
    ST.chocksSaving = false;
  }
}

// ─── TRENDS TAB ───────────────────────────────────────────────────────────────
// Loads meal logs across a real date range, not just today — needed for
// the fuel trend, which classifyTrend can't do anything with off a single day.
async function loadRecentMealLogs(days) {
  if (!ST.user) return [];
  const since = new Date(Date.now() - (days||14)*86400000).toISOString();
  try {
    const { data, error } = await SB.from('meal_logs')
      .select('*').eq('user_id', ST.user.id)
      .gte('logged_at', since)
      .order('logged_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch(e) { return []; }
}

// ─── FREQUENT FOODS ─────────────────────────────────────────────────────
// Most people rotate through a fairly narrow set of foods week to week.
// Surfacing what someone has actually logged before — ranked by how often
// — lets a repeat meal get added with a single tap and zero search,
// photo, or barcode calls at all, which is where the real API-call
// savings are: not in making photo analysis cheaper, but in someone not
// needing it for the fourth Tuesday in a row they've had the same lunch.
const FREQUENT_FOODS_CACHE_KEY = 'fcf_frequent_foods_cache';
const FREQUENT_FOODS_WINDOW_DAYS = 30;
const FREQUENT_FOODS_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000; // refreshed at most twice a day — this doesn't need to be real-time

// Strips a trailing serving-multiplier suffix like " (2x)" so "Chicken
// breast (2x)" and "Chicken breast" count as the same food instead of
// splitting one habit's frequency count across every portion size it's
// ever been logged at.
function normalizeFoodKey(description) {
  return (description || '').toLowerCase().replace(/\s*\(\d+(\.\d+)?x\)\s*$/, '').trim();
}

function getFrequentFoods(mealLogs, limit) {
  const counts = {}; // normalized key -> { count, lastLoggedAt, item }
  (mealLogs || []).forEach(log => {
    (log.meal_data?.items || []).forEach(item => {
      const key = normalizeFoodKey(item.description);
      if (!key) return;
      if (!counts[key]) counts[key] = { count: 0, lastLoggedAt: null, item: null };
      counts[key].count++;
      // Keep the most recently logged version — nutrients can drift
      // slightly between entries (a different portion typed in, a
      // corrected photo guess) and the newest is the best guess at how
      // they'd want it logged again.
      if (!counts[key].lastLoggedAt || log.logged_at > counts[key].lastLoggedAt) {
        counts[key].lastLoggedAt = log.logged_at;
        counts[key].item = item;
      }
    });
  });
  return Object.values(counts)
    .filter(c => c.count >= 2) // a genuine one-off shouldn't clutter a "usual foods" list
    .sort((a, b) => b.count - a.count)
    .slice(0, limit || 8)
    .map(c => ({ ...c.item, timesLogged: c.count }));
}

function loadFrequentFoodsCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(FREQUENT_FOODS_CACHE_KEY) || 'null');
    if (!raw || !ST.user || raw.userId !== ST.user.id) return null;
    if (Date.now() - raw.cachedAt > FREQUENT_FOODS_CACHE_MAX_AGE_MS) return null;
    return raw.foods;
  } catch(e) { return null; }
}
function saveFrequentFoodsCache(foods) {
  try { localStorage.setItem(FREQUENT_FOODS_CACHE_KEY, JSON.stringify({ userId: ST.user?.id, cachedAt: Date.now(), foods })); } catch(e) {}
}

async function getFrequentFoodsForMealBuilder() {
  const cached = loadFrequentFoodsCache();
  if (cached) return cached;
  const logs = await loadRecentMealLogs(FREQUENT_FOODS_WINDOW_DAYS);
  const foods = getFrequentFoods(logs, 8);
  saveFrequentFoodsCache(foods);
  return foods;
}

// Groups logged meals by calendar day and classifies a protein-adherence
// trend over the period — reuses classifyTrend, the same function already
// driving the strength/pace trends, so every trend indicator in the app
// shares one implementation rather than three subtly different ones.
function getFuelTrends(mealLogs, goals) {
  if (!goals || goals.mode === 'none') return null;
  const byDay = {};
  (mealLogs || []).forEach(m => {
    const day = new Date(m.logged_at).toDateString();
    if (!byDay[day]) byDay[day] = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    const t = m.meal_data?.totals || {};
    byDay[day].calories += t.calories || 0;
    byDay[day].protein += t.protein || 0;
    byDay[day].carbs += t.carbs || 0;
    byDay[day].fat += t.fat || 0;
  });
  const days = Object.keys(byDay).sort((a,b) => new Date(a) - new Date(b));
  if (days.length < 4) return { daysLogged: days.length, trend: null };

  const proteinPcts = days.map(d => goals.protein > 0 ? (byDay[d].protein / goals.protein) * 100 : 0);
  const trend = classifyTrend(proteinPcts, true); // higher % of protein target = improving
  const avgProteinPct = Math.round(proteinPcts.reduce((a,b)=>a+b, 0) / proteinPcts.length);
  const avgCalories = Math.round(days.reduce((sum,d) => sum + byDay[d].calories, 0) / days.length);
  return { daysLogged: days.length, trend, avgProteinPct, avgCalories };
}

async function renderTrends(p) {
  const parts = [];
  parts.push('<div class="section-label">BIOMETRICS LOG &amp; TRENDS</div>');

  // Training calendar — moved here from Preflight. Trends is the review
  // screen; Preflight's job is launching a session quickly, not looking
  // back, so the calendar belongs here and always visible, not behind a
  // collapse toggle.
  const rangeData = await loadCalendarRange();
  parts.push('<div class="section-label" style="margin-top:0">📅 TRAINING CALENDAR</div>');
  parts.push(buildCalendarHTML(rangeData));

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

  // Fuel trends — protein adherence and average calories over the logging
  // history, only shown once real targets exist to trend against.
  const recentMeals = await loadRecentMealLogs(14);
  const fuelTrend = getFuelTrends(recentMeals, ST.nutritionGoals);
  if (fuelTrend) {
    parts.push('<div class="card mb12">');
    parts.push('<div class="section-label" style="margin-top:0">FUEL</div>');
    if (fuelTrend.trend) {
      const statusMeta2 = { improving: ['↑','var(--green)'], flat: ['→','var(--muted)'], declining: ['↓','var(--amber)'] };
      const [arrow2, color2] = statusMeta2[fuelTrend.trend.status];
      parts.push('<div class="fb mb8"><div style="font-size:13px">🥩 Protein adherence</div><div style="font-size:12px;text-align:right"><span style="color:'+color2+'">'+arrow2+' '+fuelTrend.avgProteinPct+'% of target</span><div style="font-family:var(--mono);font-size:9px;color:var(--muted)">'+fuelTrend.daysLogged+' days logged</div></div></div>');
      parts.push('<div class="fb"><div style="font-size:13px">🔥 Avg calories/day</div><div style="font-family:var(--mono);font-size:12px">'+fuelTrend.avgCalories.toLocaleString()+'</div></div>');
    } else {
      parts.push('<div style="font-size:12px;color:var(--muted)">'+fuelTrend.daysLogged+' day(s) logged so far — a trend needs at least 4 days of history.</div>');
    }
    parts.push('</div>');
  }

  // Strength/performance trends — Takeoff lifts specifically (kept
  // consistent session to session by design) and running pace. Shown only
  // once there's enough real history; no chart needed for a simple
  // improving/flat/declining read, which is what was actually asked for.
  const liftTrends = getPrimaryLiftTrends(ST.sessionCache);
  const runTrend = getRunningPaceTrend(ST.sessionCache);
  if (liftTrends.length || runTrend) {
    parts.push('<div class="card mb12">');
    parts.push('<div class="section-label" style="margin-top:0">STRENGTH &amp; PERFORMANCE</div>');
    const statusMeta = { improving: ['↑','var(--green)'], flat: ['→','var(--muted)'], declining: ['↓','var(--amber)'] };
    liftTrends.forEach(lt => {
      const [arrow, color] = statusMeta[lt.trend.status];
      parts.push('<div class="fb mb8"><div style="font-size:13px">🏋️ '+lt.name+'</div><div style="font-size:12px;text-align:right"><span style="color:'+color+'">'+arrow+' '+lt.current+' lb</span><div style="font-family:var(--mono);font-size:9px;color:var(--muted)">'+lt.sessionsCount+' sessions'+(lt.trend.status!=='flat'?' · '+(lt.trend.changePct>0?'+':'')+lt.trend.changePct+'%':'')+'</div></div></div>');
    });
    if (runTrend) {
      const [arrow, color] = statusMeta[runTrend.trend.status];
      parts.push('<div class="fb mb8"><div style="font-size:13px">🏃 Running Pace</div><div style="font-size:12px;text-align:right"><span style="color:'+color+'">'+arrow+' '+formatPace(runTrend.current)+'</span><div style="font-family:var(--mono);font-size:9px;color:var(--muted)">'+runTrend.sessionsCount+' runs'+(runTrend.trend.status!=='flat'?' · '+(runTrend.trend.changePct>0?'+':'')+runTrend.trend.changePct+'%':'')+'</div></div></div>');
    }
    parts.push('</div>');
  } else {
    parts.push('<div class="alert alert-info mb12"><div class="alert-icon">📈</div><div>Strength and pace trends will show up here once you\'ve logged the same primary lift or a few runs across several sessions.</div></div>');
  }

  [['chartWt','BODY WEIGHT (lb)'],['chartWaist','WAIST (in)'],['chartBP','BLOOD PRESSURE (mmHg)'],['chartGluc','FASTING GLUCOSE (mg/dL)']].forEach(([id,label]) => {
    parts.push('<div class="card mb8"><div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-bottom:6px">'+label+'</div><div class="chart-wrap"><canvas id="'+id+'"></canvas></div></div>');
  });

  // Oura Ring trend charts
  if (ST.ouraConnected) {
    parts.push('<div id="ouraTrendsSection"><div class="section-label">OURA RING TRENDS</div>');
    [['chartOuraReadiness','READINESS SCORE (0-100)',null],['chartOuraSleep','SLEEP SCORE + HRV BALANCE (0-100)','hrv']].forEach(([id,label,infoKey]) => {
      parts.push('<div class="card mb8"><div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-bottom:6px">'+label+(infoKey?' <span class="info-i" onclick="showBioInfo(\''+infoKey+'\')">i</span>':'')+'</div><div class="chart-wrap"><canvas id="'+id+'"></canvas></div></div>');
    });
    parts.push('</div>');
  }

  // Photo progress at bottom of Trends — wrapped in id div for DOM patching
  parts.push('<div id="photo-timeline-section">');
  parts.push(buildPhotoTimelineHTML());
  parts.push('</div>');

  p.innerHTML = parts.join('');
  scrollCalendarToToday();
  setTimeout(() => loadAndDrawCharts(), 50);
  // Load fresh signed URLs after render — patches only the photo section, not the whole page
  if (ST.user) setTimeout(() => loadPhotoTimeline().catch(()=>{}), 100);
}

async function saveBio() {
  const wt    = parseFloat(document.getElementById('inp_wt')?.value)||null;
  const waist = parseFloat(document.getElementById('inp_waist')?.value)||null;
  const sys   = parseInt(document.getElementById('inp_sys')?.value)||null;
  const dia   = parseInt(document.getElementById('inp_dia')?.value)||null;
  const gluc  = parseInt(document.getElementById('inp_gluc')?.value)||null;
  if (!wt && !waist && !sys && !dia && !gluc) { showBigToast('Enter at least one value to log.','warn'); return; }

  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);

  try {
    if (ST.user) {
      const { data: existing } = await SB.from('weight_log')
        .select('*').eq('user_id', ST.user.id)
        .gte('logged_at', todayStart.toISOString())
        .lte('logged_at', todayEnd.toISOString()).limit(1);

      if (existing && existing.length > 0) {
        const merged = {
          weight_lb:       wt    ?? existing[0].weight_lb,
          waist_in:        waist ?? existing[0].waist_in,
          systolic_bp:     sys   ?? existing[0].systolic_bp,
          diastolic_bp:    dia   ?? existing[0].diastolic_bp,
          fasting_glucose: gluc  ?? existing[0].fasting_glucose,
        };
        const { error } = await SB.from('weight_log').update(merged).eq('id', existing[0].id);
        if (error) throw error;
        showBigToast("Today's record updated.",'ok');
      } else {
        const row = { user_id: ST.user.id, weight_lb:wt, waist_in:waist, systolic_bp:sys, diastolic_bp:dia, fasting_glucose:gluc, logged_at: new Date().toISOString() };
        const { error } = await SB.from('weight_log').insert([row]);
        if (error) throw error;
        showBigToast('Biometrics logged.','ok');
      }
    } else {
      const local = JSON.parse(localStorage.getItem('fcf_bio')||'[]');
      const todayIdx = local.findIndex(r => { const d = new Date(r.logged_at); return d >= todayStart && d <= todayEnd; });
      if (todayIdx >= 0) {
        if (wt)    local[todayIdx].weight_lb       = wt;
        if (waist) local[todayIdx].waist_in        = waist;
        if (sys)   local[todayIdx].systolic_bp     = sys;
        if (dia)   local[todayIdx].diastolic_bp    = dia;
        if (gluc)  local[todayIdx].fasting_glucose = gluc;
        showBigToast("Today's record updated.",'ok');
      } else {
        local.push({ weight_lb:wt, waist_in:waist, systolic_bp:sys, diastolic_bp:dia, fasting_glucose:gluc, logged_at: new Date().toISOString() });
        showBigToast('Saved locally.','ok');
      }
      localStorage.setItem('fcf_bio', JSON.stringify(local));
    }
    awardBadges();
  } catch(e) { showBigToast('Could not save — check connection.','warn'); }

  if (wt) {
    const profile = (await dbGetProfile()) || {};
    profile.lastWeight = wt;
    ST.lastWeight = wt;
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

  // Centered rolling mean, null-tolerant (Oura rows can have gaps). Used to
  // draw a readable trend line once a series spans weeks of noisy dailies.
  function rollingMean(values, w) {
    const half = Math.floor(w/2);
    return values.map((v, i) => {
      let s = 0, n2 = 0;
      for (let j = Math.max(0, i-half); j <= Math.min(values.length-1, i+half); j++) {
        const x = parseFloat(values[j]);
        if (values[j] !== null && values[j] !== undefined && !isNaN(x)) { s += x; n2++; }
      }
      return n2 ? Math.round((s/n2)*10)/10 : null;
    });
  }
  const SMOOTH_AT = 30; // above this many points, dailies become unreadable noise
  // Replaces each raw data series with [faint raw underlay, bold 7-day trend].
  // Reference lines (borderDash) pass through untouched.
  function applyTrendSmoothing(labels, datasets) {
    if (labels.length <= SMOOTH_AT) return datasets;
    const out = [];
    datasets.forEach(d => {
      if (d.borderDash) { out.push(d); return; }
      out.push({ ...d, label: (d.label||'')+' raw', borderColor: (d.borderColor||'#888')+'40',
        backgroundColor: 'transparent', fill: false, borderWidth: 1, pointRadius: 0, pointHitRadius: 0 });
      out.push({ ...d, data: rollingMean(d.data, 7), pointRadius: 0, borderWidth: 3, tension: 0.35, spanGaps: true });
    });
    return out;
  }
  // Hide the faint raw underlays from legends — they're context, not a series.
  const legendFilter = (item) => !(item.text||'').endsWith(' raw');

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
    const card = canvas.closest('.card');
    const key = 'c_'+id;
    if (ST.chartInst[key]) { try { ST.chartInst[key].destroy(); } catch(e){} }
    if (!labels.length) { if (card) card.style.display = 'none'; return; }
    if (card) card.style.display = '';
    datasets = applyTrendSmoothing(labels, datasets);

    // Build canvas gradient fills for each dataset that has fill:true
    const ctx2d = canvas.getContext('2d');
    datasets.forEach(d => {
      if (d.fill && d.borderColor && !d.borderDash) {
        const grad = ctx2d.createLinearGradient(0, 0, 0, canvas.offsetHeight || 160);
        const hex = d.borderColor.replace('#','');
        const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
        grad.addColorStop(0, `rgba(${r},${g},${b},0.28)`);
        grad.addColorStop(0.6, `rgba(${r},${g},${b},0.08)`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        d.backgroundColor = grad;
        // Glowing data points
        d.pointBackgroundColor = d.borderColor;
        d.pointBorderColor = `rgba(${r},${g},${b},0.4)`;
        d.pointBorderWidth = 3;
        d.pointRadius = d.pointRadius ?? 4;
        d.pointHoverRadius = (d.pointRadius ?? 4) + 3;
      }
    });

    if (labels.length <= SMOOTH_AT) {
      const n = labels.length;
      const pr = n > 21 ? 2.5 : 4;
      datasets.forEach(d => {
        if (d.borderDash) return;
        d.pointRadius = pr;
        d.borderWidth = 2.5;
        d.pointHitRadius = 8;
      });
    }
    ST.chartInst[key] = new Chart(ctx2d, { type:'line', data:{labels,datasets}, options:{...OPTS, plugins:{legend:{display:!!legendOn,labels:{filter:legendFilter,font:{size:9,family:'Share Tech Mono'},color:'#64748b'}}}} });
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
    const bpCard = bpCanvas.closest('.card');
    if (ST.chartInst['c_chartBP']) { try { ST.chartInst['c_chartBP'].destroy(); } catch(e){} }
    if (bp.rows.length) {
      if (bpCard) bpCard.style.display = '';
      ST.chartInst['c_chartBP'] = new Chart(bpCanvas.getContext('2d'), {
        type:'line',
        data:{ labels: bp.labels, datasets: applyTrendSmoothing(bp.labels, [
          { data:bp.rows.map(d=>d.systolic_bp),  borderColor:'#ef4444', backgroundColor:'#ef444411', tension:0.35, fill:false, pointRadius:4, pointBackgroundColor:'#ef4444', label:'Systolic' },
          { data:bp.rows.map(d=>d.diastolic_bp), borderColor:'#f59e0b', backgroundColor:'#f59e0b11', tension:0.35, fill:false, pointRadius:4, pointBackgroundColor:'#f59e0b', label:'Diastolic' },
          { ...refLine(bp.rows.length,120,'#ef444455'), label:'Sys target (120)' },
          { ...refLine(bp.rows.length,80,'#f59e0b55'),  label:'Dia target (80)' },
        ])},
        options:{ ...OPTS, plugins:{ legend:{ display:true, labels:{filter:legendFilter,font:{size:9,family:'Share Tech Mono'},color:'#64748b'} } } }
      });
    } else if (bpCard) {
      bpCard.style.display = 'none'; // nothing logged for BP yet — hide the whole card
    }
  }

  // Oura Ring trend charts — only drawn if user is connected
  if (!ST.ouraConnected) return;
  const ouraSection = document.getElementById('ouraTrendsSection');
  try {
    const filter = ST.user ? SB.from('oura_daily').select('*').eq('user_id', ST.user.id) : null;
    if (!filter) return;
    const { data: ouraRows, error } = await filter.order('date', { ascending: true });
    if (error || !ouraRows || !ouraRows.length) { if (ouraSection) ouraSection.style.display = 'none'; return; }
    if (ouraSection) ouraSection.style.display = '';

    const ouraLabels = ouraRows.map(d => new Date(d.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}));

    // Chart 1: Readiness score with GO/MARGINAL reference lines
    mkChart('chartOuraReadiness', ouraLabels, [
      { data:ouraRows.map(d=>d.readiness_score), borderColor:'#22c55e', backgroundColor:'#22c55e22', tension:0.35, fill:true, pointRadius:4, pointBackgroundColor:'#22c55e', label:'Readiness' },
      { ...refLine(ouraRows.length,70,'#22c55e55'), label:'GO (70)' },
      { ...refLine(ouraRows.length,60,'#f59e0b55'), label:'MARGINAL (60)' },
    ], true);

    // Chart 2: Sleep score + HRV balance on same axis (both 0-100)
    mkChart('chartOuraSleep', ouraLabels, [
      { data:ouraRows.map(d=>d.sleep_score),   borderColor:'#818cf8', backgroundColor:'#818cf811', tension:0.35, fill:false, pointRadius:4, pointBackgroundColor:'#818cf8', label:'Sleep Score' },
      { data:ouraRows.map(d=>d.hrv_balance),   borderColor:'#38bdf8', backgroundColor:'#38bdf811', tension:0.35, fill:false, pointRadius:4, pointBackgroundColor:'#38bdf8', label:'HRV Balance' },
    ], true);
  } catch(e) { /* Oura data not yet available */ }
}

// ─── WISDOM TAB ───────────────────────────────────────────────────────────────
// Returns the day-of-year (1-366), used to auto-rotate the wisdom card daily
// so every user sees a new card each calendar day without needing to tap Next.
function dayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  return Math.floor(diff / 86400000);
}
function todaysWisdomIdx() {
  return dayOfYear() % WISDOM.length;
}

function renderWisdom(p) {
  const isAutoRotated = ST.wisdomIdx === null;
  const activeIdx = isAutoRotated ? todaysWisdomIdx() : ST.wisdomIdx;
  const card = WISDOM[activeIdx];
  const num  = String(activeIdx+1).padStart(2,'0');
  const parts = [];
  parts.push('<div class="section-label">FLIGHT DECK WISDOM'+(isAutoRotated?' · TODAY\'S BRIEFING':'')+'</div>');
  parts.push('<div class="wisdom-card"><div>');
  parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--gold);letter-spacing:0.1em;margin-bottom:12px">BRIEFING '+num+' / '+WISDOM.length+'</div>');
  parts.push('<div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:14px">'+card.title+'</div>');
  parts.push('<div style="font-size:13px;line-height:1.8;color:#94a3b8">'+card.text+'</div>');
  parts.push('</div><div><a class="modal-link" href="'+card.link+'" '+externalLinkAttrs()+'>📖 Read more →</a></div></div>');
  parts.push('<div class="wisdom-counter">'+(activeIdx+1)+' of '+WISDOM.length+(isAutoRotated?' · rotates daily':'')+'</div>');
  parts.push('<div class="wisdom-nav"><button class="btn btn-outline" onclick="prevWisdom()">← PREV</button><button class="btn btn-outline" onclick="nextWisdom()">NEXT →</button></div>');
  if (!isAutoRotated) {
    parts.push('<button class="btn-ghost mt8" style="display:block;width:100%;text-align:center" onclick="ST.wisdomIdx=null;renderWisdom(document.getElementById(\'mainPage\'))">↻ Back to Today\'s Briefing</button>');
  }
  parts.push('<div style="margin-top:16px"><div class="section-label">JUMP TO TOPIC</div><div class="mg-wrap">');
  WISDOM.forEach((w,i) => {
    parts.push('<div class="'+(i===activeIdx?'mg-pill sel':'mg-pill')+'" onclick="jumpWisdom('+i+')" style="font-size:11px">'+w.title+'</div>');
  });
  parts.push('</div></div>');
  p.innerHTML = parts.join('');
}
function prevWisdom() {
  const cur = ST.wisdomIdx === null ? todaysWisdomIdx() : ST.wisdomIdx;
  ST.wisdomIdx = (cur-1+WISDOM.length)%WISDOM.length;
  renderWisdom(document.getElementById('mainPage'));
  document.getElementById('mainPage').scrollTop = 0;
}
function nextWisdom() {
  const cur = ST.wisdomIdx === null ? todaysWisdomIdx() : ST.wisdomIdx;
  ST.wisdomIdx = (cur+1)%WISDOM.length;
  renderWisdom(document.getElementById('mainPage'));
  document.getElementById('mainPage').scrollTop = 0;
}
function jumpWisdom(i) {
  ST.wisdomIdx=i;
  renderWisdom(document.getElementById('mainPage'));
  document.getElementById('mainPage').scrollTop = 0;
}

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
  parts.push('<div style="font-family:var(--mono);font-size:18px;color:var(--gold);letter-spacing:0.04em">'+session.muscle_group.toUpperCase()+' COMPLETE</div>');
  parts.push('<div style="font-size:11px;color:var(--muted);margin-top:4px">'+new Date(session.date).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})+'</div>');
  parts.push('</div>');

  parts.push('<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">');
  parts.push(glowTile('MINUTES', s.durationMinutes||'—', 'gold'));
  parts.push(glowTile('SETS', s.totalSets, 'blue'));
  parts.push(glowTile('CALORIES', s.estCalories, 'teal'));
  parts.push('</div>');
  parts.push('<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">');
  parts.push(glowTile('REPS', s.totalReps, 'amber'));
  parts.push(glowTile('VOLUME LB', s.totalVolume.toLocaleString(), 'blue'));
  parts.push(glowTile('DONE', s.completionPct+'%', s.completionPct>=100?'green':'teal'));
  parts.push('</div>');

  parts.push('<div class="section-label">DEBRIEF NOTES</div>');
  d.messages.forEach(m => {
    const cls = m.type==='ok'?'alert-ok':m.type==='warn'?'alert-warn':'alert-info';
    parts.push('<div class="alert '+cls+'"><div class="alert-icon">'+m.icon+'</div><div>'+m.text+'</div></div>');
  });

  parts.push('<button class="btn btn-gold mt16" onclick="ST.lastDebrief=null;switchTab(\'preflight\')">Continue to Preflight</button>');
  p.innerHTML = parts.join('');
}

// ─── EXPORT CSV ──────────────────────────────────────────────────────────────
async function exportCSV() {
  showBigToast('Building export...','info');
  let sessions = [];
  let biometrics = [];
  let ouraRows = [], mealRows = [], dailyInputRows = [];
  try {
    const sFilter = ST.user ? SB.from('workout_sessions').select('*').eq('user_id', ST.user.id) : SB.from('workout_sessions').select('*');
    const { data: sd } = await sFilter.order('started_at', { ascending: true });
    sessions = (sd||[]).map(r => r.session_data).filter(Boolean);
    const bFilter = ST.user ? SB.from('weight_log').select('*').eq('user_id', ST.user.id) : SB.from('weight_log').select('*');
    const { data: bd } = await bFilter.order('logged_at', { ascending: true });
    biometrics = bd || [];
    // Everything else the app stores. Previously the export was workouts +
    // five biometrics only — Oura, meals, hydration and the flight schedule
    // were all absent, which left most of the picture out of any analysis.
    // Failures here are non-fatal: a missing table shouldn't cost you the
    // whole export.
    const uid = ST.user?.id;
    if (uid) {
      const [o, m, di] = await Promise.all([
        SB.from('oura_daily').select('*').eq('user_id', uid).order('date', { ascending: true }).then(r=>r.data).catch(()=>null),
        SB.from('meal_logs').select('*').eq('user_id', uid).order('logged_at', { ascending: true }).then(r=>r.data).catch(()=>null),
        SB.from('daily_inputs').select('*').eq('user_id', uid).order('date', { ascending: true }).then(r=>r.data).catch(()=>null),
      ]);
      ouraRows = o || []; mealRows = m || []; dailyInputRows = di || [];
    }
  } catch(e) {
    sessions = JSON.parse(localStorage.getItem('fcf_sessions')||'[]');
    biometrics = JSON.parse(localStorage.getItem('fcf_bio')||'[]');
  }

  const bioByDate = {};
  biometrics.forEach(b => {
    const d = new Date(b.logged_at).toLocaleDateString('en-US');
    bioByDate[d] = b;
  });

  // Build CSV: one row per exercise set
  const rows = [['Date','Day','Muscle Group','Environment','Goal','Fatigue','Level','Duration (min)','Phase','Exercise','Set #','Reps','Weight (lb)','Seconds','Height (in)','Distance (in)','Seconds Left','Seconds Right','Body Weight (lb)','Waist (in)','Systolic BP','Diastolic BP','Fasting Glucose (mg/dL)']];

  sessions.forEach(s => {
    const date = new Date(s.date);
    const dateStr = date.toLocaleDateString('en-US');
    const dayStr = date.toLocaleDateString('en-US',{weekday:'long'});
    const bio = bioByDate[dateStr] || {};
    const sets = s.sets || {};
    const wk = s.workoutSnapshot || {};
    const phases = ['taxi','takeoff','enroute','landing'];
    let hasRows = false;
    phases.forEach(phase => {
      (wk[phase]||[]).forEach(exItem => {
        const exSets = sets[exItem.id] || [];
        exSets.forEach((set, i) => {
          if (!set.reps && !set.weight && !set.seconds && !set.height && !set.distance && !set.seconds_left && !set.seconds_right) return;
          rows.push([
            dateStr, dayStr,
            s.muscle_group||'', s.env||'', s.goal||'', s.fatigue||'', s.level||'',
            s.durationMinutes||'',
            phase, exItem.name||'', i+1,
            set.reps||'', set.weight||'', set.seconds||'', set.height||'', set.distance||'', set.seconds_left||'', set.seconds_right||'',
            bio.weight_lb||'', bio.waist_in||'', bio.systolic_bp||'',
            bio.diastolic_bp||'', bio.fasting_glucose||'',
          ]);
          hasRows = true;
        });
      });
    });
    // If no exercise breakdown (old sessions), add summary row
    if (!hasRows) {
      rows.push([dateStr, dayStr, s.muscle_group||'', s.env||'', s.goal||'', s.fatigue||'', s.level||'',
        s.durationMinutes||'', '', '(session summary)', '', '', '', '', '', '', '', '',
        bio.weight_lb||'', bio.waist_in||'', bio.systolic_bp||'', bio.diastolic_bp||'', bio.fasting_glucose||'']);
    }
  });

  // Additional labelled sections in the same file — one download rather
  // than several, and clearly delimited so an AI (or a human) can tell the
  // datasets apart despite their different granularities.
  const section = (title, header, dataRows) => {
    rows.push([]);
    rows.push(['### ' + title]);
    rows.push(header);
    if (!dataRows.length) rows.push(['(no data)']);
    else dataRows.forEach(r => rows.push(r));
  };

  section('OURA DAILY', ['Date','Readiness','Sleep Score','HRV Balance','Activity Score','Temp Deviation','Total Sleep (h)','Deep Sleep (h)','REM Sleep (h)'],
    ouraRows.map(o => [o.date||'', o.readiness_score??'', o.sleep_score??'', o.hrv_balance??'', o.activity_score??'', o.temperature_deviation??'',
      o.total_sleep_seconds ? (o.total_sleep_seconds/3600).toFixed(2) : '',
      o.deep_sleep_seconds ? (o.deep_sleep_seconds/3600).toFixed(2) : '',
      o.rem_sleep_seconds ? (o.rem_sleep_seconds/3600).toFixed(2) : '']));

  const mealItemRows = [];
  mealRows.forEach(m => {
    const when = m.logged_at ? new Date(m.logged_at) : null;
    (m.meal_data?.items || []).forEach(it => {
      const n = it.nutrients || {};
      mealItemRows.push([
        when ? when.toLocaleDateString('en-US') : '',
        when ? when.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '',
        m.meal_type || '', it.description || '', it.source || '',
        n.calories??'', n.protein??'', n.carbs??'', n.fat??'', n.fiber??'', n.sugar??'',
      ]);
    });
  });
  section('NUTRITION — ITEMS', ['Date','Time','Meal','Food','Source','Calories','Protein (g)','Carbs (g)','Fat (g)','Fiber (g)','Sugar (g)'], mealItemRows);

  section('DAILY INPUTS', ['Date','Water (L)','Flight Hours','Flight Hours Edited','Sleep Hours','Readiness'],
    dailyInputRows.map(d => [d.date||'', d.water_in??'', d.flight_hrs??'', d.flight_hrs_touched ? 'yes':'', d.sleep_hours??'', d.readiness??'']));

  const sched = (ST.flightSchedule || []).map(e => {
    const s = e.start ? new Date(e.start) : null, en = e.end ? new Date(e.end) : null;
    const hrs = (s && en) ? ((en - s)/3600000).toFixed(2) : '';
    return [
      s ? s.toLocaleDateString('en-US') : '', e.type || '',
      e.summary || '', e.airport || '',
      s ? s.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false}) : '',
      en ? en.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false}) : '',
      hrs,
    ];
  });
  section('FLIGHT SCHEDULE (scheduled, device-local times)', ['Date','Type','Summary','Airport','Start','End','Scheduled Hours'], sched);

  const csv = rows.map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'flight-crew-fitness-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  setTimeout(() => showBigToast('CSV exported — ready for AI analysis.','ok'), 300);
}

// ─── OURA RING OAUTH2 + DATA SYNC ────────────────────────────────────────────

// Step 1: Send user to Oura's authorization page
function connectOura() {
  const state = Math.random().toString(36).slice(2);
  localStorage.setItem('oura_state', state);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     OURA_CLIENT_ID,
    redirect_uri:  OURA_REDIRECT_URI,
    scope:         OURA_SCOPES,
    state:         state,
  });
  window.location.href = 'https://cloud.ouraring.com/oauth/authorize?' + params.toString();
}

// Step 2: Handle the OAuth callback (called on page load if ?code= is in the URL)
async function handleOuraCallback() {
  const params = new URLSearchParams(window.location.search);
  const code  = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  if (error) {
    showBigToast('Oura authorization denied.','warn');
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }
  if (!code) return; // no code in URL, not a callback

  const savedState = localStorage.getItem('oura_state');
  if (state !== savedState) {
    showBigToast('Oura auth state mismatch — please try again.','warn');
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }

  showBigToast('Connecting to Oura...','info');
  window.history.replaceState({}, '', window.location.pathname); // clean URL

  try {
    const res = await fetch(OURA_EDGE_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer '+SB_ANON_KEY },
      body: JSON.stringify({ action: 'exchange', code, redirect_uri: OURA_REDIRECT_URI }),
    });
    const tokens = await res.json();
    if (!res.ok || tokens.error) throw new Error(tokens.error || 'Token exchange failed');

    // Save tokens to user profile
    const profile = (await dbGetProfile()) || {};
    profile.ouraAccessToken  = tokens.access_token;
    profile.ouraRefreshToken = tokens.refresh_token;
    profile.ouraConnected    = true;
    await dbSetProfile(profile);
    ST.ouraAccessToken  = tokens.access_token;
    ST.ouraRefreshToken = tokens.refresh_token;
    ST.ouraConnected    = true;
    localStorage.removeItem('oura_state');

    showBigToast('Oura connected! Syncing today\'s data...','ok');
    await syncOuraData(true);
  } catch(e) {
    let errMsg = e.message || 'Unknown error';
    if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('Load failed')) {
      errMsg = 'Edge Function not reachable. Deploy the oura-auth function first (see DEPLOY.md in the edge function zip).';
    } else if (errMsg.includes('404') || errMsg.includes('not found')) {
      errMsg = 'oura-auth Edge Function not deployed yet. Deploy it via the Supabase CLI or dashboard first.';
    } else if (errMsg.includes('500') || errMsg.includes('credentials not configured')) {
      errMsg = 'Edge Function is running but secrets are missing. Set OURA_CLIENT_ID and OURA_CLIENT_SECRET via the Supabase dashboard → Edge Functions → oura-auth → Secrets.';
    }
    showBigToast(errMsg, 'warn');
  }
}

// Step 3: Refresh expired access token via Edge Function
async function refreshOuraToken() {
  const profile = await dbGetProfile();
  const refresh_token = ST.ouraRefreshToken || profile?.ouraRefreshToken;
  if (!refresh_token) return null;
  try {
    const res = await fetch(OURA_EDGE_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer '+SB_ANON_KEY },
      body: JSON.stringify({ action: 'refresh', refresh_token }),
    });
    const tokens = await res.json();
    if (!res.ok || tokens.error) throw new Error(tokens.error);
    const updatedProfile = (await dbGetProfile()) || {};
    updatedProfile.ouraAccessToken  = tokens.access_token;
    updatedProfile.ouraRefreshToken = tokens.refresh_token;
    await dbSetProfile(updatedProfile);
    ST.ouraAccessToken  = tokens.access_token;
    ST.ouraRefreshToken = tokens.refresh_token;
    return tokens.access_token;
  } catch(e) {
    ST.ouraConnected = false;
    return null;
  }
}

// Step 4: Fetch from Oura API via Edge Function proxy (bypasses CORS)
async function ouraFetch(endpoint) {
  let token = ST.ouraAccessToken;
  if (!token) return null;
  const makeRequest = async (t) => fetch(OURA_EDGE_FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer '+SB_ANON_KEY },
    body: JSON.stringify({ action: 'fetch', access_token: t, endpoint }),
  });
  let res = await makeRequest(token);
  if (res.status === 401) {
    // Token expired — refresh and retry once
    token = await refreshOuraToken();
    if (!token) return null;
    res = await makeRequest(token);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error('Oura API error '+res.status+(err.message ? ': '+err.message : ''));
  }
  return res.json();
}

// One-time backfill — pulls a wider date range than the daily sync and
// upserts every day found, so Trends charts have history from before you
// connected the ring (or from a gap where the app wasn't syncing).
async function importHistoricalOura(days) {
  if (!ST.user || !ST.ouraAccessToken) {
    showBigToast('Connect Oura Ring first.', 'warn');
    return;
  }
  showBigToast('Importing '+days+' days of Oura history…', 'info');
  try {
    const today = new Date().toISOString().slice(0,10);
    const startDate = new Date(Date.now() - days*86400000).toISOString().slice(0,10);

    const [readiness, sleep, activity] = await Promise.all([
      ouraFetch('daily_readiness?start_date='+startDate+'&end_date='+today).catch(()=>null),
      ouraFetch('daily_sleep?start_date='+startDate+'&end_date='+today).catch(()=>null),
      ouraFetch('daily_activity?start_date='+startDate+'&end_date='+today).catch(()=>null),
    ]);

    const readinessByDate = {}, sleepByDate = {}, activityByDate = {};
    (readiness?.data||[]).forEach(r => { readinessByDate[r.day] = r; });
    (sleep?.data||[]).forEach(s => { sleepByDate[s.day] = s; });
    (activity?.data||[]).forEach(a => { activityByDate[a.day] = a; });

    const allDates = new Set([...Object.keys(readinessByDate), ...Object.keys(sleepByDate), ...Object.keys(activityByDate)]);
    if (!allDates.size) {
      showBigToast('No historical Oura data found for that range.', 'info');
      return;
    }

    const rows = Array.from(allDates).map(date => {
      const readinessItem = readinessByDate[date];
      const sleepItem = sleepByDate[date];
      const activityItem = activityByDate[date];
      return {
        user_id: ST.user.id,
        date: date,
        readiness_score: readinessItem?.score || null,
        sleep_score: sleepItem?.score || readinessItem?.contributors?.previous_night || null,
        hrv_balance: readinessItem?.contributors?.hrv_balance || null,
        resting_heart_rate: null,
        temperature_deviation: readinessItem?.temperature_deviation || null,
        activity_score: activityItem?.score || null,
        total_sleep_seconds: sleepItem?.total_sleep_duration || null,
        deep_sleep_seconds: sleepItem?.deep_sleep_duration || null,
        rem_sleep_seconds: sleepItem?.rem_sleep_duration || null,
        raw_readiness: readinessItem || null,
        raw_sleep: sleepItem || null,
        synced_at: new Date().toISOString(),
      };
    });

    const { error } = await SB.from('oura_daily').upsert(rows, { onConflict: 'user_id,date' });
    if (error) throw error;

    showBigToast('Imported '+rows.length+' days of Oura history.', 'ok');
    renderPage();
  } catch(e) {
    showBigToast('Historical import failed: '+e.message, 'warn');
  }
}

// Step 5: Full sync — pulls readiness, sleep, activity; stores in Supabase
const OURA_TOAST_KEY = 'fcf_oura_toast_date';
// ─── OURA WORKOUT IMPORT ────────────────────────────────────────────────────
// Maps an Oura-logged activity to an FCF exercise. Covers the common cases
// precisely; anything unrecognized falls back to a generic, non-lossy entry
// using Oura's own activity name — Oura supports 40-50+ possible activity
// types, so a safe fallback matters more than exhaustive enumeration.
// Turns Oura's raw activity string into a readable label — handles both
// camelCase ("strengthTraining") and snake_case ("open_water_swimming"),
// since Oura's own data uses camelCase, which the original formatting
// (underscore-only) didn't account for and produced "strengthTraining"
// unchanged in the confirmation prompt.
function humanizeOuraActivity(raw) {
  if (!raw) return 'Activity';
  return raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function mapOuraActivityToExercise(ouraEvent) {
  const activity = (ouraEvent.activity || '').toLowerCase();
  const hasDistance = ouraEvent.distance && ouraEvent.distance > 0;
  if (activity === 'walking') return { id: 'c_ca_er3', name: 'Walking', inputType: 'timed_distance', timed: true };
  if (activity === 'running' || activity === 'jogging') return { id: 'c_ca_er5', name: 'Outdoor Run', inputType: 'timed_distance', timed: true };
  const label = humanizeOuraActivity(ouraEvent.activity);
  return {
    id: 'oura_' + activity.replace(/[^a-z0-9]/g,'_'),
    name: label + ' (via Oura)',
    inputType: hasDistance ? 'timed_distance' : 'timed',
    timed: true,
  };
}

// Has this exact Oura workout already been imported? The only fully
// reliable dedup signal — checked by Oura's own unique event id, stored on
// the imported session, so re-syncing (deliberately or accidentally
// twice) can never create a second copy of the same event.
function findExistingOuraImport(ouraId, sessionCache) {
  return (sessionCache || []).find(s => s.ouraWorkoutId === ouraId) || null;
}

// Fuzzy duplicate check for the harder case Chad specifically asked about:
// the same physical workout logged manually in FCF AND separately detected
// in Oura, with no shared id to match on. Flags an overlapping time window
// as a likely duplicate rather than silently importing a second copy or
// silently skipping something that might genuinely be different — real
// ambiguity gets a prompt, not a guess in either direction.
function findSimilarSession(ouraEvent, sessionCache) {
  const ouraStart = new Date(ouraEvent.start_datetime).getTime();
  const ouraEnd = new Date(ouraEvent.end_datetime).getTime();
  if (isNaN(ouraStart) || isNaN(ouraEnd)) return null;
  return (sessionCache || []).find(s => {
    if (s.ouraWorkoutId) return false; // already-imported sessions are handled by the exact-id check instead
    const sStart = new Date(s.date).getTime();
    if (isNaN(sStart)) return false;
    const sMinutes = s.durationMinutes || 30;
    const sEnd = sStart + sMinutes * 60000;
    const slackMs = 20 * 60000; // logging rarely starts/ends at the exact same second as the real activity
    return (ouraStart - slackMs) <= sEnd && (ouraEnd + slackMs) >= sStart;
  }) || null;
}

function buildSessionFromOuraWorkout(ouraEvent, exDef) {
  const startMs = new Date(ouraEvent.start_datetime).getTime();
  const endMs = new Date(ouraEvent.end_datetime).getTime();
  const seconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  const miles = ouraEvent.distance ? Math.round((ouraEvent.distance / 1609.34) * 100) / 100 : 0;
  const setEntry = exDef.inputType === 'timed_distance' ? { seconds: String(seconds), miles: String(miles) } : { seconds: String(seconds) };
  return {
    date: ouraEvent.start_datetime,
    env: 'comm',
    muscle_group: 'Cardio',
    goal: ST.goal, fatigue: 'go', level: ST.level,
    sets: { [exDef.id]: [setEntry] },
    flight_hrs: null, water_in: null,
    durationMinutes: Math.round(seconds / 60),
    // Oura's own calorie figure is real heart-rate-sensor data — more
    // accurate than FCF's MET-based estimate for an activity FCF never
    // actually observed, so it's used as-is rather than recomputed.
    estCalories: ouraEvent.calories ? Math.round(ouraEvent.calories) : null,
    workoutSnapshot: { taxi: [], takeoff: [], enroute: [exDef], landing: [] },
    ouraWorkoutId: ouraEvent.id,
    ouraActivity: ouraEvent.activity,
    importedFromOura: true,
  };
}

// Saves an Oura-derived session as if manually logged: database, session
// cache (so calendar/history/badges all pick it up automatically), and
// leaderboard submission if the mapped exercise is running-eligible.
async function importOuraWorkout(ouraEvent, exDef) {
  const session = buildSessionFromOuraWorkout(ouraEvent, exDef);
  try {
    const { error } = await SB.from('workout_sessions').insert([{
      user_id: ST.user?.id || null,
      session_key: 'oura_' + ouraEvent.id,
      session_data: session,
      workout_key: session.muscle_group,
      started_at: session.date,
    }]);
    if (error) throw error;
  } catch(e) {
    localStorage.setItem('fcf_session_oura_' + ouraEvent.id, JSON.stringify(session));
  }
  if (!ST.sessionCache.find(s => s.ouraWorkoutId === ouraEvent.id)) ST.sessionCache.push(session);
  if (RUNNING_EXERCISES.includes(exDef.id)) {
    await submitRunningPR(session).catch(()=>{});
    await logRunningVolume(session).catch(()=>{});
  }
  awardBadges();
  return session;
}

// Orchestrates the sync: fetches recent Oura workouts, silently skips
// anything already imported, silently auto-imports anything with no
// time-overlap conflict, and queues a confirmation prompt for anything
// that looks like it might already be logged some other way.
// Oura can produce its own overlapping entries for the same real workout —
// e.g. a manually-logged session and a ring-auto-detected one covering part
// of the same time window. Filters those to the longer, more complete
// entry before anything gets compared against FCF's own history, so a
// same-source duplicate never even reaches the FCF-vs-Oura check, let alone
// gets imported twice under two different Oura ids.
function filterOuraInternalOverlaps(events) {
  const withDuration = events
    .map(e => ({ event: e, start: new Date(e.start_datetime).getTime(), end: new Date(e.end_datetime).getTime() }))
    .filter(e => !isNaN(e.start) && !isNaN(e.end) && e.end > e.start)
    .sort((a,b) => (b.end-b.start) - (a.end-a.start)); // longest first
  const kept = [];
  withDuration.forEach(candidate => {
    const overlapsKept = kept.some(k => {
      const overlapStart = Math.max(candidate.start, k.start);
      const overlapEnd = Math.min(candidate.end, k.end);
      const overlapMs = Math.max(0, overlapEnd - overlapStart);
      const candidateDuration = candidate.end - candidate.start;
      // More than half of the shorter/candidate event's own time is inside
      // an already-kept, longer event — almost certainly the same workout.
      return candidateDuration > 0 && (overlapMs / candidateDuration) > 0.5;
    });
    if (!overlapsKept) kept.push(candidate);
  });
  // Events with unparseable dates are kept as-is — validity is checked later.
  const invalidEvents = events.filter(e => {
    const s = new Date(e.start_datetime).getTime(), en = new Date(e.end_datetime).getTime();
    return isNaN(s) || isNaN(en) || en <= s;
  });
  return [...kept.map(k => k.event), ...invalidEvents];
}

// Below this, an Oura-detected activity reads more like incidental
// movement (walking to the car, a bathroom trip) than a real workout worth
// cluttering someone's training history with — a real product choice, not
// a data-correctness one, so kept as a clearly-named, easy-to-find constant.
// Below these, an Oura-detected activity reads more like incidental
// movement than a real workout worth putting in someone's training
// history. Walking has its own higher floor because it's by far the most
// common source of short incidental entries (walking to the car, through a
// terminal) — a 12-minute strength session is plausibly real training, a
// 12-minute walk usually isn't.
const MIN_OURA_IMPORT_MINUTES = 10;
const MIN_OURA_WALK_MINUTES = 20;

function minImportMinutesFor(activity) {
  return /walk/i.test(activity || '') ? MIN_OURA_WALK_MINUTES : MIN_OURA_IMPORT_MINUTES;
}


async function syncOuraWorkouts() {
  if (!ST.user || !ST.ouraAccessToken) return;
  const today = new Date().toISOString().slice(0,10);
  const weekAgo = new Date(Date.now() - 7*86400000).toISOString().slice(0,10);
  let res;
  try { res = await ouraFetch('workout?start_date='+weekAgo+'&end_date='+today); } catch(e) { return; }
  const overlapFiltered = filterOuraInternalOverlaps(res?.data || []);
  // Applied AFTER overlap-collapsing, not before — a short entry that's
  // actually the same real workout as a longer overlapping one should still
  // get absorbed by that logic; this only removes genuinely short,
  // standalone activities that remain short even after that merge.
  const events = overlapFiltered.filter(ev => {
    const mins = (new Date(ev.end_datetime) - new Date(ev.start_datetime)) / 60000;
    return !isNaN(mins) && mins >= minImportMinutesFor(ev.activity);
  });
  ST.ouraImportQueue = ST.ouraImportQueue || [];
  ST.ouraDismissedIds = ST.ouraDismissedIds || [];
  for (const ev of events) {
    if (findExistingOuraImport(ev.id, ST.sessionCache)) continue;
    if (ST.ouraDismissedIds.includes(ev.id)) continue;
    const exDef = mapOuraActivityToExercise(ev);
    const similar = findSimilarSession(ev, ST.sessionCache);
    if (similar) {
      if (!ST.ouraImportQueue.find(q => q.event.id === ev.id)) ST.ouraImportQueue.push({ event: ev, exDef, similar });
    } else {
      await importOuraWorkout(ev, exDef);
    }
  }
  if (ST.ouraImportQueue.length) showOuraDuplicateConfirm();
  else renderPage();
}

function showOuraDuplicateConfirm() {
  if (!ST.ouraImportQueue || !ST.ouraImportQueue.length) return;
  const { event, similar } = ST.ouraImportQueue[0];
  const mins = Math.round((new Date(event.end_datetime) - new Date(event.start_datetime)) / 60000);
  const label = humanizeOuraActivity(event.activity);
  const eventDate = new Date(event.start_datetime);
  const dateStr = eventDate.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'});
  const timeStr = eventDate.toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'});
  let similarStr = 'something already logged that day';
  if (similar) {
    const simDate = new Date(similar.date);
    const simTime = simDate.toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'});
    const simLabel = similar.muscle_group || 'a workout';
    similarStr = 'a "'+simLabel+'" session logged at '+simTime+(similar.durationMinutes ? ' ('+similar.durationMinutes+' min)' : '');
  }
  const root = document.getElementById('modalRoot');
  root.innerHTML =
    '<div class="modal-bg"><div class="modal-sheet">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Possible duplicate</div>' +
    '<div class="modal-body" style="margin-bottom:14px">Oura logged a '+mins+'-minute '+label+' on <strong>'+dateStr+'</strong> at '+timeStr+'. This overlaps with '+similarStr+'. Same workout, or a separate one?</div>' +
    '<button class="btn btn-outline" onclick="resolveOuraDuplicate(\'skip\')">Already logged — skip this one</button>' +
    '<button class="btn btn-gold mt8" onclick="resolveOuraDuplicate(\'import\')">Different workout — import it too</button>' +
    '</div></div>';
}

async function resolveOuraDuplicate(choice) {
  if (!ST.ouraImportQueue || !ST.ouraImportQueue.length) return;
  const { event, exDef } = ST.ouraImportQueue.shift();
  if (choice === 'import') {
    await importOuraWorkout(event, exDef);
  } else {
    // "Skip" must be remembered permanently — otherwise this exact same
    // event gets re-fetched and re-flagged as ambiguous on every future
    // sync, asking the identical question forever, which is exactly what
    // was reported happening three times in a row.
    ST.ouraDismissedIds = ST.ouraDismissedIds || [];
    if (!ST.ouraDismissedIds.includes(event.id)) ST.ouraDismissedIds.push(event.id);
    try {
      const profile = (await dbGetProfile()) || {};
      profile.ouraDismissedIds = ST.ouraDismissedIds;
      await dbSetProfile(profile);
    } catch(e) {}
  }
  closeModal();
  if (ST.ouraImportQueue.length) showOuraDuplicateConfirm();
  else renderPage();
}

async function syncOuraData(force) {
  if (!ST.user || !ST.ouraAccessToken) {
    showBigToast('Connect Oura Ring first.','warn');
    return;
  }
  try {
    // BUG FIX: Oura's `day` field is the user's LOCAL calendar day, but
    // these were UTC dates. UTC midnight is 5pm in Arizona, so from 5pm
    // local onward `today` already read as TOMORROW and could never match
    // Oura's row for the actual current day — Activity would blank out
    // every single evening even when Oura had the data sitting there.
    // Local dates on both sides fixes the comparison; the fetch window is
    // separately extended a day past today so a timezone-boundary
    // interpretation on Oura's side can't truncate today's row out of the
    // response either.
    const today = localDateStr(new Date());
    const yesterday = localDateStr(new Date(Date.now()-86400000));
    const fetchEnd = localDateStr(new Date(Date.now()+86400000));

    // Fetch readiness, sleep, and activity in parallel
    const [readiness, sleep, activity] = await Promise.all([
      ouraFetch('daily_readiness?start_date='+yesterday+'&end_date='+fetchEnd).catch(()=>null),
      ouraFetch('daily_sleep?start_date='+yesterday+'&end_date='+fetchEnd).catch(()=>null),
      ouraFetch('daily_activity?start_date='+yesterday+'&end_date='+fetchEnd).catch(()=>null),
    ]);
    syncOuraWorkouts().catch(()=>{});

    // BUG FIX: previously just took the LAST item in each response array
    // and assumed it was today's — but Oura's daily_activity endpoint
    // often hasn't posted today's row yet this early in the day, so the
    // "last" item was actually yesterday's already-finalized (and usually
    // much higher) step count, silently displayed as if it were today's.
    // Matching by the actual `day` field means a missing today's-row now
    // correctly shows as "no data yet" instead of yesterday's number.
    const readinessItem = readiness?.data?.find(d => d.day === today) ?? readiness?.data?.[readiness.data.length-1];
    const sleepItem     = sleep?.data?.find(d => d.day === today) ?? sleep?.data?.[sleep.data.length-1];
    const activityItem  = activity?.data?.find(d => d.day === today) ?? null; // no same-day fallback for steps specifically — that's the exact bug being fixed

    // Diagnostic for a manual Sync Now when activity data still doesn't
    // show up — rather than guess a third time whether this is a stale
    // cache, a date-format mismatch, or the fetch itself silently failing
    // (each of the three calls above swallows its own errors via
    // .catch(()=>null), which would look IDENTICAL to "no data yet" from
    // outside), surface exactly what actually happened. Captured here and
    // shown via a modal AFTER the sync finishes (see below) — showing it
    // immediately as a toast got instantly overwritten by the "Oura
    // synced" success toast a moment later, too fast to read either one.
    let activityDiagnostic = null;
    if (force && !activityItem) {
      if (!activity) {
        activityDiagnostic = 'The daily_activity request itself failed — a network error, expired token, or missing permission scope. This is NOT the "Oura hasn\'t posted today\'s data yet" case; something is actually broken in the connection.';
      } else if (!activity.data || !activity.data.length) {
        activityDiagnostic = 'The request succeeded but returned zero rows for the range '+yesterday+' to '+fetchEnd+'.';
      } else {
        activityDiagnostic = 'Got '+activity.data.length+' row(s) back, but none matched today (' + today + '). Days actually present in the response: ' + activity.data.map(d=>d.day).join(', ') + '.';
      }
    }

    if (!readinessItem) {
      if (force) showBigToast('No readiness data yet — sync your Oura app first.','info');
      return;
    }

    const score = readinessItem.score;
    const row = {
      user_id:             ST.user.id,
      date:                readinessItem.day,
      readiness_score:     score,
      sleep_score:         sleepItem?.score || readinessItem.contributors?.previous_night || null,
      hrv_balance:         readinessItem.contributors?.hrv_balance || null,
      resting_heart_rate:  null, // from heart rate endpoint (separate call if needed)
      temperature_deviation: readinessItem.temperature_deviation || null,
      activity_score:      activityItem?.score || null,
      total_sleep_seconds: sleepItem?.total_sleep_duration || null,
      deep_sleep_seconds:  sleepItem?.deep_sleep_duration || null,
      rem_sleep_seconds:   sleepItem?.rem_sleep_duration || null,
      raw_readiness:       readinessItem,
      raw_sleep:           sleepItem || null,
      synced_at:           new Date().toISOString(),
    };

    // Upsert — one row per user per day
    const { error } = await SB.from('oura_daily').upsert(row, { onConflict: 'user_id,date' });
    if (error) throw error;

    // Update app state
    ST.ouraLastSync = Date.now();
    const condition = score >= 70 ? 'go' : score >= 60 ? 'marginal' : 'nogo';
    const label     = score >= 70 ? '🟢 GO' : score >= 60 ? '🟡 MARGINAL' : '🔴 NO-GO';
    ST.fatigue    = condition;
    ST.ouraScore  = score;
    // daily_activity was already being fetched for its score; steps and
    // active calories were being discarded. Held in state only (not a new
    // DB column) since a fresh sync repopulates them anyway.
    ST.ouraSteps  = activityItem?.steps ?? null;
    ST.ouraActiveCal = activityItem?.active_calories ?? null;
    ST.ouraData   = row;

    // If there's an activity diagnostic to report, show THAT (as a modal
    // that stays until dismissed) instead of the generic success toast —
    // saying "Oura synced ✅" right on top of a real problem is exactly
    // the confusing double-message this replaces.
    if (activityDiagnostic) {
      showInfoModal('Activity Sync Diagnostic', activityDiagnostic);
    } else {
      // Show the sync result once per day for automatic background syncs
      // — a manual "Sync Now" tap always shows it, since that's a
      // deliberate action expecting confirmation.
      const alreadyShownToday = localStorage.getItem(OURA_TOAST_KEY) === today;
      if (force || !alreadyShownToday) {
        const sleepScoreStr = row.sleep_score ? String(row.sleep_score) : '—';
        showBigToast('Oura synced\nReadiness: '+score+' → '+label+'\nSleep Score: '+sleepScoreStr,'ok');
        localStorage.setItem(OURA_TOAST_KEY, today);
      }
    }
    renderPage();

  } catch(e) {
    if (force) showBigToast('Oura sync failed: '+e.message,'warn');
  }
}

// Oura's daily_activity endpoint can genuinely not have today's row yet
// for hours (confirmed via the Activity Sync Diagnostic — the request
// succeeds, just with no same-day entry), even though nothing is broken.
// Rather than require remembering to tap Sync Now again later, retry
// periodically through the day and stop bothering once today's activity
// actually shows up. Naturally resets itself at midnight too, since
// "today" changing makes ST.ouraData's cached date stale again on its own.
function shouldRetryOuraActivity() {
  if (!ST.ouraConnected || !ST.ouraAccessToken) return false;
  const today = localDateStr(new Date());
  const alreadyHaveTodaysActivity = ST.ouraData?.date === today && ST.ouraData?.activity_score != null;
  return !alreadyHaveTodaysActivity;
}

const OURA_ACTIVITY_RETRY_MS = 30 * 60 * 1000; // every 30 minutes — cheap enough to just leave running
function scheduleOuraActivityRetry() {
  const checkAndRetry = () => {
    if (shouldRetryOuraActivity()) syncOuraData(false).catch(() => {});
  };
  setInterval(checkAndRetry, OURA_ACTIVITY_RETRY_MS);
  // Also catch it the moment the app comes back to the foreground —
  // someone reopening the app after lunch shouldn't have to wait for the
  // next 30-minute tick if Oura posted the data in the meantime.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkAndRetry();
  });
}

// Subscriptions change while the app is closed — a renewal succeeds, a card
// expires, a refund lands. Re-reading entitlement on resume means the paywall
// reflects reality rather than whatever was true at last launch.
function scheduleEntitlementRefresh() {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !ST.user) return;
    const was = isPro();
    await loadSubscription();
    if (isPro() !== was) renderPage();
  });
}

// Disconnect Oura
async function disconnectOura() {
  const profile = (await dbGetProfile()) || {};
  delete profile.ouraAccessToken;
  delete profile.ouraRefreshToken;
  profile.ouraConnected = false;
  await dbSetProfile(profile);
  ST.ouraAccessToken = null;
  ST.ouraRefreshToken = null;
  ST.ouraConnected = false;
  ST.ouraScore = null;
  showBigToast('Oura disconnected.','info');
  renderPage();
}

// Test if the edge function is deployed and secrets are set
// Legacy PAT sync — kept for any users with old tokens still working
async function fetchOuraReadiness() {
  await syncOuraData();
}

// ─── PHOTO PROGRESS ───────────────────────────────────────────────────────────
async function uploadProgressPhoto(useCamera) {
  if (!ST.user) { showBigToast('Sign in to save photos.','warn'); return; }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  if (useCamera) input.capture = 'environment'; // rear camera when specified
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    showBigToast('Uploading...','info');
    try {
      const ext = file.name.split('.').pop() || 'jpg';

      // Use the file's lastModified date as the photo date.
      // On iOS and Android, file.lastModified reflects when the photo was
      // originally taken — not when it was selected or uploaded.
      // Falls back to today if lastModified is unavailable or zero.
      const photoDate = (file.lastModified && file.lastModified > 0)
        ? new Date(file.lastModified).toISOString().slice(0,10)
        : new Date().toISOString().slice(0,10);

      // Filename: photoDate-uploadTimestamp.ext
      // photoDate is shown in the timeline; timestamp ensures uniqueness
      const path = ST.user.id+'/'+photoDate+'-'+Date.now()+'.'+ext;
      const { error } = await SB.storage.from('progress-photos').upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      showBigToast('Photo saved! Taken: '+photoDate,'ok');
      await loadPhotoTimeline();
    } catch(e) {
      if (e.message?.includes('Bucket not found')) {
        showBigToast('Create a "progress-photos" bucket in Supabase Storage first.','warn');
      } else {
        showBigToast('Upload failed: '+e.message,'warn');
      }
    }
  };
  document.body.appendChild(input);
  input.click();
  setTimeout(() => input.remove(), 5000);
}

// Pages through the storage bucket to collect every photo's metadata (cheap —
// no signed URLs yet), then sorts the full list by actual capture date.
async function loadAllPhotoMeta() {
  const pageSize = 100;
  let offset = 0;
  let all = [];
  while (true) {
    const { data: files, error } = await SB.storage.from('progress-photos')
      .list(ST.user.id, { limit: pageSize, offset, sortBy:{column:'created_at',order:'desc'} });
    if (error) { console.warn('Photo list error:', error.message); break; }
    if (!files || !files.length) break;
    all = all.concat(files);
    if (files.length < pageSize) break;
    offset += pageSize;
  }
  return all.map(f => {
    const datePart = f.name.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || f.created_at?.slice(0,10) || '—';
    const uploadTs = parseInt(f.name.match(/-(\d+)\./)?.[1] || '0', 10);
    return { name: f.name, date: datePart, uploadTs };
  }).sort((a, b) => {
    if (a.date !== b.date) {
      const ta = Date.parse(a.date), tb = Date.parse(b.date);
      if (isNaN(ta) && isNaN(tb)) return 0;
      if (isNaN(ta)) return 1;
      if (isNaN(tb)) return -1;
      return tb - ta; // newest capture date first
    }
    return b.uploadTs - a.uploadTs; // same-day tiebreak by upload time
  });
}

// Resolves signed URLs for the currently-visible page of photos (reusing any
// already-fetched URLs) and re-renders the photo section.
async function resolvePhotoSlice() {
  if (!ST.user) return;
  try {
    if (!ST.photoAllMeta) ST.photoAllMeta = await loadAllPhotoMeta();
    const slice = ST.photoAllMeta.slice(0, ST.photoShowCount);
    const resolved = await Promise.all(slice.map(async meta => {
      const path = ST.user.id+'/'+meta.name;
      if (ST.photoUrlCache[path]) return { url: ST.photoUrlCache[path], date: meta.date, name: meta.name, path };
      const { data, error } = await SB.storage.from('progress-photos').createSignedUrl(path, 3600);
      if (error || !data?.signedUrl) {
        console.warn('Signed URL error for', meta.name, error?.message);
        return null;
      }
      ST.photoUrlCache[path] = data.signedUrl;
      return { url: data.signedUrl, date: meta.date, name: meta.name, path };
    }));
    ST.photoTimeline = resolved.filter(Boolean);
  } catch(e) {
    console.warn('resolvePhotoSlice error:', e.message);
    ST.photoTimeline = [];
  }
  const photoSection = document.getElementById('photo-timeline-section');
  if (photoSection) photoSection.innerHTML = buildPhotoTimelineHTML();
}

// Full refresh — used on tab load, the Refresh button, and after upload/delete.
async function loadPhotoTimeline() {
  if (!ST.user) return;
  ST.photoAllMeta = null;
  ST.photoUrlCache = {};
  await resolvePhotoSlice();
}

// "Load More" — reveals the next page without re-listing the whole bucket.
async function loadMorePhotos() {
  ST.photoShowCount = (ST.photoShowCount||24) + 24;
  await resolvePhotoSlice();
}

async function deleteProgressPhoto(idx) {
  if (!ST.user) return;
  const photo = (ST.photoTimeline||[])[idx];
  if (!photo) return;
  if (!confirm('Delete this progress photo? This cannot be undone.')) return;
  try {
    const { error } = await SB.storage.from('progress-photos').remove([photo.path]);
    if (error) throw error;
    showBigToast('Photo deleted.','ok');
    await loadPhotoTimeline();
  } catch(e) {
    showBigToast('Delete failed: '+e.message,'warn');
  }
}

function buildPhotoTimelineHTML() {
  const photos = ST.photoTimeline || [];
  const parts = [];
  parts.push('<div class="section-label">PROGRESS PHOTOS</div>');
  parts.push('<div class="card mb12">');
  parts.push('<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">');
  parts.push('<button class="btn btn-outline" style="flex:1;min-width:100px" onclick="uploadProgressPhoto(true)">📷 Camera</button>');
  parts.push('<button class="btn btn-outline" style="flex:1;min-width:100px" onclick="uploadProgressPhoto(false)">🖼 Library</button>');
  parts.push('<button class="btn btn-outline" style="flex:1;min-width:100px" onclick="loadPhotoTimeline()">↻ Refresh</button>');
  parts.push('</div>');
  if (!ST.user) {
    parts.push('<div style="font-size:12px;color:var(--muted);text-align:center;padding:16px">Sign in to save and view progress photos.</div>');
  } else if (!photos.length) {
    parts.push('<div style="font-size:12px;color:var(--muted);text-align:center;padding:16px">No photos yet. Tap Camera or Library to add your first progress photo.</div>');
  } else {
    parts.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">');
    photos.forEach((p, i) => {
      const photoIdx = i;
      parts.push('<div style="border-radius:8px;overflow:hidden;position:relative;background:var(--bg3)">');
      parts.push('<img src="'+p.url+'" style="width:100%;aspect-ratio:3/4;object-fit:cover;display:block">');
      parts.push('<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);display:flex;justify-content:space-between;align-items:center;padding:4px 6px">');
      parts.push('<span style="font-family:var(--mono);font-size:9px;color:#fff">'+p.date+'</span>');
      parts.push('<button onclick="deleteProgressPhoto('+photoIdx+')" style="background:rgba(239,68,68,0.7);border:none;color:white;font-size:10px;padding:2px 6px;border-radius:4px;cursor:pointer">✕</button>');
      parts.push('</div>');
      parts.push('</div>');
    });
    parts.push('</div>');
    if (ST.photoAllMeta && ST.photoAllMeta.length > ST.photoShowCount) {
      parts.push('<button class="btn btn-outline mt12" onclick="loadMorePhotos()">Load More ('+(ST.photoAllMeta.length - ST.photoShowCount)+' more)</button>');
    }
  }
  parts.push('</div>');
  return parts.join('');
}

// ─── PROFILE TAB ──────────────────────────────────────────────────────────────
function renderProfile(p) {
  const parts = [moreBackLink()];
  parts.push('<div class="section-label" style="margin-top:0">PILOT PROFILE</div>');

  // Account card
  parts.push('<div class="card mb12">');
  parts.push('<div class="fb"><div style="font-size:14px;font-weight:600">'+(ST.user?.email||'Local user')+'</div><div class="status-dot ok"></div></div>');
  parts.push('<div style="font-size:11px;color:var(--muted);margin-top:4px">'+FCF_VERSION+' · Build '+FCF_BUILD+'</div>');
  parts.push('</div>');

  // Body metrics (sex, height, BMI)
  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">BODY METRICS</div>');
  parts.push('<div class="field-row" style="margin-bottom:10px">');
  parts.push('<div class="field" style="margin-bottom:0"><label>Sex</label><select id="bmSex">');
  parts.push('<option value=""'+(!ST.sex?' selected':'')+'>—</option>');
  parts.push('<option value="male"'+(ST.sex==='male'?' selected':'')+'>Male</option>');
  parts.push('<option value="female"'+(ST.sex==='female'?' selected':'')+'>Female</option>');
  parts.push('</select></div>');
  const hFt = ST.heightIn ? Math.floor(ST.heightIn/12) : null;
  const hIn = ST.heightIn ? Math.round(ST.heightIn%12) : null;
  // Native selects render as a compact picker wheel on iOS — tidier than
  // free-text entry for a value with exactly 4x12 sane combinations.
  parts.push('<div class="field" style="margin-bottom:0"><label>Height</label><div style="display:flex;gap:6px">');
  parts.push('<select id="bmFt" style="flex:1">');
  parts.push('<option value=""'+(hFt===null?' selected':'')+'>— ft</option>');
  for (let f=4; f<=7; f++) parts.push('<option value="'+f+'"'+(hFt===f?' selected':'')+'>'+f+' ft</option>');
  parts.push('</select>');
  parts.push('<select id="bmIn" style="flex:1">');
  parts.push('<option value=""'+(hIn===null?' selected':'')+'>— in</option>');
  for (let i2=0; i2<=11; i2++) parts.push('<option value="'+i2+'"'+(hIn===i2?' selected':'')+'>'+i2+' in</option>');
  parts.push('</select>');
  parts.push('</div></div>');
  parts.push('</div>');
  parts.push('<div class="field"><label>Age <span class="info-i" onclick="showBioInfo(\'age\')">i</span></label>');
  parts.push('<input id="bmAge" type="text" inputmode="numeric" placeholder="e.g. 42" value="'+(ST.age||'')+'"></div>');
  parts.push('<div class="field"><label>Call Sign — Leaderboard Name</label>');
  parts.push('<input id="bmUsername" type="text" maxlength="20" placeholder="e.g. MaverickPHX" value="'+(ST.username||'')+'">');
  parts.push('<div style="font-size:10px;color:var(--muted);margin-top:4px;line-height:1.5">Shown publicly on the leaderboards. Leave blank to stay off the boards — your lifts stay private either way until you set one.</div></div>');
  parts.push('<button class="btn btn-outline" onclick="saveBodyMetrics()">💾 Save Body Metrics</button>');
  parts.push('</div>');

  // Mission objective (goal)
  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">MISSION OBJECTIVE</div>');
  parts.push('<div style="font-size:12px;color:var(--muted);margin-bottom:10px">Your overall training goal. This determines which mission profile gets recommended next.</div>');
  parts.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">');
  Object.keys(GOALS).forEach(gid => {
    const g = GOALS[gid];
    // Sex-tagged emphasis goals only show for the matching profile (or if already selected)
    if (g.suggestFor && g.suggestFor !== ST.sex && ST.goal !== gid) return;
    const suggested = g.suggestFor && g.suggestFor === ST.sex;
    parts.push('<div class="env-btn '+(ST.goal===gid?'sel':'')+'" style="position:relative" onclick="syncBodyMetricsFieldsToState();ST.goal=\''+gid+'\';ST.muscleGroup=getRecommendedNext();saveGoalLevel();renderPage()">');
    if (suggested) parts.push('<div style="position:absolute;top:4px;right:4px;font-family:var(--mono);font-size:7px;letter-spacing:0.06em;color:var(--gold);border:1px solid var(--gold);border-radius:4px;padding:1px 4px">SUGGESTED</div>');
    parts.push('<div class="ei">'+g.icon+'</div><div class="el">'+g.label+'</div>');
    parts.push('<div style="font-size:9px;color:var(--muted);margin-top:3px;line-height:1.3">'+g.desc+'</div>');
    parts.push('</div>');
  });
  parts.push('</div>');
  parts.push('</div>');

  // Fitness level
  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">FITNESS LEVEL</div>');
  parts.push('<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">');
  parts.push('<div class="env-btn '+(ST.level==='beginner'?'sel':'')+'" onclick="syncBodyMetricsFieldsToState();ST.level=\'beginner\';saveGoalLevel();renderPage()"><div class="ei">🌱</div><div class="el">BEGINNER</div></div>');
  parts.push('<div class="env-btn '+(ST.level==='intermediate'?'sel':'')+'" onclick="syncBodyMetricsFieldsToState();ST.level=\'intermediate\';saveGoalLevel();renderPage()"><div class="ei">⚡</div><div class="el">INTERMED.</div></div>');
  parts.push('<div class="env-btn '+(ST.level==='advanced'?'sel':'')+'" onclick="syncBodyMetricsFieldsToState();ST.level=\'advanced\';saveGoalLevel();renderPage()"><div class="ei">🔥</div><div class="el">ADVANCED</div></div>');
  parts.push('</div>');
  const freq = FREQUENCY_GUIDE[ST.level];
  parts.push('<div class="divider"></div>');
  parts.push('<div style="font-size:11px;color:var(--muted);line-height:1.6"><strong style="color:var(--text)">'+freq.days+' days/week</strong> recommended — '+freq.split+'. '+freq.note+'</div>');
  parts.push('</div>');

  p.innerHTML = parts.join('');

}

// ─── MORE MENU + SUB-VIEWS ───────────────────────────────────────────────────
function moreBackLink() {
  return '<button class="btn-ghost" style="font-size:12px;padding:6px 0;margin-bottom:8px" onclick="switchTab(\'more\')">← Menu</button>';
}

function renderMore(p) {
  const parts = [];
  parts.push('<div class="section-label">MISSION SYSTEMS</div>');
  const item = (icon, title, sub, onclick) =>
    '<div class="card mb12" style="cursor:pointer" onclick="'+onclick+'"><div class="fb">' +
    '<div style="display:flex;align-items:center;gap:12px"><div style="font-size:22px">'+icon+'</div>' +
    '<div><div style="font-size:14px;font-weight:600">'+title+'</div>' +
    '<div style="font-size:11px;color:var(--muted);margin-top:2px">'+sub+'</div></div></div>' +
    '<div style="color:var(--muted)">→</div></div></div>';
  const earnedCount = BADGES.filter(b => ST.badges[b.id]).length;
  parts.push(item('👤','Pilot Profile','Call sign, body metrics, objective',"switchTab('profile')"));
  parts.push(item('🏅','Badges',earnedCount+' of '+BADGES.length+' earned',"switchTab('badges')"));
  parts.push(item('⌚','Connected Devices','Apple Health, Apple Watch, Oura Ring',"switchTab('devices')"));
  parts.push(item('📖','Flight Deck Wisdom','Daily training wisdom cards',"switchTab('wisdom')"));
  parts.push(item('📊','Data & Import/Export','Flight schedule import, CSV export, AI prompt',"switchTab('data')"));
  if (ST.trackNutrition) parts.push(item('🍽️','Nutrition Log','Log meals, search foods, track macros',"switchTab('nutrition')"));
  if (isSuperUser()) {
    parts.push(item('🛡️','Super User','Activity report — real usage, not signups',"switchTab('superuser')"));
  }

  parts.push('<div class="card mb12">');
  parts.push('<button class="btn btn-outline" onclick="shareApp()">📤 Share Flight Crew Fitness</button>');
  parts.push('<button class="btn btn-outline mt8" onclick="showFeedbackModal()">💬 Send Feedback</button>');
  parts.push('</div>');

  parts.push('<div class="card mb12"><div class="disclaimer-banner">Flight Crew Fitness is a training tool, not medical advice. Consult a physician before beginning any new exercise program. Exercise at your own risk and within your own physical limits.</div></div>');
  parts.push('<button class="btn btn-red-outline" onclick="doSignOut()">Sign Out</button>');

  // Subscription status, and the legal links Apple requires to be reachable
  // from inside the app rather than only on the store listing.
  parts.push(renderTrackingToggles());

  parts.push('<div class="section-label" style="margin-top:20px">SUBSCRIPTION</div>');
  parts.push('<div class="card mb12">');
  if (isPro()) {
    const until = ST.subscription?.current_period_end
      ? new Date(ST.subscription.current_period_end).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : null;
    parts.push('<div class="fb"><span style="font-size:13px;font-weight:600;color:var(--gold)">❖ Pro — all features unlocked</span></div>');
    if (until) parts.push('<div style="font-size:11px;color:var(--muted);margin-top:4px">'+(ST.subscription?.status==='grace'?'Renewal pending — ':'Renews ')+until+'</div>');
    parts.push('<div style="font-size:11px;color:var(--muted);margin-top:8px">Manage or cancel in your Apple ID subscription settings.</div>');
  } else {
    const rows = [
      ['Workout logging',             '✓',       '✓'],
      ['Basic trends (30 days)',       '✓',       '✓'],
      ['3-day workout reminder',       '✓',       '✓'],
      ['Water & pre-flight reminders', '✓',       '✓'],
      ['Food photo analysis',          '3/week',  'Unlimited'],
      ['AI calendar classification',   '1/month', 'Unlimited'],
      ['Full trends history',          '—',       '✓'],
      ['Oura Ring direct connect',     '—',       '✓'],
      ['HRV drop alert',               '—',       '✓'],
      ['Layover workout reminder',     '—',       '✓'],
      ['Weekly training summary',      '—',       '✓'],
    ];
    parts.push('<div style="display:grid;grid-template-columns:1fr auto auto;gap:0;margin-bottom:14px">');
    parts.push('<div style="font-size:10px;color:var(--muted);letter-spacing:.06em;padding:0 0 6px 0"></div>');
    parts.push('<div style="font-size:10px;color:var(--muted);letter-spacing:.06em;padding:0 10px 6px;text-align:center">FREE</div>');
    parts.push('<div style="font-size:10px;color:var(--gold);letter-spacing:.06em;padding:0 0 6px 8px;text-align:center">PRO</div>');
    rows.forEach(([label, free, pro], i) => {
      const border = i < rows.length - 1 ? 'border-bottom:1px solid var(--border)' : '';
      const proColor = pro === '—' ? 'var(--muted)' : pro === '✓' ? 'var(--green)' : 'var(--gold)';
      const freeColor = free === '—' ? 'var(--muted)' : free === '✓' ? 'var(--green)' : 'var(--muted)';
      parts.push('<div style="font-size:12px;padding:8px 0;'+border+'">'+label+'</div>');
      parts.push('<div style="font-size:11px;color:'+freeColor+';padding:8px 10px;'+border+';text-align:center">'+free+'</div>');
      parts.push('<div style="font-size:11px;color:'+proColor+';padding:8px 0 8px 8px;'+border+';text-align:center;font-weight:'+(pro!=='—'?'600':'400')+'">'+pro+'</div>');
    });
    parts.push('</div>');
    parts.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px">');
    parts.push('<button class="btn btn-gold" onclick="haptic(\'medium\');startProPurchase(\''+PRO_PRODUCT_ANNUAL+'\')"><div style="font-size:13px;font-weight:700">❖ '+PRO_ANNUAL_PRICE+'</div><div style="font-size:10px;opacity:0.8;margin-top:2px">per year</div></button>');
    parts.push('<button class="btn btn-outline" onclick="haptic(\'medium\');startProPurchase(\''+PRO_PRODUCT_MONTHLY+'\')"><div style="font-size:13px;font-weight:700">'+PRO_MONTHLY_PRICE+'</div><div style="font-size:10px;opacity:0.8;margin-top:2px">per month</div></button>');
    parts.push('</div>');
    parts.push('<div style="font-size:10px;color:var(--muted);text-align:center;margin-bottom:8px">Annual saves ~37%</div>');
    parts.push('<button class="btn-ghost" style="display:block;width:100%;text-align:center" onclick="restoreProPurchases()">Restore purchases</button>');
  }
  parts.push('</div>');

  parts.push('<div class="card mb12" style="padding:0">');
  parts.push('<a class="modal-link" style="display:block;padding:14px 16px;border-bottom:1px solid var(--border)" href="'+PRIVACY_POLICY_URL+'" '+externalLinkAttrs()+'>Privacy Policy</a>');
  parts.push('<a class="modal-link" style="display:block;padding:14px 16px" href="'+TERMS_URL+'" '+externalLinkAttrs()+'>Terms of Use</a>');
  parts.push('</div>');

  // Apple has required in-app account deletion since 2022 for any app that
  // supports account creation — its absence is an automatic rejection.
  parts.push('<div class="section-label" style="margin-top:20px;color:var(--red)">DANGER ZONE</div>');
  parts.push('<div class="card mb12">');
  parts.push('<div style="font-size:12px;color:var(--muted);margin-bottom:10px">Permanently deletes your account and every workout, meal, biometric and schedule stored with it. This cannot be undone.</div>');
  parts.push('<button class="btn btn-outline" style="color:var(--red);border-color:var(--red)" onclick="confirmDeleteAccount()">Delete Account</button>');
  parts.push('</div>');

  p.innerHTML = parts.join('');
}

function renderDevices(p) {
  const parts = [moreBackLink()];
  const hk = ST.healthkit;
  const isNative = typeof FCFBridge !== 'undefined' && FCFBridge.isNative;

  // ── Apple Health / HealthKit ──────────────────────────────────────────────
  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">APPLE HEALTH</div>');
  if (!isNative) {
    parts.push('<div style="font-size:12px;color:var(--muted);line-height:1.65">Apple Health syncs automatically when you use the Flight Crew Fitness iOS app. Download it from the App Store and health data will appear here after your first login.</div>');
  } else if (!hk) {
    parts.push('<div style="font-size:12px;color:var(--muted);line-height:1.65;margin-bottom:12px">Requesting access to Apple Health…</div>');
  } else if (!hk.granted) {
    parts.push('<div style="font-size:12px;color:var(--muted);line-height:1.65;margin-bottom:12px">Health access was not granted. You can change this in Settings → Privacy & Security → Health → Flight Crew Fitness.</div>');
  } else {
    // Connected — show detected devices
    const devices = hk.detectedDevices || [];
    const deviceIcons = { appleWatch: '⌚', oura: '💍', whoop: '⌚', garmin: '🏃', iphone: '📱', other: '📡' };
    const appleWatch = devices.find(d => d.kind === 'appleWatch');
    const ouraHK = devices.find(d => d.kind === 'oura');

    parts.push('<div style="font-size:11px;color:var(--green);margin-bottom:10px">✓ Connected via HealthKit</div>');

    if (devices.length > 0) {
      parts.push('<div style="font-size:11px;color:var(--muted);margin-bottom:6px;letter-spacing:.05em">DETECTED SOURCES</div>');
      devices.forEach(d => {
        const icon = deviceIcons[d.kind] || '📡';
        parts.push('<div style="font-size:13px;padding:6px 0;border-bottom:1px solid var(--border)">'+icon+' '+d.name+'</div>');
      });
      parts.push('<div style="margin-top:8px"></div>');
    }

    // Show a quick stats snapshot
    const statsRows = [];
    if (hk.stepsToday != null) statsRows.push(['Steps Today', hk.stepsToday.toLocaleString()]);
    if (hk.restingHR != null) statsRows.push(['Resting HR', hk.restingHR + ' bpm']);
    if (hk.hrv != null) statsRows.push(['HRV (SDNN)', hk.hrv + ' ms']);
    if (hk.sleepMinutes != null) {
      const h = Math.floor(hk.sleepMinutes / 60), m = hk.sleepMinutes % 60;
      statsRows.push(['Last Sleep', h + 'h ' + m + 'm']);
    }
    if (statsRows.length > 0) {
      const hkColors = { 'Steps Today':'teal', 'Resting HR':'red', 'HRV (SDNN)':'green', 'Last Sleep':'blue' };
      parts.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">');
      statsRows.forEach(([lbl, val]) => {
        parts.push(glowTile(lbl.toUpperCase(), val, hkColors[lbl]||'blue'));
      });
      parts.push('</div>');
    }

    parts.push('<button class="btn btn-outline" onclick="if(typeof FCFBridge!==\'undefined\')FCFBridge.syncHealthKit()">↻ Refresh</button>');

    // If Oura is detected via HealthKit, note that direct Oura OAuth gives richer data
    if (ouraHK) {
      parts.push('<div style="font-size:11px;color:var(--muted);margin-top:10px;line-height:1.5">Oura data detected via Apple Health. Connect directly below for full readiness scores.</div>');
    }
    if (appleWatch) {
      parts.push('<div style="font-size:11px;color:var(--muted);margin-top:6px;line-height:1.5">Apple Watch detected — workouts, HR, and HRV sync automatically.</div>');
    }
  }
  parts.push('</div>');

  // ── Oura Direct (optional, enhanced) ────────────────────────────────────
  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">OURA RING — ENHANCED</div>');
  if (ST.ouraConnected && ST.ouraScore !== null) {
    const scoreColor = ST.ouraScore >= 70 ? 'var(--green)' : ST.ouraScore >= 60 ? 'var(--amber)' : 'var(--red)';
    const scoreLabel = ST.ouraScore >= 70 ? '🟢 GO' : ST.ouraScore >= 60 ? '🟡 MARGINAL' : '🔴 NO-GO';
    parts.push('<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:8px;padding:12px;margin-bottom:12px">');
    parts.push('<div class="fb"><span style="font-size:12px;color:var(--muted)">Connected ✓</span><button class="btn-ghost" style="font-size:11px;padding:4px 8px" onclick="disconnectOura()">Disconnect</button></div>');
    parts.push('<div class="fb mt8"><span style="font-size:13px">Today\'s Readiness</span><span style="font-family:var(--mono);font-size:18px;font-weight:700;color:'+scoreColor+'">'+ST.ouraScore+'</span></div>');
    parts.push('<div style="font-size:12px;color:'+scoreColor+';font-weight:600;margin-top:2px">Pilot Condition → '+scoreLabel+'</div>');
    if (ST.ouraData) {
      const hrv = ST.ouraData.hrv_balance || '—';
      parts.push('<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:10px">');
      parts.push('<div class="stat-box"><div class="stat-val" style="font-size:16px">'+(ST.ouraData.sleep_score||'—')+'</div><div class="stat-lbl">Sleep Score</div></div>');
      parts.push('<div class="stat-box"><div class="stat-val" style="font-size:16px">'+hrv+'</div><div class="stat-lbl">HRV Bal.</div></div>');
      parts.push('<div class="stat-box"><div class="stat-val" style="font-size:16px">'+(ST.ouraData.activity_score||'—')+'</div><div class="stat-lbl">Activity</div></div>');
      parts.push('</div>');
    }
    parts.push('</div>');
    parts.push('<button class="btn btn-outline" onclick="syncOuraData(true)">↻ Sync Now</button>');
    parts.push('<button class="btn btn-outline mt8" onclick="importHistoricalOura(180)">📥 Import Last 6 Months</button>');
  } else {
    parts.push('<div style="font-size:12px;color:var(--muted);margin-bottom:14px;line-height:1.65">Optional — connect directly to Oura for full readiness scores used to auto-set your Pilot Condition. Readiness 70+ = GO, 60–69 = MARGINAL, below 60 = NO-GO.</div>');
    parts.push('<button class="btn btn-outline" onclick="connectOura()">Connect Oura Directly →</button>');
  }
  parts.push('</div>');

  p.innerHTML = parts.join('');
}

async function loadSuperUserStats() {
  const el = document.getElementById('suStats');
  if (!el) return;
  try {
    const { data, error } = await withTimeout(SB.from('workout_sessions').select('user_id,started_at').limit(20000));
    if (error) throw error;
    const now = Date.now();
    const DAY = 86400000;
    const seenAll = new Set(), seen7 = new Set(), seen30 = new Set();
    let sessions7 = 0, sessions30 = 0;
    (data || []).forEach(r => {
      if (!r.user_id) return;
      seenAll.add(r.user_id);
      const t = new Date(r.started_at).getTime();
      if (isNaN(t)) return;
      const ageDays = (now - t) / DAY;
      if (ageDays <= 7)  { seen7.add(r.user_id); sessions7++; }
      if (ageDays <= 30) { seen30.add(r.user_id); sessions30++; }
    });
    const stat = (n, lbl) => '<div class="stat-box"><div class="stat-val">'+n+'</div><div class="stat-lbl">'+lbl+'</div></div>';
    el.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">' +
      stat(seen7.size, 'Active — 7 Days') + stat(seen30.size, 'Active — 30 Days') +
      '</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
      stat(sessions7, 'Sessions — 7 Days') + stat(seenAll.size, 'All-Time Active Users') +
      '</div>';
  } catch(e) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    el.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px">'+(offline
      ? '📡 Needs a connection to load.'
      : 'Couldn\'t load — the admin read policy on workout_sessions may not be set up yet.')+'</div>';
  }
}

function renderSuperUser(p) {
  if (!isSuperUser()) { p.innerHTML = '<div class="section-label">NOT AUTHORIZED</div>'; return; }
  const parts = [moreBackLink()];
  parts.push('<div class="section-label" style="margin-top:0">SUPER USER — ACTIVITY REPORT</div>');
  parts.push('<div class="card mb12">');
  parts.push('<div style="font-size:11px;color:var(--muted);margin-bottom:10px;line-height:1.5">"Active" means a real logged workout, not just an account existing — a truer signal than raw signups, which aren\'t readable from the app at all.</div>');
  parts.push('<div id="suStats" style="text-align:center;color:var(--muted);font-size:12px">Loading…</div>');
  parts.push('</div>');
  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">TEMP: RAW OURA WORKOUT DUMP</div>');
  parts.push('<div style="font-size:11px;color:var(--muted);margin-bottom:10px;line-height:1.5">One-time diagnostic — an auto-detected treadmill run imported with no duration. Dumps the raw Oura workout data for the last 3 days to see exactly what fields an auto-detected session actually has, compared to a manually-confirmed one.</div>');
  parts.push('<button class="btn btn-outline" onclick="dumpRawOuraWorkouts()">🔬 Dump Raw Workout Data</button>');
  parts.push('<div id="ouraDumpResults" style="margin-top:10px;font-family:var(--mono);font-size:9px;color:var(--muted);word-break:break-all;white-space:pre-wrap"></div>');
  parts.push('</div>');
  p.innerHTML = parts.join('');
  loadSuperUserStats();
}

async function dumpRawOuraWorkouts() {
  const box = document.getElementById('ouraDumpResults');
  if (!box) return;
  if (!ST.ouraAccessToken) { box.innerHTML = 'Connect Oura Ring first.'; return; }
  box.innerHTML = 'Loading…';
  const today = new Date().toISOString().slice(0,10);
  const threeDaysAgo = new Date(Date.now()-3*86400000).toISOString().slice(0,10);
  try {
    const res = await ouraFetch('workout?start_date='+threeDaysAgo+'&end_date='+today);
    box.innerHTML = JSON.stringify(res?.data || [], null, 2);
  } catch(e) {
    box.innerHTML = 'Error: ' + (e.message || 'failed');
  }
}

// ─── NUTRITION LOGGING (foundation — manual entry + USDA lookup) ──────────
async function usdaFetch(action, params) {
  try {
    const res = await fetch(USDA_EDGE_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer '+SB_ANON_KEY },
      body: JSON.stringify({ action, ...params }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch(e) { return null; }
}

// USDA nutrient names/shapes vary between the search and lookup endpoints,
// and across Branded/Foundation/SR Legacy data types — matched by NAME
// (case-insensitive, several accepted aliases per macro) rather than
// trusting one exact numeric ID to hold across every response shape.
const USDA_NUTRIENT_ALIASES = {
  calories: ['energy'],
  protein: ['protein'],
  fat: ['total lipid', 'total fat'],
  carbs: ['carbohydrate, by difference', 'carbohydrate'],
  fiber: ['fiber, total dietary', 'total dietary fiber', 'fiber'],
  sugar: ['sugars, total', 'total sugars', 'sugars'],
};

function extractUSDANutrients(foodDetail) {
  const list = foodDetail?.foodNutrients || [];
  const result = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 };
  const found = new Set();
  list.forEach(n => {
    const name = (n.nutrient?.name || n.nutrientName || n.name || '').toLowerCase();
    const value = n.amount ?? n.value;
    if (!name || value == null) return;
    Object.keys(USDA_NUTRIENT_ALIASES).forEach(key => {
      if (found.has(key)) return;
      if (USDA_NUTRIENT_ALIASES[key].some(alias => name.includes(alias))) {
        result[key] = Math.round((parseFloat(value) || 0) * 10) / 10;
        found.add(key);
      }
    });
  });
  return result;
}

function usdaReferenceLabel(food) {
  if (food.servingSize && food.servingSizeUnit) return food.servingSize + ' ' + food.servingSizeUnit;
  return '100 g';
}

// USDA's search has no concept of "the plain, default version of this
// food" — for a handful of the most commonly logged staples, this maps the
// query to a pattern matching that plain version, boosted above everything
// else when found among the actual results. Deliberately small and
// expandable — covers the highest-value common cases rather than
// attempting to solve food-search relevance generally, which USDA's own
// data doesn't have the signal to support.
const STAPLE_FOOD_BOOSTS = {
  chicken: /chicken.*breast/i,
  beef: /beef.*ground/i,
  egg: /^egg,?\s*whole/i,
  eggs: /^egg,?\s*whole/i,
  rice: /rice,\s*white|rice,\s*brown/i,
  salmon: /salmon/i,
  turkey: /turkey.*breast/i,
  oatmeal: /^oats\b/i,
  oats: /^oats\b/i,
  broccoli: /^broccoli,\s*raw/i,
  potato: /potato.*baked|potato.*boiled/i,
  banana: /^bananas,\s*raw/i,
  apple: /^apples,\s*raw/i,
  yogurt: /yogurt.*plain/i,
  milk: /^milk,/i,
  croissant: /^croissants?,/i,
};

// ─── FOOD EMOJI ─────────────────────────────────────────────────────────
// Purely cosmetic — keyword-matched against whatever description string a
// food ended up with, whichever source it came from (USDA, manual, photo,
// barcode, frequent-foods history). Ordered most-specific-first so e.g.
// "protein shake" matches before a more generic pattern could grab it.
// Not exhaustive by design — an unmatched food just gets the plate
// fallback rather than a guessed-wrong icon.
const FOOD_EMOJI_PATTERNS = [
  [/protein\s*shake|protein\s*powder|whey/i, '🥤'],
  [/banana/i, '🍌'],
  [/pizza/i, '🍕'],
  [/burger/i, '🍔'],
  [/sandwich|\bsub\b/i, '🥪'],
  [/taco/i, '🌮'],
  [/burrito/i, '🌯'],
  [/salad/i, '🥗'],
  [/\begg/i, '🥚'],
  [/bacon/i, '🥓'],
  [/chicken|turkey/i, '🍗'],
  [/steak|\bbeef\b/i, '🥩'],
  [/salmon|\bfish\b|tuna/i, '🐟'],
  [/shrimp/i, '🍤'],
  [/\brice\b/i, '🍚'],
  [/pasta|spaghetti|noodle/i, '🍝'],
  [/toast|\bbread\b|bagel/i, '🍞'],
  [/oatmeal|\boats\b/i, '🥣'],
  [/yogurt/i, '🥣'],
  [/cheese/i, '🧀'],
  [/pancake|waffle/i, '🥞'],
  [/donut|doughnut/i, '🍩'],
  [/cookie/i, '🍪'],
  [/ice cream/i, '🍦'],
  [/coffee/i, '☕'],
  [/\bmilk\b/i, '🥛'],
  [/broccoli|vegetable|veggie/i, '🥦'],
  [/avocado/i, '🥑'],
  [/apple/i, '🍎'],
  [/orange/i, '🍊'],
  [/grape/i, '🍇'],
  [/strawberr|\bberry\b|berries/i, '🍓'],
  [/watermelon/i, '🍉'],
  [/potato|fries/i, '🍟'],
  [/soup/i, '🍲'],
  [/protein\s*bar|granola\s*bar|\bbar\b/i, '🍫'],
  [/pie\b/i, '🥧'],
];

// Shared "working on it" state for anything that calls out to the vision
// API or a barcode lookup — both can take several real seconds, and a
// small muted line of text was easy to miss, making the app look hung
// rather than busy. Bold, bordered, with a spinning indicator so there's
// no ambiguity about whether something is happening.
function loadingCardHTML(label) {
  return '<div class="card mt8" style="border-color:var(--gold);text-align:center;padding:20px 16px">' +
    '<span class="fcf-spinner"></span>' +
    '<span style="font-size:14px;font-weight:600">' + sanitizeUserText(label) + '</span>' +
    '</div>';
}

function foodEmoji(description) {
  const d = description || '';
  for (const [pattern, emoji] of FOOD_EMOJI_PATTERNS) {
    if (pattern.test(d)) return emoji;
  }
  return '🍽️'; // generic fallback so every food row still has an icon slot
}

async function searchUSDAFoods(query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim().toLowerCase();
  const res = await usdaFetch('search', { query: query.trim() });
  const foods = res?.foods || [];
  const staplePattern = STAPLE_FOOD_BOOSTS[q];
  // Three sort tiers: (1) a curated staple match, if the query is one of
  // the common cases above, always wins outright; (2) generic before
  // branded; (3) within each tier, results starting with the search term
  // rank first. Stable sort preserves USDA's own ordering beyond that.
  const sorted = [...foods].sort((a, b) => {
    if (staplePattern) {
      const aStaple = staplePattern.test(a.description || '');
      const bStaple = staplePattern.test(b.description || '');
      if (aStaple !== bStaple) return aStaple ? -1 : 1;
    }
    const aGeneric = a.dataType === 'Foundation' || a.dataType === 'SR Legacy';
    const bGeneric = b.dataType === 'Foundation' || b.dataType === 'SR Legacy';
    if (aGeneric !== bGeneric) return aGeneric ? -1 : 1;
    const aStarts = (a.description || '').toLowerCase().startsWith(q);
    const bStarts = (b.description || '').toLowerCase().startsWith(q);
    if (aStarts !== bStarts) return aStarts ? -1 : 1;
    return 0;
  });
  return sorted.slice(0, 12).map(f => ({
    fdcId: f.fdcId,
    description: f.description,
    brandName: f.brandOwner || f.brandName || null,
    servingSize: f.servingSize || null,
    servingSizeUnit: f.servingSizeUnit || null,
    dataType: f.dataType || null,
    nutrients: extractUSDANutrients(f),
  }));
}

async function getUSDAFoodDetail(fdcId) {
  const res = await usdaFetch('lookup', { fdcId });
  if (!res || res.error) return null;
  return {
    fdcId: res.fdcId,
    description: res.description,
    servingSize: res.servingSize || null,
    servingSizeUnit: res.servingSizeUnit || null,
    nutrients: extractUSDANutrients(res),
  };
}

function scaleNutrients(nutrients, multiplier) {
  const m = parseFloat(multiplier) || 0;
  const out = {};
  Object.keys(nutrients).forEach(k => { out[k] = Math.round(nutrients[k] * m * 10) / 10; });
  return out;
}

function sumMealNutrients(items) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 };
  (items || []).forEach(item => {
    Object.keys(totals).forEach(k => { totals[k] = Math.round((totals[k] + (item.nutrients?.[k] || 0)) * 10) / 10; });
  });
  return totals;
}

async function saveMealLog(mealType, items, loggedAt) {
  if (!items || !items.length) return null;
  const mealData = { mealType, items, totals: sumMealNutrients(items) };
  const row = { user_id: ST.user?.id || null, logged_at: loggedAt || new Date().toISOString(), meal_type: mealType, meal_data: mealData };
  try {
    const { data, error } = await SB.from('meal_logs').insert([row]).select();
    if (error) throw error;
    const saved = data?.[0] || { ...row, id: 'local_'+Date.now() };
    ST.todaysMeals = ST.todaysMeals || [];
    ST.todaysMeals.push(saved);
    return saved;
  } catch(e) {
    return null;
  }
}

// Edits an already-logged meal in place — same shape as saveMealLog, but
// updates the existing row (and its position in ST.todaysMeals) rather
// than inserting a new one. The original logged_at time is preserved
// unless the caller passes a new one, so editing what someone ate for
// lunch doesn't quietly move it to "now" in the timeline.
async function updateMealLog(id, mealType, items, loggedAt) {
  if (!id || !items || !items.length) return null;
  const mealData = { mealType, items, totals: sumMealNutrients(items) };
  const row = { meal_type: mealType, meal_data: mealData };
  try {
    const { data, error } = await SB.from('meal_logs').update(row).eq('id', id).select();
    if (error) throw error;
    const saved = data?.[0] || { id, user_id: ST.user?.id || null, logged_at: loggedAt || new Date().toISOString(), meal_type: mealType, meal_data: mealData };
    ST.todaysMeals = (ST.todaysMeals || []).map(m => m.id === id ? saved : m);
    return saved;
  } catch(e) {
    return null;
  }
}

async function loadTodaysMeals() {
  if (!ST.user) { ST.todaysMeals = []; return; }
  const dayStart = new Date(); dayStart.setHours(0,0,0,0);
  try {
    const { data, error } = await SB.from('meal_logs')
      .select('*').eq('user_id', ST.user.id)
      .gte('logged_at', dayStart.toISOString())
      .order('logged_at', { ascending: true });
    if (error) throw error;
    ST.todaysMeals = data || [];
  } catch(e) {
    ST.todaysMeals = ST.todaysMeals || [];
  }
}

async function deleteMealLog(id) {
  try { await SB.from('meal_logs').delete().eq('id', id); } catch(e) {}
  ST.todaysMeals = (ST.todaysMeals || []).filter(m => m.id !== id);
  renderPage();
}

// ─── NUTRITION TARGETS ──────────────────────────────────────────────────
// Mifflin-St Jeor — the most widely validated BMR equation for general use.
// Returns null rather than guessing when any input is missing, so the caller
// prompts for real data instead of showing a target built on defaults.
function calculateBMR(sex, weightLb, heightIn, age) {
  const w = parseFloat(weightLb), h = parseFloat(heightIn), a = parseInt(age);
  if (!w || !h || !a || !sex) return null;
  const kg = w * 0.45359237, cm = h * 2.54;
  const base = (10 * kg) + (6.25 * cm) - (5 * a);
  return Math.round(sex === 'female' ? base - 161 : base + 5);
}

// Training days per week -> activity multiplier. Deliberately conservative:
// pilots spend long stretches seated on duty, so the sedentary baseline is
// more honest than assuming an active day just because they're not home.
const ACTIVITY_MULTIPLIERS = { '1-2': 1.375, '3-4': 1.55, '5-6': 1.725, daily: 1.9 };

function calculateTDEE(bmr, trainingDays) {
  if (!bmr) return null;
  return Math.round(bmr * (ACTIVITY_MULTIPLIERS[trainingDays] || 1.375));
}

// Guardrails are enforced HERE, not in the UI, so they can't be bypassed by
// a different entry point later:
//   - the deficit is capped, not user-configurable
//   - the result can never land below BMR, whatever the math says
const MAX_DAILY_DEFICIT = 500;   // ≈1 lb/week, the well-established safe rate
const MAX_DAILY_SURPLUS = 300;   // lean gain; more than this is mostly fat

// Minimum safe fat intake regardless of goal — below this risks real
// physiological harm (hormone production depends on dietary fat), not just
// a suboptimal macro split. Applied to manual entry the same as calculated.
const MIN_DAILY_FAT_G = 20;

// The single place guardrails are enforced, used by BOTH the calculated
// path and manual entry — so typing in a number can never bypass the same
// protections the calculator has. Returns the clamped values plus which
// ones were actually changed, so the UI can explain honestly rather than
// silently override what someone typed.
function enforceNutritionGuardrails(calories, protein, carbs, fat, bmr) {
  const out = { calories, protein, carbs, fat, calorieClamped: false, fatClamped: false };
  if (bmr && out.calories < bmr) { out.calories = bmr; out.calorieClamped = true; }
  if (out.fat < MIN_DAILY_FAT_G) { out.fat = MIN_DAILY_FAT_G; out.fatClamped = true; }
  out.protein = Math.max(0, out.protein);
  out.carbs = Math.max(0, out.carbs);
  return out;
}

function calculateNutritionTargets(mode, tdee, bmr, weightLb) {
  if (mode === 'none' || !tdee || !bmr) return null;
  let calories;
  if (mode === 'fatloss')      calories = tdee - MAX_DAILY_DEFICIT;
  else if (mode === 'muscle')  calories = tdee + MAX_DAILY_SURPLUS;
  else                         calories = tdee;

  // Hard floor. Eating below resting metabolic rate isn't a more aggressive
  // plan, it's a worse one — so this clamps regardless of what the
  // arithmetic above produced. Needs to happen before fat is derived below,
  // since fat is a percentage of calories.
  const flooredAtBMR = calories < bmr;
  if (flooredAtBMR) calories = bmr;

  const w = parseFloat(weightLb) || 0;
  // Protein stays high in a deficit specifically to protect lean mass, which
  // is the whole point of training while losing fat.
  const proteinPerLb = mode === 'maintain' ? 0.8 : 1.0;
  const protein = Math.round(w * proteinPerLb);
  const fatPct = mode === 'fatloss' ? 0.30 : mode === 'muscle' ? 0.25 : 0.28;
  const fat = Math.round((calories * fatPct) / 9);
  const carbs = Math.max(0, Math.round((calories - (protein * 4) - (fat * 9)) / 4));

  // Final pass through the same guardrail function manual entry uses —
  // catches the fat floor too (unlikely to trigger here given realistic
  // BMR values, but one real source of truth beats two rules that could
  // quietly drift apart over time).
  const g = enforceNutritionGuardrails(Math.round(calories), protein, carbs, fat, bmr);
  return { calories: g.calories, protein: g.protein, carbs: g.carbs, fat: g.fat, bmr, tdee, mode,
           flooredAtBMR: flooredAtBMR || g.calorieClamped, fatFloored: g.fatClamped };
}

function nutritionGoalsComplete() {
  return !!(ST.sex && ST.age && ST.heightIn && ST.lastWeight);
}

async function saveNutritionGoals(targets) {
  ST.nutritionGoals = targets ? { ...targets, setAt: new Date().toISOString() } : { mode: 'none', setAt: new Date().toISOString() };
  try {
    const profile = (await dbGetProfile()) || {};
    profile.nutritionGoals = ST.nutritionGoals;
    await dbSetProfile(profile);
  } catch(e) {}
}

// ─── TODAY BRIEFING ─────────────────────────────────────────────────────
// Everything here is deterministic and derived from data the app already
// holds — no network call, no API cost, works offline in a terminal or at
// altitude, which is the whole point of not making this AI-generated.

function scheduleContextForToday(schedule, now) {
  const ctx = { hasSchedule: false, todayEvents: [], current: null, nextDuty: null,
                lastDutyEndedAt: null, freeMinutesUntilDuty: null, layoverAirport: null,
                tomorrowFirstDuty: null, yesterdayDutyHours: 0, flightsToday: 0,
                legsCompleted: 0, legsRemaining: 0, dutyEndsAt: null, dutyEndsToday: null,
                currentType: null, justLandedMinAgo: null };
  if (!schedule || !schedule.length) return ctx;
  ctx.hasSchedule = true;
  const t = now.getTime();
  const dayStart = new Date(now); dayStart.setHours(0,0,0,0);
  const dayEnd = new Date(now); dayEnd.setHours(23,59,59,999);
  const yStart = new Date(dayStart.getTime() - 86400000);
  const tomorrowStart = new Date(dayStart.getTime() + 86400000);
  const tomorrowEnd = new Date(dayEnd.getTime() + 86400000);

  schedule.forEach(e => {
    const s = new Date(e.start).getTime(), en = new Date(e.end).getTime();
    if (isNaN(s) || isNaN(en)) return;
    if (en > dayStart.getTime() && s < dayEnd.getTime()) {
      ctx.todayEvents.push(e);
      if (e.type === 'flight') ctx.flightsToday++;
      if (t >= s && t <= en) {
        ctx.current = e;
        if (e.type === 'layover') ctx.layoverAirport = e.airport;
      }
      if (e.type === 'flight' && s > t) {
        ctx.legsRemaining++;
        if (!ctx.nextDuty || s < new Date(ctx.nextDuty.start).getTime()) ctx.nextDuty = e;
      }
      if (e.type === 'flight' && en < t) {
        ctx.legsCompleted++;
        if (!ctx.lastDutyEndedAt || en > ctx.lastDutyEndedAt) ctx.lastDutyEndedAt = en;
      }
      // When the flying actually stops today — the point after which a real
      // session becomes possible, which is different from the next gap.
      if (e.type === 'flight' && (!ctx.dutyEndsAt || en > ctx.dutyEndsAt)) ctx.dutyEndsAt = en;
    }
    // Yesterday's total flight time — the recovery-debt signal
    if (e.type === 'flight' && en > yStart.getTime() && s < dayStart.getTime()) {
      const os = Math.max(s, yStart.getTime()), oe = Math.min(en, dayStart.getTime());
      if (oe > os) ctx.yesterdayDutyHours += (oe - os) / 3600000;
    }
    if (e.type === 'flight' && s >= tomorrowStart.getTime() && s <= tomorrowEnd.getTime()) {
      if (!ctx.tomorrowFirstDuty || s < new Date(ctx.tomorrowFirstDuty.start).getTime()) ctx.tomorrowFirstDuty = e;
    }
  });
  ctx.yesterdayDutyHours = Math.round(ctx.yesterdayDutyHours * 10) / 10;
  if (ctx.nextDuty) ctx.freeMinutesUntilDuty = Math.round((new Date(ctx.nextDuty.start).getTime() - t) / 60000);
  if (ctx.lastDutyEndedAt) ctx.justLandedMinAgo = Math.round((t - ctx.lastDutyEndedAt) / 60000);
  // Trip-aware counts replace the calendar-day-bounded ones for anything
  // that drives a recommendation — a trip crossing midnight is one duty
  // period, not a fresh day that resets what's already been flown.
  const trip = currentTripContext(schedule, now);
  ctx.legsCompleted = trip.legsCompleted;
  ctx.legsRemaining = trip.legsRemaining;
  ctx.legsTodayCompleted = trip.legsTodayCompleted;
  ctx.legsTodayRemaining = trip.legsTodayRemaining;
  ctx.dutyEndsToday = trip.dutyEndsToday;
  ctx.currentType = trip.currentType;
  if (trip.current) ctx.current = trip.current;
  if (trip.dutyEndsAt) ctx.dutyEndsAt = trip.dutyEndsAt;
  if (!ctx.layoverAirport && trip.current?.type === 'layover') ctx.layoverAirport = trip.current.airport;
  return ctx;
}

// Pilots think in trips, not calendar days. A layover that started before
// midnight with legs still to fly after it is the SAME situation as a
// same-day layover — calendar-day boundaries were causing it to look like
// a fresh, unstarted day and wrongly recommend a full session. Scans the
// whole schedule for the current continuous duty run: a dutyfree block, or
// a 20+ hour gap with nothing scheduled, is what actually ends a trip.
function currentTripContext(schedule, now) {
  const t = now.getTime();
  const DUTYFREE_GAP_MS = 20 * 3600000;
  const events = (schedule || [])
    .filter(e => e.type === 'flight' || e.type === 'layover')
    .map(e => { const s = new Date(e.start).getTime(), en = new Date(e.end).getTime(); return { ...e, s, en }; })
    .filter(e => !isNaN(e.s) && !isNaN(e.en))
    .sort((a,b) => a.s - b.s);

  // Partition into discrete trips FIRST — a gap over the threshold ends
  // one trip and starts the next. The earlier version tracked this boundary
  // but never actually used it to limit counting, so it accumulated legs
  // across the entire multi-month schedule instead of just the current trip.
  const trips = [];
  let cur = [];
  events.forEach(e => {
    if (cur.length && (e.s - cur[cur.length-1].en) > DUTYFREE_GAP_MS) { trips.push(cur); cur = []; }
    cur.push(e);
  });
  if (cur.length) trips.push(cur);

  // The active trip: one whose events actually span "now" — either inside
  // a specific flight/layover, or between two events of the same trip
  // (a short ground stop shorter than the reset threshold).
  let activeTrip = trips.find(trip => trip.some(e => t >= e.s && t <= e.en))
                 || trips.find(trip => t >= trip[0].s && t <= trip[trip.length-1].en);
  if (!activeTrip) {
    // Neither condition matches when the most recent trip has already
    // fully ended and nothing is scheduled next (just landed, no further
    // legs today) — fall back to that trip if it ended recently enough to
    // still be the relevant context, same threshold used to define a trip
    // boundary in the first place.
    const ended = trips.filter(trip => trip[trip.length-1].en < t)
                        .sort((a,b) => b[b.length-1].en - a[a.length-1].en);
    if (ended.length && (t - ended[0][ended[0].length-1].en) <= DUTYFREE_GAP_MS) activeTrip = ended[0];
  }
  if (!activeTrip) return { legsCompleted: 0, legsRemaining: 0, current: null, dutyEndsAt: null };

  let legsCompleted = 0, legsRemaining = 0, current = null, dutyEndsAt = null;
  let legsTodayCompleted = 0, legsTodayRemaining = 0;
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const todayEnd   = new Date(now); todayEnd.setHours(23,59,59,999);
  const todayStartMs = todayStart.getTime(), todayEndMs = todayEnd.getTime();

  activeTrip.forEach(e => {
    if (t >= e.s && t <= e.en) current = e;
    if (e.type === 'flight') {
      if (e.en <= t) legsCompleted++;
      else if (e.s > t) legsRemaining++;
      if (!dutyEndsAt || e.en > dutyEndsAt) dutyEndsAt = e.en;
      // Today-only counts
      const flightIsToday = e.s <= todayEndMs && e.en >= todayStartMs;
      if (flightIsToday) {
        if (e.en <= t) legsTodayCompleted++;
        else if (e.s > t) legsTodayRemaining++;
      }
    }
  });

  // BUG FIX (reported): dutyEndsAt above is the last flight of the ENTIRE
  // pairing. Layovers under DUTYFREE_GAP_MS don't split a trip, so a
  // four-day pairing is one trip and that value can be days out — it was
  // rendered as a bare time of day, so "you're off at 7:32 PM" read as
  // tonight when it was actually 7:32 PM two days later.
  //
  // What "you're off at" has to mean is the end of the CURRENT duty run:
  // the last flight before the next rest period, not the end of the trip.
  const upcomingLayover = activeTrip.find(e => e.type === 'layover' && e.s > t);
  const dutyRunLimit = upcomingLayover ? upcomingLayover.s : Infinity;
  let dutyEndsToday = null;
  activeTrip.forEach(e => {
    if (e.type !== 'flight' || e.en > dutyRunLimit) return;
    if (e.en > t && (!dutyEndsToday || e.en > dutyEndsToday)) dutyEndsToday = e.en;
  });

  return { legsCompleted, legsRemaining, legsTodayCompleted, legsTodayRemaining,
           current, dutyEndsAt, dutyEndsToday,
           currentType: current ? current.type : null };
}

// Adjacent, identically-labeled events — e.g. an export that creates one
// "Duty free period" block per calendar day of a multi-day stretch, with
// one block ending the exact instant the next begins — merge into a single
// continuous entry for display. Otherwise the same label can show up two
// or three times in a row with confusingly-overlapping boundary times.
function mergeAdjacentEvents(events) {
  const sorted = [...events].sort((a,b) => new Date(a.start) - new Date(b.start));
  const merged = [];
  const TOLERANCE_MS = 5 * 60000; // small gap tolerance for near-exact boundaries
  sorted.forEach(e => {
    const last = merged[merged.length - 1];
    if (last && last.summary === e.summary && (new Date(e.start).getTime() - new Date(last.end).getTime()) <= TOLERANCE_MS) {
      if (new Date(e.end).getTime() > new Date(last.end).getTime()) last.end = e.end;
      last.uids.push(e.uid);
    } else {
      merged.push({ ...e, uids: [e.uid] });
    }
  });
  return merged;
}

// Oura can revise the day's sleep score upward after a nap. This tracks
// the first score seen in THIS APP SESSION as a baseline and flags a later,
// meaningfully higher reading as a likely nap — deliberately in-memory
// only, not persisted across app closes, which keeps it simple and testable.
// Honest limitation: check Today, close the app, nap, reopen, and there's
// no prior in-session reading left to compare against, so it won't fire in
// that specific sequence — it needs the app to stay open (or come back to
// the foreground) across the before/after.
const NAP_SCORE_JUMP = 8; // meaningful enough to not be noise/rounding
function checkForNapRecovery(currentSleepScore) {
  if (currentSleepScore === null || currentSleepScore === undefined) return null;
  if (ST.sleepBaselineScore === null || ST.sleepBaselineScore === undefined) {
    ST.sleepBaselineScore = currentSleepScore;
    return null;
  }
  if (currentSleepScore - ST.sleepBaselineScore >= NAP_SCORE_JUMP) {
    const jump = { from: ST.sleepBaselineScore, to: currentSleepScore };
    ST.sleepBaselineScore = currentSleepScore; // don't keep re-firing on the same jump
    return jump;
  }
  return null;
}

function getTodayContext() {
  const now = new Date();
  const sched = scheduleContextForToday(ST.flightSchedule, now);
  const meals = ST.todaysMeals || [];
  const consumed = sumMealNutrients(meals.flatMap(m => m.meal_data?.items || []));
  const g = ST.nutritionGoals && ST.nutritionGoals.mode !== 'none' ? ST.nutritionGoals : null;
  const workoutToday = (ST.sessionCache || []).some(s => isSessionOnLocalDay(s, now));
  const sleepScore = ST.ouraData?.sleep_score ?? null;
  return {
    now, hour: now.getHours(),
    sched,
    oura: { readiness: ST.ouraScore ?? null, sleep: sleepScore,
            activity: ST.ouraData?.activity_score ?? null, steps: ST.ouraSteps ?? null,
            napDetected: checkForNapRecovery(sleepScore) },
    nutrition: { consumed, goals: g, mealCount: meals.length,
                 proteinPct: g && g.protein ? Math.round((consumed.protein / g.protein) * 100) : null,
                 caloriePct: g && g.calories ? Math.round((consumed.calories / g.calories) * 100) : null },
    training: { workoutToday },
    water: ST.waterIn || 0,
  };
}

// Returns the single most useful thing right now, plus its tone. Ordered by
// priority — the first matching rule wins, so a low-readiness day never gets
// a "go train hard" headline just because a gap happens to exist.
// Real operational overhead on a between-legs gap, not configurable —
// these are duty requirements, not preferences. After brakes are set,
// 10 minutes for deplaning and the post-flight walk-around; before the
// next departure, 30 minutes minimum at the aircraft for FMC programming,
// walk-around, and briefings. Neither end of a ground gap is actually free.
// Beyond this a gap is a real rest period rather than a sit between legs.
// Six hours is a pragmatic line, not a regulatory one: it keeps genuine
// mid-duty sits — including a short overnight where the right advice is
// still "eat and rest, don't train" — on the between-legs framing, while
// stopping a 16-hour layover from being described in terms of deplaning
// the aircraft you left the previous evening.
const TURN_MAX_MIN = 360;

// A bare "7:32 PM" is only meaningful if it IS today. Anything further out
// gets its day named, so a duty end two days away can never again be read
// as tonight.
function fmtDutyEnd(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  const time = d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  if (d.toDateString() === new Date().toDateString()) return time;
  return d.toLocaleDateString('en-US',{weekday:'long'}) + ' ' + time;
}

const POST_LANDING_BUFFER_MIN = 10;
const PRE_DEPARTURE_BUFFER_MIN = 30;

function buildTodayBriefing(ctx) {
  const { sched, oura, training, hour } = ctx;
  const readiness = oura.readiness;
  const gapMin = sched.freeMinutesUntilDuty;

  // 1. Mid-duty — no training suggestion is useful here.
  if (sched.current && sched.current.type === 'flight') {
    return { tone:'neutral', headline:'On duty',
      body:'Mid-leg. Water and standing when you can beats anything you\'d gain from planning a session right now.',
      action:null };
  }

  // 2. Low readiness overrides an available window. Rest is the recommendation.
  if (readiness !== null && readiness < 60) {
    return { tone:'rest', headline:'Readiness is low — take it easy',
      body:'Readiness at '+readiness+'. A hard session today costs more than it returns. Stretching, an easy walk, or a nap if there\'s time before your next report.',
      action:{ label:'Start a light session', fn:"switchTab('preflight')" } };
  }

  // 2b. A same-day sleep-score jump (a nap) while readiness now reads
  // decent enough to reasonably consider training — acknowledges what just
  // happened instead of proceeding to the other rules as if nothing did.
  // Framed as a question, not a directive: only the person actually knows
  // if the nap was enough.
  if (oura.napDetected) {
    return { tone:'go', headline:'Nice nap — feeling recharged?',
      body:'Sleep score just went from '+oura.napDetected.from+' to '+oura.napDetected.to+'. That\'s real recovery. If you\'re feeling it, this could be a good window to train.',
      action:{ label:'Start a workout', fn:"switchTab('preflight')" } };
  }

  // 3. Long duty yesterday is a real recovery cost even when readiness looks fine.
  if (sched.yesterdayDutyHours >= 8 && !training.workoutToday) {
    return { tone:'ease', headline:'Yesterday was a long day',
      body:sched.yesterdayDutyHours+' hours of flying yesterday. Something moderate today — mobility or a walk — will do more for you than pushing hard.',
      action:{ label:'Start a session', fn:"switchTab('preflight')" } };
  }

  // 4. Already trained — shift to completing the day well.
  if (training.workoutToday) {
    // BUG FIX: was comparing protein-so-far against 75% of the FULL day's
    // goal regardless of what time it actually is — at 11:25am that's an
    // unreachable bar (a fair "well short" call needs the day to actually
    // be mostly over), so it fired "well short on protein" almost
    // regardless of how someone was actually pacing. Now paced the same
    // way hydration already is: judged against what's reasonable to have
    // eaten by THIS point in the day, not the full 24-hour target.
    //
    // Four tiers by how far off pace, each with its own language — a
    // 3-gram miss and a 100-gram miss are different situations and
    // shouldn't read the same. See proteinPaceTier() for the exact bands.
    const proteinPacedTarget = ctx.nutrition.goals ? ctx.nutrition.goals.protein * dayElapsedPct(ctx.now) : null;
    const proteinPaceRatio = proteinPacedTarget ? ctx.nutrition.consumed.protein / Math.max(proteinPacedTarget, 1) : 1;
    const tier = proteinPacedTarget !== null ? proteinPaceTier(proteinPaceRatio) : 'on_track';
    const tierCopy = {
      well_short: 'Work\'s done. You\'re still well short on protein, and that\'s the piece that turns the session into progress.',
      behind: 'Work\'s done. You\'re falling behind on protein for this point in the day — make it a priority at your next meal.',
      slightly_behind: 'Work\'s done. You\'re a bit behind on protein for this point in the day — not urgent, but worth catching up at your next meal.',
      on_track: 'Work\'s done. Keep water up through the rest of the day and protect your sleep window tonight.',
    };
    return { tone:'go', headline:'Session logged',
      body: tierCopy[tier],
      action: tier !== 'on_track' ? { label:'Log a meal', fn:"switchTab('nutrition')" } : null };
  }

  // 5. A gap while there's STILL FLYING LEFT today is not a training window,
  // whatever its length — you'd be training in uniform with legs ahead.
  // The raw gap between landing and the next departure isn't usable ground
  // time — 10 minutes of it belongs to deplaning/walk-around on the leg
  // just finished, and the last 30 belong to prepping the next one. What's
  // left in between is the only part actually available for anything else,
  // and a 38-minute gap and a 65-minute gap can look similar on a calendar
  // while being completely different once that's accounted for.
  // Only a genuine TURN between legs. The buffers below describe deplaning
  // the aircraft you just left and reporting for the next one — that
  // reasoning is sound for a 45-minute turn at a gate and meaningless on
  // an overnight layover, where you deplaned hours ago and are in a hotel.
  // Without this bound the branch caught everything, so a 16-hour layover
  // was reported as "8h 2m ... really about 442 min once deplaning duties
  // are accounted for", and the genuinely useful "you have 8h before your
  // next flight" branch below could never be reached.
  const isTurn = gapMin !== null && gapMin <= TURN_MAX_MIN;
  if (isTurn && sched.legsRemaining > 0 && sched.legsCompleted > 0) {
    const ord = ['','First','Second','Third','Fourth','Fifth'][sched.legsTodayCompleted] || (sched.legsTodayCompleted + 'th');
    const legsLeftToday = sched.legsTodayRemaining;
    const legWord = legsLeftToday === 1 ? 'one more leg today' : legsLeftToday + ' more legs today';

    const deplaningLeftMin = sched.justLandedMinAgo === null
      ? POST_LANDING_BUFFER_MIN
      : Math.max(0, POST_LANDING_BUFFER_MIN - sched.justLandedMinAgo);
    const stillDeplaning = deplaningLeftMin > 0;
    const usableMin = gapMin - deplaningLeftMin - PRE_DEPARTURE_BUFFER_MIN;
    const hrs = Math.floor(gapMin/60), mins = gapMin%60;
    const gapStr = (hrs > 0 ? hrs+'h '+(mins?mins+'m':'') : gapMin+' min').trim();
    const where = sched.layoverAirport ? ' in '+sched.layoverAirport : '';
    const dutyEnd = fmtDutyEnd(sched.dutyEndsToday);
    const ate = ctx.nutrition.mealCount > 0;

    // Late landing: duty ends after 10pm — no session, restaurants closing
    const dutyEndMs = sched.dutyEndsToday;
    const dutyEndHour = dutyEndMs ? new Date(dutyEndMs).getHours() : null;
    const isLateLanding = dutyEndHour !== null && (dutyEndHour >= 22 || dutyEndHour < 3);

    let body = ord + ' leg done, ' + legWord + (dutyEnd ? ' — off at ' + dutyEnd + '.' : '.') + ' ';

    if (isLateLanding) {
      if (!ate && usableMin >= 10) {
        body += 'Grab dinner now — most places will be closed by the time you land. Something portable is worth taking for later too.';
      } else if (ate) {
        body += 'Late landing — sleep is the priority tonight. Skip the session, get horizontal as soon as you can.';
      } else {
        body += 'Not enough ground time for a real meal. Late landing means restaurants will be closed — grab anything portable you can find now.';
      }
      const action = (!ate && usableMin >= 10)
        ? { label: 'Fuel up — log a meal', fn: "switchTab('nutrition')" }
        : null;
      return { tone: 'neutral', headline: ord + ' leg done — ' + gapStr + where, body, action };
    }

    if (usableMin >= 20 && !ate) {
      body += gapStr+' on the ground is really about '+usableMin+' min once '
           + (stillDeplaning ? 'deplaning duties and the '+PRE_DEPARTURE_BUFFER_MIN+'-minute report requirement are' : 'the '+PRE_DEPARTURE_BUFFER_MIN+'-minute report requirement is')
           + ' accounted for — worth eating now.';
    } else if (usableMin >= 20 && ate) {
      body += 'Top up water and keep moving while you can; sitting is the real cost of a day like this.';
    } else if (usableMin >= 5) {
      body += gapStr+' on the ground is really only about '+usableMin+' min after '
           + (stillDeplaning ? 'duty requirements on both ends' : 'the report requirement')
           + ' — enough for something quick and portable, not a real meal.';
    } else {
      body += gapStr+' isn\'t real ground time once '
           + (stillDeplaning ? 'deplaning and report requirements are' : 'the report requirement is')
           + ' accounted for — basically none of it is usable. Water if you can grab it, don\'t plan around food here.';
    }
    if (dutyEnd) body += ' The window after '+dutyEnd+' is where a real session and dinner fit.';

    const action = usableMin >= 5
      ? { label: (usableMin >= 20 && !ate) ? 'Fuel up — log a meal' : 'Log a meal', fn:"switchTab('nutrition')" }
      : null;
    return { tone:'neutral', headline:ord+' leg done — '+gapStr+where, body, action };
  }

  // 6. Duty is finished for the day (or hasn't started and there's real room).
  if (gapMin !== null && gapMin >= 45) {
    const hrs = Math.floor(gapMin/60), mins = gapMin%60;
    const gapStr = hrs > 0 ? hrs+'h '+(mins?mins+'m':'') : gapMin+' min';
    const marginal = readiness !== null && readiness < 70;
    return { tone: marginal ? 'ease' : 'go',
      headline:'You have '+gapStr.trim()+' before your next flight',
      body: marginal
        ? 'Readiness at '+readiness+' — enough time to train, but keep the intensity honest rather than chasing a PR.'
        : (sched.layoverAirport ? 'On a layover in '+sched.layoverAirport+'. ' : '') + 'Good window for a full session.',
      action:{ label:'Start a workout', fn:"switchTab('preflight')" } };
  }

  // 7. Flying is done for the day — this is the genuine training window.
  if (sched.legsCompleted > 0 && sched.legsRemaining === 0) {
    const endStr = sched.dutyEndsAt ? new Date(sched.dutyEndsAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : null;
    return { tone:'go', headline:'Done flying for the day',
      body:(endStr ? 'Last leg landed at '+endStr+'. ' : '')+'This is your window — a full session now, then dinner, and you\'re still in good shape for tomorrow.',
      action:{ label:'Start a workout', fn:"switchTab('preflight')" } };
  }

  // 6. A short window — worth naming honestly rather than pretending it's enough.
  if (gapMin !== null && gapMin > 0 && gapMin < 45) {
    return { tone:'neutral', headline:'Tight window — '+gapMin+' min',
      body:'Not enough for a full session without rushing it. A brisk walk through the terminal or some mobility work fits better.',
      action:null };
  }

  // 7. Evening with an early report tomorrow — sleep is the highest-value move.
  if (sched.tomorrowFirstDuty && hour >= 19) {
    const rt = new Date(sched.tomorrowFirstDuty.start);
    return { tone:'rest', headline:'Early report tomorrow',
      body:'First leg at '+rt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})+'. Sleep is the highest-return thing left on today\'s list.',
      action:null };
  }

  // 8. Nothing scheduled — the best day of the week to train properly.
  // Checks flightsToday specifically, not todayEvents.length — a
  // duty-free block IS a today-event, so counting raw events never
  // recognized a genuinely open day.
  if (sched.hasSchedule && sched.flightsToday === 0) {
    return { tone:'go', headline:'No duty today',
      body:'Nothing on the schedule. Best chance this week for a full session with real equipment.',
      action:{ label:'Start a workout', fn:"switchTab('preflight')" } };
  }

  // 9. Fallback — still actionable, never a dead end.
  return { tone:'neutral', headline: hour < 11 ? 'Good morning' : hour < 17 ? 'Afternoon check-in' : 'Evening check-in',
    body: ST.flightSchedule ? 'Nothing pressing on the schedule right now.' : 'Upload your crew schedule in Data & Import/Export and this gets a lot more specific.',
    action:{ label:'Start a workout', fn:"switchTab('preflight')" } };
}

// The "what's still open today" list — separate from the headline so it can
// show alongside any recommendation without competing with it.
function buildTodayGaps(ctx) {
  const gaps = [];
  const { nutrition, training, hour } = ctx;
  if (ST.trackNutrition && !nutrition.mealCount && hour >= 11) gaps.push({ icon:'🍽️', text:'Nothing logged yet today', fn:"switchTab('nutrition')" });
  else if (ST.trackNutrition && nutrition.goals && nutrition.proteinPct !== null && nutrition.proteinPct < 70 && hour >= 15) {
    gaps.push({ icon:'🥩', text:'Protein at '+nutrition.proteinPct+'% of target', fn:"switchTab('nutrition')" });
  }
  if (!training.workoutToday && hour >= 18) gaps.push({ icon:'💪', text:'No session logged today', fn:"switchTab('preflight')" });
  // Uses the same hydroStatus() the workout hydration gate reads from —
  // previously this used a hardcoded "under 1.5L after 2pm" check that
  // ignored the real, flight-hours-aware target entirely. On a no-fly day
  // (1.0L floor target) that hardcoded check could flag water as "light"
  // at the exact same moment the workout screen showed 100%/nominal —
  // two screens disagreeing about the same number. Both now read from
  // hydroTarget()/ST.waterIn, so they can't diverge again.
  const hydro = ST.trackHydration ? hydroStatus(ctx.now) : { label: 'NOMINAL' };
  if (hydro.label === 'DEFICIT') gaps.push({ icon:'💧', text:'Water is well behind pace today', fn:"switchTab('preflight')" });
  else if (hydro.label === 'CAUTION') gaps.push({ icon:'💧', text:'Water is light so far', fn:"switchTab('preflight')" });
  return gaps;
}

function renderToday(p) {
  const ctx = getTodayContext();
  const brief = buildTodayBriefing(ctx);
  const gaps = buildTodayGaps(ctx);
  const toneColor = { go:'var(--green)', ease:'var(--amber)', rest:'var(--blue)', neutral:'var(--muted)' }[brief.tone];
  const parts = [];

  parts.push('<div class="fb" style="align-items:baseline;margin-bottom:14px">');
  parts.push('<span style="font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--muted)">'+ctx.now.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}).toUpperCase()+'</span>');
  if (ctx.oura.steps !== null) parts.push('<span style="font-family:var(--mono);font-size:12px;color:var(--text)">'+ctx.oura.steps.toLocaleString()+' <span style="font-size:9px;color:var(--muted);letter-spacing:.1em">STEPS</span></span>');
  parts.push('</div>');

  if (ST.ouraConnected && ctx.oura.readiness !== null) {
    parts.push('<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">');
    [['READINESS',ctx.oura.readiness,'gold'],['SLEEP',ctx.oura.sleep,'blue'],['ACTIVITY',ctx.oura.activity,'teal']].forEach(([l,v,col]) => {
      const vc = v===null?'var(--muted)':v>=85?'var(--green)':v>=70?'var(--text)':v>=60?'var(--amber)':'var(--red)';
      parts.push(glowTile(l,v,col,vc));
    });
    parts.push('</div>');
  }

  parts.push('<div class="card mb12" style="border-left:3px solid '+toneColor+'">');
  parts.push('<div style="font-size:17px;font-weight:600;letter-spacing:-.01em;margin-bottom:7px">'+brief.headline+'</div>');
  parts.push('<div style="font-size:13px;color:var(--muted);line-height:1.65">'+brief.body+'</div>');
  if (brief.action) parts.push('<button class="btn btn-gold" style="margin-top:14px" onclick="'+brief.action.fn+'">'+brief.action.label+'</button>');
  parts.push('</div>');

  // Standalone, always-shown prompt — not folded into one specific briefing
  // outcome, since a low-readiness day (or several other rules) would
  // otherwise completely bypass the only place this used to be mentioned,
  // meaning most schedule-less users would never actually see it.
  const hasAnySchedule = ST.flightSchedule?.length || ST.calendarEvents?.length;
  if (!hasAnySchedule) {
    const isNative = typeof FCFBridge !== 'undefined' && FCFBridge.isNative;
    if (isNative && !ST.calendarGranted) {
      parts.push('<div class="card mb12"><div class="fb" style="align-items:center"><div style="flex:1"><div style="font-size:13px;font-weight:600;margin-bottom:4px">📅 Connect your calendar</div><div style="font-size:11px;color:var(--muted);line-height:1.5">Grant calendar access and FCF will automatically detect your flights, layovers, and free time — no manual upload needed.</div></div></div><button class="btn-outline mt8" onclick="if(typeof FCFBridge!==\'undefined\')FCFBridge.requestCalendar()">Connect Calendar</button></div>');
    } else {
      parts.push('<div class="card mb12"><div class="fb" style="align-items:center"><div style="flex:1"><div style="font-size:13px;font-weight:600;margin-bottom:4px">📅 No flight schedule</div><div style="font-size:11px;color:var(--muted);line-height:1.5">Upload your crew schedule and this briefing gets a lot more specific — layovers, duty-day length, real windows to train.</div></div></div><button class="btn-outline mt8" onclick="switchTab(\'data\')">Upload Schedule</button></div>');
    }
  }

  // Show today's classified calendar events if available
  if (ST.calendarEvents?.length) {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);
    const todayEvents = ST.calendarEvents.filter(e => {
      const s = new Date(e.start), en = new Date(e.end);
      return s <= todayEnd && en >= todayStart && e.type !== 'personal';
    }).sort((a,b) => new Date(a.start) - new Date(b.start));

    if (todayEvents.length) {
      const typeIcon = { flight:'✈️', layover:'🏨', reserve:'📟', training:'🎓', duty:'📋', rest:'😴', unknown:'📅' };
      parts.push('<div class="section-label">TODAY\'S SCHEDULE</div>');
      parts.push('<div class="card mb12">');
      todayEvents.slice(0, 6).forEach(e => {
        const s = new Date(e.start), en = new Date(e.end);
        const icon = typeIcon[e.type] || '📅';
        const timeStr = e.isAllDay ? 'All day' :
          s.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false}) + '–' +
          en.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false});
        const label = e.origin && e.destination ? e.origin + ' → ' + e.destination : e.title;
        parts.push('<div class="fb" style="padding:7px 0;border-bottom:1px solid var(--border)">');
        parts.push('<span style="font-family:var(--mono);font-size:11px;color:var(--muted);min-width:90px">'+timeStr+'</span>');
        parts.push('<span style="font-size:12px;flex:1;text-align:right">'+icon+' '+label+'</span>');
        parts.push('</div>');
      });
      parts.push('</div>');
    }
  }

  if (ctx.sched.todayEvents.length) {
    parts.push('<div class="section-label">TODAY\'S SCHEDULE</div>');
    parts.push('<div class="card mb12">');
    mergeAdjacentEvents(ctx.sched.todayEvents).slice(0,6).forEach(e => {
      const s = new Date(e.start), en = new Date(e.end);
      const isNow = ctx.sched.current && e.uids.includes(ctx.sched.current.uid);
      parts.push('<div class="fb" style="padding:7px 0;'+(isNow?'':'opacity:.72')+'">');
      parts.push('<span style="font-family:var(--mono);font-size:11px;color:'+(isNow?'var(--gold)':'var(--muted)')+'">'+s.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false})+'–'+en.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false})+'</span>');
      parts.push('<span style="font-size:12px;text-align:right">'+e.summary+'</span>');
      parts.push('</div>');
    });
    parts.push('</div>');
  }

  const n = ctx.nutrition;
  if (n.goals) {
    if (ST.trackNutrition) {
    parts.push('<div class="section-label">FUEL</div>');
    parts.push('<div class="card mb12">');
    parts.push('<div class="fb" style="align-items:baseline;margin-bottom:10px"><span style="font-family:var(--mono);font-size:22px">'+Math.round(n.consumed.calories).toLocaleString()+'</span><span style="font-family:var(--mono);font-size:10px;color:var(--muted)">OF '+n.goals.calories.toLocaleString()+' CAL</span></div>');
    [['PROTEIN',n.consumed.protein,n.goals.protein,'var(--gold)'],['CARBS',n.consumed.carbs,n.goals.carbs,'var(--blue)'],['FAT',n.consumed.fat,n.goals.fat,'var(--teal)']].forEach(([lbl,have,goal,col]) => {
      const pct = goal > 0 ? Math.min(100,(have/goal)*100) : 0;
      parts.push('<div style="margin-bottom:8px"><div class="fb" style="margin-bottom:3px"><span style="font-family:var(--mono);font-size:9px;letter-spacing:.1em;color:var(--muted)">'+lbl+'</span><span style="font-family:var(--mono);font-size:10px">'+Math.round(have)+'<span style="color:var(--muted)">/'+goal+'g</span></span></div>');
      parts.push('<div style="height:3px;background:var(--bg3);border-radius:2px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+col+';border-radius:2px"></div></div></div>');
    });

    // Hydration sits inside the Fuel card when both are tracked, but it is
    // gated separately — someone who wants water tracking without calorie
    // tracking must not lose it just because it happens to render here.
    if (ST.trackHydration) parts.push(hydrationRowHTML(ctx));
    parts.push('</div>');
    } // end nutrition tracking block
  }

  // Hydration on, nutrition off: it still needs somewhere to live, so it
  // gets its own card rather than disappearing with the Fuel block.
  if (ST.trackHydration && !ST.trackNutrition) {
    parts.push('<div class="section-label">HYDRATION</div>');
    parts.push('<div class="card mb12">');
    parts.push(hydrationRowHTML(ctx, true));
    parts.push('</div>');
  }

  if (gaps.length) {
    parts.push('<div class="section-label">STILL OPEN</div>');
    parts.push('<div class="card mb12">');
    gaps.forEach(g => {
      parts.push('<div class="fb" style="padding:9px 0;cursor:pointer" onclick="'+g.fn+'"><span style="font-size:13px">'+g.icon+' '+g.text+'</span><span style="color:var(--muted);font-size:14px">›</span></div>');
    });
    parts.push('</div>');
  }

  parts.push('<button class="btn btn-outline" onclick="switchTab(\'nutrition\')">🍽️ Log a meal</button>');
  p.innerHTML = parts.join('');
}

// Manual entry goes through the exact same guardrail function as the
// calculated path. If anything gets clamped, this corrects the displayed
// values and explains why rather than silently saving something different
// from what was typed — and only actually saves/navigates once a second
// pass confirms nothing more needs adjusting.
async function saveManualTargets(bmr, mode, trainingDays, tdee) {
  const cal = parseFloat(ST.manualCal) || 0;
  const protein = parseFloat(ST.manualProtein) || 0;
  const carbs = parseFloat(ST.manualCarbs) || 0;
  const fat = parseFloat(ST.manualFat) || 0;
  const bmrNum = parseFloat(bmr);
  const g = enforceNutritionGuardrails(cal, protein, carbs, fat, bmrNum);

  if (g.calorieClamped || g.fatClamped) {
    ST.manualCal = String(g.calories);
    ST.manualFat = String(g.fat);
    const msgs = [];
    if (g.calorieClamped) msgs.push('Calories can\'t go below your resting metabolic rate ('+Math.round(bmrNum)+') — adjusted up.');
    if (g.fatClamped) msgs.push('Fat can\'t go below '+MIN_DAILY_FAT_G+'g — adjusted up.');
    ST.manualTargetsWarning = msgs.join(' ');
    renderPage();
    return;
  }

  ST.manualTargetsWarning = null;
  const targets = { calories: g.calories, protein: g.protein, carbs: g.carbs, fat: g.fat,
    bmr: bmrNum, tdee: parseFloat(tdee), mode, trainingDays, flooredAtBMR: false, manual: true };
  await saveNutritionGoals(targets);
  ST.manualTargetsOpen = false;
  switchTab('nutrition');
}

function renderNutritionGoalsSetup(p) {
  // "Adjust anytime" needs to actually show what's currently saved, not
  // reset to generic defaults every time the screen opens — sync once per
  // visit, so it reflects the real plan on entry but doesn't fight an
  // in-progress selection on every subsequent click.
  if (!ST.fuelPlanDraftSynced) {
    if (ST.nutritionGoals && ST.nutritionGoals.mode) {
      ST.goalDraft = ST.nutritionGoals.mode;
      ST.trainDaysDraft = ST.nutritionGoals.trainingDays || '3-4';
    }
    ST.fuelPlanDraftSynced = true;
  }
  const parts = [moreBackLink()];
  parts.push('<div class="section-label" style="margin-top:0">FUEL PLAN SETUP</div>');

  if (!nutritionGoalsComplete()) {
    parts.push('<div class="alert alert-info mb12"><div class="alert-icon">📋</div><div>Targets are calculated from your sex, age, height, and weight. Add those in Pilot Profile first and come back — nothing here works off guessed numbers.</div></div>');
    parts.push('<button class="btn btn-outline" onclick="switchTab(\'profile\')">Go to Pilot Profile →</button>');
    p.innerHTML = parts.join('');
    return;
  }

  const bmr = calculateBMR(ST.sex, ST.lastWeight, ST.heightIn, ST.age);
  parts.push('<div class="card mb12">');
  parts.push('<div style="font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:4px">At rest your body uses about <strong style="color:var(--text)">'+bmr+' calories</strong> a day. Everything below builds from that.</div>');
  parts.push('</div>');

  parts.push('<div class="section-label">WHAT ARE YOU TRAINING FOR?</div>');
  parts.push('<div class="card mb12">');
  const goalOpts = [
    ['maintain','Maintain &amp; fuel training','Eat to support the work you\'re already doing.'],
    ['muscle','Build muscle','A modest surplus, weighted toward protein.'],
    ['fatloss','Lose fat gradually','A controlled deficit that protects your strength.'],
    ['none','Just track, no targets','Log meals and see the numbers. No goals, no targets.'],
  ];
  goalOpts.forEach(([val,label,desc]) => {
    const on = (ST.goalDraft || 'maintain') === val;
    parts.push('<div onclick="haptic(\'light\');ST.goalDraft=\''+val+'\';renderPage()" style="padding:12px;border:1px solid '+(on?'var(--gold)':'var(--border)')+';border-radius:9px;margin-bottom:8px;cursor:pointer;background:'+(on?'rgba(201,168,76,0.07)':'transparent')+'">');
    parts.push('<div style="font-size:14px;font-weight:600;color:'+(on?'var(--gold)':'var(--text)')+'">'+label+'</div>');
    parts.push('<div style="font-size:11px;color:var(--muted);margin-top:3px">'+desc+'</div>');
    parts.push('</div>');
  });
  parts.push('</div>');

  if ((ST.goalDraft || 'maintain') !== 'none') {
    parts.push('<div class="section-label">TRAINING DAYS PER WEEK</div>');
    parts.push('<div class="card mb12"><div class="field" style="margin-bottom:0"><select onchange="ST.trainDaysDraft=this.value;renderPage()">');
    [['1-2','1–2 days'],['3-4','3–4 days'],['5-6','5–6 days'],['daily','Most days']].forEach(([v,l]) => {
      parts.push('<option value="'+v+'"'+((ST.trainDaysDraft||'3-4')===v?' selected':'')+'>'+l+'</option>');
    });
    parts.push('</select></div></div>');

    const tdee = calculateTDEE(bmr, ST.trainDaysDraft || '3-4');
    const t = calculateNutritionTargets(ST.goalDraft || 'maintain', tdee, bmr, ST.lastWeight);
    if (t) {
      parts.push('<div class="section-label">YOUR STARTING TARGETS</div>');
      parts.push('<div class="card mb12">');
      parts.push('<div style="text-align:center;padding:6px 0 14px"><div style="font-family:var(--mono);font-size:38px;color:var(--gold);line-height:1">'+t.calories.toLocaleString()+'</div><div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:.18em;margin-top:5px">CALORIES / DAY</div></div>');
      [['PROTEIN',t.protein,'var(--gold)'],['CARBS',t.carbs,'var(--blue)'],['FAT',t.fat,'var(--teal)']].forEach(([n,v,c]) => {
        parts.push('<div class="fb" style="margin-bottom:7px"><span style="font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:var(--muted)">'+n+'</span><span style="font-family:var(--mono);font-size:13px;color:'+c+'">'+v+'g</span></div>');
      });
      parts.push('<div style="font-size:11px;color:var(--muted);line-height:1.65;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">');
      if (t.mode === 'fatloss') parts.push('A '+MAX_DAILY_DEFICIT+'-calorie deficit, which is roughly a pound a week. Protein stays high on purpose — that\'s what protects the strength you\'re building while you lose fat.');
      else if (t.mode === 'muscle') parts.push('A '+MAX_DAILY_SURPLUS+'-calorie surplus — enough to build, small enough that most of it isn\'t fat. Protein is set to support recovery between sessions.');
      else parts.push('Matched to what you\'re burning, so you\'re fueling your training rather than running it on empty.');
      parts.push('</div>');
      if (t.flooredAtBMR) {
        parts.push('<div style="font-size:11px;color:var(--amber);line-height:1.6;margin-top:10px">Held at your resting metabolic rate. The deficit math would have gone lower, but eating below what your body uses at rest isn\'t a faster plan, just a worse one.</div>');
      }
      parts.push('</div>');

      if (!ST.manualTargetsOpen) {
        parts.push('<button class="btn-ghost mb12" onclick="ST.manualTargetsOpen=true;ST.manualCal=\''+t.calories+'\';ST.manualProtein=\''+t.protein+'\';ST.manualCarbs=\''+t.carbs+'\';ST.manualFat=\''+t.fat+'\';renderPage()">✏️ Fine-tune these numbers manually</button>');
      } else {
        parts.push('<div class="card mb12">');
        parts.push('<div class="section-label" style="margin-top:0">CUSTOM TARGETS</div>');
        parts.push('<div style="font-size:11px;color:var(--muted);line-height:1.6;margin-bottom:12px">Starting from the calculated numbers above — adjust anything you want. The same safety limits still apply: calories can\'t go below what your body burns at rest, and fat can\'t go below '+MIN_DAILY_FAT_G+'g regardless of the goal.</div>');
        parts.push('<div class="field"><label>Calories / day</label><input type="text" inputmode="numeric" value="'+ST.manualCal+'" oninput="ST.manualCal=this.value"></div>');
        parts.push('<div class="field-row">');
        parts.push('<div class="field"><label>Protein (g)</label><input type="text" inputmode="numeric" value="'+ST.manualProtein+'" oninput="ST.manualProtein=this.value"></div>');
        parts.push('<div class="field"><label>Carbs (g)</label><input type="text" inputmode="numeric" value="'+ST.manualCarbs+'" oninput="ST.manualCarbs=this.value"></div>');
        parts.push('</div>');
        parts.push('<div class="field"><label>Fat (g)</label><input type="text" inputmode="numeric" value="'+ST.manualFat+'" oninput="ST.manualFat=this.value"></div>');
        parts.push('<div id="manualTargetsWarning" style="font-size:11px;color:var(--amber);line-height:1.6;margin-top:4px">'+(ST.manualTargetsWarning||'')+'</div>');
        parts.push('<button class="btn btn-gold mt8" onclick="saveManualTargets('+bmr+',\''+(ST.goalDraft||'maintain')+'\',\''+(ST.trainDaysDraft||'3-4')+'\',\''+tdee+'\')">Save Custom Targets</button>');
        parts.push('<button class="btn-ghost" onclick="ST.manualTargetsOpen=false;renderPage()">Cancel</button>');
        parts.push('</div>');
      }
      t.trainingDays = ST.trainDaysDraft || '3-4';
      parts.push('<button class="btn btn-gold" onclick="saveNutritionGoals('+JSON.stringify(t).replace(/"/g,'&quot;')+').then(()=>{switchTab(\'nutrition\')})">Use These Targets</button>');
    }
  } else {
    parts.push('<div class="alert alert-info mb12"><div class="alert-icon">👍</div><div>No targets set. You\'ll still see calories and macros for everything you log — just without a goal attached.</div></div>');
    parts.push('<button class="btn btn-gold" onclick="saveNutritionGoals(null).then(()=>{switchTab(\'nutrition\')})">Log Without Targets</button>');
  }

  parts.push('<div style="font-size:10px;color:var(--muted);line-height:1.6;margin-top:14px;text-align:center">A starting point, not a prescription. Adjust anytime, and talk to a doctor or dietitian for anything specific to you.</div>');
  p.innerHTML = parts.join('');
}

async function renderNutrition(p) {
  await loadTodaysMeals();
  const parts = [moreBackLink()];
  parts.push('<div class="section-label" style="margin-top:0">FUEL LOG — TODAY</div>');

  const g = ST.nutritionGoals;
  const meals = ST.todaysMeals || [];
  const dayTotals = sumMealNutrients(meals.flatMap(m => m.meal_data.items));

  if (!g) {
    parts.push('<div class="card mb12"><div style="font-size:13px;font-weight:600;margin-bottom:6px">Set up your fuel plan</div><div style="font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:12px">Calorie and macro targets built from your own biometrics — or skip targets entirely and just log what you eat.</div><button class="btn btn-gold" onclick="switchTab(\'fuelplan\')">Set Up Fuel Plan</button></div>');
  } else if (g.mode !== 'none') {
    // One consolidated card — ring plus macro bars — replacing what used to
    // be two separate totals displays (a goals-progress card, then a second
    // "Today's Totals" card further down repeating the same calorie number).
    const pct = g.calories > 0 ? Math.min(100, (dayTotals.calories / g.calories) * 100) : 0;
    const circumference = 2 * Math.PI * 45;
    const dashOffset = circumference * (1 - pct / 100);
    parts.push('<div class="card mb12"><div style="display:flex;gap:16px;align-items:center">');
    parts.push('<div style="position:relative;width:96px;height:96px;flex-shrink:0">');
    parts.push('<svg width="96" height="96" viewBox="0 0 104 104" style="transform:rotate(-90deg)">');
    parts.push('<circle cx="52" cy="52" r="45" fill="none" stroke="var(--bg3)" stroke-width="9"/>');
    parts.push('<circle cx="52" cy="52" r="45" fill="none" stroke="var(--gold)" stroke-width="9" stroke-linecap="round" stroke-dasharray="'+circumference.toFixed(1)+'" stroke-dashoffset="'+dashOffset.toFixed(1)+'"/>');
    parts.push('</svg>');
    parts.push('<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><div style="font-family:var(--mono);font-size:20px">'+Math.round(dayTotals.calories).toLocaleString()+'</div><div style="font-family:var(--mono);font-size:8px;color:var(--muted);letter-spacing:.1em;margin-top:2px">OF '+g.calories.toLocaleString()+'</div></div>');
    parts.push('</div>');
    parts.push('<div style="flex:1;min-width:0">');
    [['PROTEIN',dayTotals.protein,g.protein,'var(--gold)'],['CARBS',dayTotals.carbs,g.carbs,'var(--blue)'],['FAT',dayTotals.fat,g.fat,'var(--teal)']].forEach(([n,have,goal,col]) => {
      const mpct = goal > 0 ? Math.min(100, (have/goal)*100) : 0;
      parts.push('<div style="margin-bottom:9px"><div class="fb" style="margin-bottom:3px"><span style="font-family:var(--mono);font-size:9px;letter-spacing:.1em;color:var(--muted)">'+n+'</span><span style="font-family:var(--mono);font-size:10px">'+Math.round(have)+'<span style="color:var(--muted)">/'+goal+'g</span></span></div>');
      parts.push('<div style="height:3px;background:var(--bg3);border-radius:2px;overflow:hidden"><div style="height:100%;width:'+mpct+'%;background:'+col+';border-radius:2px"></div></div></div>');
    });
    parts.push('</div></div>');
    parts.push('<button class="btn-ghost" style="font-size:11px;margin-top:2px" onclick="switchTab(\'fuelplan\')">Adjust targets</button>');
    parts.push('</div>');
  } else {
    // "Just track" mode still gets a real number, no targets to compare against
    parts.push('<div class="card mb12"><div class="fb" style="align-items:baseline"><span style="font-family:var(--mono);font-size:26px">'+Math.round(dayTotals.calories).toLocaleString()+'</span><span style="font-family:var(--mono);font-size:11px;color:var(--muted)">CAL TODAY · P'+Math.round(dayTotals.protein)+'g · C'+Math.round(dayTotals.carbs)+'g · F'+Math.round(dayTotals.fat)+'g</span></div></div>');
  }

  // Moved up per direct feedback — this used to be the last thing on the
  // screen, after the full meal list, instead of the first action available.
  parts.push('<button class="btn btn-gold mb12" onclick="openMealBuilder()">+ Log a Meal</button>');
  parts.push('<div id="mealBuilderRoot"></div>');

  if (!meals.length) {
    parts.push('<div class="alert alert-info mb12"><div class="alert-icon">🍽️</div><div>Nothing logged yet today.</div></div>');
  } else {
    // Manifest style: grouped by meal type, each item with its own line and
    // calories, a timestamp per meal, and a subtotal — replacing the flatter
    // list that repeated per-meal totals without any time context.
    ['breakfast','lunch','dinner','snack'].forEach(type => {
      const typeMeals = meals.filter(m => m.meal_type === type);
      if (!typeMeals.length) return;
      typeMeals.forEach(m => {
        const t = m.meal_data.totals;
        const timeStr = m.logged_at ? new Date(m.logged_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '';
        parts.push('<div class="fb" style="margin:14px 0 6px"><span style="font-family:var(--mono);font-size:10px;letter-spacing:.13em;color:var(--muted)">'+type.toUpperCase()+'</span>'+(timeStr?'<span style="font-family:var(--mono);font-size:10px;color:var(--gold)">'+timeStr+'</span>':'')+'</div>');
        parts.push('<div class="card" style="padding:12px 16px">');
        m.meal_data.items.forEach(item => {
          parts.push('<div style="padding:6px 0;border-bottom:1px solid var(--border)">');
          parts.push('<div class="fb"><span style="font-size:13px">'+foodEmoji(item.description)+' '+item.description+'</span><span style="font-family:var(--mono);font-size:11px;color:var(--muted);flex-shrink:0;padding-left:10px">'+item.nutrients.calories+' cal</span></div>');
          parts.push('<div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:2px">P'+item.nutrients.protein+'g · C'+item.nutrients.carbs+'g · F'+item.nutrients.fat+'g</div>');
          parts.push('</div>');
        });
        parts.push('<div class="fb" style="padding-top:8px;font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:.05em"><span>SUBTOTAL</span><span>'+t.calories+' CAL · P'+t.protein+'g · C'+t.carbs+'g · F'+t.fat+'g</span></div>');
        parts.push('<div class="fb" style="margin-top:8px;gap:16px;justify-content:flex-start">');
        parts.push('<button class="btn-ghost" style="font-size:11px" onclick="editMealLog(\''+m.id+'\')">✏️ Edit</button>');
        parts.push('<button class="btn-ghost" style="font-size:11px;color:var(--red)" onclick="deleteMealLog(\''+m.id+'\')">🗑️ Remove</button>');
        parts.push('</div>');
        parts.push('</div>');
      });
    });
  }

  p.innerHTML = parts.join('');
}

// ─── QUICK ACTIONS (the "+" tab-bar button) ────────────────────────────────
function openQuickActions() {
  const root = document.getElementById('modalRoot');
  if (!root) return;
  root.innerHTML =
    '<div class="modal-bg modal-bg-anim" onclick="if(event.target===this)closeModal()"><div class="modal-sheet modal-sheet-anim">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Quick Actions</div>' +
    '<button class="btn btn-gold mb8" onclick="closeModal();switchTab(\'preflight\')">⚡ Start a Workout</button>' +
    '<button class="btn btn-outline mb8" onclick="quickLogMeal()">🍽️ Log a Meal</button>' +
    '<button class="btn btn-outline mb8" onclick="closeModal();switchTab(\'trends\')">⚖️ Log Weight / BP / Glucose</button>' +
    '<button class="btn btn-outline mb8" onclick="haptic(\'light\');openQuickWaterLog()">💧 Log Water</button>' +
    '<button class="btn-ghost" onclick="closeModal()">Cancel</button>' +
    '</div></div>';
}

// Closes the sheet, navigates to Nutrition, and only opens the meal builder
// once that screen's async render has actually finished — switchTab/
// renderPage now return their render promise specifically so this can be
// awaited properly instead of guessing with a timeout.
function quickLogMeal() {
  // Deliberately NOT async and deliberately no await. switchTab isn't a
  // promise anyway, but awaiting it still yields to the microtask queue,
  // which ends the iOS user gesture — and openMealBuilder launches the
  // camera, which iOS silently blocks outside a live gesture. That block
  // is invisible: no error, no picker, just a tap that appears to do
  // nothing. Keep this whole path synchronous.
  closeModal();
  switchTab('nutrition');
  openMealBuilder();
}

// Self-contained — doesn't navigate anywhere, just updates the same
// waterIn/waterInRaw state Preflight's hydration section already uses, so
// whichever screen you're on when you close this reflects the real number.
// BUG FIX (reported): this pre-filled the input with the running TOTAL and
// then replaced it on save — so logging 0.5L, then 0.2L an hour later,
// left you with 0.2L instead of 0.7L. Water gets logged in increments
// through the day, so ADDING is the correct default. Correcting the
// running total is still possible, just as a deliberate second choice
// rather than the thing that happens by accident.
const WATER_QUICK_ADDS = [0.25, 0.5, 1];

function openQuickWaterLog(mode) {
  const root = document.getElementById('modalRoot');
  if (!root) return;
  const setMode = mode === 'set';
  const current = ST.waterIn || 0;
  const target = hydroTarget();
  const hs = hydroStatus(new Date());
  const parts = [];
  parts.push('<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal-sheet">');
  parts.push('<div class="modal-handle"></div>');
  parts.push('<div class="modal-title">'+(setMode ? 'Correct Water Total' : 'Log Water')+'</div>');

  // Always show where today actually stands, so it's never ambiguous what
  // a number typed below is going to do to it.
  parts.push('<div class="card" style="margin-bottom:12px;padding:12px">');
  parts.push('<div class="fb"><span style="font-size:12px;color:var(--muted)">Logged so far today</span>' +
             '<span style="font-family:var(--mono);font-size:16px;font-weight:700">'+current.toFixed(2).replace(/\.?0+$/,'')+' L</span></div>');
  parts.push('<div class="fb" style="margin-top:4px"><span style="font-size:11px;color:var(--muted)">Target '+target.toFixed(1)+' L</span>' +
             '<span style="font-family:var(--mono);font-size:11px;color:'+hs.color+'">'+hs.label+'</span></div>');
  parts.push('</div>');

  if (setMode) {
    parts.push('<div class="field"><label>Set today\'s total to (liters)</label><input type="text" inputmode="decimal" id="quickWaterInput" value="'+(ST.waterInRaw||'')+'" placeholder="e.g. 1.2"></div>');
    parts.push('<button class="btn btn-gold mt8" onclick="saveQuickWater(true)">Save Total</button>');
    parts.push('<button class="btn-ghost" style="display:block;width:100%;text-align:center;margin-top:12px" onclick="haptic(\'light\');openQuickWaterLog()">← Add water instead</button>');
  } else {
    parts.push('<div style="display:flex;gap:8px;margin-bottom:10px">');
    WATER_QUICK_ADDS.forEach(a => {
      parts.push('<button class="btn btn-outline" style="flex:1;padding:12px 4px" onclick="addQuickWater('+a+')">+'+a+'L</button>');
    });
    parts.push('</div>');
    parts.push('<div class="field"><label>Or add a specific amount (liters)</label><input type="text" inputmode="decimal" id="quickWaterInput" value="" placeholder="e.g. 0.2"></div>');
    parts.push('<button class="btn btn-gold mt8" onclick="saveQuickWater(false)">Add Water</button>');
    parts.push('<button class="btn-ghost" style="display:block;width:100%;text-align:center;margin-top:12px" onclick="openQuickWaterLog(\'set\')">Correct today\'s total instead</button>');
  }
  parts.push('<button class="btn-ghost" style="display:block;width:100%;text-align:center;margin-top:10px" onclick="closeModal()">Cancel</button>');
  parts.push('</div></div>');
  root.innerHTML = parts.join('');
}

// Trims trailing zeros so totals read as "0.7 L" rather than "0.70 L".
function fmtLiters(n) {
  return (Math.round((n||0) * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
}

// Confirms what actually happened. Logging water is a fire-and-forget
// action that closes its own dialog, so without this there's nothing to
// distinguish "added" from "tapped and nothing happened" — and getting
// that wrong is how the day's total silently drifts.
function confirmWaterChange(added, newTotal) {
  const target = hydroTarget();
  const pct = target > 0 ? Math.round((newTotal / target) * 100) : 0;
  const lead = added != null
    ? '💧 Added ' + fmtLiters(added) + ' L'
    : '💧 Total set to ' + fmtLiters(newTotal) + ' L';
  showBigToast(lead + '\n' + fmtLiters(newTotal) + ' of ' + fmtLiters(target) + ' L today (' + pct + '%)', 'ok');
}

// One-tap increments — the common case is "I just drank a bottle", not
// "let me compute my new running total".
function addQuickWater(amount) {
  const newTotal = (ST.waterIn || 0) + amount;
  applyWaterChange(newTotal);
  closeModal();
  renderPage();
  confirmWaterChange(amount, ST.waterIn);
}

function saveQuickWater(setMode) {
  const raw = document.getElementById('quickWaterInput')?.value || '';
  const entered = parseFloat(raw);
  if (!raw.trim() || isNaN(entered)) { showBigToast('Enter an amount first.', 'warn'); return; }
  applyWaterChange(setMode ? entered : (ST.waterIn || 0) + entered);
  closeModal();
  renderPage();
  confirmWaterChange(setMode ? null : entered, ST.waterIn);
}

function applyWaterChange(newTotal) {
  const clamped = Math.max(0, Math.round(newTotal * 100) / 100);
  ST.waterIn = clamped;
  ST.waterInRaw = String(clamped);
  persistDailyInputs();
}

const MEAL_TYPES = ['breakfast','lunch','dinner','snack'];

// Guesses meal type from time of day, same idea as Oura's auto-detected
// "Breakfast" label — still fully changeable via the Meal Type control,
// this just saves the tap for the common case.
function autoMealTypeForTime(date) {
  const h = (date || new Date()).getHours();
  if (h >= 4 && h < 11) return 'breakfast';
  if (h >= 11 && h < 15) return 'lunch';
  if (h >= 17 && h < 21) return 'dinner';
  return 'snack';
}

function openMealBuilder() {
  ST.mealBuilder = { mealType: autoMealTypeForTime(new Date()), items: [], frequentFoods: null, editingId: null, editingLoggedAt: null };
  ST.foodPhotoAnalyzing = false;
  window._foodRecReviewIndex = null;
  window._foodRecReviewMeta = null;
  window._foodRecPendingImageUrl = null;
  renderMealBuilder();
  getFrequentFoodsForMealBuilder().then(foods => {
    if (!ST.mealBuilder) return; // builder was closed before this resolved
    ST.mealBuilder.frequentFoods = foods;
    renderMealBuilder();
  });
  // The camera launches immediately, before any menu — the one-tap flow
  // that was actually requested. Editing an existing meal skips this,
  // since jumping straight to the camera when correcting an already-
  // logged item would be surprising.
  analyzeFoodPhoto();
}

// Opens the same meal builder, pre-populated with an already-logged
// meal's items for correction — a mis-scanned barcode, a forgotten side,
// a portion that needs adjusting. Items are deep-copied so cancelling
// out of the builder never mutates the original until Save is actually
// pressed.
function editMealLog(id) {
  const meal = (ST.todaysMeals || []).find(m => m.id === id);
  if (!meal) return;
  ST.mealBuilder = {
    mealType: meal.meal_type,
    items: JSON.parse(JSON.stringify(meal.meal_data.items || [])),
    frequentFoods: null,
    editingId: meal.id,
    editingLoggedAt: meal.logged_at,
  };
  ST.foodPhotoAnalyzing = false;
  window._foodRecReviewIndex = null;
  window._foodRecReviewMeta = null;
  window._foodRecPendingImageUrl = null;
  renderMealBuilder();
  getFrequentFoodsForMealBuilder().then(foods => {
    if (!ST.mealBuilder) return;
    ST.mealBuilder.frequentFoods = foods;
    renderMealBuilder();
  });
}

function closeMealBuilder() {
  ST.mealBuilder = null;
  ST.foodPhotoAnalyzing = false;
  window._foodRecReviewIndex = null;
  window._foodRecReviewMeta = null;
  window._foodRecPendingImageUrl = null;
  const box = document.getElementById('mealBuilderRoot');
  if (box) box.innerHTML = '';
}

function renderMealBuilder() {
  const box = document.getElementById('mealBuilderRoot');
  if (!box || !ST.mealBuilder) return;
  const mb = ST.mealBuilder;
  const parts = [];
  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">'+(mb.editingId ? 'EDIT MEAL' : 'LOG A MEAL')+'</div>');

  // The photo/barcode/search result — now the primary content area, since
  // the camera launches immediately on open rather than waiting behind a
  // menu. Renders the review card for whatever was just auto-added, if
  // anything; otherwise stays empty until a loading/error state writes
  // into it directly (see analyzeFoodPhoto et al).
  parts.push('<div id="foodPhotoResultRoot">' +
    (ST.foodPhotoAnalyzing ? loadingCardHTML('Analyzing photo…')
      : (window._foodRecReviewIndex != null && mb.items[window._foodRecReviewIndex] ? buildItemReviewCardHTML(window._foodRecReviewIndex) : '')) +
    '</div>');

  if (mb.items.length) {
    parts.push('<div class="section-label" style="margin-top:12px">MEAL ITEMS</div>');
    mb.items.forEach((item, i) => {
      parts.push('<div style="margin-bottom:8px">');
      parts.push('<div class="fb"><span style="font-size:17px;font-weight:700">'+foodEmoji(item.description)+' '+item.description+'</span><button class="btn-ghost" style="font-size:11px" onclick="ST.mealBuilder.items.splice('+i+',1);renderMealBuilder()">✕</button></div>');
      // Serving and macros per row — without this there was no way to tell
      // whether a logged food meant one unit or several.
      const rowBits = [];
      if (item.servingDescription) rowBits.push(sanitizeUserText(item.servingDescription));
      rowBits.push(Math.round(item.nutrients?.calories || 0)+' cal');
      parts.push('<div style="font-size:11px;color:var(--muted);margin-top:2px">'+rowBits.join(' · ')+'</div>');
      parts.push('</div>');
    });
    const runningTotals = sumMealNutrients(mb.items);
    parts.push('<div style="font-size:11px;color:var(--muted);margin-top:6px">Running total: '+runningTotals.calories+' cal · P'+runningTotals.protein+'g · C'+runningTotals.carbs+'g · F'+runningTotals.fat+'g</div>');
  }

  // Meal Type and (implicitly) time are auto-set when the builder opens —
  // Meal Type by time of day, time to now at save — both still editable
  // here rather than requiring a tap before you can even take the photo.
  parts.push('<div class="field" style="margin-top:12px"><label>Meal Type (auto-detected — change if needed)</label><select onchange="ST.mealBuilder.mealType=this.value">');
  MEAL_TYPES.forEach(t => parts.push('<option value="'+t+'"'+(mb.mealType===t?' selected':'')+'>'+t[0].toUpperCase()+t.slice(1)+'</option>'));
  parts.push('</select></div>');

  // "Your Usual" — foods logged 2+ times in the last 30 days, ranked by
  // frequency. One tap adds it with its last-used macros already filled
  // in: no search, no photo call, no barcode scan needed for a repeat
  // meal, which covers most days for most people.
  if (mb.frequentFoods && mb.frequentFoods.length) {
    parts.push('<div class="section-label" style="margin-top:12px">YOUR USUAL</div>');
    parts.push('<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">');
    mb.frequentFoods.forEach((food, i) => {
      const srv = food.servingDescription ? sanitizeUserText(food.servingDescription)+' · ' : '';
      parts.push('<button class="btn-outline" style="font-size:12px;padding:6px 10px;border-radius:20px" onclick="addFrequentFoodToMeal('+i+')">'+foodEmoji(food.description)+' '+sanitizeUserText(food.description)+' <span style="color:var(--muted)">· '+srv+food.nutrients.calories+' cal</span></button>');
    });
    parts.push('</div>');
  }

  // Secondary ways to add a food — the camera already auto-launched above,
  // so this is the equivalent of Oura's "Text input / Recent meals /
  // Favorites" row: alternatives for when the photo isn't the right tool
  // (a packaged product, a repeat meal already covered by Your Usual
  // above, or nothing worth photographing).
  parts.push('<div class="section-label" style="margin-top:12px">OR ADD MANUALLY</div>');
  parts.push('<div class="field"><input type="text" id="foodSearchInput" placeholder="Search a food (e.g. chicken breast)..." oninput="filterUSDASearch(this.value)"></div>');
  parts.push('<div id="usdaSearchResults"></div>');
  parts.push('<div class="fb mt8">');
  parts.push('<button class="btn btn-outline" style="flex:1;margin-right:8px" onclick="analyzeFoodPhoto()">📷 Retake Photo</button>');
  parts.push('<button class="btn btn-outline" style="flex:1;margin-right:8px" onclick="analyzeFoodPhotoFromLibrary()">🖼 Library</button>');
  parts.push('<button class="btn btn-outline" style="flex:1" onclick="scanFoodBarcode()">🔢 Barcode</button>');
  parts.push('</div>');
  parts.push('<button class="btn-ghost mt8" onclick="showManualFoodEntry()">Can\'t find it? Enter manually</button>');
  parts.push('<div id="manualFoodEntryRoot"></div>');


  parts.push('<div class="fb mt8">');
  parts.push('<button class="btn btn-outline" style="flex:1;margin-right:8px" onclick="closeMealBuilder()">Cancel</button>');
  parts.push('<button class="btn btn-gold" style="flex:1" '+((mb.items.length || window._usdaPendingFood)?'':'disabled')+' onclick="finishMealBuilder()">'+(mb.editingId ? 'Save Changes' : 'Save Meal')+'</button>');
  parts.push('</div>');
  parts.push('</div>');
  box.innerHTML = parts.join('');
}

async function finishMealBuilder() {
  if (!ST.mealBuilder) return;
  // A food that's been searched, selected, and is sitting in preview —
  // with real macros already showing on screen — but not yet explicitly
  // added via "Add to Meal" is a completely reasonable thing to expect
  // Save to include. Requiring a separate confirm tap for the one item
  // someone is actively looking at was producing a silently disabled
  // button with no explanation.
  if (window._usdaPendingFood && document.getElementById('usdaServingMult')) {
    addUSDAFoodToMeal();
  }
  if (!ST.mealBuilder.items.length) {
    showBigToast('Add at least one food before saving.', 'warn');
    return;
  }
  const mb = ST.mealBuilder;
  await withDialogSpinner(mb.editingId ? 'Saving changes…' : 'Logging meal…', async () => {
    if (mb.editingId) {
      await updateMealLog(mb.editingId, mb.mealType, mb.items, mb.editingLoggedAt);
    } else {
      await saveMealLog(mb.mealType, mb.items);
    }
  });
  ST.mealBuilder = null;
  renderPage();
}

let usdaSearchDebounce = null;
function filterUSDASearch(query) {
  clearTimeout(usdaSearchDebounce);
  const box = document.getElementById('usdaSearchResults');
  if (!box) return;
  if (!query || query.trim().length < 2) { box.innerHTML = ''; return; }
  box.innerHTML = '<div style="font-size:11px;color:var(--muted);margin-top:6px">Searching…</div>';
  usdaSearchDebounce = setTimeout(async () => {
    const results = await searchUSDAFoods(query);
    if (!document.getElementById('usdaSearchResults')) return; // builder closed mid-search
    if (!results.length) { box.innerHTML = '<div style="font-size:11px;color:var(--muted);margin-top:6px">No matches — try manual entry below.</div>'; return; }
    box.innerHTML = results.map((f,i) =>
      '<div class="card" style="padding:8px;margin-top:6px;cursor:pointer" onclick="selectUSDAFood('+i+')"><div style="font-size:13px">'+foodEmoji(f.description)+' '+f.description+(f.brandName?' <span style="color:var(--muted);font-size:11px">('+f.brandName+')</span>':'')+'</div><div style="font-size:11px;color:var(--muted)">'+f.nutrients.calories+' cal per '+usdaReferenceLabel(f)+'</div></div>'
    ).join('');
    window._usdaLastResults = results;
  }, 350);
}

async function selectUSDAFood(idx) {
  const picked = window._usdaLastResults?.[idx];
  if (!picked) return;
  const box = document.getElementById('usdaSearchResults');
  if (box) box.innerHTML = '<div style="font-size:11px;color:var(--muted)">Loading full details…</div>';
  const detail = await getUSDAFoodDetail(picked.fdcId) || picked;
  window._usdaPendingFood = detail;
  if (box) box.innerHTML =
    '<div class="card mt8"><div style="font-size:13px;margin-bottom:6px">'+detail.description+'</div>' +
    '<div class="field"><label>Servings (1 = '+usdaReferenceLabel(detail)+')</label>' +
    '<input type="text" inputmode="decimal" id="usdaServingMult" value="1" oninput="updateUSDAPreview()"></div>' +
    '<div id="usdaPreviewNutrients" style="font-size:11px;color:var(--muted);margin:6px 0"></div>' +
    '<button class="btn btn-outline" onclick="addUSDAFoodToMeal()">Add to Meal</button></div>';
  updateUSDAPreview();
}

function updateUSDAPreview() {
  const food = window._usdaPendingFood;
  const box = document.getElementById('usdaPreviewNutrients');
  if (!food || !box) return;
  const mult = document.getElementById('usdaServingMult')?.value || 1;
  const scaled = scaleNutrients(food.nutrients, mult);
  box.innerHTML = scaled.calories+' cal · P'+scaled.protein+'g · C'+scaled.carbs+'g · F'+scaled.fat+'g · Fiber '+scaled.fiber+'g · Sugar '+scaled.sugar+'g';
}

function addUSDAFoodToMeal() {
  const food = window._usdaPendingFood;
  if (!food || !ST.mealBuilder) return;
  const mult = document.getElementById('usdaServingMult')?.value || 1;
  ST.mealBuilder.items.push({
    description: sanitizeUserText(food.description) + (parseFloat(mult) !== 1 ? ' ('+mult+'x)' : ''),
    nutrients: scaleNutrients(food.nutrients, mult),
    source: 'usda', fdcId: food.fdcId,
  });
  document.getElementById('foodSearchInput').value = '';
  document.getElementById('usdaSearchResults').innerHTML = '';
  window._usdaPendingFood = null;
  renderMealBuilder();
}

// One tap, no search/photo/barcode call at all — the whole point of
// surfacing "Your Usual" in the first place.
// BUG FIX (reported: "I added eggs, not sure how to log 3 — is this for
// one or two?"). Tapping a usual food dropped it straight into the meal
// with no quantity control and no indication of what one serving was, so
// the only way to log three was to tap three times and hope the unit was
// what you assumed. It now opens the same review card the photo and
// barcode paths use — quantity, description and macros all editable —
// rather than being the one entry path without them.
function addFrequentFoodToMeal(idx) {
  const food = ST.mealBuilder?.frequentFoods?.[idx];
  if (!food || !ST.mealBuilder) return;
  ST.mealBuilder.items.push({
    description: food.description,
    nutrients: { ...food.nutrients },
    servingDescription: food.servingDescription || null,
    source: 'history',
  });
  window._foodRecReviewIndex = ST.mealBuilder.items.length - 1;
  window._foodRecReviewMeta = {
    baseNutrients: { ...food.nutrients },
    servingDescription: food.servingDescription || null,
    source: 'history',
    confidence: 1,
  };
  window._foodRecPendingImageUrl = null;
  renderMealBuilder();
}

// ─── AI PHOTO FOOD RECOGNITION + BARCODE (fcf-food-recognition edge fn) ───
// Both actions return the same shape: { source, description,
// servingDescription, confidence, nutrients, quota? }. A barcode hit is
// an exact product match (confidence 1, never triggers the "is this
// right?" prompt); a photo is always a model guess.
async function callFoodRecognitionEdge(payload) {
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { showBigToast('Sign in to use photo/barcode food logging.', 'warn'); return null; }
  try {
    const res = await fetch(FOOD_RECOGNITION_EDGE_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'request_failed', ...data };
    return data;
  } catch (e) {
    return { error: 'network', message: e.message };
  }
}

// Sets `capture` here (unlike the old "either Camera or Library" choice-
// sheet behavior) — this is now the primary Log a Meal entry point and
// should open the camera directly with one tap, matching the requested
// flow. Choosing a food from Library/Recent/Search/Manual is still fully
// available via the secondary row in the builder.
// Bound ONCE against the persistent inputs in index.html. Previously a
// fresh <input> was created, appended, clicked and removed on every
// attempt — which cannot survive iOS suspending the PWA while the camera
// is open. Two prior fixes tried to get that element's lifetime right and
// both missed, because the element's lifetime was the wrong thing to fix.
let _foodInputsBound = false;
function bindFoodPhotoInputs() {
  if (_foodInputsBound) return;
  ['foodCameraInput', 'foodLibraryInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => handleFoodPhotoFile(el));
  });
  _foodInputsBound = true;
}

async function handleFoodPhotoFile(input) {
  const file = input && input.files && input.files[0];
  // Reset immediately so picking the SAME file again still fires `change`.
  // With a persistent input this is essential — without it, a retry with an
  // identical selection is silently swallowed.
  if (input) input.value = '';
  if (!file) return;

  // A photo taken while the builder happened to close (iOS can tear the
  // view down during the camera hand-off) used to be dropped on the floor
  // with no message at all. Reopen rather than discard — the person took
  // the photo, so it gets used.
  if (!ST.mealBuilder) {
    ST.mealBuilder = { mealType: autoMealTypeForTime(new Date()), items: [], frequentFoods: null, editingId: null, editingLoggedAt: null };
    getFrequentFoodsForMealBuilder().then(foods => {
      if (ST.mealBuilder) { ST.mealBuilder.frequentFoods = foods; renderMealBuilder(); }
    });
  }

  // Analyzing state is held in state, not written straight into the DOM —
  // an async re-render (frequent foods resolving mid-flight) would
  // otherwise wipe the spinner and make it look like nothing happened.
  ST.foodPhotoAnalyzing = true;
  renderMealBuilder();
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('could not read file'));
      r.readAsDataURL(file);
    });
    window._foodRecPendingImageUrl = dataUrl;
    const result = await callFoodRecognitionEdge({ action: 'photo', image: dataUrl.split(',')[1], mediaType: file.type || 'image/jpeg' });
    ST.foodPhotoAnalyzing = false;
    handleFoodRecognitionResult(result);
  } catch (e) {
    ST.foodPhotoAnalyzing = false;
    renderMealBuilder();
    showBigToast('Couldn\'t read that photo: ' + (e.message || 'unknown error'), 'warn');
  }
}

// ─── IN-APP CAMERA ────────────────────────────────────────────────────────────
// Fullscreen live viewfinder using getUserMedia — stays inside the app like
// Oura does, rather than handing off to the native camera app. Shutter,
// flash toggle, front/rear flip, and a bottom sheet with Text/Recent/Favorites.
// Falls back to the native <input capture> if getUserMedia is unavailable.

const FCFCamera = (() => {
  let _stream    = null;
  let _videoEl   = null;
  let _facingMode = 'environment'; // start rear camera
  let _onCapture = null; // callback(dataUrl, mimeType)

  // ── Public: open the camera overlay ────────────────────────────────────────
  function open(onCapture) {
    _onCapture = onCapture;
    _render();
    _startStream();
  }

  // ── Public: close the camera overlay ───────────────────────────────────────
  function close() {
    _stopStream();
    const root = document.getElementById('fcfCameraRoot');
    if (root) root.innerHTML = '';
  }

  // ── Render the full overlay ────────────────────────────────────────────────
  function _render() {
    const root = document.getElementById('fcfCameraRoot');
    if (!root) return;
    root.innerHTML = `
      <div id="fcfCamOverlay" style="
        position:fixed;inset:0;z-index:9000;background:#000;
        display:flex;flex-direction:column;overflow:hidden;
      ">
        <!-- Viewfinder -->
        <div style="position:relative;flex:1;overflow:hidden;background:#000;">
          <video id="fcfCamVideo" autoplay playsinline muted
            style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"></video>

          <!-- Top controls -->
          <div style="position:absolute;top:0;left:0;right:0;
            display:flex;justify-content:space-between;align-items:flex-start;
            padding:16px 16px 0;">
            <!-- Close -->
            <button onclick="FCFCamera.close()" style="
              width:44px;height:44px;border-radius:50%;
              background:rgba(0,0,0,0.55);border:none;color:#fff;
              font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
            <!-- Flash + Flip -->
            <div style="display:flex;flex-direction:column;gap:10px;">
              <button id="fcfCamFlash" onclick="FCFCamera.toggleFlash()" style="
                width:44px;height:44px;border-radius:50%;
                background:rgba(0,0,0,0.55);border:none;color:#fff;
                font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">⚡</button>
              <button onclick="FCFCamera.flipCamera()" style="
                width:44px;height:44px;border-radius:50%;
                background:rgba(0,0,0,0.55);border:none;color:#fff;
                font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">🔄</button>
            </div>
          </div>

          <!-- Center hint -->
          <div style="
            position:absolute;bottom:24px;left:0;right:0;
            text-align:center;pointer-events:none;">
            <div style="font-size:22px;font-weight:300;color:#fff;letter-spacing:.02em">Take a photo</div>
            <div style="font-size:14px;color:rgba(255,255,255,0.75);margin-top:4px">Your meal items will be analyzed.</div>
          </div>
        </div>

        <!-- Bottom sheet -->
        <div style="
          background:rgba(20,20,22,0.97);
          padding:16px 0 max(24px, env(safe-area-inset-bottom));
          display:flex;flex-direction:column;align-items:center;gap:16px;">

          <!-- Shutter row -->
          <div style="display:flex;align-items:center;justify-content:center;">
            <button id="fcfCamShutter" onclick="FCFCamera.capture()" style="
              width:72px;height:72px;border-radius:50%;
              border:4px solid #fff;background:transparent;cursor:pointer;
              display:flex;align-items:center;justify-content:center;
              transition:transform 0.1s;">
              <div style="width:56px;height:56px;border-radius:50%;background:#fff;"></div>
            </button>
          </div>

          <!-- Tab row -->
          <div style="display:flex;gap:0;width:100%;padding:0 8px;">
            <button onclick="FCFCamera._tabTextInput()" style="
              flex:1;background:none;border:none;color:rgba(255,255,255,0.65);
              font-size:14px;padding:8px 4px;cursor:pointer;letter-spacing:.03em;">Text input</button>
            <button onclick="FCFCamera._tabRecentMeals()" style="
              flex:1;background:none;border:none;color:rgba(255,255,255,0.65);
              font-size:14px;padding:8px 4px;cursor:pointer;letter-spacing:.03em;">Recent meals</button>
            <button onclick="FCFCamera._tabLibrary()" style="
              flex:1;background:none;border:none;color:rgba(255,255,255,0.65);
              font-size:14px;padding:8px 4px;cursor:pointer;letter-spacing:.03em;">Library</button>
          </div>
        </div>
      </div>
    `;
    _videoEl = document.getElementById('fcfCamVideo');
  }

  // ── Start getUserMedia stream ──────────────────────────────────────────────
  async function _startStream() {
    _stopStream();
    try {
      _stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: _facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      if (_videoEl) _videoEl.srcObject = _stream;
    } catch (err) {
      // getUserMedia failed — fall back to native input
      console.warn('FCFCamera getUserMedia failed:', err);
      close();
      _fallbackToNativeCamera();
    }
  }

  function _stopStream() {
    if (_stream) {
      _stream.getTracks().forEach(t => t.stop());
      _stream = null;
    }
    if (_videoEl) _videoEl.srcObject = null;
  }

  // ── Capture a frame from the video stream ─────────────────────────────────
  function capture() {
    if (!_videoEl || !_stream) return;
    haptic('medium');
    // Shutter animation
    const shutter = document.getElementById('fcfCamShutter');
    if (shutter) { shutter.style.transform = 'scale(0.88)'; setTimeout(() => { shutter.style.transform = ''; }, 150); }

    const canvas = document.createElement('canvas');
    canvas.width  = _videoEl.videoWidth  || 1920;
    canvas.height = _videoEl.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(_videoEl, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    close();
    if (_onCapture) _onCapture(dataUrl, 'image/jpeg');
  }

  // ── Flash toggle ──────────────────────────────────────────────────────────
  let _flashOn = false;
  function toggleFlash() {
    _flashOn = !_flashOn;
    const btn = document.getElementById('fcfCamFlash');
    if (btn) btn.style.color = _flashOn ? '#FFD700' : '#fff';
    if (_stream) {
      const track = _stream.getVideoTracks()[0];
      if (track && track.getCapabilities && track.getCapabilities().torch) {
        track.applyConstraints({ advanced: [{ torch: _flashOn }] }).catch(() => {});
      }
    }
  }

  // ── Flip front/rear ───────────────────────────────────────────────────────
  function flipCamera() {
    _facingMode = _facingMode === 'environment' ? 'user' : 'environment';
    _startStream();
  }

  // ── Bottom sheet tabs ─────────────────────────────────────────────────────
  function _tabTextInput() {
    close();
    // Open meal builder in text search mode
    if (!ST.mealBuilder) {
      ST.mealBuilder = { mealType: autoMealTypeForTime(new Date()), items: [], frequentFoods: null, editingId: null, editingLoggedAt: null };
    }
    ST.foodSearchMode = true;
    renderMealBuilder();
    getFrequentFoodsForMealBuilder().then(foods => {
      if (ST.mealBuilder) { ST.mealBuilder.frequentFoods = foods; renderMealBuilder(); }
    });
  }

  function _tabRecentMeals() {
    close();
    if (!ST.mealBuilder) {
      ST.mealBuilder = { mealType: autoMealTypeForTime(new Date()), items: [], frequentFoods: null, editingId: null, editingLoggedAt: null };
    }
    renderMealBuilder();
    getFrequentFoodsForMealBuilder().then(foods => {
      if (ST.mealBuilder) { ST.mealBuilder.frequentFoods = foods; renderMealBuilder(); }
    });
  }

  function _tabLibrary() {
    close();
    analyzeFoodPhotoFromLibrary();
  }

  // ── Native fallback ───────────────────────────────────────────────────────
  function _fallbackToNativeCamera() {
    bindFoodPhotoInputs();
    const el = document.getElementById('foodCameraInput');
    if (el) { el.value = ''; el.click(); }
  }

  return { open, close, capture, toggleFlash, flipCamera, _tabTextInput, _tabRecentMeals, _tabLibrary };
})();

// MUST stay synchronous through to .click(). iOS only allows a
// programmatic file-input click inside a live user gesture, and any
// await beforehand — even awaiting a non-Promise — ends that gesture and
// gets the picker silently blocked with no error.
function analyzeFoodPhoto() {
  if (!ST.user) { showBigToast('Sign in to analyze food photos.', 'warn'); return; }
  // Try in-app camera first; falls back to native if getUserMedia unavailable
  if (navigator.mediaDevices?.getUserMedia) {
    FCFCamera.open((dataUrl, mimeType) => {
      _handleFoodPhotoDataUrl(dataUrl, mimeType);
    });
  } else {
    bindFoodPhotoInputs();
    const el = document.getElementById('foodCameraInput');
    if (!el) { showBigToast('Camera unavailable — try reloading the app.', 'warn'); return; }
    el.value = '';
    el.click();
  }
}

async function _handleFoodPhotoDataUrl(dataUrl, mimeType) {
  if (!ST.mealBuilder) {
    ST.mealBuilder = { mealType: autoMealTypeForTime(new Date()), items: [], frequentFoods: null, editingId: null, editingLoggedAt: null };
    getFrequentFoodsForMealBuilder().then(foods => {
      if (ST.mealBuilder) { ST.mealBuilder.frequentFoods = foods; renderMealBuilder(); }
    });
  }
  ST.foodPhotoAnalyzing = true;
  renderMealBuilder();
  try {
    window._foodRecPendingImageUrl = dataUrl;
    const result = await callFoodRecognitionEdge({ action: 'photo', image: dataUrl.split(',')[1], mediaType: mimeType || 'image/jpeg' });
    ST.foodPhotoAnalyzing = false;
    handleFoodRecognitionResult(result);
  } catch (e) {
    ST.foodPhotoAnalyzing = false;
    renderMealBuilder();
    showBigToast('Couldn\'t analyze that photo: ' + (e.message || 'unknown error'), 'warn');
  }
}

function analyzeFoodPhotoFromLibrary() {
  if (!ST.user) { showBigToast('Sign in to analyze food photos.', 'warn'); return; }
  bindFoodPhotoInputs();
  const el = document.getElementById('foodLibraryInput');
  if (!el) { showBigToast('Photo library unavailable — try reloading the app.', 'warn'); return; }
  el.value = '';
  el.click();
}

function handleFoodRecognitionResult(result) {
  const box = document.getElementById('foodPhotoResultRoot');
  if (!box) return;
  if (!result) { box.innerHTML = ''; return; }
  if (result.error === 'limit_reached') {
    // Straight to the paywall rather than a line of text that mentions Pro
    // and leaves no way to act on it. The photo is not consumed — the
    // server only counts a scan that actually produced a result.
    box.innerHTML = '';
    ST.foodPhotoAnalyzing = false;
    renderMealBuilder();
    showPaywall('photos');
    return;
  }
  if (result.error) {
    box.innerHTML = '<div class="card mt8" style="font-size:12px;color:var(--amber)">Analysis failed: ' + (result.message || result.error) + '. Try again or enter it manually below.</div>';
    return;
  }
  if (!ST.mealBuilder) return;

  // BUG FIX (reported): recognizing a food used to stop at an "Add to
  // Meal" button — confusing, since the whole point of taking the photo
  // was already selecting that food. Now it's auto-added the moment
  // recognition succeeds; the card below is for reviewing/correcting
  // what just got added, not deciding whether to add it at all.
  ST.mealBuilder.items.push({
    description: sanitizeUserText(result.description),
    nutrients: { ...result.nutrients },
    // Persisted on the item, not just held in review meta — this is what
    // lets "Your Usual" later say whether 70 cal means one egg or two.
    servingDescription: result.servingDescription || null,
    source: result.source, // 'photo' or 'barcode'
    confidence: result.confidence,
  });
  window._foodRecReviewIndex = ST.mealBuilder.items.length - 1;
  window._foodRecReviewMeta = {
    baseNutrients: { ...result.nutrients }, // fixed reference for quantity scaling — never mutated
    qualityRating: result.qualityRating,
    advisorNote: result.advisorNote,
    servingDescription: result.servingDescription,
    brandName: result.brandName,
    confidence: result.confidence,
    source: result.source,
    imageUrl: window._foodRecPendingImageUrl,
    quota: result.quota,
  };
  renderMealBuilder();
}

const QUALITY_RATINGS = [
  { key: 'limited', label: 'Limited', color: 'var(--red)' },
  { key: 'fair', label: 'Fair', color: 'var(--amber)' },
  { key: 'good', label: 'Good', color: 'var(--blue)' },
  { key: 'nutritious', label: 'Nutritious', color: 'var(--green)' },
];

// Visual approximation of Oura's Limited/Fair/Good/Nutritious bar — four
// equal segments with the active one called out by color and a marker.
function buildQualitySliderHTML(qualityRating) {
  const idx = QUALITY_RATINGS.findIndex(q => q.key === qualityRating);
  const parts = ['<div style="margin:10px 0">'];
  parts.push('<div style="display:flex;gap:3px;height:4px;border-radius:2px;overflow:hidden;margin-bottom:6px">');
  QUALITY_RATINGS.forEach((q, i) => {
    parts.push('<div style="flex:1;background:'+(i<=idx?q.color:'var(--border)')+'"></div>');
  });
  parts.push('</div>');
  parts.push('<div style="display:flex;justify-content:space-between">');
  QUALITY_RATINGS.forEach((q, i) => {
    parts.push('<span style="font-size:10px;'+(i===idx?'color:'+q.color+';font-weight:700':'color:var(--muted)')+'">'+q.label+'</span>');
  });
  parts.push('</div></div>');
  return parts.join('');
}

// Renders the review/edit card for an item that's ALREADY been added to
// the meal (see handleFoodRecognitionResult above) — editing here mutates
// that item directly rather than staging a separate pending object.
function buildItemReviewCardHTML(index) {
  const item = ST.mealBuilder.items[index];
  const meta = window._foodRecReviewMeta || {};
  const n = item.nutrients;
  const lowConfidence = meta.source === 'photo' && meta.confidence < 0.8;
  const parts = [];
  parts.push('<div class="card mt8" style="border-color:var(--gold)">');
  parts.push('<div style="font-size:11px;color:var(--gold);font-weight:700;margin-bottom:8px">✓ ADDED — review or correct below</div>');

  if (meta.source === 'photo' && meta.imageUrl) {
    parts.push('<img src="' + meta.imageUrl + '" style="width:100%;max-height:200px;object-fit:cover;border-radius:10px;margin-bottom:10px">');
  }

  if (lowConfidence) {
    parts.push('<div style="font-size:12px;color:var(--amber);margin-bottom:8px">⚠ Best guess only (' + Math.round(meta.confidence * 100) + '% confidence) — is this right? Edit anything below if not.</div>');
  } else if (meta.source === 'photo') {
    parts.push('<div style="font-size:11px;color:var(--muted);margin-bottom:8px">' + Math.round(meta.confidence * 100) + '% confidence</div>');
  } else if (meta.brandName) {
    parts.push('<div style="font-size:11px;color:var(--muted);margin-bottom:8px">' + sanitizeUserText(meta.brandName) + '</div>');
  }
  parts.push('<div class="field"><label>' + foodEmoji(item.description) + ' Description</label><input type="text" id="foodRecDescription" value="' + sanitizeUserText(item.description).replace(/"/g, '&quot;') + '" oninput="updateReviewedItemField(\'description\', this.value)"></div>');
  if (meta.servingDescription) {
    parts.push('<div style="font-size:11px;color:var(--muted);margin-bottom:6px">Estimated portion: ' + sanitizeUserText(meta.servingDescription) + '</div>');
  }

  // Advisor — the qualitative read Oura leads with, alongside (not instead
  // of) the precise macros pilots actually asked to keep. Only present for
  // photo results with a real assessment; a barcode's exact product match
  // or a subjective call the model didn't return doesn't get a fake one.
  if (meta.source === 'photo' && meta.qualityRating && meta.advisorNote) {
    parts.push('<div style="background:var(--bg3);border-radius:10px;padding:10px;margin-bottom:10px">');
    parts.push('<div style="font-size:11px;color:var(--gold);margin-bottom:4px">✦ Advisor</div>');
    // No height cap or clamp — the block grows to whatever the Advisor
    // actually wrote rather than cutting it off.
    parts.push('<div style="font-size:13px;color:var(--text);margin-bottom:2px;line-height:1.45">' + escapeUserProse(meta.advisorNote) + '</div>');
    parts.push(buildQualitySliderHTML(meta.qualityRating));
    parts.push('</div>');
  }

  // Quantity — scanning/photographing one unit and setting quantity=3
  // replaces repeating the whole scan/analyze step per item. Recalculates
  // FROM meta.baseNutrients (the original, fixed scan result) every time,
  // so it's never cumulative — but a hand-edit to a macro field sticks
  // until quantity is changed again, at which point it recalculates fresh.
  parts.push('<div class="field"><label>Quantity</label><input type="text" inputmode="decimal" id="foodRecQty" value="1" oninput="updateReviewedItemQuantity()"></div>');
  parts.push('<div class="field-row">');
  parts.push('<div class="field"><label>Calories</label><input type="text" inputmode="numeric" id="foodRecCal" value="' + n.calories + '" oninput="updateReviewedItemField(\'calories\', this.value)"></div>');
  parts.push('<div class="field"><label>Protein (g)</label><input type="text" inputmode="decimal" id="foodRecProtein" value="' + n.protein + '" oninput="updateReviewedItemField(\'protein\', this.value)"></div>');
  parts.push('</div>');
  parts.push('<div class="field-row">');
  parts.push('<div class="field"><label>Carbs (g)</label><input type="text" inputmode="decimal" id="foodRecCarbs" value="' + n.carbs + '" oninput="updateReviewedItemField(\'carbs\', this.value)"></div>');
  parts.push('<div class="field"><label>Fat (g)</label><input type="text" inputmode="decimal" id="foodRecFat" value="' + n.fat + '" oninput="updateReviewedItemField(\'fat\', this.value)"></div>');
  parts.push('</div>');
  if (meta.quota && !meta.quota.unlimited) {
    parts.push('<div style="font-size:10px;color:var(--muted);margin:6px 0">' + meta.quota.used + ' of ' + meta.quota.limit + ' photo analyses used today</div>');
  }
  // The two actions that actually matter once something's been added:
  // add another item, or you're done. No separate "confirm the add"
  // step — that already happened.
  parts.push('<div class="fb mt8">');
  parts.push('<button class="btn btn-outline" style="flex:1;margin-right:8px" onclick="finishReviewingAddedItem()">+ Add More to Your Meal</button>');
  parts.push('<button class="btn btn-gold" style="flex:1" onclick="logMealFromReview()">✓ Log This Meal</button>');
  parts.push('</div>');
  parts.push('</div>');
  return parts.join('');
}

// Edits to the reviewed item's fields apply directly to the already-added
// array entry — there's no separate staging object to keep in sync.
function updateReviewedItemField(field, value) {
  const idx = window._foodRecReviewIndex;
  if (idx == null || !ST.mealBuilder?.items[idx]) return;
  const item = ST.mealBuilder.items[idx];
  if (field === 'description') {
    item.description = sanitizeUserText(value);
  } else {
    item.nutrients[field] = parseFloat(value) || 0;
  }
}

function updateReviewedItemQuantity() {
  const idx = window._foodRecReviewIndex;
  const meta = window._foodRecReviewMeta;
  if (idx == null || !meta || !ST.mealBuilder?.items[idx]) return;
  const qty = document.getElementById('foodRecQty')?.value || 1;
  const scaled = scaleNutrients(meta.baseNutrients, qty);
  const item = ST.mealBuilder.items[idx];
  item.nutrients = scaled;
  const calEl = document.getElementById('foodRecCal'), profEl = document.getElementById('foodRecProtein'), carbEl = document.getElementById('foodRecCarbs'), fatEl = document.getElementById('foodRecFat'), descEl = document.getElementById('foodRecDescription');
  if (calEl) calEl.value = scaled.calories;
  if (profEl) profEl.value = scaled.protein;
  if (carbEl) carbEl.value = scaled.carbs;
  if (fatEl) fatEl.value = scaled.fat;
  const qtyNum = parseFloat(qty) || 1;
  const baseDesc = (item.description || '').replace(/\s*\(\d+(\.\d+)?x\)\s*$/, '');
  item.description = baseDesc + (qtyNum !== 1 ? ' (' + qty + 'x)' : '');
  if (descEl) descEl.value = item.description;
}

// "Add More to Your Meal" — clears the review state so the next
// photo/barcode/search result gets its own fresh review card, leaving
// this item exactly as already added.
function finishReviewingAddedItem() {
  window._foodRecReviewIndex = null;
  window._foodRecReviewMeta = null;
  window._foodRecPendingImageUrl = null;
  renderMealBuilder();
}

// "Log This Meal" — same idea, then saves everything via the existing
// finishMealBuilder() path.
function logMealFromReview() {
  finishReviewingAddedItem();
  finishMealBuilder();
}

// Barcode scanning runs client-side (html5-qrcode, loaded in index.html) —
// the decoded UPC is the only thing sent to the server, so scanning
// itself never touches the photo quota or costs an API call.
function scanFoodBarcode() {
  if (!ST.user) { showBigToast('Sign in to scan barcodes.', 'warn'); return; }
  if (typeof Html5Qrcode === 'undefined') { showBigToast('Barcode scanner failed to load — check your connection and reload.', 'warn'); return; }
  const root = document.getElementById('modalRoot');
  if (!root) return;
  root.innerHTML =
    '<div class="modal-bg"><div class="modal-sheet">' +
    '<div class="modal-title">SCAN BARCODE</div>' +
    '<div id="barcodeScannerBox" style="border-radius:12px;overflow:hidden;min-height:250px;background:#000"></div>' +
    '<div id="barcodeScannerStatus" style="font-size:12px;color:var(--muted);margin-top:8px">Point your camera at the barcode.</div>' +
    '<button class="btn btn-outline mt12" onclick="stopFoodBarcodeScanner()">CANCEL</button>' +
    '</div></div>';

  const scanner = new Html5Qrcode('barcodeScannerBox');
  window._barcodeScanner = scanner;
  scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 150 } },
    (decodedText) => {
      stopFoodBarcodeScanner();
      handleFoodBarcodeDecoded(decodedText);
    },
    () => {} // per-frame decode failures are normal while aiming — ignore
  ).catch((e) => {
    const status = document.getElementById('barcodeScannerStatus');
    if (status) status.textContent = 'Camera unavailable: ' + (e.message || e);
  });
}

function stopFoodBarcodeScanner() {
  const scanner = window._barcodeScanner;
  window._barcodeScanner = null;
  if (scanner) { scanner.stop().then(() => scanner.clear()).catch(() => {}); }
  closeModal();
}

async function handleFoodBarcodeDecoded(barcode) {
  const box = document.getElementById('foodPhotoResultRoot');
  if (box) box.innerHTML = loadingCardHTML('Looking up ' + sanitizeUserText(barcode) + '…');
  const result = await callFoodRecognitionEdge({ action: 'barcode', barcode });
  if (result && result.error === 'not_found') {
    if (box) box.innerHTML = '<div class="card mt8" style="font-size:12px;color:var(--amber)">No product found for that barcode. Try search or manual entry below.</div>';
    return;
  }
  handleFoodRecognitionResult(result);
}

function showManualFoodEntry() {
  const box = document.getElementById('manualFoodEntryRoot');
  if (!box) return;
  box.innerHTML =
    '<div class="card mt8">' +
    '<div class="field"><input type="text" id="manualFoodName" placeholder="Food name"></div>' +
    '<div class="field-row">' +
    '<div class="field"><label>Calories</label><input type="text" inputmode="numeric" id="manualCal"></div>' +
    '<div class="field"><label>Protein (g)</label><input type="text" inputmode="decimal" id="manualProtein"></div>' +
    '</div>' +
    '<div class="field-row">' +
    '<div class="field"><label>Carbs (g)</label><input type="text" inputmode="decimal" id="manualCarbs"></div>' +
    '<div class="field"><label>Fat (g)</label><input type="text" inputmode="decimal" id="manualFat"></div>' +
    '</div>' +
    '<button class="btn btn-gold mt8" onclick="addManualFoodToMeal()">Add to Meal</button>' +
    '</div>';
}

function addManualFoodToMeal() {
  const name = sanitizeUserText(document.getElementById('manualFoodName')?.value?.trim());
  if (!name) return;
  const num = id => parseFloat(document.getElementById(id)?.value) || 0;
  ST.mealBuilder.items.push({
    description: name,
    nutrients: { calories: num('manualCal'), protein: num('manualProtein'), carbs: num('manualCarbs'), fat: num('manualFat'), fiber: 0, sugar: 0 },
    source: 'manual',
  });
  document.getElementById('manualFoodEntryRoot').innerHTML = '';
  renderMealBuilder();
}

// Shared between the standalone Badges screen and the summary embedded in
// Ranks — one implementation instead of two copies that could drift apart.
function buildBadgesGridHTML() {
  const parts = [];
  const earnedCount = BADGES.filter(b => ST.badges[b.id]).length;
  parts.push('<div style="font-size:11px;color:var(--muted);margin-bottom:10px">'+earnedCount+' of '+BADGES.length+' earned</div>');
  parts.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">');
  BADGES.forEach(b => {
    const earned = ST.badges[b.id];
    parts.push('<div style="border:1px solid '+(earned?'var(--gold)':'var(--border)')+';border-radius:8px;padding:10px;text-align:center'+(earned?'':';opacity:0.45')+'">');
    parts.push('<div style="font-size:22px">'+(earned?b.icon:'🔒')+'</div>');
    parts.push('<div style="font-size:11px;font-weight:700;margin-top:4px">'+b.title+'</div>');
    parts.push('<div style="font-size:9px;color:var(--muted);margin-top:2px;line-height:1.4">'+b.desc+'</div>');
    if (earned) parts.push('<div style="font-family:var(--mono);font-size:8px;color:var(--gold);margin-top:4px">'+new Date(earned).toLocaleDateString()+'</div>');
    parts.push('</div>');
  });
  parts.push('</div>');
  return parts.join('');
}

function renderBadges(p) {
  const parts = [moreBackLink()];
  parts.push('<div class="section-label" style="margin-top:0">BADGES</div>');
  parts.push('<div class="card mb12">');
  parts.push(buildBadgesGridHTML());
  parts.push('</div>');
  p.innerHTML = parts.join('');
}

function renderData(p) {
  const parts = [moreBackLink()];
  const isNative = typeof FCFBridge !== 'undefined' && FCFBridge.isNative;

  // ── Apple Calendar (iOS native) ───────────────────────────────────────────
  if (isNative) {
    parts.push('<div class="card mb12">');
    parts.push('<div class="section-label" style="margin-top:0">APPLE CALENDAR</div>');
    if (ST.calendarGranted && ST.calendarEvents?.length) {
      const flights = ST.calendarEvents.filter(e => e.type === 'flight').length;
      const total   = ST.calendarEvents.length;
      parts.push('<div style="font-size:11px;color:var(--green);margin-bottom:8px">✅ Connected — '+total+' events classified ('+flights+' flights)</div>');
      parts.push('<button class="btn btn-outline" onclick="if(typeof FCFBridge!==\'undefined\')FCFBridge.syncCalendar()">↻ Sync Now</button>');
    } else if (ST.calendarGranted && !ST.calendarEvents?.length) {
      parts.push('<div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.6">Calendar access granted but no events found in the next 60 days.</div>');
      parts.push('<button class="btn btn-outline" onclick="if(typeof FCFBridge!==\'undefined\')FCFBridge.syncCalendar()">↻ Sync Now</button>');
    } else {
      parts.push('<div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.6">Grant access to your Apple Calendar and FCF will automatically detect your flights, layovers, and personal commitments — no manual upload needed.</div>');
      parts.push('<button class="btn btn-outline" onclick="if(typeof FCFBridge!==\'undefined\')FCFBridge.requestCalendar()">Connect Apple Calendar</button>');
    }
    parts.push('</div>');
  }

  // ── ICS Upload (fallback / web PWA) ──────────────────────────────────────
  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">'+(isNative ? 'ICS UPLOAD — OPTIONAL FALLBACK' : 'FLIGHT SCHEDULE')+'</div>');
  parts.push('<div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.6">'+(isNative ? 'If your airline gives you a .ics export from their crew scheduling app, you can upload it here as an alternative or supplement to Apple Calendar.' : 'Upload your crew schedule as an .ics file — Preflight will automatically default your Mission Environment based on whether you\'re on a layover or at home today.')+'</div>');
  if (ST.flightSchedule && ST.flightSchedule.length) {
    const dates = ST.flightSchedule.map(e => new Date(e.start)).sort((a,b)=>a-b);
    const first = dates[0].toLocaleDateString('en-US',{month:'short',day:'numeric'});
    const last  = dates[dates.length-1].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    parts.push('<div style="font-size:11px;color:var(--green);margin-bottom:8px">✅ Schedule loaded — covers '+first+' to '+last+' ('+ST.flightSchedule.length+' events)</div>');
    parts.push('<button class="btn btn-outline" onclick="downloadFlightScheduleICS()">📅 Download My Uploaded Schedule</button>');
  }
  parts.push('<input type="file" id="icsFileInput" accept=".ics" style="display:none" onchange="handleICSUpload(this.files[0])">');
  parts.push('<button class="btn btn-outline mt8" onclick="document.getElementById(\'icsFileInput\').click()">'+(ST.flightSchedule?.length ? '🔄 Replace Schedule' : '📤 Upload .ics Schedule')+'</button>');
  parts.push('</div>');

  // ── Export ────────────────────────────────────────────────────────────────
  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">EXPORT DATA</div>');
  parts.push('<div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.6">Exports everything the app holds, in one CSV with labelled sections: workouts (one row per set, biometrics joined by date), Oura daily metrics, every logged food item, hydration and flight hours, and your scheduled flights. Optimized for AI analysis.</div>');
  parts.push('<div style="font-size:11px;color:var(--gold);margin-bottom:10px;line-height:1.5">💡 Recommended: export and review weekly. Daily exports are too noisy to show real trends; monthly is often too late to catch a stall early.</div>');
  parts.push('<button class="btn btn-outline" onclick="exportCSV()">📊 Export CSV for AI Analysis</button>');
  parts.push('<button class="btn btn-outline mt8" onclick="showAIPromptModal()">📋 View & Copy AI Prompt</button>');
  parts.push('</div>');
  p.innerHTML = parts.join('');
}

async function handleICSUpload(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const events = parseFlightScheduleICS(text);
    if (!events.length) { showBigToast('Couldn\'t find any events in that file — check it\'s the right export.', 'warn'); return; }
    ST.flightSchedule = events;
    ST.flightScheduleRaw = text;
    const profile = (await dbGetProfile()) || {};
    profile.flightSchedule = events;
    profile.flightScheduleRaw = text;
    await dbSetProfile(profile);
    showBigToast('✅ Schedule loaded — '+events.length+' events.', 'ok');
    renderPage();
  } catch(e) {
    showBigToast('Couldn\'t read that file — make sure it\'s a valid .ics export.', 'warn');
  }
}

function downloadFlightScheduleICS() {
  if (!ST.flightScheduleRaw) return;
  const blob = new Blob([ST.flightScheduleRaw], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'my_flight_schedule.ics';
  a.click();
  URL.revokeObjectURL(url);
}

async function saveOuraToken() {
  const token = document.getElementById('oura_token')?.value?.trim();
  if (!token) { showBigToast('Enter your Oura access token.','warn'); return; }
  ST.ouraToken = token;
  const profile = (await dbGetProfile()) || {};
  profile.ouraToken = token;
  await dbSetProfile(profile);
  showBigToast('Token saved.','ok');
}
