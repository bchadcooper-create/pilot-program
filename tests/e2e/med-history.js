// Past-day medication logging (owner, Nov 4 2026). Adds a test medication
// in memory only, checks off yesterday's dose from the Trends strip, checks
// the row and its time stamp, clears it, and removes every test row.
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
  const MED = 'med_e2ehist';
  await p.evaluate(async id => {
    await SB.from('medication_logs').delete().eq('user_id', ST.user.id).eq('med_id', id);
    ST.medications = [{ id, name: 'Test Vitamin D', dose: 2000, unit: 'IU', times: ['08:00'], days: null, remind: false, notes: '' }];
    switchTab('trends');
  }, MED);
  await p.waitForSelector('#medHistoryCard', { timeout: 20000 });
  check('strip shows under the training calendar', !!(await p.locator('#medHistoryCard').count()));
  const y = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); return localDateStr(d); });
  await p.evaluate(iso => openMedDay(iso), y); await p.waitForTimeout(300);
  check('day editor lists the scheduled dose', /SCHEDULED THIS DAY/.test(await p.textContent('#modalRoot')) && /Test Vitamin D/.test(await p.textContent('#modalRoot')));
  check('next-day arrow works from yesterday (to today)', await p.locator('#modalRoot button', { hasText: '›' }).evaluate(e => getComputedStyle(e).pointerEvents !== 'none'));
  await p.locator('#modalRoot .fb', { hasText: 'Test Vitamin D' }).click(); await p.waitForTimeout(1500);
  await p.screenshot({ path: S + '/med-01-day.png' });
  const row = await p.evaluate(async ([id, iso]) => (await SB.from('medication_logs').select('date,time,taken_at').eq('user_id', ST.user.id).eq('med_id', id)).data, [MED, y]);
  check('row saved for yesterday', row && row.length === 1 && row[0].date === y && row[0].time === '08:00', row);
  const stamp = row && row[0] && new Date(row[0].taken_at);
  check('time stamp is yesterday at 08:00 local', stamp && (await p.evaluate(t => { const d = new Date(t); return localDateStr(d) + ' ' + d.getHours() + ':' + d.getMinutes(); }, row[0].taken_at)) === y + ' 8:0', row && row[0].taken_at);
  await p.locator('#modalRoot button', { hasText: 'Done' }).click(); await p.waitForTimeout(400);
  const cell = await p.evaluate(() => [...document.querySelectorAll('#medScroll > div')].slice(-2, -1)[0].innerText);
  check('strip shows 1/1 for yesterday', /1\/1/.test(cell), cell);
  await p.locator('#medHistoryCard').scrollIntoViewIfNeeded(); await p.locator('#medHistoryCard').screenshot({ path: S + '/med-02-strip.png' });
  // Reload the range from the server: still there.
  await p.evaluate(() => loadMedLogRange().then(refreshMedHistoryStrip)); await p.waitForTimeout(800);
  check('survives a reload', /1\/1/.test(await p.evaluate(() => [...document.querySelectorAll('#medScroll > div')].slice(-2, -1)[0].innerText)));
  // Clear it.
  await p.evaluate(iso => openMedDay(iso), y); await p.waitForTimeout(200);
  await p.locator('#modalRoot .fb', { hasText: 'Test Vitamin D' }).click(); await p.waitForTimeout(1500);
  const after = await p.evaluate(async id => (await SB.from('medication_logs').select('date').eq('user_id', ST.user.id).eq('med_id', id)).data, MED);
  check('clearing deletes the row', after && after.length === 0, after);
  // Today link opens yesterday.
  await p.evaluate(() => { closeModal(); switchTab('today'); }); await p.waitForTimeout(1200);
  const link = p.locator('button', { hasText: 'Log a dose from an earlier day' });
  check('Today card has the link', !!(await link.count()));
  if (await link.count()) { await link.click(); await p.waitForTimeout(1200); }
  check('link opens yesterday', (await p.textContent('#modalRoot')).includes(await p.evaluate(iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }), y)));
  await p.evaluate(async id => { await SB.from('medication_logs').delete().eq('user_id', ST.user.id).eq('med_id', id); }, MED);
  check('no page errors', !errs.length, errs);
  await b.close(); console.log(fail ? 'FAILED ' + fail : 'ALL PASS'); process.exit(fail ? 1 : 0);
})();
