// DFW Crashpads server ("app" edge function on Supabase project uvkkfkaqlhvmyacxwoey).
// Deploy this file as index.ts of the `app` function (verify_jwt off; it checks auth itself).
// Routes:
//   GET  /            -> redirects to the phone app (Supabase can't serve HTML)
//   POST /setup       -> one-time manager account setup
//   POST /agreement   -> phone app: send / status / resend a rental agreement (manager sign-in required)
//   POST /ttlock/connect  -> phone app: exchange the TTLock app login for a token (password is never stored)
//   POST /ttlock          -> phone app: locks / sendkey / removekey / setlock (manager sign-in required)
//   POST /ttlock/callback -> TTLock pushes door events here (set as the Callback URL on open.ttlock.com)
//   POST /groupme/connect -> phone app: save the GroupMe access token and find the house group
//   POST /groupme         -> phone app: add / remove a tenant (manager sign-in required)
//   POST /            -> WordPress webhook: new applications and signed agreements (website key required)
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { crypto } from "jsr:@std/crypto@1";
import { encodeHex } from "jsr:@std/encoding@1/hex";

const APP_URL = "https://flightcrew.fit/crashpads/";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (code: number, body: unknown) => new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json", ...CORS } });

function fmtPhone(p: unknown) {
  let d = String(p ?? "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") d = d.slice(1);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p ?? "");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

async function setting(db: DB, key: string) {
  const { data } = await db.from("cp_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ? String(data.value) : "";
}

/** Returns an error Response unless the caller is a signed-in manager. */
async function requireManager(req: Request, db: DB): Promise<Response | null> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = jwt ? await db.auth.getUser(jwt) : { data: null };
  const email = u?.user?.email?.toLowerCase();
  if (!email) return json(401, { ok: false, message: "Sign in again." });
  const { data: mgr } = await db.from("cp_managers").select("email").ilike("email", email).maybeSingle();
  if (!mgr) return json(403, { ok: false, message: "This account isn't a manager." });
  return null;
}

