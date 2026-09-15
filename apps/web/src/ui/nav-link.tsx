'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The pieces of the frame that need to know WHERE the person is.
 *
 * The frame is a layout, and a layout is not rendered again on a client navigation. That is
 * the point of moving it there: the menu stays on screen while the next page loads, instead
 * of the whole screen freezing until the server finishes. The price is that the server can
 * no longer mark the current module — it does not run again — so the router says it here.
 *
 * Everything else about the frame is still rendered on the server. Icons arrive as elements
 * inside `children` because a component cannot cross from a Server to a Client Component.
 */

function isCurrent(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

interface NavLinkProps {
  readonly href: string;
  readonly exact?: boolean;
  readonly className: string;
  readonly activeClassName: string;
  readonly idleClassName: string;
  /** Where the "still loading" hint sits: beside the label, or over the tab. */
  readonly hint: 'inline' | 'top';
  readonly children: React.ReactNode;
}

/** A module link that marks itself as the current page. */
export function NavLink({
  href,
  exact = false,
  className,
  activeClassName,
  idleClassName,
  hint,
  children,
}: NavLinkProps) {
  const here = isCurrent(usePathname(), href, exact);

  return (
    <Link
      href={href}
      {...(here ? { 'aria-current': 'page' as const } : {})}
      className={`${className} ${here ? activeClassName : idleClassName}`}
    >
      {children}
      <PendingHint placement={hint} />
    </Link>
  );
}

/**
 * A dot that appears only if the click has not produced the next screen yet.
 *
 * It fades in after 150 ms, so a navigation that is already instant never flashes it. It is
 * always rendered and only its opacity changes: showing and hiding an element would shift the
 * label next to it.
 */
function PendingHint({ placement }: { placement: 'inline' | 'top' }) {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className={[
        'size-1.5 rounded-pill bg-current transition-opacity duration-200',
        placement === 'inline' ? 'ml-auto' : 'absolute top-1.5 left-1/2 -translate-x-1/2',
        pending ? 'animate-pulse opacity-100 delay-150' : 'opacity-0',
      ].join(' ')}
    />
  );
}

/**
 * A `<details>` menu that closes after every navigation.
 *
 * Native, so it still opens with no JavaScript. The path is its `key`: a new path remounts
 * it, closed. When the frame was re-rendered per page the server did this; now the router
 * has to.
 */
export function NavDetails({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <details key={pathname} className={className}>
      {children}
    </details>
  );
}

/** The "More" tab: highlighted when the current module is one of those it hides. */
export function MoreSummary({
  hrefs,
  className,
  activeClassName,
  idleClassName,
  children,
}: {
  hrefs: readonly string[];
  className: string;
  activeClassName: string;
  idleClassName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const here = hrefs.some((href) => isCurrent(pathname, href, false));

  return (
    <summary className={`${className} ${here ? activeClassName : idleClassName}`}>
      {children}
    </summary>
  );
}
