#!/usr/bin/env node
/**
 * FCF end-to-end crawler: a robot that uses the app like a person would.
 *
 * Signs in as the e2e bot account, visits every screen, clicks every safe
 * button on each one, runs a whole workout, adds a medication, exercises
 * the AI coach, tries the largest text size, and writes a report with a
 * screenshot per step. Anything that throws, logs an error, fails a
 * request, or leaks "undefined" / "NaN" / "[object Object]" into the page
 * becomes a finding.
 *
 *   node tests/e2e/crawl.js                 (live site, https://flightcrew.fit)
 *   BASE_URL=http://localhost:4321 node tests/e2e/crawl.js   (local checkout)
 *   SKIP_AI=1 node tests/e2e/crawl.js       (no paid AI calls)
 *
 * Credentials: tests/e2e/.env (gitignored) or E2E_EMAIL / E2E_PASSWORD env.
 * Exit code 1 when any finding is recorded, so it can gate a release.
 *
 * It deliberately never: signs out, deletes the account, starts a purchase,
 * opens external links, or submits feedback. See DENY below.
 */
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const REPORT_DIR = path.join(__dirname, 'report');
const BASE_URL = process.env.BASE_URL || 'https://flightcrew.fit';
const SKIP_AI = !!process.env.SKIP_AI;

function loadEnv() {
  const p = path.join(__dirname, '.env');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
loadEnv();
const EMAIL = process.env.E2E_EMAIL, PASSWORD = process.env.E2E_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('Set E2E_EMAIL and E2E_PASSWORD (tests/e2e/.env).'); process.exit(2); }

// onclick text that must never be triggered by the sweep.
const DENY = /doSignOut|signOut|delete|Delete|remove|Remove|confirmDelete|requestAccountDeletion|stripe|Checkout|checkout|purchase|Paywall|paywall|FCFBridge\.|shareApp|copyShareLink|showFeedbackModal|submitFeedback|window\.open|location\.href|connectOura|disconnectOura|syncOuraData|importHistoricalOura|dumpRawOuraWorkouts|resolveOuraDuplicate|importHealth|requestHealth|exportCSV|downloadFlight|clearAllData|resetApp|confirmSetChocks|finishAnyway|adminDelete|superuser|cancelSubscription|manageSubscription|redeemPromo|applyPromo|sendTestNotification|handleAuthSubmit|Sign Out|Delete Account/;
const SMELLS = /\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b(?![a-z])/;

const findings = [];
const steps = [];
let shotN = 0;

fs.rmSync(REPORT_DIR, { recursive: true, force: true });
fs.mkdirSync(REPORT_DIR, { recursive: true });

function finding(kind, where, detail) {
  const f = { kind, where, detail: String(detail).slice(0, 600) };
  findings.push(f);
  console.log('  !! ' + kind + ' @ ' + where + ': ' + f.detail.split('\n')[0]);
}

async function shot(page, label) {
  const file = String(++shotN).padStart(2, '0') + '-' + label.replace(/[^a-z0-9]+/gi, '_').toLowerCase() + '.png';
  try { await page.screenshot({ path: path.join(REPORT_DIR, file) }); } catch (e) { /* page may be mid-navigation */ }
  steps.push({ label, file });
  console.log('  - ' + label);
  return file;
}

async function settle(page, ms = 600) {
  await page.waitForTimeout(ms);
  try { await page.waitForLoadState('networkidle', { timeout: 4000 }); } catch (e) { /* streams keep it busy */ }
}

// Text that leaked into the page as a programming value, not a word.
async function sniffText(page, where) {
  const text = await page.evaluate(() => document.body.innerText || '');
  const m = text.match(SMELLS);
  if (m) {
    const i = text.indexOf(m[0]);
    finding('text-smell', where, m[0] + ' near: "' + text.slice(Math.max(0, i - 60), i + 60).replace(/\s+/g, ' ') + '"');
  }
}

async function closeAnyModal(page) {
  await page.evaluate(() => { try { if (typeof closeModal === 'function') closeModal(); } catch (e) {} });
  await page.waitForTimeout(150);
}

async function goTab(page, tab) {
  await closeAnyModal(page);
  await page.evaluate(t => switchTab(t), tab);
  await settle(page);
}

