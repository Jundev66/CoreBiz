'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import type { AuthState } from '@/actions/auth';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { CONTROL_BASE_CLASSES, ERROR_CLASSES, HINT_CLASSES, LABEL_CLASSES } from '@/ui/field';

/**
 * Formulario de las pantallas de cuenta.
 *
 * Uno solo para acceder, registrarse, recuperar y cambiar la clave: los cuatro
 * hacen lo mismo —enviar campos a una Server Action y mostrar lo que responda—
 * y tener cuatro copias solo garantiza que el mensaje de error se arregle en
 * tres de ellas.
 *
 * Usa `useActionState`, que degrada bien: sin JavaScript el formulario se envia
 * como un POST normal y la accion responde igual. En una pantalla de acceso eso
 * no es un detalle — es la diferencia entre poder entrar o no desde un movil con
 * mala conexion.
 */

const INITIAL: AuthState = { status: 'idle' };

/** Account screens use a taller control: it is the whole screen, and it is thumbed. */
const AUTH_CONTROL = `mt-1.5 h-11 ${CONTROL_BASE_CLASSES}`;

export interface AuthFieldSpec {
  readonly name: string;
  readonly label: string;
  readonly type?: 'text' | 'email' | 'password';
  readonly autoComplete?: string;
  readonly hint?: string;
  readonly defaultValue?: string;
  readonly minLength?: number;
  /**
   * Con opciones, el campo se pinta como lista desplegable.
   *
   * Se anadio para el alta de empresa: la moneda base tiene dos valores posibles y
   * escribirla a mano solo abre la puerta a teclear "usd " o "dolares" y recibir un
   * error que no explica nada.
   */
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  /**
   * Campos que se pueden dejar en blanco.
   *
   * Por defecto TODOS son obligatorios, y ese era el supuesto de este formulario
   * cuando solo servia para acceder y registrarse. El alta de empresa rompe el
   * supuesto: quien opere solo en su moneda base no tiene tasa de cambio que dar.
   */
  readonly optional?: boolean;
}

interface AuthFormProps {
  readonly action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  readonly fields: readonly AuthFieldSpec[];
  readonly submitLabel: string;
  readonly pendingLabel: string;
  /** Mensaje de exito cuando la accion no navega a otra pantalla. */
  readonly sentMessage?: string;
}

export function AuthForm({
  action,
  fields,
  submitLabel,
  pendingLabel,
  sentMessage,
}: AuthFormProps) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, INITIAL);

  if (state.status === 'sent' && sentMessage !== undefined) {
    return (
      <Alert tone="success" role="status">
        {sentMessage}
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {fields.map((field) => (
        <AuthField key={field.name} field={field} error={state.fieldErrors?.[field.name]} />
      ))}

      {state.status === 'error' && state.errorKind !== undefined && (
        <Alert tone="danger" role="alert">
          {t(`auth.errors.${state.errorKind}`, {
            // El limitador devuelve segundos; en pantalla se leen mejor minutos.
            minutes: Math.max(1, Math.ceil((state.retryAfter ?? 60) / 60)),
          })}
        </Alert>
      )}

      <button
        type="submit"
        disabled={pending}
        className={buttonClasses({ size: 'lg', block: true })}
      >
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}

function AuthField({ field, error }: { field: AuthFieldSpec; error: string | undefined }) {
  const t = useTranslations();
  const describedBy = [
    field.hint !== undefined ? `${field.name}-hint` : null,
    error !== undefined ? `${field.name}-error` : null,
  ].filter((id): id is string => id !== null);

  return (
    <div>
      <label htmlFor={field.name} className={LABEL_CLASSES}>
        {field.label}
        {field.optional === true && (
          <span className="ml-1.5 text-xs font-normal text-muted">{t('common.optional')}</span>
        )}
      </label>

      {field.options !== undefined ? (
        <select
          id={field.name}
          name={field.name}
          defaultValue={field.defaultValue}
          aria-describedby={describedBy.length > 0 ? describedBy.join(' ') : undefined}
          className={AUTH_CONTROL}
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={field.name}
          name={field.name}
          type={field.type ?? 'text'}
          // `required` y `minLength` aqui son ayuda al escribir, no la validacion:
          // esa la hace el servidor, que es lo unico que no se puede saltar.
          required={field.optional !== true}
          minLength={field.minLength}
          autoComplete={field.autoComplete}
          defaultValue={field.defaultValue}
          aria-invalid={error !== undefined ? true : undefined}
          aria-describedby={describedBy.length > 0 ? describedBy.join(' ') : undefined}
          className={AUTH_CONTROL}
        />
      )}

      {field.hint !== undefined && (
        <p id={`${field.name}-hint`} className={HINT_CLASSES}>
          {field.hint}
        </p>
      )}

      {error !== undefined && (
        <p id={`${field.name}-error`} className={ERROR_CLASSES}>
          {t(`auth.fieldErrors.${error}`, { field: field.label })}
        </p>
      )}
    </div>
  );
}
