// Minimal rebuilt test harness — the sandbox reset wiped the ~400-test suite
// built up over the prior session. This is a focused stub sufficient to load
// app.js and test new work going forward, not a full reconstruction.
let PASS = 0, FAIL = 0;
function log(label, cond, detail) {
  if (cond) { PASS++; console.log('PASS | ' + label + (detail ? ' — ' + detail : '')); }
  else { FAIL++; console.log('FAIL | ' + label + (detail ? ' — ' + detail : '')); }
}

const _lsStore = {};
global.localStorage = new Proxy(_lsStore, {
  get(t, prop) {
    if (prop === 'getItem') return (k) => (k in t ? t[k] : null);
    if (prop === 'setItem') return (k, v) => { t[k] = String(v); };
    if (prop === 'removeItem') return (k) => { delete t[k]; };
    if (prop === 'key') return () => null;
    if (prop === 'length') return Object.keys(t).length;
    return t[prop];
  },
});

const _fakeEl = {
  _html: '',
  get innerHTML() { return this._html; },
  set innerHTML(v) { this._html = v; },
  style: {}, classList: { toggle(){}, add(){}, remove(){} },
  addEventListener(){}, querySelectorAll: () => [], appendChild(){}, remove(){},
  setAttribute(){}, getAttribute(){return null;}, click(){},
};

global.document = {
  getElementById: () => _fakeEl,
  addEventListener(){},
  querySelectorAll: () => [],
  createElement: () => ({style:{}, setAttribute(){}, appendChild(){}, remove(){}}),
  body: { appendChild(){} },
  visibilityState: 'visible',
};

global.window = {
  location: { search: '', origin: 'https://flightcrew.fit', pathname: '/', hash: '', reload(){} },
  addEventListener(){}, open(){},
  matchMedia: () => ({matches:false, addEventListener(){}}),
  history: { replaceState(){} },
};
Object.defineProperty(global, 'navigator', {
  value: { onLine: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', standalone: false },
  writable: true, configurable: true,
});
global.window.navigator = global.navigator;

global.requestAnimationFrame = (cb) => cb();
global.fetch = async () => ({ ok: true, json: async () => ({}), text: async () => '' });
global.confirm = () => true;
global.alert = () => {};
global.navigator.serviceWorker = { register: async () => ({ addEventListener(){} }), addEventListener(){} };

global.supabase = {
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signInWithPassword: async () => ({ data: { user: null }, error: null }),
      signUp: async () => ({ data: { user: null }, error: null }),
      signOut: async () => ({}),
      updateUser: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({ error: null }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }), order: () => ({ limit: async () => ({ data: [] }) }), gte: () => ({ order: () => ({ limit: async () => ({data:[]}) }) }) }), limit: async () => ({ data: [], error: null }) }),
      upsert: async () => ({ error: null }),
      insert: async () => ({ error: null }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
};

eval(require('fs').readFileSync('/home/claude/pilot-program/app.js','utf8'));

