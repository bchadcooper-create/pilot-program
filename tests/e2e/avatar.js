// Profile picture: add one on Pilot Profile, see it on the crew feed card and
// the crew profile, then remove it. Runs as e2e-bot and cleans up after itself.
const { chromium, devices } = require('playwright');
const fs = require('fs'); const S = process.env.SHOTS_DIR || __dirname;
const env = {}; for (const l of fs.readFileSync(__dirname + '/.env', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
let fail = 0; const check = (n, c, g) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  got ' + JSON.stringify(g))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ ...devices['iPhone 14'], timezoneId: 'America/Phoenix', serviceWorkers: 'block' });
  await ctx.route('**/functions/v1/fcf-ai-coach', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'stub', cached: false }) }));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (/profile picture/i.test(m.text())) console.log('CONSOLE', m.text()); });
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
  const setup = await p.evaluate(async () => {
    await loadCrewProfile();
    if (!crewIsMember()) { await SB.from('crew_profiles').insert({ user_id: ST.user.id, callsign: 'e2ebot', base: 'PHX', visibility: 'everyone', auto_post: true, rules_accepted_at: new Date().toISOString() }); await loadCrewProfile(); }
    if (ST.avatarPath) await saveAvatarPath(null);
    const row = { user_id: ST.user.id, session_key: 'e2e-avatar-' + Date.now(), kind: 'workout', title: 'Avatar test', env: 'hotel_gym', sets_logged: 3, performed_at: new Date().toISOString(), visibility: 'private' };
    const { data, error } = await SB.from('crew_activities').insert(row).select('id').single();
    return { member: crewIsMember(), id: data && data.id, err: error && error.message };
  });
  check('bot is a crew member with a fresh post', setup.member && !!setup.id, setup);
  await p.evaluate(() => switchTab('profile')); await p.waitForTimeout(1000);
  check('Pilot Profile offers "Add a picture"', !!(await p.locator('button', { hasText: 'Add a picture' }).count()));
  await p.locator('button', { hasText: 'Add a picture' }).first().scrollIntoViewIfNeeded();
  await p.screenshot({ path: S + '/avatar-01-empty.png' });
  // A 3000x2000 picture: the client crops the centre square and shrinks to 400.
  const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; const g = c.getContext('2d'); g.fillStyle = '#b33'; g.fillRect(0, 0, 3000, 2000); g.fillStyle = '#26c'; g.fillRect(500, 0, 2000, 2000); g.fillStyle = '#fff'; g.font = 'bold 900px sans-serif'; g.fillText('E2', 900, 1300); return c.toDataURL('image/png'); });
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.locator('button', { hasText: 'Add a picture' }).first().click()]);
  await chooser.setFiles({ name: 'me.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') });
  try { await p.waitForFunction(() => !!ST.avatarPath, null, { timeout: 30000 }); } catch (e) { console.log('upload wait timed out; page says:', (await p.evaluate(() => document.body.innerText)).slice(-200)); }
  await p.waitForTimeout(1200);
  const saved = await p.evaluate(async () => { const { data } = await SB.from('crew_profiles').select('avatar_path').eq('user_id', ST.user.id).maybeSingle(); const pr = await dbGetProfile(); return { st: ST.avatarPath, crew: data && data.avatar_path, profile: pr && pr.avatarPath }; });
  check('path saved in the profile and on the crew profile', !!saved.st && saved.st === saved.crew && saved.st === saved.profile, saved);
  const img = p.locator('img[src*="/avatar/"]').first();
  check('picture shows on Pilot Profile', !!(await img.count()));
  const nat = await img.evaluate(async e => { if (!e.complete) await new Promise(r => { e.onload = r; e.onerror = r; }); return [e.naturalWidth, e.naturalHeight]; });
  check('served picture is a 400 px square', nat[0] === 400 && nat[1] === 400, nat);
  await img.scrollIntoViewIfNeeded(); await p.screenshot({ path: S + '/avatar-02-profile.png' });
  await p.evaluate(() => { ST.ranksSeg = 'crew'; switchTab('leaderboard'); }); await p.waitForTimeout(800);
  await p.evaluate(() => crewGo('profile', ST.user.id)); await p.waitForTimeout(3000);
  check('picture shows on the crew profile header', !!(await p.locator('#crewProfileHead img[src*="/avatar/"]').count()));
  check('picture shows on the post card', !!(await p.locator('#crewCard_' + setup.id + ' img[src*="/avatar/"]').count()));
  await p.screenshot({ path: S + '/avatar-03-crew.png' });
  await p.evaluate(() => crewGo('settings')); await p.waitForTimeout(800);
  check('Crew Settings shows Change and Remove', !!(await p.locator('button', { hasText: /^Change$/ }).count()) && !!(await p.locator('button', { hasText: /^Remove$/ }).count()));
  const oldPath = saved.st;
  await p.locator('button', { hasText: /^Remove$/ }).first().click(); await p.waitForTimeout(500);
  const conf = p.locator('#modalRoot button', { hasText: /^Remove$/ }).last(); if (await conf.count()) await conf.click();
  await p.waitForFunction(() => !ST.avatarPath, null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const after = await p.evaluate(async old => { const { data } = await SB.from('crew_profiles').select('avatar_path').eq('user_id', ST.user.id).maybeSingle(); const r = await fetch(crewPhotoUrl(old) + '?x=' + Date.now(), { cache: 'no-store' }); return { st: ST.avatarPath, crew: data && data.avatar_path, fileStatus: r.status }; }, oldPath);
  check('removed everywhere', !after.st && !after.crew, after);
  check('the old file is gone from storage', after.fileStatus >= 400, after);
  await p.evaluate(async id => { await SB.from('crew_activities').delete().eq('id', id); }, setup.id);
  check('no page errors', errs.length === 0, errs);
  await b.close(); console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
})();