// Click every distinct safe handler on the current page once, record what
// breaks, and put the page back the way it was between clicks.
async function clickSweep(page, where, restore) {
  const seen = new Set();
  let clicks = 0;
  for (let round = 0; round < 40; round++) {
    // One trip to the page: tag every candidate and describe it.
    const cands = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('[onclick], button').forEach((el, i) => {
        el.setAttribute('data-e2e', String(i));
        const r = el.getBoundingClientRect();
        out.push({
          i, oc: el.getAttribute('onclick') || '',
          text: (el.innerText || '').trim().slice(0, 40),
          tag: el.tagName, href: el.getAttribute('href') || '',
          visible: r.width > 0 && r.height > 0, disabled: !!el.disabled,
        });
      });
      return out;
    });
    const next = cands.find(c => {
      if (!c.visible || c.disabled) return false;
      if (c.href && /^https?:/.test(c.href)) return false;
      const key = c.oc || (c.tag + ':' + c.text);
      if (!key || seen.has(key)) return false;
      if (DENY.test(c.oc) || DENY.test(c.text)) { seen.add(key); return false; }
      return true;
    });
    if (!next) break;
    seen.add(next.oc || (next.tag + ':' + next.text));
    const before = findings.length;
    const el = await page.$('[data-e2e="' + next.i + '"]');
    if (!el) continue;
    try {
      await el.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
      await el.click({ timeout: 2500 });
      clicks++;
    } catch (e) {
      continue; // covered or detached: not a bug by itself
    }
    await page.waitForTimeout(250);
    if (!page.url().startsWith(BASE_URL)) {
      finding('left-app', where, 'click "' + (next.text || next.oc.slice(0, 40)) + '" navigated to ' + page.url().slice(0, 80));
      await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof ST !== 'undefined' && !!ST.user, null, { timeout: 20000 }).catch(() => {});
      await settle(page, 1500);
    }
    await sniffText(page, where + ' after click "' + (next.text || next.oc.slice(0, 40)) + '"');
    if (findings.length > before) await shot(page, where + ' after ' + (next.text || 'click'));
    await closeAnyModal(page);
    if (restore) await restore();
  }
  return clicks;
}