/** Phone app -> website: send, check, or resend an agreement for one lead. */
async function agreement(req: Request, d: Record<string, unknown>, db: DB) {
  const denied = await requireManager(req, db);
  if (denied) return denied;

  const key = await setting(db, "wp_api_key");
  if (!key) return json(503, { ok: false, message: "Save the WordPress API key under More > Settings first." });
  const site = (await setting(db, "wp_site")) || "https://dfwcrashpads.com";
  const wp = async (method: string, body?: unknown) => {
    const r = await fetch(`${site}/wp-json/dfw/v1/agreements`, {
      method, redirect: "manual",
      headers: { "content-type": "application/json", "x-dfw-key": key },
      body: body ? JSON.stringify(body) : undefined,
    });
    let out: any = null;
    try { out = await r.json(); } catch { /* not JSON */ }
    return { code: r.status, out };
  };

  const { data: lead } = await db.from("cp_leads").select("*").eq("id", String(d.lead_id ?? "")).maybeSingle();
  if (!lead) return json(404, { ok: false, message: "Lead not found." });
  const action = String(d.action ?? "status");

  // Find this person's agreement on the website (read-only).
  const findOnSite = async () => {
    const { code, out } = await wp("GET");
    if (code !== 200 || !Array.isArray(out)) return { error: (out && out.message) || `Website said HTTP ${code}` };
    const byId = lead.wp_lead_id ? out.find((a: any) => Number(a.lead_id) === Number(lead.wp_lead_id)) : null;
    const byName = out.find((a: any) => String(a.name ?? "").trim().toLowerCase() === String(lead.name).trim().toLowerCase());
    return { agreement: byId || byName || null };
  };

  if (action === "status") {
    const f = await findOnSite();
    if (f.error) return json(502, { ok: false, message: f.error });
    return json(200, { ok: true, agreement: f.agreement });
  }

  if (action === "resend") {
    if (!lead.wp_lead_id) return json(400, { ok: false, message: "No agreement on the website for this lead yet." });
    const f = await findOnSite();
    if (f.agreement?.status === "signed") return json(200, { ok: true, message: "Already signed, nothing re-sent.", agreement: f.agreement });
    const { code, out } = await wp("POST", { lead_id: lead.wp_lead_id, resend: 1 });
    if (code !== 200) return json(502, { ok: false, message: out?.message || `Website said HTTP ${code}` });
    await db.from("cp_contact_log").insert({ lead_id: lead.id, tenant_id: lead.tenant_id, who: lead.name, channel: "Email", summary: "Agreement emailed again" });
    return json(200, { ok: true, message: "Emailed again.", url: out?.url });
  }

  if (action !== "send") return json(400, { ok: false, message: "Unknown action." });

  // Send. Validate before touching the website.
  const to = String(d.email ?? "").trim();
  const rent = Number(d.rent) || 0;
  const moveIn = String(d.move_in ?? "");
  const bedId = String(d.bed_id ?? "");
  let category = String(d.category ?? "");
  if (!/^\S+@\S+\.\S+$/.test(to)) return json(400, { ok: false, message: "Need a valid email." });
  if (!rent) return json(400, { ok: false, message: "Need the monthly rent." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(moveIn)) return json(400, { ok: false, message: "Need a move-in date." });
  if (bedId && !category) {
    const { data: bed } = await db.from("cp_beds").select("category").eq("id", bedId).maybeSingle();
    category = bed?.category ?? "";
  }
  // Never send twice: if one already exists, hand it back.
  const f = await findOnSite();
  if (f.agreement) return json(200, { ok: true, already: true, agreement: f.agreement });

  const { code, out } = await wp("POST", {
    lead_id: lead.wp_lead_id || 0,
    name: lead.name, email: to, phone: String(lead.phone ?? "").replace(/\D/g, ""),
    airline: lead.airline || "", position: lead.position || "",
    bed_id: bedId, category, rent, move_in: moveIn,
  });
  if (code !== 200 || !out?.ok) return json(502, { ok: false, message: out?.message || `Website said HTTP ${code}` });

  // The agreement is the reservation: hold the bed in the app the moment it goes out.
  const hold: Record<string, unknown> = { bed_id: bedId || null, rent, move_in: moveIn, email: to, category_hold: bedId ? null : (category || null), payment_code: bedId ? bedId.replace("-", "") : null };
  let tenantId: string | null = lead.tenant_id;
  if (tenantId) {
    await db.from("cp_tenants").update(hold).eq("id", tenantId);
  } else {
    const { data: same } = await db.from("cp_tenants").select("id").ilike("name", lead.name).neq("status", "Moved Out").limit(1);
    if (same?.length) { tenantId = same[0].id; await db.from("cp_tenants").update(hold).eq("id", tenantId); }
    else {
      const { data: ins } = await db.from("cp_tenants").insert({ name: lead.name, status: "Reserved", phone: lead.phone, airline: lead.airline, ...hold }).select("id").single();
      tenantId = ins?.id ?? null;
    }
  }
  if (tenantId && bedId) {
    // One open make-bed task per tenant, pointed at this bed and date.
    const { data: task } = await db.from("cp_cleaning").select("id").eq("tenant_id", tenantId).eq("task", "Make bed for move-in").eq("done", false).limit(1);
    if (task?.length) await db.from("cp_cleaning").update({ bed_id: bedId, needed_on: moveIn, notes: `${lead.name} arrives ${moveIn}` }).eq("id", task[0].id);
    else await db.from("cp_cleaning").insert({ needed_on: moveIn, bed_id: bedId, task: "Make bed for move-in", tenant_id: tenantId, tenant_name: lead.name, notes: `${lead.name} arrives ${moveIn}` });
  }
  await db.from("cp_leads").update({ status: "Agreement sent", email: to, tenant_id: tenantId, wp_lead_id: Number(out.lead_id) || lead.wp_lead_id }).eq("id", lead.id);
  await db.from("cp_contact_log").insert({ lead_id: lead.id, tenant_id: tenantId, who: lead.name, channel: "Email", summary: `Agreement sent to ${to}: ${bedId || category}, $${rent}/mo, move-in ${moveIn}` });
  return json(200, { ok: true, url: out.url, sent_to: out.sent_to || to, tenant_id: tenantId });
}


// ---------------- TTLock ----------------
// Docs: https://euopen.ttlock.com/document (OAuth password grant; every call is form-encoded with clientId, accessToken, date).
const TTLOCK_HOSTS = ["https://euapi.ttlock.com", "https://api.ttlock.com"];
const md5 = async (s: string) => encodeHex(await crypto.subtle.digest("MD5", new TextEncoder().encode(s)));

async function ttForm(url: string, body: Record<string, unknown>) {
  const f = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) if (v !== undefined && v !== null) f.set(k, String(v));
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: f });
  let out: any = null;
  try { out = await r.json(); } catch { out = { errcode: -1, errmsg: `TTLock said HTTP ${r.status}` }; }
  return out;
}