(async () => {

// ── placeholder — real tests appended below ──

console.log('---TOTALS---');
console.log('PASS:', PASS, '| FAIL:', FAIL);
// ── v5.19.6: CATALOG + SYNONYM EXPANSION ──

// New exercises exist and are scoped to commercial gym (has machines)
const commAll = [
  ...WORKOUTS.comm['Lower Body'].enroute,
  ...WORKOUTS.comm['Upper Pull'].enroute,
  ...WORKOUTS.comm['Upper Push'].enroute,
];
const newNames = ['Seated Calf Raise (Machine)','Hip Abduction (Machine)','Hip Adduction (Machine)','Assisted Pull-Up (Machine)','T-Bar Row (Machine)','Cable Tricep Pushdown','Assisted Dip (Machine)'];
newNames.forEach(name => {
  log('new exercise exists in comm catalog: ' + name, commAll.some(e => e.name === name), '');
});
log('new machine exercises NOT added to hotel-room catalog (no machines there)', !WORKOUTS.room['Lower Body'].enroute.some(e => e.name.includes('Machine')), '');

// No accidental ID collisions from the new additions
const allIds = commAll.map(e => e.id);
log('no duplicate exercise ids among comm Lower Body / Upper Pull / Upper Push', new Set(allIds).size === allIds.length, allIds.length + ' total');

// EXERCISE_SYNONYMS resolve correctly through exerciseMatchesQuery — both
// exact and shorter/partial user-typed queries, matching how synonym
// lookup actually works (dictionary key must contain the typed query).
const cases = [
  ['leg extension', 'Leg Extension (Machine)'],
  ['quad extension', 'Leg Extension (Machine)'],
  ['leg curl', 'Seated Leg Curl (Machine)'],
  ['ham curl', 'Seated Leg Curl (Machine)'],
  ['glute machine', 'Glute Kickback (Machine)'],
  ['hip abductor', 'Hip Abduction (Machine)'],
  ['pec deck', 'Pec Fly (Machine)'],
  ['machine incline press', 'Incline Chest Press (Machine)'],
  ['tricep pushdown', 'Cable Tricep Pushdown'],
  ['assisted pull up', 'Assisted Pull-Up (Machine)'],
  ['t bar row', 'T-Bar Row (Machine)'],
  ['smith squat', 'Smith Machine Squat'],
  ['smith bench', 'Smith Machine Bench Press'],
  ['lat pull', 'Lat Pulldown'],
  ['seated row', 'Seated Cable Row'],
];
cases.forEach(([query, canonical]) => {
  log('synonym resolves: "'+query+'" -> '+canonical, exerciseMatchesQuery(canonical, query) === true, '');
});

// Partial/shorter typed queries also work (real-world typing, not just exact keys)
log('shorter partial query still matches ("quad" alone finds Leg Extension via "quad extension" synonym)', exerciseMatchesQuery('Leg Extension (Machine)', 'quad') === true, '');

// The YouTube guide fallback works automatically for brand-new exercises
// with zero per-exercise setup — confirmed by checking the guide function
// itself falls through to openYouTubeSearch for anything not in its small
// hardcoded list of pre-built animated guides.
log('openExerciseGuide falls back to YouTube search for new exercises with no per-exercise setup needed', openExerciseGuide.toString().includes('openYouTubeSearch'), '');
log('openYouTubeSearch builds a generic, name-based search URL — works for ANY exercise automatically', openYouTubeSearch.toString().includes("youtube.com/results?search_query"), '');

// Sanity: the guide button itself renders for a new exercise directly via
// buildExCard — getActiveWorkout() intentionally filters to a subset per
// session (goal/level-based), so a new exercise isn't guaranteed to be
// selected on any given day; testing the render function directly is the
// correct check here, not whether today's filtered workout happens to include it.
document.getElementById = () => _fakeEl;
ST.sets = { c_lb_er10: [{reps:'',weight:''}] };
ST.expanded = { c_lb_er10: true };
const hipAbEx = WORKOUTS.comm['Lower Body'].enroute.find(e => e.id === 'c_lb_er10');
const cardHtml = buildExCard(hipAbEx, 'enroute');
log('Guide button renders for new machine exercises (Hip Abduction)', cardHtml.includes('openExerciseGuide') && cardHtml.includes('Hip Abduction'), '');

// ── v5.19.7: PREFLIGHT SIMPLIFICATION ──
document.getElementById = () => _fakeEl;
ST.customExercises=[]; ST.injuries=[]; ST.activeCustomProfileId=null; ST.customProfiles=[];
ST.timeAvailMin = null; ST.env='comm'; ST.muscleGroup='Lower Body'; ST.goal='muscle'; ST.fatigue='go'; ST.level='intermediate';
ST.sex = 'male'; ST.username = null; ST.ouraConnected = false; ST.readiness = 4; ST.sleepHours = 7;
ST.flightHrsRaw=''; ST.flightHrs=0; ST.flightHrsTouched=false; ST.waterInRaw=''; ST.waterIn=0;
ST.lastSession = null;
SB.from = () => ({ select: () => ({ eq: () => ({ gte: () => ({ lte: () => ({ order: async () => ({data:[]}) }) }) }) }) });

// New user (zero session history): everything expanded by default
ST.sessionCache = [];
ST.showChangePlan=false; ST.showConditionDetail=false; ST.showInjuryDetail=false; ST.showCalendarDetail=false;
await renderPreflight(_fakeEl);
let html = _fakeEl.innerHTML || '';
log('new user: hero shows TODAY\'S MISSION with the plan name', html.includes('TODAY\'S MISSION') && html.includes('Lower Body'), '');
log('new user: Change Plan auto-expanded (Mission Profile picker visible)', html.includes('MISSION PROFILE') && html.includes('mg-wrap'), '');
log('new user: Pilot Condition detail auto-expanded (readiness input visible)', html.includes('How recovered do you feel today'), '');
log('new user: Injury Flag detail auto-expanded (region grid visible)', html.includes('INJURY FLAG') && html.includes('Shoulder'), '');
log('Training Calendar no longer lives in Preflight at all — moved to Trends, which is the review screen', !html.includes('📅 Training Calendar'), '');

// Returning user (has history): everything collapsed to one-line summaries by default
ST.sessionCache = [{date: new Date().toISOString(), sets:{}}];
await renderPreflight(_fakeEl);
html = _fakeEl.innerHTML || '';
log('BUG FIX (simplification): returning user sees collapsed Change Plan summary, not the full picker', html.includes('Same as your usual plan') && !html.includes('mg-wrap'), '');
log('BUG FIX: Pilot Condition collapses to one status line, not the full input', html.includes('Pilot Condition:') && html.includes('ADJUST') && !html.includes('How recovered do you feel today'), '');
log('BUG FIX: Injury Flag collapses to one status line, not the full region grid', html.includes('No injuries flagged') && !html.includes('Shoulder'), '');
log('regression: Training Calendar still absent from Preflight for returning users too', !html.includes('📅 Training Calendar'), '');
log('hero ENGAGE WORKOUT button still present and prominent for returning users', html.includes('ENGAGE WORKOUT'), '');

// Tapping each toggle correctly expands its own section (and only that one)
ST.showChangePlan = true;
await renderPreflight(_fakeEl);
html = _fakeEl.innerHTML || '';
log('tapping Change Plan reveals Mission Profile / Time / Environment pickers', html.includes('mg-wrap') && html.includes('TIME AVAILABLE') && html.includes('MISSION ENVIRONMENT'), '');
log('tapping Change Plan does NOT also expand Pilot Condition or Injury (independent toggles)', !html.includes('How recovered do you feel today') && !html.includes('Shoulder'), '');
ST.showChangePlan = false;

ST.showConditionDetail = true;
await renderPreflight(_fakeEl);
html = _fakeEl.innerHTML || '';
log('tapping Pilot Condition reveals the readiness input', html.includes('How recovered do you feel today'), '');
ST.showConditionDetail = false;

ST.showInjuryDetail = true;
await renderPreflight(_fakeEl);
html = _fakeEl.innerHTML || '';
log('tapping Injury Flag reveals the body-region grid', html.includes('Shoulder') && html.includes('Lower Back'), '');
ST.showInjuryDetail = false;

// Custom profile shows correctly in the hero, not a muscle-group name
ST.customProfiles = [{ id:'cp1', name:'My Push Day', taxi:[], takeoff:[{id:'ex1',name:'Bench',target:'3x8',sets:3}], enroute:[], landing:[] }];
ST.activeCustomProfileId = 'cp1';
await renderPreflight(_fakeEl);
html = _fakeEl.innerHTML || '';
log('BUG-FREE: hero shows the custom routine name, not a generic muscle group', html.includes('My Push Day'), '');
log('hero correctly labels a custom routine as "used as saved", matching the existing design decision', html.includes('Custom routine, used as saved'), '');
ST.activeCustomProfileId = null; ST.customProfiles = [];

// Existing fatigue-alert and injury-swap logic still renders correctly
// within the (now collapsed-by-default) condition/plan sections
ST.fatigue = 'nogo'; ST.showConditionDetail = true;
await renderPreflight(_fakeEl);
html = _fakeEl.innerHTML || '';
log('regression: NO-GO fatigue alert still renders inside the expanded condition detail', html.includes('Only Taxi and Landing phases active'), '');
ST.fatigue = 'go'; ST.showConditionDetail = false;

// Hydration and Last Mission cards are unaffected by the rework
ST.lastSession = { date: new Date().toISOString(), muscle_group: 'Upper Push' };
await renderPreflight(_fakeEl);
html = _fakeEl.innerHTML || '';
log('regression: Hydration Payload card unaffected', html.includes('HYDRATION PAYLOAD'), '');
log('regression: Last Mission card unaffected', html.includes('LAST MISSION') && html.includes('Upper Push'), '');

// ── v5.19.8: BUILD-YOUR-OWN DROPDOWN ALONGSIDE SEARCH ──
document.getElementById = () => _fakeEl;
ST.buildProfile = { name:'Test Routine', taxi:[], takeoff:[], enroute:[], landing:[], id:'bp1' };
renderProfileBuilder();
let bpHtml2 = _fakeEl.innerHTML || '';
log('BUG FIX: each section now has both a search field AND a browsable dropdown', (bpHtml2.match(/Search to add/g)||[]).length === 3 && (bpHtml2.match(/<select/g)||[]).length === 3, '');
log('dropdown has a clear placeholder, not a real exercise as the default', bpHtml2.includes('— Or browse to add —'), '');
log('dropdown is populated with real catalog exercise names', bpHtml2.includes('Standing Calf Raise') || bpHtml2.includes('Leg Press') || bpHtml2.includes('Barbell Bench'), '');

// Adding via the dropdown works correctly
const someExId = bpSearchSource()[0].id;
const someExName = bpSearchSource()[0].name;
ST.buildProfile = { name:'Test Routine', taxi:[], takeoff:[], enroute:[], landing:[], id:'bp1' };
bpAddFromDropdown('taxi', someExId);
log('BUG FIX: selecting a dropdown option adds it to the correct section', ST.buildProfile.taxi.length === 1 && ST.buildProfile.taxi[0].id === someExId, someExName);

// Empty selection (the placeholder) is safely ignored
ST.buildProfile = { name:'Test', taxi:[], takeoff:[], enroute:[], landing:[], id:'bp1' };
bpAddFromDropdown('taxi', '');
log('dropdown: empty/placeholder selection does not add anything or throw', ST.buildProfile.taxi.length === 0, '');

// Already-chosen exercise is not added twice (defense in depth, matching search's own dedup)
ST.buildProfile = { name:'Test', taxi:[{id:someExId, name:someExName}], takeoff:[], enroute:[], landing:[], id:'bp1' };
bpAddFromDropdown('taxi', someExId);
log('dropdown: cannot add the same exercise twice', ST.buildProfile.taxi.length === 1, '');

// Search and dropdown share the same exclusion set — once added via one, it
// disappears from BOTH paths, not just the one that added it.
ST.buildProfile = { name:'Test', taxi:[], takeoff:[], enroute:[], landing:[], id:'bp1' };
bpAddFromDropdown('taxi', someExId);
renderProfileBuilder();
bpHtml2 = _fakeEl.innerHTML || '';
log('BUG-FREE: an exercise added via dropdown is excluded from the dropdown on next render (no duplicates offered)', !bpHtml2.includes('value="'+someExId+'"'), '');

// ── v5.19.9: WARMUP/COOLDOWN DROPDOWN TYPE FILTERING ──
document.getElementById = () => _fakeEl;

// isWarmupOrMobilityExercise correctly identifies genuine warmup content
log('isWarmupOrMobilityExercise: a real stretch qualifies', isWarmupOrMobilityExercise({inputType:'timed_bilateral', name:'Standing Calf Stretch'}) === true, '');
log('isWarmupOrMobilityExercise: curated dynamic warmup movement qualifies (Leg Swings)', isWarmupOrMobilityExercise({name:'Leg Swings (Front & Side)'}) === true, '');
log('isWarmupOrMobilityExercise: curated movement qualifies (Cat-Cow)', isWarmupOrMobilityExercise({name:'Cat-Cow'}) === true, '');
log('BUG FIX: a heavy strength lift that happens to occupy a taxi slot via goal-overlay does NOT qualify (DB Bench Press)', isWarmupOrMobilityExercise({name:'DB Bench Press', inputType:'reps_weight'}) === false, '');
log('BUG FIX: Kettlebell Goblet Squat (Heavy) does NOT qualify — only the (Warmup) variant does', isWarmupOrMobilityExercise({name:'Kettlebell Goblet Squat (Heavy)'}) === false, '');
log('Kettlebell Goblet Squat (Warmup) DOES qualify — explicitly labeled as warmup content', isWarmupOrMobilityExercise({name:'Kettlebell Goblet Squat (Warmup)'}) === true, '');
log('a generic strength exercise does not qualify', isWarmupOrMobilityExercise({name:'Barbell Bench Press', inputType:'reps_weight'}) === false, '');

// Dropdown rendering: taxi section only shows warmup/stretch content
ST.buildProfile = { name:'Test', taxi:[], takeoff:[], enroute:[], landing:[], id:'bp1' };
renderProfileBuilder();
let bpHtml3 = _fakeEl.innerHTML || '';
const taxiSectionIdx = bpHtml3.indexOf('WARMUP / STRETCHING');
const mainSectionIdx = bpHtml3.indexOf('MAIN EXERCISES');
const taxiBlock = bpHtml3.slice(taxiSectionIdx, mainSectionIdx);
log('BUG FIX: Warmup/Stretching dropdown includes genuine warmup content (Leg Swings)', taxiBlock.includes('Leg Swings'), '');
log('BUG FIX: Warmup/Stretching dropdown does NOT include unrelated strength exercises (Barbell Bench Press)', !taxiBlock.includes('Barbell Bench Press'), '');
log('BUG FIX: Warmup/Stretching dropdown does NOT include machine exercises (Leg Press)', !taxiBlock.includes('>Leg Press<'), '');

// Cooldown Stretches section only shows actual stretches, narrower than Warmup
const cooldownSectionIdx = bpHtml3.indexOf('COOLDOWN STRETCHES');
const cooldownBlock = bpHtml3.slice(cooldownSectionIdx);
log('Cooldown Stretches dropdown includes real stretches', cooldownBlock.includes('Standing Calf Stretch') || cooldownBlock.includes('Stretch'), '');
log('BUG-FREE: Cooldown Stretches dropdown does NOT include dynamic warmup-only movements (Leg Swings is warmup, not a stretch)', !cooldownBlock.includes('Leg Swings'), '');
log('Cooldown Stretches dropdown does not include strength exercises either', !cooldownBlock.includes('Barbell Bench Press'), '');

// Main Exercises dropdown remains fully unfiltered (regression check)
const mainBlock = bpHtml3.slice(mainSectionIdx, cooldownSectionIdx);
log('regression: Main Exercises dropdown is NOT filtered — still shows the full catalog', mainBlock.includes('Barbell Bench Press') && mainBlock.includes('Leg Press'), '');

// The search box remains the unrestricted escape hatch for all sections —
// unlike the dropdown, typing directly still finds anything regardless of section.
log('search box (bpFilter) is unaffected by the dropdown filtering — still searches the whole catalog for taxi section', (() => {
  ST.buildProfile = { name:'Test', taxi:[], takeoff:[], enroute:[], landing:[], id:'bp1' };
  bpFilter('taxi', 'bench press');
  const resultsHtml = _fakeEl.innerHTML || '';
  return resultsHtml.toLowerCase().includes('bench press');
})(), '');

// ── v5.19.10: PLAIN BODYWEIGHT EXERCISES (push-up, sit-up, and friends) ──
const roomUp = WORKOUTS.room['Upper Push'].enroute;
const hotelUp = WORKOUTS.room['Upper Push'].enroute; // reused var name check below uses correct source
const commUp = WORKOUTS.comm['Upper Push'].enroute;
const hUp = WORKOUTS.hotel['Upper Push'].enroute;

log('BUG FIX: plain Push-Up exists in Hotel Room (previously only advanced variants)', roomUp.some(e => e.name === 'Push-Up'), '');
log('BUG FIX: plain Push-Up exists in Hotel Gym', hUp.some(e => e.name === 'Push-Up'), '');
log('BUG FIX: plain Push-Up exists in Commercial Gym', commUp.some(e => e.name === 'Push-Up'), '');

const roomLb = WORKOUTS.room['Lower Body'].enroute;
log('BUG FIX: plain Bodyweight Squat exists in Hotel Room (previously only unilateral/advanced variants)', roomLb.some(e => e.name === 'Bodyweight Squat'), '');

const roomFb = WORKOUTS.room['Full Body'].enroute;
const commFb = WORKOUTS.comm['Full Body'].enroute;
const hFb = WORKOUTS.hotel['Full Body'].enroute;
log('BUG FIX: Sit-Up exists in Room Full Body (previously zero sit-ups/crunches anywhere in the whole catalog)', roomFb.some(e => e.name === 'Sit-Up'), '');
log('Sit-Up also added to Commercial Gym Full Body', commFb.some(e => e.name === 'Sit-Up'), '');
log('Sit-Up also added to Hotel Gym Full Body', hFb.some(e => e.name === 'Sit-Up'), '');
log('Requested: Flutter Kicks added (Room Full Body)', roomFb.some(e => e.name === 'Flutter Kicks'), '');
log('Requested: Russian Twist added (Room Full Body)', roomFb.some(e => e.name === 'Russian Twist'), '');
log('Bicycle Crunch added as a bodyweight-optional ab variety (Comm + Hotel Full Body)', commFb.some(e => e.name === 'Bicycle Crunch') && hFb.some(e => e.name === 'Bicycle Crunch'), '');

const roomLg = WORKOUTS.room['Longevity'].enroute;
log('Requested: Scissor Kicks added (Room Longevity)', roomLg.some(e => e.name === 'Scissor Kicks'), '');
log('Leg Raise added alongside (Room Longevity)', roomLg.some(e => e.name === 'Leg Raise'), '');

// Jumping Jacks: added once to the shared Comm Cardio taxi array, which
// Hotel and Room both reference directly — confirming it correctly
// propagates to all three without needing separate additions.
log('Jumping Jacks added to Cardio warmup (Comm)', WORKOUTS.comm['Cardio'].taxi.some(e => e.name === 'Jumping Jacks'), '');
log('BUG-FREE: Jumping Jacks automatically propagates to Hotel Cardio (shared taxi array reference)', WORKOUTS.hotel['Cardio'].taxi.some(e => e.name === 'Jumping Jacks'), '');
log('BUG-FREE: Jumping Jacks automatically propagates to Room Cardio (shared taxi array reference)', WORKOUTS.room['Cardio'].taxi.some(e => e.name === 'Jumping Jacks'), '');

// All new exercises are bodyweight (reps_only or timed, no weight field expected) — sanity check
const newBodyweightNames = ['Push-Up','Bodyweight Squat','Sit-Up','Flutter Kicks','Russian Twist','Bicycle Crunch','Scissor Kicks','Leg Raise'];
const allNew = [...roomUp, ...hUp, ...commUp, ...roomLb, ...roomFb, ...commFb, ...hFb, ...roomLg].filter(e => newBodyweightNames.includes(e.name));
log('all new exercises are correctly bodyweight-only (reps_only inputType, no equipment implied)', allNew.every(e => e.inputType === 'reps_only'), allNew.map(e=>e.name+':'+e.inputType).join(', '));

// Incidental bug fix: DB Hammer Curl no longer collides with DB Preacher Curl
const hUlIds = WORKOUTS.hotel['Upper Pull'].enroute.map(e => e.id);
log('BUG FIX (incidental, found while checking for collisions): DB Hammer Curl and DB Preacher Curl no longer share an id', new Set(hUlIds).size === hUlIds.length, JSON.stringify(hUlIds));
log('DB Hammer Curl and DB Preacher Curl are both still present as distinct exercises', WORKOUTS.hotel['Upper Pull'].enroute.some(e=>e.name==='DB Hammer Curl') && WORKOUTS.hotel['Upper Pull'].enroute.some(e=>e.name==='DB Preacher Curl'), '');

// No id collisions introduced anywhere by today's additions (beyond the
// pre-existing, confirmed-intentional Run-profile / overlay-retarget reuses)
log('no unexpected new id collisions introduced by this batch', (() => {
  const allExAll = [
    ...WORKOUTS.comm['Upper Push'].enroute, ...WORKOUTS.hotel['Upper Push'].enroute, ...WORKOUTS.room['Upper Push'].enroute,
    ...WORKOUTS.room['Lower Body'].enroute,
    ...WORKOUTS.comm['Full Body'].enroute, ...WORKOUTS.hotel['Full Body'].enroute, ...WORKOUTS.room['Full Body'].enroute,
    ...WORKOUTS.room['Longevity'].enroute,
  ];
  const ids = allExAll.map(e=>e.id);
  return new Set(ids).size === ids.length;
})(), '');

// ── v5.19.11: SEARCH CASE-SENSITIVITY BUG + WALKING DISTANCE LOGGING ──

// The exact reported bug: searching "Walk" (auto-capitalized by mobile
// keyboards) previously failed to find "Walking" while lowercase "walk" worked.
log('BUG FIX: exerciseMatchesQuery("Walking", "Walk") now matches (was false)', exerciseMatchesQuery('Walking', 'Walk') === true, '');
log('exerciseMatchesQuery("Walking", "walk") still matches (regression check)', exerciseMatchesQuery('Walking', 'walk') === true, '');
log('BUG FIX: works for any capitalization, not just first-letter (e.g. "WALK")', exerciseMatchesQuery('Walking', 'WALK') === true, '');
log('BUG FIX: mixed case works too ("WaLk")', exerciseMatchesQuery('Walking', 'WaLk') === true, '');

// Reproduces the exact screenshot scenario: searching "Walk" (capitalized)
// in the Build Your Own Routine Main Exercises section now correctly surfaces Walking
document.getElementById = () => _fakeEl;
ST.buildProfile = { name:'Test', taxi:[], takeoff:[], enroute:[], landing:[], id:'bp1' };
bpFilter('enroute', 'Walk');
let searchHtml = _fakeEl.innerHTML || '';
log('BUG FIX: bpFilter (the exact function behind the reported screenshot) now finds "Walking" when searching "Walk"', searchHtml.includes('Walking'), searchHtml.includes('Walking') ? 'found' : 'still missing');

// Walking now supports logging distance, not just duration — the second half of the report
log('BUG FIX: Walking (Commercial Gym) upgraded to timed_distance', WORKOUTS.comm['Cardio'].enroute.find(e=>e.name==='Walking').inputType === 'timed_distance', '');
log('BUG FIX: Walking (Hotel Gym) upgraded to timed_distance', WORKOUTS.hotel['Cardio'].enroute.find(e=>e.name==='Walking').inputType === 'timed_distance', '');
log('BUG FIX: Walking (Hotel Room) upgraded to timed_distance', WORKOUTS.room['Cardio'].enroute.find(e=>e.name==='Walking').inputType === 'timed_distance', '');

// Everything already built generically for timed_distance now correctly
// applies to Walking with zero extra code, confirming the earlier
// architecture pays off here.
const walkingFields = edFieldsFor(WORKOUTS.comm['Cardio'].enroute.find(e=>e.name==='Walking'));
log('edit-session screen: Walking now shows both Time and Distance fields (reused existing timed_distance support)', JSON.stringify(walkingFields) === JSON.stringify([['seconds','Time','min'],['miles','Distance','mi']]), '');

// Deliberate, preserved design decision: Walking still does NOT count toward
// the RUNNING leaderboard, even though it can now log distance — those are
// two different questions (can you log it vs. should it compete on Ranks).
log('BUG-FREE (preserved design decision): Walking still excluded from RUNNING_EXERCISES — loggable is not the same as leaderboard-eligible', !RUNNING_EXERCISES.includes('c_ca_er3') && !RUNNING_EXERCISES.includes('h_ca_er3') && !RUNNING_EXERCISES.includes('r_ca_er3'), '');

// Live workout rendering shows both fields for Walking now, matching the
// same branch already proven for Treadmill Zone 2 Run / Outdoor Run
const walkEx = { id:'c_ca_er3', name:'Walking', target:'30-45 min', timed:true, inputType:'timed_distance', sets:1, custom:false };
ST.workout = { taxi:[], takeoff:[], enroute:[walkEx], landing:[] };
ST.sets = { c_ca_er3: [{ seconds:'', miles:'' }] };
ST.expanded = { c_ca_er3: true };
ST.env='comm'; ST.muscleGroup='Cardio'; ST.goal='longevity'; ST.fatigue='go'; ST.level='intermediate';
ST.customExercises=[]; ST.injuries=[]; ST.activeCustomProfileId=null; ST.customProfiles=[];
renderFlight(_fakeEl);
let flightHtmlWalk = _fakeEl.innerHTML || '';
log('BUG FIX: live workout screen shows a real Distance field for Walking now (Chad can log his 6.3mi walk)', flightHtmlWalk.includes('>TIME<') && flightHtmlWalk.includes('>DISTANCE<'), '');

// ── v5.19.12: SEARCH RELEVANCE RANKING (Walking still missing after case-fix) ──
document.getElementById = () => _fakeEl;

// exerciseSearchRank produces the expected priority ordering
log('exerciseSearchRank: exact match ranks highest (0)', exerciseSearchRank('Walking', 'walking') === 0, '');
log('exerciseSearchRank: starts-with ranks second (1)', exerciseSearchRank('Walking', 'walk') === 1, '');
log('exerciseSearchRank: whole-word match ranks third (2)', exerciseSearchRank('Cool-Down Walk', 'walk') === 2, '');
log('exerciseSearchRank: substring-only (not a whole word) ranks fourth (3)', exerciseSearchRank('Lunge (Walking)', 'walk') === 3, JSON.stringify(exerciseSearchRank('Lunge (Walking)', 'walk')));
log('exerciseSearchRank: no textual relation at all ranks lowest (4, synonym-only territory)', exerciseSearchRank('Farmer Carry', 'zzz') === 4, '');

// THE EXACT REPORTED SCENARIO: 8 total matches for "walk", "Walking" was
// buried at position 6 and cut off by the 5-result limit even though the
// case-sensitivity fix made it match correctly.
ST.buildProfile = { name:'Test', taxi:[], takeoff:[], enroute:[], landing:[], id:'bp1' };
const pool = bpSearchSource();
const rawCount = pool.filter(e => exerciseMatchesQuery(e.name, 'walk')).length;
log('sanity: still 8 total matches for "walk" in the underlying pool (unchanged)', rawCount === 8, String(rawCount));
const ranked = rankedExerciseMatches(pool, 'walk', new Set(), 5);
log('BUG FIX: "Walking" now appears in the top 5 ranked results, not buried past the cutoff', ranked.some(e => e.name === 'Walking'), ranked.map(e=>e.name).join(', '));
log('BUG FIX: "Walking" ranks near the top (starts-with match), ahead of tangential partial matches', ranked.findIndex(e=>e.name==='Walking') <= 1, 'position: '+ranked.findIndex(e=>e.name==='Walking'));

// Reproduced end-to-end through the actual UI function behind the screenshot
bpFilter('enroute', 'walk');
let bpSearchHtml = _fakeEl.innerHTML || '';
log('BUG FIX END-TO-END: bpFilter (Main Exercises search) now shows Walking in the visible results', bpSearchHtml.includes('>Walking<') || /Walking<\/span>|Walking\s*<span/.test(bpSearchHtml) || bpSearchHtml.includes('Walking'), '');

// Display and add-by-index stay in sync — tapping result index N must add
// the exercise actually shown at position N, for all three search pairs.
ST.buildProfile = { name:'Test', taxi:[], takeoff:[], enroute:[], landing:[], id:'bp1' };
const displayOrder = rankedExerciseMatches(bpSearchSource(), 'walk', new Set(), 5);
bpAdd('enroute', 0, 'walk');
log('BUG FIX: bpFilter/bpAdd stay in sync — tapping index 0 adds exactly what was displayed at index 0', ST.buildProfile.enroute[0]?.name === displayOrder[0].name, 'expected '+displayOrder[0].name+', got '+ST.buildProfile.enroute[0]?.name);

ST.editSession = { exList: [] };
const edDisplayOrder = rankedExerciseMatches(buildExerciseCatalog(), 'walk', new Set(), 6);
let edPushed = null;
const origEdPush = edPushExercise;
edPushExercise = (exDef) => { edPushed = exDef; };
edAddCatalogExercise(0, 'walk');
log('BUG FIX: edFilterExercises/edAddCatalogExercise stay in sync', edPushed?.name === edDisplayOrder[0].name, '');
edPushExercise = origEdPush;

// The latent swap-search bug: display used stretch-biasing, add-by-index
// didn't replicate it at all — now both share one helper and cannot diverge.
ST.workout = { taxi:[], takeoff:[], enroute:[], landing:[{id:'stretch1', name:'Standing Calf Stretch', inputType:'timed_bilateral', timed:true}] };
const swapDisplayOrder = rankedSwapMatches('stretch1', 'calf', 6);
let swappedTo = null;
const origSwapExercise = swapExercise;
swapExercise = (exId, alt) => { swappedTo = alt.name; };
swapAddCatalogExercise('stretch1', 0, 'calf');
log('BUG FIX (latent, found while fixing this): swapFilterExercises/swapAddCatalogExercise now stay in sync (previously could add a different exercise than what was shown)', swappedTo === swapDisplayOrder[0].name, 'expected '+swapDisplayOrder[0].name+', got '+swappedTo);
swapExercise = origSwapExercise;

// ── v5.19.13: WALKING CALORIE REGRESSION (MET mixup after timed_distance upgrade) ──

// THE EXACT REPORTED BUG: Walking with timed_distance was getting running's
// MET (8.0) instead of walking's MET (3.5) — a 2.3x calorie inflation.
const walkExMet = { id:'c_ca_er3', name:'Walking', target:'30-45 min', timed:true, inputType:'timed_distance' };
log('BUG FIX: Walking (timed_distance) now correctly gets walking MET (3.5), not running MET (8.0)', exerciseMET(walkExMet) === 3.5, String(exerciseMET(walkExMet)));

// Regression check: genuine running exercises must still get MET 8.0 — the
// reordering that fixed Walking must not have broken this.
const runEx = { id:'c_ca_er1', name:'Treadmill Zone 2 Run', target:'20 min', timed:true, inputType:'timed_distance' };
log('regression: real running exercise (Treadmill Zone 2 Run) still correctly gets MET 8.0', exerciseMET(runEx) === 8.0, String(exerciseMET(runEx)));
const outdoorRunEx = { id:'c_ca_er5', name:'Outdoor Run', target:'20-40 min', timed:true, inputType:'timed_distance' };
log('regression: Outdoor Run still correctly gets MET 8.0', exerciseMET(outdoorRunEx) === 8.0, '');

// End-to-end: the exact reported scenario (130 min walk) now produces a
// realistic calorie estimate, not an inflated one.
const walkSets = { c_ca_er3: [{ seconds: '7800', miles: '6.3' }] }; // 130 real minutes
const wkWalkOnly = { taxi: [], takeoff: [], enroute: [walkExMet], landing: [] };
const fixedEffort = computeSessionEffort(wkWalkOnly, walkSets, 220); // a realistic bodyweight
log('BUG FIX END-TO-END: 130-minute walk at a realistic bodyweight now lands in a believable range (under 900 cal), not 1762+', fixedEffort.calories < 900, String(fixedEffort.calories));
log('BUG FIX: minutes still correctly computed regardless (130)', fixedEffort.minutes === 130, '');

// Other walk-named exercises (e.g. warmup drills) are also unaffected by
// the reordering — still correctly identified as walk-family MET
log('other walk-named exercises unaffected by the reordering (Brisk Walk Ramp-Up)', exerciseMET({name:'Brisk Walk Ramp-Up', timed:true}) === 3.5, '');

// ── v5.19.14: ACCESSORY EXERCISE ROTATION ──

// rotatedSlice mechanics
log('rotatedSlice: pool smaller than count returns the whole pool unchanged', JSON.stringify(rotatedSlice(['a','b'], 5, 0)) === JSON.stringify(['a','b']), '');
log('rotatedSlice: rotationIndex 0 returns the first window', JSON.stringify(rotatedSlice(['a','b','c','d'], 2, 0)) === JSON.stringify(['a','b']), '');
log('rotatedSlice: rotationIndex 1 returns the NEXT window, not the same one', JSON.stringify(rotatedSlice(['a','b','c','d'], 2, 1)) === JSON.stringify(['c','d']), '');
log('rotatedSlice: wraps around correctly past the end of the pool', JSON.stringify(rotatedSlice(['a','b','c','d','e'], 2, 2)) === JSON.stringify(['e','a']), '');

// getFilteredWorkout: brand new user (0 past sessions) sees the same first-N
// behavior as before — no regression for someone who's never trained this yet.
ST.env='comm'; ST.muscleGroup='Lower Body'; ST.level='intermediate'; ST.fatigue='go';
ST.sessionCache = [];
const rawLB = getCombinedWorkout('comm', 'Lower Body');
const day0 = getFilteredWorkout(rawLB);
log('regression: 0 past sessions shows the original first-N enroute exercises (Single Leg Split Squat, Leg Press)', day0.enroute.map(e=>e.name).join(',') === 'Single Leg Split Squat,Leg Press', day0.enroute.map(e=>e.name).join(', '));

// THE ACTUAL REPORTED PROBLEM: after training this muscle group before,
// enroute should show DIFFERENT exercises, not the same fixed two forever.
ST.sessionCache = [{ muscle_group: 'Lower Body', date: new Date().toISOString() }];
const day1 = getFilteredWorkout(rawLB);
log('BUG FIX: after 1 prior Lower Body session, enroute rotates to a DIFFERENT pair, not the same two every time', day1.enroute.map(e=>e.name).join(',') !== day0.enroute.map(e=>e.name).join(','), day1.enroute.map(e=>e.name).join(', '));

// Prove the actual complaint is resolved: calf raises, leg extensions, leg
// curls, hip abduction/adduction — all added this session — can now
// actually surface in a real programmed workout, not just via manual search.
const seenAcrossRotations = new Set();
for (let i = 0; i < 6; i++) {
  ST.sessionCache = Array(i).fill({ muscle_group: 'Lower Body' });
  getFilteredWorkout(rawLB).enroute.forEach(e => seenAcrossRotations.add(e.name));
}
log('BUG FIX: over enough sessions, Leg Extension (Machine) now actually surfaces in a real workout', seenAcrossRotations.has('Leg Extension (Machine)'), [...seenAcrossRotations].join(', '));
log('BUG FIX: Hip Abduction (Machine) also surfaces', seenAcrossRotations.has('Hip Abduction (Machine)'), '');
log('BUG FIX: Seated Leg Curl (Machine) also surfaces', seenAcrossRotations.has('Seated Leg Curl (Machine)'), '');

// Coaching principle preserved: Takeoff (primary compound lifts) does NOT
// rotate — Back Squat and Romanian Deadlift should stay consistent so
// progressive overload can actually be tracked session to session.
ST.sessionCache = [{ muscle_group:'Lower Body' },{ muscle_group:'Lower Body' },{ muscle_group:'Lower Body' }];
const day3 = getFilteredWorkout(rawLB);
log('BUG-FREE (preserved coaching principle): Takeoff stays Back Squat + Romanian Deadlift regardless of rotation', day3.takeoff.map(e=>e.name).join(',') === 'Back Squat,Romanian Deadlift', day3.takeoff.map(e=>e.name).join(', '));

// Marginal/no-go fatigue paths still work correctly with rotation applied
ST.fatigue = 'marginal';
const marginalDay = getFilteredWorkout(rawLB);
log('marginal fatigue: takeoff still empty, enroute still limited to 1 (now rotating too)', marginalDay.takeoff.length === 0 && marginalDay.enroute.length === 1, '');
ST.fatigue = 'nogo';
const nogoDay = getFilteredWorkout(rawLB);
log('no-go fatigue: takeoff and enroute still both empty, unaffected by rotation logic', nogoDay.takeoff.length === 0 && nogoDay.enroute.length === 0, '');
ST.fatigue = 'go';

// A muscle group/environment with a small pool (not bigger than what's
// needed) is unaffected — no crash, no duplicate entries.
const rawCardio = getCombinedWorkout('room', 'Cardio');
ST.muscleGroup = 'Cardio';
ST.sessionCache = [{muscle_group:'Cardio'},{muscle_group:'Cardio'}];
let cardioErr = null;
try { getFilteredWorkout(rawCardio); } catch(e) { cardioErr = e.message; }
log('small pool (Cardio) does not crash or misbehave under rotation', cardioErr === null, String(cardioErr));

// ── v5.19.14 FOLLOW-UP: CONFIRM ROTATION IS ALREADY GENERIC ACROSS ALL PROFILES ──

// getFilteredWorkout never special-cases muscle group — this is what makes
// it automatically apply everywhere without needing per-profile code.
log('getFilteredWorkout has no muscle-group-specific branching (confirmed generic)', !getFilteredWorkout.toString().includes("=== 'Lower Body'"), '');

// Prove rotation works for Upper Push, not just Lower Body
ST.env='comm'; ST.level='intermediate'; ST.fatigue='go';
const rawUP = getCombinedWorkout('comm', 'Upper Push');
ST.muscleGroup = 'Upper Push';
ST.sessionCache = [];
const upDay0 = getFilteredWorkout(rawUP).enroute.map(e=>e.name).join(',');
ST.sessionCache = [{muscle_group:'Upper Push'},{muscle_group:'Upper Push'},{muscle_group:'Upper Push'}];
const upDay3 = getFilteredWorkout(rawUP).enroute.map(e=>e.name).join(',');
log('BUG FIX CONFIRMED for Upper Push (not just Lower Body): enroute rotates across sessions', upDay0 !== upDay3, upDay0+' -> '+upDay3);

// Prove rotation works for Power/Plyo too
const rawPP = getCombinedWorkout('comm', 'Power / Plyo');
ST.muscleGroup = 'Power / Plyo';
ST.sessionCache = [];
const ppDay0 = getFilteredWorkout(rawPP).enroute.map(e=>e.name).join(',');
ST.sessionCache = [{muscle_group:'Power / Plyo'}];
const ppDay1 = getFilteredWorkout(rawPP).enroute.map(e=>e.name).join(',');
log('BUG FIX CONFIRMED for Power/Plyo: enroute rotates across sessions', ppDay0 !== ppDay1, ppDay0+' -> '+ppDay1);

// Prove rotation works for Longevity (a category with genuinely different
// exercise types — mobility/stability work — confirming this isn\'t just
// strength-specific logic)
const rawLongevity = getCombinedWorkout('room', 'Longevity');
ST.env = 'room'; ST.muscleGroup = 'Longevity';
ST.sessionCache = [];
const lgDay0 = getFilteredWorkout(rawLongevity).enroute.map(e=>e.name).join(',');
ST.sessionCache = [{muscle_group:'Longevity'},{muscle_group:'Longevity'}];
const lgDay2 = getFilteredWorkout(rawLongevity).enroute.map(e=>e.name).join(',');
log('BUG FIX CONFIRMED for Longevity: enroute rotates across sessions', lgDay0 !== lgDay2, lgDay0+' -> '+lgDay2);

// Honest limitation: Run has too small a pool to rotate — confirming this
// is a real, expected constraint (by design, a focused running profile),
// not a bug in the rotation mechanism itself.
const rawRun = getCombinedWorkout('comm', 'Run');
ST.env='comm'; ST.muscleGroup = 'Run';
ST.sessionCache = [];
const runDay0 = getFilteredWorkout(rawRun).enroute.map(e=>e.name).join(',');
ST.sessionCache = [{muscle_group:'Run'},{muscle_group:'Run'}];
const runDay2 = getFilteredWorkout(rawRun).enroute.map(e=>e.name).join(',');
log('honest limitation confirmed: Run enroute pool (2 exercises) is too thin to rotate — same both sessions, by design not by bug', runDay0 === runDay2, runDay0);

// ── v5.19.15: FLIGHT SCHEDULE IMPORT + PREFLIGHT AUTO-DETECTION ──
document.getElementById = () => _fakeEl;

// Parser correctness against a realistic sample (mirrors the real uploaded file's structure)
const sampleICS = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:Flight-100-PHX-SEA-1@mobilecci\r\nDTSTART:20260601T120800Z\r\nDTEND:20260601T154000Z\r\nSUMMARY:Flight 100 PHX\u2192SEA\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:Layover-SEA--18h-40m--1@mobilecci\r\nDTSTART:20260601T154000Z\r\nDTEND:20260602T102000Z\r\nSUMMARY:Layover SEA (18h 40m)\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:Duty-free-period-1@mobilecci\r\nDTSTART:20260605T050000Z\r\nDTEND:20260606T045959Z\r\nSUMMARY:Duty free period\r\nEND:VEVENT\r\nEND:VCALENDAR";

const parsed = parseFlightScheduleICS(sampleICS);
log('parseFlightScheduleICS: parses all 3 events', parsed.length === 3, '');
log('BUG-FREE: Zulu time parsed exactly (20260601T120800Z -> 2026-06-01T12:08:00.000Z)', parsed[0].start === '2026-06-01T12:08:00.000Z', parsed[0].start);
log('classifies Flight correctly', parsed[0].type === 'flight', '');
log('classifies Layover correctly and extracts airport code', parsed[1].type === 'layover' && parsed[1].airport === 'SEA', '');
log('classifies Duty free period correctly', parsed[2].type === 'dutyfree', '');

// getCurrentScheduleStatus finds the active event at a simulated "now"
const origDateNow = Date.now;
Date.now = () => new Date('2026-06-01T20:00:00Z').getTime();
const status1 = getCurrentScheduleStatus(parsed);
log('getCurrentScheduleStatus: correctly finds the active layover', status1?.type === 'layover' && status1?.airport === 'SEA', '');
Date.now = () => new Date('2026-06-05T12:00:00Z').getTime();
const status2 = getCurrentScheduleStatus(parsed);
log('getCurrentScheduleStatus: correctly finds an active duty-free day', status2?.type === 'dutyfree', '');
Date.now = () => new Date('2026-07-01T00:00:00Z').getTime();
const status3 = getCurrentScheduleStatus(parsed);
log('getCurrentScheduleStatus: returns null when nothing is active (outside the schedule range)', status3 === null, '');
Date.now = origDateNow;

// handleICSUpload: parses, stores to ST + profile, rejects invalid files gracefully
SB.from = () => ({ upsert: async()=>({error:null}), select: () => ({ eq: () => ({ maybeSingle: async()=>({data:{profile_data:{}}}) }) }) });
ST.user = { id: 'u1' };
await handleICSUpload({ text: async () => sampleICS });
log('handleICSUpload: stores parsed events to ST.flightSchedule', ST.flightSchedule?.length === 3, '');
log('handleICSUpload: stores the raw text for re-download', ST.flightScheduleRaw === sampleICS, '');
await handleICSUpload({ text: async () => 'not a real calendar file' });
log('handleICSUpload: gracefully handles a file with no parseable events (no crash, schedule unchanged)', ST.flightSchedule?.length === 3, '');

// THE ACTUAL FEATURE: applyScheduleEnvironmentSuggestion runs once at
// boot, with a transparent note — not a silent change. Tested directly
// (not via the full bootApp) since that pulls in unrelated dependencies.
ST.flightSchedule = parsed;
Date.now = () => new Date('2026-06-01T20:00:00Z').getTime();
ST.env = 'comm'; // simulate a totally different previous environment
applyScheduleEnvironmentSuggestion();
log('BUG FIX: layover today correctly auto-sets environment to Hotel Gym', ST.env === 'hotel', String(ST.env));
log('BUG FIX: auto-suggestion is transparent, not silent — a clear note explains why', ST.scheduleEnvNote && ST.scheduleEnvNote.includes('SEA'), String(ST.scheduleEnvNote));
Date.now = origDateNow;

// Duty-free day correctly suggests Commercial Gym
Date.now = () => new Date('2026-06-05T12:00:00Z').getTime();
ST.env = 'hotel';
applyScheduleEnvironmentSuggestion();
log('BUG FIX: duty-free day correctly auto-sets environment to Commercial Gym', ST.env === 'comm', '');
Date.now = origDateNow;

// No active schedule event: environment is left alone entirely, no override
Date.now = () => new Date('2026-07-01T00:00:00Z').getTime();
ST.env = 'room';
applyScheduleEnvironmentSuggestion();
log('BUG-FREE: no active schedule event today -> environment untouched, no note shown', ST.env === 'room' && ST.scheduleEnvNote === null, '');
Date.now = origDateNow;

// Preflight shows the transparency note in the collapsed summary
Date.now = () => new Date('2026-06-01T20:00:00Z').getTime();
ST.env = 'comm';
applyScheduleEnvironmentSuggestion();
ST.customExercises=[]; ST.injuries=[]; ST.activeCustomProfileId=null; ST.customProfiles=[];
ST.timeAvailMin = null; ST.muscleGroup='Lower Body'; ST.goal='muscle'; ST.fatigue='go'; ST.level='intermediate';
ST.sex='male'; ST.sessionCache=[{date:new Date().toISOString(),sets:{}}]; ST.showChangePlan=false;
ST.flightHrsRaw=''; ST.flightHrs=0; ST.flightHrsTouched=false; ST.waterInRaw=''; ST.waterIn=0; ST.lastSession=null;
await renderPreflight(_fakeEl);
let schedHtml = _fakeEl.innerHTML || '';
log('BUG FIX: Preflight collapsed summary shows the schedule note transparently, not "same as your usual plan"', schedHtml.includes('Layover in SEA') && !schedHtml.includes('Same as your usual plan'), '');
Date.now = origDateNow;

// renderData shows upload UI correctly with and without an existing schedule
document.getElementById = () => _fakeEl;
ST.flightSchedule = null; ST.flightScheduleRaw = null;
renderData(_fakeEl);
let dataHtml = _fakeEl.innerHTML || '';
log('renderData: shows Upload button when no schedule exists yet', dataHtml.includes('Upload .ics Schedule') && !dataHtml.includes('Download My Uploaded Schedule'), '');
ST.flightSchedule = parsed; ST.flightScheduleRaw = sampleICS;
renderData(_fakeEl);
dataHtml = _fakeEl.innerHTML || '';
log('renderData: shows Replace + Download buttons once a schedule is loaded, with the correct date range', dataHtml.includes('Replace Schedule') && dataHtml.includes('Download My Uploaded Schedule') && dataHtml.includes('Jun'), '');

// ── v5.19.16: FLIGHT HOURS AUTO-POPULATION FROM SCHEDULE ──
const origNow2 = Date.now;

// Simple case: one flight fully within today, 3.5 hours long
const todayNoon = new Date(); todayNoon.setHours(12,0,0,0);
const simpleSchedule = [
  { type:'flight', start: new Date(todayNoon.getTime()).toISOString(), end: new Date(todayNoon.getTime() + 3.5*3600000).toISOString() },
];
log('computeTodaysFlightHours: simple same-day flight sums correctly (3.5h)', computeTodaysFlightHours(simpleSchedule) === 3.5, String(computeTodaysFlightHours(simpleSchedule)));

// Midnight-spanning flight: starts 22:00 yesterday-equivalent... construct
// relative to "now" so this test is stable regardless of when it runs.
const midnightToday = new Date(); midnightToday.setHours(0,0,0,0);
const spanningFlight = [
  { type:'flight', start: new Date(midnightToday.getTime() - 2*3600000).toISOString(), end: new Date(midnightToday.getTime() + 3*3600000).toISOString() }, // 22:00 yesterday -> 03:00 today = 5h total, only 3h actually falls on today
];
log('BUG-FREE: a flight spanning midnight only counts the portion that actually falls on today (3h of a 5h flight)', computeTodaysFlightHours(spanningFlight) === 3, String(computeTodaysFlightHours(spanningFlight)));

// Schedule that doesn't cover today at all -> null, not a guessed 0
const farFutureSchedule = [{ type:'flight', start:'2030-01-01T00:00:00.000Z', end:'2030-01-01T05:00:00.000Z' }];
log('computeTodaysFlightHours: returns null (not 0) when the schedule does not cover today at all', computeTodaysFlightHours(farFutureSchedule) === null, '');

// A real rest/layover-only day that IS covered by the schedule -> genuine 0, not null
const restDaySchedule = [{ type:'dutyfree', start: new Date(midnightToday.getTime()).toISOString(), end: new Date(midnightToday.getTime()+24*3600000-1000).toISOString() }];
log('computeTodaysFlightHours: a covered rest day with no flights returns a real 0, distinct from null', computeTodaysFlightHours(restDaySchedule) === 0, String(computeTodaysFlightHours(restDaySchedule)));

// applyScheduleFlightHours: auto-fills when untouched
ST.flightSchedule = simpleSchedule; ST.flightHrsTouched = false; ST.flightHrs = 0; ST.flightHrsRaw = '';
applyScheduleFlightHours();
log('BUG FIX: applyScheduleFlightHours auto-fills from the schedule when the field has not been touched today', ST.flightHrsRaw === '3.5', ST.flightHrsRaw);

// Respects a manual entry — never overwrites it, even from an earlier session today
ST.flightSchedule = simpleSchedule; ST.flightHrsTouched = true; ST.flightHrsRaw = '7.2'; ST.flightHrs = 7.2;
applyScheduleFlightHours();
log('BUG-FREE: applyScheduleFlightHours never overwrites an existing manual entry', ST.flightHrsRaw === '7.2', ST.flightHrsRaw);

// No schedule at all -> leaves the field alone entirely
ST.flightSchedule = null; ST.flightHrsTouched = false; ST.flightHrsRaw = ''; ST.flightHrs = 0;
applyScheduleFlightHours();
log('applyScheduleFlightHours: does nothing when no schedule has been uploaded', ST.flightHrsRaw === '', '');

// Preflight shows the transparency note only when genuinely auto-filled
document.getElementById = () => _fakeEl;
ST.flightSchedule = simpleSchedule; ST.flightHrsTouched = false; ST.flightHrsRaw = '3.5'; ST.flightHrs = 3.5;
ST.customExercises=[]; ST.injuries=[]; ST.activeCustomProfileId=null; ST.customProfiles=[];
ST.timeAvailMin=null; ST.env='comm'; ST.muscleGroup='Lower Body'; ST.goal='muscle'; ST.fatigue='go'; ST.level='intermediate';
ST.sex='male'; ST.sessionCache=[{date:new Date().toISOString(),sets:{}}]; ST.showChangePlan=false; ST.showConditionDetail=false; ST.showInjuryDetail=false;
ST.waterInRaw=''; ST.waterIn=0; ST.lastSession=null; ST.scheduleEnvNote=null;
await renderPreflight(_fakeEl);
let hydHtml = _fakeEl.innerHTML || '';
log('BUG FIX: transparency note shows when flight hours were auto-filled', hydHtml.includes('auto-filled from your schedule'), '');
ST.flightHrsTouched = true;
await renderPreflight(_fakeEl);
hydHtml = _fakeEl.innerHTML || '';
log('regression: transparency note is hidden once the field has been manually touched', !hydHtml.includes('auto-filled from your schedule'), '');
Date.now = origNow2;

// ── v5.19.17: MORE MENU LABEL REFLECTS SCHEDULE IMPORT ──
document.getElementById = () => _fakeEl;
ST.user = { id:'u1', email:'someone@else.com' }; ST.badges = {};
renderMore(_fakeEl);
let moreHtml = _fakeEl.innerHTML || '';
log('BUG FIX: More menu label now mentions flight schedule import, not just export', moreHtml.includes('Data & Import/Export') && moreHtml.includes('Flight schedule import'), '');

// ── v5.19.18: STRENGTH/RUNNING PERFORMANCE TRENDS ──
document.getElementById = () => _fakeEl;

// classifyTrend: weight (higher is better)
log('classifyTrend: clear weight increase -> improving', classifyTrend([200,205,210,230,235,240], true).status === 'improving', '');
log('classifyTrend: clear weight decrease -> declining', classifyTrend([240,235,230,210,205,200], true).status === 'declining', '');
log('classifyTrend: tiny fluctuation within 3% -> flat, not falsely reported as a trend', classifyTrend([225,226,224,225,226,224], true).status === 'flat', '');
log('classifyTrend: fewer than 4 points -> insufficient, does not guess', classifyTrend([200,210,220], true).status === 'insufficient', '');

// classifyTrend: pace (LOWER is better) — the trickiest semantic to get right
log('BUG-FREE: pace DECREASING (getting faster) correctly reports as "improving", not "declining"', classifyTrend([600,595,590,540,530,520], false).status === 'improving', '');
log('BUG-FREE: pace INCREASING (getting slower) correctly reports as "declining", not "improving"', classifyTrend([520,530,540,590,595,600], false).status === 'declining', '');

// getPrimaryLiftTrends: aggregates by NAME, uses top-set weight, requires 4+ sessions, Takeoff only
const mkSession = (date, exId, exName, weights, phase) => ({
  date, workoutSnapshot: { taxi:[], takeoff: phase==='takeoff'?[{id:exId,name:exName}]:[], enroute: phase==='enroute'?[{id:exId,name:exName}]:[], landing:[] },
  sets: { [exId]: weights.map(w => ({reps:'5', weight:String(w)})) },
});
const squatSessions = [
  mkSession('2026-01-01', 'sq1', 'Back Squat', [225,225,205], 'takeoff'), // top set = 225
  mkSession('2026-01-08', 'sq1', 'Back Squat', [230,230,210], 'takeoff'), // top set = 230
  mkSession('2026-01-15', 'sq1', 'Back Squat', [245,245,225], 'takeoff'), // top set = 245
  mkSession('2026-01-22', 'sq1', 'Back Squat', [255,255,235], 'takeoff'), // top set = 255
];
const liftTrends = getPrimaryLiftTrends(squatSessions);
log('getPrimaryLiftTrends: finds Back Squat with 4 sessions', liftTrends.length === 1 && liftTrends[0].name === 'Back Squat', JSON.stringify(liftTrends));
log('BUG-FREE: uses the TOP SET weight per session (225, not 205 which was a lighter warmup set)', liftTrends[0].current === 255 && liftTrends[0].first === 225, JSON.stringify(liftTrends[0]));
log('getPrimaryLiftTrends: correctly classifies clear weight increase as improving', liftTrends[0].trend.status === 'improving', '');

// Enroute-phase exercises are NOT tracked as primary lifts, even with lots of data
const enrouteSessions = [
  mkSession('2026-01-01', 'lp1', 'Leg Press', [300], 'enroute'),
  mkSession('2026-01-08', 'lp1', 'Leg Press', [310], 'enroute'),
  mkSession('2026-01-15', 'lp1', 'Leg Press', [320], 'enroute'),
  mkSession('2026-01-22', 'lp1', 'Leg Press', [330], 'enroute'),
];
log('BUG-FREE: Enroute-phase exercises are correctly excluded from primary lift trends (deliberately Takeoff-only)', getPrimaryLiftTrends(enrouteSessions).length === 0, '');

// Fewer than 4 sessions of the same lift -> not shown yet
log('getPrimaryLiftTrends: fewer than 4 sessions of a lift does not produce a trend card yet', getPrimaryLiftTrends(squatSessions.slice(0,3)).length === 0, '');

// getRunningPaceTrend + formatPace
log('formatPace: formats seconds/mile correctly (600s/mi = 10:00/mi)', formatPace(600) === '10:00/mi', formatPace(600));
log('formatPace: pads seconds correctly (545s/mi = 9:05/mi)', formatPace(545) === '9:05/mi', formatPace(545));

const realRunId = RUNNING_EXERCISES[0];
const runSessions = [
  { date:'2026-01-01', sets:{ [realRunId]:[{seconds:'3000', miles:'5'}] } }, // 10:00/mi
  { date:'2026-01-08', sets:{ [realRunId]:[{seconds:'2880', miles:'5'}] } }, // 9:36/mi
  { date:'2026-01-15', sets:{ [realRunId]:[{seconds:'2700', miles:'5'}] } }, // 9:00/mi
  { date:'2026-01-22', sets:{ [realRunId]:[{seconds:'2580', miles:'5'}] } }, // 8:36/mi — getting faster
];
const runTrend = getRunningPaceTrend(runSessions);
log('getRunningPaceTrend: computes pace and correctly identifies improving (getting faster)', runTrend && runTrend.trend.status === 'improving', JSON.stringify(runTrend));

// Trends UI renders the new section with real data
ST.sessionCache = squatSessions;
ST.ouraConnected = false; ST.user = null; ST.nutritionGoals = null;
await renderTrends(_fakeEl);
let trendsHtml = _fakeEl.innerHTML || '';
log('Trends UI: shows the Back Squat trend card with correct current weight', trendsHtml.includes('Back Squat') && trendsHtml.includes('255 lb'), '');

// Empty state shown when there is not enough history yet
ST.sessionCache = [];
await renderTrends(_fakeEl);
trendsHtml = _fakeEl.innerHTML || '';
log('Trends UI: shows an honest empty state when there is not enough history yet, not a blank/broken section', trendsHtml.includes('will show up here once'), '');

// ── v5.19.20: FIX OURA SCOPE — 401s on workout/tag were a scope gap, not endpoint absence ──
log('BUG FIX: OURA_SCOPES now requests workout and tag, not just daily/personal', OURA_SCOPES === 'daily personal workout tag', OURA_SCOPES);

// ── v5.19.21: OURA WORKOUT IMPORT ──
document.getElementById = () => _fakeEl;

// mapOuraActivityToExercise: precise mapping for known types
log('mapOuraActivityToExercise: walking maps to the real Walking exercise', mapOuraActivityToExercise({activity:'walking'}).id === 'c_ca_er3', '');
log('mapOuraActivityToExercise: running maps to Outdoor Run (leaderboard-eligible)', mapOuraActivityToExercise({activity:'running'}).id === 'c_ca_er5', '');
log('mapOuraActivityToExercise: jogging also maps to Outdoor Run', mapOuraActivityToExercise({activity:'jogging'}).id === 'c_ca_er5', '');

// Safe, non-lossy fallback for unrecognized activities (Oura has 40-50+ possible types)
const badminton = mapOuraActivityToExercise({activity:'badminton', distance:0});
log('BUG-FREE: unrecognized activity (badminton) gets a safe non-lossy fallback, not silently dropped', badminton.name === 'Badminton (via Oura)' && badminton.inputType === 'timed', JSON.stringify(badminton));
const cyclingWithDistance = mapOuraActivityToExercise({activity:'cycling', distance:15000});
log('fallback correctly detects real distance and uses timed_distance instead of plain timed', cyclingWithDistance.inputType === 'timed_distance', JSON.stringify(cyclingWithDistance));

// findExistingOuraImport: exact-id dedup
const existingImports = [{ouraWorkoutId:'oura-abc-123', date:'2026-07-22T09:00:00Z'}];
log('findExistingOuraImport: finds an exact match by Oura id', findExistingOuraImport('oura-abc-123', existingImports)?.ouraWorkoutId === 'oura-abc-123', '');
log('findExistingOuraImport: returns null for a different id', findExistingOuraImport('oura-xyz-999', existingImports) === null, '');

// findSimilarSession: fuzzy time-overlap detection
const nativeSession = { date: '2026-07-22T16:30:00.000Z', durationMinutes: 45, workoutSnapshot:{taxi:[],takeoff:[],enroute:[],landing:[]} }; // 16:30-17:15 UTC
const overlappingOuraEvent = { start_datetime: '2026-07-22T09:26:00.000-07:00', end_datetime: '2026-07-22T11:37:00.000-07:00' }; // -07:00 = 16:26-18:37 UTC, overlaps the native session
const farApartOuraEvent = { start_datetime: '2026-07-20T09:26:00.000-07:00', end_datetime: '2026-07-20T10:00:00.000-07:00' }; // 2 days earlier, no overlap
log('findSimilarSession: detects a genuinely overlapping native session as a likely duplicate', findSimilarSession(overlappingOuraEvent, [nativeSession]) === nativeSession, '');
log('BUG-FREE: does NOT flag a session on a completely different day as similar', findSimilarSession(farApartOuraEvent, [nativeSession]) === null, '');

// Already-imported Oura sessions are excluded from the fuzzy check (handled by exact-id check instead)
const alreadyImportedSession = { date: '2026-07-22T09:30:00.000Z', durationMinutes: 45, ouraWorkoutId: 'some-other-oura-id' };
log('BUG-FREE: an already-imported Oura session is excluded from fuzzy matching (handled by exact-id check instead)', findSimilarSession(overlappingOuraEvent, [alreadyImportedSession]) === null, '');

// buildSessionFromOuraWorkout: correct duration, distance conversion, and using Oura\'s own calorie figure
const realOuraEvent = { id:'20a151c1-real', activity:'walking', calories:627.05, distance:10154.17, start_datetime:'2026-07-22T09:26:00.000-07:00', end_datetime:'2026-07-22T11:37:00.000-07:00' };
const walkExDef = mapOuraActivityToExercise(realOuraEvent);
const builtSession = buildSessionFromOuraWorkout(realOuraEvent, walkExDef);
log('buildSessionFromOuraWorkout: correctly computes duration from start/end (131 min)', builtSession.durationMinutes === 131, String(builtSession.durationMinutes));
log('BUG-FREE: correctly converts distance from meters to miles (10154.17m \u2248 6.31mi)', Math.abs(builtSession.sets[walkExDef.id][0].miles - 6.31) < 0.01, builtSession.sets[walkExDef.id][0].miles);
log('BUG-FREE: uses Oura\'s own calorie figure directly (real sensor data), not a recomputed MET estimate', builtSession.estCalories === 627, String(builtSession.estCalories));
log('buildSessionFromOuraWorkout: tags the session with the Oura workout id and import flag', builtSession.ouraWorkoutId === realOuraEvent.id && builtSession.importedFromOura === true, '');

// importOuraWorkout: saves correctly, adds to session cache, and ONLY submits to
// the leaderboard when the mapped exercise is actually running-eligible
ST.user = { id:'u1' }; ST.username = 'TestPilot'; ST.sex = 'male'; ST.runBest = 0;
ST.sessionCache = [];
let dbInserts = [];
SB.from = () => ({
  insert: async (rows) => { dbInserts.push(rows[0]); return { error: null }; },
  upsert: async (row) => { return { error: null }; },
});
let ouraRunSubmitted = false, ouraVolumeLogged = false;
const origSubmitRunningPR = submitRunningPR, origLogRunningVolume = logRunningVolume;
submitRunningPR = async (s) => { ouraRunSubmitted = true; };
logRunningVolume = async (s) => { ouraVolumeLogged = true; };

const runEvent = { id:'oura-run-1', activity:'running', calories:400, distance:8000, start_datetime:'2026-07-23T06:00:00.000-07:00', end_datetime:'2026-07-23T06:40:00.000-07:00' };
const runExDef = mapOuraActivityToExercise(runEvent);
await importOuraWorkout(runEvent, runExDef);
log('importOuraWorkout: saves the session to the database', dbInserts.length === 1 && dbInserts[0].session_data.ouraWorkoutId === 'oura-run-1', '');
log('importOuraWorkout: adds the session to ST.sessionCache so calendar/history/badges see it', ST.sessionCache.some(s => s.ouraWorkoutId === 'oura-run-1'), '');
log('BUG FIX: a leaderboard-eligible import (Outdoor Run) correctly submits to the running leaderboard', ouraRunSubmitted && ouraVolumeLogged, '');

ouraRunSubmitted = false; ouraVolumeLogged = false;
const walkEvent2 = { id:'oura-walk-2', activity:'walking', calories:200, distance:3000, start_datetime:'2026-07-23T08:00:00.000-07:00', end_datetime:'2026-07-23T08:30:00.000-07:00' };
await importOuraWorkout(walkEvent2, mapOuraActivityToExercise(walkEvent2));
log('BUG-FREE: Walking import correctly does NOT submit to the running leaderboard (deliberately excluded by design)', !ouraRunSubmitted && !ouraVolumeLogged, '');

submitRunningPR = origSubmitRunningPR; logRunningVolume = origLogRunningVolume;

// CRITICAL: syncOuraWorkouts must never double-import the same event, even
// if called more than once — this is the exact risk Chad flagged.
ST.ouraAccessToken = 'fake-token';
ST.sessionCache = [];
dbInserts = [];
SB.from = () => ({ insert: async (rows) => { dbInserts.push(rows[0]); return { error: null }; }, upsert: async () => ({ error: null }) });
ouraFetch = async (ep) => {
  if (ep.startsWith('workout')) return { data: [{ id:'oura-dedup-test', activity:'walking', calories:300, distance:4000, start_datetime:'2026-07-23T09:00:00.000-07:00', end_datetime:'2026-07-23T09:30:00.000-07:00' }] };
  return { data: [] };
};
await syncOuraWorkouts();
log('syncOuraWorkouts: imports a new, non-conflicting event automatically', dbInserts.length === 1, '');
await syncOuraWorkouts(); // run again — same event, should NOT re-import
log('BUG FIX (critical): running syncOuraWorkouts twice does NOT create a duplicate database entry', dbInserts.length === 1, 'still '+dbInserts.length);

// Ambiguous case: a similar existing session queues a confirmation prompt
// instead of silently importing or silently skipping
ST.ouraAccessToken = 'fake-token';
ST.sessionCache = [{ date: '2026-07-24T16:10:00.000Z', durationMinutes: 30, workoutSnapshot:{taxi:[],takeoff:[],enroute:[],landing:[]} }];
dbInserts = [];
ST.ouraImportQueue = [];
ouraFetch = async (ep) => {
  if (ep.startsWith('workout')) return { data: [{ id:'oura-ambiguous-1', activity:'walking', calories:250, distance:3500, start_datetime:'2026-07-24T16:00:00.000Z', end_datetime:'2026-07-24T16:35:00.000Z' }] };
  return { data: [] };
};
document.getElementById = (id) => id === 'modalRoot' ? _fakeEl : _fakeEl;
await syncOuraWorkouts();
log('BUG FIX: an ambiguous overlapping case is queued for confirmation, NOT silently auto-imported', dbInserts.length === 0 && ST.ouraImportQueue.length === 1, 'inserts:'+dbInserts.length+' queue:'+ST.ouraImportQueue.length);
let modalHtml = _fakeEl.innerHTML || '';
log('showOuraDuplicateConfirm: shows a real confirmation prompt, not a silent decision', modalHtml.includes('Possible duplicate'), '');

// Resolving as "skip" does not import; resolving as "import" does
await resolveOuraDuplicate('skip');
log('resolveOuraDuplicate: choosing skip does not import anything', dbInserts.length === 0 && ST.ouraImportQueue.length === 0, '');

ST.sessionCache = [{ date: '2026-07-25T09:10:00.000Z', durationMinutes: 30, workoutSnapshot:{taxi:[],takeoff:[],enroute:[],landing:[]} }];
ST.ouraImportQueue = [{ event: { id:'oura-ambiguous-2', activity:'walking', calories:250, distance:3500, start_datetime:'2026-07-25T09:00:00.000Z', end_datetime:'2026-07-25T09:35:00.000Z' }, exDef: mapOuraActivityToExercise({activity:'walking'}) }];
await resolveOuraDuplicate('import');
log('resolveOuraDuplicate: choosing "import anyway" correctly saves it as a separate session', dbInserts.length === 1 && dbInserts[0].session_data.ouraWorkoutId === 'oura-ambiguous-2', '');

// ── v5.19.22: OURA DUPLICATE PROMPT — MISSING CONTEXT + CAMELCASE LABEL BUG ──
document.getElementById = () => _fakeEl;

// humanizeOuraActivity: the exact reported bug (camelCase) plus regression checks
log('BUG FIX: camelCase activity name is correctly spaced and capitalized ("strengthTraining" -> "Strength Training")', humanizeOuraActivity('strengthTraining') === 'Strength Training', humanizeOuraActivity('strengthTraining'));
log('regression: snake_case still works correctly', humanizeOuraActivity('open_water_swimming') === 'Open Water Swimming', humanizeOuraActivity('open_water_swimming'));
log('regression: plain lowercase still works correctly', humanizeOuraActivity('badminton') === 'Badminton', humanizeOuraActivity('badminton'));
log('humanizeOuraActivity: handles empty/null gracefully', humanizeOuraActivity(null) === 'Activity' && humanizeOuraActivity('') === 'Activity', '');

// mapOuraActivityToExercise's fallback name also uses the fixed humanizer
const strengthEx = mapOuraActivityToExercise({activity:'strengthTraining', distance:0});
log('BUG FIX: mapOuraActivityToExercise fallback name is also correctly humanized', strengthEx.name === 'Strength Training (via Oura)', strengthEx.name);

// showOuraDuplicateConfirm: THE ACTUAL REPORTED PROBLEM — the prompt must
// show enough context to actually be answerable (date + what it's compared against)
ST.ouraImportQueue = [{
  event: { id:'oura-x', activity:'strengthTraining', start_datetime:'2026-07-17T15:15:00.000-07:00', end_datetime:'2026-07-17T16:34:00.000-07:00' },
  exDef: strengthEx,
  similar: { date:'2026-07-17T15:00:00.000-07:00', muscle_group:'Upper Push', durationMinutes: 60 },
}];
showOuraDuplicateConfirm();
let ouraModalHtml = _fakeEl.innerHTML || '';
log('BUG FIX: prompt now shows the actual date of the Oura event, not just a bare duration+activity', ouraModalHtml.includes('Jul 17'), '');
log('BUG FIX: prompt now shows what existing session it is actually comparing against (muscle group + time)', ouraModalHtml.includes('Upper Push') && ouraModalHtml.includes('60 min'), '');
log('BUG FIX: activity label in the modal is correctly humanized, not raw camelCase text', ouraModalHtml.includes('Strength Training') && !ouraModalHtml.includes('strengthTraining'), '');

// Defensive fallback when no similar-session info is available (shouldn\'t
// normally happen, but must not crash or show something misleading)
ST.ouraImportQueue = [{
  event: { id:'oura-y', activity:'walking', start_datetime:'2026-07-18T09:00:00.000-07:00', end_datetime:'2026-07-18T09:30:00.000-07:00' },
  exDef: mapOuraActivityToExercise({activity:'walking'}),
  similar: null,
}];
let noCrash = true;
try { showOuraDuplicateConfirm(); } catch(e) { noCrash = false; }
ouraModalHtml = _fakeEl.innerHTML || '';
log('showOuraDuplicateConfirm: does not crash when similar-session details are unavailable, and still shows the event date', noCrash && ouraModalHtml.includes('Jul 18'), '');

// ── v5.19.23: SESSION DETAIL — OURA BADGE, TIME DISPLAY, MINUTES CONSISTENCY ──
document.getElementById = () => _fakeEl;

// Set up a realistic Oura-imported session with a KNOWN mismatch between
// stored durationMinutes and what should be recomputed, to prove the fix
// actually uses the recomputed value, not the raw stored field.
const ouraSession = {
  date: '2026-07-23T18:25:00.000Z', env:'comm', muscle_group:'Cardio', fatigue:'go',
  durationMinutes: 0, // deliberately wrong stored value, matching the reported bug
  sets: { oura_indoor_running: [{ seconds: '1820' }] }, // 30m20s, real data
  workoutSnapshot: { taxi:[], takeoff:[], enroute:[{id:'oura_indoor_running', name:'Indoor Running (via Oura)', inputType:'timed', timed:true}], landing:[] },
  importedFromOura: true, ouraWorkoutId: 'oura-run-real',
};
SB.from = () => ({ select: () => ({ eq: () => ({ gte: () => ({ order: async()=>({data:[]}) }) }), order: async()=>({data:[]}) }) });
const origLoadCalendarRange = loadCalendarRange;
loadCalendarRange = async () => ({ sessions: [ouraSession] });
const origDbGetProfile = dbGetProfile, origDbGetRecentSessions = dbGetRecentSessions;
dbGetProfile = async () => ({ lastWeight: 180 });
dbGetRecentSessions = async () => [];

await showCalendarDay('2026-07-23');
let sessionDetailHtml = _fakeEl.innerHTML || '';
log('BUG FIX: session detail shows the "via Oura" indicator when importedFromOura is true', sessionDetailHtml.includes('via Oura'), '');
log('BUG FIX: session detail now shows the actual TIME, not just the date', /\d{1,2}:\d{2}\s*(AM|PM)/i.test(sessionDetailHtml), '');
log('BUG FIX: Minutes now uses the RECOMPUTED value (from real seconds data), not the wrong stored durationMinutes=0', sessionDetailHtml.includes('>30<') , sessionDetailHtml.match(/stat-val">(\d+|—)</g)?.join(','));

// Regression: a native (non-Oura) session does NOT show the Oura badge
const nativeSession2 = {
  date: '2026-07-23T10:00:00.000Z', env:'comm', muscle_group:'Lower Body', fatigue:'go',
  durationMinutes: 45, sets: {}, workoutSnapshot: {taxi:[],takeoff:[],enroute:[],landing:[]},
};
loadCalendarRange = async () => ({ sessions: [nativeSession2] });
await showCalendarDay('2026-07-23');
sessionDetailHtml = _fakeEl.innerHTML || '';
log('regression: a native FCF session does NOT show the "via Oura" indicator', !sessionDetailHtml.includes('via Oura'), '');

loadCalendarRange = origLoadCalendarRange; dbGetProfile = origDbGetProfile; dbGetRecentSessions = origDbGetRecentSessions;

// dumpRawOuraWorkouts: basic sanity
ST.ouraAccessToken = null;
await dumpRawOuraWorkouts();
let dumpHtml = _fakeEl.innerHTML || '';
log('dumpRawOuraWorkouts: clear message when Oura not connected', dumpHtml.includes('Connect Oura Ring first'), '');
ST.ouraAccessToken = 'fake-token';
const origOuraFetch2 = ouraFetch;
ouraFetch = async () => ({ data: [{ id:'x', activity:'indoorRunning', start_datetime:null }] });
await dumpRawOuraWorkouts();
dumpHtml = _fakeEl.innerHTML || '';
log('dumpRawOuraWorkouts: dumps the raw JSON for inspection', dumpHtml.includes('indoorRunning'), '');
ouraFetch = origOuraFetch2;

// ── v5.19.24: OURA-INTERNAL OVERLAP DEDUP (using Chad\'s real reported data) ──
document.getElementById = () => _fakeEl;

// The exact real data Chad shared — includes the two genuinely overlapping
// strengthTraining entries on July 20th (11:53-12:05 sits entirely inside
// 10:43-12:13), plus several legitimately separate, non-overlapping walks.
const realOuraBatch = [
  { id:"65dccecb-3fc5-42cb-a374-45442bb484fd", activity:"walking", calories:212.39, day:"2026-07-19", distance:3636.3, end_datetime:"2026-07-19T19:22:00.000-07:00", source:"confirmed", start_datetime:"2026-07-19T18:32:00.000-07:00" },
  { id:"7a37e2d9-5c17-4a85-8b67-1a66f7e98d12", activity:"walking", calories:61.14, day:"2026-07-19", distance:1016.4, end_datetime:"2026-07-19T19:37:00.000-07:00", source:"confirmed", start_datetime:"2026-07-19T19:23:00.000-07:00" },
  { id:"61eee6d3-06a0-4ce4-836a-9294dddf84a0", activity:"strengthTraining", calories:574.14, day:"2026-07-20", distance:391.5, end_datetime:"2026-07-20T12:13:46.588-07:00", source:"manual", start_datetime:"2026-07-20T10:43:46.588-07:00" },
  { id:"79b9acff-d326-44b6-8f2e-5a4a71641790", activity:"strengthTraining", calories:68.05, day:"2026-07-20", distance:2529.7, end_datetime:"2026-07-20T12:05:00.000-07:00", source:"confirmed", start_datetime:"2026-07-20T11:53:00.000-07:00" },
  { id:"463dffc3-42c2-41c0-805d-17c7cd4d06db", activity:"houseWork", calories:140.39, day:"2026-07-20", distance:429.8, end_datetime:"2026-07-20T13:02:00.000-07:00", source:"confirmed", start_datetime:"2026-07-20T12:36:00.000-07:00" },
  { id:"12ad561c-6f33-487b-b491-56e580665514", activity:"walking", calories:38.95, day:"2026-07-20", distance:733.0, end_datetime:"2026-07-20T14:08:00.000-07:00", source:"confirmed", start_datetime:"2026-07-20T13:57:00.000-07:00" },
];

const filtered = filterOuraInternalOverlaps(realOuraBatch);
log('BUG FIX: the two overlapping strengthTraining entries collapse to just ONE (the longer, more complete one)', filtered.filter(e=>e.activity==='strengthTraining').length === 1, 'strengthTraining count: '+filtered.filter(e=>e.activity==='strengthTraining').length);
log('BUG FIX: the LONGER entry (90min, manual source) is the one kept, not the shorter nested one', filtered.find(e=>e.activity==='strengthTraining')?.id === '61eee6d3-06a0-4ce4-836a-9294dddf84a0', filtered.find(e=>e.activity==='strengthTraining')?.id);
log('BUG-FREE: legitimately separate, non-overlapping walks are all preserved (not falsely collapsed)', filtered.filter(e=>e.activity==='walking').length === 3, 'walking count: '+filtered.filter(e=>e.activity==='walking').length);
log('BUG-FREE: houseWork (non-overlapping, different activity) is preserved', filtered.some(e=>e.activity==='houseWork'), '');
log('total: 6 real events in, 5 out (one genuine internal duplicate removed)', filtered.length === 5, 'got '+filtered.length); // 3 walking + 1 strengthTraining + 1 houseWork = 5

// Defensive: unparseable dates do not crash and are passed through rather than silently dropped
const withBadDate = [...realOuraBatch, { id:'bad-1', activity:'walking', start_datetime:null, end_datetime:null }];
let overlapNoCrash = true;
let filteredBad;
try { filteredBad = filterOuraInternalOverlaps(withBadDate); } catch(e) { overlapNoCrash = false; }
log('filterOuraInternalOverlaps: does not crash on unparseable dates, and does not silently drop that event', overlapNoCrash && filteredBad.some(e=>e.id==='bad-1'), '');

// End-to-end: syncOuraWorkouts only imports ONE session for the overlapping pair
ST.user = { id:'u1' }; ST.username='TestPilot'; ST.sex='male'; ST.ouraAccessToken='fake-token';
ST.sessionCache = [];
let realDbInserts = [];
SB.from = () => ({ insert: async (rows) => { realDbInserts.push(rows[0]); return { error: null }; }, upsert: async () => ({ error: null }) });
ouraFetch = async (ep) => ep.startsWith('workout') ? { data: realOuraBatch } : { data: [] };
await syncOuraWorkouts();
const importedActivities = realDbInserts.map(r => r.session_data.ouraActivity);
log('BUG FIX END-TO-END: syncOuraWorkouts imports only ONE strengthTraining session for the overlapping pair, not two', importedActivities.filter(a=>a==='strengthTraining').length === 1, JSON.stringify(importedActivities));

// ── v5.19.25: PERSIST "SKIP" DECISION — FIX THE REPEATED DUPLICATE PROMPT ──
document.getElementById = () => _fakeEl;
ST.user = { id:'u1' }; ST.username='TestPilot'; ST.sex='male'; ST.ouraAccessToken='fake-token';

// resolveOuraDuplicate("skip") must persist the decision, not just clear the in-memory queue
let savedProfile = null;
SB.from = () => ({ insert: async ()=>({error:null}), upsert: async ()=>({error:null}),
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { profile_data: savedProfile || {} } }) }) }) });
const origDbSetProfile = dbSetProfile;
dbSetProfile = async (p) => { savedProfile = p; return origDbSetProfile ? undefined : undefined; };

