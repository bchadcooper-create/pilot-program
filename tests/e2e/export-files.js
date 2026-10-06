// Exports must never trap someone inside the iPhone app.
// Reported: "Export CSV for AI Analysis" opened a giant spreadsheet with no
// way out. Inside the app a download link replaces the whole screen with
// the file. This check pretends to be the iPhone app (by providing the same
// bridge the real shell provides) and proves no download link is ever used
// there, and that a normal browser still gets a normal download.
//   npm run e2e:export            (BASE_URL defaults to the live site)
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const BASE = process.env.BASE_URL || 'https://flightcrew.fit';
let fail = 0;
const check = (name, cond, got) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  got ' + JSON.stringify(got))); if (!cond) fail++; };

// Runs before any page script. mode: 'browser' | 'ios' | 'ios_share' | 'ios_native'
function shellStub(mode) {
  window.__blobLinkClicks = []; window.__shared = []; window.__nativeShare = []; window.__copied = null;
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (String(this.href).startsWith('blob:')) { window.__blobLinkClicks.push(this.download || '(no name)'); if (mode !== 'browser') return; }
    return realClick.apply(this, arguments);
  };
  if (mode === 'browser') return;
  const noop = { postMessage() {} };
  window.webkit = { messageHandlers: { storeKit: noop, haptics: noop, share: { postMessage(m) { window.__nativeShare.push({ filename: m.filename, mime: m.mime, chars: (m.text || '').length, url: m.url || null }); } } } };
  try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__copied = t; return Promise.resolve(); } } }); } catch (e) {}
  if (mode === 'ios_share') {
    navigator.canShare = d => !!(d && d.files && d.files.length);
    navigator.share = d => { window.__shared.push((d.files || []).map(f => f.name + '|' + f.type + '|' + f.size)); return Promise.resolve(); };
  } else { try { delete Navigator.prototype.canShare; delete Navigator.prototype.share; } catch (e) {} }
  if (mode === 'ios_native') window.FCFBridge = new Proxy({ isNative: true, capabilities: { shareFile: true } }, { get: (t, k) => (k in t ? t[k] : () => {}) });
}

async function signedInPage(browser, mode, state) {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'en-US', timezoneId: 'America/Phoenix', acceptDownloads: true, ...(state ? { storageState: state } : {}) });
  await ctx.route('**/functions/v1/fcf-ai-coach', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'stub', cached: true }) }));
  await ctx.addInitScript(shellStub, mode);
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
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const snap = page => page.evaluate(() => ({ url: location.pathname, app: !!document.getElementById('mainPage'), sheet: /Your export is ready/.test(document.getElementById('modalRoot').textContent),
  sheetText: document.getElementById('modalRoot').textContent.slice(0, 200), shareBtn: !!document.querySelector('#modalRoot [onclick*="shareExportFile"]'),
  blobLinks: window.__blobLinkClicks, shared: window.__shared, native: window.__nativeShare, copiedChars: (window.__copied || '').length, copiedHead: (window.__copied || '').slice(0, 60), ios: inIOSApp() }));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // A. Normal browser: a real download, as before.
  let { ctx, page } = await signedInPage(browser, 'browser');
  console.log('version ' + await page.evaluate(() => FCF_VERSION) + ' at ' + BASE);
  const state = await ctx.storageState();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }).catch(() => null), page.evaluate(() => exportCSV())]);
  let s = await snap(page);
  check('A. browser: Export CSV downloads a .csv file', !!dl && /^flight-crew-fitness-\d{4}-\d\d-\d\d\.csv$/.test(dl.suggestedFilename()) && !s.sheet, { file: dl && dl.suggestedFilename(), s });
  await ctx.close();

  // B. iPhone app, current build (no file sharing available to the page).
  ({ ctx, page } = await signedInPage(browser, 'ios', state));
  await page.evaluate(() => exportCSV()); await page.waitForTimeout(800);
  s = await snap(page);
  check('B1. iPhone app: recognised as the app', s.ios === true, s);
  check('B2. iPhone app: Export CSV never uses a download link (the trap)', s.blobLinks.length === 0, s.blobLinks);
  check('B3. iPhone app: the app is still on screen with an "export is ready" sheet', s.app && s.sheet && /\.csv \(\d+ KB\)/.test(s.sheetText), s);
  check('B4. iPhone app: no Share button when the phone cannot share files from a page', s.shareBtn === false, s);
  await page.click('#exportCopyBtn'); await page.waitForTimeout(400);
  s = await snap(page);
  check('B5. iPhone app: Copy puts the whole export on the clipboard', s.copiedChars > 500 && (await page.evaluate(() => window.__copied.includes('"Date","Day","Muscle Group"'))), { chars: s.copiedChars, head: s.copiedHead });
  const body = await page.evaluate(() => window.__copied);
  const lines = body.split('\n');
  check('B5b. the export opens with goal and targets, and has every body measurement', lines[0] === '"### PROFILE AND TARGETS"' && /"Training goal","[^"]+"/.test(body) && /"Nutrition (plan|targets)","[^"]+"/.test(body)
    && body.includes('"### WORKOUTS (one row per set)"') && body.includes('"### BODY MEASUREMENTS (every entry)"') && body.includes('"### NUTRITION'), lines.slice(0, 6));
  if (process.env.SHOW_HEAD) console.log(lines.slice(0, 16).join('\n') + '\n...\n' + lines.filter(l => l.startsWith('"###')).join('\n'));
  await page.locator('#modalRoot button', { hasText: /^Done$/ }).click(); await page.waitForTimeout(300);
  s = await snap(page);
  check('B6. iPhone app: Done closes the sheet and the app is still there', !s.sheet && s.app, s);
  await page.evaluate(() => { ST.flightScheduleRaw = 'BEGIN:VCALENDAR\nEND:VCALENDAR'; downloadFlightScheduleICS(); }); await page.waitForTimeout(400);
  s = await snap(page);
  check('B7. iPhone app: the flight schedule download is offered the same safe way', s.blobLinks.length === 0 && s.sheet && /my_flight_schedule\.ics/.test(s.sheetText), s);
  check('B8. no page errors', page.__errs.length === 0, page.__errs);
  await ctx.close();

  // C. iPhone app where the phone can share files from a page.
  ({ ctx, page } = await signedInPage(browser, 'ios_share', state));
  await page.evaluate(() => exportCSV()); await page.waitForTimeout(800);
  s = await snap(page);
  check('C1. with file sharing: a Share button is offered', s.sheet && s.shareBtn, s);
  await page.locator('#modalRoot [onclick*="shareExportFile"]').click(); await page.waitForTimeout(400);
  s = await snap(page);
  check('C2. with file sharing: Share hands over one .csv file', s.shared.length === 1 && /^flight-crew-fitness-.*\.csv\|text\/csv\|\d+$/.test(s.shared[0][0]) && s.blobLinks.length === 0, s.shared);
  await ctx.close();

  // D. A future app build that shares files natively.
  ({ ctx, page } = await signedInPage(browser, 'ios_native', state));
  await page.evaluate(() => exportCSV()); await page.waitForTimeout(800);
  s = await snap(page);
  const files = s.native.filter(n => n.filename);
  check('D. next app build: the file goes to the iPhone share sheet, no in-app sheet, no download link', files.length === 1 && /\.csv$/.test(files[0].filename) && files[0].chars > 500 && !s.sheet && s.blobLinks.length === 0, s);
  await ctx.close();

  await browser.close();
  console.log(fail ? '\n' + fail + ' check(s) FAILED' : '\nAll checks passed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
