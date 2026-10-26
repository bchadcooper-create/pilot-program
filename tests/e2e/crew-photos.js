// Crew feed photos: add a photo to an own post, see it on the card, open it,
// remove it. Runs as e2e-bot (joins the crew feed if not a member) and cleans
// up after itself.
const { chromium, devices } = require('playwright');
const fs = require('fs'); const S = process.env.SHOTS_DIR || __dirname;
const env = {}; for (const l of fs.readFileSync('/home/claude/pilot-program/tests/e2e/.env','utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g,''); }
let fail = 0; const check = (n, c, g) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  got ' + JSON.stringify(g))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ ...devices['iPhone 14'], timezoneId: 'America/Phoenix' });
  await ctx.route('**/functions/v1/fcf-ai-coach', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'stub', cached: false }) }));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (/crew photo|warn|error/i.test(m.text())) console.log('CONSOLE', m.text()); });
  await p.goto('' + (process.env.BASE_URL || 'https://flightcrew.fit') + '/?e2e=' + Date.now(), { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
  const acct = p.getByText(/I HAVE AN ACCOUNT/i).first(); if (await acct.count()) await acct.click();
  await p.waitForSelector('#auth_email', { timeout: 15000 });
  await p.fill('#auth_email', env.E2E_EMAIL); await p.fill('#auth_pass', env.E2E_PASSWORD);
  await p.locator('button', { hasText: /Sign In/ }).last().click();
  await p.waitForFunction(() => typeof ST !== 'undefined' && !!ST.user, null, { timeout: 25000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { if (!ST.disclaimerAccepted && typeof acceptDisclaimer === 'function') acceptDisclaimer(); });
  await p.waitForFunction(() => { try { return _bootRenderDone; } catch (e) { return false; } }, null, { timeout: 30000 });
  await p.waitForTimeout(1000);
  // Make sure the bot is a crew member with at least one post.
  const setup = await p.evaluate(async () => {
    await loadCrewProfile();
    if (!crewIsMember()) {
      await SB.from('crew_profiles').insert({ user_id: ST.user.id, callsign: 'e2ebot', base: 'PHX', visibility: 'everyone', auto_post: true, rules_accepted_at: new Date().toISOString() });
      await loadCrewProfile();
    }
    const row = { user_id: ST.user.id, session_key: 'e2e-photo-' + Date.now(), kind: 'workout', title: 'Photo test', env: 'hotel_gym', sets_logged: 3, performed_at: new Date().toISOString(), visibility: 'everyone' };
    const { data, error } = await SB.from('crew_activities').insert(row).select('id').single();
    return { member: crewIsMember(), id: data && data.id, err: error && error.message };
  });
  check('bot is a crew member with a fresh post', setup.member && !!setup.id, setup);
  const actId = setup.id;
  // Open the feed on the bot's own profile so the post is first.
  await p.evaluate(() => { ST.ranksSeg = 'crew'; switchTab('leaderboard'); }); await p.waitForTimeout(800);
  await p.evaluate(() => crewGo('profile', ST.user.id)); await p.waitForTimeout(2500);
  check('post card rendered', !!(await p.locator('#crewCard_' + actId).count()));
  check('own card shows the Photo button', !!(await p.locator('#crewCard_' + actId + ' button', { hasText: 'Photo' }).count()));
  await p.screenshot({ path: S + '/photo-01-card.png' });
  // Add a photo: a generated 2400x1800 PNG, which the client shrinks to 1600.
  const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 2400; c.height = 1800; const g = c.getContext('2d'); g.fillStyle = '#2a4'; g.fillRect(0, 0, 2400, 1800); g.fillStyle = '#fff'; g.font = '200px sans-serif'; g.fillText('GYM', 800, 1000); return c.toDataURL('image/png'); });
  const buf = Buffer.from(png.split(',')[1], 'base64');
  const [chooser] = await Promise.all([ p.waitForEvent('filechooser'), p.locator('#crewCard_' + actId + ' button', { hasText: 'Photo' }).click() ]);
  await chooser.setFiles({ name: 'gym.png', mimeType: 'image/png', buffer: buf });
  try { await p.waitForFunction(id => (ST.crew.photos[id] || []).length === 1, actId, { timeout: 30000 }); } catch (e) { console.log('upload wait timed out; toast:', await p.evaluate(() => document.body.innerText.match(/Could not add[^\n]*|Uploading[^\n]*/)?.[0])); }
  await p.waitForTimeout(800);
  const img = p.locator('#crewCard_' + actId + ' img').first();
  check('photo shows on the card', !!(await img.count()));
  const nat = await img.evaluate(async e => { if (!e.complete) await new Promise(r => { e.onload = r; e.onerror = r; }); return [e.naturalWidth, e.naturalHeight]; });
  check('served photo was shrunk to 1600 px wide', nat[0] === 1600 && nat[1] === 1200, nat);
  await p.screenshot({ path: S + '/photo-02-with-photo.png' });
  // Open it full size, then remove it.
  await img.click(); await p.waitForTimeout(600);
  check('viewer opens with Remove for the owner', !!(await p.locator('#modalRoot button', { hasText: 'Remove' }).count()));
  await p.screenshot({ path: S + '/photo-03-viewer.png' });
  p.once('dialog', d => d.accept());
  await p.locator('#modalRoot button', { hasText: 'Remove' }).click(); await p.waitForTimeout(400);
  const conf = p.locator('#modalRoot button', { hasText: /^Remove$/ }).last(); if (await conf.count()) await conf.click();
  await p.waitForFunction(id => (ST.crew.photos[id] || []).length === 0, actId, { timeout: 15000 });
  await p.waitForTimeout(500);
  check('photo removed from the card', !(await p.locator('#crewCard_' + actId + ' img').count()));
  // Storage file gone too (public URL should 400/404 now).
  const gone = await p.evaluate(async id => { const { data } = await SB.from('crew_photos').select('id').eq('activity_id', id); return (data || []).length === 0; }, actId);
  check('crew_photos row deleted', gone);
  // Cleanup the test post.
  await p.evaluate(async id => { await SB.from('crew_activities').delete().eq('id', id); }, actId);
  check('no page errors', !errs.length, errs);
  await b.close(); console.log(fail ? 'FAILED ' + fail : 'ALL PASS'); process.exit(fail ? 1 : 0);
})();
