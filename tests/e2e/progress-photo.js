// Progress photo upload from the file picker: uploads, lands in storage with
// real bytes, shows in the timeline, then is deleted. Runs as e2e-bot.
const { chromium, devices } = require('playwright');
const fs = require('fs'); const S = process.env.SHOTS_DIR || __dirname;
const env = {}; for (const l of fs.readFileSync('/home/claude/pilot-program/tests/e2e/.env','utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g,''); }
let fail = 0; const check = (n, c, g) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  got ' + JSON.stringify(g))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ ...devices['iPhone 14'], timezoneId: 'America/Phoenix' });
  await ctx.route('**/functions/v1/fcf-ai-coach', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'stub', cached: false }) }));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const base = process.env.BASE_URL || 'https://flightcrew.fit';
  await p.goto(base + '/?e2e=' + Date.now(), { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
  const acct = p.getByText(/I HAVE AN ACCOUNT/i).first(); if (await acct.count()) await acct.click();
  await p.waitForSelector('#auth_email', { timeout: 15000 });
  await p.fill('#auth_email', env.E2E_EMAIL); await p.fill('#auth_pass', env.E2E_PASSWORD);
  await p.locator('button', { hasText: /Sign In/ }).last().click();
  await p.waitForFunction(() => typeof ST !== 'undefined' && !!ST.user, null, { timeout: 25000 });
  await p.evaluate(() => { if (!ST.disclaimerAccepted && typeof acceptDisclaimer === 'function') acceptDisclaimer(); });
  await p.waitForFunction(() => { try { return _bootRenderDone; } catch (e) { return false; } }, null, { timeout: 30000 });
  // Let the service worker take control so the upload goes through it.
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => { try { return _bootRenderDone; } catch (e) { return false; } }, null, { timeout: 30000 });
  console.log('service worker controls page:', await p.evaluate(() => !!navigator.serviceWorker.controller));
  const jpg = Buffer.from(await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 800; const g = c.getContext('2d'); g.fillStyle = '#468'; g.fillRect(0, 0, 600, 800); return c.toDataURL('image/jpeg', 0.9).split(',')[1]; }), 'base64');
  const before = await p.evaluate(async () => (await SB.storage.from('progress-photos').list(ST.user.id, { limit: 1000 })).data?.length || 0);
  const [chooser] = await Promise.all([ p.waitForEvent('filechooser'), p.evaluate(() => uploadProgressPhoto(false)) ]);
  await chooser.setFiles({ name: 'progress.jpg', mimeType: 'image/jpeg', buffer: jpg });
  await p.waitForFunction(n => SB.storage.from('progress-photos').list(ST.user.id, { limit: 1000 }).then(r => (r.data || []).length > n), before, { timeout: 30000, polling: 1000 }).catch(() => {});
  const files = await p.evaluate(async () => (await SB.storage.from('progress-photos').list(ST.user.id, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } })).data || []);
  const newest = files[0];
  check('photo uploaded', files.length === before + 1, { before, after: files.length });
  check('stored file has the real bytes', newest && newest.metadata && newest.metadata.size === jpg.length, { size: newest && newest.metadata && newest.metadata.size, expected: jpg.length });
  const toast = await p.evaluate(() => document.body.innerText.match(/Upload failed[^\n]*|Photo saved[^\n]*/)?.[0] || '');
  check('success message, not an error', /Photo saved/.test(toast), toast);
  // Clean up.
  if (newest) await p.evaluate(async n => { await SB.storage.from('progress-photos').remove([ST.user.id + '/' + n]); }, newest.name);
  check('no page errors', !errs.length, errs);
  await b.close(); console.log(fail ? 'FAILED ' + fail : 'ALL PASS'); process.exit(fail ? 1 : 0);
})();
