import { getTranslations } from 'next-intl/server';
import { Lock } from 'lucide-react';

/**
 * What someone sees when their role does not reach this screen.
 *
 * IT EXISTS SO THE API IS NOT CALLED. The real boundary is the use case, which answers
 * `Forbidden`, and that does not change; the problem is that a list read turns that 403
 * into an exception and the whole screen goes down. A read-only user clicking "Reports" —
 * an entry in the app's own menu — got the server error page.
 *
 * So the screen checks `can()` BEFORE reading and, if the role falls short, renders this
 * instead of fetching. It is not a security control: it is the difference between "this
 * is not for you" and "the application is broken". The use case and RLS still stand
 * behind it for anyone calling the action directly.
 *
 * The text does not say WHAT is on the other side, and does say whom to ask, which is the
 * only actionable thing from here.
 *
 * It borrows the empty-state look (`Empty` in `@/ui/shell`) rather than an error's: nothing
 * is broken, there is simply nothing here for this role.
 */
export async function NoAccess() {
  const t = await getTranslations();

  return (
    <div
      role="status"
      className="flex flex-col items-center rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center"
    >
      <span className="grid size-11 place-items-center rounded-pill bg-subtle text-muted">
        <Lock aria-hidden="true" className="size-5" strokeWidth={1.75} />
      </span>
      <p className="mt-3 text-sm font-medium text-ink">{t('noAccess.title')}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{t('noAccess.lead')}</p>
    </div>
  );
}
