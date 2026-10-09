// One coaching card on Today, never two.
// Reported: the rule-based card said "a full session now" while the AI coach
// card said "dial it back". Pro members get the AI coach in that spot, free
// members the rule-based card, and the rule card returns if the coach fails.
//   npm run e2e:coachcard        (BASE_URL defaults to the live site)
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const BASE = process.env.BASE_URL || 'https://flightcrew.fit';
const OUT = process.env.SHOT_DIR || '';
let fail = 0;
const check = (name, cond, got) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  got ' + JSON.stringify(got))); if (!cond) fail++; };

async function open(browser, coach, state) {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'en-US', timezoneId: 'America/Phoenix', ...(state ? { storageState: state } : {}) });
  await ctx.route('**/functions/v1/fcf-ai-coach', async r => {
    let mode = ''; try { mode = JSON.parse(r.request().postData() || '{}').mode; } catch (e) {}
    if (mode === 'fatigue_calibration' && coach === 'fail') return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error' }) });
    const text = mode === 'fatigue_calibration' ? 'Dial it back tonight, just light movement if anything.' : 'stub';
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text, cached: false }) });
  });
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
  await page.evaluate(() => { if (ST.tab !== 'today') switchTab('today'); });
  await page.waitForTimeout(2500);
  return { ctx, page };
}
const shown = id => `(() => { const el = document.getElementById('${id}'); return !!el && getComputedStyle(el).display !== 'none' && el.offsetParent !== null; })()`;
const look = page => page.evaluate(`({ pro: isPro(), coach: ${shown('aiFatigueCard')}, rule: ${shown('ruleBriefCard')}, coachText: (document.getElementById('aiFatigueText') || {}).textContent || '',
  coachButton: !!document.querySelector('#aiFatigueCard button'), coachCount: document.querySelectorAll('#aiFatigueCard').length, ruleCount: document.querySelectorAll('#ruleBriefCard').length })`);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  let { ctx, page } = await open(browser, 'ok');
  console.log('version ' + await page.evaluate(() => FCF_VERSION) + ' at ' + BASE);
  const state = await ctx.storageState();
  let s = await look(page);
  check('A1. Pro: the AI coach card is shown and the rule card is not', s.pro && s.coach && !s.rule && /Dial it back/.test(s.coachText), s);
  check('A2. Pro: one of each in the page, no duplicates', s.coachCount === 1 && s.ruleCount === 1, s);
  check('A3. Pro: the coach card carries a Start a workout button', s.coachButton, s);
  if (OUT) await page.screenshot({ path: path.join(OUT, 'one-card-pro.png') });
  // A fresh Oura sync rebuilds the top section: still one card.
  await page.evaluate(() => updateOuraTopSection()); await page.waitForTimeout(500);
  s = await look(page);
  check('A4. after an Oura refresh, still only the coach card', s.coach && !s.rule && s.coachCount === 1, s);
  check('A5. no page errors', page.__errs.length === 0, page.__errs);
  await ctx.close();

  ({ ctx, page } = await open(browser, 'fail', state));
  s = await look(page);
  check('B. Pro, coach unavailable: the rule card comes back so the spot is never empty', s.pro && !s.coach && s.rule, s);
  await ctx.close();

  ({ ctx, page } = await open(browser, 'ok', state));
  await page.evaluate(() => { window.isPro = () => false; renderPage(); }); await page.waitForTimeout(800);
  s = await look(page);
  check('C. free member: the rule card only, no AI coach card at all', !s.pro && s.rule && s.coachCount === 0, s);
  await ctx.close();

  await browser.close();
  console.log(fail ? '\n' + fail + ' check(s) FAILED' : '\nAll checks passed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
