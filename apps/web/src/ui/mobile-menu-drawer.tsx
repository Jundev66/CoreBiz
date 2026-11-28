'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Menu, ShoppingCart, X } from 'lucide-react';
import { ICON_MAP, type SidebarNavItem } from '@/ui/sidebar-nav';
import { NavLink } from '@/ui/nav-link';
import { Logo } from '@/ui/logo';

interface MobileMenuDrawerProps {
  readonly items: readonly SidebarNavItem[];
  readonly appName: string;
  readonly posUrl: string;
  readonly fiscalLabel: string;
}

export function MobileMenuDrawer({ items, appName, posUrl, fiscalLabel }: MobileMenuDrawerProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menú de módulos"
        aria-expanded={open}
        className="grid size-9 place-items-center rounded-control border border-nav-line bg-surface text-nav-ink transition hover:bg-subtle"
      >
        <Menu aria-hidden="true" className="size-4" strokeWidth={2} />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Menú de módulos"
          >
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-ink/40 backdrop-blur-xs"
            />

            <div className="relative z-10 flex h-full w-[min(20rem,86vw)] flex-col border-r border-nav-line bg-nav shadow-xl">
              <div className="flex h-14 items-center justify-between border-b border-nav-line/80 px-4">
                <Logo name={appName} />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar menú"
                  className="grid size-8 place-items-center rounded-control text-nav-muted hover:bg-subtle hover:text-nav-ink"
                >
                  <X aria-hidden="true" className="size-4" strokeWidth={2} />
                </button>
              </div>

              <div className="border-b border-nav-line/60 px-4 py-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  {fiscalLabel}
                </span>
              </div>

              <nav
                className="flex-1 space-y-4 overflow-y-auto px-3 py-4"
                aria-label="Módulos móviles"
              >
                {items.map((entry) => {
                  if (entry.type === 'link') {
                    const Icon = ICON_MAP[entry.item.icon];
                    return (
                      <NavLink
                        key={entry.item.href}
                        href={entry.item.href}
                        {...(entry.item.exact === true ? { exact: true } : {})}
                        hint="inline"
                        className="flex items-center gap-2.5 rounded-control px-3 py-2 text-sm font-medium transition-colors"
                        activeClassName="bg-brand-soft text-brand font-semibold"
                        idleClassName="text-nav-ink hover:bg-subtle"
                      >
                        {Icon && (
                          <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
                        )}
                        <span>{entry.item.label}</span>
                      </NavLink>
                    );
                  }

                  const GroupIcon = ICON_MAP[entry.group.icon];
                  return (
                    <div key={entry.group.id} className="space-y-1">
                      <div className="flex items-center gap-2 px-3 py-1 text-[11px] font-bold tracking-wider text-nav-muted uppercase">
                        {GroupIcon && (
                          <GroupIcon aria-hidden="true" className="size-3.5" strokeWidth={2} />
                        )}
                        <span>{entry.group.label}</span>
                      </div>
                      <div className="space-y-0.5">
                        {entry.group.items.map((sub) => {
                          const SubIcon = ICON_MAP[sub.icon];
                          return (
                            <NavLink
                              key={sub.href}
                              href={sub.href}
                              {...(sub.exact === true ? { exact: true } : {})}
                              hint="inline"
                              className="flex items-center gap-2.5 rounded-control px-3 py-2 text-sm transition-colors"
                              activeClassName="bg-brand-soft text-brand font-semibold"
                              idleClassName="text-nav-ink hover:bg-subtle"
                            >
                              {SubIcon && (
                                <SubIcon
                                  aria-hidden="true"
                                  className="size-4 shrink-0"
                                  strokeWidth={1.75}
                                />
                              )}
                              <span className="truncate">{sub.label}</span>
                            </NavLink>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </nav>

              <div className="border-t border-nav-line/80 p-3">
                <a
                  href={posUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-3 py-2.5 text-xs font-semibold text-brand-ink shadow-xs transition hover:bg-brand-hover"
                >
                  <ShoppingCart aria-hidden="true" className="size-4 shrink-0" />
                  <span>Abrir Terminal POS</span>
                </a>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
