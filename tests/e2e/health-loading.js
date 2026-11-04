// Today's top card while health data loads (owner, Nov 4 2026): a loading
// card first, the no-data card only after the Oura sync finds nothing or
// after 5 seconds, and the real tiles when the sync brings today's scores.
const { chromium, devices } = require('playwright');
const fs = require('fs'); const S = process.env.SHOTS_DIR || __dirname;
const env = {}; for (const l of fs.readFileSync('/home/claude/pilot-program/tests/e2e/.env','utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g,''); }
let fail = 0; const check = (n, c, g) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  got ' + JSON.stringify(g))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ ...devices['iPhone 14'], timezoneId: 'America/Phoenix' });
  await ctx.route('**/functions/v1/fcf-ai-coach', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'stub', cached: false }) }));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto((process.env.BASE_URL || 'https://flightcrew.fit') + '/?e2e=' + Date.now(), { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
  const acct = p.getByText(/I HAVE AN ACCOUNT/i).first(); if (await acct.count()) await acct.click();
  await p.waitForSelector('#auth_email', { timeout: 15000 });
  await p.fill('#auth_email', env.E2E_EMAIL); await p.fill('#auth_pass', env.E2E_PASSWORD);
  await p.locator('button', { hasText: /Sign In/ }).last().click();
  await p.waitForFunction(() => typeof ST !== 'undefined' && !!ST.user, null, { timeout: 25000 });
  await p.evaluate(() => { if (!ST.disclaimerAccepted && typeof acceptDisclaimer === 'function') acceptDisclaimer(); });
  await p.waitForFunction(() => { try { return _bootRenderDone; } catch (e) { return false; } }, null, { timeout: 30000 });
  const card = () => p.evaluate(() => (document.getElementById('noRingCard') || {}).innerText || (document.getElementById('ouraTopSection') || {}).innerText || '');
  // Pretend Oura is connected, last data from yesterday, app just opened.
  const setup = (syncMs, today) => p.evaluate(([ms, withToday]) => {
    const y = localDateStr(new Date(Date.now() - 86400000)), t = localDateStr(new Date());
    ST.ouraConnected = true; ST.ouraAccessToken = 'test'; ST.ouraData = { date: y, readiness_score: 70, sleep_score: 70 }; ST.ouraScore = 70;
    _healthLoadStartedAt = Date.now(); _ouraFirstSyncDone = false; clearTimeout(_healthLoadTimer); _healthLoadTimer = null;
    window.ouraFetch = async (path) => { await new Promise(r => setTimeout(r, ms)); const day = withToday ? t : y; return { data: /readiness/.test(path) ? [{ day, score: 82 }] : /sleep/.test(path) ? [{ day, score: 80 }] : [{ day, score: 75, steps: 4000 }] }; };
    window.syncOuraWorkouts = async () => {};
    switchTab('today');
    if (ms >= 0) setTimeout(() => syncOuraData().catch(() => {}), 10);
  }, [syncMs, today]);

  // A: sync takes 2 s and finds nothing for today.
  await setup(2000, false); await p.waitForTimeout(300);
  check('A: loading card first', /Loading last night/.test(await card()), await card());
  await p.screenshot({ path: S + '/health-01-loading.png' });
  await p.waitForTimeout(2500);
  check('A: no-data card after the sync finds nothing', /No ring data for last night/.test(await card()), await card());
  await p.screenshot({ path: S + '/health-02-nodata.png' });

  // B: sync never finishes: no-data card after 5 s.
  await setup(-1, false); await p.waitForTimeout(300);
  check('B: loading card while waiting', /Loading last night/.test(await card()));
  await p.waitForTimeout(4000);
  check('B: still loading at 4.3 s', /Loading last night/.test(await card()));
  await p.waitForTimeout(1200);
  check('B: no-data card at 5 s', /No ring data for last night/.test(await card()), await card());

  // C: sync brings today's scores: tiles, never the no-data card.
  await setup(1500, true); await p.waitForTimeout(300);
  check('C: loading card first', /Loading last night/.test(await card()));
  await p.waitForTimeout(2000);
  const txt = await p.evaluate(() => document.getElementById('ouraTopSection')?.innerText || '');
  check('C: readiness tiles after the sync', /READINESS/.test(txt) && !/No ring data/.test(txt), txt.slice(0, 160));
  check('no page errors', !errs.length, errs);
  await b.close(); console.log(fail ? 'FAILED ' + fail : 'ALL PASS'); process.exit(fail ? 1 : 0);
})();
