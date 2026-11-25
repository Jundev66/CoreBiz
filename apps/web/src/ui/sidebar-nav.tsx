'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Building2,
  FileText,
  LayoutDashboard,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { NavLink } from '@/ui/nav-link';
import { moduleTone, NAV_ICON } from '@/ui/module-tone';

export const ICON_MAP = {
  home: LayoutDashboard,
  cart: ShoppingCart,
  receipt: Receipt,
  fileText: FileText,
  banknote: Banknote,
  package: Package,
  alert: AlertTriangle,
  truck: Truck,
  building: Building2,
  users: Users,
  chart: BarChart3,
  settings: Settings,
} as const;

export type NavIconName = keyof typeof ICON_MAP;

export interface NavLeafItem {
  readonly href: string;
  readonly label: string;
  readonly icon: NavIconName;
  readonly exact?: boolean;
}

export interface NavSectionGroup {
  readonly id: string;
  readonly label: string;
  readonly icon: NavIconName;
  readonly items: readonly NavLeafItem[];
}

export type SidebarNavItem =
  | { readonly type: 'link'; readonly item: NavLeafItem }
  | { readonly type: 'group'; readonly group: NavSectionGroup };

interface SidebarNavProps {
  readonly items: readonly SidebarNavItem[];
}

function isLeafActive(pathname: string, item: NavLeafItem): boolean {
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function findActiveGroupId(pathname: string, items: readonly SidebarNavItem[]): string | null {
  let bestGroupId: string | null = null;
  let bestLength = -1;

  for (const entry of items) {
    if (entry.type !== 'group') continue;
    for (const sub of entry.group.items) {
      if (isLeafActive(pathname, sub) && sub.href.length > bestLength) {
        bestLength = sub.href.length;
        bestGroupId = entry.group.id;
      }
    }
  }

  return bestGroupId;
}

export function SidebarNav({ items }: SidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [navFilter, setNavFilter] = useState('');
  const [isPanelOpen, setIsPanelOpen] = useState(true);

  const groups = useMemo(
    () =>
      items
        .filter(
          (entry): entry is { readonly type: 'group'; readonly group: NavSectionGroup } =>
            entry.type === 'group',
        )
        .map((entry) => entry.group),
    [items],
  );

  const homeEntry = useMemo(
    () =>
      items.find(
        (entry): entry is { readonly type: 'link'; readonly item: NavLeafItem } =>
          entry.type === 'link',
      ),
    [items],
  );

  const routeGroupId = useMemo(() => findActiveGroupId(pathname, items), [pathname, items]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    routeGroupId ?? groups[0]?.id ?? 'ventas',
  );

  useEffect(() => {
    if (routeGroupId) {
      setSelectedGroupId(routeGroupId);
    }
  }, [routeGroupId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const q = navFilter.trim().toLowerCase();

  const searchResults = useMemo(() => {
    if (!q) return [];
    const results: Array<{ readonly groupLabel: string; readonly item: NavLeafItem }> = [];
    if (homeEntry && homeEntry.item.label.toLowerCase().includes(q)) {
      results.push({ groupLabel: 'Principal', item: homeEntry.item });
    }
    for (const group of groups) {
      for (const sub of group.items) {
        if (sub.label.toLowerCase().includes(q) || group.label.toLowerCase().includes(q)) {
          results.push({ groupLabel: group.label, item: sub });
        }
      }
    }
    return results;
  }, [q, homeEntry, groups]);

  const activeGroup = groups.find((g) => g.id === selectedGroupId) ?? groups[0] ?? null;

  const renderLeaf = (item: NavLeafItem, subtitle?: string) => {
    const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
    const active = isLeafActive(pathname, item);

    return (
      <NavLink
        key={item.href}
        href={item.href}
        {...(item.exact === true ? { exact: true } : {})}
        hint="inline"
        className={`group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all ${
          active ? 'bg-brand/12 text-ink font-semibold shadow-2xs' : ''
        }`}
        activeClassName="bg-brand/12 text-ink font-semibold"
        idleClassName="text-nav-muted hover:bg-nav-raised/80 hover:text-nav-ink"
      >
        {active && (
          <span
            aria-hidden="true"
            className="absolute top-2 bottom-2 left-0 w-1 rounded-r-full bg-brand"
          />
        )}
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-lg transition-colors ${
            active
              ? 'bg-brand text-brand-ink shadow-xs'
              : 'bg-nav-raised/80 text-nav-muted group-hover:bg-nav-raised group-hover:text-nav-ink'
          }`}
        >
          <Icon
            aria-hidden="true"
            className={`size-3.5 ${active ? 'text-current' : NAV_ICON[moduleTone(item.href)]}`}
            strokeWidth={2}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{item.label}</span>
          {subtitle && (
            <span className="block truncate text-[10px] font-normal text-nav-muted/80">
              {subtitle}
            </span>
          )}
        </span>
      </NavLink>
    );
  };

  return (
    <div
      className={`flex h-full flex-col transition-all duration-200 ${isPanelOpen || q ? 'w-72' : 'w-[72px]'}`}
    >
      {isPanelOpen || q ? (
        <div className="flex items-center gap-1.5 border-b border-nav-line/60 px-3 py-2.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-nav-muted" />
            <input
              ref={searchInputRef}
              type="search"
              value={navFilter}
              onChange={(e) => setNavFilter(e.target.value)}
              placeholder="Buscar módulo (Ctrl+K)..."
              aria-label="Filtrar navegación"
              className="h-8 w-full rounded-xl border border-nav-line/70 bg-nav-raised/50 pr-7 pl-8 text-xs text-nav-ink placeholder:text-nav-muted/70 transition focus:border-brand focus:bg-surface focus:outline-none"
            />
            {navFilter && (
              <button
                type="button"
                onClick={() => setNavFilter('')}
                aria-label="Limpiar búsqueda"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-nav-muted hover:text-nav-ink"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
          {!q && (
            <button
              type="button"
              onClick={() => setIsPanelOpen(false)}
              title="Ocultar submódulos"
              aria-label="Ocultar submódulos"
              className="grid size-8 shrink-0 place-items-center rounded-xl border border-nav-line/70 bg-surface text-nav-muted transition hover:border-brand/60 hover:text-nav-ink"
            >
              <PanelLeftClose className="size-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex justify-center border-b border-nav-line/60 py-2.5">
          <button
            type="button"
            onClick={() => setIsPanelOpen(true)}
            title="Mostrar submódulos"
            aria-label="Mostrar submódulos"
            className="grid size-8 place-items-center rounded-xl border border-nav-line/70 bg-surface text-nav-muted transition hover:border-brand/60 hover:text-nav-ink"
          >
            <PanelLeftOpen className="size-3.5" />
          </button>
        </div>
      )}

      {q ? (
        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Resultados de módulos">
          <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-nav-muted/80">
            {searchResults.length} coincidencia(s)
          </p>
          {searchResults.length === 0 ? (
            <p className="px-2 py-4 text-xs text-nav-muted">
              No se encontraron submódulos para "{navFilter}".
            </p>
          ) : (
            searchResults.map(({ groupLabel, item }) => renderLeaf(item, groupLabel))
          )}
        </nav>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div
            className="flex w-[66px] shrink-0 flex-col items-center gap-2.5 border-r border-nav-line/60 bg-nav-raised/25 py-3 overflow-y-auto"
            role="tablist"
            aria-label="Módulos principales"
          >
            {homeEntry &&
              (() => {
                const HomeIcon = ICON_MAP[homeEntry.item.icon] ?? LayoutDashboard;
                const isHomeActive = pathname === '/';
                return (
                  <button
                    type="button"
                    title={homeEntry.item.label}
                    aria-label={homeEntry.item.label}
                    onClick={() => router.push('/')}
                    className="group flex flex-col items-center gap-1 focus:outline-none"
                  >
                    <span
                      className={`grid size-10 place-items-center rounded-full border transition-all ${
                        isHomeActive
                          ? 'border-brand bg-brand text-brand-ink shadow-sm ring-4 ring-brand/15'
                          : 'border-nav-line/80 bg-surface text-nav-muted hover:border-brand/60 hover:text-nav-ink'
                      }`}
                    >
                      <HomeIcon className="size-4" strokeWidth={2} />
                    </span>
                    <span
                      className={`max-w-[58px] truncate text-[10px] font-medium ${
                        isHomeActive ? 'text-brand font-semibold' : 'text-nav-muted'
                      }`}
                    >
                      {homeEntry.item.label}
                    </span>
                  </button>
                );
              })()}

            <div className="my-0.5 h-px w-8 bg-nav-line/60" aria-hidden="true" />

            {groups.map((group) => {
              const GroupIcon = ICON_MAP[group.icon] ?? LayoutDashboard;
              const isSelected = activeGroup?.id === group.id;
              const hasActiveRoute = routeGroupId === group.id;

              return (
                <button
                  key={group.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  title={group.label}
                  aria-label={group.label}
                  onClick={() => {
                    setSelectedGroupId(group.id);
                    setIsPanelOpen(true);
                  }}
                  className="group relative flex flex-col items-center gap-1 focus:outline-none"
                >
                  <span
                    className={`relative grid size-10 place-items-center rounded-full border transition-all ${
                      isSelected
                        ? 'border-brand bg-brand text-brand-ink shadow-sm ring-4 ring-brand/15 scale-105'
                        : 'border-nav-line/80 bg-surface text-nav-muted hover:border-brand/60 hover:text-nav-ink hover:scale-105'
                    }`}
                  >
                    <GroupIcon className="size-4" strokeWidth={2} />
                    {hasActiveRoute && !isSelected && (
                      <span
                        aria-hidden="true"
                        className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-nav bg-emerald-500"
                      />
                    )}
                  </span>
                  <span
                    className={`max-w-[58px] truncate text-[10px] font-medium ${
                      isSelected ? 'text-brand font-semibold' : 'text-nav-muted'
                    }`}
                  >
                    {group.label}
                  </span>
                </button>
              );
            })}
          </div>

          {isPanelOpen && (
            <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="Navegación principal">
              {activeGroup && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-2 pb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-ink">
                      {activeGroup.label}
                    </span>
                    <span className="rounded-pill bg-nav-raised px-1.5 py-0.5 font-mono text-[10px] text-nav-muted">
                      {activeGroup.items.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {activeGroup.items.map((sub) => renderLeaf(sub))}
                  </div>
                </div>
              )}
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
