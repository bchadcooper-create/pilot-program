// Gym machines: catalog, rotation, alternates and direct YouTube tutorials.
// Requested: add the machines at my gym, work them into the rotation as
// alternates, and link each one to a YouTube tutorial.
//   npm run e2e:machines        (BASE_URL defaults to the live site)
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const BASE = process.env.BASE_URL || 'https://flightcrew.fit';
let fail = 0;
const check = (name, cond, got) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  got ' + JSON.stringify(got))); if (!cond) fail++; };
const AI_NOTE = 'Hold a light dumbbell overhead with one arm and lean sideways to deepen the lat stretch, keep breathing and don\'t force it past a "good" stretch.';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'en-US', timezoneId: 'America/Phoenix' });
  // The AI answers with a note that has an apostrophe and quotes in it.
  await ctx.route('**/functions/v1/fcf-ai-coach', async r => {
    let mode = ''; try { mode = JSON.parse(r.request().postData() || '{}').mode; } catch (e) {}
    const text = mode === 'exercise_substitute'
      ? JSON.stringify({ name: 'Dumbbell Overhead Lat Stretch', target: '60s/side', note: AI_NOTE, inputType: 'timed_bilateral' })
      : 'stub';
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text, cached: false }) });
  });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
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


  // Commercial gym, Upper Push, rotated far enough to land on the machines.
  const r = await page.evaluate(() => {
    ST.env = 'comm'; ST.muscleGroup = 'Upper Push'; ST.injuries = [];
    const wk = getCombinedWorkout('comm', 'Upper Push');
    const cat = buildExerciseCatalog();
    const chest = cat.find(e => e.name === 'Chest Press (Machine)');
    wk.enroute = [{ ...chest }];
    ST.workout = wk; ST.sets = {}; ST.expanded = {}; ST.tab = 'flight';
    renderFlight(document.getElementById('mainPage'));
    showGuide(chest.id);
    const a1 = document.querySelector('#modalRoot a.modal-link');
    const out = { id: chest.id, guideHref: a1 && a1.href, guideText: a1 && a1.textContent };
    closeModal();
    openExerciseGuide('Hip Thrust (Machine)');
    const a2 = document.querySelector('#modalRoot a');
    out.thrustHref = a2 && a2.href; out.thrustBody = (document.querySelector('#modalRoot .modal-body') || {}).textContent;
    closeModal();
    openExerciseGuide('Incline DB Press');
    const a3 = document.querySelector('#modalRoot a'); out.searchHref = a3 && a3.href; closeModal();
    // Rotation: over enough Upper Push sessions every machine comes up.
    const seen = new Set(); const saved = ST.sessionCache; ST.fatigue = 'go'; ST.level = 'intermediate';
    for (let n = 0; n < 20; n++) {
      ST.sessionCache = Array.from({ length: n }, () => ({ muscle_group: 'Upper Push' }));
      getFilteredWorkout(WORKOUTS.comm['Upper Push']).enroute.forEach(e => seen.add(e.name));
    }
    ST.sessionCache = saved;
    out.rotated = ['Chest Press (Machine)','Shoulder Press (Machine)','Lateral Raise (Machine)','Triceps Extension (Machine)'].filter(n => seen.has(n));
    // Swapping the bench press for its machine alternate.
    const alts = getAlternates('Flat Barbell Bench Press').map(a => a.name);
    out.benchAlt = alts.includes('Chest Press (Machine)');
    return out;
  });
  check('A. the exercise info sheet links straight to the Matrix chest press video', r.guideHref === 'https://www.youtube.com/watch?v=6KFQqLTR-fc' && /tutorial/i.test(r.guideText || ''), r);
  check('B. the form-guide button opens the Booty Builder video for Hip Thrust (Machine)', r.thrustHref === 'https://www.youtube.com/watch?v=HLR07AVY1sc' && /tutorial/i.test(r.thrustBody || ''), r);
  check('C. exercises without a chosen video still get a YouTube search', /results\?search_query=/.test(r.searchHref || ''), r.searchHref);
  check('D. all four new Upper Push machines come up in the rotation', r.rotated.length === 4, r.rotated);
  check('E. bench press offers Chest Press (Machine) as an alternate', r.benchAlt, r);
  check('F. no JavaScript errors', errs.length === 0, errs);
  await browser.close();
  console.log(fail ? '\n' + fail + ' check(s) failed' : '\nAll checks passed');
  process.exit(fail ? 1 : 0);
})();
