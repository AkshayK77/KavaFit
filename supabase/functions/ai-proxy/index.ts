import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RATE_LIMIT = 20
const RATE_WINDOW_SECONDS = 60
const MAX_MESSAGES = 50
const MAX_CONTENT_CHARS = 8000
const MAX_SYSTEM_PROMPT_CHARS = 4000
const VALID_ROLES = ['user', 'assistant', 'system']
const VALID_MODES = ['flags', 'recipe', 'workout', 'grocery', 'warmup']

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // Verify the caller has a valid Supabase session
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

    // Per-user rate limiting via service role client (bypasses RLS)
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const now = new Date()
    const windowCutoff = new Date(now.getTime() - RATE_WINDOW_SECONDS * 1000)

    const { data: rateRow } = await adminClient
      .from('rate_limits')
      .select('window_start, request_count')
      .eq('user_id', user.id)
      .single()

    if (rateRow) {
      const windowExpired = new Date(rateRow.window_start) < windowCutoff
      if (windowExpired) {
        await adminClient.from('rate_limits').upsert({
          user_id: user.id,
          window_start: now.toISOString(),
          request_count: 1,
        })
      } else if (rateRow.request_count >= RATE_LIMIT) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please wait before sending another message.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      } else {
        await adminClient
          .from('rate_limits')
          .update({ request_count: rateRow.request_count + 1 })
          .eq('user_id', user.id)
      }
    } else {
      await adminClient.from('rate_limits').insert({
        user_id: user.id,
        window_start: now.toISOString(),
        request_count: 1,
      })
    }

    // Parse and validate request body
    const body = await req.json()
    const { messages, model = 'llama-3.3-70b-versatile', temperature = 0.7, systemPrompt, mode } = body

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages array required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    if (messages.length === 0 || messages.length > MAX_MESSAGES) {
      return new Response(
        JSON.stringify({ error: `messages must contain 1 to ${MAX_MESSAGES} items` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    for (const msg of messages) {
      if (!VALID_ROLES.includes(msg.role)) {
        return new Response(
          JSON.stringify({ error: `Invalid role "${msg.role}". Must be one of: ${VALID_ROLES.join(', ')}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      if (typeof msg.content !== 'string' || msg.content.length > MAX_CONTENT_CHARS) {
        return new Response(
          JSON.stringify({ error: `Message content must be a string of max ${MAX_CONTENT_CHARS} characters` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    if (systemPrompt !== undefined) {
      if (typeof systemPrompt !== 'string' || systemPrompt.length > MAX_SYSTEM_PROMPT_CHARS) {
        return new Response(
          JSON.stringify({ error: `systemPrompt must be a string of max ${MAX_SYSTEM_PROMPT_CHARS} characters` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    if (mode !== undefined && !VALID_MODES.includes(mode)) {
      return new Response(
        JSON.stringify({ error: `Invalid mode. Must be one of: ${VALID_MODES.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (!groqKey) {
      return new Response(JSON.stringify({ error: 'Groq API key not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`,
      },
      body: JSON.stringify({ model, messages, temperature }),
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      return new Response(JSON.stringify({ error: `Groq error: ${errText}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 502,
      })
    }

    const groqData = await groqRes.json()
    const content = groqData?.choices?.[0]?.message?.content ?? ''

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