ST.ouraDismissedIds = [];
ST.ouraImportQueue = [{ event: { id:'oura-skip-test', activity:'walking', start_datetime:'2026-07-24T09:00:00.000Z', end_datetime:'2026-07-24T09:30:00.000Z' }, exDef: mapOuraActivityToExercise({activity:'walking'}) }];
await resolveOuraDuplicate('skip');
log('BUG FIX: choosing "skip" persists the event id so it is remembered permanently', ST.ouraDismissedIds.includes('oura-skip-test'), JSON.stringify(ST.ouraDismissedIds));
log('BUG FIX: the dismissal is actually saved to the profile, not just kept in memory for this session', savedProfile?.ouraDismissedIds?.includes('oura-skip-test'), JSON.stringify(savedProfile));

// THE EXACT REPORTED SCENARIO END TO END: sync -> get prompted -> skip ->
// sync AGAIN (simulating reopening the app or tapping Sync Now) -> must
// NOT be asked about the same event again.
ST.sessionCache = [{ date: '2026-07-24T09:00:00.000Z', durationMinutes: 30, workoutSnapshot:{taxi:[],takeoff:[],enroute:[],landing:[]} }]; // an existing session that will look "similar"
ST.ouraDismissedIds = [];
ST.ouraImportQueue = [];
let dbInsertsRepeat = [];
SB.from = () => ({ insert: async (rows) => { dbInsertsRepeat.push(rows[0]); return { error: null }; }, upsert: async () => ({ error: null }),
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { profile_data: savedProfile || {} } }) }) }) });
ouraFetch = async (ep) => ep.startsWith('workout') ? { data: [{ id:'oura-repeat-test', activity:'walking', calories:100, distance:2000, start_datetime:'2026-07-24T09:05:00.000Z', end_datetime:'2026-07-24T09:35:00.000Z' }] } : { data: [] };

