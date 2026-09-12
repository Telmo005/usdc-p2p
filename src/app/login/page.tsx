'use client';

import { useActionState, useState } from 'react';
import { signIn, signUp } from './actions';

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [signInState, signInAction, signInPending] = useActionState(signIn, undefined);
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, undefined);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">
        <h1 className="text-xl font-bold">
          P2P <span className="text-accent">Manager</span>
        </h1>
        <p className="mt-1 text-sm text-muted">Gestão profissional das tuas operações P2P.</p>

        <div className="mt-6 flex rounded-lg border border-border bg-background p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode('signin')}
            className={`flex-1 rounded-md py-1.5 font-medium transition ${mode === 'signin' ? 'bg-accent text-accent-foreground' : 'text-muted'}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 rounded-md py-1.5 font-medium transition ${mode === 'signup' ? 'bg-accent text-accent-foreground' : 'text-muted'}`}
          >
            Criar conta
          </button>
        </div>

        {mode === 'signin' ? (
          <form action={signInAction} className="mt-6 flex flex-col gap-4">
            <Field label="Email" name="email" type="email" required />
            <Field label="Palavra-passe" name="password" type="password" required />
            {signInState?.error && <p className="text-sm text-negative">{signInState.error}</p>}
            <SubmitButton pending={signInPending}>Entrar</SubmitButton>
          </form>
        ) : (
          <form action={signUpAction} className="mt-6 flex flex-col gap-4">
            <Field label="Nome" name="fullName" type="text" required />
            <Field label="Email" name="email" type="email" required />
            <Field label="Palavra-passe" name="password" type="password" required minLength={8} />
            {signUpState?.error && <p className="text-sm text-negative">{signUpState.error}</p>}
            <SubmitButton pending={signUpPending}>Criar conta</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, name, type, required, minLength }: { label: string; name: string; type: string; required?: boolean; minLength?: number }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        className="rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
      />
    </label>
  );
}

function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 rounded-lg bg-accent py-2.5 text-sm font-semibold text-accent-foreground transition disabled:opacity-60"
    >
      {pending ? 'A processar...' : children}
    </button>
  );
}
