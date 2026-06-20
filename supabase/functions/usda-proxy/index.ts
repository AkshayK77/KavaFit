import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'https://kavafit.vercel.app',
  'http://localhost:5173',
]

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1/foods/search'

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
    const { query, pageSize = 6, pageNumber = 1 } = body as {
      query?: string
      pageSize?: number
      pageNumber?: number
    }

    if (!query || typeof query !== 'string' || !query.trim()) {
      return new Response(JSON.stringify({ error: 'query is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const usdaKey = Deno.env.get('USDA_API_KEY')
    if (!usdaKey) {
      return new Response(JSON.stringify({ error: 'USDA API key not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const url = new URL(USDA_BASE)
    url.searchParams.set('query', query.trim())
    url.searchParams.set('pageSize', String(Math.min(Math.max(1, pageSize), 25)))
    url.searchParams.set('pageNumber', String(Math.max(1, pageNumber)))
    url.searchParams.set('api_key', usdaKey)

    const apiRes = await fetch(url.toString())

    if (!apiRes.ok) {
      console.error('USDA API error:', apiRes.status, await apiRes.text())
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
    console.error('usda-proxy error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
