import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router';
import { snapshotQuery } from '../../api/snapshot';
import { LiveStatusCard } from './LiveStatusCard';
import { navigation } from '../../app/navigation';
import { siteConfig } from '../../config/site';
import { cn } from '../../lib/cn';

export function Sidebar() {
  const snapshot = useQuery(snapshotQuery());
  const live = snapshot.data?.live ?? null;
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-ink-200 bg-white">
      <div className="flex h-16 items-center gap-2.5 px-6">
        {/* 자체 워드마크. 삼양라운드스퀘어 CI 심볼은 쓰지 않는다. */}
        <span aria-hidden className="size-2.5 rounded-full bg-brand" />
        <span className="font-display text-[15px] font-semibold tracking-tight">
          {siteConfig.name}
        </span>
      </div>

      <nav aria-label="주 메뉴" className="flex-1 overflow-y-auto px-3 pb-6">
        {navigation.map((group) => (
          <div key={group.label} className="mt-5 first:mt-2">
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-ink-500">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map(({ path, label, icon: Icon }) => (
                <li key={path}>
                  <NavLink
                    to={path}
                    end={path === '/'}
                    className={({ isActive }) =>
                      cn(
                        'relative flex items-center gap-2.5 rounded-square px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-brand-50 font-semibold text-charcoal'
                          : 'text-ink-600 hover:bg-ink-50 hover:text-charcoal',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span
                            aria-hidden
                            className="absolute top-1/2 -left-3 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand"
                          />
                        )}
                        <Icon
                          aria-hidden
                          className={cn('size-4', isActive ? 'text-brand-700' : 'text-ink-500')}
                          strokeWidth={1.75}
                        />
                        {label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-ink-200 px-6 py-4">
        <LiveStatusCard live={live} compact />
      </div>
    </aside>
  );
}
