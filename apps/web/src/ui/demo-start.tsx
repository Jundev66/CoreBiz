'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { restartDemoAction, startDemoAction, type DemoState } from '@/actions/demo';

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
      <div className="mt-8">
        <div
          role="status"
          className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-5"
        >
          <h2 className="text-base font-medium">{t('demo.credentialsTitle')}</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{t('demo.credentialsHint')}</p>

          <dl className="mt-4 space-y-3">
            <Credential label={t('auth.email')} value={state.email} />
            <Credential label={t('auth.password')} value={state.password} />
          </dl>

          <p className="mt-4 text-sm text-[var(--color-muted)]">
            {t('demo.expiresIn', { hours: state.hoursLeft })}
          </p>
        </div>

        {/* El modo degradado se dice en voz alta. Dejar que la persona descubra
            sola que los botones de guardar no hacen nada le ensena que el
            sistema esta roto, que es lo contrario de lo que esta pantalla
            existe para demostrar. */}
        {state.readonly && (
          <p
            role="status"
            className="mt-4 rounded-md border border-[var(--color-warn)] bg-[var(--color-warn)]/10 px-4 py-3 text-sm"
          >
            {state.readonlyReason === 'limit' ? t('demo.readonlyLimit') : t('demo.readonlyNotice')}
          </p>
        )}

        <a
          href="/customers"
          className="mt-6 block rounded-md bg-[var(--color-brand)] px-5 py-3 text-center text-base font-medium text-[var(--color-brand-ink)]"
        >
          {t('demo.enter')}
        </a>
      </div>
    );
  }

  if (session === 'expired') {
    return (
      <form action={restartDemoAction} className="mt-8">
        <div
          role="status"
          className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-5"
        >
          <h2 className="text-base font-medium">{t('demo.expiredTitle')}</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{t('demo.expiredBody')}</p>
        </div>
        <button
          type="submit"
          className="mt-6 w-full rounded-md bg-[var(--color-brand)] px-5 py-3 text-base font-medium text-[var(--color-brand-ink)]"
        >
          {t('demo.restart')}
        </button>
      </form>
    );
  }

  if (session === 'active') {
    return (
      <a
        href="/customers"
        className="mt-8 block rounded-md bg-[var(--color-brand)] px-5 py-3 text-center text-base font-medium text-[var(--color-brand-ink)]"
      >
        {t('demo.enter')}
      </a>
    );
  }

  return (
    <form action={formAction} className="mt-8">
      {state.status === 'error' && (
        <p
          role="alert"
          className="mb-4 rounded-md bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger-ink)]"
        >
          {state.errorKind === 'TooManyAttempts'
            ? t('demo.rateLimited', {
                // At least one minute: "try again in 0 min" reads like a broken counter.
                minutes: Math.max(1, Math.ceil((state.retryAfter ?? 3_600) / 60)),
              })
            : t('demo.unavailable')}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-[var(--color-brand)] px-5 py-3 text-base font-medium text-[var(--color-brand-ink)] disabled:opacity-60"
      >
        {pending ? t('demo.starting') : t('demo.start')}
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
      <dt className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{label}</dt>
      <dd className="mt-1 select-all break-all rounded-md bg-[var(--color-canvas)] px-3 py-2 font-mono text-sm">
        {value}
      </dd>
    </div>
  );
}
