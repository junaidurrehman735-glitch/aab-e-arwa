import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

export function getSupabaseConfig(): { url: string; key: string } | null {
  const env = ((typeof import.meta !== 'undefined' && (import.meta as any).env)
    ? (import.meta as any).env
    : (typeof process !== 'undefined' ? process.env : {})) as Record<string, string | undefined>;

  const url = (
    env.VITE_SUPABASE_URL ||
    env.VITE_SUPABASE_PROJECT_URL ||
    ''
  ).trim();

  // Use the existing VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
  // Do not use VITE_SUPABASE_ANON_KEY if the publishable key is available.
  const key = (
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (url && key) {
    return { url, key };
  }
  return null;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

/**
 * Returns the browser Supabase client configured with project URL and Anon/Publishable key.
 * Compatible with Vite, Vercel, and local environment setups.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) {
    return cachedClient;
  }

  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  cachedClient = createClient(config.url, config.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return cachedClient;
}
