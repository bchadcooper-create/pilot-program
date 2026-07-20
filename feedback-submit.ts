// Supabase Edge Function: feedback-submit
// Takes in-app feedback and files it as a GitHub Issue on the pilot-program repo,
// then sends a direct email notification via Mailtrap (best-effort, non-blocking).
// The GitHub token never leaves this function — it is stored as a Supabase
// secret (GITHUB_FEEDBACK_TOKEN) and is scoped to Issues: write only, nothing else.
//
// Deploy with:
//   supabase functions deploy feedback-submit --no-verify-jwt
// Set secrets with:
//   supabase secrets set GITHUB_FEEDBACK_TOKEN=your_fine_grained_pat_here
//   supabase secrets set MAILTRAP_API_TOKEN=your_mailtrap_api_token
//   supabase secrets set ADMIN_NOTIFY_EMAIL=your_email_here
//
// GitHub token setup (do this once):
//   1. github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens
//   2. Generate new token, restrict to "Only select repositories" → pilot-program
//   3. Repository permissions → Issues: Read and write (leave everything else as No access)
//   4. Set an expiration and copy the token into the secret above
//
// GitHub already emails/notifies the repo owner whenever a new Issue is opened —
// that's one notification channel automatically, no extra code needed for it.
// MAILTRAP_API_TOKEN is the same token already generated for Supabase's custom
// SMTP setup (Mailtrap → Sending Domains → flightcrew.fit → Integrations →
// Transactional Stream → API) — reuse it rather than creating a second one.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REPO_OWNER = "bchadcooper-create";
const REPO_NAME  = "pilot-program";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { message, contact_email, app_version } = await req.json();

    if (!message || typeof message !== "string" || !message.trim()) {
      return new Response(JSON.stringify({ error: "Feedback message is required." }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // Abuse guards: this endpoint is reachable with the public anon key, so cap
    // sizes (a scripted caller could otherwise open giant GitHub issues) and
    // rate-limit bursts within this isolate's lifetime.
    if (message.length > 4000 || (contact_email && String(contact_email).length > 200)) {
      return new Response(JSON.stringify({ error: "Feedback too long (4000 char max)." }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    globalThis._fcfSubmits = (globalThis._fcfSubmits || []).filter((t: number) => Date.now() - t < 60000);
    if (globalThis._fcfSubmits.length >= 5) {
      return new Response(JSON.stringify({ error: "Too many submissions — try again in a minute." }), {
        status: 429, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    globalThis._fcfSubmits.push(Date.now());

    const TOKEN = Deno.env.get("GITHUB_FEEDBACK_TOKEN") || "";
    if (!TOKEN) {
      return new Response(JSON.stringify({ error: "Feedback isn't configured yet — GITHUB_FEEDBACK_TOKEN missing." }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const bodyLines = [
      message.trim(),
      "",
      "---",
      `App version: ${app_version || "unknown"}`,
      contact_email ? `Contact (optional, provided by user): ${contact_email}` : "Contact: not provided",
    ];

    const ghRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "fcf-feedback-function",
      },
      body: JSON.stringify({
        title: `Feedback — ${new Date().toISOString().slice(0,10)}`,
        body: bodyLines.join("\n"),
      }),
    });

    const ghData = await ghRes.json();

    if (!ghRes.ok) {
      return new Response(JSON.stringify({ error: ghData.message || "Failed to file feedback.", detail: ghData }), {
        status: ghRes.status, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // Notify the admin directly by email — best-effort. GitHub already emails
    // the repo owner on new Issues by default, but that can get buried in a
    // busy inbox; this is a second, more prominent channel specifically for
    // feedback, using the same Mailtrap account already configured for
    // Supabase auth emails. A failure here never blocks the actual feedback
    // submission, which has already succeeded by this point.
    const MAILTRAP_TOKEN = Deno.env.get("MAILTRAP_API_TOKEN") || "";
    const ADMIN_EMAIL = Deno.env.get("ADMIN_NOTIFY_EMAIL") || "";
    if (MAILTRAP_TOKEN && ADMIN_EMAIL) {
      try {
        await fetch("https://send.api.mailtrap.io/api/send", {
          method: "POST",
          headers: { "Authorization": `Bearer ${MAILTRAP_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: { email: "noreply@flightcrew.fit", name: "Flight Crew Fitness" },
            to: [{ email: ADMIN_EMAIL }],
            subject: `New feedback — Issue #${ghData.number}`,
            text: bodyLines.join("\n") + `\n\nView on GitHub: ${ghData.html_url}`,
          }),
        });
      } catch (e) {
        // Swallow — feedback already succeeded, the email is a bonus.
      }
    }

    return new Response(JSON.stringify({ success: true, issue_number: ghData.number }), {
      headers: { ...CORS, "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
