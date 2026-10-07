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
  vm.runInContext('this.ST = ST; this.WORKOUTS = WORKOUTS; this.CATALOG_EXTRAS = CATALOG_EXTRAS; this.INJURY_REGIONS = INJURY_REGIONS; this.ALTERNATES = ALTERNATES; this.EXERCISE_SYNONYMS = EXERCISE_SYNONYMS;', context);
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
  assertEqual(idOf('Machine Row'), 'swap_machine_row', 'Machine Row (3 logged sessions)');
  assertEqual(idOf('Goblet Squat (Heavy)'), 'swap_goblet_squat_heavy', 'Goblet Squat (Heavy) (1 logged session)');
  const base = { id: 'c_ul_to2', name: 'Barbell Row (Pendlay)', target: '4×8', sets: 4, inputType: 'reps_weight' };
  ctx.ST.workout = { taxi: [], takeoff: [base], enroute: [], landing: [] }; ctx.ST.sets = { c_ul_to2: [] }; ctx.ST.expanded = {};
  const realRender = ctx.renderFlight, realToast = ctx.showBigToast; ctx.renderFlight = () => {}; ctx.showBigToast = () => {};
  ctx.swapExercise('c_ul_to2', ctx.getAlternates('Barbell Row (Pendlay)').find(a => a.name === 'Machine Row'));
  ctx.renderFlight = realRender; ctx.showBigToast = realToast;
  assertEqual(ctx.ST.workout.takeoff[0].id, 'swap_machine_row', 'swapping through Alternate uses the catalog id');
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
   ['machine row', 'Machine Row'], ['chest press machine', 'Machine Chest Press'], ['goblet squat', 'Goblet Squat'],
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
test('shoulder swap of DB Overhead Press gets the 4 sets its label promises', () => {
  ctx.ST.injuries = ['shoulder'];
  const out = ctx.applyInjuryFilter({ id: 'h_up_er1', name: 'DB Overhead Press', target: '3×10', sets: 3, note: '', timed: false, inputType: 'reps_weight' });
  ctx.ST.injuries = [];
  assertEqual(out.swappedForInjury, true, 'swapped');
  assertEqual(out.target, '4×10', 'label');
  assertEqual(out.sets, 4, 'set count follows the new label');
  assertEqual(ctx.blankSetsFor(out).length, 4, 'four boxes');
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
    const out = ctx.applyInjuryFilter(e);
    if (!out.swappedForInjury) continue;
    swaps++;
    const alt = ctx.getAlternates(e.name).find(a => a.name === out.name);
    const lab = (out.target || '').match(/^(\d+)\s*[x×]/i);
    if (lab && parseInt(lab[1], 10) !== out.sets) bad.push(e.name + ' -> ' + out.name + ': label ' + lab[1] + ', sets ' + out.sets);
    if (!lab && /\d\s*(min|s)\b/.test(out.target || '') && ctx.blankSetsFor(out).length !== 1) bad.push(e.name + ' -> ' + out.name + ' (' + out.target + '): a single duration drew ' + ctx.blankSetsFor(out).length + ' boxes');
    if (alt.inputType && alt.inputType !== out.inputType) bad.push(e.name + ' -> ' + out.name + ': fields ' + out.inputType + ', alternate says ' + alt.inputType);
    const timedType = out.inputType === 'timed' || out.inputType === 'timed_bilateral' || out.inputType === 'timed_distance' || out.inputType === 'nsdr';
    if (!!out.timed !== timedType && !(out.timed && out.inputType === 'timed')) bad.push(e.name + ' -> ' + out.name + ': timed=' + out.timed + ' but fields ' + out.inputType);
    if (out.originalName !== e.name || !out.flaggedRegion) bad.push(e.name + ': lost the swap banner details');
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

console.log('\n' + '─'.repeat(50));
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
