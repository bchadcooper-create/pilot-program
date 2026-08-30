// Supabase Edge Function: fcf-delete-account
//
// Deletes the calling user's auth record. Apple has required in-app account
// deletion since 2022 for any app supporting account creation, and its
// absence is an automatic App Store rejection. Deleting the auth user needs
// the service role, which must never reach the client — hence this function.
//
// Deploy:  supabase functions deploy fcf-delete-account
// Requires the project's SERVICE_ROLE_KEY as a secret named
// FCF_SERVICE_ROLE_KEY. Do NOT rely on the default SUPABASE_SERVICE_ROLE_KEY
// name being present; set it explicitly so it's obvious what this holds.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SERVICE_KEY = Deno.env.get('FCF_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!SUPABASE_URL || !ANON_KEY) return json({ error: 'function not configured' }, 500);
    if (!SERVICE_KEY) return json({ error: 'FCF_SERVICE_ROLE_KEY secret not set' }, 500);

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) return json({ error: 'missing Authorization header' }, 401);

    // Identify the caller from THEIR token. The user id is never taken from
    // the request body — otherwise anyone could delete anyone.
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await asUser.auth.getUser();
    if (userErr || !user) return json({ error: 'not authenticated' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Sweep owned rows server-side as well as from the client. The client
    // deletes what its RLS policies allow; this catches anything it couldn't,
    // so no orphaned personal data is left behind after the auth row goes.
    const tables = ['workout_sessions','meal_logs','weight_log','oura_daily',
                    'daily_inputs','food_photo_usage','photo_quota_weekly','subscriptions'];
    for (const t of tables) {
      try { await admin.from(t).delete().eq('user_id', user.id); } catch (_) { /* table may not exist */ }
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) return json({ error: 'could not delete auth user', detail: delErr.message }, 500);

    return json({ ok: true, deleted: user.id });
  } catch (e) {
    return json({ error: e.message || 'unknown error' }, 500);
  }
});
