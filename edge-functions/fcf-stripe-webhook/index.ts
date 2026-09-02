// Supabase Edge Function: fcf-stripe-webhook
//
// Receives Stripe events and writes web subscription entitlement. As with the
// Apple webhook, this is the only thing that grants Pro to a web subscriber —
// the client can read the subscriptions table but never write it.
//
// Deploy: supabase functions deploy fcf-stripe-webhook --no-verify-jwt
// --no-verify-jwt is REQUIRED: Stripe calls this with its own signature and
// no Supabase JWT, so with JWT verification on every event is rejected.
//
// Secrets:
//   FCF_STRIPE_SECRET_KEY     — sk_live_...
//   FCF_STRIPE_WEBHOOK_SECRET — whsec_... from the Stripe webhook endpoint
//   FCF_SERVICE_ROLE_KEY      — writes entitlement, bypassing RLS
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY    = Deno.env.get('FCF_SERVICE_ROLE_KEY');
const STRIPE_KEY     = Deno.env.get('FCF_STRIPE_SECRET_KEY');
const WEBHOOK_SECRET = Deno.env.get('FCF_STRIPE_WEBHOOK_SECRET');

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

// Stripe status -> entitlement.
//
// past_due is the direct analogue of Apple's grace period: the card failed
// and Stripe is retrying, so access continues rather than being pulled the
// instant a payment declines.
//
// Note what is NOT here: cancel_at_period_end. Cancelling still leaves the
// subscription 'active' until the period actually ends, and the row keeps
// current_period_end — so someone who cancels keeps what they paid for.
function entitlementForStripe(status: string) {
  switch (status) {
    case 'active':
    case 'trialing':
      return { tier: 'pro', status: 'active' };
    case 'past_due':
														 
      return { tier: 'pro', status: 'grace' };
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return { tier: 'free', status: 'expired' };
    default:
      return null;   // incomplete / paused — no change until it resolves
  }
}

serve(async (req) => {
  try {
    if (!STRIPE_KEY || !WEBHOOK_SECRET) return json({ error: 'stripe secrets not set' }, 500);
    if (!SUPABASE_URL || !SERVICE_KEY)  return json({ error: 'function not configured' }, 500);

    const sig = req.headers.get('stripe-signature');
    if (!sig) return json({ error: 'missing stripe-signature' }, 400);

    const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2024-06-20' });
    const raw = await req.text();   // RAW body — parsing first breaks the signature

    let event: Stripe.Event;
    try {
      // constructEventAsync, not constructEvent: Deno's crypto is async and
      // the synchronous version silently fails here.
      event = await stripe.webhooks.constructEventAsync(raw, sig, WEBHOOK_SECRET);
    } catch (e) {
      // 400, not 500: a bad signature is a rejected request, not our failure,
      // and Stripe should not retry it.
      return json({ error: 'signature verification failed', detail: String(e) }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const obj: any = event.data.object;

    // Resolve the account. metadata is set on the subscription at checkout so
    // it survives onto every later renewal event; client_reference_id only
    // exists on the checkout session itself.
    let userId: string | null =
      obj?.metadata?.supabase_user_id || obj?.client_reference_id || null;

    let sub: any = null;
    if (event.type === 'checkout.session.completed') {
      if (obj.subscription) sub = await stripe.subscriptions.retrieve(obj.subscription);
    } else if (event.type.startsWith('customer.subscription.')) {
      sub = obj;
      userId = userId || sub?.metadata?.supabase_user_id || null;
    } else if (event.type === 'invoice.payment_failed' || event.type === 'invoice.paid') {
      if (obj.subscription) sub = await stripe.subscriptions.retrieve(obj.subscription);
      userId = userId || sub?.metadata?.supabase_user_id || null;
    } else {
      return json({ ok: true, ignored: event.type });
    }

    if (!sub) return json({ ok: true, warning: 'no subscription on event' });

    // Fall back to matching an existing row by customer id — covers an event
    // whose metadata is missing for any reason.
    if (!userId) {
      const { data: existing } = await admin.from('subscriptions')
        .select('user_id').eq('stripe_customer_id', sub.customer).maybeSingle();
      userId = existing?.user_id || null;
    }
    if (!userId) return json({ ok: true, warning: 'no user linkage on event' });

    const change = entitlementForStripe(sub.status);
    if (!change) return json({ ok: true, ignored_status: sub.status });

    await admin.from('subscriptions').upsert({
      user_id: userId,
      tier: change.tier,
      status: change.status,
      platform: 'web',
      product_id: sub.items?.data?.[0]?.price?.id || null,
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString() : null,
      stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null,
      stripe_subscription_id: sub.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    return json({ ok: true, type: event.type, status: sub.status });
  } catch (e) {
    // 500 so Stripe retries — this is our failure, not a bad event.
    return json({ error: e?.message || 'unknown error' }, 500);
  }
});
