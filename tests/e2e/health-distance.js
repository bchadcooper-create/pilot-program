// Run and walk distance from Apple Health (for the next iPhone build).
// The real Health side cannot run here, so this pretends to be the app
// shell: it records what the page asks for and plays back Health's answers.
//   npm run e2e:distance         (BASE_URL defaults to the live site)
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const BASE = process.env.BASE_URL || 'https://flightcrew.fit';
const OUT = process.env.SHOT_DIR || '';
let fail = 0;
const check = (name, cond, got) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  got ' + JSON.stringify(got))); if (!cond) fail++; };

// mode: 'ios' (the build in review: knows nothing about distance) | 'ios_next'
function stub(mode) {
  window.__health = [];
  const noop = { postMessage() {} };
  window.webkit = { messageHandlers: { storeKit: noop, haptics: noop, share: noop, healthkit: { postMessage(m) { window.__health.push(m); } } } };
  if (mode === 'ios_next') window.FCFBridge = new Proxy({ isNative: true, capabilities: { healthDistance: true } }, { get: (t, k) => (k in t ? t[k] : () => {}) });
}
async function open(browser, mode, state) {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'en-US', timezoneId: 'America/Chicago', ...(state ? { storageState: state } : {}) });
  await ctx.route('**/functions/v1/fcf-ai-coach', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'stub', cached: true }) }));
  await ctx.addInitScript(stub, mode);
  const page = await ctx.newPage(); page.__errs = []; page.on('pageerror', e => page.__errs.push(e.message));
  await page.goto(BASE + '/?e2e=' + Date.now(), { waitUntil: 'domcontentloaded' });
  if (!state) {
    await page.waitForTimeout(1500);
    const acct = page.getByText(/I HAVE AN ACCOUNT/i).first(); if (await acct.count()) await acct.click();
    await page.waitForSelector('#auth_email', { timeout: 10000 });
    await page.fill('#auth_email', process.env.E2E_EMAIL); await page.fill('#auth_pass', process.env.E2E_PASSWORD);
    await page.locator('button', { hasText: /Sign In/ }).last().click();
    await page.waitForFunction(() => typeof ST !== 'undefined' && !!ST.user, null, { timeout: 25000 });
    await page.waitForFunction(() => document.querySelector('[onclick*="acceptDisclaimer"]') || ST.disclaimerAccepted, null, { timeout: 15000 }).catch(() => {});
    const ok = page.locator('[onclick*="acceptDisclaimer"]').first(); if (await ok.count()) { await ok.click(); await page.waitForTimeout(800); }
  }
  await page.waitForFunction(() => { try { return _bootRenderDone && !!ST.user; } catch (e) { return false; } }, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  return { ctx, page };
}
// A workout holding one run (time + distance) and nothing else.
const seed = page => page.evaluate(() => {
  const run = { ...buildExerciseCatalog().find(e => e.inputType === 'timed_distance') };
  ST.env = 'comm'; ST.workout = { taxi: [], takeoff: [], enroute: [run], landing: [] };
  ST.sets = {}; ST.expanded = { [run.id]: true }; ST.tab = 'flight';
  window.__health.length = 0; // only count what this card asks for
  renderFlight(document.getElementById('mainPage'));
  return { id: run.id, name: run.name, target: run.target };
});
const card = (page, id) => page.evaluate(id => ({ text: document.getElementById('excard_' + id).textContent.replace(/\s+/g, ' '), buttons: [...document.querySelectorAll('#excard_' + id + ' button')].map(b => b.textContent.trim()),
  time: document.querySelectorAll('#excard_' + id + ' .timed-inp')[0]?.value, dist: document.querySelectorAll('#excard_' + id + ' .timed-inp')[1]?.value, set: (ST.sets[id] || [])[0], health: window.__health.slice() }), id);
