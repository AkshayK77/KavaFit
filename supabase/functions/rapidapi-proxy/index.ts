import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'https://forge-fitness-pearl.vercel.app',
  'http://localhost:5173',
]

const ALLOWED_HOST = 'exercisedb.p.rapidapi.com'

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

    const body = await req.json()
    const { endpoint, params } = body as { endpoint?: string; params?: Record<string, string> }

    if (!endpoint || typeof endpoint !== 'string') {
      return new Response(JSON.stringify({ error: 'endpoint is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Prevent path traversal and restrict to the allowed host
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    const url = new URL(`https://${ALLOWED_HOST}${cleanEndpoint}`)

    if (params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v))
      }
    }

    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY')
    if (!rapidApiKey) {
      return new Response(JSON.stringify({ error: 'RapidAPI key not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const apiRes = await fetch(url.toString(), {
      headers: {
        'X-RapidAPI-Key': rapidApiKey,
        'X-RapidAPI-Host': ALLOWED_HOST,
      },
    })

    if (!apiRes.ok) {
      console.error('RapidAPI error:', apiRes.status, await apiRes.text())
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 502,
      })
    }

    const data = await apiRes.json()
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('rapidapi-proxy error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