async function signIn(page) {
  await page.goto(BASE_URL + '/?e2e=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await settle(page, 1500);
  await shot(page, 'landing');
  // Already signed in from a previous run? Then there is a tab bar.
  const hasTabs = await page.$('.tabbar .tab');
  const tabsVisible = hasTabs && await hasTabs.isVisible();
  if (tabsVisible) return;
  const acct = page.getByText(/I HAVE AN ACCOUNT/i).first();
  if (await acct.count()) await acct.click();
  await page.waitForSelector('#auth_email', { timeout: 10000 });
  await page.fill('#auth_email', EMAIL);
  await page.fill('#auth_pass', PASSWORD);
  await shot(page, 'sign-in form');
  await page.locator('button', { hasText: /Sign In/ }).last().click();
  await page.waitForFunction(() => typeof ST !== 'undefined' && !!ST.user, null, { timeout: 25000 });
  await settle(page, 2500);
  // First session on a device shows the safety disclaimer; accept it the
  // way a person would, through its button.
  const ok = page.getByText(/I UNDERSTAND/i).first();
  if (await ok.count()) { await shot(page, 'safety disclaimer'); await ok.click(); await settle(page, 1200); }
  await shot(page, 'signed in, Today');
}

async function visitAllScreens(page) {
  const screens = ['today', 'trends', 'leaderboard', 'more', 'profile', 'badges', 'devices', 'wisdom', 'data', 'nutrition', 'fuelplan', 'preflight'];
  for (const t of screens) {
    await goTab(page, t);
    await sniffText(page, t);
    await shot(page, 'screen ' + t);
    const n = await clickSweep(page, t, async () => { await goTab(page, t); });
    console.log('    swept ' + n + ' controls on ' + t);
    await sniffText(page, t + ' after sweep');
  }
}

async function runWorkout(page) {
  await goTab(page, 'preflight');
  // Pick a muscle group pill if none selected, then engage.
  await page.evaluate(() => {
    if (!ST.muscleGroup) ST.muscleGroup = 'Upper Pull';
    if (!ST.env) ST.env = 'comm';
    renderPage();
  });
  await settle(page);
  const engage = page.getByText(/ENGAGE WORKOUT|RETURN TO WORKOUT/i).first();
  await engage.click();
  await settle(page, 1200);
  await shot(page, 'workout started');
  await sniffText(page, 'flight');

  const ids = await page.evaluate(() => [...ST.workout.taxi, ...ST.workout.takeoff, ...ST.workout.enroute, ...ST.workout.landing].map(e => e.id));
  console.log('    ' + ids.length + ' exercises in the workout');
  let setsTyped = 0;
  for (const id of ids) {
    const card = await page.$('#excard_' + id);
    if (!card) { finding('missing-card', 'flight', 'no card for ' + id); continue; }
    await page.evaluate(i => { ST.expanded[i] = true; renderFlight(document.getElementById('mainPage')); }, id);
    await page.waitForTimeout(200);
    // Type a value into every set input on this card.
    const inputs = await page.$$('#excard_' + id + ' input');
    if (inputs.length === 0) finding('no-inputs', 'flight ' + id, 'expanded card has nowhere to type');
    for (const inp of inputs) {
      const type = await inp.getAttribute('inputmode');
      await inp.fill(type === 'decimal' ? '12.5' : '10').catch(() => {});
      setsTyped++;
    }
    // Add Set then Remove Set, if the card offers them.
    for (const label of ['addLiveSet', 'removeLiveSet']) {
      const btn = page.locator('#excard_' + id + ' [onclick*="' + label + '"]').first();
      if (await btn.count()) {
        const before = await page.$$eval('#excard_' + id + ' .set-tile', t => t.length);
        await btn.click({ force: true });
        await page.waitForTimeout(200);
        const after = await page.$$eval('#excard_' + id + ' .set-tile', t => t.length);
        if (label === 'addLiveSet' && after !== before + 1) finding('add-set', 'flight ' + id, 'tiles ' + before + ' -> ' + after);
      }
    }
    // Guide opens something (modal or fallback), then closes.
    const guide = page.locator('#excard_' + id + ' [onclick*="openExerciseGuide"]').first();
    if (await guide.count()) {
      await guide.click();
      await page.waitForTimeout(700);
      const modal = await page.$('#modalRoot .modal-sheet');
      if (!modal) finding('guide', 'flight ' + id, 'Guide tap opened nothing');
      // Let an in-app guide fetch finish before moving on, so its result
      // cannot land on top of the next step.
      await page.waitForFunction(() => !/Loading\.\.\./.test(document.getElementById('modalRoot')?.innerText || ''), null, { timeout: 8000 }).catch(() => {});
      await closeAnyModal(page);
    }
    // Alternate sheet: search the catalog, then close without swapping.
    const alt = page.locator('#excard_' + id + ' [onclick*="showAlternates"]').first();
    if (await alt.count()) {
      await alt.click();
      await page.waitForTimeout(500);
      const search = await page.$('#swapSearch');
      if (search) {
        await search.fill('shrug');
        await page.waitForTimeout(300);
        const results = await page.$$eval('#swapSearchResults > div', d => d.length);
        if (results === 0) finding('catalog-search', 'alternate ' + id, '"shrug" returned no results');
      } else finding('alternate', 'flight ' + id, 'Alternate sheet has no catalog search box');
      await closeAnyModal(page);
    }
    await sniffText(page, 'flight ' + id);
  }
  console.log('    typed into ' + setsTyped + ' inputs');
  await shot(page, 'workout logged');

  // AI substitute once, on the first card with an Alternate button.
  if (!SKIP_AI && ids.length) {
    await page.evaluate(i => { ST.expanded[i] = true; renderFlight(document.getElementById('mainPage')); }, ids[0]);
    const alt = page.locator('#excard_' + ids[0] + ' [onclick*="showAlternates"]').first();
    if (await alt.count()) {
      await alt.click();
      await page.waitForTimeout(500);
      const box = await page.$('#aiSubExplain');
      if (box) {
        await box.fill('Dumbbells only');
        await page.getByText(/ASK AI COACH/i).first().click();
        const t0 = Date.now();
        let outcome = 'no response';
        while (Date.now() - t0 < 45000) {
          await page.waitForTimeout(1000);
          const txt = await page.$eval('#aiSubResult', el => el.textContent).catch(() => '');
          if (/Swap In/.test(txt)) { outcome = 'ok: ' + txt.trim().split('\n')[0].slice(0, 80); break; }
          if (/Couldn|Lost the connection|too long|No good substitute|unreadable/i.test(txt)) { outcome = 'failed: ' + txt.trim(); break; }
        }
        console.log('    AI substitute -> ' + outcome);
        if (!outcome.startsWith('ok')) finding('ai-substitute', 'alternate ' + ids[0], outcome);
        await shot(page, 'AI substitute');
      }
      await closeAnyModal(page);
    }
  }

  // Finish the workout through the real button and confirm.
  const chocks = page.locator('[onclick*="confirmSetChocks"]').first();
  await chocks.scrollIntoViewIfNeeded().catch(() => {});
  await chocks.click();
  await page.waitForTimeout(600);
  const finishAnyway = page.locator('#modalRoot button', { hasText: /Finish Anyway|Set the Chocks|Confirm/i }).first();
  if (await finishAnyway.count()) await finishAnyway.click().catch(() => {});
  await settle(page, 2500);
  await shot(page, 'after Set the Chocks');
  const tab = await page.evaluate(() => ST.tab);
  if (tab !== 'debrief' && tab !== 'today') finding('finish', 'flight', 'after Set the Chocks the app is on "' + tab + '"');
  await sniffText(page, 'debrief');
  await clickSweep(page, 'debrief', null);
}

async function medsFlow(page) {
  await goTab(page, 'profile');
  const add = page.locator('[onclick*="openMedicationEditor"]').first();
  if (!(await add.count())) { finding('meds', 'profile', 'no Add medication control found'); return; }
  await add.click();
  await page.waitForTimeout(500);
  const name = await page.$('#modalRoot input[type="text"], #modalRoot input:not([type])');
  if (!name) { finding('meds', 'editor', 'no name field'); await closeAnyModal(page); return; }
  await name.fill('E2E Creatine');
  const dose = await page.$('#modalRoot input[inputmode="decimal"], #modalRoot input[type="number"]');
  if (dose) await dose.fill('5');
  await shot(page, 'medication editor');
  const save = page.locator('#modalRoot [onclick*="saveMedicationFromEditor"]').first();
  if (await save.count()) await save.click(); else finding('meds', 'editor', 'no Save/Add button in the editor');
  await settle(page);
  await goTab(page, 'today');
  const row = page.getByText(/E2E Creatine/).first();
  if (!(await row.count())) finding('meds', 'today', 'saved medication not shown on Today');
  else {
    const check = page.locator('#medsTodaySection button').first();
    if (await check.count()) {
      const y0 = await page.evaluate(() => window.scrollY + (document.getElementById('mainPage')?.scrollTop || 0));
      await check.click({ force: true });
      await page.waitForTimeout(500);
      const y1 = await page.evaluate(() => window.scrollY + (document.getElementById('mainPage')?.scrollTop || 0));
      if (Math.abs(y1 - y0) > 40) finding('meds', 'today', 'check-off scrolled the page by ' + (y1 - y0) + 'px');
    }
  }
  await shot(page, 'meds on Today');
  // Remove the bot's medication so runs stay idempotent.
  // deleteMedication asks through the app's own confirm sheet, so answer
  // it the way a thumb would: tap Delete, then wait for the sheet to go.
  await page.evaluate(() => {
    const m = (ST.medications || []).find(x => x.name === 'E2E Creatine');
    if (m) openMedicationEditor(m.id);
  });
  await page.waitForTimeout(400);
  const delBtn = page.locator('[onclick*="deleteMedication"]').first();
  if (await delBtn.count()) {
    await delBtn.click().catch(() => {});
    await page.waitForTimeout(400);
    const yes = page.locator('#modalRoot .modal-sheet .btn').first();
    if (await yes.count()) await yes.click().catch(() => {});
    await settle(page);
  }
  const left = await page.evaluate(() => (ST.medications || []).filter(x => x.name === 'E2E Creatine').length);
  if (left) {
    finding('meds', 'cleanup', 'medication still present after Delete; removing via data path');
    await page.evaluate(async () => {
      ST.medications = (ST.medications || []).filter(x => x.name !== 'E2E Creatine');
      if (typeof saveMedicationsToProfile === 'function') await saveMedicationsToProfile();
    }).catch(() => {});
  }
}

async function aiCards(page) {
  if (SKIP_AI) return;
  await goTab(page, 'today');
  const t0 = Date.now();
  let states = {};
  while (Date.now() - t0 < 50000) {
    states = await page.evaluate(() => {
      const out = {};
      for (const id of ['aiFatigueCard', 'aiFuelCard', 'aiTripPlanCard']) {
        const el = document.getElementById(id);
        out[id] = !el ? 'absent' : el.style.display === 'none' ? 'hidden' : /Thinking/i.test(el.innerText) ? 'thinking' : 'text:' + el.innerText.replace(/\s+/g, ' ').slice(0, 80);
      }
      return out;
    });
    if (!Object.values(states).some(s => s === 'thinking')) break;
    await page.waitForTimeout(1500);
  }
  for (const [id, s] of Object.entries(states)) {
    console.log('    ' + id + ': ' + s);
    if (s === 'thinking') finding('ai-card', id, 'still "Thinking..." after 50s');
    if (/—|–/.test(s)) finding('ai-style', id, 'em/en dash in coach text: ' + s);
  }
  await shot(page, 'AI cards');
}

async function textSizeCheck(page) {
  await page.evaluate(() => setTextSize('largest'));
  await settle(page);
  for (const t of ['today', 'trends', 'leaderboard', 'more', 'preflight']) {
    await goTab(page, t);
    const over = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const bad = [];
      const clipped = el => { for (let a = el.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll') return true; } return false; };
      document.querySelectorAll('body *').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > w + 2 && !clipped(el)) {
          bad.push(el.tagName + '.' + String(el.className).split(' ')[0] + ' +' + Math.round(r.right - w) + 'px "' + (el.innerText || '').replace(/\s+/g, ' ').slice(0, 30) + '"');
        }
      });
      const main = document.getElementById('mainPage');
      if (main && main.scrollWidth > main.clientWidth + 2) bad.unshift('PAGE scrolls sideways by ' + (main.scrollWidth - main.clientWidth) + 'px');
      return bad.slice(0, 6);
    });
    if (over.length) finding('text-size', t + ' @ largest', 'overflows viewport: ' + over.join(', '));
    await shot(page, t + ' at largest text');
  }
  await page.evaluate(() => setTextSize('default'));
}

