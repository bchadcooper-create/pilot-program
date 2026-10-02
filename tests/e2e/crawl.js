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
const { buildTrip, toICS } = require('./fixtures/schedule');

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
  // Every crawl is a fresh browser profile, so the per-device safety
  // disclaimer always appears, sometimes a beat after sign-in resolves.
  // Wait for either the disclaimer button or the app's tab bar.
  await page.waitForFunction(() => document.querySelector('[onclick*="acceptDisclaimer"]') || (typeof ST !== 'undefined' && ST.disclaimerAccepted), null, { timeout: 15000 }).catch(() => {});
  const ok = page.locator('[onclick*="acceptDisclaimer"]').first();
  if (await ok.count()) { await shot(page, 'safety disclaimer'); await ok.click(); await settle(page, 1200); }
  const accepted = await page.evaluate(() => typeof ST !== 'undefined' && !!ST.disclaimerAccepted);
  if (!accepted) finding('sign-in', 'disclaimer', 'safety disclaimer still blocking after accept');
  await shot(page, 'signed in, Today');
}

// A believable pilot, set once through the app's own save paths so the
// bot is never a blank account: call sign, body stats, goal, Pro, both
// trackers on. Idempotent.
async function makeRealistic(page) {
  await page.evaluate(async () => {
    const profile = (await dbGetProfile()) || {};
    Object.assign(profile, {
      username: profile.username || 'E2E Bot', age: 44, sex: 'male', heightIn: 71, lastWeight: 188,
      goal: 'muscle', level: 'intermediate', trackNutrition: true, trackHydration: true,
      nutritionGoals: { mode: 'maintain', calories: 2600, protein: 180, carbs: 280, fat: 85, setAt: new Date().toISOString() },
    });
    await dbSetProfile(profile);
    applyProfileToState(profile);
  }).catch(e => finding('setup', 'realistic profile', e.message));
  await goTab(page, 'today');
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
    if (inputs.length === 0) {
      // A stopwatch/NSDR card is driven by a Start button, not typing.
      const hasTimer = await page.$('#excard_' + id + ' .stopwatch-btn, #excard_' + id + ' [onclick*="startStopwatch"], #excard_' + id + ' [onclick*="startNSDR"]');
      if (!hasTimer) finding('no-inputs', 'flight ' + id, 'expanded card has nowhere to type and no timer');
    }
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

// A real pairing, uploaded through the real file input. Day 2 of 4: woke
// in EUG, two legs this afternoon, overnight SEA. Then check that the
// screens that read the schedule reach the right conclusions.
async function scheduleFlow(page) {
  const trip = buildTrip(new Date());
  const ics = toICS(trip);
  fs.writeFileSync(path.join(REPORT_DIR, 'trip.ics'), ics);
  await goTab(page, 'data');
  const input = await page.$('#icsFileInput');
  if (!input) { finding('schedule', 'data', 'no .ics file input on the Data screen'); return; }
  await input.setInputFiles({ name: 'trip.ics', mimeType: 'text/calendar', buffer: Buffer.from(ics) });
  await settle(page, 2500);
  await shot(page, 'schedule uploaded');
  const n = await page.evaluate(() => (ST.flightSchedule || []).length);
  if (n !== trip.length) finding('schedule', 'upload', 'expected ' + trip.length + ' events, app has ' + n);

  // What the app concluded, straight from the same functions Today uses.
  const ctx = await page.evaluate(() => {
    const sched = scheduleContextForToday(ST.flightSchedule, new Date());
    return { legsRemaining: sched.legsTodayRemaining, legsCompleted: sched.legsTodayCompleted,
             tripDay: sched.tripDayNumber, tripDays: sched.tripTotalDays,
             tonight: sched.tonightLayoverAirport, flightsToday: sched.flightsToday };
  });
  console.log('    app reads: ' + JSON.stringify(ctx));
  const hour = new Date().getHours();
  const expectRemaining = hour < 14 ? 2 : hour < 17 ? 1 : 0;
  if (ctx.tripDay !== 2 || ctx.tripDays !== 4) finding('schedule', 'trip context', 'expected day 2 of 4, got ' + ctx.tripDay + ' of ' + ctx.tripDays);
  if (ctx.tonight !== 'SEA') finding('schedule', 'trip context', 'tonight should be SEA, got ' + ctx.tonight);
  if (ctx.legsRemaining !== expectRemaining) finding('schedule', 'trip context', 'legs remaining today: expected ' + expectRemaining + ', got ' + ctx.legsRemaining);

  // Today should now show the schedule card with both flights and SEA.
  await goTab(page, 'today');
  await settle(page, 2000);
  const text = await page.evaluate(() => document.getElementById('mainPage').innerText);
  if (!/3747/.test(text) || !/3902/.test(text)) finding('schedule', 'today', "today's flights 3747/3902 not on the Today screen");
  if (!/Layover in SEA/i.test(text)) finding('schedule', 'today', 'tonight (Layover in SEA) not on the Today screen');
  await sniffText(page, 'today with schedule');
  await shot(page, 'Today with schedule');

  // The AI cards now have real trip context; they must settle and must
  // talk about the right night. Trip plan should appear for a 4-day trip.
  if (!SKIP_AI) {
    await aiCards(page);
    const fat = await page.evaluate(() => document.getElementById('aiFatigueCard')?.innerText || '');
    if (/\bEUG\b/.test(fat) && /tonight/i.test(fat)) finding('ai-content', 'aiFatigueCard', 'says tonight is EUG; it is SEA: ' + fat.slice(0, 160));
    const plan = await page.evaluate(() => { const el = document.getElementById('aiTripPlanCard'); return el && el.style.display !== 'none' ? el.innerText : ''; });
    if (!/Day 1/.test(plan)) finding('ai-content', 'aiTripPlanCard', 'no day-by-day plan shown for a 4-day trip: "' + plan.slice(0, 80) + '"');
    // The fueling note lives on the Nutrition screen, checked in foodFlow.
  }
}

async function waterFlow(page) {
  await goTab(page, 'today');
  const before = await page.evaluate(() => ST.waterIn || 0);
  const open = page.locator('[onclick*="openQuickWaterLog"]').first();
  if (!(await open.count())) { finding('water', 'today', 'no hydration control on Today (is tracking on?)'); return; }
  await open.scrollIntoViewIfNeeded().catch(() => {});
  await open.click();
  await page.waitForTimeout(400);
  await shot(page, 'water sheet');
  // Quick-add button first (the one-tap path), then a typed amount.
  const quick = page.locator('#modalRoot [onclick*="addQuickWater"]').first();
  if (await quick.count()) { await quick.click(); await settle(page); }
  const mid = await page.evaluate(() => ST.waterIn || 0);
  if (mid <= before) finding('water', 'quick add', 'water did not increase after quick add (' + before + ' -> ' + mid + ')');
  await open.scrollIntoViewIfNeeded().catch(() => {});
  await open.click().catch(() => {});
  await page.waitForTimeout(400);
  const inp = await page.$('#quickWaterInput');
  if (inp) {
    await inp.fill('0.5');
    const save = page.locator('#modalRoot [onclick*="saveQuickWater"]').first();
    if (await save.count()) await save.click();
    await settle(page);
  } else finding('water', 'sheet', 'no amount input in the water sheet');
  const after = await page.evaluate(() => ST.waterIn || 0);
  if (after < mid + 0.49) finding('water', 'typed add', 'adding 0.5 L did not stick (' + mid + ' -> ' + after + ')');
  const shown = await page.evaluate(() => document.getElementById('mainPage').innerText);
  if (!new RegExp(after.toFixed(1).replace('.', '\\.')).test(shown)) finding('water', 'today', 'Today does not show the new total ' + after.toFixed(1));
  await closeAnyModal(page);
  await shot(page, 'water logged');
  // Reload and make sure it survived a round trip to the server.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof ST !== 'undefined' && !!ST.user, null, { timeout: 25000 });
  await settle(page, 3000);
  const persisted = await page.evaluate(() => ST.waterIn || 0);
  if (Math.abs(persisted - after) > 0.01) finding('water', 'persistence', 'after reload water is ' + persisted + ', was ' + after);
}

async function foodFlow(page) {
  await goTab(page, 'nutrition');
  await settle(page, 1500);
  const open = page.locator('[onclick*="openMealBuilder"]').first();
  if (!(await open.count())) { finding('food', 'nutrition', 'no Log a meal control'); return; }
  await open.click();
  await page.waitForTimeout(800);
  await shot(page, 'meal builder');
  // Manual entry path: search USDA, pick the first hit, add it, save.
  const mb = '#mealBuilderRoot ';
  await page.waitForSelector('#mealBuilderRoot .card', { timeout: 8000 }).catch(() => {});
  const manual = page.locator(mb + '[onclick*="showManualFoodEntry"]').first();
  if (await manual.count()) { await manual.click(); await page.waitForTimeout(300); }
  const search = await page.$('#foodSearchInput');
  if (!search) { finding('food', 'builder', 'no food search box in the meal builder'); return; }
  await search.fill('chicken breast');
  const t0 = Date.now();
  let hits = 0;
  while (Date.now() - t0 < 15000) {
    await page.waitForTimeout(500);
    hits = await page.$$eval('#usdaSearchResults [onclick*="selectUSDAFood"]', d => d.length);
    if (hits) break;
  }
  if (!hits) { finding('food', 'usda search', '"chicken breast" returned no results in 15s'); return; }
  await page.locator('#usdaSearchResults [onclick*="selectUSDAFood"]').first().click();
  // Picking a food fetches its full nutrient detail before the Add button
  // appears; give that round trip the same patience a person would.
  const addBtn = page.locator(mb + '[onclick*="addUSDAFoodToMeal"]').first();
  await addBtn.waitFor({ timeout: 15000 }).catch(() => {});
  if (!(await addBtn.count())) { finding('food', 'builder', 'no Add button 15s after picking a food'); return; }
  await addBtn.click();
  await page.waitForTimeout(400);
  const items = await page.evaluate(() => (ST.mealBuilder?.items || []).length);
  if (items !== 1) finding('food', 'builder', 'expected 1 item in the meal, have ' + items);
  await shot(page, 'meal with one item');
  const mealsBefore = await page.evaluate(() => (ST.todaysMeals || []).length);
  const finish = page.locator(mb + '[onclick*="finishMealBuilder"]').first();
  if (!(await finish.count())) { finding('food', 'builder', 'no Save/Finish button'); return; }
  await finish.click();
  await settle(page, 2500);
  const mealsAfter = await page.evaluate(() => (ST.todaysMeals || []).length);
  if (mealsAfter !== mealsBefore + 1) finding('food', 'save', 'meal count ' + mealsBefore + ' -> ' + mealsAfter);
  const text = await page.evaluate(() => document.getElementById('mainPage').innerText);
  if (!/chicken/i.test(text)) finding('food', 'nutrition', 'saved meal not visible on the Nutrition screen');
  if (!/\d+\s*(kcal|cal)/i.test(text)) finding('food', 'nutrition', 'no calorie total shown after logging');
  await sniffText(page, 'nutrition after meal');
  await shot(page, 'meal logged');
  if (!SKIP_AI) {
    // Fueling note: two legs on the schedule and a meal logged, so it must appear.
    const t1 = Date.now();
    let fuel = '';
    while (Date.now() - t1 < 45000) {
      fuel = await page.evaluate(() => { const el = document.getElementById('aiFuelCard'); return !el ? 'absent' : el.style.display === 'none' ? 'hidden' : el.innerText; });
      if (fuel !== 'absent' && fuel !== 'hidden' && !/Thinking/i.test(fuel)) break;
      await page.waitForTimeout(1500);
    }
    console.log('    aiFuelCard: ' + fuel.replace(/\s+/g, ' ').slice(0, 90));
    if (fuel === 'absent' || fuel === 'hidden' || /Thinking/i.test(fuel)) finding('ai-content', 'aiFuelCard', 'no fueling note on Nutrition with a schedule and a logged meal: ' + fuel);
    if (/—|–/.test(fuel)) finding('ai-style', 'aiFuelCard', 'em/en dash: ' + fuel.slice(0, 120));
  }
  // Fuel card on Today should reflect a logged meal.
  await goTab(page, 'today');
  await settle(page, 1500);
  const today = await page.evaluate(() => document.getElementById('mainPage').innerText);
  if (!/chicken|kcal|cal\b/i.test(today)) finding('food', 'today', 'Today shows nothing from the logged meal');
  // Remove the bot's meal so the next run starts clean.
  await page.evaluate(async () => {
    const m = (ST.todaysMeals || []).find(x => JSON.stringify(x).toLowerCase().includes('chicken'));
    if (m && typeof deleteMealLog === 'function') { try { await deleteMealLog(m.id, true); } catch (e) {} }
  });
  await page.waitForTimeout(400);
  const confirm = page.locator('#modalRoot .modal-sheet .btn').first();
  if (await confirm.count()) await confirm.click().catch(() => {});
  await settle(page);
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
    // A deliberate reload cancels whatever was in flight; that is the
    // harness, not the app.
    if (r.failure()?.errorText === 'net::ERR_ABORTED') return;
    finding('request-failed', r.url().replace(/\?.*/, ''), r.failure()?.errorText || 'failed');
  });
  page.on('response', r => {
    const s = r.status();
    if (s >= 500) finding('http-' + s, r.url().replace(/\?.*/, ''), r.request().method());
  });

  const phases = [
    ['sign in', signIn],
    ['realistic profile', makeRealistic],
    ['flight schedule upload', scheduleFlow],
    ['every screen + click sweep', visitAllScreens],
    ['realistic profile again (sweep may have changed settings)', makeRealistic],
    ['water logging', waterFlow],
    ['food logging', foodFlow],
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
