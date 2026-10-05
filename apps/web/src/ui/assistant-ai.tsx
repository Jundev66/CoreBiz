'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowRight, Send, Sparkles } from 'lucide-react';
import type { LastFailure } from '@corebiz/contracts';
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
 * The half of the help panel that can involve a model or Synapse deterministic engine.
 *
 * Where the line between AI and not-AI falls, because it has to stay visible:
 *
 *   - The error cards above this component never use a model. They are fixed text.
 *   - The setup guide shown when nothing is configured is ALSO fixed text.
 *   - Synapse answers deterministically when no external model is configured, providing
 *     comprehensive error diagnostics (why it happened + what to do) without external cost.
 *   - All questions and errors are sanitized to prevent any leak of confidential data.
 */
export function AssistantAi({
  initialError,
  isDemo,
}: {
  readonly initialError?: LastFailure | null | undefined;
  readonly isDemo?: boolean | undefined;
}) {
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
        <Chat status={status} initialError={initialError} isDemo={isDemo} />
      )}
    </div>
  );
}

interface ValidationNotification {
  readonly kind: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly incidentId?: string;
  readonly severity: 'warn' | 'error' | 'info';
}

const NOTIFICATIONS: readonly ValidationNotification[] = [
  {
    kind: 'InsufficientStock',
    title: 'Stock insuficiente al despachar',
    description:
      'Intento de emisión de nota de entrega con unidades superiores a las disponibles en almacén.',
    icon: '📦',
    severity: 'warn',
  },
  {
    kind: 'CreditLimitExceeded',
    title: 'Límite de crédito superado',
    description:
      'El cliente intentó comprar a crédito sobrepasando su cupo máximo de financiamiento.',
    icon: '💳',
    severity: 'warn',
  },
  {
    kind: 'EmailAlreadyRegistered',
    title: 'Correo ya registrado',
    description:
      'Intento de registro de usuario con una dirección de email que ya existe en el sistema.',
    icon: '✉️',
    severity: 'info',
  },
  {
    kind: 'DuplicateSku',
    title: 'SKU duplicado en catálogo',
    description:
      'Código de producto repetido detectado durante el registro o edición en el inventario.',
    icon: '🏷️',
    severity: 'warn',
  },
  {
    kind: 'NoExchangeRate',
    title: 'Sin tasa de cambio oficial',
    description:
      'No existe tasa de cambio oficial registrada para la fecha requerida en la operación.',
    icon: '💱',
    severity: 'warn',
  },
  {
    kind: 'Forbidden',
    title: 'Permiso denegado por rol',
    description:
      'El usuario intentó realizar una operación que requiere rol de Administrador o Propietario.',
    icon: '🔒',
    severity: 'error',
  },
  {
    kind: 'Unexpected',
    incidentId: 'INC-A1B2C3D4',
    title: 'Error 500 inesperado de servidor',
    description:
      'Fallo crítico protegido con identificador anónimo de soporte para evitar filtración interna.',
    icon: '⚠️',
    severity: 'error',
  },
];

