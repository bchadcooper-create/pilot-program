// Real-browser check for live set feedback: the coach speaks once reps and
// weight are in, without the rest timer. Run: npm run e2e:feedback (needs the
// local server on :4321, or BASE_URL=https://flightcrew.fit).
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const BASE = process.env.BASE_URL || 'http://localhost:4321';
const OUT = process.env.OUT_DIR;
let fails = 0;
const check = (name, ok, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + name + (extra ? '  [' + extra + ']' : '')); if (!ok) fails++; };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'en-US', timezoneId: 'America/Phoenix' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/?e2e=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const acct = page.getByText(/I HAVE AN ACCOUNT/i).first();
  if (await acct.count()) await acct.click();
  await page.waitForSelector('#auth_email', { timeout: 10000 });
  await page.fill('#auth_email', process.env.E2E_EMAIL);
  await page.fill('#auth_pass', process.env.E2E_PASSWORD);
  await page.locator('button', { hasText: /Sign In/ }).last().click();
  await page.waitForFunction(() => typeof ST !== 'undefined' && !!ST.user, null, { timeout: 25000 });
  await page.waitForFunction(() => document.querySelector('[onclick*="acceptDisclaimer"]') || ST.disclaimerAccepted, null, { timeout: 15000 }).catch(() => {});
  const ok = page.locator('[onclick*="acceptDisclaimer"]').first();
  if (await ok.count()) { await ok.click(); await page.waitForTimeout(1000); }
  console.log('version: ' + await page.evaluate(() => FCF_VERSION));

  // Start a workout the way the crawler does.
  await page.evaluate(() => { switchTab('preflight'); });
  await page.waitForTimeout(600);
  // A fixed program so every section below has something to test: hotel
  // Full Body has weighted work, a reps-only working set (Single Leg
  // Split Squat), a 3×max (Pullups), and DB Overhead Press, which a
  // shoulder flag swaps for DB Incline Press. The flag is set in memory
  // only; nothing is saved to the bot's profile.
  await page.evaluate(() => {
    ST.workout = null; ST.sets = {};
    ST.env = 'hotel'; ST.muscleGroup = 'Full Body'; ST.injuries = ['shoulder'];
    renderPage();
  });
  await page.waitForTimeout(400);
  await page.getByText(/ENGAGE WORKOUT|RETURN TO WORKOUT/i).first().click();
  await page.waitForTimeout(1200);

  // First reps+weight exercise with a numeric rep target, at least 2 sets.
  const ex = await page.evaluate(() => {
    const all = [...ST.workout.takeoff, ...ST.workout.enroute];
    const e = all.find(x => !x.timed && (!x.inputType || x.inputType === 'reps_weight') && parseTargetReps(x.target) >= 10 && (ST.sets[x.id] || []).length >= 2);
    if (!e) return null;
    ST.sets[e.id] = ST.sets[e.id].map(() => ({ reps: '', weight: '' }));
    Object.keys(ST.expanded).forEach(k => ST.expanded[k] = false); ST.expanded[e.id] = true;
    renderFlight(document.getElementById('mainPage'));
    window.__renders = 0; const rf = renderFlight; window.renderFlight = function () { window.__renders++; return rf.apply(this, arguments); };
    return { id: e.id, name: e.name, target: e.target, reps: parseTargetReps(e.target), sets: ST.sets[e.id].length };
  });
  if (!ex) { console.log('no suitable exercise', JSON.stringify(await page.evaluate(() => [...ST.workout.takeoff, ...ST.workout.enroute].map(x => [x.name, x.target, x.inputType, x.timed, parseTargetReps(x.target), (ST.sets[x.id]||[]).length])))); process.exit(2); }
  console.log('exercise: ' + ex.name + ' ' + ex.target + ' (' + ex.sets + ' sets)');
  const box = () => page.evaluate(id => (document.getElementById('ar_' + id) || {}).innerText || '', ex.id);
  const reps = i => page.locator('#st_' + ex.id + '_' + i + ' input').nth(0);
  const wt = i => page.locator('#st_' + ex.id + '_' + i + ' input').nth(1);
  const miss = String(ex.reps - 2);

  console.log('A. reps then weight, timer never started');
  await reps(0).tap(); await page.keyboard.type(miss, { delay: 80 });
  await page.waitForTimeout(1600);
  check('reps only, still in the field: silent', (await box()) === '', await box());
  await wt(0).tap();
  await page.waitForTimeout(500);
  check('moved to the empty weight box: still silent', (await box()) === '', await box());
  await page.keyboard.type('50', { delay: 80 });
  check('not on the keystroke itself', (await box()) === '');
  await page.waitForTimeout(1500);
  const a = await box();
  check('feedback appears after reps + weight', a.includes(miss + ' of ' + ex.reps), a);
  check('weight field kept focus (keyboard not dropped)', await page.evaluate(id => document.activeElement === document.querySelectorAll('#st_' + id + '_0 input')[1], ex.id));
  check('no full screen re-render', (await page.evaluate(() => window.__renders)) === 0, 'renders=' + await page.evaluate(() => window.__renders));
  check('rest timer not running', await page.evaluate(() => !ST.restTimer.active));
  if (OUT) await page.screenshot({ path: path.join(OUT, 'live-feedback-A.png') });

  console.log('B. correcting the reps up to target clears it');
  await reps(0).tap(); await reps(0).fill(String(ex.reps));
  await page.waitForTimeout(1500);
  check('box cleared when on target', (await box()) === '', await box());

  console.log('C. two-digit number typed at normal speed never flashes a one-digit miss');
  let sawPartial = false;
  await wt(1).tap(); await page.keyboard.type('50', { delay: 80 });
  await reps(1).tap();
  for (const ch of String(ex.reps - 2 >= 10 ? ex.reps - 2 : 10)) { await page.keyboard.type(ch); await page.waitForTimeout(250); if (/^.{0,3}1 of /.test(await box())) sawPartial = true; }
  check('no "1 of N" flash mid-number', !sawPartial);

  console.log('D. bodyweight style: reps only, then leave the field');
  await page.evaluate(id => { ST.sets[id] = ST.sets[id].map(() => ({ reps: '', weight: '' })); window.__renders = 0; const rf = window.renderFlight; ST.expanded[id] = true; rf(document.getElementById('mainPage')); window.__renders = 0; }, ex.id);
  await reps(0).tap(); await page.keyboard.type(miss, { delay: 80 });
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(500);
  const d = await box();
  check('feedback after leaving the field with reps only', d.includes(miss + ' of ' + ex.reps), d);

  console.log('E. deleting the reps removes the stale message');
  await reps(0).tap(); await reps(0).fill('');
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(500);
  check('box cleared after reps deleted', (await box()) === '', await box());

  console.log('F. starting the timer still shows it (old path intact)');
  await reps(0).tap(); await reps(0).fill(miss); await wt(0).tap(); await wt(0).fill('50');
  const startBtn = page.locator('#excard_' + ex.id + ' [onclick*="startRestTimer"]').first();
  if (await startBtn.count()) {
    await startBtn.tap(); await page.waitForTimeout(400);
    const f = await box();
    check('feedback present with timer running', f.includes(miss + ' of ' + ex.reps), f);
    check('timer started from one tap', await page.evaluate(() => ST.restTimer.active));
    await page.evaluate(() => { clearInterval(ST.restTimer.interval); ST.restTimer.active = false; });
  } else console.log('  (no rest timer button on this card)');

  console.log('G. reps-only exercise: feedback about 1.2s after typing, no weight box to wait for');
  const ro = await page.evaluate(() => {
    const e = [...ST.workout.takeoff, ...ST.workout.enroute].find(x => x.inputType === 'reps_only' && parseTargetReps(x.target) >= 6 && (ST.sets[x.id] || []).length >= 2);
    if (!e) return null;
    ST.sets[e.id] = ST.sets[e.id].map(() => ({ reps: '' }));
    Object.keys(ST.expanded).forEach(k => ST.expanded[k] = false); ST.expanded[e.id] = true;
    renderFlight(document.getElementById('mainPage')); window.__renders = 0;
    return { id: e.id, name: e.name, target: e.target, reps: parseTargetReps(e.target) };
  });
  if (ro) {
    console.log('  exercise: ' + ro.name + ' ' + ro.target);
    const roBox = () => page.evaluate(id => (document.getElementById('ar_' + id) || {}).innerText || '', ro.id);
    const roReps = i => page.locator('#st_' + ro.id + '_' + i + ' input').nth(0);
    const roMiss = String(ro.reps - 2);
    await roReps(0).tap(); await page.keyboard.type(roMiss, { delay: 80 });
    check('quiet on the keystroke itself', (await roBox()) === '');
    await page.waitForTimeout(1500);
    const g = await roBox();
    check('feedback appears from reps alone', g.includes(roMiss + ' of ' + ro.reps), g);
    check('no weight advice on a bodyweight move', !/weight|\blb\b/i.test(g), g);
    check('reps field kept focus', await page.evaluate(id => document.activeElement === document.querySelector('#st_' + id + '_0 input'), ro.id));
    check('no full screen re-render', (await page.evaluate(() => window.__renders)) === 0);
    await roReps(0).fill(String(ro.reps)); await page.waitForTimeout(1500);
    check('clears when corrected to target', (await roBox()) === '', await roBox());
    if (OUT) { await roReps(0).fill(roMiss); await page.waitForTimeout(1500); await page.screenshot({ path: path.join(OUT, 'live-feedback-G.png') }); }
  } else console.log('  (no reps-only working exercise in this workout)');

  console.log('H. "3×max" and warmup moves stay quiet');
  const quiet = await page.evaluate(() => {
    const out = [];
    for (const ph of ['taxi', 'takeoff', 'enroute', 'landing']) for (const e of ST.workout[ph]) {
      if (e.inputType !== 'reps_only') continue;
      const isMax = /max/i.test(e.target), warm = ph === 'taxi' || ph === 'landing';
      if (!isMax && !warm) continue;
      ST.sets[e.id] = (ST.sets[e.id] || [{}]).map(() => ({ reps: '1' }));
      const f = setFeedbackFor(e, ph, ST.sets[e.id]);
      out.push({ name: e.name, target: e.target, ph, said: f ? f.text : '' });
      ST.sets[e.id] = ST.sets[e.id].map(() => ({ reps: '' }));
    }
    return out;
  });
  quiet.forEach(q => check(q.name + ' (' + q.target + ', ' + q.ph + ') silent', q.said === '', q.said));

  console.log('I. every card draws the number of set boxes its label promises');
  const boxes = await page.evaluate(() => {
    const out = [];
    // The full, untrimmed program through the app's own builder, with the
    // shoulder flag on, so the injury swap is always part of what is drawn.
    ST.injuries = ['shoulder'];
    ST.workout = getCombinedWorkout('hotel', 'Full Body'); ST.sets = {}; ST.expanded = {};
    for (const ph of ['taxi', 'takeoff', 'enroute', 'landing']) for (const e of ST.workout[ph]) {
      const lab = (e.target || '').match(/^(\d+)\s*[x×]/i);
      const timed = e.timed || ['timed', 'timed_bilateral', 'timed_distance', 'nsdr'].includes(e.inputType);
      if (!lab || timed) continue;
      delete ST.sets[e.id];
      ST.expanded[e.id] = true;
    }
    renderFlight(document.getElementById('mainPage'));
    for (const ph of ['taxi', 'takeoff', 'enroute', 'landing']) for (const e of ST.workout[ph]) {
      const lab = (e.target || '').match(/^(\d+)\s*[x×]/i);
      const timed = e.timed || ['timed', 'timed_bilateral', 'timed_distance', 'nsdr'].includes(e.inputType);
      if (!lab || timed) continue;
      out.push({ name: e.name, target: e.target, want: parseInt(lab[1], 10), got: document.querySelectorAll('#excard_' + e.id + ' .set-tile').length, swapped: !!e.swappedForInjury });
    }
    return out;
  });
  boxes.forEach(b => check(b.name + ' ' + b.target + (b.swapped ? ' (injury swap)' : ''), b.want === b.got, b.got + ' boxes'));
  check('workout includes an injury-swapped exercise to prove the fix', boxes.some(b => b.swapped));
  if (OUT) {
    const sw = await page.evaluate(() => { const e = [...ST.workout.takeoff, ...ST.workout.enroute].find(x => x.swappedForInjury); if (!e) return null; Object.keys(ST.expanded).forEach(k => ST.expanded[k] = false); ST.expanded[e.id] = true; renderFlight(document.getElementById('mainPage')); return e.id; });
    if (sw) { await page.locator('#excard_' + sw).scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(OUT, 'live-feedback-I.png') }); }
  }

  check('no JavaScript errors', errors.length === 0, errors.join(' | '));
  // Leave the bot account clean: abandon the workout without saving.
  await page.evaluate(() => { try { ST.workout = null; ST.sets = {}; localStorage.removeItem('fcf_workout_state'); } catch (e) {} });
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
