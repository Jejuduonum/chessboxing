import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client, or null when the app is built without Supabase settings.
 * Without them the app runs exactly as before: local-only, no sign-in.
 *
 * Set in .env.local (local) or the host's environment variables (deploy):
 *   VITE_SUPABASE_URL=https://<project>.supabase.co
 *   VITE_SUPABASE_ANON_KEY=<public anon key>
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      })
    : null;

export const cloudEnabled = supabase !== null;

/** Bearer header for our own server functions (coach, account deletion). */
export async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
