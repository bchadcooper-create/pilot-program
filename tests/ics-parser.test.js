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
  vm.runInContext('this.ST = ST; this.WORKOUTS = WORKOUTS; this.CATALOG_EXTRAS = CATALOG_EXTRAS;', context);
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

console.log('\n' + '─'.repeat(50));
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
