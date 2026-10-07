// Timed exercises that prescribe more than one set.
// Reported: "Jumping Jacks, I'm supposed to do two sets of 30 seconds. So
// where do I record the second set?" There was one TOTAL TIME box and the
// stopwatch overwrote it.
//   npm run e2e:timed            (BASE_URL defaults to the live site)
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const BASE = process.env.BASE_URL || 'https://flightcrew.fit';
const OUT = process.env.SHOT_DIR || '';
let fail = 0;
// The real stopwatch keeps ticking between the simulated start and the tap
// on STOP, so a recorded time may run a few seconds over the simulated one.
const near = (v, n) => v !== '' && v != null && Number(v) >= n && Number(v) <= n + 8;
const check = (name, cond, got) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  got ' + JSON.stringify(got))); if (!cond) fail++; };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'en-US', timezoneId: 'America/Phoenix' });
  await ctx.route('**/functions/v1/fcf-ai-coach', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'stub', cached: true }) }));
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/?e2e=' + Date.now(), { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500);
  const acct = page.getByText(/I HAVE AN ACCOUNT/i).first(); if (await acct.count()) await acct.click();
  await page.waitForSelector('#auth_email', { timeout: 10000 });
  await page.fill('#auth_email', process.env.E2E_EMAIL); await page.fill('#auth_pass', process.env.E2E_PASSWORD);
  await page.locator('button', { hasText: /Sign In/ }).last().click();
  await page.waitForFunction(() => typeof ST !== 'undefined' && !!ST.user, null, { timeout: 25000 });
  await page.waitForFunction(() => document.querySelector('[onclick*="acceptDisclaimer"]') || ST.disclaimerAccepted, null, { timeout: 15000 }).catch(() => {});
  const ok = page.locator('[onclick*="acceptDisclaimer"]').first(); if (await ok.count()) { await ok.click(); await page.waitForTimeout(800); }
  await page.waitForFunction(() => { try { return _bootRenderDone; } catch (e) { return false; } }, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  console.log('version ' + await page.evaluate(() => FCF_VERSION) + ' at ' + BASE);

  // A workout holding one of each kind: 2×30s, a per-side 2×, and two single efforts.
  const ids = await page.evaluate(() => {
    const cat = buildExerciseCatalog();
    const pick = fn => ({ ...cat.find(fn) });
    const jj = pick(e => e.name === 'Jumping Jacks');
    const calf = pick(e => e.inputType === 'timed_bilateral' && /^2\s*[x×]/i.test(e.target));
    const single = pick(e => e.timed && e.inputType === 'timed' && !/[x×]/i.test(e.target) && !/min/i.test(e.target) && !/side|leg/.test(e.target));
    const walk = pick(e => e.timed && /min/i.test(e.target) && e.inputType === 'timed');
    ST.env = 'comm'; ST.workout = { taxi: [jj, calf], takeoff: [], enroute: [walk], landing: [single] };
    ST.sets = {}; ST.expanded = { [jj.id]: true, [calf.id]: true, [single.id]: true, [walk.id]: true }; ST.tab = 'flight';
    renderFlight(document.getElementById('mainPage'));
    return { jj: jj.id, calf: { id: calf.id, name: calf.name, target: calf.target }, single: { id: single.id, name: single.name, target: single.target }, walk: { id: walk.id, name: walk.name, target: walk.target } };
  });
  const card = id => page.evaluate(id => ({ tiles: document.querySelectorAll('#excard_' + id + ' .set-tile').length, inputs: document.querySelectorAll('#excard_' + id + ' .set-tile input').length,
    totalBox: /TOTAL TIME/.test(document.getElementById('excard_' + id).textContent), text: document.getElementById('excard_' + id).textContent.replace(/\s+/g, ' ').slice(0, 400), sets: ST.sets[id] }), id);
  // Runs the real stopwatch: start, let it tick, stop.
  const time = async (id, side, secs) => { await page.evaluate(([id, side, secs]) => { startStopwatch(id, side, 30); ST.stopwatch.startTs = Date.now() - secs * 1000; tickStopwatch(id, side); }, [id, side, secs]);
    await page.locator('#excard_' + id + ' button', { hasText: /STOP/ }).click(); await page.waitForTimeout(300); };

  let c = await card(ids.jj);
  check('A1. Jumping Jacks 2×30s shows two set boxes, not one total box', c.tiles === 2 && !c.totalBox, c);
  check('A2. the stopwatch says which set it will fill', /SET 1 OF 2/.test(c.text), c.text);
  if (OUT) { await page.locator('#excard_' + ids.jj).scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(OUT, 'timed-sets-A.png') }); }
  await time(ids.jj, null, 33); c = await card(ids.jj);
  check('B1. first stop records set 1', near(c.sets[0].seconds, 33) && !c.sets[1].seconds && /SET 2 OF 2/.test(c.text), c);
  await time(ids.jj, null, 31); c = await card(ids.jj);
  check('B2. second stop records set 2 and set 1 is still there (the reported problem)', near(c.sets[0].seconds, 33) && near(c.sets[1].seconds, 31), c.sets);
  if (OUT) { await page.waitForTimeout(3500); await page.locator('#st_' + ids.jj + '_0').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(OUT, 'timed-sets-B.png') }); }
  await time(ids.jj, null, 20); c = await card(ids.jj);
  check('B3. a bonus third round is added after the last, nothing overwritten', c.sets.length === 3 && near(c.sets[2].seconds, 20) && near(c.sets[0].seconds, 33) && near(c.sets[1].seconds, 31) && c.tiles === 3, c.sets);
  await page.locator('#st_' + ids.jj + '_1 input').fill('45'); await page.waitForTimeout(200);
  c = await card(ids.jj);
  check('B4. a time can also be typed straight into a set', c.sets[1].seconds === '45', c.sets);

  c = await card(ids.calf.id);
  check('C1. ' + ids.calf.name + ' ' + ids.calf.target + ' shows two sets, each with a left and a right', c.tiles === 2 && c.inputs === 4, c);
  await time(ids.calf.id, 'left', 30); await time(ids.calf.id, 'right', 29); await time(ids.calf.id, 'left', 28);
  c = await card(ids.calf.id);
  check('C2. left and right stopwatches each fill their own next set', near(c.sets[0].seconds_left, 30) && near(c.sets[0].seconds_right, 29) && near(c.sets[1].seconds_left, 28) && !c.sets[1].seconds_right, c.sets);
  if (OUT) { await page.waitForTimeout(3500); await page.locator('#st_' + ids.calf.id + '_0').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(OUT, 'timed-sets-C.png') }); }

  c = await card(ids.single.id);
  check('D1. a single effort (' + ids.single.name + ' ' + ids.single.target + ') keeps its one box', c.tiles === 0 && c.totalBox, c);
  await time(ids.single.id, null, 40); await time(ids.single.id, null, 50); c = await card(ids.single.id);
  check('D2. and re-timing it replaces the time, as before', c.sets.length === 1 && near(c.sets[0].seconds, 50), c.sets);
  c = await card(ids.walk.id);
  check('D3. a long effort (' + ids.walk.name + ' ' + ids.walk.target + ') keeps its one minutes box', c.tiles === 0 && c.totalBox && /min/.test(c.text), c);

  // Survives a reload mid-workout, and saves as real sets.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { try { return _bootRenderDone; } catch (e) { return false; } }, null, { timeout: 30000 }); await page.waitForTimeout(1500);
  const after = await page.evaluate(id => ({ sets: ST.sets[id] }), ids.jj);
  check('E. the sets survive closing and reopening the app mid-workout', !!after.sets && after.sets.length === 3 && Number(after.sets[0].seconds) >= 33 && after.sets[1].seconds === '45', after);
  check('F. no JavaScript errors', errs.length === 0, errs);

  await page.evaluate(() => { try { ST.workout = null; ST.sets = {}; localStorage.removeItem('fcf_workout_state'); } catch (e) {} });
  await browser.close();
  console.log(fail ? '\n' + fail + ' check(s) FAILED' : '\nAll checks passed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
