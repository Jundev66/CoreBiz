'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, RefreshCw, ScanLine, Sparkles } from 'lucide-react';
import { AI_PROVIDERS, AI_PROVIDER_TRAITS, type AiProvider } from '@corebiz/domain';
import {
  listAiModelsAction,
  removeAiSettingsAction,
  saveAiSettingsAction,
  type AiFormState,
} from '@/actions/ai';
import { reindexEmbeddingsAction } from '@/actions/vision';
import type { AiSettingsView } from '@/api/ai';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { CONTROL_CLASSES, HINT_CLASSES, LABEL_CLASSES } from '@/ui/field';
import { toast } from '@/ui/toast';

const INITIAL: AiFormState = { status: 'idle' };

/**
 * Connecting the assistant to a provider.
 *
 * The screen walks the same three steps the use case enforces, in the order a person does
 * them: pick where the AI lives, give the key (or the address), then choose a model FROM THE
 * LIST THE PROVIDER RETURNS for that key. The model is not a free text field because which
 * models exist depends on the account behind the key, and a typo there only fails later, in
 * front of a colleague who cannot fix it.
 *
 * The one exception is an OpenAI-compatible service that publishes no list: then the name is
 * typed, and saving proves it with a one-token request.
 */
export function AiSettingsForm({ saved }: { saved: AiSettingsView | null }) {
  const t = useTranslations();
  const [provider, setProvider] = useState<AiProvider>(saved?.provider ?? 'anthropic');
  // Controlled on purpose: React resets uncontrolled fields after every form action, and
  // "test and load models" would wipe the key the person just pasted before they could save.
  const initialBaseUrl = (id: AiProvider) =>
    saved !== null && saved.provider === id && saved.baseUrl !== null
      ? saved.baseUrl
      : AI_PROVIDER_TRAITS[id].defaultBaseUrl;
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl(provider));
  const [apiKey, setApiKey] = useState('');
  const [typedModel, setTypedModel] = useState('');
  const [chosenModel, setChosenModel] = useState<string | null>(null);

  const chooseProvider = (id: AiProvider) => {
    setProvider(id);
    setBaseUrl(initialBaseUrl(id));
    setApiKey('');
    setTypedModel('');
  };
  const [listed, listAction, listing] = useActionState(listAiModelsAction, INITIAL);
  const [save, saveAction, saving] = useActionState(saveAiSettingsAction, INITIAL);
  const [removal, removeAction, removing] = useActionState(removeAiSettingsAction, INITIAL);
  const [isReindexing, startReindex] = useTransition();

  const handleReindex = () => {
    startReindex(async () => {
      const res = await reindexEmbeddingsAction();
      if (res.ok) {
        toast.success(
          `Catálogo reindexado: ${res.products ?? 0} productos y ${res.suppliers ?? 0} proveedores.`,
          { title: 'Búsqueda Semántica' },
        );
      } else {
        if (res.error === 'AiNotConfigured') {
          toast.info(
            'Embeddings no disponibles en este despliegue. Synapse Vision usará coincidencia difusa de texto.',
            { title: 'Embeddings' },
          );
        } else {
          toast.error(`No se pudo reindexar: ${res.error}`, { title: 'Búsqueda Semántica' });
        }
      }
    });
  };

  const traits = AI_PROVIDER_TRAITS[provider];
  const sameAsSaved = saved !== null && saved.provider === provider;
  const models = listed.provider === provider ? listed.models : undefined;
  const pending = listing || saving || removing;

  useEffect(() => {
    if (save.status === 'error' && save.errorKind) {
      toast.error(
        save.errorKind === 'Required'
          ? t('settings.ai.chooseModel')
          : t(`settings.errors.${save.errorKind}`),
        { title: 'Configuración de IA' },
      );
    } else if (save.status === 'success') {
      toast.success(t('settings.ai.saved'), { title: 'Configuración guardada' });
    }
  }, [save, t]);

  useEffect(() => {
    if (listed.status === 'error' && listed.errorKind) {
      toast.error(t(`settings.errors.${listed.errorKind}`), { title: 'Conexión con el proveedor' });
    } else if (listed.status === 'success' && listed.models) {
      toast.success(t('settings.ai.listed', { count: listed.models.length }), {
        title: 'Modelos disponibles',
      });
    }
  }, [listed, t]);

  useEffect(() => {
    if (removal.status === 'error' && removal.errorKind) {
      toast.error(t(`settings.errors.${removal.errorKind}`), { title: 'Desconexión de IA' });
    }
  }, [removal, t]);

  // What the model control offers: the provider's list, a free field when there is no list,
  // or — before testing — the saved model so an unchanged form can still be saved.
  const modelOptions =
    models !== undefined && models.length > 0
      ? models
      : sameAsSaved && models === undefined
        ? [{ id: saved.model, label: saved.model }]
        : [];
  const typeModel = models !== undefined && models.length === 0;
  const has = (id: string | null | undefined) => modelOptions.some((m) => m.id === id);
  const selectedModel = has(chosenModel)
    ? (chosenModel ?? '')
    : sameAsSaved && has(saved.model)
      ? saved.model
      : (modelOptions[0]?.id ?? '');

  const errorKind =
    save.status === 'error'
      ? save.errorKind
      : listed.status === 'error' && listed.provider === provider
        ? listed.errorKind
        : removal.status === 'error'
          ? removal.errorKind
          : undefined;

  return (
    <div className="space-y-6">
      {saved !== null && removal.status !== 'success' ? (
        <Alert tone="success" title={t('settings.ai.connectedTitle')}>
          {t('settings.ai.connected', {
            provider: t(`settings.ai.providers.${saved.provider}.name`),
            model: saved.model,
          })}
        </Alert>
      ) : (
        <div className="rounded-card border border-brand/20 bg-brand-soft/10 p-4 text-xs text-muted space-y-2">
          <div className="flex items-center gap-2 font-semibold text-ink text-sm">
            <Sparkles className="size-4 text-brand" />
            <span>Integración de Inteligencia Artificial</span>
          </div>
          <p className="leading-relaxed">
            Por defecto, CoreBiz opera con un <strong>modo demostración determinista</strong> sin
            costo ni consumo de tokens para que reclutadores y evaluadores exploren el sistema.
          </p>
          <p className="leading-relaxed">
            Para probar la extracción de remitos y el asistente conversacional con modelos reales en
            producción, ingresa tu propia clave de API (por ejemplo, la gratuita de{' '}
            <strong>Google AI Studio</strong> o una clave de <strong>Claude / OpenAI</strong>).
          </p>
        </div>
      )}

      <form action={saveAction} className="space-y-6">
        <fieldset disabled={pending} className="space-y-6">
          <legend className="sr-only">{t('settings.ai.heading')}</legend>

          {/* Step 1 — where the AI lives. */}
          <div>
            <p className={LABEL_CLASSES}>{t('settings.ai.step1')}</p>
            <div role="radiogroup" className="mt-2 grid gap-2 sm:grid-cols-2">
              {AI_PROVIDERS.map((id) => (
                <label
                  key={id}
                  className={`flex cursor-pointer flex-col rounded-control border px-3 py-2.5 text-sm transition-colors ${
                    id === provider
                      ? 'border-brand bg-brand/5 ring-3 ring-brand/15'
                      : 'border-line-strong bg-surface hover:bg-subtle'
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium text-ink">
                    <input
                      type="radio"
                      name="provider"
                      value={id}
                      checked={id === provider}
                      onChange={() => chooseProvider(id)}
                      className="accent-[var(--color-brand)]"
                    />
                    {t(`settings.ai.providers.${id}.name`)}
                  </span>
                  <span className="mt-0.5 pl-6 text-xs text-muted">
                    {t(`settings.ai.providers.${id}.tagline`)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Step 2 — how to reach it. */}
          <div className="space-y-4 rounded-control border border-line bg-subtle p-4">
            <p className={LABEL_CLASSES}>{t('settings.ai.step2')}</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
              {(['a', 'b', 'c'] as const).map((step) => (
                <li key={step}>{t(`settings.ai.providers.${provider}.how.${step}`)}</li>
              ))}
            </ol>

            {traits.customBaseUrl && (
              <div>
                <label htmlFor="ai-base-url" className={LABEL_CLASSES}>
                  {t('settings.ai.baseUrl')}
                </label>
                <input
                  id="ai-base-url"
                  name="baseUrl"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  aria-describedby="ai-base-url-hint"
                  className={`mt-1.5 ${CONTROL_CLASSES}`}
                />
                <p id="ai-base-url-hint" className={HINT_CLASSES}>
                  {t(`settings.ai.providers.${provider}.baseUrlHint`)}
                </p>
              </div>
            )}

            <div>
              <label htmlFor="ai-api-key" className={LABEL_CLASSES}>
                {t('settings.ai.apiKey')}
                {!traits.requiresApiKey && (
                  <span className="ml-1 font-normal text-muted">{t('common.optional')}</span>
                )}
              </label>
              <input
                id="ai-api-key"
                name="apiKey"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={
                  sameAsSaved && saved.apiKeyHint !== null
                    ? t('settings.ai.apiKeySaved', { hint: saved.apiKeyHint })
                    : ''
                }
                aria-describedby="ai-api-key-hint"
                className={`mt-1.5 ${CONTROL_CLASSES}`}
              />
              <p id="ai-api-key-hint" className={HINT_CLASSES}>
                {sameAsSaved && saved.apiKeyHint !== null
                  ? t('settings.ai.apiKeyKeepHint')
                  : t('settings.ai.apiKeyHint')}
              </p>
            </div>

            <button
              type="submit"
              formAction={listAction}
              className={buttonClasses({ variant: 'secondary' })}
            >
              {listing ? '…' : t('settings.ai.testAndList')}
            </button>

            {models !== undefined && models.length > 0 && (
              <Alert tone="success" role="status">
                {t('settings.ai.listed', { count: models.length })}
              </Alert>
            )}
          </div>

          {/* Step 3 — which model. */}
          <div>
            <label htmlFor="ai-model" className={LABEL_CLASSES}>
              {t('settings.ai.step3')}
            </label>
            {typeModel ? (
              <input
                id="ai-model"
                name="model"
                value={typedModel}
                onChange={(event) => setTypedModel(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                required
                aria-describedby="ai-model-hint"
                className={`mt-1.5 ${CONTROL_CLASSES}`}
              />
            ) : (
              <select
                id="ai-model"
                name="model"
                disabled={modelOptions.length === 0}
                value={selectedModel}
                onChange={(event) => setChosenModel(event.target.value)}
                aria-describedby="ai-model-hint"
                className={`mt-1.5 ${CONTROL_CLASSES}`}
              >
                {modelOptions.length === 0 && (
                  <option value="">{t('settings.ai.modelFirstTest')}</option>
                )}
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label === m.id ? m.id : `${m.label} (${m.id})`}
                  </option>
                ))}
              </select>
            )}
            <p id="ai-model-hint" className={HINT_CLASSES}>
              {typeModel ? t('settings.ai.modelTypeHint') : t('settings.ai.modelHint')}
            </p>
          </div>

          <Alert tone="info">
            {provider === 'ollama' ? t('settings.ai.privacyOllama') : t('settings.ai.privacy')}
          </Alert>

          {errorKind !== undefined && (
            <Alert tone="danger" role="alert">
              {errorKind === 'Required'
                ? t('settings.ai.chooseModel')
                : t(`settings.errors.${errorKind}`)}
            </Alert>
          )}

          {save.status === 'success' && (
            <Alert tone="success" role="status">
              {t('settings.ai.saved')}
            </Alert>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <button
              type="submit"
              className={buttonClasses()}
              disabled={modelOptions.length === 0 && !typeModel}
            >
              {saving ? '…' : t('settings.ai.save')}
            </button>
          </div>
        </fieldset>
      </form>

      {saved !== null && removal.status !== 'success' && (
        <div className="rounded-card border border-brand/20 bg-brand-soft/10 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-ink flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-brand" />
              Capacidades habilitadas con este proveedor
            </h3>
            <span className="inline-flex items-center gap-1 rounded-pill bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-ink">
              Activo
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-ink">
            <div className="flex items-start gap-2.5 rounded-control bg-surface border border-line p-3">
              <Bot className="size-4 text-brand shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-sm">Asistente Copiloto</span>
                <span className="text-muted leading-relaxed">
                  Responde consultas sobre ventas, deudas y stock en el panel lateral.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-control bg-surface border border-line p-3">
              <ScanLine className="size-4 text-brand shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-sm">Synapse Vision con IA</span>
                <span className="text-muted leading-relaxed">
                  Lectura e interpretación de remitos en /vision conectada a tu modelo en vivo.
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-line/60 pt-3">
            <button
              type="button"
              onClick={handleReindex}
              disabled={isReindexing}
              className={buttonClasses({ variant: 'secondary', size: 'sm' })}
            >
              <RefreshCw className={`size-3.5 ${isReindexing ? 'animate-spin' : ''}`} />
              <span>{isReindexing ? 'Reindexando catálogo…' : 'Reindexar catálogo para IA'}</span>
            </button>

            <form action={removeAction}>
              <button
                type="submit"
                disabled={pending || isReindexing}
                className={buttonClasses({
                  variant: 'ghost',
                  size: 'sm',
                  className: 'text-danger hover:text-danger',
                })}
              >
                {removing ? '…' : t('settings.ai.remove')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
