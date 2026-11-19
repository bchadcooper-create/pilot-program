/**
 * Regression tests for parseFlightScheduleICS() and its helpers.
 *
 * Why this exists: this parser has caused two real, shipped bugs in the
 * same conversation that hardened it — the MobileCCI "Z means Central"
 * timezone bug, and the "FLT" vs "Flight" classification miss. Both
 * reviews of app.js recommended regression tests over replacing the
 * parser with a generic library, on the reasoning that the custom logic
 * here reflects real, hard-won fixes for real airline export quirks that
 * a generic RFC5545 parser wouldn't know to handle. This file is that
 * recommendation, not a full test framework — no dependencies, no
 * runner, just node.
 *
 * Run with:  node tests/ics-parser.test.js
 * Exits non-zero if anything fails, so it's CI-friendly if a build
 * pipeline is ever added later without needing to change this file.
 *
 * How this works: app.js is a browser script with no module exports, so
 * this loads its actual, current source into a sandboxed Node context
 * with the minimum browser globals it touches at load time (document,
 * window, localStorage, navigator, a fake Supabase client) stubbed out —
 * not a rewritten or duplicated copy of the parsing logic. A test here
 * is testing the real function that ships, not a mirror of it that could
 * quietly drift out of sync.
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

function loadAppJS() {
  const fakeQueryBuilder = () => {
    const qb = {};
    ['select','insert','update','upsert','delete','eq','gte','lte','lt','gt','order','limit','maybeSingle','single']
      .forEach(m => { qb[m] = () => qb; });
    qb.then = (resolve) => resolve({ data: null, error: null });
    return qb;
  };

  const sandbox = {
    console,
    addEventListener: () => {},
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      createElement: () => ({ style: {}, addEventListener: () => {} }),
      querySelector: () => null,
    },
    localStorage: {
      getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
    },
    navigator: {
      userAgent: '', onLine: true,
      serviceWorker: {
        register: () => Promise.resolve({ addEventListener: () => {}, installing: null }),
        addEventListener: () => {},
        controller: null,
      },
    },
    fetch: () => Promise.reject(new Error('no network in test')),
    supabase: {
      createClient: () => ({
        auth: { getSession: () => Promise.resolve({data:{session:null}}), getUser: () => Promise.resolve({data:{user:null}}) },
        from: () => fakeQueryBuilder(),
      }),
    },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, Promise, Map, Set,
    URL, URLSearchParams,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  const appJsPath = path.join(__dirname, '..', 'app.js');
  const code = fs.readFileSync(appJsPath, 'utf-8');
  vm.runInContext(code, context, { filename: 'app.js' });
  // app.js declares ST with `const`, which (unlike a function declaration
  // or `var`) does NOT become a property of the vm context's global object
  // — it only lives in the script's internal lexical scope. Function
  // declarations like parseFlightScheduleICS/applyProfileToState already
  // attach themselves automatically and are reachable as context.<name>;
  // this one extra statement is only needed to reach the `const ST` state
  // object itself from outside the sandbox for test setup/assertions.
  vm.runInContext('this.ST = ST; this.WORKOUTS = WORKOUTS; this.CATALOG_EXTRAS = CATALOG_EXTRAS; this.INJURY_REGIONS = INJURY_REGIONS; this.ALTERNATES = ALTERNATES; this.EXERCISE_SYNONYMS = EXERCISE_SYNONYMS; this.BADGES = BADGES; this.EXERCISE_VIDEOS = EXERCISE_VIDEOS; this.FAA_MEDS = FAA_MEDS; this.SLOAN = SLOAN;', context);
  return context;
}

// ─── Minimal assertion helpers — no framework, just enough to get a clear pass/fail ───

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.log('  ✗ ' + name);
    console.log('      ' + e.message);
  }
}
function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error((label || 'value') + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

const assertEqualTop = assertEqual;

// ─── Fixtures ───────────────────────────────────────────────────────────────
// Wraps a single VEVENT block in the minimal VCALENDAR structure the parser
// expects — real exports have more headers than this, but parseFlightScheduleICS
// only reads what's between BEGIN:VEVENT/END:VEVENT, so this is sufficient.
function wrapEvent(props) {
  const lines = ['BEGIN:VEVENT'];
  if (props.uid)         lines.push('UID:' + props.uid);
  if (props.summary)     lines.push('SUMMARY:' + props.summary);
  if (props.description) lines.push('DESCRIPTION:' + props.description);
  if (props.dtstart)     lines.push('DTSTART:' + props.dtstart);
  if (props.dtend)       lines.push('DTEND:' + props.dtend);
  lines.push('END:VEVENT');
  return 'BEGIN:VCALENDAR\n' + lines.join('\n') + '\nEND:VCALENDAR';
}

// ─── Run ────────────────────────────────────────────────────────────────────

console.log('ICS parser regression tests\n');
const ctx = loadAppJS();
const { parseFlightScheduleICS } = ctx;

console.log('MobileCCI timezone bug (the bug this correction exists for):');
test('DESCRIPTION local time overrides a wrongly-offset DTSTART/DTEND', () => {
  // DTSTART/DTEND deliberately wrong by +5h (the exact real-world bug:
  // stamped as though every station were Central, whatever it actually is)
  const ics = wrapEvent({
    uid: 'test-1',
    summary: 'Flight 3564',
    description: 'Time: 2026-07-31T13:39:00 - 2026-07-31T16:16:00',
    dtstart: '20260731T183900Z', // wrong: +5h from the real 13:39 local
    dtend:   '20260731T211600Z', // wrong: +5h from the real 16:16 local
  });
  const events = parseFlightScheduleICS(ics);
  assertEqual(events.length, 1, 'event count');
  assertEqual(events[0].localFromDescription, true, 'localFromDescription flag');
  assertEqual(events[0].start, new Date('2026-07-31T13:39:00').toISOString(), 'corrected start');
  assertEqual(events[0].end,   new Date('2026-07-31T16:16:00').toISOString(), 'corrected end');
});

test('DTSTART/DTEND used as-is when DESCRIPTION has no Time: line (no false correction)', () => {
  const ics = wrapEvent({
    uid: 'test-2',
    summary: 'Flight 1234',
    description: 'Flight: 1234 | Stations: DFW->ORD',  // no "Time:" pattern
    dtstart: '20260801T120000Z',
    dtend:   '20260801T140000Z',
  });
  const events = parseFlightScheduleICS(ics);
  assertEqual(events.length, 1, 'event count');
  assertEqual(!!events[0].localFromDescription, false, 'localFromDescription should be falsy');
  assertEqual(events[0].start, new Date('2026-08-01T12:00:00Z').toISOString(), 'DTSTART used unchanged');
});

console.log('\nFLT vs Flight classification (the second real bug found):');
test('"FLT 3564" classifies as flight, not other', () => {
  const ics = wrapEvent({ uid:'t3', summary:'FLT 3564', dtstart:'20260801T070000Z', dtend:'20260801T091500Z' });
  const events = parseFlightScheduleICS(ics);
  assertEqual(events[0].type, 'flight', 'type');
});
test('"Flight 3495" (full word) still classifies as flight', () => {
  const ics = wrapEvent({ uid:'t4', summary:'Flight 3495', dtstart:'20260801T070000Z', dtend:'20260801T091500Z' });
  const events = parseFlightScheduleICS(ics);
  assertEqual(events[0].type, 'flight', 'type');
});

console.log('\nLayover naming variants (found while fixing the FLT bug):');
test('"Layover CID" classifies as layover with airport=CID', () => {
  const ics = wrapEvent({ uid:'t5', summary:'Layover CID (14h 03m)', dtstart:'20260801T150000Z', dtend:'20260802T050000Z' });
  const events = parseFlightScheduleICS(ics);
  assertEqual(events[0].type, 'layover', 'type');
  assertEqual(events[0].airport, 'CID', 'airport');
});
test('"Layover in LBB" classifies as layover with airport=LBB, not "in"', () => {
  const ics = wrapEvent({ uid:'t6', summary:'Layover in LBB', dtstart:'20260801T150000Z', dtend:'20260802T050000Z' });
  const events = parseFlightScheduleICS(ics);
  assertEqual(events[0].type, 'layover', 'type');
  assertEqual(events[0].airport, 'LBB', 'airport (must not be "in")');
});

console.log('\nOther classification types:');
test('"Duty free period" classifies as dutyfree', () => {
  const ics = wrapEvent({ uid:'t7', summary:'Duty free period', dtstart:'20260801T020000Z', dtend:'20260802T015900Z' });
  const events = parseFlightScheduleICS(ics);
  assertEqual(events[0].type, 'dutyfree', 'type');
});
test('Unrecognized summary falls through to type "other" rather than throwing', () => {
  const ics = wrapEvent({ uid:'t8', summary:'Simulator Check', dtstart:'20260801T020000Z', dtend:'20260801T060000Z' });
  const events = parseFlightScheduleICS(ics);
  assertEqual(events[0].type, 'other', 'type');
});

console.log('\nStructural / RFC5545 handling:');
test('Line-folded DESCRIPTION (RFC5545 continuation) unfolds and still gets Time: preference applied', () => {
  // A continuation line starts with a single space, per RFC5545 — this
  // splits "Time: 2026-08-01T07:00:00 - 2026-08-01T09:15:00" across two
  // physical lines the way a real export can.
  const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:t9\nSUMMARY:Flight 9001\n' +
    'DESCRIPTION:Time: 2026-08-01T07:00:00 - 2026-08-01T0\n 9:15:00\n' +
    'DTSTART:20260801T140000Z\nDTEND:20260801T161500Z\nEND:VEVENT\nEND:VCALENDAR';
  const events = parseFlightScheduleICS(ics);
  assertEqual(events.length, 1, 'event count');
  assertEqual(events[0].localFromDescription, true, 'should have used the folded description');
  assertEqual(events[0].start, new Date('2026-08-01T07:00:00').toISOString(), 'unfolded start time');
});
test('Event missing SUMMARY is filtered out entirely rather than producing a broken entry', () => {
  const ics = wrapEvent({ uid:'t10', dtstart:'20260801T020000Z', dtend:'20260801T060000Z' });
  const events = parseFlightScheduleICS(ics);
  assertEqual(events.length, 0, 'event count (should be filtered out)');
});
test('Empty/null input returns an empty array rather than throwing', () => {
  assertEqual(parseFlightScheduleICS('').length, 0, 'empty string');
  assertEqual(parseFlightScheduleICS(null).length, 0, 'null');
});

console.log('\nHome base timezone correction (descriptionLocalTimes):');
test('ST.baseTimezone unset ("auto") keeps the old device-local interpretation', () => {
  // Regression guard: this must keep matching the existing tests above,
  // which all run with ctx.ST.baseTimezone left at its default ('auto').
  assertEqual(ctx.ST.baseTimezone, 'auto', 'baseTimezone default');
  const ics = wrapEvent({
    uid: 'tz-1', summary: 'Flight 5001',
    description: 'Time: 2026-07-31T13:39:00 - 2026-07-31T16:16:00',
    dtstart: '20260731T183900Z', dtend: '20260731T211600Z',
  });
  const events = parseFlightScheduleICS(ics);
  // new Date(2026,6,31,13,39,0) parsed by THIS process's own local timezone —
  // exactly the same construction the parser itself falls back to, so this
  // is self-consistent regardless of what timezone the test runner is in.
  assertEqual(events[0].start, new Date(2026,6,31,13,39,0).toISOString(), 'device-local start, unset baseTimezone');
});
test('ST.baseTimezone set to a fixed zone converts the station-local wall clock correctly', () => {
  ctx.ST.baseTimezone = 'America/New_York';
  try {
    const ics = wrapEvent({
      uid: 'tz-2', summary: 'Flight 5002',
      description: 'Time: 2026-07-31T13:39:00 - 2026-07-31T16:16:00',
      dtstart: '20260731T183900Z', dtend: '20260731T211600Z',
    });
    const events = parseFlightScheduleICS(ics);
    // 2026-07-31 is EDT (UTC-4) — 13:39 Eastern is 17:39 UTC, not whatever
    // the test runner's own local timezone would have produced.
    assertEqual(events[0].start, '2026-07-31T17:39:00.000Z', 'Eastern (EDT) start converted to true UTC');
    assertEqual(events[0].end,   '2026-07-31T20:16:00.000Z', 'Eastern (EDT) end converted to true UTC');
  } finally {
    ctx.ST.baseTimezone = 'auto'; // restore default for later tests
  }
});
test('ST.baseTimezone set to a no-DST zone (Arizona) converts correctly year-round', () => {
  ctx.ST.baseTimezone = 'America/Phoenix';
  try {
    const ics = wrapEvent({
      uid: 'tz-3', summary: 'Flight 5003',
      description: 'Time: 2026-01-15T09:00:00 - 2026-01-15T11:00:00',
      dtstart: '20260115T140000Z', dtend: '20260115T160000Z',
    });
    const events = parseFlightScheduleICS(ics);
    // Phoenix is UTC-7 year-round — 09:00 local is always 16:00 UTC.
    assertEqual(events[0].start, '2026-01-15T16:00:00.000Z', 'Arizona start (winter, no DST)');
  } finally {
    ctx.ST.baseTimezone = 'auto';
  }
});

console.log('\nCross-device calendar sync (applyProfileToState hydration):');
test('applyProfileToState hydrates ST.calendarEvents from profile.calendarClassified', () => {
  // BUG FIX regression guard: fcf-calendar-classify saves classified
  // Apple-Calendar events server-side as profile.calendarClassified /
  // profile.calendarFingerprint (see edge-functions/fcf-calendar-classify),
  // but nothing read them back into ST on boot — so a device with no
  // native EventKit access (the web app) could never see a phone's synced
  // calendar at all, however successfully it had synced.
  ctx.ST.calendarEvents = null;
  ctx.ST.calendarFingerprint = null;
  ctx.applyProfileToState({
    calendarClassified: [{ id: 'e1', type: 'flight', start: '2026-07-31T17:39:00.000Z', end: '2026-07-31T20:16:00.000Z' }],
    calendarFingerprint: 'abc123',
  });
  assertEqual(ctx.ST.calendarEvents.length, 1, 'calendarEvents hydrated');
  assertEqual(ctx.ST.calendarEvents[0].id, 'e1', 'hydrated event id');
  assertEqual(ctx.ST.calendarFingerprint, 'abc123', 'calendarFingerprint hydrated');
});
test('applyProfileToState leaves ST.calendarEvents alone when profile has none yet', () => {
  ctx.ST.calendarEvents = null;
  ctx.applyProfileToState({ sex: 'male' }); // profile with no calendar data at all
  assertEqual(ctx.ST.calendarEvents, null, 'calendarEvents stays null, not overwritten with garbage');
});

console.log('\nMedications & supplements:');
test('normalizeMedication fills defaults and strips markup from user text', () => {
  const m = ctx.normalizeMedication({ name: 'Creatine <b>x</b>', dose: '5', unit: 'g', times: ['19:00', '07:00', 'bad'], remind: 1 });
  assertEqual(m.name, 'Creatine bx/b', 'angle brackets stripped');
  assertEqual(m.dose, 5, 'dose parsed');
  assertEqual(m.unit, 'g', 'unit kept');
  assertEqual(m.times.join(','), '07:00,19:00', 'times validated and sorted');
  assertEqual(m.days, null, 'no days means every day');
  assertEqual(m.remind, true, 'remind coerced to boolean');
  assertEqual(typeof m.id, 'string', 'id generated');
});
test('normalizeMedication rejects an empty name and unknown units', () => {
  assertEqual(ctx.normalizeMedication({ name: '   ' }), null, 'blank name rejected');
  assertEqual(ctx.normalizeMedication({ name: 'X', unit: 'gallons' }).unit, 'mg', 'unknown unit falls back');
  assertEqual(ctx.normalizeMedication({ name: 'X', days: [0,1,2,3,4,5,6] }).days, null, 'all seven days collapses to every day');
});
test('medsDueToday only includes day-restricted meds on their days, in time order', () => {
  ctx.ST.medications = [
    ctx.normalizeMedication({ id: 'a', name: 'Creatine', dose: 5, unit: 'g', times: ['19:00', '07:00'] }),
    ctx.normalizeMedication({ id: 'b', name: 'Test', dose: 0.5, unit: 'mL', times: ['08:00'], days: [1, 4] }), // Mon, Thu
  ];
  const monday = new Date(2026, 8, 28, 12, 0, 0); // Sep 28 2026 is a Monday
  const tuesday = new Date(2026, 8, 29, 12, 0, 0);
  assertEqual(ctx.medsDueToday(monday).map(d => d.key).join(','), 'a|07:00,b|08:00,a|19:00', 'Monday includes weekly med');
  assertEqual(ctx.medsDueToday(tuesday).map(d => d.key).join(','), 'a|07:00,a|19:00', 'Tuesday excludes it');
  ctx.ST.medications = [];
});
test('medicationNotificationPrefs only sends reminder-enabled doses with iOS weekday numbers', () => {
  ctx.ST.medications = [
    ctx.normalizeMedication({ id: 'a', name: 'Creatine', dose: 5, unit: 'g', times: ['07:00'], remind: true }),
    ctx.normalizeMedication({ id: 'b', name: 'Quiet', times: ['09:00'], remind: false }),
    ctx.normalizeMedication({ id: 'c', name: 'Weekly', times: ['20:30'], days: [0, 6], remind: true }),
  ];
  const prefs = ctx.medicationNotificationPrefs();
  assertEqual(prefs.length, 2, 'silent med excluded');
  assertEqual(prefs[0].hour + ':' + prefs[0].minute, '7:0', 'hour/minute split');
  assertEqual(prefs[0].dose, '5 g', 'dose label');
  assertEqual(prefs[1].weekdays.join(','), '1,7', 'JS 0/6 becomes iOS 1/7');
  ctx.ST.medications = [];
});
test('normalizeMedication restricts the id to safe characters and keeps apostrophes in names', () => {
  const m = ctx.normalizeMedication({ id: "x');alert(1);//", name: "St. John's Wort" });
  assertEqual(m.id, 'xalert1', 'quote/paren/semicolon stripped from id');
  assertEqual(m.name, "St. John's Wort", 'apostrophe kept');
  const blank = ctx.normalizeMedication({ id: "'''", name: 'A' });
  assertEqual(/^med_/.test(blank.id), true, 'id that sanitizes to nothing gets a fresh one');
});
test('medReminderPlan stops at the iOS budget and reports the overflow', () => {
  // Each weekday-restricted dose on 6 days costs 6 requests: 5 fit in 30.
  ctx.ST.medications = [1,2,3,4,5,6].map(i =>
    ctx.normalizeMedication({ id: 'w'+i, name: 'W'+i, times: ['08:00'], days: [1,2,3,4,5,6], remind: true }));
  const plan = ctx.medReminderPlan();
  assertEqual(plan.prefs.length, 5, 'five doses fit');
  assertEqual(plan.overflow, true, 'overflow flagged');
  assertEqual(plan.scheduled.has('w6|08:00'), false, 'sixth dose not scheduled');
  ctx.ST.medications = [];
});
test('a dose checked off today does not ring today (reported: reminder fired after check-off)', () => {
  const today = ctx.localDateStr(new Date()); const wd = new Date().getDay() + 1;
  const allDays = [0,1,2,3,4,5,6];
  ctx.ST.medications = [
    ctx.normalizeMedication({ id: 'a', name: 'Daily', times: ['07:00', '19:00'], remind: true }),
    ctx.normalizeMedication({ id: 'b', name: 'Some days', times: ['08:00'], days: allDays.filter(d => d !== (wd % 7)), remind: true }),
    ctx.normalizeMedication({ id: 'c', name: 'Only today', times: ['09:00'], days: [wd - 1], remind: true }),
  ];
  ctx.ST.medsTakenDate = today; ctx.ST.medsTakenToday = {};
  let plan = ctx.medReminderPlan();
  assertEqual(plan.prefs.find(p => p.time === '07:00').weekdays, null, 'unchecked: plain daily trigger');
  ctx.ST.medsTakenToday = { 'a|07:00': true, 'b|08:00': true, 'c|09:00': true };
  plan = ctx.medReminderPlan();
  const am = plan.prefs.find(p => p.id === 'a' && p.time === '07:00');
  assertEqual(am.weekdays.length === 6 && !am.weekdays.includes(wd), true, 'checked daily dose: every weekday but today');
  assertEqual(plan.prefs.find(p => p.id === 'a' && p.time === '19:00').weekdays, null, 'evening dose not checked: still daily');
  assertEqual(plan.prefs.find(p => p.id === 'b').weekdays.includes(wd), false, 'weekday dose that skips today anyway: unchanged');
  assertEqual(plan.prefs.some(p => p.id === 'c'), false, 'today-only dose, taken: nothing sent today');
  // No room left: keeps its daily reminder rather than pushing another dose out.
  // 4 doses on 6 days = 24 requests, plus 2 daily = 26; expanding one daily to 6 would be 31.
  ctx.ST.medications = [1,2,3,4].map(i => ctx.normalizeMedication({ id: 'w'+i, name: 'W'+i, times: ['08:00'], days: [1,2,3,4,5,6], remind: true }))
    .concat([ctx.normalizeMedication({ id: 'd', name: 'Daily', times: ['06:00'], remind: true }), ctx.normalizeMedication({ id: 'e', name: 'Daily2', times: ['06:30'], remind: true })]);
  ctx.ST.medsTakenToday = { 'd|06:00': true };
  plan = ctx.medReminderPlan();
  assertEqual(plan.prefs.find(p => p.id === 'd').weekdays, null, 'over budget: daily trigger kept');
  ctx.ST.medications = []; ctx.ST.medsTakenToday = {};
});
test('Preflight Checklist meds item completes with a med added or with "None"', () => {
  const item = () => ctx.getSetupChecklist().find(i => i.icon === '💊');
  ctx.ST.medications = []; ctx.ST.medsSkipped = false;
  assertEqual(item().done, false, 'open by default');
  ctx.ST.medsSkipped = true;
  assertEqual(item().done, true, 'None completes it');
  ctx.ST.medsSkipped = false;
  ctx.ST.medications = [ctx.normalizeMedication({ name: 'Creatine' })];
  assertEqual(item().done, true, 'adding a med completes it');
  ctx.ST.medications = [];
});
test('applyProfileToState hydrates medications and drops malformed entries', () => {
  ctx.applyProfileToState({ medications: [{ name: 'Zinc', dose: 25, unit: 'mg' }, { name: '' }, 'junk'] });
  assertEqual(ctx.ST.medications.length, 1, 'one valid entry survives');
  assertEqual(ctx.ST.medications[0].name, 'Zinc', 'name hydrated');
  ctx.ST.medications = [];
});

console.log('\nInline handler safety (Guide on "Child\'s Pose" threw SyntaxError):');
// Decode an HTML attribute value the way the browser does before handing
// it to the JS parser. Only the entities app.js actually emits matter.
function decodeAttr(v) {
  return v.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function everyExercise() {
  // WORKOUTS is env -> muscle group -> phase -> [exercises]; walk any depth.
  const out = [];
  (function walk(v) {
    if (Array.isArray(v)) v.forEach(x => (x && x.id && x.name) ? out.push(x) : walk(x));
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  })(ctx.WORKOUTS);
  return out;
}
test('jsArg output survives HTML attribute decoding and parses as JS', () => {
  const nasty = 'Child\'s "Pose" <b>&amp;</b> \\ back';
  const attr = decodeAttr("openExerciseGuide('" + ctx.jsArg(nasty) + "')");
  let got;
  new Function('openExerciseGuide', attr)(v => { got = v; });
  assertEqual(got, nasty, 'round trip');
});
test('every exercise card compiles all of its inline handlers', () => {
  ctx.ST.sets = {}; ctx.ST.expanded = {};
  const bad = [];
  everyExercise().forEach(ex => {
    ctx.ST.expanded[ex.id] = true;   // expanded card renders Alternate/Remove too
    const html = ctx.buildExCard(Object.assign({}, ex), 'landing');
    const re = /on(?:click|change|input)="([^"]*)"/g;
    let m;
    while ((m = re.exec(html))) {
      try { new Function(decodeAttr(m[1])); }
      catch (e) { bad.push(ex.name + ': ' + e.message); }
    }
  });
  ctx.ST.expanded = {};
  assertEqual(bad.length, 0, 'broken handlers:\n' + bad.join('\n'));
});
test('the two apostrophe exercises are covered by the sweep', () => {
  const names = everyExercise().map(e => e.name);
  assertEqual(names.includes("Child's Pose + Reach"), true, 'Child\'s Pose + Reach present');
  assertEqual(names.includes("Child's Pose"), true, 'Child\'s Pose present');
});

console.log('\nTonight\'s layover (AI coach said "sleep in SEA" while sitting in EUG):');
// Chad's real Sep 30 day: woke in EUG, flew two legs, back in EUG at 13:07
// for a layover that runs to 12:41 tomorrow. Tomorrow ends in SEA.
function local(y, m, d, hh, mm) { return new Date(y, m - 1, d, hh, mm).toISOString(); }
const tripFixture = [
  { type: 'layover', airport: 'EUG', start: local(2026, 9, 29, 19, 17), end: local(2026, 9, 30, 5, 47) },
  { type: 'flight',  title: 'FLT 3636', start: local(2026, 9, 30, 6, 47), end: local(2026, 9, 30, 9, 26) },
  { type: 'flight',  title: 'FLT 4097', start: local(2026, 9, 30, 10, 21), end: local(2026, 9, 30, 13, 7) },
  { type: 'layover', airport: 'EUG', start: local(2026, 9, 30, 13, 7), end: local(2026, 10, 1, 12, 41) },
  { type: 'flight',  title: 'FLT 1234', start: local(2026, 10, 1, 13, 41), end: local(2026, 10, 1, 15, 30) },
  { type: 'layover', airport: 'SEA', start: local(2026, 10, 1, 15, 30), end: local(2026, 10, 2, 9, 0) },
];
test('afternoon inside an overnight layover: tonight is here, not the next stop', () => {
  const trip = ctx.currentTripContext(tripFixture, new Date(2026, 8, 30, 16, 14));
  assertEqual(trip.tonightLayoverAirport, 'EUG', 'tonight');
  assertEqual(trip.nextLayoverAirport, 'SEA', 'next rest after this one');
});
test('mid-duty with a layover starting this evening: tonight is that layover', () => {
  const trip = ctx.currentTripContext(tripFixture, new Date(2026, 8, 30, 11, 0));
  assertEqual(trip.tonightLayoverAirport, 'EUG', 'tonight');
});
test('a layover that starts tomorrow afternoon is not tonight', () => {
  // Same day, but the calendar has no layover event for tonight (a sub-20h
  // gap, so it is still one trip) and the SEA layover starts tomorrow
  // afternoon. "Tonight" is unknown; the next rest is still SEA.
  const noOvernight = [
    tripFixture[0], tripFixture[1], tripFixture[2],
    { type: 'flight',  title: 'FLT 1234', start: local(2026, 10, 1, 8, 0), end: local(2026, 10, 1, 10, 0) },
    { type: 'flight',  title: 'FLT 1235', start: local(2026, 10, 1, 10, 30), end: local(2026, 10, 1, 12, 50) },
    { type: 'layover', airport: 'SEA', start: local(2026, 10, 1, 13, 0), end: local(2026, 10, 2, 9, 0) },
  ];
  const trip = ctx.currentTripContext(noOvernight, new Date(2026, 8, 30, 14, 0));
  assertEqual(trip.tonightLayoverAirport, null, 'tonight unknown');
  assertEqual(trip.nextLayoverAirport, 'SEA', 'next rest is still SEA');
});
test('morning inside a layover that ends before noon: tonight is the next overnight', () => {
  const trip = ctx.currentTripContext(tripFixture, new Date(2026, 8, 30, 5, 0));
  assertEqual(trip.tonightLayoverAirport, 'EUG', 'tonight is the 13:07 EUG layover');
});

console.log('\nSwap catalog (reported: "Shrugs not in the catalog"):');
test('catalog search finds shrugs and the other added staples', () => {
  const names = ctx.buildExerciseCatalog().map(e => e.name.toLowerCase());
  ['shrug', 'chin-up', 'skull crusher', 'push press', 'hip thrust', 'elliptical'].forEach(q =>
    assertEqual(names.some(n => n.includes(q)), true, q + ' present'));
});
test('single-arm bench, lateral and front raise are searchable by any wording', () => {
  const find = q => ctx.buildExerciseCatalog().filter(e => ctx.exerciseMatchesQuery(e.name, q)).map(e => e.name);
  [['one arm dumbbell bench', 'Single-Arm DB Bench Press'], ['one armed lateral raise', 'Single-Arm DB Lateral Raise'],
   ['one arm front raise', 'Single-Arm DB Front Raise'], ['single arm', 'Single-Arm DB Bench Press'],
   ['single-arm db lateral', 'Single-Arm DB Lateral Raise']].forEach(([q, want]) =>
    assertEqual(find(q).includes(want), true, q + ' finds ' + want));
});
test('burpees and landmine work from a trainer session are in the catalog', () => {
  const cat = ctx.buildExerciseCatalog();
  const byName = n => cat.find(e => e.name === n);
  ['Burpee', 'Medicine Ball Burpee', 'Landmine Press', 'Landmine Squat', 'Landmine Row', 'Landmine Twist', 'Landmine Squat to Press'].forEach(n =>
    assertEqual(!!byName(n), true, n + ' present'));
  assertEqual(byName('Burpee').inputType, 'reps_only', 'plain burpee is reps only');
  ['Medicine Ball Burpee', 'Landmine Press', 'Landmine Squat', 'Landmine Row', 'Landmine Twist', 'Landmine Squat to Press'].forEach(n => {
    assertEqual(byName(n).inputType, 'reps_weight', n + ' logs weight and reps');
    assertEqual(Object.keys(ctx.blankSetsFor(byName(n))[0]).join(), 'reps,weight', n + ' set boxes');
    assertEqual(ctx.parseTargetReps(byName(n).target) > 0, true, n + ' has a rep target the coach can read');
  });
});
test('they are found however they are typed', () => {
  const find = q => ctx.buildExerciseCatalog().filter(e => ctx.exerciseMatchesQuery(e.name, q)).map(e => e.name);
  [['burpee', 'Burpee'], ['Burpees', 'Burpee'], ['burpee', 'Medicine Ball Burpee'], ['med ball burpee', 'Medicine Ball Burpee'],
   ['medicine ball burpees', 'Medicine Ball Burpee'], ['burpee with medicine ball', 'Medicine Ball Burpee'], ['weighted burpee', 'Medicine Ball Burpee'],
   ['landmine', 'Landmine Squat'], ['land mine squat', 'Landmine Squat'], ['Land mine row', 'Landmine Row'],
   ['land mine twist', 'Landmine Twist'], ['landmine rotation', 'Landmine Twist'], ['land mine press', 'Landmine Press'],
   ['landmine squat to press', 'Landmine Squat to Press'], ['land mine squat press', 'Landmine Squat to Press'],
   ['landmine thruster', 'Landmine Squat to Press'], ['landmine squat', 'Landmine Squat to Press'], ['landmine squat', 'Landmine Squat']].forEach(([q, want]) =>
    assertEqual(find(q).includes(want), true, '"' + q + '" finds ' + want));
});
test('every catalog entry has its own id (history for one never lands on another)', () => {
  const seen = {}; const dup = [];
  ctx.buildExerciseCatalog().forEach(e => { if (seen[e.id]) dup.push(e.id + ': ' + seen[e.id] + ' / ' + e.name); seen[e.id] = e.name; });
  assertEqual(dup.length, 0, 'duplicate ids: ' + dup.join(', '));
});
console.log('\nOne catalog (requested: "add those to the search so everything is findable in one place"):');
test('every exercise the Alternate button can offer is also in the catalog search', () => {
  const names = new Set(ctx.buildExerciseCatalog().map(e => e.name));
  const missing = new Set();
  Object.values(ctx.ALTERNATES).forEach(list => list.forEach(a => { if (!names.has(a.name)) missing.add(a.name); }));
  assertEqual(missing.size, 0, 'alternates missing from the catalog: ' + [...missing].join(', '));
});
test('no exercise offers the same alternate twice (reported: Lat Pulldown listed twice under Pullups)', () => {
  const dup = [];
  Object.entries(ctx.ALTERNATES).forEach(([k, list]) => { const seen = {}; list.forEach(x => { if (seen[x.name]) dup.push(k + ' -> ' + x.name); seen[x.name] = 1; }); });
  assertEqual(dup.length, 0, 'repeated alternates: ' + dup.join(', '));
});
test('the same movement is one entry, not two near-identical names', () => {
  const names = new Set(ctx.buildExerciseCatalog().map(e => e.name));
  ['Hack Squat', 'Seated Leg Curl', 'Hammer Curl', 'Tricep Pushdown', 'DB Rear Delt Fly', 'Seated Calf Raise', 'Inverted Row'].forEach(n =>
    assertEqual(names.has(n), false, n + ' should resolve to the existing catalog entry'));
  const alt = (from, name) => ctx.getAlternates(from).some(a => a.name === name);
  assertEqual(alt('Leg Press', 'Hack Squat (Machine)'), true, 'Leg Press alternate points at Hack Squat (Machine)');
  assertEqual(alt('Romanian Deadlift', 'Seated Leg Curl (Machine)'), true, 'RDL alternate points at Seated Leg Curl (Machine)');
  assertEqual(alt('Face Pull', 'Dumbbell Reverse Fly'), true, 'Face Pull alternate points at Dumbbell Reverse Fly');
});
test('history stays attached: Alternate and search give the same id, including ids already logged', () => {
  const cat = ctx.buildExerciseCatalog();
  const idOf = n => (cat.find(e => e.name === n) || {}).id;
  assertEqual(idOf('DB Deadlift'), 'swap_db_deadlift', 'DB Deadlift (3 logged sessions)');
  assertEqual(idOf('Seated Row (Machine)'), 'c_ul_er8', 'Seated Row (Machine) is a real catalog exercise');
  // The 3 sessions logged as "Machine Row" (swap_machine_row) still count as Seated Row (Machine) history.
  const savedCache = ctx.ST.sessionCache;
  ctx.ST.sessionCache = [{ sets: { swap_machine_row: [{ reps: '10', weight: '120' }] } }];
  assertEqual(ctx.equivalentExerciseIds('c_ul_er8', 'Seated Row (Machine)').includes('swap_machine_row'), true, 'old Machine Row history is attached');
  ctx.ST.sessionCache = savedCache;
  assertEqual(idOf('Goblet Squat (Heavy)'), 'swap_goblet_squat_heavy', 'Goblet Squat (Heavy) (1 logged session)');
  const base = { id: 'c_ul_to2', name: 'Barbell Row (Pendlay)', target: '4×8', sets: 4, inputType: 'reps_weight' };
  ctx.ST.workout = { taxi: [], takeoff: [base], enroute: [], landing: [] }; ctx.ST.sets = { c_ul_to2: [] }; ctx.ST.expanded = {};
  const realRender = ctx.renderFlight, realToast = ctx.showBigToast; ctx.renderFlight = () => {}; ctx.showBigToast = () => {};
  ctx.swapExercise('c_ul_to2', ctx.getAlternates('Barbell Row (Pendlay)').find(a => a.name === 'Seated Row (Machine)'));
  ctx.renderFlight = realRender; ctx.showBigToast = realToast;
  assertEqual(ctx.ST.workout.takeoff[0].id, 'c_ul_er8', 'swapping through Alternate uses the catalog id');
});
test('catalog entries agree with what each alternate says about its fields', () => {
  const cat = ctx.buildExerciseCatalog(); const bad = [];
  Object.values(ctx.ALTERNATES).forEach(list => list.forEach(a => {
    const c = cat.find(e => e.name === a.name);
    if (c && String(c.id).startsWith('swap_') && a.inputType && a.inputType !== c.inputType) bad.push(a.name + ': alternate ' + a.inputType + ', catalog ' + c.inputType);
  }));
  assertEqual(bad.length, 0, bad.join(' | '));
});
test('no search synonym points at a name that does not exist', () => {
  const names = new Set(ctx.buildExerciseCatalog().map(e => e.name));
  const dead = Object.entries(ctx.EXERCISE_SYNONYMS).filter(([, v]) => !names.has(v)).map(([k, v]) => k + ' -> ' + v);
  assertEqual(dead.length, 0, dead.join(' | '));
});
test('the newly searchable ones are found by plain wording', () => {
  const find = q => ctx.buildExerciseCatalog().filter(e => ctx.exerciseMatchesQuery(e.name, q)).map(e => e.name);
  [['smith squat', 'Smith Machine Squat'], ['smith bench', 'Smith Machine Bench Press'], ['dips', 'Dip'], ['couch stretch', 'Couch Stretch'],
   ['suitcase carry', 'Suitcase Carry'], ['cable curl', 'Cable Curl'], ['upright row', 'Upright Row'], ['woodchop', 'Cable Woodchop'],
   ['machine row', 'Seated Row (Machine)'], ['chest press machine', 'Chest Press (Machine)'], ['booty builder', 'Hip Thrust (Machine)'],
   ['stairs', 'Stair Climber'], ['ab machine', 'Ab Crunch (Machine)'], ['recumbent bicycle', 'Recumbent Bike'], ['goblet squat', 'Goblet Squat'],
   ['rear delt fly', 'Dumbbell Reverse Fly'], ['hammer curl', 'DB Hammer Curl'], ['hack squat', 'Hack Squat (Machine)'], ['tricep pushdown', 'Cable Tricep Pushdown']].forEach(([q, want]) =>
    assertEqual(find(q).includes(want), true, '"' + q + '" finds ' + want));
});
test('a stretch added from the catalog lands in the cooldown with a left/right time box', () => {
  ctx.ST.workout = { taxi: [], takeoff: [], enroute: [], landing: [] }; ctx.ST.sets = {};
  const realRender = ctx.renderFlight, realToast = ctx.showToast; ctx.renderFlight = () => {}; ctx.showToast = () => {};
  ctx.addExistingCatalogExercise(0, 'couch stretch');
  ctx.renderFlight = realRender; ctx.showToast = realToast;
  assertEqual(ctx.ST.workout.landing.length, 1, 'placed in landing');
  const e = ctx.ST.workout.landing[0];
  assertEqual(e.name, 'Couch Stretch', 'name');
  // Couch Stretch is 2×30s/leg: one left/right entry per set its label promises.
  assertEqual(e.target, '2×30s/leg', 'label');
  assertEqual(JSON.stringify(ctx.ST.sets[e.id]), JSON.stringify([{ seconds_left: '', seconds_right: '' }, { seconds_left: '', seconds_right: '' }]), 'a left/right time entry for each of its two sets');
});

test('catalog-only extras never appear in a generated program', () => {
  const extraIds = new Set(ctx.CATALOG_EXTRAS.map(e => e.id));
  let leaked = 0;
  (function walk(v) {
    if (Array.isArray(v)) v.forEach(x => { if (x && x.id) { if (extraIds.has(x.id)) leaked++; } else walk(x); });
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  })(ctx.WORKOUTS);
  assertEqual(leaked, 0, 'extras inside WORKOUTS');
});

console.log('\nSet tiles (reported: "No place to record sets, Add Set does nothing"):');
// No DOM in this sandbox: the state change is what is under test, not the
// toast or the re-render that follow it.
const _renderFlight = ctx.renderFlight, _toast = ctx.showBigToast;
ctx.renderFlight = () => {}; ctx.showBigToast = () => {};
function fakeWorkoutWith(exItem) {
  ctx.ST.workout = { taxi: [], takeoff: [Object.assign({}, exItem)], enroute: [], landing: [] };
  ctx.ST.sets = {}; ctx.ST.expanded = { [exItem.id]: true };
}
const dbRow = everyExercise().find(e => e.name === 'DB Row');
test('swapping an exercise for itself keeps a full set list', () => {
  fakeWorkoutWith(dbRow);
  ctx.ST.sets[dbRow.id] = [{ reps: '', weight: '' }];
  ctx.swapExercise(dbRow.id, { name: dbRow.name, target: dbRow.target, note: dbRow.note, inputType: dbRow.inputType });
  assertEqual((ctx.ST.sets[dbRow.id] || []).length, 4, 'DB Row 4x10 has four sets');
});
test('a card with an empty set list heals itself and renders tiles', () => {
  fakeWorkoutWith(dbRow);
  ctx.ST.sets[dbRow.id] = [];
  const html = ctx.buildExCard(Object.assign({}, dbRow), 'takeoff');
  assertEqual((html.match(/class="set-tile/g) || []).length, 4, 'four tiles rendered');
  assertEqual(ctx.ST.sets[dbRow.id].length, 4, 'state repaired');
});
test('Add Set on an exercise with no sets creates them instead of doing nothing', () => {
  fakeWorkoutWith(dbRow);
  delete ctx.ST.sets[dbRow.id];
  ctx.addLiveSet(dbRow.id);
  assertEqual((ctx.ST.sets[dbRow.id] || []).length, 4, 'sets created');
  ctx.addLiveSet(dbRow.id);
  assertEqual(ctx.ST.sets[dbRow.id].length, 5, 'then one more added');
});
ctx.ST.workout = null; ctx.ST.sets = {}; ctx.ST.expanded = {};
ctx.renderFlight = _renderFlight; ctx.showBigToast = _toast;

console.log('\nSet feedback (reported: "more rest before the next set" on the LAST set):');
const row4x10 = { target: '4×10/side' };
test('final set 2 short after strong early sets: praise, no next-set advice', () => {
  const r = ctx.autoregSuggestion(row4x10, [
    { reps: '12', weight: '50' }, { reps: '12', weight: '50' }, { reps: '10', weight: '50' }, { reps: '8', weight: '50' }]);
  assertEqual(r.tone, 'positive', 'tone');
  assertEqual(/next set/i.test(r.text), false, 'no "next set" on the last set');
  assertEqual(/8 of 10/.test(r.text), true, 'says 8 of 10, not 8/10');
  assertEqual(/42 total reps against 40/.test(r.text), true, 'credits total volume');
});
test('same shortfall mid-exercise still gives between-set advice', () => {
  const r = ctx.autoregSuggestion(row4x10, [
    { reps: '12', weight: '50' }, { reps: '8', weight: '50' }, { reps: '', weight: '' }, { reps: '', weight: '' }]);
  assertEqual(r.tone, 'minor', 'tone');
  assertEqual(/next set/i.test(r.text), true, 'next-set advice');
});
test('big miss on the final set points to next session, not the next set', () => {
  const r = ctx.autoregSuggestion(row4x10, [
    { reps: '10', weight: '60' }, { reps: '8', weight: '60' }, { reps: '6', weight: '60' }, { reps: '5', weight: '60' }]);
  assertEqual(r.tone, 'major', 'tone');
  assertEqual(/next set/i.test(r.text), false, 'no next-set advice');
  assertEqual(/next session/i.test(r.text), true, 'next-session advice');
});
test('hitting target on the final set stays quiet', () => {
  const r = ctx.autoregSuggestion(row4x10, [{ reps: '10', weight: '50' }, { reps: '10', weight: '50' }]);
  assertEqual(r, null, 'no message');
});

console.log('\nLive set feedback (reported: "sometimes I don\'t start the timer and so I don\'t get feedback"):');
test('while typing: waits for BOTH reps and weight before speaking', () => {
  assertEqual(ctx.setFeedbackReady({ reps: '8', weight: '' }, false), false, 'reps only, still typing');
  assertEqual(ctx.setFeedbackReady({ reps: '', weight: '50' }, false), false, 'weight only, still typing');
  assertEqual(ctx.setFeedbackReady({ reps: '8', weight: '50' }, false), true, 'both entered');
});
test('after leaving the set: reps alone is enough (bodyweight sets have no weight)', () => {
  assertEqual(ctx.setFeedbackReady({ reps: '8', weight: '' }, true), true, 'reps, left the tile');
  assertEqual(ctx.setFeedbackReady({ reps: '', weight: '50' }, true), false, 'no reps yet');
  assertEqual(ctx.setFeedbackReady(undefined, true), false, 'no set at all');
});
test('feedback box redraws in place from the logged sets, no timer or full re-render', () => {
  const exItem = { id: 'fb1', name: 'DB Row', target: '4×10', sets: 4 };
  ctx.ST.workout = { taxi: [], takeoff: [exItem], enroute: [], landing: [] };
  ctx.ST.sets = { fb1: [{ reps: '12', weight: '50' }, { reps: '8', weight: '50' }, { reps: '', weight: '' }, { reps: '', weight: '' }] };
  const box = { innerHTML: '' };
  const realGet = ctx.document.getElementById;
  let fullRenders = 0; const realRender = ctx.renderFlight; ctx.renderFlight = () => { fullRenders++; };
  ctx.document.getElementById = id => id === 'ar_fb1' ? box : null;
  ctx.refreshSetFeedback('fb1');
  assertEqual(/8 of 10/.test(box.innerHTML), true, 'shows the miss');
  assertEqual(/next set/i.test(box.innerHTML), true, 'mid-exercise advice');
  ctx.ST.sets.fb1[1].reps = '10';
  ctx.refreshSetFeedback('fb1');
  assertEqual(box.innerHTML, '', 'cleared once the set is on target');
  assertEqual(fullRenders, 0, 'never re-rendered the whole screen');
  ctx.document.getElementById = realGet; ctx.renderFlight = realRender;
});
test('exercise card carries the feedback slot and both inputs feed it', () => {
  const exItem = { id: 'fb2', name: 'DB Row', target: '4×10', sets: 4 };
  ctx.ST.workout = { taxi: [], takeoff: [exItem], enroute: [], landing: [] };
  ctx.ST.sets = { fb2: [{ reps: '', weight: '' }, { reps: '', weight: '' }] };
  ctx.ST.expanded = { fb2: true };
  const html = ctx.buildExCard(exItem, 'takeoff');
  assertEqual(html.includes('id="ar_fb2"'), true, 'feedback slot present even with nothing to say');
  const typing = (html.match(/queueSetFeedback\('fb2',\d+,false\)/g) || []).length;
  const leaving = (html.match(/queueSetFeedback\('fb2',\d+,true\)/g) || []).length;
  assertEqual(typing, 4, 'reps + weight on each of 2 sets, while typing');
  assertEqual(leaving, 4, 'reps + weight on each of 2 sets, on leaving the field');
});

console.log('\nReps-only feedback (requested: "also for reps only, after 1.2 seconds of typing"):');
test('rep target is only read from a real rep count, never a time or distance', () => {
  [['4×10', 10], ['3×8/leg', 8], ['3×10/side', 10], ['4×8-12', 8], ['10 reps', 10], ['3×15 steps/side', 15]].forEach(([t, want]) =>
    assertEqual(ctx.parseTargetReps(t), want, t));
  ['3×40yd', '8×30s', '6×500m', '8×1 min', '3×max', '2x20yd', '6×45s', '20 min', '6×2 flights'].forEach(t =>
    assertEqual(ctx.parseTargetReps(t), null, t + ' has no rep target'));
});
test('reps-only set is ready as soon as reps are typed, no weight to wait for', () => {
  assertEqual(ctx.setFeedbackReady({ reps: '8' }, false, true), true, 'reps-only, typing');
  assertEqual(ctx.setFeedbackReady({ reps: '' }, false, true), false, 'nothing typed');
  assertEqual(ctx.setFeedbackReady({ reps: '8', weight: '' }, false, false), false, 'weighted set still waits for weight');
});
test('reps-only working set gets feedback worded without any weight advice', () => {
  const split = { id: 'ro1', name: 'Single Leg Split Squat', target: '3×8/leg', sets: 3, inputType: 'reps_only' };
  const mid = ctx.setFeedbackFor(split, 'enroute', [{ reps: '8' }, { reps: '6' }, { reps: '' }]);
  assertEqual(/6 of 8/.test(mid.text), true, 'names the miss');
  assertEqual(/weight|\blb\b/i.test(mid.text), false, 'no weight talk on a bodyweight move: ' + mid.text);
  const big = ctx.setFeedbackFor(split, 'enroute', [{ reps: '8' }, { reps: '3' }, { reps: '' }]);
  assertEqual(/weight|\blb\b/i.test(big.text), false, 'no weight talk on a big miss: ' + big.text);
  const fin = ctx.setFeedbackFor(split, 'enroute', [{ reps: '9' }, { reps: '8' }, { reps: '7' }]);
  assertEqual(fin.tone, 'positive', 'final near-miss is a strong finish');
  assertEqual(/weight|\blb\b|next set/i.test(fin.text), false, 'final set: no weight, no next set: ' + fin.text);
  const finBig = ctx.setFeedbackFor(split, 'enroute', [{ reps: '8' }, { reps: '5' }, { reps: '3' }]);
  assertEqual(/weight|\blb\b|next set/i.test(finBig.text), false, 'final big miss: ' + finBig.text);
  assertEqual(/—/.test(mid.text + big.text + fin.text + finBig.text), false, 'no em dashes');
});
test('weighted exercise keeps its weight advice', () => {
  const row = { id: 'rw1', name: 'DB Row', target: '4×10', sets: 4, inputType: 'reps_weight' };
  const r = ctx.setFeedbackFor(row, 'enroute', [{ reps: '10', weight: '50' }, { reps: '5', weight: '50' }, { reps: '', weight: '' }, { reps: '', weight: '' }]);
  assertEqual(/weight/i.test(r.text), true, 'still talks about the weight');
});
test('warmup and cooldown reps-only moves stay quiet', () => {
  const circles = { id: 'ro2', name: 'Ankle Circles', target: '20 reps', sets: 1, inputType: 'reps_only' };
  assertEqual(ctx.setFeedbackFor(circles, 'taxi', [{ reps: '10' }]), null, 'taxi');
  assertEqual(ctx.setFeedbackFor(circles, 'landing', [{ reps: '10' }]), null, 'landing');
});
test('reps-only card carries the feedback slot and its input feeds it', () => {
  const split = { id: 'ro3', name: 'Single Leg Split Squat', target: '3×8/leg', sets: 3, inputType: 'reps_only' };
  ctx.ST.workout = { taxi: [], takeoff: [], enroute: [split], landing: [] };
  ctx.ST.sets = { ro3: [{ reps: '8' }, { reps: '6' }, { reps: '' }] };
  ctx.ST.expanded = { ro3: true };
  const html = ctx.buildExCard(split, 'enroute');
  assertEqual(html.includes('id="ar_ro3"'), true, 'slot present');
  assertEqual(/6 of 8/.test(html), true, 'feedback drawn on render too');
  assertEqual((html.match(/queueSetFeedback\('ro3',\d+,false\)/g) || []).length, 3, 'typing trigger on each set');
  assertEqual((html.match(/queueSetFeedback\('ro3',\d+,true\)/g) || []).length, 3, 'leave-field trigger on each set');
});

console.log('\nInjury swaps (found: "4×10" label with 3 set boxes after a shoulder swap):');
test('lower back swap of Back Squat gets the 4 sets its label promises', () => {
  // Was DB Overhead Press -> DB Incline Press for a shoulder. The Nov 12
  // review tags every press as shoulder load, so that is a caution now.
  ctx.ST.injuries = ['lower_back'];
  const out = ctx.applyInjuryFilter({ id: 'h_lo_to1', name: 'Back Squat', target: '3×10', sets: 3, note: '', timed: false, inputType: 'reps_weight' });
  ctx.ST.injuries = [];
  assertEqual(out.swappedForInjury, true, 'swapped');
  assertEqual(out.name, 'Goblet Squat (Heavy)', 'front-loaded squat');
  assertEqual(out.target, '4×10', 'label');
  assertEqual(out.sets, 4, 'set count follows the new label');
  assertEqual(ctx.blankSetsFor(out).length, 4, 'four boxes');
});
console.log('\nInjury flags (reported Nov 12: Thoracic Extension warned about a flagged elbow):');
test('every catalog exercise has a reviewed injury entry', () => {
  const missing = ctx.buildExerciseCatalog().map(e => e.name).filter(n => !Object.prototype.hasOwnProperty.call(vm.runInContext('EX_REGION_TAGS', ctx), n));
  assertEqual(missing.join(', '), '', 'add each new exercise to EX_REGION_TAGS in app.js');
  Object.entries(vm.runInContext('EX_REGION_TAGS', ctx)).forEach(([n, t]) => { if (!/^([SEBHKAN]( [SEBHKAN])*)?$/.test(t)) throw new Error('bad codes for ' + n + ': ' + t); });
});
test('flags follow the joint that takes the load, not words in the name', () => {
  const t = n => ctx.exerciseRegionTags(n).join(',');
  assertEqual(t('Thoracic Extension (chair)'), '', 'thoracic extension is not an elbow exercise');
  assertEqual(t('Leg Extension (Machine)'), 'knee', 'leg extension is knee only');
  assertEqual(t('Back Extension (Machine)'), 'lower_back', 'back extension is lower back only');
  assertEqual(t('Lying Leg Curl (Machine)'), 'knee', 'leg curl is knee, not elbow');
  assertEqual(t('Bicycle Crunch').includes('ankle_foot'), false, '"Run" inside "Crunch" is not running');
  assertEqual(t('Upright Row').includes('lower_back'), false, 'upright row is not a lower back lift');
  assertEqual(t('Bench Press'), 'shoulder,elbow_wrist', 'bench press loads shoulder and elbow');
  assertEqual(t('Pullups'), 'shoulder,elbow_wrist', 'pullups load shoulder and elbow');
  assertEqual(t('Dip'), 'shoulder,elbow_wrist', 'dips load shoulder and elbow');
  assertEqual(t('Lateral Raise (Machine)'), 'shoulder', 'lateral raise still flags the shoulder');
});
test('shoulder rotation is in every upper body warm-up that has a cable or a band (requested Nov 14)', () => {
  ctx.ST.injuries = [];
  const names = (env, mg) => ctx.getCombinedWorkout(env, mg).taxi.map(e => e.name);
  ['Upper Push', 'Upper Pull'].forEach(mg => {
    assertEqual(names('comm', mg).includes('Cable Shoulder External Rotation'), true, 'gym ' + mg);
    assertEqual(names('hotel', mg).includes('Cable Shoulder External Rotation'), true, 'hotel gym ' + mg);
    assertEqual(names('band', mg).includes('Band Shoulder External Rotation'), true, 'bands ' + mg);
    assertEqual(names('band', mg).some(n => /^Cable/.test(n)), false, 'no cable exercise in a band warm-up');
    assertEqual(names('room', mg).some(n => /Shoulder (External|Internal) Rotation/.test(n)), false, 'hotel room has no cable or band');
  });
  const cat = ctx.buildExerciseCatalog().filter(e => /Shoulder (External|Internal) Rotation/.test(e.name));
  assertEqual(cat.length, 4, 'four catalog entries'); assertEqual(cat.every(e => e.phase === 'taxi'), true, 'all four are warm-up exercises');
});
test('a flagged shoulder keeps the rotation work and adds internal rotation', () => {
  ctx.ST.injuries = ['shoulder'];
  const taxi = (env, mg) => ctx.getCombinedWorkout(env, mg).taxi;
  ['Upper Push', 'Upper Pull', 'Full Body'].forEach(mg => {
    const n = taxi('comm', mg).map(e => e.name);
    assertEqual(n.includes('Cable Shoulder External Rotation') && n.includes('Cable Shoulder Internal Rotation'), true, 'gym ' + mg + ': ' + n.join(', '));
    assertEqual(n.filter(x => x === 'Cable Shoulder External Rotation').length, 1, 'not listed twice');
    const b = taxi('band', mg).map(e => e.name);
    assertEqual(b.includes('Band Shoulder External Rotation') && b.includes('Band Shoulder Internal Rotation'), true, 'bands ' + mg);
  });
  const er = taxi('comm', 'Upper Push').find(e => e.name === 'Cable Shoulder External Rotation');
  assertEqual(!!er.injuryCaution || !!er.swappedForInjury, false, 'not flagged or swapped away');
  assertEqual(ctx.getCombinedWorkout('comm', 'Lower Body').taxi.some(e => /Shoulder/.test(e.name)), false, 'leg day is left alone');
  ctx.ST.injuries = [];
});
test('Fuel Plan names what is missing, and the profile takes a weight (reported Nov 16: sex, age and height saved, still blocked)', () => {
  const keep = { sex: ctx.ST.sex, age: ctx.ST.age, h: ctx.ST.heightIn, w: ctx.ST.lastWeight };
  ctx.ST.sex = 'female'; ctx.ST.age = 21; ctx.ST.heightIn = 63; ctx.ST.lastWeight = null;
  assertEqual(ctx.nutritionGoalsMissing().join(','), 'weight', 'only weight is missing');
  assertEqual(ctx.nutritionGoalsComplete(), false, 'still blocked without a weight');
  ctx.ST.lastWeight = ctx.cleanBodyWeight('131.5');
  assertEqual(ctx.ST.lastWeight, 131.5, 'weight accepted'); assertEqual(ctx.nutritionGoalsComplete(), true, 'unblocked');
  assertEqual(ctx.cleanBodyWeight(''), null, 'blank is not a weight'); assertEqual(ctx.cleanBodyWeight('12'), null, 'out of range');
  assertEqual(ctx.cleanBodyWeight('165,4'), 165.4, 'comma decimal');
  ctx.ST.sex = keep.sex; ctx.ST.age = keep.age; ctx.ST.heightIn = keep.h; ctx.ST.lastWeight = keep.w;
});
test('food search: servings match the label, whole-phrase matches first (reported Nov 16: turkey sandwich)', () => {
  const kcal = v => [{ nutrientName: 'Energy', value: v, unitName: 'KCAL' }, { nutrientName: 'Protein', value: 13.2, unitName: 'G' }];
  const branded = ctx.usdaServingFields({ dataType: 'Branded', servingSize: 151, servingSizeUnit: 'g', householdServingFullText: '1 PACKAGE', foodNutrients: kcal(205) });
  assertEqual(branded.nutrients.calories, 309.6, 'a 151 g package logs 151 g of calories, not 100 g');
  assertEqual(branded.servingLabel, '1 package, 151 g', 'label names the serving');
  const survey = ctx.usdaServingFields({ dataType: 'Survey (FNDDS)', foodNutrients: kcal(187),
    foodMeasures: [{ disseminationText: '1 large', gramWeight: 175 }, { disseminationText: 'Quantity not specified', gramWeight: 115 }, { disseminationText: '1 regular', gramWeight: 115 }] });
  assertEqual(survey.servingLabel, '1 regular, 115 g', 'USDA default portion, named');
  assertEqual(survey.nutrients.calories, 215.1, 'scaled to that portion');
  const plain = ctx.usdaServingFields({ dataType: 'SR Legacy', foodNutrients: kcal(165) });
  assertEqual(plain.servingLabel, null, 'staples stay per 100 g'); assertEqual(plain.nutrients.calories, 165, 'unchanged');
  assertEqual(ctx.extractUSDANutrients({ foodNutrients: [{ nutrientName: 'Energy', value: 615, unitName: 'kJ' }, { nutrientName: 'Energy', value: 147, unitName: 'KCAL' }] }).calories, 147, 'kilojoules are not calories');
  assertEqual(ctx.usdaHasAllWords('Turkey sandwich on wheat', 'turkey sandwich'), true, 'both words');
  assertEqual(ctx.usdaHasAllWords('Bologna, turkey', 'turkey sandwich'), false, 'one word only');
});
test('profile pictures: only a member\'s own avatar path is ever drawn (requested Nov 16)', () => {
  const uid = '11111111-2222-3333-4444-555555555555';
  assertEqual(ctx.cleanAvatarPath(uid + '/avatar/abc123xyz.jpg'), uid + '/avatar/abc123xyz.jpg', 'a real path passes');
  assertEqual(ctx.cleanAvatarPath(uid + '/avatar/x" onerror="alert(1).jpg'), null, 'markup in a path is refused');
  assertEqual(ctx.cleanAvatarPath('https://evil.example/a.jpg'), null, 'an outside address is refused');
  assertEqual(ctx.cleanAvatarPath(null), null, 'nothing stays nothing');
  assertEqual(ctx.avatarInitials('Maverick PHX'), 'MP', 'two words'); assertEqual(ctx.avatarInitials('maverick'), 'MA', 'one word'); assertEqual(ctx.avatarInitials(''), '✈', 'no name');
  const keep = ctx.ST.crew.avatars; ctx.ST.crew.avatars = { [uid]: uid + '/avatar/abc123xyz.jpg' };
  assertEqual(ctx.avatarPathFor(uid), uid + '/avatar/abc123xyz.jpg', 'picture found for that member');
  assertEqual(/<img /.test(ctx.avatarHtml('someone-else', 'Goose', 36)), false, 'no picture: initials');
  assertEqual(ctx.avatarHtml('someone-else', '<b>x', 36).includes('<b>'), false, 'name is escaped');
  ctx.ST.crew.avatars = keep;
});
test('every emoji the app can put on screen has a line icon (reported Nov 16: emoji read as machine-made)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
  const i = src.indexOf('// ICONS:BEGIN'), j = src.indexOf('// ICONS:END');
  const code = (src.slice(0, i) + src.slice(j)).split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  const map = vm.runInContext('EMOJI_ICONS', ctx), keep = vm.runInContext('EMOJI_KEEP', ctx), shapes = vm.runInContext('ICON_PATHS', ctx);
  const left = new Set();
  for (const m of code.matchAll(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF\u2B00-\u2BFF\u2190-\u21FF\u2300-\u23FF]\uFE0F?/gu)) {
    const e = m[0], bare = e.replace('\uFE0F', '');
    if (!(e in map) && !(bare in map) && !keep.includes(bare)) left.add(e);
  }
  assertEqual([...left].join(' '), '', 'add each to the table in scripts/build_icons.py and run it');
  const missing = Object.values(map).map(v => v.split(':')[0]).filter(n => !shapes[n]);
  assertEqual(missing.join(' '), '', 'every icon named in the table has a shape');
  const parts = ctx.emojiSplit('📷 Photo ⚠️ go light ✓');
  assertEqual(parts.map(p => p.icon || p.text).join('|'), 'camera| Photo |triangle-alert| go light ✓', 'emoji become icons, text and plain marks stay');
  assertEqual(parts[2].tone, 'warn', 'a warning keeps its colour');
  assertEqual(ctx.emojiSplit('✈ FLIGHT CREW FITNESS → ✓'), null, 'the logo plane, arrows and ticks are left as type');
  assertEqual(ctx.foodEmoji('Turkey sandwich'), '', 'food rows carry no picture');
});
test('units: pounds or kilograms, liters or ounces; storage stays in pounds and liters (requested Nov 16)', () => {
  const keep = ctx.ST.units;
  try {
  ctx.ST.units = { weight: 'lb', water: 'L', distance: 'mi' };
  assertEqual(ctx.distStr(3.1), '3.1 mi', 'miles shown as stored'); assertEqual(ctx.formatPace(480), '8:00/mi', 'pace per mile');
  assertEqual(ctx.distFromInput('3.'), '3.', 'a half-typed mile value is stored as typed');
  assertEqual(ctx.wtStr(135), '135 lb', 'pounds shown as stored');
  assertEqual(ctx.wtInputVal('22.'), '22.', 'a half-typed pound value is left alone'); assertEqual(ctx.wtFromInput('22.'), '22.', 'and stored as typed');
  assertEqual(ctx.waterStr(2.4), '2.4 L', 'liters'); assertEqual(ctx.waterFromInput('1.5'), 1.5, 'liters typed');
  assertEqual(ctx.nextWeightFrom(135, 'Bench Press', null), 137.5, 'pound steps unchanged');
  assertEqual(ctx.nextWeightFrom(37.5, 'DB Bench Press', null), 40, 'dumbbells still go up to the next 5 lb');
  ctx.ST.units = { weight: 'kg', water: 'oz' };
  assertEqual(ctx.wtFromInput('100'), '220.46', '100 kg is kept as 220.46 lb');
  assertEqual(ctx.wtInputVal('220.46'), '100', 'and reads back as 100');
  assertEqual(ctx.wtInputVal(ctx.wtFromInput('62.5')), '62.5', 'half kilograms survive the round trip');
  assertEqual(ctx.wtInputVal(ctx.wtFromInput('61.25')), '61.25', 'so do 1.25 kg plates');
  assertEqual(ctx.wtStr(135), '61.23 kg', 'an old pound entry shown in kilograms');
  assertEqual(ctx.wtStr(225, 'round'), '102 kg', 'leaderboards round to the half kilogram');
  assertEqual(ctx.wtFromInput(''), '', 'an empty box stays empty');
  const nextKg = ctx.nextWeightFrom(100 * 2.2046226218, 'Bench Press', null) / 2.2046226218;
  assertEqual(Math.round(nextKg * 100) / 100, 102.5, 'a kilogram target lands on a real plate (100 kg to 102.5 kg)');
  const offGrid = ctx.nextWeightFrom(135, 'Bench Press', null) / 2.2046226218;
  assertEqual(Math.round(offGrid * 100) / 100, 62.5, 'a 135 lb lift (61.23 kg) gets a 62.5 kg target, not 62.48');
  const dbKg = ctx.nextWeightFrom(16 * 2.2046226218, 'DB Bench Press', null) / 2.2046226218;
  assertEqual(Math.round(dbKg * 100) / 100, 17.5, 'kilogram dumbbells go up to the next 2.5 kg');
  assertEqual(ctx.waterStr(2.4), '81 oz', 'ounces'); assertEqual(Math.round(ctx.waterFromInput('32') * 1000) / 1000, 0.946, '32 oz kept as liters');
  assertEqual(ctx.waterSip(0.25), '8 oz', 'a sip in ounces');
  assertEqual(JSON.stringify(ctx.cleanUnits({ weight: 'stone', water: 5 })), '{"weight":"lb","water":"L","distance":"mi"}', 'anything unknown falls back to pounds, liters and miles');
  assertEqual(/Kilograms/.test(ctx.renderUnitsControl()) && /Ounces/.test(ctx.renderUnitsControl()) && /Kilometers/.test(ctx.renderUnitsControl()), true, 'the picker offers all three');
  ctx.ST.units = { weight: 'lb', water: 'L', distance: 'km' };
  assertEqual(ctx.distStr(3.107), '5 km', 'a 5K reads as 5 km');
  assertEqual(ctx.distInputVal(ctx.distFromInput('10')), '10', '10 km survives the round trip');
  assertEqual(ctx.distFromInput('10'), '6.214', '10 km is kept as 6.214 miles');
  assertEqual(ctx.formatPace(480), '4:58/km', 'an 8:00 mile is a 4:58 kilometer');
  assertEqual(ctx.formatMiPace(6.214, 3000), '10 km · 5:00/km', 'leaderboard line in kilometers');
  assertEqual(ctx.paceClock(96.5), '1:00', 'seconds never read as :60');
  assertEqual(ctx.runWeeklyChoices().map(c => c[1]).join(','), '15,25,30,40,50,65', 'weekly targets offered in kilometers');
  assertEqual(ctx.crewStatLine({ miles: 3.107, seconds: 1500, kind: 'run' }).startsWith('5 km'), true, 'crew feed line in kilometers');
  } finally { ctx.ST.units = keep; }
});
test('members with an uploaded schedule are asked for next month once it should be out (requested Nov 16)', () => {
  const ev = (s, e) => ({ start: new Date(s).toISOString(), end: new Date(e).toISOString(), summary: 'trip' });
  const nov = [ev('2026-11-03T14:00:00', '2026-11-06T22:00:00'), ev('2026-11-27T14:00:00', '2026-11-30T22:00:00')];
  const P = (d, events, src) => ctx.scheduleUploadPrompt(new Date(d), events, src === undefined ? 'ics' : src);
  assertEqual(P('2026-11-16T10:00:00', nov), null, 'the 16th: too early to ask');
  assertEqual(P('2026-11-20T10:00:00', nov).kind, 'next_month', 'the 20th: ask for next month');
  assertEqual(/December/.test(P('2026-11-20T10:00:00', nov).title), true, 'and name the month');
  assertEqual(P('2026-11-22T10:00:00', nov.concat([ev('2026-12-02T14:00:00', '2026-12-05T22:00:00')])), null, 'December already in the file: quiet');
  assertEqual(P('2026-12-03T10:00:00', nov).kind, 'ended', 'the file has run out: say so');
  assertEqual(P('2026-11-22T10:00:00', nov, 'calendar'), null, 'a connected calendar is never asked');
  assertEqual(P('2026-11-22T10:00:00', []), null, 'no schedule at all is the other card\'s job');
  const early = [ev('2026-11-03T14:00:00', '2026-11-12T22:00:00')];
  assertEqual(P('2026-11-09T10:00:00', early).kind, 'next_month', 'a file that runs out within five days asks before the 20th');
  assertEqual(P('2026-12-22T10:00:00', [ev('2026-12-02T14:00:00', '2026-12-28T22:00:00')]).title, 'Got your January schedule?', 'December asks for January');
  const T = (d, events) => ctx.scheduleUploadAlertTime(new Date(d), events, 'ics');
  const at = T('2026-11-16T10:00:00', nov);
  assertEqual([at.getMonth(), at.getDate(), at.getHours()].join(','), '10,20,9', 'reminder at 9:00 on the 20th');
  assertEqual(T('2026-11-21T10:00:00', nov).getMonth(), 11, 'past the 20th: next month\'s 20th');
  assertEqual(T('2026-11-16T10:00:00', nov.concat([ev('2026-12-02T14:00:00', '2026-12-05T22:00:00')])).getMonth(), 11, 'December already uploaded: skip to the December reminder');
  assertEqual(ctx.scheduleUploadAlertTime(new Date('2026-11-16T10:00:00'), [], 'ics'), null, 'nothing uploaded: no reminder');
  assertEqual(ctx.scheduleUploadPrompt(new Date('2026-11-16T10:00:00'), nov, 'ics', 15).kind, 'next_month', 'a member whose schedule comes out on the 15th is asked on the 16th');
  assertEqual(ctx.scheduleUploadPrompt(new Date('2026-11-21T10:00:00'), nov, 'ics', 25), null, 'and one set to the 25th is not asked on the 21st');
  assertEqual(ctx.scheduleUploadAlertTime(new Date('2026-11-16T10:00:00'), nov, 'ics', 25).getDate(), 25, 'the reminder moves with the chosen day');
  assertEqual([ctx.cleanScheduleOutDay(31), ctx.cleanScheduleOutDay('x'), ctx.cleanScheduleOutDay(7)].join(','), '20,20,7', 'only days 1 to 28; anything else is the 20th');
  assertEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 28].map(ctx.ordinalDay).join(' '), '1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 23rd 28th', 'day names read correctly');
});
test('Apple Calendar connected but no flights this month: ask for the .ics (requested Nov 19)', () => {
  const N = ctx.calendarHasNoFlightsThisMonth, now = new Date('2026-11-19T10:00:00');
  const fl = d => ({ type: 'flight', start: d }), pers = d => ({ type: 'personal', start: d });
  assertEqual(N(now, [pers('2026-11-20T09:00:00')], [], true), true, 'personal events only: ask');
  assertEqual(N(now, [fl('2026-12-02T09:00:00')], [], true), true, 'flights next month only: still ask for this month');
  assertEqual(N(now, [fl('2026-11-03T09:00:00')], [], true), false, 'a flight earlier this month counts');
  assertEqual(N(now, [fl('2026-11-30T23:00:00')], [], true), false, 'a flight on the last day of the month counts');
  assertEqual(N(now, [pers('2026-11-20T09:00:00')], [{ start: '2026-11-22T14:00:00' }], true), false, 'an uploaded schedule covering this month: no ask');
  assertEqual(N(now, [pers('2026-11-20T09:00:00')], [{ start: '2026-10-22T14:00:00' }], true), true, 'an uploaded schedule from last month does not count');
  assertEqual(N(now, null, [], true), false, 'calendar not read yet: no ask');
  assertEqual(N(now, [pers('2026-11-20T09:00:00')], [], false), false, 'calendar not connected: no ask');
  assertEqual(N(now, [{ type: 'unknown', start: '2026-11-20T09:00:00' }], [], true), false, 'every event untyped means the flight detector did not run: do not claim there are no flights');
  assertEqual(N(now, [{ type: 'unknown', start: '2026-11-20T09:00:00' }, pers('2026-11-21T09:00:00')], [], true), true, 'one event the detector could not type, among typed ones, is not a flight');
});
test('daily drink goal: a base for every day, a little for flying, some for a workout (decided Nov 16)', () => {
  const k = { sex: ctx.ST.sex, hrs: ctx.ST.flightHrs, water: ctx.ST.water, cache: ctx.ST.sessionCache, units: ctx.ST.units };
  try {
    ctx.ST.units = { weight: 'lb', water: 'L', distance: 'mi' }; ctx.ST.sessionCache = []; ctx.ST.water = null; ctx.ST.flightHrs = 0;
    ctx.ST.sex = 'male';   assertEqual(ctx.hydroTarget(), 3.0, 'day off, man: 3.0 L (it used to be 1.0)');
    ctx.ST.sex = 'female'; assertEqual(ctx.hydroTarget(), 2.2, 'day off, woman: 2.2 L');
    ctx.ST.sex = null;     assertEqual(ctx.hydroTarget(), 2.6, 'sex not set: 2.6 L');
    ctx.ST.sex = 'male'; ctx.ST.flightHrs = 8;
    assertEqual(ctx.hydroTarget(), 3.8, '8 flight hours add 0.8 L');
    ctx.ST.sessionCache = [{ date: new Date().toISOString() }];
    assertEqual(ctx.hydroTarget(), 4.3, 'a workout today adds 0.5 L');
    assertEqual(JSON.stringify(ctx.hydroTargetParts()), '{"base":3,"flight":0.8,"workout":0.5,"total":4.3,"custom":false}', 'the parts add up');
    ctx.ST.water = { goalL: 2.5, flightBump: false, workoutBump: true };
    assertEqual(ctx.hydroTarget(), 3.0, 'own goal 2.5 L, flying addition off, workout on');
    ctx.ST.water = { goalL: 2.5, flightBump: false, workoutBump: false };
    assertEqual(ctx.hydroTarget(), 2.5, 'both additions off: just the goal');
    assertEqual(JSON.stringify(ctx.cleanWaterPrefs({ goalL: 40 })), '{"goalL":null,"flightBump":true,"workoutBump":true}', 'an absurd goal is dropped; additions default on');
    assertEqual(JSON.stringify(ctx.cleanWaterPrefs(null)), '{"goalL":null,"flightBump":true,"workoutBump":true}', 'nothing saved: recommended goal, additions on');
    ctx.ST.trackHydration = true; ctx.ST.water = null;
    assertEqual(/DAILY DRINK GOAL/.test(ctx.renderWaterGoalControl()) && /coffee and tea/.test(ctx.renderWaterGoalControl()), true, 'the settings card says every drink counts');
    assertEqual(vm.runInContext("WISDOM.some(w => /0\\.3 ?L/.test(w.text))", ctx), false, 'no wisdom card still cites 0.3 L per flight hour');
  } finally { ctx.ST.sex = k.sex; ctx.ST.flightHrs = k.hrs; ctx.ST.water = k.water; ctx.ST.sessionCache = k.cache; ctx.ST.units = k.units; }
});
test('a workout reopened mid-session drops a caution that no longer applies', () => {
  ctx.ST.injuries = ['shoulder', 'elbow_wrist'];
  const wk = ctx.refreshInjuryCautions({ taxi: [{ id: 'a', name: 'Thoracic Extension (chair)', injuryCaution: true, flaggedRegion: 'Elbow / Wrist' }],
    takeoff: [{ id: 'b', name: 'Bench Press' }], enroute: [{ id: 'c', name: 'Lateral Raise (Machine)', injuryCaution: true, flaggedRegion: 'Shoulder' }], landing: [] });
  ctx.ST.injuries = [];
  assertEqual(!!wk.taxi[0].injuryCaution, false, 'stale elbow caution removed'); assertEqual(wk.taxi[0].flaggedRegion, undefined, 'label removed');
  assertEqual(wk.takeoff[0].flaggedRegion, 'Shoulder and Elbow / Wrist', 'bench press picks up its caution');
  assertEqual(wk.enroute[0].flaggedRegion, 'Shoulder', 'real caution kept');
});
test('a flagged stretch with no safe alternate swaps to a safe move for the same body area', () => {
  ctx.ST.injuries = ['shoulder', 'elbow_wrist'];
  const used = new Set(['Doorframe Chest Stretch', 'Lat Overhead Stretch', 'Diaphragmatic Breathing']);
  const a = ctx.applyInjuryFilter({ id: 'l1', name: 'Doorframe Chest Stretch', target: '60s/side', sets: 1, note: '', timed: true, inputType: 'timed_bilateral' }, 'landing', used);
  const b = ctx.applyInjuryFilter({ id: 'l2', name: 'Lat Overhead Stretch', target: '60s/side', sets: 1, note: '', timed: true, inputType: 'timed_bilateral' }, 'landing', used);
  const c = ctx.applyInjuryFilter({ id: 'e1', name: 'Lateral Raise (Machine)', target: '3×12', sets: 3, note: '', timed: false, inputType: 'reps_weight' }, 'enroute', used);
  ctx.ST.injuries = [];
  assertEqual(a.swappedForInjury, true, 'chest stretch swapped'); assertEqual(b.swappedForInjury, true, 'lat stretch swapped');
  assertEqual(a.name !== b.name, true, 'two different stand-ins (' + a.name + ', ' + b.name + ')');
  assertEqual([a, b].some(x => x.name === 'Diaphragmatic Breathing'), false, 'never doubles an exercise already in the workout');
  [a, b].forEach(x => assertEqual(ctx.exerciseRegionTags(x.name).some(t => t === 'shoulder' || t === 'elbow_wrist'), false, x.name + ' is safe for both flags'));
  assertEqual(c.injuryCaution, true, 'lateral raise: no honest swap, caution stays'); assertEqual(!!c.swappedForInjury, false, 'not swapped');
});
test('every stand-in is a real catalog exercise', () => {
  const names = new Set(ctx.buildExerciseCatalog().map(e => e.name));
  const pools = vm.runInContext('INJURY_PHASE_POOLS', ctx);
  const missing = [].concat(...Object.values(pools).map(p => [...p.upper, ...p.lower])).filter(n => !names.has(n));
  assertEqual(missing.join(', '), '', 'pool names must exist in the catalog');
});
test('reopening a workout swaps untouched flagged exercises and leaves logged ones', () => {
  ctx.ST.injuries = ['shoulder'];
  const sets = { l1: [{ seconds_left: '', seconds_right: '' }], l2: [{ seconds_left: '60', seconds_right: '' }] };
  const wk = ctx.refreshInjuryCautions({ taxi: [], takeoff: [], enroute: [],
    landing: [{ id: 'l1', name: 'Doorframe Chest Stretch', target: '60s/side', sets: 1, timed: true, inputType: 'timed_bilateral', injuryCaution: true, flaggedRegion: 'Shoulder' },
              { id: 'l2', name: 'Lat Overhead Stretch', target: '60s/side', sets: 1, timed: true, inputType: 'timed_bilateral', injuryCaution: true, flaggedRegion: 'Shoulder' }] }, sets);
  ctx.ST.injuries = [];
  assertEqual(wk.landing[0].swappedForInjury, true, 'untouched stretch swapped'); assertEqual(sets.l1, undefined, 'its blank boxes cleared');
  assertEqual(wk.landing[1].name, 'Lat Overhead Stretch', 'a stretch with time logged stays'); assertEqual(wk.landing[1].injuryCaution, true, 'and keeps its caution');
  assertEqual(sets.l2[0].seconds_left, '60', 'logged time kept');
});
test('names outside the catalog use whole-word patterns', () => {
  const t = n => ctx.exerciseRegionTags(n).join(',');
  assertEqual(t('Reverse Crunch on Bench'), 'lower_back', 'custom crunch');
  assertEqual(t('Thoracic Extension on Roller'), '', 'custom extension');
  assertEqual(t('Swiss Ball Leg Curl'), 'knee', 'custom leg curl');
  assertEqual(t('Spider Curl'), 'elbow_wrist', 'custom arm curl');
  assertEqual(t('Trail Run'), 'hip,knee,ankle_foot', 'custom run');
});
test('a caution names every flagged region the exercise loads', () => {
  ctx.ST.injuries = ['shoulder', 'elbow_wrist'];
  const out = ctx.applyInjuryFilter({ id: 'x1', name: 'Bench Press', target: '3×8', sets: 3, note: '', timed: false, inputType: 'reps_weight' });
  const clean = ctx.applyInjuryFilter({ id: 'x2', name: 'Thoracic Extension (chair)', target: '10 reps', sets: 1, note: '', timed: false, inputType: 'reps' });
  ctx.ST.injuries = [];
  assertEqual(out.injuryCaution, true, 'caution'); assertEqual(out.flaggedRegion, 'Shoulder and Elbow / Wrist', 'both named');
  assertEqual(!!clean.injuryCaution || !!clean.swappedForInjury, false, 'thoracic extension left alone');
});
test('a timed hold swapped for a reps exercise gets reps boxes, not a stopwatch', () => {
  ctx.ST.injuries = ['elbow_wrist'];
  const out = ctx.applyInjuryFilter({ id: 'r_lg_er1', name: 'Plank', target: '3×45s', sets: 3, note: '', timed: true, inputType: 'timed' });
  ctx.ST.injuries = [];
  assertEqual(out.name, 'Dead Bug', 'swapped to Dead Bug');
  assertEqual(out.inputType, 'reps_only', 'reps boxes');
  assertEqual(out.timed, false, 'not timed');
  assertEqual(Object.keys(ctx.blankSetsFor(out)[0]).join(), 'reps', 'set shape');
});
test('every possible injury swap: boxes match the label and the fields match the new exercise', () => {
  const regions = Object.keys(ctx.INJURY_REGIONS);
  const all = new Map();
  (function walk(v) {
    if (Array.isArray(v)) v.forEach(x => { if (x && x.id && x.name) all.set(x.id, x); else walk(x); });
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  })(ctx.WORKOUTS);
  let swaps = 0; const bad = [];
  for (const e of all.values()) for (const r of regions) {
    ctx.ST.injuries = [r];
    // Once bare, once as a cool-down, so the stand-in pools are swept too.
    for (const out of [ctx.applyInjuryFilter(e), ctx.applyInjuryFilter(e, 'landing'), ctx.applyInjuryFilter(e, 'taxi')]) {
    if (!out.swappedForInjury) continue;
    swaps++;
    if (ctx.exerciseRegionTags(out.name).includes(r)) bad.push(e.name + ' -> ' + out.name + ': the swap loads the flagged ' + r);
    const alt = ctx.getAlternates(e.name).find(a => a.name === out.name);
    const lab = (out.target || '').match(/^(\d+)\s*[x×]/i);
    if (lab && parseInt(lab[1], 10) !== out.sets) bad.push(e.name + ' -> ' + out.name + ': label ' + lab[1] + ', sets ' + out.sets);
    if (!lab && /\d\s*(min|s)\b/.test(out.target || '') && ctx.blankSetsFor(out).length !== 1) bad.push(e.name + ' -> ' + out.name + ' (' + out.target + '): a single duration drew ' + ctx.blankSetsFor(out).length + ' boxes');
    if (alt && alt.inputType && alt.inputType !== out.inputType) bad.push(e.name + ' -> ' + out.name + ': fields ' + out.inputType + ', alternate says ' + alt.inputType);
    const timedType = out.inputType === 'timed' || out.inputType === 'timed_bilateral' || out.inputType === 'timed_distance' || out.inputType === 'nsdr';
    if (!!out.timed !== timedType && !(out.timed && out.inputType === 'timed')) bad.push(e.name + ' -> ' + out.name + ': timed=' + out.timed + ' but fields ' + out.inputType);
    if (out.originalName !== e.name || !out.flaggedRegion) bad.push(e.name + ': lost the swap banner details');
    }
  }
  ctx.ST.injuries = [];
  assertEqual(swaps > 30, true, 'sweep actually covered swaps (' + swaps + ')');
  assertEqual(bad.length, 0, bad.length + ' wrong, e.g. ' + bad.slice(0, 3).join(' | '));
});
test('ankle flag: a treadmill session swaps to one timed bike ride, not three reps boxes', () => {
  ctx.ST.injuries = ['ankle_foot'];
  const out = ctx.applyInjuryFilter({ id: 'h_ca_er1', name: 'Treadmill', target: '30 min', sets: 1, note: '', timed: true, inputType: 'timed' });
  ctx.ST.injuries = [];
  assertEqual(out.name, 'Stationary Bike Intervals', 'swapped to the bike');
  assertEqual(out.timed, true, 'timed');
  assertEqual(ctx.blankSetsFor(out).length, 1, 'one box');
  assertEqual(Object.keys(ctx.blankSetsFor(out)[0]).join(), 'seconds', 'a time box');
});
test('manual Alternate swap and injury swap build the same exercise', () => {
  const alt = ctx.getAlternates('DB Overhead Press').find(a => a.name === 'DB Incline Press');
  const built = ctx.exFromAlternate('x', alt);
  assertEqual(built.sets, 4, 'sets from the label');
  assertEqual(built.inputType, 'reps_weight', 'fields');
  const bike = ctx.exFromAlternate('x', { name: 'Assault Bike Intervals', target: '8×30s', note: '' });
  assertEqual(bike.inputType, 'reps_only', 'falls back to the catalog definition when the alternate does not say');
});

console.log('\nApp Store Guideline 3.1.1 (no own unlock mechanism inside the iOS app):');
test('promo code box is shown on the web and absent inside the iOS app', () => {
  delete ctx.webkit;
  assertEqual(ctx.inIOSApp(), false, 'plain browser is not the iOS app');
  assertEqual(/promoCodeInput/.test(ctx.promoCodeCardHTML()), true, 'web shows the box');
  ctx.webkit = { messageHandlers: { storeKit: { postMessage() {} } } };
  assertEqual(ctx.inIOSApp(), true, 'StoreKit bridge present means the iOS app');
  assertEqual(ctx.promoCodeCardHTML(), '', 'iOS app shows nothing: no box, no mention of codes');
  delete ctx.webkit;
});
test('Pro status wording for a complimentary account never says "promo" inside the iOS app', () => {
  const comp = { platform: 'promo', status: 'active' };
  const web = ctx.proStatusCopy(comp, false), ios = ctx.proStatusCopy(comp, true);
  assertEqual(/promo/i.test(web.label + web.manage), true, 'web wording unchanged');
  assertEqual(/promo|code/i.test(ios.label + ios.manage), false, 'iOS wording: ' + ios.label + ' / ' + ios.manage);
  assertEqual(/no billing/i.test(ios.manage), true, 'still honest that nothing is billed');
  assertEqual(/renew/i.test(ios.label), false, 'still does not claim it renews');
  const apple = { platform: 'ios', status: 'active' };
  assertEqual(ctx.proStatusCopy(apple, true).label, 'Renews ', 'paid Apple subscriber unchanged');
  assertEqual(/Apple ID/.test(ctx.proStatusCopy(apple, true).manage), true, 'Apple manage copy unchanged');
  assertEqual(/support/.test(ctx.proStatusCopy({ platform: 'web', status: 'active' }, false).manage), true, 'web subscriber unchanged');
  assertEqual(ctx.proStatusCopy({ platform: 'ios', status: 'grace' }, true).label, 'Renewal pending: ', 'grace unchanged');
});
test('redeeming is refused inside the iOS app even if something calls it', () => {
  ctx.webkit = { messageHandlers: { storeKit: { postMessage() {} } } };
  // redeemPromoCode is async and reads the code box first thing. Refusing
  // means it never even looks for the box, which is observable right away.
  let lookedForBox = 0;
  const realGet = ctx.document.getElementById; ctx.document.getElementById = () => { lookedForBox++; return { value: 'FREEPRO', style: {}, textContent: '' }; };
  ctx.redeemPromoCode();
  ctx.document.getElementById = realGet; delete ctx.webkit;
  assertEqual(lookedForBox, 0, 'stopped before reading a code');
});

console.log('\nWeekly coach context (reported: told plyo was "short and sparse" hours after a plyo session):');
const coachNow = new Date(2026, 9, 4, 19, 0);
const plyoToday = { date: new Date(2026, 9, 4, 9, 45).toISOString(), muscle_group: 'Power / Plyo', env: 'comm', durationMinutes: 14,
  sets: { a: [{ reps: '8', weight: '20' }, { reps: '8', weight: '20' }, { reps: '', weight: '' }], b: [{ reps: '6', weight: '25' }], c: [{ reps: '5', height: '24' }, { reps: '5', height: '24' }] },
  workoutSnapshot: { taxi: [{ id: 'w', name: 'Arm Circles' }], takeoff: [{ id: 'a', name: 'Medicine Ball Burpee' }, { id: 'b', name: 'Landmine Squat to Press' }], enroute: [{ id: 'c', name: 'Box Jump' }], landing: [{ id: 'z', name: 'Full Body Stretch' }] } };
const legsLastWeek = { date: new Date(2026, 8, 30, 16, 11).toISOString(), muscle_group: 'Lower Body', env: 'hotel', durationMinutes: 49,
  sets: { q: [{ reps: '8', weight: '50' }] }, workoutSnapshot: { taxi: [], takeoff: [{ id: 'q', name: 'Kettlebell Goblet Squat (Heavy)' }], enroute: [], landing: [] } };
const airportWalk = { date: new Date(2026, 9, 2, 9, 12).toISOString(), muscle_group: 'Cardio', env: 'comm', durationMinutes: 22, importedFromOura: true, ouraActivity: 'walking', sets: { o: [{ seconds: '1320' }] }, workoutSnapshot: {} };
const tooOld = { date: new Date(2026, 6, 1, 9, 0).toISOString(), muscle_group: 'Lower Body', env: 'comm', durationMinutes: 50 };
test('each session tells the coach what was actually done, not only how long the app was open', () => {
  const out = ctx.weeklyCoachSessions([legsLastWeek, airportWalk, plyoToday, tooOld], coachNow);
  assertEqual(out.length, 3, 'six-week window drops the July session');
  const p = out.find(x => x.muscleGroup === 'Power / Plyo');
  assertEqual(p.exercises.join(' | '), 'Medicine Ball Burpee | Landmine Squat to Press | Box Jump', 'main work only, no warmup or cooldown');
  assertEqual(p.setsLogged, 5, 'counts sets with something entered');
  assertEqual(p.daysAgo, 0, 'today is 0 days ago');
  assertEqual(p.environment, 'comm', 'where it happened');
  const l = out.find(x => x.muscleGroup === 'Lower Body');
  assertEqual(l.daysAgo, 4, 'Sep 30 is 4 days before Oct 4');
});
test('coach sees when in words and what each session worked (reported: walk called heavy pull day; Full Body squats ignored)', () => {
  const now = new Date(2026, 9, 18, 10, 30);
  const pull = { date: new Date(2026, 9, 15, 11, 36).toISOString(), muscle_group: 'Upper Pull', env: 'hotel', sets: { a: [{ reps: '10', weight: '100' }] },
    workoutSnapshot: { taxi: [], takeoff: [{ id: 'a', name: 'Lat Pulldown' }, { id: 'b', name: 'DB Row' }], enroute: [{ id: 'c', name: 'DB Curl' }], landing: [] } };
  const walk = { date: new Date(2026, 9, 17, 10, 56).toISOString(), muscle_group: 'Walk', env: 'comm', sets: { w: [{ seconds: '1800' }] },
    workoutSnapshot: { taxi: [], takeoff: [], enroute: [{ id: 'w', name: 'Walking' }], landing: [] } };
  const full = { date: new Date(2026, 9, 18, 10, 35).toISOString(), muscle_group: 'Full Body', env: 'comm', durationMinutes: 60, durationEdited: true, sets: { s: [{ reps: '5', weight: '225' }] },
    workoutSnapshot: { taxi: [], takeoff: [{ id: 's', name: 'Back Squat' }, { id: 'j', name: 'Box Jump' }], enroute: [{ id: 'p', name: 'DB Bench Press' }, { id: 'f', name: 'Face Pull' }], landing: [] } };
  const out = ctx.weeklyCoachSessions([pull, walk, full], now);
  assertEqual(out.map(x => x.muscleGroup).join(','), 'Full Body,Walk,Upper Pull', 'newest first');
  assertEqual(out[1].when, 'yesterday (Saturday)', 'yesterday was the walk');
  assertEqual(out[2].when, '3 days ago (Thursday)', 'pull day was Thursday');
  assertEqual(['lower body', 'jump/plyo', 'upper push', 'upper pull'].every(a => out[0].trained.includes(a)), true, 'Full Body worked legs, jumps, push and pull: ' + out[0].trained.join(','));
  assertEqual(out[0].durationIsReal, true, 'time set by the member');
  assertEqual(out[2].trained.join(','), 'upper pull', 'pull day is pull');
  assertEqual(out[1].trained.join(','), 'cardio', 'walk is cardio');
});
test('an airport walk is still flagged and carries no exercise list', () => {
  const w = ctx.weeklyCoachSessions([airportWalk], coachNow)[0];
  assertEqual(w.incidentalWalk, true, 'incidental walk');
  assertEqual(w.exercises.length, 0, 'no exercises');
});
test('the summary is refreshed when a new workout is logged, not frozen for a day', () => {
  const before = ctx.weeklyCoachSessionKey(ctx.weeklyCoachSessions([legsLastWeek], coachNow));
  const after = ctx.weeklyCoachSessionKey(ctx.weeklyCoachSessions([legsLastWeek, plyoToday], coachNow));
  assertEqual(before === after, false, 'key changes when a session is added');
  assertEqual(after, ctx.weeklyCoachSessionKey(ctx.weeklyCoachSessions([plyoToday, legsLastWeek], coachNow)), 'same sessions, same key, whatever the order');
});
test('where the member trains is summarised so advice fits the equipment they have', () => {
  const out = ctx.weeklyCoachSessions([legsLastWeek, plyoToday, airportWalk], coachNow);
  const env = ctx.weeklyCoachEnvironments(out);
  assertEqual(env.hotel, 1, 'one hotel session'); assertEqual(env.comm, 1, 'one gym session (the walk is not a training choice)');
});
// Found in real data: the ring imports yard work, house work and "strength
// training" all day, each saved with the default location "comm". Counted
// as gym sessions they made a member who trains in hotels look like someone
// who lives in a commercial gym, and each one would have paid for a new note.
const ringYardwork = { date: new Date(2026, 8, 26, 9, 30).toISOString(), muscle_group: 'Cardio', env: 'comm', durationMinutes: 33, importedFromOura: true, ouraActivity: 'yardwork',
  sets: { o: [{ seconds: '1980' }] }, workoutSnapshot: { enroute: [{ id: 'o', name: 'Yardwork (via Oura)' }] } };
test('something the ring picked up is marked as such and claims no location', () => {
  const y = ctx.weeklyCoachSessions([ringYardwork], coachNow)[0];
  assertEqual(y.autoDetected, true, 'marked as ring-detected');
  assertEqual(y.environment, null, 'the saved "comm" is a default, not a fact');
  assertEqual(y.incidentalWalk, false, 'yard work is not an airport walk');
  assertEqual(ctx.weeklyCoachSessions([plyoToday], coachNow)[0].autoDetected, false, 'an app-logged workout is not ring-detected');
});
test('ring activity does not count as gym sessions or trigger a new note', () => {
  const withRing = ctx.weeklyCoachSessions([legsLastWeek, plyoToday, ringYardwork], coachNow);
  const without = ctx.weeklyCoachSessions([legsLastWeek, plyoToday], coachNow);
  assertEqual(ctx.weeklyCoachEnvironments(withRing).comm, 1, 'still one gym session');
  assertEqual(ctx.weeklyCoachSessionKey(withRing), ctx.weeklyCoachSessionKey(without), 'yard work does not change the key');
});

console.log('\nNotification tap survives a page reload (reported: weekly summary notification opened Today, not Trends):');
// The page can be reloaded moments after a tap is handled: a new version
// installing, or iOS restarting the web view. The reload used to forget
// where the tap was headed and land on Today.
const fakeStore = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, _m: m }; };
test('a tap handled just before a reload is applied again on the reloaded page, once', () => {
  const st = fakeStore();
  ctx.rememberPushTap('trends', 1000, st);
  assertEqual(ctx.pushTapCarriedOverReload(st, 4000, 3000), 'trends', 'page started at 3000, after the tap at 1000');
  assertEqual(ctx.pushTapCarriedOverReload(st, 5000, 3000), null, 'used once, then gone');
});
test('the page that received the tap does not apply it a second time, and keeps it for a reload', () => {
  const st = fakeStore();
  ctx.rememberPushTap('trends', 1000, st);
  assertEqual(ctx.pushTapCarriedOverReload(st, 2000, 500), null, 'this page started at 500, before the tap');
  assertEqual(ctx.pushTapCarriedOverReload(st, 6000, 5000), 'trends', 'still there for the reload that follows');
});
test('an old tap never moves someone who opens the app later', () => {
  const st = fakeStore();
  ctx.rememberPushTap('trends', 1000, st);
  assertEqual(ctx.pushTapCarriedOverReload(st, 1000 + 31000, 20000), null, '31 seconds later is too late');
  assertEqual(Object.keys(st._m).length, 0, 'and the stale note is thrown away');
});
test('a damaged note is ignored instead of breaking startup', () => {
  const st = fakeStore(); st.setItem('fcf_push_tap', '{not json');
  assertEqual(ctx.pushTapCarriedOverReload(st, 2000, 1500), null, 'no crash, no tab');
  assertEqual(ctx.pushTapCarriedOverReload(null, 2000, 1500), null, 'no storage at all is fine too');
});

console.log('\nExports inside the iPhone app (reported: Export CSV opened a giant spreadsheet with no way out):');
// A download link does not download inside the iPhone app. It replaces the
// whole app screen with the file, and the app has no back button.
test('the iPhone app never uses a download link, which would replace the app with the file', () => {
  assertEqual(ctx.fileDeliveryPlan({ ios: true, nativeFileShare: false }), 'sheet', 'current app build: in-app sheet with Share and Copy');
  assertEqual(ctx.fileDeliveryPlan({ ios: true, nativeFileShare: true }), 'native', 'a build that can share files hands it to the iPhone share sheet');
});
test('a normal browser still gets a normal download', () => {
  assertEqual(ctx.fileDeliveryPlan({ ios: false, nativeFileShare: false }), 'download', 'Safari, Chrome, desktop');
});

console.log('\nExport includes goals, targets and every weigh-in (requested: an AI should see what you were aiming for):');
test('the export opens with the training goal and the nutrition targets', () => {
  const rows = ctx.exportProfileRows({ goal: 'jump', level: 'intermediate', injuries: ['shoulder'], sex: 'male', age: 50, heightIn: 71, lastWeight: 192,
    trackHydration: true, nutritionGoals: { mode: 'muscle', calories: 2800, protein: 192, carbs: 310, fat: 78, bmr: 1850, tdee: 2600, setAt: '2026-09-01T12:00:00.000Z' } });
  const get = k => (rows.find(r => r[0] === k) || [])[1];
  assertEqual(get('Training goal'), 'Vertical Jump', 'goal in plain words, not the internal code');
  assertEqual(get('Calorie target (per day)'), 2800, 'calories');
  assertEqual(get('Protein target (g per day)'), 192, 'protein');
  assertEqual(get('Carb target (g per day)'), 310, 'carbs');
  assertEqual(get('Fat target (g per day)'), 78, 'fat');
  assertEqual(get('Nutrition plan'), 'Build muscle', 'plan in plain words');
  assertEqual(/Shoulder/i.test(String(get('Injuries flagged'))), true, 'injury flags are named');
  assertEqual(get('Latest body weight (lb)'), 192, 'latest weight');
});
test('with no nutrition targets set the export says so instead of leaving a gap', () => {
  const rows = ctx.exportProfileRows({ goal: 'longevity', injuries: [], nutritionGoals: { mode: 'none' } });
  assertEqual((rows.find(r => r[0] === 'Nutrition targets') || [])[1], 'not set', 'stated plainly');
  assertEqual(rows.some(r => r[0] === 'Calorie target (per day)'), false, 'no invented numbers');
  assertEqual(rows.some(r => r[0] === 'Injuries flagged'), false, 'nothing flagged, nothing listed');
});
test('every weigh-in is exported, including rest days, and empty entries are skipped', () => {
  const rows = ctx.exportBodyRows([
    { logged_at: new Date(2026, 9, 1, 7, 5).toISOString(), weight_lb: 192.4 },
    { logged_at: new Date(2026, 9, 2, 6, 50).toISOString(), weight_lb: 191.8, waist_in: 35, systolic_bp: 118, diastolic_bp: 76, fasting_glucose: 92 },
    { logged_at: new Date(2026, 9, 3, 6, 50).toISOString() },
  ]);
  assertEqual(rows.length, 2, 'two real entries, the empty one dropped');
  assertEqual(rows[0][0], '10/1/2026', 'date'); assertEqual(rows[0][2], 192.4, 'weight');
  assertEqual(rows[1].slice(2).join('|'), '191.8|35|118|76|92', 'all five measurements in order');
});

console.log('\nExport data quality (feedback from an AI reading the export: duplicate sets, swapped reps and weight, Invalid Date rows):');
const dupA = { date: '2026-07-30T18:18:43.170Z', muscle_group: 'Power / Plyo', env: 'hotel', sets: { a: [{ reps: '8', weight: '20' }] }, workoutSnapshot: { takeoff: [{ id: 'a', name: 'X' }] } };
const dupB = { ...dupA, date: '2026-07-30T18:18:46.147Z' };
const other = { date: '2026-07-31T18:18:46.147Z', muscle_group: 'Power / Plyo', env: 'hotel', sets: { a: [{ reps: '8', weight: '20' }] }, workoutSnapshot: dupA.workoutSnapshot };
const legacy = { key: 'A', started: 1780805979146, completedAt: 1780806050338, gymUsed: 'commercial', sets: { rdl: [{ reps: '8', weight: '135' }] } };
test('a workout saved two or three times within seconds is exported once', () => {
  const out = ctx.exportSessions([dupA, dupB, other]);
  assertEqual(out.length, 2, 'three rows in, two workouts out');
  assertEqual(out[0].date, dupA.date, 'the first copy is kept');
});
test('an early session with no date falls back to its start time instead of Invalid Date', () => {
  const out = ctx.exportSessions([legacy]);
  assertEqual(out.length, 1, 'kept');
  assertEqual(new Date(out[0].date).getTime(), 1780805979146, 'date comes from the start timestamp');
  assertEqual(isNaN(new Date(out[0].date).getTime()), false, 'a real date');
});
test('reps and weight that look swapped are spotted, with a one-tap fix', () => {
  const rw = { inputType: 'reps_weight', target: '4×8', name: 'DB Deadlift' };
  assertEqual(ctx.looksSwapped(rw, { reps: '130', weight: '6' }), true, '130 reps at 6 lb on a 4x8');
  assertEqual(ctx.looksSwapped(rw, { reps: '8', weight: '130' }), false, 'the right way round');
  assertEqual(ctx.looksSwapped(rw, { reps: '20', weight: '15' }), false, 'a high-rep light set is normal');
  assertEqual(ctx.looksSwapped({ inputType: 'reps_only', target: '3×50' }, { reps: '50', weight: '' }), false, 'reps-only never flags');
  const fb = ctx.autoregSuggestion(rw, [{ reps: '130', weight: '6' }], 'comm');
  assertEqual(/swapped/i.test(fb.text), true, 'the set feedback says so'); assertEqual(fb.action, 'swap', 'and offers to swap them');
});

console.log('\nOura workouts recorded today (reported Nov 5: a morning walk never reached Trends):');
test('the workout request window includes today, in local dates', () => {
  const c = loadAppJS(); let asked = null;
  // The request is made synchronously, before the function's first await.
  c.ouraFetch = path => { asked = path; return Promise.resolve({ data: [] }); };
  c.ST.user = { id: 'u' }; c.ST.ouraAccessToken = 't';
  c.syncOuraWorkouts();
  const end = (asked.match(/end_date=([0-9-]+)/) || [])[1];
  assertEqual(end > c.localDateStr(new Date()), true, 'end_date is after today: ' + asked);
});

console.log('\nRep ranges (owner, Nov 4: "a rep range is better than a rep target"):');
test('ranges follow the mission objective and the exercise role', () => {
  const assertEqual = (a, b, m) => assertEqualTop(JSON.stringify(a), JSON.stringify(b), m);
  const sq = { name: 'Back Squat', target: '4×8', inputType: 'reps_weight' };
  const row = { name: 'DB Row', target: '3×10', inputType: 'reps_weight' };
  const curl = { name: 'DB Curl', target: '3×12', inputType: 'reps_weight' };
  assertEqual(ctx.repRangeFor(sq, 'takeoff', 'strength', 'intermediate', 'male'), { lo: 4, hi: 6 }, 'strength compound 4-6');
  assertEqual(ctx.repRangeFor(sq, 'takeoff', 'strength', 'beginner', 'male'), { lo: 6, hi: 10 }, 'beginner strength uses the next band (ACSM)');
  assertEqual(ctx.repRangeFor(sq, 'takeoff', 'muscle', 'intermediate', 'male'), { lo: 6, hi: 10 }, 'muscle compound 6-10');
  assertEqual(ctx.repRangeFor(row, 'enroute', 'fatloss', 'intermediate', 'male'), { lo: 10, hi: 15 }, 'fat loss accessory 10-15');
  assertEqual(ctx.repRangeFor(row, 'enroute', 'muscle', 'intermediate', 'female'), { lo: 10, hi: 14 }, 'women: accessory range up 2');
  assertEqual(vm.runInContext("Object.values(GOALS).some(g => 'suggestFor' in g)", ctx), false, 'no goal is suggested or hidden by sex (requested Nov 16)');
  assertEqual(ctx.repRangeFor(curl, 'enroute', 'muscle', 'intermediate', 'male'), { lo: 12, hi: 15 }, 'isolation 12-15');
  assertEqual(ctx.repRangeFor({ name: 'Box Jump', target: '5×3', inputType: 'reps_height' }, 'takeoff', 'jump', 'intermediate', 'male'), null, 'jumps measured in inches: no range');
  assertEqual(ctx.repRangeFor({ name: 'Kettlebell Clean & Press', target: '4×5', inputType: 'reps_weight' }, 'takeoff', 'muscle', 'intermediate', 'male'), { lo: 3, hi: 6 }, 'power work 3-6 whatever the goal');
  assertEqual(ctx.repRangeFor({ name: 'Hip 90/90 Stretch', target: '60s', timed: true, inputType: 'timed' }, 'taxi', 'muscle', 'intermediate', 'male'), null, 'timed work: no range');
  assertEqual(ctx.repRangeFor({ name: 'Standing Calf Raise', target: '3×20', inputType: 'reps_weight' }, 'enroute', 'strength', 'intermediate', 'male'), { lo: 18, hi: 20 }, 'a 20-rep exercise keeps a high range');
  assertEqual(ctx.repRangeFor({ name: 'Conventional Deadlift', target: '5×3', inputType: 'reps_weight' }, 'takeoff', 'strength', 'intermediate', 'male'), { lo: 3, hi: 5 }, 'heavy triples keep a low range');
});
test('the card label becomes a range and the suffix survives', () => {
  const assertEqual = (a, b, m) => assertEqualTop(JSON.stringify(a), JSON.stringify(b), m);
  const g = ctx.ST.goal, l = ctx.ST.level, x = ctx.ST.sex; ctx.ST.goal = 'muscle'; ctx.ST.level = 'intermediate'; ctx.ST.sex = 'male';
  const out = ctx.withRepRange({ name: 'Single Leg Split Squat', target: '3×8/leg', sets: 3, inputType: 'reps_only' }, 'enroute');
  assertEqual(out.target, '3 × 8-12/leg', 'label'); assertEqual(out.repRange, { lo: 8, hi: 12 }, 'range stored'); assertEqual(out.baseTarget, '3×8/leg', 'original kept');
  assertEqual(ctx.parseTargetReps(out.target), 8, 'old readers see the bottom of the range');
  assertEqual(ctx.restSecondsForTarget(out.target), 75, 'rest timer reads the range');
  ctx.ST.goal = g; ctx.ST.level = l; ctx.ST.sex = x;
});
test('double progression: weight goes up only when every set reached the top', () => {
  const lp = { name: 'Leg Press', target: '3 × 10-12', repRange: { lo: 10, hi: 12 } };
  const stay = ctx.overloadTarget(lp, { lastWeight: 553, lastReps: 10, lastSets: [{ reps: '10' }, { reps: '10' }, { reps: '10' }], env: 'comm', phaseKey: 'enroute' });
  assertEqual(stay.kind, 'reps', 'same weight'); assertEqual(/553 lb, 12 on every set/.test(stay.label), true, stay.label);
  const up = ctx.overloadTarget(lp, { lastWeight: 553, lastReps: 12, lastSets: [{ reps: '12' }, { reps: '12' }, { reps: '12' }], env: 'comm', phaseKey: 'enroute' });
  assertEqual(up.kind, 'weight', 'weight up'); assertEqual(up.lb, 568, '2.5% rounded to 5 lb');
  assertEqual(ctx.nextWeightFrom(225, 'Back Squat', 'takeoff'), 230, 'squat +5');
  assertEqual(ctx.nextWeightFrom(50, 'Cable Row', 'enroute'), 52.5, 'light upper work +2.5');
  assertEqual(ctx.nextWeightFrom(295, 'Conventional Deadlift', 'takeoff'), 300, 'deadlift +5');
});
test('set feedback speaks in the range', () => {
  const lp = { name: 'Leg Press', target: '3 × 10-12', repRange: { lo: 10, hi: 12 }, inputType: 'reps_weight' };
  assertEqual(ctx.autoregSuggestion(lp, [{ reps: '10', weight: '553' }, { reps: '', weight: '' }, { reps: '', weight: '' }], 'comm'), null, '10 is in range: quiet mid-exercise');
  const under = ctx.autoregSuggestion(lp, [{ reps: '8', weight: '553' }, { reps: '', weight: '' }, { reps: '', weight: '' }], 'comm');
  assertEqual(/8, under the 10 to 12 range/.test(under.text), true, under.text);
  const top = ctx.autoregSuggestion(lp, [{ reps: '12', weight: '553' }, { reps: '12', weight: '553' }, { reps: '12', weight: '553' }], 'comm');
  assertEqual(top.tone === 'positive' && /weight goes up, to about 568 lb/.test(top.text), true, top.text);
  const mid = ctx.autoregSuggestion(lp, [{ reps: '12', weight: '553' }, { reps: '11', weight: '553' }, { reps: '10', weight: '553' }], 'comm');
  assertEqual(/inside the 10 to 12 range/.test(mid.text) && /work toward 12/.test(mid.text), true, mid.text);
});

console.log('\nHotel dumbbells top out at 50 lb (feedback: once you max the rack there is no heavier weight to suggest):');
test('in a hotel gym at 50 lb the next target is more reps, not more weight', () => {
  const t = ctx.overloadTarget({ name: 'DB Bench Press', target: '4×10' }, { lastWeight: 50, lastReps: 10, env: 'hotel', phaseKey: 'takeoff' });
  assertEqual(t.kind, 'reps', 'reps progression'); assertEqual(t.lb, 50, 'stay at 50'); assertEqual(t.reps, 12, 'two more reps than last time');
  assertEqual(/50 lb × 12/.test(t.label), true, 'label shows both');
});
test('below the cap, or in a real gym, weight still goes up', () => {
  assertEqual(ctx.overloadTarget({ name: 'DB Bench Press', target: '4×10' }, { lastWeight: 45, lastReps: 10, env: 'hotel', phaseKey: 'takeoff' }).label, '50 lb', 'hotel below the cap');
  assertEqual(ctx.overloadTarget({ name: 'DB Bench Press', target: '4×10' }, { lastWeight: 50, lastReps: 10, env: 'comm', phaseKey: 'takeoff' }).label, '55 lb', 'commercial gym has heavier dumbbells');
  assertEqual(ctx.overloadTarget({ name: 'Cable Row', target: '4×10' }, { lastWeight: 50, lastReps: 10, env: 'hotel', phaseKey: 'takeoff' }).label, '52.5 lb', 'not a dumbbell, not capped');
});
test('the end-of-exercise note in a hotel at 50 lb asks for reps instead of "add more weight"', () => {
  const sets = [{ reps: '10', weight: '50' }, { reps: '10', weight: '50' }, { reps: '10', weight: '50' }, { reps: '8', weight: '50' }];
  const hotel = ctx.autoregSuggestion({ name: 'DB Bench Press', inputType: 'reps_weight', target: '4×10' }, sets, 'hotel');
  assertEqual(/rep/i.test(hotel.text) && /50/.test(hotel.text) && !/add more/i.test(hotel.text), true, 'hotel wording: ' + hotel.text);
  const gym = ctx.autoregSuggestion({ name: 'DB Bench Press', inputType: 'reps_weight', target: '4×10' }, sets, 'comm');
  assertEqual(/add more/i.test(gym.text), true, 'gym wording unchanged: ' + gym.text);
});

console.log('\nSwap In buttons survive an apostrophe (reported: "JS ERROR: SyntaxError: Unexpected EOF" on tapping Swap In for an AI substitute):');
// The button carried the whole exercise as JSON inside a single-quoted HTML
// attribute. The first apostrophe in a note ("don't force it") ended the
// attribute early and the tap ran half a line of code.
const aiAnswer = { name: 'Dumbbell Overhead Lat Stretch', target: '60s/side', inputType: 'timed_bilateral',
  note: 'Hold a light dumbbell overhead with one arm and lean sideways to deepen the lat stretch, keep breathing and don\'t force it past a "good" stretch.' };
test('an AI suggestion keeps its whole note, apostrophe included, and loses only what could break the page', () => {
  const c = ctx.cleanAISubstitute(aiAnswer);
  assertEqual(c.name, 'Dumbbell Overhead Lat Stretch', 'name');
  assertEqual(c.note.includes("don't force it past a good stretch."), true, 'full sentence, apostrophe kept, quotes dropped: ' + c.note);
  assertEqual(c.inputType, 'timed_bilateral', 'type kept');
  assertEqual(ctx.cleanAISubstitute({ name: 'X', target: '3x10', inputType: 'alert(1)' }).inputType, 'reps_weight', 'unknown type falls back');
  assertEqual(ctx.cleanAISubstitute({ target: '3x10' }), null, 'no name, no suggestion');
  assertEqual(ctx.cleanAISubstitute({ name: '<img src=x>', target: '3x10' }).name.includes('<'), false, 'no markup');
});
test('the AI suggestion card carries no exercise data inside its button', () => {
  const html = ctx.aiSubstituteCardHtml(ctx.cleanAISubstitute(aiAnswer));
  assertEqual(html.includes('onclick="swapInAISubstitute()"'), true, 'button calls a plain function');
  assertEqual(html.includes("don't force it"), true, 'note shown in full');
  assertEqual(/onclick='/.test(html) || html.includes('{"name"'), false, 'nothing embedded in the attribute');
});
test('every curated alternate has a working Swap In button, including the ones with an apostrophe', () => {
  let withApostrophe = 0, total = 0;
  Object.keys(ctx.ALTERNATES).forEach(name => {
    const alts = ctx.getAlternates(name);
    const html = ctx.alternatesSheetHtml('ex1', name, 'takeoff');
    assertEqual((html.match(/Swap In<\/button>/g) || []).length, alts.length, name + ': one button per alternate');
    assertEqual(/onclick='/.test(html), false, name + ': no single-quoted handler');
    alts.forEach((a, i) => { total++; if (/'/.test(a.name + a.note)) withApostrophe++; assertEqual(html.includes('onclick="swapCuratedAlternate(\'ex1\',' + i + ')"'), true, name + ' #' + i); });
  });
  console.log('      (' + withApostrophe + ' of ' + total + ' curated alternates contain an apostrophe and had a dead button)');
  assertEqual(total > 50, true, 'covered the real list');
});
test('no button anywhere carries JSON inside a single-quoted attribute', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
  const bad = src.split('\n').filter(l => /on(click|change|input)=\\'/.test(l) && l.includes('JSON.stringify('));
  assertEqual(bad.length, 0, 'offending lines: ' + bad.map(l => l.trim().slice(0, 80)).join(' | '));
});

console.log('\nSession minutes (reported: a workout of about 45 minutes showed MINUTES 13):');
// The Minutes tile showed an estimate of time under the bar (45 seconds per
// logged set, no rest), not how long the session lasted. The real length
// was saved with the session all along and simply not shown.
const pushSnap = { taxi: [], takeoff: [{ id: 'b', name: 'DB Bench Press', target: '4×8', inputType: 'reps_weight' }], enroute: [], landing: [] };
const pushSets = { b: Array.from({ length: 18 }, () => ({ reps: '10', weight: '50' })) };
test('the Minutes tile shows how long the session really lasted', () => {
  const sum = ctx.buildWorkoutSummary({ date: new Date().toISOString(), durationMinutes: 59, sets: pushSets, workoutSnapshot: pushSnap }, pushSnap.takeoff, [], 190);
  assertEqual(sum.durationMinutes, 59, 'the saved session length, not 18 sets x 45 seconds');
  assertEqual(sum.totalSets, 18, 'sets unchanged');
});
test('a session with no saved length still falls back to the estimate', () => {
  const sum = ctx.buildWorkoutSummary({ date: new Date().toISOString(), sets: pushSets, workoutSnapshot: pushSnap }, pushSnap.takeoff, [], 190);
  assertEqual(sum.durationMinutes, 14, '18 sets x 45 seconds, rounded');
});

console.log('\nWorkout calories (reported: 120 calories for an hour of lifting):');
// The old figure counted only the seconds under the bar (45 per set) and
// ignored every rest, so a 59 minute session was costed as 13 minutes.
// The 2024 Compendium of Physical Activities gives resistance training
// 3.5 METs (code 02054) for the session as performed, rests included.
const kg192 = 192 * 0.4536;
const mixSnap = { taxi: [{ id: 'w', name: 'Thoracic Extension (chair)', target: '1×20', inputType: 'reps_only' }],
  takeoff: [{ id: 'b', name: 'DB Bench Press', target: '4×8', inputType: 'reps_weight' }], enroute: [], landing: [] };
const mixSets = { w: [{ reps: '20' }], b: Array.from({ length: 17 }, () => ({ reps: '10', weight: '50' })) };
test('an hour of lifting is costed over the hour, not over 13 minutes of bar time', () => {
  const e = ctx.computeSessionEffort(mixSnap, mixSets, 192, 59);
  const expected = ((17 * 3.5 + 1 * 2.8) / 18) * kg192 * (59 / 60);
  assertEqual(Math.abs(e.calories - expected) <= 3, true, 'about ' + Math.round(expected) + ', got ' + e.calories);
  assertEqual(e.calories > 250 && e.calories < 350, true, 'in the range measured for real lifting sessions: ' + e.calories);
  assertEqual(e.minutes, 14, 'the bar-time estimate itself is unchanged (18 sets x 45 s)');
});
test('an app left open for hours cannot inflate the calories', () => {
  const normal = ctx.computeSessionEffort(mixSnap, mixSets, 192, 59).calories;
  const leftOpen = ctx.computeSessionEffort(mixSnap, mixSets, 192, 300).calories;
  const cap = ((17 * 3.5 + 2.8) / 18) * kg192 * (18 * 240 / 3600);
  assertEqual(Math.abs(leftOpen - cap) <= 3, true, 'capped at 4 minutes per set: ' + leftOpen);
  assertEqual(leftOpen < normal * 1.3, true, 'five hours on the clock is not five hours of work');
});
test('a workout typed in afterwards still gets a sensible figure', () => {
  const typed = ctx.computeSessionEffort(mixSnap, mixSets, 192, 14).calories;   // saved length = bar time only
  const unknown = ctx.computeSessionEffort(mixSnap, mixSets, 192).calories;      // no saved length at all
  assertEqual(typed > 170 && typed < 230, true, 'floor of 2 minutes per set: ' + typed);
  assertEqual(unknown > 210 && unknown < 290, true, 'typical 2.5 minutes per set: ' + unknown);
});
test('timed work keeps its own clock and is not double counted', () => {
  const snap = { taxi: [], takeoff: [{ id: 'b', name: 'DB Bench Press', target: '4×8', inputType: 'reps_weight' }], enroute: [{ id: 'run', name: 'Treadmill Walk', target: '20 min', timed: true, inputType: 'timed' }], landing: [] };
  const sets = { b: Array.from({ length: 8 }, () => ({ reps: '8', weight: '50' })), run: [{ seconds: '1200' }] };
  const e = ctx.computeSessionEffort(snap, sets, 192, 45);
  const expected = 3.5 * kg192 * (1200 / 3600) + 3.5 * kg192 * ((45 * 60 - 1200) / 3600);
  assertEqual(Math.abs(e.calories - expected) <= 3, true, '20 min walk plus 25 min of lifting: about ' + Math.round(expected) + ', got ' + e.calories);
});
test('heavier kinds of work cost more than lighter ones', () => {
  const one = (ex) => ctx.computeSessionEffort({ taxi: [], takeoff: [ex], enroute: [], landing: [] }, { x: Array.from({ length: 10 }, () => ({ reps: '8', weight: '100', height: '24' })) }, 192, 30).calories;
  const bench = one({ id: 'x', name: 'DB Bench Press', inputType: 'reps_weight' });
  const squat = one({ id: 'x', name: 'Back Squat', inputType: 'reps_weight' });
  const jump = one({ id: 'x', name: 'Box Jump', inputType: 'reps_height' });
  assertEqual(squat > bench && jump > bench, true, 'squats and jumps above bench: ' + [bench, squat, jump].join(', '));
});
test('a ring-measured workout shows the ring\'s calories, not an estimate', () => {
  const snap = { taxi: [], takeoff: [], enroute: [{ id: 'o', name: 'Strength Training (via Oura)', timed: true, inputType: 'timed' }], landing: [] };
  const sum = ctx.buildWorkoutSummary({ date: new Date().toISOString(), importedFromOura: true, estCalories: 412, durationMinutes: 56, sets: { o: [{ seconds: '3360' }] }, workoutSnapshot: snap }, snap.enroute, [], 192);
  assertEqual(sum.estCalories, 412, 'measured value used as-is');
});
test('the session sheet uses the saved session length for calories', () => {
  const sum = ctx.buildWorkoutSummary({ date: new Date().toISOString(), durationMinutes: 59, sets: mixSets, workoutSnapshot: mixSnap }, [...mixSnap.taxi, ...mixSnap.takeoff], [], 192);
  assertEqual(sum.estCalories > 250 && sum.estCalories < 350, true, 'about 300, got ' + sum.estCalories);
});

console.log('\nTimed exercises with more than one set (reported: Jumping Jacks 2×30s had nowhere to record the second set):');
// A timed exercise had one "TOTAL TIME" box whatever its label said, and
// the stopwatch overwrote it, so set two erased set one.
const jj = { id: 'c_ca_t2', name: 'Jumping Jacks', target: '2×30s', sets: 2, timed: true, inputType: 'timed' };
test('a timed exercise gets one slot per set its label promises', () => {
  assertEqual(ctx.blankSetsFor(jj).length, 2, 'Jumping Jacks 2×30s');
  assertEqual(ctx.blankSetsFor({ name: 'Plank', target: '3×60s', sets: 3, timed: true, inputType: 'timed' }).length, 3, 'Plank 3×60s');
  assertEqual(ctx.blankSetsFor({ name: 'Mountain Climbers', target: '4×30s', sets: 4, timed: true, inputType: 'timed' }).length, 4, 'Mountain Climbers 4×30s');
  const calf = ctx.blankSetsFor({ name: 'Standing Calf Stretch', target: '2x30s/leg', sets: 2, timed: true, inputType: 'timed_bilateral' });
  assertEqual(calf.length, 2, 'per-side stretch 2x30s/leg'); assertEqual('seconds_left' in calf[1] && 'seconds_right' in calf[1], true, 'each set has a left and a right');
});
test('single efforts keep their single box', () => {
  assertEqual(ctx.blankSetsFor({ name: 'Treadmill Walk', target: '20 min', sets: 1, timed: true, inputType: 'timed' }).length, 1, 'a 20 minute walk');
  assertEqual(ctx.blankSetsFor({ name: 'Lat Overhead Stretch', target: '60s/side', sets: 1, timed: true, inputType: 'timed_bilateral' }).length, 1, '60s/side');
  assertEqual(ctx.blankSetsFor({ name: 'Intervals', target: '3×10 min', sets: 3, timed: true, inputType: 'timed' }).length, 1, 'minute-scale work stays one total');
  assertEqual(ctx.blankSetsFor({ name: 'NSDR', target: '10 min', sets: 1, inputType: 'nsdr' }).length, 1, 'NSDR');
  assertEqual(ctx.blankSetsFor({ name: 'Outdoor Run', target: '3×1 mi', sets: 3, inputType: 'timed_distance' }).length, 1, 'runs');
});
test('the stopwatch fills the next empty set and never erases an earlier one', () => {
  assertEqual(ctx.nextTimedSlot([{ seconds: '' }, { seconds: '' }], null, 2), 0, 'first stop goes to set 1');
  assertEqual(ctx.nextTimedSlot([{ seconds: '33' }, { seconds: '' }], null, 2), 1, 'second stop goes to set 2');
  assertEqual(ctx.nextTimedSlot([{ seconds: '33' }, { seconds: '31' }], null, 2), 2, 'a bonus set is added after the last, nothing overwritten');
  assertEqual(ctx.nextTimedSlot([{ seconds: '33' }], null, 2), 1, 'an older in-progress workout with one slot still gets set 2');
  assertEqual(ctx.nextTimedSlot([{ seconds_left: '30', seconds_right: '' }, {}], 'left', 2), 1, 'left side moves on to set 2');
  assertEqual(ctx.nextTimedSlot([{ seconds_left: '30', seconds_right: '' }, {}], 'right', 2), 0, 'right side still owes set 1');
  assertEqual(ctx.nextTimedSlot([{ seconds: '45' }], null, 1), 0, 'a single-set exercise is simply re-timed');
});

console.log('\nMachine intervals say what number to enter (requested: standardize bike intervals on watts):');
// The box said "Reps / reps only" while the note said to log resistance
// level or watts, so one exercise held two kinds of number and neither was
// labelled. Bike intervals are watts now, and the box says so.
const bikeI = { id: 'h_ca_to2', name: 'Stationary Bike Intervals', target: '6×45s', inputType: 'reps_only' };
test('bike intervals are logged in watts, on both kinds of bike', () => {
  assertEqual(ctx.repValueUnit(bikeI).placeholder, 'Watts', 'stationary bike box');
  assertEqual(ctx.repValueUnit({ name: 'Assault Bike Intervals', inputType: 'reps_only' }).placeholder, 'Watts', 'assault bike box');
  const cat = ctx.buildExerciseCatalog();
  ['Stationary Bike Intervals', 'Assault Bike Intervals'].forEach(n => {
    const e = cat.find(x => x.name === n && x.inputType === 'reps_only');
    assertEqual(/watts/i.test(e.note) && !/resistance level|calories|RPM|rep value/i.test(e.note), true, n + ' note asks for watts only: ' + e.note);
  });
});
test('the other machine intervals name their number too, and ordinary exercises are untouched', () => {
  assertEqual(ctx.repValueUnit({ name: 'Rowing Machine Intervals', inputType: 'reps_only' }).short, 's/500m', 'rower split');
  assertEqual(ctx.repValueUnit({ name: 'Treadmill Intervals', inputType: 'reps_only' }).short, 'mph', 'treadmill speed');
  assertEqual(ctx.repValueUnit({ name: 'Push-Up', inputType: 'reps_only' }), null, 'push-ups are still reps');
  assertEqual(ctx.repValueUnit({ name: 'Stationary Bike Intervals', inputType: 'timed', timed: true }), null, 'the 20 minute timed bike is still time');
});
test('a logged bike session reads as watts, not reps', () => {
  const sets = [{ reps: '250' }, { reps: '260' }, { reps: '240' }];
  assertEqual(ctx.formatSetPerformance(bikeI, sets), '3 rounds · best 260 W', 'session sheet');
  assertEqual(ctx.formatSetPerformance({ name: 'Push-Up', inputType: 'reps_only' }, sets), '3×260 reps', 'push-ups unchanged');
  assertEqual(JSON.stringify(ctx.edFieldsFor(bikeI)), JSON.stringify([['reps', 'Watts', 'W']]), 'edit screen');
  assertEqual(ctx.exportExerciseName(bikeI), 'Stationary Bike Intervals [Reps column = watts]', 'export tells a reader what the number is');
  assertEqual(ctx.exportExerciseName({ name: 'Push-Up', inputType: 'reps_only' }), 'Push-Up', 'export leaves ordinary names alone');
});

console.log('\nShare a workout (requested: a Share button after a workout and on a past session, with branding on what is shared):');
const shSession = { date: new Date(2026, 9, 7, 12, 40).toISOString(), muscle_group: 'Cardio', env: 'hotel', fatigue: 'go', durationMinutes: 57 };
const shSummary = { durationMinutes: 57, totalSets: 16, estCalories: 398 };
const shRows = [['Brisk Walk Ramp-Up', '40 min'], ['Jumping Jacks', '1.1 min'], ['Treadmill Intervals', '4 rounds · best 6 mph'], ['Stationary Bike Intervals', '3 rounds · best 300 W'],
  ['Step-Up', '3×15 @ 30 lb', true], ['Cool-Down Walk', '3 min'], ['Extra One', '1×10 reps'], ['Extra Two', '1×10 reps']].map(([name, perf, isPR]) => ({ name, perf, isPR: !!isPR }));
test('the share card carries the workout and the brand, and nothing private', () => {
  const d = ctx.shareCardData(shSession, shSummary, shRows);
  assertEqual(d.title, 'CARDIO', 'title'); assertEqual(d.dateLabel, 'Wednesday, Oct 7', 'date, no clock time');
  assertEqual(d.stats.map(x => x.label + ' ' + x.value).join(' | '), 'MINUTES 57 | SETS 16 | CALORIES 398', 'the three numbers');
  assertEqual(d.brand, 'FLIGHT CREW FITNESS', 'brand name'); assertEqual(d.url, 'flightcrew.fit', 'where to get it');
  assertEqual(d.tagline.length > 10, true, 'tagline');
  assertEqual(/hotel|Condition|go\b/.test(JSON.stringify(d)), false, 'no location or condition');
});
test('every exercise is on the card (reported: cut off after the first few)', () => {
  const d = ctx.shareCardData(shSession, shSummary, shRows);
  assertEqual(d.rows.length + ':' + d.more, '8:0', 'all eight shown, nothing left off');
  assertEqual(d.rows.find(r => r.name === 'Step-Up').pr, true, 'a personal record is marked');
  const L5 = ctx.shareCardLayout(5), L8 = ctx.shareCardLayout(8), L12 = ctx.shareCardLayout(12), L30 = ctx.shareCardLayout(30);
  assertEqual(L5.H + ':' + L5.rowH, '1350:66', 'short workout: standard card, full-size rows');
  assertEqual(L8.H + ':' + Math.round(L8.rowH), '1350:46', 'eight: rows shrink, card stays 4:5');
  assertEqual(L12.H > 1350 && L12.rowH === 44, true, 'twelve: card grows taller: ' + L12.H);
  assertEqual(L30.H + ':' + (L30.rowH >= 30), '1920:true', 'thirty: Story height, rows no smaller than 30 px');
});
test('the caption names the app and links to it', () => {
  const c = ctx.shareCaption(ctx.shareCardData(shSession, shSummary, shRows));
  assertEqual(c.includes('Cardio') && c.includes('57 min') && c.includes('Flight Crew Fitness') && c.includes('https://flightcrew.fit'), true, c);
  assertEqual(/\u2014|\u2013/.test(c), false, 'no dashes');
});
test('how the picture leaves the app depends on what the device can safely do', () => {
  assertEqual(ctx.shareMethod({ ios: true, nativeImageShare: true }), 'native', 'an app build that can share pictures uses the iPhone share sheet');
  assertEqual(ctx.shareMethod({ ios: true, nativeImageShare: false, canShareFiles: true }), 'webshare', 'the current app build shares the picture in one tap (confirmed working on a real iPhone)');
  assertEqual(ctx.shareMethod({ ios: true, nativeImageShare: false, canShareFiles: false }), 'screenshot', 'an iPhone that cannot share files from the page falls back to a screenshot');
  assertEqual(ctx.shareMethod({ ios: false, canShareFiles: true }), 'webshare', 'a phone browser shares the picture');
  assertEqual(ctx.shareMethod({ ios: false, canShareFiles: false }), 'download', 'a computer downloads it');
});
test('the workout just finished can be turned into rows for the card', () => {
  const snap = { taxi: [], takeoff: [{ id: 'b', name: 'DB Bench Press', inputType: 'reps_weight' }], enroute: [{ id: 's', name: 'Couch Stretch', inputType: 'timed_bilateral' }], landing: [] };
  const rows = ctx.shareRowsFor({ sets: { b: [{ reps: '10', weight: '50' }, { reps: '9', weight: '50' }], s: [{ seconds_left: '30' }] }, workoutSnapshot: snap }, ['DB Bench Press']);
  assertEqual(rows.length, 1, 'stretches are left off, as on the session sheet');
  assertEqual(rows[0].perf, '2×10 @ 50 lb', 'performance'); assertEqual(rows[0].isPR, true, 'record flagged from the debrief');
});

console.log('\nNo award for training against the app\'s own advice (owner: "This seems unhealthy to me"):');
// "Redline" was earned by training three times on a NO-GO fatigue day, the
// days the app itself tells you to take off.
test('nothing is earned by training on a NO-GO day', () => {
  assertEqual(ctx.BADGES.some(b => b.id === 'redline' || /NO-GO|no-go/.test(b.desc)), false, 'no badge mentions NO-GO');
  const day = (i, fatigue) => ({ date: new Date(2026, 8, 1 + i * 3, 9).toISOString(), fatigue, env: 'comm', sets: { a: [{ reps: '8', weight: '50' }] }, workoutSnapshot: { takeoff: [{ id: 'a', name: 'X' }] } });
  const earned = fatigue => { const st = ctx.computeBadgeStats([0, 1, 2, 3].map(i => day(i, fatigue)), []); return ctx.BADGES.filter(b => b.check && b.check(st)).map(b => b.id).sort().join(','); };
  assertEqual(earned('nogo'), earned('go'), 'four NO-GO sessions earn exactly what four normal ones do');
});

console.log('\nRun and walk distance from Apple Health (requested for the next app build, in place of GPS):');
test('a distance measured for the stopwatch window fills an empty distance box', () => {
  const r = ctx.healthDistanceUpdate({ seconds: '1680', miles: '' }, { success: true, kind: 'window', miles: 3.12, source: 'motion' });
  assertEqual(r.changed, true, 'changed'); assertEqual(r.set.miles, '3.12', 'miles filled'); assertEqual(r.set.seconds, undefined, 'time left alone');
  assertEqual(/3\.12 mi/.test(r.message), true, r.message);
});
test('it never overwrites a distance the person typed', () => {
  const r = ctx.healthDistanceUpdate({ seconds: '1680', miles: '3.5' }, { success: true, kind: 'window', miles: 3.12 });
  assertEqual(r.changed, false, 'left as typed'); assertEqual(/kept/.test(r.message) && /3\.12/.test(r.message), true, r.message);
});
test('pulling in a recorded run fills both time and distance, and says where it came from', () => {
  const r = ctx.healthDistanceUpdate({ seconds: '', miles: '' }, { success: true, kind: 'workout', miles: 3.1, seconds: 1685, activityType: 'Running', source: 'Apple Watch' });
  assertEqual(r.set.miles, '3.1', 'miles'); assertEqual(r.set.seconds, '1685', 'seconds');
  assertEqual(/Running/.test(r.message) && /3\.1 mi/.test(r.message) && /28 min/.test(r.message) && /Apple Watch/.test(r.message), true, r.message);
});
test('nothing found is said plainly when asked for, and quietly when it was automatic', () => {
  const asked = ctx.healthDistanceUpdate({}, { success: false, kind: 'workout', code: 'no_workout' });
  assertEqual(asked.changed, false, 'nothing changed'); assertEqual(/No run or walk/.test(asked.message), true, asked.message);
  const auto = ctx.healthDistanceUpdate({}, { success: false, kind: 'window', code: 'no_distance' });
  assertEqual(auto.changed, false, 'nothing changed'); assertEqual(auto.message, '', 'no popup after an ordinary stopwatch stop');
  assertEqual(ctx.healthDistanceUpdate({}, { success: true, kind: 'window', miles: 0 }).changed, false, 'a zero is not a distance');
});

console.log('\nDone-flying card agrees with the AI coach (reported: card said "a full session now" while the coach said "dial it back"):');
// Real case, Oct 8: three legs, last landed 8:25 PM, checked at 9:27 PM,
// sleep score 63, readiness 83. The card ignored all of it but the clock.
const dfCtx = (o) => {
  const now = new Date(2026, 9, 8, o.hour, o.minute || 0);
  const landed = new Date(2026, 9, 8, o.landedH, o.landedM || 0).getTime();
  return { now, hour: o.hour, sched: { current: null, freeMinutesUntilDuty: null, legsCompleted: o.legs, legsRemaining: 0, legsTodayCompleted: o.legs, legsTodayRemaining: 0,
      dutyEndsAt: landed, dutyEndsToday: null, yesterdayDutyHours: 0, tomorrowFirstDuty: o.tomorrow ? { start: new Date(2026, 9, 9, o.tomorrow, 0).toISOString() } : null,
      layoverAirport: null, justLandedMinAgo: Math.round((now - landed) / 60000), hasSchedule: true, flightsToday: o.legs },
    oura: { readiness: o.readiness ?? 83, sleep: o.sleep ?? null, napDetected: null }, training: { workoutToday: false },
    nutrition: { consumed: { protein: 0 }, goals: null, mealCount: 1 }, water: 0 };
};
test('the reported evening: three legs, 9:27 PM, poor sleep is a wind-down, not a full session', () => {
  const b = ctx.buildTodayBriefing(dfCtx({ hour: 21, minute: 27, landedH: 20, landedM: 25, legs: 3, sleep: 63 }));
  assertEqual(b.tone, 'rest', 'tone: ' + b.tone);
  assertEqual(/full session/i.test(b.body), false, 'no full session: ' + b.body);
  assertEqual(/wind.down|sleep/i.test(b.body) && /3 legs/.test(b.body), true, 'says why: ' + b.body);
});
test('late in the evening alone is enough to skip a hard session', () => {
  const b = ctx.buildTodayBriefing(dfCtx({ hour: 21, minute: 15, landedH: 20, landedM: 0, legs: 1, sleep: 85 }));
  assertEqual(b.tone !== 'go' && !/full session/i.test(b.body), true, b.tone + ': ' + b.body);
});
test('a heavy day or a poor night earlier in the evening means a moderate session', () => {
  const heavy = ctx.buildTodayBriefing(dfCtx({ hour: 17, landedH: 16, landedM: 30, legs: 3, sleep: 82 }));
  assertEqual(heavy.tone, 'ease', 'three legs: ' + heavy.body);
  const poor = ctx.buildTodayBriefing(dfCtx({ hour: 17, landedH: 16, landedM: 30, legs: 1, sleep: 62 }));
  assertEqual(poor.tone, 'ease', 'sleep 62: ' + poor.body);
  assertEqual(/62/.test(poor.body), true, 'names the sleep score');
});
test('an early report tomorrow makes tonight about sleep', () => {
  const b = ctx.buildTodayBriefing(dfCtx({ hour: 19, landedH: 18, legs: 2, sleep: 85, tomorrow: 6 }));
  assertEqual(b.tone, 'rest', b.body); assertEqual(/6:00 AM/.test(b.body), true, 'names the report time: ' + b.body);
});
test('a light day, good sleep, early evening still gets the full session', () => {
  const b = ctx.buildTodayBriefing(dfCtx({ hour: 16, landedH: 15, legs: 2, sleep: 84 }));
  assertEqual(b.tone, 'go', b.body); assertEqual(/full session/.test(b.body), true, b.body);
});

console.log('\nGym machines (requested: add my gym\'s machines, rotate them in, alternates, YouTube tutorials):');
const GYM_MACHINES = ['Ab Crunch (Machine)','Torso Rotation (Machine)','Back Extension (Machine)','Biceps Curl (Machine)','Triceps Extension (Machine)',
  'Pullover (Machine)','Seated Row (Machine)','Lat Pulldown','Lateral Raise (Machine)','Shoulder Press (Machine)','Assisted Dip (Machine)',
  'Assisted Pull-Up (Machine)','Rear Delt Fly (Machine)','Pec Fly (Machine)','Incline Chest Press (Machine)','Chest Press (Machine)',
  'Leg Extension (Machine)','Seated Leg Curl (Machine)','Lying Leg Curl (Machine)','Hip Abduction (Machine)','Hip Adduction (Machine)',
  'Hip Thrust (Machine)','Glute Kickback (Machine)','Standing Calf Raise (Machine)','Seated Calf Raise (Machine)','Leg Press',
  'Horizontal Calf Press (Machine)','Stair Climber','Recumbent Bike','Upright Bike','Seated Tricep Press (Machine)'];
const commPool = Object.values(ctx.WORKOUTS.comm).flatMap(w => [...w.takeoff, ...w.enroute]).map(e => e.name);
test('every machine at the gym is in the commercial-gym rotation', () => {
  const missing = GYM_MACHINES.filter(n => !commPool.includes(n));
  assertEqual(missing.length, 0, 'not in rotation: ' + missing.join(', '));
});
test('every machine has its own alternates', () => {
  const none = GYM_MACHINES.filter(n => !(ctx.ALTERNATES[n] || []).length);
  assertEqual(none.length, 0, 'no alternates: ' + none.join(', '));
});
test('every machine links straight to a YouTube video, not a search', () => {
  const bad = GYM_MACHINES.filter(n => !/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(ctx.EXERCISE_VIDEOS[n] || ''));
  assertEqual(bad.length, 0, 'no direct video: ' + bad.join(', '));
  assertEqual(ctx.getExGuide('c_up_er12', 'Chest Press (Machine)').exrx, ctx.EXERCISE_VIDEOS['Chest Press (Machine)'], 'guide link uses the video');
  assertEqual(ctx.getExGuide('c_up_er1', 'Incline DB Press').exrx.includes('results?search_query'), true, 'others still fall back to a search');
});
test('free-weight moves offer the matching machine as an alternate', () => {
  const alt = (from, name) => (ctx.ALTERNATES[from] || []).some(a => a.name === name);
  [['Flat Barbell Bench Press','Chest Press (Machine)'],['Standing Overhead Press','Shoulder Press (Machine)'],['Seated Cable Row','Seated Row (Machine)'],
   ['Face Pull','Rear Delt Fly (Machine)'],['EZ Bar Curl','Biceps Curl (Machine)'],['Romanian Deadlift','Hip Thrust (Machine)'],
   ['Standing Calf Raise','Horizontal Calf Press (Machine)'],['Treadmill Zone 2 Run','Recumbent Bike'],['Sit-Up','Ab Crunch (Machine)']].forEach(([f, n]) =>
    assertEqual(alt(f, n), true, f + ' -> ' + n));
});
test('cardio machines get a real calorie rate, not the 2.8 stretch-and-hold rate', () => {
  const met = n => ctx.exerciseMET(ctx.WORKOUTS.comm['Cardio'].enroute.find(e => e.name === n));
  assertEqual(met('Stair Climber'), 9.0, 'Stair Climber MET');
  assertEqual(met('Recumbent Bike'), 4.8, 'Recumbent Bike MET');
  assertEqual(met('Upright Bike'), 4.8, 'Upright Bike MET');
});

console.log('\nNo ring data (reported: slept without the ring, Today still showed yesterday\'s 68 and 50):');
const todayStr = ctx.localDateStr(new Date());
const yesterdayStr = ctx.localDateStr(new Date(Date.now() - 86400000));
function ringState(date, readiness) {
  ctx.ST.ouraConnected = true; ctx.ST.ouraScore = readiness; ctx.ST.readiness = null; ctx.ST.fatigue = 'go';
  ctx.ST.ouraData = { date, readiness_score: readiness, sleep_score: 50, activity_score: 91 };
}
test('yesterday\'s row is not today\'s readiness', () => {
  ringState(yesterdayStr, 68);
  assertEqual(ctx.ouraRowIsToday(), false, 'row is stale'); assertEqual(ctx.ouraMissingToday(), true, 'ring missing today');
  const c = ctx.getTodayContext();
  assertEqual(c.oura.readiness, null, 'readiness unknown'); assertEqual(c.oura.sleep, null, 'sleep unknown'); assertEqual(c.oura.missingToday, true, 'flag set');
  ringState(todayStr, 68);
  const f = ctx.getTodayContext();
  assertEqual(f.oura.readiness, 68, 'today\'s row still counts'); assertEqual(f.oura.missingToday, false, 'flag clear');
});
test('the Today card asks instead of showing stale tiles, with a Sync button', () => {
  ringState(yesterdayStr, 68);
  const html = ctx.buildOuraTopSectionHTML(ctx.getTodayContext());
  assertEqual(/No ring data for last night/.test(html), true, 'says so');
  assertEqual(/syncOuraNow\(this\)/.test(html), true, 'sync button');
  assertEqual(/setReadinessFromToday\(3\)/.test(html), true, 'self-check picker');
  assertEqual(/>68</.test(html), false, 'no stale 68 tile');
  ringState(todayStr, 68);
  const fresh = ctx.buildOuraTopSectionHTML(ctx.getTodayContext());
  assertEqual(/No ring data/.test(fresh), false, 'tiles back when the row is today\'s'); assertEqual(/>68</.test(fresh), true, 'shows 68');
});
test('the self-check sets the Pilot Condition on a no-ring day', () => {
  ringState(yesterdayStr, 85);
  const realUpd = ctx.updateOuraTopSection, realLoad = ctx.loadFatigueCalibration; ctx.updateOuraTopSection = () => {}; ctx.loadFatigueCalibration = () => {};
  ctx.setReadinessFromToday(2); assertEqual(ctx.ST.fatigue, 'nogo', '2 -> nogo');
  ctx.setReadinessFromToday(4); assertEqual(ctx.ST.fatigue, 'go', '4 -> go');
  ctx.updateOuraTopSection = realUpd; ctx.loadFatigueCalibration = realLoad;
  ctx.ST.readiness = null;
});
test('steps come from Apple Health on a no-ring day', () => {
  ringState(yesterdayStr, 68); ctx.ST.ouraSteps = 0; ctx.ST.healthkit = { stepsToday: 1840 };
  assertEqual(ctx.todayStepCount(), 1840, 'phone count wins when the ring has no data');
  ringState(todayStr, 68); ctx.ST.ouraSteps = 1432; ctx.ST.healthkit = { stepsToday: 5502 };
  assertEqual(ctx.todayStepCount(), 5502, 'the fresher (larger) count wins even when the ring has today\'s data');
  ctx.ST.ouraSteps = 5573;
  assertEqual(ctx.todayStepCount(), 5573, 'and the ring wins when it is ahead');
  ctx.ST.healthkit = { stepsToday: 1840 }; ctx.ST.ouraSteps = 0;
  ctx.ST.ouraSteps = null; assertEqual(ctx.todayStepCount(), 1840, 'phone fills in when the ring has no count');
  ctx.ST.healthkit = null; ctx.ST.ouraSteps = null;
});
test('the latest ring row is kept on the device for offline opens', () => {
  ctx.ST.user = ctx.ST.user || { id: 'u1' };
  const store = {}; const realLS = ctx.localStorage;
  ctx.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const row = { date: todayStr, readiness_score: 77, sleep_score: 81, activity_score: 60 };
  ctx.cacheOuraRow(row);
  assertEqual(ctx.cachedOuraRow().readiness_score, 77, 'round trip');
  ctx.ST.ouraData = ctx.cachedOuraRow(); ctx.ST.ouraConnected = true;
  assertEqual(ctx.ouraRowIsToday(), true, 'a cached row for today counts as today');
  ctx.ST.ouraData = null; ctx.localStorage = realLS;
});

// ─── Med check-offs survive an offline open ───
function memStore() {
  const store = {};
  return { store, ls: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } } };
}
test('offline med taps collapse to the latest one per dose and overlay the screen', () => {
  const realLS = ctx.localStorage; const m = memStore(); ctx.localStorage = m.ls;
  ctx.ST.user = { id: 'u1' };
  ctx.queueMedOp('med_a', todayStr, '07:00', true);
  ctx.queueMedOp('med_a', todayStr, '07:00', false);
  ctx.queueMedOp('med_b', todayStr, '08:00', true);
  assertEqual(ctx.pendingMedOps().length, 2, 'check then uncheck of one dose keeps only the last tap');
  ctx.ST.medsTakenToday = { 'med_a|07:00': true };
  ctx.applyPendingMedOps(todayStr);
  assertEqual(!!ctx.ST.medsTakenToday['med_a|07:00'], false, 'later uncheck wins');
  assertEqual(!!ctx.ST.medsTakenToday['med_b|08:00'], true, 'offline check shows');
  ctx.dropPendingMedOp('med_b', todayStr, '08:00');
  assertEqual(ctx.pendingMedOps().length, 1, 'a newer online tap removes the queued one');
  ctx.localStorage = realLS;
});
test('the device copy of check-offs only answers for the same user and day', () => {
  const realLS = ctx.localStorage; const m = memStore(); ctx.localStorage = m.ls;
  ctx.ST.user = { id: 'u1' }; ctx.ST.medsTakenDate = todayStr; ctx.ST.medsTakenToday = { 'med_a|07:00': true };
  ctx.cacheMedsTaken();
  assertEqual(!!ctx.cachedMedsTaken(todayStr)['med_a|07:00'], true, 'round trip');
  assertEqual(ctx.cachedMedsTaken(yesterdayStr), null, 'yesterday\'s copy is not today\'s');
  ctx.ST.user = { id: 'u2' };
  assertEqual(ctx.cachedMedsTaken(todayStr), null, 'another account never sees it');
  ctx.localStorage = realLS;
});
test('a dropped connection is told apart from a server refusal', () => {
  assertEqual(ctx.isConnectionError(new Error('timeout')), true, 'timeout');
  assertEqual(ctx.isConnectionError({ message: 'TypeError: Load failed' }), true, 'Safari fetch failure');
  assertEqual(ctx.isConnectionError({ message: 'TypeError: Failed to fetch' }), true, 'Chrome fetch failure');
  assertEqual(ctx.isConnectionError({ message: 'new row violates row-level security policy' }), false, 'RLS refusal is not offline');
});

// ─── Walking First (owner request, Oct 13: a heavy FO walking 10k a day, nervous about the gym) ───
console.log('\nWalking First objective:');
const isoDaysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(10, 0, 0, 0); return d.toISOString(); };
test('Walk and Starter Strength exist in every environment and are pickable', () => {
  ['comm', 'hotel', 'room', 'band'].forEach(env => {
    const walk = ctx.WORKOUTS[env]['Walk'], ss = ctx.WORKOUTS[env]['Starter Strength'];
    assertEqual(!!walk && walk.enroute.some(e => e.name === 'Walking'), true, env + ' Walk has the walk');
    assertEqual(!!ss && ss.takeoff.length >= 2 && ss.enroute.length >= 2, true, env + ' Starter Strength has work');
  });
  const groups = vm.runInContext('MUSCLE_GROUPS', ctx);
  assertEqual(groups.includes('Walk') && groups.includes('Starter Strength'), true, 'both in the Mission Profile picker');
  assertEqual(!!vm.runInContext('GOALS', ctx).walking, true, 'Walking First is a Mission Objective');
});
test('reused machines keep their catalog id and input type, so history stays attached', () => {
  const lp = ctx.WORKOUTS.comm['Starter Strength'].takeoff[0];
  assertEqual(lp.id + ' ' + lp.name + ' ' + lp.inputType, 'c_lb_er2 Leg Press reps_weight', 'Leg Press');
  assertEqual(lp.target, '2×12', 'lighter target for this plan');
  const orig = ctx.WORKOUTS.comm['Lower Body'].enroute.find(e => e.id === 'c_lb_er2');
  assertEqual(orig.target !== '2×12', true, 'the Lower Body Leg Press is unchanged');
});
test('Walking First: two short strength days a week, two days apart, walks otherwise', () => {
  const saved = ctx.ST.sessionCache;
  const s = (n, mg, extra) => Object.assign({ date: isoDaysAgo(n), muscle_group: mg }, extra || {});
  ctx.ST.sessionCache = [];
  assertEqual(ctx.walkingFirstNext(), 'Starter Strength', 'nothing logged yet: start with strength');
  ctx.ST.sessionCache = [s(1, 'Starter Strength')];
  assertEqual(ctx.walkingFirstNext(), 'Walk', 'strength yesterday: walk today');
  ctx.ST.sessionCache = [s(2, 'Starter Strength')];
  assertEqual(ctx.walkingFirstNext(), 'Starter Strength', 'two days later: strength again');
  ctx.ST.sessionCache = [s(2, 'Starter Strength'), s(5, 'Starter Strength')];
  assertEqual(ctx.walkingFirstNext(), 'Walk', 'two this week already: walk');
  ctx.ST.sessionCache = [s(3, 'Starter Strength'), s(9, 'Starter Strength'), s(0, 'Walk'), s(1, 'Cardio', { importedFromOura: true })];
  assertEqual(ctx.walkingFirstNext(), 'Starter Strength', 'walks and ring-imported cardio do not count as strength');
  ctx.ST.goal = 'walking';
  ctx.ST.sessionCache = [s(1, 'Lower Body')];
  assertEqual(ctx.getRecommendedNext(), 'Walk', 'the recommended profile follows the same rule');
  ctx.ST.goal = 'longevity'; ctx.ST.sessionCache = saved;
});
test('Runner: easy runs, one long run and one strength day a week', () => {
  const saved = ctx.ST.sessionCache, sg = ctx.ST.goal, sp = ctx.ST.runPlan;
  assertEqual(!!vm.runInContext('GOALS', ctx).runner, true, 'Runner is a Mission Objective');
  const run = (n, miles) => ({ date: isoDaysAgo(n), muscle_group: 'Run', sets: { c_ca_er5: [{ miles: String(miles), seconds: String(miles * 600) }] } });
  const lift = n => ({ date: isoDaysAgo(n), muscle_group: 'Lower Body' });
  ctx.ST.goal = 'runner'; ctx.ST.runPlan = { daysPerWeek: 3, race: '10k', weeklyMiles: 18 };
  ctx.ST.sessionCache = [];
  assertEqual(ctx.runnerNext().kind, 'easy', 'nothing logged: easy run');
  ctx.ST.sessionCache = [run(2, 3)];
  assertEqual(ctx.runnerNext().kind, 'strength', 'one run in, no strength this week: strength day');
  ctx.ST.sessionCache = [run(2, 3), lift(1)];
  assertEqual(ctx.runnerNext().kind + ':' + ctx.runnerNext().miles, 'long:6', 'strength done, long run owed: long run of about 6');
  ctx.ST.sessionCache = [run(3, 3), lift(2), run(1, 6)];
  assertEqual(ctx.runnerNext().kind, 'easy', 'long run done: back to easy');
  ctx.ST.sessionCache = [run(5, 3), run(3, 6), run(1, 3)];
  assertEqual(ctx.runnerNext().kind, 'strength', 'three runs, long done, no strength: strength day even with run days used');
  ctx.ST.sessionCache = [run(6, 3), lift(4), run(3, 6), run(1, 3)];
  assertEqual(/done/.test(ctx.runnerNext().note), true, 'plan complete: shakeout note');
  assertEqual(ctx.getRecommendedNext(), 'Run', 'recommended profile follows runnerNext');
  // Week summary (Monday start): runs since this week's Monday
  const w = ctx.runWeekSummary();
  assertEqual(w.plan.weeklyMiles, 18, 'plan carried');
  assertEqual(ctx.cleanRunPlan({ daysPerWeek: 9, race: 'ultra', weeklyMiles: 0 }).daysPerWeek + ctx.cleanRunPlan({}).race + ctx.cleanRunPlan({ race: 'half' }).weeklyMiles, '3consistency25', 'bad input falls back');
  assertEqual(ctx.isRunSession({ date: isoDaysAgo(1), muscle_group: 'Cardio', importedFromOura: true, ouraActivity: 'running' }), true, 'ring-detected run counts');
  ctx.ST.goal = sg; ctx.ST.runPlan = sp; ctx.ST.sessionCache = saved;
});
test('running stats: weekly and monthly miles, best efforts, monthly challenge', () => {
  const now = new Date(2026, 9, 18, 12, 0); // Sunday Oct 18; week starts Mon Oct 12
  const run = (y, m, d, miles, secPerMi) => ({ date: new Date(y, m, d, 9, 0).toISOString(), muscle_group: 'Run', sets: { c_ca_er5: [{ miles: String(miles), seconds: String(Math.round(miles * secPerMi)) }] } });
  const S = [run(2026, 9, 13, 3.2, 560), run(2026, 9, 15, 6.5, 600), run(2026, 9, 3, 13.2, 650), run(2026, 8, 28, 4, 540), { date: new Date(2026, 9, 16).toISOString(), muscle_group: 'Upper Pull' }];
  const sg = ctx.ST.goal, sp = ctx.ST.runPlan; ctx.ST.goal = 'longevity'; ctx.ST.runPlan = null;
  const st = ctx.runStats(S, now);
  assertEqual(st.weekMiles, 9.7, 'this week: Oct 13 and 15');
  assertEqual(st.monthMiles, 22.9, 'October: three runs');
  assertEqual(st.monthGoal, 25, 'default challenge 25 mi');
  assertEqual(st.monthChallengeMet, false, 'not yet');
  assertEqual(st.longestMi, 13.2, 'longest run');
  const e = Object.fromEntries(st.efforts.map(x => [x.key, x.best && Math.round(x.best.pace)]));
  assertEqual(e.mile + ',' + e['5k'] + ',' + e['10k'] + ',' + e.half, '540,540,600,650', 'best pace per distance comes from runs at least that long');
  assertEqual(ctx.fmtPace(560) + ' ' + ctx.fmtDuration(st.efforts[1].best.estSeconds), '9:20 27:58', 'pace and est. 5K time formatted');
  assertEqual(st.weeks.length === 8 && st.weeks[7].miles === 9.7 && st.weeks[5].miles === 17.2, true, '8-week series (Sep 28 and Oct 3 share a week), newest last: ' + st.weeks.map(w => w.miles).join(','));
  ctx.ST.goal = 'runner'; ctx.ST.runPlan = { daysPerWeek: 3, race: '5k', weeklyMiles: 5 };
  assertEqual(ctx.runStats(S, now).monthGoal + ':' + ctx.runStats(S, now).monthChallengeMet, '22:true', 'runner goal from weekly target (5 x 4.3 = 22), met');
  assertEqual(ctx.runStats([], now).totalRuns, 0, 'no runs: nothing');
  ctx.ST.goal = sg; ctx.ST.runPlan = sp;
});
test('crew feed: a saved session becomes a post, stats line, time ago, escaping', () => {
  const run = { date: '2026-10-18T17:35:00.000Z', muscle_group: 'Run', env: 'hotel', sets: { c_ca_er5: [{ miles: '5.2', seconds: '2880' }] }, workoutSnapshot: { taxi: [], takeoff: [], enroute: [{ id: 'c_ca_er5', name: 'Outdoor Run' }], landing: [] } };
  const a = ctx.crewActivityFromSession(run, '123', { airport: 'DFW' });
  assertEqual(a.kind + '|' + a.title + '|' + a.miles + '|' + a.seconds + '|' + a.env + '|' + a.visibility, 'run|Outdoor Run|5.2|2880|hotel|everyone', 'run post');
  assertEqual(ctx.crewStatLine(a), '5.2 mi · 48:00 · 9:14/mi · hotel gym · DFW', 'stat line');
  const lift = { date: '2026-10-18T17:35:00.000Z', muscle_group: 'Full Body', env: 'comm', durationMinutes: 60, sets: { s: [{ reps: '5', weight: '225' }, { reps: '5', weight: '225' }], p: [{ reps: '8', weight: '60' }] }, workoutSnapshot: { taxi: [], takeoff: [{ id: 's', name: 'Back Squat' }], enroute: [{ id: 'p', name: 'DB Bench Press' }], landing: [] } };
  const b = ctx.crewActivityFromSession(lift, '124', { visibility: 'followers' });
  assertEqual(b.kind + '|' + b.title + '|' + b.sets_logged + '|' + b.seconds + '|' + b.visibility, 'workout|Full Body|3|3600|followers', 'workout post');
  assertEqual(ctx.crewStatLine(b), '60 min · 3 sets · gym', 'workout stat line');
  const walk = { date: '2026-10-17T17:00:00.000Z', muscle_group: 'Cardio', importedFromOura: true, ouraActivity: 'walking', sets: { c_ca_er3: [{ miles: '1.5', seconds: '1800' }] } };
  assertEqual(ctx.crewActivityFromSession(walk, 'o1').kind + ':' + ctx.crewActivityFromSession(walk, 'o1').env, 'walk:null', 'ring walk: walk, no location');
  const now = new Date('2026-10-18T20:00:00Z');
  assertEqual([ctx.crewAgo('2026-10-18T19:50:00Z', now), ctx.crewAgo('2026-10-18T15:00:00Z', now), ctx.crewAgo('2026-10-15T15:00:00Z', now)].join(','), '10m,5h,3d', 'time ago');
  assertEqual(ctx.crewEsc('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;', 'html escaped');
});
test('a NO-GO day never removes the walk from a walk session', () => {
  const sv = { mg: ctx.ST.muscleGroup, f: ctx.ST.fatigue };
  ctx.ST.muscleGroup = 'Walk'; ctx.ST.fatigue = 'nogo';
  const wk = ctx.getFilteredWorkout(ctx.WORKOUTS.comm['Walk']);
  assertEqual(wk.enroute.length, 1, 'walk kept'); assertEqual(wk.enroute[0].name, 'Walking', 'it is the walk');
  ctx.ST.muscleGroup = sv.mg; ctx.ST.fatigue = sv.f;
});
test('the step goal: picked by the user, 7,000 to start on Walking First, optional on the rest', () => {
  assertEqual(ctx.cleanStepGoal(6540), 6500, 'rounded to the nearest 100');
  assertEqual(ctx.cleanStepGoal(500), null, 'too low refused'); assertEqual(ctx.cleanStepGoal('abc'), null, 'not a number refused');
  ctx.ST.goal = 'fatloss'; ctx.ST.stepGoal = null;
  assertEqual(ctx.activeStepGoal(), null, 'other objectives: off until turned on');
  ctx.ST.stepGoal = 10000;
  assertEqual(ctx.activeStepGoal(), 10000, 'other objectives: on once a goal is picked');
  const realR = { s: ctx.syncBodyMetricsFieldsToState, g: ctx.saveGoalLevel, r: ctx.renderPage, t: ctx.showToast };
  ctx.syncBodyMetricsFieldsToState = () => {}; ctx.saveGoalLevel = () => {}; ctx.renderPage = () => {}; ctx.showToast = () => {};
  ctx.setStepGoal(null);
  assertEqual(ctx.activeStepGoal(), null, 'Off turns it off');
  ctx.ST.goal = 'walking'; ctx.ST.stepGoal = 8000; ctx.setStepGoal(null);
  assertEqual(ctx.activeStepGoal(), 8000, 'Walking First has no Off');
  ctx.syncBodyMetricsFieldsToState = realR.s; ctx.saveGoalLevel = realR.g; ctx.renderPage = realR.r; ctx.showToast = realR.t;
  const html = ctx.renderStepGoalPicker();
  assertEqual(/>OFF</.test(html), false, 'no Off button on Walking First');
  ctx.ST.goal = 'fatloss';
  assertEqual(/>OFF</.test(ctx.renderStepGoalPicker()), true, 'Off button on other objectives');
  ctx.ST.goal = 'walking'; ctx.ST.stepGoal = null;
  assertEqual(ctx.activeStepGoal(), 7000, 'starts at 7,000');
  ctx.ST.stepGoal = 10000;
  assertEqual(ctx.activeStepGoal(), 10000, 'uses the picked goal');
  const real = { s: ctx.syncBodyMetricsFieldsToState, g: ctx.saveGoalLevel, r: ctx.renderPage };
  ctx.syncBodyMetricsFieldsToState = () => {}; ctx.saveGoalLevel = () => {}; ctx.renderPage = () => {};
  ctx.ST.goal = 'longevity'; ctx.ST.stepGoal = null; ctx.selectGoal('walking');
  assertEqual(ctx.ST.stepGoal, 7000, 'choosing Walking First sets 7,000 if nothing was picked');
  ctx.syncBodyMetricsFieldsToState = real.s; ctx.saveGoalLevel = real.g; ctx.renderPage = real.r;
  ctx.ST.goal = 'longevity'; ctx.ST.stepGoal = null;
});
test('Today shows steps against the goal, and what is left late in the day', () => {
  ctx.ST.goal = 'walking'; ctx.ST.stepGoal = 7000;
  const part = ctx.stepGoalProgressHtml(4210);
  assertEqual(/4,210 \/ 7,000/.test(part), true, 'count against goal');
  assertEqual(/✓/.test(ctx.stepGoalProgressHtml(7300)), true, 'check mark once reached');
  assertEqual(/Apple Health/.test(ctx.stepGoalProgressHtml(null)), true, 'says where steps come from when there are none');
  const gaps = ctx.buildTodayGaps({ nutrition: {}, training: { workoutToday: false }, hour: 16, now: new Date(), oura: { steps: 4210 } });
  assertEqual(gaps.some(g => /steps/.test(g.text)), false, 'steps are not repeated in the still-open list (the count is at the top)');
  { const keepW = ctx.ST.waterIn, keepH = ctx.ST.trackHydration; ctx.ST.trackHydration = true; ctx.ST.waterIn = 0;
    const late = new Date(); late.setHours(20, 0, 0, 0);
    const g2 = ctx.buildTodayGaps({ nutrition: {}, training: { workoutToday: true }, hour: 20, now: late, oura: { steps: null } }).filter(g => /Water/.test(g.text));
    assertEqual(g2.length === 0 || g2.every(g => g.fn === 'openQuickWaterLog()'), true, 'a water line opens the water log, not the workout screen (reported Nov 16)');
    ctx.ST.waterIn = keepW; ctx.ST.trackHydration = keepH; }
  assertEqual(/FLIGHT DECK WISDOM/.test(ctx.todayWisdomCardHtml()) && ctx.todayWisdomCardHtml().includes(vm.runInContext('WISDOM[todaysWisdomIdx()].title', ctx)), true, 'today\'s wisdom card is on the Today page');
  ctx.ST.goal = 'longevity'; ctx.ST.stepGoal = null;
  assertEqual(ctx.stepGoalProgressHtml(4210), '', 'nothing for other objectives');
});

test('step streak: days in a row at the goal, today in progress does not break it', () => {
  const t = todayStr, d = n => ctx.shiftDateStr(t, -n);
  const h = {}; h[d(1)] = { steps: 8000, goal: 7000 }; h[d(2)] = { steps: 7100, goal: 7000 }; h[d(3)] = { steps: 6000, goal: 7000 };
  h[t] = { steps: 3000, goal: 7000 };
  let r = ctx.stepStreak(h, t, 7000);
  assertEqual(r.count + ' ' + r.todayMet, '2 false', 'two days through yesterday, today still going');
  h[t] = { steps: 7200, goal: 7000 };
  r = ctx.stepStreak(h, t, 7000);
  assertEqual(r.count + ' ' + r.todayMet, '3 true', 'today counts once met');
  h[d(2)] = { steps: 7100, goal: 9000 };
  assertEqual(ctx.stepStreak(h, t, 7000).count, 2, 'judged against that day\'s goal');
  const oura = {}; oura[d(1)] = { steps: 7500, goal: null };
  assertEqual(ctx.stepStreak(oura, t, 7000).count, 1, 'Oura-filled days use the current goal');
});
test('Five-Day Stride badge: earned by the longest run, and the line on Today counts down to it', () => {
  const t = todayStr, d = n => ctx.shiftDateStr(t, -n);
  const h = {};
  [10, 9, 8, 7, 6].forEach(n => { h[d(n)] = { steps: 9000, goal: 7000 }; });
  h[d(3)] = { steps: 9000, goal: 7000 };
  assertEqual(ctx.bestStepStreak(h, 7000), 5, 'an old 5-day run still counts');
  const stats = ctx.computeBadgeStats([], [], h, 7000);
  const badge = vm.runInContext('BADGES', ctx).find(b => b.id === 'step_streak_5');
  assertEqual(!!badge && badge.check(stats), true, 'badge check passes at 5');
  assertEqual(badge.check(ctx.computeBadgeStats([], [], {}, 7000)), false, 'not without history');
  ctx.ST.goal = 'fatloss'; ctx.ST.stepGoal = 7000; ctx.ST.badges = {};
  const s3 = {}; s3[d(2)] = { steps: 8000, goal: 7000 }; s3[d(1)] = { steps: 8000, goal: 7000 }; s3[t] = { steps: 7500, goal: 7000 };
  ctx.ST.stepHistory = s3;
  assertEqual(/3 days in a row at your goal · 2 more for the Five-Day Stride badge/.test(ctx.stepStreakLineHtml()), true, 'countdown to the badge');
  ctx.ST.stepHistory = {}; ctx.ST.stepGoal = null; ctx.ST.goal = 'longevity';
});
test('today\'s steps are saved without a write on every redraw', () => {
  const SBc = vm.runInContext('SB', ctx); const realFrom = SBc.from; const writes = [];
  SBc.from = () => { const qb = {}; qb.upsert = (p) => { writes.push(p); return qb; }; qb.then = (res) => res({ data: null, error: null }); return qb; };
  const realAward = ctx.awardBadges; let awards = 0; ctx.awardBadges = () => { awards++; };
  ctx.ST.user = { id: 'u1' }; ctx.ST.goal = 'fatloss'; ctx.ST.stepGoal = 7000; ctx.ST.stepHistory = {};
  ctx.noteStepsToday(4000); ctx.noteStepsToday(4100); ctx.noteStepsToday(4200);
  assertEqual(writes.length, 1, 'small changes do not write again');
  ctx.noteStepsToday(4400);
  assertEqual(writes.length, 2, '250 more steps writes');
  ctx.noteStepsToday(7050);
  assertEqual(writes.length + ' ' + awards, '3 1', 'meeting the goal writes and checks badges once');
  assertEqual(writes[2].goal + ' ' + writes[2].steps, '7000 7050', 'saves the day\'s goal with the count');
  ctx.notePastOuraSteps([{ day: ctx.shiftDateStr(todayStr, -1), steps: 9100 }, { day: todayStr, steps: 7050 }], todayStr);
  const past = writes[3];
  assertEqual(Array.isArray(past) && past.length === 1 && !('goal' in past[0]), true, 'Oura fills earlier days only, without touching their goal');
  SBc.from = realFrom; ctx.awardBadges = realAward; ctx.ST.stepGoal = null; ctx.ST.goal = 'longevity'; ctx.ST.stepHistory = {};
});

test('Run: one outdoor run in every environment, never trimmed by readiness, treadmill one tap away', () => {
  const sv = { mg: ctx.ST.muscleGroup, f: ctx.ST.fatigue, l: ctx.ST.level };
  ctx.ST.muscleGroup = 'Run';
  ['comm', 'hotel', 'room', 'band'].forEach(env => {
    ['go', 'marginal', 'nogo'].forEach(f => {
      ctx.ST.fatigue = f; ctx.ST.level = 'intermediate';
      const wk = ctx.getFilteredWorkout(ctx.WORKOUTS[env]['Run']);
      assertEqual(wk.enroute.map(e => e.name).join(), 'Outdoor Run', env + ' / ' + f + ' keeps the outdoor run');
    });
  });
  assertEqual(ctx.getAlternates('Outdoor Run').some(a => a.name === 'Treadmill Zone 2 Run'), true, 'treadmill is an alternate');
  assertEqual(ctx.getAlternates('Treadmill Zone 2 Run')[0].name, 'Outdoor Run', 'and back again');
  const runIds = vm.runInContext('RUNNING_EXERCISES', ctx);
  ['comm', 'hotel', 'room'].forEach(env => assertEqual(runIds.includes(ctx.WORKOUTS[env]['Run'].enroute[0].id), true, env + ' run counts for the leaderboard'));
  const tread = ctx.buildExerciseCatalog().find(e => e.name === 'Treadmill Zone 2 Run');
  assertEqual(runIds.includes(tread.id), true, 'a swapped-in treadmill run counts too');
  ctx.ST.muscleGroup = sv.mg; ctx.ST.fatigue = sv.f; ctx.ST.level = sv.l;
});

test('after a workout is logged today, the Today card no longer offers another one', () => {
  const realPro = ctx.isPro; const sv = ctx.ST.workout;
  ctx.ST.workout = null;
  const base = ctx.getTodayContext();
  const withTraining = done => Object.assign({}, base, { training: Object.assign({}, base.training, { workoutToday: done }) });
  ctx.isPro = () => true;
  assertEqual(/Start a workout/.test(ctx.buildOuraTopSectionHTML(withTraining(false))), true, 'Pro: offered before training');
  assertEqual(/Start a workout/.test(ctx.buildOuraTopSectionHTML(withTraining(true))), false, 'Pro: not offered once trained');
  ctx.isPro = () => false;
  const html = ctx.buildOuraTopSectionHTML(withTraining(true));
  assertEqual(/switchTab\('preflight'\)/.test(html), false, 'free: no workout button once trained');
  ctx.isPro = realPro; ctx.ST.workout = sv;
});

console.log('\nTrip plan after the trip (reported Oct 31: plan for a finished trip on a vacation day):');
test('no trip plan once the last leg has landed; plan during and just before a trip', () => {
  const ctx = loadAppJS();
  const sched = [
    { type: 'flight', start: '2026-10-29T14:47:00Z', end: '2026-10-29T18:14:00Z' },
    { type: 'layover', start: '2026-10-29T18:14:00Z', end: '2026-10-30T12:00:00Z', airport: 'SEA' },
    { type: 'flight', start: '2026-10-30T13:00:00Z', end: '2026-10-30T16:06:00Z' },
    { type: 'flight', start: '2026-10-30T20:10:00Z', end: '2026-10-30T22:19:00Z' },
    { type: 'other', start: '2026-10-31T07:00:00Z', end: '2026-11-07T06:58:59Z', summary: 'Vacation' },
  ];
  assertEqual(ctx.getTripBounds(sched, new Date('2026-10-31T19:07:00Z')), null, 'vacation day after the trip: no plan');
  assertEqual(ctx.getTripBounds(sched, new Date('2026-10-31T02:06:00Z')), null, 'evening after landing home: no plan');
  assertEqual(!!ctx.getTripBounds(sched, new Date('2026-10-30T02:00:00Z')), true, 'on the layover: plan');
  assertEqual(!!ctx.getTripBounds(sched, new Date('2026-10-28T20:00:00Z')), true, 'day before the trip: plan');
});

console.log('\nBetween legs (reported Oct 23: "I am not doing a workout between flights"):');
test('a sit between two legs today is flagged; a layover, the first leg and the last leg are not', () => {
  assertEqual(ctx.betweenLegsOnDuty({ legsTodayCompleted: 1, legsTodayRemaining: 2, current: null }), true, 'in the terminal between legs');
  assertEqual(ctx.betweenLegsOnDuty({ legsTodayCompleted: 1, legsTodayRemaining: 1, current: { type: 'layover' } }), false, 'at a layover hotel');
  assertEqual(ctx.betweenLegsOnDuty({ legsTodayCompleted: 0, legsTodayRemaining: 3, current: null }), false, 'before the first leg');
  assertEqual(ctx.betweenLegsOnDuty({ legsTodayCompleted: 3, legsTodayRemaining: 0, current: null }), false, 'after the last leg');
  assertEqual(ctx.betweenLegsOnDuty(null), false, 'no schedule');
});

console.log('\nFAA Medical (open to every member since Oct 22 2026):');
test('the section is offered to every signed-in member, never when signed out', () => {
  const sv = ctx.ST.user;
  ctx.ST.user = { id: '7e41ca46-6e00-4c54-bc3f-2e45d923fe0b' }; assertEqual(ctx.medicalEnabled(), true, 'owner');
  ctx.ST.user = { id: 'u-someone-else' }; assertEqual(ctx.medicalEnabled(), true, 'any member');
  ctx.ST.user = null; assertEqual(ctx.medicalEnabled(), false, 'signed out');
  ctx.ST.user = sv;
});
test('certificate privileges follow 14 CFR 61.23(d), to the end of the month', () => {
  // Exam June 10 2026, pilot born 1990 (35 at exam): first class 12 months, second 12, third 60.
  let p = ctx.medicalPrivileges(1, '2026-06-10', '1990-09-01');
  assertEqual(p.map(x => x.cls + ':' + x.ends).join(' '), '1:2027-06-30 2:2027-06-30 3:2031-06-30', 'under 40, first class');
  // Same exam, born 1980 (45): first class 6 months, second 12, third 24.
  p = ctx.medicalPrivileges(1, '2026-06-10', '1980-09-01');
  assertEqual(p.map(x => x.cls + ':' + x.ends).join(' '), '1:2026-12-31 2:2027-06-30 3:2028-06-30', '40 and over, first class');
  // Birthday after the exam in the same year: still 39 at exam.
  p = ctx.medicalPrivileges(1, '2026-06-10', '1986-07-01');
  assertEqual(p[0].ends, '2027-06-30', '39 at exam counts as under 40');
  p = ctx.medicalPrivileges(2, '2026-01-31', '1980-01-01');
  assertEqual(p.map(x => x.cls + ':' + x.ends).join(' '), '2:2027-01-31 3:2028-01-31', 'second class, 40+');
  p = ctx.medicalPrivileges(3, '2026-03-05', '1995-01-01');
  assertEqual(p.map(x => x.cls + ':' + x.ends).join(' '), '3:2031-03-31', 'third class, under 40');
  assertEqual(ctx.medicalPrivileges(1, '', '1990-01-01').length, 0, 'nothing without an exam date');
});
test('seat decides the class that matters, 14 CFR 61.23(a)', () => {
  const T = '2026-10-16';
  const n = rec => ctx.medicalNeededClass(rec, T).cls;
  assertEqual(n({ seat: 'capt', cls: 1, dob: '1980-01-01' }), 1, 'captain: first');
  assertEqual(n({ seat: 'fo', cls: 1, dob: '1980-01-01' }), 2, 'Part 121 FO: second');
  assertEqual(n({ seat: 'fo', cls: 1, dob: '1980-01-01', augmented: true }), 1, 'FO, 3+ pilot flag or supplemental: first');
  assertEqual(n({ seat: 'fo', cls: 1, dob: '1980-01-01', airlineFirst: true }), 1, 'FO, airline rule: first');
  assertEqual(n({ seat: 'fo', cls: 1, dob: '1966-10-16' }), 1, 'FO turning 60 today: first');
  assertEqual(n({ seat: 'fo', cls: 1, dob: '1966-10-17' }), 2, 'FO one day short of 60: second');
  assertEqual(n({ seat: 'other', cls: 2 }), 2, 'other: the class chosen');
  assertEqual(n({ seat: '', cls: 3 }), 3, 'no seat yet: the class chosen');
  // FO, 45, first-class exam June 10 2026: first-class lapses Dec 31, but the
  // date that grounds a first officer is the second-class end, June 30 2027.
  const rec = { seat: 'fo', cls: 1, dob: '1981-01-01' };
  const privs = ctx.medicalPrivileges(1, '2026-06-10', rec.dob);
  assertEqual(ctx.medicalKeyPrivilege(rec, privs, T).ends, '2027-06-30', 'FO keys on second-class end');
  assertEqual(ctx.medicalKeyPrivilege(Object.assign({}, rec, { seat: 'capt' }), privs, T).ends, '2026-12-31', 'captain keys on first-class end');
  // Holding second class in a captain seat: falls back to the top line (and the page warns).
  const p2 = ctx.medicalPrivileges(2, '2026-06-10', rec.dob);
  assertEqual(ctx.medicalKeyPrivilege({ seat: 'capt', cls: 2 }, p2, T).cls, 2, 'short certificate: top line');
});
test('numbers page takes the latest value of each measure', () => {
  const row = ctx.medBioLatest([{ weight_lb: '219', systolic_bp: null, diastolic_bp: null, fasting_glucose: null }, { weight_lb: '223', systolic_bp: 118, diastolic_bp: 81, fasting_glucose: null }, { weight_lb: '220', fasting_glucose: 117 }]);
  assertEqual(JSON.stringify(row), JSON.stringify({ weight_lb: '219', systolic_bp: 118, diastolic_bp: 81, fasting_glucose: 117 }), 'latest per field');
  assertEqual(ctx.medicalBioFlags(row, 72).map(f => f.tone).join(','), 'green,amber,green', 'BP fine, glucose prediabetes range, BMI under 30');
});
test('ECG: once at the first exam from 35, yearly from 40, first class only', () => {
  const r = (cls, dob, hadEcg, lastEcg) => ctx.medicalEcgDue({ cls, dob, hadEcg, lastEcg }, '2027-06-30');
  assertEqual(r(1, '1995-01-01', false, '').due, false, 'under 35: none');
  assertEqual(r(1, '1990-01-01', false, '').due, true, '37, never had one: due');
  assertEqual(r(1, '1990-01-01', true, '2025-06-01').due, false, '37, had one: not due');
  assertEqual(r(1, '1980-01-01', true, '2026-06-20').due, true, '47, last one a year ago: due');
  assertEqual(r(1, '1980-01-01', true, '2027-01-15').due, false, '47, last one 5 months ago: not due');
  assertEqual(r(1, '1980-01-01', true, '').due, true, '47, no date recorded: assume due');
  assertEqual(r(2, '1980-01-01', true, ''), null, 'second class: no ECG rule');
  // Wording: real dates, measured to the next exam, not 'months ago'.
  const w = ctx.medicalEcgDue({ cls: 1, dob: '1977-01-01', hadEcg: true, lastEcg: '2026-06-05' }, '2026-12-31');
  assertEqual(w.due, false, 'June ECG, exam due by Dec 31: not due');
  assertEqual(/June 5, 2026/.test(w.why) && /December 31, 2026/.test(w.why) && /7 months old/.test(w.why) && /June 2027/.test(w.why) && !/ago/.test(w.why), true, 'why text: ' + w.why);
});
test('medication search finds brand and generic names and tags them', () => {
  const k = q => ctx.medSearch(q).map(m => m.g + ':' + m.k).join(' | ');
  assertEqual(/finasteride:ok/.test(k('propecia')), true, 'brand finds finasteride, accepted');
  assertEqual(/minoxidil \(oral\):ok/.test(k('minoxidil')) && /minoxidil \(topical\):ok/.test(k('minoxidil')), true, 'both minoxidil forms');
  assertEqual(ctx.medSearch('minoxidil').find(m => m.g.startsWith('minoxidil (oral)')).flag, true, 'oral minoxidil carries the ask-AME flag');
  assertEqual(/diphenhydramine:dnf/.test(k('zzzquil')), true, 'ZzzQuil is diphenhydramine, do not fly');
  assertEqual(ctx.medSearch('benadryl')[0].wait, '60 hours', '60-hour wait');
  assertEqual(/sertraline:si/.test(k('zoloft')), true, 'SSRI is the special issuance path');
  assertEqual(/clonidine:dni/.test(k('clonidine')), true, 'clonidine is do not issue');
  assertEqual(ctx.medSearch('xyzzy').length, 0, 'unknown gives nothing');
  assertEqual(ctx.medSearch('').length, 0, 'empty gives nothing');
  const buckets = new Set(ctx.FAA_MEDS.map(m => m.k)); ['ok','si','dnf','dni'].forEach(b => assertEqual(buckets.has(b), true, 'bucket ' + b + ' used'));
  ctx.FAA_MEDS.forEach(m => assertEqual(/—|–/.test(m.n + m.b + (m.wait || '')), false, 'no dashes in ' + m.g));
});
test('biometric flags use the FAA lines (155/95, 100/126, BMI 30/35/40)', () => {
  const f = (row, h) => ctx.medicalBioFlags(row, h).map(x => x.tone).join(',');
  assertEqual(f({ systolic_bp: 160, diastolic_bp: 90 }), 'red', 'systolic over 155');
  assertEqual(f({ systolic_bp: 150, diastolic_bp: 96 }), 'red', 'diastolic over 95');
  assertEqual(f({ systolic_bp: 142, diastolic_bp: 88 }), 'amber', 'high but under the ceiling');
  assertEqual(f({ systolic_bp: 120, diastolic_bp: 78 }), 'green', 'normal');
  assertEqual(f({ fasting_glucose: 126 }), 'red', 'diabetes range');
  assertEqual(f({ fasting_glucose: 104 }), 'amber', 'prediabetes range');
  assertEqual(f({ weight_lb: 290, weight_lb: 290 }, 70), 'red', 'BMI 41.6');
  assertEqual(f({ weight_lb: 250 }, 70), 'amber', 'BMI 35.9');
  assertEqual(f({ weight_lb: 180 }, 70), 'green', 'BMI 25.8');
  assertEqual(ctx.medicalBioFlags(null).length, 0, 'no row, no flags');
});
test('mid range and distance checks: sizes and FAA lines by class and age', () => {
  assertEqual(Math.abs(ctx.visionLetterMm(20, 6096) - 8.87) < 0.01, true, '20/20 at 20 ft is 8.87 mm');
  assertEqual(Math.abs(ctx.visionLetterMm(20, 3048) - 4.43) < 0.01, true, '20/20 at 10 ft is 4.43 mm');
  assertEqual(Math.abs(ctx.visionLetterMm(40, 812.8) - 2 * ctx.visionLetterMm(20, 812.8)) < 1e-9, true, '20/40 is twice 20/20');
  const capt = { seat: 'capt', cls: 1, dob: '1975-01-01', vision: {} };
  const far = ctx.medVisionTest(capt, 'far');
  assertEqual(far.std + ':' + far.ft + ':' + Math.round(far.distMm), '20:10:3048', 'captain distance: 20/20, default 10 ft');
  assertEqual(ctx.medVisionTest({ seat: 'other', cls: 3, dob: '1990-01-01', vision: { farFt: 20 } }, 'far').std + ':' + ctx.medVisionTest({ seat: 'other', cls: 3, dob: '1990-01-01', vision: { farFt: 20 } }, 'far').ft, '40:20', 'third class distance: 20/40, 20 ft chosen');
  assertEqual(ctx.medVisionTest(capt, 'mid').required, true, 'mid range required at 51, first class');
  assertEqual(ctx.medVisionTest({ seat: 'capt', cls: 1, dob: '1990-01-01' }, 'mid').required, false, 'not required at 36');
  assertEqual(ctx.medVisionVerdict(far, 'right', { den: 25 }).tone, 'amber', '20/25 misses 20/20 distance');
  assertEqual(ctx.medVisionVerdict(far, 'right', { den: 20 }).tone, 'green', '20/20 meets it');
  assertEqual(/from age 50/.test(ctx.medVisionVerdict(ctx.medVisionTest({ seat: 'capt', cls: 1, dob: '1990-01-01' }, 'mid'), 'left', { den: 50 }).body), true, 'under 50 told it is not on the exam yet');
  const v = { right: { den: 30 }, mid: { left: { den: 40 } }, far: {} };
  assertEqual([ctx.medVisionResult(v, 'near', 'right').den, ctx.medVisionResult(v, 'mid', 'left').den, ctx.medVisionResult(v, 'far', 'left')].join(','), '30,40,', 'results read from the right place');
});
test('near-vision letters are sized by the 5 arc-minute rule at 16 inches', () => {
  const mm20 = ctx.visionLetterMm(20, 406.4), mm40 = ctx.visionLetterMm(40, 406.4);
  assertEqual(Math.abs(mm20 - 0.591) < 0.005, true, '20/20 letter is 0.59 mm, got ' + mm20.toFixed(3));
  assertEqual(Math.abs(mm40 / mm20 - 2) < 0.001, true, '20/40 is twice 20/20');
  assertEqual(ctx.visionLineLetters(7).split(' ').length, 5, 'five letters a line');
  assertEqual(ctx.visionLineLetters(7), ctx.visionLineLetters(7), 'same letters on redraw');
  ctx.visionLineLetters(7).split(' ').forEach(l => assertEqual(ctx.SLOAN.includes(l), true, 'Sloan letter ' + l));
});
test('medical data lives on the phone only and can be wiped', () => {
  const realLS = ctx.localStorage; const store = {}; ctx.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const svUser = ctx.ST.user; ctx.ST.user = { id: 'u1' }; ctx.ST.medical = null;
  const rec = ctx.medicalRecord(); rec.examDate = '2026-06-10'; rec.dob = '1980-09-01'; ctx.saveMedicalRecord();
  assertEqual(JSON.parse(store.fcf_medical_v1).examDate, '2026-06-10', 'saved locally');
  ctx.ST.user = { id: 'u2' }; ctx.ST.medical = null;
  assertEqual(ctx.medicalRecord().examDate, '', 'another account on the phone starts clean');
  ctx.ST.user = { id: 'u1' }; ctx.ST.medical = null;
  assertEqual(ctx.medicalRecord().examDate, '2026-06-10', 'the owner gets it back');
  assertEqual(Object.keys(store).join(','), 'fcf_medical_v1', 'only the local key is touched');
  ctx.deleteMedicalRecord();
  assertEqual('fcf_medical_v1' in store, false, 'wiped');
  ctx.localStorage = realLS; ctx.ST.medical = null; ctx.ST.user = svUser;
});

// Async cases run after the synchronous ones, before the summary.
const asyncTests = [];
function testAsync(name, fn) { asyncTests.push([name, fn]); }

testAsync('an offline open shows the morning check-offs, and reconnecting sends offline taps', async () => {
  const realLS = ctx.localStorage; const m = memStore(); ctx.localStorage = m.ls;
  const SBc = vm.runInContext('SB', ctx); const realFrom = SBc.from;
  ctx.ST.user = { id: 'u1' };
  // Morning, online: server has two doses; the device copy saves them.
  const serverRows = [{ med_id: 'med_a', time: '07:00' }, { med_id: 'med_b', time: '07:00' }];
  const sent = [];
  const online = () => {
    const qb = {}; let op = 'select', payload = null;
    ['eq','gte','lte','order','limit'].forEach(k => { qb[k] = () => qb; });
    qb.select = () => { op = 'select'; return qb; };
    qb.upsert = (p) => { op = 'upsert'; payload = p; return qb; };
    qb.delete = () => { op = 'delete'; return qb; };
    qb.then = (res) => { if (op === 'upsert') { sent.push(payload); serverRows.push({ med_id: payload.med_id, time: payload.time }); } res({ data: op === 'select' ? serverRows.slice() : null, error: null }); };
    return qb;
  };
  const offline = () => { const qb = {}; ['select','upsert','delete','eq','gte','lte','order','limit'].forEach(k => { qb[k] = () => qb; }); qb.then = (res) => res({ data: null, error: { message: 'TypeError: Load failed' } }); return qb; };
  SBc.from = online;
  await ctx.loadMedsTakenToday();
  assertEqual(Object.keys(ctx.ST.medsTakenToday).length, 2, 'online load has both doses');
  // Airplane mode, app reopened: server unreachable.
  SBc.from = offline; ctx.navigator.onLine = false;
  await ctx.loadMedsTakenToday();
  assertEqual(Object.keys(ctx.ST.medsTakenToday).length, 2, 'offline open still shows both doses');
  // Tap a third dose offline: stays checked, queued.
  const realToast = ctx.showToast, realHaptic = ctx.haptic, realRefresh = ctx.refreshMedsSection;
  let toasts = 0; ctx.showToast = () => { toasts++; }; ctx.haptic = () => {}; ctx.refreshMedsSection = () => {};
  await ctx.toggleMedTaken('med_c', '08:00');
  assertEqual(toasts, 1, 'one "saved on this phone" notice');
  ctx.showToast = realToast; ctx.haptic = realHaptic; ctx.refreshMedsSection = realRefresh;
  assertEqual(!!ctx.ST.medsTakenToday['med_c|08:00'], true, 'offline tap stays checked');
  assertEqual(ctx.pendingMedOps().length, 1, 'offline tap queued');
  // Back online: the queued tap is sent, then the server read includes it.
  SBc.from = online; ctx.navigator.onLine = true;
  await ctx.loadMedsTakenToday();
  assertEqual(sent.length, 1, 'queued tap sent once');
  assertEqual(ctx.pendingMedOps().length, 0, 'queue emptied');
  assertEqual(Object.keys(ctx.ST.medsTakenToday).length, 3, 'all three doses after reconnecting');
  SBc.from = realFrom; ctx.localStorage = realLS;
});

console.log('\nLast Sleep (reported: Apple Health card showed 0h 52m for a full night):');
test('Oura sleep periods add up the main night, not naps or deleted periods', () => {
  const d = '2026-11-05';
  const periods = [
    { day: d, type: 'long_sleep', total_sleep_duration: 6*3600, deep_sleep_duration: 3600, rem_sleep_duration: 5400 },
    { day: d, type: 'long_sleep', total_sleep_duration: 3600, deep_sleep_duration: 600, rem_sleep_duration: 900 },
    { day: d, type: 'late_nap', total_sleep_duration: 1800 },
    { day: d, type: 'deleted', total_sleep_duration: 9000 },
    { day: '2026-11-04', type: 'long_sleep', total_sleep_duration: 8*3600 },
  ];
  const n = ctx.ouraNightTotals(periods, d);
  assertEqual(n.total, 7*3600, 'two long_sleep pieces of a split night'); assertEqual(n.deep, 4200, 'deep summed'); assertEqual(n.rem, 6300, 'REM summed');
  assertEqual(ctx.ouraNightTotals([{ day: d, type: 'sleep', total_sleep_duration: 1200 }, { day: d, type: 'sleep', total_sleep_duration: 5000 }], d).total, 5000, 'no long_sleep: longest period');
  assertEqual(ctx.ouraNightTotals([], d), null, 'nothing for the day');
  assertEqual(ctx.ouraNightTotals(null, d), null, 'failed request');
});
test('the Apple Health tile shows Oura\'s total, never build 6\'s fragment', () => {
  const hk6 = { sleepMinutes: 52 }, hk7 = { sleepMinutes: 431, sleepCalc: 2 };
  ctx.ST.ouraConnected = true; ctx.ST.ouraData = { date: todayStr, total_sleep_seconds: 25920 };
  assertEqual(ctx.lastSleepMinutes(hk6), 432, 'Oura total wins (7h 12m)');
  ctx.ST.ouraData = { date: yesterdayStr, total_sleep_seconds: 25920 };
  assertEqual(ctx.lastSleepMinutes(hk6), null, 'build 6 fragment hidden, stale Oura row not used');
  assertEqual(ctx.lastSleepMinutes(hk7), 431, 'build 7 whole-night number shown');
  ctx.ST.ouraConnected = false;
  assertEqual(ctx.lastSleepMinutes(hk6), null, 'no Oura, build 6: tile left off');
  assertEqual(ctx.lastSleepMinutes(null), null, 'no Apple Health data');
});

test('Today\'s Sleep tile shows hours under the score', () => {
  assertEqual(ctx.fmtSleepHM(25620), '7h 7m', 'Chad\'s Nov 5 night');
  assertEqual(ctx.fmtSleepHM(null), null, 'unknown'); assertEqual(ctx.fmtSleepHM(0), null, 'zero');
  const t = ctx.glowTile('SLEEP', 72, 'blue', null, '7h 7m');
  assertEqual(t.includes('tile-sub') && t.includes('7h 7m') && t.includes('>72<'), true, 'hours and score both in the tile');
  assertEqual(ctx.glowTile('SLEEP', 72, 'blue').includes('tile-sub'), false, 'no hours line when unknown');
});

console.log('\nColors (Nov 12 2026 review against Apple\'s Human Interface Guidelines):');
test('every text color is at least 4.5:1 on its theme\'s surfaces, and button text on its fill', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const block = (re) => { const m = html.match(re); const o = {}; (m[1].match(/--[a-z0-9-]+:\s*#[0-9a-fA-F]{6}\b/g) || []).forEach(d => { const [k, v] = d.split(/:\s*/); o[k] = v; }); return o; };
  const dark = block(/:root \{([\s\S]*?)\n\}/), light = Object.assign({}, dark, block(/:root\[data-theme="light"\] \{([\s\S]*?)\n\}/));
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const bad = [];
  const text = ['--gold', '--green', '--red', '--amber', '--blue', '--blue2', '--teal', '--cyan', '--violet', '--muted', '--text', '--red-soft', '--amber-soft', '--green-soft'];
  [['light', light, ['--panel', '--bg']], ['dark', dark, ['--panel', '--bg', '--tile']]].forEach(([name, t, surfaces]) => {
    text.forEach(k => surfaces.forEach(sf => { const r = cr(t[k], t[sf]); if (r < 4.5) bad.push(name + ' ' + k + ' on ' + sf + ' ' + r.toFixed(2)); }));
    [['--on-green', '--green-fill'], ['#ffffff', '--red-fill'], ['#ffffff', '--blue-fill']].forEach(([fg, bg]) => { const r = cr(t[fg] || fg, t[bg]); if (r < 4.5) bad.push(name + ' text on ' + bg + ' ' + r.toFixed(2)); });
  });
  assertEqual(bad.join('; '), '', 'Apple: "make sure the contrast ratio between colors is no lower than 4.5:1"');
  assertEqual(light['--green-fill'].toLowerCase(), '#34c759', 'light green button is Apple system green');
});

