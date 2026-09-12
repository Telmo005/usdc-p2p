'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function signIn(_prevState: { error?: string } | undefined, formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'Email ou palavra-passe incorretos.' };

  revalidatePath('/', 'layout');
  redirect('/');
}

export async function signUp(_prevState: { error?: string; success?: boolean } | undefined, formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const fullName = String(formData.get('fullName') ?? '');

  if (password.length < 8) return { error: 'A palavra-passe precisa de pelo menos 8 caracteres.' };

  // This Supabase project has no SMTP configured, so the normal signUp()
  // flow fails trying to send a confirmation email. Create the account
  // pre-confirmed via the admin API instead, then sign in immediately -
  // no email round-trip needed.
  const admin = createAdminClient();
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError) {
    // `auth.users` is shared with other real systems in this Supabase
    // project - this exact email can already exist there (created by
    // payments/p2p_arbitrage/metical_edge) even though it's never signed up
    // *here* before. Supabase's own message for that case is accurate but
    // easy to misread as "something went wrong" - make the actual next step
    // explicit instead.
    if (createError.status === 422 || /already.*registered/i.test(createError.message)) {
      return { error: 'Já existe uma conta com este email. Experimenta "Entrar" - se não souberes a palavra-passe, pede-nos para a repormos.' };
    }
    return { error: createError.message };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return { error: 'Conta criada, mas falhou o login automático. Tenta entrar manualmente.' };

  revalidatePath('/', 'layout');
  redirect('/');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
