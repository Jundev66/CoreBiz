/**
 * One colour per module, so the menu and the figures can be told apart at a glance.
 *
 * The class strings are written out in full on purpose: Tailwind finds classes by reading
 * the source, and a name assembled at runtime (`text-accent-${tone}`) would never be built.
 */

export type Tone = 'brand' | 'sky' | 'emerald' | 'violet' | 'amber' | 'rose';

/** Icon colour on the dark navigation. */
export const NAV_ICON: Record<Tone, string> = {
  brand: 'text-nav-muted',
  sky: 'text-accent-sky-bright',
  emerald: 'text-accent-emerald-bright',
  violet: 'text-accent-violet-bright',
  amber: 'text-accent-amber-bright',
  rose: 'text-accent-rose-bright',
};

/** Icon chip on a card. */
export const CHIP: Record<Tone, string> = {
  brand: 'bg-brand-soft text-brand',
  sky: 'bg-accent-sky-soft text-accent-sky',
  emerald: 'bg-accent-emerald-soft text-accent-emerald',
  violet: 'bg-accent-violet-soft text-accent-violet',
  amber: 'bg-accent-amber-soft text-accent-amber',
  rose: 'bg-accent-rose-soft text-accent-rose',
};

const MODULE_TONES: Record<string, Tone> = {
  '/customers': 'sky',
  '/products': 'emerald',
  '/delivery-notes': 'violet',
  '/purchases': 'amber',
  '/reports': 'rose',
};

export function moduleTone(href: string): Tone {
  return MODULE_TONES[href] ?? 'brand';
}
