'use client';

import { useTranslations } from 'next-intl';

/*
 * The look of every control: input, select and textarea.
 *
 * Exported so the hand-written controls of the line editors and action panels match `Field`
 * exactly instead of re-typing the string. This module is a CLIENT module, so only client
 * components can import these constants: a Server Component would receive a client
 * reference instead of the text.
 */
export const CONTROL_BASE_CLASSES =
  'w-full rounded-control border border-line-strong bg-surface px-3 text-[15px] text-ink shadow-xs transition placeholder:text-n-400 focus:border-brand focus:ring-3 focus:ring-brand/15 focus:outline-none aria-invalid:border-danger disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted sm:text-sm';
export const CONTROL_CLASSES = `h-10 ${CONTROL_BASE_CLASSES}`;
export const TEXTAREA_CLASSES = `min-h-24 py-2 ${CONTROL_BASE_CLASSES}`;
export const LABEL_CLASSES = 'block text-sm font-medium text-ink';
export const HINT_CLASSES = 'mt-1.5 text-xs text-muted';
export const ERROR_CLASSES = 'mt-1.5 text-xs text-danger-ink';

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
  /**
   * With options the field renders as a `select`, with the same label, hint and error
   * wiring as the text input. `placeholder` and `inputMode` do not apply to it.
   */
  readonly options?: readonly { readonly value: string; readonly label: string }[];
}

export function Field({
  name,
  label,
  type = 'text',
  required,
  optional,
  hint,
  error,
  options,
  ...rest
}: FieldProps) {
  const t = useTranslations();
  const hintId = `${name}-hint`;
  const errorId = `${name}-error`;

  /*
   * The error's translation key, with a safety net.
   *
   * The incoming message IS the key — `Required`, `TooLong`, `InvalidAmount` — chosen by
   * `fieldErrorsOf` (`@/actions/field-errors`), which only produces catalogue keys. This is
   * the second line of defence: if something untranslated ever arrives, the field says
   * "has an invalid format" in the viewer's language instead of rendering
   * `errors.Too big: expected string to have <=24 characters`.
   *
   * next-intl does NOT throw on a missing key: it reports it through `onError` and returns
   * the key path, which is exactly the text that ends up on screen. Verified against
   * `use-intl@4.14.2`.
   */
  const errorKey =
    error === undefined || t.has(`errors.${error}`) === false
      ? 'errors.InvalidFormat'
      : `errors.${error}`;

  // Se describe con la pista Y con el error cuando hay las dos: quedarse solo con el
  // error le quitaria a quien no ve la pantalla la explicacion de que se espera ahi.
  const describedBy = [hint !== undefined ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ');

  const shared = {
    id: name,
    name,
    required,
    'aria-invalid': error ? true : undefined,
    ...(describedBy !== '' ? { 'aria-describedby': describedBy } : {}),
  };

  return (
    <div className="min-w-0">
      <label htmlFor={name} className={LABEL_CLASSES}>
        {label}
        {required === true && (
          <span aria-hidden="true" className="ml-0.5 text-danger-ink">
            *
          </span>
        )}
        {optional === true && (
          <span className="ml-1.5 text-xs font-normal text-muted">{t('common.optional')}</span>
        )}
      </label>

      {options !== undefined ? (
        <select
          {...shared}
          defaultValue={rest.defaultValue}
          autoComplete={rest.autoComplete}
          className={`mt-1.5 ${CONTROL_CLASSES}`}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input {...shared} type={type} className={`mt-1.5 ${CONTROL_CLASSES}`} {...rest} />
      )}

      {hint !== undefined && (
        <p id={hintId} className={HINT_CLASSES}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={ERROR_CLASSES}>
          {t(errorKey, { field: label })}
        </p>
      )}
    </div>
  );
}
