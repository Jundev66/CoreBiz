'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Building2,
  FileText,
  LayoutDashboard,
  Package,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  Users,
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

export function SidebarNav({ items }: SidebarNavProps) {
  const pathname = usePathname();
  const [navFilter, setNavFilter] = useState('');
  const q = navFilter.trim().toLowerCase();

  const renderLeaf = (item: NavLeafItem) => {
    const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
    const isActive = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

    return (
      <NavLink
        key={item.href}
        href={item.href}
        {...(item.exact === true ? { exact: true } : {})}
        hint="inline"
        className={`group relative flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[13px] font-medium transition-all ${
          isActive ? 'bg-brand/12 text-ink font-semibold shadow-2xs' : ''
        }`}
        activeClassName="bg-brand/12 text-ink font-semibold"
        idleClassName="text-nav-muted hover:bg-nav-raised/80 hover:text-nav-ink"
      >
        {isActive && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 bottom-1.5 left-0 w-1 rounded-r-full bg-brand"
          />
        )}
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-lg transition-colors ${
            isActive
              ? 'bg-brand text-brand-ink shadow-xs'
              : 'bg-nav-raised/70 text-nav-muted group-hover:bg-nav-raised group-hover:text-nav-ink'
          }`}
        >
          <Icon
            aria-hidden="true"
            className={`size-3.5 ${isActive ? 'text-current' : NAV_ICON[moduleTone(item.href)]}`}
            strokeWidth={2}
          />
        </span>
        <span className="truncate">{item.label}</span>
      </NavLink>
    );
  };

  return (
    <div className="flex flex-col gap-4 px-3 py-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-nav-muted" />
        <input
          type="search"
          value={navFilter}
          onChange={(e) => setNavFilter(e.target.value)}
          placeholder="Buscar módulo..."
          aria-label="Filtrar navegación"
          className="h-8 w-full rounded-xl border border-nav-line/70 bg-nav-raised/50 pr-3 pl-8 text-xs text-nav-ink placeholder:text-nav-muted/70 transition focus:border-brand focus:bg-surface focus:outline-none"
        />
      </div>

      <nav className="flex flex-col gap-4" aria-label="Navegación principal">
        {items.map((entry) => {
          if (entry.type === 'link') {
            if (q && !entry.item.label.toLowerCase().includes(q)) return null;
            return (
              <div key={entry.item.href} className="flex flex-col gap-1">
                {renderLeaf(entry.item)}
              </div>
            );
          }

          const group = entry.group;
          const visibleItems = q
            ? group.items.filter(
                (sub) =>
                  sub.label.toLowerCase().includes(q) || group.label.toLowerCase().includes(q),
              )
            : group.items;

          if (q && visibleItems.length === 0) return null;

          return (
            <div key={group.id} className="flex flex-col gap-1">
              <div className="px-2.5 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-nav-muted/70">
                {group.label}
              </div>
              <div className="flex flex-col gap-0.5">{visibleItems.map(renderLeaf)}</div>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
