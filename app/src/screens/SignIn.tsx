import { useEffect, useRef, useState } from 'react';
import { BigButton, Icon, inputClass } from '../components/ui';
import { useCloud } from '../state/cloud';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Magic-link sign-in. Shown before Welcome when the app is connected to Supabase. */
export function SignIn() {
  const cloud = useCloud();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);
  useEffect(() => { headingRef.current?.focus(); }, [sentTo]);

  const invalid = !EMAIL.test(email.trim());
  const send = async (override?: string) => {
    const addr = (override ?? email).trim().toLowerCase();
    setTouched(true);
    if (!EMAIL.test(addr)) return;
    setBusy(true);
    setError(null);
    try {
      await cloud.sendMagicLink(addr);
      setSentTo(addr);
      setCooldown(60);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(/rate|too many|seconds/i.test(msg)
        ? 'Too many sign-in emails just now. Wait a minute, then try again.'
        : navigator.onLine === false ? 'You’re offline. Connect to the internet to sign in.' : 'Couldn’t send the sign-in email. Check the address and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-app flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+48px)]">
      <div className="flex gap-2" aria-hidden="true">
        <span className="h-2 w-7 rounded-full bg-chess" />
        <span className="h-2 w-7 rounded-full bg-fit" />
      </div>

      {!sentTo ? (
        <>
          <h1 ref={headingRef} tabIndex={-1} className="mt-12 font-display text-[clamp(56px,17vw,72px)] font-bold uppercase leading-[0.9] outline-none">
            <span className="block">Sign in</span>
          </h1>
          <p className="mt-4 text-[18px] leading-relaxed text-muted">
            Back up your training and pick up on any device. We’ll email you a sign-in link — no password.
          </p>
          <div className="mt-8">
            <label htmlFor="email" className="mb-1.5 block text-[15px] text-muted">Email</label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
              aria-invalid={touched && invalid}
              aria-describedby={touched && invalid ? 'email-error' : error ? 'send-error' : undefined}
              placeholder="you@example.com"
            />
            {touched && invalid && <p id="email-error" className="mt-1.5 text-[14px] font-medium text-warn">Enter a valid email address.</p>}
            {error && <p id="send-error" role="alert" className="mt-2 flex items-start gap-2 text-[15px] font-medium text-warn"><Icon name="alert" size={20} /><span>{error}</span></p>}
          </div>
          <div className="mt-auto pt-10">
            <BigButton onClick={() => void send()} disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</BigButton>
            <button onClick={cloud.continueWithoutAccount} className="mt-2 min-h-[48px] w-full text-[17px] text-muted hover:text-ink">
              Continue without an account
            </button>
            <p className="mt-1 text-center text-[14px] text-muted">Without an account, your data stays only on this device.</p>
          </div>
        </>
      ) : (
        <>
          <h1 ref={headingRef} tabIndex={-1} className="mt-12 font-display text-[clamp(56px,17vw,72px)] font-bold uppercase leading-[0.9] outline-none">Check your inbox</h1>
          <div className="mt-6 rounded-3xl bg-surface p-5" aria-live="polite">
            <p className="flex items-center gap-3 text-[17px]">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-chess-soft text-chess-ink"><Icon name="check" size={24} /></span>
              <span>We sent a sign-in link to <b className="break-all">{sentTo}</b>.</span>
            </p>
            <p className="mt-4 text-[16px] text-muted">Open it on this device to sign in. It can take a minute — check spam if it doesn’t show up.</p>
          </div>
          {error && <p role="alert" className="mt-3 text-[15px] font-medium text-warn">{error}</p>}
          <div className="mt-auto pt-10">
            <BigButton tone="surface" className="bg-raised" disabled={cooldown > 0 || busy} onClick={() => void send(sentTo)}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : busy ? 'Sending…' : 'Resend link'}
            </BigButton>
            <button onClick={() => { setSentTo(null); setError(null); }} className="mt-2 min-h-[48px] w-full text-[17px] text-muted hover:text-ink">Use a different email</button>
          </div>
        </>
      )}
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
