/** Lazy Supabase client: the SDK is only downloaded when a page actually needs data. */
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_ESM } from './config.js';

let clientPromise;

export function getClient() {
  if (!clientPromise) {
    clientPromise = import(SUPABASE_ESM).then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      }),
    );
  }
  return clientPromise;
}
