// Supabase Edge Function: fcf-appstore-notifications
//
// Receives App Store Server Notifications V2 and writes subscription
// entitlement. This is the ONLY thing that grants Pro — the client can read
// the subscriptions table but never write it, so if this endpoint is wrong
// or spoofable, the paywall is decorative.
//
// Deploy:
//   supabase functions deploy fcf-appstore-notifications --no-verify-jwt
//
// --no-verify-jwt is REQUIRED. Apple calls this endpoint with its own signed
// payload and no Supabase JWT; with JWT verification on, every notification
// is rejected before it reaches this code.
//
// Secrets:
//   FCF_SERVICE_ROLE_KEY  — writes entitlement, bypassing RLS
//   FCF_BUNDLE_ID         — e.g. fit.flightcrew.app (rejects payloads for
//                           any other app, so a notification for someone
//                           else's bundle can't touch this database)
//
// App Store Connect → your app → App Information → App Store Server
// Notifications → set the Production and Sandbox URLs to this function,
// version 2.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignedDataVerifier, Environment } from "npm:@apple/app-store-server-library@1.4.0";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY  = Deno.env.get('FCF_SERVICE_ROLE_KEY');
const BUNDLE_ID    = Deno.env.get('FCF_BUNDLE_ID');

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

// Apple's root certificates, fetched from Apple over HTTPS and cached for
// the life of the instance. Fetched rather than pasted in so there is no
// hand-copied certificate blob in the repo to go stale or be mistyped.
let rootCache: Uint8Array[] | null = null;
async function appleRootCerts(): Promise<Uint8Array[]> {
  if (rootCache) return rootCache;
  const urls = [
    'https://www.apple.com/appleca/AppleRootCA-G3.cer',
    'https://www.apple.com/appleca/AppleRootCA-G2.cer',
  ];
  const certs: Uint8Array[] = [];
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (r.ok) certs.push(new Uint8Array(await r.arrayBuffer()));
    } catch (_) { /* one root is enough; G3 is the one in use */ }
  }
  if (!certs.length) throw new Error('could not fetch Apple root certificates');
  rootCache = certs;
  return certs;
}

// Which notifications mean "has access" and which mean "does not".
//
// DID_CHANGE_RENEWAL_STATUS is deliberately absent: turning off auto-renew
// does NOT end access, it just means no future renewal. Treating it as a
// cancellation would cut someone off for time they already paid for.
function entitlementFor(notificationType: string, subtype: string | undefined) {
  switch (notificationType) {
    case 'SUBSCRIBED':
    case 'DID_RENEW':
    case 'OFFER_REDEEMED':
    case 'DID_CHANGE_RENEWAL_PREF':
      return { tier: 'pro', status: 'active' };

    // Billing failed but Apple is still retrying — access continues through
    // the grace period rather than being pulled the instant a card declines.
    case 'DID_FAIL_TO_RENEW':
      return subtype === 'GRACE_PERIOD'
        ? { tier: 'pro', status: 'grace' }
        : { tier: 'free', status: 'expired' };

    case 'EXPIRED':
    case 'GRACE_PERIOD_EXPIRED':
      return { tier: 'free', status: 'expired' };

    // Refunded or revoked — access ends immediately, whatever the period end
    // says, because the money has gone back.
    case 'REFUND':
    case 'REVOKE':
      return { tier: 'free', status: 'expired', revoked: true };

    default:
      return null;   // acknowledged but no entitlement change
  }
}

serve(async (req) => {
  try {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'function not configured' }, 500);
    if (!BUNDLE_ID) return json({ error: 'FCF_BUNDLE_ID secret not set' }, 500);

    const body = await req.json();
    const signedPayload = body?.signedPayload;
    if (!signedPayload) return json({ error: 'missing signedPayload' }, 400);

    // Verify Apple actually signed this. Without it anyone who finds the URL
    // can POST themselves a Pro subscription. Apple's own library is used
    // rather than hand-rolled JWS checks so the certificate chain is
    // validated properly rather than approximately.
    const roots = await appleRootCerts();
    let payload: any, environment = Environment.PRODUCTION;
    let verifyErr: unknown = null;

    // The same endpoint receives Sandbox and Production traffic, and a
    // payload only verifies against its own environment — so try both
    // rather than running two functions.
    for (const env of [Environment.PRODUCTION, Environment.SANDBOX]) {
      try {
        const verifier = new SignedDataVerifier(roots, true, env, BUNDLE_ID);
        payload = await verifier.verifyAndDecodeNotification(signedPayload);
        environment = env;
        verifyErr = null;
        break;
      } catch (e) { verifyErr = e; }
    }
    if (!payload) {
      // 401, not 500: this is a rejected payload, not a broken function.
      return json({ error: 'signature verification failed', detail: String(verifyErr) }, 401);
    }

    const notificationType = payload.notificationType;
    const subtype = payload.subtype;
    const renewalInfo = payload.data?.signedRenewalInfo;
    const txInfo = payload.data?.signedTransactionInfo;

    const verifier = new SignedDataVerifier(roots, true, environment, BUNDLE_ID);
    const tx = txInfo ? await verifier.verifyAndDecodeTransaction(txInfo) : null;
    const renewal = renewalInfo ? await verifier.verifyAndDecodeRenewalInfo(renewalInfo) : null;

    // appAccountToken is the Supabase user id, set by the app at purchase
    // time. Without it a notification cannot be attributed to an account —
    // Apple has no idea who our users are.
    const userId = tx?.appAccountToken || null;
    const originalTransactionId = tx?.originalTransactionId || renewal?.originalTransactionId || null;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const change = entitlementFor(notificationType, subtype);

    // Always acknowledge with 200. A non-2xx makes Apple retry for up to
    // three days, and retrying a notification we understood but chose not to
    // act on achieves nothing.
    if (!change) return json({ ok: true, ignored: notificationType });

    if (!userId) {
      // Fall back to matching an existing row by transaction id, which
      // covers a renewal for a purchase made before appAccountToken existed.
      if (!originalTransactionId) return json({ ok: true, warning: 'no user linkage on notification' });
      const { data: existing } = await admin.from('subscriptions')
        .select('user_id').eq('original_transaction_id', originalTransactionId).maybeSingle();
      if (!existing) return json({ ok: true, warning: 'unknown transaction, nothing to update' });
      await applyChange(admin, existing.user_id, change, tx, environment, originalTransactionId);
      return json({ ok: true, matched: 'by_transaction' });
    }

    await applyChange(admin, userId, change, tx, environment, originalTransactionId);
    return json({ ok: true, type: notificationType, subtype: subtype || null });

  } catch (e) {
    // 500 so Apple retries — this is our failure, not a bad payload.
    return json({ error: e?.message || 'unknown error' }, 500);
  }
});

async function applyChange(admin: any, userId: string, change: any, tx: any,
                           environment: string, originalTransactionId: string | null) {
  // A revoked or refunded subscription ends now. Otherwise access runs to
  // the expiry Apple reports, which is what the client also checks.
  const periodEnd = change.revoked
    ? new Date().toISOString()
    : (tx?.expiresDate ? new Date(tx.expiresDate).toISOString() : null);

  await admin.from('subscriptions').upsert({
    user_id: userId,
    tier: change.tier,
    status: change.status,
    platform: 'ios',
    product_id: tx?.productId || null,
    current_period_end: periodEnd,
    original_transaction_id: originalTransactionId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}