/** Valid access token, refreshing it when it is within a day of expiring. */
async function ttAuth(db: DB) {
  const { data: a } = await db.from("cp_ttlock_auth").select("*").eq("id", 1).maybeSingle();
  if (!a?.access_token) throw new Error("TTLock isn't connected yet. Connect it under More.");
  if (a.expires_at && new Date(a.expires_at).getTime() - Date.now() > 86400000) return a;
  const t = await ttForm(`${a.api_host}/oauth2/token`, { clientId: a.client_id, clientSecret: a.client_secret, grant_type: "refresh_token", refresh_token: a.refresh_token });
  if (!t?.access_token) throw new Error(`TTLock refresh failed: ${t?.errmsg || t?.description || "unknown"}. Reconnect under More.`);
  const upd = { access_token: t.access_token, refresh_token: t.refresh_token || a.refresh_token, expires_at: new Date(Date.now() + (Number(t.expires_in) || 7776000) * 1000).toISOString() };
  await db.from("cp_ttlock_auth").update(upd).eq("id", 1);
  return { ...a, ...upd };
}

async function ttCall(db: DB, path: string, params: Record<string, unknown>) {
  const a = await ttAuth(db);
  const out = await ttForm(`${a.api_host}/v3/${path}`, { clientId: a.client_id, accessToken: a.access_token, date: Date.now(), ...params });
  if (out && typeof out.errcode === "number" && out.errcode !== 0) throw new Error(`TTLock ${path}: ${out.errmsg || out.description || "error " + out.errcode} (${out.errcode})`);
  return out;
}

async function ttRefreshLocks(db: DB) {
  const out = await ttCall(db, "lock/list", { pageNo: 1, pageSize: 100 });
  const list = Array.isArray(out?.list) ? out.list : [];
  for (const l of list) {
    await db.from("cp_locks").upsert({ lock_id: l.lockId, name: l.lockAlias || l.lockName, has_gateway: l.hasGateway === 1, battery: l.electricQuantity ?? null, updated_at: new Date().toISOString() }, { onConflict: "lock_id", ignoreDuplicates: false });
  }
  const { data } = await db.from("cp_locks").select("*").order("name");
  return data ?? [];
}

// Dates for keys: DFW is Central time; -06:00 is midnight CST / 1 am CDT, early enough for a red-eye arrival.
const centralMs = (day: string, hhmm = "00:00") => Date.parse(`${day}T${hhmm}:00-06:00`);

async function ttlockConnect(req: Request, d: Record<string, unknown>, db: DB) {
  const denied = await requireManager(req, db);
  if (denied) return denied;
  const clientId = String(d.client_id ?? "").trim(), clientSecret = String(d.client_secret ?? "").trim();
  const username = String(d.username ?? "").trim(), password = String(d.password ?? "");
  if (!clientId || !clientSecret || !username || !password) return json(400, { ok: false, message: "Fill in all four fields." });
  const hashed = await md5(password); // TTLock wants the MD5 of the password; the password itself is never saved
  let lastErr = "";
  for (const host of TTLOCK_HOSTS) {
    const t = await ttForm(`${host}/oauth2/token`, { clientId, clientSecret, username, password: hashed });
    if (t?.access_token) {
      await db.from("cp_ttlock_auth").upsert({ id: 1, client_id: clientId, client_secret: clientSecret, api_host: host, ttlock_username: username, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(Date.now() + (Number(t.expires_in) || 7776000) * 1000).toISOString(), connected_at: new Date().toISOString() });
      const locks = await ttRefreshLocks(db);
      return json(200, { ok: true, locks, message: `Connected. Found ${locks.length} lock${locks.length === 1 ? "" : "s"}.` });
    }
    lastErr = t?.errmsg || t?.description || t?.error || JSON.stringify(t).slice(0, 160);
  }
  return json(400, { ok: false, message: `TTLock didn't accept that login: ${lastErr}. Use the email/phone and password you sign into the TTLock phone app with (not the developer site).` });
}

