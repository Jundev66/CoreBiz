import { getTranslations } from 'next-intl/server';

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
 */
export async function NoAccess() {
  const t = await getTranslations();

  return (
    <div
      role="status"
      className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-line-strong)] px-6 py-14 text-center"
    >
      <p className="text-sm font-medium">{t('noAccess.title')}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-muted)]">
        {t('noAccess.lead')}
      </p>
    </div>
  );
}
