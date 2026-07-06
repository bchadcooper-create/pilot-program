# Deploy Instructions for oura-auth Edge Function

## Prerequisites
- Supabase CLI installed: https://supabase.com/docs/guides/cli
- Logged in: `supabase login`
- Linked to project: `supabase link --project-ref dnxkydxbyihgsictbzjz`

## 1. Deploy the function
```bash
supabase functions deploy oura-auth --no-verify-jwt
```
The `--no-verify-jwt` flag allows the OAuth callback (which arrives without a Supabase
auth token) to still call this function.

## 2. Set the secrets (replace with your actual values)
```bash
supabase secrets set OURA_CLIENT_ID=your_client_id_here
supabase secrets set OURA_CLIENT_SECRET=your_client_secret_here
```
The client secret NEVER goes in app.js — it lives only here.

## 3. Verify deployment
The function URL will be:
https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/oura-auth

## 4. Test it
```bash
curl -X POST https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/oura-auth \
  -H "Content-Type: application/json" \
  -d '{"action":"exchange","code":"test","redirect_uri":"https://bchadcooper-create.github.io/pilot-program/"}'
```
Should return a token error from Oura (not a 500), confirming the function is live.
