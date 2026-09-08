'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parseCustomerForm } from '@corebiz/contracts';
import { apiForRequest } from '@/api/session';

/**
 * Server Action: crear un cliente.
 *
 * Es un ADAPTADOR PRIMARIO. Su trabajo es traducir entre el mundo HTTP y el caso de
 * uso, y nada mas: no decide reglas de negocio, no consulta cuotas y no comprueba
 * permisos por su cuenta. Todo eso vive en el caso de uso, que es lo unico que
 * garantiza que la regla se aplique venga la peticion de donde venga.
 *
 * Next valida el Origin de las Server Actions automaticamente, asi que no hace falta
 * un token CSRF propio.
 */

export interface ActionState {
  readonly status: 'idle' | 'success' | 'error';
  /** Clave de traduccion del error, nunca texto ya redactado. La UI decide el idioma. */
  readonly errorKind?: string;
  readonly errorParams?: Readonly<Record<string, string | number>>;
  /** Errores por campo, para pintarlos junto a su input. */
  readonly fieldErrors?: Readonly<Record<string, string>>;
  readonly createdCode?: string;
}

export async function createCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // 1. Validacion de forma en el borde. Lo que pasa de aqui ya tiene la estructura
  //    correcta; que sea valido para el NEGOCIO lo decide el dominio.
  const parsed = parseCustomerForm(formData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !(field in fieldErrors)) {
        fieldErrors[field] = issue.message;
      }
    }
    return { status: 'error', errorKind: 'InvalidFormat', fieldErrors };
  }

  const { createCustomer } = await apiForRequest();

  const result = await createCustomer({
    name: parsed.data.name,
    taxId: parsed.data.taxId || null,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
    creditLimit: parsed.data.creditLimit || null,
  });

  if (!result.ok) {
    // El error del dominio se traduce a una clave; el texto lo pone la capa de
    // presentacion segun el idioma activo.
    const error = result.error;
    const params: Record<string, string | number> = {};
    if ('limit' in error) params.limit = error.limit;
    if ('field' in error) params.field = error.field;

    return { status: 'error', errorKind: error.kind, errorParams: params };
  }

  revalidatePath('/customers');
  return { status: 'success', createdCode: result.value.code };
}

/**
 * Archivar un cliente, o devolverlo a la lista.
 *
 * Es un formulario normal que hace POST y recarga: sin `useActionState`, sin
 * componente de cliente y sin una linea de JavaScript en el navegador. Un boton
 * que cambia un estado y refresca la pantalla no necesita mas, y lo que no se
 * envia al navegador no se puede romper en un movil viejo con mala conexion.
 *
 * No devuelve estado porque no hay nada que decir: el resultado se VE — la ficha
 * pasa a mostrar "archivado" y el boton cambia de texto.
 */
export async function setCustomerStatusAction(formData: FormData): Promise<void> {
  const customerId = formData.get('customerId');
  const archived = formData.get('archived') === 'true';
  if (typeof customerId !== 'string' || customerId === '') redirect('/customers');

  const { setCustomerStatus } = await apiForRequest();
  await setCustomerStatus({ customerId, archived });

  revalidatePath('/customers');
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}`);
}
