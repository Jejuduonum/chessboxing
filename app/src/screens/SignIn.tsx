import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/ui';
import { useCloud } from '../state/cloud';


/** Google "G" in its official four colours (Google's sign-in branding requires the multicolour mark). */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="21" height="21" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** OAuth returns failures in the URL: surface them once, then clean the address bar. */
function useOauthError(setError: (m: string | null) => void) {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const desc = q.get('error_description') ?? h.get('error_description') ?? q.get('error') ?? h.get('error');
    if (!desc) return;
    setError(
      /not enabled|unsupported provider|provider is not enabled/i.test(desc)
        ? 'Google sign-in isn’t switched on yet. Use the email link below, or enable the provider in Supabase.'
        : /access_denied|cancelled|canceled/i.test(desc)
          ? 'Google sign-in was cancelled. Nothing changed.'
          : 'Couldn’t sign in with Google. Try again, or use the email link.',
    );
    history.replaceState(null, '', window.location.pathname);
  }, [setError]);
}

/** Sign-in is Google-only: no emails are sent, so Supabase's email rate limit never applies. */
export function SignIn() {
  const cloud = useCloud();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useOauthError(setError);
  useEffect(() => { headingRef.current?.focus(); }, []);

  const withGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      await cloud.signInWithProvider('google');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(/not enabled|provider/i.test(msg)
        ? 'Google sign-in isn’t switched on yet. Enable the Google provider in Supabase.'
        : navigator.onLine === false
          ? 'You’re offline. Connect to the internet to sign in.'
          : 'Couldn’t reach Google. Try again in a moment.');
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-app flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+48px)]">
      <div className="flex gap-2" aria-hidden="true">
        <span className="h-2 w-7 rounded-full bg-chess" />
        <span className="h-2 w-7 rounded-full bg-fit" />
      </div>

      <h1 ref={headingRef} tabIndex={-1} className="mt-12 font-display text-[clamp(56px,17vw,72px)] font-bold uppercase leading-[0.9] outline-none">
        <span className="block">Sign in</span>
      </h1>
      <p className="mt-4 text-[18px] leading-relaxed text-muted">
        Back up your training and pick up on any device.
      </p>

      <div className="mt-8">
        <button
          onClick={() => void withGoogle()}
          disabled={busy}
          className="flex min-h-[56px] w-full items-center justify-center gap-3 rounded-2xl bg-ink text-[16px] font-semibold text-bg transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chess disabled:opacity-60"
        >
          <GoogleMark />
          <span>{busy ? 'Opening Google…' : 'Continue with Google'}</span>
        </button>
        <p className="mt-2 text-center text-[14px] text-muted">No password, no email links. Approve once and you’re in.</p>
        {error && <p role="alert" className="mt-3 flex items-start gap-2 text-[15px] font-medium text-warn"><Icon name="alert" size={20} /><span>{error}</span></p>}
      </div>

      <div className="mt-auto pt-10">
        <button onClick={cloud.continueWithoutAccount} className="min-h-[48px] w-full text-[17px] text-muted hover:text-ink">
          Continue without an account
        </button>
        <p className="mt-1 text-center text-[14px] text-muted">Without an account, your data stays only on this device.</p>
      </div>
    </main>
  );
}

export function Restoring() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-app flex-col items-center justify-center px-6 text-center" aria-live="polite" aria-busy="true">
      <Icon name="refresh" size={32} className="animate-spin text-chess-ink motion-reduce:animate-none" />
      <p className="mt-4 text-[19px] font-semibold">Restoring your data…</p>
      <p className="mt-1 text-[16px] text-muted">Downloading your goals, weigh-ins and sessions.</p>
    </main>
  );
}
