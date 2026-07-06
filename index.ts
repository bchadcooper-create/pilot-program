// Supabase Edge Function: oura-auth
// Handles OAuth2 token exchange and refresh for Oura Ring API.
// The client_secret never leaves this function — it is stored
// as a Supabase secret environment variable (OURA_CLIENT_SECRET).
//
// Deploy with:
//   supabase functions deploy oura-auth --no-verify-jwt
// Set secrets with:
//   supabase secrets set OURA_CLIENT_SECRET=your_secret_here
//   supabase secrets set OURA_CLIENT_ID=your_client_id_here

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { action, code, refresh_token, redirect_uri } = await req.json();

    const CLIENT_ID     = Deno.env.get("OURA_CLIENT_ID") || "";
    const CLIENT_SECRET = Deno.env.get("OURA_CLIENT_SECRET") || "";

    if (!CLIENT_ID || !CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: "Oura credentials not configured in Edge Function secrets" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    let body: Record<string, string> = {};

    if (action === "exchange") {
      // Exchange authorization code for tokens
      body = {
        grant_type:    "authorization_code",
        code:          code,
        redirect_uri:  redirect_uri,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
      };
    } else if (action === "refresh") {
      // Refresh an expired access token
      body = {
        grant_type:    "refresh_token",
        refresh_token: refresh_token,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
      };
    } else {
      return new Response(JSON.stringify({ error: "Invalid action. Use 'exchange' or 'refresh'." }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const tokenRes = await fetch("https://api.ouraring.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams(body),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      return new Response(JSON.stringify({ error: tokenData.error || "Token exchange failed", detail: tokenData }), {
        status: tokenRes.status, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify(tokenData), {
      headers: { ...CORS, "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
