// Walking First: objective, step goal picker, Today progress, Walk and
// Starter Strength sessions. Requested Oct 13 for a first officer down from
// 300+ lb who walks instead of lifting because the gym feels like too much.
//   npm run e2e:walking        (BASE_URL defaults to the live site)
// Changes are made in page state only; nothing is saved to the account.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const BASE = process.env.BASE_URL || 'https://flightcrew.fit';
const SHOTS = process.env.SHOTS_DIR || null;
let fail = 0;
const check = (name, cond, got) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  got ' + JSON.stringify(got))); if (!cond) fail++; };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'en-US', timezoneId: 'America/Phoenix' });
  let coachCtx = null;
  await ctx.route('**/functions/v1/fcf-ai-coach', async r => {
    try { const b = JSON.parse(r.request().postData() || '{}'); if (b.mode === 'fatigue_calibration') coachCtx = b.context; } catch (e) {}
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'stub', cached: false }) });
  });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/?e2e=' + Date.now(), { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500);
  const acct = page.getByText(/I HAVE AN ACCOUNT/i).first(); if (await acct.count()) await acct.click();
  await page.waitForSelector('#auth_email', { timeout: 15000 });
  await page.fill('#auth_email', process.env.E2E_EMAIL); await page.fill('#auth_pass', process.env.E2E_PASSWORD);
  await page.locator('button', { hasText: /Sign In/ }).last().click();
  await page.waitForFunction(() => typeof ST !== 'undefined' && !!ST.user, null, { timeout: 25000 });
  await page.waitForFunction(() => document.querySelector('[onclick*="acceptDisclaimer"]') || ST.disclaimerAccepted, null, { timeout: 15000 }).catch(() => {});
  const ok = page.locator('[onclick*="acceptDisclaimer"]').first(); if (await ok.count()) { await ok.click(); await page.waitForTimeout(800); }
  await page.waitForFunction(() => { try { return _bootRenderDone; } catch (e) { return false; } }, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  console.log('version ' + await page.evaluate(() => FCF_VERSION) + ' at ' + BASE);

  // Never write to the test account: saving is stubbed for the whole run.
  await page.evaluate(() => { window.saveGoalLevel = async () => {}; });

  // Profile: pick Walking First, the step goal picker appears with 7K selected.
  await page.evaluate(() => { ST.goal = 'longevity'; ST.stepGoal = null; switchTab('profile'); });
  await page.waitForTimeout(600);
  await page.locator('.env-btn', { hasText: 'Walking First' }).first().click();
  await page.waitForTimeout(500);
  const prof = await page.evaluate(() => ({ goal: ST.goal, stepGoal: ST.stepGoal, mg: ST.muscleGroup,
    picker: !!document.getElementById('stepGoalCustom'), text: document.getElementById('mainPage').textContent }));
  check('choosing Walking First sets the objective', prof.goal === 'walking', prof.goal);
  check('step goal starts at 7,000', prof.stepGoal === 7000, prof.stepGoal);
  check('step goal picker shows under the objective', prof.picker && /DAILY STEP GOAL/.test(prof.text), prof.picker);
  if (SHOTS) {
    await page.evaluate(() => document.getElementById('stepGoalCustom').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, 'profile-step-goal.png') });
  }
  await page.locator('.env-btn', { hasText: /^10K$/ }).first().click(); await page.waitForTimeout(400);
  check('tapping 10K sets the goal', await page.evaluate(() => ST.stepGoal) === 10000);
  await page.fill('#stepGoalCustom', '6540'); await page.locator('button', { hasText: /^Set$/ }).click(); await page.waitForTimeout(400);
  check('a typed goal is rounded and saved to state', await page.evaluate(() => ST.stepGoal) === 6500);

  // Today: steps against the goal, and the rule card on a walk day.
  const today = await page.evaluate(() => {
    ST.stepGoal = 7000; ST.ouraSteps = 4210; ST.healthkit = null;
    // A strength session yesterday makes today a walk day.
    const y = new Date(); y.setDate(y.getDate() - 1);
    // Only that session, so nothing counts as logged today (the walk-day
    // card stands aside once a session is logged).
    ST.sessionCache = [{ date: y.toISOString(), muscle_group: 'Starter Strength' }];
    const ctx = getTodayContext();
    const top = buildOuraTopSectionHTML(ctx);
    const brief = buildTodayBriefing(ctx);
    return { steps: ctx.oura.steps, top, brief, next: walkingFirstNext() };
  });
  check('today is a walk day after yesterday\'s strength session', today.next === 'Walk', today.next);
  check('Today shows the step goal bar', /STEP GOAL/.test(today.top) && /\/ 7,000/.test(today.top), today.top.slice(0, 300));
  check('rule card is the walk-day card', /Walk day|Step goal done/.test(today.brief.headline), today.brief);
  await page.evaluate(() => switchTab('today')); await page.waitForTimeout(1200);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'today.png') });
  check('the coach is told the walking plan', !!coachCtx && !!coachCtx.walkingPlan && coachCtx.walkingPlan.todaysPlan === 'Walk' && coachCtx.walkingPlan.dailyStepGoal === 7000, coachCtx && coachCtx.walkingPlan);

  // Preflight: both sessions build in every environment.
  for (const mg of ['Walk', 'Starter Strength']) {
    for (const env of ['comm', 'hotel', 'room', 'band']) {
      const r = await page.evaluate(([mg, env]) => {
        ST.activeCustomProfileId = null; ST.env = env; ST.muscleGroup = mg; ST.fatigue = 'go'; ST.level = 'beginner'; ST.injuries = [];
        const wk = getActiveWorkout();
        return wk ? { n: wk.taxi.length + wk.takeoff.length + wk.enroute.length + wk.landing.length, names: [].concat(wk.takeoff, wk.enroute).map(e => e.name) } : null;
      }, [mg, env]);
      check(mg + ' builds in ' + env, !!r && r.n >= 3 && r.names.length >= 1, r);
    }
  }
  await page.evaluate(() => { ST.env = 'comm'; ST.muscleGroup = 'Starter Strength'; ST.level = 'intermediate'; ST.showChangePlan = true; switchTab('preflight'); });
  await page.waitForTimeout(900);
  const pre = await page.evaluate(() => document.getElementById('mainPage').textContent);
  check('Starter Strength preview lists Leg Press', /Leg Press/.test(pre));
  if (SHOTS) {
    const prev = page.locator('.card', { hasText: 'Leg Press' }).first();
    await prev.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(SHOTS, 'preflight-starter.png') });
  }
  check('no page errors', errs.length === 0, errs);
  await browser.close();
  console.log(fail ? fail + ' FAILED' : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
