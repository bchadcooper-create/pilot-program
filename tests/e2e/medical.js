const { chromium, devices } = require('/home/claude/pilot-program/node_modules/playwright');
const fs = require('fs'); const S = process.env.SHOTS_DIR || __dirname;
const env = {}; for (const l of fs.readFileSync('/home/claude/pilot-program/tests/e2e/.env','utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g,''); }
let fail = 0; const check = (n, c, g) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  got ' + JSON.stringify(g))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ ...devices['iPhone 14'], timezoneId: 'America/Phoenix' });
  await ctx.route('**/functions/v1/fcf-ai-coach', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'stub', cached: false }) }));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('' + (process.env.BASE_URL || 'https://flightcrew.fit') + '/?e2e=' + Date.now(), { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
  const acct = p.getByText(/I HAVE AN ACCOUNT/i).first(); if (await acct.count()) await acct.click();
  await p.waitForSelector('#auth_email', { timeout: 15000 });
  await p.fill('#auth_email', env.E2E_EMAIL); await p.fill('#auth_pass', env.E2E_PASSWORD);
  await p.locator('button', { hasText: /Sign In/ }).last().click();
  await p.waitForFunction(() => typeof ST !== 'undefined' && !!ST.user, null, { timeout: 25000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { if (!ST.disclaimerAccepted && typeof acceptDisclaimer === 'function') acceptDisclaimer(); });
  await p.waitForFunction(() => { try { return _bootRenderDone; } catch (e) { return false; } }, null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  // Menu: not offered to the test account.
  await p.evaluate(() => switchTab('more')); await p.waitForTimeout(500);
  check('menu hides FAA Medical for a non-owner', !(await p.locator('text=FAA Medical').count()));
  // Grant inside the page for the walk-through.
  await p.evaluate(() => { MEDICAL_OWNER_IDS.push(ST.user.id); localStorage.removeItem('fcf_medical_v1'); ST.medical = null; switchTab('more'); }); await p.waitForTimeout(500);
  check('menu shows FAA Medical for the owner', !!(await p.locator('text=FAA Medical').count()));
  await p.locator('text=FAA Medical').first().click(); await p.waitForTimeout(600);
  check('disclaimer first', /never decides whether you pass/.test(await p.textContent('#mainPage')));
  await p.screenshot({ path: S + '/01-disclaimer.png' });
  await p.locator('button', { hasText: 'I understand' }).click(); await p.waitForTimeout(500);
  await p.screenshot({ path: S + '/02-home.png' });
  // Certificate
  await p.evaluate(() => medicalSetView('cert')); await p.waitForTimeout(400);
  await p.fill('#medExam', '2026-06-10'); await p.fill('#medDob', '1980-09-01'); await p.evaluate(() => document.getElementById('medHadEcg').checked = true); await p.fill('#medLastEcg', '2026-06-10');
  await p.locator('button', { hasText: 'Save on this phone' }).click(); await p.waitForTimeout(600);
  const certTxt = await p.textContent('#mainPage');
  check('privileges shown to end of month', /2026-12-31/.test(certTxt) && /2027-06-30/.test(certTxt) && /2028-06-30/.test(certTxt), certTxt.slice(0, 200));
  check('ECG not expected (last one at the exam)', /No ECG expected/.test(certTxt));
  await p.screenshot({ path: S + '/03-cert.png', fullPage: true });
  // Seat: first officer. FO options appear only for that seat.
  check('FO options hidden before choosing', await p.locator('#medFoOpts').evaluate(e => e.style.display === 'none'));
  await p.selectOption('#medSeat', 'fo'); await p.waitForTimeout(200);
  check('FO options shown for first officer', await p.locator('#medFoOpts').evaluate(e => e.style.display !== 'none'));
  await p.locator('button', { hasText: 'Save on this phone' }).click(); await p.waitForTimeout(600);
  const foTxt = await p.textContent('#mainPage');
  check('FO: seat needs second class', /Second-class privileges/.test(foTxt) && /61\.23\(a\)\(2\)\(i\)/.test(foTxt), foTxt.slice(0, 300));
  check('FO: grounded date is the second-class end', /keep flying on second-class privileges until 2027-06-30/.test(foTxt));
  check('FO: ECG only for first-class privileges', /a second-class exam has no ECG/.test(foTxt));
  await p.screenshot({ path: S + '/03b-cert-fo.png', fullPage: true });
  await p.evaluate(() => medicalSetView('home')); await p.waitForTimeout(300);
  check('home tile shows the second-class date', /Second-class \(commercial\) privileges end in \d+ days \(2027-06-30\)/.test(await p.textContent('#mainPage')));
  // Captain keys on the first-class date.
  await p.evaluate(() => medicalSetView('cert')); await p.waitForTimeout(300);
  await p.selectOption('#medSeat', 'capt'); await p.locator('button', { hasText: 'Save on this phone' }).click(); await p.waitForTimeout(600);
  await p.evaluate(() => medicalSetView('home')); await p.waitForTimeout(300);
  check('captain: home tile shows the first-class date', /First-class \(ATP\) privileges ended \d+ days ago|First-class \(ATP\) privileges end in \d+ days \(2026-12-31\)/.test(await p.textContent('#mainPage')));
  // Numbers
  await p.evaluate(() => medicalSetView('bio')); await p.waitForTimeout(1500);
  check('numbers page loads (no error)', !/Could not load/.test(await p.textContent('#medBioBox')) && !/Loading/.test(await p.textContent('#medBioBox')), await p.textContent('#medBioBox'));
  await p.screenshot({ path: S + '/04-bio.png', fullPage: true });
  // Meds
  await p.evaluate(() => medicalSetView('meds')); await p.waitForTimeout(400);
  await p.fill('#medQuery', 'benadryl'); await p.waitForTimeout(300);
  check('Benadryl shows 60-hour wait', /60 hours/.test(await p.textContent('#medResults')));
  await p.screenshot({ path: S + '/05-meds.png', fullPage: true });
  // MedXPress
  await p.evaluate(() => medicalSetView('medxpress')); await p.waitForTimeout(400);
  await p.screenshot({ path: S + '/06-medxpress.png', fullPage: true });
  // Vision
  await p.evaluate(() => medicalSetView('vision')); await p.waitForTimeout(400);
  check('portrait: turn-sideways hint shows', await p.locator('.med-rotate-hint').isVisible());
  check('slider reaches card length on an iPhone (517 px+)', +(await p.getAttribute('#medCalSlider', 'max')) >= 600);
  // Sideways (iPhone 17 landscape, 874 x 402)
  await p.setViewportSize({ width: 874, height: 402 }); await p.waitForTimeout(800);
  check('landscape: bar scrolled into view', await p.$eval('#medCalBar', e => { const r = e.getBoundingClientRect(); return r.top > 60 && r.bottom < 402 - 60; }));
  check('landscape: hint hidden', !(await p.locator('.med-rotate-hint').isVisible()));
  await p.evaluate(() => { const s = document.getElementById('medCalSlider'); s.value = 517; medVisionCalDraw(); medVisionNudge(1); medVisionNudge(1); medVisionNudge(-1); });
  const barW = await p.$eval('#medCalBar', e => e.getBoundingClientRect().width);
  check('landscape: bar draws full card length, nudges by 1 px', Math.abs(barW - 518) < 0.5 && /518 px/.test(await p.textContent('#medCalPx')), barW);
  await p.screenshot({ path: S + '/07a-cal-landscape.png' });
  // Turned counterclockwise (90): camera on the left, bar anchored right.
  await p.evaluate(() => { Object.defineProperty(window, 'orientation', { value: 90, configurable: true }); window.dispatchEvent(new Event('orientationchange')); }); await p.waitForTimeout(500);
  let bb = await p.$eval('#medCalBar', e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: window.innerWidth }; });
  check('counterclockwise: bar anchored right, clear of the left edge', bb.r > bb.w - 60 && bb.l > 200, bb);
  await p.screenshot({ path: S + '/07b-cal-ccw.png' });
  await p.evaluate(() => { Object.defineProperty(window, 'orientation', { value: -90, configurable: true }); window.dispatchEvent(new Event('orientationchange')); }); await p.waitForTimeout(500);
  bb = await p.$eval('#medCalBar', e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: window.innerWidth }; });
  check('clockwise: bar anchored left', bb.l < 60, bb);
  await p.evaluate(() => { delete window.orientation; });
  await p.setViewportSize({ width: 390, height: 664 }); await p.evaluate(() => renderPage()); await p.waitForTimeout(400);
  await p.evaluate(() => { document.getElementById('medCalSlider').value = 330; });
  await p.locator('button', { hasText: 'This matches my card' }).click(); await p.waitForTimeout(500);
  const sizes = await p.$$eval('#mainPage div[style*="font-family:Arial"]', els => els.map(e => parseFloat(e.style.fontSize)));
  check('seven chart lines, shrinking', sizes.length === 7 && sizes.every((v, i) => i === 0 || v < sizes[i - 1]), sizes);
  const px20 = sizes[6], expect20 = (330 / 85.6) * 0.591 / 0.72;
  check('20/20 line sized from calibration', Math.abs(px20 - expect20) < 0.1, [px20, expect20]);
  check('each line shows its score beside it', (await p.locator('.med-vline').count()) === 7 && /20\/40/.test(await p.locator('.med-vline').nth(3).textContent()));
  await p.evaluate(() => { ST.medEye = 'right'; }); await p.locator('.med-vline').nth(4).click(); await p.waitForTimeout(400);
  check('tapping a line records it and moves to the left eye', await p.evaluate(() => ST.medEye === 'left' && medicalRecord().vision.right.den === 30));
  await p.locator('.med-vline').nth(2).click(); await p.waitForTimeout(400);
  check('left eye line marked', /✓ 20\/50/.test(await p.locator('.med-vline').nth(2).textContent()));
  const vt = await p.textContent('#mainPage');
  check('right eye passes, left eye flagged', /Right eye: 20\/30/.test(vt) && /Reaches the 20\/40/.test(vt) && /Left eye: 20\/50/.test(vt) && /See an optometrist/.test(vt));
  // Mid range and distance
  await p.locator('button', { hasText: 'Mid range' }).click(); await p.waitForTimeout(400);
  check('mid range: letters sized for 32 in', await p.$$eval('#mainPage div[style*="font-family:Arial"]', els => { const v = els.map(e => parseFloat(e.style.fontSize)); return Math.abs(v[v.length - 1] - (330 / 85.6) * 1.182 / 0.72) < 0.1; }));
  await p.locator('.med-vline').last().click(); await p.waitForTimeout(400);
  await p.locator('button', { hasText: 'Distance' }).click(); await p.waitForTimeout(400);
  const farSizes = await p.$$eval('#mainPage div[style*="font-family:Arial"]', els => els.map(e => parseFloat(e.style.fontSize)));
  check('distance 10 ft: 20/20 sized for 10 ft', Math.abs(farSizes[farSizes.length - 1] - (330 / 85.6) * 4.433 / 0.72) < 0.1, farSizes);
  check('distance: 20/20 marked as the FAA line for first class', /20\/20FAALINE/.test((await p.locator('.med-vline').last().textContent()).replace(/\s/g, '')));
  await p.locator('.med-vline').last().click(); await p.waitForTimeout(400);
  const allRes = await p.textContent('#mainPage');
  check('results list near, mid and distance', /at 16 in/.test(allRes) && /at 32 in/.test(allRes) && /at 10 ft/.test(allRes), allRes.slice(-600));
  await p.screenshot({ path: S + '/07c-distance.png', fullPage: true });
  await p.locator('button', { hasText: 'Near' }).first().click(); await p.waitForTimeout(300);
  await p.waitForTimeout(2600); await p.evaluate(() => document.querySelector('#mainPage div[style*="background:#fff"]').scrollIntoView({block:'center'})); await p.waitForTimeout(300); await p.screenshot({ path: S + '/07-vision.png' });
  const back = await p.$$eval('#mainPage .btn-ghost', els => els.filter(e => /←/.test(e.textContent)).map(e => e.textContent.trim()));
  check('one back link on a sub-page', back.length === 1 && back[0] === '← Medical', back);
  // PIN
  await p.evaluate(() => medicalSetView('privacy')); await p.waitForTimeout(300);
  await p.fill('#medPinNew', '2468'); await p.locator('button', { hasText: 'Set PIN' }).click(); await p.waitForTimeout(600);
  await p.evaluate(() => { ST.medicalUnlocked = false; switchTab('medical'); }); await p.waitForTimeout(400);
  check('PIN gate shows', !!(await p.locator('#medPinEntry').count()));
  await p.fill('#medPinEntry', '1111'); await p.locator('button', { hasText: 'Unlock' }).click(); await p.waitForTimeout(500);
  check('wrong PIN stays locked', !!(await p.locator('#medPinEntry').count()));
  await p.fill('#medPinEntry', '2468'); await p.locator('button', { hasText: 'Unlock' }).click(); await p.waitForTimeout(600);
  check('right PIN unlocks', !(await p.locator('#medPinEntry').count()));
  await p.screenshot({ path: S + '/08-home-after.png' });
  // Nothing medical reached the server: profile unchanged key check
  const leak = await p.evaluate(async () => { const { data } = await SB.from('user_profiles').select('profile_data').eq('user_id', ST.user.id).maybeSingle(); return JSON.stringify(data || {}).includes('1980-09-01'); });
  check('birth date did not reach the server', leak === false);
  await p.evaluate(() => { localStorage.removeItem('fcf_medical_v1'); });
  check('no page errors', errs.length === 0, errs);
  await b.close(); console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
