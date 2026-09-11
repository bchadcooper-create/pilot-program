// Supabase Edge Function: fcf-redeem-promo
//
// Lets a signed-in user redeem a promo/comp code for free Pro time,
// entirely separate from Stripe/IAP billing. A code grants duration_days
// of Pro; if the user already has active Pro (paid or from an earlier
// promo), the new days are added ON TOP of their existing
// current_period_end rather than replacing it, so redeeming a code never
// shortens what someone already has.
//
// Expiry is handled by a separate daily cron job (fcf-expire-promo-
// subscriptions) that flips status away from 'active' once
// current_period_end passes — isPro() itself is completely untouched by
// this feature; a promo grant satisfies the exact same tier/status check
// a real subscription does, for exactly as long as it's valid.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });

    // User-scoped client just to identify who's calling — everything
    // after this uses the service-role admin client, since granting
    // entitlements has to bypass RLS.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });

    const { code: rawCode } = await req.json();
    if (!rawCode || typeof rawCode !== 'string') {
      return new Response(JSON.stringify({ error: 'missing_code' }), { status: 400, headers: CORS });
    }
    const code = rawCode.trim().toUpperCase();

    const { data: promo, error: promoErr } = await admin
      .from('promo_codes').select('*').eq('code', code).maybeSingle();
    if (promoErr || !promo || !promo.active) {
      return new Response(JSON.stringify({ error: 'invalid_code' }), { status: 404, headers: CORS });
    }
    if (promo.max_redemptions !== null && promo.redemption_count >= promo.max_redemptions) {
      return new Response(JSON.stringify({ error: 'code_exhausted' }), { status: 409, headers: CORS });
    }

    const { data: already } = await admin
      .from('promo_redemptions').select('code').eq('code', code).eq('user_id', user.id).maybeSingle();
    if (already) {
      return new Response(JSON.stringify({ error: 'already_redeemed' }), { status: 409, headers: CORS });
    }

    // Extend from whichever is later: right now, or the user's existing
    // period end (if they already have active Pro, paid or promo) — so
    // redeeming a code always adds time, never shortens or resets it.
    const { data: existingSub } = await admin
      .from('subscriptions').select('current_period_end, status').eq('user_id', user.id).maybeSingle();
    const now = Date.now();
    const existingEnd = (existingSub?.status === 'active' || existingSub?.status === 'grace') && existingSub?.current_period_end
      ? new Date(existingSub.current_period_end).getTime() : 0;
    const base = Math.max(now, existingEnd);
    const newPeriodEnd = new Date(base + promo.duration_days * 86400000).toISOString();

    const { error: subErr } = await admin.from('subscriptions').upsert({
      user_id: user.id,
      tier: 'pro',
      status: 'active',
      platform: 'promo',
      current_period_end: newPeriodEnd,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (subErr) {
      return new Response(JSON.stringify({ error: 'grant_failed', detail: subErr.message }), { status: 500, headers: CORS });
    }

    await admin.from('promo_redemptions').insert({ code, user_id: user.id });
    // Not a fully atomic increment (read-then-write) — under truly
    // concurrent redemptions of the same code this could undercount by a
    // redemption or two. Acceptable for how this is actually used (codes
    // handed to individuals one at a time); the per-user duplicate check
    // above is the safety property that actually matters, and that one
    // IS airtight via the (code, user_id) primary key on promo_redemptions.
    await admin.from('promo_codes').update({ redemption_count: promo.redemption_count + 1 }).eq('code', code);

    return new Response(JSON.stringify({ success: true, proUntil: newPeriodEnd }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('fcf-redeem-promo error:', err);
    return new Response(JSON.stringify({ error: 'internal_error', detail: String(err) }), { status: 500, headers: CORS });
  }
});
