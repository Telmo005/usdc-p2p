import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client - server-only, never imported by anything
 * that ships to the browser. Used specifically to create pre-confirmed
 * accounts on sign-up: this Supabase project has no SMTP configured for
 * Auth emails ("Error sending confirmation email"), so the normal
 * `auth.signUp()` flow can't complete. Creating the user via the admin API
 * with `email_confirm: true` skips that requirement entirely.
 */
export function createAdminClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
