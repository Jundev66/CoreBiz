import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CircleHelp, ArrowRight } from 'lucide-react';
import { hasPlaybook, isEscalateOnly, playbookRoute } from '@corebiz/contracts';
import { readLastFailure } from '@/api/last-error';

/**
 * The help panel, and the first half of what will later be the assistant.
 *
 * It is a Server Component and ships NOT ONE line of JavaScript to the browser. It opens
 * with `<details>`, a native element: it works with the keyboard, screen readers announce
 * it, and it still opens with the connection down and the client bundle half-downloaded —
 * by far the moment a screen explaining what is going on is needed most.
 *
 * What it explains is not invented: it reads the catalogue in `@corebiz/contracts`, which in
 * turn relies on something the system ALREADY decided. `Result` versus `throw` separates
 * "a rule said no" from "something broke", which is exactly the line between what is
 * explained here and what has to be handed to someone.
 *
 * Zero tokens, zero requests, zero dependencies. Most of what people ask when an ERP will
 * not let them continue can be answered without asking anyone.
 */

export async function AssistantPanel() {
  const t = await getTranslations();
  const error = await readLastFailure();

  return (
    /*
     * `aria-label` even though the `<summary>` already says "Help": a `<details>` takes its
     * name from the summary ONLY while closed. Once opened, the region loses its name just
     * when it has content to announce, and people navigating by region lose track of where
     * they are. With the label set, the name does not depend on state.
     */
    <details
      data-assistant-fab
      aria-label={t('assistant.title')}
      // Above the phone tab bar (h-16 plus the safe area) and back to the corner on desktop.
      className="fixed right-3 bottom-20 z-40 w-[min(22rem,calc(100vw-1.5rem))] lg:right-4 lg:bottom-4 print:hidden"
    >
      <summary className="ml-auto flex w-fit cursor-pointer list-none items-center gap-2 rounded-pill border border-line bg-surface px-3.5 py-2 text-sm font-medium shadow-md transition hover:border-line-strong [&::-webkit-details-marker]:hidden">
        <CircleHelp aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
        {/* Icon-only on phones, where the pill sat on top of list rows. The `<details>` keeps
            its name through `aria-label`, and the summary still reads the word. */}
        <span className="sr-only sm:not-sr-only">{t('assistant.title')}</span>
        {/* A dot, not a number: there is nothing to count, only something to look at. */}
        {error !== null && (
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full bg-[var(--color-warn)]"
          />
        )}
      </summary>

      <div className="mt-2 max-h-[min(28rem,70vh)] overflow-y-auto rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-md)]">
        {error === null ? (
          <p className="text-sm text-[var(--color-muted)]">{t('assistant.idle')}</p>
        ) : isEscalateOnly(error.kind) ? (
          <Breakdown incidentId={error.incidentId} />
        ) : hasPlaybook(error.kind) ? (
          <Playbook kind={error.kind} />
        ) : (
          /* A key without a card. The `check:playbooks` guardian exists so this does not
             happen, but the panel does not fall over if it does: it says the only honest
             thing it can instead of going blank or rendering the raw key. */
          <p className="text-sm text-[var(--color-muted)]">{t('assistant.noPlaybook')}</p>
        )}
      </div>
    </details>
  );
}

/** A rule said no, and the reason can be explained. */
async function Playbook({ kind }: { kind: string }) {
  const t = await getTranslations();
  const route = playbookRoute(kind);

  return (
    <div className="space-y-3">
      <section>
        <h2 className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
          {t('assistant.whatHappened')}
        </h2>
        <p className="mt-1 text-sm">{t(`assistant.playbooks.${kind}.what`)}</p>
      </section>

      <section>
        <h2 className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
          {t('assistant.whatToDo')}
        </h2>
        <p className="mt-1 text-sm">{t(`assistant.playbooks.${kind}.do`)}</p>
      </section>

      {/* No link when there is nowhere to go. For `Forbidden` no screen fixes anything,
          and a random link only walks around someone who was already lost. */}
      {route !== null && (
        <Link
          href={route}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-brand)] underline-offset-4 hover:underline"
        >
          {t('assistant.goTo')}
          <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2} />
        </Link>
      )}
    </div>
  );
}

/**
 * Something broke on our side, and no explanation is attempted.
 *
 * The system's rule applied to the panel: a 500 has no explanation to give to whoever
 * suffers it — the real message contains table names and sometimes the failing value, and
 * that stays in the log. The only useful thing to offer is the reference, which lets
 * support find the trace.
 */
async function Breakdown({ incidentId }: { incidentId: string | null }) {
  const t = await getTranslations();

  return (
    <div className="space-y-3">
      <section>
        <h2 className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
          {t('assistant.whatHappened')}
        </h2>
        <p className="mt-1 text-sm">{t('assistant.breakdown')}</p>
      </section>

      {incidentId !== null ? (
        <section>
          <h2 className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
            {t('assistant.reference')}
          </h2>
          {/* Selectable in one click: this value gets copied, pasted into a message and
              sometimes read out over the phone. That is why it is twelve characters and
              not a uuid. */}
          <p className="mt-1 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-subtle)] px-3 py-2 text-center font-mono text-sm tracking-wider select-all">
            {incidentId}
          </p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            {t('assistant.breakdownWithReference')}
          </p>
        </section>
      ) : (
        <p className="text-sm text-[var(--color-muted)]">{t('assistant.breakdownNoReference')}</p>
      )}
    </div>
  );
}
