import type { NextRequest } from 'next/server';
import { createClient as createSupabaseClient, type User } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

/**
 * Authenticates a Route Handler request either via a mobile client's
 * `Authorization: Bearer <access_token>` header (the Android app has no
 * browser cookies to send) or, falling back, via the cookie-based session
 * (@supabase/ssr) that the web app's own fetches send automatically. Returns
 * null if neither yields a valid user - callers should respond 401.
 */
export async function getApiUser(req: NextRequest): Promise<User | null> {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user;
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
