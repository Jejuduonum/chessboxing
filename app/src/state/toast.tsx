import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/format';

type Undo = () => void | Promise<void>;
interface ToastApi {
  show: (message: string, undo?: Undo) => void;
}
const Ctx = createContext<ToastApi>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; undo?: Undo } | null>(null);
  const [shown, setShown] = useState(false);
  const timers = useRef<number[]>([]);

  const clear = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };

  const show = useCallback<ToastApi['show']>((message, undo) => {
    clear();
    const id = Date.now();
    setToast({ id, message, undo });
    requestAnimationFrame(() => setShown(true));
    timers.current.push(
      window.setTimeout(() => setShown(false), undo ? 5000 : 3000),
      window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), (undo ? 5000 : 3000) + 200),
    );
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="toast-dock pointer-events-none fixed inset-x-0 z-50 mx-auto max-w-app px-4">
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className={cn(
              'flex min-h-[52px] items-center gap-3 rounded-2xl bg-ink py-1 pl-4 pr-1 text-[15px] font-medium text-bg shadow-lg transition duration-200',
              shown ? 'translate-y-0 opacity-100 ease-out' : 'translate-y-2 opacity-0 ease-in',
            )}
          >
            <span className="min-w-0 flex-1 py-2">{toast.message}</span>
            {toast.undo && (
              <button
                className="pointer-events-auto min-h-[44px] rounded-xl px-4 font-bold text-bg underline underline-offset-4"
                onClick={async () => {
                  const fn = toast.undo;
                  if (fn) await fn();
                  show('Undone');
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
