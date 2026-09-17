'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Send, Sparkles } from 'lucide-react';
import { askAssistantAction, assistantStatusAction } from '@/actions/ai';
import type { AssistantStatusView } from '@/api/ai';
import { buttonClasses } from '@/ui/button';
import { TEXTAREA_CLASSES } from '@/ui/field';

interface Turn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/**
 * The half of the help panel that can involve a model.
 *
 * Where the line between AI and not-AI falls, because it has to stay visible:
 *
 *   - The error cards above this component never use a model. They are fixed text.
 *   - The setup guide shown when nothing is configured is ALSO fixed text: it is what gets
 *     someone from "no AI" to "AI", so it cannot depend on having one.
 *   - Only the chat talks to a model, only once an admin connected one, and it says which
 *     provider receives the messages.
 *
 * It asks whether there is an assistant when the panel OPENS, not on every page render: the
 * panel is in the frame of every screen and almost always stays closed.
 */
export function AssistantAi() {
  const t = useTranslations();
  const anchor = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<AssistantStatusView | null | 'loading' | 'idle'>('idle');

  useEffect(() => {
    const details = anchor.current?.closest('details');
    if (details === null || details === undefined) return;

    // Asked again on every opening, so an admin who just connected a provider sees the chat
    // without reloading. Only the first opening shows "loading"; later ones swap quietly.
    const load = () => {
      if (!details.open) return;
      setStatus((current) => (current === 'idle' ? 'loading' : current));
      void assistantStatusAction().then(setStatus);
    };

    load();
    details.addEventListener('toggle', load);
    return () => details.removeEventListener('toggle', load);
  }, []);

  return (
    <div ref={anchor} className="mt-4 border-t border-line pt-4">
      {status === 'idle' || status === null ? null : status === 'loading' ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : status.configured ? (
        <Chat status={status} />
      ) : status.canConfigure ? (
        <SetupGuide />
      ) : (
        <p className="text-sm text-muted">{t('assistant.setup.askAdmin')}</p>
      )}
    </div>
  );
}

/** Fixed text on purpose: it is how someone without AI gets one. */
function SetupGuide() {
  const t = useTranslations();

  return (
    <section aria-labelledby="assistant-setup-title" className="space-y-2">
      <h2
        id="assistant-setup-title"
        className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase"
      >
        <Sparkles aria-hidden="true" className="size-3.5" strokeWidth={2} />
        {t('assistant.setup.title')}
      </h2>
      <p className="text-sm">{t('assistant.setup.lead')}</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>{t('assistant.setup.step1')}</li>
        <li>{t('assistant.setup.step2')}</li>
        <li>{t('assistant.setup.step3')}</li>
      </ol>
      <p className="text-xs text-muted">{t('assistant.setup.providers')}</p>
      <Link
        href="/settings/ai"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-brand)] underline-offset-4 hover:underline"
      >
        {t('assistant.setup.goTo')}
        <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2} />
      </Link>
    </section>
  );
}

function Chat({ status }: { status: AssistantStatusView }) {
  const t = useTranslations();
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [errorKind, setErrorKind] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [turns, pending]);

  const providerName =
    status.provider === null ? '' : t(`settings.ai.providers.${status.provider}.name`);

  const ask = () => {
    const question = draft.trim();
    if (question === '' || pending) return;

    const next: readonly Turn[] = [...turns, { role: 'user', content: question.slice(0, 2_000) }];
    setTurns(next);
    setDraft('');
    setErrorKind(null);

    startTransition(async () => {
      const result = await askAssistantAction(next);
      if (result.ok) {
        setTurns([...next, { role: 'assistant', content: result.reply }]);
      } else {
        setErrorKind(result.errorKind);
      }
    });
  };

  return (
    <section aria-labelledby="assistant-chat-title" className="space-y-3">
      <div>
        <h2
          id="assistant-chat-title"
          className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase"
        >
          <Sparkles aria-hidden="true" className="size-3.5" strokeWidth={2} />
          {t('assistant.chat.title')}
        </h2>
        <p className="mt-1 text-xs text-muted">
          {t('assistant.chat.poweredBy', { provider: providerName, model: status.model ?? '' })}
        </p>
      </div>

      <div ref={log} aria-live="polite" className="max-h-56 space-y-2 overflow-y-auto">
        {turns.length === 0 && <p className="text-sm text-muted">{t('assistant.chat.empty')}</p>}
        {turns.map((turn, index) => (
          <p
            key={index}
            className={`rounded-control px-3 py-2 text-sm whitespace-pre-wrap ${
              turn.role === 'user' ? 'ml-6 bg-subtle text-ink' : 'mr-6 border border-line text-ink'
            }`}
          >
            <span className="sr-only">
              {turn.role === 'user' ? t('assistant.chat.you') : t('assistant.chat.assistant')}:{' '}
            </span>
            {turn.content}
          </p>
        ))}
        {pending && <p className="mr-6 text-sm text-muted">{t('assistant.chat.thinking')}</p>}
      </div>

      {errorKind !== null && (
        <div role="alert" className="space-y-1 text-sm text-danger-ink">
          <p>{t(`settings.errors.${errorKind}`)}</p>
          {status.canConfigure && errorKind.startsWith('Ai') && (
            <Link href="/settings/ai" className="font-medium underline underline-offset-4">
              {t('assistant.setup.goTo')}
            </Link>
          )}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask();
        }}
        className="space-y-2"
      >
        <label htmlFor="assistant-question" className="sr-only">
          {t('assistant.chat.label')}
        </label>
        <textarea
          id="assistant-question"
          value={draft}
          maxLength={2_000}
          rows={2}
          placeholder={t('assistant.chat.placeholder')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter breaks the line: what every chat has taught people.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              ask();
            }
          }}
          className={`${TEXTAREA_CLASSES} min-h-0`}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted">
            {status.provider === 'ollama'
              ? t('assistant.chat.privacyOllama')
              : t('assistant.chat.privacy', { provider: providerName })}
          </p>
          <button
            type="submit"
            disabled={pending || draft.trim() === ''}
            className={buttonClasses({ size: 'sm' })}
          >
            <Send aria-hidden="true" className="size-3.5" strokeWidth={2} />
            {t('assistant.chat.send')}
          </button>
        </div>
      </form>
    </section>
  );
}
