/**
 * The mark and the wordmark.
 *
 * Plain SVG with attributes and utility classes: no inline `style`, which the production
 * CSP blocks. The name is passed in so the same component serves server and client screens
 * without reaching for translations itself.
 */

export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="8" className="fill-brand" />
      <path
        d="M20.6 11.4a6.6 6.6 0 1 0 0 9.2"
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="22.6" cy="16" r="1.9" fill="white" />
    </svg>
  );
}

export function Logo({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark className={size === 'lg' ? 'size-9' : 'size-7'} />
      <span
        className={`font-semibold tracking-tight text-ink ${size === 'lg' ? 'text-xl' : 'text-[15px]'}`}
      >
        {name}
      </span>
    </span>
  );
}
