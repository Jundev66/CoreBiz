'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Building2,
  ChevronDown,
  FileText,
  LayoutDashboard,
  Package,
  Receipt,
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

  const findActiveGroupId = (): string | null => {
    for (const item of items) {
      if (item.type === 'group') {
        const hasActiveChild = item.group.items.some((sub) =>
          sub.exact
            ? pathname === sub.href
            : pathname === sub.href || pathname.startsWith(`${sub.href}/`),
        );
        if (hasActiveChild) return item.group.id;
      }
    }
    return null;
  };

  const [openGroup, setOpenGroup] = useState<string | null>(findActiveGroupId);

  useEffect(() => {
    const active = findActiveGroupId();
    if (active) {
      setOpenGroup(active);
    }
  }, [pathname]);

  const toggleGroup = (id: string) => {
    setOpenGroup((prev) => (prev === id ? null : id));
  };

  return (
    <nav className="flex flex-col gap-1 px-3 py-2" aria-label="Navegación principal">
      {items.map((entry) => {
        if (entry.type === 'link') {
          const item = entry.item;
          const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
          return (
            <NavLink
              key={item.href}
              href={item.href}
              {...(item.exact === true ? { exact: true } : {})}
              hint="inline"
              className="group flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors"
              activeClassName="bg-brand text-brand-ink shadow-xs"
              idleClassName="text-nav-muted hover:bg-nav-raised hover:text-nav-ink"
            >
              <Icon
                aria-hidden="true"
                className={`size-[18px] shrink-0 group-aria-[current=page]:text-current ${NAV_ICON[moduleTone(item.href)]}`}
                strokeWidth={1.75}
              />
              <span>{item.label}</span>
            </NavLink>
          );
        }

        const group = entry.group;
        const isOpen = openGroup === group.id;
        const isGroupActive = group.items.some((sub) =>
          sub.exact
            ? pathname === sub.href
            : pathname === sub.href || pathname.startsWith(`${sub.href}/`),
        );
        const GroupIcon = ICON_MAP[group.icon] ?? LayoutDashboard;

        return (
          <div key={group.id} className="flex flex-col">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className={`group flex w-full items-center justify-between rounded-control px-3 py-2 text-sm font-medium transition-colors ${
                isGroupActive
                  ? 'text-nav-ink font-semibold'
                  : 'text-nav-muted hover:bg-nav-raised hover:text-nav-ink'
              }`}
            >
              <div className="flex items-center gap-3">
                <GroupIcon
                  aria-hidden="true"
                  className={`size-[18px] shrink-0 ${isGroupActive ? 'text-brand' : 'text-nav-muted group-hover:text-nav-ink'}`}
                  strokeWidth={1.75}
                />
                <span>{group.label}</span>
              </div>
              <ChevronDown
                className={`size-4 text-nav-muted transition-transform duration-200 ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isOpen && (
              <div className="mt-0.5 ml-4 flex flex-col gap-0.5 border-l border-nav-line/60 pl-2">
                {group.items.map((subItem) => {
                  const SubIcon = ICON_MAP[subItem.icon] ?? LayoutDashboard;
                  return (
                    <NavLink
                      key={subItem.href}
                      href={subItem.href}
                      {...(subItem.exact === true ? { exact: true } : {})}
                      hint="inline"
                      className="group flex items-center gap-2.5 rounded-control px-2.5 py-1.5 text-xs font-medium transition-colors"
                      activeClassName="bg-brand text-brand-ink font-semibold shadow-xs"
                      idleClassName="text-nav-muted hover:bg-nav-raised hover:text-nav-ink"
                    >
                      <SubIcon
                        aria-hidden="true"
                        className={`size-3.5 shrink-0 group-aria-[current=page]:text-current ${NAV_ICON[moduleTone(subItem.href)]}`}
                        strokeWidth={1.75}
                      />
                      <span>{subItem.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
