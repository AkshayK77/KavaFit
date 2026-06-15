import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'https://forge-fitness-pearl.vercel.app',
  'http://localhost:5173',
]

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
]

// 8s per endpoint × 3 = 24s max, well within the client's 30s timeout
const ENDPOINT_TIMEOUT_MS = 8000

serve(async (req) => {
  const origin = req.headers.get('Origin')
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : null

  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin ?? '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    if (!allowedOrigin) return new Response('Forbidden', { status: 403 })
    return new Response('ok', { headers: corsHeaders })
  }

  if (!allowedOrigin) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 403,
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const { lat, lng } = await req.json() as { lat: number; lng: number }

    if (!lat || !lng) {
      return new Response(JSON.stringify({ error: 'lat and lng required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const query = `[out:json];(node["leisure"="fitness_centre"](around:10000,${lat},${lng});node["amenity"="gym"](around:10000,${lat},${lng}););out body;`

    let lastErr: unknown
    for (const endpoint of ENDPOINTS) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), ENDPOINT_TIMEOUT_MS)
        const res = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'ForgeApp/1.0 (fitness app; https://forge-fitness-pearl.vercel.app)',
          },
        })
        clearTimeout(timer)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } catch (err) {
        lastErr = err
      }
    }

    console.error('gyms: all Overpass endpoints failed:', lastErr)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 502,
    })
  } catch (err) {
    console.error('gyms error:', err)
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
