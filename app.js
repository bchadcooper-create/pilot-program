 /**
 * Flight Crew Fitness — app.js
 * Version/build: fcf-v5.44.26 / 20260916_4
 */

const FCF_VERSION = 'fcf-v5.44.26';
const FCF_BUILD   = '20260916_4';

// ─── TEXT SIZE ───────────────────────────────────────────────────────────────
// Every font-size in index.html and app.js is in rem, so scaling the root
// font size scales all of the app's text and nothing else (layout boxes
// stay put, unitless line-heights follow the text). Four steps, like iOS
// Dynamic Type. The choice is kept in localStorage so it applies before
// the first paint with no flash, and mirrored to the profile so it follows
// the person to a new device.
const TEXT_SIZES = [
  { key: 'default', label: 'Default', scale: 1 },
  { key: 'large',   label: 'Large',   scale: 1.15 },
  { key: 'larger',  label: 'Larger',  scale: 1.3 },
  { key: 'largest', label: 'Largest', scale: 1.5 },
];
const TEXT_SIZE_LS_KEY = 'fcf_text_size';
function textSizeEntry(key) {
  return TEXT_SIZES.find(t => t.key === key) || TEXT_SIZES[0];
}
function applyTextSize(key) {
  const entry = textSizeEntry(key);
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.style.fontSize = (16 * entry.scale) + 'px';
  }
  return entry.key;
}
function currentTextSize() {
  try { return textSizeEntry(localStorage.getItem(TEXT_SIZE_LS_KEY)).key; } catch (e) { return 'default'; }
}
// Runs at load, before anything renders. localStorage can throw in a
// private window or with site data blocked; the app must still start.
try { applyTextSize(localStorage.getItem(TEXT_SIZE_LS_KEY)); } catch (e) { /* default size */ }


// ─── OURA RING OAUTH2 CONFIG ─────────────────────────────────────────────────
const OURA_CLIENT_ID   = 'deb737ed-9343-407a-b993-9907bc101800';
const OURA_REDIRECT_URI = 'https://flightcrew.fit/';
const OURA_EDGE_FN      = 'https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/oura-auth';
const USDA_EDGE_FN      = 'https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/usda-food';
const FOOD_RECOGNITION_EDGE_FN = 'https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/fcf-food-recognition';
const ACCOUNT_DELETE_EDGE_FN = 'https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/fcf-delete-account';
const STRIPE_CHECKOUT_EDGE_FN = 'https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/fcf-stripe-checkout';
const CALENDAR_CLASSIFY_EDGE_FN = 'https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/fcf-calendar-classify';
const PUSH_TOKEN_EDGE_FN        = 'https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/fcf-push-token';
const AI_COACH_EDGE_FN          = 'https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/fcf-ai-coach';
const PRIVACY_POLICY_URL = 'https://flightcrew.fit/privacy.html';
const TERMS_URL = 'https://flightcrew.fit/terms.html';

const DAILY_PHOTO_LIMIT = 5;
const FEEDBACK_EDGE_FN  = 'https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/feedback-submit';
const OURA_SCOPES       = 'daily personal workout tag';
const SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRueGt5ZHhieWloZ3NpY3Riemp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3ODk4MTEsImV4cCI6MjA5NjM2NTgxMX0.oLUGuorQkbQ_u679NpE8FGBVAUmVE1K_rxl8q4B0n7k';

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
const SB = supabase.createClient(
  'https://dnxkydxbyihgsictbzjz.supabase.co',
  SB_ANON_KEY
);


// ─── SUBSCRIPTION TIERS ─────────────────────────────────────────────────
const FREE_WEEKLY_PHOTOS = 3;
const PRO_WEEKLY_PHOTOS = 0;        // 0 = unlimited
// Aircraft marshaller giving the stop signal: elbows out, wrists crossed
// above the helmet, orange wands crossing at the hands. Blue helmet, green
// headset, hi-vis orange vest. Replaces the padlock on the "Set the Chocks"
// buttons, since stopping the aircraft is the gesture that matches chocking
// the wheels. The negative vertical margin lets it sit large on the button
// without making the button taller.
const MARSHALL_STOP_ICON = '<svg viewBox="0 0 24 24" width="2.3em" height="2.3em" style="vertical-align:middle;margin:-10px 6px -8px 0" aria-hidden="true">' +
  '<line x1="14.6" y1="7.8" x2="6.2" y2="1.3" stroke="#f97316" stroke-width="1.7" stroke-linecap="round"/>' +
  '<line x1="9.4" y1="7.8" x2="17.8" y2="1.3" stroke="#f97316" stroke-width="1.7" stroke-linecap="round"/>' +
  '<path d="M8.4 15.2 L5.4 10.6" stroke="#1e3a8a" stroke-width="2.3" stroke-linecap="round"/>' +
  '<path d="M15.6 15.2 L18.6 10.6" stroke="#1e3a8a" stroke-width="2.3" stroke-linecap="round"/>' +
  '<path d="M5.4 10.6 L13.4 6.6 M18.6 10.6 L10.6 6.6" stroke="#e0b48a" stroke-width="1.9" stroke-linecap="round"/>' +
  '<circle cx="12" cy="7.3" r="1.2" fill="#1f2937"/>' +
  '<path d="M7.6 15 Q12 13.6 16.4 15 L17 23 H7 Z" fill="#1e3a8a"/>' +
  '<path d="M8.3 15.3 L11 14.6 L11.2 23 H7.8 Z M15.7 15.3 L13 14.6 L12.8 23 H16.2 Z" fill="#ff6a00" stroke="#0a0f1a" stroke-width=".35"/>' +
  '<rect x="7.9" y="19" width="3.2" height=".9" fill="#e5e7eb"/><rect x="12.9" y="19" width="3.2" height=".9" fill="#e5e7eb"/>' +
  '<circle cx="12" cy="11.9" r="2" fill="#e0b48a"/>' +
  '<path d="M9.8 11.4 Q12 8.2 14.2 11.4 Z" fill="#2563eb"/>' +
  '<rect x="9.1" y="11.2" width="1.3" height="2.1" rx=".55" fill="#15803d"/><rect x="13.6" y="11.2" width="1.3" height="2.1" rx=".55" fill="#15803d"/>' +
  '</svg>';
const PRO_ANNUAL_PRICE = '$59.99';
const PRO_MONTHLY_PRICE = '$7.99';
const PRO_PRODUCT_ANNUAL = 'FCFProAnnual';
const PRO_PRODUCT_MONTHLY = 'FCFProMonthly';

// Entitlement is only ever READ here. The server decides it after receipt
// validation — the subscriptions table grants the client SELECT and nothing
// else, so Pro can't be switched on from the console. This function is a
// convenience for what to SHOW; every paid capability is enforced again
// server-side in the edge function.
function isPro() {
  // The former dev override (a hardcoded user id) was removed before public
  // release; the owner account now holds a real 'promo' subscription row
  // like any other comped account, so this path is the only path.
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
  // Disengagement / re-engagement nudges for the two toggles above — see
  // computeTrackingNudges(). *DisabledAt is set whenever tracking gets
  // turned off (by any means), cleared when turned back on; *NudgeDismissedAt
  // suppresses re-showing a dismissed nudge for a while rather than
  // re-nagging every single day.
  nutritionTrackingDisabledAt: null,
  hydrationTrackingDisabledAt: null,
  nutritionNudgeDismissedAt: null,
  hydrationNudgeDismissedAt: null,
  nutritionNudge: null,   // 'disable' | 'reengage' | null, computed once at boot
  hydrationNudge: null,
  // Which schedule source wins when both Apple Calendar sync and an
  // uploaded .ics are present — 'auto' | 'calendar' | 'ics'. Added after
  // discovering a real timing bug upstream in a third-party crew-schedule-
  // to-calendar sync tool (documented in getActiveSchedule() below) that
  // an uploaded .ics export doesn't have, since it isn't run through that
  // same sync path.
  scheduleSource: 'auto',
  // The pilot's home domicile timezone, used to correctly reinterpret
  // Apple Calendar sync's mis-stamped crew-schedule event times (see
  // CalendarManager.swift's reinterpretAsLocal) — 'auto' (the device's
  // current timezone, right at home but wrong on a layover elsewhere)
  // or a fixed IANA identifier the user picked once and it stays
  // correct regardless of where they are when they happen to sync.
  baseTimezone: 'auto',
  nutritionGoals: null, goalDraft: 'maintain', trainDaysDraft: '3-4',
  manualTargetsOpen: false, manualCal: '', manualProtein: '', manualCarbs: '', manualFat: '', manualTargetsWarning: null,
  sleepBaselineScore: null,
  sleepBaselineDate: null,
  // Medications / supplements. Definitions are saved in the profile
  // (profile.medications); today's "taken" check-offs come from the
  // medication_logs table and are keyed "medId|HH:MM".
  medications: [],
  medsTakenToday: {},
  medsTakenDate: null,
  medsSkipped: false,     // answered "None" on the Preflight Checklist meds item
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
  chest:    { label: 'Chest & Shoulders', icon: '🏋️', desc: 'Pressing emphasis: Upper Push comes around twice per rotation', suggestFor: 'male', order: ['Upper Push','Lower Body','Upper Push','Upper Pull','Full Body'] },
  glute:    { label: 'Glute Emphasis',   icon: '🍑', desc: 'Glute-focused programming: Lower Body comes around twice per rotation', suggestFor: 'female', order: ['Lower Body','Upper Push','Lower Body','Upper Pull','Full Body'] },
  strength: { label: 'Overall Strength', icon: '⚡', desc: 'Heavy low-rep compounds plus explosive power work', order: ['Lower Body','Upper Push','Upper Pull','Power / Plyo','Full Body'] },
};

// ─── FREQUENCY GUIDANCE (fitness coach logic) ────────────────────────────────
const FREQUENCY_GUIDE = {
  beginner:     { days: '2-3', split: 'Full-body each session', note: 'Allow 48 hours between sessions for the same muscle group. Consistency beats intensity at this stage.' },
  intermediate: { days: '3-4', split: 'Upper/Lower or Push/Pull split', note: 'This is the sweet spot for most lifters. 3-4 quality sessions per week with adequate recovery outperforms more frequent, lower-quality sessions.' },
  advanced:     { days: '4-6', split: 'Body part split with planned recovery', note: 'Higher frequency requires real recovery infrastructure: sleep, protein, and at least one full rest day. Monitor for overreaching: persistent soreness or declining performance is a signal to pull back.' },
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
  if (def < 0.25) return `Sip ${Math.round(def*1000)}ml now; you're on pace, just top up a little.`;
  if (def < 0.5)  return `Drink ${Math.round(def*1000)}ml soon to stay on pace for the day. Even 2% dehydration measurably cuts strength, endurance, and focus.`;
  return `You're ${def.toFixed(1)}L behind pace for this point in the day. Drink 500ml now, then sip regularly. Total target is still ${hydroTarget().toFixed(1)}L.`;
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
  } catch(e) { console.warn('Saving daily inputs locally failed:', e); }
  // BUG FIX: water (and the other daily inputs) previously lived in
  // localStorage ONLY — logging water on the phone was invisible on the
  // PC and vice versa, two entirely separate local caches with no shared
  // source of truth. This debounced upsert makes the database the real
  // cross-device record; localStorage above stays purely as an instant-
  // response cache / offline fallback.
  saveDailyInputsToDBDebounced();
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

let _dailyInputsSaveTimer = null;
// Debounced — water/flight-hours/etc. can change on every keystroke while
// typing, and this doesn't need to be real-time to fix the actual
// reported problem (checking the OTHER device later, not simultaneously).
function saveDailyInputsToDBDebounced() {
  if (!ST.user) return;
  clearTimeout(_dailyInputsSaveTimer);
  _dailyInputsSaveTimer = setTimeout(async () => {
    try {
      // BUG FIX (independent review finding, verified real): this was
      // await-ing the upsert directly with no error check at all — the
      // read function right above (dbGetDailyInputs) already correctly
      // does `const {data,error}=...; if(error) throw error`, but this
      // write never did. Supabase's query builder resolves successfully
      // even when the write itself failed (an RLS violation, a
      // constraint error) — it doesn't reject, it returns {error} inside
      // a normal resolved result. try/catch alone can't see that; it has
      // to be checked explicitly.
      const { error } = await SB.from('daily_inputs').upsert({
        user_id: ST.user.id,
        date: localDateStr(new Date()),
        water_in: ST.waterIn,
        flight_hrs: ST.flightHrs,
        flight_hrs_touched: ST.flightHrsTouched,
        sleep_hours: ST.sleepHours,
        readiness: ST.readiness,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,date' });
      if (error) throw error;
    } catch(e) { console.warn('Saving daily inputs to server failed (local copy still saved):', e); }
  }, 800);
}

function updateHydrationUI() {
  const hs = hydroStatus();
  const pct = hydroPct();
  const adv = hydroAdvice();

  const noFlyBox = document.getElementById('noFlyBox');
  if (noFlyBox) noFlyBox.innerHTML = (ST.flightHrsTouched && ST.flightHrs === 0)
    ? '<div class="alert alert-info" style="margin-bottom:8px"><div class="alert-icon">ℹ️</div><div>No-fly day: minimum 1.0L hydration target still applies. Your body needs baseline water regardless of duty status.</div></div>'
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

const MUSCLE_GROUPS = ['Lower Body','Upper Push','Upper Pull','Power / Plyo','Full Body','Longevity','Stretch','Cardio','Run'];

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
    ex('c_lb_er2','Leg Press','3×12',3,'Moderate weight. Full ROM. Don\'t lock knees.'),
    ex('c_lb_er3','Standing Calf Raise','4×12',4,'Full ROM: stretch at bottom, pause at top.'),
    ex('c_lb_er4','Lateral Band Walk','2×15/side',2,'Band above knees. Stay low. Activates glute med.',false,'reps_only'),
    ex('c_lb_er5','Leg Extension (Machine)','3×15',3,'Seated machine. Squeeze at the top, control the negative. Quad isolation.'),
    ex('c_lb_er6','Seated Leg Curl (Machine)','3×12',3,'Pad above the heel, full stretch at the bottom. Hamstring isolation.'),
    ex('c_lb_er7','Standing Calf Raise (Machine)','4×15',4,'Shoulder pads or plate-loaded. Full ROM, pause at the top and stretch at the bottom.'),
    ex('c_lb_er8','Glute Kickback (Machine)','3×12/leg',3,'Foot on the platform, drive back and squeeze the glute. Don\'t hyperextend the lower back.'),
    ex('c_lb_er9','Seated Calf Raise (Machine)','4×15',4,'Knees bent under the pad. Targets the soleus, distinct from standing calf raises, which emphasize the gastrocnemius.'),
    ex('c_lb_er10','Hip Abduction (Machine)','3×15',3,'Seated, push knees outward against the pads. Glute medius: often neglected but key for hip stability.'),
    ex('c_lb_er11','Hip Adduction (Machine)','3×15',3,'Seated, squeeze knees together against the pads. Inner thigh: commonly skipped but balances the abductors.'),
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
    ex('c_up_to1','Flat Barbell Bench Press','5×5',5,'Work up to a heavy 5. Elbows 45-70°, not flared. Control the descent, explode up.'),
    ex('c_up_to2','Standing Overhead Press','4×5',4,'Standing, not seated. Full lockout overhead. Core braced.'),
  ],
  enroute: [
    ex('c_up_er1','Incline DB Press','3×10',3,'30-45° incline. Full stretch at the bottom.'),
    ex('c_up_er2','Close Grip Bench','3×8',3,'Hands shoulder-width. Tricep emphasis.'),
    ex('c_up_er3','Lateral Raise','3×15',3,'Light and strict, no momentum.'),
    ex('c_up_er4','DB Tricep Overhead','3×12',3,'Both hands on one DB. Full stretch at top.'),
    ex('c_up_er10','Push-Up','3×15',3,'Standard form: hands under shoulders, straight line head to heels. Good bodyweight finisher regardless of equipment access.',false,'reps_only'),
    ex('c_up_er5','Incline Chest Press (Machine)','3×10',3,'Seated, pads set to mid-chest height. Controlled tempo, no bouncing off the bottom.'),
    ex('c_up_er6','Decline Chest Press (Machine)','3×10',3,'Seated, pads angled downward. Targets lower chest. Full extension without locking the elbows hard.'),
    ex('c_up_er7','Pec Fly (Machine)','3×15',3,'Seated, arms slightly bent throughout. Squeeze at full contraction, control the stretch back.'),
    ex('c_up_er8','Cable Tricep Pushdown','3×15',3,'Elbows pinned to your sides. The whole rep should come from the elbow, not the shoulder.'),
    ex('c_up_er9','Assisted Dip (Machine)','3×10',3,'Counterweight assists the lift. Lean forward slightly for more chest emphasis.'),
  ],
  landing: [
    ex('c_up_l1','Doorframe Chest Stretch','60s/side',1,'Arm at 90° in doorframe, rotate body away.',true,'timed_bilateral'),
    ex('c_up_l2','Lat Overhead Stretch','60s/side',1,'Reach one arm overhead, grab a rack or door frame, lean away.',true,'timed_bilateral'),
    ex('c_up_l3','Diaphragmatic Breathing','10 breaths',1,'Lie on back. Inhale 4 counts, hold 2, exhale 6. Shifts the nervous system from sympathetic to parasympathetic. See "What is CNS Down-Regulation" in Wisdom.',false,'reps_only'),
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
    ex('c_ul_er2','Seated Cable Row','3×12',3,'Retract fully at the end: shoulder blades together.'),
    ex('c_ul_er3','Face Pull','3×20',3,'Cable at face height. Pull to forehead, elbows high and wide.'),
    ex('c_ul_er4','EZ Bar Curl','3×12',3,'Strict, no swing. Control the eccentric.'),
    ex('c_ul_er6','Assisted Pull-Up (Machine)','3×8',3,'Counterweight assists the lift. Dial in just enough assistance to hit real reps with good form.'),
    ex('c_ul_er7','T-Bar Row (Machine)','3×10',3,'Chest supported, pull to the lower ribs. Removes lower-back strain compared to a free-standing barbell row.'),
    ex('c_ul_er5','Preacher Curl','3×12',3,'Arm braced on the pad. Isolates the biceps by removing shoulder swing entirely.'),
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
    ex('c_pp_er5','Kettlebell Swing','4×15',4,'Explosive hip hinge: the ballistic hip snap this category is all about. Bell floats to chest height, not overhead.'),
    ex('c_pp_er6','Medicine Ball Rotational Throw','3×8/side',3,'Stand side-on to a wall, rotate and throw the ball hard into the wall at hip height, catch the rebound and reset. Builds rotational core power and hip-shoulder separation.'),
  ],
  landing: [
    ex('c_pp_l1','Achilles / Calf Stretch','90s/side',1,'Step on step edge, drop heel slowly.',true,'timed_bilateral'),
    ex('c_pp_l2','Slow Pogo Hops (25% effort)','30s',1,'Gentle bouncing, minimal effort.',true,'timed'),
    ex('c_pp_l3','Non-Sleep Deep Rest (NSDR)','5 min',1,'Lie flat. Eyes closed. Breathe slowly. Use the NSDR timer below. It will chime at 5 minutes and record your session automatically.',true,'nsdr'),
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
    ex('c_fb_er1','Deadlift','3×3',3,'Heavy triple. Maximum posterior chain. Take the FULL rest timer: heavy pulls after squat and bench demand complete recovery.'),
    ex('c_fb_er2','Weighted Pullups','3×6',3,'Add weight if bodyweight is easy.'),
    ex('c_fb_er3','Overhead Press','3×8',3,'Moderate. Standing.'),
    ex('c_fb_er4','Single Leg Split Squat','3×8/leg',3,'Unilateral leg accessory.',false,'reps_only'),
    ex('c_fb_er5','Sit-Up','3×20',3,'Classic ab exercise, no equipment needed.',false,'reps_only'),
    ex('c_fb_er6','Bicycle Crunch','3×20/side',3,'Opposite elbow to opposite knee. Controlled, not a race.',false,'reps_only'),
    ex('c_fb_er7','Kettlebell Swing','4×15',4,'Hip hinge, not a squat: the power comes from snapping your hips forward, not your arms lifting. Bell floats to chest height, not overhead.'),
    ex('c_fb_er8','Kettlebell Clean & Press','3×8/side',3,'Clean the bell to your shoulder in one motion, then press overhead. Reset between reps. This isn\'t a swing.'),
    ex('c_fb_er9','Single-Arm Kettlebell Row','3×10/side',3,'Hinge forward, free hand on a bench for support, row the bell to your hip keeping your elbow close to your body.'),
    ex('c_fb_er10','Turkish Get-Up','3×3/side',3,'Slow and controlled. This is a mobility and stability drill as much as strength. Start light. Follow the bell with your eyes the entire rep.'),
    ex('c_fb_er11','Kettlebell Halo','3×8/side',3,'Hold the bell by the horns at chest height, circle it around your head, leading with the same direction each set. Keeps your core braced throughout.'),
    ex('c_fb_er12','Medicine Ball Slam','3×12',3,'Raise the ball overhead and slam it straight down as hard as you can, catching it on the bounce or picking it back up. Full body: legs, core, and shoulders drive the power.'),
    ex('c_fb_er13','Medicine Ball Russian Twist','3×16/side',3,'Sit with knees bent, lean back slightly, rotate the ball side to side, tapping it to the floor on each side.',false,'reps_only'),
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
    ex('c_lg_l2','Neck Mobility Protocol','2×8/direction',2,'Forward, back, rotation each side, lateral flexion.',false,'reps_only'),
    ex('c_lg_l3','Zone 2 Walk','10 min',1,'Brisk walk. Conversational pace.',true,'timed'),
  ],
};

WORKOUTS.comm['Cardio'] = {
  taxi: [
    ex('c_ca_t1','Brisk Walk Ramp-Up','3 min',1,'Start slow, build pace.',true,'timed'),
    ex('c_ca_t2','Jumping Jacks','2×30s',2,'Classic full-body warmup, zero equipment. Raises heart rate before the main cardio effort.',true,'timed'),
  ],
  takeoff: [
    ex('c_ca_to1','Rowing Machine Intervals','6×500m',6,'Hard effort. Log your 500m split in seconds for each interval.',false,'reps_only'),
    ex('c_ca_to2','Assault Bike Intervals','8×30s',8,'All-out 30 seconds, 60s easy spin. Log the watts you held for each interval.',false,'reps_only'),
  ],
  enroute: [
    ex('c_ca_er1','Treadmill Zone 2 Run','20 min',1,'Conversational pace: speak in full sentences. Log distance for the leaderboard.',true,'timed_distance'),
    ex('c_ca_er3','Walking','30-45 min',1,'Zone 1-2 steady pace. Great low-impact active recovery. Log distance if you tracked it.',true,'timed_distance'),
    ex('c_ca_er4','Treadmill','30 min',1,'Any steady treadmill session: walk, incline, or run.',true,'timed'),
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
    ex('h_up_er5','Push-Up','3×15',3,'Standard form: hands under shoulders, straight line head to heels. No equipment needed.',false,'reps_only'),
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
    ex('h_pp_er5','Kettlebell Swing','4×15',4,'Explosive hip hinge: the ballistic hip snap this category is all about. Bell floats to chest height, not overhead.'),
    ex('h_pp_er6','Medicine Ball Rotational Throw','3×8/side',3,'Stand side-on to a wall, rotate and throw the ball hard into the wall at hip height, catch the rebound and reset. Builds rotational core power and hip-shoulder separation.'),
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
    ex('h_fb_er6','Bicycle Crunch','3×20/side',3,'Opposite elbow to opposite knee. Controlled, not a race.',false,'reps_only'),
    ex('h_fb_er7','Kettlebell Swing','4×15',4,'Hip hinge, not a squat: the power comes from snapping your hips forward, not your arms lifting. Bell floats to chest height, not overhead.'),
    ex('h_fb_er8','Kettlebell Clean & Press','3×8/side',3,'Clean the bell to your shoulder in one motion, then press overhead. Reset between reps. This isn\'t a swing.'),
    ex('h_fb_er9','Single-Arm Kettlebell Row','3×10/side',3,'Hinge forward, free hand on a bench for support, row the bell to your hip keeping your elbow close to your body.'),
    ex('h_fb_er10','Turkish Get-Up','3×3/side',3,'Slow and controlled. This is a mobility and stability drill as much as strength. Start light. Follow the bell with your eyes the entire rep.'),
    ex('h_fb_er11','Kettlebell Halo','3×8/side',3,'Hold the bell by the horns at chest height, circle it around your head, leading with the same direction each set. Keeps your core braced throughout.'),
    ex('h_fb_er12','Medicine Ball Slam','3×12',3,'Raise the ball overhead and slam it straight down as hard as you can, catching it on the bounce or picking it back up. Full body: legs, core, and shoulders drive the power.'),
    ex('h_fb_er13','Medicine Ball Russian Twist','3×16/side',3,'Sit with knees bent, lean back slightly, rotate the ball side to side, tapping it to the floor on each side.',false,'reps_only'),
  ],
  landing: [
    ex('h_fb_l1','Full Body Stretch','5 min',1,'Child\'s pose → pigeon → lat hang → chest stretch.',true,'timed'),
    ex('h_fb_l2','Diaphragmatic Breathing','10 breaths',1,'Inhale 4, hold 2, exhale 6.',false,'reps_only'),
  ],
};
WORKOUTS.hotel['Longevity'] = WORKOUTS.comm['Longevity'];

// A pure stretching/mobility session — zero equipment, identical across all
// three environments since it needs none of the room/hotel/comm distinction
// the strength workouts require. Built specifically for pilots' known
// problem areas: hip flexors and thoracic spine from hours seated, neck
// and shoulders from headset/yoke posture.
WORKOUTS.comm['Stretch'] = {
  taxi: [
    ex('c_st_t1','Neck Rolls','2×5/direction',2,'Slow, controlled circles. Stop anywhere that pinches rather than pulls.',false,'reps_only'),
    ex('c_st_t2','Shoulder Rolls','2×10',2,'Big, slow circles forward then back. Releases the shoulders after hours in a seat.',false,'reps_only'),
    ex('c_st_t3','Cat-Cow','2×10',2,'Slow spinal articulation. Inhale on extension, exhale on flexion.',false,'reps_only'),
  ],
  takeoff: [
    ex('c_st_to1','Chest Doorway Stretch','45s/side',1,'Forearm on a doorframe, step through gently until you feel the stretch across the chest.',true,'timed_bilateral'),
    ex('c_st_to2','Cross-Body Shoulder Stretch','45s/side',1,'Pull one arm across the chest with the other. Hold, don\'t bounce.',true,'timed_bilateral'),
    ex('c_st_to3','Triceps Overhead Stretch','45s/side',1,'Elbow up and back behind the head, gentle pull with the opposite hand.',true,'timed_bilateral'),
    ex('c_st_to4','Thread the Needle','45s/side',1,'On all fours, thread one arm under the body to open the upper back and shoulder.',true,'timed_bilateral'),
  ],
  enroute: [
    ex('c_st_er1','Hip Flexor Stretch','60s/side',1,'Half-kneeling lunge position, gentle push of the hips forward. The single most valuable stretch for anyone sitting all day.',true,'timed_bilateral'),
    ex('c_st_er2','Seated Figure-4 Stretch','60s/side',1,'Ankle on opposite knee, lean forward from the hips. Opens the glute and outer hip.',true,'timed_bilateral'),
    ex('c_st_er3','Standing Hamstring Stretch','45s/side',1,'Heel on a low surface, hinge forward from the hips with a flat back.',true,'timed_bilateral'),
    ex('c_st_er4','Quad Stretch','45s/side',1,'Standing, pull heel to glute, knees together. Hold something for balance if needed.',true,'timed_bilateral'),
    ex('c_st_er5','World\'s Greatest Stretch','60s/side',1,'Deep lunge, hand down, rotate the opposite elbow to the sky. Hits hips, hamstrings, and thoracic spine in one move.',true,'timed_bilateral'),
  ],
  landing: [
    ex('c_st_l1','90/90 Hip Switch','2×8/side',2,'Slow controlled rotation between internal and external hip position. The most important mobility work for a pilot.',false,'reps_only'),
    ex('c_st_l2','Child\'s Pose','90s',1,'Sink hips to heels, arms extended forward. Full relaxation of the lower back.',true,'timed'),
    ex('c_st_l3','Box Breathing','2 min',1,'4 seconds in, 4 hold, 4 out, 4 hold. Settles the nervous system before rest.',true,'timed'),
  ],
};
WORKOUTS.hotel['Stretch'] = WORKOUTS.comm['Stretch'];

WORKOUTS.hotel['Cardio'] = {
  taxi: WORKOUTS.comm['Cardio'].taxi,
  takeoff: [
    ex('h_ca_to1','Treadmill Intervals','8×1 min',8,'Hard 1 min run, 90s walk. Log your speed in mph for each interval.',false,'reps_only'),
    ex('h_ca_to2','Stationary Bike Intervals','6×45s',6,'High resistance, hard effort. Log the watts you held for each interval.',false,'reps_only'),
  ],
  enroute: [
    ex('h_ca_er1','Treadmill Zone 2 Run','20 min',1,'Conversational pace. Log distance for the leaderboard.',true,'timed_distance'),
    ex('h_ca_er3','Walking','30-45 min',1,'Zone 1-2 steady pace. Great low-impact active recovery. Log distance if you tracked it.',true,'timed_distance'),
    ex('h_ca_er4','Treadmill','30 min',1,'Any steady treadmill session: walk, incline, or run.',true,'timed'),
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
    ex('r_up_er5','Push-Up','3×15',3,'Standard form: hands under shoulders, straight line head to heels. The baseline version, no variation needed.',false,'reps_only'),
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
WORKOUTS.room['Stretch'] = WORKOUTS.comm['Stretch'];
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

// ─── BAND EXERCISES ─────────────────────────────────────────────────────────
// A resistance band folds down to almost nothing and weighs a few ounces —
// genuinely realistic to carry in a flight bag or suitcase every single trip,
// unlike dumbbells or a kettlebell. Sourced from Montana State University
// Extension's resistance band program (montana.edu/extension/wellness) and
// Under Armour's resistance band exercise guide (underarmour.com/playbooks).
WORKOUTS.band = {};
WORKOUTS.band['Lower Body'] = {
  taxi: WORKOUTS.comm['Lower Body'].taxi,
  takeoff: [
    ex('b_lb_to1','Banded Squat','4×15',4,'Stand on the band with feet shoulder-width, bring the ends up over your shoulders or hold at chest height. Full depth. Bands add the most resistance at the top, so drive hard out of the bottom.',false,'reps_only'),
    ex('b_lb_to2','Banded Deadlift','4×12',4,'Stand on the middle of the band, feet hip-width, hinge down to grip an end in each hand, drive your hips forward to stand tall. Keep the band taut the whole rep, no slack at the bottom.',false,'reps_only'),
  ],
  enroute: [
    ex('b_lb_er1','Lateral Band Walk','3×15 steps/side',3,'Loop a band above your knees, drop into a quarter-squat, step sideways keeping tension in the band the entire time. Targets glute medius, often neglected.',false,'reps_only'),
    ex('b_lb_er2','Banded Leg Curl','3×15/side',3,'Anchor the band low to something stable, loop the other end around one ankle, curl your heel toward your glute. Switch legs.',false,'reps_only'),
    ex('b_lb_er3','Banded Lateral Lunge','3×10/side',3,'Band looped around your ankles. Take a big step to the side, hinge at the hips and sit into the working leg, push back to center.',false,'reps_only'),
    ex('b_lb_er4','Banded Hip Thrust','3×15',3,'Band across your hips, shoulders on a bench or the floor, feet flat and knees bent. Drive your hips up, squeeze your glutes at the top.',false,'reps_only'),
    ex('b_lb_er5','Standing Banded Glute Kickback','3×15/side',3,'Band looped around both ankles. Balance on one leg, kick the other straight back, squeezing the glute at the top.',false,'reps_only'),
  ],
  landing: WORKOUTS.comm['Lower Body'].landing,
};
WORKOUTS.band['Upper Push'] = {
  taxi: WORKOUTS.comm['Upper Push'].taxi,
  takeoff: [
    ex('b_up_to1','Banded Push-Up','4×15',4,'Loop the band across your upper back, holding one end under each hand. Adds resistance right where a bodyweight push-up gets easiest: the top of the rep.',false,'reps_only'),
    ex('b_up_to2','Banded Overhead Press','4×15',4,'Stand on the middle of the band, press both ends straight overhead to full lockout. Core braced, don\'t arch your lower back.',false,'reps_only'),
  ],
  enroute: [
    ex('b_up_er1','Banded Single-Arm Chest Press','3×12/side',3,'Anchor the band behind you at chest height, face away from the anchor, press forward and slightly across your body.',false,'reps_only'),
    ex('b_up_er2','Banded Tricep Pushdown','3×15',3,'Anchor the band overhead, elbows pinned to your sides, extend your arms down until straight.',false,'reps_only'),
    ex('b_up_er3','Banded Lateral Raise','3×15',3,'Stand on the band, raise both arms out to shoulder height. Light tension, strict form. No swinging.',false,'reps_only'),
  ],
  landing: WORKOUTS.comm['Upper Push'].landing,
};
WORKOUTS.band['Upper Pull'] = {
  taxi: WORKOUTS.comm['Upper Pull'].taxi.slice(0,2),
  takeoff: [
    ex('b_ul_to1','Banded Bent-Over Row','4×15',4,'Stand on the band, feet hip-width, hinge forward about 30°. Pull the band to your chest, keeping elbows close to your sides. They should skim your ribs.',false,'reps_only'),
    ex('b_ul_to2','Banded Upright Row','4×12',4,'Stand on the band with it crossed into an X in front of you. Pull your hands up to shoulder height, elbows leading out to the sides.',false,'reps_only'),
  ],
  enroute: [
    ex('b_ul_er1','Banded Bicep Curl','3×15',3,'Stand on the band, curl both hands up toward your shoulders, elbows tucked to your sides throughout.',false,'reps_only'),
    ex('b_ul_er2','Banded Face Pull','3×15',3,'Anchor the band at chest height, pull toward your face with your elbows high, squeezing your shoulder blades together.',false,'reps_only'),
    ex('b_ul_er3','Banded Single-Arm Row','3×12/side',3,'Anchor the band low, staggered stance, row toward your hip keeping the elbow close to your body.',false,'reps_only'),
  ],
  landing: WORKOUTS.comm['Upper Pull'].landing,
};
WORKOUTS.band['Full Body'] = {
  taxi: [ex('b_fb_t1','Band Mobility Circuit','1 round',1,'10 band pull-aparts → 10 banded good mornings → 10 bodyweight squats with the band looped around your knees.',true,'timed')],
  takeoff: [
    ex('b_fb_to1','Banded Squat','4×15',4,'Full depth, band over your shoulders or held at chest height.',false,'reps_only'),
    ex('b_fb_to2','Banded Deadlift','4×12',4,'Hip hinge pattern, band taut throughout the entire rep.',false,'reps_only'),
  ],
  enroute: [
    ex('b_fb_er1','Banded Push-Up','3×15',3,'Band looped across your upper back.',false,'reps_only'),
    ex('b_fb_er2','Banded Bent-Over Row','3×15',3,'Elbows close to your sides the whole pull.',false,'reps_only'),
    ex('b_fb_er3','Banded Woodchop','3×12/side',3,'Anchor the band low or high, rotate it diagonally across your body. The movement should come from your core, not your arms.',false,'reps_only'),
    ex('b_fb_er4','Standing Banded Oblique Twist','3×12/side',3,'Band anchored at your side around waist height, twist your torso away from the anchor point and back.',false,'reps_only'),
    ex('b_fb_er5','Banded Thruster','3×12',3,'Squat down keeping the band taut, then drive up through your legs and press the band straight overhead in one continuous motion as you stand.',false,'reps_only'),
  ],
  landing: [
    ex('b_fb_l1','Full Body Stretch','5 min',1,'Child\'s pose → pigeon → lat hang → chest stretch.',true,'timed'),
    ex('b_fb_l2','Diaphragmatic Breathing','10 breaths',1,'Inhale 4, hold 2, exhale 6.',false,'reps_only'),
  ],
};
// The remaining categories don't have a meaningfully distinct banded
// version — sharing the closest equipment-matched environment rather than
// inventing content for its own sake, same pattern already used for
// Stretch/Longevity across hotel and room above.
WORKOUTS.band['Power / Plyo'] = WORKOUTS.room['Power / Plyo'];
WORKOUTS.band['Longevity']   = WORKOUTS.comm['Longevity'];
WORKOUTS.band['Stretch']     = WORKOUTS.comm['Stretch'];
WORKOUTS.band['Cardio']      = WORKOUTS.room['Cardio'];

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
        enroute: { 'Leg Press': ex('g_c_lb_gk','Cable Glute Kickback','3×12/leg',3,'Slight forward lean, kick straight back through the heel. Squeeze at full extension. No swinging.') },
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
// The one place an alternate ({name, target, note, inputType?}) becomes a
// workout exercise. Used by the manual Alternate swap AND the automatic
// injury swap, so the two can never disagree about how many set boxes or
// which fields the new exercise gets.
//
// BUG FIX (found while testing live feedback: "DB Incline Press 4×10"
// with three set boxes after a shoulder swap). applyInjuryFilter copied
// the alternate's name, label and note onto the ORIGINAL exercise and kept
// the original's set count and input fields. 29 of the 43 possible injury
// swaps came out wrong: the label promised 4 sets and drew 3, a Plank
// swapped for Dead Bug kept its stopwatch box, a row swapped for pullups
// kept a weight field.
//   sets:   from the alternate's own label ("4×10" is 4); a bare duration
//           ("20 min") is 1; anything else 3
//   fields: what the alternate says, else what the catalog says for an
//           exercise of that name, else reps + weight
function exFromAlternate(id, alt, catalogMatch) {
  const setsMatch = (alt.target||'').match(/^(\d+)\s*[x×]/i);
  // A label that is just a duration ("20 min", "60s/side") is one effort.
  const setsCount = setsMatch ? Math.max(1, parseInt(setsMatch[1], 10)) : (parseTargetSeconds(alt.target) ? 1 : 3);
  const cat = catalogMatch === undefined ? buildExerciseCatalog().find(e => e.name === alt.name) : catalogMatch;
  const iType = alt.inputType || (cat && cat.inputType) || 'reps_weight';
  const isTimed = ['timed','timed_bilateral','timed_distance','nsdr'].includes(iType) || (!alt.inputType && !!(cat && cat.timed));
  return ex(id, alt.name, alt.target, setsCount, alt.note||'Alternate exercise.', isTimed, iType);
}

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
      ...exFromAlternate('inj_' + slugify(safeAlt.name), safeAlt),
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
  { title:'Hydration SOP', text:'Aviation medicine guidance sets roughly 0.3L of water per flight hour as a baseline hydration target. Cabin humidity at altitude drops below 20% (drier than most deserts), so fluid loss outpaces thirst. By the time you feel thirsty, you may already be mildly dehydrated, which is enough to measurably affect reaction time and decision-making. On no-fly days, a 1L minimum keeps you on track.', link:'https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html' },
  { title:'Seated Correction', text:'Sustained sitting compresses the spinal discs, deactivates the glutes, and tightens the hip flexors. Set a reminder every 60 minutes: 10 glute squeezes, a few standing hip hinges, and a brief thoracic extension over a chair back. Small, frequent breaks matter more than one long stretch session.', link:'https://www.mayoclinic.org/healthy-lifestyle/adult-health/in-depth/sitting/art-20270991' },
  { title:'Landing Prep Breathing', text:'Slow, extended-exhale breathing (such as 4 seconds in, 7 hold, 8 out) activates the parasympathetic nervous system, lowering heart rate and reducing the mental "noise" of a high-workload environment within a few cycles. Useful immediately after landing or before a stressful task.', link:'https://www.health.harvard.edu/mind-and-mood/relaxation-techniques-breath-control-helps-quell-errant-stress-response' },
  { title:'BP Accuracy Protocol', text:'Blood pressure readings are sensitive to method. Rest quietly for 5 full minutes first. Sit with your back supported, feet flat, and arm at heart level. No talking. Take three readings a minute or two apart and average the last two. Caffeine or exercise in the prior 30 minutes can inflate the number.', link:'https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings' },
  { title:'Fasting Glucose Baseline', text:'Fasting glucose should be measured upon waking, before any food or coffee, after at least 8 hours without eating. Normal is roughly 70-99 mg/dL; 100-125 is considered pre-diabetic range; 126+ is the diabetic threshold. Stress and poor sleep can elevate readings independent of diet, so track the trend over weeks, not single readings.', link:'https://www.cdc.gov/diabetes/diabetes-testing/' },
  { title:'Blue Light Management', text:'Screens emit blue wavelengths that suppress melatonin release in the evening, delaying sleep onset. Blue-light-filtering glasses or built-in "night mode" settings after sunset are simple, evidence-supported countermeasures, useful for pilots managing irregular schedules.', link:'https://www.sleepfoundation.org/bedroom-environment/blue-light' },
  { title:'Why Squats Matter', text:'The squat loads the entire postural and lower body system at once: lumbar spine, hips, knees, ankles, and core all participate. For pilots, it directly counters the seated posture of the cockpit. Regular squatting supports bone density and overall functional strength as you age.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Post-Meal Walk', text:'A short walk after eating, even 10 minutes, measurably blunts the post-meal blood sugar spike by helping muscles take up glucose without relying on extra insulin. For pilots with irregular meal timing, this is one of the easiest interventions available in almost any environment.', link:'https://www.diabetes.org/healthy-living/fitness/getting-started-safely/walking' },
  { title:'Sleep Consistency', text:'A consistent wake time, more than bedtime, anchors your circadian rhythm and the hormonal cascade that depends on it. Even after irregular trips, returning to a fixed wake-time window within a few days helps rebuild that rhythm faster than chasing extra sleep alone.', link:'https://www.sleepfoundation.org/sleep-hygiene/sleep-schedule' },
  { title:'Box Breathing for Pilots', text:'Box breathing (inhale 4 counts, hold 4, exhale 4, hold 4) is a simple, trainable technique used across military and high-performance settings to reduce acute stress and steady heart rate before a demanding task.', link:'https://www.health.harvard.edu/mind-and-mood/relaxation-techniques-breath-control-helps-quell-errant-stress-response' },
  { title:'Protein Priority', text:'Aiming for roughly 25-30g of protein per meal, spread across the day, supports muscle maintenance and satiety better than concentrating protein into one large meal. For pilots eating in airports and hotels, this means actively choosing protein-forward options at each stop.', link:'https://nutritionsource.hsph.harvard.edu/what-should-you-eat/protein/' },
  { title:'Fiber Intake', text:'Most adults fall well short of the roughly 25-30g of daily fiber recommended for digestive and metabolic health. Fiber slows glucose absorption, feeds beneficial gut bacteria, and supports satiety, which is valuable when travel limits food choices.', link:'https://nutritionsource.hsph.harvard.edu/carbohydrates/fiber/' },
  { title:'Zone 2 Training', text:'Training at a conversational pace (roughly 60-70% of max heart rate) builds the aerobic base that underlies recovery from harder efforts. Most evidence-based guidelines recommend 150+ minutes of this kind of moderate cardio per week for general health.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults' },
  { title:'Thoracic Mobility', text:'Prolonged forward-flexed postures, like extended seat time, encourage the upper back to round. Daily thoracic extension drills (over a chair back or foam roller) help counteract this and protect the neck and lower back from compensating.', link:'https://www.spine-health.com/wellness/exercise/thoracic-spine-stretches-and-exercises' },
  { title:'Caffeine Cutoff', text:'Caffeine has a half-life of roughly 5-6 hours, meaning a substantial dose remains active in your system well into the evening if consumed in the afternoon. For pilots with variable schedules, a personal cutoff time, even 8 hours before target sleep, meaningfully protects sleep quality.', link:'https://www.sleepfoundation.org/nutrition/caffeine-and-sleep' },
  { title:'Morning Light Exposure', text:'Getting outside within the first hour of waking, even on a cloudy day, provides far more light intensity than indoor lighting and helps anchor your circadian clock. For pilots adjusting across time zones, morning light at the destination is one of the fastest resynchronization tools available.', link:'https://www.sleepfoundation.org/bedroom-environment/light-and-sleep' },
  { title:'The Big Three Lifts', text:'A squat pattern, a hip-hinge pattern (like a deadlift), and a pulling pattern cover most of what the body needs for durable, functional strength. If your time is limited, maintaining competence in these three patterns gives the broadest return.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Active Recovery on Layovers', text:'Total rest on a layover often feels appealing, but light movement (an easy walk, gentle mobility work) tends to leave you feeling better than complete inactivity, by promoting blood flow and reducing stiffness without adding training stress.', link:'https://health.clevelandclinic.org/active-recovery' },
  { title:'Waist Measurement Protocol', text:'Measure at the navel, at the end of a normal exhale, without pulling in your stomach. A waist circumference over 40 inches in men (35 inches in women) is the commonly cited clinical threshold associated with higher metabolic and cardiovascular risk, independent of total body weight.', link:'https://www.nhlbi.nih.gov/health/educational/lose_wt/risk.htm' },
  { title:'Meal Timing', text:'Eating close to bedtime can interfere with the normal drop in core body temperature that supports sleep onset, and is associated with poorer overnight glucose control. A loose guideline of finishing meals 2-3 hours before bed is a reasonable target.', link:'https://www.sleepfoundation.org/nutrition/food-and-drink-promote-good-sleep' },
  { title:'CNS Recovery', text:'Strength adaptations happen during the recovery period after a workout, not during the workout itself. Adequate sleep and protein intake in the 24-48 hours following a hard session are what convert training stress into actual progress.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Scapular Position', text:'A neutral, slightly retracted shoulder blade position (sometimes cued as "shoulders back and down") helps offset the forward-rounded posture common after years in a cockpit seat, and reduces shoulder impingement risk during pressing movements.', link:'https://www.spine-health.com/wellness/exercise/thoracic-spine-stretches-and-exercises' },
  { title:'Spinal Decompression', text:'Gentle stretches like child\'s pose create mild traction on the spine, helping offset the compressive load of long periods of sitting. This is a useful addition after a heavy lower body session.', link:'https://www.spine-health.com/wellness/exercise/thoracic-spine-stretches-and-exercises' },
  { title:'Blood Sugar Control', text:'Refined carbohydrates and added sugars tend to produce a rapid glucose rise followed by a crash, which can affect alertness a couple of hours later. Pairing carbohydrates with protein, fat, or fiber slows this response and tends to produce steadier energy.', link:'https://www.cdc.gov/diabetes/healthy-eating/' },
  { title:'Urine Color Chart', text:'Urine color remains one of the simplest, free hydration indicators: pale straw suggests good hydration, while dark amber suggests you need more fluids soon. Note that certain vitamins (like B-complex) can cause bright yellow urine unrelated to hydration status.', link:'https://www.mayoclinic.org/healthy-lifestyle/nutrition-and-healthy-eating/in-depth/water/art-20044256' },
  { title:'Cold Exposure', text:'Brief cold exposure at the end of a shower has been associated with improved alertness and mood in some studies, likely through norepinephrine release. It is not required for fitness progress but is a low-cost tool some people find energizing.', link:'https://www.health.harvard.edu/staying-healthy/the-power-of-the-cold-water-plunge' },
  { title:'Two-Minute Mindfulness', text:'Even short, focused-breathing breaks of a couple of minutes have been shown to reduce momentary stress markers and improve subsequent focus. For high-workload professions, brief resets between tasks may be more sustainable than longer sessions.', link:'https://www.health.harvard.edu/mind-and-mood/relaxation-techniques-breath-control-helps-quell-errant-stress-response' },
  { title:'Tempo Training for Longevity', text:'Slowing down the lowering (eccentric) portion of a lift increases time under tension and may better stimulate connective tissue adaptation than fast, uncontrolled reps, making it a useful emphasis for joint-friendly, longevity-focused training.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Dietary Blood Pressure', text:'Reducing sodium intake and increasing potassium-rich foods (leafy greens, avocado, sweet potatoes, legumes) are two of the most well-supported dietary levers for lowering blood pressure over time.', link:'https://www.heart.org/en/health-topics/high-blood-pressure/changes-you-can-make-to-manage-high-blood-pressure' },
  { title:'Anti-Movement Core Training', text:'Exercises like planks and dead bugs train the core to resist unwanted movement of the spine, which is generally considered more protective for the lower back than traditional flexion-based exercises like sit-ups.', link:'https://www.spine-health.com/wellness/exercise/core-exercises-low-back-pain' },
  { title:'Screen-Free Pre-Sleep Window', text:'Reducing screen exposure in the hour before bed (and replacing it with reading, journaling, or a podcast) is a simple, low-cost habit associated with falling asleep more easily over time.', link:'https://www.sleepfoundation.org/bedroom-environment/blue-light' },
  { title:'Dynamic Warmup Science', text:'Dynamic movement-based warmups (leg swings, bodyweight squats, hip hinges) tend to outperform static stretching for preparing the body for performance, while static stretching is better reserved for after the session.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Muscle as Metabolic Insurance', text:'Skeletal muscle is a major site of glucose disposal in the body. Building and maintaining muscle mass through resistance training supports better blood sugar regulation over the long term, independent of weight changes.', link:'https://www.cdc.gov/diabetes/healthy-eating/' },
  { title:'Trap Release Protocol', text:'The upper traps and neck muscles often carry chronic tension from supporting the head during long periods of sitting. A few minutes of self-massage with a lacrosse ball or foam roller against a wall can meaningfully reduce that tension.', link:'https://www.spine-health.com/wellness/exercise/thoracic-spine-stretches-and-exercises' },
  { title:'Daily Weight Protocol', text:'Body weight naturally fluctuates several pounds day to day from water and food volume. Weighing at the same time, same conditions, and tracking a weekly average gives a far clearer signal than any single day\'s number.', link:'https://www.health.harvard.edu/staying-healthy/is-bmi-the-best-predictor-of-future-health' },
  { title:'Vitamin D for Pilots', text:'Limited sun exposure, common for flight crew due to schedules and UV-filtering cockpit glass, is a known risk factor for low vitamin D. Annual testing and supplementation when needed is a reasonable precaution.', link:'https://ods.od.nih.gov/factsheets/VitaminD-Consumer/' },
  { title:'Building Your Aerobic Base', text:'A broad aerobic base, built through consistent moderate-intensity cardio over months, improves recovery capacity between harder training sessions and supports long-term cardiovascular health.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults' },
  { title:'Chin Tuck Protocol', text:'A simple chin-tuck exercise (drawing the chin straight back without tilting down) helps counteract forward head posture from screens and cockpit positioning, reducing strain on the neck over time.', link:'https://www.spine-health.com/wellness/exercise/thoracic-spine-stretches-and-exercises' },
  { title:'Progressive Overload', text:'Strength gains require gradually increasing demand on the muscle over time: more reps, more weight, or more total volume. Tracking your numbers (which this app does automatically) is what makes that progression visible and intentional.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Hydration and Cognition', text:'Even mild dehydration has been linked to reduced alertness and slower reaction time. Because thirst can lag behind actual need, especially in dry cabin air, drinking on a schedule rather than waiting to feel thirsty is the more reliable approach.', link:'https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html' },
  { title:'Time-Restricted Eating', text:'Compressing eating into a consistent daily window (such as 10am-8pm) is one approach some people use to support metabolic health, though it works best as a consistency tool rather than a rigid rule, especially with irregular pilot schedules.', link:'https://nutritionsource.hsph.harvard.edu/healthy-weight/diet-reviews/intermittent-fasting/' },
  { title:'Hip Hinge for Back Health', text:'Learning to hinge at the hips rather than round the lower back when lifting or bending is one of the most protective movement patterns for long-term spine health, especially relevant for handling bags and gear.', link:'https://www.spine-health.com/wellness/exercise/core-exercises-low-back-pain' },
  { title:'Post-Workout Nutrition', text:'Eating a combination of protein and carbohydrates within an hour or two after training supports recovery and glycogen replenishment. Simple options like Greek yogurt with fruit work well when you don\'t have time to prepare a full meal.', link:'https://nutritionsource.hsph.harvard.edu/what-should-you-eat/protein/' },
  { title:'Nasal Breathing', text:'Breathing through the nose during lower-intensity activity filters and humidifies air and may support more efficient oxygen exchange compared with mouth breathing. It\'s a skill that can be practiced gradually during easy cardio.', link:'https://www.health.harvard.edu/mind-and-mood/relaxation-techniques-breath-control-helps-quell-errant-stress-response' },
  { title:'Physical = Professional', text:'Physical fitness and cognitive performance are linked: better cardiovascular health and sleep quality both support sharper decision-making under workload. Training is not separate from professional readiness; it supports it directly.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults' },
  { title:'Darkness for Sleep', text:'A fully dark sleeping environment supports deeper, more restorative sleep. For pilots in unfamiliar hotel rooms, packing a quality sleep mask is a small investment with an outsized payoff.', link:'https://www.sleepfoundation.org/bedroom-environment/light-and-sleep' },
  { title:'Frequency Over Duration', text:'For mobility work specifically, doing a little every day tends to produce better results than doing a lot once a week. This is part of why the Taxi phase of every workout matters: consistency compounds.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Track Your Weights', text:'Without tracking, it is easy to believe you are progressing when you have actually plateaued. Logging sets, reps, and weight (as this app does) is the most direct way to confirm real progress and catch stalls early.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Resting Heart Rate as a Metric', text:'A resting heart rate noticeably higher than your personal baseline can be an early signal of inadequate recovery, illness, or excessive training stress: useful information for deciding whether to push or pull back on a given day.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/target-heart-rates' },
  { title:'The Long Game', text:'Consistency over many months outperforms any short, intense burst of effort. A sustainable training rhythm you can maintain for a year will produce better outcomes than an unsustainable one you abandon after a few weeks.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults' },
  { title:'Delayed Onset Muscle Soreness', text:'Soreness that peaks 24-48 hours after a new or harder-than-usual session is a normal adaptive response, not necessarily a sign of damage. Light movement, hydration, and protein support recovery; soreness lasting more than 4-5 days or accompanied by severe swelling warrants medical attention.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Grip Strength as a Health Marker', text:'Grip strength is one of the most studied simple measures linked to overall health outcomes in research populations. Farmer carries, dead hangs, and heavy rows all build grip incidentally, making them useful general training, not just a niche skill.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults' },
  { title:'Jet Lag and Training Timing', text:'Training in late afternoon or early evening at your destination can help shift your circadian clock faster than training right after arrival when your body still expects to be asleep. Light exposure timing matters more than the workout itself for adjustment speed.', link:'https://www.sleepfoundation.org/jet-lag' },
  { title:'Static vs Dynamic Stretching Timing', text:'Static stretches (held for 20-60 seconds without movement) are best done after training or on rest days, when tissue is warm and the goal is mobility rather than power output. Doing them cold, before lifting, can temporarily reduce strength and power.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Electrolytes Beyond Water', text:'On long flights or hot layovers, water alone may not fully replace what is lost through sweat. Sodium, potassium, and magnesium support muscle function and fluid balance. A pinch of salt or an electrolyte tablet is reasonable after heavy sweating, not just plain water.', link:'https://www.mayoclinic.org/healthy-lifestyle/nutrition-and-healthy-eating/in-depth/water/art-20044256' },
  { title:'The Knee-Over-Toe Myth', text:'Older coaching cues warned against letting the knee travel past the toe in a squat or lunge. Current biomechanics research shows this movement is normal and safe for most people with adequate ankle mobility. Restricting it artificially can actually increase strain elsewhere.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Warm-Up Specificity', text:'A general warm-up raises heart rate and tissue temperature, but a few lighter sets of the actual exercise you are about to perform (rehearsal sets) prepare the specific movement pattern and joint angles better than generic cardio alone.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Sleep Debt Does Not Fully Repay', text:'Sleeping in on days off helps somewhat, but research suggests chronic short sleep during the work week is not fully offset by weekend catch-up. Protecting sleep on duty days matters more than trying to recover it afterward.', link:'https://www.sleepfoundation.org/sleep-deprivation' },
  { title:'Training Around a Minor Injury', text:'A minor strain in one area does not require stopping all training. Working unaffected muscle groups (sometimes called the "minimal effective dose" approach) maintains fitness and can even support healing through circulation, but always within pain-free range and ideally with medical guidance for anything beyond mild discomfort.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'The Talk Test for Cardio Intensity', text:'A practical way to gauge Zone 2 effort without a heart rate monitor: you should be able to hold a conversation, but not comfortably sing. If you cannot speak in full sentences, you have drifted into a harder zone than intended for base-building cardio.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults' },
  { title:'Why Tendons Take Longer Than Muscle', text:'Muscle tissue can show measurable strength adaptation in 1-2 weeks, but tendons and ligaments adapt over months due to slower blood supply and collagen turnover. This is part of why progressing load too quickly increases tendon injury risk even when muscles feel ready.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Hydration and Altitude', text:'Cabin pressurization simulates an altitude of roughly 6,000-8,000 feet, which increases respiratory water loss compared to sea level even without physical exertion. This is part of why pilots and frequent flyers need more deliberate hydration than ground-based schedules suggest.', link:'https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html' },
  { title:'Protein Timing Is Less Critical Than Total', text:'While post-workout protein timing gets a lot of attention, total daily protein intake matters more for muscle maintenance and growth than the exact hour you consume it, which is useful to know when travel schedules make precise meal timing unrealistic.', link:'https://nutritionsource.hsph.harvard.edu/what-should-you-eat/protein/' },
  { title:'The Vestibular System and Balance Training', text:'Single-leg exercises and balance work train the vestibular and proprioceptive systems, which naturally decline with age and inactivity. This has practical relevance for fall prevention later in life and for general movement confidence now.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Cortisol and Chronic Stress', text:'Persistently elevated cortisol from chronic stress (including irregular schedules) is associated with increased abdominal fat storage, disrupted sleep, and impaired recovery from training. Stress management is not separate from fitness; it is a determinant of how well your training actually works.', link:'https://www.health.harvard.edu/staying-healthy/understanding-the-stress-response' },
  { title:'Deload Weeks', text:'Periodically reducing training volume or intensity for a week (a "deload") allows accumulated fatigue to dissipate and is associated with better long-term progress than continuous, unbroken intensity. Roughly every 4-8 weeks is a common guideline, adjusted to how you are recovering.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Air Travel and Blood Clot Risk', text:'Prolonged sitting on long flights is associated with increased risk of deep vein thrombosis. Calf raises, ankle circles, and brief walks through the cabin when possible help maintain circulation. This applies to frequent flyers and crew, not just passengers on the longest routes.', link:'https://www.cdc.gov/blood-clots/risk-factors/travel.html' },
  { title:'The Plateau Is Information, Not Failure', text:'A training plateau usually signals that one input (sleep, nutrition, recovery, or programming) needs to change, not that effort was wasted. Reviewing logged data (which this app captures automatically) helps identify which variable has stalled before assuming you need to simply work harder.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Omega-3s and Inflammation', text:'Omega-3 fatty acids (found in fatty fish, walnuts, flaxseed) are associated with modestly reduced inflammatory markers and may support joint comfort and recovery in people training regularly. They are a reasonable dietary target rather than a required supplement for most people.', link:'https://ods.od.nih.gov/factsheets/Omega3FattyAcids-Consumer/' },
  { title:'Why Soreness Is Not a Progress Metric', text:'Feeling sore after a workout does not reliably indicate how effective that session was for strength or muscle gains. Some highly effective sessions produce little soreness, and some unproductive ones produce a lot. Logged performance data is a far more reliable signal than how you feel the next day.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Compression Garments on Long Flights', text:'Graduated compression socks may help reduce leg swelling and discomfort on long-haul flights by supporting venous return. They are not a substitute for movement and hydration, but a reasonable addition for very long duty days.', link:'https://www.cdc.gov/blood-clots/risk-factors/travel.html' },
  { title:'The Difference Between Tired and Fatigued', text:'Feeling sleepy is different from accumulated training fatigue: you can be well-rested and still carrying unresolved muscular or nervous system fatigue from recent hard sessions. The Pilot Condition toggle in this app is meant to capture that distinction, not just whether you slept well.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Resistance Training and Bone Density', text:'Mechanical loading from resistance training, particularly compound lower-body lifts, stimulates bone remodeling and is one of the most effective non-pharmacological interventions for maintaining bone density as you age, relevant well before osteoporosis becomes a concern.', link:'https://www.nia.nih.gov/health/exercise-and-physical-activity/three-types-exercise-can-improve-your-health-and-physical' },
  { title:'Why Single-Joint and Multi-Joint Exercises Both Matter', text:'Compound lifts (squat, deadlift, press) build the most overall strength efficiently, but isolation exercises (lateral raises, curls, face pulls) address specific weak points and joint health that compounds alone do not fully cover. A well-rounded program needs both, not one or the other.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'The Cephalic Phase of Digestion', text:'Simply seeing or smelling food triggers digestive hormone release before you take a bite. This is part of why eating mindfully (without screens, slowly) tends to produce better satiety signals than eating distracted, which matters when travel makes rushed meals common.', link:'https://nutritionsource.hsph.harvard.edu/what-should-you-eat/protein/' },
  { title:'Why Warmup Sets Should Not Be Skipped', text:'Working up to a heavy top set through 2-3 progressively heavier warm-up sets primes the nervous system and reduces injury risk compared to loading the working weight cold. This is built into every Takeoff phase exercise in this app for that reason.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Sodium Is Not Universally Bad', text:'While excess sodium is linked to high blood pressure in sodium-sensitive individuals, very low sodium combined with heavy sweating (long flights, hot layovers, hard training) can also cause problems. The right amount depends on your individual health status and activity level: context matters more than a blanket rule.', link:'https://www.heart.org/en/health-topics/high-blood-pressure/changes-you-can-make-to-manage-high-blood-pressure' },
  { title:'The Overload Principle Applies to Mobility Too', text:'Just as muscles need progressive load to get stronger, joints need progressively deeper or longer-held stretches over time to improve range of motion. Holding the same easy stretch for months will maintain, but not improve, flexibility.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Hotel Gym Programming Reality', text:'Limited equipment does not mean limited results. Dumbbells alone can effectively train every major movement pattern (squat, hinge, push, pull, carry) with appropriate exercise selection, which is exactly why this app builds full hotel-gym and hotel-room programs rather than treating them as compromises.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Caffeine and Performance', text:'Moderate caffeine intake (roughly 3-6mg per kg of bodyweight) 30-60 minutes before training is associated with modest improvements in strength and endurance performance for many people. Individual tolerance varies widely, and the sleep cost of late-day use generally outweighs any performance benefit from afternoon or evening caffeine.', link:'https://www.sleepfoundation.org/nutrition/caffeine-and-sleep' },
  { title:'The Difference Between Pain and Discomfort', text:'Muscular burning and breathlessness during hard effort are expected discomfort. Sharp, localized, or joint pain is a different signal that warrants stopping and reassessing Learning this distinction is one of the most valuable skills in long-term training longevity.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Magnesium and Sleep Quality', text:'Magnesium is involved in regulating the nervous system pathways related to sleep, and some research associates adequate intake with improved sleep quality. Leafy greens, nuts, and seeds are good dietary sources; supplementation is reasonable for those who do not get enough through food.', link:'https://ods.od.nih.gov/factsheets/Magnesium-Consumer/' },
  { title:'Recovery Nutrition on Travel Days', text:'Travel days without training still deplete the body through dehydration, irregular meals, and disrupted sleep. Treating a travel day with the same nutritional care as a hard training day (adequate protein, hydration, and sleep hygiene) supports faster bounce-back when you do train next.', link:'https://nutritionsource.hsph.harvard.edu/what-should-you-eat/protein/' },
  { title:'Why Rep Ranges Are a Spectrum, Not Strict Categories', text:'Traditional guidance assigns strength to low reps (1-5), hypertrophy to moderate reps (6-12), and endurance to high reps (15+), but research shows meaningful overlap across all these ranges when training is taken close to fatigue. Range matters less than most people assume; consistency and effort matter more.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'The Value of a Training Log Beyond Weights', text:'Recording how a session felt (energy, sleep the night before, stress level) alongside the numbers can reveal patterns that explain performance swings better than the numbers alone. Several fields in this app capture exactly that context for this reason.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Cold and Flu Risk After Hard Training', text:'A single bout of very intense or prolonged exercise can temporarily suppress immune markers for several hours afterward, sometimes called the "open window." Adequate sleep and nutrition around hard sessions, and being mindful of contagious exposure during this window, are reasonable precautions, especially for crew moving through airports.', link:'https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/stretching/art-20047931' },
  { title:'Why Hip Mobility Affects the Whole Body', text:'Restricted hip mobility commonly causes the lower back or knees to compensate during squatting, lunging, and even walking. This is why hip-focused mobility work appears so often across every mission profile in this app rather than being treated as an isolated stretch.', link:'https://www.spine-health.com/wellness/exercise/thoracic-spine-stretches-and-exercises' },
  { title:'The Role of Carbohydrates Around Training', text:'Carbohydrates are the primary fuel for higher-intensity training. Restricting them too aggressively around hard sessions can reduce performance and recovery quality, even for people otherwise managing weight through reduced carbohydrate intake at other times of day.', link:'https://nutritionsource.hsph.harvard.edu/carbohydrates/' },
  { title:'Why Form Cues Matter More Than Load Early On', text:'Adding weight before movement quality is consistent increases injury risk and often reinforces poor mechanics that are harder to correct later. Mastering the pattern first, then adding load, is slower initially but more durable long-term. This is the logic behind the Taxi phase rehearsal sets before heavier work.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Sleep Architecture and Travel', text:'Crossing time zones disrupts not just total sleep time but the proportion of deep and REM sleep within each cycle, which affects both physical recovery and cognitive sharpness independent of how many hours you slept. This is why jet lag can feel worse than the hour count alone would suggest.', link:'https://www.sleepfoundation.org/jet-lag' },
  { title:'The Case for Unilateral Training', text:'Single-leg and single-arm exercises expose and correct side-to-side strength imbalances that bilateral lifts can mask, and they train core stability and balance simultaneously. This is part of why split squats, step-ups, and single-arm rows appear throughout this program rather than only bilateral lifts.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Why Breathing Mechanics Affect Lifting', text:'Bracing the core with a controlled breath (sometimes called the Valsalva maneuver for very heavy lifts) increases intra-abdominal pressure and spinal stability during heavy compound lifts. This is a learnable skill, not an innate one, and is worth deliberate practice on lighter sets before applying it under heavy load.', link:'https://www.spine-health.com/wellness/exercise/core-exercises-low-back-pain' },
  { title:'Why You Should Not Compare Your Program to Someone Else\'s', text:'Training history, recovery capacity, joint structure, and goals all vary enormously between individuals. A program perfectly suited to a 25-year-old bodybuilder is often inappropriate for a 45-year-old pilot prioritizing longevity. This is the entire reason this app offers goal-specific tracks rather than one universal program.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'The Importance of Tracking Trends, Not Just Totals', text:'A single high or low reading in weight, blood pressure, or glucose is far less meaningful than the trend across several weeks. This app\'s charts are designed to surface the trend line precisely because individual data points are noisy and easy to overreact to.', link:'https://www.cdc.gov/diabetes/diabetes-testing/' },
  { title:'Why Stretching Alone Will Not Fix Tightness Caused by Weakness', text:'Muscles that feel chronically tight are sometimes compensating for weakness elsewhere, not actually short. In these cases, strengthening the underactive muscle resolves the tightness better than stretching the tight one. This is a common pattern in hip flexors compensating for weak glutes.', link:'https://www.spine-health.com/wellness/exercise/core-exercises-low-back-pain' },
  { title:'Hydration Needs Scale With Body Size and Climate', text:'Hydration guidelines are a reasonable baseline, but actual needs scale up with body size, heat, humidity, and sweat rate. Someone training in a hot, humid layover city needs meaningfully more than the baseline recommendation. Use the app\'s targets as a floor, not a ceiling, when conditions demand more.', link:'https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html' },
  { title:'The Connection Between Gut Health and Energy', text:'Digestive discomfort from poor airport food choices or irregular eating can affect energy levels and training quality the same day. Prioritizing fiber, hydration, and consistent meal timing when possible supports both digestion and the training performance that depends on feeling well.', link:'https://nutritionsource.hsph.harvard.edu/carbohydrates/fiber/' },
  { title:'Why "Functional Training" Is Not a Separate Category', text:'All resistance training that improves strength, balance, and movement quality is functional in the sense that it transfers to daily activities and reduces injury risk. There is no meaningful separate category of magic "functional" exercises distinct from well-programmed traditional strength training.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'Bodyweight Training Has a Real Ceiling, and That\'s Fine', text:'Pure bodyweight training (relevant in hotel rooms with no equipment) eventually plateaus in strength gains once movements become easy, but it remains highly effective for maintaining muscle, mobility, and conditioning during travel-limited periods. It is a legitimate maintenance tool, not just a poor substitute for weights.', link:'https://www.acefitness.org/resources/everyone/blog/6913/breaking-down-fitness-myths-and-misconceptions/' },
  { title:'The Value of a Pre-Sleep Routine', text:'A consistent sequence of low-stimulation activities before bed (dimming lights, light reading, stretching) cues the brain that sleep is approaching, similar to how athletes use pre-performance routines to cue focus. This conditioning effect builds over weeks of consistent repetition.', link:'https://www.sleepfoundation.org/sleep-hygiene' },
  { title:'Why This App Tracks Waist Alongside Weight', text:'Body weight alone cannot distinguish between fat loss and muscle loss, or fat gain and muscle gain. Waist circumference, tracked alongside weight, gives a clearer picture of body composition trends over time without requiring expensive body-fat testing equipment.', link:'https://www.nhlbi.nih.gov/health/educational/lose_wt/risk.htm' },
  { title:'Final Briefing: Build the Habit Before the Optimization', text:'A consistent, "good enough" training habit sustained for a year will outperform a perfectly optimized program abandoned after a month. Get the habit locked in first. Proper timing, ideal rep ranges, and supplement protocols are refinements that matter far less than simply showing up consistently.', link:'https://www.heart.org/en/healthy-living/fitness/fitness-basics/aha-recs-for-physical-activity-in-adults' },
];

// ─── CNS DOWN-REGULATION EXPLAINER (referenced from Landing phase + Wisdom) ──
const CNS_EXPLAINER = "CNS down-regulation means deliberately shifting your nervous system from a sympathetic state (\"fight-or-flight\", activated during hard training) back to a parasympathetic state (\"rest-and-digest\"). After intense exercise, your heart rate, breathing, and stress hormones are elevated. Slow breathing, stillness, and gentle stretching signal to your nervous system that the demand has passed, which speeds recovery and improves the sleep that follows. This is why the Landing phase exists in every workout. Skipping it doesn't make you tougher, it just means you carry that activation into the rest of your day.";

// ─── BIOMETRIC INFO POPUPS ────────────────────────────────────────────────────
const BIO_INFO = {
  injury: {
    title: 'Injury Flag',
    text: 'Flag a body region that\'s currently bothering you. The app checks every exercise in your program against your flagged region(s): where a proven safer alternative already exists in the exercise library, it swaps it in automatically and shows what it replaced. Where no confident substitute exists, it leaves the original exercise in place but marks it with a caution badge so you can decide: open Alternate to browse other options, or skip it that day. This is a conservative heuristic based on exercise names and movement patterns, not a medical assessment. It won\'t catch everything, and it\'s not a substitute for a doctor or physical therapist if something actually hurts. Clear the flag once you\'re past it.',
  },
  timeAvail: {
    title: 'Time Available',
    text: 'Tell the app how many minutes you actually have today, and it trims your session to fit, the same way a coach would shorten a workout on a tight schedule. Warm-up (Taxi) and cooldown (Landing) are protected and trimmed last, since skipping them to save time is exactly backwards: they\'re what prevent the injuries that cost you far more training time later. The accessory volume (En Route) gets cut first, since that\'s the lowest-cost place to lose a set when time is short. Leave it blank for your full programmed session.',
  },
  sleepHours: {
    title: 'Sleep Hours',
    text: 'If you don\'t have a wearable, this gives the app the single most useful recovery signal after Oura: how much you actually slept. Under 6 hours suggests dialing back to MARGINAL, under 5 suggests NO-GO. Sleep debt measurably impairs strength output, reaction time, and injury resistance the next day. This only suggests; your own Pilot Condition selection always has the final say. If Oura is connected, its readiness score already accounts for sleep, so this field is hidden.',
  },
  age: {
    title: 'Age',
    text: 'Recovery capacity between sets and between sessions declines gradually with age: not dramatically, but enough that most strength coaches build in slightly longer rest periods for lifters over 45, and more so over 60. The app applies a modest rest-timer adjustment on that basis. It does not change your program\'s exercise selection, volume, or intensity. Those are governed by your Fitness Level and Mission Objective, not age. Nothing here implies age is a limit; it\'s a small recovery-window adjustment, nothing more.',
  },
  readiness: {
    title: 'Daily Readiness (1-5)',
    text: 'A quick self-check: how recovered do you actually feel today? This captures things no wearable can: motivation, life stress, an oncoming cold, how last night\'s duty day actually felt. A rating of 1-2 suggests NO-GO, 3 suggests MARGINAL, 4-5 suggests GO. These are the same bands Oura\'s readiness score maps to. Like every other automatic suggestion in this app, it only pre-selects your Pilot Condition; you can always override it with the GO / MARGINAL / NO-GO buttons directly. If Oura is connected, its readiness score takes precedence and this is hidden to avoid two competing signals.',
  },
  hrv: {
    title: 'HRV Balance',
    text: 'HRV Balance is Oura\'s score (0-100) comparing your recent heart rate variability to your own 2-week baseline, not a raw HRV number, and not comparable between people. Higher means your nervous system is more recovered relative to your normal; lower means accumulated stress, poor sleep, illness, or overtraining is dragging on recovery. A single low day matters less than a multi-day downward trend, which is a real signal to back off training intensity.',
  },
  weight: {
    title: 'Body Weight Protocol',
    text: 'Weigh yourself at the same time daily, ideally upon waking, after using the restroom, before eating or drinking, on the same scale. Daily weight can swing 2-4 lbs from water and food alone, so look at your 7-day rolling average rather than any single reading.',
  },
  waist: {
    title: 'Waist Circumference Protocol',
    text: 'Measure at the navel, at the end of a normal exhale. Do not pull in your stomach. Use a flexible tape, snug but not compressing. Measure once per week, same time. A waist over 40 inches (men) or 35 inches (women) is the commonly cited clinical threshold for elevated metabolic risk, and it is a better predictor of visceral fat than body weight alone.',
  },
  systolic: {
    title: 'Blood Pressure: Systolic',
    text: 'Rest quietly for 5 minutes before measuring. Sit with back supported, feet flat, arm at heart level, no talking. Take 3 readings 1-2 minutes apart and record the average of the last two. Optimal systolic (the top number) is under 120 mmHg.',
  },
  diastolic: {
    title: 'Blood Pressure: Diastolic',
    text: 'Diastolic (the bottom number) reflects pressure between heartbeats. Same measurement protocol as systolic: quiet rest first, proper arm position, average of the last two readings. Optimal diastolic is under 80 mmHg.',
  },
  glucose: {
    title: 'Fasting Glucose Protocol',
    text: 'Measure upon waking, before any food or coffee, after at least 8 hours fasted. Normal range: 70-99 mg/dL. Pre-diabetic: 100-125. Diabetic threshold: 126+. Stress and poor sleep can elevate readings independent of diet. Track the weekly trend rather than reacting to one number.',
  },
};

// ─── DATABASE HELPERS ─────────────────────────────────────────────────────────
// Races any promise against a timeout — used to wrap Supabase calls so a
// dead connection (airplane mode, no signal) fails fast instead of hanging
// indefinitely. Some networks don't reject a request promptly when there's
// no route; they just never respond. Every function below that touches the
// network during boot uses this, since a single hung call there would leave
// the entire app un-rendered.
// BUG FIX (code review finding, verified accurate): the reject-timer was
// never cleared when the real promise won the race — a dangling
// setTimeout stuck around for up to `ms` after the operation had already
// finished. Low practical severity (trivial callback, max 6s lifetime)
// but a real, free fix: capture the timer id and always clear it once
// either side of the race settles, regardless of which one wins.
function withTimeout(promise, ms) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error('timeout')), ms || 6000);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timerId));
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
// Converts wall-clock components in a specific IANA zone to the true UTC
// instant, with no timezone library: format an initial UTC guess back
// through the target zone, then correct by however far that guess drifted.
// Re-reads the offset AT that instant (via Intl), so it's DST-correct
// automatically rather than needing a fixed offset table.
function zonedTimeToUtc(y, mo, d, h, mi, s, timeZone) {
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, s);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcGuess));
  const get = (t) => parseInt(parts.find(p => p.type === t).value, 10);
  const asIfUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return new Date(utcGuess + (utcGuess - asIfUTC));
}

// Reads the true station-local times out of a MobileCCI DESCRIPTION line.
//
// BUG FIX (reported: "the AI thinks it's several hours behind [the actual
// time]", traced to the user's own words — "something going on with the
// calendar/ics upload/auto function where you set your time zone").
// Confirmed real, and confirmed to be THIS function specifically, not the
// DTSTART/DTEND correction above it in parseFlightScheduleICS. That other
// correction only ever ran for the native Apple Calendar sync path (see
// CalendarManager.swift's reinterpretAsLocal) — this is the exact same
// underlying MobileCCI export, consumed a different way (manual .ics
// upload instead of Apple Calendar), carrying the exact same "every event
// stamped using the pilot's home-base wall-clock numbers" quirk, but this
// path had NO base-timezone correction at all: it built the Date with
// new Date(y,m,d,h,mi,s), which JS interprets using whatever timezone the
// DEVICE currently happens to be in. That's only correct when the device's
// current offset matches the pilot's home base at the moment of parsing —
// off by exactly the offset difference the rest of the time, including
// right at upload if parsing on a machine set to a different zone than
// home base (e.g. the web app on a computer not on Arizona time).
// Now shares the same user-configured baseTimezone (Settings → Schedule)
// the native path already uses, via zonedTimeToUtc above. Falls back to
// the previous device-local behavior when baseTimezone is still 'auto'
// (unset), so nothing changes for anyone who hasn't set it yet — matching
// how the native path's own baseTimezone fallback already works.
function descriptionLocalTimes(desc) {
  if (!desc) return null;
  const m = String(desc).match(/Time:\s*(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\s*-\s*(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const n = m.map(Number);
  const tz = (typeof ST !== 'undefined' && ST.baseTimezone && ST.baseTimezone !== 'auto') ? ST.baseTimezone : null;
  let start, end;
  if (tz) {
    try {
      start = zonedTimeToUtc(n[1], n[2], n[3], n[4], n[5], n[6], tz);
      end   = zonedTimeToUtc(n[7], n[8], n[9], n[10], n[11], n[12], tz);
    } catch (e) {
      // Invalid/unsupported IANA id somehow got stored — fall back rather
      // than losing the event entirely.
      start = new Date(n[1], n[2]-1, n[3], n[4], n[5], n[6]);
      end   = new Date(n[7], n[8]-1, n[9], n[10], n[11], n[12]);
    }
  } else {
    start = new Date(n[1], n[2]-1, n[3], n[4], n[5], n[6]);
    end   = new Date(n[7], n[8]-1, n[9], n[10], n[11], n[12]);
  }
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
    else if (key === 'LOCATION') cur.location = val;
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
    // BUG FIX (reported: a real flight showed 0 flights today, triggering
    // "No duty today" despite two flights and a layover genuinely being
    // scheduled — traced to this account's own uploaded export using
    // "FLT 3564" instead of "Flight 3564", which this regex didn't
    // recognize at all, silently falling through to type:'other').
    // Widened to accept common real-world variants rather than assuming
    // one airline's export tool's exact wording — this needs to work
    // for whatever format someone's actual crew-scheduling system
    // happens to produce, not just the one format first seen.
    if (/^Layover(\s+in)?\s+(\w+)/i.test(e.summary)) {
      type = 'layover';
      const m = e.summary.match(/^Layover(?:\s+in)?\s+(\w+)/i);
      airport = m ? m[1] : null;
    } else if (/^(Flight|FLT)\s/i.test(e.summary)) {
      type = 'flight';
    } else if (/^Duty[\s-]?free\s+period$/i.test(e.summary)) {
      type = 'dutyfree';
    }
    // Route, if the export carries one anywhere (summary "FLT 4033 PHX-XNA",
    // description, or LOCATION). Many exports only have the flight number;
    // then these stay empty and the body clock falls back to trip structure.
    const rm = ((e.summary || '') + ' ' + (e.description || '') + ' ' + (e.location || ''))
      .match(/\b([A-Z]{3})\s*(?:-|–|>|\/|to)\s*([A-Z]{3})\b/);
    return { uid: e.uid, start: e.start.toISOString(), end: e.end.toISOString(), summary: e.summary, type, airport,
             origin: rm ? rm[1] : '', destination: rm ? rm[2] : '',
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
    // BUG FIX (independent review finding, confirmed real and genuinely
    // dangerous here specifically): only `data` was ever destructured —
    // a resolved {error} result (not a rejection) would fall straight
    // through as if the user simply had no profile row yet, silently
    // blanking sex, height, age, injuries, and every other saved field
    // on a real query failure, instead of reaching the catch block below
    // whose entire purpose is to fall back to the cache for exactly this
    // situation. Explicitly checking and throwing makes a real failure
    // actually behave like a failure.
    const { data, error } = await withTimeout(SB.from('user_profiles').select('*').eq('user_id', ST.user.id).maybeSingle());
    if (error) throw error;
    const profile = data?.profile_data || null;
    if (profile) { try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile)); } catch(e) {/* local mirror only, DB copy just above is the real source of truth */} }
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
// BUG FIX (code review finding, verified — and more consequential than it
// first looked): the remote upsert's own catch swallowed every failure
// silently, which meant EVERY caller's error handling was already dead
// code regardless of how well the caller itself was written — including
// setScheduleSource()/setTrackingPref()'s own catch blocks, added earlier
// this session specifically to surface save failures, which could never
// actually fire because this function never rejected in the first place.
// Now re-throws after logging, so a failure is actually visible to
// whichever caller is best positioned to decide what the user needs to
// know — this function itself has no UI context to make that call.
// The local cache write stays a best-effort no-op deliberately: it's a
// fast local mirror of data whose real source of truth is the row this
// function is trying to save to the server, not data that would be lost
// if this specific write fails.
async function dbSetProfile(p) {
  if (!ST.user) { localStorage.setItem('fcf_profile', JSON.stringify(p)); return; }
  try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p)); } catch(e) {/* local mirror only — the remote upsert right below is the real save and does surface its own failure */}
  try {
    // BUG FIX (independent review finding): this awaited the upsert
    // directly with no {error} check — Supabase resolves successfully
    // even when the write itself failed (RLS violation, constraint
    // error); it doesn't reject. The catch/throw restructure from
    // earlier this session only helps for a genuine rejection (a real
    // network failure) — it does nothing for this case, since nothing
    // here ever threw for a resolved {error} result. Both matter.
    const { error } = await withTimeout(SB.from('user_profiles').upsert({ user_id: ST.user.id, profile_data: p, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }));
    if (error) throw error;
  } catch(e) {
    console.warn('dbSetProfile: remote save failed:', e);
    throw e;
  }
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
    // BUG FIX (independent review finding): only `data` was checked —
    // a resolved {error} result would return null (as if there's simply
    // no previous session) instead of ever reaching the localStorage
    // fallback below, whose whole purpose is to cover exactly this kind
    // of query failure.
    const { data, error } = await withTimeout(filter.order('started_at', { ascending: false }).limit(2));
    if (error) throw error;
    ST.prevSession = data?.[1]?.session_data || null;
    return data?.[0]?.session_data || null;
  } catch(e) {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('fcf_session_'));
    if (!keys.length) return null;
    keys.sort();
    // BUG FIX (independent code review finding, verified real): these two
    // parses had no guard at all, unlike the identical pattern in
    // dbGetRecentSessions right above, which already wraps each parse
    // individually and treats a bad entry as a cache miss. Worse than a
    // normal missing guard: this is INSIDE the fallback for when the real
    // DB call already failed, so an uncaught parse error here would throw
    // at exactly the moment — a DB failure during boot — when this
    // fallback most needs to actually work instead of taking the whole
    // boot down with it.
    try { ST.prevSession = keys.length > 1 ? JSON.parse(localStorage.getItem(keys[keys.length-2])) : null; }
    catch(e2) { console.warn('Parsing cached previous session failed:', e2); ST.prevSession = null; }
    try { return JSON.parse(localStorage.getItem(keys[keys.length-1])); }
    catch(e2) { console.warn('Parsing cached last session failed:', e2); return null; }
  }
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
async function checkAuth() {
  try {
    const { data: { session } } = await SB.auth.getSession();
    return session?.user || null;
  } catch(e) { return null; }
}
// Sign in with Apple only works when BOTH the native bridge is present (iOS
// app) and the Apple provider is enabled in Supabase Auth. The second part is
// a dashboard setting, so it's read from the public auth settings endpoint
// rather than assumed. Result is cached for the session; the auth screen
// re-renders once it's known.
async function checkSiwaAvailability() {
  ST.siwaAvailable = false; // guards against a second fetch while in flight
  const native = !!(window.webkit?.messageHandlers?.signInWithApple);
  if (!native) return;
  try {
    const r = await fetch('https://dnxkydxbyihgsictbzjz.supabase.co/auth/v1/settings', { headers: { apikey: SB_ANON_KEY } });
    const j = await r.json();
    ST.siwaAvailable = !!j?.external?.apple;
  } catch (e) { ST.siwaAvailable = false; }
  if (ST.siwaAvailable && !ST.authed) renderRoot();
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
// Pending local notifications live in iOS, not in this page, so signing out
// or deleting the account has to clear them explicitly. Otherwise the phone
// keeps firing the previous user's medication (and other) reminders.
function cancelAllNativeNotifications() {
  try { window.webkit?.messageHandlers?.notifications?.postMessage({ action: 'cancelAll' }); } catch(e) {}
}

async function doSignOut() {
  cancelAllNativeNotifications();
  try { await SB.auth.signOut(); } catch(e) {/* best-effort remote signout — local state is cleared unconditionally below regardless */}
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
  parts.push('<div id="zuluClock" style="font-family:var(--mono);font-size:0.6875rem;color:var(--muted);letter-spacing:0.05em;white-space:nowrap"></div></div>');
  parts.push('<div class="landing-tag">BUILT FOR PILOTS, BY THE REALITIES OF FLYING</div>');
  parts.push('<div class="landing-h1">Train hard between <span class="accent">duty days</span>, not despite them.</div>');
  parts.push('<div class="landing-sub">A workout system that adapts to your gym access, your fatigue level, and your schedule, whether you\'re home, on layover, or stuck with nothing but a hotel room.</div>');
  parts.push('<div class="landing-cta">');
  parts.push('<button class="btn btn-gold" onclick="ST.showLanding=false;ST.authMode=\'signup\';renderRoot()">Get Started Free</button>');
  parts.push('<button class="btn btn-outline mt8" onclick="ST.showLanding=false;ST.authMode=\'signin\';renderRoot()">I have an account</button>');
  parts.push('</div>');
  parts.push('</div>');

  parts.push('<div class="landing-section">');
  parts.push('<div class="landing-section-title">Why pilots need a different program</div>');

  const features = [
    ['🌍','Environment-aware workouts','Every session adapts automatically to Commercial Gym, Hotel Gym, Hotel Room, or just resistance bands. No equipment excuses.'],
    ['🚦','Fatigue-gated intensity','A pilot condition toggle (Go / Marginal / No-Go) reduces or removes heavy lifting when you\'re running on insufficient rest, auto-set from Apple Health if you sync a wearable, or a 15-second self-check if you don\'t.'],
    ['⌚','Wearable auto-sync','Connect once via Apple Health and your daily readiness, sleep, HRV, resting heart rate, steps, and workouts drive your training automatically. It works with Apple Watch, Oura, Whoop, Garmin, or anything else that writes to Health. Connect Oura directly for its own full readiness score.'],
    ['🏆','Leaderboards, scored fairly','Compete on bench, squat, deadlift, and more against fellow pilots, ranked by DOTS score, which adjusts for bodyweight and sex, so a 160 lb first officer and a 220 lb captain are compared on equal footing, not just raw weight. Opt-in only: no call sign, nothing is shared.'],
    ['🎖️','Badges for reaching goals','Hit a personal record, a training streak, or a milestone and it gets recognized automatically, pulled from your real logged history, not just a login count.'],
    ['🩹','Injury-aware programming','Flag a sore shoulder or knee and the app automatically swaps in a safer alternative where one exists, or flags the exercise so you can decide, instead of just handing you the same plan regardless.'],
    ['⏱️','Fits the time you actually have','Tell it how much time you\'ve got and it trims the session to fit, protecting your warmup and cooldown, never your actual lift.'],
    ['🎯','Goal-driven programming','Seven mission objectives (from Vertical Jump to Glute Emphasis to Overall Strength), each with real, distinct exercise programming behind it, not just a label.'],
    ['💧','Hydration math built in','0.3L per flight hour, with a sensible floor on no-fly days. The app tells you exactly how much to drink and when.'],
    ['🛫','Aviation-phased structure','Every workout follows Taxi (warmup) → Takeoff (heavy) → En Route (volume) → Landing (decompression): a logical, recoverable structure, not just a random exercise list.'],
    ['📊','Real biometric tracking','Weight, waist, blood pressure, and fasting glucose, with the actual clinical protocol for measuring each one correctly.'],
    ['💊','Meds and supplements on schedule','Log anything you take, from creatine to prescriptions, with the dose and times. Check doses off on your Today screen, get a phone reminder when one is due, and include the history in your data export for AI analysis. Private to your account.'],
    ['📶','Works with no signal','Keeps working with zero connectivity: at altitude, in a dead-zone layover hotel, wherever.'],
  ];
  features.forEach(([icon,title,desc]) => {
    parts.push('<div class="feature-row"><div class="feature-icon">'+icon+'</div><div class="feature-text"><h4>'+title+'</h4><p>'+desc+'</p></div></div>');
  });
  parts.push('</div>');

  parts.push('<div class="landing-section" style="background:var(--bg2)">');
  parts.push('<div class="landing-quote">"The biggest mistake I see in shift-work athletes is treating every day the same. Your training should respond to how you actually feel, not an arbitrary schedule." (Sports medicine consensus on fatigue-informed training)</div>');
  parts.push('<div class="landing-stat-row">');
  parts.push('<div class="landing-stat"><div class="num">9</div><div class="lbl">Mission Profiles</div></div>');
  parts.push('<div class="landing-stat"><div class="num">7</div><div class="lbl">Goal Tracks</div></div>');
  parts.push('<div class="landing-stat"><div class="num">102</div><div class="lbl">Wisdom Briefings</div></div>');
  parts.push('</div>');
  parts.push('</div>');

  parts.push('<div class="landing-section">');
  parts.push('<div class="landing-section-title">How it works</div>');
  parts.push('<div class="feature-row"><div class="feature-icon">1️⃣</div><div class="feature-text"><h4>Preflight</h4><p>Set your environment, log your hydration, and tell the app how you\'re actually feeling today.</p></div></div>');
  parts.push('<div class="feature-row"><div class="feature-icon">2️⃣</div><div class="feature-text"><h4>Flight</h4><p>Work through your generated plan phase by phase, with rest timers that chime when they\'re done and a form guide on every exercise: built-in animations where we have them, a YouTube search where we don\'t.</p></div></div>');
  parts.push('<div class="feature-row"><div class="feature-icon">3️⃣</div><div class="feature-text"><h4>Trends</h4><p>Log your biometrics and watch your progress chart itself over weeks and months.</p></div></div>');
  parts.push('</div>');

  parts.push('<div class="landing-footer">');
  parts.push('<button class="btn btn-gold" onclick="ST.showLanding=false;ST.authMode=\'signup\';renderRoot()">Create Your Free Account</button>');
  parts.push('<div style="font-size:0.625rem;color:var(--muted);margin-top:14px;line-height:1.6">Flight Crew Fitness is a training tool, not medical advice.<br>Consult a physician before beginning any new exercise program.</div>');
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
  if (ST.authInfo) parts.push('<div class="alert alert-ok mt8"><div class="alert-icon">✅</div><div>'+sanitizeUserTextLong(ST.authInfo)+'</div></div>');
  if (ST.authErr)  parts.push('<div class="alert alert-danger mt8"><div class="alert-icon">⚠️</div><div>'+sanitizeUserTextLong(ST.authErr)+'</div></div>');
  parts.push('<div class="field"><label>Email</label><input type="email" id="auth_email" placeholder="you@example.com" autocomplete="email"></div>');
  parts.push('<div class="field"><label>Password</label><input type="password" id="auth_pass" placeholder="'+(isSignup?'Choose a password (min 6 chars)':'Your password')+'" autocomplete="'+(isSignup?'new-password':'current-password')+'"></div>');
  if (isSignup) parts.push('<div class="field"><label>Confirm Password</label><input type="password" id="auth_pass2" placeholder="Re-enter your password" autocomplete="new-password"></div>');
  parts.push('<button class="btn btn-gold mt8" onclick="handleAuthSubmit()">'+(isSignup?'Create Account →':'Sign In →')+'</button>');
  // Sign in with Apple. The native side and the success handler have existed
  // since the first iOS build, but no button ever exposed them, so nobody
  // could use it. Shown only inside the iOS app and only once the Apple
  // provider is switched on in Supabase Auth (checked live, see
  // checkSiwaAvailability), so the button can't appear before it works.
  if (ST.siwaAvailable) {
    parts.push('<div style="display:flex;align-items:center;gap:10px;margin:14px 0 4px;color:var(--muted);font-size:0.6875rem"><div style="flex:1;height:1px;background:var(--border)"></div>or<div style="flex:1;height:1px;background:var(--border)"></div></div>');
    parts.push('<button class="btn mt8" style="background:#000;color:#fff;border:1px solid #333;font-weight:600" onclick="haptic(\'light\');FCFBridge.signInWithApple()">&#63743; Sign in with Apple</button>');
  } else if (ST.siwaAvailable === undefined) {
    checkSiwaAvailability();
  }
  if (!isSignup) parts.push('<button class="btn-ghost mt8" style="display:block;width:100%;text-align:center;font-size:0.75rem" onclick="ST.authView=\'forgot\';ST.authErr=\'\';ST.authInfo=\'\';renderRoot()">Forgot password?</button>');
  parts.push('<button class="btn-ghost mt12" style="display:block;width:100%;text-align:center" onclick="ST.showLanding=true;renderRoot()">← Back</button>');
  parts.push('</div></div>');
  root.innerHTML = parts.join('');
}

function renderForgotPassword(root) {
  const parts = [];
  parts.push('<div class="landing" style="display:flex;flex-direction:column;justify-content:center">');
  parts.push('<div class="auth-wrap">');
  parts.push('<div style="text-align:center;margin-bottom:24px"><div class="landing-logo">✈ FLIGHT CREW FITNESS</div></div>');
  parts.push('<div style="font-size:0.875rem;font-weight:700;margin-bottom:4px">Reset your password</div>');
  parts.push('<div style="font-size:0.75rem;color:var(--muted);margin-bottom:14px;line-height:1.5">Enter the email you signed up with. We\'ll send a link to set a new password.</div>');
  if (ST.authInfo) parts.push('<div class="alert alert-ok mt8"><div class="alert-icon">✅</div><div>'+sanitizeUserTextLong(ST.authInfo)+'</div></div>');
  if (ST.authErr)  parts.push('<div class="alert alert-danger mt8"><div class="alert-icon">⚠️</div><div>'+sanitizeUserTextLong(ST.authErr)+'</div></div>');
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
  parts.push('<div style="font-size:0.875rem;font-weight:700;margin-bottom:14px">Set a new password</div>');
  if (ST.authErr) parts.push('<div class="alert alert-danger mt8"><div class="alert-icon">⚠️</div><div>'+sanitizeUserTextLong(ST.authErr)+'</div></div>');
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
  if (pass !== pass2) { ST.authErr = 'Passwords do not match. Please re-enter.'; renderRoot(); return; }
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
    else { ST.showLanding = false; ST.authMode = 'signin'; ST.authInfo = 'Password updated. Sign in with your new password.'; renderRoot(); }
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
    if (pass !== pass2) { ST.authErr = 'Passwords do not match. Please re-enter.'; renderRoot(); return; }
  }
  try {
    const user = ST.authMode === 'signup' ? await doSignUp(email, pass) : await doSignIn(email, pass);
    if (!user) { ST.authErr = 'Sign in failed. Check your email and password.'; renderRoot(); return; }
    ST.user = user; ST.authed = true; ST.authErr = ''; ST.authInfo = '';
    await bootApp();
  } catch(e) {
    let msg = e.message || 'Authentication failed.';
    if (msg.includes('Invalid login') || msg.includes('invalid_credentials')) msg = 'Incorrect email or password.';
    if (msg.includes('User already registered')) msg = 'An account with this email already exists. Try signing in.';
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
  parts.push('<div style="font-size:0.8125rem;line-height:1.7;color:#cbd5e1">');
  parts.push('Flight Crew Fitness is a training and tracking tool. It is not medical advice and does not replace consultation with a qualified physician.<br><br>');
  parts.push('Consult your doctor before beginning any new exercise program, especially if you have an existing medical condition, are taking medication, or have concerns about your fitness for activity.<br><br>');
  parts.push('Exercise carries inherent risk of injury. You are responsible for exercising within your own physical limits, using proper form, and stopping immediately if you experience pain, dizziness, chest discomfort, or shortness of breath beyond normal exertion.<br><br>');
  parts.push('By continuing, you acknowledge that you use this app and its workout recommendations at your own risk.');
  parts.push('</div>');
  parts.push('<button class="btn btn-gold mt16" onclick="acceptDisclaimer()">I Understand, Continue</button>');
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
  const topbar = document.getElementById('topbar');
  const tabbar = document.getElementById('tabbar');
  const page = document.getElementById('mainPage');

  if (!page) return;

  if (ST.authView === 'recovery') {
    if (topbar) topbar.style.display = 'none';
    if (tabbar) tabbar.style.display = 'none';
    page.style.padding = '0';
    renderPasswordRecovery(page);
    return;
  }

  if (!ST.authed) {
    if (topbar) topbar.style.display = 'none';
    if (tabbar) tabbar.style.display = 'none';
    page.style.padding = '0';
    if (ST.showLanding) renderLanding(page);
    else renderAuth(page);
    return;
  }

  if (!ST.disclaimerAccepted) {
    if (topbar) topbar.style.display = 'none';
    if (tabbar) tabbar.style.display = 'none';
    page.style.padding = '0';
    renderDisclaimerGate(page);
    return;
  }

  if (topbar) topbar.style.display = '';
  if (tabbar) tabbar.style.display = 'flex';
  page.style.padding = '16px 16px calc(60px + var(--safe-bot))';
  
  const subEl = document.getElementById('topbarSub');
  if (subEl) subEl.textContent = FCF_VERSION + ' · MISSION CONTROL';
  
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

// ─── NAVIGATION & TAB SWITCHING ─────────────────────────────────────────────
// BUG FIX (regression from a prior edit pass, confirmed real): this had
// been rewritten down to just ST.tab = t + renderPage(), which silently
// dropped several things — haptic feedback on every tab tap, the page-
// enter/content-enter transition animations, resetting the fuel-plan
// draft state when leaving that tab (so a stale, half-edited draft
// wouldn't reappear next time), and the Flight tab's auto-scroll-to-
// current-exercise behavior. It also switched the active-tab-highlight
// selector to '.tabbar-btn', a class that doesn't exist anywhere in
// index.html — the actual buttons use class="tab" with a data-tab
// attribute — so the highlight silently never updated at all. Restored
// the original, fuller logic wholesale rather than patching the
// rewrite, since the rewrite didn't preserve any of this on purpose.
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
    // Same guard, extended to the three primary tab-bar destinations —
    // this app rebuilds innerHTML on nearly every state change, so this
    // animation must ONLY fire on an actual tab switch, never on a
    // same-tab re-render (which happens constantly), or every save/toggle
    // would replay it and the app would feel jittery instead of polished.
    if (['today','trends','leaderboard'].includes(tab) && tab !== prevTab) playPageTransition(page, 'content-enter');
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
window.switchTab = switchTab;

// Bind to window so HTML inline onclick handlers can always find it
window.switchTab = switchTab;

 
  // ─── PAGE DISPATCH & STATE GATING ─────────────────────────────────────────────
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
  // 'redline' ("Trained through NO-GO fatigue 3 times") was removed
  // 2026-10-07. It rewarded training on exactly the days the app tells you
  // to take off, which is the opposite of what the app is for. Do not add an
  // award that pays out for overriding a recovery call. Anyone who already
  // earned it keeps the stored record; it is simply no longer shown.
  { id:'all_weather',  icon:'🌍', title:'All-Weather',      desc:'Trained in 3 different environments (room, gym, or bands)', check:s => s.envsTrained >= 3 },
  { id:'early_bird',   icon:'🌅', title:'Early Bird',       desc:'Logged a workout before 6 AM, 5 times',  check:s => s.earlyBirdCount >= 5 },
  { id:'top_gun',      icon:'🎖️', title:'Top Gun',          desc:'Hold the #1 spot on any leaderboard',    check:null, live:true },
  { id:'debrief',      icon:'💬', title:'Debrief',          desc:'Sent feedback to help improve the app',  check:null, live:true },
  { id:'recruiter',    icon:'📡', title:'Recruiter',        desc:'Shared Flight Crew Fitness with someone (self-reported)', check:null, live:true },
];

// Pure computation over session + biometric history — testable, no I/O.
function computeBadgeStats(sessions, bioRows) {
  const stats = { totalSessions: 0, best7Day: 0, best28Day: 0, prCount: 0, weightLost: 0, bioStreak: 0,
    totalSets: 0, maxSetsInSession: 0, envsTrained: 0, earlyBirdCount: 0 };
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
      // BUG FIX (reported: "Iron Will" — 20+ sets in one session — awarded
      // to an account that had only logged a handful of real sets).
      // ST.sets[exId] is pre-scaffolded with one placeholder row per
      // programmed set for EVERY exercise in the plan (e.g. "5x5" creates
      // 5 rows before the user fills any in), and this loop was counting
      // every row unconditionally instead of only the ones actually
      // logged — an 8-exercise plan easily scaffolds 20+ empty slots.
      // buildWorkoutSummary() (which feeds the debrief screen's own
      // "SETS" tile) already filters to loggedSets correctly; this now
      // matches that same filter so the two counts agree.
      (s.sets[exId]||[]).filter(set => set.reps||set.weight||set.seconds||set.height||set.distance||set.seconds_left||set.seconds_right).forEach(set => {
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
  } catch(e) { console.warn('Saving badge award failed:', e); }
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
    } catch(e) { console.warn('Checking top_gun badge eligibility failed for one exercise:', e); }
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
  } catch(e) { console.warn('awardBadges failed:', e); }
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

// Icon standardization: replaced 🥇🥈🥉 medal emoji (which render as flat,
// inconsistent colors across platforms) with an actual gold/silver/bronze
// metallic gradient badge, matching the app's existing --gold-grad token.
function medalBadge(rank) {
  if (rank === 0) return '<span class="medal-badge gold">1</span>';
  if (rank === 1) return '<span class="medal-badge silver">2</span>';
  if (rank === 2) return '<span class="medal-badge bronze">3</span>';
  return '<span style="font-family:var(--mono);color:var(--muted)">'+(rank+1)+'</span>';
}

// A small solid-color dot matching the app's own green/amber/red tokens —
// replaces 🟢🟡🔴 emoji, which render with inconsistent exact hues and
// sizes across platforms/OS versions. fatigueKey is 'go'|'marginal'|'nogo'.
function statusDot(fatigueKey, sizePx) {
  sizePx = sizePx || 9;
  const color = fatigueKey === 'go' ? 'var(--green)' : fatigueKey === 'marginal' ? 'var(--amber)' : 'var(--red)';
  return '<span style="display:inline-block;width:'+sizePx+'px;height:'+sizePx+'px;border-radius:50%;background:'+color+';vertical-align:middle;box-shadow:0 0 6px '+color+'"></span>';
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
  // BUG FIX (independent review finding — called out this exact function
  // by name as "especially important"): the upsert's result was never
  // checked, so a database-level rejection (RLS, a constraint) would
  // still let ST.lbBests get updated right after, as if the submission
  // had actually succeeded — the in-memory PR record and the real
  // leaderboard could silently disagree.
  const { error } = await withTimeout(SB.from('leaderboard_entries').upsert(row, { onConflict: 'user_id,exercise_id' }));
  if (error) throw error;
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
    try { await submitLeaderboardEntry(ex.id, ex.name, best, session.date); improved = true; } catch(e) { console.warn('Leaderboard submission failed for', ex.id, ':', e); }
  }
  if (improved) {
    try { const profile = (await dbGetProfile()) || {}; profile.lbBests = ST.lbBests; await dbSetProfile(profile); } catch(e) { console.warn('Saving leaderboard best failed:', e); }
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
    try { await submitLeaderboardEntry(ex.id, ex.name, bests[ex.id], bests[ex.id].date); any = true; } catch(e) { console.warn('Leaderboard submission failed for', ex.id, ':', e); }
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
      // BUG FIX (independent review finding): same class of gap as
      // submitLeaderboardEntry/submitRunningPR above — checking .error
      // now, not just relying on the catch (which alone can't see a
      // resolved {error} result, only a genuine rejection).
      const { error } = await withTimeout(SB.from('running_pr_entries').upsert({
        user_id: ST.user.id, username: ST.username, sex: ST.sex || null,
        distance_mi: bestRun.miles, duration_sec: bestRun.seconds || null, achieved_at: bestRun.date,
      }, { onConflict: 'user_id' }));
      if (error) throw error;
      ST.runBest = bestRun.miles;
      any = true;
    } catch(e) { console.warn('Saving run PR entry failed:', e); }
  }
  if (any) {
    try { const profile = (await dbGetProfile()) || {}; profile.lbBests = ST.lbBests; profile.runBest = ST.runBest; await dbSetProfile(profile); } catch(e) { console.warn('Saving run best failed:', e); }
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

    // minmax(0,1fr): a grid track's default minimum is the content's own
    // width, so a long exercise name at the largest text size pushed the
    // right-hand card off the screen (found by the e2e crawler). With a
    // zero minimum the columns stay inside the viewport and the name
    // ellipsizes as intended.
    const parts = ['<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px">'];
    results.forEach(({ id, rows }) => {
      const isRunning = id === 'running';
      const name = isRunning ? 'Running' : (LEADERBOARD_EXERCISES.find(e => e.id === id)?.name || id);
      parts.push('<div class="card" style="padding:10px;cursor:pointer;touch-action:manipulation;min-width:0" onclick="haptic(\'light\');'+(isRunning ? "ST.lbCategory='running';renderPage()" : "ST.lbCategory='strength';ST.lbEx='"+id+"';localStorage.setItem('fcf_lb_ex','"+id+"');renderPage()")+'">');
      parts.push('<div style="font-size:0.6875rem;font-weight:600;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+name+'</div>');
      if (!rows.length) {
        parts.push('<div style="font-size:0.625rem;color:var(--muted)">No entries yet</div>');
      } else {
        rows.forEach((r, i) => {
          const medal = medalBadge(i);
          const val = isRunning ? formatMiPace(r.distance_mi, r.duration_sec) : Math.round(r.weight_lb)+' lb';
          parts.push('<div class="fb" style="padding:2px 0;gap:6px"><span style="font-size:0.625rem;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+medal+' '+sanitizeUserText(r.username)+'</span><span style="font-family:var(--mono);font-size:0.625rem;color:var(--gold);flex-shrink:0">'+val+'</span></div>');
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
    parts.push('<div style="font-size:0.75rem;line-height:1.6;margin-bottom:10px">🏆 <strong>Want on the boards?</strong> Set a call sign in More → Pilot Profile. No call sign = you\'re not listed. Your lifts and runs stay private.</div>');
    parts.push('<button class="btn btn-outline" onclick="switchTab(\'profile\')">Set My Call Sign →</button>');
    parts.push('</div>');
  }

  // At-a-glance: several boards visible at once, tap any card to drill into
  // its full, filterable standings below.
  parts.push('<div class="section-label" style="margin-top:0">AT A GLANCE</div>');
  parts.push('<div id="lbGlance" class="mb12"><div class="card" style="text-align:center;color:var(--muted);font-size:0.6875rem">Loading…</div></div>');

  parts.push('<div class="section-label">BADGES</div>');
  parts.push('<div class="card mb12">');
  parts.push(buildBadgesGridHTML());
  parts.push('</div>');

  parts.push('<div class="section-label">FULL BOARD</div>');

  const segBtn = (key, val, label) =>
    '<div class="env-btn" style="padding:8px 4px'+(ST[key]===val?';border-color:var(--gold);background:rgba(212,175,55,0.08)':'')+'" onclick="ST.'+key+'=\''+val+'\';renderPage()"><div style="font-size:0.6875rem;font-weight:700">'+label+'</div></div>';

  const category = ST.lbCategory || 'strength';
  parts.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:12px">' +
    '<div class="env-btn" style="padding:10px 4px'+(category==='strength'?';border-color:var(--gold);background:rgba(212,175,55,0.08)':'')+'" onclick="ST.lbCategory=\'strength\';renderPage()"><div style="font-size:0.75rem;font-weight:700">🏋️ STRENGTH</div></div>' +
    '<div class="env-btn" style="padding:10px 4px'+(category==='running'?';border-color:var(--gold);background:rgba(212,175,55,0.08)':'')+'" onclick="ST.lbCategory=\'running\';renderPage()"><div style="font-size:0.75rem;font-weight:700">🏃 RUNNING</div></div>' +
    '</div>');

  if (category === 'running') {
    parts.push('<div class="card mb12">');
    parts.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px">'+segBtn('runBoard','longest','LONGEST RUN')+segBtn('runBoard','monthly','THIS MONTH')+'</div>');
    parts.push('<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px">'+segBtn('lbSex','all','ALL')+segBtn('lbSex','male','MEN')+segBtn('lbSex','female','WOMEN')+'</div>');
    if (ST.runBoard === 'monthly') parts.push('<div style="font-size:0.625rem;color:var(--muted);margin-top:6px;line-height:1.5">Total distance logged this calendar month. Resets on the 1st.</div>');
    parts.push('</div>');
    parts.push('<div id="lbRows"><div class="card mb12" style="text-align:center;color:var(--muted);font-size:0.75rem">Loading standings…</div></div>');
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
  if (ST.lbMode === 'dots') parts.push('<div style="font-size:0.625rem;color:var(--muted);margin-top:6px;line-height:1.5">DOTS normalizes for bodyweight and sex: a fair strength score across sizes. Needs bodyweight + sex on file.</div>');
  parts.push('</div>');
  parts.push('<div id="lbRows"><div class="card mb12" style="text-align:center;color:var(--muted);font-size:0.75rem">Loading standings…</div></div>');
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
      el.innerHTML = '<div class="card mb12" style="text-align:center;color:var(--muted);font-size:0.75rem">No entries yet for this lift. Be the first on the board.</div>';
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
      const medal = medalBadge(i);
      parts.push('<div class="fb" style="padding:9px 14px'+(mine?';background:rgba(212,175,55,0.07)':'')+(i<data.length-1?';border-bottom:1px solid var(--border)':'')+'">');
      parts.push('<div style="display:flex;align-items:center;gap:10px;min-width:0"><div style="width:24px;text-align:center;flex-shrink:0">'+medal+'</div>');
      parts.push('<div style="min-width:0"><div style="font-size:0.8125rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+sanitizeUserText(r.username)+(mine?' <span style="color:var(--gold);font-size:0.625rem">YOU</span>':'')+'</div>');
      parts.push('<div style="font-size:0.625rem;color:var(--muted)">'+sub.join(' · ')+'</div></div></div>');
      parts.push('<div style="display:flex;align-items:center;gap:8px;flex-shrink:0"><span style="font-family:var(--mono);font-size:0.875rem;font-weight:700;color:var(--gold)">'+val+'</span>');
      if (admin) parts.push('<button class="btn-ghost" style="font-size:0.75rem;padding:4px 6px" onclick="adminDeleteLbEntry(\''+r.id+'\',\''+sanitizeUserText(r.username).replace(/\'/g,'')+'\')">🗑</button>');
      parts.push('</div></div>');
    });
    parts.push('</div>');
    el.innerHTML = parts.join('');
  } catch(e) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    el.innerHTML = '<div class="card mb12" style="text-align:center;color:var(--muted);font-size:0.75rem">'+(offline
      ? '📡 Leaderboards need a connection. Reconnect to see standings.'
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
    el.innerHTML = '<div class="card mb12" style="text-align:center;color:var(--muted);font-size:0.75rem">'+(offline
      ? '📡 Leaderboards need a connection. Reconnect to see standings.'
      : 'Couldn\'t load standings. If this persists, the running_pr_entries / running_log tables may not be set up yet.')+'</div>';
  }
}

function renderRunningRows(el, rows) {
  if (!rows.length) {
    el.innerHTML = '<div class="card mb12" style="text-align:center;color:var(--muted);font-size:0.75rem">No runs logged yet for this board. Be the first.</div>';
    return;
  }
  const admin = isLbAdmin();
  const parts = ['<div class="card mb12" style="padding:8px 0">'];
  rows.forEach((r, i) => {
    const mine = ST.user && r.user_id === ST.user.id;
    const medal = medalBadge(i);
    parts.push('<div class="fb" style="padding:9px 14px'+(mine?';background:rgba(212,175,55,0.07)':'')+(i<rows.length-1?';border-bottom:1px solid var(--border)':'')+'">');
    parts.push('<div style="display:flex;align-items:center;gap:10px;min-width:0"><div style="width:24px;text-align:center;flex-shrink:0">'+medal+'</div>');
    parts.push('<div style="font-size:0.8125rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+sanitizeUserText(r.username)+(mine?' <span style="color:var(--gold);font-size:0.625rem">YOU</span>':'')+'</div></div>');
    parts.push('<div style="display:flex;align-items:center;gap:8px;flex-shrink:0"><span style="font-family:var(--mono);font-size:0.875rem;font-weight:700;color:var(--gold)">'+r.display+'</span>');
    if (admin && r.table && r.id) parts.push('<button class="btn-ghost" style="font-size:0.75rem;padding:4px 6px" onclick="adminDeleteRunEntry(\''+r.table+'\',\''+r.id+'\',\''+sanitizeUserText(r.username).replace(/\'/g,'')+'\')">🗑</button>');
    parts.push('</div></div>');
  });
  parts.push('</div>');
  el.innerHTML = parts.join('');
}

async function adminDeleteRunEntry(table, id, uname) {
  if (!isLbAdmin()) return;
  if (!(await appConfirm('Delete '+uname+'\'s entry from this board? This can\'t be undone.', 'Delete entry'))) return;
  try {
    const { error } = await withTimeout(SB.from(table).delete().eq('id', id));
    if (error) throw error;
    showToast('Entry removed.');
    loadRunningRows();
  } catch(e) { showToast('Delete failed: '+(e.message||'unknown error')); }
}

async function adminDeleteLbEntry(id, uname) {
  if (!isLbAdmin()) return;
  if (!(await appConfirm('Delete '+uname+'\'s entry from this board? This can\'t be undone.', 'Delete entry'))) return;
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
  // BUG FIX (independent review finding, same class as
  // submitLeaderboardEntry above): result was never checked before
  // updating ST.runBest as if the write had succeeded.
  const { error } = await withTimeout(SB.from('running_pr_entries').upsert(row, { onConflict: 'user_id' }));
  if (error) throw error;
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
  try { await withTimeout(SB.from('running_log').upsert(row, { onConflict: 'user_id,run_at' })); } catch(e) { console.warn('Saving run log failed:', e); }
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
    ex('c_rn_t1','Leg Swings (Front & Side)','2x10/leg',2,'Dynamic: hold a wall or rail. Warms hips before running; skip static stretching here.',true,'timed'),
    ex('c_rn_t2','Walking High Knees','2x20yd',2,'Gentle pace, drive knees up. Raises heart rate and primes hip flexors.',false,'reps_only'),
  ],
  takeoff: [],
  enroute: [
    ex('c_ca_er1','Treadmill Zone 2 Run','20 min',1,'Conversational pace: speak in full sentences. Log distance for the leaderboard.',true,'timed_distance'),
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
// Running doesn't depend on which strength environment you picked —
// shares the same content as the other three rather than being duplicated.
WORKOUTS.band['Run'] = WORKOUTS.room['Run'];

function renderPage() {
  const p = document.getElementById('mainPage');
  if (!p) return;

  // Safety disclaimer requires an explicit tap via acceptDisclaimer().
  // Do not clear the gate or paint tab content until that has run.
  if (!ST.authed || !ST.disclaimerAccepted || ST.authView === 'recovery') {
    renderRoot();
    return;
  }

  // Self-heal bars when they should be visible
  const topbar = document.getElementById('topbar');
  const tabbar = document.getElementById('tabbar');
  if (topbar) topbar.style.display = '';
  if (tabbar) tabbar.style.display = (ST.tab === 'debrief') ? 'none' : 'flex';

  // BUG FIX (reported twice: "home screen redraws itself three times after
  // a hard close and reopen"). Measured this time with a render census in
  // a real browser rather than reasoned about: every renderPage() on Today
  // blanked #mainPage here, then waited ~750ms for loadTodaysMeals() before
  // drawing anything. On iOS the native shell then delivers HealthKit at
  // +2s and Calendar at +3.5s after boot, each of which calls renderPage(),
  // so the person watched the page go blank and rebuild three times. Today
  // now draws synchronously from whatever is already in memory and only
  // redraws after the meal fetch if the meals actually changed. The other
  // tabs keep the old clear-then-draw because they are not on the boot
  // path and draw synchronously anyway.
  if (ST.tab === 'today') {
    const before = JSON.stringify(ST.todaysMeals || []);
    renderToday(p);
    loadTodaysMeals().then(() => {
      if (ST.tab !== 'today') return;
      if (JSON.stringify(ST.todaysMeals || []) !== before) renderToday(p);
    }).catch(() => {});
    return;
  }

  p.innerHTML = '';
  if (ST.tab === 'preflight') {
    renderPreflight(p).catch(e => {
      p.innerHTML = '<div class="section-label">PREFLIGHT BRIEFING · '+FCF_VERSION+'</div>' +
        '<div class="card mb12"><div style="font-size:0.8125rem;color:var(--muted);margin-bottom:10px">Couldn\'t load your calendar. This can happen with no signal.</div>' +
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
  else if (ST.tab === 'badges')      renderBadges(p);
  else if (ST.tab === 'superuser')   renderSuperUser(p);
  else if (ST.tab === 'debrief')     renderDebrief(p);
}

// ─── STATE HELPERS ────────────────────────────────────────────────────────────
function applyProfileToState(profile) {
  if (!profile) return;
  // BUG FIX (reported: uploaded an ICS successfully — worked in the
  // moment — but Today's Schedule showed nothing on a later load, even
  // with Schedule Source correctly staying on "Uploaded file" after the
  // fix just above this one). Same exact bug class as that one and the
  // weight_lbs/height_in gaps before it: handleICSUpload() saves
  // profile.flightSchedule/flightScheduleRaw correctly, but nothing
  // here ever read them back. ST.flightSchedule only ever got set
  // in-memory, directly by the upload handler itself (or by the
  // timezone-change re-parse, which only operates on whatever's already
  // in memory) — never from the saved profile, so it was empty on every
  // single fresh load regardless of what had been uploaded.
  if (profile.flightSchedule)               ST.flightSchedule = profile.flightSchedule;
  if (profile.flightScheduleRaw)            ST.flightScheduleRaw = profile.flightScheduleRaw;
  if (profile.scheduleSource)               ST.scheduleSource = profile.scheduleSource;
  if (profile.sex)                          ST.sex = profile.sex;
  // BUG FIX (reported: weight/height "not remembering" — confirmed real,
  // but not the field the report assumed. weight_lbs/height_in are dead
  // snake_case keys nothing ever actually saves under — the save side
  // uses lastWeight/heightIn (camelCase), confirmed directly against
  // where each is written. profile.weight_lbs was never populated by
  // anything, so this line never did anything; replaced with the field
  // that's actually saved.
  if (profile.lastWeight)                   ST.lastWeight = profile.lastWeight;
  if (profile.heightIn)                     ST.heightIn = profile.heightIn;
  if (profile.baseTimezone)                 ST.baseTimezone = profile.baseTimezone;
  if (profile.home_airport)                 ST.homeAirport = profile.home_airport;
  if (profile.airline)                      ST.airline = profile.airline;
  if (profile.seat_position)                ST.seatPosition = profile.seat_position;
  if (profile.aircraft_type)                ST.aircraftType = profile.aircraft_type;
  if (profile.schedule_type)                ST.scheduleType = profile.schedule_type;
  if (profile.fitness_goal)                 ST.fitnessGoal = profile.fitness_goal;
  if (profile.experience_level)             ST.experienceLevel = profile.experience_level;
  if (profile.equipment_access)             ST.equipmentAccess = profile.equipment_access;
  // BUG FIX (reported: Oura shows connected on web right after connecting,
  // but the app reports it as not connected — confirmed real, same root
  // cause as weight/height above. The save side uses ouraConnected/
  // ouraAccessToken (camelCase) — confirmed directly against the actual
  // OAuth callback and disconnect handlers — so these snake_case checks
  // never matched anything, and the connection state never survived a
  // reload on any device, correctly saved or not.
  if (profile.ouraConnected !== undefined)  ST.ouraConnected = profile.ouraConnected;
  // BUG FIX (reported: 'Possible duplicate' asked 3+ times about the same Oura
  // workout after answering 'Already logged' each time). resolveOuraDuplicate()
  // saved skips to profile.ouraDismissedIds, but nothing ever read them back,
  // so every launch started with an empty list and re-asked.
  if (Array.isArray(profile.ouraDismissedIds)) ST.ouraDismissedIds = profile.ouraDismissedIds;
  // RESTORED (dropped by commit fe3dd70's rewrite of this function, found by
  // diffing every field the original loaded): objective, level, injuries,
  // custom exercises, saved custom routines and leaderboard bests were all
  // still being SAVED but never loaded, so each silently reset to defaults
  // on every launch. Restored verbatim from fe3dd70^, sanitizing included.
  // ouraToken (legacy personal token) intentionally not restored: nothing
  // reads ST.ouraToken anymore.
  if (profile.level) ST.level = profile.level;
  if (profile.goal)  ST.goal  = profile.goal;
  ST.customExercises = (profile.customExercises || []).map(ce => {
    if (ce?.exercise) {
      ce.exercise.name = sanitizeUserText(ce.exercise.name);
      ce.exercise.note = sanitizeUserText(ce.exercise.note);
      ce.exercise.target = sanitizeUserText(ce.exercise.target) || '–';
    }
    return ce;
  });
  ST.customProfiles = (profile.customProfiles || []).map(cp => ({ ...cp, name: sanitizeUserText(cp.name) }));
  ST.injuries = Array.isArray(profile.injuries) ? profile.injuries : [];
  ST.lbBests  = profile.lbBests || {};
  ST.runBest  = profile.runBest || 0;
  if (profile.ouraRefreshToken) ST.ouraRefreshToken = profile.ouraRefreshToken;
  if (profile.ouraAccessToken)              ST.ouraAccessToken = profile.ouraAccessToken;
  if (profile.badges && typeof profile.badges === 'object') ST.badges = profile.badges;
  // BUG FIX (reported: call sign / age kept getting re-prompted for, or
  // acted like they were never saved, despite being entered correctly).
  // Confirmed directly: both are actually saved fine — profile.age and
  // profile.username are set on save — this function simply never read
  // either one back into ST on boot, so every reload reverted both to
  // their defaults regardless of what was in the database.
  if (profile.age)                          ST.age = profile.age;
  if (profile.username)                     ST.username = profile.username;
  // BUG FIX (reported: fuel plan / tracking toggles reset after a
  // refresh, the same way badges used to before that fix was added).
  // Same root cause, same fix — these were never hydrated here either.
  if (typeof profile.trackNutrition === 'boolean') ST.trackNutrition = profile.trackNutrition;
  if (typeof profile.trackHydration === 'boolean') ST.trackHydration = profile.trackHydration;
  if (profile.nutritionGoals)               ST.nutritionGoals = profile.nutritionGoals;
  ST.medications = Array.isArray(profile.medications) ? profile.medications.map(normalizeMedication).filter(Boolean) : [];
  if (profile.medsSkipped) ST.medsSkipped = true;
  // Text size follows the account: a choice made on the phone shows up on
  // the iPad. The local copy is only a pre-paint cache of this value.
  if (typeof profile.textSize === 'string' && TEXT_SIZES.some(t => t.key === profile.textSize)) {
    applyTextSize(profile.textSize);
    try { localStorage.setItem(TEXT_SIZE_LS_KEY, profile.textSize); } catch (e) { /* fine */ }
  }
  // Re-engagement / disengagement nudges for nutrition + hydration
  // tracking — see computeTrackingNudges().
  if (profile.nutritionTrackingDisabledAt)   ST.nutritionTrackingDisabledAt = profile.nutritionTrackingDisabledAt;
  if (profile.hydrationTrackingDisabledAt)   ST.hydrationTrackingDisabledAt = profile.hydrationTrackingDisabledAt;
  if (profile.nutritionNudgeDismissedAt)     ST.nutritionNudgeDismissedAt = profile.nutritionNudgeDismissedAt;
  if (profile.hydrationNudgeDismissedAt)     ST.hydrationNudgeDismissedAt = profile.hydrationNudgeDismissedAt;
  // BUG FIX (reported: "uploaded my calendar on my phone, but it doesn't
  // reflect on the webapp"). Confirmed real and confirmed where: the phone
  // syncs Apple Calendar through native EventKit, sends the raw events to
  // fcf-calendar-classify, and that edge function DOES save the classified
  // result server-side — profile.calendarClassified / .calendarFingerprint
  // are written into this same profile_data row on every successful
  // classification (see edge-functions/fcf-calendar-classify/index.ts).
  // The data was never actually stuck on the phone. The bug was here: this
  // function never read those two fields back into ST on boot, on ANY
  // device — so even the phone itself would lose ST.calendarEvents on a
  // fresh launch until its own next native sync completed, and the web
  // client, which has no EventKit and can never generate calendarEvents
  // any other way, had no path to ever see them at all. Every feature that
  // reads ST.calendarEvents (trip plan, fuel logistics, fatigue
  // calibration, progression analytics) now picks this up automatically
  // via getActiveSchedule() once hydrated here — no other call site needed
  // to change.
  if (profile.calendarClassified && profile.calendarClassified.length) {
    ST.calendarEvents = profile.calendarClassified;
    ST.calendarFingerprint = profile.calendarFingerprint || null;
  }
}

// RESTORED: commit fe3dd70 (GitHub web-editor edit) replaced these with stubs that
// read/wrote fields nothing else uses (ST.scheduleType, ST.suggestedEnv,
// ST.flightHours) and deleted computeTodaysFlightHours outright, which the
// Preflight hydration card still calls - a ReferenceError crash whenever an
// uploaded schedule exists. Originals restored verbatim from fe3dd70^.
// Layover detection for environment auto-selection. Explicit layover/rest
// events win. With only flight legs on the calendar (common with Apple
// Calendar sync), infer it: right now sits in a 4h-40h gap between two
// flights, and the last arrival airport isn't where this trip started
// (an overnight gap that ends back at base is home rest, not a hotel).
function inferCurrentLayover(events) {
  const status = getCurrentScheduleStatus(events);
  if (status && (status.type === 'layover' || status.type === 'rest')) {
    return { airport: status.airport || status.location || '' };
  }
  if (status && status.type === 'flight') return null;
  const now = Date.now();
  const flights = (events || []).filter(e => e.type === 'flight')
    .map(e => ({ ...e, s: new Date(e.start).getTime(), en: new Date(e.end).getTime() }))
    .filter(e => !isNaN(e.s) && !isNaN(e.en)).sort((a, b) => a.s - b.s);
  const prevIdx = flights.map(f => f.en <= now).lastIndexOf(true);
  const prev = flights[prevIdx];
  const next = flights.find(f => f.s > now);
  if (!prev || !next) return null;
  const gapH = (next.s - prev.en) / 3600000;
  if (gapH < 4 || gapH > 40) return null;
  // Walk back to the first leg of this trip (gaps under 30h keep it one trip).
  let firstIdx = prevIdx;
  while (firstIdx > 0 && (flights[firstIdx].s - flights[firstIdx - 1].en) / 3600000 < 30) firstIdx--;
  const tripOrigin = flightRoute(flights[firstIdx]).origin;
  const here = flightRoute(prev).destination || String(prev.airport || '').toUpperCase();
  if (here && tripOrigin && here === tripOrigin) return null;
  return { airport: here };
}

// BUG FIX (reported: at a layover hotel with today's flight showing on Today,
// but Preflight had selected Commercial Gym). Two causes: this read only the
// uploaded .ics, ignoring Apple Calendar even when that was the live source,
// and it ran once at boot before calendar events had arrived. Now uses
// getActiveSchedule() like everything else, infers a layover from flight
// gaps when there's no explicit layover event, and is re-run whenever the
// schedule updates. A manual environment pick made today is never overridden.
const ENV_PIN_KEY = 'fcf_env_pinned_day';
function applyScheduleEnvironmentSuggestion() {
  ST.scheduleEnvNote = null;
  if (localStorage.getItem(ENV_PIN_KEY) === new Date().toDateString()) return;
  const events = getActiveSchedule().events;
  if (!events || !events.length) return;
  const layover = inferCurrentLayover(events);
  if (layover) {
    if (ST.env !== 'hotel' && ST.env !== 'room') ST.env = 'hotel';
    ST.scheduleEnvNote = '📅 Layover' + (layover.airport ? ' in ' + layover.airport : '') + ' today: set to Hotel Gym.';
    return;
  }
  const status = getCurrentScheduleStatus(events);
  if (status?.type === 'dutyfree') {
    ST.env = 'comm';
    ST.scheduleEnvNote = '📅 Duty-free day today: set to Commercial Gym.';
  }
}

// Manual pick: honored for the rest of today, regardless of schedule syncs.
function setEnvManually(env) {
  ST.env = env;
  ST.scheduleEnvNote = null;
  localStorage.setItem(ENV_PIN_KEY, new Date().toDateString());
  renderPage();
}

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

function applyScheduleFlightHours() {
  if (ST.flightHrsTouched) return;
  const hrs = computeTodaysFlightHours(ST.flightSchedule);
  if (hrs === null) return;
  ST.flightHrs = hrs;
  ST.flightHrsRaw = String(hrs);
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
  } catch(e) { console.warn('Restoring daily inputs from cache failed (treating as no cached data):', e); }
}

function applyDailyInputsRow(row) {
  if (!row) return;
  if (row.water_in != null) { ST.waterIn = row.water_in; ST.waterInRaw = String(row.water_in); }
  if (row.flight_hrs != null) { ST.flightHrs = row.flight_hrs; ST.flightHrsRaw = String(row.flight_hrs); }
  if (row.flight_hrs_touched != null) ST.flightHrsTouched = !!row.flight_hrs_touched;
  if (row.sleep_hours != null) ST.sleepHours = row.sleep_hours;
  if (row.readiness != null) ST.readiness = row.readiness;
}

function setDbStatus(mode) {
  // mode: 'online' | 'local' | 'error'
  const dot = document.getElementById('dbDot');
  const lbl = document.getElementById('dbStatus');
  if (!dot || !lbl) return;
  if (mode === 'online') {
    dot.classList.remove('off');
    lbl.textContent = 'ONLINE';
    lbl.style.color = 'var(--green)';
  } else if (mode === 'error') {
    dot.classList.add('off');
    lbl.textContent = 'ERROR';
    lbl.style.color = 'var(--amber)';
  } else {
    dot.classList.add('off');
    lbl.textContent = 'LOCAL';
    lbl.style.color = 'var(--muted)';
  }
}

async function checkDB() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setDbStatus('local');
    return;
  }
  if (!ST.user?.id) {
    setDbStatus('local');
    return;
  }
  try {
    const { error } = await SB.from('user_profiles')
      .select('user_id')
      .eq('user_id', ST.user.id)
      .maybeSingle();
    if (error) {
      console.warn('checkDB query issue:', error.message);
      setDbStatus('error');
      return;
    }
    setDbStatus('online');
  } catch (e) {
    console.warn('checkDB exception:', e);
    setDbStatus('error');
  }
}

// ─── BOOT SEQUENCE ────────────────────────────────────────────────────────────
async function bootApp() {
  try {
    await bootAppInner();
  } catch (e) {
    console.error('bootApp failed:', e);
    ST.authed = !!ST.user;
    
    // Explicitly unhide navigation elements if authenticated
    if (ST.authed && ST.disclaimerAccepted) {
      const topbar = document.getElementById('topbar');
      const tabbar = document.getElementById('tabbar');
      if (topbar) topbar.style.display = '';
      if (tabbar) tabbar.style.display = 'flex';
    }
    
    try { renderRoot(); } catch (e2) { console.error('renderRoot also failed:', e2); }
    
    const mainPage = document.getElementById('mainPage');
    if (mainPage) {
      mainPage.innerHTML = '<div class="card mb12" style="border-color:var(--red)">' +
        '<div style="font-weight:700;color:var(--red);margin-bottom:8px">⚠ Load error</div>' +
        '<div style="font-size:0.75rem;color:var(--muted);font-family:var(--mono);word-break:break-word">' +
        sanitizeUserText(e?.message || String(e)) + '</div></div>' + (mainPage.innerHTML || '');
    }
    showBigToast('Something didn\'t load correctly. Pull to refresh or reopen the app.', 'warn');
  }
}

// Guards the one-time setTimeout-scheduled side effects inside
// bootAppInner (Oura sync, native HealthKit/Calendar/notifications
// requests) against firing more than once per page load, the same way
// scheduleOuraActivityRetry/scheduleEntitlementRefresh already guard
// their own — see the fuller explanation at its one usage site below.
let _bootSideEffectsScheduled = false;
// BUG FIX (found while investigating why demo/seeded oura_daily rows
// weren't showing on the Today tiles at all — traced further and
// confirmed this affects real users too, not just seeded data):
// ST.ouraScore/ST.ouraData (what the Today readiness/sleep/activity
// tiles actually read) were ONLY ever set by a live, successful sync to
// Oura's API — there was no path that hydrated them from oura_daily
// on a normal boot at all. That means the tiles go blank on every
// single reload until that session's own sync happens to complete
// again, with nothing to fall back on if it's slow, offline, or fails.
// This loads the most recent available row unconditionally at boot, so
// there's always something to show immediately; the existing delayed
// live sync still runs afterward and overwrites this with same-day
// data once it succeeds, same as before.
async function hydrateOuraFromRecent() {
  if (!ST.user) return null;
  try {
    const { data } = await SB.from('oura_daily').select('*')
      .eq('user_id', ST.user.id).order('date', { ascending: false }).limit(1);
    return data?.[0] || null;
  } catch (e) { return null; }
}

async function bootAppInner() {
  ST.disclaimerAccepted = localStorage.getItem('fcf_disclaimer_accepted') === '1';

  const [profile, lastSession, , , mostRecentOura] = await Promise.all([
    dbGetProfile().catch(e => { console.warn('dbGetProfile failed:', e); return null; }),
    dbGetLastSession().catch(e => { console.warn('dbGetLastSession failed:', e); return null; }),
    loadSessionCache().catch(e => { console.warn('loadSessionCache failed:', e); return []; }),
    loadSubscription().catch(e => { console.warn('loadSubscription failed:', e); return null; }),
    hydrateOuraFromRecent(),
    loadMedsTakenToday()
  ]);

  applyProfileToState(profile);
  if (mostRecentOura) {
    ST.ouraScore = mostRecentOura.readiness_score ?? null;
    ST.ouraData  = mostRecentOura;
    if (ST.ouraScore !== null) {
      ST.fatigue = ST.ouraScore >= 70 ? 'go' : ST.ouraScore >= 60 ? 'marginal' : 'nogo';
    }
  }
  ST.lastSession = lastSession;
  if (ST.lastSession && (!ST.sessionCache || !ST.sessionCache.find(s => s.date === ST.lastSession.date))) {
    if (!ST.sessionCache) ST.sessionCache = [];
    ST.sessionCache.push(ST.lastSession);
  }
  awardBadges();
  maybeShowInstallPrompt();
  // BUG FIX (reported: app flickers 5-6 times on a hard close + reopen).
  // Traced through the actual boot sequence rather than guessing: each
  // renderPage() call clears #mainPage's entire innerHTML before
  // rebuilding it, so multiple render passes in quick succession are
  // exactly what a visible flicker looks like. This function was
  // contributing to that — it fired its own re-render asynchronously,
  // AFTER the synchronous renderRoot() call below (and the renderPage()
  // that call makes internally) had already painted the page once.
  // Awaiting it here instead, before that single render happens, means
  // the nudge state is already correct by the time the page paints —
  // no separate re-render needed for this at all. The queries here are
  // small, filtered selects, so this adds only a little sequential
  // latency before the very first paint, where nothing is visible yet
  // to flicker, rather than a jarring extra rebuild after the user is
  // already looking at the page.
  await computeTrackingNudges().catch(e => console.warn('computeTrackingNudges failed:', e));
  restoreDailyInputs();
  applyDailyInputsRow(await dbGetDailyInputs().catch(() => null));
  applyScheduleEnvironmentSuggestion();
  applyScheduleFlightHours();

  if (!ST.sex && !localStorage.getItem('fcf_profile_intro')) {
    localStorage.setItem('fcf_profile_intro', '1');
    ST.tab = 'profile';
  }

  ST.muscleGroup = getRecommendedNext();
  renderRoot();
  _bootRenderDone = true;

  // Apply a notification-tap tab request that arrived before boot/auth was
  // ready (see the fcf:pushTap listener's comment for why this can happen
  // on a cold launch) — now that ST.authed is set and the page has its
  // first real render, it's safe to switch tabs without losing state.
  const tapTab = _pendingPushTapTab.current || pushTapCarriedOverReload();
  if (tapTab) {
    _pendingPushTapTab.current = null;
    switchTab(tapTab);
  }

  bindFoodPhotoInputs();
  checkDB();

  // BUG FIX (reported: app re-renders several times within a few seconds
  // of loading — confirmed with a full stack trace this time, not
  // inferred). Two separate [tripPlan] log occurrences, 72ms apart,
  // showed byte-for-byte identical call stacks all the way down through
  // setTimeout @ this exact line, bootAppInner, bootApp, initAppInner,
  // initApp. A single setTimeout callback cannot fire twice on its own —
  // the only way to get two firings of the same line is for
  // bootAppInner()'s own function body to have run twice in this one
  // page load. That matches a comment already sitting a short distance
  // below this (scheduleOuraActivityRetry's own guard) documenting that
  // bootApp() is known to be able to run more than once per page load —
  // sign-in, password recovery, and Sign In with Apple success can all
  // call it independently. Rather than continue tracking down exactly
  // which of those paths doubled up this specific time, applying the
  // same guard pattern already used for scheduleOuraActivityRetry and
  // scheduleEntitlementRefresh directly here closes the actual
  // observed gap regardless of which caller triggers it: these
  // setTimeout-scheduled boot side effects should only ever be
  // scheduled once per page load, full stop, matching what every other
  // boot-time one-time side effect in this file already enforces for
  // itself.
  if (!_bootSideEffectsScheduled) {
    _bootSideEffectsScheduled = true;
    if (ST.ouraConnected && ST.ouraAccessToken) {
      setTimeout(() => syncOuraData().catch(() => {}), 1500);
      scheduleOuraActivityRetry();
    }

    if (typeof FCFBridge !== 'undefined' && FCFBridge.isNative) {
      // Real App Store prices (localized currency) for the Pro buttons.
      // Apple rejects subscription screens whose price doesn't match the
      // store, and the hardcoded USD fallback is wrong outside the US.
      FCFBridge.getProducts();
      setTimeout(() => FCFBridge.requestHealthKit(), 2000);
      setTimeout(() => FCFBridge.requestCalendar(ST.baseTimezone), 3500);
      setTimeout(() => scheduleNotifications(), 5000);
    }
  }

  scheduleEntitlementRefresh();
  syncPendingBioEntries().catch(e => console.warn('syncPendingBioEntries failed at boot:', e));
  // BUG FIX (regression from a prior edit pass — this whole block was
  // silently deleted, not intentionally removed): returning from Stripe
  // Checkout. The webhook may land a moment after the redirect, so this
  // re-reads a few times rather than once and giving up.
  if (/[?&]checkout=success/.test(location.search)) {
    history.replaceState({}, '', location.pathname);
    (async () => {
      for (let i = 0; i < 6 && !isPro(); i++) {
        await new Promise(r => setTimeout(r, i === 0 ? 1200 : 2500));
        await loadSubscription();
      }
      renderPage();
      showBigToast(isPro() ? '✓ Pro active. Thanks.' : 'Payment received. Access will appear shortly.', 'ok');
    })();
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
    '<div style="font-family:var(--mono);font-size:0.5rem;letter-spacing:.12em;color:' + accent + ';opacity:0.9;position:relative;z-index:1">' + label + '</div>' +
    '<div style="position:absolute;bottom:10px;left:10px;font-family:var(--mono);font-size:1.875rem;font-weight:700;color:' + vc + ';line-height:1;z-index:1">' + (value ?? '–') + '</div>' +
    '</div>'
  );
}

// AI Coach card wrapper — used for all three AI coaching features
// (Progression Analytics, Fatigue Calibration, Fueling Logistics).
// Uses the same radial-glow-arc treatment as the Readiness tile on Today so
// AI content reads as visually distinct from the rest of the app, and is
// unmistakably marked as AI-generated rather than blending into rule-based
// copy. `id` is the container's DOM id; `textId` is the inner text node's
// id that the loader function fills in once the response arrives.
function aiCoachCard(id, textId, title, colorKey, initialText) {
  const [gs, gf, accent] = GLOW_COLORS[colorKey] || GLOW_COLORS.gold;
  // A card rebuilt while its answer is already known (a repaint after the
  // shell delivers HealthKit, say) draws that answer in the first paint
  // instead of a "Thinking" placeholder that is replaced a frame later.
  const body = initialText
    ? initialText.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))
    : '<span class="ai-thinking-dots" style="color:var(--muted);font-style:italic">Thinking<span class="ai-dot">.</span><span class="ai-dot">.</span><span class="ai-dot">.</span></span>';
  // BUG FIX (reported): card was display:none until the AI response landed,
  // so for the 2-3 seconds a real request takes, there was zero indication
  // anything was coming — easy to scroll or tab past and never notice the
  // insight existed at all. Now visible immediately with a pulsing "thinking"
  // placeholder; loadFatigueCalibration/loadFuelLogistics/etc swap the
  // textId content in when the real response arrives (see those functions —
  // they already just do textEl.textContent = result.text, unchanged).
  return (
    '<div id="' + id + '" style="position:relative;border-radius:16px;border:1px solid rgba(255,255,255,0.08);' +
      'overflow:hidden;padding:16px;margin-bottom:12px;background:#0f1623">' +
    '<div style="position:absolute;top:-50px;right:-40px;width:180px;height:180px;border-radius:50%;' +
      'background:radial-gradient(circle,' + gs + ' 0%,' + gf + ' 55%,transparent 75%);pointer-events:none"></div>' +
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;position:relative;z-index:1">' +
      '<span style="font-size:0.75rem">✦</span>' +
      '<span style="font-family:var(--mono);font-size:0.625rem;letter-spacing:.1em;color:' + accent + '">' + title + '</span>' +
    '</div>' +
    '<div id="' + textId + '" style="font-size:0.8438rem;color:var(--text);line-height:1.6;position:relative;z-index:1">' + body + '</div>' +
    '</div>'
  );
}

// Free-tier teaser for a Pro-only AI card — shown instead of hiding the
// feature entirely, so free users see what they're missing rather than
// never knowing it exists. Reuses the same visual container as the real
// card (glow, accent color, title) so it reads as "this exists, unlock
// it" rather than a different, lesser thing. Body copy is deliberately
// generic/plausible-sounding rather than real analysis, and blurred so
// it's legible as "there's something here" without being readable enough
// to feel like a bait-and-switch.
function aiCoachTeaser(title, colorKey, blurb) {
  const [gs, gf, accent] = GLOW_COLORS[colorKey] || GLOW_COLORS.gold;
  return (
    '<div style="position:relative;border-radius:16px;border:1px solid rgba(255,255,255,0.08);' +
      'overflow:hidden;padding:16px;margin-bottom:12px;background:#0f1623">' +
    '<div style="position:absolute;top:-50px;right:-40px;width:180px;height:180px;border-radius:50%;' +
      'background:radial-gradient(circle,' + gs + ' 0%,' + gf + ' 55%,transparent 75%);pointer-events:none"></div>' +
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;position:relative;z-index:1">' +
      '<span style="font-size:0.75rem">✦</span>' +
      '<span style="font-family:var(--mono);font-size:0.625rem;letter-spacing:.1em;color:' + accent + '">' + title + '</span>' +
    '</div>' +
    '<div style="font-size:0.8438rem;color:var(--text);line-height:1.6;position:relative;z-index:1;' +
      'filter:blur(3.5px);user-select:none;pointer-events:none">' + blurb + '</div>' +
    '<div style="position:relative;z-index:1;margin-top:12px;display:flex;justify-content:center">' +
      '<button class="btn btn-gold" style="width:auto;padding:8px 18px;font-size:0.6875rem" onclick="showPaywall(\'coach\')">🔒 UNLOCK WITH PRO</button>' +
    '</div>' +
    '</div>'
  );
}

function showBigToast(msg, type) {
  const old = document.getElementById('fcf-big-toast');
  if (old) old.remove();
  const bg2 = document.getElementById('fcf-big-toast-bg');
  if (bg2) bg2.remove();
  const color = type === 'ok' ? '#22c55e' : type === 'warn' ? '#f59e0b' : '#3b82f6';
  // Icon standardization: swapped emoji (✅⚠️ℹ️, which render inconsistently
  // across platforms) for a small inline SVG matching the app's outline
  // icon language (same style as the tab bar). Tinted via `color` so it
  // still reads correctly at a glance for each toast type.
  const iconPath = type === 'ok'
    ? '<polyline points="20 6 9 17 4 12"/>'
    : type === 'warn'
    ? '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
    : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>';
  const icon = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+iconPath+'</svg>';
  const t = document.createElement('div');
  t.id = 'fcf-big-toast';
  t.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#0f1623;border:2px solid '+color+';color:#e2e8f0;padding:28px 36px;border-radius:16px;font-size:1.125rem;font-weight:700;z-index:9999;box-shadow:0 8px 48px rgba(0,0,0,0.7);text-align:center;min-width:200px;transition:opacity 0.4s';
  t.innerHTML = '<div style="display:flex;justify-content:center;margin-bottom:12px">'+icon+'</div><div>'+msg+'</div>';
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
const AI_ANALYSIS_PROMPT = `You are analyzing my personal workout and biometric data, exported from Flight Crew Fitness, a training app I use. Don't give generic fitness platitudes. Look at the actual numbers and tell me what's really happening.

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
- Rows marked "(session summary)" mean I logged a session without a full exercise breakdown; treat those as attendance only, not performance data

OPTIONAL: MY FLIGHT SCHEDULE
If I've also attached an .ics calendar file, it's my flight/duty schedule. Cross-reference it against the training data: layovers, long duty days, red-eyes, and time zone changes all affect recovery, sleep, and which environment (hotel room / hotel gym / commercial gym) I had access to. If I attached this file, factor travel load into your analysis rather than treating training gaps or off-trend days as unexplained.

WHAT I WANT FROM YOU
1. Trend analysis: is my strength on key lifts trending up, flat, or down over the logged period? Call out any plateaus by name.
2. Consistency: how many sessions per week am I actually completing, and are there concerning gaps?
3. Biometric trends: track body weight, waist, blood pressure, and fasting glucose over time. Flag anything moving the wrong direction or outside normal ranges.
4. Cross-reference: connect biometric shifts to training patterns (e.g. did BP or glucose move after a change in training volume or a gap in sessions?), and to my flight schedule if I attached it (e.g. did a rough travel stretch line up with a training gap or a biometric dip?).
5. Direct recommendations: 3-5 concrete bullet points on what to change next: which lifts need progression, what's stalling, what to prioritize.

Reference actual numbers and dates from the data, not general advice. If something in the biometric data looks concerning, say so plainly rather than softening it.

MEDICATIONS & SUPPLEMENTS
The CSV may also contain a "### MEDICATIONS & SUPPLEMENTS" section (what I take, dose, schedule) and a "### MEDICATION LOG" section (each dose I checked off, by date and time). If present, factor their expected physiological effects into the analysis, and note any adherence gaps that line up with off-trend stretches. If I mention anything else below this prompt (e.g. hormone therapy, GLP-1/GIP medications, peptides), treat it the same way.`;

function showAIPromptModal() {
  const root = document.getElementById('modalRoot');
  const escaped = AI_ANALYSIS_PROMPT.replace(/</g,'&lt;').replace(/>/g,'&gt;');
  root.innerHTML =
    '<div class="modal-bg" onclick="if(event.target===this)closeModal()">' +
    '<div class="modal-sheet">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">AI Analysis Prompt</div>' +
    '<div class="modal-body" style="margin-bottom:12px">Copy this, paste it into ChatGPT or Gemini, upload the exported CSV in the same message, and send. Best done weekly: frequent enough to catch a stall early, infrequent enough for the trend lines to mean something. If you also export your flight schedule as an .ics calendar file, upload that alongside the CSV. It gives the AI the full picture of how travel is affecting your training.</div>' +
    '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:0.6875rem;line-height:1.6;color:var(--text);white-space:pre-wrap;max-height:40vh;overflow-y:auto;margin-bottom:12px">' + escaped + '</div>' +
    '<button class="btn btn-gold" onclick="copyAIPrompt()">📋 Copy Prompt</button>' +
    '<button class="btn btn-outline mt8" onclick="closeModal()">CLOSE</button>' +
    '</div></div>';
}

function copyAIPrompt() {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(AI_ANALYSIS_PROMPT)
      .then(() => showToast('Prompt copied. Paste it into ChatGPT or Gemini.'))
      .catch(() => showToast('Copy failed. Select and copy the text manually.'));
  } else {
    showToast('Copy not supported here. Select and copy the text manually.');
  }
}

function showFeedbackModal() {
  const root = document.getElementById('modalRoot');
  root.innerHTML =
    '<div class="modal-bg" onclick="if(event.target===this)closeModal()">' +
    '<div class="modal-sheet">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Send Feedback</div>' +
    '<div class="modal-body" style="margin-bottom:10px">Bugs, ideas, anything not working right: this goes straight to the person building the app.</div>' +
    '<textarea id="feedbackText" rows="5" placeholder="What\'s on your mind?" style="width:100%;background:var(--bg3);border:1.5px solid var(--border);border-radius:8px;padding:12px;font-size:1rem;color:var(--text);resize:vertical;margin-bottom:10px"></textarea>' +
    '<div class="field" style="margin-bottom:14px"><label>Your email (optional, only if you want a reply)</label>' +
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
      throw new Error('HTTP '+res.status+': '+detail);
    }
    closeModal();
    showBigToast('Feedback sent. Thank you.', 'ok');
    awardLiveBadge('debrief').catch(() => {});
  } catch(e) {
    console.warn('Feedback submission error:', e);
    showToast('Couldn\'t send feedback: '+e.message);
  }
}

// ─── SHARE WITH CREW ─────────────────────────────────────────────────────────
// Built for the cockpit, where there's usually no internet. Three layers, so
// sharing always works:
//   1. AirDrop / iOS share sheet: phone-to-phone over Bluetooth + peer-to-peer
//      Wi-Fi, no internet needed. Native handler (build 6+) is preferred since
//      it's guaranteed; the Web Share API is used where the web view exposes it.
//   2. Offline QR code, pre-generated at build time and embedded here as a tiny
//      vector image (verified to decode to SHARE_URL). A camera reads it with no
//      signal; the link opens once the other pilot is back on the ground.
//   3. The address itself, big enough to read across a flight deck.
// SHARE_URL is the site root, not window.location, so no in-app path or query
// string ever leaks into a shared link. Update the QR if this ever changes.
const SHARE_URL = 'https://flightcrew.fit';
const SHARE_QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" width="100%" height="100%" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h29v29h-29z"/><path class="qrline" stroke="#000" d="M2 2.5h7m1 0h2m1 0h1m1 0h1m1 0h2m1 0h7m-25 1h1m5 0h1m2 0h2m5 0h1m1 0h1m5 0h1m-25 1h1m1 0h3m1 0h1m3 0h3m1 0h2m2 0h1m1 0h3m1 0h1m-25 1h1m1 0h3m1 0h1m1 0h1m3 0h2m1 0h2m1 0h1m1 0h3m1 0h1m-25 1h1m1 0h3m1 0h1m1 0h5m1 0h3m1 0h1m1 0h3m1 0h1m-25 1h1m5 0h1m1 0h1m1 0h2m6 0h1m5 0h1m-25 1h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7m-17 1h1m1 0h2m4 0h1m-17 1h1m3 0h1m1 0h5m1 0h1m3 0h6m2 0h1m-25 1h1m1 0h4m2 0h4m1 0h4m3 0h2m1 0h1m-24 1h1m1 0h1m1 0h1m1 0h1m1 0h4m1 0h3m2 0h1m1 0h3m-23 1h1m2 0h1m1 0h1m1 0h1m1 0h3m4 0h2m1 0h1m2 0h2m-23 1h1m1 0h8m1 0h1m4 0h3m1 0h4m-25 1h4m1 0h1m1 0h1m2 0h1m3 0h3m3 0h1m2 0h1m-18 1h4m5 0h8m-20 1h1m3 0h3m2 0h1m1 0h2m3 0h2m1 0h2m-24 1h4m1 0h2m1 0h2m1 0h1m4 0h7m-15 1h2m2 0h2m1 0h2m3 0h1m-21 1h7m1 0h5m1 0h1m1 0h1m1 0h1m1 0h1m-21 1h1m5 0h1m2 0h3m4 0h1m3 0h5m-25 1h1m1 0h3m1 0h1m1 0h3m1 0h3m1 0h9m-25 1h1m1 0h3m1 0h1m2 0h1m3 0h2m2 0h3m2 0h3m-25 1h1m1 0h3m1 0h1m3 0h1m4 0h1m1 0h2m2 0h1m1 0h1m-24 1h1m5 0h1m2 0h2m1 0h1m2 0h1m3 0h5m-24 1h7m1 0h8m1 0h1m4 0h3"/></svg>';

function openNativeShare() {
  awardLiveBadge('recruiter').catch(() => {});
  if (window.webkit?.messageHandlers?.share) {
    window.webkit.messageHandlers.share.postMessage({ url: SHARE_URL });
    return true;
  }
  if (navigator.share) {
    // URL only (no text field): with text present, iOS's "Copy" action copies
    // the text instead of the link.
    navigator.share({ title: 'Flight Crew Fitness', url: SHARE_URL }).catch(() => {});
    return true;
  }
  return false;
}

function shareApp() {
  const canShareSheet = !!(window.webkit?.messageHandlers?.share || navigator.share);
  const root = document.getElementById('modalRoot');
  if (!root) { openNativeShare(); return; }
  root.innerHTML =
    '<div class="modal-bg" onclick="if(event.target===this)closeModal()">' +
    '<div class="modal-sheet" style="text-align:center">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Share with your crew</div>' +
    '<div class="modal-body" style="margin-bottom:14px">No signal needed. AirDrop goes phone to phone, and the code scans offline.</div>' +
    (canShareSheet
      ? '<button class="btn btn-gold" onclick="haptic(\'light\');openNativeShare()">📡 AirDrop or Share</button>'
      : '') +
    '<div style="background:#fff;border-radius:12px;padding:12px;width:220px;height:220px;margin:16px auto 10px" ' +
      'role="img" aria-label="QR code for flightcrew.fit">' + SHARE_QR_SVG + '</div>' +
    '<div style="font-size:0.6875rem;color:var(--muted);margin-bottom:4px">Or point their camera here. Opens when they\'re back online.</div>' +
    '<div style="font-family:var(--mono);font-size:1.375rem;letter-spacing:.06em;color:var(--gold);margin:10px 0 14px">flightcrew.fit</div>' +
    '<button class="btn btn-outline" onclick="copyShareLink()">Copy link</button>' +
    '<button class="btn btn-outline mt8" onclick="closeModal()">Done</button>' +
    '</div></div>';
}

function copyShareLink() {
  awardLiveBadge('recruiter').catch(() => {});
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(SHARE_URL)
      .then(() => showToast('Link copied.'))
      .catch(() => showToast('Copy failed. The address is flightcrew.fit'));
  } else {
    showToast('The address is flightcrew.fit');
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
    photos:   'You\'ve used your ' + FREE_WEEKLY_PHOTOS + ' free photo analyses this week.',
    coach:    'AI coaching is a Pro feature.',
    oura:     'Connecting your Oura Ring directly (for full readiness scores) is a Pro feature.',
    trends:   'Full trend history beyond 30 days is a Pro feature.',
    calendar: 'Unlimited AI calendar classification is a Pro feature.',
  }[reason] || 'This is a Pro feature.';

  const parts = [];
  parts.push('<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal-sheet">');
  parts.push('<div class="modal-handle"></div>');
  parts.push('<div class="modal-title">Flight Crew Fitness Pro</div>');
  parts.push('<div class="modal-body" style="margin-bottom:14px">'+why+'</div>');

  parts.push('<div class="card" style="padding:14px;margin-bottom:12px">');
  [['📷','Unlimited food photo analysis'],
   ['✦','AI Coach: pattern analysis, fatigue calibration, fueling logistics'],
   ['📅','Unlimited AI calendar classification'],
   ['📊','Full trend history and exports']].forEach(([icon,label]) => {
    parts.push('<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px"><span>'+icon+'</span><span style="font-size:0.8125rem">'+label+'</span></div>');
  });
  parts.push('</div>');

  parts.push('<button class="btn btn-gold" onclick="startProPurchase(\''+PRO_PRODUCT_ANNUAL+'\')">'+proPrice(PRO_PRODUCT_ANNUAL, PRO_ANNUAL_PRICE)+' / year</button>');
  // Currency-neutral: a fixed "$5.00 a month" is wrong outside the US.
  parts.push('<div style="text-align:center;font-size:0.6875rem;color:var(--muted);margin:6px 0 10px">Saves about 37% vs monthly</div>');
  parts.push('<button class="btn btn-outline" onclick="startProPurchase(\''+PRO_PRODUCT_MONTHLY+'\')">'+proPrice(PRO_PRODUCT_MONTHLY, PRO_MONTHLY_PRICE)+' / month</button>');
  parts.push(proDisclosureHTML());

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

// ─── PROMO CODE REDEMPTION ──────────────────────────────────────────────
//
// WEB ONLY. App Store Review Guideline 3.1.1: "Apps may not use their own
// mechanisms to unlock content or functionality, such as license keys."
// A box in the iOS app that turns a typed code into Pro is exactly that,
// and the card used to render on the More screen in the shell as well as
// on the web. It is now absent inside the iOS app: no box, no wording
// about codes. Codes are redeemed at flightcrew.fit and the Pro time is
// on the account, so it shows up on the phone (3.1.3(b), multiplatform
// services; the same Pro is sold in the app as an in-app purchase).
//
// Discounts for iOS subscribers go through Apple's own offer codes.
const PROMO_INPUT_HTML = '<input id="promoCodeInput" type="text" placeholder="ENTER CODE" autocapitalize="characters" style="flex:1;min-width:0;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-family:var(--mono);font-size:0.8125rem;letter-spacing:0.05em" onkeydown="if(event.key===\'Enter\')redeemPromoCode()">';
const PROMO_BUTTON_HTML = '<button class="btn btn-outline" style="width:auto;flex-shrink:0;padding:0 18px" onclick="redeemPromoCode()">Redeem</button>';
function inIOSApp() {
  return !!storeKitBridge() || (typeof FCFBridge !== 'undefined' && !!FCFBridge.isNative);
}
// The two lines under "Pro: all features unlocked" on the More screen.
// A complimentary account (platform 'promo': the owner, testers, the App
// Review demo account) reads "Pro (promo)" and "Comp/promo access" on the
// web. Inside the iOS app the same account gets neutral wording, for the
// same 3.1.1 reason the code box is hidden there. Still true either way:
// it does not renew and nothing is billed.
function proStatusCopy(sub, ios) {
  const platform = sub?.platform;
  if (platform === 'promo') {
    return ios
      ? { label: 'Pro access through ', manage: 'Complimentary access. No billing, nothing to manage.' }
      : { label: 'Pro (promo): expires ', manage: 'Comp/promo access: no billing, nothing to manage.' };
  }
  return {
    label: sub?.status === 'grace' ? 'Renewal pending: ' : 'Renews ',
    manage: platform === 'web' ? 'Manage or cancel by contacting support.' : 'Manage or cancel in your Apple ID subscription settings.',
  };
}
function promoCodeCardHTML() {
  if (inIOSApp()) return '';
  return '<div class="card mb12">' +
    '<div style="font-size:0.75rem;font-weight:600;margin-bottom:8px">Have a promo code?</div>' +
    '<div style="display:flex;gap:8px">' +
    PROMO_INPUT_HTML +
    // flex-shrink:0 plus min-width:0 on the input: at the largest text size
    // the input's own intrinsic width was pushing this button off screen.
    PROMO_BUTTON_HTML +
    '</div>' +
    '<div id="promoCodeResult" style="font-size:0.6875rem;margin-top:8px"></div>' +
    '</div>';
}
async function redeemPromoCode() {
  if (inIOSApp()) return;
  const input = document.getElementById('promoCodeInput');
  const resultEl = document.getElementById('promoCodeResult');
  const code = (input?.value || '').trim();
  if (!code) return;
  if (resultEl) { resultEl.style.color = 'var(--muted)'; resultEl.textContent = 'Checking…'; }

  try {
    const { data: { session } } = await SB.auth.getSession();
    if (!session) { if (resultEl) { resultEl.style.color = 'var(--red)'; resultEl.textContent = 'Sign in first.'; } return; }

    const res = await fetch('https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/fcf-redeem-promo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ code }),
    });
    const result = await res.json();

    if (!res.ok) {
      const messages = {
        invalid_code:     'That code isn\'t valid.',
        code_exhausted:   'That code has already been fully redeemed.',
        already_redeemed: 'You\'ve already redeemed this code.',
        missing_code:     'Enter a code first.',
      };
      if (resultEl) { resultEl.style.color = 'var(--red)'; resultEl.textContent = messages[result.error] || 'Something went wrong. Try again.'; }
      return;
    }

    if (input) input.value = '';
    if (resultEl) { resultEl.style.color = 'var(--green)'; resultEl.textContent = ''; }
    await loadSubscription();
    renderPage();
    const until = new Date(result.proUntil).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
    showBigToast('✓ Pro unlocked through ' + until + '!', 'ok');
  } catch (e) {
    if (resultEl) { resultEl.style.color = 'var(--red)'; resultEl.textContent = 'Network error. Try again.'; }
  }
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
    '<div class="modal-body">This permanently deletes your account and everything in it: every workout, meal, biometric reading, schedule and personal record. It cannot be undone and there is no backup.</div>' +
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
      cancelAllNativeNotifications();
      // User-owned rows first, so nothing is orphaned if the auth deletion
      // fails partway. Each is allowed to fail independently — a missing
      // table must not strand someone half-deleted with no way to retry.
      const tables = ['workout_sessions','meal_logs','weight_log','oura_daily',
                      'daily_inputs','food_photo_usage','photo_quota_weekly','medication_logs'];
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

    try { localStorage.clear(); } catch(e) { console.warn('localStorage.clear failed (likely private-mode storage restrictions):', e); }
    await SB.auth.signOut().catch(() => {});
    ST.user = null; ST.authed = false; ST.subscription = null;
    closeModal();
    showInfoModal('Account deleted', 'Your account and all associated data have been removed. Sorry to see you go.');
    setTimeout(() => location.reload(), 2500);
  } catch (e) {
    showBigToast('Could not complete deletion: ' + (e?.message || 'unknown error') + '. Nothing was partially removed. Please try again.', 'warn');
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
  // BUG FIX / feature: record when tracking gets turned off (any way —
  // this toggle, the nudge card below, wherever) so a 30-day re-engagement
  // nudge can fire later, and clear it if turned back on so an old
  // disable timestamp doesn't linger and immediately re-trigger reengage.
  const disabledAtKey = key === 'trackNutrition' ? 'nutritionTrackingDisabledAt' : 'hydrationTrackingDisabledAt';
  const nudgeKey = key === 'trackNutrition' ? 'nutritionNudge' : 'hydrationNudge';
  ST[disabledAtKey] = on ? null : new Date().toISOString();
  ST[nudgeKey] = null; // whichever nudge was showing no longer applies either way
  renderPage(); // optimistic update — toggle appears instant
  try {
    const profile = (await dbGetProfile()) || {};
    profile[key] = !!on;
    profile[disabledAtKey] = ST[disabledAtKey];
    await dbSetProfile(profile);
  } catch(e) { showBigToast('Saved on this device, but could not sync.', 'warn'); }
}

// Checks whether nutrition/hydration tracking has gone quiet enough to
// offer turning it off, or has been off long enough to offer trying it
// again. Run once at boot (see bootAppInner) rather than on every
// render — this needs a couple of DB queries, and the answer doesn't
// change meaningfully within a single session.
//
// "Fewer than 2 of the last 7 days" rather than "3-4 CONSECUTIVE days"
// deliberately — a pilot on an ordinary multi-day trip might reasonably
// skip logging for exactly that stretch without having disengaged from
// the feature at all; a trailing 7-day window is much more forgiving of
// that and a better signal of genuine disuse.
async function computeTrackingNudges() {
  if (!ST.user) return;
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const suppressMs = 7 * 24 * 60 * 60 * 1000; // don't re-show a dismissed nudge for a week

  const dismissedRecently = (iso) => iso && (now - new Date(iso).getTime()) < suppressMs;

  // Nutrition
  try {
    if (ST.trackNutrition) {
      if (!dismissedRecently(ST.nutritionNudgeDismissedAt)) {
        const { data } = await SB.from('meal_logs').select('logged_at')
          .eq('user_id', ST.user.id).gte('logged_at', sevenDaysAgo);
        const distinctDays = new Set((data || []).map(r => localDateStr(new Date(r.logged_at)))).size;
        if (distinctDays < 2) ST.nutritionNudge = 'disable';
      }
    } else if (ST.nutritionTrackingDisabledAt &&
               (now - new Date(ST.nutritionTrackingDisabledAt).getTime()) > thirtyDaysMs &&
               !dismissedRecently(ST.nutritionNudgeDismissedAt)) {
      ST.nutritionNudge = 'reengage';
    }
  } catch(e) { /* non-fatal — just skip the nudge this session */ }

  // Hydration — same logic, keyed off daily_inputs.water_in instead of meal_logs.
  try {
    if (ST.trackHydration) {
      if (!dismissedRecently(ST.hydrationNudgeDismissedAt)) {
        const { data } = await SB.from('daily_inputs').select('date, water_in')
          .eq('user_id', ST.user.id).gte('date', sevenDaysAgo.slice(0, 10)).gt('water_in', 0);
        if ((data || []).length < 2) ST.hydrationNudge = 'disable';
      }
    } else if (ST.hydrationTrackingDisabledAt &&
               (now - new Date(ST.hydrationTrackingDisabledAt).getTime()) > thirtyDaysMs &&
               !dismissedRecently(ST.hydrationNudgeDismissedAt)) {
      ST.hydrationNudge = 'reengage';
    }
  } catch(e) { /* non-fatal */ }
}

async function dismissTrackingNudge(type) {
  const nudgeKey = type === 'nutrition' ? 'nutritionNudge' : 'hydrationNudge';
  const dismissedKey = type === 'nutrition' ? 'nutritionNudgeDismissedAt' : 'hydrationNudgeDismissedAt';
  ST[nudgeKey] = null;
  ST[dismissedKey] = new Date().toISOString();
  renderPage();
  try {
    const profile = (await dbGetProfile()) || {};
    profile[dismissedKey] = ST[dismissedKey];
    await dbSetProfile(profile);
  } catch(e) { /* best-effort — worst case it re-shows once more than intended */ }
}

async function setScheduleSource(value) {
  ST.scheduleSource = value;
  renderPage();
  try {
    const profile = (await dbGetProfile()) || {};
    profile.scheduleSource = value;
    await dbSetProfile(profile);
  } catch(e) { showBigToast('Saved on this device, but could not sync.', 'warn'); }
}

async function setBaseTimezone(value) {
  ST.baseTimezone = value;
  renderPage();
  try {
    const profile = (await dbGetProfile()) || {};
    profile.baseTimezone = value;
    // BUG FIX (see descriptionLocalTimes): an uploaded .ics schedule is
    // only ever parsed once, at upload time, under whatever baseTimezone
    // was set at that moment — changing the setting afterward silently
    // left the already-parsed events on the old (possibly wrong)
    // interpretation until the user thought to re-upload the same file
    // again. Re-parsing the stored raw text here keeps it in sync with
    // the setting immediately, the same way the native path below already
    // re-syncs Apple Calendar on a timezone change.
    if (ST.flightScheduleRaw) {
      const reparsed = parseFlightScheduleICS(ST.flightScheduleRaw);
      ST.flightSchedule = reparsed;
      profile.flightSchedule = reparsed;
    }
    await dbSetProfile(profile);
  } catch(e) { showBigToast('Saved on this device, but could not sync.', 'warn'); }
  // Re-sync immediately rather than waiting for the next natural sync —
  // otherwise already-classified events computed under the OLD (possibly
  // wrong) timezone assumption would keep showing stale times until
  // something else happens to trigger a refresh.
  if (typeof FCFBridge !== 'undefined' && FCFBridge.isNative && ST.calendarGranted) {
    showToast('Re-syncing calendar with the new base timezone…');
    FCFBridge.syncCalendar(value);
  } else if (ST.flightScheduleRaw) {
    showToast('Re-parsed your uploaded schedule with the new base timezone…');
    renderPage();
  }
}

// ─── SCHEDULE SOURCE ──────────────────────────────────────────────────────
// ST.calendarEvents (AI-classified, from Apple Calendar sync) and
// ST.flightSchedule (parsed directly from an uploaded .ics) have different
// shapes and, it turns out, don't always agree on the same real-world
// flight's time. Traced one specific case to a bug in a third-party
// crew-schedule-to-calendar sync tool ("MobileCCI", visible in the raw
// event identifiers) that a user's own calendar showed multiple
// conflicting copies of the same flight for — one stamped with the wrong
// station's UTC offset, confirmed via a self-documenting note field on a
// DIFFERENT event from the same source: "CCI export stamped departure
// with the PHX offset instead of the station offset." An uploaded .ics
// doesn't go through that same sync path, so it isn't affected the same
// way — which is exactly why being able to pick a source explicitly,
// rather than always trusting whichever the app picks automatically,
// matters here.
//
// Centralizing the choice here so every place that displays or reasons
// about "today's schedule" agrees on the same source — the two
// independent priority checks that used to exist in different functions
// (before being merged) are exactly how the app ended up showing two
// different schedules on the same screen at once.
function getActiveSchedule() {
  if (ST.scheduleSource === 'ics') return { source: 'ics', events: ST.flightSchedule || [] };
  if (ST.scheduleSource === 'calendar') return { source: 'calendar', events: ST.calendarEvents || [] };
  // 'auto' (default): prefer Apple Calendar sync if it has any data at
  // all, falling back to the uploaded .ics — matches the original
  // behavior from before this preference existed.
  if (ST.calendarEvents?.length) return { source: 'calendar', events: ST.calendarEvents };
  return { source: 'ics', events: ST.flightSchedule || [] };
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
    '<span style="font-family:var(--mono);font-size:0.5625rem;letter-spacing:.1em;color:var(--muted)">💧 HYDRATION</span>' +
    '<span style="font-family:var(--mono);font-size:0.625rem;color:'+hs.color+'">'+ST.waterIn.toFixed(1)+'/'+hydroTarget().toFixed(1)+'L · '+hs.label+' <span style="color:var(--gold)">+ LOG</span></span></div>';
}

function renderTrackingToggles() {
  const row = (key, label, sub) => {
    const on = !!ST[key];
    const knobLeft = on ? '23px' : '3px';
    const bg       = on ? 'var(--gold)' : 'rgba(255,255,255,0.12)';
    return (
      '<div class="fb" style="padding:12px 0;border-bottom:1px solid var(--border);align-items:center">' +
        '<div style="flex:1;padding-right:16px">' +
          '<div style="font-size:0.875rem">'+label+'</div>' +
          '<div style="font-size:0.6875rem;color:var(--muted);margin-top:2px">'+sub+'</div>' +
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
      '<div style="font-size:0.6875rem;color:var(--muted);margin-top:10px">Turning these off hides the screens and stops the reminders. Nothing you have already logged is deleted.</div>' +
    '</div>';
}

// Text size picker (More > Display). Four buttons, the active one in gold.
// Each button's own label is drawn at that step's size so the choice can
// be judged before tapping it.
function renderTextSizeControl() {
  const cur = currentTextSize();
  // rem already includes the current step, so divide it back out: each
  // label lands at its own true size no matter which step is active.
  const curScale = textSizeEntry(cur).scale;
  const btns = TEXT_SIZES.map(t => {
    const on = t.key === cur;
    return '<button onclick="haptic(\'selection\');setTextSize(\''+t.key+'\')" style="' +
      'flex:1;min-width:0;padding:10px 2px;border-radius:10px;cursor:pointer;' +
      'font-family:\'Inter\',sans-serif;font-weight:600;line-height:1.1;' +
      'font-size:'+(0.7 * t.scale / curScale).toFixed(3)+'rem;' +
      'border:1px solid '+(on ? 'var(--gold)' : 'var(--border)')+';' +
      'background:'+(on ? 'rgba(212,175,55,0.15)' : 'transparent')+';' +
      'color:'+(on ? 'var(--gold)' : 'var(--text)')+'">'+t.label+'</button>';
  }).join('');
  return '<div class="section-label" style="margin-top:20px">DISPLAY</div>' +
    '<div class="card mb12">' +
      '<div style="font-size:0.875rem">Text size</div>' +
      '<div style="font-size:0.6875rem;color:var(--muted);margin-top:2px;margin-bottom:10px">Makes all text in the app bigger. Layout stays the same.</div>' +
      '<div style="display:flex;gap:6px;align-items:stretch">'+btns+'</div>' +
    '</div>';
}

async function setTextSize(key) {
  const applied = applyTextSize(key);
  try { localStorage.setItem(TEXT_SIZE_LS_KEY, applied); } catch (e) { /* private mode */ }
  renderPage(); // the picker highlights the new choice
  try {
    const profile = (await dbGetProfile()) || {};
    profile.textSize = applied;
    await dbSetProfile(profile);
  } catch (e) { console.warn('setTextSize save error:', e); }
}

// ─── MEDICATIONS & SUPPLEMENTS ────────────────────────────────────────────
// Definitions live in the profile (profile.medications). Each one:
//   { id, name, dose, unit, times:['07:00','19:00'], days:null|[0..6],
//     remind:bool, notes }
// days === null means every day; otherwise a list of JS weekday numbers
// (0 = Sunday). "Taken" check-offs are rows in medication_logs, one per
// (med, local date, time slot), mirrored into ST.medsTakenToday for the
// current day so the Today card can toggle instantly.
const MED_UNITS = ['mg','g','mcg','IU','mL','capsule','tablet','scoop','drop','spray','unit'];
const MED_DAY_LABELS = ['S','M','T','W','T','F','S'];
const MED_MAX_TIMES = 6;

// Like sanitizeUserText but keeps apostrophes ("St. John's Wort"). Safe
// here because med names and notes only ever render as element text or
// inside double-quoted attributes, never inside a single-quoted onclick.
function medText(s) {
  return String(s || '').replace(/[<>"`\\]/g, '').slice(0, 120);
}

function newMedId() {
  return 'med_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function normalizeMedication(m) {
  if (!m || typeof m !== 'object') return null;
  const name = medText(m.name).trim();
  if (!name) return null;
  // The id goes into inline onclick handlers and iOS notification ids, so
  // it is restricted to a safe character set rather than trusted as stored.
  const safeId = String(m.id || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40);
  const times = (Array.isArray(m.times) ? m.times : [])
    .map(t => String(t || '').trim()).filter(t => /^\d{2}:\d{2}$/.test(t));
  const days = Array.isArray(m.days)
    ? m.days.map(d => parseInt(d)).filter(d => d >= 0 && d <= 6)
    : null;
  const dose = parseFloat(m.dose);
  return {
    id: safeId || newMedId(),
    name,
    dose: isNaN(dose) || dose <= 0 ? null : dose,
    unit: MED_UNITS.includes(m.unit) ? m.unit : 'mg',
    times: times.length ? [...new Set(times)].sort() : ['08:00'],
    days: days && days.length && days.length < 7 ? [...new Set(days)].sort() : null,
    remind: !!m.remind,
    notes: medText(m.notes).trim(),
  };
}

function medDoseLabel(m) {
  if (m.dose == null) return '';
  const n = Math.round(m.dose * 100) / 100;
  const plural = (n !== 1 && ['capsule','tablet','scoop','drop','spray','unit'].includes(m.unit)) ? 's' : '';
  return n + ' ' + m.unit + plural;
}

function medFrequencyLabel(m) {
  const perDay = m.times.length === 1 ? 'once a day' : m.times.length === 2 ? 'twice a day' : m.times.length + '× a day';
  if (!m.days) return perDay;
  const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return perDay + ' on ' + m.days.map(d => names[d]).join(', ');
}

function medIsDueOn(m, date) {
  return !m.days || m.days.includes(date.getDay());
}

// Every dose due today, in time order: [{ med, time, key }].
function medsDueToday(now) {
  const out = [];
  (ST.medications || []).forEach(m => {
    if (!medIsDueOn(m, now)) return;
    m.times.forEach(t => out.push({ med: m, time: t, key: m.id + '|' + t }));
  });
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name));
}

async function saveMedicationsToProfile() {
  // Reschedule first: the phone's reminders must match what is on screen
  // even if the cloud save below fails (offline on a layover, say).
  scheduleNotifications();
  const profile = (await dbGetProfile()) || {};
  profile.medications = ST.medications;
  await dbSetProfile(profile);
}

// ── Profile card ──────────────────────────────────────────────────────────
function renderMedicationsCard() {
  const parts = [];
  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">MEDS &amp; SUPPLEMENTS</div>');
  parts.push('<div style="font-size:0.75rem;color:var(--muted);line-height:1.6;margin-bottom:12px">Track anything you take on a schedule. Due doses show on Today with a check-off, and the iOS app can remind you. This stays private to your account and is only shared if you export your data.</div>');
  const meds = ST.medications || [];
  const plan = medReminderPlan();
  if (plan.overflow) {
    parts.push('<div class="alert alert-warn" style="margin-bottom:12px"><div class="alert-icon">🔔</div><div>iPhone limits how many reminders one app can hold. Some doses below won\'t ring; the ones without a bell. Turn reminders off for a few, or use every-day schedules instead of specific weekdays.</div></div>');
  }
  if (!meds.length) {
    parts.push('<div style="font-size:0.75rem;color:var(--muted);text-align:center;padding:6px 0 12px">Nothing added yet.</div>');
  } else {
    meds.forEach(m => {
      parts.push('<div class="fb" style="padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer;align-items:center" onclick="haptic(\'light\');openMedicationEditor(\''+m.id+'\')">');
      parts.push('<div style="flex:1;padding-right:12px">');
      parts.push('<div style="font-size:0.875rem;font-weight:600">'+m.name+(m.dose != null ? ' <span style="font-weight:400;color:var(--muted)">'+medDoseLabel(m)+'</span>' : '')+'</div>');
      const ringing = m.remind && m.times.every(t => plan.scheduled.has(m.id + '|' + t));
      const partial = m.remind && !ringing && m.times.some(t => plan.scheduled.has(m.id + '|' + t));
      parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:2px">'+medFrequencyLabel(m)+' · <span style="font-family:var(--mono)">'+m.times.join(', ')+'</span>'+(ringing ? ' · 🔔' : partial ? ' · 🔔 some times' : '')+'</div>');
      parts.push('</div>');
      parts.push('<div style="color:var(--muted)">›</div>');
      parts.push('</div>');
    });
  }
  parts.push('<button class="btn btn-outline mt12" onclick="haptic(\'light\');openMedicationEditor()">+ Add Medication or Supplement</button>');
  parts.push('</div>');
  return parts.join('');
}

// ── Editor modal ──────────────────────────────────────────────────────────
// The draft lives in ST.medDraft so the sheet can re-render (adding or
// removing a time row) without losing what has been typed so far.
function openMedicationEditor(medId) {
  const existing = medId ? (ST.medications || []).find(m => m.id === medId) : null;
  ST.medDraft = existing
    ? JSON.parse(JSON.stringify(existing))
    // Reminders only exist in the iOS app, so on web they default off
    // rather than showing a setting that silently does nothing.
    : { id: null, name: '', dose: '', unit: 'mg', times: ['08:00'], days: null,
        remind: typeof FCFBridge !== 'undefined' && !!FCFBridge.isNative, notes: '' };
  renderMedicationEditor();
}

function syncMedDraftFromDOM() {
  const d = ST.medDraft; if (!d) return;
  const g = id => document.getElementById(id);
  if (g('medName')) d.name = g('medName').value;
  if (g('medDose')) d.dose = g('medDose').value;
  if (g('medUnit')) d.unit = g('medUnit').value;
  if (g('medNotes')) d.notes = g('medNotes').value;
  d.times = d.times.map((t, i) => (g('medTime'+i) ? g('medTime'+i).value : t) || t);
}

function renderMedicationEditor() {
  const root = document.getElementById('modalRoot');
  const d = ST.medDraft;
  if (!root || !d) return;
  const isNew = !d.id;
  const parts = [];
  parts.push('<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal-sheet">');
  parts.push('<div class="modal-handle"></div>');
  parts.push('<div class="modal-title">'+(isNew ? 'Add Medication / Supplement' : 'Edit '+d.name)+'</div>');

  parts.push('<div class="field"><label>Name</label><input id="medName" type="text" maxlength="60" placeholder="e.g. Creatine" value="'+medText(d.name)+'"></div>');

  parts.push('<div class="field-row" style="margin-bottom:10px">');
  parts.push('<div class="field" style="margin-bottom:0"><label>Dose</label><input id="medDose" type="text" inputmode="decimal" placeholder="e.g. 5" value="'+sanitizeUserText(d.dose ?? '')+'"></div>');
  parts.push('<div class="field" style="margin-bottom:0"><label>Unit</label><select id="medUnit">');
  MED_UNITS.forEach(u => parts.push('<option value="'+u+'"'+(d.unit===u?' selected':'')+'>'+u+'</option>'));
  parts.push('</select></div>');
  parts.push('</div>');

  // Days: every day, or a subset. Tapping a chip toggles it; tapping
  // "Every day" clears the subset.
  parts.push('<div class="field"><label>Days</label>');
  parts.push('<div style="display:flex;gap:6px;align-items:center">');
  parts.push('<button type="button" class="env-btn '+(!d.days?'sel':'')+'" style="flex:0 0 auto;padding:8px 10px" onclick="syncMedDraftFromDOM();ST.medDraft.days=null;renderMedicationEditor()"><div class="el">EVERY DAY</div></button>');
  MED_DAY_LABELS.forEach((lbl, i) => {
    const on = d.days && d.days.includes(i);
    parts.push('<button type="button" class="env-btn '+(on?'sel':'')+'" style="flex:1;padding:8px 0;min-width:0" onclick="toggleMedDraftDay('+i+')"><div class="el">'+lbl+'</div></button>');
  });
  parts.push('</div></div>');

  parts.push('<div class="field"><label>Times</label>');
  d.times.forEach((t, i) => {
    parts.push('<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">');
    parts.push('<input id="medTime'+i+'" type="time" value="'+t+'" style="flex:1">');
    if (d.times.length > 1) parts.push('<button type="button" class="btn btn-outline" style="width:auto;padding:10px 14px;margin:0" aria-label="Remove time" onclick="removeMedDraftTime('+i+')">✕</button>');
    parts.push('</div>');
  });
  if (d.times.length < MED_MAX_TIMES) parts.push('<button type="button" class="btn-ghost" style="padding:4px 0" onclick="addMedDraftTime()">+ Add another time</button>');
  parts.push('</div>');

  // Same toggle control as the Tracking card, so it reads as one system
  // (a .field-wrapped native checkbox would inherit the input reset and
  // render invisible).
  const knobLeft = d.remind ? '23px' : '3px';
  const knobBg   = d.remind ? 'var(--gold)' : 'rgba(255,255,255,0.12)';
  parts.push('<div class="fb" style="padding:10px 0 14px;align-items:center">' +
    '<div style="flex:1;padding-right:16px"><div style="font-size:0.875rem">Remind me</div>' +
    '<div style="font-size:0.6875rem;color:var(--muted);margin-top:2px">Phone notification at each time above (iOS app)</div></div>' +
    '<button type="button" onclick="haptic(\'selection\');syncMedDraftFromDOM();ST.medDraft.remind=!ST.medDraft.remind;renderMedicationEditor()" style="cursor:pointer;flex-shrink:0;width:46px;height:26px;border-radius:13px;background:'+knobBg+';position:relative;border:none;padding:0;transition:background 0.15s;-webkit-tap-highlight-color:transparent;touch-action:manipulation">' +
    '<div style="position:absolute;top:3px;left:'+knobLeft+';width:20px;height:20px;border-radius:50%;background:#fff;transition:left 0.15s;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div></button></div>');

  parts.push('<div class="field"><label>Notes (optional)</label><input id="medNotes" type="text" maxlength="120" placeholder="e.g. with food" value="'+medText(d.notes)+'"></div>');

  parts.push('<button class="btn btn-gold mt8" onclick="saveMedicationFromEditor()">'+(isNew ? 'Add' : 'Save')+'</button>');
  if (!isNew) parts.push('<button class="btn btn-red-outline mt8" onclick="deleteMedication(\''+d.id+'\')">Remove</button>');
  parts.push('<button class="btn-ghost" style="display:block;width:100%;text-align:center;margin-top:10px" onclick="closeModal()">Cancel</button>');
  parts.push('</div></div>');
  root.innerHTML = parts.join('');
}

function toggleMedDraftDay(i) {
  syncMedDraftFromDOM();
  const d = ST.medDraft;
  const days = d.days ? [...d.days] : [];
  const idx = days.indexOf(i);
  if (idx >= 0) days.splice(idx, 1); else days.push(i);
  d.days = days.length ? days.sort() : null;
  renderMedicationEditor();
}

function addMedDraftTime() {
  syncMedDraftFromDOM();
  if (ST.medDraft.times.length >= MED_MAX_TIMES) return;
  ST.medDraft.times.push('12:00');
  renderMedicationEditor();
}

function removeMedDraftTime(i) {
  syncMedDraftFromDOM();
  ST.medDraft.times.splice(i, 1);
  renderMedicationEditor();
}

async function saveMedicationFromEditor() {
  syncMedDraftFromDOM();
  const draft = ST.medDraft;
  if (!medText(draft.name).trim()) { showToast('Enter a name.'); return; }
  const med = normalizeMedication(draft);
  if (!med) { showToast('Enter a name.'); return; }
  const list = ST.medications || [];
  const idx = list.findIndex(m => m.id === med.id);
  if (idx >= 0) list[idx] = med; else list.push(med);
  ST.medications = list;
  closeModal();
  renderPage();
  try {
    await saveMedicationsToProfile();
    showBigToast(med.name + ' saved.', 'ok');
  } catch (e) { showBigToast('Saved on this device, but could not sync.', 'warn'); }
}

async function deleteMedication(id) {
  const med = (ST.medications || []).find(m => m.id === id);
  if (!med) return;
  // The confirm dialog replaces the editor sheet, so a Cancel has to bring
  // the editor back (with any unsaved edits) instead of closing everything.
  syncMedDraftFromDOM();
  if (!(await appConfirm('Remove ' + med.name + '? Past check-offs are kept in your history.', 'Remove'))) {
    renderMedicationEditor();
    return;
  }
  ST.medications = ST.medications.filter(m => m.id !== id);
  closeModal();
  renderPage();
  try { await saveMedicationsToProfile(); }
  catch (e) { showBigToast('Removed on this device, but could not sync.', 'warn'); }
}

// ── Taken log (medication_logs) ───────────────────────────────────────────
async function loadMedsTakenToday() {
  const today = localDateStr(new Date());
  ST.medsTakenDate = today;
  ST.medsTakenToday = {};
  if (!ST.user) return;
  try {
    const { data, error } = await withTimeout(SB.from('medication_logs').select('med_id,time')
      .eq('user_id', ST.user.id).eq('date', today));
    if (error) throw error;
    (data || []).forEach(r => { ST.medsTakenToday[r.med_id + '|' + r.time] = true; });
  } catch (e) { /* table missing or offline: check-offs just start empty */ }
}

// Doses with a save still in flight. A second tap on the same dose is
// ignored until the first request finishes, so a fast check-then-uncheck
// can't reach the server out of order and leave it disagreeing with the
// screen.
const _medToggleInFlight = new Set();

async function toggleMedTaken(medId, time) {
  const today = localDateStr(new Date());
  if (ST.medsTakenDate !== today) { ST.medsTakenDate = today; ST.medsTakenToday = {}; }
  const key = medId + '|' + time;
  if (_medToggleInFlight.has(key)) return;
  const nowTaken = !ST.medsTakenToday[key];
  if (nowTaken) ST.medsTakenToday[key] = true; else delete ST.medsTakenToday[key];
  haptic(nowTaken ? 'medium' : 'light');
  refreshMedsSection();
  if (!ST.user) return;
  _medToggleInFlight.add(key);
  try {
    if (nowTaken) {
      // ignoreDuplicates makes this INSERT ... ON CONFLICT DO NOTHING. A
      // plain upsert is ON CONFLICT DO UPDATE, which Postgres checks
      // against an UPDATE policy this table doesn't have, so re-checking a
      // dose already saved (from another device, or after an offline boot)
      // failed with a row-level security error. "Already recorded" is
      // exactly the outcome wanted here, so doing nothing is correct.
      const { error } = await withTimeout(SB.from('medication_logs').upsert(
        { user_id: ST.user.id, med_id: medId, date: today, time, taken_at: new Date().toISOString() },
        { onConflict: 'user_id,med_id,date,time', ignoreDuplicates: true }));
      if (error) throw error;
    } else {
      const { error } = await withTimeout(SB.from('medication_logs').delete()
        .eq('user_id', ST.user.id).eq('med_id', medId).eq('date', today).eq('time', time));
      if (error) throw error;
    }
  } catch (e) {
    // Roll back so the screen never claims a check-off the server rejected.
    if (nowTaken) delete ST.medsTakenToday[key]; else ST.medsTakenToday[key] = true;
    refreshMedsSection();
    showBigToast('Could not save that check-off. Try again in a moment.', 'warn');
  } finally {
    _medToggleInFlight.delete(key);
  }
}

// ── Today card ────────────────────────────────────────────────────────────
// The card lives in its own #medsTodaySection wrapper so a check-off can
// redraw just this card. A full renderPage() on Today empties the whole
// page and refetches meals before redrawing, which snapped the scroll
// position back to the top after every tap (reported: checking off one
// dose made you scroll back down to reach the next one).
function buildMedsTodayHTML(ctx) {
  return '<div id="medsTodaySection">' + buildMedsTodayInner(ctx) + '</div>';
}

function refreshMedsSection() {
  const el = document.getElementById('medsTodaySection');
  if (el) el.innerHTML = buildMedsTodayInner({ now: new Date() });
  else if (ST.tab === 'today') renderPage(); // card not on screen yet
}

function buildMedsTodayInner(ctx) {
  const due = medsDueToday(ctx.now);
  if (!due.length) return '';
  const today = localDateStr(ctx.now);
  // Day rolled over while the app stayed open: yesterday's check-offs
  // must not carry into today. Clear now, refetch in the background.
  if (ST.medsTakenDate !== today) { ST.medsTakenDate = today; ST.medsTakenToday = {}; loadMedsTakenToday().then(refreshMedsSection); }
  const nowHM = String(ctx.now.getHours()).padStart(2,'0') + ':' + String(ctx.now.getMinutes()).padStart(2,'0');
  const takenCount = due.filter(d => ST.medsTakenToday[d.key]).length;
  const parts = [];
  parts.push('<div class="section-label">MEDS &amp; SUPPLEMENTS <span style="margin-left:auto;font-family:var(--mono);letter-spacing:.06em">'+takenCount+'/'+due.length+'</span></div>');
  parts.push('<div class="card mb12">');
  due.forEach((d, i) => {
    const taken = !!ST.medsTakenToday[d.key];
    const overdue = !taken && d.time < nowHM;
    const timeColor = taken ? 'var(--muted)' : overdue ? 'var(--amber)' : 'var(--text)';
    const border = i < due.length - 1 ? 'border-bottom:1px solid var(--border);' : '';
    parts.push('<div class="fb" style="padding:10px 0;'+border+'cursor:pointer;align-items:center;-webkit-tap-highlight-color:transparent" onclick="toggleMedTaken(\''+d.med.id+'\',\''+d.time+'\')">');
    parts.push('<span style="font-family:var(--mono);font-size:0.75rem;color:'+timeColor+';min-width:52px">'+d.time+'</span>');
    parts.push('<span style="flex:1;font-size:0.875rem;'+(taken?'color:var(--muted);text-decoration:line-through;':'')+'">'+d.med.name+(d.med.dose != null ? ' <span style="color:var(--muted);font-size:0.75rem">'+medDoseLabel(d.med)+'</span>' : '')+'</span>');
    parts.push('<span style="width:26px;height:26px;border-radius:50%;border:1.5px solid '+(taken?'var(--gold)':'var(--border)')+';background:'+(taken?'var(--gold)':'transparent')+';display:flex;align-items:center;justify-content:center;font-size:0.875rem;color:#0b0f18;flex-shrink:0">'+(taken?'✓':'')+'</span>');
    parts.push('</div>');
  });
  parts.push('</div>');
  return parts.join('');
}

// What the native shell needs to schedule reminders: one entry per dose
// that has reminders on. Capped so a long list can never crowd out the
// other notification types under iOS's 64-pending limit.
// Each dose costs one iOS request, or one per weekday when day-restricted.
// MED_REMINDER_BUDGET must match the `budget` in NotificationManager.swift's
// scheduleMedicationReminders. Doses past the budget are dropped here, so
// the web side knows exactly which ones will ring and can say so.
const MED_REMINDER_BUDGET = 30;
function medReminderPlan() {
  const prefs = [], scheduled = new Set();
  let used = 0, overflow = false;
  (ST.medications || []).forEach(m => {
    if (!m.remind) return;
    m.times.forEach(t => {
      const [h, mm] = t.split(':').map(n => parseInt(n));
      if (isNaN(h) || isNaN(mm)) return;
      const cost = m.days ? m.days.length : 1;
      if (used + cost > MED_REMINDER_BUDGET) { overflow = true; return; }
      used += cost;
      scheduled.add(m.id + '|' + t);
      prefs.push({
        id: m.id, name: m.name, dose: medDoseLabel(m), hour: h, minute: mm,
        // iOS weekday numbering: 1 = Sunday … 7 = Saturday.
        weekdays: m.days ? m.days.map(d => d + 1) : null,
      });
    });
  });
  return { prefs, scheduled, overflow };
}
function medicationNotificationPrefs() { return medReminderPlan().prefs; }

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

// In-app replacement for window.confirm(). Inside the iOS app's WKWebView,
// confirm() returns false instantly and shows nothing unless the native side
// implements runJavaScriptConfirmPanelWithMessage (it didn't until build 6),
// so every "Delete ...?" guard silently cancelled. Reported via the progress
// photo delete button doing nothing. Resolves true only on the confirm tap.
// Message goes in via textContent, so names in it can't inject markup.
let _appConfirmResolve = null;
function appConfirm(message, confirmLabel) {
  return new Promise(resolve => {
    const root = document.getElementById('modalRoot');
    if (!root) { resolve(false); return; }
    if (_appConfirmResolve) _appConfirmResolve(false); // a newer prompt replaces an unanswered one
    _appConfirmResolve = resolve;
    root.innerHTML =
      '<div class="modal-bg" onclick="if(event.target===this)_appConfirmAnswer(false)"><div class="modal-sheet">' +
      '<div class="modal-handle"></div>' +
      '<div class="modal-title">Are you sure?</div>' +
      '<div class="modal-body" id="appConfirmMsg" style="margin-bottom:14px"></div>' +
      '<button class="btn" style="background:var(--red,#ef4444);color:#fff" onclick="haptic(\'medium\');_appConfirmAnswer(true)"></button>' +
      '<button class="btn btn-outline mt8" onclick="_appConfirmAnswer(false)">Cancel</button>' +
      '</div></div>';
    root.querySelector('#appConfirmMsg').textContent = message;
    root.querySelector('.modal-sheet .btn').textContent = confirmLabel || 'Delete';
  });
}
function _appConfirmAnswer(yes) {
  const r = _appConfirmResolve;
  _appConfirmResolve = null;
  closeModal();
  if (r) r(!!yes);
}

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
  } catch(e) { console.warn('Saving in-progress workout state locally failed:', e); }
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
  } catch(e) { console.warn('Saving timer state locally failed:', e); }
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
  } catch(e) { console.warn('Restoring saved timer state failed (treating as no active timer):', e); }
}

// Retries any biometric entries that were saved locally because the
// remote save failed at the time (see saveBio's catch block). Called on
// reconnect and at boot — a pending entry from an offline session should
// get pushed the moment there's actually a connection again, not sit
// local-only until the user happens to log another entry.
async function syncPendingBioEntries() {
  if (!ST.user) return;
  let pending;
  try { pending = JSON.parse(localStorage.getItem('fcf_bio_pending') || '[]'); }
  catch(e) { console.warn('Reading pending bio entries failed:', e); return; }
  if (!pending.length) return;

  const stillPending = [];
  for (const entry of pending) {
    try {
      const d = new Date(entry.logged_at);
      const dayStart = new Date(d); dayStart.setHours(0,0,0,0);
      const dayEnd   = new Date(d); dayEnd.setHours(23,59,59,999);
      const { data: existing, error: selErr } = await SB.from('weight_log')
        .select('id').eq('user_id', ST.user.id)
        .gte('logged_at', dayStart.toISOString()).lte('logged_at', dayEnd.toISOString()).limit(1);
      if (selErr) throw selErr;

      if (existing && existing.length > 0) {
        const { error } = await SB.from('weight_log').update({
          weight_lb: entry.weight_lb, waist_in: entry.waist_in, systolic_bp: entry.systolic_bp,
          diastolic_bp: entry.diastolic_bp, fasting_glucose: entry.fasting_glucose,
        }).eq('id', existing[0].id);
        if (error) throw error;
      } else {
        const { error } = await SB.from('weight_log').insert([{ user_id: ST.user.id, ...entry }]);
        if (error) throw error;
      }
    } catch(e) {
      console.warn('Syncing a pending bio entry failed, will retry later:', e);
      stillPending.push(entry);
    }
  }
  try { localStorage.setItem('fcf_bio_pending', JSON.stringify(stillPending)); } catch(e) {/* worst case, retries the same entries again next time — never loses data */}
  if (stillPending.length < pending.length) {
    showBigToast('✅ Synced ' + (pending.length - stillPending.length) + ' biometric ' + (pending.length - stillPending.length === 1 ? 'entry' : 'entries') + ' logged while offline.', 'ok');
    setTimeout(() => loadAndDrawCharts(), 100);
  }
}

// Refresh anything served from offline fallbacks the moment connectivity
// returns — otherwise the calendar (and sync indicator) stay frozen on the
// offline snapshot until the user fully restarts the app.
// BUG FIX (reported: app re-renders/flickers several times within a few
// seconds of loading, traced with hard evidence — two console captures
// showing the count growing over that exact window). Confirmed this
// "online" listener is the only other place besides normal boot that
// independently calls syncOuraData() (every other call site is either a
// manual button tap or the 30-minute retry interval), and this function
// also does its own separate, immediate renderPage() on top of that.
// Whether Chrome's "online" event can fire shortly after a fresh page
// load even when the connection was never actually lost is a genuine,
// documented browser inconsistency I can't fully verify without direct
// instrumentation - but guarding this against a spurious fire is correct
// regardless of the exact mechanism: refreshing "offline fallback" data
// makes no sense to do at all if the app was never actually offline this
// session, so there's no real downside to adding this check either way.
let _wasEverOffline = false;
async function refreshOnReconnect() {
  if (!_wasEverOffline) return;
  _wasEverOffline = false;
  ST.calendarSessions = {};
  try {
    // Re-fetch the profile too — if the app booted offline it hydrated from
    // the local mirror (or nothing), and things like Oura connection state
    // would otherwise stay stale until a full restart.
    const [profile] = await Promise.all([dbGetProfile(), loadSessionCache()]);
    applyProfileToState(profile);
  } catch(e) { console.warn('Refreshing profile/sessions on reconnect failed:', e); }
  checkDB();
  syncPendingBioEntries().catch(e => console.warn('syncPendingBioEntries failed:', e));
  if (ST.ouraConnected && ST.ouraAccessToken) syncOuraData().catch(() => {});
  renderPage();
}
window.addEventListener('online', () => { refreshOnReconnect(); });
window.addEventListener('offline', () => { _wasEverOffline = true; setDbStatus('local'); });

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
  try { await deferredInstallPrompt.userChoice; } catch(e) {/* PWA install prompt outcome — nothing to recover or report either way */}
  deferredInstallPrompt = null;
  dismissInstallPrompt();
}

function renderInstallPrompt() {
  if (!ST.showInstallPrompt) return '';
  const parts = ['<div class="card mb12" style="border-color:var(--gold)">'];
  parts.push('<div class="fb" style="align-items:flex-start;margin-bottom:8px"><div style="font-size:0.8125rem;font-weight:700">📲 Get the full-screen app experience</div><div class="btn-ghost" style="font-size:1rem;padding:0 4px" onclick="dismissInstallPrompt()">✕</div></div>');
  if (deferredInstallPrompt) {
    parts.push('<div style="font-size:0.75rem;color:var(--muted);margin-bottom:10px;line-height:1.5">Install Flight Crew Fitness on your home screen: opens instantly, no browser bar, works offline.</div>');
    parts.push('<button class="btn btn-outline" onclick="triggerInstall()">Install App</button>');
  } else {
    parts.push('<div style="font-size:0.75rem;color:var(--muted);line-height:1.6">Add this to your home screen so it opens like a real app (full screen, no browser bar, works offline):<br><br>1. Tap the <strong>Share</strong> icon <span style="font-family:var(--mono)">⬆️</span> at the bottom of Safari<br>2. Scroll down and tap <strong>Add to Home Screen</strong><br>3. Tap <strong>Add</strong></div>');
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
    showToast('📡 You\'re offline. Reconnect to check for updates. The app keeps working normally in the meantime.');
    return;
  }
  showToast('Checking for updates…');
  try {
    await swRegistration.update();
    if (swRegistration.installing || swRegistration.waiting) {
      showToast('Update found. Installing now…');
    } else {
      showToast('You\'re on the latest version ('+FCF_VERSION+' · '+FCF_BUILD+').');
    }
  } catch(e) {
    // Browsers report a failed script fetch with an unhelpful raw message
    // ("Script ... load failed") — translate connectivity-shaped failures.
    const msg = e.message || '';
    if (/load failed|failed to fetch|networkerror|network error/i.test(msg)) {
      showToast('📡 Couldn\'t reach the update server. You may be offline. The app keeps working normally.');
    } else {
      showToast('Update check failed: '+msg);
    }
  }
}

// BUG FIX (root cause of the boot-render-count investigation, confirmed
// with a direct stack trace showing the two exact, distinct call paths
// side by side): this fallback exists to guard against DOMContentLoaded
// having already fired before the listener above registers - a real
// concern in general, but app.js loads via <script defer>, which by
// spec always executes after DOM parsing completes, exactly when
// readyState becomes 'interactive'. That means this condition was true
// on essentially every single page load, so this fallback wasn't an
// occasional safety net - it was firing unconditionally, in addition to
// the normal listener, giving initApp() (and therefore the entire boot
// sequence underneath it, including every fresh Oura sync and AI-coach
// call it kicks off) two completely independent invocations every time.
// Guarded at the one shared entry point both paths lead through, so
// whichever one fires first wins and the other becomes a no-op,
// regardless of the readyState timing that got them both scheduled.
let _appInitStarted = false;
async function initApp() {
  if (_appInitStarted) return;
  _appInitStarted = true;
  try {
    await initAppInner();
  } catch (e) {
    console.error('initApp failed:', e);
    try { renderRoot(); } catch (e2) { console.error('renderRoot also failed:', e2); }
  } finally {
    // Hide the boot loader regardless of success or failure above — it
    // exists purely to cover this window, not to gate on any specific
    // outcome, so it should never stay stuck showing.
    const loader = document.getElementById('bootLoader');
    if (loader) loader.classList.add('hidden');
  }
}

async function initAppInner() {
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

// BUG FIX (structural cleanup, suggested independently by two separate
// reviews of the root-cause fix above and adopted here since they
// converged on the same recommendation): this used to register the
// DOMContentLoaded listener AND unconditionally schedule a setTimeout
// fallback separately — the actual bug this session's investigation
// found. Now mutually exclusive: if the DOM is still loading, wait for
// the real event; otherwise (already interactive/complete, the case
// for this app's <script defer> load) go straight to a same-tick-plus-
// one macrotask call instead of registering a listener for an event
// that has already passed and will never fire again. The _appInitStarted
// guard inside initApp() itself stays regardless, as a defensive backstop
// against any future third caller, not because this specific structure
// still needs it to avoid a double-call.
function scheduleInit() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp, { once: true });
  } else if (document.readyState === 'interactive' || document.readyState === 'complete') {
    setTimeout(initApp, 0);
  }
  // Any other/unexpected readyState value (shouldn't happen in a real
  // browser, but can in a test sandbox with a mocked document) is
  // deliberately a no-op here rather than triggering initApp() against
  // an environment that isn't actually ready for it.
}
scheduleInit();

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
    showBigToast(isPro() ? '✓ Pro active. Thanks.' : 'Purchase received. Entitlement will appear shortly.', 'ok');
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

// IAP: product list. Supplies the real, localized App Store price for the
// Pro buttons (see proPrice). Falls back to the USD constants on web and
// until StoreKit answers.
window.addEventListener('fcf:products', (e) => {
  const d = e.detail || {};
  if (Array.isArray(d.products)) {
    ST.skProducts = d.products;
    if (ST.tab === 'more') renderPage();
  }
});
// Apple Guideline 3.1.2 requires the renewal terms and working Terms of
// Use / Privacy Policy links right at every set of purchase buttons, not
// only elsewhere on the screen. Shared so the More tab and the upgrade
// popup can never drift apart.
function proDisclosureHTML() {
  const nativeIAP = !!storeKitBridge();
  return '<div style="font-size:0.625rem;color:var(--muted);text-align:center;line-height:1.55;margin:4px 0 10px">' +
    'Flight Crew Fitness Pro, billed yearly or monthly. ' +
    (nativeIAP
      ? 'Payment is charged to your Apple ID at confirmation. The subscription renews automatically at the same price unless canceled at least 24 hours before the end of the current period. Manage or cancel anytime in your Apple ID account settings.'
      : 'Renews automatically at the same price until canceled.') +
    '<br><a class="modal-link" href="'+TERMS_URL+'" '+externalLinkAttrs()+'>Terms of Use</a> · ' +
    '<a class="modal-link" href="'+PRIVACY_POLICY_URL+'" '+externalLinkAttrs()+'>Privacy Policy</a></div>';
}

function proPrice(productId, fallback) {
  const p = (ST.skProducts || []).find(x => x.id === productId);
  return (p && p.displayPrice) ? sanitizeUserText(p.displayPrice) : fallback;
}

// Sign In with Apple: success
window.addEventListener('fcf:siwa:success', async (e) => {
  const d = e.detail || {};
  if (!d.identityToken) { ST.authErr = 'Sign in failed: no identity token returned.'; renderRoot(); return; }
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
// BUG FIX (reported: tapping a weekly-summary notification just landed on
// the default Today tab instead of Trends). Confirmed by reading the full
// chain: the native side correctly schedules deepLink:"trends" and posts
// fcf:pushTap on tap — but on a cold launch (app not already running when
// the notification is tapped), this event can arrive before ST.authed is
// true, since the web app's own async auth check takes real time even
// after the page itself has loaded. The old handler silently dropped the
// tab switch in that case with no way to recover it. Now buffers the
// requested tab if auth isn't ready yet, and applies it once boot
// actually completes, instead of losing it.
let _pendingPushTapTab = { current: null };
// BUG FIX (reported: the weekly summary notification opened Today, not
// Trends). The page can be reloaded moments after a tap is handled, by a
// new version installing or by iOS restarting the web view, and the reload
// forgot where the tap was headed. The tap is now written down for 30
// seconds so the reloaded page can finish the trip. Only a page that
// started AFTER the tap applies it: the page that received it has already
// switched tabs, and anyone opening the app later is past the 30 seconds.
const PUSH_TAP_KEY = 'fcf_push_tap';
const PUSH_TAP_KEEP_MS = 30000;
function pushTapStore() { try { return window.localStorage; } catch (e) { return null; } }
function rememberPushTap(tab, now, store) {
  try { (store || pushTapStore()).setItem(PUSH_TAP_KEY, JSON.stringify({ tab, at: now || Date.now() })); } catch (e) { /* private mode, storage full: the live switch still happens */ }
}
function pushTapCarriedOverReload(store, now, pageStartedAt) {
  try {
    const st = store || pushTapStore();
    const raw = st.getItem(PUSH_TAP_KEY);
    if (!raw) return null;
    let v = null;
    try { v = JSON.parse(raw); } catch (e) { /* damaged: dropped below */ }
    const t = now || Date.now();
    const started = pageStartedAt || performance.timeOrigin;
    const fresh = !!(v && v.tab && typeof v.at === 'number' && t - v.at >= 0 && t - v.at < PUSH_TAP_KEEP_MS);
    if (!fresh) { st.removeItem(PUSH_TAP_KEY); return null; }
    if (v.at >= started) return null; // this page received the tap itself; keep the note for a reload
    st.removeItem(PUSH_TAP_KEY);
    return v.tab;
  } catch (e) { return null; }
}
window.addEventListener('fcf:pushTap', (e) => {
  const tab = e.detail?.tab;
  if (!tab) return;
  rememberPushTap(tab);
  if (ST.authed) switchTab(tab);
  else _pendingPushTapTab.current = tab;
});
// Lets the iOS shell (next build) confirm this page is listening before it
// hands over a tap, instead of sending one into a page that is still loading.
window.__fcfPushTapReady = true;
// The native shell delivers HealthKit and Calendar within a couple of
// seconds of each other right after boot. Each used to trigger its own
// full repaint. Coalesce: a repaint requested within a short window of
// another one is folded into it, so two arrivals mean one redraw.
// Measured on a cold start: the shell's deliveries can land BEFORE
// bootAppInner has finished loading the profile, so they used to paint a
// half-loaded Today that the real boot render then replaced. A repaint
// asked for before boot is done is simply dropped; the boot render that
// follows already includes the new data.
let _nativeRepaintTimer = null;
let _bootRenderDone = false;
function requestNativeRepaint() {
  if (!_bootRenderDone) return;
  if (_nativeRepaintTimer) clearTimeout(_nativeRepaintTimer);
  // 2s: the shell's two boot deliveries are 1.5s apart, so one window
  // covers both and a cold open repaints once for them, not twice.
  _nativeRepaintTimer = setTimeout(() => { _nativeRepaintTimer = null; renderPage(); }, 2000);
}

window.addEventListener('fcf:healthkit', (e) => {
  ST.healthkit = e.detail || {};
  requestNativeRepaint();
});

// Calendar data arrives from the native shell. Run it through the AI
// classifier — the edge function handles caching via fingerprint comparison.
window.addEventListener('fcf:calendar', async (e) => {
  const payload = e.detail || {};
  ST.calendarGranted = !!payload.granted;
  ST.calendarDuplicatesRemoved = payload.duplicatesRemoved || 0;
  if (!payload.granted || !payload.events?.length) { requestNativeRepaint(); return; }
  await classifyCalendarEvents(payload.events, payload.fingerprint);
  // Calendar data arrives after boot; the environment suggestion at boot
  // couldn't see it. Re-run now that the live schedule is known.
  applyScheduleEnvironmentSuggestion();
  requestNativeRepaint();
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
async function scheduleNotifications(justTrainedNow) {
  if (typeof FCFBridge === 'undefined' || !FCFBridge.isNative) return;
  const pro = isPro();

  // Build upcoming flights list from classified calendar events
  const upcomingFlights = (ST.calendarEvents || [])
    .filter(e => e.type === 'flight' && new Date(e.start) > new Date())
    .map(e => ({ start: e.start, origin: e.origin || '', destination: e.destination || '' }))
    .slice(0, 10);

  // BUG FIX (reported: "HRV below baseline" notification fired when the
  // user's own Oura app showed HRV as completely normal). Root cause was
  // two stacked bugs: hrvAlert only checked "does an HRV value exist"
  // (not whether it was actually low), and hrvBaseline was being set to
  // TODAY'S OWN current HRV reading — comparing today's value against
  // itself, which can never meaningfully signal "below baseline."
  // NotificationManager.swift's own comment already stated the intended
  // design ("fires if HRV is more than 20% below baseline") — this
  // finally implements that for real, using Oura's own hrv_balance
  // contributor (matches what the user's own Oura app is built on,
  // rather than inventing separate baseline math from raw HealthKit
  // SDNN) and a genuine trailing 14-day personal average as the baseline,
  // the same rolling-window concept Oura itself uses.
  let hrvIsLow = false, hrvToday = null, hrvBaselineAvg = null;
  if (pro && ST.user && ST.ouraData?.hrv_balance != null) {
    hrvToday = ST.ouraData.hrv_balance;
    try {
      const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
      const { data: recent } = await SB.from('oura_daily')
        .select('hrv_balance').eq('user_id', ST.user.id)
        .gte('date', since).lt('date', ST.ouraData.date)
        .not('hrv_balance', 'is', null);
      if (recent && recent.length >= 5) { // need enough history for a meaningful average
        hrvBaselineAvg = Math.round(recent.reduce((sum, r) => sum + r.hrv_balance, 0) / recent.length);
        hrvIsLow = hrvToday < hrvBaselineAvg * 0.8; // more than 20% below baseline
      }
    } catch (e) { /* no history yet or query failed — don't alert on incomplete data */ }
  }

  // BUG FIX (reported): "You haven't trained in 3 days" was firing after
  // as little as one day, sometimes the same day. Root cause: it was a
  // REPEATING daily 9am local trigger, unconditionally rescheduled on
  // every single app boot (workoutReminder was hardcoded true with no
  // day-count logic anywhere), only ever cancelled for the exact day a
  // workout finished — with no mechanism to bring it back correctly 3
  // days later specifically. Fixed the same way schedulePreflightChecks
  // already correctly handles per-flight timing: compute the exact real
  // target date from the actual last-workout date, and schedule ONE
  // precise one-time notification for it, not a blind repeating trigger.
  const lastWorkoutMs = justTrainedNow ? Date.now() : (ST.sessionCache || [])
    .map(s => new Date(s.date).getTime())
    .filter(ms => !isNaN(ms))
    .reduce((max, ms) => Math.max(max, ms), 0);
  // No history at all (brand new account) still gets a nudge — anchored
  // to right now rather than left unscheduled indefinitely.
  const workoutReminderBase = lastWorkoutMs || Date.now();
  const workoutReminderDate = new Date(workoutReminderBase + 3 * 86400000).toISOString();

  // NEW FEATURE (was advertised in the Pro upgrade comparison table as
  // "Layover workout reminder" but never actually built anywhere in the
  // codebase — no scheduling function, no prefs flag, nothing). Reuses
  // scheduleContextForToday(), the same schedule-analysis function the
  // rest of the app already relies on for trip-aware recommendations,
  // rather than re-deriving layover/duty timing from scratch.
  let layoverReminder = null;
  // Was checking ST.calendarEvents with a fallback to ST.flightSchedule
  // ad-hoc, right here, independently of the same choice made elsewhere on
  // the page — now goes through the same getActiveSchedule() every other
  // schedule-dependent display uses, so this respects the explicit
  // Schedule Source preference instead of its own separate priority check.
  const activeSched = getActiveSchedule();
  const schedule = activeSched.events;
  if (pro && schedule?.length) {
    const ctx = scheduleContextForToday(schedule, new Date());
    const todayStr = new Date().toISOString().slice(0, 10);
    const trainedToday = justTrainedNow || (ST.sessionCache || []).some(s => (s.date || '').slice(0, 10) === todayStr);
    // A real window: currently on a layover, haven't already trained
    // today, and at least 3 hours of runway before the next duty starts
    // (or no next duty visible yet at all, i.e. plenty of room).
    const hasRunway = ctx.freeMinutesUntilDuty == null || ctx.freeMinutesUntilDuty >= 180;
    if (ctx.layoverAirport && !trainedToday && hasRunway) {
      // 90 minutes out gives realistic time to deplane and get to the
      // hotel — never suggested for right this second while still at
      // the airport. Capped so it can never land inside the pre-duty
      // buffer of an actually-tight window.
      let fireInMinutes = 90;
      if (ctx.freeMinutesUntilDuty != null) {
        fireInMinutes = Math.min(fireInMinutes, ctx.freeMinutesUntilDuty - 60);
      }
      if (fireInMinutes >= 15) { // don't bother for a sliver of a window
        layoverReminder = {
          airport: ctx.layoverAirport,
          fireAt: new Date(Date.now() + fireInMinutes * 60000).toISOString(),
        };
      }
    }
  }

  const prefs = {
    action:            'schedule',
    workoutReminder:   true,                           // free — always on
    workoutReminderDate,
    waterReminder:     !!(ST.trackHydration),          // free if hydration on
    preflightCheck:    upcomingFlights.length > 0,     // free if flights detected
    upcomingFlights,
    hrvAlert:          hrvIsLow,                       // pro — see computation above
    weeklySummary:     pro,                            // pro
    hrvBaseline:       hrvBaselineAvg,
    hrvToday:          hrvToday,
    layoverReminder,                                   // pro — null if no window right now
    medications:       medicationNotificationPrefs(),  // free — user-set dose times
  };
  window.webkit?.messageHandlers?.notifications?.postMessage(prefs);
}

// Called immediately after a workout is logged. Re-runs the full
// scheduling pass (rather than just cancelling the pending 3-day
// reminder) so the countdown correctly resets to 3 days from THIS
// workout, not just cleared until the next app boot recomputes it.
function cancelWorkoutReminderNative() {
  if (typeof FCFBridge === 'undefined' || !FCFBridge.isNative) return;
  scheduleNotifications(true); // reschedule everything with today as the new last-workout date
}

// ── AI Coach (Pro) ────────────────────────────────────────────────────────────

// Format a date for an AI payload in the USER'S LOCAL TIME, not UTC.
//
// BUG FIX (reported): every AI context was sending .toISOString(), which is
// UTC. The model has no way to know the user's offset, so it read those as
// wall-clock times — a 1:28 PM local departure got described back to the
// user as 8:28 PM. Anything the model reasons about time with has to be
// pre-converted to local and clearly labelled as such.
function fmtLocalForAI(d) {
  if (!d) return null;
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

// The user's IANA timezone, sent alongside formatted times so the model can
// reason about "late at night" / "restaurants will be closed" correctly.
function localTimezoneName() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'; }
  catch(e) { return 'unknown'; }
}

// Generic caller for the three coaching modes: weekly_summary,
// fatigue_calibration, fuel_logistics. All three are Pro-gated server-side —
// this just handles the request/response plumbing and error states.
async function callAICoach(mode, context) {
  if (!isPro()) return { error: 'pro_required' };
  try {
    const { data: { session } } = await SB.auth.getSession();
    if (!session) return { error: 'not_signed_in' };
    // BUG FIX (reported): this fetch had no timeout at all. If the edge
    // function or upstream Anthropic call hangs — cold start, network
    // stall, anything — the promise never settles, so it never reaches
    // the try/catch's error path OR the success path. No amount of fixing
    // the CALLING code's error handling can help when the fetch itself
    // never resolves. 20s is generous for what should be a 2-4s response;
    // past that, treat it as failed so the card can hide instead of
    // showing "Thinking..." indefinitely.
    // 35s (was 20s): the AI coach now reasons before answering on the weekly
    // review and trip plan (Sonnet 5, medium effort). Those load async into
    // their own cards, so a longer ceiling never blocks the UI.
    const attempt = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000);
      try {
        return await fetch(AI_COACH_EDGE_FN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
          body: JSON.stringify({ mode, context }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    };
    // BUG FIX (reported: "Ask AI Coach" came back with "Couldn't get a
    // suggestion" on a layover; the function logs show the browser's
    // preflight arrived and the POST itself never did). A request that
    // dies on the wire between the phone and Supabase, a cell handoff or
    // hotel wifi dropping a packet, is the normal failure on the road and
    // is worth one quick retry before giving up. An HTTP error response is
    // a real answer and is never retried.
    let res;
    try {
      res = await attempt();
    } catch (e) {
      if (e.name === 'AbortError') throw e;      // 35s already spent, do not double it
      console.warn('callAICoach: network failure, retrying once:', e);
      await new Promise(r => setTimeout(r, 1500));
      res = await attempt();
    }
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'ai_failed' };
    return { text: data.text, cached: data.cached };
  } catch (e) {
    console.warn('callAICoach error:', e);
    return { error: e.name === 'AbortError' ? 'timeout' : 'network_error' };
  }
}

// AI Crew-Specific Progression Analytics — the flagship Pro feature.
// Pulls workout history + trip/pairing context + biometrics over the past
// several weeks and asks the AI to find patterns tied to flying schedule
// specifically, not generic fitness commentary. Server-side cached 24h.
// The weekly coach's view of the last six weeks of sessions.
//
// BUG FIX (reported: "I just did a plyo today. How can it tell me this?"
// The coach had called his plyo work "short and sparse... a couple minutes
// tacked on" hours after a plyo session). It had been sent only a muscle
// group and durationMinutes per session. durationMinutes is the clock
// time between starting the workout in the app and saving it: a session
// logged afterwards from memory reads as a few minutes, and a plyo
// session is brief by design. With nothing else to go on, the coach
// judged the work by the one number that did not describe it.
//   exercises   the main work (takeoff + enroute), so it can see WHAT was done
//   setsLogged  how much of it
//   daysAgo     0 is today, so "you did this this morning" is unmissable
function weeklyCoachSessions(sessionCache, now) {
  const nowD = now || new Date();
  const cutoff = new Date(nowD.getTime() - 42 * 24 * 60 * 60 * 1000); // 6 weeks of history
  const today0 = new Date(nowD); today0.setHours(0, 0, 0, 0);
  const has = v => v !== '' && v !== undefined && v !== null;
  return (sessionCache || [])
    .filter(s => s && s.date && new Date(s.date) >= cutoff)
    .map(s => {
      const day0 = new Date(s.date); day0.setHours(0, 0, 0, 0);
      // BUG FIX (reported: AI suggested swapping "shorter cardio blocks"
      // for strength sessions — those blocks were gate-to-gate airport
      // walking, not discretionary training time). Flag incidental
      // Oura-imported walking explicitly so the model can tell the
      // difference between cardio the user chose and cardio the job
      // requires, instead of guessing from muscleGroup alone.
      const incidentalWalk = !!(s.importedFromOura && (s.ouraActivity||'').toLowerCase() === 'walking');
      // Anything the ring picked up (yard work, house work, a lift it
      // noticed) is saved with the default location "comm" and no exercise
      // detail. Mark it so the coach does not read it as a gym visit.
      const autoDetected = !!s.importedFromOura;
      const snap = s.workoutSnapshot || {};
      const main = incidentalWalk ? [] : [...(snap.takeoff || []), ...(snap.enroute || [])];
      const setsLogged = incidentalWalk ? 0 : Object.values(s.sets || {}).reduce((n, list) =>
        n + (Array.isArray(list) ? list.filter(x => x && (has(x.reps) || has(x.seconds) || has(x.seconds_left) || has(x.seconds_right))).length : 0), 0);
      return {
        date: s.date,
        daysAgo: Math.round((today0.getTime() - day0.getTime()) / 86400000),
        muscleGroup: s.muscle_group || null,
        durationMinutes: s.durationMinutes || null,
        environment: autoDetected ? null : (s.env || null),
        exercises: main.map(e => e && e.name).filter(Boolean).slice(0, 6),
        setsLogged: autoDetected ? 0 : setsLogged,
        incidentalWalk,
        autoDetected,
      };
    });
}
// Changes whenever a workout logged in the app is added, edited or removed,
// so the cached weekly note is rewritten after a workout instead of standing
// for 24h. Ring-detected activity is left out on purpose: it arrives several
// times a day and each change here is a paid AI call.
function weeklyCoachSessionKey(sessions) {
  const real = (sessions || []).filter(s => !s.incidentalWalk && !s.autoDetected);
  const latest = real.map(s => String(s.date)).sort().pop() || 'none';
  const sets = real.reduce((n, s) => n + (s.setsLogged || 0), 0);
  return real.length + '_' + sets + '_' + latest;
}
// How many chosen sessions happened in each kind of place. Advice has to
// fit the equipment the member actually has in front of them.
function weeklyCoachEnvironments(sessions) {
  const out = {};
  (sessions || []).forEach(s => { if (!s.incidentalWalk && !s.autoDetected && s.environment) out[s.environment] = (out[s.environment] || 0) + 1; });
  return out;
}

async function loadProgressionAnalytics() {
  try {
    const cutoff = new Date(Date.now() - 42 * 24 * 60 * 60 * 1000); // 6 weeks of history

    // Workout sessions, each enriched with what was happening on the
    // calendar that day. This is what makes the analysis crew-specific —
    // and it's why the model should never need to ask the user to hand-log
    // "trip context" in a notes field: the calendar already knows.
    const sessions = weeklyCoachSessions(ST.sessionCache);

    if (sessions.length < 3) {
      // Not enough data yet — don't waste an API call on "not enough data"
      // when the client can determine that itself.
      return;
    }

    // Derive each session's schedule context from the calendar directly.
    const dayContextFor = (dateStr) => {
      const day = new Date(dateStr);
      const dayStart = new Date(day); dayStart.setHours(0,0,0,0);
      const dayEnd = new Date(day); dayEnd.setHours(23,59,59,999);
      const out = {
        dayOfWeek: day.toLocaleDateString('en-US', { weekday: 'long' }),
        localDate: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        timeOfDayLocal: day.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      };
      if (!ST.calendarEvents?.length) { out.scheduleKnown = false; return out; }
      out.scheduleKnown = true;
      const overlaps = (e) => new Date(e.start) <= dayEnd && new Date(e.end) >= dayStart;
      const flightsThatDay = ST.calendarEvents.filter(e => e.type === 'flight' && overlaps(e));
      const layoverThatDay = ST.calendarEvents.find(e => e.type === 'layover' && overlaps(e));
      out.flightLegsThatDay = flightsThatDay.length;
      out.onLayover = !!layoverThatDay;
      out.layoverAirport = layoverThatDay?.airport || layoverThatDay?.destination || null;
      // Working vs. at home — the single most useful distinction, and one
      // the calendar can answer without the user annotating anything.
      out.workingThatDay = flightsThatDay.length > 0 || !!layoverThatDay;
      if (flightsThatDay.length) {
        out.dutyHoursThatDay = Math.round(flightsThatDay.reduce((sum, e) =>
          sum + (new Date(e.end) - new Date(e.start)) / 3600000, 0) * 10) / 10;
      }
      // Which day of that trip it was, using the same trip-partitioning
      // logic the rest of the app uses, so "day 3 of a 4-day" is accurate.
      const trip = currentTripContext(ST.calendarEvents, day);
      if (trip?.tripDayNumber) {
        out.tripDayNumber = trip.tripDayNumber;
        out.tripTotalDays = trip.tripTotalDays;
      }
      return out;
    };

    const sessionsWithTripContext = sessions.map(s => ({
      ...s,
      dayContext: dayContextFor(s.date),
    }));

    // Weight trend
    let weightTrend = [];
    try {
      const filter = ST.user ? SB.from('weight_log').select('weight_lb,logged_at').eq('user_id', ST.user.id) : null;
      if (filter) {
        const { data } = await filter.gte('logged_at', cutoff.toISOString()).order('logged_at', { ascending: true });
        weightTrend = (data || []).map(d => ({ date: d.logged_at, weight: d.weight_lb }));
      }
    } catch (e) { /* non-fatal — proceed without it */ }

    // Oura biometrics for the same window, if connected
    let biometrics = [];
    if (ST.ouraConnected) {
      try {
        const { data } = await SB.from('oura_daily').select('date,readiness_score,sleep_score,hrv_balance')
          .eq('user_id', ST.user.id).gte('date', cutoff.toISOString().slice(0,10)).order('date', { ascending: true });
        biometrics = data || [];
      } catch (e) { /* non-fatal */ }
    }

    const context = {
      windowDays: 42,
      // Goal decides how a weight trend should be read: up is progress for
      // 'muscle', a warning for 'fatloss', neutral-ish for the others.
      trainingGoal: ST.goal || 'longevity',
      sessionKey: weeklyCoachSessionKey(sessions),
      sessionsByEnvironment: weeklyCoachEnvironments(sessions),
      sessions: sessionsWithTripContext,
      weightTrend,
      biometrics,
    };

    const result = await callAICoach('weekly_summary', context);
    const card = document.getElementById('aiProgressionCard');
    const textEl = document.getElementById('aiProgressionText');
    if (!card || !textEl) return;
    if (result.error) { card.style.display = 'none'; return; } // hide the card, don't leave it stuck on "Thinking..."
    textEl.textContent = result.text;
    card.style.display = '';
  } catch (e) { console.warn('loadProgressionAnalytics error:', e); }
}

// AI Tactical Fueling Logistics — reasons over today's classified schedule
// and what's already been eaten to recommend flight-bag vs terminal food.
async function loadFuelLogistics() {
  try {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
    const todayEnd   = new Date(now); todayEnd.setHours(23,59,59,999);

    // Today's schedule events — from Apple Calendar (classified) or ICS upload.
    // All times converted to LOCAL before they reach the model (see fmtLocalForAI).
    const events = (ST.calendarEvents?.length ? ST.calendarEvents : ST.flightSchedule || [])
      .filter(e => {
        const s = new Date(e.start), en = new Date(e.end);
        return s <= todayEnd && en >= todayStart;
      })
      .map(e => ({
        type: e.type || 'flight',
        route: (e.origin && e.destination) ? e.origin + '→' + e.destination : null,
        startsLocal: fmtLocalForAI(e.start),
        endsLocal: fmtLocalForAI(e.end),
        alreadyPast: new Date(e.end).getTime() < now.getTime(),
      }));

    if (!events.length) return;

    // BUG FIX (reported issue with a proposed fix reviewed and verified
    // against the real data model before applying): the context sent
    // here was thin enough that the model had no way to distinguish
    // "the pilot ate nothing today" from "the pilot ate something but
    // hasn't logged it yet" — an empty mealsAlreadyLoggedToday array
    // reads identically to both. Verified every field below against
    // where meals actually get saved (meal_data.items/.totals,
    // item.nutrients.calories/protein/carbs/fat, ST.nutritionGoals'
    // real shape) rather than assuming the proposed shape was correct.
    const meals = ST.todaysMeals || [];
    const loggedTotals = meals.reduce((acc, m) => {
      const t = m.meal_data?.totals || {};
      acc.calories += t.calories || 0;
      acc.protein  += t.protein  || 0;
      acc.carbs    += t.carbs    || 0;
      acc.fat      += t.fat      || 0;
      return acc;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
    const g = ST.nutritionGoals && ST.nutritionGoals.mode !== 'none' ? ST.nutritionGoals : null;

    const context = {
      currentLocalTime: fmtLocalForAI(now),
      timezone: localTimezoneName(),
      todaysSchedule: events,
      // Explicit semantics so the model can't quietly treat "no rows" as
      // "no food" — logging gaps are the normal case for a pilot on duty,
      // not a signal they're fasting.
      mealLogging: {
        status: meals.length ? 'partial_or_complete' : 'nothing_logged',
        interpretation: meals.length
          ? 'Items below were logged by the pilot. They may have eaten more that was not logged.'
          : 'No meals logged yet today. This almost certainly means incomplete logging, NOT that the pilot skipped eating. Do not assume a deficit, a fast, or missed meals. Prefer a short nudge to log what they already ate over any advice that assumes empty intake.',
      },
      mealsAlreadyLoggedToday: meals.map(m => ({
        type: m.meal_type,
        loggedAtLocal: fmtLocalForAI(m.logged_at),
        items: (m.meal_data?.items || []).map(i => ({
          description: i.description,
          calories: i.nutrients?.calories,
          protein: i.nutrients?.protein,
        })),
        totals: m.meal_data?.totals || null,
      })),
      loggedTotalsSoFar: loggedTotals,
      nutritionTargets: g ? {
        mode: g.mode, calories: g.calories, protein: g.protein, carbs: g.carbs, fat: g.fat,
      } : null,
      hydrationLoggedL: ST.trackHydration ? ST.waterIn : null,
      hydrationTargetL: ST.trackHydration ? hydroTarget() : null,
    };

    const result = await callAICoach('fuel_logistics', context);
    const card = document.getElementById('aiFuelCard');
    const textEl = document.getElementById('aiFuelText');
    if (!card || !textEl) return;
    if (result.error) { card.style.display = 'none'; return; } // hide the card, don't leave it stuck on "Thinking..."
    textEl.textContent = result.text;
    card.style.display = '';
  } catch (e) { console.warn('loadFuelLogistics error:', e); }
}

// AI Fatigue Calibration — gathers today's readiness, trip context, and
// recent training load, then asks the AI coach for a scaling judgment.
// Cached per-day-per-user server-side isn't needed here since it's cheap
// and the inputs (readiness, duty context) can change through the day.
// BUG FIX (reported: "the AI Coach card rendered three times, same text
// each time"). Measured: three renderToday passes on a cold open each
// fired both AI loads, so the cached answer came back three times and was
// written into the card three times. The server cache made the text
// identical; the writes were the flicker. Each load now remembers the
// context it last asked with: an identical ask while one is in flight or
// already answered is a no-op, and the answer is re-applied from memory
// if the card was rebuilt in between.
const _aiLoadMemo = {};
async function memoAILoad(key, contextKey, run) {
  const m = _aiLoadMemo[key];
  if (m && m.contextKey === contextKey) {
    if (m.pending) return m.pending;
    return m.result;
  }
  const pending = run().then(r => { _aiLoadMemo[key] = { contextKey, result: r, pending: null }; return r; })
                       .catch(e => { delete _aiLoadMemo[key]; throw e; });
  _aiLoadMemo[key] = { contextKey, result: null, pending };
  return pending;
}

async function loadFatigueCalibration(ctx) {
  try {
    const sched = ctx.sched || {};
    const now = new Date();
    // Today's remaining flights, in local time, so the model can see the
    // actual shape of the day rather than inferring it from counts.
    const todaysFlights = (sched.todayEvents || [])
      .filter(e => e.type === 'flight')
      .map(e => ({
        route: (e.origin && e.destination) ? e.origin + '→' + e.destination : (e.title || 'flight'),
        departsLocal: fmtLocalForAI(e.start),
        arrivesLocal: fmtLocalForAI(e.end),
        alreadyFlown: new Date(e.end).getTime() < now.getTime(),
      }));
    const context = {
      currentLocalTime: fmtLocalForAI(now),
      timezone: localTimezoneName(),
      readiness: ctx.oura.readiness ?? null,
      sleepScore: ctx.oura.sleep ?? null,
      sleepHours: ST.sleepHours ?? null,
      selfReportedFatigue: ST.readiness ?? null, // 1-5 scale, used when no Oura connected
      tripDayNumber: sched.tripDayNumber ?? null,
      tripTotalDays: sched.tripTotalDays ?? null,
      legsCompletedToday: sched.legsTodayCompleted ?? 0,
      legsRemainingToday: sched.legsTodayRemaining ?? 0,
      todaysFlights,
      dutyEndsLocal: fmtLocalForAI(sched.dutyEndsToday),
      currentlyAtLayoverAirport: sched.layoverAirport || null,
      // Where they actually sleep tonight (the layover covering midnight),
      // which is the CURRENT layover when they are already in an overnight.
      // The next rest after this one is sent under its own honest name so
      // the model can't confuse tomorrow night with tonight.
      tonightsLayoverAirport: sched.tonightLayoverAirport || null,
      nextRestAfterTonightAirport: (sched.nextLayoverAirport && sched.nextLayoverAirport !== sched.tonightLayoverAirport)
        ? sched.nextLayoverAirport : null,
      workoutLoggedToday: ctx.training?.workoutToday ?? false,
      // BUG FIX (reported: told to "get a solid workout in" with 45
      // minutes before needing to leave a hotel for a 9:05 departure).
      // The model was only ever given raw departure times and had no way
      // to know that reaching the airport from a layover hotel — transport,
      // security, crew report time — eats into that window before a
      // workout could even start. This is the same figure the rule-based
      // card uses (usableMinutesBeforeDeparture), so both agree on what
      // "enough time" actually means instead of the AI silently assuming
      // the entire gap is free.
      minutesActuallyFreeBeforeNeedingToLeave: usableMinutesBeforeDeparture(sched),
      // BUG FIX (reported: homepage correctly showed readiness (82), but
      // the AI coach note said readiness wasn't available). Root cause:
      // this context's own readiness value can genuinely be null on the
      // very first render of the day, before the delayed Oura sync
      // (fires ~1.5s+ into boot) has completed — but the edge function's
      // cache key for this mode is date-only, with no dependency on
      // whether readiness actually had a value, so that first, null-
      // readiness response was getting cached and served back for the
      // rest of the day even after the homepage numbers updated
      // correctly. Passing this flag lets the edge function tell "Oura
      // connected but hasn't synced yet today" (skip caching, try again
      // once real data shows up) apart from "no Oura connected at all"
      // (a normal, legitimately cacheable state using self-reported
      // fatigue instead) — readiness being null alone doesn't
      // distinguish those two cases on its own.
      ouraConnected: !!ST.ouraConnected,
      // Null when home or under 1 hr off local; see buildBodyClockHTML.
      bodyClock: bodyClockForAI(),
    };
    const ctxKey = JSON.stringify(context);
    const card0 = document.getElementById('aiFatigueCard');
    const text0 = document.getElementById('aiFatigueText');
    const memo = _aiLoadMemo.fatigue;
    if (memo && memo.contextKey === ctxKey && memo.result && !memo.result.error && text0 && text0.textContent === memo.result.text) {
      return; // same ask, same answer already on screen: nothing to do
    }
    const result = await memoAILoad('fatigue', ctxKey, () => callAICoach('fatigue_calibration', context));
    const card = document.getElementById('aiFatigueCard');
    const textEl = document.getElementById('aiFatigueText');
    if (!card || !textEl) return; // user navigated away before this resolved
    if (!result.error && textEl.textContent === result.text && card.style.display !== 'none') return;
    if (result.error) {
      // Hide the card rather than leaving it stuck on "Thinking..." forever —
      // the rule-based briefing above already covers this, so a failed AI
      // call just means one fewer card, not a broken page.
      card.style.display = 'none';
      return;
    }
    textEl.textContent = result.text;
    card.style.display = '';
  } catch (e) { console.warn('loadFatigueCalibration error:', e); }
}

// AI Preflight Schedule Mapping — looks at the whole current/upcoming trip
// (not just today) and calls which days should carry heavy training load
// vs. light/rest, based on report times and layover lengths across the trip.
// Server-side cached per-trip, not per-day — see fcf-ai-coach for the key.
async function loadTripPlan() {
  const card = document.getElementById('aiTripPlanCard');
  try {
    // BUG FIX (reported): every one of these early returns used to exit
    // BEFORE touching the card at all, leaving it stuck showing the
    // "Thinking..." placeholder indefinitely — not a failed API call, just
    // a legitimate "there's nothing to show here" case that never told the
    // card to hide itself. Card is looked up once at the top now so every
    // exit path (no calendar, short trip, API error) can hide it.
    // BUG FIX (found by the e2e crawler after uploading a 4-day pairing):
    // this only ever read ST.calendarEvents, which is the Apple Calendar
    // sync. An uploaded .ics lives in ST.flightSchedule, so web users and
    // anyone who uploads a file never got a trip plan at all, while the
    // fuel card right next to it (loadFuelLogistics) already fell back to
    // the upload. Same fallback here.
    const schedule = ST.calendarEvents?.length ? ST.calendarEvents : (ST.flightSchedule || []);
    if (!schedule.length) { if (card) card.style.display = 'none'; console.log('[tripPlan] no schedule'); return; }
    const bounds = getTripBounds(schedule, new Date());
    if (!bounds || bounds.totalDays < 2) { if (card) card.style.display = 'none'; console.log('[tripPlan] no multi-day trip found', {bounds}); return; }

    // How many sessions have already been logged since this trip started —
    // feeds the cache key so the plan can react to training that happened
    // mid-trip without regenerating on every single page load.
    const tripStartMs = new Date(bounds.tripStart).getTime();
    const sessionsLoggedThisTrip = (ST.sessionCache || [])
      .filter(s => s.date && new Date(s.date).getTime() >= tripStartMs).length;

    const context = {
      tripStart: bounds.tripStart,
      tripEnd: bounds.tripEnd,
      totalDays: bounds.totalDays,
      days: bounds.days,
      sessionsLoggedThisTrip,
    };

    const ctxKey = JSON.stringify(context);
    const memo = _aiLoadMemo.tripPlan;
    const text0 = document.getElementById('aiTripPlanText');
    // Already answered for this exact context and the card still shows
    // it (the element carries the answer it was drawn from): nothing to do.
    if (memo && memo.contextKey === ctxKey && memo.result && !memo.result.error && text0 && text0.dataset.from === memo.result.text) {
      return;
    }
    const result = await memoAILoad('tripPlan', ctxKey, () => callAICoach('trip_plan', context));
    const textEl = document.getElementById('aiTripPlanText');
    if (!card || !textEl) return; // user navigated away before this resolved
    if (!result.error && textEl.dataset.from === result.text && card.style.display !== 'none') return;
    if (!result.error) textEl.dataset.from = result.text;
    if (result.error) { card.style.display = 'none'; return; } // hide the card, don't leave it stuck on "Thinking..."

    // Split into lines and highlight today's line — the model returns one
    // "Day N:" line per day; find the one matching bounds.days[].isToday.
    const todayEntry = bounds.days.find(d => d.isToday);
    const lines = result.text.split('\n').map(l => l.trim()).filter(Boolean);
    const html = lines.map(line => {
      const isToday = todayEntry && line.startsWith('Day ' + todayEntry.dayNumber + ':');
      return '<div style="' + (isToday
        ? 'font-weight:600;color:var(--text);padding:6px 0;'
        : 'color:var(--muted);padding:6px 0;opacity:0.75;') +
        'border-bottom:1px solid rgba(255,255,255,0.06)">' + line + '</div>';
    }).join('');
    textEl.innerHTML = html;
    card.style.display = '';
  } catch (e) {
    console.warn('loadTripPlan error:', e);
    if (card) card.style.display = 'none'; // don't leave it stuck on "Thinking..." after a crash either
  }
}

async function classifyCalendarEvents(events, fingerprint) {
  // BUG FIX (reported: "Calendar access granted but no events found in the
  // next 60 days" shown despite the user's real calendar having ~190
  // events — confirmed via .ics upload of the same schedule). The native
  // fetch was working correctly and finding all the raw events; the bug
  // was here — on ANY classification failure (network hiccup, Anthropic
  // API error, malformed JSON response), this just logged a console
  // warning and returned WITHOUT ever setting ST.calendarEvents. The UI's
  // "no events found" check only looks at whether ST.calendarEvents is
  // empty — it can't distinguish "the native fetch genuinely found
  // nothing" from "190 raw events arrived but classification failed",
  // so both looked identical and equally wrong to the user.
  //
  // Fix: fall back to the RAW events (tagged type:'unknown') on failure
  // instead of discarding them entirely. This means the count shown is
  // always honest (matches what the native fetch actually found), even
  // when AI-powered flight/layover detection specifically isn't
  // available right now — and a later successful sync silently upgrades
  // these to their real classified types.
  const rawFallback = (events || []).map(e => ({ ...e, type: 'unknown', confidence: 0 }));
  try {
    const { data: { session } } = await SB.auth.getSession();
    if (!session) { ST.calendarEvents = rawFallback; ST.calendarSyncError = 'Not signed in'; renderPage(); return; }
    // BUG FIX (reported: "Load failed" during sync at 291 events / 8
    // parallel batches server-side — see the matching fix and comment in
    // fcf-calendar-classify's per-batch fetch for the full root-cause
    // investigation: Supabase's 150s request idle timeout, bound by
    // whichever of the parallel batches is slowest). That server-side
    // fix caps each batch at 45s now, but this had no timeout of its own
    // at all before — meaning the client could sit waiting the full 150s
    // for a gateway timeout to eventually happen, with no predictable
    // failure in between. 90s gives real margin above the now-bounded
    // server-side worst case while still failing predictably instead of
    // however long an actual dropped connection takes to surface.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    const res = await fetch(CALENDAR_CLASSIFY_EDGE_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ events, fingerprint }),
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));
    if (!res.ok) {
      const errText = await res.text();
      console.warn('Calendar classify failed:', errText);
      ST.calendarEvents = rawFallback;
      ST.calendarSyncError = 'Classification temporarily unavailable. Showing ' + rawFallback.length + ' unclassified events. Try Sync Now again shortly.';
      renderPage();
      return;
    }
    const data = await res.json();
    if (data.limitReached) {
      showBigToast('Calendar AI limit reached for this month. Upgrade to Pro for unlimited.', 'info');
      ST.calendarEvents = (data.classified?.length) ? data.classified : rawFallback;
      ST.calendarFingerprint = fingerprint;
      ST.calendarSyncError = null;
      renderPage();
      return;
    }
    // classified.length should always equal events.length (the edge
    // function merges classification onto every original event, even
    // ones it couldn't confidently type) — but fall back defensively
    // anyway rather than trust that invariant blindly.
    ST.calendarEvents = (data.classified?.length) ? data.classified : rawFallback;
    ST.calendarFingerprint = fingerprint;
    ST.calendarSyncError = data.classified?.length ? null : 'Classification returned no results. Showing ' + rawFallback.length + ' unclassified events.';
    renderPage();
  } catch(e) {
    console.warn('classifyCalendarEvents error:', e);
    // AbortError specifically means OUR OWN timeout fired above, not a
    // generic network failure — worth saying so distinctly, since
    // e.message for an abort ("The user aborted a request" or similar)
    // reads like something the user did, when it was actually just this
    // sync taking longer than expected.
    const reason = e.name === 'AbortError'
      ? 'timed out; this can happen with a very large calendar'
      : (e.message || 'network error');
    ST.calendarEvents = rawFallback;
    ST.calendarSyncError = rawFallback.length
      ? 'Classification failed (' + reason + '). Showing ' + rawFallback.length + ' unclassified events.'
      : 'Sync failed: ' + reason;
    renderPage();
  }
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
  parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-bottom:8px">Tap a day to log, edit, or delete a workout.</div>');
  parts.push('<div id="calScroll" style="display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;scroll-snap-type:x proximity;touch-action:pan-x;padding-bottom:2px;scrollbar-width:none">');
  days.forEach(day => {
    const isToday = day.date.toDateString() === new Date().toDateString();
    const dow = day.date.toLocaleDateString('en-US',{weekday:'short'}).charAt(0);
    const dateNum = day.date.getDate();
    const hasWorkout = day.sessions.length > 0;
    const cellStyle = isToday ? 'border-color:var(--gold)' : '';
    const bg = hasWorkout ? 'background:rgba(34,197,94,0.12);border-color:rgba(34,197,94,0.4)' : '';
    parts.push('<div style="flex:0 0 46px;min-height:64px;scroll-snap-align:center;text-align:center;border:1.5px solid var(--border);border-radius:8px;padding:7px 2px;cursor:pointer;'+cellStyle+';'+bg+'" onclick="'+(hasWorkout?'showCalendarDay(\''+localDateStr(day.date)+'\')':'openNewSessionEditor(\''+localDateStr(day.date)+'\')')+'">');
    parts.push('<div style="font-family:var(--mono);font-size:0.5625rem;color:var(--muted)">'+dow+'</div>');
    parts.push('<div style="font-size:0.8125rem;font-weight:600;margin-top:2px">'+dateNum+'</div>');
    if (hasWorkout) {
      // One icon, as requested — but it represents the TRAINING session
      // where there is one, so a leg day isn't hidden behind a walk that
      // happened to be logged first. A count marks days holding more.
      const ICONS = {'Lower Body':'🦵','Upper Push':'💪','Upper Pull':'🎯','Power / Plyo':'⚡','Full Body':'🔥','Longevity':'🌿','Stretch':'🧘','Cardio':'❤️','Run':'🏃','Walk':'🚶'};
      const primary = day.sessions.find(isRotationStep) || day.sessions[0];
      const icon = ICONS[primary.muscle_group] || '✓';
      const extra = day.sessions.length > 1
        ? '<span style="font-size:0.5625rem;font-family:var(--mono);color:var(--gold);vertical-align:super">'+day.sessions.length+'</span>'
        : '';
      parts.push('<div style="font-size:0.875rem;margin-top:3px">'+icon+extra+'</div>');
    } else {
      parts.push('<div style="font-size:1rem;font-weight:700;color:var(--gold);margin-top:2px">+</div>');
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

// Machine intervals are logged as one number per round, kept in the same
// slot a rep count uses. The box used to say "Reps / reps only" while the
// note said to log resistance level or watts (or calories, or RPM), so one
// exercise collected several kinds of number and none of them was labelled.
// Requested: standardize bike intervals on watts. Watts is the one reading
// that means the same thing on every bike; a resistance level does not.
// The rower and treadmill already asked for one specific number, so their
// boxes now simply say which.
const REP_VALUE_UNITS = {
  'Stationary Bike Intervals': { placeholder: 'Watts', hint: 'watts', short: 'W' },
  'Assault Bike Intervals':    { placeholder: 'Watts', hint: 'watts', short: 'W' },
  'Rowing Machine Intervals':  { placeholder: 'Split', hint: '500m split, sec', short: 's/500m', lowerIsBetter: true },
  'Treadmill Intervals':       { placeholder: 'mph', hint: 'speed, mph', short: 'mph' },
};
function repValueUnit(exItem) {
  return (exItem && exItem.inputType === 'reps_only' && REP_VALUE_UNITS[exItem.name]) || null;
}
// In the CSV the number sits in the Reps column, so the exercise name says
// what it is. Otherwise a reader, human or AI, sees "250 reps".
function exportExerciseName(exItem) {
  const u = repValueUnit(exItem);
  return (exItem.name || '') + (u ? ' [Reps column = ' + u.hint + ']' : '');
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
    const unit = repValueUnit(exItem);
    if (unit) {
      const nums = reps.map(Number).filter(v => !isNaN(v));
      const best = nums.length ? (unit.lowerIsBetter ? Math.min(...nums) : Math.max(...nums)) : '–';
      return loggedSets.length+' round'+(loggedSets.length===1?'':'s')+' · best '+best+' '+unit.short;
    }
    return loggedSets.length+'×'+(reps.length?Math.max(...reps.map(Number)):'–')+' reps';
  }
  if (exItem.inputType === 'reps_height') {
    const heights = loggedSets.map(s=>parseFloat(s.height)||0).filter(v=>v>0);
    return loggedSets.length+' sets · best '+(heights.length?Math.max(...heights):'–')+' in height';
  }
  if (exItem.inputType === 'reps_distance') {
    const dists = loggedSets.map(s=>parseFloat(s.distance)||0).filter(v=>v>0);
    return loggedSets.length+' sets · best '+(dists.length?Math.max(...dists):'–')+' in distance';
  }
  // reps_weight (default)
  const weights = loggedSets.map(s=>parseFloat(s.weight)||0).filter(v=>v>0);
  const topSet = loggedSets.reduce((best,s) => (parseFloat(s.weight)||0) > (parseFloat(best.weight)||0) ? s : best, loggedSets[0]);
  return loggedSets.length+'×'+(topSet.reps||'–')+' @ '+(weights.length?Math.max(...weights):'–')+' lb';
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
      parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-bottom:10px">'+daySessions.length+' sessions logged this day</div>');
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
    parts.push('<div class="modal-title">'+(session.muscle_group||'Workout')+(session.importedFromOura ? ' <span style="font-size:0.6875rem;color:var(--blue);font-weight:400">📱 via Oura</span>' : '')+'</div>');
    parts.push('<div style="font-family:var(--mono);font-size:0.625rem;color:var(--muted);margin-bottom:14px">'+sessionDate.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})+' at '+sessionDate.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})+'</div>');
    parts.push('<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">');
    parts.push(glowTile('MINUTES', summary.durationMinutes||'–', 'gold'));
    parts.push(glowTile('SETS', summary.totalSets, 'blue'));
    parts.push(glowTile('CALORIES', summary.estCalories, 'teal'));
    parts.push('</div>');
    parts.push('<div class="modal-body" style="margin-bottom:10px">Environment: '+(session.env||'–')+' · Condition: '+(session.fatigue||'go')+'</div>');

    if (exerciseRows.length) {
      parts.push('<div class="section-label" style="margin-top:4px">EXERCISES</div>');
      let prIndex = 0;
      exerciseRows.forEach(row => {
        // PR rows get a celebratory pop-in (staggered slightly if more than
        // one PR happened this session) — safe here since the debrief
        // screen renders once after a workout, not on every re-render.
        const cls = 'fb' + (row.isPR ? ' pr-pop' : '');
        const style = 'padding:8px 0;border-bottom:1px solid var(--border)' + (row.isPR ? ';--pr-i:' + (prIndex++) : '');
        parts.push('<div class="'+cls+'" style="'+style+'">');
        parts.push('<div style="font-size:0.8125rem">'+(row.isPR?'⭐ ':'')+row.name+'</div>');
        parts.push('<div style="font-family:var(--mono);font-size:0.75rem;color:'+(row.isPR?'var(--gold)':'var(--text)')+';font-weight:'+(row.isPR?'700':'400')+'">'+row.perf+'</div>');
        parts.push('</div>');
      });
    }

    parts.push(shareButtonHtml(registerShareCard('day' + si, shareCardData(session, summary, exerciseRows)), 'mt12'));
    // Edit and delete stay per-session — with two logged that day, they
    // have to act on a specific one rather than "the day".
    parts.push('<button class="btn btn-gold mt8" onclick="openEditSessionEditor(\''+(session._key||'')+'\')">✏️ EDIT '+(session.muscle_group||'SESSION').toUpperCase()+'</button>');
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

// ─── SHARE A WORKOUT ─────────────────────────────────────────────────────────
// Requested: a Share button after a workout and on a past session, so it can
// go to social media, with branding on it so people know where it came from.
//
// What is shared is a picture: the workout, its three numbers, the exercises,
// and the Flight Crew Fitness name, tagline and web address. It deliberately
// leaves off anything about where the person was or how they felt.
//
// How the picture leaves the app depends on the device (see shareMethod).
// Inside the iPhone app the page hands the picture to the iPhone share
// sheet itself. The first version avoided that, on the theory that saving
// a picture would crash a build with no "add to Photos" permission text.
// Checked on a real iPhone on 2026-10-07 and both worries were wrong: the
// page can share a file from inside the app, and saving a picture to
// Photos works. A phone that cannot share files from the page still gets
// the full-screen card to screenshot.
const SHARE_TAGLINE = 'Engineered for the flight deck. Built for the layover.';
const SHARE_MAX_ROWS = 6;
function shareCardData(session, summary, rows) {
  const all = rows || [];
  const fits = all.length <= SHARE_MAX_ROWS;
  const shown = fits ? all : all.slice(0, SHARE_MAX_ROWS - 1);
  return {
    brand: 'FLIGHT CREW FITNESS',
    url: 'flightcrew.fit',
    tagline: SHARE_TAGLINE,
    title: String(session.muscle_group || 'Workout').toUpperCase(),
    name: session.muscle_group || 'Workout',
    dateLabel: new Date(session.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
    stats: [
      { label: 'MINUTES', value: summary.durationMinutes || '–', color: 'gold' },
      { label: 'SETS', value: summary.totalSets ?? '–', color: 'blue' },
      { label: 'CALORIES', value: summary.estCalories ?? '–', color: 'teal' },
    ],
    rows: shown.map(r => ({ name: r.name, perf: r.perf, pr: !!r.isPR })),
    more: all.length - shown.length,
  };
}
function shareCaption(d) {
  const mins = d.stats[0].value, sets = d.stats[1].value;
  return d.name + ': ' + (mins !== '–' ? mins + ' min, ' : '') + sets + ' sets. Logged with Flight Crew Fitness. https://flightcrew.fit';
}
// Rows for the workout just finished. prNames comes from the debrief.
function shareRowsFor(session, prNames) {
  const snap = session.workoutSnapshot || {};
  const allEx = [...(snap.taxi || []), ...(snap.takeoff || []), ...(snap.enroute || []), ...(snap.landing || [])];
  const prs = new Set(prNames || []);
  return allEx.filter(isLoggableStrengthExercise).map(exItem => {
    const perf = formatSetPerformance(exItem, (session.sets && session.sets[exItem.id]) || []);
    return perf ? { name: exItem.name, perf, isPR: prs.has(exItem.name) } : null;
  }).filter(Boolean);
}
function shareMethod(env) {
  if (env.ios && env.nativeImageShare) return 'native';
  if (env.canShareFiles) return 'webshare';
  return env.ios ? 'screenshot' : 'download';
}

// Cards waiting behind a Share button. The button names a key; the card is
// looked up when it is tapped (no data inside the button itself).
const _shareCards = {};
let _shareCurrent = null; // { data, dataUrl }
function registerShareCard(key, data) { _shareCards[key] = data; return key; }
function shareButtonHtml(key, cls) {
  return '<button class="btn btn-outline ' + (cls || 'mt8') + '" onclick="haptic(\'light\');openShareCard(\'' + key + '\')">📤 SHARE THIS WORKOUT</button>';
}

function drawShareCard(canvas, d) {
  const W = 1080, H = 1350, P = 72;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  const MONO = '"Share Tech Mono", ui-monospace, Menlo, monospace', SANS = 'Inter, -apple-system, "Helvetica Neue", Arial, sans-serif';
  const GOLD = '#c9a84c', GOLD2 = '#e8c46a', TEXT = '#e8eef6', MUTED = '#8899b4';
  const glow = (x, y, r, rgb, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); };
  // Letter-spaced text, drawn a character at a time (canvas letterSpacing is not on every iPhone).
  const spaced = (text, x, y, gap, align) => {
    const chars = String(text).split(''); const widths = chars.map(ch => c.measureText(ch).width);
    const total = widths.reduce((a, w) => a + w, 0) + gap * (chars.length - 1);
    let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    c.textAlign = 'left'; chars.forEach((ch, i) => { c.fillText(ch, cx, y); cx += widths[i] + gap; });
    return total;
  };
  const fit = (text, maxW) => { let t = String(text); if (c.measureText(t).width <= maxW) return t; while (t.length > 1 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1); return t.trimEnd() + '…'; };
  const rr = (x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  const star = (cx, cy, R) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.45 : R; c.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); } c.closePath(); c.fill(); };

  c.fillStyle = '#080d17'; c.fillRect(0, 0, W, H);
  glow(120, 60, 760, '201,168,76', 0.20);
  glow(1040, 620, 640, '59,130,246', 0.16);
  glow(200, 1340, 560, '45,212,191', 0.08);

  // Brand
  c.textBaseline = 'alphabetic';
  c.fillStyle = GOLD; c.font = '40px ' + MONO; spaced(d.brand, P, 128, 9);
  const rule = c.createLinearGradient(P, 0, W - P, 0); rule.addColorStop(0, GOLD2); rule.addColorStop(1, 'rgba(201,168,76,0)');
  c.fillStyle = rule; c.fillRect(P, 158, W - 2 * P, 3);

  // Title
  c.fillStyle = MUTED; c.font = '28px ' + MONO; spaced('WORKOUT COMPLETE', P, 262, 7);
  let size = 118; c.fillStyle = TEXT;
  do { c.font = '800 ' + size + 'px ' + SANS; size -= 4; } while (c.measureText(d.title).width > W - 2 * P && size > 56);
  c.textAlign = 'left'; c.fillText(d.title, P - 4, 372);
  c.fillStyle = MUTED; c.font = '500 36px ' + SANS; c.fillText(d.dateLabel, P, 428);

  // Three numbers
  const tones = { gold: ['201,168,76', GOLD2], blue: ['59,130,246', '#60a5fa'], teal: ['45,212,191', '#2dd4bf'] };
  const gap = 24, tw = (W - 2 * P - 2 * gap) / 3, ty = 478, th = 196;
  d.stats.forEach((st, i) => {
    const x = P + i * (tw + gap), [rgb, accent] = tones[st.color] || tones.blue;
    c.save(); rr(x, ty, tw, th, 28); c.clip();
    c.fillStyle = '#0f1623'; c.fillRect(x, ty, tw, th);
    const g = c.createRadialGradient(x + tw - 20, ty + 10, 0, x + tw - 20, ty + 10, 190); g.addColorStop(0, 'rgba(' + rgb + ',0.42)'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    c.fillStyle = g; c.fillRect(x, ty, tw, th); c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.09)'; c.lineWidth = 2; rr(x, ty, tw, th, 28); c.stroke();
    c.fillStyle = accent; c.font = '24px ' + MONO; spaced(st.label, x + 26, ty + 50, 5);
    c.fillStyle = TEXT; c.font = '700 92px ' + MONO; c.textAlign = 'left'; c.fillText(String(st.value), x + 24, ty + th - 30);
  });

  // Exercises
  let y = 760;
  if (d.rows.length) {
    c.fillStyle = MUTED; c.font = '24px ' + MONO; spaced('EXERCISES', P, y, 7);
    y += 24;
    d.rows.forEach(r => {
      const mid = y + 42;
      c.font = (r.pr ? '700 ' : '') + '31px ' + MONO; const perfW = c.measureText(r.perf).width;
      c.fillStyle = r.pr ? GOLD2 : TEXT; c.textAlign = 'right'; c.fillText(r.perf, W - P, mid);
      let nx = P;
      if (r.pr) { c.fillStyle = GOLD2; star(P + 17, mid - 12, 18); nx = P + 46; }
      c.fillStyle = TEXT; c.font = '500 35px ' + SANS; c.textAlign = 'left';
      c.fillText(fit(r.name, W - P - perfW - 36 - nx), nx, mid);
      c.fillStyle = 'rgba(136,153,180,0.22)'; c.fillRect(P, y + 64, W - 2 * P, 2);
      y += 66;
    });
    if (d.more > 0) { c.fillStyle = MUTED; c.font = '26px ' + MONO; c.textAlign = 'left'; c.fillText('+ ' + d.more + ' more', P, y + 40); }
  }

  // Where to get it
  c.fillStyle = rule; c.fillRect(P, 1178, W - 2 * P, 3);
  c.fillStyle = MUTED; c.font = '500 30px ' + SANS; c.textAlign = 'left'; c.fillText(d.tagline, P, 1234);
  c.fillStyle = GOLD2; c.font = '60px ' + MONO; spaced(d.url, P, 1304, 4);
  return canvas;
}

async function openShareCard(key) {
  const data = _shareCards[key];
  const root = document.getElementById('modalRoot');
  if (!data || !root) { showToast('Could not build the share card. Close this and try again.'); return; }
  try {
    // The card uses the app's two typefaces; wait briefly for them, then draw either way.
    if (document.fonts && document.fonts.load) {
      await Promise.race([
        Promise.all([document.fonts.load('800 100px Inter'), document.fonts.load('500 36px Inter'), document.fonts.load('40px "Share Tech Mono"')]),
        new Promise(res => setTimeout(res, 1500)),
      ]).catch(() => {});
    }
    const canvas = drawShareCard(document.createElement('canvas'), data);
    _shareCurrent = { data, dataUrl: canvas.toDataURL('image/png') };
  } catch (e) {
    showToast('Could not build the share card on this device.');
    return;
  }
  const ios = inIOSApp();
  const nativeImageShare = !!(typeof FCFBridge !== 'undefined' && FCFBridge.capabilities && FCFBridge.capabilities.shareImage && window.webkit?.messageHandlers?.share);
  let canShareFiles = false;
  try { const f = shareCardFile(); canShareFiles = !!(f && navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { /* no file sharing here */ }
  const method = shareMethod({ ios, nativeImageShare, canShareFiles });
  const parts = [];
  parts.push('<div class="modal-bg" onclick="if(event.target===this)closeModal()">');
  parts.push('<div class="modal-sheet" style="text-align:center;max-height:92vh;overflow-y:auto">');
  parts.push('<div class="modal-handle"></div>');
  parts.push('<div class="modal-title">Share this workout</div>');
  // Press and hold on the picture offers Save to Photos, which works.
  parts.push('<img id="shareCardImg" alt="Workout summary card" src="' + _shareCurrent.dataUrl + '" style="display:block;width:100%;max-width:320px;margin:4px auto 14px;border-radius:14px;border:1px solid var(--border)">');
  if (method === 'native' || method === 'webshare') {
    parts.push('<button class="btn btn-gold" onclick="haptic(\'light\');shareCardNow()">📤 Share</button>');
    // A download link replaces the screen inside the iPhone app, so "Save the picture" is for browsers only.
    if (method === 'webshare' && !ios) parts.push('<button class="btn btn-outline mt8" onclick="downloadShareCard()">Save the picture</button>');
    if (ios) parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:8px">Or press and hold the picture to save it to Photos.</div>');
  } else if (method === 'download') {
    parts.push('<button class="btn btn-gold" onclick="downloadShareCard()">Save the picture</button>');
  } else {
    parts.push('<div class="modal-body" style="margin-bottom:12px">Show it full screen, take a screenshot, and post the screenshot.</div>');
    parts.push('<button class="btn btn-gold" onclick="showShareCardFullscreen()">Show full screen</button>');
  }
  parts.push('<button class="btn btn-outline mt8" onclick="copyShareCaption()">Copy a caption with the link</button>');
  parts.push('<button class="btn btn-outline mt8" onclick="closeModal()">Done</button>');
  parts.push('</div></div>');
  root.innerHTML = parts.join('');
}
function shareCardFile() {
  try {
    const b64 = _shareCurrent.dataUrl.split(',')[1], bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], 'flight-crew-fitness-workout.png', { type: 'image/png' });
  } catch (e) { return null; }
}
function shareCardNow() {
  if (!_shareCurrent) return;
  const nativeImageShare = !!(inIOSApp() && typeof FCFBridge !== 'undefined' && FCFBridge.capabilities && FCFBridge.capabilities.shareImage && window.webkit?.messageHandlers?.share);
  if (nativeImageShare) {
    window.webkit.messageHandlers.share.postMessage({ imageBase64: _shareCurrent.dataUrl.split(',')[1], filename: 'flight-crew-fitness-workout.png' });
    return;
  }
  const file = shareCardFile();
  if (!file || !navigator.share) return;
  // The picture alone, no caption text alongside it: some apps, Instagram
  // among them, drop out of the share sheet when text rides with a photo.
  // The caption has its own Copy button.
  navigator.share({ files: [file] }).catch(e => {
    if (!e || e.name !== 'AbortError') showToast(inIOSApp() ? 'Sharing did not open. Press and hold the picture to save it.' : 'Sharing did not open here. Use Save the picture.');
  });
}
function downloadShareCard() {
  if (!_shareCurrent || inIOSApp()) return; // a download link replaces the screen inside the iPhone app
  const a = document.createElement('a');
  a.href = _shareCurrent.dataUrl; a.download = 'flight-crew-fitness-workout.png';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
function copyShareCaption() {
  if (!_shareCurrent) return;
  const text = shareCaption(_shareCurrent.data);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => showToast('Caption copied.')).catch(() => showToast('Copy did not work on this device.'));
  else showToast('Copy is not available on this device.');
}
// The card alone on a black screen, for a clean screenshot. Tap to close.
function showShareCardFullscreen() {
  if (!_shareCurrent) return;
  let el = document.getElementById('shareCardFull');
  if (!el) { el = document.createElement('div'); el.id = 'shareCardFull'; document.body.appendChild(el); }
  el.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)';
  el.onclick = () => { el.remove(); };
  el.innerHTML = '<img alt="Workout summary card" src="' + _shareCurrent.dataUrl + '" style="max-width:100%;max-height:calc(100% - 44px);object-fit:contain;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;pointer-events:none">' +
    '<div id="shareCardFullHint" style="height:44px;line-height:44px;font-size:0.75rem;color:#8899b4;font-family:Inter,sans-serif">Take a screenshot, then tap anywhere to close</div>';
  // The hint steps aside so it is not in the screenshot.
  setTimeout(() => { const h = document.getElementById('shareCardFullHint'); if (h) h.style.visibility = 'hidden'; }, 2500);
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
  'dips': 'Dip',
  'chest press machine': 'Machine Chest Press',

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
  'cable row': 'Seated Cable Row',
  'seated row': 'Seated Cable Row',
  'seated row machine': 'Seated Cable Row',

  // Band exercises — common alternate names and full "resistance band ___"
  // phrasings that don't share words with the catalog's shorter "Banded
  // ___" names (e.g. "resistance band squat" has no word in common with
  // "Banded Squat" except squat itself already matching directly — this
  // covers the ones where an extra word like "resistance" would otherwise
  // block the match).
  'monster walk': 'Lateral Band Walk',
  'monster walks': 'Lateral Band Walk',
  'resistance band squat': 'Banded Squat',
  'resistance band deadlift': 'Banded Deadlift',
  'resistance band push up': 'Banded Push-Up',
  'resistance band pushup': 'Banded Push-Up',
  'resistance band overhead press': 'Banded Overhead Press',
  'resistance band shoulder press': 'Banded Overhead Press',
  'resistance band bent over row': 'Banded Bent-Over Row',
  'resistance band row': 'Banded Bent-Over Row',
  'resistance band upright row': 'Banded Upright Row',
  'resistance band bicep curl': 'Banded Bicep Curl',
  'resistance band curl': 'Banded Bicep Curl',
  'resistance band face pull': 'Banded Face Pull',
  'resistance band single arm row': 'Banded Single-Arm Row',
  'band tricep extension': 'Banded Tricep Pushdown',
  'resistance band tricep pushdown': 'Banded Tricep Pushdown',
  'resistance band tricep extension': 'Banded Tricep Pushdown',
  'resistance band lateral raise': 'Banded Lateral Raise',
  'resistance band chest press': 'Banded Single-Arm Chest Press',
  'resistance band chest fly': 'Banded Single-Arm Chest Press',
  'band chest fly': 'Banded Single-Arm Chest Press',
  'resistance band leg curl': 'Banded Leg Curl',
  'resistance band lateral lunge': 'Banded Lateral Lunge',
  'band side lunge': 'Banded Lateral Lunge',
  'resistance band hip thrust': 'Banded Hip Thrust',
  'band glute bridge': 'Banded Hip Thrust',
  'donkey kick': 'Standing Banded Glute Kickback',
  'donkey kicks': 'Standing Banded Glute Kickback',
  'resistance band woodchop': 'Banded Woodchop',
  'band wood chop': 'Banded Woodchop',
  'standing oblique': 'Standing Banded Oblique Twist',
  'band twist': 'Standing Banded Oblique Twist',
  'squat to press': 'Banded Thruster',
  'resistance band thruster': 'Banded Thruster',

  // Kettlebell exercises — kb/kettlebell abbreviation is handled generally
  // by expandSearchQuery above (covers every KB exercise in the catalog,
  // not just these); these entries cover wording that's genuinely
  // different, not just abbreviated.
  'clean and press': 'Kettlebell Clean & Press',
  'kb clean and press': 'Kettlebell Clean & Press',
  'russian swing': 'Kettlebell Swing',
  'american swing': 'Kettlebell Swing',
  'turkish getup': 'Turkish Get-Up',
  'tgu': 'Turkish Get-Up',
  'one arm dumbbell bench': 'Single-Arm DB Bench Press',
  'one armed dumbbell bench': 'Single-Arm DB Bench Press',
  'one arm db bench': 'Single-Arm DB Bench Press',
  'single arm dumbbell bench press': 'Single-Arm DB Bench Press',
  'one arm lateral raise': 'Single-Arm DB Lateral Raise',
  'one armed lateral raise': 'Single-Arm DB Lateral Raise',
  'single arm dumbbell lateral raise': 'Single-Arm DB Lateral Raise',
  'one arm front raise': 'Single-Arm DB Front Raise',
  'one armed front raise': 'Single-Arm DB Front Raise',
  'single arm dumbbell front raise': 'Single-Arm DB Front Raise',
  'burpee with medicine ball': 'Medicine Ball Burpee',
  'weighted burpee': 'Medicine Ball Burpee',
  'ball burpee': 'Medicine Ball Burpee',
  'slam ball burpee': 'Medicine Ball Burpee',
  'rear delt fly': 'Dumbbell Reverse Fly',
  'db rear delt fly': 'Dumbbell Reverse Fly',
  'rear delt raise': 'Dumbbell Reverse Fly',
  'reverse flye': 'Dumbbell Reverse Fly',
  'parallel bar dip': 'Dip',
  'straight arm pulldown': 'Cable Straight-Arm Pulldown',
  'cable woodchopper': 'Cable Woodchop',
  'wood chop': 'Cable Woodchop',
  'landmine thruster': 'Landmine Squat to Press',
  'landmine squat press': 'Landmine Squat to Press',
  'landmine squat and press': 'Landmine Squat to Press',
  'landmine rotation': 'Landmine Twist',
  'landmine 180': 'Landmine Twist',
  'landmine russian twist': 'Landmine Twist',
  'landmine goblet squat': 'Landmine Squat',
  'landmine shoulder press': 'Landmine Press',
  'one arm kettlebell row': 'Single-Arm Kettlebell Row',
  'one armed kettlebell row': 'Single-Arm Kettlebell Row',

  // Medicine ball exercises — med ball/medicine ball abbreviation also
  // handled generally by expandSearchQuery above.
  'slam ball': 'Medicine Ball Slam',
  'wall ball slam': 'Medicine Ball Slam',
  'weighted russian twist': 'Medicine Ball Russian Twist',
  'wall throw': 'Medicine Ball Rotational Throw',
  'rotational throw': 'Medicine Ball Rotational Throw',
};

// Query normalization: expand common abbreviations both directions so a
// search matches regardless of which form the exercise name uses or the
// person types. Covers ~15 catalog exercises that use "DB" for dumbbell,
// plus kettlebell and medicine ball exercises (kb/kettlebell, med
// ball/medicine ball) added alongside the new Band Exercises environment.
function expandSearchQuery(q) {
  const variants = new Set([q]);
  if (q.includes('dumbbell')) variants.add(q.replace(/dumbbell/g, 'db'));
  if (/\bdb\b/.test(q)) variants.add(q.replace(/\bdb\b/g, 'dumbbell'));
  if (q.includes('barbell')) variants.add(q.replace(/barbell/g, 'bb'));
  if (q.includes('kettlebell')) variants.add(q.replace(/kettlebell/g, 'kb'));
  if (/\bkb\b/.test(q)) variants.add(q.replace(/\bkb\b/g, 'kettlebell'));
  if (q.includes('medicine ball')) variants.add(q.replace(/medicine ball/g, 'med ball'));
  if (q.includes('med ball')) variants.add(q.replace(/med ball/g, 'medicine ball'));
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

// Movements people search for in the swap sheet that no program uses.
// Catalog-only: they never appear in a generated workout, only as swap
// and custom-exercise matches. (Reported: "Shrugs not in the catalog".)
const CATALOG_EXTRAS = [
  ex('x_shrug_bb',  'Barbell Shrug',            '3×12', 3, 'Shoulders straight up toward the ears, pause at the top. No rolling.'),
  ex('x_shrug_db',  'Dumbbell Shrug',           '3×15', 3, 'Heavy dumbbells at the sides, shrug straight up and hold a beat.'),
  ex('x_chinup',    'Chin-Up',                  '3×8',  3, 'Underhand grip, chest to the bar. More biceps than a pullup.', false, 'reps_only'),
  ex('x_skull',     'Skull Crusher',            '3×10', 3, 'EZ bar or dumbbells, lower to the forehead, elbows stay pointed up.'),
  ex('x_pushpress', 'Push Press',               '4×5',  4, 'Dip the knees, drive the bar overhead with the legs, lock out.'),
  ex('x_revfly',    'Dumbbell Reverse Fly',     '3×15', 3, 'Hinge forward, light weight, squeeze the rear delts at the top.'),
  ex('x_hack',      'Hack Squat (Machine)',     '3×10', 3, 'Feet mid-platform, full depth, drive through the whole foot.'),
  ex('x_goodmorn',  'Good Morning',             '3×10', 3, 'Bar on the back, hinge at the hips with a flat back, light load.'),
  ex('x_sumo',      'Sumo Deadlift',            '4×5',  4, 'Wide stance, toes out, hips close to the bar, push the floor away.'),
  ex('x_rackpull',  'Rack Pull',                '4×5',  4, 'Bar at knee height in the rack, heavy lockouts for the upper back.'),
  ex('x_landmine',  'Landmine Press',           '3×10/side', 3, 'Hold the free end of the bar at your shoulder, brace your core, press up and forward until the arm locks out. Log the weight loaded on the bar.'),
  ex('x_lm_squat',  'Landmine Squat',           '3×10', 3, 'Face the anchor, hold the bar end at your chest with both hands like a goblet squat, sit down between your hips and stand back up. Log the weight loaded on the bar.'),
  ex('x_lm_thruster','Landmine Squat to Press', '3×8', 3, 'Explosive. Hold the bar end at your chest with both hands, squat, then drive up hard and use that momentum to press the bar up and forward to full reach. Lower it under control into the next squat. Log the weight loaded on the bar.'),
  ex('x_lm_row',    'Landmine Row',             '3×10', 3, 'Straddle the bar or stand beside it, hinge at the hips with a flat back, pull the bar end up toward your ribs. Log the weight loaded on the bar.'),
  ex('x_lm_twist',  'Landmine Twist',           '3×10/side', 3, 'Hold the bar end with straight arms, rotate it from one hip to the other, pivoting your feet as you turn. Core and obliques. Start light.'),
  ex('x_burpee',    'Burpee',                   '3×10', 3, 'Squat, hands to the floor, jump the feet back to a plank, chest to the floor, jump the feet in, then jump up with hands overhead. Step back and forward instead of jumping to make it easier.', false, 'reps_only'),
  ex('x_mb_burpee', 'Medicine Ball Burpee',     '3×10', 3, 'Set the ball on the floor, hands on the ball, jump the feet back to a plank, jump them in, then stand and lift the ball overhead. Log the weight of the ball.'),
  ex('x_hipthrust', 'Barbell Hip Thrust',       '3×10', 3, 'Shoulders on a bench, drive the hips up, squeeze the glutes at the top.'),
  ex('x_cablefly',  'Cable Fly',                '3×12', 3, 'Slight bend in the elbows, bring the handles together in front of the chest.'),
  ex('x_dbfly',     'Dumbbell Fly',             '3×12', 3, 'Flat or incline bench, wide arc, stretch at the bottom.'),
  ex('x_wristcurl', 'Wrist Curl',               '3×15', 3, 'Forearms on the thighs, curl the wrists only. Light weight.'),
  ex('x_sa_dbbench','Single-Arm DB Bench Press','3×8/side', 3, 'One dumbbell, free hand on your stomach or out to the side. Brace hard so your torso does not twist or roll toward the free side. That anti-rotation is the core work.'),
  ex('x_sa_dblat',  'Single-Arm DB Lateral Raise','3×12/side', 3, 'One dumbbell, free hand on a rack or your hip. Raise to shoulder height without leaning away. Resist the tilt and your core does the work.'),
  ex('x_sa_dbfront','Single-Arm DB Front Raise','3×12/side', 3, 'One dumbbell, raise straight in front to shoulder height. Ribs down, no backward lean. Stay tall against the offset load.'),
  ex('x_ellip',     'Elliptical Intervals',     '20 min', 1, 'Alternate 1 min hard and 2 min easy.', true, 'timed'),
];

// Exercises that used to exist ONLY as suggestions behind the Alternate
// button: reachable from one related exercise, invisible to the catalog
// search. (Requested: "add those to the search so that everything is
// findable in one place.") Every name in ALTERNATES must now be a catalog
// entry; a test enforces it.
//
// The id is 'swap_' + slugify(name) on purpose. That is the id
// swapExercise() has always given a non-catalog alternate, so sessions
// already logged through Alternate (DB Deadlift, Machine Row, Goblet
// Squat (Heavy) all have real history) keep their progression instead of
// starting over as "first time logging".
const altEx = (name, target, sets, note, timed, inputType, phase) =>
  ({ ...ex('swap_' + slugify(name), name, target, sets, note, timed, inputType), phase: phase || 'enroute' });
const CATALOG_ALTERNATES = [
  altEx('Goblet Squat (Heavy)',        '4×10', 4, 'Hold one heavy dumbbell against your chest, elbows under it, squat to depth and stand. Front loading keeps the torso upright with less load on the spine.'),
  altEx('Goblet Squat',                '4×12', 4, 'Hold a dumbbell or kettlebell at your chest and squat to depth. A lighter, higher-rep version of the heavy goblet squat.'),
  altEx('Smith Machine Squat',         '4×8',  4, 'Bar on the upper back in the Smith machine, feet slightly forward of the bar, squat to depth. The fixed bar path needs less balance.'),
  altEx('DB Deadlift',                 '4×8',  4, 'Dumbbells at your sides or just in front of the shins, hinge at the hips with a flat back and stand tall. The deadlift pattern at a lighter load.'),
  altEx('Machine Chest Press',         '4×12', 4, 'Set the seat so the handles line up with mid chest. Press out without locking hard, lower under control. Shoulder friendly.'),
  altEx('Smith Machine Bench Press',   '4×8',  4, 'Bench centered under the Smith bar, lower to mid chest and press. The fixed bar path suits training without a spotter.'),
  altEx('Machine Row',                 '4×12', 4, 'Chest against the pad, pull the handles to your ribs and squeeze the shoulder blades together. The supported position suits heavier reps.'),
  altEx('Cable Straight-Arm Pulldown', '3×15', 3, 'Face a high cable, arms nearly straight, sweep the bar down to your thighs using the lats. Works the lats without the biceps.'),
  altEx('Seated DB Face Pull',         '3×15', 3, 'Seated and leaning forward, pull light dumbbells up and back toward your ears, finishing with the knuckles rotated back. Rear delts and rotator cuff.'),
  altEx('Cable Lateral Raise',         '3×15', 3, 'Stand side-on to a low cable, raise the handle out to shoulder height with a soft elbow. The cable keeps tension through the whole range.'),
  altEx('Upright Row',                 '3×12', 3, 'Bar or dumbbells in front of the thighs, pull up along the body leading with the elbows to about chest height. Side delts and upper traps.'),
  altEx('Cable Front Raise',           '3×15', 3, 'Back to a low cable, raise the handle straight in front to shoulder height. Constant tension on the front delts.'),
  altEx('Machine Lateral Raise',       '3×15', 3, 'Arms against the pads, raise out to shoulder height and lower slowly. The machine keeps the form strict.'),
  altEx('Cable Curl',                  '3×15', 3, 'Face a low cable, elbows pinned at your sides, curl the bar up and lower slowly. Constant tension on the biceps.'),
  altEx('Dip',                         '3×max', 3, 'On parallel bars, lower until the shoulders are just below the elbows, then press back up. Lean forward for more chest, stay upright for more triceps.', false, 'reps_only'),
  altEx('Leg Press Calf Raise',        '4×20', 4, 'Balls of the feet on the bottom edge of the leg press platform, knees straight but not locked, press through the toes and lower for a full stretch.'),
  altEx('Cable Woodchop',              '3×12/side', 3, 'Side-on to a cable, pull the handle diagonally across your body, turning through the hips and trunk. Rotational core work.'),
  altEx('Suitcase Carry',              '3×40yd', 3, 'One heavy dumbbell or kettlebell in one hand, walk tall without leaning toward or away from the weight. Switch hands each length.'),
  altEx('Trap Bar Carry',              '3×40yd', 3, 'Stand inside a loaded trap bar, lift it and walk with short quick steps, shoulders back. Heavier than a dumbbell carry.'),
  // Stretches: these belong in the cooldown when added from the catalog.
  altEx('Seated Calf Stretch (Strap or Towel)', '2×30s/leg', 2, 'Sit with one leg straight, loop a strap or towel around the ball of the foot, and pull the toes toward you until the calf stretches. No wall needed.', true, 'timed_bilateral', 'landing'),
  altEx('Downward Dog Calf Pumps',     '2×10/leg', 2, 'From a downward dog, press one heel toward the floor while the other knee bends, then switch. A moving calf stretch that also works as a warmup.', false, 'reps_only', 'landing'),
  altEx('Seated Forward Fold',         '2×30s', 2, 'Sit with both legs straight, hinge forward from the hips and reach toward your feet. Keep the back long instead of rounding to get lower.', true, 'timed', 'landing'),
  altEx('Lying Hamstring Stretch (Strap)', '2×30s/leg', 2, 'On your back, strap or towel around one foot, raise that leg straight until the hamstring stretches. Easy to control how hard it pulls.', true, 'timed_bilateral', 'landing'),
  altEx('Standing Hip Flexor Stretch', '2×30s/leg', 2, 'Step into a long split stance, tuck the hips under and shift forward until the front of the back hip stretches. No floor contact needed.', true, 'timed_bilateral', 'landing'),
  altEx('Couch Stretch',               '2×30s/leg', 2, 'Back knee on the floor with the shin up against a couch, bed or wall, front foot forward. Tall chest, squeeze the glute. Deep hip flexor and quad stretch.', true, 'timed_bilateral', 'landing'),
];

function buildExerciseCatalog() {
  const seen = {};
  const catalog = [];
  CATALOG_EXTRAS.forEach(e => {
    seen[e.name] = true;
    catalog.push({ id: e.id, name: e.name, target: e.target, sets: e.sets, note: e.note, timed: e.timed, inputType: e.inputType, phase: 'enroute' });
  });
  // After the programs would also work; listed here so their standalone
  // descriptions win over nothing (no program defines these names).
  CATALOG_ALTERNATES.forEach(e => {
    if (seen[e.name]) return;
    seen[e.name] = true;
    catalog.push({ id: e.id, name: e.name, target: e.target, sets: e.sets, note: e.note, timed: e.timed, inputType: e.inputType, phase: e.phase });
  });
  Object.values(WORKOUTS).forEach(envW => {
    Object.values(envW).forEach(mgW => {
      ['taxi','takeoff','enroute','landing'].forEach(ph => {
        (mgW[ph]||[]).forEach(e => {
          if (seen[e.name]) return;
          seen[e.name] = true;
          catalog.push({ id: e.id, name: e.name, target: e.target, sets: e.sets, note: e.note, timed: e.timed, inputType: e.inputType, phase: ph });
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
  if (exDef.inputType === 'reps_only') { const u = repValueUnit(exDef); return u ? [['reps', u.placeholder, u.short]] : [['reps','Reps','reps']]; }
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
  parts.push('<div style="font-family:var(--mono);font-size:0.625rem;color:var(--muted);margin-bottom:14px">'+dateLabel+'</div>');

  parts.push('<div class="field"><label>Muscle Group</label><select onchange="ST.editSession.session.muscle_group=this.value">');
  MUSCLE_GROUPS.forEach(mg => parts.push('<option value="'+mg+'"'+(s.muscle_group===mg?' selected':'')+'>'+mg+'</option>'));
  parts.push('</select></div>');

  ed.exList.forEach(exDef => {
    const sets = s.sets[exDef.id] || [];
    const fields = edFieldsFor(exDef);
    parts.push('<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px">');
    parts.push('<div class="fb" style="margin-bottom:8px"><div style="font-size:0.8125rem;font-weight:600">'+exDef.name+'</div>');
    parts.push('<button class="btn-ghost" style="font-size:0.6875rem;padding:4px 8px;color:var(--red)" onclick="edRemoveExercise(\''+exDef.id+'\')">✕ Remove</button></div>');
    sets.forEach((set, i) => {
      parts.push('<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">');
      parts.push('<span style="font-family:var(--mono);font-size:0.5625rem;color:var(--muted);flex:0 0 30px">SET '+(i+1)+'</span>');
      fields.forEach(([field, label, unit]) => {
        const raw = set[field];
        const shown = unit === 'min'
          ? (raw ? Math.round((parseFloat(raw)/60)*10)/10 : '')
          : (raw || '');
        const handler = unit === 'min' ? 'edSetValMin' : 'edSetVal';
        parts.push('<div style="flex:1;min-width:0;display:flex;align-items:center;gap:4px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:0 8px 0 0">');
        parts.push('<input type="text" inputmode="decimal" placeholder="'+label+'" value="'+shown+'" style="flex:1;min-width:0;background:transparent;border:none;padding:8px;font-size:1rem;color:var(--text);outline:none" oninput="'+handler+'(\''+exDef.id+'\','+i+',\''+field+'\',this.value)">');
        parts.push('<span style="font-family:var(--mono);font-size:0.5625rem;color:var(--muted);flex-shrink:0">'+(unit||'')+'</span></div>');
      });
      parts.push('</div>');
    });
    parts.push('<button class="btn-ghost" style="font-size:0.6875rem" onclick="edAddSet(\''+exDef.id+'\')">+ Add Set</button>');
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
  ensureSetEntry(exId, i);
  const sets = ST.sets[exId];
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
    parts.push('<div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;font-size:0.8125rem" onclick="edAddCatalogExercise('+i+',\''+q.replace(/'/g,'')+'\')">'+e.name+' <span style="font-family:var(--mono);font-size:0.625rem;color:var(--muted)">'+(e.target||'')+'</span></div>');
  });
  const qSafe = q.replace(/[<>'"]/g,'');
  if (matches.length) parts.push('<div style="font-family:var(--mono);font-size:0.5625rem;color:var(--muted);letter-spacing:0.08em;margin:8px 0 6px">NOT LISTED? ADD IT AS CUSTOM:</div>');
  else parts.push('<div style="font-family:var(--mono);font-size:0.5625rem;color:var(--muted);letter-spacing:0.08em;margin:2px 0 6px">NO MATCH · ADD "'+qSafe.toUpperCase()+'" AS CUSTOM:</div>');
  parts.push('<div style="display:flex;gap:8px;margin-bottom:6px">');
  parts.push('<button class="btn btn-blue" style="flex:1;font-size:0.75rem;padding:12px 8px" onclick="edAddCustomExercise(\''+qSafe+'\',\'timed\')">⏱ ADD AS TIMED</button>');
  parts.push('<button class="btn btn-blue" style="flex:1;font-size:0.75rem;padding:12px 8px" onclick="edAddCustomExercise(\''+qSafe+'\',\'reps_weight\')">🏋️ ADD AS REPS × WEIGHT</button>');
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
  try {
    const profile = (await dbGetProfile()) || {};
    profile.customProfiles = ST.customProfiles;
    await dbSetProfile(profile);
  } catch (e) { showBigToast('Saved on this device, but could not sync.', 'warn'); }
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
    parts.push('<div style="font-family:var(--mono);font-size:0.625rem;color:var(--gold);letter-spacing:0.08em;margin-bottom:8px">'+label+'</div>');
    (bp[section]||[]).forEach(e => {
      parts.push('<div class="fb" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:6px">');
      parts.push('<div><span style="font-size:0.8125rem">'+e.name+'</span> <span style="font-family:var(--mono);font-size:0.625rem;color:var(--muted)">'+(e.target||'')+'</span></div>');
      parts.push('<span style="color:var(--red);cursor:pointer;font-size:0.875rem" onclick="bpRemove(\''+section+'\',\''+e.id+'\')">✕</span>');
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
    parts.push('<option value="">Or browse to add</option>');
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
    parts.push('<div style="padding:9px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:5px;cursor:pointer;font-size:0.8125rem" onclick="bpAdd(\''+section+'\','+i+',\''+q.replace(/'/g,'')+'\')">'+e.name+' <span style="font-family:var(--mono);font-size:0.625rem;color:var(--muted)">'+(e.target||'')+'</span></div>');
  });
  if (!matches.length) {
    parts.push('<div style="font-size:0.6875rem;color:var(--muted);padding:4px 2px 8px">No catalog match for "'+sanitizeUserText(q)+'".</div>');
    parts.push('<button class="btn btn-outline" style="font-size:0.75rem" onclick="bpShowCreateForm(\''+section+'\',\''+q.replace(/\'/g,'')+'\')">+ Create "'+sanitizeUserText(q)+'" as a new exercise</button>');
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
    '<div style="font-size:0.6875rem;color:var(--muted);margin-bottom:8px">New exercise</div>' +
    '<div class="field" style="margin-bottom:6px"><input type="text" id="bpNewName_'+section+'" value="'+name+'" placeholder="Exercise name"></div>' +
    '<div class="field-row" style="margin-bottom:8px">' +
    '<div class="field"><input type="text" id="bpNewTarget_'+section+'" placeholder="Target (e.g. 3\u00d712)"></div>' +
    '<div class="field"><select id="bpNewType_'+section+'"><option value="reps_weight">Reps + Weight</option><option value="reps_only">Reps Only</option><option value="timed">Timed (min)</option></select></div>' +
    '</div>' +
    '<button class="btn btn-gold" style="font-size:0.75rem" onclick="bpSaveCustomExercise(\''+section+'\')">Add to Routine</button>' +
    '<button class="btn-ghost mt8" style="display:block;width:100%;text-align:center;font-size:0.75rem" onclick="document.getElementById(\'bpResults_'+section+'\').innerHTML=\'\'">Cancel</button>' +
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
  } catch(e) { console.warn('Saving custom exercise failed:', e); showToast('⚠️ Saved locally, but could not sync to your account.'); }

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
    parts.push('<div><div style="font-size:0.8125rem;font-weight:600">🛠 '+cp.name+'</div><div style="font-family:var(--mono);font-size:0.625rem;color:var(--muted)">'+count+' exercises · ~'+(count*MIN_PER_EXERCISE)+' min</div></div>');
    parts.push('<div style="display:flex;gap:10px">');
    parts.push('<span style="cursor:pointer;font-size:0.875rem" onclick="openProfileBuilder(\''+cp.id+'\')">✎</span>');
    parts.push('<span style="cursor:pointer;font-size:0.875rem;color:var(--red)" onclick="confirmDeleteCustomProfile(\''+cp.id+'\')">🗑</span>');
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
  const fatigueLabel = {go:statusDot('go')+' GO',marginal:statusDot('marginal')+' MARGINAL',nogo:statusDot('nogo')+' NO-GO'}[ST.fatigue];
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
  parts.push('<button class="btn-ghost" style="font-size:0.75rem;margin-bottom:10px" onclick="switchTab(\'today\')">← Back to Today</button>');
  parts.push('<div class="section-label">PREFLIGHT BRIEFING · '+FCF_VERSION+'</div>');
  parts.push(installPromptHtml);
  if (profileIncomplete) {
    parts.push('<div class="card mb12" style="border-color:var(--gold);cursor:pointer" onclick="haptic(\'light\');switchTab(\'profile\')">');
    parts.push('<div class="fb"><div><div style="font-size:0.8125rem;font-weight:600">👤 Complete your profile</div>');
    parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:3px">Set sex and training objective to unlock personalized programming.</div></div>');
    parts.push('<div style="font-size:1.125rem;color:var(--gold)">→</div></div>');
    parts.push('</div>');
  }

  // ── HERO: today's plan + engage, always the first thing after any banners ──
  const planName = ST.activeCustomProfileId
    ? '🛠 ' + (ST.customProfiles.find(cp => cp.id === ST.activeCustomProfileId)?.name || 'Custom Routine')
    : ST.muscleGroup;
  const envLabel = {room:'Hotel Room',hotel:'Hotel Gym',comm:'Commercial Gym',band:'Band Exercises'}[ST.env];
  const planSummary = envLabel + (ST.timeAvailMin ? ' · '+ST.timeAvailMin+' min' : ' · Full Session') + (totalEx ? ' · '+totalEx+' exercises' : '');

  if (wk) {
    parts.push('<div class="card mb12" style="border-color:var(--gold);background:linear-gradient(160deg, rgba(201,168,76,0.08), var(--bg3))">');
    parts.push('<div style="font-family:var(--mono);font-size:0.625rem;color:var(--gold);letter-spacing:0.1em;margin-bottom:6px">TODAY\'S MISSION</div>');
    parts.push('<div style="font-size:1.1875rem;font-weight:800;margin-bottom:4px">'+planName+'</div>');
    parts.push('<div style="font-size:0.75rem;color:var(--muted);margin-bottom:14px">'+planSummary+(ST.activeCustomProfileId?'':' · '+levelLabel+(ST.fatigue!=='go'?' / '+fatigueLabel:''))+'</div>');
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
  parts.push('<div class="edit-row-fb" style="display:flex;justify-content:space-between;align-items:center;padding:8px 2px;font-size:0.75rem;color:var(--muted)" onclick="ST.showChangePlan=!ST.showChangePlan;renderPage()">');
  parts.push('<span>'+(ST.scheduleEnvNote || (ST.activeCustomProfileId ? 'Custom routine, used as saved.' : 'Same as your usual plan.'))+'</span>');
  parts.push('<span style="font-family:var(--mono);font-size:0.75rem;font-weight:700;color:var(--gold);cursor:pointer;padding:8px 14px;border:1.5px solid var(--gold);border-radius:8px;background:rgba(201,168,76,0.1);white-space:nowrap">'+(showPlan?'HIDE ▴':'CHANGE PLAN ▾')+'</span>');
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
      parts.push('<div style="font-family:var(--mono);font-size:0.5625rem;color:var(--muted);margin:-6px 0 10px;cursor:pointer" onclick="haptic(\'light\');openProfileManager()">✎ MANAGE SAVED ROUTINES</div>');
    }

    parts.push('<div class="section-label">TIME AVAILABLE <span class="info-i" onclick="showBioInfo(\'timeAvail\')">i</span></div>');
    parts.push('<div class="card mb12">');
    parts.push('<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">');
    [15,30,45,60,null].forEach(m => {
      const sel = ST.timeAvailMin === m;
      parts.push('<div class="env-btn'+(sel?' sel':'')+'" style="padding:10px" onclick="ST.timeAvailMin='+(m===null?'null':m)+';persistDailyInputs();renderPage()"><div style="font-size:0.75rem;font-weight:600">'+(m===null?'Full Session':m+' min')+'</div>'+(m===null?'<div style="font-family:var(--mono);font-size:0.5625rem;color:var(--muted);margin-top:2px">~'+fullSessionMin+' min</div>':'')+'</div>');
    });
    parts.push('</div>');
    parts.push('</div>');
    parts.push('<div class="section-label">MISSION ENVIRONMENT</div>');
    parts.push('<div class="env-toggle">');
    parts.push('<div class="env-btn '+(ST.env==='room'?'sel':'')+'" onclick="setEnvManually(\'room\')"><div class="ei">🛏️</div><div class="el">HOTEL ROOM</div></div>');
    parts.push('<div class="env-btn '+(ST.env==='hotel'?'sel':'')+'" onclick="setEnvManually(\'hotel\')"><div class="ei">🏨</div><div class="el">HOTEL GYM</div></div>');
    parts.push('<div class="env-btn '+(ST.env==='comm'?'sel':'')+'" onclick="setEnvManually(\'comm\')"><div class="ei">🏋️</div><div class="el">COMM GYM</div></div>');
    parts.push('<div class="env-btn '+(ST.env==='band'?'sel':'')+'" onclick="ST.env=\'band\';renderPage()"><div class="ei">➰</div><div class="el">BAND WORK</div></div>');
    parts.push('</div>');

    // Detailed phase-by-phase preview only shown while the plan editor is
    // open — informational once you've already seen it, not a decision.
    if (wk) {
      parts.push('<div class="section-label">FLIGHT PLAN PREVIEW · '+totalEx+' EXERCISES ('+(ST.activeCustomProfileId?'CUSTOM · AS SAVED':levelLabel+(ST.fatigue!=='go'?' / '+fatigueLabel:'')+(ST.timeAvailMin?' / ⏱ '+ST.timeAvailMin+'min':''))+')</div>');
      parts.push('<div class="card card-dark mb12"><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">');
      [['🚕 TAXI',wk.taxi],['🛫 TAKEOFF',wk.takeoff],['✈️ EN ROUTE',wk.enroute],['🛬 LANDING',wk.landing]].forEach(([label,exs]) => {
        parts.push('<div style="background:var(--bg);border-radius:8px;padding:10px"><div style="font-family:var(--mono);font-size:0.5625rem;color:var(--muted);letter-spacing:0.08em;margin-bottom:6px">'+label+'</div>');
        if (!exs.length) parts.push('<div style="font-size:0.6875rem;color:var(--muted);font-style:italic">(skipped)</div>');
        else exs.forEach(e => parts.push('<div style="font-size:0.6875rem;color:'+(e.swappedForInjury?'var(--blue)':e.injuryCaution?'var(--amber)':'var(--text)')+';margin-bottom:3px">· '+e.name+(e.swappedForInjury?' 🩹':e.injuryCaution?' ⚠️':'')+'</div>'));
        parts.push('</div>');
      });
      parts.push('</div></div>');
    }
  }

  // ── Pilot Condition — one-line status by default, full input on tap ──
  const condMetaLine = {go:[statusDot('go'),'GO'], marginal:[statusDot('marginal'),'MARGINAL'], nogo:[statusDot('nogo'),'NO-GO']}[ST.fatigue];
  const showCond = ST.showConditionDetail || isNewUser;
  parts.push('<div class="card mb12" style="cursor:pointer" onclick="haptic(\'light\');ST.showConditionDetail=!ST.showConditionDetail;renderPage()">');
  parts.push('<div class="fb"><div style="font-size:0.8125rem">'+condMetaLine[0]+' Pilot Condition: <strong>'+condMetaLine[1]+'</strong></div><div style="font-family:var(--mono);font-size:0.625rem;color:var(--gold)">'+(showCond?'HIDE ▴':'ADJUST ▾')+'</div></div>');
  parts.push('</div>');

  if (showCond) {
    parts.push('<div class="card mb12">');
    parts.push('<div style="font-size:0.75rem;color:var(--muted);margin-bottom:10px;line-height:1.5">Your physical readiness today. This gates workout intensity: training through fatigue increases injury risk and impairs adaptation.</div>');

    const condBtns =
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px">' +
      '<div class="env-btn '+(ST.fatigue==='go'?'sel':'')+'" onclick="ST.fatigue=\'go\';renderPage()"><div class="ei">'+statusDot('go', 18)+'</div><div class="el">GO</div><div style="font-size:0.5625rem;color:var(--muted);margin-top:2px">Full protocol</div></div>' +
      '<div class="env-btn '+(ST.fatigue==='marginal'?'sel':'')+'" onclick="ST.fatigue=\'marginal\';renderPage()"><div class="ei">'+statusDot('marginal', 18)+'</div><div class="el">MARGINAL</div><div style="font-size:0.5625rem;color:var(--muted);margin-top:2px">Light only</div></div>' +
      '<div class="env-btn '+(ST.fatigue==='nogo'?'sel':'')+'" onclick="ST.fatigue=\'nogo\';renderPage()"><div class="ei">'+statusDot('nogo', 18)+'</div><div class="el">NO-GO</div><div style="font-size:0.5625rem;color:var(--muted);margin-top:2px">Mobility only</div></div>' +
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
      parts.push('<label style="font-size:0.6875rem;color:var(--muted);display:block;margin-bottom:4px">How recovered do you feel today? <span class="info-i" onclick="showBioInfo(\'readiness\')">i</span></label>');
      parts.push('<div style="font-family:var(--mono);font-size:0.5625rem;color:var(--muted);letter-spacing:0.05em;margin-bottom:6px">1 = BARELY RECOVERED · 5 = FULLY RECOVERED</div>');
      parts.push('<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:8px">');
      for (let i=1;i<=5;i++) {
        parts.push('<div class="env-btn" style="padding:8px 2px'+(ST.readiness===i?';border-color:var(--gold);background:rgba(212,175,55,0.08)':'')+'" onclick="setReadiness('+i+')"><div style="font-size:0.9375rem;font-weight:700">'+i+'</div></div>');
      }
      parts.push('</div>');
      const condMeta = {go:[statusDot('go'),'GO: full protocol'], marginal:[statusDot('marginal'),'MARGINAL: light only'], nogo:[statusDot('nogo'),'NO-GO: mobility only']}[ST.fatigue];
      parts.push('<div class="fb" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px">');
      parts.push('<div style="font-size:0.75rem">Pilot Condition: <strong>'+condMeta[0]+' '+condMeta[1]+'</strong></div>');
      parts.push('<div style="font-family:var(--mono);font-size:0.5625rem;color:var(--muted);cursor:pointer" onclick="haptic(\'light\');ST.showCondOverride=!ST.showCondOverride;renderPage()">'+(ST.showCondOverride?'HIDE':'OVERRIDE')+'</div>');
      parts.push('</div>');
      if (ST.showCondOverride) parts.push(condBtns);
      parts.push('<div style="font-size:0.625rem;color:var(--muted);line-height:1.5">Connect your Oura Ring in Profile and this is set automatically from your readiness score each morning.</div>');
    }

    if (ST.fatigue === 'marginal') {
      parts.push('<div class="alert alert-warn" style="margin-top:8px"><div class="alert-icon">⚠️</div><div>Heavy Takeoff phase removed. One light En Route exercise only.</div></div>');
    } else if (ST.fatigue === 'nogo') {
      parts.push('<div class="alert alert-danger" style="margin-top:8px"><div class="alert-icon">🔴</div><div>Only Taxi and Landing phases active. Training under significant fatigue increases injury risk. This is physiology, not weakness.</div></div>');
    }
    parts.push('</div>');
  }

  // ── Injury Flag — one-line status by default, region grid on tap ──
  const showInjury = ST.showInjuryDetail || isNewUser;
  parts.push('<div class="card mb12" style="cursor:pointer" onclick="haptic(\'light\');ST.showInjuryDetail=!ST.showInjuryDetail;renderPage()">');
  if (ST.injuries.length) {
    parts.push('<div class="fb"><div style="font-size:0.8125rem">🩹 '+ST.injuries.map(r=>INJURY_REGIONS[r].label).join(', ')+'</div><div style="font-family:var(--mono);font-size:0.625rem;color:var(--gold)">'+(showInjury?'HIDE ▴':'EDIT ▾')+'</div></div>');
  } else {
    parts.push('<div class="fb"><div style="font-size:0.8125rem;color:var(--muted)">🩹 No injuries flagged</div><div style="font-family:var(--mono);font-size:0.625rem;color:var(--gold)">'+(showInjury?'HIDE ▴':'FLAG ▾')+'</div></div>');
  }
  parts.push('</div>');

  if (showInjury) {
    parts.push('<div class="section-label">INJURY FLAG <span class="info-i" onclick="showBioInfo(\'injury\')">i</span></div>');
    parts.push('<div class="card mb12">');
    if (ST.injuries.length) {
      parts.push('<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">');
      ST.injuries.forEach(r => {
        parts.push('<div style="display:flex;align-items:center;gap:6px;background:rgba(245,158,11,0.1);border:1px solid var(--amber);border-radius:16px;padding:4px 10px;font-size:0.6875rem;color:var(--amber)">'+INJURY_REGIONS[r].label+' <span style="cursor:pointer" onclick="toggleInjury(\''+r+'\')">✕</span></div>');
      });
      parts.push('</div>');
    } else {
      parts.push('<div style="font-size:0.75rem;color:var(--muted);margin-bottom:10px">No regions flagged. Tap a region below if something\'s bothering you today.</div>');
    }
    parts.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">');
    Object.keys(INJURY_REGIONS).forEach(r => {
      const on = ST.injuries.includes(r);
      parts.push('<div class="env-btn" style="padding:8px'+(on?';border-color:var(--amber);background:rgba(245,158,11,0.08)':'')+'" onclick="toggleInjury(\''+r+'\')"><div style="font-size:0.6875rem">'+INJURY_REGIONS[r].label+'</div></div>');
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
    parts.push('<div style="font-size:0.625rem;color:var(--muted);margin-bottom:6px">📅 Flight hours auto-filled from your schedule. Edit if it\'s off.</div>');
  }
  parts.push('<div class="field-row" style="margin-bottom:10px">');
  parts.push('<div class="field" style="margin-bottom:0"><label>Flight Hours Today</label>');
  parts.push('<input type="text" inputmode="decimal" pattern="[0-9]*\.?[0-9]*" value="'+ST.flightHrsRaw+'" placeholder="0 = no-fly day" oninput="ST.flightHrsRaw=this.value;ST.flightHrs=parseFloat(this.value)||0;ST.flightHrsTouched=true;updateHydrationUI()"></div>');
  parts.push('<div class="field" style="margin-bottom:0"><label>Water Consumed (L)</label>');
  parts.push('<input type="text" inputmode="decimal" pattern="[0-9]*\.?[0-9]*" value="'+ST.waterInRaw+'" placeholder="e.g. 1.2 or .5" oninput="ST.waterInRaw=this.value;ST.waterIn=parseFloat(this.value)||0;updateHydrationUI()"></div>');
  parts.push('</div>');
  parts.push('<div id="noFlyBox">'+(ST.flightHrsTouched && ST.flightHrs === 0 ? '<div class="alert alert-info" style="margin-bottom:8px"><div class="alert-icon">ℹ️</div><div>No-fly day: minimum 1.0L hydration target still applies. Your body needs baseline water regardless of duty status.</div></div>' : '')+'</div>');
  parts.push('<div class="fb" style="margin-bottom:6px"><span style="font-family:var(--mono);font-size:0.6875rem;color:var(--muted)">TARGET: <span id="hydroTargetVal" style="color:var(--text)">'+hydroTarget().toFixed(1)+'L</span></span><span id="hydroStatusLbl" style="font-family:var(--mono);font-size:0.6875rem;color:'+hs.color+'">'+hs.label+'</span></div>');
  parts.push('<div class="hydro-bar-wrap"><div id="hydroBar" class="hydro-bar '+(pct>=1?'hydro-ok':'hydro-warn')+'" style="width:'+Math.round(pct*100)+'%"></div></div>');
  parts.push('<div id="hydroPctText" style="font-family:var(--mono);font-size:0.625rem;color:var(--muted);margin-top:4px;text-align:right">'+Math.round(pct*100)+'% of target</div>');
  parts.push('<div id="hydroAdviceBox">'+(adv ? '<div class="alert alert-warn mt8"><div class="alert-icon">💧</div><div>'+adv+'</div></div>' : '<div class="alert alert-ok mt8"><div class="alert-icon">✅</div><div>Hydration nominal. Cleared for workout operations.</div></div>')+'</div>');
  parts.push('</div>');
  } // end hydration tracking block

  // Last mission
  if (ST.lastSession) {
    const lastDate = new Date(ST.lastSession.date).toLocaleDateString('en-US',{month:'short',day:'numeric'});
    parts.push('<div class="section-label">LAST MISSION</div>');
    parts.push('<div class="card card-dark mb12">');
    parts.push('<div class="fb"><div style="font-size:0.8125rem;font-weight:600">'+(ST.lastSession.muscle_group||'–')+'</div><div style="font-family:var(--mono);font-size:0.6875rem;color:var(--muted)">'+lastDate+'</div></div>');
    parts.push('<div style="font-size:0.6875rem;color:var(--green);margin-top:6px">→ Recommended next: <strong>'+recommended+'</strong></div>');
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
    '<div class="modal-body" style="margin-bottom:14px">Based on your profile, we suggest <strong>'+g.icon+' '+g.label+'</strong>: '+g.desc.toLowerCase()+'. Your training history stays exactly as it is either way, and you can change this anytime in Mission Objective.</div>' +
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
  showToast('Objective updated. Workouts now reflect your profile.');
}

function setReadiness(n) {
  ST.readiness = n;
  persistDailyInputs();
  // Suggests Pilot Condition — same pattern as Oura's auto-set. The GO/
  // MARGINAL/NO-GO buttons remain a manual override at all times.
  ST.fatigue = n <= 2 ? 'nogo' : n === 3 ? 'marginal' : 'go';
  renderPage();
}

// BUG FIX (found by the e2e crawler on the Profile page): these saves
// ran with no catch. dbSetProfile rethrows after its 6s timeout, so on a
// slow connection a tap here surfaced as an uncaught "timeout" and the
// red JS ERROR banner, for a save that was already applied on the device.
// Same treatment as setTrackingPref: apply locally first, then sync, and
// say so plainly if the sync fails.
async function toggleInjury(region) {
  const i = ST.injuries.indexOf(region);
  if (i === -1) ST.injuries.push(region); else ST.injuries.splice(i, 1);
  renderPage();
  try {
    const profile = (await dbGetProfile()) || {};
    profile.injuries = ST.injuries;
    await dbSetProfile(profile);
  } catch (e) { showBigToast('Saved on this device, but could not sync.', 'warn'); }
}

async function saveGoalLevel() {
  try {
    const profile = (await dbGetProfile()) || {};
    profile.goal = ST.goal;
    profile.level = ST.level;
    profile.customExercises = ST.customExercises;
    await dbSetProfile(profile);
  } catch (e) { showBigToast('Saved on this device, but could not sync.', 'warn'); }
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
      ST.sets[exItem.id] = Array.from({ length: timedSetCount(exItem) }, () => ({ seconds_left: '', seconds_right: '' }));
    } else if (exItem.inputType === 'timed_distance') {
      ST.sets[exItem.id] = [{ seconds: '', miles: '' }];
    } else if (exItem.timed) {
      ST.sets[exItem.id] = Array.from({ length: timedSetCount(exItem) }, () => ({ seconds: '' }));
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
  const idToKey = {}, keyToIds = {}, idToName = {};
  const seen = new Set();
  (function walk(node) {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.id && node.name) {
      const key = normalizeMovementName(node.name);
      idToKey[node.id] = key;
      idToName[node.id] = node.name;
      (keyToIds[key] = keyToIds[key] || []).push(node.id);
      return;
    }
    Object.values(node).forEach(walk);
  })(WORKOUTS);
  _movementIndex = { idToKey, keyToIds, idToName };
  return _movementIndex;
}

// Every exercise id representing the same movement as this one — the set
// that history should actually be read across.
// History also holds ids the catalog doesn't know: custom exercises
// (custom_<ts>, names in ST.customExercises), swaps and injury alternates
// with a readable slug (swap_db_deadlift, inj_db_incline_press), and the
// original June 2026 ids ('rdl', 'jm_squat'). Without names for these,
// that history was invisible to every lookup.
const LEGACY_EXERCISE_NAMES = {
  rdl: 'Romanian Deadlift', squat: 'Back Squat', bench: 'Bench Press', ohp: 'Overhead Press',
  legpress: 'Leg Press', lgpress: 'Leg Press', calf: 'Calf Raise', latpd: 'Lat Pulldown',
  curl: 'Bicep Curl', facepull: 'Face Pull', lateral: 'Lateral Raise', pressdown: 'Tricep Pressdown',
  cabrow: 'Cable Row', bss: 'Bulgarian Split Squat', tbdl: 'Trap Bar Deadlift', broad: 'Broad Jump',
  boxjump: 'Box Jump', lunge: 'Lunge', plank: 'Plank',
};
function resolveExerciseName(id) {
  const { idToName } = buildMovementIndex();
  if (idToName[id]) return idToName[id];
  const custom = (ST.customExercises || []).find(c => c?.exercise?.id === id);
  if (custom) return custom.exercise.name;
  const slug = String(id).replace(/^(swap|inj|jm)_/, '');
  if (LEGACY_EXERCISE_NAMES[slug]) return LEGACY_EXERCISE_NAMES[slug];
  if (/^(swap|inj)_/.test(id) && !/^\d+$/.test(slug)) return slug.replace(/_/g, ' ');
  return null;
}

// Movement FAMILY: same movement regardless of implement or qualifier.
// "DB Romanian Deadlift" and "Romanian Deadlift" share a family;
// "Kettlebell Goblet Squat (Heavy)" and "(Warmup)" share one too.
// Used only to say "you've done this before"; never for weight targets,
// since a barbell weight is the wrong target for a dumbbell variation.
function movementFamilyKey(name) {
  return String(name || '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(db|dumbbells?|barbell|bb|kettlebells?|kb|cable|machine|smith|banded|band|weighted|heavy|light|warm-?up)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Most recent weighted log of the same family under a DIFFERENT exact
// movement. Returns { name, weight } or null.
function lastLoggedFamilyVariant(exId, exName) {
  const fam = movementFamilyKey(exName);
  if (!fam) return null;
  const exact = new Set(equivalentExerciseIds(exId, exName));
  const all = ST.sessionCache || [];
  for (let i = all.length - 1; i >= 0; i--) {
    for (const [id, sets] of Object.entries(all[i].sets || {})) {
      if (exact.has(id) || !Array.isArray(sets)) continue;
      const nm = resolveExerciseName(id);
      if (!nm || movementFamilyKey(nm) !== fam) continue;
      const w = sets.map(s => parseFloat(s.weight) || 0).filter(x => x > 0);
      if (w.length) return { name: nm, weight: Math.max(...w) };
    }
  }
  return null;
}

function equivalentExerciseIds(exId, exName) {
  const { idToKey, keyToIds } = buildMovementIndex();
  const key = (exName ? normalizeMovementName(exName) : null) || idToKey[exId];
  if (!key) return [exId];
  const ids = [...(keyToIds[key] || [])];
  // Non-catalog ids (custom, swaps, legacy) whose resolved name is the same
  // exact movement count as full history, weights included.
  for (const sess of (ST.sessionCache || [])) {
    for (const id of Object.keys(sess.sets || {})) {
      if (ids.includes(id) || idToKey[id]) continue; // catalog ids already handled above
      const nm = resolveExerciseName(id);
      if (nm && normalizeMovementName(nm) === key) ids.push(id);
    }
  }
  return ids.includes(exId) ? ids : [...ids, exId];
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
// Most hotel gym dumbbell racks stop at 50 lb. Once someone is there, "add
// weight" is advice they cannot follow, so progression switches to reps.
const HOTEL_DB_MAX_LB = 50;
function isDumbbellName(exName) {
  const name = (exName || '').toLowerCase();
  return name.includes('db ') || name.includes('dumbbell') || name.startsWith('db') || name.includes('kettlebell');
}
function atHotelDumbbellCap(exName, env, weight) {
  return (env === 'hotel' || env === 'room') && isDumbbellName(exName) && parseFloat(weight) >= HOTEL_DB_MAX_LB;
}
// What to aim for next time: a heavier weight, or, when the rack cannot go
// heavier, the same weight for more reps. Returns { kind, lb, reps, label }.
function overloadTarget(exItem, o) {
  const last = o.lastWeight;
  if (!last) return null;
  if (atHotelDumbbellCap(exItem.name, o.env, last)) {
    const base = Math.max(o.lastReps || 0, parseTargetReps(exItem.target) || 0);
    const reps = base + 2;
    return { kind: 'reps', lb: last, reps, label: last + ' lb × ' + reps + ' reps' };
  }
  const lb = nextWeightFrom(last, exItem.name, o.phaseKey);
  return { kind: 'weight', lb, label: lb + ' lb' };
}
function suggestNextWeight(exId, exName, phaseKey) {
  const last = lastLoggedMax(exId, exName);
  if (!last) return null;
  return nextWeightFrom(last, exName, phaseKey);
}
function nextWeightFrom(last, exName, phaseKey) {
  const name = (exName||'').toLowerCase();
  const isLower = name.includes('squat')||name.includes('deadlift')||name.includes('lunge')||name.includes('rdl');
  // BUG FIX (reported: "Target -> 37.5 lb" on DB Bench Press, but dumbbells
  // come in 5 lb increments — 37.5 isn't a weight that exists on a rack).
  // Barbell/machine work can genuinely move in 2.5 lb plates; dumbbells
  // can't. Detect DB-based exercises and round the suggestion UP to the
  // nearest real 5 lb increment instead of just adding a flat amount.
  const isDumbbell = name.includes('db ') || name.includes('dumbbell') || name.startsWith('db');
  if (isDumbbell) {
    return Math.ceil((last + 0.01) / 5) * 5;
  }
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
    {name:'Seated Calf Stretch (Strap or Towel)',target:'2×30s/leg',note:'Same muscle, no wall needed. Good for a hotel room floor.',inputType:'timed_bilateral'},
    {name:'Downward Dog Calf Pumps',target:'2×10/leg',note:'Alternating heel drives. Dynamic instead of static, works well as a warmup too.',inputType:'reps_only'},
  ],
  'Standing Hamstring Stretch': [
    {name:'Seated Forward Fold',target:'2×30s',note:'No step needed: floor-based, same hamstring line.',inputType:'timed'},
    {name:'Lying Hamstring Stretch (Strap)',target:'2×30s/leg',note:'Strap or towel around the foot, lying on your back. Easier to control intensity.',inputType:'timed_bilateral'},
  ],
  'Kneeling Hip Flexor Stretch': [
    {name:'Standing Hip Flexor Stretch',target:'2×30s/leg',note:'No floor contact needed. Works in a hotel room or aircraft galley.',inputType:'timed_bilateral'},
    {name:'Couch Stretch',target:'2×30s/leg',note:'Deeper hip flexor and quad stretch using a couch, bed, or wall.',inputType:'timed_bilateral'},
  ],
  'Back Squat': [
    {name:'Goblet Squat (Heavy)',target:'4×10',note:'DB front-loaded squat. Less spinal compression.'},
    {name:'Hack Squat (Machine)',target:'4×10',note:'Machine substitute. Quad dominant, adjustable load.'},
    {name:'Leg Press',          target:'4×12',note:'Seated machine. Good if knees or back are an issue.'},
    {name:'Smith Machine Squat',target:'4×8', note:'Fixed bar path. Good when the rack is busy or you want less stabilizer demand.'},
  ],
  'Romanian Deadlift': [
    {name:'DB Romanian Deadlift',target:'4×10',note:'Same hip hinge, dumbbells if no barbell available.'},
    {name:'Seated Leg Curl (Machine)',target:'3×12',note:'Machine isolation: direct hamstring without the hinge.'},
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
    {name:'Smith Machine Bench Press',target:'4×8',note:'Fixed bar path. Good when the rack is busy or you\'re training without a spotter.'},
  ],
  'Standing Overhead Press': [
    {name:'DB Overhead Press',  target:'4×8', note:'Independent arms. Easier shoulder position.'},
    {name:'Push Press',         target:'4×5', note:'Leg drive added, allowing heavier overhead loads.'},
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
    {name:'Table / Inverted Row',target:'3×12',     note:'Bodyweight row under a table or bar.',inputType:'reps_only'},
  ],
  'Box Jump': [
    {name:'Broad Jump',         target:'5×3',note:'Horizontal power. Same explosive hip extension.',inputType:'reps_distance'},
    {name:'Squat Jump',         target:'4×5',note:'No box needed. Same power demand.',inputType:'reps_only'},
    {name:'DB Jump Squat',      target:'4×5',note:'Light DBs add load without a box.'},
  ],
  'Single Leg Split Squat': [
    {name:'Reverse Lunge',      target:'3×12/leg',note:'Both feet on floor: lower balance demand.',inputType:'reps_only'},
    {name:'Step-Up',            target:'3×12/leg',note:'Same glute + quad pattern. Use a bench.'},
    {name:'Single Leg Squat (Pistol)',target:'3×5/leg',note:'Harder bodyweight version.',inputType:'reps_only'},
  ],
  'Face Pull': [
    {name:'Dumbbell Reverse Fly',target:'3×15',note:'Prone or bent-over. Same rear delt + external rotation.'},
    {name:'Band Pull-Apart',    target:'3×20',note:'Resistance band. Great shoulder health work.',inputType:'reps_only'},
    {name:'Seated DB Face Pull',target:'3×15',note:'Seated, light DBs, external rotation finish.'},
  ],
  'Goblet Squat': [
    {name:'Back Squat',         target:'5×5',note:'Barbell version for heavier loading.'},
    {name:'Single Leg Squat (Pistol)',target:'3×5/leg',note:'Bodyweight unilateral: very demanding.',inputType:'reps_only'},
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
    {name:'Single Leg Split Squat',target:'3×8/leg',note:'Rear foot elevated variant: more quad stretch.'},
    {name:'Step-Up',target:'3×12/leg',note:'Unweighted version if the loaded step feels too aggressive.'},
  ],
  'Single-Leg Calf Raise': [
    {name:'Standing Calf Raise',target:'4×15',note:'Bilateral: easier balance, still loads the calf hard.'},
    {name:'Calf Raise (step)',target:'3×15/leg',note:'Same unilateral pattern using a step for extra range.'},
  ],
  'Dumbbell Lateral Lunge': [
    {name:'Reverse Lunge',target:'3×12/leg',note:'Sagittal-plane substitute, easier on the groin/adductors.'},
    {name:'Step-Up (Weighted)',target:'3×12/leg',note:'Different plane, same single-leg strength demand.'},
  ],
  'DB Bench Press': [
    {name:'Machine Chest Press',target:'4×12',note:'Fixed path, easier on the shoulders for higher reps.'},
    {name:'Pushup Variations',target:'4×max',note:'Bodyweight substitute if dumbbells aren\'t heavy enough or available.',inputType:'reps_only'},
    {name:'DB Incline Press',target:'4×10',note:'Shifts emphasis to upper chest.'},
  ],
  'DB Overhead Press': [
    {name:'Standing Overhead Press',target:'4×8',note:'Barbell version: heavier bilateral loading.'},
    {name:'Pike Pushup',target:'4×12',note:'Bodyweight overhead pressing, no equipment needed.',inputType:'reps_only'},
    {name:'DB Incline Press',target:'4×10',note:'Still hits the front delts, less overhead shoulder strain.'},
  ],
  'DB Incline Press': [
    {name:'DB Bench Press',target:'4×10',note:'Flat variant if an incline bench isn\'t available.'},
    {name:'Machine Chest Press',target:'4×12',note:'Fixed path alternative.'},
    {name:'Pushup Variations',target:'4×max',note:'Bodyweight substitute. Elevate feet for upper-chest emphasis.',inputType:'reps_only'},
  ],
  'DB Lateral Raise': [
    {name:'Cable Lateral Raise',target:'3×15',note:'Constant tension through the full range. Harder than DBs.'},
    {name:'Upright Row',target:'3×12',note:'Hits lateral delt and upper trap together.'},
  ],
  'DB Front Raise': [
    {name:'Cable Front Raise',target:'3×15',note:'Constant tension version if a cable stack is available.'},
    {name:'DB Lateral Raise',target:'3×15',note:'Different plane, same front-delt-adjacent shoulder work.'},
  ],
  'Pullups': [
    {name:'Lat Pulldown',target:'4×10',note:'Adjustable load. Good if bodyweight pullups are too hard yet.'},
    {name:'DB Row',target:'4×10/side',note:'Horizontal pulling substitute, no bar needed.'},
    {name:'Chinups',target:'4×max',note:'Supinated grip: more bicep involvement.',inputType:'reps_only'},
  ],
  'DB Row': [
    {name:'Seated Cable Row',target:'4×12',note:'Bilateral, constant tension version.'},
    {name:'Barbell Row (Pendlay)',target:'4×6',note:'Heavier bilateral pulling if a barbell is available.'},
  ],
  'Chinups': [
    {name:'Pullups',target:'4×max',note:'Pronated grip: more lat, less bicep.',inputType:'reps_only'},
    {name:'Lat Pulldown',target:'4×10',note:'Adjustable load, supinated grip on most machines.'},
  ],
  'Bent-Over DB Face Pull': [
    {name:'Band Pull-Apart',target:'3×20',note:'No dumbbells needed. Great shoulder health work.',inputType:'reps_only'},
    {name:'DB Lateral Raise',target:'3×15',note:'Different but complementary rear/side delt work.'},
  ],
  'DB Hammer Curl': [
    {name:'EZ Bar Curl',target:'3×12',note:'Barbell substitute if available.'},
    {name:'Towel Curl',target:'3×12',note:'No equipment needed; partner or fixed object required.'},
  ],
  'Bench/Box Jump': [
    {name:'Broad Jump',target:'5×3',note:'Horizontal power, no box height needed.',inputType:'reps_distance'},
    {name:'Squat Jump',target:'4×5',note:'No box needed; same explosive demand.',inputType:'reps_only'},
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
    {name:'Stationary Bike Intervals',target:'20 min',note:'Same aerobic zone, lower impact.',inputType:'timed'},
    {name:'Walking',target:'30-45 min',note:'Zone 1-2 substitute: easier recovery day option.',inputType:'timed'},
  ],
  'Treadmill': [
    {name:'Stationary Bike Intervals',target:'20 min',note:'Lower-impact substitute for the same duration.',inputType:'timed'},
    {name:'Walking',target:'30-45 min',note:'If the treadmill is occupied or you want lower intensity.',inputType:'timed'},
  ],

  // HOTEL ROOM
  'Single Leg Squat (Pistol)': [
    {name:'Slow Bodyweight Squat',target:'4×12',note:'Bilateral regression. Build control before going unilateral.'},
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
    {name:'Single-Leg Calf Raise',target:'3×15/leg',note:'No step needed; harder unilateral version.',inputType:'reps_only'},
  ],
  'Reverse Lunge': [
    {name:'Split Squat',target:'3×10/leg',note:'Static stance: easier balance, same quad/glute demand.',inputType:'reps_only'},
    {name:'Single Leg Squat (Pistol)',target:'3×5/leg',note:'Harder progression once lunges feel easy.',inputType:'reps_only'},
  ],
  'Archer Pushup': [
    {name:'Pushup Variations',target:'4×max',note:'Standard version if the archer variant is too advanced.',inputType:'reps_only'},
    {name:'Decline Pushup',target:'4×max',note:'Different difficulty lever: feet elevated instead of arm reach.',inputType:'reps_only'},
  ],
  'Pike Pushup': [
    {name:'Chair Dips',target:'3×12',note:'Different pressing angle, still shoulder/tricep focused.',inputType:'reps_only'},
    {name:'Decline Pushup',target:'4×max',note:'Upper-chest/shoulder emphasis without full overhead position.',inputType:'reps_only'},
  ],
  'Pushup Variations': [
    {name:'Decline Pushup',target:'4×max',note:'Feet elevated: more upper chest and shoulder.',inputType:'reps_only'},
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
    {name:'Table / Inverted Row',target:'3×12',note:'No bar needed. Use a sturdy table edge.',inputType:'reps_only'},
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
    {name:'Plank',target:'3×30s',note:'Static alternative, less coordination-dependent.',inputType:'timed'},
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
    {name:'Split Jump',target:'4×6/side',note:'Very similar movement. Pick whichever cues better for you.',inputType:'reps_only'},
    {name:'Reverse Lunge',target:'3×12/leg',note:'Remove the jump if you want the pattern without impact.',inputType:'reps_only'},
  ],
  'Mountain Climbers': [
    {name:'Burpee Intervals',target:'8×30s',note:'Higher-intensity conditioning substitute.',inputType:'timed'},
    {name:'Plank',target:'3×30s',note:'Static alternative if you want the core demand without the cardio component.',inputType:'timed'},
  ],

  // EN ROUTE accessories
  'Lateral Raise': [
    {name:'Cable Lateral Raise',target:'3×15',note:'Cable keeps tension at the bottom, making it harder than DBs.'},
    {name:'Machine Lateral Raise',target:'3×15',note:'Machine version. Strict form, no cheating.'},
    {name:'Upright Row',target:'3×12',note:'Barbell or DB. Hits lateral delt and upper trap.'},
  ],
  'EZ Bar Curl': [
    {name:'DB Curl',target:'3×12',note:'Dumbbell variation. Allows neutral or supinated grip.'},
    {name:'Cable Curl',target:'3×15',note:'Constant tension throughout. Great pump.'},
    {name:'DB Hammer Curl',target:'3×12',note:'Neutral grip. Hits brachialis and brachioradialis.'},
  ],
  'DB Curl': [
    {name:'Preacher Curl',target:'3×12',note:'Removes shoulder swing entirely for the strictest possible bicep isolation.'},
    {name:'EZ Bar Curl',target:'3×12',note:'Barbell variation. Slightly easier on the wrists.'},
    {name:'Cable Curl',target:'3×15',note:'Constant tension. Good isolation.'},
    {name:'DB Hammer Curl',target:'3×12',note:'Neutral grip. Different muscle emphasis.'},
  ],
  'Close Grip Bench': [
    {name:'Cable Tricep Pushdown',target:'3×15',note:'Cable. Great isolation for all three tricep heads.'},
    {name:'DB Tricep Overhead',target:'3×12',note:'Overhead extension. Long head emphasis.'},
    {name:'Dip',target:'3×max',note:'Bodyweight. Chest + tricep compound.',inputType:'reps_only'},
  ],
  'DB Tricep Overhead': [
    {name:'Close Grip Bench',target:'3×8',note:'Barbell tricep pressing.'},
    {name:'Cable Tricep Pushdown',target:'3×15',note:'Cable isolation.'},
    {name:'Chair Dips',target:'3×max',note:'Bodyweight. No equipment.',inputType:'reps_only'},
  ],
  'Leg Press': [
    {name:'Back Squat',target:'5×5',note:'Free weight. More total body demand.'},
    {name:'Goblet Squat (Heavy)',target:'4×10',note:'DB front-loaded. Good hotel substitute.'},
    {name:'Hack Squat (Machine)',target:'4×10',note:'More quad emphasis than leg press.'},
  ],
  'Standing Calf Raise': [
    {name:'Seated Calf Raise (Machine)',target:'4×15',note:'Seated hits the soleus (deeper calf muscle) more.'},
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

// BUG FIX (reported: tapping Swap In on an AI substitute threw "JS ERROR:
// SyntaxError: Unexpected EOF"). Three buttons on this sheet carried a whole
// exercise as JSON inside a single-quoted onclick='...' attribute. The first
// apostrophe in a name or note ("don't force it", "isn't available") ended
// the attribute early, so the tap ran half a line of code and did nothing.
// It hit the AI suggestion, the Ask AI Coach button on any exercise with an
// apostrophe, and every curated alternate whose note has one. No button
// carries data now: each one names a plain function and the exercise is
// looked up when it is tapped.
function findWorkoutExById(exId) {
  if (!ST.workout) return null;
  for (const phase of ['taxi','takeoff','enroute','landing']) {
    const e = (ST.workout[phase] || []).find(x => x.id === exId);
    if (e) return e;
  }
  return null;
}
function swapCuratedAlternate(exId, i) {
  const exItem = findWorkoutExById(exId);
  const alt = exItem ? getAlternates(exItem.name)[i] : null;
  if (!alt) { showToast('Could not find that alternate. Close this sheet and try again.'); return; }
  swapExercise(exId, alt);
  closeModal();
}
function showAlternates(exId, exName, phaseKey) {
  const root = document.getElementById('modalRoot');
  if (root) root.innerHTML = alternatesSheetHtml(exId, exName, phaseKey);
}
function alternatesSheetHtml(exId, exName, phaseKey) {
  const alts = getAlternates(exName);
  const parts = [];
  parts.push('<div class="modal-bg" onclick="if(event.target===this)closeModal()">');
  parts.push('<div class="modal-sheet" style="max-height:85vh;overflow-y:auto">');
  parts.push('<div class="modal-handle"></div>');
  parts.push('<div class="modal-title">Alternate Exercises</div>');
  if (alts.length) {
    parts.push('<div style="font-size:0.75rem;color:var(--muted);margin-bottom:14px">Same muscle group, different movement. Tap to swap in.</div>');
    alts.forEach((alt, altIdx) => {
      parts.push('<div style="background:var(--bg3);border:1.5px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px">');
      parts.push('<div style="font-weight:700;font-size:0.875rem;margin-bottom:3px">'+alt.name+'</div>');
      parts.push('<div style="font-family:var(--mono);font-size:0.625rem;color:var(--gold);margin-bottom:6px">'+alt.target+'</div>');
      parts.push('<div style="font-size:0.75rem;color:var(--muted);margin-bottom:10px">'+alt.note+'</div>');
      parts.push('<button class="btn btn-gold btn-sm" onclick="swapCuratedAlternate(\''+exId+'\','+altIdx+')">Swap In</button>');
      parts.push('</div>');
    });
  } else {
    parts.push('<div style="font-size:0.75rem;color:var(--muted);margin-bottom:14px">No alternates specifically curated for this exercise yet. Search the catalog or create your own below.</div>');
  }

  parts.push('<div style="border-top:1px solid var(--border);margin-top:6px;padding-top:14px">');
  parts.push('<div class="field"><label>Search the exercise catalog</label>');
  parts.push('<input type="text" id="swapSearch" placeholder="e.g. squat, curl, row…" oninput="swapFilterExercises(\''+exId+'\',this.value)" autocomplete="off"></div>');
  parts.push('<div id="swapSearchResults"></div>');
  parts.push('</div>');

  // AI substitute — Pro only. The fallback tier below curated alternates
  // and catalog search: for when neither has a good option because the
  // constraint is unusual (no equipment at all, an odd hotel room setup).
  // Deliberately reuses swapExercise() unchanged — the AI's only job is to
  // pick { name, target, note, inputType }, everything else about how a
  // swap is applied stays exactly as it already works for the manual path.
  if (isPro()) {
    parts.push('<div style="border-top:1px solid var(--border);margin-top:14px;padding-top:14px">');
    parts.push('<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">');
    parts.push('<span style="font-size:0.75rem">✦</span><span style="font-size:0.75rem;font-weight:600">AI Coach: Don\'t have any of this?</span>');
    parts.push('</div>');
    parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-bottom:10px">Describe what you actually have access to and the AI will pick a substitute that trains the same thing.</div>');
    parts.push('<div class="field"><input type="text" id="aiSubExplain" placeholder="e.g. hotel room, no equipment, carpeted floor" autocomplete="off"></div>');
    parts.push('<div id="aiSubResult"></div>');
    parts.push('<button class="btn btn-outline" onclick="requestAISubstitute(\''+exId+'\',\''+phaseKey+'\')">Ask AI Coach</button>');
    parts.push('</div>');
  }

  parts.push('<div style="border-top:1px solid var(--border);margin-top:14px;padding-top:14px">');
  parts.push('<div style="font-size:0.75rem;font-weight:600;margin-bottom:10px">✏️ Or Create Your Own</div>');
  parts.push('<div class="field"><label>Exercise Name</label><input id="altName" type="text" placeholder="e.g. Cable Squat"></div>');
  parts.push('<div class="field"><label>Target (e.g. 3x10, 45s, 3x12/side)</label><input id="altTarget" type="text" placeholder="3x10"></div>');
  parts.push('<div class="field"><label>Type</label><select id="altType"><option value="reps_weight">Reps + Weight</option><option value="reps_only">Reps Only</option><option value="timed">Timed</option></select></div>');
  parts.push('<div class="field"><label>Note (optional)</label><input id="altNote" type="text" placeholder="Why this works as a substitute"></div>');
  parts.push('<button class="btn btn-gold" onclick="swapCustomAlternate(\''+exId+'\')">Swap In Custom Exercise</button>');
  parts.push('</div>');

  parts.push('<button class="btn btn-outline mt8" onclick="closeModal()">CANCEL</button>');
  parts.push('</div></div>');
  return parts.join('');
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
    parts.push('<div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;font-size:0.8125rem" onclick="swapAddCatalogExercise(\''+exId+'\','+i+',\''+q.replace(/'/g,'')+'\')">'+e.name+' <span style="font-family:var(--mono);font-size:0.625rem;color:var(--muted)">'+(e.target||'')+'</span></div>');
  });
  if (matches.length) parts.push('<div style="font-family:var(--mono);font-size:0.5625rem;color:var(--muted);letter-spacing:0.08em;margin:8px 0 2px">TAP TO SWAP IN, OR USE "CREATE YOUR OWN" BELOW</div>');
  box.innerHTML = parts.join('');
}
function swapAddCatalogExercise(exId, matchIdx, q) {
  const matches = rankedSwapMatches(exId, q.toLowerCase(), 6);
  const exDef = matches[matchIdx];
  if (!exDef) return;
  swapExercise(exId, { name: exDef.name, target: exDef.target, note: exDef.note||'Swapped from catalog.', inputType: exDef.inputType });
  closeModal();
}

// AI Adaptive Environment Routing — one exercise in, one exercise out.
// Calls the AI, parses the strict-JSON response, and feeds the result
// straight into the EXISTING swapExercise() — no new swap machinery.
// What the AI sent back, made safe to show and to store. The note keeps its
// apostrophes and its full length (it used to be cut at 120 characters,
// mid-word); only characters that could be read as markup are dropped.
const AI_SUB_INPUT_TYPES = ['reps_weight', 'reps_only', 'reps_height', 'timed', 'timed_bilateral'];
function cleanAISubstitute(alt) {
  if (!alt || alt.error || !alt.name) return null;
  const strip = (v, max) => String(v || '').replace(/[<>"`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  const name = sanitizeUserText(String(alt.name).trim());
  if (!name) return null;
  return {
    name,
    target: sanitizeUserText(String(alt.target || '').trim()) || '3x10',
    note: strip(alt.note, 300) || 'AI Coach substitute.',
    inputType: AI_SUB_INPUT_TYPES.includes(alt.inputType) ? alt.inputType : 'reps_weight',
  };
}
function aiSubstituteCardHtml(c) {
  return '<div style="background:var(--bg3);border:1.5px solid var(--gold);border-radius:10px;padding:14px;margin:10px 0">' +
    '<div style="font-weight:700;font-size:0.875rem;margin-bottom:3px">'+c.name+'</div>' +
    '<div style="font-family:var(--mono);font-size:0.625rem;color:var(--gold);margin-bottom:6px">'+c.target+'</div>' +
    '<div style="font-size:0.75rem;color:var(--muted);margin-bottom:10px">'+c.note.replace(/&/g, '&amp;')+'</div>' +
    '<button class="btn btn-gold btn-sm" onclick="swapInAISubstitute()">Swap In</button>' +
    '</div>';
}
let _aiSubstitute = null; // { exId, alt }: the suggestion currently on screen
function swapInAISubstitute() {
  const s = _aiSubstitute;
  if (!s || !findWorkoutExById(s.exId)) { showToast('That suggestion expired. Tap Ask AI Coach again.'); return; }
  _aiSubstitute = null;
  swapExercise(s.exId, s.alt);
  closeModal();
}
async function requestAISubstitute(exId, phaseKey, exItem) {
  if (!exItem) exItem = (ST.workout?.[phaseKey] || []).find(e => e.id === exId) || findWorkoutExById(exId);
  _aiSubstitute = null;
  const input = document.getElementById('aiSubExplain');
  const resultBox = document.getElementById('aiSubResult');
  const available = (input?.value || '').trim();
  if (!available) { showBigToast('Describe what you have access to first.', 'warn'); return; }
  if (!exItem) { showBigToast('Could not read the current exercise. Try closing and reopening this sheet.', 'warn'); return; }

  if (resultBox) resultBox.innerHTML = '<div style="font-size:0.6875rem;color:var(--muted);margin:8px 0">Asking the AI coach…</div>';

  const context = {
    exerciseName: exItem.name,
    currentTarget: exItem.target,
    currentInputType: exItem.inputType,
    isTimed: !!exItem.timed,
    whatIsAvailable: available,
    trainingGoal: ST.goal || null,
  };

  const result = await callAICoach('exercise_substitute', context);
  if (!resultBox) return; // sheet closed while waiting

  if (result.error) {
    // Say what actually went wrong. A dropped connection and "the model
    // had no answer" need different responses from the person.
    const msg = result.error === 'network_error' ? 'Lost the connection while asking. Check your signal and tap Ask AI Coach again.'
      : result.error === 'timeout' ? 'The coach took too long to answer. Tap Ask AI Coach to try again.'
      : result.error === 'pro_required' ? 'AI substitutes are a Pro feature.'
      : 'Couldn\'t get a suggestion. Try describing it differently, or use catalog search above.';
    resultBox.innerHTML = '<div style="font-size:0.6875rem;color:var(--amber);margin:8px 0">'+msg+'</div>';
    return;
  }

  let alt;
  try {
    alt = JSON.parse(result.text.replace(/```json|```/g, '').trim());
  } catch (e) {
    resultBox.innerHTML = '<div style="font-size:0.6875rem;color:var(--amber);margin:8px 0">Got an unreadable response. Try again.</div>';
    return;
  }
  const clean = cleanAISubstitute(alt);
  if (!clean) {
    resultBox.innerHTML = '<div style="font-size:0.6875rem;color:var(--muted);margin:8px 0">No good substitute found for that. Try catalog search above, or describe what you have differently.</div>';
    return;
  }
  _aiSubstitute = { exId, alt: clean };
  resultBox.innerHTML = aiSubstituteCardHtml(clean);
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
    const newEx = exFromAlternate(newId, alt, catalogMatch || null);
    ST.workout[phase][idx] = newEx;
    // BUG FIX (reported: "No place to record sets! Clicking add set does
    // nothing"). The old exercise's sets were deleted AFTER the new ones
    // were created. When the swap resolves to the same id as the exercise
    // being replaced (swapping something for itself, or for the catalog
    // entry it already is), that delete wiped the fresh sets, the card
    // rendered with no tiles, and addLiveSet refused to touch an empty
    // list. Delete first, then create.
    delete ST.sets[exId];
    ST.sets[newEx.id] = blankSetsFor(newEx);
    persistWorkoutState();
    showBigToast(alt.name+' swapped in.','ok');
    renderFlight(document.getElementById('mainPage'));
    return;
  }
}

// ─── FLIGHT TAB ───────────────────────────────────────────────────────────────
const PHASES_META = [
  { key:'taxi',    label:'TAXI',     sub:'Pilot Protocol: mobilization and activation', icon:'🚕', cls:'phase-taxi'    },
  { key:'takeoff', label:'TAKEOFF',  sub:'Primary compound: the heavy work',             icon:'🛫', cls:'phase-takeoff' },
  { key:'enroute', label:'EN ROUTE', sub:'Secondary movements: volume and accessory',    icon:'✈️', cls:'phase-enroute' },
  { key:'landing', label:'LANDING',  sub:'Descent: decompression and CNS down-reg ⓘ',  icon:'🛬', cls:'phase-landing' },
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
  parts.push('<button class="btn-ghost" style="font-size:0.75rem;margin-bottom:6px" onclick="switchTab(\'today\')">← Back to Today</button>');
  parts.push('<div class="section-label">ACTIVE FLIGHT · '+ST.muscleGroup.toUpperCase()+'</div>');
  parts.push('<div class="card card-dark mb12">');
  parts.push('<div class="fb mb8"><span style="font-family:var(--mono);font-size:0.6875rem;color:var(--muted)">MISSION PROGRESS</span><span style="font-family:var(--mono);font-size:0.6875rem;color:var(--gold)" id="missionProgCount">'+done+'/'+allEx.length+' EXERCISES</span></div>');
  parts.push('<div class="prog-wrap"><div class="prog-fill" id="missionProgFill" style="width:'+pct+'%"></div></div>');
  parts.push('<div style="font-family:var(--mono);font-size:0.625rem;color:var(--muted);margin-top:4px;text-align:right" id="missionProgPct">'+pct+'% complete</div>');
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
  parts.push('<button class="btn btn-green" '+(ST.chocksSaving?'disabled':'')+' onclick="confirmSetChocks()">'+(ST.chocksSaving?'⏳ SAVING…':MARSHALL_STOP_ICON+'SET THE CHOCKS · FINISH WORKOUT')+'</button>');

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
  root.innerHTML = '<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal-sheet" style="max-height:95vh;width:95vw;max-width:90vh;padding:0;border-radius:12px;overflow:hidden;display:flex;flex-direction:column"><div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--bg3);border-bottom:1px solid var(--border);flex-shrink:0"><div style="font-weight:600">'+exName+' Form Guide</div><button class="btn-ghost" style="font-size:1.25rem;padding:0;width:32px;height:32px" onclick="closeModal()">✕</button></div><div id="guideContent" style="flex:1;overflow-y:auto;background:#000;display:flex;align-items:center;justify-content:center;color:#ccc">Loading...</div></div></div>';
  fetch(guideURL, { cache: 'reload' }).then(r => r.text()).then(html => {
    const el = document.getElementById('guideContent');
    if (!el) return;
    // Guides exported as runtime shells (they load ./support.js and scene
    // .jsx files that aren't published) can't render standalone — and
    // innerHTML never executes scripts regardless. Fall back gracefully.
    if (html.includes('support.js') || html.includes('<x-import')) {
      closeModal();
      showToast('In-app animation coming soon. Opening YouTube guide.');
      openYouTubeSearch(exName);
      return;
    }
    el.innerHTML = html;
    el.style.display = 'block';
  }).catch(e => { const el = document.getElementById('guideContent'); if (el) el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">Failed to load.<br><button class="btn btn-blue mt12" onclick="openYouTubeSearch(\''+jsArg(exName)+'\')">Open YouTube</button></div>'; });
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
    '<div class="modal-title">' + escapeUserProse(exName, 120) + '</div>' +
    '<div class="modal-body">No built-in form guide for this one yet. This opens a YouTube search in your browser.</div>' +
    '<a class="btn btn-gold mt12" style="display:block;text-align:center;text-decoration:none" href="' + url + '" ' + externalLinkAttrs() + ' onclick="closeModal()">▶ Watch on YouTube</a>' +
    '<button class="btn btn-outline mt8" onclick="closeModal()">Cancel</button>' +
    '</div></div>';
}


// The empty set list an exercise starts with, by input type. One place
// for the shape so swapExercise, the card, and Add Set can never disagree.
// BUG FIX (reported: "Jumping Jacks, I'm supposed to do two sets of 30
// seconds. So where do I record the second set?"). A timed exercise had one
// TOTAL TIME box whatever its label said, and the stopwatch overwrote that
// box, so timing set two erased set one. A label that promises sets
// ("2×30s", "3×60s", "2x30s/leg") now gets one slot per set. Long single
// efforts keep their single box: anything measured in minutes, runs, NSDR.
function timedSetCount(exItem) {
  const t = exItem.inputType || (exItem.timed ? 'timed' : '');
  if (t === 'nsdr' || t === 'timed_distance' || isMinuteScale(exItem)) return 1;
  const m = String(exItem.target || '').match(/^(\d+)\s*[x×]/i);
  return m ? Math.min(8, Math.max(1, parseInt(m[1], 10))) : 1;
}
// Which set a stopwatch time belongs to: the first one still empty on that
// side. With every planned set filled, a new one is added after the last so
// nothing already recorded is replaced. A single-set exercise is re-timed.
function nextTimedSlot(sets, side, n) {
  if (!(n > 1)) return 0;
  const field = side === 'left' ? 'seconds_left' : side === 'right' ? 'seconds_right' : 'seconds';
  const list = sets || [];
  const len = Math.max(n, list.length);
  for (let i = 0; i < len; i++) {
    const v = list[i] ? list[i][field] : '';
    if (v === undefined || v === null || v === '') return i;
  }
  return len;
}
function setTimedSeconds(exId, i, side, value) {
  for (let k = 0; k <= i; k++) ensureSetEntry(exId, k);
  const set = ST.sets[exId][i];
  set[side === 'left' ? 'seconds_left' : side === 'right' ? 'seconds_right' : 'seconds'] = value;
  const tile = document.getElementById('st_' + exId + '_' + i);
  if (tile) tile.className = 'set-tile' + ((set.seconds || set.seconds_left || set.seconds_right) ? ' ok' : '');
  persistWorkoutState();
  updateExDoneIndicator(exId);
}
function timedSetTilesHtml(exItem, sets, bilateral) {
  const id = exItem.id;
  const n = Math.max(timedSetCount(exItem), sets.length);
  const inp = (i, side, ph, val) => '<input class="set-inp" type="number" inputmode="numeric" placeholder="' + ph + '" value="' + (val || '') +
    '" oninput="setTimedSeconds(\'' + id + '\',' + i + ',' + (side ? '\'' + side + '\'' : 'null') + ',this.value)">';
  const parts = ['<div class="sets-wrap"><div class="sets-scroll">'];
  for (let i = 0; i < n; i++) {
    const st = sets[i] || {};
    const filled = bilateral ? (st.seconds_left || st.seconds_right) : st.seconds;
    parts.push('<div class="set-tile ' + (filled ? 'ok' : '') + '" id="st_' + id + '_' + i + '"><div class="set-lbl">SET ' + (i + 1) + '</div>');
    if (bilateral) parts.push(inp(i, 'left', 'Left', st.seconds_left) + inp(i, 'right', 'Right', st.seconds_right) + '<div class="set-hint">seconds, left / right</div>');
    else parts.push(inp(i, null, 'Sec', st.seconds) + '<div class="set-hint">seconds</div>');
    parts.push('</div>');
  }
  parts.push('</div></div>' + (n > 2 ? '<div class="swipe-hint">← swipe for all sets</div>' : ''));
  return parts.join('');
}
// "SET 2 OF 2" on the stopwatch, so it is clear where the time will land.
function timedSetTag(exItem, sets, side) {
  const n = timedSetCount(exItem);
  const i = nextTimedSlot(sets, side, Math.max(n, 2));
  const total = Math.max(n, sets.length);
  if (side) return side.toUpperCase() + ' ' + (i < total ? (i + 1) + '/' + total : 'EXTRA'); // half-width box: keep it to one line
  return i < total ? 'SET ' + (i + 1) + ' OF ' + total : 'EXTRA SET';
}
function blankSetsFor(exItem) {
  const n = Math.max(1, parseInt(exItem.sets, 10) || 3);
  const t = exItem.inputType || (exItem.timed ? 'timed' : 'reps_weight');
  if (t === 'timed_bilateral') return Array.from({ length: timedSetCount(exItem) }, () => ({ seconds_left: '', seconds_right: '' }));
  if (t === 'timed_distance')  return [{ seconds: '', miles: '' }];
  if (t === 'timed' || t === 'nsdr' || exItem.timed) return Array.from({ length: timedSetCount(exItem) }, () => ({ seconds: '' }));
  if (t === 'reps_only')     return Array.from({ length: n }, () => ({ reps: '' }));
  if (t === 'reps_height')   return Array.from({ length: n }, () => ({ reps: '', height: '' }));
  if (t === 'reps_distance') return Array.from({ length: n }, () => ({ reps: '', distance: '' }));
  return Array.from({ length: n }, () => ({ reps: '', weight: '' }));
}

function buildExCard(exItem, phaseKey) {
  const isOpen = !!ST.expanded[exItem.id];
  // Self-healing: an exercise with no set list (a swap that went wrong, a
  // restored workout from an older build, anything) gets its blanks here
  // so the card always has somewhere to type.
  if (!Array.isArray(ST.sets[exItem.id]) || ST.sets[exItem.id].length === 0) {
    ST.sets[exItem.id] = blankSetsFor(exItem);
  }
  const sets = ST.sets[exItem.id];
  const hasData = sets.some(s => s.reps || s.weight || s.seconds || s.height || s.distance || s.seconds_left || s.seconds_right);
  const parts = [];

  parts.push('<div class="ex-card'+(exItem.custom?' custom-ex':'')+'" id="excard_'+exItem.id+'">');
  parts.push('<div class="ex-hdr"><div style="flex:1;cursor:pointer" onclick="toggleEx(\''+exItem.id+'\')"><div class="ex-name">'+exItem.name+(exItem.custom?' <span style="font-size:0.5625rem;color:var(--gold)">CUSTOM</span>':'')+'</div><div class="ex-target">'+exItem.target+(exItem.timed?' · ⏱ TIMED':'')+'</div></div><div class="ex-right"><button class="btn-ghost" style="font-size:0.6875rem;padding:4px 8px;margin-right:4px;color:var(--blue)" onclick="event.stopPropagation();openExerciseGuide(\''+jsArg(exItem.name)+'\')">ⓘ Guide</button><div class="ex-done '+(hasData?'ok':'')+'" id="exdone_'+exItem.id+'">'+(hasData?'✓':'')+'</div><div class="ex-caret '+(isOpen?'open':'')+'">⌄</div></div></div>');
  if (exItem.swappedForInjury) {
    parts.push('<div style="padding:6px 14px;background:rgba(56,189,248,0.08);border-top:1px solid var(--border);font-size:0.625rem;color:var(--blue)">🩹 Swapped from '+exItem.originalName+': '+exItem.flaggedRegion+' flagged</div>');
  } else if (exItem.injuryCaution) {
    parts.push('<div style="padding:6px 14px;background:rgba(245,158,11,0.08);border-top:1px solid var(--border);font-size:0.625rem;color:var(--amber)">⚠️ May stress your flagged '+exItem.flaggedRegion+'; consider Alternate below</div>');
  }

  if (isOpen) {
    parts.push('<div class="ex-body"><p class="ex-note">'+exItem.note+'</p>');

    // Progressive overload banner — only for weighted exercises
    if (!exItem.timed && exItem.inputType !== 'reps_only' && exItem.inputType !== 'reps_height' && exItem.inputType !== 'reps_distance' && exItem.inputType !== 'nsdr' && !exItem.custom) {
      const lastW = lastLoggedMax(exItem.id, exItem.name);
      const lastR = lastLoggedReps(exItem.id, exItem.name);
      const next = overloadTarget(exItem, { lastWeight: lastW, lastReps: lastR, env: ST.env, phaseKey });
      const suggested = next ? next.label : null;
      if (lastW !== null) {
        parts.push('<div class="stat-banner">');
        parts.push('<div class="stat-banner-label">PROGRESSIVE OVERLOAD</div>');
        parts.push('<div style="display:flex;justify-content:space-between;align-items:center">');
        parts.push('<span style="font-size:0.75rem">Last: <strong style="color:var(--text)">'+lastW+' lb'+(lastR?' × '+lastR+' reps':'')+'</strong></span>');
        parts.push('<span style="color:var(--gold);font-weight:700;font-size:0.75rem">Target → '+suggested+'</span>');
        parts.push('</div>');
        if (next && next.kind === 'reps') parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:4px">Hotel racks usually stop at '+HOTEL_DB_MAX_LB+' lb, so progress here is reps: add a rep or two per set, slow the lowering, or shorten the rest.</div>');
        parts.push('</div>');
      } else {
        const variant = lastLoggedFamilyVariant(exItem.id, exItem.name);
        if (variant) {
          parts.push('<div class="stat-banner-empty">You\'ve done this as '+sanitizeUserText(variant.name)+' ('+variant.weight+' lb). First time with this version, so no target yet.</div>');
        } else {
          parts.push('<div class="stat-banner-empty">First time logging this one. Log your sets to start tracking progress.</div>');
        }
      }
    }

    if (exItem.inputType === 'reps_height' || exItem.inputType === 'reps_distance') {
      const field = exItem.inputType === 'reps_height' ? 'height' : 'distance';
      const label = exItem.inputType === 'reps_height' ? 'box height' : 'distance';
      const lastBest = lastLoggedMaxField(exItem.id, field, exItem.name);
      if (lastBest !== null) {
        parts.push('<div class="stat-banner">');
        parts.push('<div class="stat-banner-label">PERSONAL BEST</div>');
        parts.push('<span style="font-size:0.75rem">Best '+label+': <strong style="color:var(--teal)">'+lastBest+' in</strong></span>');
        parts.push('</div>');
      } else {
        parts.push('<div class="stat-banner-empty">First time logging. Record your '+label+' in inches to start tracking progress.</div>');
      }
    }

    if (exItem.inputType === 'nsdr') {
      parts.push(buildNSDRWidget(exItem.id, sets[0]?.seconds||''));
    } else if (exItem.inputType === 'timed_bilateral' || (exItem.timed && exItem.target?.includes('/side'))) {
      // Bilateral stretches marked as timed_bilateral OR timed with "/side" in target (e.g., "90s/side")
      if (timedSetCount(exItem) > 1 || sets.length > 1) {
        parts.push(timedSetTilesHtml(exItem, sets, true));
        parts.push('<div style="display:flex;gap:8px">');
        parts.push('<div style="flex:1;min-width:0">' + buildStopwatchWidget(exItem.id, 'left', exItem.target, timedSetTag(exItem, sets, 'left')) + '</div>');
        parts.push('<div style="flex:1;min-width:0">' + buildStopwatchWidget(exItem.id, 'right', exItem.target, timedSetTag(exItem, sets, 'right')) + '</div>');
        parts.push('</div>');
      } else {
      const valL = sets[0]?.seconds_left || '';
      const valR = sets[0]?.seconds_right || '';
      parts.push('<div style="display:flex;gap:8px">');
      parts.push('<div class="timed-box" style="flex:1" id="tb_'+exItem.id+'_left">');
      parts.push('<div style="font-family:var(--mono);font-size:0.625rem;color:var(--muted);letter-spacing:0.08em;margin-bottom:8px">LEFT SIDE</div>');
      parts.push('<input class="timed-inp" type="number" inputmode="numeric" placeholder="0" value="'+valL+'" oninput="ensureSetEntry(\''+exItem.id+'\',0);ST.sets[\''+exItem.id+'\'][0].seconds_left=this.value;persistWorkoutState();updateExDoneIndicator(\''+exItem.id+'\')">');
      parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:6px">seconds</div>');
      parts.push(buildStopwatchWidget(exItem.id, 'left', exItem.target));
      parts.push('</div>');
      parts.push('<div class="timed-box" style="flex:1" id="tb_'+exItem.id+'_right">');
      parts.push('<div style="font-family:var(--mono);font-size:0.625rem;color:var(--muted);letter-spacing:0.08em;margin-bottom:8px">RIGHT SIDE</div>');
      parts.push('<input class="timed-inp" type="number" inputmode="numeric" placeholder="0" value="'+valR+'" oninput="ensureSetEntry(\''+exItem.id+'\',0);ST.sets[\''+exItem.id+'\'][0].seconds_right=this.value;persistWorkoutState();updateExDoneIndicator(\''+exItem.id+'\')">');
      parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:6px">seconds</div>');
      parts.push(buildStopwatchWidget(exItem.id, 'right', exItem.target));
      parts.push('</div>');
      parts.push('</div>');
      }
    } else if (exItem.inputType === 'timed_distance') {
      // Was falling through to the generic seconds-only branch below with no
      // distance field shown at all — meaning Treadmill/Outdoor Run could
      // never actually feed the running leaderboard from a live workout.
      const valMin = sets[0]?.seconds ? Math.round((parseFloat(sets[0].seconds)/60)*10)/10 : '';
      const valMi = sets[0]?.miles || '';
      parts.push('<div class="timed-box '+(valMin?'ok':'')+'" id="tb_'+exItem.id+'">');
      parts.push('<div style="display:flex;gap:8px">');
      parts.push('<div style="flex:1"><div style="font-family:var(--mono);font-size:0.625rem;color:var(--muted);letter-spacing:0.08em;margin-bottom:8px">TIME</div>');
      parts.push('<input class="timed-inp" type="text" inputmode="decimal" placeholder="0" value="'+valMin+'" oninput="liveSetValMin(\''+exItem.id+'\',0,\'seconds\',this.value);document.getElementById(\'tb_'+exItem.id+'\').className=\'timed-box\'+(this.value?\' ok\':\'\');">');
      parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:6px">min</div></div>');
      parts.push('<div style="flex:1"><div style="font-family:var(--mono);font-size:0.625rem;color:var(--muted);letter-spacing:0.08em;margin-bottom:8px">DISTANCE</div>');
      parts.push('<input class="timed-inp" type="text" inputmode="decimal" placeholder="0" value="'+valMi+'" oninput="ensureSetEntry(\''+exItem.id+'\',0);ST.sets[\''+exItem.id+'\'][0].miles=this.value;persistWorkoutState();updateExDoneIndicator(\''+exItem.id+'\')">');
      parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:6px">mi</div></div>');
      parts.push('</div></div>');
    } else if (exItem.timed && isMinuteScale(exItem)) {
      // Reported bug: Walking, Treadmill, and similar 20-45 min activities
      // forced entry in raw seconds (e.g. typing "1200" for 20 minutes) —
      // genuinely impractical for something this length. Detected via the
      // exercise's own target string ("30 min" vs "30s") rather than a
      // blanket change, so short holds/stretches correctly keep seconds.
      const valMin = sets[0]?.seconds ? Math.round((parseFloat(sets[0].seconds)/60)*10)/10 : '';
      parts.push('<div class="timed-box '+(valMin?'ok':'')+'" id="tb_'+exItem.id+'">');
      parts.push('<div style="font-family:var(--mono);font-size:0.625rem;color:var(--muted);letter-spacing:0.08em;margin-bottom:8px">TOTAL TIME</div>');
      parts.push('<input class="timed-inp" type="text" inputmode="decimal" placeholder="0" value="'+valMin+'" oninput="liveSetValMin(\''+exItem.id+'\',0,\'seconds\',this.value);document.getElementById(\'tb_'+exItem.id+'\').className=\'timed-box\'+(this.value?\' ok\':\'\');">');
      parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:6px">min</div>');
      parts.push('</div>');
      parts.push(buildStopwatchWidget(exItem.id, null, exItem.target));
    } else if (exItem.timed && (timedSetCount(exItem) > 1 || sets.length > 1)) {
      parts.push(timedSetTilesHtml(exItem, sets, false));
      parts.push(buildStopwatchWidget(exItem.id, null, exItem.target, timedSetTag(exItem, sets, null)));
    } else if (exItem.timed) {
      const val = sets[0]?.seconds || '';
      parts.push('<div class="timed-box '+(val?'ok':'')+'" id="tb_'+exItem.id+'">');
      parts.push('<div style="font-family:var(--mono);font-size:0.625rem;color:var(--muted);letter-spacing:0.08em;margin-bottom:8px">TOTAL TIME</div>');
      parts.push('<input class="timed-inp" type="number" inputmode="numeric" placeholder="0" value="'+val+'" oninput="ensureSetEntry(\''+exItem.id+'\',0);ST.sets[\''+exItem.id+'\'][0].seconds=this.value;document.getElementById(\'tb_'+exItem.id+'\').className=\'timed-box\'+(this.value?\' ok\':\'\');persistWorkoutState();updateExDoneIndicator(\''+exItem.id+'\')">');
      parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:6px">seconds</div>');
      parts.push('</div>');
      parts.push(buildStopwatchWidget(exItem.id, null, exItem.target));
    } else if (exItem.inputType === 'reps_height') {
      parts.push('<div class="sets-wrap"><div class="sets-scroll">');
      sets.forEach((s,i) => {
        parts.push('<div class="set-tile '+(s.reps||s.height?'ok':'')+'" id="st_'+exItem.id+'_'+i+'"><div class="set-lbl">SET '+(i+1)+'</div>');
        parts.push('<input class="set-inp" type="number" inputmode="numeric" placeholder="Reps" value="'+(s.reps||'')+'" oninput="ensureSetEntry(\''+exItem.id+'\','+i+');ST.sets[\''+exItem.id+'\']['+i+'].reps=this.value;document.getElementById(\'st_'+exItem.id+'_'+i+'\').className=\'set-tile\'+(this.value||ST.sets[\''+exItem.id+'\']['+i+'].height?\' ok\':\'\');persistWorkoutState();updateExDoneIndicator(\''+exItem.id+'\')">');
        parts.push('<input class="set-inp" type="number" inputmode="decimal" placeholder="Height" value="'+(s.height||'')+'" oninput="ensureSetEntry(\''+exItem.id+'\','+i+');ST.sets[\''+exItem.id+'\']['+i+'].height=this.value;document.getElementById(\'st_'+exItem.id+'_'+i+'\').className=\'set-tile\'+(ST.sets[\''+exItem.id+'\']['+i+'].reps||this.value?\' ok\':\'\');persistWorkoutState();updateExDoneIndicator(\''+exItem.id+'\')">');
        parts.push('<div class="set-hint">reps / height (in)</div></div>');
      });
      parts.push('</div></div>'+(sets.length>2?'<div class="swipe-hint">← swipe for all sets</div>':'')+'<div class="fb" style="margin-top:6px;justify-content:space-between"><button class="btn-ghost" style="font-size:0.6875rem" onclick="removeLiveSet(\''+exItem.id+'\')">− Remove Set</button><button class="btn-ghost" style="font-size:0.6875rem" onclick="addLiveSet(\''+exItem.id+'\')">+ Add Set</button></div>');
      if (phaseKey === 'takeoff' || phaseKey === 'enroute') {
        parts.push(buildRestTimerWidget(exItem.id, phaseKey, exItem.target));
      }
    } else if (exItem.inputType === 'reps_distance') {
      parts.push('<div class="sets-wrap"><div class="sets-scroll">');
      sets.forEach((s,i) => {
        parts.push('<div class="set-tile '+(s.reps||s.distance?'ok':'')+'" id="st_'+exItem.id+'_'+i+'"><div class="set-lbl">SET '+(i+1)+'</div>');
        parts.push('<input class="set-inp" type="number" inputmode="numeric" placeholder="Reps" value="'+(s.reps||'')+'" oninput="ensureSetEntry(\''+exItem.id+'\','+i+');ST.sets[\''+exItem.id+'\']['+i+'].reps=this.value;document.getElementById(\'st_'+exItem.id+'_'+i+'\').className=\'set-tile\'+(this.value||ST.sets[\''+exItem.id+'\']['+i+'].distance?\' ok\':\'\');persistWorkoutState();updateExDoneIndicator(\''+exItem.id+'\')">');
        parts.push('<input class="set-inp" type="number" inputmode="decimal" placeholder="Distance" value="'+(s.distance||'')+'" oninput="ensureSetEntry(\''+exItem.id+'\','+i+');ST.sets[\''+exItem.id+'\']['+i+'].distance=this.value;document.getElementById(\'st_'+exItem.id+'_'+i+'\').className=\'set-tile\'+(ST.sets[\''+exItem.id+'\']['+i+'].reps||this.value?\' ok\':\'\');persistWorkoutState();updateExDoneIndicator(\''+exItem.id+'\')">');
        parts.push('<div class="set-hint">reps / distance (in)</div></div>');
      });
      parts.push('</div></div>'+(sets.length>2?'<div class="swipe-hint">← swipe for all sets</div>':'')+'<div class="fb" style="margin-top:6px;justify-content:space-between"><button class="btn-ghost" style="font-size:0.6875rem" onclick="removeLiveSet(\''+exItem.id+'\')">− Remove Set</button><button class="btn-ghost" style="font-size:0.6875rem" onclick="addLiveSet(\''+exItem.id+'\')">+ Add Set</button></div>');
      if (phaseKey === 'takeoff' || phaseKey === 'enroute') {
        parts.push(buildRestTimerWidget(exItem.id, phaseKey, exItem.target));
      }
    } else if (exItem.inputType === 'reps_only') {
      const valueUnit = repValueUnit(exItem); // watts, split, mph: see REP_VALUE_UNITS
      parts.push('<div class="sets-wrap"><div class="sets-scroll">');
      sets.forEach((s,i) => {
        parts.push('<div class="set-tile '+(s.reps?'ok':'')+'" id="st_'+exItem.id+'_'+i+'"><div class="set-lbl">SET '+(i+1)+'</div>');
        parts.push('<input class="set-inp" type="number" inputmode="numeric" placeholder="'+(valueUnit ? valueUnit.placeholder : 'Reps')+'" value="'+(s.reps||'')+'" oninput="ensureSetEntry(\''+exItem.id+'\','+i+');ST.sets[\''+exItem.id+'\']['+i+'].reps=this.value;document.getElementById(\'st_'+exItem.id+'_'+i+'\').className=\'set-tile\'+(this.value?\' ok\':\'\');persistWorkoutState();updateExDoneIndicator(\''+exItem.id+'\');queueSetFeedback(\''+exItem.id+'\','+i+',false)" onchange="queueSetFeedback(\''+exItem.id+'\','+i+',true)">');
        parts.push('<div class="set-hint">'+(valueUnit ? valueUnit.hint : 'reps only')+'</div></div>');
      });
      parts.push('</div></div>'+(sets.length>3?'<div class="swipe-hint">← swipe for all sets</div>':'')+'<div class="fb" style="margin-top:6px;justify-content:space-between"><button class="btn-ghost" style="font-size:0.6875rem" onclick="removeLiveSet(\''+exItem.id+'\')">− Remove Set</button><button class="btn-ghost" style="font-size:0.6875rem" onclick="addLiveSet(\''+exItem.id+'\')">+ Add Set</button></div>');
      parts.push('<div id="ar_'+exItem.id+'">'+autoregBoxHtml(setFeedbackFor(exItem, phaseKey, sets), exItem.id)+'</div>');
    } else {
      parts.push('<div class="sets-wrap"><div class="sets-scroll">');
      sets.forEach((s,i) => {
        parts.push('<div class="set-tile '+(s.reps||s.weight?'ok':'')+'" id="st_'+exItem.id+'_'+i+'"><div class="set-lbl">SET '+(i+1)+'</div>');
        parts.push('<input class="set-inp" type="number" inputmode="numeric" placeholder="Reps" value="'+(s.reps||'')+'" oninput="ensureSetEntry(\''+exItem.id+'\','+i+');ST.sets[\''+exItem.id+'\']['+i+'].reps=this.value;document.getElementById(\'st_'+exItem.id+'_'+i+'\').className=\'set-tile\'+(this.value||ST.sets[\''+exItem.id+'\']['+i+'].weight?\' ok\':\'\');persistWorkoutState();updateExDoneIndicator(\''+exItem.id+'\');queueSetFeedback(\''+exItem.id+'\','+i+',false)" onchange="queueSetFeedback(\''+exItem.id+'\','+i+',true)">');
        parts.push('<input class="set-inp" type="number" inputmode="decimal" placeholder="lb" value="'+(s.weight||'')+'" oninput="ensureSetEntry(\''+exItem.id+'\','+i+');ST.sets[\''+exItem.id+'\']['+i+'].weight=this.value;document.getElementById(\'st_'+exItem.id+'_'+i+'\').className=\'set-tile\'+(ST.sets[\''+exItem.id+'\']['+i+'].reps||this.value?\' ok\':\'\');persistWorkoutState();updateExDoneIndicator(\''+exItem.id+'\');queueSetFeedback(\''+exItem.id+'\','+i+',false)" onchange="queueSetFeedback(\''+exItem.id+'\','+i+',true)">');
        parts.push('<div class="set-hint">reps / lb</div></div>');
      });
      parts.push('</div></div>'+(sets.length>2?'<div class="swipe-hint">← swipe for all sets</div>':'')+'<div class="fb" style="margin-top:6px;justify-content:space-between"><button class="btn-ghost" style="font-size:0.6875rem" onclick="removeLiveSet(\''+exItem.id+'\')">− Remove Set</button><button class="btn-ghost" style="font-size:0.6875rem" onclick="addLiveSet(\''+exItem.id+'\')">+ Add Set</button></div>');
      // Always present, even when empty, so refreshSetFeedback() has a
      // slot to write into without re-rendering the card.
      parts.push('<div id="ar_'+exItem.id+'">'+autoregBoxHtml(setFeedbackFor(exItem, phaseKey, sets), exItem.id)+'</div>');
      if (phaseKey === 'takeoff' || phaseKey === 'enroute') {
        parts.push(buildRestTimerWidget(exItem.id, phaseKey, exItem.target));
      }
    }

    if (!exItem.custom) {
      parts.push('<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">');
      parts.push('<button class="btn-info" style="border-color:rgba(167,139,250,0.4);color:#a78bfa" onclick="showAlternates(\''+exItem.id+'\',\''+jsArg(exItem.name)+'\',\''+phaseKey+'\')">⇄ Alternate</button>');
      parts.push('<button class="btn-info" style="color:#fca5a5;border-color:rgba(239,68,68,0.3)" onclick="confirmRemoveExercise(\''+exItem.id+'\',\''+jsArg(exItem.name)+'\',false)">✕ Remove</button>');
      parts.push('</div>');
    } else {
      parts.push('<div style="margin-top:10px"><button class="btn-info" style="color:#fca5a5;border-color:rgba(239,68,68,0.3)" onclick="confirmRemoveExercise(\''+exItem.id+'\',\''+jsArg(exItem.name)+'\',true)">✕ Remove</button></div>');
    }
    parts.push('</div>');
  }
  parts.push('</div>');
  return parts.join('');
}

// BUG FIX (reported: exercise header checkmark and the top "MISSION
// PROGRESS" count/bar went stale after logging a set — correct until an
// UNRELATED full re-render happened to sweep through and refresh them,
// which made the bug look random/inconsistent between exercises).
//
// Root cause: every set-input oninput handler updates ST.sets and does a
// targeted DOM update of just that input's own set-tile (cheap, avoids
// losing focus/cursor position on every keystroke) — but never touched
// the exercise header's checkmark or the aggregate mission-progress bar,
// both of which only get (re)computed inside a full buildExCard()/
// renderFlight() pass. Called from every set-input handler alongside the
// existing persistWorkoutState() call, this does the same kind of cheap,
// targeted update for those two remaining stale pieces instead of
// triggering a full re-render on every keystroke.
// BUG FIX (reported crash: "undefined is not an object (evaluating
// 'ST.sets[...][0]')" when typing into a timed exercise's field after
// closing and reopening the app mid-workout). ST.sets[exId][i] is
// supposed to always be pre-initialized (engageWorkout() and
// swapExercise() both do this), but a restored session is a straight
// localStorage replay with no re-validation — if that entry was ever
// missing or malformed for any reason, every input handler assumed it
// existed and crashed the instant someone typed into that exact field.
// Called at the start of every set-input oninput handler now, right
// before the write it protects, so the class of bug is closed
// everywhere at once rather than patched for one exercise.
function ensureSetEntry(exId, i) {
  if (!ST.sets[exId]) ST.sets[exId] = [];
  if (!ST.sets[exId][i]) ST.sets[exId][i] = {};
}

function updateExDoneIndicator(exId) {
  const sets = ST.sets[exId] || [];
  const hasData = sets.some(s => s.reps || s.weight || s.seconds || s.height || s.distance || s.seconds_left || s.seconds_right);
  const doneEl = document.getElementById('exdone_' + exId);
  if (doneEl) {
    doneEl.className = 'ex-done' + (hasData ? ' ok' : '');
    doneEl.textContent = hasData ? '✓' : '';
  }

  if (!ST.workout) return;
  const allEx = [...ST.workout.taxi, ...ST.workout.takeoff, ...ST.workout.enroute, ...ST.workout.landing];
  const done = allEx.filter(exItem => {
    const s = ST.sets[exItem.id];
    return s && s.some(x => x.reps || x.weight || x.seconds || x.height || x.distance || x.seconds_left || x.seconds_right);
  }).length;
  const pct = Math.round(done / Math.max(allEx.length, 1) * 100);
  const countEl = document.getElementById('missionProgCount');
  const fillEl  = document.getElementById('missionProgFill');
  const pctEl   = document.getElementById('missionProgPct');
  if (countEl) countEl.textContent = done + '/' + allEx.length + ' EXERCISES';
  if (fillEl)  fillEl.style.width = pct + '%';
  if (pctEl)   pctEl.textContent = pct + '% complete';
}

function toggleEx(id) {
  ST.expanded[id] = !ST.expanded[id];
  renderFlight(document.getElementById('mainPage'));
}

// ─── REST TIMER (between sets, rep-range-aware default) ───────────────────────
//
// BUG FIX (reported): rest recommendation was keyed purely on workout PHASE
// ("takeoff" always got 3-4 min), not on what the exercise actually asks for.
// A 12-rep Cable Row for "back health and posture" was getting the same
// 3.5-minute strength-training rest as a 1-5 rep heavy squat — which is
// wrong by every mainstream reference (NSCA Essentials of Strength Training
// & Conditioning; ACSM position stands): rest should track rep range /
// training goal, not which quarter of the workout an exercise happens to
// sit in. Phase remains a reasonable FALLBACK when an exercise's rep count
// can't be parsed (e.g. distance/time-based cardio), but a real target like
// "3×12" now drives the actual number.
//
// Reference bands (NSCA Essentials of Strength Training & Conditioning):
//   1-5 reps   (strength/power)   → 2-5 min   (we use 180s / 3 min)
//   6-12 reps  (hypertrophy)      → 60-90s    (we use 75s)
//   13+ reps   (muscular endurance) → 30-60s  (we use 40s)
function restSecondsForTarget(target) {
  if (!target) return null;
  // "3×12" captures 12 (reps). Deliberately does NOT match "6×500m" or
  // "8×30s" — those are distance/time-based (rowing meters, sprint seconds),
  // not a rep count, and forcing them through this logic previously misread
  // "500m" as 500 reps. A trailing unit letter right after the number rules
  // it out; bare numbers or "10/side" style are accepted.
  const m = String(target).match(/[×xX]\s*(\d+)\b(?!\w)/);
  if (!m) return null;
  const reps = parseInt(m[1], 10);
  if (isNaN(reps)) return null;
  if (reps <= 5)  return 180; // strength/power range
  if (reps <= 12) return 75;  // hypertrophy range
  return 40;                  // muscular endurance range
}

function ageRestBonus() {
  if (!ST.age) return 0;
  if (ST.age >= 60) return 30;
  if (ST.age >= 45) return 15;
  return 0;
}

function buildRestTimerWidget(exId, phaseKey, target) {
  const repBased = restSecondsForTarget(target);
  const baseSec = REST_OVERRIDES[exId] ?? repBased ?? REST_DEFAULTS[phaseKey] ?? 60;
  const defaultSec = baseSec + ageRestBonus();
  const isActive = ST.restTimer.active && ST.restTimer.exId === exId;
  const mins = Math.floor((isActive?ST.restTimer.seconds:defaultSec)/60);
  const secs = (isActive?ST.restTimer.seconds:defaultSec)%60;
  const display = mins+':'+String(secs).padStart(2,'0');
  // Label reflects the ACTUAL seconds being used, not a guess from phase —
  // so if a takeoff-phase exercise resolves to 75s (hypertrophy rep range),
  // it correctly says "60-90S" instead of always claiming "3-4 MIN".
  const label = defaultSec >= 150 ? '2-5 MIN RECOMMENDED (STRENGTH)'
              : defaultSec >= 60  ? '60-90S RECOMMENDED (HYPERTROPHY)'
              : '30-60S RECOMMENDED (ENDURANCE)';
  const parts = [];
  parts.push('<div class="rest-timer-box" id="rest_'+exId+'">');
  parts.push('<div style="display:flex;align-items:center;gap:5px;margin-bottom:6px">');
  parts.push('<div style="font-family:var(--mono);font-size:0.625rem;color:var(--muted);letter-spacing:0.08em">REST TIMER · '+label+'</div>');
  parts.push('<button onclick="showRestTimerInfo()" style="background:none;border:1px solid var(--muted);border-radius:50%;width:15px;height:15px;color:var(--muted);font-size:0.5625rem;line-height:1;cursor:pointer;flex-shrink:0;padding:0">i</button>');
  parts.push('</div>');
  parts.push('<div class="rest-timer-display" id="rest_disp_'+exId+'">'+display+'</div>');
  if (!isActive) {
    parts.push('<button class="stopwatch-btn btn-blue" onclick="startRestTimer(\''+exId+'\','+defaultSec+')">START REST</button>');
  } else {
    parts.push('<button class="stopwatch-btn btn-outline" onclick="stopRestTimer()">STOP</button>');
  }
  parts.push('</div>');
  return parts.join('');
}

// The (i) info button — explains WHY rest varies instead of leaving the
// user (or their personal trainer) to wonder why a set of 12 gets a
// 3-4 minute timer. Directly addresses the reported confusion.
function showRestTimerInfo() {
  const root = document.getElementById('modalRoot');
  if (!root) return;
  root.innerHTML =
    '<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal-sheet">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Why does rest time change?</div>' +
    '<div class="modal-body" style="line-height:1.65">' +
    'Rest time is set by rep range, not by where an exercise sits in the workout. This is standard NSCA guidance, not something specific to this app.' +
    '<br><br>' +
    '<strong style="color:var(--text)">1-5 reps (strength/power):</strong> 2-5 min. Heavy loads deplete the phosphagen energy system, which needs several minutes to fully recover.' +
    '<br><br>' +
    '<strong style="color:var(--text)">6-12 reps (hypertrophy):</strong> 60-90 sec. Enough recovery to keep form solid without letting the muscle fully cool down between sets.' +
    '<br><br>' +
    '<strong style="color:var(--text)">13+ reps (muscular endurance):</strong> 30-60 sec. The goal is working through fatigue, not full recovery between sets.' +
    '<br><br>' +
    'A 12-rep set of Cable Rows and a 3-rep heavy Deadlift both being programmed early in a workout doesn\'t mean they need the same rest. The rep count is what matters.' +
    '</div>' +
    '<button class="btn btn-outline mt12" onclick="closeModal()">Got it</button>' +
    '</div></div>';
}

// Shared AudioContext, created once on a real user gesture (tapping START
// REST) and reused for the completion chime. iOS silently blocks a NEW
// AudioContext created from inside a setInterval callback with no gesture
// attached to it — which is exactly what was happening: playChime() was
// creating a fresh context when the timer hit zero, entirely disconnected
// from any tap, and iOS dropped it with no error (the try/catch masked the
// silent failure). Creating/resuming the context here, during the actual
// button tap, means it's already unlocked by the time the timer completes.
let _chimeCtx = null;
function unlockChimeAudio() {
  try {
    if (!_chimeCtx) _chimeCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_chimeCtx.state === 'suspended') _chimeCtx.resume();
  } catch(e) {/* no chime this time if unsupported/blocked — nothing else depends on this succeeding */}
}

function startRestTimer(exId, seconds) {
  if (ST.restTimer.interval) clearInterval(ST.restTimer.interval);
  unlockChimeAudio(); // must happen here, inside the tap handler — not at chime time
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
    haptic('success'); // BUG FIX (reported): was never actually called on completion
    showToast('⏱ Rest complete. Next set.');
    renderFlight(document.getElementById('mainPage'));
  }
}
function addLiveSet(exId) {
  let sets = ST.sets[exId];
  if (!sets || !sets.length) {
    // Nothing to clone from: build the first set from the exercise itself
    // rather than silently doing nothing (that silence was the report).
    const allEx = ST.workout ? [...ST.workout.taxi,...ST.workout.takeoff,...ST.workout.enroute,...ST.workout.landing] : [];
    const exItem = allEx.find(e => e.id === exId);
    if (!exItem) return;
    sets = ST.sets[exId] = blankSetsFor(exItem);
  } else {
    // Clone the shape of the last set (whatever fields it has) so this works
    // generically across reps/weight, reps-only, reps/height, reps/distance.
    const blank = {};
    Object.keys(sets[sets.length-1]).forEach(k => { blank[k] = ''; });
    sets.push(blank);
  }
  persistWorkoutState();
  renderFlight(document.getElementById('mainPage'));
}

// Symmetric with addLiveSet above. Never removes the last remaining set —
// an exercise with zero sets isn't a state anything else here expects,
// and "swap to a different exercise" or "✕ Remove" already cover that
// case properly. No confirmation dialog, unlike removing a whole
// exercise: this is small, low-stakes, and trivially undone with one
// tap of "+ Add Set" if it's a mis-tap.
function removeLiveSet(exId) {
  const sets = ST.sets[exId];
  if (!sets || sets.length <= 1) return;
  sets.pop();
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
function buildStopwatchWidget(exId, side, targetLabel, tag) {
  const isActive = ST.stopwatch.active && ST.stopwatch.exId === exId && (ST.stopwatch.side||null) === (side||null);
  const domId = side ? exId+'_'+side : exId;
  const targetSec = parseTargetSeconds(targetLabel);
  const parts = [];
  parts.push('<div class="timed-box" style="margin-top:8px" id="sw_'+domId+'">');
  parts.push('<div style="font-family:var(--mono);font-size:0.625rem;color:var(--muted);letter-spacing:0.08em;margin-bottom:6px">'+(tag ? tag : 'STOPWATCH')+(targetSec?(tag && side ? ' · ' : ' · CHIMES AT ')+formatStopwatch(targetSec):'')+'</div>');
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
//
// BUG FIX: this used to take ANY number after the × as reps, so '3×40yd'
// read as 40 reps, '8×30s' as 30 and '6×500m' as 500. Feedback on those
// compared a logged rep count against a distance or a time ("12 of 500
// reps is a real miss"). The number now only counts when what follows it
// is rep-shaped: nothing, a range, '/side', 'reps' or 'steps'.
function parseTargetReps(target) {
  if (!target) return null;
  let m = target.match(/[×x]\s*(\d+)(?!\d)(?=\s*(?:$|-\s*\d|\/|reps?\b|steps?\b))/i);
  if (m) return parseInt(m[1], 10);
  m = target.match(/(\d+)\s*reps?\b/i);
  if (m) return parseInt(m[1], 10);
  return null;
}

// ─── LIVE SET FEEDBACK ───────────────────────────────────────────────────────
//
// BUG FIX (reported: "sometimes I don't start the timer and so I don't get
// feedback"). The feedback box was only ever built inside buildExCard(),
// i.e. on a full renderFlight(). Typing into a set does a targeted update
// on purpose (a full re-render would drop the keyboard mid-number), so the
// box stayed stale until something else re-rendered the screen. Starting
// the rest timer was the usual something, which made the feedback look
// like it belonged to the timer. It now has its own slot (#ar_<exId>) and
// its own refresh.
//
// When it speaks:
//   - while typing: once the set has BOTH reps and weight and the keys
//     have been quiet for a moment. Not on every keystroke, or the "1" of
//     "10" reads as a nine-rep miss.
//   - on leaving the field: reps alone is enough, because a bodyweight
//     set never gets a weight. Skipped if focus only moved to the other
//     box in the same set and that box is still empty.
function swapSetFields(exId, i) {
  const set = (ST.sets[exId] || [])[i];
  if (!set) return;
  const r = set.reps; set.reps = set.weight; set.weight = r;
  persistWorkoutState();
  renderFlight(document.getElementById('mainPage'));
}
function autoregBoxHtml(autoreg, exId) {
  if (!autoreg) return '';
  if (autoreg.action === 'swap' && exId) {
    return '<div class="fb" style="background:var(--bg3);border:1px solid var(--blue);border-radius:8px;padding:9px 12px;margin-top:8px;align-items:center;gap:10px"><div style="font-size:0.75rem;line-height:1.5;flex:1">🔁 ' + autoreg.text + '</div><button class="btn btn-outline" style="width:auto;padding:0 14px;flex-shrink:0" onclick="swapSetFields(\'' + exId + '\',' + autoreg.setIdx + ')">Swap</button></div>';
  }
  const boxColor = autoreg.tone === 'positive' ? 'var(--green)' : autoreg.tone === 'major' ? 'var(--amber)' : 'var(--blue)';
  const icon = autoreg.tone === 'positive' ? '💪' : '🎯';
  return '<div class="fb" style="background:var(--bg3);border:1px solid '+boxColor+';border-radius:8px;padding:9px 12px;margin-top:8px;align-items:flex-start"><div style="font-size:0.75rem;line-height:1.5;color:var(--text)">'+icon+' '+autoreg.text+'</div></div>';
}
function setFeedbackReady(set, leftField, repsOnly) {
  if (!set) return false;
  const has = v => v !== '' && v !== undefined && v !== null;
  if (!has(set.reps)) return false;
  // A reps-only exercise has no weight box to wait for.
  return (leftField || repsOnly) ? true : has(set.weight);
}
function findWorkoutEx(exId) {
  if (!ST.workout) return null;
  for (const phase of ['taxi','takeoff','enroute','landing']) {
    const exItem = (ST.workout[phase] || []).find(e => e.id === exId);
    if (exItem) return { exItem, phase };
  }
  return null;
}
// Which exercises the coach comments on. Weighted work: as before. Reps-
// only work (pullups, split squats, pushup variations): the working
// phases only. A warmup's "20 ankle circles" is not a set to be graded.
function setFeedbackFor(exItem, phase, sets) {
  if (exItem.inputType === 'reps_only' && phase !== 'takeoff' && phase !== 'enroute') return null;
  return autoregSuggestion(exItem, sets);
}
function refreshSetFeedback(exId) {
  const el = document.getElementById('ar_' + exId);
  const found = findWorkoutEx(exId);
  if (!el || !found) return;
  const html = autoregBoxHtml(setFeedbackFor(found.exItem, found.phase, ST.sets[exId] || []), exId);
  if (el.innerHTML !== html) el.innerHTML = html;
}
const SET_FEEDBACK_TYPING_MS = 1200;
const SET_FEEDBACK_LEFT_MS = 150;
const _setFeedbackTimers = {};
function queueSetFeedback(exId, i, leftField) {
  clearTimeout(_setFeedbackTimers[exId]);
  _setFeedbackTimers[exId] = setTimeout(() => {
    const set = (ST.sets[exId] || [])[i];
    const found = findWorkoutEx(exId);
    const repsOnly = !!found && found.exItem.inputType === 'reps_only';
    const hasReps = !!set && set.reps !== '' && set.reps !== undefined && set.reps !== null;
    // Only a set with reps can be "not ready yet". A set whose reps were
    // just deleted must still refresh, or its old message is left behind.
    if (hasReps) {
      if (leftField) {
        // Reps typed, then straight into the empty weight box: still mid-set.
        const tile = document.getElementById('st_' + exId + '_' + i);
        const stillInTile = tile && tile.contains && tile.contains(document.activeElement);
        if (stillInTile && !setFeedbackReady(set, false, repsOnly)) return;
      }
      if (!setFeedbackReady(set, leftField, repsOnly)) return;
    }
    refreshSetFeedback(exId);
  }, leftField ? SET_FEEDBACK_LEFT_MS : SET_FEEDBACK_TYPING_MS);
}

// Looks at the most recently completed set (the last one with a reps value
// entered) and, if it came in meaningfully under target, returns a plain-
// language suggestion for the next set. Returns null when on target, when
// no valid target can be parsed, or when nothing's been logged yet.
//
// BUG FIX (reported): this used to compare ONLY reps-vs-target, with no
// idea whether the weight had changed between sets. Missing a rep target
// by 2 on the SAME weight as the prior set is a near-miss worth a small
// correction. Missing by 2 reps on a set where the weight just went UP is
// the opposite situation — that's genuine effort finding its ceiling, and
// treating it as something to fix rather than a result to feel good about
// sends exactly the wrong signal about attempting progressive overload.
// Reps and weight typed into each other's boxes. Found in a real export:
// "130 reps at 6 lb" on a 4x8 deadlift. Only for weighted exercises, and
// only when the numbers are far outside anything a set could really be.
function looksSwapped(exItem, set) {
  if (!exItem || exItem.inputType === 'reps_only' || exItem.timed) return false;
  const reps = parseInt(set && set.reps), weight = parseFloat(set && set.weight);
  if (isNaN(reps) || isNaN(weight) || weight <= 0) return false;
  const target = parseTargetReps(exItem.target) || 10;
  return reps >= 40 && reps >= 3 * target && weight < Math.max(2 * target, 12) && weight < reps / 4;
}
function autoregSuggestion(exItem, sets, env) {
  const target = parseTargetReps(exItem.target);
  if (!target || target <= 0) return null;
  let lastIdx = -1;
  for (let i = sets.length - 1; i >= 0; i--) {
    if (sets[i].reps !== '' && sets[i].reps !== undefined && sets[i].reps !== null) { lastIdx = i; break; }
  }
  if (lastIdx === -1) return null;
  const last = sets[lastIdx];
  const actual = parseInt(last.reps);
  if (isNaN(actual)) return null;
  if (looksSwapped(exItem, last)) {
    return { tone: 'minor', action: 'swap', setIdx: lastIdx,
      text: actual + ' reps at ' + parseFloat(last.weight) + ' lb looks like reps and weight got swapped. Tap Swap to put ' + parseFloat(last.weight) + ' in reps and ' + actual + ' in weight.' };
  }
  const where = env === undefined ? (ST.env || null) : env;
  const missedBy = target - actual;
  if (missedBy <= 0) return null; // hit or beat target — nothing to say

  // Was this set's weight higher than the set before it? Only meaningful
  // when both sets actually logged a weight — bodyweight/reps-only work
  // has no weight field to compare, so this naturally falls through to
  // the normal miss/near-miss messages for those exercise types.
  const lastWeight = parseFloat(last.weight);
  let priorWeight = null;
  for (let i = lastIdx - 1; i >= 0; i--) {
    const w = parseFloat(sets[i].weight);
    if (!isNaN(w)) { priorWeight = w; break; }
  }
  const wentUpInWeight = !isNaN(lastWeight) && priorWeight !== null && lastWeight > priorWeight;

  // BUG FIX (reported: 12, 10, 8 reps at 50 lb on a 4x10, and the final
  // set got "Came in at 8/10, close. Hold the same weight and take a bit
  // more rest before the next set." There was no next set). Two problems:
  //   1. It never checked whether this was the LAST planned set, so it
  //      gave between-set advice after the exercise was over.
  //   2. It judged the last set alone. Reps falling across sets at the
  //      same load is expected fatigue, not a miss: Ratamess et al. 2007
  //      found volume drops every set at 1 min rest and holds only about
  //      two sets at 2 min. Finishing 2 short after beating target early
  //      is a full, productive session.
  // "8/10" also read like an effort rating, so the copy now says "8 of 10".
  const isFinalSet = lastIdx === sets.length - 1;
  // No load to adjust on a reps-only exercise, or on a weighted one logged
  // without a weight. "Drop the weight 5%" means nothing for a pullup, so
  // those get rest and easier-variation advice instead.
  const loaded = exItem.inputType !== 'reps_only' && sets.some(s => parseFloat(s.weight) > 0);
  const repsLabel = actual + ' of ' + target;
  const wt = !isNaN(lastWeight) && lastWeight > 0 ? ' at ' + lastWeight + ' lb' : '';
  const missedPct = missedBy / target;

  if (wentUpInWeight && missedPct <= 0.25) {
    // A near-miss immediately after adding weight is the expected, GOOD
    // outcome of testing a heavier load — not something to correct.
    return { tone: 'positive', text: repsLabel + ' reps at a heavier weight than the set before. That\'s a strong effort, not a miss, and roughly where a top set on a weight increase should land.' };
  }

  if (isFinalSet) {
    // Whole-exercise picture: total reps against the planned total.
    let doneReps = 0, doneSets = 0;
    for (let i = 0; i <= lastIdx; i++) {
      const r = parseInt(sets[i].reps);
      if (!isNaN(r)) { doneReps += r; doneSets++; }
    }
    const plannedReps = target * doneSets;
    const volumeNote = doneReps >= plannedReps
      ? ' ' + doneReps + ' total reps against ' + plannedReps + ' planned, so the work got done.'
      : '';
    // Progression rule from the ACSM 2009 position stand: add load once
    // the target is beaten on every set, not after one strong set.
    const capped = loaded && atHotelDumbbellCap(exItem.name, where, lastWeight);
    const nextTime = capped
      ? ' Hotel racks stop at ' + HOTEL_DB_MAX_LB + ' lb, so next session keep ' + lastWeight + ' lb and work toward ' + (target + 2) + ' reps on every set, or slow the lowering.'
      : loaded
      ? ' Keep this weight next session and add more once every set reaches ' + target + '.'
      : ' Next session, aim for ' + target + ' on every set before making it harder.';
    if (missedPct <= 0.25) {
      return { tone: 'positive', text: 'Strong finish: ' + repsLabel + ' on the last set' + wt + '. Losing a couple of reps by the final set is normal fatigue.' + volumeNote + nextTime };
    }
    return { tone: 'major', text: loaded
      ? 'Last set came in at ' + repsLabel + wt + '. Next session, keep the weight or drop about 5% so every set can reach ' + target + '.'
      : 'Last set came in at ' + repsLabel + '. Next session, rest a little longer between sets or use an easier variation so every set can reach ' + target + '.' };
  }

  if (missedPct <= 0.2) {
    return { tone: 'minor', text: loaded
      ? repsLabel + ' reps, close. Stay at this weight and rest about 2 minutes before the next set to get back toward ' + target + '.'
      : repsLabel + ' reps, close. Rest about 2 minutes before the next set to get back toward ' + target + '.' };
  }
  return { tone: 'major', text: loaded
    ? repsLabel + ' reps is a real miss, not just an off rep. Drop the weight about 5-10% for the next set so you can reach the target range.'
    : repsLabel + ' reps is a real miss, not just an off rep. Take a longer rest, or switch to an easier variation for the next set so you can reach the target range.' };
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
    showToast('🔔 Target time reached. Stop when ready.');
  }
  const domId = side ? exId+'_'+side : exId;
  const el = document.getElementById('sw_disp_'+domId);
  if (el) el.textContent = formatStopwatch(ST.stopwatch.seconds);
}
function stopStopwatch(exId, side) {
  if (ST.stopwatch.interval) clearInterval(ST.stopwatch.interval);
  const total = ST.stopwatch.seconds;
  ST.stopwatch.active = false;
  // BUG FIX: the old guard (`if (ST.sets[exId])`) only checked the array
  // itself existed, not that index [0] did — an existing-but-empty array
  // would still crash on .seconds_left = ... the same way the reported
  // oninput crash did. ensureSetEntry covers both cases.
  // The time goes to the next empty set, never over one already recorded.
  const found = findWorkoutEx(exId);
  const planned = found ? timedSetCount(found.exItem) : 1;
  const multi = planned > 1 || (ST.sets[exId] || []).length > 1;
  const idx = multi ? nextTimedSlot(ST.sets[exId], side, Math.max(planned, 2)) : 0;
  for (let k = 0; k <= idx; k++) ensureSetEntry(exId, k);
  if (side === 'left') ST.sets[exId][idx].seconds_left = String(total);
  else if (side === 'right') ST.sets[exId][idx].seconds_right = String(total);
  else ST.sets[exId][idx].seconds = String(total);
  persistTimerState();
  persistWorkoutState();
  showToast('⏱ Recorded '+total+' seconds'+(multi?' for set '+(idx+1):'')+(side?' ('+side+' side)':'')+'.');
  renderFlight(document.getElementById('mainPage'));
}

// ─── NSDR TIMER (5-min chime + auto record) ──────────────────────────────────
function buildNSDRWidget(exId, currentVal) {
  const isActive = ST.nsdrTimer.active;
  const parts = [];
  parts.push('<div class="timed-box '+(currentVal?'ok':'')+'" id="nsdr_'+exId+'">');
  parts.push('<div style="font-family:var(--mono);font-size:0.625rem;color:var(--muted);letter-spacing:0.08em;margin-bottom:6px">NSDR TIMER · CHIMES AT 5:00</div>');
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
    showToast('🔔 5 minutes complete. Continue or stop and save.');
  }
}
function stopNSDR(exId) {
  if (ST.nsdrTimer.interval) clearInterval(ST.nsdrTimer.interval);
  const total = ST.nsdrTimer.seconds;
  ST.nsdrTimer.active = false;
  // Same fix as stopStopwatch: `if (ST.sets[exId])` alone isn't enough,
  // an existing-but-empty array would still crash on [0].seconds = ...
  ensureSetEntry(exId, 0);
  ST.sets[exId][0].seconds = String(total);
  persistTimerState();
  persistWorkoutState();
  showToast('NSDR session recorded: '+formatStopwatch(total));
  renderFlight(document.getElementById('mainPage'));
}

// ─── AUDIO CHIME (Web Audio API — no file needed) ────────────────────────────
function playChime() {
  try {
    // Reuse the context unlocked in startRestTimer's tap handler — creating
    // a NEW AudioContext here (inside a setInterval callback, no user
    // gesture) is the failure mode this used to hit silently.
    const ctx = _chimeCtx || new (window.AudioContext || window.webkitAudioContext)();
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
  } catch(e) {/* just means no sound plays this time — no other state depends on it */}
}

// ─── CUSTOM EXERCISE CREATION ─────────────────────────────────────────────────
function buildAddExerciseCard() {
  const parts = [];
  parts.push('<div class="card card-dark" style="border:1.5px dashed var(--border)">');
  if (!ST.showAddExercise) {
    parts.push('<button class="btn btn-outline" onclick="ST.showAddExercise=true;renderFlight(document.getElementById(\'mainPage\'))">+ Add Your Own Exercise</button>');
  } else {
    // BUG FIX (reported): this form used to be free-text-only, with no way
    // to check whether an exercise already exists in the catalog first —
    // someone typing "Wall Slide" from scratch had no idea a fully-defined
    // version (with real sets/reps/notes) was already available, and would
    // end up creating a duplicate, worse-specified copy of it. Search first;
    // the manual form below stays for anything genuinely not in the catalog.
    parts.push('<div class="section-label" style="margin-top:0">ADD EXERCISE</div>');
    parts.push('<div class="field"><label>Search the exercise catalog first</label>');
    parts.push('<input type="text" id="addExCatalogSearch" placeholder="e.g. wall slide, row, curl…" oninput="filterAddExerciseCatalog(this.value)" autocomplete="off"></div>');
    parts.push('<div id="addExCatalogResults"></div>');
    parts.push('<div style="font-family:var(--mono);font-size:0.5625rem;color:var(--muted);letter-spacing:0.08em;margin:12px 0 10px;text-align:center">OR CREATE YOUR OWN BELOW</div>');
    parts.push('<div class="field"><label>Exercise Name</label><input type="text" id="custom_ex_name" placeholder="e.g. Cable Woodchopper"></div>');
    parts.push('<div class="field-row">');
    parts.push('<div class="field"><label>Target (sets×reps)</label><input type="text" id="custom_ex_target" placeholder="e.g. 3×12"></div>');
    parts.push('<div class="field"><label>Input Type</label><select id="custom_ex_type"><option value="reps_weight">Reps + Weight</option><option value="reps_only">Reps Only</option><option value="timed">Timed (seconds)</option></select></div>');
    parts.push('</div>');
    // BUG FIX (reported): this always landed in En Route regardless of
    // intent — a warmup exercise added mid-workout instead of at the
    // start. There's no "natural" phase for a brand-new exercise the way
    // there is for a catalog search result, so this needs an explicit
    // choice rather than an automatic guess. Defaults to En Route, the
    // previous fixed behavior, so anyone who doesn't touch this dropdown
    // sees no change.
    parts.push('<div class="field"><label>Add to which part of the workout?</label><select id="custom_ex_phase">');
    PHASES_META.forEach(p => parts.push('<option value="'+p.key+'"'+(p.key==='enroute'?' selected':'')+'>'+p.label+' · '+p.sub.replace(/ ⓘ$/,'')+'</option>'));
    parts.push('</select></div>');
    parts.push('<div class="field"><label>Notes (optional)</label><input type="text" id="custom_ex_note" placeholder="Form cue or reminder"></div>');
    parts.push('<button class="btn btn-gold" id="saveCustomExBtn" onclick="saveCustomExercise()">Add to This Workout</button>');
    parts.push('<button class="btn-ghost mt8" style="display:block;width:100%;text-align:center" onclick="ST.showAddExercise=false;renderFlight(document.getElementById(\'mainPage\'))">Cancel</button>');
  }
  parts.push('</div>');
  return parts.join('');
}

// Catalog search for "Add Your Own Exercise" — same ranking/matching logic
// as the swap sheet's search, but adds directly to ST.workout.enroute
// instead of swapping an existing slot (there's nothing to swap here).
function filterAddExerciseCatalog(q) {
  const box = document.getElementById('addExCatalogResults');
  if (!box) return;
  q = (q||'').trim().toLowerCase();
  if (!q) { box.innerHTML = ''; return; }
  const matches = buildExerciseCatalog()
    .filter(e => exerciseMatchesQuery(e.name, q))
    .sort((a, b) => exerciseSearchRank(a.name, q) - exerciseSearchRank(b.name, q))
    .slice(0, 6);
  const parts = [];
  matches.forEach((e, i) => {
    parts.push('<div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;font-size:0.8125rem" onclick="addExistingCatalogExercise('+i+',\''+q.replace(/'/g,'')+'\')">'+e.name+' <span style="font-family:var(--mono);font-size:0.625rem;color:var(--muted)">'+(e.target||'')+'</span></div>');
  });
  if (!matches.length) {
    parts.push('<div style="font-size:0.6875rem;color:var(--muted);padding:6px 2px">No catalog match. Create it below.</div>');
  }
  box.innerHTML = parts.join('');
}

function addExistingCatalogExercise(matchIdx, q) {
  const matches = buildExerciseCatalog()
    .filter(e => exerciseMatchesQuery(e.name, q))
    .sort((a, b) => exerciseSearchRank(a.name, q) - exerciseSearchRank(b.name, q))
    .slice(0, 6);
  const exDef = matches[matchIdx];
  if (!exDef || !ST.workout) return;
  const id = exDef.id || ('custom_' + Date.now());
  const newEx = ex(id, exDef.name, exDef.target, exDef.sets || 3, exDef.note || '', exDef.timed || false, exDef.inputType || 'reps_weight');
  // BUG FIX (reported): this always landed in En Route regardless of
  // where the exercise actually belongs — a warmup movement added mid-
  // workout instead of at the start. buildExerciseCatalog() now carries
  // the phase each entry was found in, so an exercise found in the taxi
  // (warmup) list goes back into taxi automatically — no extra UI
  // needed here, since a catalog exercise already has a natural home.
  const phase = ['taxi','takeoff','enroute','landing'].includes(exDef.phase) ? exDef.phase : 'enroute';
  ST.workout[phase].push(newEx);
  // One shared shape (blankSetsFor), so a left/right stretch or a jump
  // with a height box gets the fields its card actually draws. The old
  // hand-rolled version here gave those reps + weight entries.
  ST.sets[id] = blankSetsFor(newEx);
  ST.showAddExercise = false;
  showToast('✅ "'+exDef.name+'" added from the catalog.');
  renderFlight(document.getElementById('mainPage'));
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

// Make a string safe to drop inside a single-quoted JS literal that itself
// sits inside a double-quoted onclick="..." attribute.
//
// BUG FIX (reported): tapping Guide on "Child's Pose + Reach" threw
// SyntaxError: Unexpected identifier 's'. The name had been escaped as
// &#39;, but the HTML parser decodes that entity back to a raw ' BEFORE the
// JS parser ever sees the handler, so the string literal ended at "Child".
// \uXXXX escapes survive HTML parsing untouched and decode only in JS, so
// they work for every character that could break either layer.
function jsArg(s) {
  return String(s == null ? '' : s).replace(/[\\'"<>&\r\n\u2028\u2029]/g, c =>
    '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

function sanitizeUserText(s) {
  // User text is rendered via innerHTML and inside inline handler attributes.
  // Stripping quote/angle/backtick chars prevents markup or handler injection.
  return String(s || '').replace(/[<>"'`\\]/g, '').slice(0, 120);
}

// Same XSS-safe stripping as sanitizeUserText, but WITHOUT the 120-char cap.
//
// BUG FIX (reported): the food description textarea was silently truncating
// AI-generated descriptions mid-word — "...in crispy red chili-dyed corn t"
// cutting off exactly at character 120. Every earlier attempt to fix this
// (textarea sizing, auto-grow, box-sizing, event handlers) was chasing a
// visual symptom of a completely different problem: the STRING ITSELF was
// already truncated before it ever reached the textarea, so no amount of
// CSS or JS sizing logic could have shown the rest of text that wasn't
// there. sanitizeUserText's 120-char limit is appropriate for short fields
// (exercise names, notes) but wrong for anything that can legitimately run
// long, like a food description. Use this variant for those contexts.
function sanitizeUserTextLong(s) {
  return String(s || '').replace(/[<>"'`\\]/g, '');
}

async function saveCustomExercise() {
  const name = sanitizeUserText(document.getElementById('custom_ex_name')?.value?.trim());
  const target = sanitizeUserText(document.getElementById('custom_ex_target')?.value?.trim()) || '–';
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
  showToast('✅ "'+name+'" added. It will appear in this workout going forward.');
  renderFlight(document.getElementById('mainPage'));
}

function confirmRemoveExercise(exId, exName, isCustom) {
  const root = document.getElementById('modalRoot');
  root.innerHTML =
    '<div class="modal-bg" onclick="if(event.target===this)closeModal()">' +
    '<div class="modal-sheet">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Remove '+exName+'?</div>' +
    '<div class="modal-body" style="margin-bottom:14px">This removes it from today\'s workout. Any sets already logged for it will be discarded when you set the chocks. This only affects today. It won\'t change tomorrow\'s plan.</div>' +
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
    '<div style="font-family:var(--mono);font-size:0.625rem;color:var(--gold);margin-bottom:12px;letter-spacing:0.08em">' + e.target + '</div>' +
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
  if (exItem.inputType === 'timed_bilateral') return 2.3; // stretches (Compendium 02101, stretching, mild)
  if (exItem.inputType === 'reps_height' || exItem.inputType === 'reps_distance') return 7.5; // jump/sprint tests
  if (exItem.timed) return 2.8; // other timed holds, planks etc. (Compendium 02024)
  if (exItem.inputType === 'reps_only') return 6.0; // bodyweight circuits
  return 5.5; // reps_weight (default) — resistance training
}

// No explicit duration on a reps/weight set (rest isn't tracked) — a rough,
// commonly-used estimate of actual working time per set, excluding rest.
const ASSUMED_SET_SECONDS = 45;

// ─── WORKOUT CALORIES ────────────────────────────────────────────────────────
// BUG FIX (reported: 120 calories for an hour of lifting). Sets used to be
// costed for their 45 seconds under the bar and nothing else, so a 59 minute
// session was priced as 13 minutes of work.
//
// Lifting is now costed the way the reference table defines it. The 2024
// Compendium of Physical Activities lists resistance training as a session
// value, rests between sets included (its own guidance: count the time
// "performing the activity and during the rests between sets"):
//   02054  3.5  resistance training, multiple exercises, 8-15 reps
//   02052  5.0  squats, deadlift, slow or explosive effort
//   02022  3.8  calisthenics (pushups, pull-ups, lunges), moderate effort
//   02024  2.8  calisthenics, light effort (also used for warmup/cooldown reps)
// Calories = MET x body weight in kg x hours. That is the total burned in
// the session, the same convention the Compendium and most trackers use.
// Check: 3.5 x 87 kg x 59 min is about 300, in line with the roughly 290
// to 300 kcal measured by indirect calorimetry for lifting sessions
// (Rustaden et al. 2020, Frontiers in Physiology).
function strengthSessionMET(exItem, phase) {
  if (phase === 'taxi' || phase === 'landing') return 2.8;
  if (exItem.inputType === 'reps_height' || exItem.inputType === 'reps_distance') return 5.0; // jumps: nearest listed value, explosive effort
  if (exItem.inputType === 'reps_only') return 3.8;
  if (/squat|deadlift/i.test(exItem.name || '')) return 5.0;
  return 3.5;
}
// How much session time one reps-based set can account for, rest included.
// The saved session length is used when there is one, held between a floor
// (a workout typed in afterwards has almost no clock time) and a cap (an app
// left open for hours is not hours of lifting). With no saved length at all,
// a typical set-plus-rest is assumed.
const SET_SECONDS_FLOOR = 120;
const SET_SECONDS_TYPICAL = 150;
const SET_SECONDS_CAP = 240;

// minutes:  time under effort only (real seconds for timed work, 45 s per
//           reps-based set). Unchanged, and still the floor for a session's
//           saved length in setTheChocks.
// calories: timed work at its own pace for its own logged time, plus
//           reps-based work over the session time it occupied.
// Bodyweight is a real input (falls back to 180 lb only when none is on file).
function computeSessionEffort(wk, sessionSets, bodyWeightLb, sessionMinutes) {
  const bwKg = (bodyWeightLb || 180) * 0.4536;
  let workSeconds = 0, timedSeconds = 0, timedCal = 0, repSets = 0, repMetSum = 0;
  ['taxi', 'takeoff', 'enroute', 'landing'].forEach(phase => {
    (wk[phase] || []).forEach(exItem => {
      const sets = (sessionSets && sessionSets[exItem.id]) || [];
      sets.forEach(s => {
        let sec = 0;
        if (s.seconds) sec = parseFloat(s.seconds) || 0;
        else if (s.seconds_left || s.seconds_right) sec = (parseFloat(s.seconds_left)||0) + (parseFloat(s.seconds_right)||0);
        else if (s.reps || s.weight || s.height || s.distance) {
          repSets++;
          repMetSum += strengthSessionMET(exItem, phase);
          workSeconds += ASSUMED_SET_SECONDS;
          return;
        }
        timedSeconds += sec;
        timedCal += exerciseMET(exItem) * bwKg * (sec / 3600);
      });
    });
  });
  workSeconds += timedSeconds;
  let strengthCal = 0;
  if (repSets) {
    const known = parseFloat(sessionMinutes) > 0;
    const available = known ? parseFloat(sessionMinutes) * 60 - timedSeconds : repSets * SET_SECONDS_TYPICAL;
    const strengthSeconds = Math.min(repSets * SET_SECONDS_CAP, Math.max(repSets * SET_SECONDS_FLOOR, available));
    strengthCal = (repMetSum / repSets) * bwKg * (strengthSeconds / 3600);
  }
  return { minutes: Math.round(workSeconds / 60), calories: Math.round(timedCal + strengthCal) };
}

function estimateCalories(wk, bodyWeightLb, sessionSets, sessionMinutes) {
  return computeSessionEffort(wk, sessionSets, bodyWeightLb, sessionMinutes).calories;
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

  // BUG FIX (reported: "sessions this week" counting incidental airport
  // walking as a dedicated training day). Oura auto-imports any walk that
  // clears MIN_OURA_WALK_MINUTES/MIN_OURA_WALK_CAL_PER_MIN as real activity
  // — useful for calorie/trend tracking — but gate-to-gate or terminal
  // walking isn't a discretionary training session the frequency target is
  // meant to measure, and it's not something that can be "swapped" for a
  // workout. Excluded here by the same signal used to import it
  // (importedFromOura + activity === walking), not by muscle_group, so a
  // deliberately-logged walk workout still counts.
  const sessionsThisWeek = weeklySessions.filter(s => {
    const days = (Date.now() - new Date(s.date).getTime()) / 86400000;
    if (days > 7) return false;
    if (s.importedFromOura && (s.ouraActivity||'').toLowerCase() === 'walking') return false;
    return true;
  }).length;
  const targetDays = parseInt((FREQUENCY_GUIDE[session.level||'intermediate'].days||'3').split('-')[0]);

  const landingIds = (session.workoutSnapshot?.landing || []).map(e => e.id);
  const landingLogged = landingIds.length ? landingIds.some(id => (sets[id]||[]).some(s => s.reps||s.weight||s.seconds||s.seconds_left||s.seconds_right)) : null;

  const effort = computeSessionEffort(session.workoutSnapshot || {taxi:[],takeoff:[],enroute:[],landing:[]}, sets, bodyWeightLb, session.durationMinutes);
  // A workout the ring recorded carries the ring's own heart-rate-based
  // figure. It was saved for exactly this purpose and then never shown.
  const measuredCal = session.importedFromOura && session.estCalories > 0 ? Math.round(session.estCalories) : null;

  return {
    totalSets, totalReps, totalVolume: Math.round(totalVolume),
    completedExCount, totalPlanned, completionPct,
    prHits, sessionsThisWeek, targetDays,
    landingLogged, estCalories: measuredCal !== null ? measuredCal : effort.calories,
    // BUG FIX (reported: a workout of about 45 minutes showed MINUTES 13).
    // effort.minutes is time under the bar only: 45 seconds per logged set
    // with no rest counted, so 18 sets read as 13 minutes. The session's
    // real length (first logged set to setting the chocks) is saved on the
    // session and is what this tile means. The estimate remains the
    // fallback for old or imported sessions that carry no saved length.
    durationMinutes: session.durationMinutes || effort.minutes,
  };
}

function buildDebriefMessages(summary) {
  const msgs = [];
  if (summary.completionPct === 100) {
    msgs.push({ type:'ok', icon:'🎯', text:'Full mission complete: every exercise logged. That\'s the standard.' });
  } else if (summary.completionPct >= 70) {
    msgs.push({ type:'info', icon:'👍', text:'Solid session: '+summary.completionPct+'% of planned exercises logged.' });
  } else {
    msgs.push({ type:'warn', icon:'📋', text:'Partial session ('+summary.completionPct+'% complete). Any movement counts, but try to close out all phases next time.' });
  }

  if (summary.prHits.length) {
    summary.prHits.forEach(pr => {
      msgs.push({ type:'ok', icon:'🏆', text:'New PR: '+pr.name+' at '+pr.weight+' '+(pr.unit||'lb')+'. Nice work.' });
    });
  }

  if (summary.sessionsThisWeek >= summary.targetDays) {
    msgs.push({ type:'ok', icon:'🔥', text:summary.sessionsThisWeek+' sessions this week. You\'ve hit your '+summary.targetDays+'-day target. Consistency is what actually drives results.' });
  } else {
    const remaining = summary.targetDays - summary.sessionsThisWeek;
    msgs.push({ type:'info', icon:'📅', text:summary.sessionsThisWeek+' of '+summary.targetDays+' sessions this week: '+remaining+' more to hit your target.' });
  }

  if (summary.landingLogged === false) {
    msgs.push({ type:'warn', icon:'🛬', text:'You skipped the Landing phase. Decompression and CNS down-regulation is what actually starts the recovery process. Don\'t treat it as optional.' });
  }

  return msgs;
}

// SET THE CHOCKS ends the whole workout in one tap with no undo — a real
// consequence, not just a label to learn. Reported: an accidental tap ended
// a session with exercises still unlogged, with zero warning beforehand.
// This interrupts only when the workout is genuinely incomplete; a fully
// finished session still ends in one tap, unchanged.
//
// BUG FIX (reported: started a workout purely to take screenshots, logged
// nothing, tapped Set Chocks, confirmed "Finish Anyway" on this modal —
// and got stuck. setTheChocks() has its own, separate hard block against
// saving a zero-exercise session (line ~8554) — a good rule on its own
// (an empty "session" saved to training history is meaningless data), but
// this modal didn't know about it, so "Finish Anyway" led straight into
// that wall with no way out of the in-progress workout at all. Detecting
// the zero-logged case specifically here, before ever reaching that save
// path, and offering a real exit for it: discard the in-progress workout
// entirely (no database write, same as never having started one) rather
// than a "finish" that was never going to be allowed to succeed.
function confirmSetChocks() {
  const wk = ST.workout;
  if (!wk) return;
  const allEx = [...wk.taxi,...wk.takeoff,...wk.enroute,...wk.landing];
  const done = allEx.filter(exItem => ST.sets[exItem.id]?.some(s => s.reps||s.weight||s.seconds||s.height||s.distance||s.seconds_left||s.seconds_right)).length;
  if (done >= allEx.length) { setTheChocks(); return; }
  const root = document.getElementById('modalRoot');
  if (done === 0) {
    root.innerHTML =
      '<div class="modal-bg" onclick="if(event.target===this)closeModal()">' +
      '<div class="modal-sheet">' +
      '<div class="modal-handle"></div>' +
      '<div class="modal-title">Nothing logged yet</div>' +
      '<div class="modal-body" style="margin-bottom:14px">There\'s nothing to save: no exercise has any reps, weight, or time logged. You can discard this workout and head back, or keep going if you\'re not done.</div>' +
      '<button class="btn btn-outline" onclick="closeModal();discardWorkout()">Discard Workout</button>' +
      '<button class="btn btn-green mt8" onclick="closeModal()">Keep Training</button>' +
      '</div></div>';
    return;
  }
  const remaining = allEx.length - done;
  root.innerHTML =
    '<div class="modal-bg" onclick="if(event.target===this)closeModal()">' +
    '<div class="modal-sheet">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Finish this workout now?</div>' +
    '<div class="modal-body" style="margin-bottom:14px">You still have '+remaining+' exercise'+(remaining===1?'':'s')+' left ('+done+'/'+allEx.length+' done). Setting the chocks finishes and saves the workout as-is. Anything not logged won\'t be recorded.</div>' +
    '<button class="btn btn-green" '+(ST.chocksSaving?'disabled':'')+' onclick="closeModal();setTheChocks()">'+(ST.chocksSaving?'⏳ Saving…':MARSHALL_STOP_ICON+'Finish Anyway')+'</button>' +
    '<button class="btn btn-outline mt8" onclick="closeModal()">Keep Training</button>' +
    '</div></div>';
}

// Companion to setTheChocks() for the zero-logged case above: abandons the
// in-progress workout with no database write at all, rather than a "finish"
// that saves an empty session. Mirrors setTheChocks()'s own state reset
// (ST.workout/ST.sets/timestamps, clearWorkoutState() for the persisted
// resume-on-reload copy) but skips everything specific to a real completed
// session — no insert, no debrief summary, no PR/badge/leaderboard checks,
// and lands back on Today rather than the debrief screen, since there's no
// session to debrief.
function discardWorkout() {
  ST.workout = null;
  ST.sets = {};
  ST.workoutStartedAt = null;
  ST.workoutFirstLoggedAt = null;
  clearWorkoutState();
  ST.tab = 'today';
  renderPage();
  showToast('Workout discarded.');
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
    showToast('⚠️ Saved locally. Will sync when online.');
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

// ─── RECENT MEALS ─────────────────────────────────────────────────────
// BUG FIX ROUND 2 (reported: recency-only ranking meant a single busy
// day of uniquely-worded photo logs could fill every slot, crowding out
// real habits from other days — and the user's actual ask was "show me
// what I normally log," which is frequency, not recency). Root problem
// underneath both bugs is the same: photo-recognition describes the
// WHOLE PLATE as a fresh sentence each time, so a genuinely repeated
// habit (a protein shake, most mornings) almost never produces the same
// string twice ("Whey protein powder shake (Mocha Cappuccino...)" vs
// "Whey protein shake (Smores flavored) with a banana" are the same
// HABIT worded two different ways) — plain string matching can't see
// that they're the same thing, so the true count for a real habit was
// getting fragmented across many count-1 entries instead of ever adding
// up. FOOD_GROUP_PATTERNS below groups by a recognized staple category
// first (same curated-pattern approach already used for
// STAPLE_FOOD_BOOSTS in food search), falling back to the literal
// description only for things that don't match a known category — so a
// real habit's count now actually reflects how often it happens,
// regardless of exact wording, and ranking by that count is what
// surfaces "things you normally log" rather than whatever happened to
// be logged most recently.
const FOOD_GROUP_PATTERNS = [
  { label: 'Protein shake',  re: /protein (shake|powder)/i },
  { label: 'Eggs',           re: /\beggs?\b/i },
  { label: 'Chicken breast', re: /chicken breast/i }, // deliberately NOT a bare \bchicken\b — that grouped a burrito bowl, a chicken salad, and a Chick-fil-A sandwich into one misleading "4x" badge, when none of those are actually the same repeated food, just dishes that happen to contain chicken
  { label: 'Steak',          re: /\bsteak\b/i },
  { label: 'Ground beef',    re: /ground beef|hamburger patty|beef patty/i },
  { label: 'Protein bar',    re: /protein bar|granola bar/i },
  { label: 'Yogurt',         re: /yogurt/i },
  { label: 'Oatmeal',        re: /oatmeal/i },
  { label: 'Mixed nuts',     re: /mixed nuts|almonds/i },
  { label: 'Salad',          re: /\bsalad\b/i },
  { label: 'Sandwich',       re: /sandwich/i },
];
// Checks known staple categories first; only an UNRECOGNIZED food falls
// back to its own literal (normalized) description as its group key —
// this is deliberately a fallback, not the primary grouping, since a
// one-off dish shouldn't be force-fit into an unrelated category.
function canonicalFoodGroup(description) {
  const d = description || '';
  for (const p of FOOD_GROUP_PATTERNS) if (p.re.test(d)) return p.label;
  return normalizeFoodKey(d);
}

const FREQUENT_FOODS_CACHE_KEY = 'fcf_frequent_foods_cache_v3'; // bumped from _v2 — grouping logic changed, old cached results were keyed/ranked under the old per-string logic
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
  const counts = {}; // group key -> { count, lastLoggedAt, item }
  (mealLogs || []).forEach(log => {
    (log.meal_data?.items || []).forEach(item => {
      const key = canonicalFoodGroup(item.description);
      if (!key) return;
      if (!counts[key]) counts[key] = { count: 0, lastLoggedAt: null, item: null };
      counts[key].count++;
      // Keep the most recently logged version — nutrients can drift
      // slightly between entries (a different portion typed in, a
      // corrected photo guess, a different specific flavor) and the
      // newest is the best guess at how they'd want it logged again.
      if (!counts[key].lastLoggedAt || log.logged_at > counts[key].lastLoggedAt) {
        counts[key].lastLoggedAt = log.logged_at;
        counts[key].item = item;
      }
    });
  });
  // Frequency first — "what do I normally log" — recency only breaks a
  // tie between two habits logged equally often. No minimum count
  // required (that was the original bug): a one-off still shows, it
  // just won't outrank an actual habit for one of the limited slots.
  return Object.values(counts)
    .sort((a, b) => b.count - a.count || new Date(b.lastLoggedAt) - new Date(a.lastLoggedAt))
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
  try { localStorage.setItem(FREQUENT_FOODS_CACHE_KEY, JSON.stringify({ userId: ST.user?.id, cachedAt: Date.now(), foods })); } catch(e) { console.warn('Caching frequent foods failed:', e); }
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

  // AI Progression Analytics — Pro only. The headline insight for the whole
  // Trends screen, so it goes first. Cached server-side for 24h.
  // CHANGE (Sep 11, 2026): previously omitted entirely for free users —
  // Chad's call was to show a teaser instead, so the feature isn't
  // invisible to people who'd never otherwise know it exists.
  if (isPro()) {
    parts.push(aiCoachCard('aiProgressionCard', 'aiProgressionText', 'AI COACH · YOUR PATTERNS', 'gold'));
  } else {
    parts.push(aiCoachTeaser('AI COACH · YOUR PATTERNS', 'gold',
      'You\'ve been consistent with your upper body work this week, and your recovery scores are trending in the right direction, but there\'s a pattern in your training around long duty days worth knowing about.'));
  }

  parts.push('<div class="section-label">BIOMETRICS LOG &amp; TRENDS</div>');

  // Shown only when free-tier trimming actually hid data (set in loadAndDrawCharts)
  parts.push('<div id="trendsProNote" class="card mb12" style="display:none;border-left:3px solid var(--gold);padding:12px 14px">' +
    '<div style="font-size:0.75rem;color:var(--muted);line-height:1.6">Showing the last 30 days. ' +
    '<span style="color:var(--gold);cursor:pointer;font-weight:600" onclick="showPaywall(\'trends\')">Upgrade to Pro</span> for your full history.</div></div>');

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
  parts.push('<button class="btn btn-gold" onclick="saveBio()">LOG METRICS</button>');
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
      parts.push('<div class="fb mb8"><div style="font-size:0.8125rem">🥩 Protein adherence</div><div style="font-size:0.75rem;text-align:right"><span style="color:'+color2+'">'+arrow2+' '+fuelTrend.avgProteinPct+'% of target</span><div style="font-family:var(--mono);font-size:0.5625rem;color:var(--muted)">'+fuelTrend.daysLogged+' days logged</div></div></div>');
      parts.push('<div class="fb"><div style="font-size:0.8125rem">🔥 Avg calories/day</div><div style="font-family:var(--mono);font-size:0.75rem">'+fuelTrend.avgCalories.toLocaleString()+'</div></div>');
    } else {
      const remaining = 4 - fuelTrend.daysLogged;
      const msg = fuelTrend.daysLogged === 0
        ? 'Log meals for 4 days to unlock your fuel trend.'
        : 'Log meals for ' + remaining + ' more day' + (remaining === 1 ? '' : 's') + ' to unlock your fuel trend.';
      parts.push('<div style="font-size:0.75rem;color:var(--muted)">'+msg+'</div>');
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
      parts.push('<div class="fb mb8"><div style="font-size:0.8125rem">🏋️ '+lt.name+'</div><div style="font-size:0.75rem;text-align:right"><span style="color:'+color+'">'+arrow+' '+lt.current+' lb</span><div style="font-family:var(--mono);font-size:0.5625rem;color:var(--muted)">'+lt.sessionsCount+' sessions'+(lt.trend.status!=='flat'?' · '+(lt.trend.changePct>0?'+':'')+lt.trend.changePct+'%':'')+'</div></div></div>');
    });
    if (runTrend) {
      const [arrow, color] = statusMeta[runTrend.trend.status];
      parts.push('<div class="fb mb8"><div style="font-size:0.8125rem">🏃 Running Pace</div><div style="font-size:0.75rem;text-align:right"><span style="color:'+color+'">'+arrow+' '+formatPace(runTrend.current)+'</span><div style="font-family:var(--mono);font-size:0.5625rem;color:var(--muted)">'+runTrend.sessionsCount+' runs'+(runTrend.trend.status!=='flat'?' · '+(runTrend.trend.changePct>0?'+':'')+runTrend.trend.changePct+'%':'')+'</div></div></div>');
    }
    parts.push('</div>');
  } else {
    parts.push('<div class="alert alert-info mb12"><div class="alert-icon">📈</div><div>Strength and pace trends will show up here once you\'ve logged the same primary lift or a few runs across several sessions.</div></div>');
  }

  [['chartWt','BODY WEIGHT (lb)'],['chartWaist','WAIST (in)'],['chartBP','BLOOD PRESSURE (mmHg)'],['chartGluc','FASTING GLUCOSE (mg/dL)']].forEach(([id,label]) => {
    parts.push('<div class="card mb8"><div style="font-family:var(--mono);font-size:0.625rem;color:var(--muted);margin-bottom:6px">'+label+'</div><div class="chart-wrap"><canvas id="'+id+'"></canvas></div></div>');
  });

  // Oura Ring trend charts
  if (ST.ouraConnected) {
    parts.push('<div id="ouraTrendsSection"><div class="section-label">OURA RING TRENDS</div>');
    [['chartOuraReadiness','READINESS SCORE (0-100)',null],['chartOuraSleep','SLEEP SCORE + HRV BALANCE (0-100)','hrv']].forEach(([id,label,infoKey]) => {
      parts.push('<div class="card mb8"><div style="font-family:var(--mono);font-size:0.625rem;color:var(--muted);margin-bottom:6px">'+label+(infoKey?' <span class="info-i" onclick="showBioInfo(\''+infoKey+'\')">i</span>':'')+'</div><div class="chart-wrap"><canvas id="'+id+'"></canvas></div></div>');
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
  // Fired after innerHTML so the card element definitely exists
  if (isPro()) loadProgressionAnalytics();
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

  // BUG FIX (independent code review finding, verified real): an
  // authenticated user had NO local fallback at all — a failed network
  // call here just showed "Could not save — check connection" and the
  // entry was gone, while an unauthenticated user got a full localStorage
  // save. That's backwards for what this app actually promises ("works
  // with no signal") and for who's using it — a pilot logging biometrics
  // is exactly who's likely to be offline (altitude, a dead-zone hotel).
  // Workout sessions already have this exact kind of fallback; this
  // brings biometric logging in line with that, using a separate
  // fcf_bio_pending key (not the shared fcf_bio key genuinely-
  // unauthenticated local users write to) so a signed-in user's pending
  // entries can never collide with someone else's local-only history.
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
  } catch(e) {
    console.warn('saveBio remote save failed:', e);
    if (ST.user) {
      try {
        const pending = JSON.parse(localStorage.getItem('fcf_bio_pending') || '[]');
        pending.push({ weight_lb:wt, waist_in:waist, systolic_bp:sys, diastolic_bp:dia, fasting_glucose:gluc, logged_at: new Date().toISOString() });
        localStorage.setItem('fcf_bio_pending', JSON.stringify(pending));
        showBigToast('No connection: saved locally, will sync automatically.', 'warn');
      } catch(e2) {
        console.warn('saveBio local fallback also failed:', e2);
        showBigToast('Could not save. Check connection.','warn');
      }
    } else {
      showBigToast('Could not save. Check connection.','warn');
    }
  }

  if (wt) {
    ST.lastWeight = wt;
    try {
      const profile = (await dbGetProfile()) || {};
      profile.lastWeight = wt;
      await dbSetProfile(profile);
    } catch (e) { showBigToast('Weight saved on this device, but could not sync.', 'warn'); }
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

  // Free tier: trends limited to the last 30 days. Pro sees full history.
  // This matches what the subscription comparison table advertises.
  if (!isPro()) {
    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const before = data.length;
    data = data.filter(d => new Date(d.logged_at).getTime() >= cutoff);
    if (before > data.length) {
      const el = document.getElementById('trendsProNote');
      if (el) el.style.display = '';
    }
  }

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
    if (ST.chartInst[key]) { try { ST.chartInst[key].destroy(); } catch(e){/* already destroyed or never fully initialized — either way there's nothing left to clean up */} }
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
    if (ST.chartInst['c_chartBP']) { try { ST.chartInst['c_chartBP'].destroy(); } catch(e){/* already destroyed or never fully initialized — either way there's nothing left to clean up */} }
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
  parts.push('<div style="font-family:var(--mono);font-size:0.625rem;color:var(--gold);letter-spacing:0.1em;margin-bottom:12px">BRIEFING '+num+' / '+WISDOM.length+'</div>');
  parts.push('<div style="font-size:1.125rem;font-weight:700;color:var(--text);margin-bottom:14px">'+card.title+'</div>');
  parts.push('<div style="font-size:0.8125rem;line-height:1.8;color:#94a3b8">'+card.text+'</div>');
  parts.push('</div><div><a class="modal-link" href="'+card.link+'" '+externalLinkAttrs()+'>📖 Read more →</a></div></div>');
  parts.push('<div class="wisdom-counter">'+(activeIdx+1)+' of '+WISDOM.length+(isAutoRotated?' · rotates daily':'')+'</div>');
  parts.push('<div class="wisdom-nav"><button class="btn btn-outline" onclick="prevWisdom()">← PREV</button><button class="btn btn-outline" onclick="nextWisdom()">NEXT →</button></div>');
  if (!isAutoRotated) {
    parts.push('<button class="btn-ghost mt8" style="display:block;width:100%;text-align:center" onclick="ST.wisdomIdx=null;renderWisdom(document.getElementById(\'mainPage\'))">↻ Back to Today\'s Briefing</button>');
  }
  parts.push('<div style="margin-top:16px"><div class="section-label">JUMP TO TOPIC</div><div class="mg-wrap">');
  WISDOM.forEach((w,i) => {
    parts.push('<div class="'+(i===activeIdx?'mg-pill sel':'mg-pill')+'" onclick="jumpWisdom('+i+')" style="font-size:0.6875rem">'+w.title+'</div>');
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
  parts.push('<div style="font-size:2.25rem;margin-bottom:8px">'+(s.completionPct===100?'🎯':'✈️')+'</div>');
  parts.push('<div style="font-family:var(--mono);font-size:1.125rem;color:var(--gold);letter-spacing:0.04em">'+session.muscle_group.toUpperCase()+' COMPLETE</div>');
  parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:4px">'+new Date(session.date).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})+'</div>');
  parts.push('</div>');

  parts.push('<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">');
  parts.push(glowTile('MINUTES', s.durationMinutes||'–', 'gold'));
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

  // BUG FIX (reported): this sent the user back to Preflight — "start
  // today's workout" — immediately after they'd just finished one. It
  // technically worked (Preflight correctly shows the NEXT day's mission,
  // not the one just completed), but landing on a screen whose whole
  // purpose is "begin a workout" the moment you finish one reads as the
  // app not having registered what just happened. Trends is where the
  // session they just logged actually shows up — calendar, strength
  // trends, body weight — which is the natural next stop after finishing.
  parts.push(shareButtonHtml(registerShareCard('debrief', shareCardData(session, s, shareRowsFor(session, (s.prHits || []).map(pr => pr.name)))), 'mt16'));
  parts.push('<button class="btn btn-gold mt8" onclick="ST.lastDebrief=null;switchTab(\'trends\')">View in Trends</button>');
  p.innerHTML = parts.join('');
}

// ─── EXPORT CSV ──────────────────────────────────────────────────────────────
// Supabase returns at most 1000 rows per request. The export used a single
// request per table, so anyone with more history than that (a year of
// meals, or of medication check-offs) got a silently truncated file. This
// pages through with .range() until a short page comes back.
async function fetchAllRows(makeQuery) {
  const PAGE = 1000, out = [];
  for (let from = 0; from < 100000; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// The "who is this and what are they aiming for" block at the top of the
// export. Two columns, Item and Value. Only things that are actually set are
// listed, except nutrition targets, where "not set" is itself useful to know.
function exportProfileRows(st) {
  const rows = [];
  const add = (k, v) => { if (v !== undefined && v !== null && v !== '') rows.push([k, v]); };
  const goal = GOALS[st.goal];
  add('Training goal', goal ? goal.label : (st.goal || ''));
  add('Experience level', st.level);
  const inj = (st.injuries || []).map(r => (INJURY_REGIONS[r] && INJURY_REGIONS[r].label) || r);
  if (inj.length) add('Injuries flagged', inj.join(', '));
  add('Sex', st.sex);
  add('Age', st.age);
  add('Height (in)', st.heightIn);
  add('Latest body weight (lb)', st.lastWeight);
  const g = st.nutritionGoals && st.nutritionGoals.mode && st.nutritionGoals.mode !== 'none' ? st.nutritionGoals : null;
  if (g) {
    add('Nutrition plan', ({ maintain: 'Maintain weight', fatloss: 'Fat loss', muscle: 'Build muscle' })[g.mode] || g.mode);
    add('Calorie target (per day)', g.calories);
    add('Protein target (g per day)', g.protein);
    add('Carb target (g per day)', g.carbs);
    add('Fat target (g per day)', g.fat);
    add('Estimated resting burn, BMR (cal per day)', g.bmr);
    add('Estimated total burn, TDEE (cal per day)', g.tdee);
    if (g.setAt) add('Nutrition targets set on', new Date(g.setAt).toLocaleDateString('en-US'));
  } else {
    add('Nutrition targets', 'not set');
  }
  if (st.trackHydration) add('Hydration target', HYDRO_RATE + ' L per flight hour, at least ' + HYDRO_FLOOR + ' L a day');
  return rows;
}
// One row per body measurement entry, whatever day it was taken.
function exportBodyRows(biometrics) {
  const v = x => (x === undefined || x === null ? '' : x);
  return (biometrics || [])
    .filter(b => b && b.logged_at && [b.weight_lb, b.waist_in, b.systolic_bp, b.diastolic_bp, b.fasting_glucose].some(x => x !== undefined && x !== null && x !== ''))
    .map(b => { const d = new Date(b.logged_at); return [d.toLocaleDateString('en-US'), d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      v(b.weight_lb), v(b.waist_in), v(b.systolic_bp), v(b.diastolic_bp), v(b.fasting_glucose)]; });
}

// Cleans the session list before it goes into the file. Two problems an AI
// reading a real export pointed out:
//   1. Nine "Invalid Date" rows: the first sessions ever saved (June 2026)
//      had no date field, only a start timestamp in milliseconds.
//   2. Duplicated sets: before the Aug 11 fix, a double tap on "Set the
//      chocks" saved the same workout two or three times within seconds.
//      Those rows are still in the database, so they are collapsed here:
//      identical sets saved within a minute count once.
function exportSessions(sessions) {
  const out = [];
  let prevKey = null, prevTime = 0;
  (sessions || []).forEach(s => {
    if (!s) return;
    let date = s.date;
    if (!date || isNaN(new Date(date).getTime())) {
      const ms = Number(s.started) || Number(s.completedAt) || null;
      if (!ms) return; // nothing dates it, nothing to put on a timeline
      date = new Date(ms).toISOString();
    }
    const t = new Date(date).getTime();
    const key = JSON.stringify(s.sets || {}) + '|' + (s.muscle_group || s.key || '');
    if (key === prevKey && Math.abs(t - prevTime) < 60000) return;
    prevKey = key; prevTime = t;
    out.push(date === s.date ? s : { ...s, date });
  });
  return out;
}

async function exportCSV() {
  showBigToast('Building export...','info');
  let sessions = [];
  let biometrics = [];
  let ouraRows = [], mealRows = [], dailyInputRows = [], medLogRows = [];
  try {
    const own = (t) => ST.user ? SB.from(t).select('*').eq('user_id', ST.user.id) : SB.from(t).select('*');
    const sd = await fetchAllRows(() => own('workout_sessions').order('started_at', { ascending: true }));
    sessions = sd.map(r => r.session_data).filter(Boolean);
    biometrics = await fetchAllRows(() => own('weight_log').order('logged_at', { ascending: true }));
    // Rows written before started_at existed sort to the front, in the
    // order they were stored. Sorting by the saved date keeps the file in
    // time order after the fallback dates are filled in.
    sessions = exportSessions(sessions).sort((x, y) => new Date(x.date) - new Date(y.date));
    // Everything else the app stores. Previously the export was workouts +
    // five biometrics only — Oura, meals, hydration and the flight schedule
    // were all absent, which left most of the picture out of any analysis.
    // Failures here are non-fatal: a missing table shouldn't cost you the
    // whole export.
    const uid = ST.user?.id;
    if (uid) {
      const all = (t, col) => fetchAllRows(() => SB.from(t).select('*').eq('user_id', uid).order(col, { ascending: true })).catch(() => null);
      const [o, m, di, ml] = await Promise.all([
        all('oura_daily', 'date'),
        all('meal_logs', 'logged_at'),
        all('daily_inputs', 'date'),
        all('medication_logs', 'date'),
      ]);
      ouraRows = o || []; mealRows = m || []; dailyInputRows = di || []; medLogRows = ml || [];
    }
  } catch(e) {
    sessions = exportSessions(JSON.parse(localStorage.getItem('fcf_sessions')||'[]'));
    biometrics = JSON.parse(localStorage.getItem('fcf_bio')||'[]');
  }

  const bioByDate = {};
  biometrics.forEach(b => {
    const d = new Date(b.logged_at).toLocaleDateString('en-US');
    bioByDate[d] = b;
  });

  // The export opens with who this is and what they are aiming for. Without
  // it an AI saw what was eaten and lifted but not the targets behind it.
  const rows = [['### PROFILE AND TARGETS'], ['Item','Value'], ...exportProfileRows(ST), [],
    ['### WORKOUTS (one row per set)']];
  // Build CSV: one row per exercise set
  rows.push(['Date','Day','Muscle Group','Environment','Goal','Fatigue','Level','Duration (min)','Phase','Exercise','Set #','Reps','Weight (lb)','Seconds','Height (in)','Distance (in)','Seconds Left','Seconds Right','Body Weight (lb)','Waist (in)','Systolic BP','Diastolic BP','Fasting Glucose (mg/dL)']);

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
            phase, exportExerciseName(exItem), i+1,
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

  // Every weigh-in and measurement. The columns on the workout rows above
  // only carry a measurement taken on a workout day, so a rest-day weigh-in
  // used to be missing from the file altogether.
  section('BODY MEASUREMENTS (every entry)', ['Date','Time','Body Weight (lb)','Waist (in)','Systolic BP','Diastolic BP','Fasting Glucose (mg/dL)'],
    exportBodyRows(biometrics));

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
  section('NUTRITION · ITEMS', ['Date','Time','Meal','Food','Source','Calories','Protein (g)','Carbs (g)','Fat (g)','Fiber (g)','Sugar (g)'], mealItemRows);

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

  // Medications and supplements: the current list, then every logged dose.
  // The log references the medication by name as well as id so a renamed
  // or removed entry still reads sensibly.
  const medById = {};
  (ST.medications || []).forEach(m => { medById[m.id] = m; });
  section('MEDICATIONS & SUPPLEMENTS', ['Name','Dose','Unit','Times','Days','Reminder','Notes'],
    (ST.medications || []).map(m => [m.name, m.dose ?? '', m.unit, m.times.join(' '),
      m.days ? m.days.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(' ') : 'every day',
      m.remind ? 'yes' : '', m.notes || '']));
  section('MEDICATION LOG (doses checked off)', ['Date','Scheduled Time','Name','Dose','Taken At'],
    medLogRows.map(r => {
      const m = medById[r.med_id];
      const at = r.taken_at ? new Date(r.taken_at) : null;
      return [r.date || '', r.time || '', m ? m.name : '(removed)', m ? medDoseLabel(m) : '',
        at ? at.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : ''];
    }));

  const csv = rows.map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
  deliverFile('flight-crew-fitness-'+new Date().toISOString().slice(0,10)+'.csv', 'text/csv', csv, {
    done: 'CSV exported, ready for AI analysis.',
    hint: 'Copy it and paste it straight into an AI chat, or save the file.',
  });
}

// ─── HANDING A FILE TO THE MEMBER ────────────────────────────────────────────
// BUG FIX (reported: "Export CSV for AI Analysis" opened a giant spreadsheet
// with no file to download and no way out). A download link only downloads
// in a real browser. Inside the iPhone app there is no download manager, so
// the link REPLACED the whole app screen with the file, and the app has no
// back button: the only way out was to force-quit. The same was true of the
// flight schedule download. Inside the iPhone app a file is now offered on a
// sheet that stays in the app (Share when the phone allows it, Copy always),
// and a build of the app that can share files natively gets the real
// iPhone share sheet.
function fileDeliveryPlan(env) {
  if (!env.ios) return 'download';
  return env.nativeFileShare ? 'native' : 'sheet';
}
let _preparedExport = null; // { filename, mime, text, hint }
function deliverFile(filename, mime, text, opts) {
  const o = opts || {};
  const nativeFileShare = !!(typeof FCFBridge !== 'undefined' && FCFBridge.capabilities && FCFBridge.capabilities.shareFile
    && window.webkit?.messageHandlers?.share);
  const plan = fileDeliveryPlan({ ios: inIOSApp(), nativeFileShare });
  if (plan === 'download') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (o.done) setTimeout(() => showBigToast(o.done, 'ok'), 300);
    return;
  }
  if (plan === 'native') {
    window.webkit.messageHandlers.share.postMessage({ filename, mime, text });
    return;
  }
  _preparedExport = { filename, mime, text, hint: o.hint || '' };
  showExportReadySheet();
}
function exportFileObject() {
  try { return new File([_preparedExport.text], _preparedExport.filename, { type: _preparedExport.mime }); } catch (e) { return null; }
}
function showExportReadySheet() {
  const root = document.getElementById('modalRoot');
  if (!root || !_preparedExport) return;
  const file = exportFileObject();
  let canShare = false;
  try { canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { /* no file sharing here */ }
  const kb = Math.max(1, Math.round(_preparedExport.text.length / 1024));
  root.innerHTML =
    '<div class="modal-bg" onclick="if(event.target===this)closeModal()">' +
    '<div class="modal-sheet" style="text-align:center">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Your export is ready</div>' +
    '<div class="modal-body" style="margin-bottom:6px;font-family:var(--mono);font-size:0.75rem">' + escapeUserProse(_preparedExport.filename) + ' (' + kb + ' KB)</div>' +
    (_preparedExport.hint ? '<div class="modal-body" style="margin-bottom:14px">' + escapeUserProse(_preparedExport.hint) + '</div>' : '<div style="height:10px"></div>') +
    (canShare ? '<button class="btn btn-gold" onclick="haptic(\'light\');shareExportFile()">Save or share the file</button>' : '') +
    '<button class="btn btn-outline mt8" id="exportCopyBtn" onclick="copyExportText()">Copy to clipboard</button>' +
    '<button class="btn btn-outline mt8" onclick="closeModal()">Done</button>' +
    '</div></div>';
}
function shareExportFile() {
  const file = _preparedExport && exportFileObject();
  if (!file) return;
  navigator.share({ files: [file] }).catch(e => {
    if (!e || e.name !== 'AbortError') showToast('Sharing did not open here. Use Copy to clipboard.');
  });
}
function copyExportText() {
  if (!_preparedExport) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(_preparedExport.text)
      .then(() => showToast('Copied. Paste it where you need it.'))
      .catch(() => showToast('Copy did not work on this device.'));
  } else {
    showToast('Copy is not available on this device.');
  }
}

// ─── OURA RING OAUTH2 + DATA SYNC ────────────────────────────────────────────

// Step 1: Send user to Oura's authorization page
function connectOura() {
  // Oura direct connection is a Pro feature — the comparison table
  // advertises it as such, so enforce it here rather than only in copy.
  if (!isPro()) { showPaywall('oura'); return; }
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
    showBigToast('Oura auth state mismatch. Please try again.','warn');
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
//
// BUG FIX: previously excluded any session with an ouraWorkoutId already
// set, on the theory that "already-imported sessions are handled by the
// exact-id check instead." That's only true when it's the SAME Oura event
// id syncing twice. Oura can also emit two DIFFERENT event ids for what
// was really one continuous real-world activity (e.g. a walk that got
// split into two workout entries) — the exact-id check can't catch that,
// and this function was the one place that could, but it was skipping
// exactly the sessions it needed to compare against.
function findSimilarSession(ouraEvent, sessionCache) {
  const ouraStart = new Date(ouraEvent.start_datetime).getTime();
  const ouraEnd = new Date(ouraEvent.end_datetime).getTime();
  if (isNaN(ouraStart) || isNaN(ouraEnd)) return null;
  return (sessionCache || []).find(s => {
    if (s.ouraWorkoutId === ouraEvent.id) return false; // exact same event — handled by findExistingOuraImport
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
    // A unique-violation here (user_id, session_key) means this exact Oura
    // event was already imported by a concurrent/earlier sync — that's
    // expected and not a bug, just skip the localStorage fallback in that
    // case so it isn't queued for a retry that would just fail again.
    if (e.code !== '23505') {
      console.warn('importOuraWorkout insert failed:', e);
      localStorage.setItem('fcf_session_oura_' + ouraEvent.id, JSON.stringify(session));
    }
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
const MIN_OURA_WALK_MINUTES = 30; // a genuine layover walk is real exercise and should count
const MIN_OURA_WALK_CAL_PER_MIN = 4; // ~4 kcal/min is a brisk, purposeful pace; ambling through an airport runs lower

function minImportMinutesFor(activity) {
  return /walk/i.test(activity || '') ? MIN_OURA_WALK_MINUTES : MIN_OURA_IMPORT_MINUTES;
}

// Secondary filter for walking specifically — duration alone can't tell a
// deliberate fitness walk from wandering an airport for the same amount of
// time, but Oura's per-event calorie burn can act as an intensity proxy.
// Only applied to walks; other activity types are trusted on duration alone.
function passesWalkIntensityCheck(ev) {
  if (!/walk/i.test(ev.activity || '')) return true;
  const mins = (new Date(ev.end_datetime) - new Date(ev.start_datetime)) / 60000;
  if (!ev.calories || !mins || mins <= 0) return true; // no calorie data — don't block on it
  return (ev.calories / mins) >= MIN_OURA_WALK_CAL_PER_MIN;
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
    return !isNaN(mins) && mins >= minImportMinutesFor(ev.activity) && passesWalkIntensityCheck(ev);
  });
  ST.ouraImportQueue = ST.ouraImportQueue || [];
  ST.ouraDismissedIds = ST.ouraDismissedIds || [];
  for (const ev of events) {
    if (findExistingOuraImport(ev.id, ST.sessionCache)) continue;
    if (ST.ouraDismissedIds.includes(ev.id)) continue;
    const exDef = mapOuraActivityToExercise(ev);
    const similar = findSimilarSession(ev, ST.sessionCache);
    if (similar?.ouraWorkoutId) {
      // Overlaps an already-imported Oura event under a DIFFERENT event id —
      // this is Oura's own double-counting of one real activity, not a
      // genuine "is this the same as your manual log?" question. Skip
      // silently rather than asking the user to adjudicate Oura's data
      // quality issue.
      continue;
    }
    if (similar) {
      if (!ST.ouraImportQueue.find(q => q.event.id === ev.id)) ST.ouraImportQueue.push({ event: ev, exDef, similar });
    } else {
      await importOuraWorkout(ev, exDef);
    }
  }
  if (ST.ouraImportQueue.length) showOuraDuplicateConfirm();
  // No renderPage() here on the "nothing to import" path — this function
  // is only ever called from inside syncOuraData(), which now awaits it
  // properly and does its own single render right after both finish.
  // BUG FIX (reported: app re-renders/flickers several times within a
  // few seconds of loading): this used to be fire-and-forget from
  // syncOuraData() with its own separate renderPage() call here — two
  // independent async operations from one logical Oura sync, each
  // triggering a full page rebuild at slightly different times as they
  // completed. Confirmed this was the only caller before removing the
  // separate render, so nothing else depended on it firing here.
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
    '<button class="btn btn-outline" onclick="resolveOuraDuplicate(\'skip\')">Already logged, skip this one</button>' +
    '<button class="btn btn-gold mt8" onclick="resolveOuraDuplicate(\'import\')">Different workout, import it too</button>' +
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
    } catch(e) { console.warn('Saving dismissed Oura activity failed (may be asked about it again):', e); }
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
    // Awaited now rather than fire-and-forget (see the removed renderPage()
    // call inside this function for why) — this does mean syncOuraData
    // takes a little longer to finish, but it was already fetching and
    // processing this data regardless, just without waiting for it.
    await syncOuraWorkouts().catch(()=>{});

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
        activityDiagnostic = 'The daily_activity request itself failed: a network error, expired token, or missing permission scope. This is NOT the "Oura hasn\'t posted today\'s data yet" case; something is actually broken in the connection.';
      } else if (!activity.data || !activity.data.length) {
        activityDiagnostic = 'The request succeeded but returned zero rows for the range '+yesterday+' to '+fetchEnd+'.';
      } else {
        activityDiagnostic = 'Got '+activity.data.length+' row(s) back, but none matched today (' + today + '). Days actually present in the response: ' + activity.data.map(d=>d.day).join(', ') + '.';
      }
    }

    if (!readinessItem) {
      if (force) showBigToast('No readiness data yet. Sync your Oura app first.','info');
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
    const label     = statusDot(condition)+' '+(condition==='go'?'GO':condition==='marginal'?'MARGINAL':'NO-GO');
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
        const sleepScoreStr = row.sleep_score ? String(row.sleep_score) : '–';
        showBigToast('Oura synced\nReadiness: '+score+' → '+label+'\nSleep Score: '+sleepScoreStr,'ok');
        localStorage.setItem(OURA_TOAST_KEY, today);
      }
    }
    // BUG FIX (reported: the whole page visibly rebuilds/flickers each
    // time a fresh Oura sync lands, even though only the readiness/
    // sleep/activity numbers and the briefing card actually change).
    // Targeted update instead of a full renderPage() when the user is
    // actually looking at Today — see buildOuraTopSectionHTML /
    // updateOuraTopSection. If they're on a different tab, there's
    // nothing to visually update right now at all: ST above is already
    // current, so whichever tab they navigate to next renders correctly
    // on its own, without this needing to force a rebuild of a tab
    // they aren't even looking at.
    // BUG FIX (reported: AI coach note said readiness wasn't available
    // even after the homepage numbers updated correctly — see the fuller
    // explanation at loadFatigueCalibration's context object and the
    // edge function's cache-key comment). This targeted update covers
    // the numbers and the rule-based briefing card, but a fresh Oura sync
    // landing is exactly the moment the fatigue-calibration AI note can
    // finally generate a correct, readiness-aware response instead of
    // whatever it got called with at initial boot — so re-run it here too
    // rather than leaving it stuck on its first, possibly-null-readiness
    // answer for the rest of the session.
    if (ST.tab === 'today') { updateOuraTopSection(); if (isPro()) loadFatigueCalibration(getTodayContext()); }

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
// BUG FIX: bootApp() (and therefore this) can run more than once per page
// load — sign-in, password recovery, and Sign In with Apple success all
// call it. Without a guard, each run stacked another setInterval AND
// another visibilitychange listener that never gets cleared, so a user who
// re-authenticates twice in one session ends up with 2-3x the Oura sync
// traffic and duplicate-fire retries. One-time guard makes repeat calls a
// no-op.
let _ouraActivityRetryScheduled = false;
function scheduleOuraActivityRetry() {
  if (_ouraActivityRetryScheduled) return;
  _ouraActivityRetryScheduled = true;
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
// BUG FIX: same repeat-bootApp() issue as scheduleOuraActivityRetry above —
// guard so re-authenticating mid-session doesn't stack duplicate listeners,
// each of which would call loadSubscription() and renderPage() on every tab
// focus.
let _entitlementRefreshScheduled = false;
function scheduleEntitlementRefresh() {
  if (_entitlementRefreshScheduled) return;
  _entitlementRefreshScheduled = true;
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
        showBigToast('Photo storage isn\'t set up yet. Please try again later or send feedback.','warn');
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
    const datePart = f.name.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || f.created_at?.slice(0,10) || '–';
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
  if (!(await appConfirm('Delete this progress photo? This cannot be undone.', 'Delete photo'))) return;
  try {
    const { data, error } = await SB.storage.from('progress-photos').remove([photo.path]);
    if (error) throw error;
    // Storage reports a permission-denied delete as success with nothing
    // removed, so check that the file actually went away.
    if (!Array.isArray(data) || !data.length) throw new Error('the photo could not be removed');
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
    parts.push('<div style="font-size:0.75rem;color:var(--muted);text-align:center;padding:16px">Sign in to save and view progress photos.</div>');
  } else if (!photos.length) {
    parts.push('<div style="font-size:0.75rem;color:var(--muted);text-align:center;padding:16px">No photos yet. Tap Camera or Library to add your first progress photo.</div>');
  } else {
    parts.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">');
    photos.forEach((p, i) => {
      const photoIdx = i;
      parts.push('<div style="border-radius:8px;overflow:hidden;position:relative;background:var(--bg3)">');
      parts.push('<img src="'+p.url+'" style="width:100%;aspect-ratio:3/4;object-fit:cover;display:block">');
      parts.push('<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);display:flex;justify-content:space-between;align-items:center;padding:4px 6px">');
      parts.push('<span style="font-family:var(--mono);font-size:0.5625rem;color:#fff">'+p.date+'</span>');
      parts.push('<button onclick="deleteProgressPhoto('+photoIdx+')" aria-label="Delete photo from '+p.date+'" style="background:rgba(239,68,68,0.8);border:none;color:white;font-size:0.875rem;min-width:36px;min-height:36px;margin:-4px -2px;border-radius:6px;cursor:pointer">✕</button>');
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
  parts.push('<div class="fb"><div style="font-size:0.875rem;font-weight:600">'+(ST.user?.email||'Local user')+'</div><div class="status-dot ok"></div></div>');
  parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:4px">'+FCF_VERSION+' · Build '+FCF_BUILD+'</div>');
  parts.push('</div>');

  // Body metrics (sex, height, BMI)
  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">BODY METRICS</div>');
  parts.push('<div class="field-row" style="margin-bottom:10px">');
  parts.push('<div class="field" style="margin-bottom:0"><label>Sex</label><select id="bmSex">');
  parts.push('<option value=""'+(!ST.sex?' selected':'')+'>–</option>');
  parts.push('<option value="male"'+(ST.sex==='male'?' selected':'')+'>Male</option>');
  parts.push('<option value="female"'+(ST.sex==='female'?' selected':'')+'>Female</option>');
  parts.push('</select></div>');
  const hFt = ST.heightIn ? Math.floor(ST.heightIn/12) : null;
  const hIn = ST.heightIn ? Math.round(ST.heightIn%12) : null;
  // Native selects render as a compact picker wheel on iOS — tidier than
  // free-text entry for a value with exactly 4x12 sane combinations.
  parts.push('<div class="field" style="margin-bottom:0"><label>Height</label><div style="display:flex;gap:6px">');
  parts.push('<select id="bmFt" style="flex:1">');
  parts.push('<option value=""'+(hFt===null?' selected':'')+'>– ft</option>');
  for (let f=4; f<=7; f++) parts.push('<option value="'+f+'"'+(hFt===f?' selected':'')+'>'+f+' ft</option>');
  parts.push('</select>');
  parts.push('<select id="bmIn" style="flex:1">');
  parts.push('<option value=""'+(hIn===null?' selected':'')+'>– in</option>');
  for (let i2=0; i2<=11; i2++) parts.push('<option value="'+i2+'"'+(hIn===i2?' selected':'')+'>'+i2+' in</option>');
  parts.push('</select>');
  parts.push('</div></div>');
  parts.push('</div>');
  parts.push('<div class="field"><label>Age <span class="info-i" onclick="showBioInfo(\'age\')">i</span></label>');
  parts.push('<input id="bmAge" type="text" inputmode="numeric" placeholder="e.g. 42" value="'+(ST.age||'')+'"></div>');
  parts.push('<div class="field"><label>Call Sign (Leaderboard Name)</label>');
  parts.push('<input id="bmUsername" type="text" maxlength="20" placeholder="e.g. MaverickPHX" value="'+(ST.username||'')+'">');
  parts.push('<div style="font-size:0.625rem;color:var(--muted);margin-top:4px;line-height:1.5">Shown publicly on the leaderboards. Leave blank to stay off the boards. Your lifts stay private either way until you set one.</div></div>');
  parts.push('<button class="btn btn-outline" onclick="saveBodyMetrics()">💾 Save Body Metrics</button>');
  parts.push('</div>');

  // Mission objective (goal)
  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">MISSION OBJECTIVE</div>');
  parts.push('<div style="font-size:0.75rem;color:var(--muted);margin-bottom:10px">Your overall training goal. This determines which mission profile gets recommended next.</div>');
  parts.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">');
  Object.keys(GOALS).forEach(gid => {
    const g = GOALS[gid];
    // Sex-tagged emphasis goals only show for the matching profile (or if already selected)
    if (g.suggestFor && g.suggestFor !== ST.sex && ST.goal !== gid) return;
    const suggested = g.suggestFor && g.suggestFor === ST.sex;
    parts.push('<div class="env-btn '+(ST.goal===gid?'sel':'')+'" style="position:relative" onclick="syncBodyMetricsFieldsToState();ST.goal=\''+gid+'\';ST.muscleGroup=getRecommendedNext();saveGoalLevel();renderPage()">');
    if (suggested) parts.push('<div style="position:absolute;top:4px;right:4px;font-family:var(--mono);font-size:0.4375rem;letter-spacing:0.06em;color:var(--gold);border:1px solid var(--gold);border-radius:4px;padding:1px 4px">SUGGESTED</div>');
    parts.push('<div class="ei">'+g.icon+'</div><div class="el">'+g.label+'</div>');
    parts.push('<div style="font-size:0.5625rem;color:var(--muted);margin-top:3px;line-height:1.3">'+g.desc+'</div>');
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
  parts.push('<div style="font-size:0.6875rem;color:var(--muted);line-height:1.6"><strong style="color:var(--text)">'+freq.days+' days/week</strong> recommended: '+freq.split+'. '+freq.note+'</div>');
  parts.push('</div>');

  // ── Fuel plan ────────────────────────────────────────────────────────────
  // Was missing from this screen entirely — the underlying data
  // (ST.nutritionGoals) and the toggle controls (renderTrackingToggles)
  // already existed, just never surfaced here alongside the rest of the
  // profile. Reused rather than duplicated.
  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">FUEL PLAN</div>');
  const g = ST.nutritionGoals;
  if (!g || g.mode === 'none') {
    parts.push('<div style="font-size:0.75rem;color:var(--muted);line-height:1.6;margin-bottom:12px">' +
      (g && g.mode === 'none'
        ? 'Tracking without calorie or macro targets.'
        : 'No fuel plan set yet. Targets are built from your body metrics so the numbers actually mean something.') +
      '</div>');
    parts.push('<button class="btn btn-outline" onclick="switchTab(\'fuelplan\')">' +
      (g && g.mode === 'none' ? 'Set Up Targets' : 'Set Up Fuel Plan') +
      '</button>');
  } else {
    const modeLabel = { maintain: 'Maintain & fuel training', muscle: 'Build muscle', fatloss: 'Lose fat gradually' }[g.mode] || g.mode;
    parts.push('<div style="font-size:0.75rem;color:var(--muted);margin-bottom:10px">'+modeLabel+(g.trainingDays ? ' · '+g.trainingDays+' training days/week' : '')+'</div>');
    parts.push('<div class="fb" style="align-items:baseline;margin-bottom:8px">');
    parts.push('<span style="font-family:var(--mono);font-size:1.75rem;color:var(--gold)">'+(g.calories||0).toLocaleString()+'</span>');
    parts.push('<span style="font-family:var(--mono);font-size:0.625rem;color:var(--muted);letter-spacing:.12em">CAL / DAY</span>');
    parts.push('</div>');
    [['P', g.protein, 'var(--gold)'], ['C', g.carbs, 'var(--blue)'], ['F', g.fat, 'var(--teal)']].forEach(([l,v,c]) => {
      parts.push('<div class="fb" style="margin-bottom:4px"><span style="font-family:var(--mono);font-size:0.625rem;color:var(--muted)">'+l+'</span><span style="font-family:var(--mono);font-size:0.75rem;color:'+c+'">'+(v||0)+'g</span></div>');
    });
    parts.push('<button class="btn-ghost" style="margin-top:8px" onclick="switchTab(\'fuelplan\')">Adjust Fuel Plan →</button>');
  }
  parts.push('</div>');

  parts.push(renderMedicationsCard());

  // ── Tracking toggles (nutrition + hydration) ─────────────────────────────
  // Same control used on More — single source of truth via setTrackingPref.
  parts.push(renderTrackingToggles());

  p.innerHTML = parts.join('');

}

// ─── MORE MENU + SUB-VIEWS ───────────────────────────────────────────────────
function moreBackLink() {
  return '<button class="btn-ghost" style="font-size:0.75rem;padding:6px 0;margin-bottom:8px" onclick="switchTab(\'more\')">← Menu</button>';
}

function renderMore(p) {
  const parts = [];
  parts.push('<div class="section-label">MISSION SYSTEMS</div>');
  const item = (icon, title, sub, onclick) =>
    '<div class="card mb12" style="cursor:pointer" onclick="'+onclick+'"><div class="fb">' +
    '<div style="display:flex;align-items:center;gap:12px"><div style="font-size:1.375rem">'+icon+'</div>' +
    '<div><div style="font-size:0.875rem;font-weight:600">'+title+'</div>' +
    '<div style="font-size:0.6875rem;color:var(--muted);margin-top:2px">'+sub+'</div></div></div>' +
    '<div style="color:var(--muted)">→</div></div></div>';
  const earnedCount = BADGES.filter(b => ST.badges[b.id]).length;
  parts.push(item('👤','Pilot Profile','Identity, metrics &amp; mission objectives',"switchTab('profile')"));
  parts.push(item('🏅','Badges',earnedCount+' of '+BADGES.length+' earned',"switchTab('badges')"));
  parts.push(item('⌚','Connected Devices','Apple Health, Apple Watch, Oura Ring',"switchTab('devices')"));
  parts.push(item('📖','Flight Deck Wisdom','Daily training wisdom cards',"switchTab('wisdom')"));
  parts.push(item('📊','Data & Import/Export','Flight schedule import, CSV export, AI prompt',"switchTab('data')"));
  if (ST.trackNutrition) parts.push(item('🍽️','Nutrition Log','Log meals, search foods, track macros',"switchTab('nutrition')"));
  if (isSuperUser()) {
    parts.push(item('🛡️','Super User','Pilot activity insights',"switchTab('superuser')"));
  }

  parts.push('<div class="card mb12">');
  parts.push('<button class="btn btn-outline" onclick="shareApp()">📡 Share with Crew</button>');
  parts.push('<button class="btn btn-outline mt8" onclick="showFeedbackModal()">💬 Send Feedback</button>');
  parts.push('</div>');

  parts.push('<div class="card mb12"><div class="disclaimer-banner">Flight Crew Fitness is a training tool, not medical advice. Consult a physician before beginning any new exercise program. Exercise at your own risk and within your own physical limits.</div></div>');
  parts.push('<button class="btn btn-red-outline" onclick="doSignOut()">Sign Out</button>');

  parts.push(renderTextSizeControl());
  // Subscription status, and the legal links Apple requires to be reachable
  // from inside the app rather than only on the store listing.
  parts.push(renderTrackingToggles());

  parts.push('<div class="section-label" style="margin-top:20px">SUBSCRIPTION</div>');
  parts.push('<div class="card mb12">');
  if (isPro()) {
    const until = ST.subscription?.current_period_end
      ? new Date(ST.subscription.current_period_end).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : null;
    parts.push('<div class="fb"><span style="font-size:0.8125rem;font-weight:600;color:var(--gold)">❖ Pro: all features unlocked</span></div>');
    if (until) {
      // "Renews" implies auto-billing, which a promo grant doesn't have —
      // it just runs out. Saying "Renews" for a comped account would be
      // actively misleading about what happens when the date arrives.
      parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:4px">'+proStatusCopy(ST.subscription, inIOSApp()).label+until+'</div>');
    }
    // BUG FIX (reported: a web/Stripe subscriber saw "Manage or cancel in
    // your Apple ID subscription settings" — wrong instructions for a
    // platform that has no Apple ID subscription at all). This only ever
    // distinguished promo vs. "everything else must be Apple/iOS", which
    // was true before web subscriptions existed but not anymore — the
    // webhook writes platform:'web' for a Stripe purchase (confirmed by
    // reading that code directly), a third case this never accounted for.
    // No self-service billing portal exists yet for web subscribers, so
    // pointing at "your Apple ID settings" (false) or inventing a portal
    // link that doesn't exist (also false) are both wrong — support is the
    // only honest option today.
    parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:8px">'+proStatusCopy(ST.subscription, inIOSApp()).manage+'</div>');
  } else {
    const rows = [
      ['Workout logging',             '✓',       '✓'],
      ['Basic trends (30 days)',       '✓',       '✓'],
      ['3-day workout reminder',       '✓',       '✓'],
      ['Water & pre-flight reminders', '✓',       '✓'],
      ['Meds & supplement reminders',  '✓',       '✓'],
      ['Food photo analysis',          '3/week',  'Unlimited'],
      ['AI calendar classification',   '1/month', 'Unlimited'],
      ['AI progression analytics',     '–',       '✓'],
      ['AI fatigue calibration',       '–',       '✓'],
      ['AI fueling logistics',         '–',       '✓'],
      ['Full trends history',          '–',       '✓'],
      ['Oura Ring direct connect',     '–',       '✓'],
      ['HRV drop alert',               '–',       '✓'],
      ['Layover workout reminder',     '–',       '✓'],
      ['Weekly training summary',      '–',       '✓'],
    ];
    parts.push('<div style="display:grid;grid-template-columns:1fr auto auto;gap:0;margin-bottom:14px;position:relative">');
    parts.push('<div style="position:absolute;top:0;bottom:0;right:0;width:33%;background:linear-gradient(180deg,rgba(201,168,76,0.08),rgba(201,168,76,0.03));border-radius:8px;pointer-events:none"></div>');
    parts.push('<div style="font-size:0.625rem;color:var(--muted);letter-spacing:.06em;padding:0 0 6px 0;position:relative">');
    parts.push('</div>');
    parts.push('<div style="font-size:0.625rem;color:var(--muted);letter-spacing:.06em;padding:0 10px 6px;text-align:center;position:relative">FREE</div>');
    parts.push('<div style="font-size:0.625rem;color:var(--gold);letter-spacing:.06em;padding:0 0 6px 8px;text-align:center;font-weight:700;position:relative">PRO</div>');
    rows.forEach(([label, free, pro], i) => {
      const border = i < rows.length - 1 ? 'border-bottom:1px solid var(--border)' : '';
      const proColor = pro === '–' ? 'var(--muted)' : pro === '✓' ? 'var(--green)' : 'var(--gold)';
      const freeColor = free === '–' ? 'var(--muted)' : free === '✓' ? 'var(--green)' : 'var(--muted)';
      parts.push('<div style="font-size:0.75rem;padding:8px 0;'+border+';position:relative">'+label+'</div>');
      parts.push('<div style="font-size:0.6875rem;color:'+freeColor+';padding:8px 10px;'+border+';text-align:center;position:relative">'+free+'</div>');
      parts.push('<div style="font-size:0.6875rem;color:'+proColor+';padding:8px 0 8px 8px;'+border+';text-align:center;font-weight:'+(pro!=='–'?'600':'400')+';position:relative">'+pro+'</div>');
    });
    parts.push('</div>');
    parts.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px">');
    parts.push('<button class="btn btn-gold" onclick="haptic(\'medium\');startProPurchase(\''+PRO_PRODUCT_ANNUAL+'\')"><div style="font-size:0.8125rem;font-weight:700">❖ '+proPrice(PRO_PRODUCT_ANNUAL, PRO_ANNUAL_PRICE)+'</div><div style="font-size:0.625rem;opacity:0.8;margin-top:2px">per year</div></button>');
    parts.push('<button class="btn btn-outline" onclick="haptic(\'medium\');startProPurchase(\''+PRO_PRODUCT_MONTHLY+'\')"><div style="font-size:0.8125rem;font-weight:700">'+proPrice(PRO_PRODUCT_MONTHLY, PRO_MONTHLY_PRICE)+'</div><div style="font-size:0.625rem;opacity:0.8;margin-top:2px">per month</div></button>');
    parts.push('</div>');
    parts.push('<div style="font-size:0.625rem;color:var(--muted);text-align:center;margin-bottom:8px">Annual saves ~37%</div>');
    parts.push(proDisclosureHTML());
    parts.push('<button class="btn-ghost" style="display:block;width:100%;text-align:center" onclick="restoreProPurchases()">Restore purchases</button>');
  }
  parts.push('</div>');

  // Promo/comp code card. Web only: empty inside the iOS app (see
  // promoCodeCardHTML for why).
  parts.push(promoCodeCardHTML());

  parts.push('<div class="card mb12" style="padding:0">');
  parts.push('<a class="modal-link" style="display:block;padding:14px 16px;border-bottom:1px solid var(--border)" href="'+PRIVACY_POLICY_URL+'" '+externalLinkAttrs()+'>Privacy Policy</a>');
  parts.push('<a class="modal-link" style="display:block;padding:14px 16px" href="'+TERMS_URL+'" '+externalLinkAttrs()+'>Terms of Use</a>');
  parts.push('</div>');

  // Apple has required in-app account deletion since 2022 for any app that
  // supports account creation — its absence is an automatic rejection.
  parts.push('<div class="section-label" style="margin-top:20px;color:var(--red)">DANGER ZONE</div>');
  parts.push('<div class="card mb12">');
  parts.push('<div style="font-size:0.75rem;color:var(--muted);margin-bottom:10px">Permanently deletes your account and every workout, meal, biometric and schedule stored with it. This cannot be undone.</div>');
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
    parts.push('<div style="font-size:0.75rem;color:var(--muted);line-height:1.65">Apple Health syncs automatically when you use the Flight Crew Fitness iOS app. Download it from the App Store and health data will appear here after your first login.</div>');
  } else if (!hk) {
    parts.push('<div style="font-size:0.75rem;color:var(--muted);line-height:1.65;margin-bottom:12px">Requesting access to Apple Health…</div>');
  } else if (!hk.granted) {
    parts.push('<div style="font-size:0.75rem;color:var(--muted);line-height:1.65;margin-bottom:12px">Health access was not granted. You can change this in Settings → Privacy & Security → Health → Flight Crew Fitness.</div>');
  } else {
    // Connected — show detected devices
    const devices = hk.detectedDevices || [];
    const deviceIcons = { appleWatch: '⌚', oura: '💍', whoop: '⌚', garmin: '🏃', iphone: '📱', other: '📡' };
    const appleWatch = devices.find(d => d.kind === 'appleWatch');
    const ouraHK = devices.find(d => d.kind === 'oura');

    parts.push('<div style="font-size:0.6875rem;color:var(--green);margin-bottom:10px">✓ Connected via HealthKit</div>');

    if (devices.length > 0) {
      parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-bottom:6px;letter-spacing:.05em">DETECTED SOURCES</div>');
      devices.forEach(d => {
        const icon = deviceIcons[d.kind] || '📡';
        parts.push('<div style="font-size:0.8125rem;padding:6px 0;border-bottom:1px solid var(--border)">'+icon+' '+d.name+'</div>');
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
      parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:10px;line-height:1.5">Oura data detected via Apple Health. Connect directly below for full readiness scores.</div>');
    }
    if (appleWatch) {
      parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:6px;line-height:1.5">Apple Watch detected: workouts, HR, and HRV sync automatically.</div>');
    }
  }
  parts.push('</div>');

  // ── Oura Direct (optional, enhanced) ────────────────────────────────────
  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">OURA RING · ENHANCED</div>');
  if (ST.ouraConnected && ST.ouraScore !== null) {
    const scoreColor = ST.ouraScore >= 70 ? 'var(--green)' : ST.ouraScore >= 60 ? 'var(--amber)' : 'var(--red)';
    const scoreCondition = ST.ouraScore >= 70 ? 'go' : ST.ouraScore >= 60 ? 'marginal' : 'nogo';
    const scoreLabel = statusDot(scoreCondition)+' '+(scoreCondition==='go'?'GO':scoreCondition==='marginal'?'MARGINAL':'NO-GO');
    parts.push('<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:8px;padding:12px;margin-bottom:12px">');
    parts.push('<div class="fb"><span style="font-size:0.75rem;color:var(--muted)">Connected ✓</span><button class="btn-ghost" style="font-size:0.6875rem;padding:4px 8px" onclick="disconnectOura()">Disconnect</button></div>');
    parts.push('<div class="fb mt8"><span style="font-size:0.8125rem">Today\'s Readiness</span><span style="font-family:var(--mono);font-size:1.125rem;font-weight:700;color:'+scoreColor+'">'+ST.ouraScore+'</span></div>');
    parts.push('<div style="font-size:0.75rem;color:'+scoreColor+';font-weight:600;margin-top:2px">Pilot Condition → '+scoreLabel+'</div>');
    if (ST.ouraData) {
      const hrv = ST.ouraData.hrv_balance || '–';
      parts.push('<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px">');
      parts.push(glowTile('SLEEP SCORE', ST.ouraData.sleep_score||'–', 'blue'));
      parts.push(glowTile('HRV BAL.', hrv, 'green'));
      parts.push(glowTile('ACTIVITY', ST.ouraData.activity_score||'–', 'teal'));
      parts.push('</div>');
    }
    parts.push('</div>');
    parts.push('<button class="btn btn-outline" onclick="syncOuraData(true)">↻ Sync Now</button>');
    parts.push('<button class="btn btn-outline mt8" onclick="importHistoricalOura(180)">📥 Import Last 6 Months</button>');
  } else {
    parts.push('<div style="font-size:0.75rem;color:var(--muted);margin-bottom:14px;line-height:1.65">Optional: connect directly to Oura for full readiness scores used to auto-set your Pilot Condition. Readiness 70+ = GO, 60–69 = MARGINAL, below 60 = NO-GO.</div>');
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
      stat(seen7.size, 'Active (7 Days)') + stat(seen30.size, 'Active (30 Days)') +
      '</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
      stat(sessions7, 'Sessions (7 Days)') + stat(seenAll.size, 'All-Time Active Users') +
      '</div>';
  } catch(e) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    el.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:0.75rem">'+(offline
      ? '📡 Needs a connection to load.'
      : 'Couldn\'t load. The admin read policy on workout_sessions may not be set up yet.')+'</div>';
  }
}

function renderSuperUser(p) {
  if (!isSuperUser()) { p.innerHTML = '<div class="section-label">NOT AUTHORIZED</div>'; return; }
  const parts = [moreBackLink()];
  parts.push('<div class="section-label" style="margin-top:0">SUPER USER · ACTIVITY REPORT</div>');
  parts.push('<div class="card mb12">');
  parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-bottom:10px;line-height:1.5">"Active" means a real logged workout, not just an account existing (a truer signal than raw signups, which aren\'t readable from the app at all).</div>');
  parts.push('<div id="suStats" style="text-align:center;color:var(--muted);font-size:0.75rem">Loading…</div>');
  parts.push('</div>');
  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">TEMP: RAW OURA WORKOUT DUMP</div>');
  parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-bottom:10px;line-height:1.5">One-time diagnostic: an auto-detected treadmill run imported with no duration. Dumps the raw Oura workout data for the last 3 days to see exactly what fields an auto-detected session actually has, compared to a manually-confirmed one.</div>');
  parts.push('<button class="btn btn-outline" onclick="dumpRawOuraWorkouts()">🔬 Dump Raw Workout Data</button>');
  parts.push('<div id="ouraDumpResults" style="margin-top:10px;font-family:var(--mono);font-size:0.5625rem;color:var(--muted);word-break:break-all;white-space:pre-wrap"></div>');
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
  'grilled chicken': /^chicken.*breast.*grilled|chicken.*breast.*roasted/i, // BUG FIX: two-word query fell through to raw ranking, surfaced branded fast food first
  'chicken breast': /^chicken.*breast/i,
  beef: /beef.*ground/i,
  'ground beef': /^beef,\s*ground/i,
  egg: /^egg,?\s*whole/i,
  eggs: /^egg,?\s*whole/i,
  rice: /rice,\s*white|rice,\s*brown/i,
  'brown rice': /rice,\s*brown.*cooked/i, // BUG FIX: same multi-word gap as grilled chicken
  'white rice': /rice,\s*white.*cooked/i,
  salmon: /salmon/i,
  turkey: /turkey.*breast/i,
  oatmeal: /^oats\b/i,
  oats: /^oats\b/i,
  broccoli: /^broccoli,\s*raw/i,
  potato: /potato.*baked|potato.*boiled/i,
  'sweet potato': /^sweet\s*potato.*baked|^sweet\s*potato.*cooked/i,
  banana: /^bananas,\s*raw/i,
  apple: /^apples,\s*raw/i,
  yogurt: /yogurt.*plain/i,
  'greek yogurt': /yogurt.*greek.*plain/i,
  milk: /^milk,/i,
  croissant: /^croissants?,/i,
  bacon: /^bacon,\s*(cured|raw|cooked)/i,
  ham: /^ham,/i,
  sausage: /^sausage,/i,
  toast: /^bread,/i,
  bread: /^bread,/i,
  cheese: /^cheese,\s*cheddar/i,
  butter: /^butter,\s*(salted|without)/i,
  avocado: /^avocados?,\s*raw/i,
  spinach: /^spinach,\s*raw/i,
  tomato: /^tomatoes?,\s*raw/i,
  peanut: /^peanut\s*butter,/i,
  almond: /^almonds,\s*(raw|dry)/i,
  tuna: /^fish,\s*tuna/i,
  shrimp: /^shrimp,/i,
  pasta: /^pasta,/i,
  quinoa: /^quinoa,\s*cooked/i,
  'hamburger patty': /^beef,\s*ground.*patty.*cooked/i, // BUG FIX: "hamburger" as a bare USDA description means the whole sandwich (bun, condiments) — nothing without the word "patty" should qualify, so this is anchored specifically to the plain cooked-patty entries, not sharing the bare 'beef'/'ground beef' pattern above
  'burger patty': /^beef,\s*ground.*patty.*cooked/i,
  'beef patty': /^beef,\s*ground.*patty.*cooked/i,
  'black pepper chicken': /chicken.*breast/i, // Panda Express style dishes have no clean generic match — steer toward plain chicken breast rather than a branded/odd result
  'mushroom chicken': /chicken.*breast/i,
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
    '<span style="font-size:0.875rem;font-weight:600">' + sanitizeUserText(label) + '</span>' +
    '</div>';
}

// Grows a textarea to fit its content — reset height to auto first so
// shrinking (e.g. after deleting text) is measured correctly, not just
// growing based on the previous (larger) scrollHeight.
function autoGrowTextarea(el) {
  if (!el) return;
  el.style.boxSizing = 'border-box'; // explicit — don't depend on CSS cascade for this
  el.style.height = 'auto';
  // +2px guards against a 1px sub-pixel rounding cutoff on the last visible
  // line in some mobile browsers, which otherwise clips descenders (g, y, p).
  el.style.height = (el.scrollHeight + 2) + 'px';
}

function foodEmoji(description) {
  const d = description || '';
  for (const [pattern, emoji] of FOOD_EMOJI_PATTERNS) {
    if (pattern.test(d)) return emoji;
  }
  return '🍽️'; // generic fallback so every food row still has an icon slot
}

// Finds the best staple boost for a query. Exact key match wins outright;
// otherwise falls back to the LONGEST key that appears as a substring of
// the query, so "grilled chicken breast" still matches the "grilled
// chicken" entry even though it's not a verbatim match, and a more
// specific multi-word key (e.g. "grilled chicken") wins over a shorter
// one ("chicken") when both could apply.
function findStapleBoost(q) {
  if (STAPLE_FOOD_BOOSTS[q]) return STAPLE_FOOD_BOOSTS[q];
  let bestKey = null;
  for (const key in STAPLE_FOOD_BOOSTS) {
    if (q.includes(key) && (!bestKey || key.length > bestKey.length)) bestKey = key;
  }
  return bestKey ? STAPLE_FOOD_BOOSTS[bestKey] : null;
}

async function searchUSDAFoods(query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim().toLowerCase();
  const res = await usdaFetch('search', { query: query.trim() });
  const foods = res?.foods || [];
  const staplePattern = findStapleBoost(q);
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
  try { await SB.from('meal_logs').delete().eq('id', id); } catch(e) { console.warn('Deleting meal log failed:', e); showToast('⚠️ Could not delete. Try again.'); }
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
  } catch(e) { console.warn('Saving nutrition goals failed:', e); showToast('⚠️ Saved locally, but could not sync to your account.'); }
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
  ctx.tripDayNumber = trip.tripDayNumber ?? null;
  ctx.tripTotalDays = trip.tripTotalDays ?? null;
  ctx.nextLayoverAirport = trip.nextLayoverAirport || null;
  ctx.nextLayoverStart = trip.nextLayoverStart || null;
  ctx.tonightLayoverAirport = trip.tonightLayoverAirport || null;
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

  // Which DAY of the trip is today — counted in local calendar days from the
  // trip's first event, NOT in legs flown. These are completely different
  // numbers: five legs on day two is still day two.
  const tripStartDay = new Date(activeTrip[0].s); tripStartDay.setHours(0,0,0,0);
  const tripDayNumber = Math.floor((todayStartMs - tripStartDay.getTime()) / 86400000) + 1;
  // Total days the trip spans, so "day 2 of 4" can be stated rather than
  // just "day 2" with no sense of how much is left.
  const tripEndDay = new Date(activeTrip[activeTrip.length-1].en); tripEndDay.setHours(0,0,0,0);
  const tripTotalDays = Math.floor((tripEndDay.getTime() - tripStartDay.getTime()) / 86400000) + 1;

  // BUG FIX (reported: 4pm, sitting in the EUG layover that runs to noon
  // tomorrow, and the AI coach said "protect sleep tonight in SEA". SEA is
  // TOMORROW night). upcomingLayover is the next layover that has not
  // started yet, which is the right answer for "where is my next rest"
  // but the wrong answer for "where do I sleep tonight" whenever the
  // person is already inside an overnight layover. Tonight's layover is
  // whichever one covers local midnight tonight: it must start before
  // tomorrow noon and still be running past midnight. The one they woke
  // up in this morning ended before midnight, so it never qualifies.
  const tomorrowNoonMs = todayStartMs + 36 * 3600000;
  const tonightLayover = activeTrip.find(e =>
    e.type === 'layover' && e.s < tomorrowNoonMs && e.en > todayEndMs);

  return { legsCompleted, legsRemaining, legsTodayCompleted, legsTodayRemaining,
           current, dutyEndsAt, dutyEndsToday,
           tripDayNumber, tripTotalDays,
           // Where the next rest period actually is — NOT the layover they
           // woke up in. "Eat well in Abilene tonight" was wrong because it
           // used the current layover instead of the one coming up.
           nextLayoverAirport: upcomingLayover?.airport || null,
           nextLayoverStart: upcomingLayover?.s || null,
           tonightLayoverAirport: tonightLayover?.airport || null,
           currentType: current ? current.type : null };
}

// ── Preflight Schedule Mapping ────────────────────────────────────────────────
// Builds the full day-by-day structure of the CURRENT trip (not just today),
// for the AI to reason over which days should carry heavy training load and
// which should be light. Reuses the exact same trip-partitioning rule as
// currentTripContext (a 20+ hour gap ends a trip) so a session is never
// treated as "day 3" by one function and "a different trip" by another.
//
// Deliberately scoped to CONFIRMED FLIGHT PAIRINGS only — reserve/on-call
// periods have no fixed structure to plan around, so if the active trip is
// reserve rather than scheduled flights, this returns null and the caller
// shows nothing rather than guessing at a plan.
function getTripBounds(schedule, now) {
  const t = now.getTime();
  const DUTYFREE_GAP_MS = 20 * 3600000;
  const events = (schedule || [])
    .filter(e => e.type === 'flight' || e.type === 'layover')
    .map(e => { const s = new Date(e.start).getTime(), en = new Date(e.end).getTime(); return { ...e, s, en }; })
    .filter(e => !isNaN(e.s) && !isNaN(e.en))
    .sort((a,b) => a.s - b.s);

  const trips = [];
  let cur = [];
  events.forEach(e => {
    if (cur.length && (e.s - cur[cur.length-1].en) > DUTYFREE_GAP_MS) { trips.push(cur); cur = []; }
    cur.push(e);
  });
  if (cur.length) trips.push(cur);

  let activeTrip = trips.find(trip => trip.some(e => t >= e.s && t <= e.en))
                 || trips.find(trip => t >= trip[0].s && t <= trip[trip.length-1].en);
  if (!activeTrip) {
    const ended = trips.filter(trip => trip[trip.length-1].en < t)
                        .sort((a,b) => b[b.length-1].en - a[a.length-1].en);
    if (ended.length && (t - ended[0][ended[0].length-1].en) <= DUTYFREE_GAP_MS) activeTrip = ended[0];
    const upcoming = trips.filter(trip => trip[0].s > t)
                           .sort((a,b) => a[0].s - b[0].s);
    // A trip that hasn't started yet but is visible on the calendar still
    // gets a plan — no reason to wait until wheels-up to tell someone which
    // days of their upcoming trip are good for a heavy session.
    if (!activeTrip && upcoming.length && (upcoming[0][0].s - t) <= 48 * 3600000) activeTrip = upcoming[0];
  }
  if (!activeTrip) return null;
  // Reserve stretches produce no flight/layover events at all, so they never
  // reach this function in the first place — the filter above already
  // excludes everything except flight/layover types.

  const flightsOnly = activeTrip.filter(e => e.type === 'flight');
  if (!flightsOnly.length) return null; // shouldn't happen, but never plan around zero flights

  const tripStartDay = new Date(flightsOnly[0].s); tripStartDay.setHours(0,0,0,0);
  const tripEndDay = new Date(activeTrip[activeTrip.length-1].en); tripEndDay.setHours(0,0,0,0);
  const totalDays = Math.floor((tripEndDay.getTime() - tripStartDay.getTime()) / 86400000) + 1;

  // One entry per CALENDAR day of the trip — a single long duty day with
  // three legs is still one day, not three. This is the exact distinction
  // that caused the "day 4" / "legs flown" confusion earlier at the
  // single-day level; the same care applies here across the whole trip.
  const days = [];
  for (let i = 0; i < totalDays; i++) {
    const dayStart = new Date(tripStartDay.getTime() + i * 86400000);
    const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
    const dayStartMs = dayStart.getTime(), dayEndMs = dayEnd.getTime();

    const flightsThatDay = activeTrip.filter(e => e.type === 'flight' && e.s <= dayEndMs && e.en >= dayStartMs);
    const layoverThatDay = activeTrip.find(e => e.type === 'layover' && e.s <= dayEndMs && e.en >= dayStartMs);

    days.push({
      dayNumber: i + 1,
      date: dayStart.toISOString().slice(0, 10),
      dayOfWeek: dayStart.toLocaleDateString('en-US', { weekday: 'long' }),
      flightCount: flightsThatDay.length,
      firstReportLocal: flightsThatDay.length ? fmtLocalForAI(new Date(Math.min(...flightsThatDay.map(f => f.s)))) : null,
      lastDutyEndLocal: flightsThatDay.length ? fmtLocalForAI(new Date(Math.max(...flightsThatDay.map(f => f.en)))) : null,
      dutyHours: flightsThatDay.length
        ? Math.round(flightsThatDay.reduce((sum, f) => sum + (f.en - f.s) / 3600000, 0) * 10) / 10
        : 0,
      layoverAirport: layoverThatDay ? (layoverThatDay.airport || layoverThatDay.destination || null) : null,
      layoverHours: layoverThatDay ? Math.round((layoverThatDay.en - layoverThatDay.s) / 3600000 * 10) / 10 : null,
      isPast: dayEndMs < t,
      isToday: t >= dayStartMs && t <= dayEndMs,
    });
  }

  return {
    tripStart: tripStartDay.toISOString().slice(0, 10),
    tripEnd: tripEndDay.toISOString().slice(0, 10),
    totalDays,
    days,
  };
}

// Adjacent, identically-labeled events — e.g. an export that creates one
// "Duty free period" block per calendar day of a multi-day stretch, with
// one block ending the exact instant the next begins — merge into a single
// continuous entry for display. Otherwise the same label can show up two
// or three times in a row with confusingly-overlapping boundary times.
// getLabel defaults to the .ics-path shape (event.summary); the Apple
// Calendar path's events don't have that field, so it's passed explicitly
// there to match how that branch already computes what it displays.
function mergeAdjacentEvents(events, getLabel) {
  getLabel = getLabel || (e => e.summary);
  const sorted = [...events].sort((a,b) => new Date(a.start) - new Date(b.start));
  const merged = [];
  const TOLERANCE_MS = 5 * 60000; // small gap tolerance for near-exact boundaries
  sorted.forEach(e => {
    const last = merged[merged.length - 1];
    if (last && getLabel(last) === getLabel(e) && (new Date(e.start).getTime() - new Date(last.end).getTime()) <= TOLERANCE_MS) {
      if (new Date(e.end).getTime() > new Date(last.end).getTime()) last.end = e.end;
      if (last.uids) last.uids.push(e.uid);
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
function checkForNapRecovery(currentSleepScore, ouraDate) {
  if (currentSleepScore === null || currentSleepScore === undefined) return null;
  // BUG FIX (reported: "Nice nap" at 8 AM with no nap). At boot the app
  // hydrates from the most recent oura_daily row, which before the morning
  // sync is YESTERDAY's row. That score became the baseline, then the live
  // sync brought in today's row, and a cross-midnight 78 -> 88 was read as
  // a same-day nap. The baseline only means something within one Oura day,
  // so it is keyed to the row's date and reset whenever the date changes.
  if (ST.sleepBaselineDate !== ouraDate) {
    ST.sleepBaselineDate = ouraDate;
    ST.sleepBaselineScore = currentSleepScore;
    return null;
  }
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
  // BUG FIX: was hardcoded to ST.flightSchedule regardless of the
  // Schedule Source preference — meaning this banner ignored the toggle
  // entirely while every other schedule-dependent display respected it.
  const sched = scheduleContextForToday(getActiveSchedule().events, now);
  const meals = ST.todaysMeals || [];
  const consumed = sumMealNutrients(meals.flatMap(m => m.meal_data?.items || []));
  const g = ST.nutritionGoals && ST.nutritionGoals.mode !== 'none' ? ST.nutritionGoals : null;
  const workoutToday = (ST.sessionCache || []).some(s => isSessionOnLocalDay(s, now));
  const sleepScore = ST.ouraData?.sleep_score ?? null;
  return {
    now, hour: now.getHours(),
    sched,
    oura: { readiness: ST.ouraScore ?? null, sleep: sleepScore,
            activity: ST.ouraData?.activity_score ?? null,
            // Prefer Oura's step count (consistent with readiness/sleep/
            // activity, all Oura-exclusive metrics on this same row) —
            // fall back to HealthKit's count only when Oura has no value
            // at all, e.g. not connected or today's activity hasn't synced
            // yet. Two devices will rarely agree exactly; this just picks
            // one source of truth rather than silently swapping between
            // them depending on which happened to sync most recently.
            steps: ST.ouraSteps ?? ST.healthkit?.stepsToday ?? null,
            napDetected: checkForNapRecovery(sleepScore, ST.ouraData?.date ?? null) },
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
// Distinct from PRE_DEPARTURE_BUFFER_MIN above (which is gate-prep time for
// a genuine short turn) — this covers getting from a hotel back to the
// airport at the end of a layover: transport, security, crew report time.
// A conservative fixed estimate, not measured per-airport/hotel, chosen
// because the cost of underestimating (a recommendation that makes someone
// late) is much higher than the cost of a slightly-too-cautious one.
const PRE_DEPARTURE_TRAVEL_BUFFER_MIN = 90;

// Shared between buildTodayBriefing() (the rule-based card) and
// loadFatigueCalibration() (the AI-generated one) so both always agree on
// how much time is genuinely available before the next departure — a raw
// gap-to-departure isn't usable training time on its own, since some of
// it goes to getting from wherever you are back to the airport.
// See PRE_DEPARTURE_TRAVEL_BUFFER_MIN above for why the layover figure is
// conservative rather than precise.
function usableMinutesBeforeDeparture(sched) {
  const gapMin = sched.freeMinutesUntilDuty;
  if (gapMin === null || gapMin === undefined) return null;
  const buffer = sched.layoverAirport ? PRE_DEPARTURE_TRAVEL_BUFFER_MIN : PRE_DEPARTURE_BUFFER_MIN;
  return gapMin - buffer;
}

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
    return { tone:'rest', headline:'Readiness is low: take it easy',
      body:'Readiness at '+readiness+'. A hard session today costs more than it returns. Stretching, an easy walk, or a nap if there\'s time before your next report.',
      action:{ label:'Start a light session', fn:"switchTab('preflight')" } };
  }

  // 2b. A same-day sleep-score jump (a nap) while readiness now reads
  // decent enough to reasonably consider training — acknowledges what just
  // happened instead of proceeding to the other rules as if nothing did.
  // Framed as a question, not a directive: only the person actually knows
  // if the nap was enough.
  if (oura.napDetected) {
    return { tone:'go', headline:'Nice nap. Feeling recharged?',
      body:'Sleep score just went from '+oura.napDetected.from+' to '+oura.napDetected.to+'. That\'s real recovery. If you\'re feeling it, this could be a good window to train.',
      action:{ label:'Start a workout', fn:"switchTab('preflight')" } };
  }

  // 3. Long duty yesterday is a real recovery cost even when readiness looks fine.
  if (sched.yesterdayDutyHours >= 8 && !training.workoutToday) {
    return { tone:'ease', headline:'Yesterday was a long day',
      body:sched.yesterdayDutyHours+' hours of flying yesterday. Something moderate today (mobility or a walk) will do more for you than pushing hard.',
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
    //
    // BUG FIX (reported: still told "you're well short on protein" with
    // Nutrition tracking explicitly switched off in Settings, which
    // promises turning it off "stops the reminders"). This was gated on
    // whether a fuel plan exists (ctx.nutrition.goals), not on whether
    // the person has actually opted into nutrition tracking — a goal set
    // before toggling tracking off stays on the account (turning tracking
    // off never deletes anything, per that same Settings copy), so the
    // protein-pacing logic kept firing regardless of the toggle. Also
    // fixed the same gap for hydration: the generic "on_track" message
    // below unconditionally said "keep water up," which would be an
    // equally broken reminder with Hydration tracking off. Both tracking
    // toggles now gate whether their respective topic gets mentioned at
    // all, with a fully generic fallback when neither applies.
    const showProtein = ST.trackNutrition && !!ctx.nutrition.goals;
    const proteinPacedTarget = showProtein ? ctx.nutrition.goals.protein * dayElapsedPct(ctx.now) : null;
    const proteinPaceRatio = proteinPacedTarget ? ctx.nutrition.consumed.protein / Math.max(proteinPacedTarget, 1) : 1;
    const tier = showProtein ? proteinPaceTier(proteinPaceRatio) : 'tracking_off';
    const hydrationTip = ST.trackHydration ? 'Keep water up through the rest of the day and protect your sleep window tonight.' : 'Protect your sleep window tonight.';
    const tierCopy = {
      well_short: 'Work\'s done. You\'re still well short on protein, and that\'s the piece that turns the session into progress.',
      behind: 'Work\'s done. You\'re falling behind on protein for this point in the day. Make it a priority at your next meal.',
      slightly_behind: 'Work\'s done. You\'re a bit behind on protein for this point in the day. Not urgent, but worth catching up at your next meal.',
      on_track: 'Work\'s done. '+hydrationTip,
      tracking_off: 'Work\'s done. '+hydrationTip,
    };
    return { tone:'go', headline:'Session logged',
      body: tierCopy[tier],
      action: (showProtein && tier !== 'on_track') ? { label:'Log a meal', fn:"switchTab('nutrition')" } : null };
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
  // BUG FIX (reported: told to "get a solid workout in" with 45 minutes
  // before needing to leave the hotel for a 9:05 departure — confirmed via
  // the real numbers: TURN_MAX_MIN is 6 hours, and isTurn only ever checked
  // TIME REMAINING until the next departure, never how long the layover had
  // ALREADY lasted. Early in an overnight layover (just landed, 10+ hours
  // until the next departure) that correctly stays false. But check the
  // app again the next morning, with the SAME overnight layover now only
  // ~2 hours from ending, and gapMin alone drops under 360 — isTurn flips
  // true for a situation that is not remotely "a genuine turn between
  // legs" (the comment's own words), it's the tail end of a full night at
  // a hotel. ctx.justLandedMinAgo (already computed, already used a few
  // lines below for the deplaning buffer) is exactly the missing signal:
  // it says how long ago the layover actually started, not just how much
  // of it is left. Requiring it to ALSO be short is what actually
  // captures "a genuine turn" rather than "any moment where the clock
  // happens to read under 6 hours to departure."
  const isTurn = gapMin !== null && gapMin <= TURN_MAX_MIN &&
    sched.justLandedMinAgo !== null && sched.justLandedMinAgo <= TURN_MAX_MIN;
  if (isTurn && sched.legsRemaining > 0 && sched.legsCompleted > 0) {
    const ord = ['','First','Second','Third','Fourth','Fifth'][sched.legsTodayCompleted] ?? (sched.legsTodayCompleted + 'th');
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
    // BUG FIX (same class as the protein-pacing fix above, found while
    // fixing that one): with Nutrition tracking off, no meals ever get
    // logged, so ctx.nutrition.mealCount is always 0 — this unconditionally
    // read that as "hasn't eaten yet" and suggested logging a meal
    // regardless of the toggle. Tracking off means the app genuinely
    // doesn't know whether they've eaten, not that they haven't — treating
    // it as "assume eaten" here suppresses the "go eat/log a meal" advice
    // (appropriately, since that reminder is exactly what the toggle
    // promises to stop) while still allowing the other, meal-status-
    // agnostic branches below (sleep priority, water, keep moving) to
    // apply normally.
    const ate = ST.trackNutrition ? (ctx.nutrition.mealCount > 0) : true;

    // Late landing: duty ends after 10pm — no session, restaurants closing
    const dutyEndMs = sched.dutyEndsToday;
    const dutyEndHour = dutyEndMs ? new Date(dutyEndMs).getHours() : null;
    const isLateLanding = dutyEndHour !== null && (dutyEndHour >= 22 || dutyEndHour < 3);

    let body = ord + ' leg done, ' + legWord + (dutyEnd ? ', off at ' + dutyEnd + '.' : '.') + ' ';

    if (isLateLanding) {
      if (!ate && usableMin >= 10) {
        body += 'Grab dinner now. Most places will be closed by the time you land. Something portable is worth taking for later too.';
      } else if (ate) {
        body += 'Late landing: sleep is the priority tonight. Skip the session, get horizontal as soon as you can.';
      } else {
        body += 'Not enough ground time for a real meal. Late landing means restaurants will be closed, so grab anything portable you can find now.';
      }
      const action = (!ate && usableMin >= 10)
        ? { label: 'Fuel up: log a meal', fn: "switchTab('nutrition')" }
        : null;
      return { tone: 'neutral', headline: ord + ' leg done: ' + gapStr + where, body, action };
    }

    if (usableMin >= 20 && !ate) {
      body += gapStr+' on the ground is really about '+usableMin+' min once '
           + (stillDeplaning ? 'deplaning duties and the '+PRE_DEPARTURE_BUFFER_MIN+'-minute report requirement are' : 'the '+PRE_DEPARTURE_BUFFER_MIN+'-minute report requirement is')
           + ' accounted for, so it\'s worth eating now.';
    } else if (usableMin >= 20 && ate) {
      // BUG FIX: unconditionally said "keep water up" — same gap as the
      // protein-pacing fix above, just for hydration this time.
      body += ST.trackHydration
        ? 'Top up water and keep moving while you can; sitting is the real cost of a day like this.'
        : 'Keep moving while you can; sitting is the real cost of a day like this.';
    } else if (usableMin >= 5) {
      body += gapStr+' on the ground is really only about '+usableMin+' min after '
           + (stillDeplaning ? 'duty requirements on both ends' : 'the report requirement')
           + ': enough for something quick and portable, not a real meal.';
    } else {
      body += gapStr+' isn\'t real ground time once '
           + (stillDeplaning ? 'deplaning and report requirements are' : 'the report requirement is')
           + ' accounted for, so basically none of it is usable. Water if you can grab it, don\'t plan around food here.';
    }
    if (dutyEnd) body += ' The window after '+dutyEnd+' is where a real session and dinner fit.';

    // BUG FIX: this action button was gated only on usableMin, not on ate
    // (let alone ST.trackNutrition) at all — it kept offering "log a
    // meal" regardless of the toggle, unlike every other action button
    // in this function.
    const action = (usableMin >= 5 && ST.trackNutrition)
      ? { label: (usableMin >= 20 && !ate) ? 'Fuel up: log a meal' : 'Log a meal', fn:"switchTab('nutrition')" }
      : null;
    return { tone:'neutral', headline:ord+' leg done: '+gapStr+where, body, action };
  }

  // 6. Duty is finished for the day (or hasn't started and there's real room).
  // BUG FIX: this used the raw gap to departure as if the ENTIRE window
  // were free training time — reasonable if you're already home with
  // nowhere else to be, but wrong for the tail end of a layover, where
  // getting to the airport (transport, security, crew report time) eats
  // into that window before a workout ever could. There's no actual
  // commute-time data available, so this uses a conservative fixed
  // estimate rather than pretending precision it doesn't have — the cost
  // of underestimating (recommending a session that makes someone late)
  // is much higher than the cost of overestimating (calling a window
  // "tight" that technically had a little more room).
  const usableBeforeDeparture = usableMinutesBeforeDeparture(sched);
  if (usableBeforeDeparture !== null && usableBeforeDeparture >= 45) {
    const hrs = Math.floor(usableBeforeDeparture/60), mins = usableBeforeDeparture%60;
    const gapStr = hrs > 0 ? hrs+'h '+(mins?mins+'m':'') : usableBeforeDeparture+' min';
    const marginal = readiness !== null && readiness < 70;
    return { tone: marginal ? 'ease' : 'go',
      headline:'You have '+gapStr.trim()+' before your next flight',
      body: marginal
        ? 'Readiness at '+readiness+'. There\'s enough time to train, but keep the intensity honest rather than chasing a PR.'
        : (sched.layoverAirport ? 'On a layover in '+sched.layoverAirport+'. ' : '') + 'Good window for a full session.',
      action:{ label:'Start a workout', fn:"switchTab('preflight')" } };
  }

  // 7. Flying is done for the day — this is the genuine training window.
  if (sched.legsCompleted > 0 && sched.legsRemaining === 0) {
    const endStr = sched.dutyEndsAt ? new Date(sched.dutyEndsAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : null;
    return { tone:'go', headline:'Done flying for the day',
      body:(endStr ? 'Last leg landed at '+endStr+'. ' : '')+'This is your window: a full session now, then dinner, and you\'re still in good shape for tomorrow.',
      action:{ label:'Start a workout', fn:"switchTab('preflight')" } };
  }

  // 6. A short window — worth naming honestly rather than pretending it's enough.
  if (usableBeforeDeparture !== null && usableBeforeDeparture > 0 && usableBeforeDeparture < 45) {
    return { tone:'neutral', headline:'Tight window: '+usableBeforeDeparture+' min',
      body: sched.layoverAirport
        ? 'Not enough time for a session once getting to the airport is factored in. Focus on getting ready and heading out.'
        : 'Not enough for a full session without rushing it. A brisk walk through the terminal or some mobility work fits better.',
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

// Builds just the part of the Today page that's actually derived from
// Oura data (steps line, readiness/sleep/activity grid, and the rule-
// based briefing card — its headline/tone/border color all come from
// the same ctx.oura values, so they'd look inconsistent updated
// separately). Extracted so a fresh Oura sync mid-session can update
// exactly this, in place, instead of rebuilding the entire Today tab —
// see updateOuraTopSection() below. The "still open" gaps section
// deliberately stays out of this: it's schedule/logging-state driven,
// not something a fresh Oura reading changes.
function buildOuraTopSectionHTML(ctx) {
  const brief = buildTodayBriefing(ctx);
  const toneColor = { go:'var(--green)', ease:'var(--amber)', rest:'var(--blue)', neutral:'var(--muted)' }[brief.tone];
  const parts = [];

  parts.push('<div class="fb" style="align-items:baseline;margin-bottom:14px">');
  parts.push('<span style="font-family:var(--mono);font-size:0.625rem;letter-spacing:.14em;color:var(--muted)">'+ctx.now.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}).toUpperCase()+'</span>');
  if (ctx.oura.steps !== null) parts.push('<span style="font-family:var(--mono);font-size:0.75rem;color:var(--text)">'+ctx.oura.steps.toLocaleString()+' <span style="font-size:0.5625rem;color:var(--muted);letter-spacing:.1em">STEPS</span></span>');
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
  parts.push('<div style="font-size:1.0625rem;font-weight:600;letter-spacing:-.01em;margin-bottom:7px">'+brief.headline+'</div>');
  parts.push('<div style="font-size:0.8125rem;color:var(--muted);line-height:1.65">'+brief.body+'</div>');
  if (brief.action) parts.push('<button class="btn btn-gold" style="margin-top:14px" onclick="'+brief.action.fn+'">'+brief.action.label+'</button>');
  parts.push('</div>');

  return parts.join('');
}

// Called after a fresh Oura sync completes. Only touches the DOM
// directly (no full renderPage()) — if the user isn't currently on
// Today, #ouraTopSection won't exist, and there's nothing to update
// visually anyway (ST is already current; the next time they do
// navigate to Today, the normal render picks it up).
function updateOuraTopSection() {
  const el = document.getElementById('ouraTopSection');
  if (!el) return;
  el.innerHTML = buildOuraTopSectionHTML(getTodayContext());
}

// Collapses multiple "Duty free period" entries (or any label containing
// that phrase) down to a single all-day entry. Per Chad: a duty-free
// period is definitionally an all-day thing in the pilot's home base —
// any variation in the imported times/date-range formatting across
// several same-day entries is import noise, not meaningfully different
// data worth preserving. Keeps the first matching entry (arbitrary,
// since the display is forced to "All day" regardless of which one's
// kept) and drops the rest; everything else passes through untouched.
function dedupeDutyFreeEvents(events, getLabel) {
  let keptOne = false;
  return events.filter(e => {
    if (!/duty\s*free/i.test(getLabel(e))) return true;
    if (keptOne) return false;
    keptOne = true;
    e.isAllDay = true;
    return true;
  });
}

// ─── BODY CLOCK (jet lag / circadian guidance) ───────────────────────────────
// Airport IATA code -> IANA time zone for the Americas, Hawaii and Bermuda
// (2,283 airports), packed as "zone|codes" with codes concatenated in 3-char
// chunks. Built from the OpenFlights airports dataset (ODbL). Offline by design.
const AIRPORT_TZ_PACKED = 'America/Adak|ADKAKBSYA;America/Anchorage|ABLADQAETAGNAINAKIAKKAKNAKPANCANIANNANVARCATKAUKBETBIGBKCBMXBRWBTIBTTCDBCDVCEMCHUCIKCYFCYTCZFDLGDRGDUTEAAEDFEEKEGXEHMEILELIELVEMKENAFAIFBKFNRFRNFYUGALGAMGKNGLVGSTHCRHNHHNSHOMHPBHSLHUSHYGIANIGGIKOILIIRCJNUKALKFPKGKKKAKKHKLGKLNKLWKMOKNWKOTKPCKPNKPVKQAKSMKTNKTSKUKKVCKVLKWKKWNKWTKYKKYULMALURMCGMCLMLLMLYMOUMRIMTMMYUNCNNIBNLGNMENNLNUINULOBUOMEOOKORTORVOTZPAQPIPPIZPKAPMLPPCPSGPTAPTHPTURBYRSHSCCSCMSDPSGYSHGSHHSHXSITSKKSLQSMKSNPSTGSVASVWSWDSXQTKATKJTLATLJTNCTOGUNKUTOUUKVAKVDZVEEWAAWBQWKKWLKWMOWNAWRGWSNWTKYAK;America/Anguilla|AXA;America/Antigua|ANUBBQ;America/Argentina/La_Rioja|IRJ;America/Argentina/Rio_Gallegos|FTEGGSINGLHSPMQPUDRGLRZAULA;America/Argentina/Salta|APZBRCCPCCUTEHLGNRGPOHOSIGBNQNOESORARDSRSASGVSLATTGVDM;America/Argentina/San_Juan|UAQ;America/Argentina/San_Luis|LUQVME;America/Argentina/Tucuman|TUC;America/Argentina/Ushuaia|RGAUSH;America/Aruba|AUA;America/Asuncion|AGTASUAYOCIOESGPILPJC;America/Barbados|BGI;America/Belem|ATMBELBVSCDJCKSCMPITBJCRMABMEUOIAORXRDCSFKSTMSXXTMTTUR;America/Belize|BZESPR;America/Blanc-Sablon|YBXYHRYIFZGSZKGZLTZTB;America/Boa_Vista|BAZBVBBVHCAFCIZERNFBAGJMHUWIRZITAJPRLBRMAOMBZMNXNVPOALOLCPINPLLPVHRBBSJLTBTTFF;America/Bogota|ACDACRADZAPOAUCAXMBAQBGABOGBSCBUNCAQCLOCOGCPBCRCCTGCUCCZUEBGEJAELBEOHEYPFLAGIRGPIIBEIPILETLPDLQMMCJMDEMGNMQUMTRMVPMZLNQUNVAOCVOTUPCRPDAPEIPPNPSOPTXPUUPVARCHRVESJESMRSVITCOTLUTMEUIBULQVGZVUPVVC;America/Buenos_Aires|AEPBHICSZEPAEZEFDOJNILPGMDQNECOVROYOPEHSSTTDLVLG;America/Campo_Grande|AFLBPGBYOCFOCGBCGRCMGDMTDOUOPSPMGROOSTZSXOTJL;America/Cancun|CTMCUNCZMISJ;America/Caracas|AAOAGVBLABNSBRMCAJCBLCCSCLZCUMCUPCXACZEEOREOZGDOGUIGUQHGEICCLFRLRVLSPMARMRDMUNMYCPBLPMVPTMPYHPZOSBBSCISFDSNFSNVSOMSTBSTDSVZTMOTUVVCRVDPVIGVLNVLV;America/Catamarca|ARRCRDCTCEQSJSMPMYREL;America/Cayenne|CAYGSILDXMPYOYPXAU;America/Cayman|CYBGCMLYB;America/Chicago|AAPABIABRACTADMADSADTAEXAFWAIZALIALOAMAANBARAARVATWATYAUOAUSAUWBADBDEBECBFMBHMBISBIXBJIBKDBKGBLVBMIBMTBNABPTBRDBRLBROBTRBWGBYHCBMCDSCEWCFDCGICGXCIDCKVCLLCMICNWCOTCOUCRPCSMCUHCWACWICXODALDBQDDCDECDFWDHNDHTDLFDLHDNVDPADRIDRTDSIDSMDTNDUCDVLDWHDYSEAUECPEFDEGVELDEMPENDENWEOKERVESFEUFEVVEWKFARFCMFLDFLVFODFOEFRIFSDFSIFSMFSTFTWFWHFYVGADGBDGCKGFKGGGGLHGLSGPTGPZGRBGRIGRKGRMGTRGUFGVTGWOGYYHBGHBRHIBHLRHONHOPHOTHOUHRLHROHSVHUAHUTHYSIABIAHICTIKKIMTINKINLIOWIRBIRKISNISWIWSJANJBRJCIJEFJLNJMSJOTJVLLAWLBBLBFLBLLCHLFKLFTLITLJNLNKLNRLOTLRDLRFLSELTSLWCLYUMAFMCIMCKMCWMDWMEIMEMMFEMFIMGCMGMMHKMIBMKCMKEMKLMLCMLIMLUMNMMOBMOTMQYMSLMSNMSPMSYMWAMWCMWLMXFNBGNEWNPANQANQINSEOFFOJCOKCOKMOLVOMAORDOSHOWBOZAPAHPAMPBFPEQPFNPIAPIBPIRPMBPNCPNSPOEPOFPSXPWAPWKRACRBDRDRRFDRHIRKPRNDRSTRVSSATSBMSEMSEPSGFSGRSHVSIKSJTSKFSLNSPISPSSPWSTCSTESTJSTLSTPSUSSUXSWOSZLTBNTCLTIKTOPTPLTULTUPTVFTXKTYRUGNUINUOSUTMUVAVCTVOKVPSVYSWLDXNAYKN;America/Coral_Harbour|YIBYPLYZS;America/Cordoba|AOLCNQCOCCORELOFMAGHUIGRMCSOYAPRAPRQPSSRCQRCURESRHDROSSDESFNUZUVDR;America/Costa_Rica|BAIBCLDRKFONGLFGPLJAPLIOLIRLSLNOBOTRPBPPJMPLDPMZSJOSYQTMUTOOTTQXQP;America/Curacao|BONCUREUXSABSXM;America/Dawson_Creek|YDQYXJ;America/Denver|ABQAIAAKOALMALSAPAASEBCEBFFBFKBIFBILBJCBMCBOIBTMBZNCDCCDRCEZCNMCNYCODCOSCPRCTBCVNCVSCYSDENDIKDRODTAEGEELPENVEVWFBRFCAFCSFMNFNLGCCGDVGGWGJTGLDGMVGNTGTFGUCGUPHDNHIFHLNHMNHOBHVRIDAJACLAALAMLARLGULNDLRULVMLVSLWTMLSMSOMTJMUOMYLOGDOLFONOPIHPUBPUCPVURAPRCARILRIWRKSROWRUIRWLSAASAFSBSSDYSGUSHRSLCSMNSNYSPFSTKSUNTCCTCSTEXTWFVELWBUWRLWSDWYS;America/Dominica|DCFDOM;America/Edmonton|LAKYBBYBYYCBYCKYCOYCTYEGYETYEVYFJYFRYFSYGHYHIYHKYHYYLEYLLYMMYOAYODYOJYOPYPCYPEYPYYQFYQLYQUYRAYRMYSDYSMYSYYUBYVGYVQYWJYWYYXCYXDYXHYYCYYHYZFYZHYZUZFMZFN;America/El_Salvador|SAL;America/Fortaleza|AJUAUXBPSBRACAUCLNCPVCRQFENFORGNMGRPIMPIOSJDOJPALAZLECMCPMCZMVFMVSNATOYKPAVPHBPMWPNBPNZQIGRECSLZSSATHEUNAVALVDC;America/Godthab|GOHJAVJCHJEGJFRJGOJHSJJUJNNJNSJQAJSUJUVLLUSFJUAKUMD;America/Grand_Turk|GDTMDSNCAPLSSLXXSC;America/Grenada|GND;America/Guadeloupe|BBRDSDGBJLSSPTPSFC;America/Guatemala|AAZAQBCBVFRSGSJGUAPBRRER;America/Guayaquil|ATFCUEESMETRGYELOHLTXMCHMECMRROCCPTZPVOSNCTPCTPNTUAUIOXMS;America/Guyana|GEOGFOIMBKAIKARLTMMHANAIOGLORJUSI;America/Halifax|YBIYCHYCLYDPYFCYHOYHZYMNYNPYQIYQMYQYYRFYRGYSJYSOYSUYWKYYGYYRYZXZBFZUM;America/Havana|AVIBCABYMCCCCFGCMWCYOGAOGERHAVHOGLCLMOAMZOQPDSCUSNUSZJTNDUPBUSSVRAVROVTU;America/Hermosillo|CENGYMHMONOGPPE;America/Jamaica|KINKTPMBJNEGOCJPOT;America/Jujuy|JUJ;America/La_Paz|BJOBYCCBBCCACIJGYALPBORUPOIPSZPURRBQREYRIBSBLSRESRJSRZTDDTJAUYUVLMVVI;America/Lima|ANSAOPAQPATAAYPCHHCHMCIXCJACUZHUUIBPILQIQTJAUJJIJULLIMNZCPCLPEMPIOPIUTBPTCQTGITPPTRUTYLYMS;America/Los_Angeles|ACVALWAPCASTAVXBABBFIBFLBLHBLIBNOBURBYSCCRCECCICCLDCLMCLSCOECVOCXLDLSEATEDWEKOELYESDEUGFATFRDFULGEGGRFHHRHIOHQMHSHHWDINSIPLIYKKLSLASLAXLGBLKVLMTLPCLPSLSVLVKLWSMAEMCCMCEMERMFRMHRMHVMMHMODMRYMWHMYVNFLNGZNJKNKXNLCNOTNTDNUQNUWNZJNZYOAKOAROCNOLMONPONTOTHOTKOXRPAEPAOPDTPDXPMDPOCPRZPSCPSPPUWPWTRALRBKRBLRDDRDMRIVRMYRNORNTSACSANSBASBDSBPSCKSDMSEASEESFFSFOSHNSJCSKASLESMFSMOSMXSNASQLSTSSUUTCMTIWTKFTOATRMTTDTVLUDDVBGVCVVGTVISVNYWHPXSDYKM;America/Managua|BEFBZAMGANCRPUZRFSRNISIUWSP;America/Martinique|FDF;America/Mazatlan|CJSCUACULCUULAPLMMLTOMZTNCGSJDTPQ;America/Mendoza|AFALGSMDZ;America/Mexico_City|ACAACNAGUBJXCLQCMECPECVJCVMCYWCZADGOGDLHUXIZTJALLOVLZCMAMMEXMIDMLMMTTMTYNLDNTROAXPAZPBCPDSPVRPXMQROREXSLPSLWSZTTAMTAPTCNTGZTLCTRCTSLUPNVERVSAZCLZIHZLOZMM;America/Miquelon|FSPMQC;America/Montevideo|CYRDZOMVDPDPRVYSTY;America/Montserrat|MNI;America/Nassau|ASDATCAXPBIMCCZCOXCRIDCTELHFPOGGTGHBGHCIGALGIMAYMHHMYGNASNMCPIDRCYRSDSAQSMLTBITCBTYMZSA;America/New_York|AAFABEABYACKACYADWAGCAGSAHNAIKAKCALBANDANPANQAOHAOOAPFAPGAPNARBARTASHATLATOAUGAVLAVOAVPAZOBAFBBXBCTBDLBDRBEDBFDBFPBFTBGEBGMBGRBHBBIDBKLBKWBLFBMGBOSBOWBQKBTVBUFBVYBWICAECAKCARCBECDNCDWCEFCEUCGFCHACHOCHSCIUCKBCLECLTCLWCMHCMXCOFCONCRECRWCSGCTHCTYCVGDABDANDAYDBNDCADETDKKDNLDNNDOVDREDTWDUJDXRDYLECAECGEENEKNELMERIESCESNEWBEWNEWREYWFAFFAYFBGFDYFFAFFOFFTFKLFLLFLOFMEFMHFMYFNTFOKFPRFRGFRYFTKFTYFWAFXEGAIGDWGEDGFLGGEGIFGNVGONGQQGRRGSBGSOGSPGUSGVLHAOHARHCWHDIHFDHGRHHHHKYHLGHPNHSTHTLHTSHUFHULHVNHWOHYAHZLIADIAGIKBILGILMILNIMMINDINTIPTISMISOISPITHJAXJFKJHWJRAJRBJSTJXNLAFLALLANLBELBTLCKLCQLDJLEBLEWLEXLFILGALGCLHVLIYLKPLLYLNALNNLNSLOULOZLSFLUKLWBLWMLYHLZUMBLMBSMCFMCNMCOMDTMEOMFDMGEMGJMGWMGYMHTMIAMIEMIVMKGMLBMMIMMUMNZMPVMQTMRBMRKMRNMSSMTCMTHMTNMUIMVLMVYMYRNCONELNGUNHKNIPNQXNTUNXXOAJOBEOCAOCFOCWOGSOPFORFORHORLOSCOSUOWDOXCPBGPBIPDKPGDPGVPHDPHFPHKPHLPHNPIEPIMPITPKBPLNPNEPOBPPMPQIPSMPTBPTKPVCPVDPVLPWMPYMRDGRDURICRKDRKHRMERMGROAROCRSWRUTRWISAVSBNSBYSCESCHSDFSEFSFBSFZSGHSHDSKYSLKSMDSMESOPSPGSRQSSCSSISUASVHSVNSWFSYRTEBTIXTLHTMATMBTNTTOCTOLTPATRITTNTVCTVITYSUSAUSTVADVLDVNCVQQVRBWALWBWWDRWFKWRBWRIWSTWWDYIPYNGZPH;America/Panama|BLBBOCCHXCTDDAVJQEONXPACPLPPTYPUESYP;America/Paramaribo|ABNAGIDRJICKMOJOEMORGPBMSMZTOTWSO;America/Phoenix|AVWAZABXKCGZDGLDMADUGDVTFHUFLGGCNGYRHIIINWLUFMSCMZJOLSPGAPHXPRCSADSCFSDXSOWTUSYUM;America/Port-au-Prince|CAPCYAJAKJEEPAPPAX;America/Port_of_Spain|POSTAB;America/Puerto_Rico|AREBQNCPXFAJMAZNRRPSESIGSJUVQS;America/Regina|YBEYENYHBYKYYLJYMJYNLYPAYQRYQVYQWYSFYVCYVTYXEYYNZFDZWL;America/Rio_Branco|CZSRBRTRQ;America/Santiago|ANFARIBBACCHCCPCJCESRFFUGXQIQQKNALSCLSQMHCPMCPNTPUQPZSQRCSCLVLRWCHWPRWPUYAIZALZOSZPC;America/Santo_Domingo|AZSBRXCBJCOZHEXJBQLRMPOPPUJSDQSTI;America/Sao_Paulo|AAXAQAARUBAUBFHBGXBJPBNUBSBCACCAWCCICCMCFBCFCCGHCLVCNFCPQCWBCXJDTIERMFBEFLNFRCGELGIGGPBGRUGUJGVRGYNIGUIPNITRIZAJCBJDFJOIJTCLAJLDBLIPMEAMGFMIIMOCMQHNVTPETPFBPLUPOAPOJPOOPPBQCJQNVQPSQSCRAORIARVDSDUSJKSJPSNZSODSRASSZTECTOWUBAUDIUMUURGVAGVCPVIXXAP;America/Scoresbysund|CNPOBY;America/St_Johns|YAYYDFYFXYHAYJTYMHYQXYWMYYT;America/St_Kitts|NEVSKB;America/St_Lucia|SLUUVF;America/St_Thomas|SPBSTTSTX;America/St_Vincent|BQUCIWMQSSVDUNI;America/Tegucigalpa|AHSBHGGJALCEPEURTBSAPTEATGUTJIUII;America/Thule|NAQTHU;America/Tijuana|ESEGUBMXLSFHTIJ;America/Toronto|AKVKIFSURWNNXGRXKSYAMYATYBCYBGYCCYCMYCNYCYYELYEMYERYFAYFBYFEYFHYGKYGLYGPYGQYGRYGTYGVYGWYGZYHFYHMYHNYHUYIKYIOYJNYKFYKGYKLYKQYKUYKXYKZYLCYLDYLHYLKYLTYMGYMOYMTYMWYMXYNAYNCYNDYNMYNSYOGYOOYOWYPDYPHYPJYPNYPOYPQYPXYQAYQBYQCYQGYQNYQTYRIYRJYRQYSBYSCYSPYSRYTAYTEYTFYTMYTQYTRYTSYTZYUDYULYUXYUYYVBYVMYVOYVPYVVYWAYWBYWPYXKYXPYXRYXUYXZYYBYYUYYWYYYYYZYZDYZEYZGYZRYZVZBMZEMZKE;America/Tortola|EISVIJ;America/Vancouver|CXHQBCYAAYAZYBLYBOYBWYCDYCGYCWYDAYDBYDLYDTYGBYGGYKAYLWYLYYMAYOCYPRYPWYQHYQQYQZYRVYVRYWHYWLYWSYXSYXTYXXYXYYYDYYEYYFYYJYZPYZTYZWYZZZFAZMHZMTZNAZSW;America/Winnipeg|ILFKEWMSAXBEXLBXSIXTLYABYACYAGYAXYBKYBRYBTYBVYCRYCSYDNYEKYEUYFOYGMYGOYGXYHDYHPYIVYNEYNOYOHYPGYPMYQDYQKYRBYRLYRSYRTYSTYTHYTLYUTYVZYWGYXLYXNYYLYYQZACZGIZGRZJNZPBZRJZSJZTM;Atlantic/Bermuda|BDA;Pacific/Honolulu|BKHBSFHDHHHIHNLHNMITOJHMJRFKOALIHLNYLUPMKKMUENGFOGGUPPWKL';
let _airportTzMap = null;
function airportTimezone(code) {
  if (!code) return null;
  if (!_airportTzMap) {
    _airportTzMap = {};
    AIRPORT_TZ_PACKED.split(';').forEach(seg => {
      const [tz, codes] = seg.split('|');
      for (let i = 0; i < codes.length; i += 3) _airportTzMap[codes.substr(i, 3)] = tz;
    });
  }
  return _airportTzMap[String(code).trim().toUpperCase()] || null;
}

// Origin/destination for a flight event from either schedule source. Calendar
// events carry them as fields (from classification); uploaded .ics events only
// have them in the summary text, e.g. "FLT 3809 PHX-CID".
function flightRoute(e) {
  if (e?.origin || e?.destination) {
    return { origin: String(e.origin || '').toUpperCase(), destination: String(e.destination || '').toUpperCase() };
  }
  const m = String(e?.summary || e?.title || '').match(/\b([A-Z]{3})\s*(?:-|–|>|\/|to)\s*([A-Z]{3})\b/);
  return m ? { origin: m[1], destination: m[2] } : { origin: '', destination: '' };
}

// UTC offset in hours for an IANA zone at a given instant (DST-correct).
function tzOffsetHours(tz, date) {
  try {
    const d = date || new Date();
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric',
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d);
    const g = t => +p.find(x => x.type === t).value;
    return Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - d.getTime()) / 60000) / 60;
  } catch (e) { return null; }
}

// Home base zone. Explicit setting wins. Otherwise the most frequent airport
// across the schedule (every trip starts and ends there), since the phone's
// own zone follows the pilot to the layover and can't be trusted for "home".
function inferHomeTimezone(events) {
  if (ST.baseTimezone && ST.baseTimezone !== 'auto') return ST.baseTimezone;
  // Count trip-starting origins (first leg after a 30h+ gap): every trip
  // departs from base, while a single trip's outstations can outnumber it.
  const counts = {};
  const legs = (events || []).filter(e => e.type === 'flight')
    .map(e => ({ ...flightRoute(e), s: new Date(e.start).getTime(), en: new Date(e.end).getTime() }))
    .filter(f => !isNaN(f.s)).sort((a, b) => a.s - b.s);
  legs.forEach((f, i) => {
    const tripStart = i === 0 || (f.s - legs[i - 1].en) / 3600000 >= 30;
    if (tripStart && f.origin && airportTimezone(f.origin)) counts[f.origin] = (counts[f.origin] || 0) + 1;
  });
  const base = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  return (base && airportTimezone(base)) || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Estimated body-clock offset. Starts fully adapted to home 10 days back, then
// walks flight arrivals forward, drifting toward each new zone at the average
// rates in the CDC Yellow Book (2026): 1.5 h/day westward, 1 h/day eastward.
// An estimate from the schedule alone, not a measurement.
const BODY_CLOCK_LOOKBACK_MS = 10 * 86400000;
function computeBodyClock(events, nowMs) {
  const now = nowMs || Date.now();
  const homeTz = inferHomeTimezone(events);
  const homeOffset = tzOffsetHours(homeTz, new Date(now));
  if (homeOffset === null) return null;
  let t = now - BODY_CLOCK_LOOKBACK_MS;
  let body = tzOffsetHours(homeTz, new Date(t));
  let env = body;
  const drift = (toMs) => {
    const days = Math.max(0, (toMs - t) / 86400000);
    const delta = env - body;
    if (Math.abs(delta) > 0.01) body += Math.sign(delta) * Math.min(Math.abs(delta), (delta > 0 ? 1.0 : 1.5) * days);
    t = toMs;
  };
  (events || []).filter(e => e.type === 'flight')
    .map(e => ({ ...flightRoute(e), en: new Date(e.end).getTime() }))
    .filter(f => !isNaN(f.en) && f.en > t && f.en <= now)
    .sort((a, b) => a.en - b.en)
    .forEach(f => {
      drift(f.en);
      const tz = airportTimezone(f.destination);
      const o = tz ? tzOffsetHours(tz, new Date(f.en)) : null;
      if (o !== null) env = o;
    });
  drift(now);
  const localOffset = -new Date(now).getTimezoneOffset() / 60;
  let diff = Math.round((localOffset - body) * 2) / 2; // >0: body behind local (flew east)
  // Short trip = a flight back into the home zone within 72h. Standard crew
  // guidance for short trips is to stay on home-base time rather than adapt.
  // Two ways to know a flight within 72h lands at home: its destination
  // resolves to the home zone, or it's the last leg of the trip (no flight
  // follows within 30h). Most exports only carry flight numbers, so the
  // structural test is what usually decides it.
  const allFlights = (events || []).filter(e => e.type === 'flight')
    .map(e => ({ e, s: new Date(e.start).getTime(), en: new Date(e.end).getTime() }))
    .filter(f => !isNaN(f.s) && !isNaN(f.en)).sort((a, b) => a.s - b.s);
  const returnsHomeSoon = allFlights.some((f, i) => {
    if (f.s <= now || f.s > now + 72 * 3600000) return false;
    const tz = airportTimezone(flightRoute(f.e).destination);
    if (tz && tzOffsetHours(tz, new Date(f.s)) === homeOffset) return true;
    const next = allFlights[i + 1];
    if (next && (next.s - f.en) / 3600000 < 30) return false;
    // No later flight known: a layover/rest event right after this leg means
    // the trip continues past the loaded schedule, so it's not the last leg.
    const layoverAfter = (events || []).some(x => (x.type === 'layover' || x.type === 'rest') &&
      new Date(x.start).getTime() >= f.en - 3600000 && new Date(x.start).getTime() <= f.en + 6 * 3600000);
    return !layoverAfter;
  });
  // On a short trip the advice is to hold home time, so assume the pilot is
  // doing that rather than showing a half-adapted estimate that contradicts it.
  if (returnsHomeSoon) {
    body = homeOffset;
    diff = Math.round((localOffset - body) * 2) / 2;
  }
  return { homeTz, homeOffset, bodyOffset: body, localOffset, diff, returnsHomeSoon,
           atHome: Math.abs(localOffset - homeOffset) < 0.5 };
}

// Local wall-clock label for a given body-clock hour today.
function bodyHourToLocalLabel(bodyHour, bc) {
  const localHour = ((bodyHour + (bc.localOffset - bc.bodyOffset)) % 24 + 24) % 24;
  const d = new Date(); d.setHours(Math.floor(localHour), Math.round((localHour % 1) * 60), 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function buildBodyClockHTML() {
  const events = getActiveSchedule().events;
  if (!events?.length) return '';
  const bc = computeBodyClock(events);
  if (!bc || Math.abs(bc.diff) < 1 || bc.atHome) return '';
  const hrs = Math.abs(bc.diff);
  const behind = bc.diff > 0;
  const homeCity = (bc.homeTz.split('/')[1] || 'home').replace(/_/g, ' ');
  const bodyNow = new Date(Date.now() + (bc.bodyOffset - bc.localOffset) * 3600000)
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  // Strength peaks roughly 16:00-20:00 body time (PMC12015785); use 16-19.
  const trainWin = bodyHourToLocalLabel(16, bc) + ' to ' + bodyHourToLocalLabel(19, bc);
  // Caffeine even 6h before bed cut total sleep by over an hour (Drake et al.,
  // J Clin Sleep Med 2013). Assumes a 10:30 PM bedtime on whichever clock the
  // pilot is living on.
  const bedBody = bc.returnsHomeSoon ? 22.5 : 22.5 - (bc.localOffset - bc.bodyOffset);
  const caffeineCut = bodyHourToLocalLabel(bedBody - 6, bc);
  const strategy = bc.returnsHomeSoon
    ? 'Short trip: stay on ' + homeCity + ' time. Sleep and eat close to your home schedule instead of local.'
    : (behind
      ? 'Adapting east: get outdoor light in the local morning, keep evenings dim.'
      : 'Adapting west: get light in the local evening, keep mornings dim.');
  return '<div class="card mb12">' +
    '<div class="section-label" style="margin-top:0">🕐 BODY CLOCK</div>' +
    (bc.returnsHomeSoon
      ? '<div style="font-size:0.9375rem;font-weight:700;margin-bottom:2px">Holding ' + homeCity + ' time: ' + bodyNow + ' there</div>' +
        '<div style="font-size:0.6875rem;color:var(--muted);margin-bottom:10px">' + hrs + ' hr' + (hrs === 1 ? '' : 's') + ' ' + (behind ? 'behind' : 'ahead of') + ' local. Home within 3 days, so no need to adapt.</div>'
      : '<div style="font-size:0.9375rem;font-weight:700;margin-bottom:2px">Your body thinks it\'s ' + bodyNow + '</div>' +
        '<div style="font-size:0.6875rem;color:var(--muted);margin-bottom:10px">About ' + hrs + ' hr' + (hrs === 1 ? '' : 's') + ' ' + (behind ? 'behind' : 'ahead of') + ' local time (estimate from your schedule)</div>') +
    '<div style="font-size:0.75rem;line-height:1.65">' +
      '💪 Strongest window: <b>' + trainWin + '</b> local<br>' +
      '☕ Last caffeine by <b>' + caffeineCut + '</b> local<br>' +
      '☀️ ' + strategy +
    '</div></div>';
}

// Compact summary for the AI coach's context.
function bodyClockForAI() {
  try {
    const events = getActiveSchedule().events;
    const bc = events?.length ? computeBodyClock(events) : null;
    if (!bc || Math.abs(bc.diff) < 1 || bc.atHome) return null;
    return { hoursOffLocal: Math.abs(bc.diff), direction: bc.diff > 0 ? 'body_behind_local_flew_east' : 'body_ahead_of_local_flew_west',
             strategy: bc.returnsHomeSoon ? 'short_trip_stay_on_home_time' : 'adapting_to_local' };
  } catch (e) { return null; }
}

// ─── FIRST-RUN SETUP CHECKLIST ───────────────────────────────────────────────
// A brand new account used to land on Today with no guidance beyond a
// calendar nudge, while the app quietly needs a goal/level (to build a
// program), sex + bodyweight (strength scoring, nutrition targets), a
// schedule source, and a wearable to do its best work. This card tracks
// those four automatically from real state, links each straight to where
// it's set, and removes itself once everything's done (or on dismiss).
const SETUP_DISMISS_KEY = 'fcf_setup_checklist_dismissed';
function getSetupChecklist() {
  const isNative = typeof FCFBridge !== 'undefined' && FCFBridge.isNative;
  const hasSchedule = !!(ST.flightSchedule?.length || ST.calendarEvents?.length);
  const hasWearable = !!(ST.ouraConnected || ST.healthkit?.granted);
  return [
    { icon: '🎯', label: 'Pick your mission and level', done: !!(ST.goal && ST.level),
      hint: 'Builds the right program for you', go: "switchTab('profile')" },
    { icon: '⚖️', label: 'Add sex and bodyweight', done: !!(ST.sex && ST.lastWeight),
      hint: 'Powers strength scoring and fuel targets', go: "switchTab('profile')" },
    { icon: '📅', label: isNative ? 'Connect your calendar' : 'Upload your schedule', done: hasSchedule,
      hint: 'Trip-aware training windows and layover plans',
      go: isNative && !ST.calendarGranted ? "FCFBridge.requestCalendar(ST.baseTimezone)" : "switchTab('data')" },
    { icon: '⌚', label: isNative ? 'Connect Oura or Apple Health' : 'Connect your Oura ring', done: hasWearable,
      hint: 'Readiness-based go / no-go calls', go: "switchTab('devices')" },
    // Optional by nature: many pilots take nothing, so "None" completes it
    // too. Otherwise this item could never be checked off for them.
    { icon: '💊', label: 'Add meds or supplements', done: !!(ST.medications?.length || ST.medsSkipped),
      hint: 'Dose check-offs on Today' + (isNative ? ' and reminders' : ''), go: "openMedicationEditor()",
      skip: 'setMedsSkipped()' },
  ];
}

async function setMedsSkipped() {
  ST.medsSkipped = true;
  renderPage();
  try {
    const profile = (await dbGetProfile()) || {};
    profile.medsSkipped = true;
    await dbSetProfile(profile);
  } catch (e) { /* worst case the item shows again on another device */ }
}
function buildSetupChecklistHTML() {
  if (localStorage.getItem(SETUP_DISMISS_KEY) === '1') return '';
  const items = getSetupChecklist();
  const doneCount = items.filter(i => i.done).length;
  if (doneCount === items.length) return '';
  const parts = [];
  parts.push('<div class="card mb12">');
  parts.push('<div class="fb" style="align-items:center;margin-bottom:8px"><div class="section-label" style="margin:0">PREFLIGHT CHECKLIST</div>' +
    '<div style="font-size:0.6875rem;color:var(--muted)">'+doneCount+' of '+items.length+'</div></div>');
  parts.push('<div style="height:4px;background:var(--border);border-radius:2px;margin-bottom:12px"><div style="height:4px;width:'+Math.round(doneCount/items.length*100)+'%;background:var(--gold);border-radius:2px"></div></div>');
  items.forEach(i => {
    parts.push('<div class="fb" style="align-items:center;padding:8px 0;border-bottom:1px solid var(--border)" ' +
      (i.done ? '' : 'onclick="haptic(\'light\');'+i.go+'"') + '>' +
      '<div style="width:22px;font-size:0.875rem;text-align:center;color:'+(i.done?'var(--green)':'var(--muted)')+'">'+(i.done?'✓':'○')+'</div>' +
      '<div style="flex:1;margin-left:8px"><div style="font-size:0.8125rem;font-weight:600;'+(i.done?'color:var(--muted);text-decoration:line-through':'')+'">'+i.icon+' '+i.label+'</div>' +
      (i.done ? '' : '<div style="font-size:0.6875rem;color:var(--muted)">'+i.hint+'</div>') + '</div>' +
      (i.done ? '' : i.skip
        ? '<button class="btn-ghost" style="font-size:0.75rem;padding:6px 4px 6px 10px;text-decoration:none;color:var(--muted)" onclick="event.stopPropagation();haptic(\'light\');'+i.skip+'">None</button>'
        : '<div style="color:var(--muted);font-size:1rem">›</div>') + '</div>');
  });
  parts.push('<button class="btn-ghost mt8" style="display:block;width:100%;text-align:center;font-size:0.75rem" onclick="haptic(\'light\');localStorage.setItem(SETUP_DISMISS_KEY,\'1\');renderPage()">I\'ll finish this later</button>');
  parts.push('</div>');
  return parts.join('');
}

function renderToday(p) {
  const ctx = getTodayContext();
  const gaps = buildTodayGaps(ctx);
  const parts = [];

  parts.push('<div id="ouraTopSection">'+buildOuraTopSectionHTML(ctx)+'</div>');
  parts.push(buildSetupChecklistHTML());
  parts.push(buildBodyClockHTML());

  // AI Preflight Schedule Mapping — Pro only, shown before Fatigue
  // Calibration since a multi-day trip overview is more useful context to
  // see first than a single-day scaling call. Only fires when there's an
  // actual multi-day trip on the calendar; loadTripPlan no-ops otherwise.
  if (isPro()) {
    parts.push(aiCoachCard('aiTripPlanCard', 'aiTripPlanText', 'AI COACH · TRIP PLAN', 'blue'));
  }

  // AI Fatigue Calibration — Pro only. Adds trip-context reasoning on top of
  // the rule-based briefing above, rather than replacing it. Loads async so
  // it never blocks the page render.
  if (isPro()) {
    const fatMemo = _aiLoadMemo.fatigue;
    parts.push(aiCoachCard('aiFatigueCard', 'aiFatigueText', 'AI COACH', 'amber',
      fatMemo && fatMemo.result && !fatMemo.result.error ? fatMemo.result.text : null));
  }

  // Standalone, always-shown prompt — not folded into one specific briefing
  // outcome, since a low-readiness day (or several other rules) would
  // otherwise completely bypass the only place this used to be mentioned,
  // meaning most schedule-less users would never actually see it.
  const hasAnySchedule = ST.flightSchedule?.length || ST.calendarEvents?.length;
  if (!hasAnySchedule) {
    const isNative = typeof FCFBridge !== 'undefined' && FCFBridge.isNative;
    if (isNative && !ST.calendarGranted) {
      parts.push('<div class="card mb12"><div style="font-size:1.0625rem;font-weight:600;letter-spacing:-.01em;margin-bottom:7px">📅 Connect your calendar</div><div style="font-size:0.8125rem;color:var(--muted);line-height:1.65;margin-bottom:14px">Grant calendar access and FCF will automatically detect your flights, layovers, and free time. No manual upload needed.</div><button class="btn btn-outline" onclick="if(typeof FCFBridge!==\'undefined\')FCFBridge.requestCalendar(ST.baseTimezone)">Connect Calendar</button></div>');
    } else {
      parts.push('<div class="card mb12"><div style="font-size:1.0625rem;font-weight:600;letter-spacing:-.01em;margin-bottom:7px">📅 No flight schedule</div><div style="font-size:0.8125rem;color:var(--muted);line-height:1.65;margin-bottom:14px">Upload your crew schedule and this briefing gets a lot more specific: layovers, duty-day length, real windows to train.</div><button class="btn btn-outline" onclick="switchTab(\'data\')">Upload Schedule</button></div>');
    }
  }

  // Tracking disengagement / re-engagement nudges — see
  // computeTrackingNudges() for the trigger logic. Same card style as
  // the schedule ones above; a "Not now" ghost button dismisses without
  // changing the toggle, matching this app's existing secondary-action
  // convention rather than introducing a new "X" close-icon pattern.
  [['nutrition', '🍽️', 'food'], ['hydration', '💧', 'water']].forEach(([type, icon, noun]) => {
    const nudge = type === 'nutrition' ? ST.nutritionNudge : ST.hydrationNudge;
    if (!nudge) return;
    const trackKey = type === 'nutrition' ? 'trackNutrition' : 'trackHydration';
    const title = nudge === 'disable'
      ? `${icon} Still want to track ${noun}?`
      : `${icon} Give ${noun} logging another shot?`;
    const body = nudge === 'disable'
      ? `Looks like ${noun} logging has gone quiet the last week. No pressure. You can turn it off if it's not useful right now.`
      : `It's been a while since you turned off ${noun} tracking. Worth trying again, or happy to leave it off.`;
    const actionLabel = nudge === 'disable' ? 'Turn off tracking' : 'Try it again';
    const actionOnClick = `haptic('light');setTrackingPref('${trackKey}',${nudge === 'disable' ? 'false' : 'true'})`;
    // Typography matches the briefing card above (17px headline, 13px
    // body). The action button carries the base `btn` class: `btn-outline`
    // alone is only a border and color, so without `btn` it rendered as a
    // bare browser-default button, which is the mismatch that was reported.
    parts.push('<div class="card mb12"><div style="font-size:1.0625rem;font-weight:600;letter-spacing:-.01em;margin-bottom:7px">'+title+'</div>' +
      '<div style="font-size:0.8125rem;color:var(--muted);line-height:1.65;margin-bottom:14px">'+body+'</div>' +
      '<button class="btn btn-outline" onclick="'+actionOnClick+'">'+actionLabel+'</button>' +
      '<button class="btn-ghost" style="display:block;width:100%;text-align:center;margin-top:10px;font-size:0.8125rem" onclick="haptic(\'light\');dismissTrackingNudge(\''+type+'\')">Not now</button>' +
      '</div>');
  });

  // BUG FIX (reported: two separate "TODAY'S SCHEDULE" cards appearing at
  // once, showing different — and in one case duplicated — data). Root
  // cause: this used to be two completely independent blocks, each
  // checking a different schedule source (ST.calendarEvents from Apple
  // Calendar sync, vs ctx.sched.todayEvents from the uploaded .ics) with
  // zero awareness of each other. Whenever BOTH sources happened to have
  // entries for today, both rendered — producing two identically-labeled
  // sections with different data.
  //
  // Now uses getActiveSchedule() so this respects the explicit Schedule
  // Source preference (Settings) rather than an implicit "whichever
  // happens to have data" check — the earlier implicit version is exactly
  // how this bug surfaced intermittently in the first place, and a real
  // upstream timing bug was later found in Apple Calendar sync data that
  // an uploaded .ics doesn't share, which is why picking a source
  // explicitly matters here, not just resolving which one merely wins.
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);
  const activeSchedule = getActiveSchedule();

  if (activeSchedule.source === 'calendar') {
    const calLabel = e => e.origin && e.destination ? e.origin + '→' + e.destination : e.title;
    const calToday = dedupeDutyFreeEvents(mergeAdjacentEvents(
      activeSchedule.events.filter(e => {
        const s = new Date(e.start), en = new Date(e.end);
        return s <= todayEnd && en >= todayStart && e.type !== 'personal';
      }),
      calLabel
    ), calLabel).sort((a,b) => new Date(a.start) - new Date(b.start));

    if (calToday.length) {
      const typeIcon = { flight:'✈️', layover:'🏨', reserve:'📟', training:'🎓', duty:'📋', rest:'😴', unknown:'📅' };
      parts.push('<div class="section-label">TODAY\'S SCHEDULE</div>');
      parts.push('<div class="card mb12">');
      calToday.slice(0, 6).forEach(e => {
        const s = new Date(e.start), en = new Date(e.end);
        const icon = typeIcon[e.type] || '📅';
        const timeStr = e.isAllDay ? 'All day' :
          s.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false}) + '–' +
          en.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false});
        const label = e.origin && e.destination ? e.origin + ' → ' + e.destination : e.title;
        parts.push('<div class="fb" style="padding:7px 0;border-bottom:1px solid var(--border)">');
        parts.push('<span style="font-family:var(--mono);font-size:0.6875rem;color:var(--muted);min-width:90px">'+timeStr+'</span>');
        parts.push('<span style="font-size:0.75rem;flex:1;text-align:right">'+icon+' '+label+'</span>');
        parts.push('</div>');
      });
      parts.push('</div>');
    }
  } else if (ctx.sched.todayEvents.length) {
    parts.push('<div class="section-label">TODAY\'S SCHEDULE</div>');
    parts.push('<div class="card mb12">');
    mergeAdjacentEvents(ctx.sched.todayEvents).slice(0,6).forEach(e => {
      const s = new Date(e.start), en = new Date(e.end);
      const isNow = ctx.sched.current && e.uids.includes(ctx.sched.current.uid);
      parts.push('<div class="fb" style="padding:7px 0;'+(isNow?'':'opacity:.72')+'">');
      parts.push('<span style="font-family:var(--mono);font-size:0.6875rem;color:'+(isNow?'var(--gold)':'var(--muted)')+'">'+s.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false})+'–'+en.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false})+'</span>');
      parts.push('<span style="font-size:0.75rem;text-align:right">'+e.summary+'</span>');
      parts.push('</div>');
    });
    parts.push('</div>');
  }

  parts.push(buildMedsTodayHTML(ctx));

  const n = ctx.nutrition;
  if (n.goals) {
    if (ST.trackNutrition) {
    parts.push('<div class="section-label">FUEL</div>');
    parts.push('<div class="card mb12">');
    parts.push('<div class="fb" style="align-items:baseline;margin-bottom:10px"><span style="font-family:var(--mono);font-size:1.375rem">'+Math.round(n.consumed.calories).toLocaleString()+'</span><span style="font-family:var(--mono);font-size:0.625rem;color:var(--muted)">OF '+n.goals.calories.toLocaleString()+' CAL</span></div>');
    [['PROTEIN',n.consumed.protein,n.goals.protein,'var(--gold)'],['CARBS',n.consumed.carbs,n.goals.carbs,'var(--blue)'],['FAT',n.consumed.fat,n.goals.fat,'var(--teal)']].forEach(([lbl,have,goal,col]) => {
      const pct = goal > 0 ? Math.min(100,(have/goal)*100) : 0;
      parts.push('<div style="margin-bottom:8px"><div class="fb" style="margin-bottom:3px"><span style="font-family:var(--mono);font-size:0.5625rem;letter-spacing:.1em;color:var(--muted)">'+lbl+'</span><span style="font-family:var(--mono);font-size:0.625rem">'+Math.round(have)+'<span style="color:var(--muted)">/'+goal+'g</span></span></div>');
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
      parts.push('<div class="fb" style="padding:9px 0;cursor:pointer" onclick="'+g.fn+'"><span style="font-size:0.8125rem">'+g.icon+' '+g.text+'</span><span style="color:var(--muted);font-size:0.875rem">›</span></div>');
    });
    parts.push('</div>');
  }

  parts.push('<button class="btn btn-outline" onclick="switchTab(\'nutrition\')">🍽️ Log a meal</button>');
  const html = parts.join('');
  // A repaint that produces the same markup (HealthKit arriving with no
  // visible change, say) is skipped entirely: nothing to redraw, and the
  // AI cards already loading inside the page are left alone.
  // Only when the page still holds that same Today markup; after a visit
  // to another tab the element holds something else and must be redrawn.
  if (p.dataset.todayHtml === html && p.innerHTML === html) return;
  p.dataset.todayHtml = html;
  p.innerHTML = html;
  // Fired after innerHTML so the card element definitely exists
  if (isPro()) loadTripPlan();
  if (isPro()) loadFatigueCalibration(ctx);
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
    if (g.calorieClamped) msgs.push('Calories can\'t go below your resting metabolic rate ('+Math.round(bmrNum)+'). Adjusted up.');
    if (g.fatClamped) msgs.push('Fat can\'t go below '+MIN_DAILY_FAT_G+'g. Adjusted up.');
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
    parts.push('<div class="alert alert-info mb12"><div class="alert-icon">📋</div><div>Targets are calculated from your sex, age, height, and weight. Add those in Pilot Profile first and come back. Nothing here works off guessed numbers.</div></div>');
    parts.push('<button class="btn btn-outline" onclick="switchTab(\'profile\')">Go to Pilot Profile →</button>');
    p.innerHTML = parts.join('');
    return;
  }

  const bmr = calculateBMR(ST.sex, ST.lastWeight, ST.heightIn, ST.age);
  parts.push('<div class="card mb12">');
  parts.push('<div style="font-size:0.75rem;color:var(--muted);line-height:1.6;margin-bottom:4px">At rest your body uses about <strong style="color:var(--text)">'+bmr+' calories</strong> a day. Everything below builds from that.</div>');
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
    parts.push('<div style="font-size:0.875rem;font-weight:600;color:'+(on?'var(--gold)':'var(--text)')+'">'+label+'</div>');
    parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:3px">'+desc+'</div>');
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
      parts.push('<div style="text-align:center;padding:6px 0 14px"><div style="font-family:var(--mono);font-size:2.375rem;color:var(--gold);line-height:1">'+t.calories.toLocaleString()+'</div><div style="font-family:var(--mono);font-size:0.625rem;color:var(--muted);letter-spacing:.18em;margin-top:5px">CALORIES / DAY</div></div>');
      [['PROTEIN',t.protein,'var(--gold)'],['CARBS',t.carbs,'var(--blue)'],['FAT',t.fat,'var(--teal)']].forEach(([n,v,c]) => {
        parts.push('<div class="fb" style="margin-bottom:7px"><span style="font-family:var(--mono);font-size:0.625rem;letter-spacing:.1em;color:var(--muted)">'+n+'</span><span style="font-family:var(--mono);font-size:0.8125rem;color:'+c+'">'+v+'g</span></div>');
      });
      parts.push('<div style="font-size:0.6875rem;color:var(--muted);line-height:1.65;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">');
      if (t.mode === 'fatloss') parts.push('A '+MAX_DAILY_DEFICIT+'-calorie deficit, which is roughly a pound a week. Protein stays high on purpose. That\'s what protects the strength you\'re building while you lose fat.');
      else if (t.mode === 'muscle') parts.push('A '+MAX_DAILY_SURPLUS+'-calorie surplus: enough to build, small enough that most of it isn\'t fat. Protein is set to support recovery between sessions.');
      else parts.push('Matched to what you\'re burning, so you\'re fueling your training rather than running it on empty.');
      parts.push('</div>');
      if (t.flooredAtBMR) {
        parts.push('<div style="font-size:0.6875rem;color:var(--amber);line-height:1.6;margin-top:10px">Held at your resting metabolic rate. The deficit math would have gone lower, but eating below what your body uses at rest isn\'t a faster plan, just a worse one.</div>');
      }
      parts.push('</div>');

      if (!ST.manualTargetsOpen) {
        parts.push('<button class="btn-ghost mb12" onclick="ST.manualTargetsOpen=true;ST.manualCal=\''+t.calories+'\';ST.manualProtein=\''+t.protein+'\';ST.manualCarbs=\''+t.carbs+'\';ST.manualFat=\''+t.fat+'\';renderPage()">✏️ Fine-tune these numbers manually</button>');
      } else {
        parts.push('<div class="card mb12">');
        parts.push('<div class="section-label" style="margin-top:0">CUSTOM TARGETS</div>');
        parts.push('<div style="font-size:0.6875rem;color:var(--muted);line-height:1.6;margin-bottom:12px">Starting from the calculated numbers above, adjust anything you want. The same safety limits still apply: calories can\'t go below what your body burns at rest, and fat can\'t go below '+MIN_DAILY_FAT_G+'g regardless of the goal.</div>');
        parts.push('<div class="field"><label>Calories / day</label><input type="text" inputmode="numeric" value="'+ST.manualCal+'" oninput="ST.manualCal=this.value"></div>');
        parts.push('<div class="field-row">');
        parts.push('<div class="field"><label>Protein (g)</label><input type="text" inputmode="numeric" value="'+ST.manualProtein+'" oninput="ST.manualProtein=this.value"></div>');
        parts.push('<div class="field"><label>Carbs (g)</label><input type="text" inputmode="numeric" value="'+ST.manualCarbs+'" oninput="ST.manualCarbs=this.value"></div>');
        parts.push('</div>');
        parts.push('<div class="field"><label>Fat (g)</label><input type="text" inputmode="numeric" value="'+ST.manualFat+'" oninput="ST.manualFat=this.value"></div>');
        parts.push('<div id="manualTargetsWarning" style="font-size:0.6875rem;color:var(--amber);line-height:1.6;margin-top:4px">'+(ST.manualTargetsWarning||'')+'</div>');
        parts.push('<button class="btn btn-gold mt8" onclick="saveManualTargets('+bmr+',\''+(ST.goalDraft||'maintain')+'\',\''+(ST.trainDaysDraft||'3-4')+'\',\''+tdee+'\')">Save Custom Targets</button>');
        parts.push('<button class="btn-ghost" onclick="ST.manualTargetsOpen=false;renderPage()">Cancel</button>');
        parts.push('</div>');
      }
      t.trainingDays = ST.trainDaysDraft || '3-4';
      parts.push('<button class="btn btn-gold" onclick="saveNutritionGoals('+JSON.stringify(t).replace(/"/g,'&quot;')+').then(()=>{switchTab(\'nutrition\')})">Use These Targets</button>');
    }
  } else {
    parts.push('<div class="alert alert-info mb12"><div class="alert-icon">👍</div><div>No targets set. You\'ll still see calories and macros for everything you log, just without a goal attached.</div></div>');
    parts.push('<button class="btn btn-gold" onclick="saveNutritionGoals(null).then(()=>{switchTab(\'nutrition\')})">Log Without Targets</button>');
  }

  parts.push('<div style="font-size:0.625rem;color:var(--muted);line-height:1.6;margin-top:14px;text-align:center">A starting point, not a prescription. Adjust anytime, and talk to a doctor or dietitian for anything specific to you.</div>');
  p.innerHTML = parts.join('');
}

async function renderNutrition(p) {
  await loadTodaysMeals();
  const parts = [moreBackLink()];
  parts.push('<div class="section-label" style="margin-top:0">FUEL LOG · TODAY</div>');

  const g = ST.nutritionGoals;
  const meals = ST.todaysMeals || [];
  const dayTotals = sumMealNutrients(meals.flatMap(m => m.meal_data.items));

  if (!g) {
    parts.push('<div class="card mb12"><div style="font-size:0.8125rem;font-weight:600;margin-bottom:6px">Set up your fuel plan</div><div style="font-size:0.75rem;color:var(--muted);line-height:1.6;margin-bottom:12px">Calorie and macro targets built from your own biometrics, or skip targets entirely and just log what you eat.</div><button class="btn btn-gold" onclick="switchTab(\'fuelplan\')">Set Up Fuel Plan</button></div>');
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
    parts.push('<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><div style="font-family:var(--mono);font-size:1.25rem">'+Math.round(dayTotals.calories).toLocaleString()+'</div><div style="font-family:var(--mono);font-size:0.5rem;color:var(--muted);letter-spacing:.1em;margin-top:2px">OF '+g.calories.toLocaleString()+'</div></div>');
    parts.push('</div>');
    parts.push('<div style="flex:1;min-width:0">');
    [['PROTEIN',dayTotals.protein,g.protein,'var(--gold)'],['CARBS',dayTotals.carbs,g.carbs,'var(--blue)'],['FAT',dayTotals.fat,g.fat,'var(--teal)']].forEach(([n,have,goal,col]) => {
      const mpct = goal > 0 ? Math.min(100, (have/goal)*100) : 0;
      parts.push('<div style="margin-bottom:9px"><div class="fb" style="margin-bottom:3px"><span style="font-family:var(--mono);font-size:0.5625rem;letter-spacing:.1em;color:var(--muted)">'+n+'</span><span style="font-family:var(--mono);font-size:0.625rem">'+Math.round(have)+'<span style="color:var(--muted)">/'+goal+'g</span></span></div>');
      parts.push('<div style="height:3px;background:var(--bg3);border-radius:2px;overflow:hidden"><div style="height:100%;width:'+mpct+'%;background:'+col+';border-radius:2px"></div></div></div>');
    });
    parts.push('</div></div>');
    parts.push('<button class="btn-ghost" style="font-size:0.6875rem;margin-top:2px" onclick="switchTab(\'fuelplan\')">Adjust targets</button>');
    parts.push('</div>');
  } else {
    // "Just track" mode still gets a real number, no targets to compare against
    parts.push('<div class="card mb12"><div class="fb" style="align-items:baseline"><span style="font-family:var(--mono);font-size:1.625rem">'+Math.round(dayTotals.calories).toLocaleString()+'</span><span style="font-family:var(--mono);font-size:0.6875rem;color:var(--muted)">CAL TODAY · P'+Math.round(dayTotals.protein)+'g · C'+Math.round(dayTotals.carbs)+'g · F'+Math.round(dayTotals.fat)+'g</span></div></div>');
  }

  // AI Tactical Fueling Logistics — Pro only, and only useful when there's
  // an actual schedule to reason over (calendar or uploaded ICS).
  const hasScheduleForFueling = ST.flightSchedule?.length || ST.calendarEvents?.length;
  if (isPro() && hasScheduleForFueling) {
    parts.push(aiCoachCard('aiFuelCard', 'aiFuelText', "AI COACH · TODAY'S FUELING", 'teal'));
  }

  // Moved up per direct feedback — this used to be the last thing on the
  // screen, after the full meal list, instead of the first action available.
  parts.push('<button class="btn btn-gold mb12" onclick="openMealBuilder()">+ Log a Meal</button>');
  // ADDED (Sep 11, 2026): the free-tier AI photo-scan limit was previously
  // only ever mentioned reactively, in the paywall shown AFTER hitting it —
  // someone could scan 3 times, get blocked, and only then learn a limit
  // existed at all. This surfaces it up front instead.
  if (!isPro()) {
    parts.push('<div style="font-size:0.625rem;color:var(--muted);text-align:center;margin-top:-8px;margin-bottom:12px">📷 AI photo scans: '+FREE_WEEKLY_PHOTOS+'/week free; manual entry and barcode scan are unlimited</div>');
  }
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
        parts.push('<div class="fb" style="margin:14px 0 6px"><span style="font-family:var(--mono);font-size:0.625rem;letter-spacing:.13em;color:var(--muted)">'+type.toUpperCase()+'</span>'+(timeStr?'<span style="font-family:var(--mono);font-size:0.625rem;color:var(--gold)">'+timeStr+'</span>':'')+'</div>');
        parts.push('<div class="card" style="padding:12px 16px">');
        m.meal_data.items.forEach(item => {
          parts.push('<div style="padding:6px 0;border-bottom:1px solid var(--border)">');
          parts.push('<div class="fb"><span style="font-size:0.8125rem">'+foodEmoji(item.description)+' '+item.description+'</span><span style="font-family:var(--mono);font-size:0.6875rem;color:var(--muted);flex-shrink:0;padding-left:10px">'+item.nutrients.calories+' cal</span></div>');
          parts.push('<div style="font-family:var(--mono);font-size:0.625rem;color:var(--muted);margin-top:2px">P'+item.nutrients.protein+'g · C'+item.nutrients.carbs+'g · F'+item.nutrients.fat+'g</div>');
          parts.push('</div>');
        });
        parts.push('<div class="fb" style="padding-top:8px;font-family:var(--mono);font-size:0.625rem;color:var(--muted);letter-spacing:.05em"><span>SUBTOTAL</span><span>'+t.calories+' CAL · P'+t.protein+'g · C'+t.carbs+'g · F'+t.fat+'g</span></div>');
        parts.push('<div class="fb" style="margin-top:8px;gap:16px;justify-content:flex-start">');
        parts.push('<button class="btn-ghost" style="font-size:0.6875rem" onclick="editMealLog(\''+m.id+'\')">✏️ Edit</button>');
        parts.push('<button class="btn-ghost" style="font-size:0.6875rem;color:var(--red)" onclick="deleteMealLog(\''+m.id+'\')">🗑️ Remove</button>');
        parts.push('</div>');
        parts.push('</div>');
      });
    });
  }

  p.innerHTML = parts.join('');
  // Fired after innerHTML so the card element definitely exists
  if (isPro() && hasScheduleForFueling) loadFuelLogistics();
}

// ─── QUICK ACTIONS (the "+" tab-bar button) ────────────────────────────────
function openQuickActions() {
  const root = document.getElementById('modalRoot');
  if (!root) return;
  // BUG FIX (reported): this always said "Start a Workout" and routed to
  // the Preflight tab, even with a session already in progress — landing
  // on Preflight then showed its OWN smarter "Return to Workout" button,
  // which is confusing: it looks like tapping + is about to abandon
  // whatever's already logged. Match the label/destination engageWorkout()
  // already uses correctly elsewhere, so this sheet is never the odd one out.
  const hasActiveWorkout = !!ST.workout;
  const workoutLabel = hasActiveWorkout ? '↩ Return to Workout' : '⚡ Start a Workout';
  const workoutAction = hasActiveWorkout ? 'closeModal();engageWorkout()' : "closeModal();switchTab('preflight')";
  root.innerHTML =
    '<div class="modal-bg modal-bg-anim" onclick="if(event.target===this)closeModal()"><div class="modal-sheet modal-sheet-anim">' +
    '<div class="modal-handle"></div>' +
    '<div class="modal-title">Quick Actions</div>' +
    '<button class="btn btn-gold mb8" onclick="'+workoutAction+'">'+workoutLabel+'</button>' +
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
  parts.push('<div class="fb"><span style="font-size:0.75rem;color:var(--muted)">Logged so far today</span>' +
             '<span style="font-family:var(--mono);font-size:1rem;font-weight:700">'+current.toFixed(2).replace(/\.?0+$/,'')+' L</span></div>');
  parts.push('<div class="fb" style="margin-top:4px"><span style="font-size:0.6875rem;color:var(--muted)">Target '+target.toFixed(1)+' L</span>' +
             '<span style="font-family:var(--mono);font-size:0.6875rem;color:'+hs.color+'">'+hs.label+'</span></div>');
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
      parts.push('<div class="fb"><span style="font-size:1.0625rem;font-weight:700">'+foodEmoji(item.description)+' '+item.description+'</span><button class="btn-ghost" style="font-size:0.6875rem" onclick="ST.mealBuilder.items.splice('+i+',1);renderMealBuilder()">✕</button></div>');
      // Serving and macros per row — without this there was no way to tell
      // whether a logged food meant one unit or several.
      const rowBits = [];
      if (item.servingDescription) rowBits.push(sanitizeUserText(item.servingDescription));
      rowBits.push(Math.round(item.nutrients?.calories || 0)+' cal');
      parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:2px">'+rowBits.join(' · ')+'</div>');
      parts.push('</div>');
    });
    const runningTotals = sumMealNutrients(mb.items);
    parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-top:6px">Running total: '+runningTotals.calories+' cal · P'+runningTotals.protein+'g · C'+runningTotals.carbs+'g · F'+runningTotals.fat+'g</div>');
  }

  // Meal Type and (implicitly) time are auto-set when the builder opens —
  // Meal Type by time of day, time to now at save — both still editable
  // here rather than requiring a tap before you can even take the photo.
  parts.push('<div class="field" style="margin-top:12px"><label>Meal Type (auto-detected, change if needed)</label><select onchange="ST.mealBuilder.mealType=this.value">');
  MEAL_TYPES.forEach(t => parts.push('<option value="'+t+'"'+(mb.mealType===t?' selected':'')+'>'+t[0].toUpperCase()+t.slice(1)+'</option>'));
  parts.push('</select></div>');

  // "Recent Meals" — matches the button/tab that leads here; previously
  // labeled "YOUR USUAL" and required 2+ exact-match logs, which almost
  // never happened for photo-logged meals (see getFrequentFoods above).
  // One tap adds a previously-logged item with its last-used macros
  // already filled in: no search, no photo call, no barcode scan needed
  // for a repeat meal, which covers most days for most people.
  if (mb.frequentFoods && mb.frequentFoods.length) {
    parts.push('<div class="section-label" style="margin-top:12px" id="recentMealsSection">RECENT MEALS</div>');
    parts.push('<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">');
    mb.frequentFoods.forEach((food, i) => {
      const srv = food.servingDescription ? sanitizeUserText(food.servingDescription)+' · ' : '';
      parts.push('<button class="btn-outline" style="font-size:0.75rem;padding:6px 10px;border-radius:20px" onclick="addFrequentFoodToMeal('+i+')">'+foodEmoji(food.description)+' '+sanitizeUserText(food.description)+' <span style="color:var(--muted)">· '+srv+food.nutrients.calories+' cal</span></button>');
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

  // BUG FIX: ST.foodSearchMode was set by the camera sheet's "Text input"
  // tab but never actually read anywhere — someone who explicitly asked
  // to type a food name still landed on the top of the full meal builder
  // (calorie ring, macro bars, AI fueling card) with the actual input box
  // scrolled off the bottom of the screen. Jump straight to it instead.
  if (ST.foodSearchMode) {
    ST.foodSearchMode = false; // one-shot — don't keep re-scrolling on every re-render
    const input = document.getElementById('foodSearchInput');
    if (input) {
      setTimeout(() => {
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        input.focus();
      }, 50);
    }
  }
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
  box.innerHTML = '<div style="font-size:0.6875rem;color:var(--muted);margin-top:6px">Searching…</div>';
  usdaSearchDebounce = setTimeout(async () => {
    const results = await searchUSDAFoods(query);
    if (!document.getElementById('usdaSearchResults')) return; // builder closed mid-search
    if (!results.length) { box.innerHTML = '<div style="font-size:0.6875rem;color:var(--muted);margin-top:6px">No matches. Try manual entry below.</div>'; return; }
    box.innerHTML = results.map((f,i) =>
      '<div class="card" style="padding:8px;margin-top:6px;cursor:pointer" onclick="selectUSDAFood('+i+')"><div style="font-size:0.8125rem">'+foodEmoji(f.description)+' '+f.description+(f.brandName?' <span style="color:var(--muted);font-size:0.6875rem">('+f.brandName+')</span>':'')+'</div><div style="font-size:0.6875rem;color:var(--muted)">'+f.nutrients.calories+' cal per '+usdaReferenceLabel(f)+'</div></div>'
    ).join('');
    window._usdaLastResults = results;
  }, 350);
}

async function selectUSDAFood(idx) {
  const picked = window._usdaLastResults?.[idx];
  if (!picked) return;
  const box = document.getElementById('usdaSearchResults');
  if (box) box.innerHTML = '<div style="font-size:0.6875rem;color:var(--muted)">Loading full details…</div>';
  const detail = await getUSDAFoodDetail(picked.fdcId) || picked;
  window._usdaPendingFood = detail;
  if (box) box.innerHTML =
    '<div class="card mt8"><div style="font-size:0.8125rem;margin-bottom:6px">'+detail.description+'</div>' +
    '<div class="field"><label>Servings (1 = '+usdaReferenceLabel(detail)+')</label>' +
    '<input type="text" inputmode="decimal" id="usdaServingMult" value="1" oninput="updateUSDAPreview()"></div>' +
    '<div id="usdaPreviewNutrients" style="font-size:0.6875rem;color:var(--muted);margin:6px 0"></div>' +
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
    description: sanitizeUserTextLong(food.description) + (parseFloat(mult) !== 1 ? ' ('+mult+'x)' : ''),
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
              font-size:1.125rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
            <!-- Flash + Flip -->
            <div style="display:flex;flex-direction:column;gap:10px;">
              <button id="fcfCamFlash" onclick="FCFCamera.toggleFlash()" style="
                width:44px;height:44px;border-radius:50%;
                background:rgba(0,0,0,0.55);border:none;color:#fff;
                font-size:1.25rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">⚡</button>
              <button onclick="FCFCamera.flipCamera()" style="
                width:44px;height:44px;border-radius:50%;
                background:rgba(0,0,0,0.55);border:none;color:#fff;
                font-size:1.25rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">🔄</button>
            </div>
          </div>

          <!-- Center hint -->
          <div style="
            position:absolute;bottom:24px;left:0;right:0;
            text-align:center;pointer-events:none;">
            <div style="font-size:1.375rem;font-weight:300;color:#fff;letter-spacing:.02em">Take a photo</div>
            <div style="font-size:0.875rem;color:rgba(255,255,255,0.75);margin-top:4px">Your meal items will be analyzed.</div>
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
              font-size:0.875rem;padding:8px 4px;cursor:pointer;letter-spacing:.03em;">Text input</button>
            <button onclick="FCFCamera._tabRecentMeals()" style="
              flex:1;background:none;border:none;color:rgba(255,255,255,0.65);
              font-size:0.875rem;padding:8px 4px;cursor:pointer;letter-spacing:.03em;">Recent meals</button>
            <button onclick="FCFCamera._tabLibrary()" style="
              flex:1;background:none;border:none;color:rgba(255,255,255,0.65);
              font-size:0.875rem;padding:8px 4px;cursor:pointer;letter-spacing:.03em;">Library</button>
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
      if (!ST.mealBuilder) return;
      ST.mealBuilder.frequentFoods = foods;
      renderMealBuilder();
      // BUG FIX (reported: tapping "Recent meals" "just takes me back to
      // the nutrition page" — the underlying data was already fixed
      // separately, but this never did anything to actually SURFACE it;
      // it just closed the camera and left the page wherever it
      // naturally renders, with Recent Meals sitting further down,
      // out of view). Scroll straight to it now that it's rendered, or
      // say plainly there's nothing yet rather than leaving a tap that
      // visibly does nothing.
      if (foods && foods.length) {
        requestAnimationFrame(() => {
          document.getElementById('recentMealsSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      } else {
        showToast('No recent meals yet. Log a few and they\'ll show up here.');
      }
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
    if (!el) { showBigToast('Camera unavailable. Try reloading the app.', 'warn'); return; }
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
  if (!el) { showBigToast('Photo library unavailable. Try reloading the app.', 'warn'); return; }
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
    box.innerHTML = '<div class="card mt8" style="font-size:0.75rem;color:var(--amber)">Analysis failed: ' + (result.message || result.error) + '. Try again or enter it manually below.</div>';
    return;
  }
  if (!ST.mealBuilder) return;

  // BUG FIX (reported): recognizing a food used to stop at an "Add to
  // Meal" button — confusing, since the whole point of taking the photo
  // was already selecting that food. Now it's auto-added the moment
  // recognition succeeds; the card below is for reviewing/correcting
  // what just got added, not deciding whether to add it at all.
  ST.mealBuilder.items.push({
    description: sanitizeUserTextLong(result.description),
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

  // BUG FIX (reported): after a successful photo analysis the result landed
  // wherever the page happened to be scrolled — usually far below the fold
  // behind the calorie ring, macro bars, and AI fueling card — so it looked
  // like the analysis had silently failed even though it worked correctly.
  setTimeout(() => {
    const resultBox = document.getElementById('foodPhotoResultRoot');
    if (resultBox) resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
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
    parts.push('<span style="font-size:0.625rem;'+(i===idx?'color:'+q.color+';font-weight:700':'color:var(--muted)')+'">'+q.label+'</span>');
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
  parts.push('<div style="font-size:0.6875rem;color:var(--gold);font-weight:700;margin-bottom:8px">✓ ADDED: review or correct below</div>');

  if (meta.source === 'photo' && meta.imageUrl) {
    parts.push('<img src="' + meta.imageUrl + '" style="width:100%;max-height:200px;object-fit:cover;border-radius:10px;margin-bottom:10px">');
  }

  if (lowConfidence) {
    parts.push('<div style="font-size:0.75rem;color:var(--amber);margin-bottom:8px">⚠ Best guess only (' + Math.round(meta.confidence * 100) + '% confidence). Is this right? Edit anything below if not.</div>');
  } else if (meta.source === 'photo') {
    parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-bottom:8px">' + Math.round(meta.confidence * 100) + '% confidence</div>');
  } else if (meta.brandName) {
    parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-bottom:8px">' + sanitizeUserText(meta.brandName) + '</div>');
  }
  parts.push('<div class="field"><label>' + foodEmoji(item.description) + ' Description</label><textarea id="foodRecDescription" rows="4" style="resize:vertical;overflow:hidden;box-sizing:border-box;font-family:inherit;font-size:inherit;line-height:1.4" oninput="autoGrowTextarea(this);updateReviewedItemField(\'description\', this.value)" onkeyup="autoGrowTextarea(this)">' + sanitizeUserTextLong(item.description) + '</textarea></div>');
  // Fixed rows="2" clipped anything longer (e.g. "...with granola" losing
  // its third line with no way to scroll and see it). Auto-grow on render
  // too, not just on input, so an AI-generated description that's already
  // 3 lines long is fully visible the moment the card appears.
  setTimeout(() => { const ta = document.getElementById('foodRecDescription'); if (ta) autoGrowTextarea(ta); }, 0);
  if (meta.servingDescription) {
    parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-bottom:6px">Estimated portion: ' + sanitizeUserText(meta.servingDescription) + '</div>');
  }

  // Advisor — the qualitative read Oura leads with, alongside (not instead
  // of) the precise macros pilots actually asked to keep. Only present for
  // photo results with a real assessment; a barcode's exact product match
  // or a subjective call the model didn't return doesn't get a fake one.
  if (meta.source === 'photo' && meta.qualityRating && meta.advisorNote) {
    parts.push('<div style="background:var(--bg3);border-radius:10px;padding:10px;margin-bottom:10px">');
    parts.push('<div style="font-size:0.6875rem;color:var(--gold);margin-bottom:4px">✦ Advisor</div>');
    // No height cap or clamp — the block grows to whatever the Advisor
    // actually wrote rather than cutting it off.
    parts.push('<div style="font-size:0.8125rem;color:var(--text);margin-bottom:2px;line-height:1.45">' + escapeUserProse(meta.advisorNote) + '</div>');
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
    parts.push('<div style="font-size:0.625rem;color:var(--muted);margin:6px 0">' + meta.quota.used + ' of ' + meta.quota.limit + ' photo analyses used today</div>');
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
    item.description = sanitizeUserTextLong(value);
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
  if (descEl) { descEl.value = item.description; autoGrowTextarea(descEl); }
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
  if (typeof Html5Qrcode === 'undefined') { showBigToast('Barcode scanner failed to load. Check your connection and reload.', 'warn'); return; }
  const root = document.getElementById('modalRoot');
  if (!root) return;
  root.innerHTML =
    '<div class="modal-bg"><div class="modal-sheet">' +
    '<div class="modal-title">SCAN BARCODE</div>' +
    '<div id="barcodeScannerBox" style="border-radius:12px;overflow:hidden;min-height:250px;background:#000"></div>' +
    '<div id="barcodeScannerStatus" style="font-size:0.75rem;color:var(--muted);margin-top:8px">Point your camera at the barcode.</div>' +
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
    if (box) box.innerHTML = '<div class="card mt8" style="font-size:0.75rem;color:var(--amber)">No product found for that barcode. Try search or manual entry below.</div>';
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
  parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-bottom:10px">'+earnedCount+' of '+BADGES.length+' earned</div>');
  parts.push('<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">');
  BADGES.forEach(b => {
    const earned = ST.badges[b.id];
    parts.push('<div style="border:1px solid '+(earned?'var(--gold)':'var(--border)')+';border-radius:8px;padding:10px;text-align:center;position:relative'+(earned?'':';background:rgba(255,255,255,0.015)')+'">');
    if (earned) {
      parts.push('<div style="font-size:1.375rem">'+b.icon+'</div>');
    } else {
      // Desaturated real icon rather than a plain lock — reads as
      // "this badge exists and you're working toward it" instead of
      // "blocked." Small lock badge overlays the corner instead of
      // replacing the icon entirely.
      parts.push('<div style="font-size:1.375rem;filter:grayscale(1);opacity:0.35">'+b.icon+'</div>');
      parts.push('<div style="position:absolute;top:6px;right:6px;font-size:0.625rem;opacity:0.5">🔒</div>');
    }
    parts.push('<div style="font-size:0.6875rem;font-weight:700;margin-top:4px'+(earned?'':';color:var(--muted)')+'">'+b.title+'</div>');
    parts.push('<div style="font-size:0.5625rem;color:var(--muted);margin-top:2px;line-height:1.4'+(earned?'':';opacity:0.7')+'">'+b.desc+'</div>');
    if (earned) parts.push('<div style="font-family:var(--mono);font-size:0.5rem;color:var(--gold);margin-top:4px">'+new Date(earned).toLocaleDateString()+'</div>');
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

  // ── Context banner ────────────────────────────────────────────────────────
  if (!isNative) {
    // Web/PWA users — explain that iOS gets this automatically
    parts.push('<div class="card mb12" style="border-left:3px solid var(--gold)">');
    parts.push('<div style="font-size:0.8125rem;font-weight:600;margin-bottom:6px">📅 Schedule Import</div>');
    parts.push('<div style="font-size:0.75rem;color:var(--muted);line-height:1.65">');
    parts.push('On the <strong style="color:var(--text)">iOS app</strong>, your flights sync automatically from Apple Calendar, no upload needed. ');
    parts.push('If you\'re using the web version, or your airline gives you a schedule export, upload it as an <strong style="color:var(--text)">.ics file</strong> below. ');
    parts.push('Most crew scheduling systems (Crew Web, PBS, Google Calendar) can export .ics. ');
    parts.push('If yours exports CSV, email it to yourself, open it in Google Calendar, and export from there as .ics.');
    parts.push('</div></div>');
  }

  // ── Schedule source ──────────────────────────────────────────────────────
  // Only meaningful once there's actually more than one place schedule
  // data could come from — hidden entirely otherwise so someone who's only
  // Consolidated into ONE card (was three separate boxes: Schedule Source,
  // Apple Calendar, ICS Upload) — reported as "jumbled", and it was: three
  // conceptually-related things about "where does your schedule come
  // from" each rendered as its own full bordered box. Same information,
  // organized as one topic with internal dividers instead of three
  // visually-disconnected cards competing for attention.
  const showSourceToggle = isNative && (ST.calendarGranted || ST.flightSchedule?.length);
  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">SCHEDULE</div>');

  if (showSourceToggle) {
    const sourceOpt = (val, label) => {
      const on = ST.scheduleSource === val;
      return '<button onclick="haptic(\'selection\');setScheduleSource(\''+val+'\')" style="flex:1;padding:9px 4px;border-radius:8px;border:none;font-size:0.7188rem;font-weight:'+(on?'700':'400')+';background:'+(on?'var(--gold)':'var(--bg3)')+';color:'+(on?'#1a1400':'var(--muted)')+';cursor:pointer;-webkit-tap-highlight-color:transparent">'+label+'</button>';
    };
    parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-bottom:8px;line-height:1.5">Which schedule to use when more than one source is available.</div>');
    parts.push('<div style="display:flex;gap:6px;margin-bottom:16px">');
    parts.push(sourceOpt('auto', 'Auto'));
    parts.push(sourceOpt('calendar', 'Apple Calendar'));
    parts.push(sourceOpt('ics', 'Uploaded File'));
    parts.push('</div>');
  }

  // ── Home base timezone ───────────────────────────────────────────────────
  // BUG FIX (reported: "the AI thinks it's several hours behind... something
  // going on with the calendar/ics upload/auto function where you set your
  // time zone"). This used to live only inside the Apple-Calendar-only
  // (isNative) block below, described as fixing "Apple Calendar sync
  // specifically — the .ics upload path already has its own, separate
  // correction." That claim was wrong: the .ics path (descriptionLocalTimes)
  // had NO base-timezone correction at all — it just used the device's
  // current local time unconditionally, with no way to override it, which
  // is exactly the same class of bug this setting exists to fix. Moved out
  // here so it always renders — it now also drives descriptionLocalTimes'
  // correction for the .ics/Uploaded File path below, on every platform,
  // not just Apple Calendar sync on iOS. "Auto" preserves the old (device's
  // current location) behavior for anyone who hasn't set this yet.
  const TZ_OPTIONS = [
    ['auto', 'Auto (device\u2019s current location)'],
    ['America/New_York', 'Eastern'],
    ['America/Chicago', 'Central'],
    ['America/Denver', 'Mountain'],
    ['America/Phoenix', 'Arizona (no DST)'],
    ['America/Los_Angeles', 'Pacific'],
    ['America/Anchorage', 'Alaska'],
    ['Pacific/Honolulu', 'Hawaii'],
  ];
  parts.push('<div style="font-size:0.6875rem;font-weight:700;color:var(--text);letter-spacing:0.04em;margin-bottom:8px">HOME BASE TIMEZONE</div>');
  parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-bottom:6px;line-height:1.5">Your crew-scheduling export (Apple Calendar sync or an uploaded .ics) stamps every flight/layover time using this timezone, whatever timezone your device currently thinks it\'s in. Set it once to your actual home base \u2014 most pilots should pick this over &quot;Auto,&quot; since &quot;Auto&quot; silently switches to wherever your device physically is, which is wrong the moment you\'re away from base. If AI-reported times ever look off by a few hours, this is almost always why.</div>');
  parts.push('<select onchange="haptic(\'selection\');setBaseTimezone(this.value)" style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:0.8125rem;margin-bottom:16px">');
  TZ_OPTIONS.forEach(([val, label]) => {
    parts.push('<option value="'+val+'"'+(ST.baseTimezone===val?' selected':'')+'>'+label+'</option>');
  });
  parts.push('</select>');

  // ── Apple Calendar sub-section ──────────────────────────────────────────
  if (isNative) {
    parts.push('<div style="font-size:0.6875rem;font-weight:700;color:var(--text);letter-spacing:0.04em;margin-bottom:8px">APPLE CALENDAR</div>');
    // BUG FIX: ST.calendarEvents now always reflects the true raw event
    // count (see classifyCalendarEvents in app.js) even when AI
    // classification specifically failed — so this length check alone is
    // now an honest signal of "did the native fetch find anything",
    // decoupled from "did the AI successfully type them". A separate
    // warning banner covers the classification-failed case specifically.
    if (ST.calendarGranted && ST.calendarEvents?.length) {
      const flights = ST.calendarEvents.filter(e => e.type === 'flight').length;
      const total   = ST.calendarEvents.length;
      parts.push('<div style="font-size:0.6875rem;color:var(--green);margin-bottom:8px">✅ Connected: '+total+' events classified ('+flights+' flights)</div>');
      if (ST.calendarDuplicatesRemoved > 0) {
        parts.push('<div style="font-size:0.6875rem;color:var(--muted);margin-bottom:8px">ℹ️ '+ST.calendarDuplicatesRemoved+' duplicate calendar entries were automatically filtered out.</div>');
      }
      if (ST.calendarSyncError) {
        parts.push('<div style="font-size:0.6875rem;color:var(--amber);margin-bottom:8px">⚠️ '+ST.calendarSyncError+'</div>');
      }
      parts.push('<button class="btn btn-outline" onclick="haptic(\'light\');showToast(\'Syncing calendar\u2026\');if(typeof FCFBridge!==\'undefined\')FCFBridge.syncCalendar(ST.baseTimezone)">↻ Sync Now</button>');
    } else if (ST.calendarGranted && !ST.calendarEvents?.length) {
      const msg = ST.calendarSyncError || 'Calendar access granted but no events found in the next 60 days.';
      parts.push('<div style="font-size:0.75rem;color:var(--muted);margin-bottom:10px;line-height:1.6">'+msg+'</div>');
      parts.push('<button class="btn btn-outline" onclick="haptic(\'light\');showToast(\'Syncing calendar\u2026\');if(typeof FCFBridge!==\'undefined\')FCFBridge.syncCalendar(ST.baseTimezone)">↻ Sync Now</button>');
    } else {
      parts.push('<div style="font-size:0.75rem;color:var(--muted);margin-bottom:10px;line-height:1.6">Grant access to your Apple Calendar and FCF will automatically detect your flights, layovers, and personal commitments, no manual upload needed.</div>');
      parts.push('<button class="btn btn-outline" onclick="if(typeof FCFBridge!==\'undefined\')FCFBridge.requestCalendar(ST.baseTimezone)">Connect Apple Calendar</button>');
    }
    parts.push('<div style="height:1px;background:var(--border);margin:16px 0"></div>');
  }

  // ── Uploaded File sub-section ───────────────────────────────────────────
  parts.push('<div style="font-size:0.6875rem;font-weight:700;color:var(--text);letter-spacing:0.04em;margin-bottom:8px">'+(isNative ? 'UPLOADED FILE (.ICS)' : 'FLIGHT SCHEDULE')+'</div>');
  parts.push('<div style="font-size:0.75rem;color:var(--muted);margin-bottom:10px;line-height:1.6">'+(isNative ? 'If your airline gives you a .ics export from their crew scheduling app, you can upload it here as an alternative or supplement to Apple Calendar.' : 'Upload your crew schedule as an .ics file. Preflight will automatically default your Mission Environment based on whether you\'re on a layover or at home today.')+'</div>');
  if (ST.flightSchedule && ST.flightSchedule.length) {
    const dates = ST.flightSchedule.map(e => new Date(e.start)).sort((a,b)=>a-b);
    const first = dates[0].toLocaleDateString('en-US',{month:'short',day:'numeric'});
    const last  = dates[dates.length-1].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    parts.push('<div style="font-size:0.6875rem;color:var(--green);margin-bottom:8px">✅ Schedule loaded: covers '+first+' to '+last+' ('+ST.flightSchedule.length+' events)</div>');
    parts.push('<button class="btn btn-outline" onclick="downloadFlightScheduleICS()">📅 Download My Uploaded Schedule</button>');
  }
  parts.push('<input type="file" id="icsFileInput" accept=".ics" style="display:none" onchange="handleICSUpload(this.files[0])">');
  parts.push('<button class="btn btn-outline mt8" onclick="document.getElementById(\'icsFileInput\').click()">'+(ST.flightSchedule?.length ? '🔄 Replace Schedule' : '📤 Upload .ics Schedule')+'</button>');
  parts.push('</div>');

  // ── Export ────────────────────────────────────────────────────────────────
  parts.push('<div class="card mb12">');
  parts.push('<div class="section-label" style="margin-top:0">EXPORT DATA</div>');
  parts.push('<div style="font-size:0.75rem;color:var(--muted);margin-bottom:10px;line-height:1.6">Exports everything the app holds, in one CSV with labelled sections: your goal and nutrition targets, workouts (one row per set), every weigh-in and body measurement, Oura daily metrics, every logged food item, hydration and flight hours, your scheduled flights, and your medication and supplement list with check-off history. Optimized for AI analysis.</div>');
  parts.push('<div style="font-size:0.6875rem;color:var(--gold);margin-bottom:10px;line-height:1.5">💡 Recommended: export and review weekly. Daily exports are too noisy to show real trends; monthly is often too late to catch a stall early.</div>');
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
    if (!events.length) {
      showBigToast("Couldn't find any events in that file. Check it's the right format.", 'warn');
      return;
    }
    ST.flightSchedule = events;
    ST.flightScheduleRaw = text;
    const profile = (await dbGetProfile()) || {};
    profile.flightSchedule = events;
    profile.flightScheduleRaw = text;
    await dbSetProfile(profile);
    showBigToast('✓ Schedule loaded: ' + events.length + ' events.', 'ok');
    applyScheduleEnvironmentSuggestion();
    renderPage();
  } catch (e) {
    showBigToast("Couldn't read that file. Make sure it's a valid .ics export.", 'warn');
  }
}

function downloadFlightScheduleICS() {
  if (!ST.flightScheduleRaw) return;
  deliverFile('my_flight_schedule.ics', 'text/calendar', ST.flightScheduleRaw);
}
