import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

/**
 * Returns the browser Supabase client, configured only with the project URL
 * and publishable key. Never put a Supabase secret/service-role key in Vite
 * environment variables or browser code.
 */
export function getSupabaseClient(): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
    );
  }

  if (!supabaseClient) {
    supabaseClient = createClient(url, publishableKey);
  }

  return supabaseClient;
}