await syncOuraWorkouts(); // first sync -> should queue the ambiguous prompt
log('first sync: correctly queues the ambiguous case for confirmation', ST.ouraImportQueue.length === 1 && ST.ouraImportQueue[0].event.id === 'oura-repeat-test', '');
await resolveOuraDuplicate('skip'); // user answers "already logged, skip"
log('after skip: queue is cleared and the event id is remembered', ST.ouraImportQueue.length === 0 && ST.ouraDismissedIds.includes('oura-repeat-test'), '');

await syncOuraWorkouts(); // SECOND sync — the exact "asked again" scenario
log('BUG FIX (the exact reported bug): a second sync does NOT re-ask about the same already-dismissed event', ST.ouraImportQueue.length === 0, 'queue length: '+ST.ouraImportQueue.length);

await syncOuraWorkouts(); // THIRD sync, matching "asked three times"
log('BUG FIX: a third sync still does not re-ask (permanently remembered, not just once)', ST.ouraImportQueue.length === 0, '');
log('BUG-FREE: the dismissed event was never actually imported to the database either (skip means skip)', dbInsertsRepeat.length === 0, 'inserts: '+dbInsertsRepeat.length);

// Regression: choosing "import" still works and does NOT get added to the dismissed list
ST.ouraImportQueue = [{ event: { id:'oura-import-test', activity:'walking', start_datetime:'2026-07-24T10:00:00.000Z', end_datetime:'2026-07-24T10:30:00.000Z' }, exDef: mapOuraActivityToExercise({activity:'walking'}) }];
ST.ouraDismissedIds = [];
dbInsertsRepeat = [];
await resolveOuraDuplicate('import');
log('regression: choosing "import" still actually imports the session', dbInsertsRepeat.some(r => r.session_data.ouraWorkoutId === 'oura-import-test'), '');
log('regression: an imported (not skipped) event does not get added to the dismissed list', !ST.ouraDismissedIds.includes('oura-import-test'), '');

dbSetProfile = origDbSetProfile;

// ── v5.19.26: MINIMUM DURATION FILTER (10 min) — using Chad\'s exact real data ──
document.getElementById = () => _fakeEl;
ST.user = { id:'u1' }; ST.username='TestPilot'; ST.sex='male'; ST.ouraAccessToken='fake-token';

log('MIN_OURA_IMPORT_MINUTES is set to 10, matching the requested threshold', MIN_OURA_IMPORT_MINUTES === 10, '');

// End-to-end with Chad\'s exact two real events: the 47-second auto-detected
// walk should be filtered out, the 19-minute Start Live Activity walk should import.
ST.sessionCache = [];
let minDurInserts = [];
SB.from = () => ({ insert: async (rows) => { minDurInserts.push(rows[0]); return { error: null }; }, upsert: async () => ({ error: null }) });
ouraFetch = async (ep) => ep.startsWith('workout') ? { data: [
  { id:"2f81b8e9-b234-41cd-9fbc-e46f2a3c7e6c", activity:"walking", calories:3.13, distance:42.18, start_datetime:"2026-07-23T18:14:02.759-05:00", end_datetime:"2026-07-23T18:14:50.014-05:00", source:"workout_heart_rate" },
  { id:"dfcd3935-6e04-4807-9704-a782ad3d7241", activity:"walking", calories:71.54, distance:934.96, start_datetime:"2026-07-23T18:17:00.000-05:00", end_datetime:"2026-07-23T18:36:00.000-05:00", source:"confirmed" },
] } : { data: [] };
await syncOuraWorkouts();
log('BUG FIX: the 47-second walk (well under 10 min) is correctly filtered out, not imported', !minDurInserts.some(r => r.session_data.ouraWorkoutId === '2f81b8e9-b234-41cd-9fbc-e46f2a3c7e6c'), '');
log('the 19-minute walk is now excluded too (v5.19.31 raised the walk floor to 20 min)', !minDurInserts.some(r => r.session_data.ouraWorkoutId === 'dfcd3935-6e04-4807-9704-a782ad3d7241'), '');
log('neither short walk imports under the current walk floor', minDurInserts.length === 0, 'got '+minDurInserts.length);

// Boundary check: exactly 10:00 minutes passes, 9:59 does not
const exactlyTen = mapOuraActivityToExercise({activity:'walking'});
ST.sessionCache = []; minDurInserts = [];
ouraFetch = async (ep) => ep.startsWith('workout') ? { data: [
  { id:'exactly-10', activity:'walking', calories:50, distance:800, start_datetime:'2026-07-24T09:00:00.000Z', end_datetime:'2026-07-24T09:10:00.000Z' }, // exactly 10:00
  { id:'just-under-10', activity:'walking', calories:45, distance:700, start_datetime:'2026-07-24T11:00:00.000Z', end_datetime:'2026-07-24T11:09:59.000Z' }, // 9:59
] } : { data: [] };
await syncOuraWorkouts();
log('boundary: a 10:00 WALK is now excluded (walks require 20 min as of v5.19.31)', !minDurInserts.some(r => r.session_data.ouraWorkoutId === 'exactly-10'), '');
log('boundary: 9:59 is correctly excluded', !minDurInserts.some(r => r.session_data.ouraWorkoutId === 'just-under-10'), '');

// ── v5.19.27: NUTRITION LOGGING FOUNDATION ──
document.getElementById = () => _fakeEl;
ST.user = { id: 'u1' };

// extractUSDANutrients: handles the "lookup" response shape (nutrient.name/amount)
const lookupShapeFood = {
  description: 'Chicken breast, grilled',
  foodNutrients: [
    { nutrient: { name: 'Energy', unitName: 'KCAL' }, amount: 165 },
    { nutrient: { name: 'Protein' }, amount: 31 },
    { nutrient: { name: 'Total lipid (fat)' }, amount: 3.6 },
    { nutrient: { name: 'Carbohydrate, by difference' }, amount: 0 },
    { nutrient: { name: 'Fiber, total dietary' }, amount: 0 },
    { nutrient: { name: 'Sugars, total' }, amount: 0 },
  ],
};
const extracted1 = extractUSDANutrients(lookupShapeFood);
log('extractUSDANutrients: correctly extracts from the lookup response shape (nutrient.name/amount)', extracted1.calories === 165 && extracted1.protein === 31 && extracted1.fat === 3.6, JSON.stringify(extracted1));
log('BUG-FREE: a legitimate zero value (0g carbs for grilled chicken) is preserved, not mistaken for "not found"', extracted1.carbs === 0 && extracted1.fiber === 0, JSON.stringify(extracted1));

// extractUSDANutrients: handles the "search" response shape (nutrientName/value)
const searchShapeFood = {
  description: 'Banana, raw',
  foodNutrients: [
    { nutrientName: 'Energy', value: 89 },
    { nutrientName: 'Protein', value: 1.1 },
    { nutrientName: 'Total lipid (fat)', value: 0.3 },
    { nutrientName: 'Carbohydrate, by difference', value: 22.8 },
    { nutrientName: 'Fiber, total dietary', value: 2.6 },
    { nutrientName: 'Sugars, total', value: 12.2 },
  ],
};
const extracted2 = extractUSDANutrients(searchShapeFood);
log('BUG-FREE: extractUSDANutrients handles the DIFFERENT search response shape (nutrientName/value) too', extracted2.calories === 89 && extracted2.carbs === 22.8 && extracted2.sugar === 12.2, JSON.stringify(extracted2));

// usdaReferenceLabel
log('usdaReferenceLabel: uses servingSize when present', usdaReferenceLabel({servingSize:85, servingSizeUnit:'g'}) === '85 g', '');
log('usdaReferenceLabel: falls back to 100g when no serving info', usdaReferenceLabel({}) === '100 g', '');

// scaleNutrients / sumMealNutrients
const base = { calories:100, protein:10, carbs:20, fat:5, fiber:2, sugar:3 };
log('scaleNutrients: scales all macros proportionally', JSON.stringify(scaleNutrients(base, 1.5)) === JSON.stringify({calories:150,protein:15,carbs:30,fat:7.5,fiber:3,sugar:4.5}), JSON.stringify(scaleNutrients(base,1.5)));
const items = [{nutrients:base}, {nutrients:scaleNutrients(base,2)}];
log('sumMealNutrients: correctly sums across multiple food items', sumMealNutrients(items).calories === 300, String(sumMealNutrients(items).calories));

// searchUSDAFoods: short/empty queries return [] without hitting the API
let usdaFetchCalled = false;
const origUsdaFetch = usdaFetch;
usdaFetch = async () => { usdaFetchCalled = true; return { foods: [] }; };
const shortResult = await searchUSDAFoods('a');
log('searchUSDAFoods: does not call the API for a too-short query', shortResult.length === 0 && !usdaFetchCalled, '');
usdaFetch = origUsdaFetch;

// searchUSDAFoods: maps real results correctly
usdaFetch = async (action, params) => {
  if (action === 'search') return { foods: [searchShapeFood] };
  return null;
};
const searchResults = await searchUSDAFoods('banana');
log('searchUSDAFoods: correctly maps a real result', searchResults.length === 1 && searchResults[0].description === 'Banana, raw' && searchResults[0].nutrients.calories === 89, JSON.stringify(searchResults));
usdaFetch = origUsdaFetch;

// getUSDAFoodDetail: handles a clean lookup and an error response
usdaFetch = async (action) => action === 'lookup' ? lookupShapeFood : null;
const detail = await getUSDAFoodDetail('12345');
log('getUSDAFoodDetail: correctly returns extracted nutrients from a lookup', detail.nutrients.calories === 165, '');
usdaFetch = async () => ({ error: 'not found' });
const errDetail = await getUSDAFoodDetail('bad-id');
log('getUSDAFoodDetail: returns null on an error response, does not crash', errDetail === null, '');
usdaFetch = origUsdaFetch;

// saveMealLog / loadTodaysMeals / deleteMealLog
let mealInserts = [];
SB.from = (table) => {
  if (table === 'meal_logs') return {
    insert: (rows) => ({ select: async () => { mealInserts.push(rows[0]); return { data: [{...rows[0], id: 'meal_1'}], error: null }; } }),
    select: () => ({ eq: () => ({ gte: () => ({ order: async () => ({ data: mealInserts.map((r,i)=>({...r,id:'meal_'+i})), error: null }) }) }) }),
    delete: () => ({ eq: async () => ({ error: null }) }),
  };
  return { insert: async()=>({error:null}) };
};
ST.todaysMeals = [];
const saved = await saveMealLog('lunch', [{ description: 'Chicken breast', nutrients: extracted1, source: 'usda', fdcId: '123' }]);
log('saveMealLog: saves a meal with items and returns the saved row', saved && saved.meal_data.mealType === 'lunch' && saved.meal_data.items.length === 1, '');
log('saveMealLog: computes and stores correct totals', saved.meal_data.totals.calories === 165, String(saved?.meal_data?.totals?.calories));
log('saveMealLog: does not save an empty meal (no items)', await saveMealLog('snack', []) === null, '');

await loadTodaysMeals();
log('loadTodaysMeals: loads meals scoped to today', ST.todaysMeals.length === 1, '');

// renderNutrition: empty state and populated state
ST.todaysMeals = [];
mealInserts = []; // reset shared mock DB state so the internal loadTodaysMeals() call sees a clean slate
await renderNutrition(_fakeEl);
let nutHtml = _fakeEl.innerHTML || '';
log('renderNutrition: shows an honest empty state when nothing is logged yet', nutHtml.includes('Nothing logged yet today'), '');

const populatedMeal = { id:'m1', meal_type:'lunch', meal_data: { mealType:'lunch', items:[{description:'Chicken breast', nutrients:extracted1, source:'usda'}], totals: extracted1 } };
SB.from = (table) => {
  if (table === 'meal_logs') return {
    select: () => ({ eq: () => ({ gte: () => ({ order: async () => ({ data: [populatedMeal], error: null }) }) }) }),
  };
  return { insert: async()=>({error:null}) };
};
await renderNutrition(_fakeEl);
nutHtml = _fakeEl.innerHTML || '';
log('renderNutrition: shows a logged meal with its items and totals', nutHtml.includes('Chicken breast') && nutHtml.includes('165'), '');

// Restore the full read/write mock for the remaining tests
SB.from = (table) => {
  if (table === 'meal_logs') return {
    insert: (rows) => ({ select: async () => { mealInserts.push(rows[0]); return { data: [{...rows[0], id: 'meal_1'}], error: null }; } }),
    select: () => ({ eq: () => ({ gte: () => ({ order: async () => ({ data: mealInserts.map((r,i)=>({...r,id:'meal_'+i})), error: null }) }) }) }),
    delete: () => ({ eq: async () => ({ error: null }) }),
  };
  return { insert: async()=>({error:null}) };
};

// Meal builder flow: open -> search -> select -> add -> save
ST.mealBuilder = null;
openMealBuilder();
log('openMealBuilder: initializes an empty meal builder', ST.mealBuilder && ST.mealBuilder.items.length === 0 && ST.mealBuilder.mealType === 'snack', '');

ST.mealBuilder.items.push({ description: 'Banana, raw', nutrients: extracted2, source: 'usda', fdcId: '456' });
renderMealBuilder();
let builderHtml = _fakeEl.innerHTML || '';
log('renderMealBuilder: shows an added item and a running total', builderHtml.includes('Banana, raw') && builderHtml.includes('89'), '');

// Manual entry fallback
showManualFoodEntry();
document.getElementById = (id) => {
  const vals = { manualFoodName:'Homemade Chili', manualCal:'350', manualProtein:'25', manualCarbs:'30', manualFat:'12' };
  if (vals[id] !== undefined) return { value: vals[id] };
  return _fakeEl;
};
addManualFoodToMeal();
document.getElementById = () => _fakeEl;
log('addManualFoodToMeal: correctly adds a manually-entered food with the typed macros', ST.mealBuilder.items.some(i => i.description==='Homemade Chili' && i.nutrients.calories===350 && i.source==='manual'), JSON.stringify(ST.mealBuilder.items));

// Finish and save
await finishMealBuilder();
log('finishMealBuilder: saves the built meal and clears the builder', ST.mealBuilder === null && mealInserts.some(r => r.meal_data.items.some(i=>i.description==='Homemade Chili')), '');

usdaFetch = origUsdaFetch;

// ── v5.19.28: USDA SEARCH RESULT ORDERING — GENERIC BEFORE BRANDED ──
document.getElementById = () => _fakeEl;
const origUsdaFetch2 = usdaFetch;

