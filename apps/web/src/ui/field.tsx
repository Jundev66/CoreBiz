'use client';

import { useTranslations } from 'next-intl';

/**
 * El campo de formulario. UNO.
 *
 * Habia cinco, uno por formulario, y ninguno era igual a otro: dos marcaban lo
 * obligatorio con un asterisco, otro marcaba lo OPCIONAL con una palabra, dos
 * enlazaban una pista por `aria-describedby` y solo uno sabia pintar un error. La
 * diferencia no era una decision de diseño en ningun caso: era el orden en que se
 * escribieron.
 *
 * Eso se paga dos veces. En pantalla, porque el alta de cliente y la de proveedor se
 * ven distintas sin motivo. Y en accesibilidad, porque cada copia decidia por su cuenta
 * como atar el error y la pista al campo, que es justo lo que un lector de pantalla
 * necesita que sea consistente.
 *
 * Este componente es la union de los cinco, no el minimo comun: si un formulario
 * necesitaba algo, sigue estando.
 */
export interface FieldProps {
  readonly name: string;
  readonly label: string;
  readonly type?: string;
  /** Marca el campo con asterisco y lo exige en el navegador. */
  readonly required?: boolean;
  /**
   * Marca explicitamente el campo como opcional, con palabra en vez de simbolo.
   *
   * Es lo contrario de `required` y no su ausencia: en un formulario donde casi todo
   * es obligatorio conviene señalar la excepcion, y en uno donde casi nada lo es, al
   * reves. Marcar las dos cosas a la vez seria ruido.
   */
  readonly optional?: boolean;
  /** Se enlaza por `aria-describedby`: un lector de pantalla lo lee CON el campo. */
  readonly hint?: string;
  /** Clave de error del dominio. Se traduce aqui, con el nombre del campo. */
  readonly error?: string | undefined;
  readonly defaultValue?: string;
  readonly placeholder?: string;
  readonly autoComplete?: string;
  readonly inputMode?: 'decimal' | 'text' | 'numeric';
}

export function Field({
  name,
  label,
  type = 'text',
  required,
  optional,
  hint,
  error,
  ...rest
}: FieldProps) {
  const t = useTranslations();
  const hintId = `${name}-hint`;
  const errorId = `${name}-error`;

  // Se describe con la pista Y con el error cuando hay las dos: quedarse solo con el
  // error le quitaria a quien no ve la pantalla la explicacion de que se espera ahi.
  const describedBy = [hint !== undefined ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
        {required === true && (
          <span aria-hidden="true" className="ml-0.5 text-[var(--color-danger-ink)]">
            *
          </span>
        )}
        {optional === true && (
          <span className="ml-1.5 text-xs font-normal text-[var(--color-muted)]">
            {t('common.optional')}
          </span>
        )}
      </label>

      <input
        id={name}
        name={name}
        type={type}
        required={required}
        aria-invalid={error ? true : undefined}
        {...(describedBy !== '' ? { 'aria-describedby': describedBy } : {})}
        className="mt-1.5 w-full rounded-[var(--radius-control)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm transition placeholder:text-[var(--color-n-400)] focus:border-[var(--color-brand)] aria-invalid:border-[var(--color-danger)]"
        {...rest}
      />

      {hint !== undefined && (
        <p id={hintId} className="mt-1.5 text-xs text-[var(--color-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-[var(--color-danger-ink)]">
          {t(`errors.${error}`, { field: label })}
        </p>
      )}
    </div>
  );
}
