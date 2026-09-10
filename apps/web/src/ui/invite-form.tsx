'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { inviteUserAction, type AdminState } from '@/actions/administration';

const INITIAL: AdminState = { status: 'idle' };

/** `owner` no esta: la propiedad se transfiere entre quienes ya estan dentro. */
const ROLES = ['admin', 'sales', 'warehouse', 'viewer'] as const;

/**
 * Invitar a alguien.
 *
 * Aqui habia un aviso de "plazas agotadas" y el formulario se dejaba enviable de todos
 * modos, para que el "no" viniera del servidor y no pareciera vivir en el boton. Ya no
 * hay plazas que agotar, pero el principio se queda escrito porque sigue rigiendo todo
 * lo demas: quien decide es el caso de uso, no la pantalla.
 */
export function InviteForm() {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(inviteUserAction, INITIAL);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="invite-email" className="block text-sm font-medium">
          {t('auth.email')}
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          className="mt-1.5 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5 text-base"
        />
      </div>

      <div>
        <label htmlFor="invite-role" className="block text-sm font-medium">
          {t('settings.team.role')}
        </label>
        <select
          id="invite-role"
          name="role"
          defaultValue="sales"
          aria-describedby="invite-role-hint"
          className="mt-1.5 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5 text-base"
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {t(`roles.${role}`)}
            </option>
          ))}
        </select>
        <p id="invite-role-hint" className="mt-1.5 text-xs text-[var(--color-muted)]">
          {t('settings.team.roleHint')}
        </p>
      </div>

      {state.status === 'error' && state.errorKind !== undefined && (
        <p
          role="alert"
          className="rounded-md bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger-ink)]"
        >
          {t(`settings.errors.${state.errorKind}`, state.errorParams ?? {})}
        </p>
      )}

      {/*
        El enlace se muestra en pantalla en lugar de mandarse por correo, y
        conviene decir por que: enviar correo exige un proveedor de SMTP con su
        cuenta y su coste mensual, y este proyecto opera a cero euros. Copiar el
        enlace y pasarlo por donde ya se habla con esa persona funciona igual de
        bien y no depende de que un correo no acabe en spam.

        El token aparece UNA vez. No se guarda en claro en ningun sitio, asi que
        no hay forma de volver a consultarlo: si se pierde, se revoca y se manda
        otro.
      */}
      {state.status === 'success' && state.invitationUrl !== undefined && (
        <div role="status" className="rounded-md bg-[var(--color-brand)]/10 p-4 text-sm">
          <p className="font-medium">{t('settings.team.inviteCreated')}</p>
          <p className="mt-1 text-[var(--color-muted)]">{t('settings.team.inviteShare')}</p>
          <input
            readOnly
            value={state.invitationUrl}
            aria-label={t('settings.team.inviteLink')}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-3 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-[var(--color-brand)] px-5 py-2.5 text-sm font-medium text-[var(--color-brand-ink)] disabled:opacity-60"
      >
        {pending ? '…' : t('settings.team.invite')}
      </button>
    </form>
  );
}
