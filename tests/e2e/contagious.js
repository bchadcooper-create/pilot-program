// Contagious plan, small items (Nov 4 2026): Founding Crew chip, monthly
// base leader in Find and on the winner's profile, and "Send to a crew
// member" buttons on the medical tools and the public calculator.
// Needs e2e-bot (base PHX) to have founding_crew = true, set by SQL as the
// service role before the run (the app cannot set it). Reset it after.
const { chromium, devices } = require('playwright');
const fs = require('fs'); const S = process.env.SHOTS_DIR || __dirname;
const env = {}; for (const l of fs.readFileSync('/home/claude/pilot-program/tests/e2e/.env','utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g,''); }
let fail = 0; const check = (n, c, g) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  got ' + JSON.stringify(g))); if (!c) fail++; };
(async () => {
  const base = process.env.BASE_URL || 'https://flightcrew.fit';
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ ...devices['iPhone 14'], timezoneId: 'America/Phoenix' });
  await ctx.route('**/functions/v1/fcf-ai-coach', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'stub', cached: false }) }));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(base + '/?e2e=' + Date.now(), { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
  const acct = p.getByText(/I HAVE AN ACCOUNT/i).first(); if (await acct.count()) await acct.click();
  await p.waitForSelector('#auth_email', { timeout: 15000 });
  await p.fill('#auth_email', env.E2E_EMAIL); await p.fill('#auth_pass', env.E2E_PASSWORD);
  await p.locator('button', { hasText: /Sign In/ }).last().click();
  await p.waitForFunction(() => typeof ST !== 'undefined' && !!ST.user, null, { timeout: 25000 });
  await p.evaluate(() => { if (!ST.disclaimerAccepted && typeof acceptDisclaimer === 'function') acceptDisclaimer(); });
  await p.waitForFunction(() => { try { return _bootRenderDone; } catch (e) { return false; } }, null, { timeout: 30000 });
  // A shared workout this month so the bot has a feed post.
  const actId = await p.evaluate(async () => { await loadCrewProfile(); const { data } = await SB.from('crew_activities').insert({ user_id: ST.user.id, session_key: 'e2e-contagious-' + Date.now(), kind: 'workout', title: 'Founding test', env: 'comm', sets_logged: 12, performed_at: new Date().toISOString(), visibility: 'everyone' }).select('id').single(); return data && data.id; });
  await p.evaluate(() => { ST.ranksSeg = 'crew'; switchTab('leaderboard'); crewGo('profile', ST.user.id); }); await p.waitForTimeout(3000);
  const head = await p.textContent('#crewProfileHead');
  check('profile header shows the Founding Crew chip', /FOUNDING CREW/.test(head), head.slice(0, 120));
  check('feed card shows the chip too', /FOUNDING CREW/.test(await p.textContent('#crewCard_' + actId)));
  await p.locator('#crewProfileHead').screenshot({ path: S + '/contagious-01-profile.png' });
  await p.evaluate(() => crewGo('find')); await p.waitForTimeout(3000);
  const lead = await p.textContent('#crewBaseLeaders');
  check('Find shows the monthly base leader', /winner|Leading/.test(lead), lead);
  await p.locator('#crewBaseLeaders').screenshot({ path: S + '/contagious-02-leaders.png' }).catch(() => {});
  // Medical tools
  await p.evaluate(() => { ST.medicalView = 'home'; switchTab('medical'); }); await p.waitForTimeout(800);
  const accept = p.locator('button', { hasText: 'I understand' }); if (await accept.count()) { await accept.click(); await p.waitForTimeout(500); }
  check('medical home has the send-to-crew button', !!(await p.locator('button', { hasText: 'Send the free medical date calculator' }).count()));
  const shared = await p.evaluate(async () => { let got = null; Object.defineProperty(navigator, 'share', { value: o => { got = o; return Promise.resolve(); }, configurable: true }); shareCrewLink(MED_CALC_URL); return got && got.url; });
  check('share hands over the public calculator link only', shared === 'https://flightcrew.fit/tools/faa-medical-expiration-calculator.html', shared);
  await p.evaluate(() => medicalSetView('meds')); await p.waitForTimeout(400);
  check('medication check has the send-to-crew button', !!(await p.locator('button', { hasText: 'Send the medication checker' }).count()));
  // Public calculator page
  const q = await ctx.newPage();
  await q.goto(base + '/tools/faa-medical-expiration-calculator.html?e2e=' + Date.now(), { waitUntil: 'load' });
  check('public calculator has the share button', !!(await q.locator('#shareBtn').count()));
  // Clean up
  await p.evaluate(async id => { await SB.from('crew_activities').delete().eq('id', id); }, actId);
  check('no page errors', !errs.length, errs);
  await b.close(); console.log(fail ? 'FAILED ' + fail : 'ALL PASS'); process.exit(fail ? 1 : 0);
})();