async function ttlock(req: Request, d: Record<string, unknown>, db: DB) {
  const denied = await requireManager(req, db);
  if (denied) return denied;
  const action = String(d.action ?? "status");

  if (action === "status") {
    const { data: a } = await db.from("cp_ttlock_auth").select("ttlock_username, api_host, connected_at, expires_at").eq("id", 1).maybeSingle();
    const { data: locks } = await db.from("cp_locks").select("*").order("name");
    return json(200, { ok: true, connected: !!a, account: a?.ttlock_username ?? null, locks: locks ?? [] });
  }
  if (action === "locks") return json(200, { ok: true, locks: await ttRefreshLocks(db) });
  if (action === "setlock") {
    await db.from("cp_locks").update({ give_tenants: !!d.give_tenants }).eq("lock_id", Number(d.lock_id));
    return json(200, { ok: true });
  }

  const { data: t } = await db.from("cp_tenants").select("*").eq("id", String(d.tenant_id ?? "")).maybeSingle();
  if (!t) return json(404, { ok: false, message: "Tenant not found." });

  if (action === "sendkey") {
    const to = String(d.email ?? t.email ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(to)) return json(400, { ok: false, message: "This tenant needs an email first (Edit tenant)." });
    const { data: locks } = await db.from("cp_locks").select("*").eq("give_tenants", true);
    if (!locks?.length) return json(400, { ok: false, message: "No locks are set to give tenants keys. Check More > TTLock." });
    const today = new Date().toISOString().slice(0, 10);
    const start = t.move_in && t.move_in > today ? centralMs(t.move_in) : Date.now() - 300000;
    const end = t.move_out ? centralMs(t.move_out, "14:00") + 86400000 : Date.now() + 10 * 365 * 86400000;
    const results: string[] = [];
    for (const l of locks) {
      try {
        const out = await ttCall(db, "key/send", {
          lockId: l.lock_id, receiverUsername: to, keyName: `${t.name}${t.bed_id ? " " + t.bed_id : ""}`.slice(0, 50),
          startDate: start, endDate: end, createUser: 1, remarks: "DFW Crashpads door key",
        });
        await db.from("cp_door_keys").update({ removed_at: new Date().toISOString(), note: "replaced" }).eq("tenant_id", t.id).eq("lock_id", l.lock_id).is("removed_at", null);
        await db.from("cp_door_keys").insert({ tenant_id: t.id, tenant_name: t.name, lock_id: l.lock_id, key_id: out?.keyId ?? null, receiver: to });
        results.push(`${l.name}: sent`);
      } catch (e) { results.push(`${l.name}: ${(e as Error).message}`); }
    }
    const okCount = results.filter((r) => r.endsWith(": sent")).length;
    if (okCount) {
      await db.from("cp_tenants").update({ ttlock_account: true, email: t.email || to }).eq("id", t.id);
      await db.from("cp_contact_log").insert({ tenant_id: t.id, who: t.name, channel: "TTLock", summary: `Door key sent to ${to} (${results.join("; ")})` });
    }
    return json(okCount ? 200 : 502, { ok: okCount > 0, message: results.join("\n"), password_hint: to.slice(-6) });
  }

  if (action === "removekey") {
    const { data: keys } = await db.from("cp_door_keys").select("*").eq("tenant_id", t.id).is("removed_at", null);
    const results: string[] = [];
    for (const k of keys ?? []) {
      try {
        if (k.key_id) await ttCall(db, "key/delete", { keyId: k.key_id });
        await db.from("cp_door_keys").update({ removed_at: new Date().toISOString() }).eq("id", k.id);
        results.push(`lock ${k.lock_id}: removed`);
      } catch (e) {
        const msg = (e as Error).message;
        // Key already gone on TTLock's side counts as removed.
        if (/not exist|does not exist|-1003|-4043/i.test(msg)) { await db.from("cp_door_keys").update({ removed_at: new Date().toISOString(), note: "already gone" }).eq("id", k.id); results.push(`lock ${k.lock_id}: already gone`); }
        else results.push(`lock ${k.lock_id}: ${msg}`);
      }
    }
    const { data: left } = await db.from("cp_door_keys").select("id").eq("tenant_id", t.id).is("removed_at", null);
    if (!left?.length) await db.from("cp_tenants").update({ ttlock_account: false }).eq("id", t.id);
    if (results.length) await db.from("cp_contact_log").insert({ tenant_id: t.id, who: t.name, channel: "TTLock", summary: `Door key removed (${results.join("; ")})` });
    return json(left?.length ? 502 : 200, { ok: !left?.length, message: results.join("\n") || "No active keys on file." });
  }

  return json(400, { ok: false, message: "Unknown action." });
}

