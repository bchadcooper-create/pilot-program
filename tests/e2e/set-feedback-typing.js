// Reported Oct 22 2026: "I'm attempting to enter 12 but it jumps to failed as
// soon as I enter 1." The weight box carries over from the last set, so the
// set looked complete after the first digit. A typing pause must not produce
// a miss while the cursor is still in the set; leaving the field does.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const BASE = process.env.BASE_URL || 'https://flightcrew.fit';
let fail = 0;
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
  await page.evaluate(() => { if (!ST.disclaimerAccepted && typeof acceptDisclaimer === 'function') acceptDisclaimer(); });
  await page.waitForFunction(() => { try { return _bootRenderDone; } catch (e) { return false; } }, null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  console.log('version ' + await page.evaluate(() => FCF_VERSION) + ' at ' + BASE);

  // A one-exercise workout: 3x12 weighted, set 1 done, set 2 weight carried over.
  await page.evaluate(() => {
    const e = buildExerciseCatalog().find(x => x.name === 'Cable Hip Abduction');
    ST.env = 'hotel'; ST.muscleGroup = 'Lower Body'; ST.tab = 'flight';
    ST.workout = { taxi: [], takeoff: [], enroute: [{ ...e }], landing: [] };
    ST.sets = { [e.id]: [{ reps: '12', weight: '40' }, { reps: '', weight: '40' }, {}] };
    renderFlight(document.getElementById('mainPage'));
  });
  await page.waitForTimeout(500);
  const exId = await page.evaluate(() => ST.workout.enroute[0].id);
  // A card with a logged set opens collapsed; open it like a thumb would.
  await page.evaluate(id => { if (!document.getElementById('st_' + id + '_1')) toggleEx(id); }, exId);
  await page.waitForTimeout(400);
  const tile = page.locator('#st_' + exId + '_1');
  const reps = tile.locator('input').first();
  const box = () => page.evaluate(id => (document.getElementById('ar_' + id) || {}).textContent || '', exId);

  await reps.click(); await reps.type('1'); await page.waitForTimeout(1800);
  check('A. no miss after the first digit while still typing', !/miss/i.test(await box()), await box());
  await reps.type('2'); await page.waitForTimeout(1800);
  check('B. 12 of 12 never reads as a miss', !/miss/i.test(await box()), await box());

  // Set 3: a real 6, then leave the field.
  const tile3 = page.locator('#st_' + exId + '_2'); const reps3 = tile3.locator('input').first();
  await reps3.click(); await reps3.type('6'); await page.waitForTimeout(1800);
  check('C. still no miss while the cursor is in the box', !/miss/i.test(await box()), await box());
  await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.waitForTimeout(600);
  check('D. the miss shows once the field is left', /6 of 12/.test(await box()), await box());
  check('E. no JavaScript errors', errs.length === 0, errs);
  await page.evaluate(() => { try { ST.workout = null; ST.sets = {}; localStorage.removeItem('fcf_workout_state'); } catch (e) {} });
  await browser.close();
  console.log(fail ? fail + ' FAILED' : 'All checks passed'); process.exit(fail ? 1 : 0);
})();
