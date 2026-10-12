// DFW Crashpads server ("app" edge function on Supabase project uvkkfkaqlhvmyacxwoey).
// Deploy this file as index.ts of the `app` function (verify_jwt off; it checks auth itself).
// Routes:
//   GET  /            -> redirects to the phone app (Supabase can't serve HTML)
//   POST /setup       -> one-time manager account setup
//   POST /agreement   -> phone app: send / status / resend a rental agreement (manager sign-in required)
//   POST /            -> WordPress webhook: new applications and signed agreements (website key required)
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

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

/** Phone app -> website: send, check, or resend an agreement for one lead. */
async function agreement(req: Request, d: Record<string, unknown>, db: DB) {
  // Who is asking? Must be a signed-in manager.
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = jwt ? await db.auth.getUser(jwt) : { data: null };
  const email = u?.user?.email?.toLowerCase();
  if (!email) return json(401, { ok: false, message: "Sign in again." });
  const { data: mgr } = await db.from("cp_managers").select("email").ilike("email", email).maybeSingle();
  if (!mgr) return json(403, { ok: false, message: "This account isn't a manager." });

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

  await db.from("cp_leads").update({ status: "Agreement sent", email: to, wp_lead_id: Number(out.lead_id) || lead.wp_lead_id }).eq("id", lead.id);
  if (lead.tenant_id) await db.from("cp_tenants").update({ email: to }).eq("id", lead.tenant_id);
  await db.from("cp_contact_log").insert({ lead_id: lead.id, tenant_id: lead.tenant_id, who: lead.name, channel: "Email", summary: `Agreement sent to ${to}: ${bedId || category}, $${rent}/mo, move-in ${moveIn}` });
  return json(200, { ok: true, url: out.url, sent_to: out.sent_to || to });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/app/, "") || "/";
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  if (req.method === "GET") {
    if (path === "/health") return json(200, { ok: true });
    return Response.redirect(APP_URL, 302);
  }

  let d: Record<string, unknown> = {};
  try { d = await req.json(); } catch { return json(400, { ok: false, message: "Send JSON." }); }
  const db = admin();

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