function Chat({
  status,
  initialError,
  isDemo,
}: {
  readonly status: AssistantStatusView;
  readonly initialError?: LastFailure | null | undefined;
  readonly isDemo?: boolean | undefined;
}) {
  const t = useTranslations();
  const [tab, setTab] = useState<'chat' | 'notifications'>('chat');
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [errorKind, setErrorKind] = useState<string | null>(null);
  const [activeError] = useState<LastFailure | null>(initialError ?? null);
  const [pending, startTransition] = useTransition();
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [turns, pending]);

  const providerName =
    status.provider === null ? '' : t(`settings.ai.providers.${status.provider}.name`);

  const askQuestion = (rawText: string, explicitError?: LastFailure | null) => {
    const question = rawText.trim();
    if (question === '' || pending) return;

    const errToPass = explicitError ?? activeError;
    const errorPayload = errToPass
      ? { kind: errToPass.kind, incidentId: errToPass.incidentId }
      : null;

    const next: readonly Turn[] = [...turns, { role: 'user', content: question.slice(0, 2_000) }];
    setTurns(next);
    setDraft('');
    setErrorKind(null);

    startTransition(async () => {
      const result = await askAssistantAction(next, errorPayload);
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

      {/* Selector de pestañas: Chat y Notificaciones */}
      <div className="flex items-center gap-1.5 border-b border-line pb-2">
        <button
          type="button"
          onClick={() => setTab('chat')}
          className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-medium transition ${
            tab === 'chat'
              ? 'bg-[var(--color-brand)] text-white shadow-xs'
              : 'text-muted hover:bg-subtle hover:text-ink'
          }`}
        >
          <Sparkles className="size-3" />
          <span>{t('assistant.tabChat')}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('notifications')}
          className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-medium transition ${
            tab === 'notifications'
              ? 'bg-[var(--color-brand)] text-white shadow-xs'
              : 'text-muted hover:bg-subtle hover:text-ink'
          }`}
        >
          <span>🔔</span>
          <span>{t('assistant.tabNotifications')}</span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
              tab === 'notifications'
                ? 'bg-white/20 text-white'
                : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
            }`}
          >
            {NOTIFICATIONS.length}
          </span>
        </button>
      </div>

      {tab === 'notifications' ? (
        <div className="space-y-3 py-1">
          <div>
            <h3 className="text-xs font-semibold text-ink flex items-center gap-1.5">
              <span>🔔</span>
              <span>{t('assistant.notificationsTitle')}</span>
            </h3>
            <p className="mt-0.5 text-[11px] text-muted">{t('assistant.notificationsSubtitle')}</p>
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {NOTIFICATIONS.map((item) => (
              <div
                key={item.kind}
                className="rounded-control border border-line bg-surface p-2.5 text-xs transition hover:border-[var(--color-brand)]/60 shadow-xs space-y-1.5"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium text-ink flex items-center gap-1.5">
                    <span>{item.icon}</span>
                    <span>{item.title}</span>
                  </span>
                  <code className="text-[10px] font-mono px-1 py-0.5 rounded bg-subtle text-muted border border-line shrink-0">
                    {item.kind}
                  </code>
                </div>
                <p className="text-[11px] text-muted leading-relaxed">{item.description}</p>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setTab('chat');
                      askQuestion(`¿Por qué ocurrió el error ${item.kind} y qué debo hacer?`, {
                        kind: item.kind,
                        incidentId: item.incidentId ?? null,
                      });
                    }}
                    className="inline-flex items-center gap-1 rounded-pill bg-[var(--color-brand)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--color-brand)] hover:bg-[var(--color-brand)] hover:text-white transition disabled:opacity-50"
                  >
                    <span>💡 {t('assistant.diagnoseWithSynapse')} →</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Notificación activa de simulación o error real */}
          {activeError !== null && (
            <div className="rounded-control border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-ink space-y-1.5 shadow-sm">
              <div className="flex items-center justify-between font-semibold text-amber-800 dark:text-amber-200">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle
                    aria-hidden="true"
                    className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0"
                  />
                  <span>
                    {t('assistant.errorDetected')}:{' '}
                    <code className="font-mono text-[11px] bg-surface px-1 py-0.5 rounded border border-line">
                      {activeError.kind}
                    </code>
                  </span>
                </span>
                {activeError.incidentId && (
                  <span className="font-mono text-[10px] bg-surface px-1.5 py-0.5 rounded border border-line text-muted">
                    {activeError.incidentId}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted leading-tight">
                Synapse comprende las validaciones de negocio y puede explicarte exactamente por qué
                ocurrió y cómo resolverlo.
              </p>
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    askQuestion(
                      `¿Por qué ocurrió el error ${activeError.kind} y qué debo hacer?`,
                      activeError,
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-pill bg-[var(--color-brand)] px-2.5 py-1 text-[11px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  <span>💡 {t('assistant.explainError')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Banner de alertas disponibles si estamos en demo */}
          {isDemo && turns.length === 0 && (
            <div className="rounded-control border border-amber-500/30 bg-amber-500/10 p-2 text-xs flex items-center justify-between gap-2">
              <span className="text-[11px] text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                <span>🔔</span>
                <span>
                  {NOTIFICATIONS.length} {t('assistant.notificationsAvailable')}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setTab('notifications')}
                className="text-[11px] font-medium text-amber-700 dark:text-amber-300 underline shrink-0 hover:opacity-80"
              >
                Ver todas →
              </button>
            </div>
          )}

          {/* Historial o Sugerencias Rápidas */}
          <div ref={log} aria-live="polite" className="max-h-64 space-y-2 overflow-y-auto">
            {turns.length === 0 && (
              <div className="space-y-2.5 py-1">
                <p className="text-xs text-muted">
                  👋 Selecciona una consulta o prueba una validación:
                </p>
                <div className="flex flex-col gap-1.5">
                  {[
                    {
                      label: '📦 Stock insuficiente (Validación)',
                      query: '¿Por qué ocurrió InsufficientStock y qué debo hacer?',
                      err: { kind: 'InsufficientStock', incidentId: null },
                    },
                    {
                      label: '💳 Límite de crédito (Validación)',
                      query: '¿Por qué ocurrió CreditLimitExceeded y qué debo hacer?',
                      err: { kind: 'CreditLimitExceeded', incidentId: null },
                    },
                    {
                      label: '✉️ Correo ya registrado (Validación)',
                      query: '¿Por qué ocurrió EmailAlreadyRegistered y qué debo hacer?',
                      err: { kind: 'EmailAlreadyRegistered', incidentId: null },
                    },
                    {
                      label: '🏷️ SKU duplicado (Validación)',
                      query: '¿Por qué ocurrió DuplicateSku y qué debo hacer?',
                      err: { kind: 'DuplicateSku', incidentId: null },
                    },
                    { label: '👥 Gestión de Clientes', query: '¿Cómo creo un cliente?' },
                    {
                      label: '📋 Ventas y Notas de Entrega',
                      query: '¿Cómo emito una nota de entrega?',
                    },
                    {
                      label: `🛡️ ${t('assistant.errorGuide')}`,
                      query: '¿Por qué fallan las validaciones del sistema?',
                    },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      disabled={pending}
                      onClick={() => askQuestion(item.query, item.err ?? null)}
                      className="flex items-center justify-between rounded-control border border-line bg-subtle/50 px-3 py-1.5 text-left text-xs font-medium text-ink transition hover:border-[var(--color-brand)] hover:bg-subtle"
                    >
                      <span>{item.label}</span>
                      <span className="text-[10px] text-muted">Consultar →</span>
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
                  turn.role === 'user'
                    ? 'ml-6 bg-subtle text-ink'
                    : 'mr-6 border border-line text-ink'
                }`}
              >
                <span className="sr-only">
                  {turn.role === 'user' ? t('assistant.chat.you') : t('assistant.chat.assistant')}
                  :{' '}
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
        </>
      )}
    </section>
  );
}
