import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase URL or Anon Key is missing from environment variables.")
}

/** @type {import('@supabase/supabase-js').SupabaseClient<import('@/lib/database.types').Database>} */
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
