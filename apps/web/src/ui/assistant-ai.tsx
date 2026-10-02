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
  readonly actions?: readonly { readonly label: string; readonly href: string }[];
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
    <div ref={anchor} className="pt-2">
      {status === 'idle' || status === null ? null : status === 'loading' ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : (
        <Chat status={status} />
      )}
    </div>
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

  const askQuestion = (rawText: string) => {
    const question = rawText.trim();
    if (question === '' || pending) return;

    const next: readonly Turn[] = [...turns, { role: 'user', content: question.slice(0, 2_000) }];
    setTurns(next);
    setDraft('');
    setErrorKind(null);

    startTransition(async () => {
      const result = await askAssistantAction(next);
      if (result.ok) {
        setTurns([
          ...next,
          {
            role: 'assistant',
            content: result.reply,
            ...(result.actions ? { actions: result.actions } : {}),
          },
        ]);
      } else {
        setErrorKind(result.errorKind);
      }
    });
  };

  const ask = () => askQuestion(draft);

  return (
    <section aria-labelledby="assistant-chat-title" className="space-y-3">
      {/* Header limpio y compacto */}
      <div className="flex items-center justify-between gap-2 border-b border-line pb-2.5">
        <div>
          <h2
            id="assistant-chat-title"
            className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink uppercase"
          >
            <Sparkles
              aria-hidden="true"
              className="size-3.5 text-[var(--color-brand)]"
              strokeWidth={2}
            />
            {t('assistant.chat.title')}
          </h2>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
            <span
              className={`inline-block size-1.5 rounded-full ${
                status.configured ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              aria-hidden="true"
            />
            <span>
              {status.configured
                ? t('assistant.chat.poweredBy', {
                    provider: providerName,
                    model: status.model ?? '',
                  })
                : t('assistant.chat.poweredByLocal')}
            </span>
          </div>
        </div>

        {status.canConfigure ? (
          <Link
            href="/settings/ai"
            title={status.configured ? 'Ajustes de IA' : 'Conectar IA'}
            className="inline-flex items-center gap-1 rounded-control border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] shrink-0"
          >
            <span>{status.configured ? '⚙️ Ajustes IA' : '⚡ Conectar IA'}</span>
          </Link>
        ) : (
          !status.configured && (
            <span className="text-[11px] text-muted text-right max-w-[12rem] leading-tight">
              {t('assistant.setup.askAdmin')}
            </span>
          )
        )}
      </div>

      {/* Historial o Sugerencias Rápidas */}
      <div ref={log} aria-live="polite" className="max-h-64 space-y-2 overflow-y-auto">
        {turns.length === 0 && (
          <div className="space-y-2.5 py-1">
            <p className="text-xs text-muted">
              👋 Selecciona una opción del menú o escribe tu consulta:
            </p>
            <div className="flex flex-col gap-1.5">
              {[
                { label: '👥 Gestión de Clientes', query: '¿Cómo creo un cliente?' },
                { label: '📦 Catálogo de Productos', query: '¿Cómo creo un producto?' },
                {
                  label: '📋 Ventas y Notas de Entrega',
                  query: '¿Cómo emito una nota de entrega?',
                },
                { label: '📥 Compras y Recepciones', query: '¿Cómo registro una compra?' },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={pending}
                  onClick={() => askQuestion(item.query)}
                  className="flex items-center justify-between rounded-control border border-line bg-subtle/50 px-3 py-1.5 text-left text-xs font-medium text-ink transition hover:border-[var(--color-brand)] hover:bg-subtle"
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] text-muted">Ver opciones →</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.length > 0 && (
          <div className="flex items-center justify-between border-b border-line/60 pb-1.5 mb-2">
            <button
              type="button"
              onClick={() => {
                setTurns([]);
                setDraft('');
                setErrorKind(null);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-brand)] hover:underline"
            >
              <span>← Volver al menú principal</span>
            </button>
            <span className="text-[10px] text-muted">Consulta activa</span>
          </div>
        )}
        {turns.map((turn, index) => (
          <div
            key={index}
            className={`rounded-control px-3 py-2 text-sm ${
              turn.role === 'user' ? 'ml-6 bg-subtle text-ink' : 'mr-6 border border-line text-ink'
            }`}
          >
            <span className="sr-only">
              {turn.role === 'user' ? t('assistant.chat.you') : t('assistant.chat.assistant')}:{' '}
            </span>
            <p className="whitespace-pre-wrap">{turn.content}</p>
            {turn.role === 'assistant' && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-line/60">
                {turn.actions &&
                  turn.actions.length > 0 &&
                  turn.actions.map((act) => (
                    <Link
                      key={act.href + act.label}
                      href={act.href}
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-subtle px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-[var(--color-brand)] hover:bg-hover hover:text-[var(--color-brand)]"
                    >
                      <span>{act.label}</span>
                      <ArrowRight aria-hidden="true" className="size-3" strokeWidth={2} />
                    </Link>
                  ))}
                <button
                  type="button"
                  onClick={() => {
                    setTurns([]);
                    setDraft('');
                    setErrorKind(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-[var(--color-brand)] hover:text-ink"
                  title="Volver al menú principal"
                >
                  <span>🏠 Menú Principal</span>
                </button>
              </div>
            )}
          </div>
        ))}
        {pending && <p className="mr-6 text-sm text-muted">{t('assistant.chat.thinking')}</p>}
      </div>

      {/* Errores */}
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

      {/* Input */}
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
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              ask();
            }
          }}
          className={`${TEXTAREA_CLASSES} min-h-0`}
        />
        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 pt-1">
          {status.configured && providerName ? (
            <p className="text-[11px] text-muted leading-tight">
              {status.provider === 'ollama'
                ? t('assistant.chat.privacyOllama')
                : t('assistant.chat.privacy', { provider: providerName })}
            </p>
          ) : (
            <span className="text-[11px] text-muted">Sin consumo externo de API</span>
          )}
          <button
            type="submit"
            disabled={pending || draft.trim() === ''}
            className={`${buttonClasses({ size: 'sm' })} self-end sm:self-auto shrink-0`}
          >
            <Send aria-hidden="true" className="size-3.5" strokeWidth={2} />
            {t('assistant.chat.send')}
          </button>
        </div>
      </form>
    </section>
  );
}
