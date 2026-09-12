import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase client for Server Components / Route Handlers / Server Actions.
 * Reads the session from cookies - this is what `getCurrentUser()` (lib/auth.ts)
 * uses to know who's logged in. Only handles auth; actual app data goes
 * through lib/db.ts (direct Postgres), not through this client's `.from()`,
 * since `p2p_manager` isn't exposed to Supabase's PostgREST API.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component (not a Route Handler/Server Action) -
          // middleware.ts already refreshes the session cookie on every request,
          // so this can be safely ignored here.
        }
      },
    },
  });
}