function writeReport(startedAt) {
  const lines = [];
  lines.push('# FCF end-to-end crawl');
  lines.push('');
  lines.push('- Target: ' + BASE_URL);
  lines.push('- Account: ' + EMAIL);
  lines.push('- Started: ' + startedAt.toISOString() + ', took ' + Math.round((Date.now() - startedAt) / 1000) + 's');
  lines.push('- Findings: **' + findings.length + '**');
  lines.push('');
  if (findings.length) {
    lines.push('## Findings');
    lines.push('');
    lines.push('| # | Kind | Where | Detail |');
    lines.push('|---|------|-------|--------|');
    findings.forEach((f, i) => lines.push('| ' + (i + 1) + ' | ' + f.kind + ' | ' + f.where.replace(/\|/g, '/') + ' | ' + f.detail.replace(/\|/g, '/').replace(/\n/g, ' ') + ' |'));
    lines.push('');
  }
  lines.push('## Steps');
  lines.push('');
  steps.forEach(s => lines.push('- ' + s.label + ' ![](' + s.file + ')'));
  fs.writeFileSync(path.join(REPORT_DIR, 'REPORT.md'), lines.join('\n'));
  fs.writeFileSync(path.join(REPORT_DIR, 'findings.json'), JSON.stringify(findings, null, 2));
}