test('appearance follows the phone, with no in-app picker', () => {
  assertEqual(typeof ctx.renderThemeControl, 'undefined', 'picker removed'); assertEqual(typeof ctx.setTheme, 'undefined', 'no setter');
  const real = ctx.matchMedia;
  ctx.matchMedia = () => ({ matches: true }); assertEqual(ctx.resolvedTheme(), 'dark', 'phone in Dark Mode');
  ctx.matchMedia = () => ({ matches: false }); assertEqual(ctx.resolvedTheme(), 'light', 'phone in Light Mode');
  ctx.matchMedia = real;
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assertEqual(/getItem\('fcf_theme'\)/.test(html), false, 'first paint ignores the old saved choice');
});

console.log('\nBuild 7 (web side): dated medication reminders, timer alerts, hearing test:');
test('dated reminders: one per dose per day, today\'s checked dose left out, weekdays respected', () => {
  ctx.ST.medications = [
    ctx.normalizeMedication({ id: 'a', name: 'Creatine', dose: 5, unit: 'g', times: ['08:00', '19:00'], remind: true }),
    ctx.normalizeMedication({ id: 'q', name: 'Quiet', times: ['09:00'], remind: false }),
    ctx.normalizeMedication({ id: 'w', name: 'Weekly', times: ['20:30'], days: [0], remind: true }), // Sundays
  ];
  const now = new Date(2026, 10, 13, 10, 0, 0); // Fri Nov 13 2026, 10:00
  const plan = ctx.medDatedReminderPlan(now, { 'a|19:00': true });
  const ids = plan.dated.map(i => i.id + ' ' + i.mo + '/' + i.d + ' ' + i.h + ':' + i.mi);
  assertEqual(ids.includes('a 11/13 8:0'), false, '08:00 today already passed');
  assertEqual(ids.includes('a 11/13 19:0'), false, '19:00 today was checked off, so no ring today');
  assertEqual(ids.includes('a 11/14 19:0'), true, 'but it rings tomorrow');
  assertEqual(ids.includes('a 11/14 8:0'), true, 'tomorrow morning rings');
  assertEqual(plan.dated.filter(i => i.id === 'w').map(i => i.mo + '/' + i.d).join(','), '11/15,11/22', 'weekly dose only on Sundays');
  assertEqual(plan.dated.some(i => i.id === 'q'), false, 'reminder-off dose never sent');
  assertEqual(plan.dated[0].dose, '5 g', 'dose label'); assertEqual(plan.overflow, false, 'fits');
  assertEqual(plan.skippedToday.has('a|19:00') && plan.scheduled.has('a|19:00'), true, 'checked dose keeps its bell');
  const unchecked = ctx.medDatedReminderPlan(now, {});
  assertEqual(unchecked.dated.some(i => i.id === 'a' && i.d === 13 && i.h === 19), true, 'unchecking puts today back');
  assertEqual(unchecked.dated.length <= 34 && unchecked.dated.length > plan.dated.length - 1, true, 'within the 34-reminder budget');
});
test('dated reminders: nearest days kept when the list is long, and too many doses are flagged', () => {
  ctx.ST.medications = [ctx.normalizeMedication({ id: 'a', name: 'A', times: ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'], remind: true })];
  const now = new Date(2026, 10, 13, 5, 0, 0);
  let plan = ctx.medDatedReminderPlan(now, {});
  assertEqual(plan.dated.length, 34, 'budget filled'); assertEqual(plan.overflow, false, 'every dose has a bell');
  assertEqual(plan.dated[0].d + '@' + plan.dated[0].h, '13@6', 'starts today'); assertEqual(plan.dated[33].d, 18, '6 a day covers about 5.7 days');
  ctx.ST.medications = Array.from({ length: 40 }, (_, i) => ctx.normalizeMedication({ id: 'm' + i, name: 'M' + i, times: ['0' + (i % 9) + ':' + (10 + i)], remind: true }));
  plan = ctx.medDatedReminderPlan(now, {});
  assertEqual(plan.overflow, true, '40 doses a day cannot all ring'); assertEqual(plan.scheduled.size, 34, 'exactly the budget have bells');
});
test('build 6 keeps the old repeating reminders; build 7 switches to dated ones', () => {
  ctx.ST.medications = [ctx.normalizeMedication({ id: 'a', name: 'A', times: ['07:00'], remind: true })];
  ctx.FCFBridge = { isNative: true, capabilities: {} };
  assertEqual(ctx.medDatedSupported(), false, 'build 6'); assertEqual(ctx.medReminderPlan().prefs.length, 1, 'repeating list');
  ctx.FCFBridge = { isNative: true, capabilities: { medRemindersDated: true } };
  assertEqual(ctx.medDatedSupported(), true, 'build 7'); assertEqual(ctx.medReminderPlan().prefs.length, 0, 'no repeating list');
  assertEqual(ctx.medReminderPlan().dated.length > 0, true, 'dated list instead');
  delete ctx.FCFBridge;
});
test('timer alerts: sent only to a build that supports them, and a late chime is skipped', () => {
  const sent = [];
  ctx.webkit = { messageHandlers: { notifications: { postMessage: m => sent.push(m) } } };
  ctx.FCFBridge = { isNative: true, capabilities: {} };
  assertEqual(ctx.scheduleTimerAlert('rest', 60, 'Rest complete', 'x'), false, 'build 6: nothing sent'); assertEqual(sent.length, 0, 'no message');
  assertEqual(ctx.timerAlertAlreadyRang(Date.now() - 60000), false, 'build 6 always chimes on return');
  ctx.FCFBridge = { isNative: true, capabilities: { timerAlerts: true } };
  assertEqual(ctx.scheduleTimerAlert('rest', 60, 'Rest complete', 'x'), true, 'build 7 sends');
  assertEqual(sent[0].action + ':' + sent[0].id + ':' + sent[0].seconds, 'timerSchedule:rest:60', 'schedule message');
  assertEqual(ctx.scheduleTimerAlert('rest', 0, 'a', 'b'), false, 'zero seconds is never sent');
  ctx.cancelTimerAlert('rest'); assertEqual(sent[1].action + ':' + sent[1].id, 'timerCancel:rest', 'cancel message');
  assertEqual(ctx.timerAlertAlreadyRang(Date.now() - 60000), true, 'ended a minute ago while locked: the phone already rang');
  assertEqual(ctx.timerAlertAlreadyRang(Date.now() - 500), false, 'ended just now on screen: the page chimes');
  delete ctx.FCFBridge; delete ctx.webkit;
});
test('build 8: the iPhone makes the timer sound on screen, so the page does not cancel it early or chime', () => {
  const sent = []; let chimes = 0; const timers = [];
  const realChime = ctx.playChime, realTimeout = ctx.setTimeout;
  ctx.playChime = () => { chimes++; }; ctx.setTimeout = (fn, ms) => { timers.push([fn, ms]); return 1; };
  ctx.webkit = { messageHandlers: { notifications: { postMessage: m => sent.push(m) }, haptics: { postMessage: m => sent.push({ action: 'haptic' }) } } };
  ctx.FCFBridge = { isNative: true, capabilities: { timerAlerts: true } };
  ctx.timerFinishedAlert('rest', Date.now());
  assertEqual(chimes, 1, 'build 7: page chimes'); assertEqual(sent.some(m => m.action === 'timerCancel'), true, 'build 7: alert cancelled at once');
  sent.length = 0; chimes = 0;
  ctx.FCFBridge = { isNative: true, capabilities: { timerAlerts: true, timerAlertsForeground: true } };
  ctx.timerFinishedAlert('rest', Date.now());
  assertEqual(chimes, 0, 'build 8: page stays quiet'); assertEqual(sent.some(m => m.action === 'timerCancel'), false, 'build 8: alert left to fire');
  assertEqual(sent.some(m => m.action === 'haptic'), true, 'still vibrates');
  assertEqual(timers.length === 1 && timers[0][1] === 4000, true, 'tidy-up scheduled'); timers[0][0]();
  assertEqual(sent.some(m => m.action === 'timerCancel' && m.id === 'rest'), true, 'tidy-up clears the leftover');
  sent.length = 0;
  ctx.timerFinishedAlert('rest', Date.now() - 60000);
  assertEqual(sent.some(m => m.action === 'haptic'), false, 'rang a minute ago while locked: no second buzz');
  ctx.playChime = realChime; ctx.setTimeout = realTimeout; delete ctx.FCFBridge; delete ctx.webkit;
});
test('hearing test is set against the FAA audiogram lines per frequency', () => {
  const good = [{ hz: 250, left: 10, right: 10 }, { hz: 500, left: 20, right: 30 }, { hz: 1000, left: 25, right: 45 }, { hz: 2000, left: 30, right: 50 }, { hz: 3000, left: 40, right: 60 }, { hz: 4000, left: 70, right: 70 }];
  let ev = ctx.evaluateAudiogram(good);
  assertEqual(ev.allInside && ev.complete, true, 'exactly on every line is inside; 250 and 4000 Hz are ignored');
  assertEqual(ev.rows[1].better + '/' + ev.rows[1].poorer, '25/45', 'better ear is the lower number');
  ev = ctx.evaluateAudiogram(good.map(p => p.hz === 1000 ? { hz: 1000, left: 31, right: 45 } : p));
  assertEqual(ev.allInside, false, 'better ear 31 at 1000 Hz is over the 30 line'); assertEqual(ev.rows[1].inside, false, 'that row is outside');
  ev = ctx.evaluateAudiogram(good.map(p => p.hz === 3000 ? { hz: 3000, left: 40, right: 61 } : p));
  assertEqual(ev.rows[3].inside, false, 'worse ear 61 at 3000 Hz is over the 60 line');
  ev = ctx.evaluateAudiogram(good.filter(p => p.hz !== 3000));
  assertEqual(ev.complete, false, '3000 Hz not measured'); assertEqual(ev.allInside, true, 'inside where measured'); assertEqual(ev.rows[3].measured, false, 'row marked not measured');
  ev = ctx.evaluateAudiogram([{ hz: 500, left: 20 }]);
  assertEqual(ev.anyMeasured, false, 'one ear only is not a comparison');
  assertEqual(ctx.evaluateAudiogram(null).anyMeasured, false, 'no data');
});

console.log('\nSignup sources (launch, Nov 13 2026):');
test('a link tag is cleaned to safe characters before it is stored', () => {
  assertEqual(ctx.cleanRef('Email'), 'email', 'lowercased'); assertEqual(ctx.cleanRef('aac'), 'aac', 'kept');
  assertEqual(ctx.cleanRef('<script>alert(1)</script>'), 'scriptalert1script', 'markup stripped');
  assertEqual(ctx.cleanRef('x'.repeat(90)).length, 40, 'capped at 40'); assertEqual(ctx.cleanRef(''), null, 'empty'); assertEqual(ctx.cleanRef(null), null, 'missing');
});
test('the "how did you hear" card shows only when owed and offers every source', () => {
  ctx.ST.heardAsk = false; assertEqual(ctx.heardCardHtml(), '', 'hidden when not owed');
  ctx.ST.heardAsk = true; const h = ctx.heardCardHtml();
  ['crew', 'aac', 'crashpads', 'facebook', 'search', 'appstore', 'other'].forEach(k => assertEqual(h.includes("answerHeard('" + k + "')"), true, k + ' offered'));
  assertEqual(h.includes('answerHeard(null)'), true, 'can be skipped'); assertEqual(h.includes('Airplanes and Coffee'), true, 'label shown');
  ctx.ST.heardAsk = false;
});
test('only accounts in their first two weeks are asked', () => {
  const saved = ctx.ST.user;
  ctx.ST.user = { id: 'u', created_at: new Date(Date.now() - 3 * 86400000).toISOString() }; assertEqual(ctx.accountAgeDays() < 14, true, '3 days old');
  ctx.ST.user = { id: 'u', created_at: new Date(Date.now() - 40 * 86400000).toISOString() }; assertEqual(ctx.accountAgeDays() > 14, true, '40 days old');
  ctx.ST.user = { id: 'u' }; assertEqual(ctx.accountAgeDays(), Infinity, 'unknown age is treated as old');
  ctx.ST.user = saved;
});
test('Super User totals list each source with signups and paid members', () => {
  const h = ctx.signupSourcesHtml({ answered: 7, members: 30, by_heard: [{ k: 'aac', n: 4, paid: 1 }, { k: 'crew', n: 3, paid: 2 }], by_ref: [{ k: 'chad', n: 2, paid: 1 }] });
  assertEqual(h.includes('Airplanes and Coffee') && h.includes('A crew member told me'), true, 'answers shown by name');
  assertEqual(h.includes('7 of 30 members have answered'), true, 'answer rate'); assertEqual(h.includes('>chad<'), true, 'link tag shown');
  assertEqual(ctx.signupSourcesHtml({}).includes('None yet.'), true, 'empty state');
});

// ── Sharing badges and goals, comment likes (Nov 16 2026) ──
test('a badge or goal becomes a crew post with the right shape', () => {
  const b = { id: 'first_flight', icon: '🛫', title: 'First Flight', desc: 'Complete your first workout' };
  const it = ctx.crewBadgeShareItem(b);
  const row = ctx.crewShareRow(it, '  made it  ', 'followers', 'u1', '2026-11-16T12:00:00Z');
  assertEqual(row.kind, 'badge'); assertEqual(row.session_key, 'badge:first_flight'); assertEqual(row.title, 'First Flight');
  assertEqual(row.note, 'made it'); assertEqual(row.visibility, 'followers'); assertEqual(row.user_id, 'u1');
  assertEqual(ctx.crewShareRow(it, '', 'everyone', 'u1', 'x').note, null, 'empty note is stored as nothing');
  assertEqual(ctx.crewShareRow(it, 'x'.repeat(300), 'everyone', 'u1', 'x').note.length, 140, 'note is capped');
  const g = ctx.crewGoalShareItem('steps', '2026-11-16', 10000);
  assertEqual(g.key, 'goal:steps:2026-11-16'); assertEqual(g.title, 'Hit the step goal: 10,000 steps');
  assertEqual(ctx.crewGoalShareItem('water', '2026-11-16').key, 'goal:water:2026-11-16');
});
test('a reached goal is offered once a day, and only when it is tracked', () => {
  const base = { day: '2026-11-16', stepGoal: 8000, steps: 8200, trackWater: true, waterTarget: 3, water: 3.1 };
  assertEqual(ctx.crewGoalsToOffer(base, {}).map(x => x.group).join(','), 'steps,water');
  assertEqual(ctx.crewGoalsToOffer(base, { 'steps:2026-11-16': 1 }).map(x => x.group).join(','), 'water', 'steps already asked today');
  assertEqual(ctx.crewGoalsToOffer(base, { 'steps:2026-11-15': 1, 'water:2026-11-15': 1 }).length, 2, 'yesterday does not count');
  assertEqual(ctx.crewGoalsToOffer(Object.assign({}, base, { steps: 7999, water: 2.9 }), {}).length, 0, 'not reached');
  assertEqual(ctx.crewGoalsToOffer(Object.assign({}, base, { stepGoal: null, trackWater: false }), {}).length, 0, 'no step goal, water not tracked');
  assertEqual(ctx.crewGoalsToOffer(Object.assign({}, base, { steps: null }), {}).map(x => x.group).join(','), 'water', 'no step reading yet');
});
test('badge and goal posts read correctly on a card and in the Today news', () => {
  const badge = { kind: 'badge', session_key: 'badge:first_flight', title: 'First Flight', crew_profiles: { callsign: 'Maverick' } };
  const f = ctx.crewPostFace(badge);
  assertEqual(f.title, 'Earned the First Flight badge'); assertEqual(f.detail, 'Complete your first workout'); assertEqual(f.icon, '🛫');
  assertEqual(ctx.crewPostFace({ kind: 'badge', session_key: 'badge:gone', title: 'Old One' }).icon, '🏅', 'unknown badge still draws');
  assertEqual(ctx.crewPostFace({ kind: 'goal', muscle_group: 'water', title: 'Hit the daily drink goal' }).icon, '💧');
  assertEqual(ctx.crewPostFace({ kind: 'workout', title: 'Upper Pull' }).title, 'Upper Pull', 'workouts unchanged');
  assertEqual(ctx.crewNewsLine(badge), 'Maverick earned the First Flight badge');
  assertEqual(ctx.crewNewsLine({ kind: 'goal', title: 'Hit the step goal: 10,000 steps', crew_profiles: { callsign: 'Goose' } }), 'Goose hit the step goal: 10,000 steps');
  assertEqual(ctx.crewNewsLine({ kind: 'workout', title: 'Upper Pull', crew_profiles: { callsign: 'Goose' } }), 'Goose logged Upper Pull');
});
test('the comment like button shows the count and whether it is mine', () => {
  const saved = ctx.ST.crew.cmtLikes;
  ctx.ST.crew.cmtLikes = { c1: { count: 3, mine: true } };
  const h = ctx.crewCommentLikeHtml('a1', { id: 'c1' });
  assertEqual(h.includes("crewLikeComment('a1','c1')"), true); assertEqual(h.includes(' 3'), true); assertEqual(h.includes('var(--gold)'), true, 'mine is gold');
  const h2 = ctx.crewCommentLikeHtml('a1', { id: 'c2' });
  assertEqual(h2.includes('var(--muted)'), true, 'not liked'); assertEqual(/\d/.test(h2.replace(/a1|c2|0\.75rem|2px 6px/g, '')), false, 'no count shown at zero');
  ctx.ST.crew.cmtLikes = saved;
});

test('a follow request opens the profile and offers Approve and Decline', () => {
  const saved = ctx.ST.crew.requests;
  ctx.ST.crew.requests = [{ user_id: 'u9', crew_profiles: { callsign: 'Goose' } }];
  const h = ctx.crewRequestsHtml();
  assertEqual(h.includes("crewOpenProfile('u9')"), true, 'name opens the profile'); assertEqual(h.includes('View profile'), true);
  assertEqual(h.includes("crewAnswerRequest('u9',true)") && h.includes("crewAnswerRequest('u9',false)"), true);
  assertEqual(ctx.crewHasRequestFrom('u9'), true); assertEqual(ctx.crewHasRequestFrom('u1'), false);
  ctx.ST.crew.requests = saved;
});

test('Trends sections: the calendar starts open, the rest closed, and an empty section is left out', () => {
  const st = ctx.trendsOpenState();
  assertEqual(st.cal, true); assertEqual(st.run, false); assertEqual(st.body, false); assertEqual(st.photos, false);
  const open = ctx.trendsSectionHtml('cal', 'Training calendar', 'sub', '<i>x</i>', st);
  assertEqual(open.includes('id="trendsBody_cal" style="display:block"'), true); assertEqual(open.includes('aria-expanded="true"'), true);
  const shut = ctx.trendsSectionHtml('run', 'Running', '2 mi this week', '<i>x</i>', st);
  assertEqual(shut.includes('id="trendsBody_run" style="display:none"'), true); assertEqual(shut.includes('2 mi this week'), true, 'summary shows while closed');
  assertEqual(shut.includes("toggleTrendsSection('run')"), true);
  assertEqual(ctx.trendsSectionHtml('oura', 'Oura ring', '', '', st), '', 'nothing to show, no row');
});

// ── Custom exercise form: recommended sets and reps (Nov 17 2026) ──
test('the custom exercise form recommends a range from the objective and the kind of lift', () => {
  assertEqual(ctx.customExRecommended('compound', 'strength', 'intermediate', 'male'), '3 × 4-6');
  assertEqual(ctx.customExRecommended('accessory', 'strength', 'intermediate', 'male'), '3 × 6-10');
  assertEqual(ctx.customExRecommended('isolation', 'muscle', 'intermediate', 'male'), '3 × 12-15');
  assertEqual(ctx.customExRecommended('compound', 'strength', 'beginner', 'male'), '3 × 6-10', 'beginners start in the next band');
  assertEqual(ctx.customExRecommended('accessory', 'muscle', 'intermediate', 'female'), '3 × 10-14', 'accessory range shifts up 2 for women');
  assertEqual(ctx.customExRecommended('compound', 'muscle', 'intermediate', 'female'), '3 × 6-10', 'a main lift does not shift');
  assertEqual(ctx.customExRecommended('nonsense', 'unset', 'intermediate', 'male'), '3 × 8-12', 'no objective: a sensible default');
  assertEqual(ctx.customExRecLabel('accessory', 'strength', 'intermediate', 'male').startsWith('Recommended for your '), true);
  assertEqual(ctx.customExRecLabel('accessory', 'unset', 'intermediate', 'male'), 'Recommended: 3 × 8-12');
});
test('keeping the recommendation follows the objective; typing your own is used as written', () => {
  const kept = ctx.customExTargetFields('3 × 6-10', 'accessory', 'strength', 'intermediate', 'male', 'reps_weight');
  assertEqual(kept.ownTarget, false); assertEqual(kept.role, 'accessory'); assertEqual(kept.target, '3×10');
  assertEqual(ctx.customExTargetFields('3x6-10', 'accessory', 'strength', 'intermediate', 'male', 'reps_weight').ownTarget, false, 'same thing typed loosely');
  assertEqual(ctx.customExTargetFields('', 'compound', 'strength', 'intermediate', 'male', 'reps_weight').ownTarget, false, 'blank means recommended');
  const own = ctx.customExTargetFields('5×5', 'compound', 'muscle', 'intermediate', 'male', 'reps_weight');
  assertEqual(own.ownTarget, true); assertEqual(own.target, '5×5'); assertEqual(own.role, 'compound');
  assertEqual(ctx.customExTargetFields('3×30 sec', 'accessory', 'muscle', 'intermediate', 'male', 'timed').target, '3×30 sec');
  // In a workout: the kept one takes the objective's range, the typed one stays.
  const base = { name: 'Cable Woodchopper', inputType: 'reps_weight', timed: false };
  const keptEx = Object.assign({}, base, { target: kept.target, role: kept.role });
  assertEqual(JSON.stringify(ctx.repRangeFor(keptEx, 'enroute', 'strength', 'intermediate', 'male')), JSON.stringify({ lo: 6, hi: 10 }));
  assertEqual(JSON.stringify(ctx.repRangeFor(keptEx, 'enroute', 'fatloss', 'intermediate', 'male')), JSON.stringify({ lo: 10, hi: 15 }), 'objective changed, range follows');
  const ownEx = Object.assign({}, base, { target: '5×5', role: 'compound', ownTarget: true });
  assertEqual(ctx.repRangeFor(ownEx, 'enroute', 'fatloss', 'intermediate', 'male'), null, 'typed target is not rewritten');
  assertEqual(ctx.withRepRange(ownEx, 'enroute').target, '5×5');
  // The member's answer beats a guess from the name.
  assertEqual(ctx.exerciseRole({ name: 'Heavy Curl Thing', role: 'compound' }, 'enroute'), 'compound');
  assertEqual(ctx.exerciseRole({ name: 'Heavy Curl Thing' }, 'enroute'), 'isolation', 'no answer: still guessed from the name');
});
test('the plan picker groups workouts and loses none', () => {
  const all = vm.runInContext('MUSCLE_GROUPS', ctx);
  const g = ctx.planProfileGroups(all);
  assertEqual(g.strength.length + g.cardio.length, all.length);
  assertEqual(g.cardio.includes('Run') && g.cardio.includes('Stretch'), true);
  assertEqual(g.strength.includes('Lower Body') && g.strength.includes('Starter Strength'), true);
  assertEqual(ctx.planProfileGroups(['Brand New']).strength.join(), 'Brand New', 'an unknown workout still shows');
});

test('Starter Strength shows for beginners, Walking First members, or when it is the current pick', () => {
  const all = vm.runInContext('MUSCLE_GROUPS', ctx);
  const has = (lvl, goal, cur) => ctx.planPickerWorkouts(all, lvl, goal, cur).includes('Starter Strength');
  assertEqual(has('beginner', 'muscle', 'Upper Push'), true);
  assertEqual(has('intermediate', 'strength', 'Upper Push'), false);
  assertEqual(has('advanced', 'muscle', 'Lower Body'), false);
  assertEqual(has('intermediate', 'walking', 'Walk'), true, 'the Walking First plan is built on it');
  assertEqual(has('advanced', 'muscle', 'Starter Strength'), true, 'never hide the one that is selected');
  assertEqual(ctx.planPickerWorkouts(all, 'advanced', 'muscle', 'Upper Push').length, all.length - 1, 'nothing else is removed');
});

test('arriving on the Start a workout page closes every expanded section', () => {
  const S = ctx.ST;
  const saved = { a: S.showChangePlan, b: S.planOpen, c: S.showConditionDetail, d: S.showCondOverride, e: S.showInjuryDetail };
  S.showChangePlan = true; S.planOpen = 'env'; S.showConditionDetail = true; S.showCondOverride = true; S.showInjuryDetail = true;
  ctx.collapsePreflight();
  assertEqual(S.showChangePlan, false); assertEqual(S.planOpen, undefined);
  assertEqual(S.showConditionDetail, false); assertEqual(S.showCondOverride, false); assertEqual(S.showInjuryDetail, false);
  S.showChangePlan = saved.a; S.planOpen = saved.b; S.showConditionDetail = saved.c; S.showCondOverride = saved.d; S.showInjuryDetail = saved.e;
});

test('Auto schedule source uses the uploaded file for a month the calendar has no flights in (review Nov 19)', () => {
  const A = ctx.autoScheduleSource, now = new Date('2026-11-19T10:00:00');
  const fl = d => ({ type: 'flight', start: d }), pers = d => ({ type: 'personal', start: d }), up = d => ({ start: d });
  assertEqual(A(now, [], [up('2026-11-22T14:00:00')]), 'ics', 'no calendar: the upload');
  assertEqual(A(now, null, null), 'ics', 'nothing at all: unchanged default');
  assertEqual(A(now, [pers('2026-11-20T09:00:00')], []), 'calendar', 'no upload: the calendar, as before');
  assertEqual(A(now, [fl('2026-11-20T09:00:00')], [up('2026-11-22T14:00:00')]), 'calendar', 'calendar has flights this month: calendar wins, as before');
  assertEqual(A(now, [pers('2026-11-20T09:00:00')], [up('2026-11-22T14:00:00')]), 'ics', 'calendar has no flights this month and the upload covers it: the upload');
  assertEqual(A(now, [fl('2026-12-02T09:00:00')], [up('2026-11-22T14:00:00')]), 'ics', 'calendar flights are next month only: the upload for this month');
  assertEqual(A(now, [pers('2026-11-20T09:00:00')], [up('2026-10-22T14:00:00')]), 'calendar', 'a stale upload does not take over');
});

test('only an exercise with every set logged counts as finished for folding (review Nov 19)', () => {
  assertEqual(ctx.exAllSetsLogged([{ reps: 8, weight: 135 }, { reps: 8, weight: 135 }, { reps: 7, weight: 135 }]), true);
  assertEqual(ctx.exAllSetsLogged([{ reps: 8, weight: 135 }, {}, {}]), false, 'one of three logged: still in progress');
  assertEqual(ctx.exAllSetsLogged([{ seconds: 30 }]), true, 'a timed set counts');
  assertEqual(ctx.exAllSetsLogged([{ seconds_left: 30, seconds_right: 30 }, { seconds_left: 30 }]), true, 'a side logged counts as that set logged');
  assertEqual(ctx.exAllSetsLogged([]), false); assertEqual(ctx.exAllSetsLogged(undefined), false);
});

// ── Common foods first in food search (requested Nov 19 2026) ──
// Food names below are real USDA descriptions seen in live results.
const FD = (description, dataType) => ({ description, dataType: dataType || 'Survey (FNDDS)', fdcId: description + '|' + (dataType || 'S') });
const topFood = (pool, q) => ctx.rankUSDAFoods(pool, q)[0].description;
test('food search: an everyday word leads with the everyday food, not an ingredient or a sauce', () => {
  assertEqual(topFood([FD('Lunchmeat, chicken breast, sliced', 'SR Legacy'), FD('Chicken spread', 'SR Legacy'), FD('Chicken, ground, raw', 'SR Legacy'), FD('Chicken breast, grilled with sauce, skin eaten'), FD('Chicken breast, grilled without sauce, skin not eaten')], 'chicken'), 'Chicken breast, grilled without sauce, skin not eaten');
  assertEqual(topFood([FD('Sandwich spread, meatless', 'SR Legacy'), FD('Sandwich spread'), FD('Crackers, sandwich'), FD('Cuban sandwich'), FD('Sandwich, NFS'), FD('Turkey sandwich on wheat')], 'sandwich'), 'Sandwich, NFS');
  assertEqual(topFood([FD('Salad dressing, coleslaw', 'SR Legacy'), FD('Salad dressing, NFS, for salads'), FD('Crab salad'), FD('Lettuce, salad with assorted vegetables including tomatoes and/or carrots, no dressing'), FD('CAESAR SALAD', 'Branded')], 'salad'), 'Lettuce, salad with assorted vegetables including tomatoes and/or carrots, no dressing');
  assertEqual(topFood([FD('Steak sauce'), FD('Steak tartare'), FD('Beef, steak, chuck'), FD('Beef, steak, NFS')], 'steak'), 'Beef, steak, NFS');
  assertEqual(topFood([FD('SILK Coffee, soymilk', 'SR Legacy'), FD('Beverages, coffee, instant, chicory', 'SR Legacy'), FD('Coffee substitute'), FD('Coffee, brewed, decaffeinated'), FD('Coffee, brewed')], 'coffee'), 'Coffee, brewed');
  assertEqual(topFood([FD("McDONALD'S, BIG MAC", 'SR Legacy'), FD('Cheese spread, cream cheese base', 'SR Legacy'), FD('Macaroni or noodles with cheese and tuna'), FD('Macaroni or noodles with cheese')], 'mac and cheese'), 'Macaroni or noodles with cheese');
  assertEqual(topFood([FD('PIZZA HUT 12" Cheese Pizza, Pan Crust', 'SR Legacy'), FD('Dessert pizza'), FD('Pizza rolls'), FD('Pizza with pepperoni, from restaurant or fast food,  medium crust'), FD('Pizza, cheese, from restaurant or fast food, medium crust')], 'pizza'), 'Pizza, cheese, from restaurant or fast food, medium crust');
});
test('food search: a sandwich search leads with the sandwich, not its parts', () => {
  const pool = [FD('Peanut butter', 'SR Legacy'), FD('Peanut butter, smooth style, with salt', 'SR Legacy'), FD('PEANUT BUTTER SANDWICH CRACKERS', 'Branded'), FD('Bread, white'), FD('Peanut butter sandwich, with regular peanut butter, on white bread'), FD('Peanut butter sandwich, NFS')];
  assertEqual(topFood(pool, 'peanut butter sandwich'), 'Peanut butter sandwich, NFS');
  assertEqual(topFood(pool, 'Peanut Butter Sandwich'), 'Peanut butter sandwich, NFS', 'capitals do not matter');
  const pbj = [FD('PB&J MINI BARS, PB&J', 'Branded'), FD('PB&J TOASTER PASTRIES, PB&J', 'Branded'), FD('Peanut butter and jelly'), FD('Peanut butter and jelly sandwich, with regular peanut butter, regular jelly, on white bread'), FD('Peanut butter and jelly sandwich, NFS')];
  ['pb&j', 'PBJ', 'pb and j', 'peanut butter and jelly'].forEach(q => assertEqual(topFood(pbj, q), 'Peanut butter and jelly sandwich, NFS', q));
  assertEqual(topFood([FD('Turkey sandwich wrap'), FD('TURKEY SANDWICH', 'Branded'), FD('Fast foods, submarine sandwich, turkey breast on white bread', 'SR Legacy'), FD('Turkey sandwich on wheat, with cheese'), FD('Turkey sandwich on wheat')], 'turkey sandwich'), 'Turkey sandwich on wheat');
});
test('food search: one brand\'s product named exactly what was typed does not lead', () => {
  assertEqual(topFood([FD('FRIED CHICKEN', 'Branded'), FD('Rice, fried, with chicken'), FD('Chicken breast, fried, coated, skin / coating eaten, from raw')], 'fried chicken'), 'Chicken breast, fried, coated, skin / coating eaten, from raw');
  assertEqual(topFood([FD('QUESADILLA', 'Branded'), FD('Quesadilla, chicken'), FD('Quesadilla, NFS')], 'quesadilla'), 'Quesadilla, NFS', 'a food not in the table: the plain one still leads');
  assertEqual(topFood([FD('Cheeseburger (McDonalds)'), FD('Cheeseburger slider'), FD('Cheeseburger, NFS')], 'cheeseburger'), 'Cheeseburger, NFS');
  assertEqual(topFood([FD('Hot dog, vegetarian'), FD('Hot dog, beef'), FD('Hot dog, NFS')], 'hot dog'), 'Hot dog, NFS');
});
test('food search: a member who types the brand or the special version still gets it', () => {
  assertEqual(topFood([FD('Cheeseburger, NFS'), FD('Cheeseburger (McDonalds)'), FD('Cheeseburger slider')], 'mcdonalds cheeseburger'), 'Cheeseburger (McDonalds)');
  assertEqual(topFood([FD('Steak sauce'), FD('Beef, steak, NFS')], 'steak sauce'), 'Steak sauce');
  assertEqual(topFood([FD('Salad dressing, caesar dressing, regular', 'SR Legacy'), FD('Caesar salad, with romaine, no dressing')], 'caesar dressing'), 'Salad dressing, caesar dressing, regular');
  assertEqual(topFood([FD('Bread, French or Vienna, toasted'), FD('French toast, plain'), FD('French toast, NFS')], 'french toast'), 'French toast, NFS', '"toast" inside "french toast" must not put bread first');
});
test('food search: typing variants reach the same food, and every table entry is well formed', () => {
  assertEqual(ctx.normalizeFoodQuery('  PB&J!! '), 'pb and j');
  assertEqual(ctx.commonFoodFor('Tacos') === ctx.commonFoodFor('taco'), true);
  assertEqual(ctx.commonFoodFor('Mac n Cheese') === ctx.commonFoodFor('mac and cheese'), true);
  assertEqual(ctx.commonFoodFor('zzz not a food'), null);
  const table = vm.runInContext('COMMON_FOODS', ctx), aliases = vm.runInContext('COMMON_FOOD_ALIASES', ctx);
  Object.keys(table).forEach(k => {
    assertEqual(k, ctx.normalizeFoodQuery(k), 'key is written the way a search is normalized: ' + k);
    assertEqual(Array.isArray(table[k].prefer) && table[k].prefer.length > 0, true, 'has foods to prefer: ' + k);
    assertEqual((table[k].also || []).length <= 2, true, 'at most two extra searches: ' + k);
  });
  Object.keys(aliases).forEach(a => assertEqual(!!table[aliases[a]], true, 'alias points at a real entry: ' + a));
  assertEqual(Object.keys(table).length >= 100, true, 'at least 100 common foods');
});

test('food search: a plate typed as one search leads with each part (50 common meals, Nov 19)', () => {
  const c = ctx.commonFoodFor('Cheeseburger and French Fries');
  assertEqual(!!c && c.parts.join('|'), 'cheeseburger|french fries');
  assertEqual(topFood([FD('CHEESEBURGER & FRIES', 'Branded'), FD('Potato, french fries, NFS'), FD('Cheeseburger slider'), FD('Cheeseburger, NFS')], 'cheeseburger and french fries'), 'Cheeseburger, NFS');
  assertEqual(ctx.rankUSDAFoods([FD('Potato, french fries, with chili'), FD('Potato, french fries, NFS'), FD('Cheeseburger, NFS')], 'cheeseburger and fries')[1].description, 'Potato, french fries, NFS', 'the second part comes second');
  assertEqual(ctx.commonFoodFor('steak with mashed potatoes').parts.length, 2);
  const plate = ctx.rankUSDAFoods([FD('Chicken breast, fried, coated, skin / coating eaten, from raw'), FD('Chicken breast, fried, coated, skin / coating eaten, from fast food'), FD('Chicken breast, fried, coated, skin / coating eaten, from pre-cooked'), FD('Gravy, beef'), FD('Gravy, NFS'), FD('Potato, mashed, NFS')], 'fried chicken with mashed potatoes and gravy').slice(0, 3).map(f => f.description);
  assertEqual(plate.join(' | '), 'Chicken breast, fried, coated, skin / coating eaten, from raw | Potato, mashed, NFS | Gravy, NFS', 'one of each part before the look-alikes');
  assertEqual(ctx.commonFoodFor('eggs, bacon and toast').parts.length, 3);
  assertEqual(ctx.commonFoodFor('steak and something unknown'), null, 'a part not in the table: no guess');
  assertEqual(ctx.commonFoodFor('mac and cheese').parts, undefined, 'a name that contains "and" is one food, not two');
  ['spaghetti and meatballs', 'biscuits and gravy', 'chicken pot pie', 'beef stew', 'chicken alfredo', 'pulled pork sandwich', 'bacon and eggs', 'bagel with cream cheese', 'hoagie', 'buffalo chicken wrap', 'stir fry', 'cereal with milk', 'tuna melt', 'avocado toast', 'chili con carne']
    .forEach(q => assertEqual(!!ctx.commonFoodFor(q), true, 'in the table: ' + q));
  assertEqual(topFood([FD('Beef, stew meat'), FD('Beef stew with potatoes, Puerto Rican style'), FD('Stew, beef, canned'), FD('Stew, beef')], 'beef stew'), 'Stew, beef');
  assertEqual(topFood([FD('Chicken pot pie, frozen entree, prepared', 'SR Legacy'), FD('Pot pie, beef'), FD('Pot pie, chicken')], 'chicken pot pie'), 'Pot pie, chicken');
  assertEqual(topFood([FD('BISCUITS AND GRAVY', 'Branded'), FD('Gravy, NFS'), FD('Marie biscuit'), FD('Biscuit with gravy')], 'biscuits and gravy'), 'Biscuit with gravy');
});

(async () => {
  for (const [name, fn] of asyncTests) {
    try { await fn(); passed++; console.log('  ✓ ' + name); }
    catch (e) { failed++; console.log('  ✗ ' + name); console.log('      ' + e.message); }
  }
  console.log('\n' + '─'.repeat(50));
  console.log(passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
})();