const reply = (page, detail) => page.evaluate(d => window.dispatchEvent(new CustomEvent('fcf:healthDistance', { detail: d })), detail);
const timeRun = async (page, id, secs) => { await page.evaluate(([id, secs]) => { startStopwatch(id, null, null); ST.stopwatch.startTs = Date.now() - secs * 1000; tickStopwatch(id, null); }, [id, secs]);
  await page.locator('#excard_' + id + ' button', { hasText: /STOP/ }).click(); await page.waitForTimeout(300); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // A. The build in review: nothing new is shown and nothing is asked of it.
  let { ctx, page } = await open(browser, 'ios');
  console.log('version ' + await page.evaluate(() => FCF_VERSION) + ' at ' + BASE);
  const state = await ctx.storageState();
  let run = await seed(page);
  let c = await card(page, run.id);
  check('A1. current build: ' + run.name + ' has a stopwatch but no Apple Health button', c.buttons.includes('START') && !c.buttons.some(b => /Apple Health/.test(b)), c.buttons);
  await timeRun(page, run.id, 1680); c = await card(page, run.id);
  check('A2. current build: the stopwatch fills the time, and Apple Health is not asked for anything', Number(c.set.seconds) >= 1680 && Number(c.set.seconds) < 1700 && c.health.length === 0, { set: c.set, health: c.health });
  check('A3. no page errors', page.__errs.length === 0, page.__errs);
  await ctx.close();

  // B. The next build: stopwatch window.
  ({ ctx, page } = await open(browser, 'ios_next', state));
  run = await seed(page); c = await card(page, run.id);
  check('B1. next build: the card offers Fill from Apple Health', c.buttons.includes('Fill from Apple Health'), c.buttons);
  if (OUT) { await page.locator('#excard_' + run.id).scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(OUT, 'health-distance-card.png') }); }
  const before = Date.now();
  await timeRun(page, run.id, 1680); c = await card(page, run.id);
  const ask = c.health.find(m => m.action === 'distance');
  check('B2. stopping the stopwatch asks Apple Health for the distance over that exact 28 minutes', !!ask && ask.exId === run.id && Math.abs((ask.endMs - ask.startMs) / 1000 - 1680) < 20 && ask.endMs >= before, c.health);
  await reply(page, { success: true, kind: 'window', exId: run.id, miles: 3.12, source: 'Apple Health' }); await page.waitForTimeout(400);
  c = await card(page, run.id);
  check('B3. the answer fills the distance box and leaves the time alone', c.set.miles === '3.12' && c.dist === '3.12' && Number(c.set.seconds) >= 1680, c);
  // A typed distance is never replaced by an automatic answer.
  await page.locator('#excard_' + run.id + ' .timed-inp').nth(1).fill('3.5'); await page.waitForTimeout(200);
  await reply(page, { success: true, kind: 'window', exId: run.id, miles: 3.12 }); await page.waitForTimeout(400);
  c = await card(page, run.id);
  check('B4. a distance typed by hand is kept', c.set.miles === '3.5', c.set);
  // Nothing found after an ordinary stop: no change, no popup.
  await reply(page, { success: false, kind: 'window', exId: run.id, code: 'no_distance' }); await page.waitForTimeout(300);
  c = await card(page, run.id);
  check('B5. "no distance found" after a stopwatch stop changes nothing', c.set.miles === '3.5', c.set);

  // C. The next build: pull in a run recorded on a watch.
  run = await seed(page);
  await page.locator('#excard_' + run.id + ' button', { hasText: 'Fill from Apple Health' }).click(); await page.waitForTimeout(300);
  c = await card(page, run.id);
  check('C1. the button asks Apple Health for the latest recorded run or walk', c.health.some(m => m.action === 'recentDistanceWorkout' && m.exId === run.id), c.health);
  await reply(page, { success: true, kind: 'workout', exId: run.id, miles: 3.1, seconds: 1685, activityType: 'Running', source: 'Apple Watch' }); await page.waitForTimeout(400);
  c = await card(page, run.id);
  check('C2. its time and distance both land on the card', c.set.miles === '3.1' && c.set.seconds === '1685' && c.dist === '3.1' && c.time === '28.1', c);
  // An answer for an exercise that is no longer in the workout is ignored.
  await reply(page, { success: true, kind: 'workout', exId: 'not_in_this_workout', miles: 9, seconds: 60 }); await page.waitForTimeout(200);
  check('C3. an answer for some other exercise is ignored', (await page.evaluate(() => Object.keys(ST.sets).length)) === 1, null);
  check('C4. no page errors', page.__errs.length === 0, page.__errs);
  await page.evaluate(() => { try { ST.workout = null; ST.sets = {}; localStorage.removeItem('fcf_workout_state'); } catch (e) {} });
  await ctx.close();

  await browser.close();
  console.log(fail ? '\n' + fail + ' check(s) FAILED' : '\nAll checks passed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
