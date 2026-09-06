// Supabase Edge Function: fcf-push-token
//
// Stores an APNs device token for the authenticated user.
// Called by the web app when the iOS shell posts fcf:apnsToken.
//
// Deploy: supabase functions deploy fcf-push-token
//
// Requires this table (run once in Supabase SQL editor):
//
//   CREATE TABLE IF NOT EXISTS push_tokens (
//     id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
//     token      text NOT NULL,
//     platform   text NOT NULL DEFAULT 'apns',
//     created_at timestamptz DEFAULT now(),
//     updated_at timestamptz DEFAULT now(),
//     UNIQUE(user_id, token)
//   );
//   ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "Users manage own tokens" ON push_tokens
//     FOR ALL USING (auth.uid() = user_id);

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });

    const { token, platform = 'apns' } = await req.json();
    if (!token) return new Response(JSON.stringify({ error: 'token required' }), { status: 400, headers: CORS });

    // Upsert — same token can come in on every app launch
    const { error } = await supabase.from('push_tokens').upsert({
      user_id:    user.id,
      token,
      platform,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,token' });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('fcf-push-token error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