/** TTLock pushes door events here as form fields: lockId, notifyType, records (JSON array), admin, lockMac. */
async function ttlockCallback(req: Request, db: DB) {
  const raw = await req.text();
  const form = new URLSearchParams(raw);
  let records: any[] = [];
  try { records = JSON.parse(form.get("records") ?? "[]"); } catch { /* not JSON */ }
  if (!Array.isArray(records) || !records.length) return new Response("success");
  const { data: known } = await db.from("cp_locks").select("lock_id");
  const knownIds = new Set((known ?? []).map((k: any) => Number(k.lock_id)));
  const rows = records
    .filter((r) => knownIds.size === 0 || knownIds.has(Number(r.lockId)))
    .map((r) => ({
      lock_id: Number(r.lockId) || null, record_type: Number(r.recordType) || null, success: r.success === 1 || r.success === true,
      username: r.username ?? null, keyboard_pwd: r.keyboardPwd ? "set" : null,
      lock_at: r.lockDate ? new Date(Number(r.lockDate)).toISOString() : null,
      server_at: r.serverDate ? new Date(Number(r.serverDate)).toISOString() : null,
      battery: r.electricQuantity ?? null, raw: { ...r, keyboardPwd: undefined },
    }));
  if (rows.length) await db.from("cp_lock_events").insert(rows);
  return new Response("success");
}

// ---------------- GroupMe ----------------
// Docs: https://dev.groupme.com/docs/v3 (token in the X-Access-Token header).
const GM = "https://api.groupme.com/v3";
async function gmFetch(token: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`${GM}${path}`, { ...init, headers: { "x-access-token": token, "content-type": "application/json", ...(init.headers ?? {}) } });
  let out: any = null;
  try { out = await r.json(); } catch { /* empty body on some calls */ }
  return { code: r.status, out };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function groupmeConnect(req: Request, d: Record<string, unknown>, db: DB) {
  const denied = await requireManager(req, db);
  if (denied) return denied;
  const token = String(d.token ?? "").trim();
  if (!token) return json(400, { ok: false, message: "Paste your GroupMe access token." });
  const { code, out } = await gmFetch(token, "/groups?per_page=100&omit=memberships");
  if (code !== 200) return json(400, { ok: false, message: `GroupMe didn't accept that token (HTTP ${code}). Copy the Access Token from dev.groupme.com again.` });
  const groups = (out?.response ?? []).map((g: any) => ({ id: String(g.id), name: g.name }));
  const pick = d.group_id ? groups.find((g: any) => g.id === String(d.group_id)) : groups.filter((g: any) => /dfw\s*crash\s*pads?/i.test(g.name)).length === 1 ? groups.find((g: any) => /dfw\s*crash\s*pads?/i.test(g.name)) : null;
  if (!pick) return json(200, { ok: true, choose: true, groups, message: "Pick the house group." });
  await db.from("cp_groupme_auth").upsert({ id: 1, access_token: token, group_id: pick.id, group_name: pick.name, connected_at: new Date().toISOString() });
  await db.from("cp_settings").upsert({ key: "groupme_connected", value: pick.name });
  return json(200, { ok: true, group: pick, message: `Connected to ${pick.name}.` });
}

