import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. **Server-only** — bypasses Row Level Security
 * using the service role key, so it must NEVER be imported into client code.
 * Used by webhooks, checkout (anonymous inserts), escrow release and cron.
 */
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