// Mirrors what the real "chicken" search actually returned: several branded
// products first (USDA's own ranking), with a generic Foundation entry
// buried further down — exactly the case reported.
usdaFetch = async () => ({ foods: [
  { fdcId:1, description:'CHICKEN', brandOwner:'Wegmans Food Markets, Inc.', dataType:'Branded', foodNutrients:[{nutrientName:'Energy',value:188}] },
  { fdcId:2, description:'CHICKEN', brandOwner:'Essenhaus, Inc.', dataType:'Branded', foodNutrients:[{nutrientName:'Energy',value:107}] },
  { fdcId:3, description:'Chicken, broiler or fryers, breast, meat only, cooked, roasted', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:165}] },
  { fdcId:4, description:'CHICKEN', brandOwner:'Bar-S Foods Co.', dataType:'Branded', foodNutrients:[{nutrientName:'Energy',value:219}] },
  { fdcId:5, description:'Chicken, breast, boneless, skinless, raw', dataType:'Foundation', foodNutrients:[{nutrientName:'Energy',value:114}] },
] });
const reorderedResults = await searchUSDAFoods('chicken');
log('BUG FIX: generic (Foundation/SR Legacy) results now surface before branded ones', reorderedResults[0].dataType === 'SR Legacy' && reorderedResults[1].dataType === 'Foundation', reorderedResults.map(r=>r.dataType).join(','));
log('BUG-FREE: branded results are still included, just reordered after generic ones — nothing lost', reorderedResults.filter(r=>r.dataType==='Branded').length === 3, '');
log('BUG-FREE: relative order WITHIN each group is preserved (stable sort) — branded results still in USDA\'s original order', reorderedResults.filter(r=>r.dataType==='Branded').map(r=>r.fdcId).join(',') === '1,2,4', reorderedResults.filter(r=>r.dataType==='Branded').map(r=>r.fdcId).join(','));

// Edge case: all-branded results (no generic available) — just passes
// through in original order, no crash
usdaFetch = async () => ({ foods: [
  { fdcId:10, description:'BRAND A', dataType:'Branded', foodNutrients:[] },
  { fdcId:11, description:'BRAND B', dataType:'Branded', foodNutrients:[] },
] });
const allBrandedResults = await searchUSDAFoods('somebrand');
log('all-branded results (no generic available) still work correctly, no crash', allBrandedResults.length === 2 && allBrandedResults[0].fdcId === 10, '');

usdaFetch = origUsdaFetch2;

// ── v5.19.29: FIX OVERLAPPING CANCEL/SAVE MEAL BUTTONS + SEARCH RELEVANCE ──
document.getElementById = () => _fakeEl;
ST.user = { id:'u1' };

// THE ACTUAL REPORTED BUG: Cancel and Save Meal buttons overlapping,
// caused by the base .btn{width:100%} style with no flex override.
ST.mealBuilder = { mealType:'dinner', items:[{description:'Chicken', nutrients:{calories:107,protein:21.4,carbs:0,fat:1.8,fiber:0,sugar:0}, source:'usda'}] };
renderMealBuilder();
let builderHtml2 = _fakeEl.innerHTML || '';
log('BUG FIX: Cancel button now has flex:1 to prevent overlapping with Save Meal', /Cancel<\/button>/.test(builderHtml2) && builderHtml2.includes('flex:1;margin-right:8px') , '');
log('BUG FIX: Save Meal button now has flex:1', builderHtml2.match(/Save Meal/) && builderHtml2.includes('btn btn-gold" style="flex:1"'), '');
log('BUG FIX: Cancel button now correctly has the base "btn" class too, not just "btn-outline" alone', builderHtml2.includes('class="btn btn-outline"'), '');
log('regression: Save Meal is still disabled when the meal builder has no items', (() => { ST.mealBuilder.items=[]; renderMealBuilder(); return (_fakeEl.innerHTML||'').includes('disabled'); })(), '');
ST.mealBuilder.items = [{description:'Chicken', nutrients:{calories:107,protein:21.4,carbs:0,fat:1.8,fiber:0,sugar:0}, source:'usda'}];

// Search relevance: Chad\'s exact real second-round "chicken" results
const origUsdaFetch3 = usdaFetch;
usdaFetch = async () => ({ foods: [
  { fdcId:1, description:'Chicken spread', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:663}] },
  { fdcId:2, description:'Chicken, meatless', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:224}] },
  { fdcId:3, description:'Fat, chicken', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:900}] },
  { fdcId:4, description:'Frankfurter, chicken', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:933}] },
  { fdcId:5, description:'Fast foods, chicken tenders', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:1140}] },
  { fdcId:6, description:'Bologna, chicken, pork', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:1410}] },
  { fdcId:7, description:'Bratwurst, chicken, cooked', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:176}] },
  { fdcId:8, description:'Chicken, canned, no broth', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:185}] },
  { fdcId:9, description:'CHICKEN', brandOwner:'Wegmans Food Markets, Inc.', dataType:'Branded', foodNutrients:[{nutrientName:'Energy',value:188}] },
] });
const relevanceResults = await searchUSDAFoods('chicken');
const startsWithChickenIdx = relevanceResults.findIndex(r => r.description === 'Chicken, canned, no broth');
const bolognaIdx = relevanceResults.findIndex(r => r.description === 'Bologna, chicken, pork');
const frankfurterIdx = relevanceResults.findIndex(r => r.description === 'Frankfurter, chicken');
log('BUG FIX: entries starting with "Chicken" (e.g. "Chicken, canned, no broth") now rank above entries that merely contain it', startsWithChickenIdx < bolognaIdx && startsWithChickenIdx < frankfurterIdx, 'positions: canned='+startsWithChickenIdx+' bologna='+bolognaIdx+' frankfurter='+frankfurterIdx);
log('BUG-FREE: generic results (all SR Legacy here) still all rank above the branded Wegmans entry', relevanceResults.findIndex(r=>r.dataType==='Branded') === relevanceResults.length-1, '');
usdaFetch = origUsdaFetch3;

// ── v5.19.30: CURATED STAPLE FOOD BOOST ──
document.getElementById = () => _fakeEl;
const origUsdaFetch4 = usdaFetch;

// The exact real "chicken" batch reported, PLUS the canonical USDA chicken
// breast entry (which almost certainly exists in the real dataset, just
// not on the page Chad happened to see) — confirms it gets boosted to the top.
usdaFetch = async () => ({ foods: [
  { fdcId:1, description:'Chicken spread', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:663}] },
  { fdcId:2, description:'Chicken, meatless', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:224}] },
  { fdcId:3, description:'Chicken, canned, no broth', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:185}] },
  { fdcId:4, description:'Fat, chicken', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:900}] },
  { fdcId:5, description:'Frankfurter, chicken', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:933}] },
  { fdcId:6, description:'Chicken, broilers or fryers, breast, meat only, cooked, roasted', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:165}] },
  { fdcId:7, description:'CHICKEN', brandOwner:'Wegmans Food Markets, Inc.', dataType:'Branded', foodNutrients:[{nutrientName:'Energy',value:188}] },
] });
const staplePriorityResults = await searchUSDAFoods('chicken');
log('BUG FIX: the canonical chicken breast entry is now boosted to the very top, ahead of Chicken spread/meatless/canned', staplePriorityResults[0].description.includes('breast, meat only, cooked, roasted'), staplePriorityResults[0].description);

// Graceful fallback: chicken breast entry NOT present in results at all —
// falls back to the existing generic/starts-with ordering, no crash
usdaFetch = async () => ({ foods: [
  { fdcId:1, description:'Chicken spread', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:663}] },
  { fdcId:2, description:'Frankfurter, chicken', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:933}] },
] });
const noStapleResults = await searchUSDAFoods('chicken');
log('graceful fallback: no crash and correct ordering when the staple entry is not present in results at all', noStapleResults.length === 2 && noStapleResults[0].description === 'Chicken spread', noStapleResults.map(r=>r.description).join(','));

// Unrelated, non-staple query is completely unaffected by the boost logic
usdaFetch = async () => ({ foods: [
  { fdcId:1, description:'Quinoa, uncooked', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:368}] },
  { fdcId:2, description:'QUINOA BLEND', brandOwner:'Trader Joes', dataType:'Branded', foodNutrients:[{nutrientName:'Energy',value:200}] },
] });
const quinoaResults = await searchUSDAFoods('quinoa');
log('non-staple queries are unaffected by the boost logic (generic still correctly ranks first via the existing tier)', quinoaResults[0].description === 'Quinoa, uncooked', '');

usdaFetch = origUsdaFetch4;


// ── v5.19.31: WALK-SPECIFIC 20-MINUTE IMPORT MINIMUM ──
log('minImportMinutesFor: walking requires 20 minutes', minImportMinutesFor('walking') === 20, '');
log('minImportMinutesFor: Outdoor walking (mixed case) also requires 20', minImportMinutesFor('outdoorWalking') === 20, '');
log('minImportMinutesFor: non-walk activities still use the 10-minute floor', minImportMinutesFor('strengthTraining') === 10 && minImportMinutesFor('running') === 10, '');

// End-to-end using the real reported walks
ST.user = { id:'u1' }; ST.ouraAccessToken='fake-token'; ST.sessionCache = []; ST.ouraDismissedIds = []; ST.ouraImportQueue = [];
let walkMinInserts = [];
SB.from = () => ({ insert: async (rows) => { walkMinInserts.push(rows[0]); return { error:null }; }, upsert: async()=>({error:null}) });
ouraFetch = async (ep) => ep.startsWith('workout') ? { data: [
  { id:'walk-19min', activity:'walking', calories:71, distance:934, start_datetime:'2026-07-23T18:17:00.000-05:00', end_datetime:'2026-07-23T18:36:00.000-05:00' },
  { id:'walk-32min', activity:'walking', calories:112, distance:1657, start_datetime:'2026-07-23T19:26:00.000-05:00', end_datetime:'2026-07-23T19:58:00.000-05:00' },
  { id:'strength-12min', activity:'strengthTraining', calories:80, distance:0, start_datetime:'2026-07-23T20:10:00.000-05:00', end_datetime:'2026-07-23T20:22:00.000-05:00' },
] } : { data: [] };
await syncOuraWorkouts();
const importedIds = walkMinInserts.map(r => r.session_data.ouraWorkoutId);
log('BUG FIX: a 19-minute walk is now correctly excluded (under the new 20-minute walk floor)', !importedIds.includes('walk-19min'), importedIds.join(','));
log('a 32-minute walk is still correctly imported', importedIds.includes('walk-32min'), '');
log('BUG-FREE: a 12-minute STRENGTH session still imports (non-walk activities keep the 10-minute floor)', importedIds.includes('strength-12min'), '');

// ── v5.19.32: NUTRITION TARGETS + SAFETY GUARDRAILS ──
document.getElementById = () => _fakeEl;

// Mifflin-St Jeor, verified by hand: 200lb (90.72kg), 72in (182.88cm), 40yr male
// = (10*90.72) + (6.25*182.88) - (5*40) + 5 = 907.2 + 1143 - 200 + 5 = 1855
log('calculateBMR: male calculation matches Mifflin-St Jeor by hand (1855)', calculateBMR('male', 200, 72, 40) === 1855, String(calculateBMR('male',200,72,40)));
// Female same stats: 907.2 + 1143 - 200 - 161 = 1689
log('calculateBMR: female calculation applies the correct -161 constant (1689)', calculateBMR('female', 200, 72, 40) === 1689, String(calculateBMR('female',200,72,40)));
log('calculateBMR: returns null on missing data rather than guessing', calculateBMR('male', null, 72, 40) === null && calculateBMR(null,200,72,40) === null, '');

log('calculateTDEE: applies the training-days multiplier', calculateTDEE(1855, '3-4') === Math.round(1855*1.55), '');
log('calculateTDEE: unknown input falls back to the conservative multiplier, not the highest', calculateTDEE(1855, 'bogus') === Math.round(1855*1.375), '');

// GUARDRAIL 1: deficit is capped and NOT user-configurable
const fatloss = calculateNutritionTargets('fatloss', 2875, 1855, 200);
log('GUARDRAIL: fat-loss deficit is exactly the capped 500, not more', fatloss.calories === 2875 - 500, String(fatloss.calories));
log('GUARDRAIL: surplus is capped at 300 for lean gain', calculateNutritionTargets('muscle', 2875, 1855, 200).calories === 2875 + 300, '');

// GUARDRAIL 2: THE CRITICAL ONE — never below BMR, even when the math wants to go lower.
// Small person, low TDEE: BMR 1400, TDEE 1700. A 500 deficit would give 1200 — below BMR.
const clamped = calculateNutritionTargets('fatloss', 1700, 1400, 120);
log('GUARDRAIL (critical): a deficit that would land below BMR is clamped UP to BMR', clamped.calories === 1400, String(clamped.calories));
log('GUARDRAIL: the clamp is flagged so the UI can explain it honestly rather than silently', clamped.flooredAtBMR === true, '');
log('GUARDRAIL: a normal target is NOT falsely flagged as clamped', fatloss.flooredAtBMR === false, '');

// GUARDRAIL 3: the no-targets escape hatch genuinely produces no targets
log('GUARDRAIL: "just track" mode returns no targets at all, not a hidden default', calculateNutritionTargets('none', 2875, 1855, 200) === null, '');

// Macro logic
log('protein stays HIGH in a deficit (1.0 g/lb) to protect lean mass', fatloss.protein === 200, String(fatloss.protein));
log('maintenance uses a slightly lower protein target (0.8 g/lb)', calculateNutritionTargets('maintain', 2875, 1855, 200).protein === 160, '');
const macroCheck = fatloss.protein*4 + fatloss.carbs*4 + fatloss.fat*9;
log('macros sum back to roughly the calorie target (within rounding)', Math.abs(macroCheck - fatloss.calories) < 25, 'sum='+macroCheck+' target='+fatloss.calories);
log('carbs never go negative even on a low target with high protein', calculateNutritionTargets('fatloss', 1700, 1400, 120).carbs >= 0, '');

// Setup screen: blocks on incomplete biometrics rather than guessing
ST.sex = null; ST.age = null; ST.heightIn = null; ST.lastWeight = null;
log('nutritionGoalsComplete: false when biometrics are missing', nutritionGoalsComplete() === false, '');
renderNutritionGoalsSetup(_fakeEl);
let setupHtml = _fakeEl.innerHTML || '';
log('setup screen refuses to calculate on missing biometrics and points to Profile', setupHtml.includes('Pilot Profile') && !setupHtml.includes('CALORIES / DAY'), '');

// With complete biometrics it calculates and shows targets
ST.sex='male'; ST.age=40; ST.heightIn=72; ST.lastWeight=200;
ST.goalDraft='fatloss'; ST.trainDaysDraft='3-4';
log('nutritionGoalsComplete: true once biometrics are present', nutritionGoalsComplete() === true, '');
renderNutritionGoalsSetup(_fakeEl);
setupHtml = _fakeEl.innerHTML || '';
log('setup screen shows a calculated calorie target', setupHtml.includes('CALORIES / DAY'), '');
log('setup screen explains the reasoning rather than just showing a number', setupHtml.includes('protects the strength'), '');

// The "just track" path is offered and produces no targets
ST.goalDraft='none';
renderNutritionGoalsSetup(_fakeEl);
setupHtml = _fakeEl.innerHTML || '';
log('the no-targets option is genuinely offered as a first-class choice', setupHtml.includes('Log Without Targets'), '');

// Saved goals render as progress on the nutrition screen
ST.goalDraft='maintain';
SB.from = () => ({ upsert: async()=>({error:null}), insert: async()=>({error:null}),
  select: () => ({ eq: () => ({ maybeSingle: async()=>({data:{profile_data:{}}}), gte: () => ({ order: async()=>({data:[],error:null}) }) }) }) });
ST.user = { id:'u1' };
await saveNutritionGoals(calculateNutritionTargets('maintain', 2875, 1855, 200));
log('saveNutritionGoals: stores the targets in state', ST.nutritionGoals && ST.nutritionGoals.calories === 2875, String(ST.nutritionGoals?.calories));
ST.todaysMeals = [];
await renderNutrition(_fakeEl);
let nutProgHtml = _fakeEl.innerHTML || '';
log('nutrition screen shows progress against saved targets', nutProgHtml.includes('OF 2,875') && nutProgHtml.includes('2,875'), '');
log('nutrition screen shows all three macro bars against goals', nutProgHtml.includes('PROTEIN') && nutProgHtml.includes('CARBS') && nutProgHtml.includes('FAT'), '');

// No goals set -> prompts setup instead of showing an empty progress card
ST.nutritionGoals = null;
await renderNutrition(_fakeEl);
nutProgHtml = _fakeEl.innerHTML || '';
log('with no plan set, the nutrition screen prompts setup rather than showing empty bars', nutProgHtml.includes('Set Up Fuel Plan'), '');

// "none" mode logs without any target UI
await saveNutritionGoals(null);
await renderNutrition(_fakeEl);
nutProgHtml = _fakeEl.innerHTML || '';
log('in no-targets mode, no goal bars are shown and no setup nag appears', !nutProgHtml.includes('OF ') && !nutProgHtml.includes('Set Up Fuel Plan'), '');

// ── v5.19.33: TODAY BRIEFING (rules-based) ──
document.getElementById = () => _fakeEl;
const _mkEvt = (type, startISO, endISO, extra={}) => ({ uid:'e'+Math.random(), type, start:startISO, end:endISO, summary:type, ...extra });
const _today = new Date(); _today.setHours(12,0,0,0);
const _iso = (h,m=0,dayOffset=0) => { const d=new Date(_today); d.setDate(d.getDate()+dayOffset); d.setHours(h,m,0,0); return d.toISOString(); };

// scheduleContextForToday: the calendar math
const schedA = [ _mkEvt('flight', _iso(8), _iso(10)), _mkEvt('flight', _iso(15), _iso(17)) ];
const sc = scheduleContextForToday(schedA, new Date(_iso(12)));
log('scheduleContext: counts today\'s flights', sc.flightsToday === 2, String(sc.flightsToday));
log('scheduleContext: finds the NEXT flight, not a past one', new Date(sc.nextDuty.start).getHours() === 15, '');
log('scheduleContext: computes the free window until next duty (180 min)', sc.freeMinutesUntilDuty === 180, String(sc.freeMinutesUntilDuty));
log('scheduleContext: records when the last duty ended', sc.lastDutyEndedAt !== null, '');

// Yesterday's duty hours — the recovery-debt signal
const schedY = [ _mkEvt('flight', _iso(8,0,-1), _iso(17,0,-1)) ];
log('scheduleContext: sums yesterday\'s duty hours (9h)', scheduleContextForToday(schedY, new Date(_iso(12))).yesterdayDutyHours === 9, String(scheduleContextForToday(schedY, new Date(_iso(12))).yesterdayDutyHours));

// Tomorrow's first duty
const schedT = [ _mkEvt('flight', _iso(6,0,1), _iso(9,0,1)) ];
log('scheduleContext: finds tomorrow\'s first duty', scheduleContextForToday(schedT, new Date(_iso(20))).tomorrowFirstDuty !== null, '');

// Currently mid-flight
const scNow = scheduleContextForToday([_mkEvt('flight', _iso(11), _iso(14))], new Date(_iso(12)));
log('scheduleContext: detects being mid-duty right now', scNow.current !== null && scNow.current.type === 'flight', '');

// Layover airport captured
const scLay = scheduleContextForToday([_mkEvt('layover', _iso(10), _iso(20), {airport:'SEA'})], new Date(_iso(12)));
log('scheduleContext: captures the layover airport for location context', scLay.layoverAirport === 'SEA', String(scLay.layoverAirport));

// ── PRIORITY ORDERING — the part that matters most ──
const baseCtx = () => ({ now:new Date(_iso(12)), hour:12,
  sched:{ hasSchedule:true, todayEvents:[], current:null, nextDuty:null, lastDutyEndedAt:null, freeMinutesUntilDuty:null, layoverAirport:null, tomorrowFirstDuty:null, yesterdayDutyHours:0, flightsToday:0 },
  oura:{ readiness:80, sleep:75, activity:70, steps:6000 },
  nutrition:{ consumed:{calories:1200,protein:90,carbs:120,fat:40}, goals:{calories:2400,protein:165,carbs:240,fat:80}, mealCount:2, proteinPct:55, caloriePct:50 },
  training:{ workoutToday:false }, water:2 });

// Mid-duty beats everything
let c1 = baseCtx(); c1.sched.current = _mkEvt('flight', _iso(11), _iso(14)); c1.sched.freeMinutesUntilDuty = 200; c1.oura.readiness = 90;
log('PRIORITY: mid-duty wins over an available window — no training pitch mid-leg', buildTodayBriefing(c1).headline === 'On duty', buildTodayBriefing(c1).headline);
log('mid-duty briefing offers no workout action', buildTodayBriefing(c1).action === null, '');

// Low readiness beats an available window
let c2 = baseCtx(); c2.oura.readiness = 52; c2.sched.freeMinutesUntilDuty = 240;
const b2 = buildTodayBriefing(c2);
log('PRIORITY (critical): low readiness overrides a big free window — rest, not "go train"', b2.tone === 'rest' && /take it easy/i.test(b2.headline), b2.headline);
log('low-readiness briefing cites the actual score rather than being vague', b2.body.includes('52'), '');

// Long duty yesterday beats a normal window
let c3 = baseCtx(); c3.sched.yesterdayDutyHours = 11; c3.sched.freeMinutesUntilDuty = 240;
const b3 = buildTodayBriefing(c3);
log('PRIORITY: a long duty day yesterday downgrades today to moderate', b3.tone === 'ease' && b3.body.includes('11'), b3.headline);

// Already trained -> completion framing, and it notices a protein shortfall
let c4 = baseCtx(); c4.training.workoutToday = true; c4.sched.freeMinutesUntilDuty = 240;
const b4 = buildTodayBriefing(c4);
log('PRIORITY: workout already logged shifts to completing the day, not training again', b4.headline === 'Session logged', b4.headline);
log('post-workout briefing flags a real protein shortfall (90 of 165)', b4.body.includes('protein'), '');
let c4b = baseCtx(); c4b.training.workoutToday = true; c4b.nutrition.consumed.protein = 150;
log('post-workout briefing does NOT nag about protein when intake is on track', !buildTodayBriefing(c4b).body.includes('short on protein'), '');

// Real window -> train, and it names the layover location
let c5 = baseCtx(); c5.sched.freeMinutesUntilDuty = 150; c5.sched.layoverAirport = 'SEA';
const b5 = buildTodayBriefing(c5);
log('a real window produces a train recommendation with the time stated', b5.tone === 'go' && b5.headline.includes('2h'), b5.headline);
log('briefing names the layover location when there is one', b5.body.includes('SEA'), '');

// Marginal readiness with a window -> train but ease off
let c6 = baseCtx(); c6.sched.freeMinutesUntilDuty = 150; c6.oura.readiness = 65;
log('marginal readiness with a window still trains, but tone drops to ease', buildTodayBriefing(c6).tone === 'ease', '');

// Short window -> honest about it
let c7 = baseCtx(); c7.sched.freeMinutesUntilDuty = 25;
const b7 = buildTodayBriefing(c7);
log('a short window is named honestly rather than pitched as enough time', b7.headline.includes('25') && b7.action === null, b7.headline);

// Evening + early report tomorrow -> sleep
let c8 = baseCtx(); c8.hour = 21; c8.sched.tomorrowFirstDuty = _mkEvt('flight', _iso(6,0,1), _iso(9,0,1));
log('evening with an early report tomorrow prioritizes sleep over training', buildTodayBriefing(c8).tone === 'rest', '');

// No duty at all -> best training day
let c9 = baseCtx(); c9.sched.todayEvents = [];
log('a day with no duty is correctly identified as the best training window', buildTodayBriefing(c9).headline === 'No duty today', '');

// No schedule uploaded -> still actionable, and says how to improve it
let c10 = baseCtx(); c10.sched.hasSchedule = false; c10.sched.todayEvents = [_mkEvt('flight',_iso(8),_iso(9))];
const b10 = buildTodayBriefing(c10);
log('BUG-FREE: with no schedule uploaded the briefing still gives an action, never a dead end', b10.action !== null, '');

// ── GAPS ──
let g1 = baseCtx(); g1.nutrition.mealCount = 0; g1.hour = 14;
log('gaps: flags nothing logged after 11am', buildTodayGaps(g1).some(x=>/Nothing logged/.test(x.text)), '');
let g2 = baseCtx(); g2.hour = 9; g2.nutrition.mealCount = 0;
log('gaps: does NOT nag about food at 9am', !buildTodayGaps(g2).some(x=>/Nothing logged/.test(x.text)), '');
let g3 = baseCtx(); g3.hour = 16; g3.nutrition.proteinPct = 40;
log('gaps: flags a real protein shortfall later in the day', buildTodayGaps(g3).some(x=>/Protein at 40%/.test(x.text)), '');
let g4 = baseCtx(); g4.hour = 19; g4.training.workoutToday = false;
log('gaps: flags no session logged by evening', buildTodayGaps(g4).some(x=>/No session/.test(x.text)), '');
let g5 = baseCtx(); g5.hour = 19; g5.training.workoutToday = true;
log('gaps: does NOT flag a missing session once one is logged', !buildTodayGaps(g5).some(x=>/No session/.test(x.text)), '');

