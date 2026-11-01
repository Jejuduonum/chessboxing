import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/format';

/** Bottom sheet with scrim, Escape to close, focus moved in and restored on close. */
export function Sheet({ open, onClose, labelledBy, children }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = window.setTimeout(() => {
      setMounted(false);
      const el = returnTo.current;
      if (el && el.isConnected && el.getClientRects().length) el.focus();
      else document.getElementById('primary-action')?.focus();
    }, 180);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!shown || !panel.current) return;
    const target = panel.current.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current.querySelector<HTMLElement>('button, input, textarea');
    target?.focus({ preventScroll: true });
  }, [shown]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn('absolute inset-0 bg-[var(--scrim)] transition-opacity', shown ? 'opacity-100 duration-200 ease-out' : 'opacity-0 duration-150 ease-in')}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          'relative mx-auto max-h-[92dvh] w-full max-w-app overflow-y-auto rounded-t-[28px] bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 transition-transform',
          shown ? 'translate-y-0 duration-[240ms] ease-out' : 'translate-y-full duration-150 ease-in',
        )}
      >
        <div aria-hidden="true" className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
        {children}
      </div>
    </div>,
    document.body,
  );
}
