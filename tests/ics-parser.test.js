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

console.log('\n' + '─'.repeat(50));
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