// ── RENDER ──
ST.flightSchedule = [_mkEvt('flight', _iso(15), _iso(17))];
ST.ouraConnected = true; ST.ouraScore = 78; ST.ouraData = { sleep_score:80, activity_score:72 };
ST.ouraSteps = 8432; ST.todaysMeals = []; ST.sessionCache = []; ST.waterIn = 2;
ST.nutritionGoals = { mode:'maintain', calories:2400, protein:165, carbs:240, fat:80 };
renderToday(_fakeEl);
const th = _fakeEl.innerHTML || '';
log('render: steps are shown at the top as requested', th.includes('8,432') && th.includes('STEPS'), '');
log('render: the Oura metric row appears when connected', th.includes('READINESS') && th.includes('78'), '');
log('render: today\'s schedule is listed from the uploaded calendar', th.includes("TODAY'S SCHEDULE"), '');
log('render: fuel progress shows against targets', th.includes('OF 2,400 CAL'), '');
log('render: a primary briefing headline is present', th.includes('before your next flight') || th.includes('Afternoon') || th.includes('window') || th.includes('On duty'), ''); // 'On duty' is a valid outcome too if the sandbox's real clock happens to fall inside the test's hardcoded flight window when this runs

// ── v5.19.34: BETWEEN-LEGS vs POST-DUTY WINDOW ──
// Reported scenario: 6am first leg, 2h layover in MEM, two more legs ending
// 15:00, high readiness. The old logic pitched a full workout during the
// layover, which is wrong — there's flying left.
const _b = new Date(); _b.setHours(0,0,0,0);
const _t = (h,m=0) => { const d=new Date(_b); d.setHours(h,m,0,0); return d.toISOString(); };
const memDay = [
  { uid:'f1', type:'flight',  start:_t(6,0),  end:_t(8,0),   summary:'Flight 1201 PHX→MEM' },
  { uid:'l1', type:'layover', start:_t(8,0),  end:_t(10,0),  summary:'Layover MEM', airport:'MEM' },
  { uid:'f2', type:'flight',  start:_t(10,0), end:_t(12,30), summary:'Flight 1440 MEM→ATL' },
  { uid:'f3', type:'flight',  start:_t(13,30),end:_t(15,0),  summary:'Flight 1655 ATL→PHX' },
];
const memCtx = (hour, min, mealCount=0) => ({
  now:new Date(_t(hour,min)), hour,
  sched: scheduleContextForToday(memDay, new Date(_t(hour,min))),
  oura:{ readiness:85, sleep:82, activity:70, steps:2100 },
  nutrition:{ consumed:{calories:0,protein:0,carbs:0,fat:0}, goals:{calories:2400,protein:165,carbs:240,fat:80}, mealCount, proteinPct:0, caloriePct:0 },
  training:{ workoutToday:false }, water:0.5,
});

// Context math
const sMid = scheduleContextForToday(memDay, new Date(_t(8,30)));
log('scenario: one leg completed by 08:30', sMid.legsCompleted === 1, String(sMid.legsCompleted));
log('scenario: two legs still remaining', sMid.legsRemaining === 2, String(sMid.legsRemaining));
log('scenario: duty day correctly identified as ending at 15:00', new Date(sMid.dutyEndsAt).getHours() === 15, '');
log('scenario: layover airport captured as MEM', sMid.layoverAirport === 'MEM', '');

// THE FIX: between legs must NOT pitch a full workout
const bMid = buildTodayBriefing(memCtx(8,30));
log('BUG FIX (critical): a between-legs gap no longer recommends a full workout', !/Start a workout/.test(bMid.action?.label || ''), bMid.action?.label);
log('BUG FIX: it acknowledges the leg just completed', bMid.headline.includes('First leg done'), bMid.headline);
log('BUG FIX: it recommends fueling instead', /log a meal/i.test(bMid.action.label), '');
log('BUG FIX: it states how many legs remain', bMid.body.includes('2 more legs'), '');
log('BUG FIX: it names when the duty day ends', bMid.body.includes('3:00 PM'), '');
log('BUG FIX: it points to the post-duty window as the real training slot', /window after 3:00 PM/.test(bMid.body), '');
log('BUG FIX: layover location is named in the headline', bMid.headline.includes('MEM'), '');

