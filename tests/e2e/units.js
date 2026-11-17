const { chromium, devices } = require('playwright');
const fs = require('fs'); const S = process.env.SHOTS_DIR || __dirname;
const env = {}; for (const l of fs.readFileSync(__dirname + '/.env', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
let fail = 0; const check = (n, c, g) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  got ' + JSON.stringify(g))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ ...devices['iPhone 14'], timezoneId: 'America/Phoenix', serviceWorkers: 'block' });
  await ctx.route('**/functions/v1/fcf-ai-coach', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'stub', cached: false }) }));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto((process.env.BASE_URL || 'https://flightcrew.fit') + '/?e2e=' + Date.now(), { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
  const acct = p.getByText(/I HAVE AN ACCOUNT/i).first(); if (await acct.count()) await acct.click();
  await p.waitForSelector('#auth_email', { timeout: 15000 });
  await p.fill('#auth_email', env.E2E_EMAIL); await p.fill('#auth_pass', env.E2E_PASSWORD);
  await p.locator('button', { hasText: /Sign In/ }).last().click();
  await p.waitForFunction(() => typeof ST !== 'undefined' && !!ST.user, null, { timeout: 25000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { if (!ST.disclaimerAccepted && typeof acceptDisclaimer === 'function') acceptDisclaimer(); });
  await p.waitForFunction(() => { try { return _bootRenderDone; } catch (e) { return false; } }, null, { timeout: 30000 });
  await p.waitForTimeout(1000);
  // App Settings > Units
  await p.evaluate(() => { ST.moreOpen = { app: true }; switchTab('more'); }); await p.waitForTimeout(600);
  check('Units card is under App Settings', !!(await p.locator('button', { hasText: 'Kilograms (kg)' }).count()));
  await p.locator('button', { hasText: 'Kilograms (kg)' }).first().scrollIntoViewIfNeeded(); await p.screenshot({ path: S + '/units-settings.png' });
  await p.locator('button', { hasText: 'Kilograms (kg)' }).first().click(); await p.waitForTimeout(500);
  await p.locator('button', { hasText: 'Ounces (fl oz)' }).first().click(); await p.waitForTimeout(1200);
  const saved = await p.evaluate(async () => ({ st: ST.units, prof: ((await dbGetProfile()) || {}).units }));
  check('choice saved to the account', saved.st.weight === 'kg' && saved.st.water === 'oz' && saved.prof && saved.prof.weight === 'kg', saved);
  // Water sheet in ounces
  await p.evaluate(() => { ST.waterIn = 0; ST.waterInRaw = ''; openQuickWaterLog(); }); await p.waitForTimeout(400);
  const sheet = await p.evaluate(() => document.getElementById('modalRoot').innerText);
  check('water sheet is in ounces', /\+16 oz/i.test(sheet) && /Target \d+ oz/.test(sheet) && !/ L\b/.test(sheet), sheet.slice(0, 200));
  await p.screenshot({ path: S + '/units-water.png' });
  await p.locator('#modalRoot button', { hasText: '+16 oz' }).click(); await p.waitForTimeout(500);
  const w = await p.evaluate(() => ST.waterIn);
  check('+16 oz is stored as 0.473 L', Math.abs(w - 0.473) < 0.002, w);
  // A workout in kilograms
  await p.evaluate(() => { const t = document.getElementById('fcf-big-toast-bg'); if (t) t.click(); ST.env = 'comm'; ST.muscleGroup = 'Upper Push'; switchTab('preflight'); }); await p.waitForTimeout(800);
  const started = await p.evaluate(async () => { const fn = typeof engageWorkout === 'function' ? engageWorkout : null; if (!fn) return 'no start fn'; try { await fn(); } catch (e) { return 'ERR ' + e.message; } return ST.tab + '|' + !!ST.workout; });
  console.log('start workout ->', started); await p.waitForTimeout(1200);
  await p.evaluate(() => { ['takeoff','enroute'].forEach(ph => (ST.workout[ph] || []).forEach(e => { ST.expanded[e.id] = true; })); renderPage(); }); await p.waitForTimeout(800);
  const box = p.locator('input.set-inp[placeholder="kg"]').first();
  const have = await box.count();
  check('set weight box asks for kg', have > 0, have);
  if (have) {
    await box.scrollIntoViewIfNeeded(); await box.fill('62.5'); await p.waitForTimeout(300);
    const stored = await p.evaluate(() => { for (const k in ST.sets) for (const s of ST.sets[k] || []) if (s && s.weight) return s.weight; return null; });
    check('62.5 kg stored as 137.79 lb', stored === '137.79', stored);
    await p.evaluate(() => renderPage()); await p.waitForTimeout(600);
    const shown = await p.locator('input.set-inp[placeholder="kg"]').first().inputValue();
    check('redrawn box still reads 62.5', shown === '62.5', shown);
    await p.locator('input.set-inp[placeholder="kg"]').first().scrollIntoViewIfNeeded(); await p.screenshot({ path: S + '/units-workout.png' });
    await p.evaluate(() => { ST.units = { weight: 'lb', water: 'L' }; renderPage(); }); await p.waitForTimeout(500);
    const lbShown = await p.locator('input.set-inp[placeholder="lb"]').first().inputValue();
    check('same set in pounds reads 137.79', lbShown === '137.79', lbShown);
  }
  // put the test account back
  await p.evaluate(async () => { ST.sets = {}; ST.workout = null; await setUnit('weight', 'lb'); await setUnit('water', 'L'); ST.waterIn = 0; ST.waterInRaw = ''; persistDailyInputs(); try { localStorage.removeItem('fcf_active_workout'); } catch (e) {} });
  await p.waitForTimeout(1500);
  check('no page errors', errs.length === 0, errs);
  await b.close(); console.log(fail ? fail + ' FAILED' : 'ALL PASSED');
})();
