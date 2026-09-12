import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/db';

/** For Server Components that require a logged-in user - middleware already redirects anonymous requests, this is the defense-in-depth check + profile fetch. */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const profile = await getProfile(user.id, user.email);
  return { user, profile };
}