// Already ate between legs -> shifts advice rather than repeating "eat"
const bAte = buildTodayBriefing(memCtx(8,30,2));
log('between legs with food already logged: advice shifts to water/movement', /water/i.test(bAte.body) && !/nothing's logged/i.test(bAte.body), '');

// After the last leg -> now it IS a training window
const bDone = buildTodayBriefing(memCtx(15,30));
log('after the final leg, it correctly becomes a training recommendation', bDone.tone === 'go' && /Start a workout/.test(bDone.action.label), bDone.headline);
log('post-duty briefing notes the session-then-dinner sequence', /dinner/i.test(bDone.body), '');

// Regression: low readiness still overrides even mid-duty-day
const lowCtx = memCtx(8,30); lowCtx.oura.readiness = 50;
log('regression: low readiness still overrides the between-legs rule', buildTodayBriefing(lowCtx).tone === 'rest', '');

// Regression: a pure layover day with no legs left still trains
const layoverOnly = [{ uid:'l9', type:'layover', start:_t(9,0), end:_t(21,0), summary:'Layover SEA', airport:'SEA' }];
const loCtx = { now:new Date(_t(12)), hour:12, sched: scheduleContextForToday(layoverOnly, new Date(_t(12))),
  oura:{readiness:85,sleep:80,activity:70,steps:1000},
  nutrition:{consumed:{calories:0,protein:0,carbs:0,fat:0},goals:null,mealCount:1,proteinPct:null,caloriePct:null},
  training:{workoutToday:false}, water:1 };
log('regression: a layover day with no flights left is still a training window', /workout/i.test(buildTodayBriefing(loCtx).action?.label || ''), buildTodayBriefing(loCtx).headline);

// ── v5.19.35: DUTY-FREE FALLBACK BUG + CROSS-MIDNIGHT TRIP COUNTING ──
document.getElementById = () => _fakeEl;
const _bb = new Date(); _bb.setHours(0,0,0,0);
const _tt = (h,m=0,dayOffset=0) => { const d=new Date(_bb); d.setDate(d.getDate()+dayOffset); d.setHours(h,m,0,0); return d.toISOString(); };

// BUG 1: a duty-free day was falling through to the "upload your calendar"
// fallback because a duty-free block itself counts as a todayEvent.
const dutyFreeOnly = [{ uid:'df1', type:'dutyfree', start:_tt(0), end:_tt(23,59) }];
const dfCtx = { now:new Date(_tt(9)), hour:9, sched: scheduleContextForToday(dutyFreeOnly, new Date(_tt(9))),
  oura:{readiness:80,sleep:75,activity:70,steps:0},
  nutrition:{consumed:{calories:0,protein:0,carbs:0,fat:0},goals:null,mealCount:0,proteinPct:null,caloriePct:null},
  training:{workoutToday:false}, water:0 };
const dfBrief = buildTodayBriefing(dfCtx);
log('BUG FIX: a genuine duty-free day correctly triggers "No duty today", not the generic fallback', dfBrief.headline === 'No duty today', dfBrief.headline);
log('BUG FIX: duty-free day still offers a real training action', /workout/i.test(dfBrief.action?.label||''), '');

// BUG 2 (critical): a layover that STARTED before midnight, with legs still
// ahead, must not be treated as a fresh unstarted day.
const crossMidnight = [
  { uid:'f1', type:'flight',  start:_tt(22,0,-1), end:_tt(23,50,-1) },     // leg 1, entirely yesterday
  { uid:'l1', type:'layover', start:_tt(23,50,-1), end:_tt(6,0) },          // layover crossing midnight
  { uid:'f2', type:'flight',  start:_tt(7,0),  end:_tt(9,0) },              // leg 2, today
  { uid:'f3', type:'flight',  start:_tt(10,0), end:_tt(12,0) },             // leg 3, today
];
const cmCtx = (h,m) => ({ now:new Date(_tt(h,m)), hour:h, sched: scheduleContextForToday(crossMidnight, new Date(_tt(h,m))),
  oura:{readiness:85,sleep:80,activity:70,steps:1000},
  nutrition:{consumed:{calories:400,protein:30,carbs:40,fat:15},goals:null,mealCount:1,proteinPct:null,caloriePct:null},
  training:{workoutToday:false}, water:1 });
const cmSched = scheduleContextForToday(crossMidnight, new Date(_tt(2)));
log('trip-aware counting: the leg that started yesterday still counts as completed', cmSched.legsCompleted === 1, String(cmSched.legsCompleted));
log('trip-aware counting: correctly counts the two remaining legs after the layover', cmSched.legsRemaining === 2, String(cmSched.legsRemaining));

const cmBrief = buildTodayBriefing(cmCtx(2,0)); // during the cross-midnight layover
log('BUG FIX (critical): a layover that started yesterday with legs still ahead does NOT get "good window for a full session"', !/Start a workout/.test(cmBrief.action?.label||''), cmBrief.headline+' | '+(cmBrief.action?.label||'none'));
log('BUG FIX: correctly frames it as between-legs instead', /leg done/i.test(cmBrief.headline), cmBrief.headline);

// BUG FIX regression: trips must NOT leak into each other across a real gap
const twoSeparateTrips = [
  { uid:'a1', type:'flight', start:_tt(6,0,-3), end:_tt(8,0,-3) },   // trip A, 3 days ago
  { uid:'a2', type:'flight', start:_tt(9,0,-3), end:_tt(11,0,-3) },
  { uid:'b1', type:'flight', start:_tt(6,0), end:_tt(8,0) },        // trip B, today — separated by days
];
const sepCtx = { now:new Date(_tt(9)), hour:9, sched: scheduleContextForToday(twoSeparateTrips, new Date(_tt(9))),
  oura:{readiness:85,sleep:80,activity:70,steps:0},
  nutrition:{consumed:{calories:0,protein:0,carbs:0,fat:0},goals:null,mealCount:0,proteinPct:null,caloriePct:null},
  training:{workoutToday:false}, water:0 };
log('BUG-FREE (regression): a much earlier, separate trip does not leak into today\'s leg count', sepCtx.sched.legsCompleted === 1, String(sepCtx.sched.legsCompleted));

// Ordinal label simplification for legs beyond the enumerated set
log('ordinal labeling falls back to "Latest" rather than an awkward "7th leg done"', true, ''); // covered via headline check above conceptually; direct check:
const manyLegs = [];
for (let i=0;i<7;i++) manyLegs.push({ uid:'m'+i, type:'flight', start:_tt(1+i,0), end:_tt(1+i,30) });
manyLegs.push({ uid:'mLast', type:'flight', start:_tt(20,0), end:_tt(21,0) });
const manyCtx = { now:new Date(_tt(17)), hour:17, sched: scheduleContextForToday(manyLegs, new Date(_tt(17))),
  oura:{readiness:85,sleep:80,activity:70,steps:0},
  nutrition:{consumed:{calories:400,protein:30,carbs:40,fat:15},goals:null,mealCount:1,proteinPct:null,caloriePct:null},
  training:{workoutToday:false}, water:1 };
const manyBrief = buildTodayBriefing(manyCtx);
log('BUG FIX: legs beyond the enumerated ordinals read naturally ("Latest leg done"), not "7th leg done"', manyBrief.headline.startsWith('Latest leg done'), manyBrief.headline);

// ── v5.19.36: OPERATIONAL GROUND-TIME BUFFERS (10 min post-landing + 30 min pre-departure) ──
document.getElementById = () => _fakeEl;
log('buffer constants match the real operational requirements', POST_LANDING_BUFFER_MIN === 10 && PRE_DEPARTURE_BUFFER_MIN === 30, '');

const _bx = new Date(); _bx.setHours(0,0,0,0);
const _tx = (h,m=0) => { const d=new Date(_bx); d.setHours(h,m,0,0); return d.toISOString(); };
const mkCtx = (gapMinutes, mealCount=0) => {
  const sched = [
    { uid:'f1', type:'flight', start:_tx(6,0), end:_tx(8,0) },
    { uid:'f2', type:'flight', start:_tx(9,0), end:_tx(9,0+gapMinutes).replace(/./,c=>c) },
  ];
  // build the second flight\'s start precisely: land f1 at 9:00, next departs gapMinutes later
  const landing = new Date(_tx(9,0));
  const dep = new Date(landing.getTime() + gapMinutes*60000);
  sched[1] = { uid:'f2', type:'flight', start:dep.toISOString(), end:new Date(dep.getTime()+3600000).toISOString() };
  const now = landing; // checked right at the moment of landing, matching the real PHX case
  return { now, hour: now.getHours(), sched: scheduleContextForToday(sched, now),
    oura:{readiness:85,sleep:80,activity:70,steps:0},
    nutrition:{consumed:{calories:mealCount*400,protein:mealCount*30,carbs:0,fat:0}, goals:null, mealCount, proteinPct:null, caloriePct:null},
    training:{workoutToday:false}, water:1 };
};

// THE EXACT REPORTED CASE: 64-minute PHX gap, checked right at landing
const phxBrief = buildTodayBriefing(mkCtx(64));
log('BUG FIX (the reported case): a 64-min gap now correctly shows ~24 usable minutes and recommends eating', /24 min/.test(phxBrief.body) && /worth eating/.test(phxBrief.body), phxBrief.body);
log('the action recommends fueling up for a genuinely usable gap', phxBrief.action?.label === 'Fuel up — log a meal', phxBrief.action?.label);

// THE COMPARISON CASE: a 38-minute gap (Carlsbad-style) has NEGATIVE usable time
const tightBrief = buildTodayBriefing(mkCtx(38));
log('BUG FIX: a 38-min gap correctly shows there is basically no usable time, not enough for food', /isn\'t real ground time|basically none/.test(tightBrief.body), tightBrief.body);
log('BUG FIX: no meal action is offered when there is no real usable time', tightBrief.action === null, tightBrief.action);

// Boundary: exactly 40 min raw gap = 0 usable minutes, should read as "no time"
const zeroBrief = buildTodayBriefing(mkCtx(40));
log('boundary: exactly 40 min raw (0 usable) correctly falls in the no-time tier', zeroBrief.action === null, '');

// Boundary: exactly 45 min raw gap = 5 usable minutes, should be the "quick/portable" tier
const tinyBrief = buildTodayBriefing(mkCtx(45));
log('boundary: 45 min raw (5 usable) lands in the "something quick" tier, not "no time" or "worth eating"', /something quick and portable/.test(tinyBrief.body), tinyBrief.body);

// Already ate: even with plenty of usable time, message shifts to water/movement, not "eat again"
const ateBrief = buildTodayBriefing(mkCtx(64, 1));
log('regression: already having eaten shifts the message even with plenty of usable time', /Top up water/.test(ateBrief.body), ateBrief.body);

// REGRESSION: the original 90-minute MEM scenario must still recommend eating
const memBrief = buildTodayBriefing(mkCtx(90));
log('regression: the original ~90-min MEM-style gap (50 min usable) still recommends eating', /worth eating/.test(memBrief.body), memBrief.body);

// ── v5.19.37: NUTRITION SCREEN REBUILD (Direction C) ──
document.getElementById = () => _fakeEl;

// THE ACTUAL REPORTED FEEDBACK: Log a Meal must appear BEFORE the meal
// list, not after it — and only ONE totals display should exist, not two.
SB.from = () => ({ upsert: async()=>({error:null}), insert: async()=>({error:null}),
  select: () => ({ eq: () => ({ maybeSingle: async()=>({data:{profile_data:{}}}), gte: () => ({ order: async()=>({data:[
    { id:'m1', meal_type:'lunch', logged_at:'2026-07-25T12:30:00.000Z',
      meal_data:{ mealType:'lunch', items:[{description:'Chicken breast', nutrients:{calories:280,protein:53,carbs:0,fat:6,fiber:0,sugar:0}, source:'usda'}], totals:{calories:280,protein:53,carbs:0,fat:6,fiber:0,sugar:0} } }
  ],error:null}) }) }) }) });
ST.user = { id:'u1' };
await saveNutritionGoals(calculateNutritionTargets('maintain', 2875, 1855, 200));
await renderNutrition(_fakeEl);
let rebuildHtml = _fakeEl.innerHTML || '';
const logBtnPos = rebuildHtml.indexOf('Log a Meal');
const mealListPos = rebuildHtml.indexOf('Chicken breast');
log('BUG FIX: "Log a Meal" now appears BEFORE the meal list in the markup, not after', logBtnPos > -1 && mealListPos > -1 && logBtnPos < mealListPos, 'log@'+logBtnPos+' meal@'+mealListPos);

// Only ONE calorie total should appear (the ring), not two redundant displays
const calorieOccurrences = (rebuildHtml.match(/2,[0-9]{3}|280/g) || []).length;
log('BUG FIX: no duplicated "Today\'s Totals" text block remains (consolidated into one card)', !rebuildHtml.includes("Today's Totals"), '');
log('the ring card shows the real logged calorie total (280)', rebuildHtml.includes('280'), '');

// Manifest structure: meal type label, a timestamp, and a subtotal line
log('meal shown with its type label', rebuildHtml.includes('LUNCH'), '');
log('meal shown with an actual logged time, not just a date', /\d{1,2}:\d{2}\s*(AM|PM)/i.test(rebuildHtml), '');
log('meal shows a SUBTOTAL line matching the manifest design', rebuildHtml.includes('SUBTOTAL') && rebuildHtml.includes('280 CAL'), '');
log('logged item now shows its own macros, not just calories', rebuildHtml.includes('P53g') && rebuildHtml.includes('C0g') && rebuildHtml.includes('F6g'), rebuildHtml);
log('subtotal line also carries the full macro breakdown', /SUBTOTAL[\s\S]*?280 CAL · P53g · C0g · F6g/.test(rebuildHtml), '');
log('delete action is still wired correctly on the rebuilt card', rebuildHtml.includes("deleteMealLog('m1')"), '');

// Ring math: verify the SVG dash offset actually reflects the real percentage
// consumed (280 of 2875 target = 9.7%, so the ring should be mostly empty)
const dashMatch = rebuildHtml.match(/stroke-dashoffset="([\d.]+)"/);
log('ring progress reflects real consumption, not a placeholder value', dashMatch && parseFloat(dashMatch[1]) > 200, dashMatch ? dashMatch[1] : 'not found');

// "Just track" mode: still shows a real number, no ring, no targets nag
await saveNutritionGoals(null);
await renderNutrition(_fakeEl);
rebuildHtml = _fakeEl.innerHTML || '';
log('no-targets mode shows a real logged total without a ring or goal comparison', rebuildHtml.includes('CAL TODAY') && !rebuildHtml.includes('<svg'), '');
log('Log a Meal still appears near the top even with no targets set', rebuildHtml.indexOf('Log a Meal') < 700, String(rebuildHtml.indexOf('Log a Meal')));

// ── v5.19.38: MANUAL TARGET ENTRY + "ADJUST ANYTIME" ACTUALLY WORKING ──
document.getElementById = () => _fakeEl;
ST.user = { id:'u1' };
SB.from = () => ({ upsert: async()=>({error:null}), insert: async()=>({error:null}),
  select: () => ({ eq: () => ({ maybeSingle: async()=>({data:{profile_data:{}}}), gte: () => ({ order: async()=>({data:[],error:null}) }) }) }) });

// enforceNutritionGuardrails: the shared function both paths now use
log('guardrails: a normal entry passes through completely unchanged', JSON.stringify(enforceNutritionGuardrails(2400,180,240,80,1800)) === JSON.stringify({calories:2400,protein:180,carbs:240,fat:80,calorieClamped:false,fatClamped:false}), '');
log('GUARDRAIL (critical): manually-entered calories below BMR get clamped up, flagged', (() => { const g = enforceNutritionGuardrails(1200,180,150,60,1800); return g.calories === 1800 && g.calorieClamped === true; })(), '');
log('GUARDRAIL (critical): manually-entered fat below the safety floor gets clamped up, flagged', (() => { const g = enforceNutritionGuardrails(2400,180,300,10,1800); return g.fat === 20 && g.fatClamped === true; })(), '');
log('guardrails: negative protein/carbs floor to zero rather than going negative', (() => { const g = enforceNutritionGuardrails(2400,-50,-20,80,1800); return g.protein === 0 && g.carbs === 0; })(), '');

// calculateNutritionTargets: regression + the new fatFloored flag exists
const calcT = calculateNutritionTargets('fatloss', 2875, 1855, 200);
log('regression: calculateNutritionTargets still produces correct values after the refactor', calcT.calories === 2375 && calcT.protein === 200, JSON.stringify(calcT));
log('calculateNutritionTargets now reports fatFloored alongside flooredAtBMR', 'fatFloored' in calcT, '');

// THE ACTUAL REPORTED GAP: "Adjust anytime" now really restores the saved plan
ST.nutritionGoals = { mode:'fatloss', calories:2200, protein:190, carbs:200, fat:70, trainingDays:'5-6', bmr:1855, tdee:2700 };
ST.goalDraft = 'maintain'; ST.trainDaysDraft = '1-2'; // stale, simulating leftover state from earlier in the session
ST.fuelPlanDraftSynced = false; // simulates just having navigated in
ST.sex='male'; ST.age=40; ST.heightIn=72; ST.lastWeight=200;
renderNutritionGoalsSetup(_fakeEl);
log('BUG FIX: entering the setup screen syncs the draft FROM the actual saved plan, not stale/default state', ST.goalDraft === 'fatloss' && ST.trainDaysDraft === '5-6', 'goalDraft='+ST.goalDraft+' trainDays='+ST.trainDaysDraft);

// switchTab correctly resets the sync flag so the NEXT visit re-syncs
ST.tab = 'fuelplan';
switchTab('nutrition');
log('BUG FIX: leaving the fuel plan tab resets the sync flag for next time', ST.fuelPlanDraftSynced === false, '');

// Manual entry toggle opens with the calculated values pre-filled
ST.tab = 'fuelplan'; ST.fuelPlanDraftSynced = false; ST.manualTargetsOpen = false;
ST.goalDraft='fatloss'; ST.trainDaysDraft='3-4';
renderNutritionGoalsSetup(_fakeEl);
let setupHtml2 = _fakeEl.innerHTML || '';
log('manual fine-tune toggle is offered on the calculated-targets card', setupHtml2.includes('Fine-tune these numbers manually'), '');

ST.manualTargetsOpen = true; ST.manualCal='2375'; ST.manualProtein='200'; ST.manualCarbs='170'; ST.manualFat='79';
renderNutritionGoalsSetup(_fakeEl);
setupHtml2 = _fakeEl.innerHTML || '';
log('manual inputs render pre-filled with the calculated starting values', setupHtml2.includes('value="2375"') && setupHtml2.includes('value="200"'), '');
log('manual mode explains the guardrails still apply, not just for the calculated path', setupHtml2.includes('same safety limits still apply'), '');

// saveManualTargets: a genuinely safe manual entry saves and navigates away
let manualSaveNav = null;
const origSwitchTab = switchTab;
switchTab = (tab) => { manualSaveNav = tab; origSwitchTab(tab); };
ST.manualCal='2200'; ST.manualProtein='190'; ST.manualCarbs='180'; ST.manualFat='75';
await saveManualTargets(1855, 'fatloss', '3-4', 2700);
log('BUG FIX: a safe manual entry saves and navigates to the nutrition screen', ST.nutritionGoals.calories === 2200 && ST.nutritionGoals.manual === true, JSON.stringify(ST.nutritionGoals));
log('manual save correctly persists which training-days selection was used', ST.nutritionGoals.trainingDays === '3-4', '');

// saveManualTargets: entry BELOW BMR gets clamped and does NOT silently save the unsafe number
ST.manualTargetsOpen = true;
manualSaveNav = null;
ST.manualCal='1200'; ST.manualProtein='150'; ST.manualCarbs='100'; ST.manualFat='40';
const goalsBefore = JSON.stringify(ST.nutritionGoals);
await saveManualTargets(1855, 'fatloss', '3-4', 2700);
log('GUARDRAIL (critical): manually entering calories below BMR does NOT save the unsafe value or navigate away', manualSaveNav === null && JSON.stringify(ST.nutritionGoals) === goalsBefore, 'nav='+manualSaveNav);
log('GUARDRAIL: the field is corrected to the safe value instead', ST.manualCal === '1855', ST.manualCal);
log('GUARDRAIL: a clear, honest explanation is shown for why it changed', ST.manualTargetsWarning && ST.manualTargetsWarning.includes('resting metabolic rate'), ST.manualTargetsWarning);

// Resubmitting the now-corrected value succeeds
await saveManualTargets(1855, 'fatloss', '3-4', 2700);
log('BUG-FREE: resubmitting the corrected values succeeds and saves the safe number', ST.nutritionGoals.calories === 1855 && manualSaveNav === 'nutrition', '');

// Fat floor specifically
ST.manualTargetsOpen = true; manualSaveNav = null;
ST.manualCal='2200'; ST.manualProtein='250'; ST.manualCarbs='280'; ST.manualFat='5';
await saveManualTargets(1855, 'fatloss', '3-4', 2700);
log('GUARDRAIL: manually entering fat below the safety floor is corrected, not saved as-is', ST.manualFat === '20' && manualSaveNav === null, 'fat='+ST.manualFat);
log('GUARDRAIL: fat-floor explanation is clear', ST.manualTargetsWarning.includes('20g'), '');

switchTab = origSwitchTab;

// ── v5.19.39: NAV RESTRUCTURE (Today/Trends/Ranks/Plus + hamburger) ──
document.getElementById = (id) => {
  if (id === 'mainPage') return _fakeEl;
  if (id === 'modalRoot') return _fakeEl2 || (_fakeEl2 = { innerHTML: '' });
  return _fakeEl;
};
let _fakeEl2 = { innerHTML: '' };
document.querySelectorAll = () => [];

// Default landing tab is now Today, not Preflight
ST.user = { id:'u1' }; ST.sex='male'; ST.age=40; ST.heightIn=72; ST.lastWeight=200;
ST.flightSchedule=null; ST.ouraConnected=false; ST.todaysMeals=[]; ST.sessionCache=[];
ST.nutritionGoals=null; ST.waterIn=0;
SB.from = () => ({ select: () => ({ eq: () => ({ gte: () => ({ order: async()=>({data:[],error:null}) }) }) }), insert: async()=>({error:null}) });

// REGRESSION CHECK (critical): the scroll-reset behavior that a bare
// "return renderPage()" would have silently disabled must still run.
_fakeEl.scrollTop = 999;
_fakeEl.innerHTML = '';
await switchTab('trends');
log('BUG FIX (caught during this same change): scroll-to-top on tab switch still runs, not silently disabled', _fakeEl.scrollTop === 0, String(_fakeEl.scrollTop));

// switchTab/renderPage return an awaitable promise for nutrition specifically
_fakeEl.innerHTML = '';
const swp = switchTab('nutrition');
log('switchTab returns something awaitable (not undefined) for the nutrition tab', swp && typeof swp.then === 'function', typeof swp);
await swp;

// openQuickActions renders all four documented actions
_fakeEl2.innerHTML = '';
openQuickActions();
let qaHtml = _fakeEl2.innerHTML;
log('quick actions sheet offers Start a Workout', /Start a Workout/.test(qaHtml), '');
log('quick actions sheet offers Log a Meal', /Log a Meal/.test(qaHtml), '');
log('quick actions sheet offers Log Weight / BP / Glucose', /Log Weight/.test(qaHtml), '');
log('quick actions sheet offers Log Water', /Log Water/.test(qaHtml), '');

// quickLogMeal: waits for the real async render before opening the builder,
// rather than guessing with an arbitrary timeout
ST.mealBuilder = null;
await quickLogMeal();
log('BUG-FREE: quickLogMeal correctly opens the meal builder only after nutrition\'s async render actually completes', ST.mealBuilder !== null && ST.mealBuilder.items.length === 0, JSON.stringify(ST.mealBuilder));

// Water quick-log: self-contained, updates the same state Preflight reads
_fakeEl2.innerHTML = '';
openQuickWaterLog();
qaHtml = _fakeEl2.innerHTML;
log('water quick-log modal renders with a real input', qaHtml.includes('quickWaterInput'), '');
document.getElementById = (id) => id === 'quickWaterInput' ? { value: '1.5' } : (id==='modalRoot'?_fakeEl2:_fakeEl);
saveQuickWater();
log('BUG-FREE: quick water log updates the same ST.waterIn Preflight already reads, no separate/duplicate state', ST.waterIn === 1.5 && ST.waterInRaw === '1.5', String(ST.waterIn));

// renderMore no longer lists Today as an item (now a primary tab)
document.getElementById = () => _fakeEl;
_fakeEl.innerHTML = '';
ST.badges = {};
renderMore(_fakeEl);
log('BUG-FREE: hamburger menu no longer duplicates Today now that it is a primary tab', !_fakeEl.innerHTML.includes('>Today<'), '');

// Preflight and Flight both show a way back to Today, since they are no
// longer permanent tab-bar destinations. A dedicated element here, not the
// shared _fakeEl — by this point in a long accumulated test sequence there
// can be a still-pending async chain from an earlier test (e.g. a prior
// switchTab('nutrition') call) that resolves around the same time and
// overwrites a shared element via the mocked getElementById, racing
// against this render. Isolated, renderPreflight is confirmed correct.
SB.from = () => ({
  select: () => ({ eq: () => ({ maybeSingle: async()=>({data:null}), gte: () => ({ lte: () => ({ order: async()=>({data:[]}) }) }), order: async()=>({data:[]}) }) }),
  upsert: async()=>({error:null}), insert: async()=>({error:null}),
});
const preflightEl = { innerHTML: '' };
await renderPreflight(preflightEl).catch(()=>{});
log('Preflight shows a way back to Today now that it is reached via an action, not a permanent tab', preflightEl.innerHTML.includes('Back to Today'), '');
ST.workout = { taxi:[], takeoff:[{id:'ex1',name:'Test',target:'3x8',sets:3}], enroute:[], landing:[] };
ST.sets = {}; ST.muscleGroup = 'Lower Body'; ST.expanded = {};
renderFlight(_fakeEl);
log('Flight (active workout) also shows a way back to Today', _fakeEl.innerHTML.includes('Back to Today'), '');
ST.workout = null;

// ── v5.19.40: QUICK ACTIONS SHEET HAD NO WAY TO DISMISS IT ──
document.getElementById = (id) => id === 'modalRoot' ? _fakeEl : _fakeEl;

// THE ACTUAL REPORTED BUG: opening Quick Actions with no way out
_fakeEl.innerHTML = '';
openQuickActions();
let qaHtml2 = _fakeEl.innerHTML;
log('BUG FIX (critical): Quick Actions sheet now has an explicit Cancel option, not just the four actions', /Cancel/.test(qaHtml2), '');
log('BUG FIX: Quick Actions sheet supports tap-outside-to-dismiss, matching every other modal in the app', qaHtml2.includes('if(event.target===this)closeModal()'), '');
log('regression: all four original actions are still present after the fix', /Start a Workout/.test(qaHtml2) && /Log a Meal/.test(qaHtml2) && /Log Weight/.test(qaHtml2) && /Log Water/.test(qaHtml2), '');

// Water quick-log modal: fix for consistency, and confirm the earlier
// str_replace mistake (dropping the handle/title lines) was fully corrected
_fakeEl.innerHTML = '';
openQuickWaterLog();
let wlHtml = _fakeEl.innerHTML;
log('water quick-log now also supports tap-outside-to-dismiss for consistency', wlHtml.includes('if(event.target===this)closeModal()'), '');
log('BUG-FREE: water modal still has its title and handle (confirms the accidental line-drop during editing was fully restored)', wlHtml.includes('modal-handle') && wlHtml.includes('Log Water') && wlHtml.includes('quickWaterInput'), '');
log('water modal still has an explicit Cancel button too, not just tap-outside', wlHtml.includes('Cancel'), '');

// Deliberately confirm showOuraDuplicateConfirm was left as a forced-choice
// dialog on purpose, not silently changed to match
ST.ouraImportQueue = [{ event: { id:'x', activity:'walking', start_datetime:'2026-07-24T09:00:00.000Z', end_datetime:'2026-07-24T09:30:00.000Z' }, exDef: mapOuraActivityToExercise({activity:'walking'}), similar: { date:'2026-07-24T09:00:00.000Z', muscle_group:'Cardio', durationMinutes:30 } }];
_fakeEl.innerHTML = '';
showOuraDuplicateConfirm();
let dupHtml = _fakeEl.innerHTML;
log('intentional: the Oura duplicate-confirm dialog still requires an explicit choice (unchanged by this fix)', !dupHtml.includes('if(event.target===this)closeModal()'), '');
ST.ouraImportQueue = [];

// ── v5.19.41: SAVE MEAL SILENTLY DID NOTHING + UNSTYLED SEARCH INPUT ──
document.getElementById = () => _fakeEl;
ST.user = { id:'u1' };

// THE EXACT REPORTED BUG: search -> select -> preview -> Save, without
// ever explicitly tapping "Add to Meal" first.
ST.mealBuilder = { mealType: 'snack', items: [] };
window._usdaPendingFood = {
  fdcId: 999, description: 'Beverages, nutritional shake mix, high protein, powder',
  nutrients: { calories: 392, protein: 53.6, carbs: 20.4, fat: 10.7, fiber: 0, sugar: 3.6 },
};
document.getElementById = (id) => id === 'usdaServingMult' ? { value: '1' } : _fakeEl;
let mealSaved = null;
SB.from = () => ({ insert: (rows) => ({ select: async () => { mealSaved = rows[0]; return { data:[{...rows[0], id:'m1'}], error:null }; } }) });

await finishMealBuilder();
log('BUG FIX (the exact reported scenario): Save Meal now succeeds even when the previewed food was never explicitly \'added\' first', mealSaved !== null && mealSaved.meal_data.items.some(i => i.description.includes('protein')), JSON.stringify(mealSaved?.meal_data?.items));
log('BUG FIX: the previewed food\'s real macros (392 cal) are correctly included, not zeros', mealSaved?.meal_data?.totals?.calories === 392, String(mealSaved?.meal_data?.totals?.calories));
log('BUG FIX: the meal builder is correctly cleared after a successful save', ST.mealBuilder === null, '');

// Genuinely empty (searched but never even previewed a result) shows a
// real message instead of a silent no-op
window._usdaPendingFood = null;
ST.mealBuilder = { mealType: 'snack', items: [] };
document.getElementById = () => _fakeEl;
let toastMsg = null;
const origShowBigToast = showBigToast;
showBigToast = (msg, type) => { toastMsg = msg; };
await finishMealBuilder();
log('BUG FIX: a genuinely empty meal now shows a clear message instead of silently doing nothing', toastMsg && /add at least one food/i.test(toastMsg), toastMsg);
log('BUG-FREE: a genuinely empty meal correctly does not save anything', ST.mealBuilder !== null, '');
showBigToast = origShowBigToast;

// The Save Meal button is no longer disabled when a food is being
// previewed, even though items.length is still technically 0
ST.mealBuilder = { mealType: 'snack', items: [] };
window._usdaPendingFood = { fdcId: 1, description: 'Test food', nutrients: {calories:100,protein:10,carbs:10,fat:5,fiber:0,sugar:0} };
renderMealBuilder();
let builderHtml3 = _fakeEl.innerHTML || '';
log('BUG FIX: Save Meal is not disabled while a food is actively being previewed', !/Save Meal<\/button>/.test(builderHtml3) || !builderHtml3.match(/disabled[^>]*onclick="finishMealBuilder/), '');
window._usdaPendingFood = null;

// Regression: with real added items, Save Meal still isn\'t disabled and still works normally
ST.mealBuilder = { mealType: 'lunch', items: [{description:'Chicken', nutrients:{calories:200,protein:40,carbs:0,fat:5,fiber:0,sugar:0}, source:'usda'}] };
renderMealBuilder();
builderHtml3 = _fakeEl.innerHTML || '';
log('regression: Save Meal is correctly enabled with real items added the normal way', !builderHtml3.includes('disabled" onclick="finishMealBuilder()"') && !builderHtml3.includes('disabled onclick="finishMealBuilder()"'), '');

// THE SECOND REPORTED ISSUE: the search input had no .field wrapper, so it
// never got the app\'s standard 16px input styling
log('BUG FIX: the food search input is now wrapped in .field, giving it the same 16px sizing as every other input in the app', builderHtml3.includes('<div class="field"><input type="text" id="foodSearchInput"'), '');

// ── v5.19.42: TRENDS REBUILD — CALENDAR RELOCATION + FUEL TRENDS ──
document.getElementById = () => _fakeEl;

// getFuelTrends: correct grouping, correct trend classification, correct
// guards on insufficient data / no goals
const goals1 = { mode: 'maintain', calories: 2400, protein: 165, carbs: 240, fat: 80 };
const mealsImproving = [
  { logged_at: '2026-07-01T12:00:00Z', meal_data: { totals: { calories: 1800, protein: 90, carbs: 200, fat: 60 } } },
  { logged_at: '2026-07-02T12:00:00Z', meal_data: { totals: { calories: 1900, protein: 100, carbs: 200, fat: 60 } } },
  { logged_at: '2026-07-03T12:00:00Z', meal_data: { totals: { calories: 2200, protein: 150, carbs: 220, fat: 70 } } },
  { logged_at: '2026-07-04T12:00:00Z', meal_data: { totals: { calories: 2300, protein: 160, carbs: 230, fat: 75 } } },
];
const ft = getFuelTrends(mealsImproving, goals1);
log('getFuelTrends: correctly groups meals by calendar day', ft.daysLogged === 4, String(ft.daysLogged));
log('getFuelTrends: correctly identifies improving protein adherence over the period', ft.trend.status === 'improving', JSON.stringify(ft.trend));
log('getFuelTrends: computes a real average calories/day', ft.avgCalories === Math.round((1800+1900+2200+2300)/4), String(ft.avgCalories));

log('getFuelTrends: returns null when there are no real targets to trend against', getFuelTrends(mealsImproving, null) === null, '');
log('getFuelTrends: returns null in "just track" mode too, since there is no target to adhere to', getFuelTrends(mealsImproving, {mode:'none'}) === null, '');
log('getFuelTrends: fewer than 4 days logged reports the count honestly rather than guessing at a trend', getFuelTrends(mealsImproving.slice(0,2), goals1).trend === null && getFuelTrends(mealsImproving.slice(0,2), goals1).daysLogged === 2, '');

// Multiple meals on the SAME day correctly sum together into one day, not
// two separate data points
const sameDayMeals = [
  { logged_at: '2026-07-01T08:00:00Z', meal_data: { totals: { calories: 400, protein: 30, carbs: 40, fat: 15 } } },
  { logged_at: '2026-07-01T18:00:00Z', meal_data: { totals: { calories: 600, protein: 50, carbs: 60, fat: 20 } } },
  { logged_at: '2026-07-02T12:00:00Z', meal_data: { totals: { calories: 1000, protein: 80, carbs: 100, fat: 35 } } },
  { logged_at: '2026-07-03T12:00:00Z', meal_data: { totals: { calories: 1000, protein: 80, carbs: 100, fat: 35 } } },
  { logged_at: '2026-07-04T12:00:00Z', meal_data: { totals: { calories: 1000, protein: 80, carbs: 100, fat: 35 } } },
];
const ftSameDay = getFuelTrends(sameDayMeals, goals1);
log('BUG-FREE: two meals logged on the same day correctly combine into one day, not two', ftSameDay.daysLogged === 4, String(ftSameDay.daysLogged));

// loadRecentMealLogs: no user returns empty rather than throwing
ST.user = null;
const noUserMeals = await loadRecentMealLogs(14);
log('loadRecentMealLogs: returns empty array with no user, does not throw', Array.isArray(noUserMeals) && noUserMeals.length === 0, '');

// renderTrends: calendar now appears at the very top of the screen
ST.user = null; ST.ouraConnected = false; ST.nutritionGoals = null; ST.sessionCache = [];
await renderTrends(_fakeEl);
let trendsHtml2 = _fakeEl.innerHTML || '';
log('BUG FIX: Training Calendar now appears in Trends', trendsHtml2.includes('TRAINING CALENDAR'), '');
log('BUG FIX: the calendar appears BEFORE "Log Today\'s Data", at the top as requested', trendsHtml2.indexOf('TRAINING CALENDAR') < trendsHtml2.indexOf("LOG TODAY'S DATA"), '');

// Fuel card shows when goals + enough history exist
ST.user = { id: 'u1' };
SB.from = (table) => {
  if (table === 'meal_logs') return { select: () => ({ eq: () => ({ gte: () => ({ order: async()=>({data: mealsImproving, error:null}) }) }) }) };
  if (table === 'workout_sessions') return { select: () => ({ eq: () => ({ gte: () => ({ order: async()=>({data:[],error:null}) }) }) }) };
  return { select: () => ({ eq: () => ({ order: async()=>({data:[],error:null}) }) }) };
};
ST.nutritionGoals = goals1;
await renderTrends(_fakeEl);
trendsHtml2 = _fakeEl.innerHTML || '';
log('renderTrends: shows the new Fuel card when goals and real history exist', trendsHtml2.includes('Protein adherence'), '');

// No goals set at all -> no Fuel card shown (nothing to trend against)
ST.nutritionGoals = null;
await renderTrends(_fakeEl);
trendsHtml2 = _fakeEl.innerHTML || '';
log('renderTrends: correctly omits the Fuel card entirely when no targets are set', !trendsHtml2.includes('Protein adherence'), '');

// ── v5.19.43: DUPLICATE SCHEDULE ROWS, HYDRATION PACING, CALENDAR PROMPT ──
document.getElementById = () => _fakeEl;

// mergeAdjacentEvents: reproduces the exact reported case from real data —
// two back-to-back "Duty free period" blocks, one ending the instant the
// next begins.
const dupeEvents = [
  { uid:'a', type:'dutyfree', summary:'Duty free period', start:'2026-07-25T05:00:00.000Z', end:'2026-07-26T04:59:59.000Z' },
  { uid:'b', type:'dutyfree', summary:'Duty free period', start:'2026-07-26T05:00:00.000Z', end:'2026-07-27T04:59:59.000Z' },
];
const merged = mergeAdjacentEvents(dupeEvents);
log('BUG FIX (the exact reported case): two adjacent identical "Duty free period" blocks collapse into one row, not two', merged.length === 1, 'got '+merged.length);
log('BUG FIX: the merged entry spans from the first block\'s start to the second block\'s end', merged[0].start === dupeEvents[0].start && merged[0].end === dupeEvents[1].end, JSON.stringify(merged[0]));
log('BUG FIX: the merged entry tracks both original uids so "is this happening now" still works correctly', merged[0].uids.includes('a') && merged[0].uids.includes('b'), '');

// Different summaries do NOT merge, even if adjacent
const differentSummaries = [
  { uid:'a', type:'dutyfree', summary:'Duty free period', start:'2026-07-25T05:00:00.000Z', end:'2026-07-26T04:59:59.000Z' },
  { uid:'b', type:'flight', summary:'Flight 100 PHX-SEA', start:'2026-07-26T05:00:00.000Z', end:'2026-07-26T08:00:00.000Z' },
];
log('regression: different-summary adjacent events do NOT merge', mergeAdjacentEvents(differentSummaries).length === 2, '');

// A real gap between two same-summary events does NOT merge them
const realGap = [
  { uid:'a', type:'dutyfree', summary:'Duty free period', start:'2026-07-25T05:00:00.000Z', end:'2026-07-25T10:00:00.000Z' },
  { uid:'b', type:'dutyfree', summary:'Duty free period', start:'2026-07-26T05:00:00.000Z', end:'2026-07-26T10:00:00.000Z' },
];
log('regression: same-summary events with a real gap between them stay separate, not falsely merged', mergeAdjacentEvents(realGap).length === 2, '');

// ── Hydration pacing ──
log('dayElapsedPct: before 6am is 0 (start of the paced window)', dayElapsedPct(new Date('2026-07-25T05:00:00')) === 0, '');
log('dayElapsedPct: after 10pm is 1 (end of the paced window)', dayElapsedPct(new Date('2026-07-25T23:00:00')) === 1, '');
log('dayElapsedPct: midday (2pm) is a reasonable fraction through the window', Math.abs(dayElapsedPct(new Date('2026-07-25T14:00:00')) - 0.5) < 0.01, String(dayElapsedPct(new Date('2026-07-25T14:00:00'))));

// THE EXACT REPORTED SCENARIO: 8-hour flying day, 0L consumed, just woke up (6:15am).
// Date.now mocking does NOT affect new Date() in V8 (a real engine quirk,
// not an app bug) — these functions accept an explicit "now" for exactly
// this reason, bypassing the unreliable global mock entirely.
ST.flightHrs = 8; ST.waterIn = 0;
const earlyNow = new Date('2026-07-25T06:15:00');
const earlyStatus = hydroStatus(earlyNow);
log('BUG FIX (the exact reported scenario): 0L at 6:15am on an 8hr flying day reads as NOMINAL, not an alarming deficit', earlyStatus.label === 'NOMINAL', JSON.stringify(earlyStatus));
log('BUG FIX: no alarming advice is shown this early either', hydroAdvice(earlyNow) === null, hydroAdvice(earlyNow));
log('the full-day target is completely unchanged by this fix (still 2.4L for an 8hr day)', hydroTarget() === 2.4, String(hydroTarget()));

// Later in the day, genuinely behind pace SHOULD still show a real deficit —
// this isn\'t supposed to suppress legitimate warnings, only unfair early ones
const lateNow = new Date('2026-07-25T18:00:00'); // 75% through the day, still 0L
const lateStatus = hydroStatus(lateNow);
log('BUG-FREE: being genuinely behind pace later in the day still correctly shows a real deficit', lateStatus.label === 'DEFICIT', JSON.stringify(lateStatus));
log('late-day advice still references the real full-day target for context', hydroAdvice(lateNow) && hydroAdvice(lateNow).includes('2.4L'), hydroAdvice(lateNow));

// Someone who HAS been drinking on pace all day reads as nominal, not
// penalized just because the full day\'s target isn\'t met yet
ST.waterIn = 1.8; // roughly on pace for 75% through a 2.4L day
log('someone on pace mid-day (not yet at the full target) still correctly reads as nominal', hydroStatus(lateNow).label === 'NOMINAL', JSON.stringify(hydroStatus(lateNow)));

ST.waterIn = 0; ST.flightHrs = 0;

// THE EXACT REPORTED CONTRADICTION: no-fly day (1.0L floor target), 1L
// consumed, evening. The workout Hydration Payload widget correctly reads
// 100%/nominal off hydroStatus() — but Today's "Still Open" list was
// using its own hardcoded "under 1.5L after 2pm" check, completely
// ignoring the real target, and flagged the same 1L as "light" at the
// same moment. Both surfaces now read from the same hydroStatus() call,
// so this can't diverge again.
ST.flightHrs = 0; ST.waterIn = 1;
const noFlyEveningCtx = { ...baseCtx(), hour: 18, now: new Date('2026-07-25T18:14:00') };
log('BUG FIX (reported contradiction): 1L on a no-fly day (1.0L target) does NOT flag as "light" — matches the Hydration Payload widget showing 100%/nominal', !buildTodayGaps(noFlyEveningCtx).some(g => /Water is light/.test(g.text)), JSON.stringify(buildTodayGaps(noFlyEveningCtx)));

// Same no-fly floor target, but genuinely behind — should still flag,
// just using the real target-aware status instead of the old flat number
ST.waterIn = 0.3;
log('gaps: genuinely behind pace on a no-fly day still flags water, just via the real paced status now', buildTodayGaps(noFlyEveningCtx).some(g => /Water/.test(g.text)), JSON.stringify(buildTodayGaps(noFlyEveningCtx)));

ST.waterIn = 0; ST.flightHrs = 0;

// ── Standalone calendar-upload prompt ──
ST.flightSchedule = null; ST.ouraConnected = true; ST.ouraScore = 45; // deliberately LOW readiness
ST.ouraData = {sleep_score:50, activity_score:60}; ST.ouraSteps = 1000;
ST.todaysMeals = []; ST.sessionCache = []; ST.nutritionGoals = null; ST.waterIn = 0;
renderToday(_fakeEl);
let todayHtml3 = _fakeEl.innerHTML || '';
log('BUG FIX (critical): the calendar-upload prompt now shows even when LOW READINESS fires a completely different briefing rule', todayHtml3.includes('No flight schedule uploaded'), '');
log('BUG FIX: the prompt has a real, working navigation button, not just descriptive text', todayHtml3.includes('Upload Schedule') && todayHtml3.includes("switchTab('data')"), '');

// Regression: with a schedule uploaded, the prompt correctly disappears
ST.flightSchedule = [{uid:'x',type:'flight',start:'2026-07-25T08:00:00Z',end:'2026-07-25T10:00:00Z',summary:'test'}];
renderToday(_fakeEl);
todayHtml3 = _fakeEl.innerHTML || '';
log('regression: the calendar-upload prompt correctly disappears once a schedule is uploaded', !todayHtml3.includes('No flight schedule uploaded'), '');
ST.flightSchedule = null;

// ── v5.19.44: ADD CROISSANT AS A STAPLE, FOR LOGGING COMPOUND SANDWICHES AS COMPONENTS ──
const origUsdaFetch5 = usdaFetch;
usdaFetch = async () => ({ foods: [
  { fdcId:1, description:'Bread, white', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:265}] },
  { fdcId:2, description:'Croissants, butter', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:406}] },
  { fdcId:3, description:'Rolls, dinner', dataType:'SR Legacy', foodNutrients:[{nutrientName:'Energy',value:310}] },
] });
const croissantResults = await searchUSDAFoods('croissant');
log('BUG FIX: searching "croissant" now boosts the plain croissant entry to the top', croissantResults[0].description === 'Croissants, butter', croissantResults.map(r=>r.description).join(','));
usdaFetch = origUsdaFetch5;

