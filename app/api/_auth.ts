/**
 * Server-side Supabase helpers for api/ functions (files starting with "_" aren't deployed as routes).
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server environment — never in the app.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let admin: SupabaseClient | null | undefined;

/** Service-role client, or null when the server isn't connected to Supabase (local-only setups). */
export function adminClient(): SupabaseClient | null {
  if (admin !== undefined) return admin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  admin = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return admin;
}

/** The signed-in user behind a request's Bearer token, or null. */
export async function userFromRequest(request: Request): Promise<{ id: string; email?: string } | null> {
  const sb = adminClient();
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!sb || !token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email };
}
