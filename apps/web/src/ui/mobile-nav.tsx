'use client';

import { NavLink, NavDetails, MoreSummary } from '@/ui/nav-link';
import { ICON_MAP, type NavIconName } from '@/ui/sidebar-nav';
import { MoreHorizontal } from 'lucide-react';

export interface MobileNavItem {
  readonly href: string;
  readonly label: string;
  readonly short?: string;
  readonly icon: NavIconName;
  readonly exact?: boolean;
}

interface MobileNavProps {
  readonly items: readonly MobileNavItem[];
  readonly moreLabel: string;
}

const TAB_BAR_SLOTS = 5;

export function MobileNav({ items, moreLabel }: MobileNavProps) {
  const tabItems = items.length <= TAB_BAR_SLOTS ? items : items.slice(0, TAB_BAR_SLOTS - 1);
  const moreItems = items.length <= TAB_BAR_SLOTS ? [] : items.slice(TAB_BAR_SLOTS - 1);

  return (
    <nav
      aria-label="Navegación móvil"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto flex h-16 max-w-lg items-stretch">
        {tabItems.map((item) => {
          const Icon = ICON_MAP[item.icon];
          return (
            <li key={item.href} className="flex-1">
              <NavLink
                href={item.href}
                {...(item.exact === true ? { exact: true } : {})}
                hint="top"
                className="relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors [&[aria-current=page]>svg]:[stroke-width:2.25]"
                activeClassName="text-brand before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:rounded-pill before:bg-brand"
                idleClassName="text-muted active:text-ink"
              >
                {Icon && <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />}
                <span className="max-w-full truncate px-1">{item.short ?? item.label}</span>
              </NavLink>
            </li>
          );
        })}

        {moreItems.length > 0 && (
          <li className="flex-1">
            <NavDetails className="relative h-full">
              <MoreSummary
                hrefs={moreItems.map((item) => item.href)}
                className="flex h-full cursor-pointer list-none flex-col items-center justify-center gap-1 text-[11px] font-medium [&::-webkit-details-marker]:hidden"
                activeClassName="text-brand"
                idleClassName="text-muted"
              >
                <MoreHorizontal aria-hidden="true" className="size-5" strokeWidth={1.75} />
                <span>{moreLabel}</span>
              </MoreSummary>
              <div className="absolute right-2 bottom-[calc(100%+0.5rem)] w-56 rounded-card border border-line bg-surface p-1.5 shadow-lg">
                {moreItems.map((item) => {
                  const Icon = ICON_MAP[item.icon];
                  return (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      hint="inline"
                      className="flex items-center gap-3 rounded-control px-3 py-2.5 text-sm"
                      activeClassName="bg-brand-soft font-medium text-brand"
                      idleClassName="text-ink active:bg-subtle"
                    >
                      {Icon && (
                        <Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
                      )}
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </NavDetails>
          </li>
        )}
      </ul>
    </nav>
  );
}
