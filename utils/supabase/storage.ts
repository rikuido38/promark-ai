import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Returns a Supabase client scoped exclusively to storage operations.
 * Uses the service role key so it works independent of user authentication.
 * Never use this client for auth or RLS-protected table queries.
 */
export function createStorageClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
