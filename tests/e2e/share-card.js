// Share a workout: the picture, the brand on it, and how it leaves the app.
//   npm run e2e:share            (BASE_URL defaults to the live site)
//   SHOT_DIR=some/folder saves the card and the sheets as pictures.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const BASE = process.env.BASE_URL || 'https://flightcrew.fit';
const OUT = process.env.SHOT_DIR || '';
let fail = 0;
const check = (name, cond, got) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  got ' + JSON.stringify(got))); if (!cond) fail++; };

// mode: 'browser' | 'phone_browser' | 'ios' | 'ios_next'
function stub(mode) {
  window.__blobOrDataLinks = []; window.__shared = []; window.__native = []; window.__copied = null;
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (/^(blob|data):/.test(String(this.href))) { window.__blobOrDataLinks.push(this.download || '(no name)'); return; } return realClick.apply(this, arguments); };
  try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__copied = t; return Promise.resolve(); } } }); } catch (e) {}
  const fileShare = () => { navigator.canShare = d => !!(d && d.files && d.files.length); navigator.share = d => { window.__shared.push({ files: (d.files || []).map(f => f.name + '|' + f.type + '|' + (f.size > 20000)), text: d.text || '' }); return Promise.resolve(); }; };
  if (mode === 'phone_browser') fileShare();
  if (mode === 'browser') { try { delete Navigator.prototype.canShare; delete Navigator.prototype.share; } catch (e) {} }
  if (mode === 'ios' || mode === 'ios_next') {
    const noop = { postMessage() {} };
    window.webkit = { messageHandlers: { storeKit: noop, haptics: noop, share: { postMessage(m) { window.__native.push({ keys: Object.keys(m).sort().join(','), imageChars: (m.imageBase64 || '').length, url: m.url || null }); } } } };
    fileShare(); // even if the phone COULD share files from a page, the current build must not use it for pictures
    if (mode === 'ios_next') window.FCFBridge = new Proxy({ isNative: true, capabilities: { shareFile: true, shareImage: true } }, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
}
async function open(browser, mode, state) {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'en-US', timezoneId: 'America/Chicago', ...(state ? { storageState: state } : {}) });
  await ctx.route('**/functions/v1/fcf-ai-coach', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'stub', cached: true }) }));
  await ctx.addInitScript(stub, mode);
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
  await page.waitForTimeout(1200);
  return { ctx, page };
}
// A finished Cardio session, shown on the real debrief screen.
const seedDebrief = page => page.evaluate(() => {
  const cat = buildExerciseCatalog(); const pick = n => ({ ...cat.find(e => e.name === n) });
  const walk = pick('Brisk Walk Ramp-Up'), jj = pick('Jumping Jacks'), tm = pick('Treadmill Intervals'), bike = cat.find(e => e.name === 'Stationary Bike Intervals' && e.inputType === 'reps_only'), step = pick('Step-Up');
  const snap = { taxi: [walk, jj], takeoff: [tm, { ...bike }], enroute: [step], landing: [] };
  const session = { date: new Date(2026, 9, 7, 12, 40).toISOString(), env: 'hotel', muscle_group: 'Cardio', fatigue: 'go', durationMinutes: 57, workoutSnapshot: snap,
    sets: { [walk.id]: [{ seconds: '2400' }], [jj.id]: [{ seconds: '33' }, { seconds: '31' }], [tm.id]: [{ reps: '6' }, { reps: '6' }, { reps: '5.5' }, { reps: '6' }], [bike.id]: [{ reps: '250' }, { reps: '300' }, { reps: '280' }], [step.id]: [{ reps: '15', weight: '30' }, { reps: '15', weight: '30' }, { reps: '15', weight: '30' }] } };
  const all = [...snap.taxi, ...snap.takeoff, ...snap.enroute];
  const summary = buildWorkoutSummary(session, all, [session], 190);
  summary.prHits = [{ name: 'Step-Up', weight: 30, unit: 'lb' }];
  ST.lastDebrief = { summary, messages: buildDebriefMessages(summary), session };
  ST.tab = 'debrief'; renderPage();
  return { hasButton: !!document.querySelector('[onclick*="openShareCard(\'debrief\')"]'), tab: ST.tab };
});
const sheet = page => page.evaluate(() => ({ text: document.getElementById('modalRoot').textContent.replace(/\s+/g, ' '), img: (() => { const i = document.getElementById('shareCardImg'); return i ? { w: i.naturalWidth, h: i.naturalHeight, png: i.src.startsWith('data:image/png'), bytes: i.src.length, callout: i.style.webkitTouchCallout || i.style.getPropertyValue('-webkit-touch-callout'), pe: i.style.pointerEvents } : null; })(),
  buttons: [...document.querySelectorAll('#modalRoot button')].map(b => b.textContent.trim()), shared: window.__shared, native: window.__native, links: window.__blobOrDataLinks, copied: window.__copied, full: !!document.getElementById('shareCardFull') }));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // A. Current iPhone app build.
  let { ctx, page } = await open(browser, 'ios');
  console.log('version ' + await page.evaluate(() => FCF_VERSION) + ' at ' + BASE);
  const state = await ctx.storageState();
  let seeded = await seedDebrief(page);
  check('A1. the end-of-workout screen has a Share button', seeded.hasButton, seeded);
  if (OUT) await page.screenshot({ path: path.join(OUT, 'share-debrief.png'), fullPage: true });
  await page.locator('button', { hasText: /SHARE THIS WORKOUT/ }).first().click();
  await page.waitForSelector('#shareCardImg', { timeout: 10000 }); await page.waitForTimeout(400);
  let s = await sheet(page);
  check('A2. it draws a 1080 x 1350 picture', s.img && s.img.png && s.img.w === 1080 && s.img.h === 1350 && s.img.bytes > 40000, s.img);
  check('A3. current iPhone build: full-screen for a screenshot, and no picture share sheet', s.buttons.includes('Show full screen') && !s.buttons.some(b => /^📤 Share$|Save the picture/.test(b)), s.buttons);
  check('A4. the picture cannot be press-and-held inside the app', s.img.pe === 'none', s.img);
  if (OUT) { const b64 = await page.evaluate(() => document.getElementById('shareCardImg').src.split(',')[1]); fs.writeFileSync(path.join(OUT, 'share-card.png'), Buffer.from(b64, 'base64')); await page.screenshot({ path: path.join(OUT, 'share-sheet-ios.png') }); }
  await page.locator('#modalRoot button', { hasText: 'Show full screen' }).click(); await page.waitForTimeout(300);
  s = await sheet(page);
  check('A5. Show full screen puts the card alone on the screen', s.full, s);
  if (OUT) { await page.waitForTimeout(2700); await page.screenshot({ path: path.join(OUT, 'share-fullscreen.png') }); }
  await page.locator('#shareCardFull').click(); await page.waitForTimeout(200);
  await page.locator('#modalRoot button', { hasText: /Copy a caption/ }).click(); await page.waitForTimeout(300);
  s = await sheet(page);
  check('A6. tapping closes it, and the caption with the link can be copied', !s.full && /Cardio: 57 min, \d+ sets\. Logged with Flight Crew Fitness\. https:\/\/flightcrew\.fit/.test(s.copied || ''), s.copied);
  check('A7. nothing was sent to a share sheet or a download in this build', s.shared.length === 0 && s.native.length === 0 && s.links.length === 0, s);
  // The same button on a past workout, opened from the calendar on Trends.
  await page.evaluate(() => closeModal());
  const past = await page.evaluate(async () => {
    await loadSessionCache();
    const real = (ST.sessionCache || []).filter(x => x && x.date && !x.importedFromOura && x.workoutSnapshot).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    if (!real) return { none: true };
    const d = new Date(real.date); const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    await showCalendarDay(iso);
    return { iso, name: real.muscle_group, buttons: [...document.querySelectorAll('#modalRoot button')].map(b => b.textContent.trim()) };
  });
  if (past.none) console.log('SKIP A9: the test account has no past workout to open');
  else {
    check('A9. a past workout opened from Trends has a Share button', past.buttons.some(b => /SHARE THIS WORKOUT/.test(b)), past);
    await page.locator('#modalRoot button', { hasText: /SHARE THIS WORKOUT/ }).first().click();
    await page.waitForSelector('#shareCardImg', { timeout: 10000 }); await page.waitForTimeout(300);
    s = await sheet(page);
    check('A10. and it draws that workout\'s card', s.img && s.img.w === 1080 && /Share this workout/.test(s.text), s.img);
    if (OUT) { const b64 = await page.evaluate(() => document.getElementById('shareCardImg').src.split(',')[1]); fs.writeFileSync(path.join(OUT, 'share-card-past.png'), Buffer.from(b64, 'base64')); }
  }
  check('A8. no page errors', page.__errs.length === 0, page.__errs);
  await ctx.close();

  // B. The next iPhone build: native picture share.
  ({ ctx, page } = await open(browser, 'ios_next', state));
  await seedDebrief(page);
  await page.locator('button', { hasText: /SHARE THIS WORKOUT/ }).first().click(); await page.waitForSelector('#shareCardImg'); await page.waitForTimeout(300);
  await page.locator('#modalRoot button', { hasText: /^📤 Share$/ }).click(); await page.waitForTimeout(300);
  s = await sheet(page);
  check('B. next iPhone build: one tap hands the picture to the iPhone share sheet', s.native.length === 1 && /imageBase64/.test(s.native[0].keys) && s.native[0].imageChars > 30000 && s.shared.length === 0, s.native);
  await ctx.close();

  // C. A phone browser (Safari, Chrome).
  ({ ctx, page } = await open(browser, 'phone_browser', state));
  await seedDebrief(page);
  await page.locator('button', { hasText: /SHARE THIS WORKOUT/ }).first().click(); await page.waitForSelector('#shareCardImg'); await page.waitForTimeout(300);
  await page.locator('#modalRoot button', { hasText: /^📤 Share$/ }).click(); await page.waitForTimeout(300);
  s = await sheet(page);
  check('C. phone browser: shares a PNG with the caption', s.shared.length === 1 && s.shared[0].files[0] === 'flight-crew-fitness-workout.png|image/png|true' && /flightcrew\.fit/.test(s.shared[0].text), s.shared);
  await ctx.close();

  // D. A computer.
  ({ ctx, page } = await open(browser, 'browser', state));
  await seedDebrief(page);
  await page.locator('button', { hasText: /SHARE THIS WORKOUT/ }).first().click(); await page.waitForSelector('#shareCardImg'); await page.waitForTimeout(300);
  await page.locator('#modalRoot button', { hasText: 'Save the picture' }).click(); await page.waitForTimeout(300);
  s = await sheet(page);
  check('D. computer: saves the picture as a file', s.links.length === 1 && s.links[0] === 'flight-crew-fitness-workout.png', s.links);
  await ctx.close();

  await browser.close();
  console.log(fail ? '\n' + fail + ' check(s) FAILED' : '\nAll checks passed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