async function groupme(req: Request, d: Record<string, unknown>, db: DB) {
  const denied = await requireManager(req, db);
  if (denied) return denied;
  const { data: a } = await db.from("cp_groupme_auth").select("*").eq("id", 1).maybeSingle();
  if (!a) return json(400, { ok: false, message: "GroupMe isn't connected yet. Connect it under More." });
  const { data: t } = await db.from("cp_tenants").select("*").eq("id", String(d.tenant_id ?? "")).maybeSingle();
  if (!t) return json(404, { ok: false, message: "Tenant not found." });
  const action = String(d.action ?? "");

  if (action === "add") {
    const digits = String(t.phone ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
    if (digits.length !== 10) return json(400, { ok: false, message: "This tenant needs a 10-digit phone number first." });
    const guid = globalThis.crypto.randomUUID();
    const nickname = `${t.name}`.slice(0, 50);
    const add = await gmFetch(a.access_token, `/groups/${a.group_id}/members/add`, { method: "POST", body: JSON.stringify({ members: [{ nickname, phone_number: `+1 ${digits}`, guid }] }) });
    const resultsId = add.out?.response?.results_id;
    if (add.code >= 300 || !resultsId) return json(502, { ok: false, message: `GroupMe add failed (HTTP ${add.code}): ${JSON.stringify(add.out?.meta?.errors ?? add.out).slice(0, 160)}` });
    // Results arrive a moment later; they carry the membership id we need for removal.
    let memberId: string | null = null;
    for (let i = 0; i < 6 && !memberId; i++) {
      await sleep(i === 0 ? 800 : 1500);
      const r = await gmFetch(a.access_token, `/groups/${a.group_id}/members/results/${resultsId}`);
      if (r.code === 200) { const m = (r.out?.response?.members ?? []).find((x: any) => x.guid === guid) ?? (r.out?.response?.members ?? [])[0]; memberId = m?.id ? String(m.id) : null; break; }
      if (r.code === 404) break;
    }
    await db.from("cp_tenants").update({ groupme_added: true, groupme_member_id: memberId }).eq("id", t.id);
    if (d.welcome) {
      const first = String(t.name).trim().split(" ")[0];
      await gmFetch(a.access_token, `/groups/${a.group_id}/messages`, { method: "POST", body: JSON.stringify({ message: { source_guid: globalThis.crypto.randomUUID(), text: `Everyone welcome ${first}${t.bed_id ? ", who's moving into " + t.bed_id : ""}!` } }) });
    }
    await db.from("cp_contact_log").insert({ tenant_id: t.id, who: t.name, channel: "GroupMe", summary: `Added to ${a.group_name}${memberId ? "" : " (membership id not returned yet)"}` });
    return json(200, { ok: true, message: `Added to ${a.group_name}.`, member_id: memberId });
  }

  if (action === "remove") {
    let memberId = t.groupme_member_id as string | null;
    if (!memberId) {
      // Added before this hookup existed: find them by name in the group.
      const g = await gmFetch(a.access_token, `/groups/${a.group_id}`);
      const members: any[] = g.out?.response?.members ?? [];
      const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z ]/g, "").trim();
      const full = norm(t.name), first = full.split(" ")[0], last = full.split(" ").slice(-1)[0];
      const hits = members.filter((m) => norm(m.nickname) === full || (norm(m.nickname).includes(first) && norm(m.nickname).includes(last)));
      if (hits.length !== 1) return json(409, { ok: false, message: hits.length ? `More than one member matches "${t.name}". Remove them in GroupMe by hand.` : `Couldn't find "${t.name}" in the group by name. Remove them in GroupMe by hand.` });
      memberId = String(hits[0].id);
    }
    const r = await gmFetch(a.access_token, `/groups/${a.group_id}/members/${memberId}/remove`, { method: "POST" });
    if (r.code >= 300 && r.code !== 404) return json(502, { ok: false, message: `GroupMe remove failed (HTTP ${r.code}).` });
    await db.from("cp_tenants").update({ groupme_added: false, groupme_member_id: null }).eq("id", t.id);
    await db.from("cp_contact_log").insert({ tenant_id: t.id, who: t.name, channel: "GroupMe", summary: `Removed from ${a.group_name}` });
    return json(200, { ok: true, message: `Removed from ${a.group_name}.` });
  }
  return json(400, { ok: false, message: "Unknown action." });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/app/, "") || "/";
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  if (req.method === "GET") {
    if (path === "/health") return json(200, { ok: true });
    return Response.redirect(APP_URL, 302);
  }

  if (path === "/ttlock/callback") {
    try { return await ttlockCallback(req, admin()); }
    catch (e) { console.error("ttlock callback", e); return new Response("success"); }
  }

  let d: Record<string, unknown> = {};
  try { d = await req.json(); } catch { return json(400, { ok: false, message: "Send JSON." }); }
  const db = admin();

  if (path === "/groupme/connect" || path === "/groupme") {
    try { return path === "/groupme" ? await groupme(req, d, db) : await groupmeConnect(req, d, db); }
    catch (e) { return json(500, { ok: false, message: String((e as Error)?.message ?? e) }); }
  }

  if (path === "/ttlock/connect" || path === "/ttlock") {
    try { return path === "/ttlock" ? await ttlock(req, d, db) : await ttlockConnect(req, d, db); }
    catch (e) { return json(500, { ok: false, message: String((e as Error)?.message ?? e) }); }
  }

  if (path === "/agreement") {
    try { return await agreement(req, d, db); }
    catch (e) { return json(500, { ok: false, message: String((e as Error)?.message ?? e) }); }
  }

  // One-time manager account setup. Works only while a setup_secret row exists; the row is deleted after use.
  if (path === "/setup") {
    const { data: s } = await db.from("cp_settings").select("value").eq("key", "setup_secret").maybeSingle();
    if (!s?.value || s.value !== d.secret) return json(403, { ok: false, message: "Setup is closed." });
    const { error } = await db.auth.admin.createUser({ email: String(d.email), password: String(d.password), email_confirm: true });
    if (error) return json(500, { ok: false, message: error.message });
    await db.from("cp_settings").delete().eq("key", "setup_secret");
    return json(200, { ok: true, message: "Manager account created." });
  }

  // Website hookup: WordPress posts here with the API key from Settings > DFW Crashpads.
  const k = await setting(db, "wp_api_key");
  if (!k) return json(503, { ok: false, message: "No WordPress API key saved in the app yet." });
  if (String(d.key ?? "") !== k) return json(403, { ok: false, message: "Key did not match." });

  if (d.event === "signed") {
    const name = String(d.name ?? "").trim();
    if (!name) return json(400, { ok: false, message: "No name on the signed agreement." });
    const bedId = String(d.bed_id ?? "") || null;
    const row: Record<string, unknown> = {
      name, bed_id: bedId, rent: Number(d.rent) || 0, status: "Reserved",
      move_in: d.move_in || null, email: d.email || null, phone: fmtPhone(d.phone), airline: d.airline || null,
      contract_signed: true, contract_url: d.copy_url || null, payment_code: d.code || (bedId ? bedId.replace("-", "") : null),
      category_hold: bedId ? null : (d.category || null),
      notes: `Signed ${d.signed_at ?? ""} via website.`,
    };
    const { data: existing } = await db.from("cp_tenants").select("id").ilike("name", name).neq("status", "Moved Out").limit(1);
    let tenantId: string;
    if (existing?.length) { tenantId = existing[0].id; await db.from("cp_tenants").update(row).eq("id", tenantId); }
    else { const { data: ins, error } = await db.from("cp_tenants").insert(row).select("id").single(); if (error) return json(500, { ok: false, message: error.message }); tenantId = ins.id; }
    await db.from("cp_leads").update({ status: "Signed", tenant_id: tenantId }).ilike("name", name).neq("status", "Signed");
    if (bedId && row.move_in) {
      // Skip if a make-bed task for this person and bed already exists (the app adds one at reservation).
      const { data: dup } = await db.from("cp_cleaning").select("id").eq("tenant_id", tenantId).eq("bed_id", bedId).eq("task", "Make bed for move-in").eq("done", false).limit(1);
      if (!dup?.length) await db.from("cp_cleaning").insert({ needed_on: row.move_in, bed_id: bedId, task: "Make bed for move-in", tenant_id: tenantId, tenant_name: name, notes: `${name} arrives ${row.move_in}` });
    }
    return json(200, { ok: true, message: `${existing?.length ? "Updated" : "Added"} ${name} as Reserved.` });
  }

  // A new application.
  const notes: string[] = [];
  if (d.notes) notes.push(String(d.notes));
  if (d.lead_id) notes.push(`Website lead #${d.lead_id}`);
  const { error } = await db.from("cp_leads").insert({
    received_at: d.submitted ? new Date(String(d.submitted)).toISOString() : new Date().toISOString(),
    name: String(d.name ?? "").trim() || "(no name)", email: d.email || null, phone: fmtPhone(d.phone),
    airline: d.airline || null, position: d.position || null, desired_start: d.start || null,
    bed_category: d.bed && d.bed !== "Any available" ? d.bed : null, status: "New",
    notes: notes.join(" | ") || null, source: d.source || null, wp_lead_id: Number(d.lead_id) || null,
  });
  if (error) return json(500, { ok: false, message: error.message });
  return json(200, { ok: true, message: "Lead added." });
});
