// Swap In buttons must work when a name or note contains an apostrophe.
// Reported: tapping Swap In on an AI substitute showed
// "JS ERROR: SyntaxError: Unexpected EOF". The button carried the exercise as
// JSON inside a single-quoted attribute, and "don't" ended the attribute.
//   npm run e2e:swap            (BASE_URL defaults to the live site)
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

  // Build a workout whose first exercise has a curated alternate with an
  // apostrophe, and whose second exercise has an apostrophe in its own text.
  const setup = await page.evaluate(() => {
    ST.env = 'hotel'; ST.muscleGroup = 'Full Body'; ST.injuries = [];
    const wk = getCombinedWorkout('hotel', 'Full Body');
    const cat = buildExerciseCatalog();
    const hostName = Object.keys(ALTERNATES).find(n => getAlternates(n).some(a => /'/.test(a.name + a.note)) && cat.some(e => e.name === n));
    const host = cat.find(e => e.name === hostName);
    const altIdx = getAlternates(hostName).findIndex(a => /'/.test(a.name + a.note));
    const apos = cat.find(e => /'/.test(e.name) && e.name !== hostName) || cat.find(e => /'/.test(e.note || '') && e.name !== hostName);
    wk.takeoff[0] = { ...host }; wk.takeoff[1] = { ...apos };
    ST.workout = wk; ST.sets = {}; ST.expanded = {}; ST.tab = 'flight';
    renderFlight(document.getElementById('mainPage'));
    return { pro: isPro(), host: { id: host.id, name: host.name }, altIdx, alt: getAlternates(hostName)[altIdx], apos: { id: apos.id, name: apos.name, note: apos.note } };
  });
  check('0. test account is Pro and the workout is set up', setup.pro && !!setup.alt && !!setup.apos.id, setup);

  // A. Curated alternate whose note has an apostrophe.
  await page.evaluate(s => showAlternates(s.host.id, s.host.name, 'takeoff'), setup);
  await page.locator('#modalRoot button', { hasText: /^Swap In$/ }).nth(setup.altIdx).click(); await page.waitForTimeout(500);
  let st = await page.evaluate(() => ({ name: ST.workout.takeoff[0].name, modal: document.getElementById('modalRoot').innerHTML.length }));
  check('A. curated alternate with an apostrophe ("' + setup.alt.name + '") swaps in', st.name === setup.alt.name && st.modal === 0 && errs.length === 0, { st, errs });

  // B. Ask AI Coach on an exercise with an apostrophe in its own name or note.
  await page.evaluate(s => showAlternates(s.apos.id, s.apos.name, 'takeoff'), setup);
  await page.fill('#aiSubExplain', 'All I have is dumbbells');
  await page.locator('#modalRoot button', { hasText: /^Ask AI Coach$/ }).click();
  const card = await page.waitForFunction(() => /Dumbbell Overhead Lat Stretch/.test(document.getElementById('aiSubResult')?.textContent || ''), null, { timeout: 15000 }).then(() => true).catch(() => false);
  const shown = await page.evaluate(() => document.getElementById('aiSubResult')?.textContent || '');
  check('B1. Ask AI Coach works on "' + setup.apos.name + '" and shows the suggestion', card && errs.length === 0, { shown, errs });
  check('B2. the note is shown in full, apostrophe included, not cut at 120 characters', shown.includes("don't force it past a good stretch."), shown);

  // C. The reported tap.
  await page.locator('#aiSubResult button', { hasText: /^Swap In$/ }).click(); await page.waitForTimeout(500);
  st = await page.evaluate(() => ({ ex: ST.workout.takeoff[1], modal: document.getElementById('modalRoot').innerHTML.length, card: document.querySelector('#excard_' + ST.workout.takeoff[1].id) ? true : false }));
  check('C1. Swap In on the AI suggestion swaps it in with no JS error', st.ex.name === 'Dumbbell Overhead Lat Stretch' && st.modal === 0 && errs.length === 0, { name: st.ex.name, errs });
  check('C2. it arrives as a timed per-side stretch with its full note', st.ex.inputType === 'timed_bilateral' && st.ex.target === '60s/side' && st.ex.note.includes("don't force it") && st.card, st.ex);
  check('D. no JavaScript errors at any point', errs.length === 0, errs);

  await page.evaluate(() => { try { ST.workout = null; ST.sets = {}; localStorage.removeItem('fcf_workout_state'); } catch (e) {} });
  await browser.close();
  console.log(fail ? '\n' + fail + ' check(s) FAILED' : '\nAll checks passed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
