import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
// The anon key is safe for client-side use — all access is gated by Row Level Security.
// Never initialize this client with the service role key; that belongs in Edge Functions only.
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

export const supabase = createClient<Database>(supabaseUrl, supabaseKey)
