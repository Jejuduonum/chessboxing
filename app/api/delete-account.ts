/**
 * POST /api/delete-account — permanently deletes the signed-in user.
 * Every app table references auth.users with ON DELETE CASCADE, so all their data goes with it.
 */
import { adminClient, userFromRequest } from './_auth';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function POST(request: Request): Promise<Response> {
  const sb = adminClient();
  if (!sb) return json({ error: 'not_configured' }, 503);
  const user = await userFromRequest(request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const { error } = await sb.auth.admin.deleteUser(user.id);
  if (error) return json({ error: 'failed' }, 500);
  return json({ deleted: true });
}