(async () => {
  const startedAt = new Date();
  console.log('FCF e2e crawl against ' + BASE_URL + ' as ' + EMAIL);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ ...devices['iPhone 14'], locale: 'en-US', timezoneId: 'America/Phoenix' });
  const page = await context.newPage();

  page.on('pageerror', e => finding('js-error', 'page', e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/favicon|manifest|ServiceWorker|the server responded with a status of 404/i.test(t)) return;
    finding('console-error', 'page', t);
  });
  page.on('requestfailed', r => {
    if (/favicon|\.png|\.ico/.test(r.url())) return;
    finding('request-failed', r.url().replace(/\?.*/, ''), r.failure()?.errorText || 'failed');
  });
  page.on('response', r => {
    const s = r.status();
    if (s >= 500) finding('http-' + s, r.url().replace(/\?.*/, ''), r.request().method());
  });

  const phases = [
    ['sign in', signIn],
    ['every screen + click sweep', visitAllScreens],
    ['AI coach cards', aiCards],
    ['workout end to end', runWorkout],
    ['medications', medsFlow],
    ['largest text size', textSizeCheck],
  ];
  for (const [name, fn] of phases) {
    console.log('\n' + name);
    try { await fn(page); }
    catch (e) { finding('phase-crashed', name, e.message); await shot(page, name + ' crashed'); }
  }

  writeReport(startedAt);
  await browser.close();
  console.log('\n' + findings.length + ' finding(s). Report: tests/e2e/report/REPORT.md');
  process.exit(findings.length ? 1 : 0);
})();
