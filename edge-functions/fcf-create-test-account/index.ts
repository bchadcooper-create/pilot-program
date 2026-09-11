// One-off admin utility: creates a single confirmed test account for QA
// via Claude in Chrome. Not part of the app, never called by client code.
// Safe to delete after use.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_SEED_SECRET = Deno.env.get('ADMIN_SEED_SECRET');

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

serve(async (req) => {
  const auth = req.headers.get('X-Seed-Secret');
  if (!ADMIN_SEED_SECRET || auth !== ADMIN_SEED_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const { email, password } = await req.json();
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { qa_test_account: true },
  });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  return new Response(JSON.stringify({ userId: data.user.id, email: data.user.email }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