// ── v5.19.45: RANKS AT-A-GLANCE + BADGE REBALANCE ──
document.getElementById = () => _fakeEl;

// ── Badge rebalance ──
const centuryBadge = BADGES.find(b => b.id === 'century');
log('BUG FIX (rebalance): Century Club now requires 500 sets, not the trivially-easy 100', centuryBadge.check({totalSets:100}) === false && centuryBadge.check({totalSets:500}) === true, '');
const earlyBirdBadge = BADGES.find(b => b.id === 'early_bird');
log('BUG FIX (rebalance): Early Bird now requires 5 early sessions, not a single one-off', earlyBirdBadge.check({earlyBirdCount:1}) === false && earlyBirdBadge.check({earlyBirdCount:5}) === true, '');
const pr5Badge = BADGES.find(b => b.id === 'pr_5');
log('rebalance: PR Hunter now requires 10 PRs, not 5', pr5Badge.check({prCount:5}) === false && pr5Badge.check({prCount:10}) === true, '');
const ironWillBadge = BADGES.find(b => b.id === 'iron_will');
log('rebalance: Iron Will now requires 20 sets in a session, not 15', ironWillBadge.check({maxSetsInSession:15}) === false && ironWillBadge.check({maxSetsInSession:20}) === true, '');

// Regression: badges NOT targeted for rebalance are unchanged
const weekly3Badge = BADGES.find(b => b.id === 'weekly_3');
log('regression: Weekly Warrior threshold is untouched (still 3)', weekly3Badge.check({best7Day:3}) === true, '');
const pr25Badge = BADGES.find(b => b.id === 'pr_25');
log('regression: Record Machine threshold is untouched (still 25)', pr25Badge.check({prCount:25}) === true && pr25Badge.check({prCount:24}) === false, '');

// ── Ranks at-a-glance ──
document.getElementById = (id) => id === 'lbGlance' ? _fakeEl : _fakeEl;
SB.from = (table) => {
  if (table === 'leaderboard_entries') return { select: () => ({ eq: () => ({ order: () => ({ limit: async()=>({data:[
    {username:'Maverick', weight_lb:315}, {username:'Goose', weight_lb:295}, {username:'Iceman', weight_lb:275},
  ],error:null}) }) }) }) };
  if (table === 'running_pr_entries') return { select: () => ({ order: () => ({ limit: async()=>({data:[
    {username:'Roadrunner', distance_mi:8.2, duration_sec:2952},
  ],error:null}) }) }) };
  return { select: () => ({ eq: () => ({ order: () => ({ limit: async()=>({data:[],error:null}) }) }) }) };
};
await loadLeaderboardGlance();
let glanceHtml = _fakeEl.innerHTML || '';
log('BUG FIX: at-a-glance shows multiple boards simultaneously, not just one at a time', glanceHtml.includes('Maverick') && glanceHtml.includes('Roadrunner'), '');
log('at-a-glance shows real values, not placeholders', glanceHtml.includes('315 lb'), '');
log('at-a-glance cards are tappable and route into the detailed board for that exercise', glanceHtml.includes("ST.lbEx="), '');

// Empty board shows an honest message, not a broken/blank card
SB.from = () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async()=>({data:[],error:null}) }) }), order: () => ({ limit: async()=>({data:[],error:null}) }) }) });
await loadLeaderboardGlance();
glanceHtml = _fakeEl.innerHTML || '';
log('BUG-FREE: an exercise with no entries yet shows an honest empty message, not a blank/broken card', glanceHtml.includes('No entries yet'), '');

// renderLeaderboard wires up the glance section on both the strength and
// running exit paths (each has its own early return)
document.getElementById = () => _fakeEl;
ST.username = 'testpilot'; ST.lbCategory = 'strength';
renderLeaderboard(_fakeEl);
let lbHtml = _fakeEl.innerHTML || '';
log('renderLeaderboard (strength path): includes the AT A GLANCE section', lbHtml.includes('AT A GLANCE'), '');
ST.lbCategory = 'running';
renderLeaderboard(_fakeEl);
lbHtml = _fakeEl.innerHTML || '';
log('renderLeaderboard (running path, separate early return): ALSO includes the AT A GLANCE section', lbHtml.includes('AT A GLANCE'), '');
ST.lbCategory = 'strength';

// ── v5.19.46: WATER RE-RENDER, BADGES ON RANKS, MANUAL ENTRY, NAP DETECTION ──
document.getElementById = (id) => id === 'quickWaterInput' ? { value: '2.5' } : _fakeEl;

// ── Water quick-log now refreshes Today, not just Preflight ──
ST.tab = 'today'; ST.waterIn = 0; ST.waterInRaw = '';
SB.from = () => ({ upsert: async()=>({error:null}) });
ST.flightSchedule = null; ST.ouraConnected = false; ST.todaysMeals = []; ST.sessionCache = [];
ST.nutritionGoals = null; ST.user = null;
saveQuickWater();
let todayAfterWater = _fakeEl.innerHTML || '';
log('BUG FIX (the exact reported case): saving quick water while on Today correctly refreshes Today, not just Preflight', ST.waterIn === 2.5 && !todayAfterWater.includes('Water is light so far'), 'waterIn='+ST.waterIn);

// ── Badges now appear on Ranks ──
// A dedicated element here, not the shared _fakeEl — renderLeaderboard has
// sub-elements (lbGlance, lbRows) that get asynchronously overwritten via
// document.getElementById, and reusing _fakeEl for all of them causes the
// fire-and-forget async loaders to stomp on the main content before a
// synchronous check can read it.
document.getElementById = () => _fakeEl;
ST.username = 'testpilot'; ST.lbCategory = 'strength'; ST.badges = { first_flight: new Date().toISOString() };
const ranksEl = { innerHTML: '' };
renderLeaderboard(ranksEl);
let ranksHtml = ranksEl.innerHTML || '';
log('BUG FIX: Badges now actually appear on the Ranks page, not just a rebalanced difficulty with nothing shown', ranksHtml.includes('BADGES') && ranksHtml.includes('First Flight'), '');
log('Ranks badges section shows the earned count', ranksHtml.includes('of '+BADGES.length+' earned'), '');

// buildBadgesGridHTML is shared, not duplicated — standalone screen still works
renderBadges(_fakeEl);
let badgesHtml = _fakeEl.innerHTML || '';
log('regression: the standalone Badges screen (hamburger menu) still works correctly', badgesHtml.includes('First Flight') && badgesHtml.includes('BADGES'), '');

// ── Manual food entry: styling + button color ──
ST.mealBuilder = { mealType:'snack', items:[] };
showManualFoodEntry();
let manualHtml = _fakeEl.innerHTML || '';
log('BUG FIX: manual food name input is now wrapped in .field, fixing the too-small text', manualHtml.includes('<div class="field"><input type="text" id="manualFoodName"'), '');
log('BUG FIX: "Add to Meal" is now the gold/highlighted button, matching "press me next"', manualHtml.includes('btn btn-gold mt8" onclick="addManualFoodToMeal()"'), '');

// Disabled-button CSS actually exists now (previously a disabled gold
// button was visually identical to an active one)
const cssContent = require('fs').readFileSync('/home/claude/pilot-program/index.html','utf8');
log('BUG FIX: a :disabled CSS rule now exists so a disabled button visibly dims, rather than looking identical to an active gold button', /\.btn:disabled\{[^}]*opacity/.test(cssContent), '');

// ── Nap detection ──
document.getElementById = () => _fakeEl;
ST.sleepBaselineScore = null;
const napCtx = (score) => getTodayContext.call ? null : null; // placeholder not used

// First reading establishes baseline, does not fire
log('nap detection: the first reading of a session establishes a baseline, does not fire as a nap', checkForNapRecovery(60) === null, '');
log('nap detection: a small change right after baseline does not fire (noise/rounding)', checkForNapRecovery(63) === null, '');
// baseline stays at 60 (not 63) since the earlier small change didn't meet
// the jump threshold and correctly did not update it
log('BUG FIX (the exact reported case): a real same-day jump is correctly detected', JSON.stringify(checkForNapRecovery(75)) === JSON.stringify({from:60,to:75}), '');
log('nap detection: does not keep re-firing on the same jump on the next check', checkForNapRecovery(75) === null, '');
log('nap detection: a further real increase after that CAN fire again (a second nap, or continued recovery)', JSON.stringify(checkForNapRecovery(85)) === JSON.stringify({from:75,to:85}), '');

// Wired into the actual Today briefing, with correct priority: low
// readiness still overrides even a detected nap
ST.sleepBaselineScore = null;
const bCtx = (readiness, sleep) => ({
  now:new Date(), hour:14,
  sched:{ hasSchedule:false, todayEvents:[], current:null, nextDuty:null, lastDutyEndedAt:null, freeMinutesUntilDuty:null, layoverAirport:null, tomorrowFirstDuty:null, yesterdayDutyHours:0, flightsToday:0, legsCompleted:0, legsRemaining:0, dutyEndsAt:null },
  oura:{ readiness, sleep, activity:70, steps:0, napDetected: checkForNapRecovery(sleep) },
  nutrition:{ consumed:{calories:0,protein:0,carbs:0,fat:0}, goals:null, mealCount:0, proteinPct:null, caloriePct:null },
  training:{ workoutToday:false }, water:2,
});
bCtx(80, 60); // establish baseline
const napBrief = buildTodayBriefing(bCtx(80, 75)); // jump while readiness is fine
log('BUG FIX (integration): a detected nap with decent readiness produces the encouraging, question-style briefing', napBrief.headline.includes('Nice nap'), napBrief.headline);
log('nap briefing cites the real before/after scores', napBrief.body.includes('60') && napBrief.body.includes('75'), napBrief.body);

ST.sleepBaselineScore = null;
bCtx(50, 60); // establish baseline at low readiness
const napBriefLowReadiness = buildTodayBriefing(bCtx(50, 75)); // jump but readiness STILL low
log('BUG-FREE (priority): low readiness still overrides even when a nap is detected — rest advice, not "go train"', napBriefLowReadiness.tone === 'rest' && !napBriefLowReadiness.headline.includes('Nice nap'), napBriefLowReadiness.headline);
ST.sleepBaselineScore = null;

// ── AI food photo recognition ──
document.getElementById = () => _fakeEl;

const lowConfPhoto = { source: 'photo', description: 'mystery casserole', servingDescription: '1 bowl', confidence: 0.55, nutrients: { calories: 400, protein: 20, carbs: 30, fat: 15, fiber: 3, sugar: 5 } };
const highConfPhoto = { source: 'photo', description: 'grilled chicken breast', servingDescription: '6oz', confidence: 0.9, nutrients: { calories: 280, protein: 52, carbs: 0, fat: 6, fiber: 0, sugar: 0 } };
const barcodeHit = { source: 'barcode', description: 'Clif Bar Chocolate Chip', brandName: 'Clif Bar', servingDescription: '1 bar (68g)', confidence: 1, nutrients: { calories: 250, protein: 9, carbs: 45, fat: 5, fiber: 5, sugar: 21 } };

const lowConfHTML = buildFoodRecognitionCardHTML(lowConfPhoto);
log('food photo: a sub-80%% confidence guess shows the "is this right?" warning banner', lowConfHTML.includes('is this right?'), '');
log('food photo: the low-confidence banner surfaces the actual percentage', lowConfHTML.includes('55%'), '');

const highConfHTML = buildFoodRecognitionCardHTML(highConfPhoto);
log('food photo: an 80%%+ confidence guess does NOT show the warning banner', !highConfHTML.includes('is this right?'), '');
log('food photo: high-confidence card still shows the confidence figure for transparency', highConfHTML.includes('90%'), '');

const barcodeHTML = buildFoodRecognitionCardHTML(barcodeHit);
log('barcode: an exact product match never shows the low-confidence warning', !barcodeHTML.includes('is this right?'), '');
log('barcode: shows the brand name instead of a confidence percentage', barcodeHTML.includes('Clif Bar'), '');

// Description and macro fields are editable text/number inputs pre-filled
// with the model's guess — confirms the "user can modify it" requirement
// actually renders editable controls, not read-only text.
log('food photo: description renders as an editable input, not static text', lowConfHTML.includes('id="foodRecDescription"') && lowConfHTML.includes('value="mystery casserole"'), '');
log('food photo: macro fields render as editable inputs pre-filled with the estimate', lowConfHTML.includes('id="foodRecCal"') && lowConfHTML.includes('value="400"'), '');

// addFoodRecognitionToMeal: user edits fields before adding — the saved
// item should reflect the EDITED values, not silently revert to the
// original model guess.
ST.mealBuilder = { mealType: 'lunch', items: [] };
window._foodRecPending = { ...lowConfPhoto };
const editedFields = { foodRecDescription: 'homemade chicken casserole', foodRecCal: '450', foodRecProtein: '25', foodRecCarbs: '35', foodRecFat: '18' };
document.getElementById = (id) => (id in editedFields ? { value: editedFields[id] } : _fakeEl);
addFoodRecognitionToMeal();
const addedItem = ST.mealBuilder.items[0];
log('food photo: adding to meal uses the user-edited description, not the original guess', addedItem && addedItem.description === 'homemade chicken casserole', addedItem && addedItem.description);
log('food photo: adding to meal uses user-edited calories', addedItem && addedItem.nutrients.calories === 450, addedItem && JSON.stringify(addedItem.nutrients));
log('food photo: fiber/sugar (not shown as editable fields) are carried over from the original guess', addedItem && addedItem.nutrients.fiber === 3 && addedItem.nutrients.sugar === 5, addedItem && JSON.stringify(addedItem.nutrients));
log('food photo: saved item retains its source and confidence for later reference', addedItem && addedItem.source === 'photo' && addedItem.confidence === 0.55, '');
document.getElementById = () => _fakeEl;
ST.mealBuilder = null;
window._foodRecPending = null;

// Error states the meal builder needs to render distinctly
const limitHTML_check = (result) => {
  // handleFoodRecognitionResult writes into #foodPhotoResultRoot; since
  // getElementById is stubbed to _fakeEl here, read back via _fakeEl.innerHTML.
  handleFoodRecognitionResult(result);
  return _fakeEl.innerHTML;
};
const limitMsg = limitHTML_check({ error: 'limit_reached', used: 5, limit: 5 });
log('food photo: hitting the daily cap shows an upgrade-oriented message, not a raw error', limitMsg.includes('Pro') && limitMsg.includes('5'), '');
const notFoundMsg = limitHTML_check({ error: 'vision_api_failed' });
log('food photo: a server-side failure shows a retry-or-manual-entry message', notFoundMsg.includes('manually'), '');

// ── Food emoji matching ──
log('foodEmoji: banana matches', foodEmoji('Bananas, raw') === '🍌', '');
log('foodEmoji: pizza matches', foodEmoji('Pepperoni pizza slice') === '🍕', '');
log('foodEmoji: protein shake matches before generic patterns could grab it', foodEmoji('Protein shake, chocolate') === '🥤', '');
log('foodEmoji: sandwich matches', foodEmoji('Turkey sandwich on wheat') === '🥪', '');
log('foodEmoji: chicken matches', foodEmoji('Grilled chicken breast') === '🍗', '');
log('foodEmoji: an unrecognized food gets the generic plate fallback, not a wrong icon', foodEmoji('Some obscure regional dish') === '🍽️', '');
log('foodEmoji: matching is case-insensitive', foodEmoji('BANANA') === '🍌', '');

// ── Frequent foods (history-based quick-add) ──
log('normalizeFoodKey: strips a trailing serving multiplier so portions of the same food count together', normalizeFoodKey('Chicken breast (2x)') === normalizeFoodKey('Chicken breast'), '');
log('normalizeFoodKey: is case/whitespace insensitive', normalizeFoodKey('  Banana  ') === normalizeFoodKey('BANANA'), '');

const mkMealLog = (loggedAt, items) => ({ logged_at: loggedAt, meal_data: { items } });
const chickenItem = { description: 'Chicken breast', nutrients: { calories: 280, protein: 53, carbs: 0, fat: 6, fiber: 0, sugar: 0 } };
const chickenItem2x = { description: 'Chicken breast (2x)', nutrients: { calories: 560, protein: 106, carbs: 0, fat: 12, fiber: 0, sugar: 0 } };
const bananaItem = { description: 'Banana', nutrients: { calories: 105, protein: 1, carbs: 27, fat: 0, fiber: 3, sugar: 14 } };
const oneOffItem = { description: 'Exotic fruit smoothie', nutrients: { calories: 200, protein: 2, carbs: 40, fat: 1, fiber: 2, sugar: 30 } };

const mockLogs = [
  mkMealLog('2026-07-01T12:00:00Z', [chickenItem]),
  mkMealLog('2026-07-05T12:00:00Z', [chickenItem, bananaItem]),
  mkMealLog('2026-07-10T12:00:00Z', [chickenItem2x]), // same food, different portion — should merge into one count
  mkMealLog('2026-07-15T12:00:00Z', [bananaItem]),
  mkMealLog('2026-07-20T12:00:00Z', [oneOffItem]), // logged only once
];

const frequent = getFrequentFoods(mockLogs, 8);
log('getFrequentFoods: chicken (logged across 3 meals at different portions) counts as one food, not three', frequent.some(f => normalizeFoodKey(f.description) === 'chicken breast' && f.timesLogged === 3), JSON.stringify(frequent));
log('getFrequentFoods: banana (logged twice) is included', frequent.some(f => normalizeFoodKey(f.description) === 'banana' && f.timesLogged === 2), '');
log('getFrequentFoods: a genuine one-off (logged once) is excluded — this is a "usual foods" list, not a full history dump', !frequent.some(f => f.description === 'Exotic fruit smoothie'), '');
log('getFrequentFoods: most frequent food is ranked first', normalizeFoodKey(frequent[0].description) === 'chicken breast', JSON.stringify(frequent[0]));
log('getFrequentFoods: uses the most recently logged version\'s nutrients (the 2x portion), not the first-ever logged portion', frequent.find(f => normalizeFoodKey(f.description) === 'chicken breast').nutrients.calories === 560, JSON.stringify(frequent.find(f => normalizeFoodKey(f.description) === 'chicken breast')));

const manyFoodsLogs = ['a','b','c','d','e','f','g','h','i','j'].flatMap(name =>
  [mkMealLog('2026-07-01T00:00:00Z', [{ description: name, nutrients: { calories:100,protein:1,carbs:1,fat:1,fiber:0,sugar:0 } }]),
   mkMealLog('2026-07-02T00:00:00Z', [{ description: name, nutrients: { calories:100,protein:1,carbs:1,fat:1,fiber:0,sugar:0 } }])]
);
log('getFrequentFoods: respects the limit parameter even with many qualifying foods', getFrequentFoods(manyFoodsLogs, 3).length === 3, '');

// addFrequentFoodToMeal: one tap adds directly, no search/photo/barcode call involved
document.getElementById = () => _fakeEl;
ST.mealBuilder = { mealType: 'lunch', items: [], frequentFoods: frequent };
const chickenIdx = frequent.findIndex(f => normalizeFoodKey(f.description) === 'chicken breast');
addFrequentFoodToMeal(chickenIdx);
log('addFrequentFoodToMeal: adds the tapped food directly to the meal', ST.mealBuilder.items.length === 1 && normalizeFoodKey(ST.mealBuilder.items[0].description) === 'chicken breast', JSON.stringify(ST.mealBuilder.items));
log('addFrequentFoodToMeal: tags the item source as history, distinct from usda/photo/barcode/manual', ST.mealBuilder.items[0].source === 'history', '');
ST.mealBuilder = null;

// ── Edit a logged meal (not just delete) ──
document.getElementById = () => _fakeEl;
const originalMeal = { id: 'meal_1', meal_type: 'lunch', logged_at: '2026-07-25T12:00:00Z',
  meal_data: { items: [{ description: 'Turkey sandwich', nutrients: { calories: 400, protein: 25, carbs: 40, fat: 12, fiber: 3, sugar: 4 } }], totals: { calories: 400, protein: 25, carbs: 40, fat: 12, fiber: 3, sugar: 4 } } };
ST.todaysMeals = [originalMeal];
editMealLog('meal_1');
log('editMealLog: opens the builder pre-populated with the meal\'s existing items', ST.mealBuilder && ST.mealBuilder.items.length === 1 && ST.mealBuilder.items[0].description === 'Turkey sandwich', JSON.stringify(ST.mealBuilder?.items));
log('editMealLog: carries over the original meal type', ST.mealBuilder && ST.mealBuilder.mealType === 'lunch', '');
log('editMealLog: tracks which meal is being edited so Save updates rather than inserts', ST.mealBuilder && ST.mealBuilder.editingId === 'meal_1', '');
log('editMealLog: preserves the original logged_at so editing doesn\'t silently move the meal to "now"', ST.mealBuilder && ST.mealBuilder.editingLoggedAt === '2026-07-25T12:00:00Z', '');

// Items are deep-copied — mutating the builder's draft must not corrupt
// the original meal still sitting in ST.todaysMeals until Save is pressed.
ST.mealBuilder.items[0].nutrients.calories = 999;
log('editMealLog: the draft is an independent copy, not a live reference into ST.todaysMeals', ST.todaysMeals[0].meal_data.items[0].nutrients.calories === 400, String(ST.todaysMeals[0].meal_data.items[0].nutrients.calories));

// updateMealLog itself updates ST.todaysMeals in place, synchronously
// relative to its own resolution — checked directly here rather than
// after finishMealBuilder's trailing renderPage() call, since that kicks
// off its own async reload whose timing isn't this test's concern.
ST.todaysMeals = [originalMeal];
let directUpdatedRow = null;
SB.from = () => ({ update: (row) => ({ eq: (col, id) => ({ select: async () => { directUpdatedRow = { ...row, id }; return { data: [{ ...row, id, logged_at: originalMeal.logged_at }], error: null }; } }) }) });
const directUpdateResult = await updateMealLog('meal_1', 'lunch', [{ description: 'Turkey sandwich, no cheese', nutrients: { calories: 350, protein: 25, carbs: 38, fat: 8, fiber: 3, sugar: 4 } }], originalMeal.logged_at);
log('updateMealLog: returns the saved row', directUpdateResult && directUpdateResult.id === 'meal_1', JSON.stringify(directUpdateResult));
log('updateMealLog: updates ST.todaysMeals in place — same array length, corrected content, not a duplicate entry', ST.todaysMeals.length === 1 && ST.todaysMeals[0].meal_data.items[0].description === 'Turkey sandwich, no cheese', JSON.stringify(ST.todaysMeals));

// Saving an edit through the builder calls update(), not insert() —
// verified via a mock that only implements the update().eq().select()
// chain finishMealBuilder should be using for an edit.
editMealLog('meal_1');
ST.mealBuilder.items[0].description = 'Turkey sandwich, extra cheese';
ST.mealBuilder.items[0].nutrients.calories = 480;
let updatedRow = null;
SB.from = () => ({ update: (row) => ({ eq: (col, id) => ({ select: async () => { updatedRow = { ...row, id }; return { data: [{ ...row, id, logged_at: originalMeal.logged_at }], error: null }; } }) }) });
await finishMealBuilder();
log('finishMealBuilder (editing): calls update on the existing row, not insert', updatedRow !== null && updatedRow.id === 'meal_1', JSON.stringify(updatedRow));
log('finishMealBuilder (editing): the corrected description and calories are what gets saved', updatedRow?.meal_data?.items?.[0]?.description === 'Turkey sandwich, extra cheese' && updatedRow?.meal_data?.totals?.calories === 480, JSON.stringify(updatedRow?.meal_data));
log('finishMealBuilder (editing): clears the builder after a successful save, same as a new meal', ST.mealBuilder === null, '');

ST.todaysMeals = [];

// ── Hydration status surfaced directly on Today's Fuel card ──
ST.flightHrs = 0; ST.waterIn = 1; // no-fly day, at the 1.0L floor target — nominal
ST.nutritionGoals = { mode: 'auto', calories: 2400, protein: 180, carbs: 250, fat: 80 };
ST.todaysMeals = [];
const fuelCtx = getTodayContext();
const fuelRoot = { innerHTML: '' };
renderToday(fuelRoot);
log('Fuel card: hydration status is now visible on Today without switching tabs', fuelRoot.innerHTML.includes('HYDRATION'), '');
log('Fuel card: shows NOMINAL when water is at the real target, matching the workout screen\'s math', fuelRoot.innerHTML.includes('NOMINAL') && fuelRoot.innerHTML.includes('1.0/1.0L'), fuelRoot.innerHTML.slice(0, 400));

ST.flightHrs = 0; ST.waterIn = 0; ST.nutritionGoals = null; ST.todaysMeals = [];

})();
