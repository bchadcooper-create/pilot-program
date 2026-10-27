// Offline boot: a signed-in member whose access token has expired opens the
// app with no network. Expected: the app, not the signed-out landing page.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const env = {}; for (const l of fs.readFileSync('/home/claude/pilot-program/tests/e2e/.env','utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g,''); }
let fail = 0; const check = (n, c, g) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  got ' + JSON.stringify(g))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ ...devices['iPhone 14'], timezoneId: 'America/Phoenix' });
  await ctx.route('**/functions/v1/fcf-ai-coach', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'stub', cached: false }) }));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); let logOn = false; p.on('console', m => { if (logOn && m.type() !== 'error') console.log('CONSOLE', m.type(), m.text().slice(0, 200)); });
  const base = process.env.BASE_URL || 'https://flightcrew.fit';
  await p.goto(base + '/?e2e=' + Date.now(), { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
  const acct = p.getByText(/I HAVE AN ACCOUNT/i).first(); if (await acct.count()) await acct.click();
  await p.waitForSelector('#auth_email', { timeout: 15000 });
  await p.fill('#auth_email', env.E2E_EMAIL); await p.fill('#auth_pass', env.E2E_PASSWORD);
  await p.locator('button', { hasText: /Sign In/ }).last().click();
  await p.waitForFunction(() => typeof ST !== 'undefined' && !!ST.user, null, { timeout: 25000 });
  await p.evaluate(() => { if (!ST.disclaimerAccepted && typeof acceptDisclaimer === 'function') acceptDisclaimer(); });
  await p.waitForFunction(() => { try { return _bootRenderDone; } catch (e) { return false; } }, null, { timeout: 30000 });
  check('signed in online', await p.evaluate(() => ST.authed));
  // Age the token, then cut every network call except the page itself.
  await p.evaluate(() => { const k = 'sb-dnxkydxbyihgsictbzjz-auth-token'; const s = JSON.parse(localStorage.getItem(k)); s.expires_at = Math.floor(Date.now() / 1000) - 600; localStorage.setItem(k, JSON.stringify(s)); });
  await p.waitForTimeout(4000); // let the service worker finish installing
  const swReady = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active); });
  console.log('service worker active:', swReady);
  if (process.env.MODE === 'airplane') { await ctx.setOffline(true); } else { await ctx.route(/supabase\.co|ouraring|googleapis/, r => r.abort('internetdisconnected')); }
  logOn = true; await p.goto(base + '/?e2e=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof ST !== 'undefined' && (ST.authed || ST.authOffline !== undefined || document.querySelector('#auth_email')), null, { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(3000);
  const t0 = Date.now(); await p.waitForFunction(() => { try { return _bootRenderDone; } catch (e) { return false; } }, null, { timeout: 60000 }).catch(() => {}); console.log('BOOT ms after auth wait', Date.now() - t0);
  console.log('STATE', JSON.stringify(await p.evaluate(() => ({ user: !!ST.user, authed: ST.authed, landing: ST.showLanding, init: _appInitStarted }))));
  console.log('DEBUG', JSON.stringify(await p.evaluate(async () => { const r = await SB.auth.getSession(); return { authed: ST.authed, authOffline: ST.authOffline, online: navigator.onLine, err: r.error && { name: r.error.name, msg: r.error.message }, sess: !!r.data.session, stored: !!localStorage.getItem('sb-dnxkydxbyihgsictbzjz-auth-token') }; })));
  const txt = await p.textContent('#mainPage');
  const landing = /I HAVE AN ACCOUNT|Create account|Sign In/i.test(txt) && !(await p.evaluate(() => ST.authed));
  check('offline with a stale token: app opens, not the landing page', await p.evaluate(() => ST.authed) && !landing, txt.slice(0, 120));
  await p.screenshot({ path: (process.env.SHOTS_DIR || __dirname) + '/offline-boot.png' });
  // Back online: the token refreshes and queries work again.
  if (process.env.MODE === 'airplane') {
    await ctx.setOffline(false); await p.waitForTimeout(4000);
    const back = await p.evaluate(async () => { const r = await SB.auth.getSession(); const q = await SB.from('user_profiles').select('user_id').eq('user_id', ST.user.id).maybeSingle(); return { sess: !!r.data.session, fresh: !!r.data.session && r.data.session.expires_at * 1000 > Date.now(), q: !q.error, authOffline: ST.authOffline }; });
    check('back online: session refreshed and queries work', back.sess && back.fresh && back.q && !back.authOffline, back);
  }
  check('no page errors', !errs.length, errs);
  await b.close(); console.log(fail ? 'FAILED ' + fail : 'ALL PASS'); process.exit(fail ? 1 : 0);
})();
