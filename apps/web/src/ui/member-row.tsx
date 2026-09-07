'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import {
  changeMemberRoleAction,
  removeMemberAction,
  type AdminState,
} from '@/actions/administration';

const INITIAL: AdminState = { status: 'idle' };

const ROLES = ['owner', 'admin', 'sales', 'warehouse', 'viewer'] as const;

export interface MemberRowData {
  readonly userId: string;
  readonly email: string | null;
  readonly role: string;
  readonly isYou: boolean;
  readonly since: string;
}

/**
 * Una fila del equipo, con su rol editable.
 *
 * El `select` se envia solo al cambiar, sin boton de guardar. En una tabla con
 * varias filas, un boton por fila obliga a recordar cual se toco; que el cambio
 * sea inmediato deja claro que ya esta hecho — y el error, si lo hay, aparece en
 * la misma fila.
 *
 * A uno mismo no se le ofrece expulsarse: es un error facil de cometer con un
 * boton al lado del propio nombre, y quien lo hace queda fuera de una empresa a
 * la que no puede volver por su cuenta. El caso de uso tambien lo impide.
 */
export function MemberRow({ member, canManage }: { member: MemberRowData; canManage: boolean }) {
  const t = useTranslations();
  const [roleState, changeRole, changing] = useActionState(changeMemberRoleAction, INITIAL);
  const [removeState, remove, removing] = useActionState(removeMemberAction, INITIAL);

  const error = roleState.errorKind ?? removeState.errorKind;

  return (
    <tr className="border-b border-[var(--color-line)] last:border-0 align-top">
      <td className="px-4 py-3">
        <span className="font-medium">{member.email ?? t('settings.team.noEmail')}</span>
        {member.isYou && (
          <span className="ml-2 rounded-full border border-[var(--color-line)] px-2 py-0.5 text-xs">
            {t('settings.team.you')}
          </span>
        )}
        {error !== undefined && (
          <p role="alert" className="mt-1 text-xs text-[var(--color-danger-ink)]">
            {t(`settings.errors.${error}`)}
          </p>
        )}
      </td>

      <td className="px-4 py-3">
        {canManage ? (
          <form action={changeRole}>
            <input type="hidden" name="userId" value={member.userId} />
            <label htmlFor={`role-${member.userId}`} className="sr-only">
              {t('settings.team.role')}
            </label>
            <select
              id={`role-${member.userId}`}
              name="role"
              defaultValue={member.role}
              disabled={changing}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
              className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </select>
            {/* Sin JavaScript el `onChange` no dispara, asi que hace falta una
                forma de enviar. Se oculta a los lectores de pantalla solo cuando
                hay JS no seria posible, asi que se deja visible y pequeño. */}
            <noscript>
              <button type="submit" className="ml-2 text-xs underline">
                {t('common.save')}
              </button>
            </noscript>
          </form>
        ) : (
          t(`roles.${member.role}`)
        )}
      </td>

      <td className="px-4 py-3 text-[var(--color-muted)]">{member.since}</td>

      <td className="px-4 py-3 text-right">
        {canManage && !member.isYou && (
          <form action={remove}>
            <input type="hidden" name="userId" value={member.userId} />
            <button
              type="submit"
              disabled={removing}
              className="text-sm text-[var(--color-danger-ink)] underline underline-offset-4 disabled:opacity-60"
            >
              {t('settings.team.remove')}
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}
