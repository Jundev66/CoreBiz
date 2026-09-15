import Link from 'next/link';

/**
 * The button. ONE definition for the whole product.
 *
 * It was written by hand 28 times with different padding, text size, shadow and hover —
 * several had no hover state at all. That drift is exactly what makes an interface look
 * assembled instead of designed, even to someone who cannot say why.
 *
 * `buttonClasses` is exported on its own so a client component, a `<Link>` and a submit
 * button inside a Server Action form all look identical without sharing a wrapper.
 * No hooks here: it works from server and client components alike.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60';

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-ink shadow-xs hover:bg-brand-hover active:bg-brand-hover',
  secondary:
    'border border-line-strong bg-surface text-ink shadow-xs hover:bg-subtle active:bg-subtle',
  ghost: 'text-ink-soft hover:bg-subtle hover:text-ink active:bg-subtle',
  danger:
    'border border-danger/30 bg-surface text-danger-ink hover:bg-danger-soft active:bg-danger-soft',
};

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
}: {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  block?: boolean | undefined;
  className?: string | undefined;
} = {}): string {
  return [BASE, SIZES[size], VARIANTS[variant], block ? 'w-full' : '', className]
    .filter(Boolean)
    .join(' ');
}

export function ButtonLink({
  href,
  variant,
  size,
  block,
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonClasses({ variant, size, block, className })}>
      {children}
    </Link>
  );
}

export function Button({
  variant,
  size,
  block,
  className,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}) {
  return (
    <button type={type} className={buttonClasses({ variant, size, block, className })} {...props} />
  );
}
