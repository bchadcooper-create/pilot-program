// Supabase Edge Function: usda-food
// Proxies USDA FoodData Central so the API key never sits in client-side JS.
// Deploy with: supabase functions deploy usda-food
// Then set the secret: supabase secrets set USDA_API_KEY=your_key_here
// Get a free key at https://api.data.gov/signup (instant, no approval wait).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const USDA_API_KEY = Deno.env.get('USDA_API_KEY');
const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!USDA_API_KEY) {
      return new Response(JSON.stringify({ error: 'USDA_API_KEY not configured as a Supabase secret' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { action, query, fdcId } = await req.json();
    let url;

    if (action === 'search') {
      if (!query || !query.trim()) {
        return new Response(JSON.stringify({ error: 'query required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      // Branded + Foundation + SR Legacy covers packaged products and generic
      // whole foods — Survey (FNDDS) data is skipped, it's meant for research
      // use and tends to return odd, overly-specific entries for everyday search.
      //
      // BUG FIX: pageSize was 15. USDA's own relevance ranking for a bare,
      // common word like "chicken" fills a 15-item window with odd matches
      // ("Chicken spread", "Chicken, meatless", "Fat, chicken") before ever
      // reaching "Chicken, broilers or fryers, breast" — which sits further
      // down because it's a longer, more specific product name. The client
      // re-sorts what it's given but can't promote something outside the
      // page it received. 50 gives the client-side staple boost (see
      // STAPLE_FOOD_BOOSTS in app.js) a wide enough pool to actually find
      // the generic entry and promote it, at negligible extra payload cost.
      url = `${USDA_BASE}/foods/search?query=${encodeURIComponent(query.trim())}&pageSize=50&dataType=Branded,Foundation,SR%20Legacy&api_key=${USDA_API_KEY}`;
    } else if (action === 'lookup') {
      if (!fdcId) {
        return new Response(JSON.stringify({ error: 'fdcId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      url = `${USDA_BASE}/food/${encodeURIComponent(fdcId)}?api_key=${USDA_API_KEY}`;
    } else {
      return new Response(JSON.stringify({ error: 'invalid action, expected "search" or "lookup"' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const res = await fetch(url);
    const data = await res.json();
    return new Response(JSON.stringify(data), { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || 'unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
