'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { restartDemoAction, startDemoAction, type DemoState } from '@/actions/demo';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';

/** `none`: no session. `active`: already inside. `expired`: a demo whose copy is gone. */
export type DemoSessionState = 'none' | 'active' | 'expired';

/**
 * El boton que crea el visitante, y la pantalla que le entrega sus credenciales.
 *
 * Es un componente de cliente y no una accion que redirige, y la razon esta en
 * la contrasena: para redirigir habria que llevarla en la URL, donde queda en
 * los registros del servidor, en el historial del navegador y en la cabecera
 * `Referer` de la primera peticion que salga de la pagina. Devolverla como
 * estado de la accion la deja en la respuesta y en ningun sitio mas.
 *
 * Sin JavaScript el formulario sigue enviandose como un POST normal; lo que se
 * pierde es la pantalla de credenciales, no el acceso.
 */

const INITIAL: DemoState = { status: 'idle' };

export function DemoStart({ session }: { session: DemoSessionState }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(startDemoAction, INITIAL);

  // El estado de la accion manda sobre lo que diga el servidor, y ese orden es
  // el que hace que esta pantalla funcione: cuando la accion termina, la sesion
  // ya existe, asi que `session` llega como `active` en el mismo render. Si se
  // comprobara primero, las credenciales recien creadas no se verian nunca.
  if (state.status === 'ready') {
    return (
      <div>
        <div role="status">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 aria-hidden="true" className="size-5 text-success" strokeWidth={2} />
            <h2 className="text-lg font-semibold text-ink">{t('demo.credentialsTitle')}</h2>
          </div>
          <p className="mt-1.5 text-sm text-muted">{t('demo.credentialsHint')}</p>

          <dl className="mt-5 space-y-3">
            <Credential label={t('auth.email')} value={state.email} />
            <Credential label={t('auth.password')} value={state.password} />
          </dl>

          <p className="mt-4 text-xs text-muted">
            {t('demo.expiresIn', { hours: state.hoursLeft })}
          </p>
        </div>

        {/* El modo degradado se dice en voz alta, y con su motivo real: "hay muchas
            demostraciones abiertas" es mentira cuando lo que pasa es que la red del
            visitante ya uso su cuota. */}
        {state.readonly && (
          <Alert tone="warn" role="status" className="mt-4">
            {state.readonlyReason === 'limit' ? t('demo.readonlyLimit') : t('demo.readonlyNotice')}
          </Alert>
        )}

        <a
          href="/customers"
          className={buttonClasses({ size: 'lg', block: true, className: 'mt-6' })}
        >
          {t('demo.enter')}
          <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2} />
        </a>
      </div>
    );
  }

  if (session === 'expired') {
    return (
      <form action={restartDemoAction}>
        <div role="status">
          <h2 className="text-lg font-semibold text-ink">{t('demo.expiredTitle')}</h2>
          <p className="mt-1.5 text-sm text-muted">{t('demo.expiredBody')}</p>
        </div>
        <button
          type="submit"
          className={buttonClasses({ size: 'lg', block: true, className: 'mt-6' })}
        >
          {t('demo.restart')}
        </button>
      </form>
    );
  }

  if (session === 'active') {
    return (
      <a href="/customers" className={buttonClasses({ size: 'lg', block: true })}>
        {t('demo.enter')}
        <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2} />
      </a>
    );
  }

  return (
    <form action={formAction}>
      {state.status === 'error' && (
        <Alert tone="danger" role="alert" className="mb-4">
          {state.errorKind === 'TooManyAttempts'
            ? t('demo.rateLimited', {
                // At least one minute: "try again in 0 min" reads like a broken counter.
                minutes: Math.max(1, Math.ceil((state.retryAfter ?? 3_600) / 60)),
              })
            : t('demo.unavailable')}
        </Alert>
      )}

      <button
        type="submit"
        disabled={pending}
        className={buttonClasses({ size: 'lg', block: true })}
      >
        {pending ? t('demo.starting') : t('demo.start')}
        {!pending && <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2} />}
      </button>
    </form>
  );
}

/**
 * Un dato copiable.
 *
 * En `font-mono` y con `select-all` porque el gesto real de esta pantalla es
 * seleccionar y copiar, y una contrasena en tipografia proporcional se copia mal
 * a mano: la ele minuscula y el uno se confunden justo cuando no hay forma de
 * recuperarla si se apunta mal.
 */
function Credential({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 rounded-control border border-line bg-subtle px-3 py-2.5 font-mono text-sm break-all select-all">
        {value}
      </dd>
    </div>
  );
}
