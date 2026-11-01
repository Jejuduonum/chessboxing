import { cn } from '../lib/format';
import type { Tab } from '../state/nav';
import { Icon } from './ui';

const TABS: { id: Tab; label: string; icon: string; active: string }[] = [
  { id: 'home', label: 'Home', icon: 'home', active: 'text-ink' },
  { id: 'chess', label: 'Chess', icon: 'pawn', active: 'text-chess-ink' },
  { id: 'weight', label: 'Weight', icon: 'scale', active: 'text-fit-ink' },
  { id: 'log', label: 'Log', icon: 'list', active: 'text-ink' },
];

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-app border-t border-line bg-bg pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-4">
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <li key={t.id}>
              <button
                onClick={() => onChange(t.id)}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'flex min-h-[72px] w-full flex-col items-center justify-center gap-1 text-[14px] transition-colors duration-150',
                  on ? cn(t.active, 'font-bold') : 'text-muted hover:text-ink',
                )}
              >
                <Icon name={t.icon} size={26} />
                <span>{t.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
