'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { inviteUserAction, type AdminState } from '@/actions/administration';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { CONTROL_CLASSES, HINT_CLASSES, LABEL_CLASSES } from '@/ui/field';

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
        <label htmlFor="invite-email" className={LABEL_CLASSES}>
          {t('auth.email')}
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          className={`mt-1.5 ${CONTROL_CLASSES}`}
        />
      </div>

      <div>
        <label htmlFor="invite-role" className={LABEL_CLASSES}>
          {t('settings.team.role')}
        </label>
        <select
          id="invite-role"
          name="role"
          defaultValue="sales"
          aria-describedby="invite-role-hint"
          className={`mt-1.5 ${CONTROL_CLASSES}`}
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {t(`roles.${role}`)}
            </option>
          ))}
        </select>
        <p id="invite-role-hint" className={HINT_CLASSES}>
          {t('settings.team.roleHint')}
        </p>
      </div>

      {state.status === 'error' && state.errorKind !== undefined && (
        <Alert tone="danger" role="alert">
          {t(`settings.errors.${state.errorKind}`, state.errorParams ?? {})}
        </Alert>
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
        <Alert tone="success" role="status" title={t('settings.team.inviteCreated')}>
          <p className="text-ink-soft">{t('settings.team.inviteShare')}</p>
          <input
            readOnly
            value={state.invitationUrl}
            aria-label={t('settings.team.inviteLink')}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-3 h-10 w-full rounded-control border border-line-strong bg-surface px-3 font-mono text-xs text-ink focus:border-brand focus:ring-3 focus:ring-brand/15 focus:outline-none"
          />
        </Alert>
      )}

      <button type="submit" disabled={pending} className={buttonClasses({ block: true })}>
        {pending ? '…' : t('settings.team.invite')}
      </button>
    </form>
  );
}
