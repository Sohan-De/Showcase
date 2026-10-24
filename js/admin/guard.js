/**
 * Session guard. Imported by every admin page: redirects to login.html unless the
 * visitor has a Supabase session AND their user id is listed in the `admins` table.
 * (Real protection is RLS on the server; this only gives a clean user experience.)
 */
import { getClient } from '../client.js';

/** Absolute URL of an admin page, independent of how the host rewrites /admin vs /admin/. */
export const adminUrl = (f) => new URL('../../admin/' + f, import.meta.url).href;

export async function requireAdmin() {
  const db = await getClient();
  const { data: { session } } = await db.auth.getSession();
  if (!session) { location.replace(adminUrl('login.html')); return null; }
  const { data, error } = await db.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle();
  if (error || !data) {
    await db.auth.signOut();
    location.replace(adminUrl('login.html?denied=1'));
    return null;
  }
  db.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') location.replace(adminUrl('login.html')); });
  return { db, session };
}

export async function logout() {
  const db = await getClient();
  await db.auth.signOut();
  location.replace(adminUrl('login.html'));
}
