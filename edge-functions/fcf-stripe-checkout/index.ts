// Supabase Edge Function: fcf-stripe-checkout
//
// Creates a Stripe Checkout Session for a WEB subscriber and returns the URL
// to redirect to. Web only — the iOS app uses StoreKit, because Apple still
// requires IAP for in-app digital purchases. A standalone web purchase that
// never originates from a link inside the app is invisible to Apple and
// carries no commission.
//
// Deploy: supabase functions deploy fcf-stripe-checkout
// Secrets:
//   FCF_STRIPE_SECRET_KEY    — sk_live_... (NEVER in the client or repo)
//   FCF_STRIPE_PRICE_ANNUAL  — price_... for $59.99/year
//   FCF_STRIPE_PRICE_MONTHLY — price_... for $7.99/month
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY');
const STRIPE_KEY   = Deno.env.get('FCF_STRIPE_SECRET_KEY');
const PRICE_ANNUAL = Deno.env.get('FCF_STRIPE_PRICE_ANNUAL');
const PRICE_MONTHLY= Deno.env.get('FCF_STRIPE_PRICE_MONTHLY');
const SITE_URL     = Deno.env.get('FCF_SITE_URL') || 'https://flightcrew.fit';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (!STRIPE_KEY) return json({ error: 'FCF_STRIPE_SECRET_KEY not set' }, 500);
    if (!SUPABASE_URL || !ANON_KEY) return json({ error: 'function not configured' }, 500);

    // Identify the caller from THEIR token. The user id is never accepted
    // from the request body, or anyone could buy a subscription onto someone
    // else's account — or worse, attach their own to an account they don't own.
    const authHeader = req.headers.get('Authorization') || '';
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'not authenticated' }, 401);

    const { plan } = await req.json().catch(() => ({ plan: 'annual' }));
    const price = plan === 'monthly' ? PRICE_MONTHLY : PRICE_ANNUAL;
    if (!price) return json({ error: 'price id not configured for plan: ' + plan }, 500);

    const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2024-06-20' });

    // Reuse the Stripe customer if this account already has one, so a
    // resubscribe doesn't create a duplicate customer with a split history.
    const admin = createClient(SUPABASE_URL, Deno.env.get('FCF_SERVICE_ROLE_KEY') || ANON_KEY);
    const { data: existing } = await admin.from('subscriptions')
      .select('stripe_customer_id').eq('user_id', user.id).maybeSingle();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      customer: existing?.stripe_customer_id || undefined,
      customer_email: existing?.stripe_customer_id ? undefined : user.email,
      // BOTH are set deliberately. client_reference_id is present on the
      // checkout session; metadata rides along onto the subscription object
      // itself, which is what later renewal and cancellation events carry.
      // Without the latter, a renewal two months from now arrives with no
      // way to tell whose account it belongs to.
      client_reference_id: user.id,
      subscription_data: { metadata: { supabase_user_id: user.id } },
      metadata: { supabase_user_id: user.id },
      success_url: SITE_URL + '/?checkout=success',
      cancel_url: SITE_URL + '/?checkout=cancelled',
      allow_promotion_codes: true,
    });

    return json({ url: session.url });
  } catch (e) {
    return json({ error: e?.message || 'unknown error' }, 500);
  }
});
