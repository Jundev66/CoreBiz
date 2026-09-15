import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/**
 * Lists on a phone.
 *
 * Every list used to be a four or five column table that only scrolled sideways on a phone,
 * with the row action in the far-right column, off-screen. Below `sm` a list is now a stack
 * of tappable rows; from `sm` up the page keeps its real `<table>`.
 *
 * Both are rendered and the inactive one is `display: none` (`sm:hidden` / `hidden sm:block`).
 * That is deliberate, not duplication by accident: hidden elements are out of the
 * accessibility tree, so a desktop visitor — and the E2E suite, which runs at desktop size
 * and looks for cells, rows and "View" links — still meets exactly one table.
 */

export function DesktopOnly({ children }: { children: React.ReactNode }) {
  return <div className="hidden sm:block">{children}</div>;
}

export function MobileList({ children }: { children: React.ReactNode }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-xs sm:hidden">
      {children}
    </ul>
  );
}

export function MobileListItem({
  href,
  title,
  subtitle,
  trailing,
  trailingHint,
  muted = false,
}: {
  href: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  trailingHint?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className={`flex min-h-16 items-center gap-3 px-4 py-3 transition-colors active:bg-subtle ${muted ? 'opacity-60' : ''}`}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-ink">{title}</p>
          {subtitle !== undefined && (
            <p className="mt-0.5 truncate text-[13px] text-muted">{subtitle}</p>
          )}
        </div>
        {(trailing !== undefined || trailingHint !== undefined) && (
          <div className="shrink-0 text-right">
            {trailing !== undefined && (
              <p className="text-[15px] font-medium text-ink tabular-nums">{trailing}</p>
            )}
            {trailingHint !== undefined && (
              <div className="mt-0.5 text-[13px] text-muted">{trailingHint}</div>
            )}
          </div>
        )}
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-n-400" strokeWidth={2} />
      </Link>
    </li>
  );
}
