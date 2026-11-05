// Public FAA medication checker (Nov 4 2026): loads with no account, every
// medication is in the page for search engines, search filters by generic,
// brand or alias, ?q= pre-fills, structured data parses, no page errors.
const { chromium, devices } = require('playwright');
const S = process.env.SHOTS_DIR || __dirname;
let fail = 0; const check = (n, c, g) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  got ' + JSON.stringify(g))); if (!c) fail++; };
(async () => {
  const base = process.env.BASE_URL || 'https://flightcrew.fit';
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await (await b.newContext({ ...devices['iPhone 14'] })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(base + '/tools/faa-medication-checker.html?e2e=' + Date.now(), { waitUntil: 'load' });
  const total = await p.locator('.med').count();
  check('all medications are in the page', total > 290, total);
  const ld = await p.evaluate(() => { try { return JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'].map(x => x['@type']); } catch (e) { return String(e); } });
  check('structured data parses (app, breadcrumbs, FAQ)', Array.isArray(ld) && ld.includes('FAQPage') && ld.includes('WebApplication'), ld);
  const search = async q => { await p.fill('#q', q); await p.waitForTimeout(150); return p.evaluate(() => [...document.querySelectorAll('.med:not(.hide) h3')].map(h => h.textContent)); };
  check('brand name finds the generic (Zoloft)', (await search('zoloft')).includes('sertraline'));
  check('Benadryl shows the 60-hour wait', (await search('benadryl')).includes('diphenhydramine') && /60 hours/.test(await p.textContent('#diphenhydramine')));
  check('alias finds it (paracetamol)', (await search('paracetamol')).includes('acetaminophen'));
  await p.screenshot({ path: S + '/medpage-01-search.png', fullPage: false });
  check('unknown drug shows the not-in-list note', (await search('zzqx')).length === 0 && await p.isVisible('#none'));
  check('clearing shows everything again', (await search('')).length === total);
  await p.goto(base + '/tools/faa-medication-checker.html?q=ozempic', { waitUntil: 'load' });
  check('?q= pre-fills the search', (await p.evaluate(() => [...document.querySelectorAll('.med:not(.hide) h3')].map(h => h.textContent))).includes('semaglutide'));
  const wide = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check('no sideways scroll on a phone', wide);
  await p.goto(base + '/tools/faa-medication-checker.html', { waitUntil: 'load' }); await p.screenshot({ path: S + '/medpage-00-top.png' });
  check('no page errors', !errs.length, errs);
  await b.close(); console.log(fail ? 'FAILED ' + fail : 'ALL PASS'); process.exit(fail ? 1 : 0);
})();
