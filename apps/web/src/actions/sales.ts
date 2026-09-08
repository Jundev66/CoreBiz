'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiForRequest } from '@/api/session';
import { toFormFailure } from '@/api/failure';
import type { ActionState } from './customers';

/**
 * Server Actions de ventas e inventario.
 *
 * Igual que las de clientes, son adaptadores primarios: traducen entre HTTP y el caso
 * de uso. Ninguna decide reglas de negocio ni comprueba permisos por su cuenta.
 */

export interface IssueNoteState extends ActionState {
  readonly createdNumber?: string;
}

/**
 * Extrae un campo de texto del formulario.
 *
 * `FormData.get` devuelve `File | string | null`: un `String(...)` directo sobre un
 * archivo produciria "[object File]" y lo colaria como si fuese un dato valido. Aqui
 * cualquier cosa que no sea texto se trata como ausente.
 */
function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/**
 * Las lineas llegan como campos repetidos del formulario (`line-product`,
 * `line-quantity`). Se recomponen aqui emparejando por posicion, y se descartan las
 * filas vacias: dejar una fila en blanco sin querer no deberia impedir emitir.
 */
function parseLines(formData: FormData) {
  const productIds = formData.getAll('line-product').filter((v) => typeof v === 'string');
  const quantities = formData.getAll('line-quantity').filter((v) => typeof v === 'string');

  return productIds
    .map((productId, index) => ({ productId, quantity: quantities[index] ?? '' }))
    .filter((line) => line.productId !== '' && line.quantity.trim() !== '');
}

export async function issueDeliveryNoteAction(
  _prev: IssueNoteState,
  formData: FormData,
): Promise<IssueNoteState> {
  const customerId = field(formData, 'customerId');
  const notes = field(formData, 'notes');
  const lines = parseLines(formData);

  if (customerId === '') {
    return { status: 'error', errorKind: 'Required', errorParams: { field: 'customerId' } };
  }
  if (lines.length === 0) {
    return { status: 'error', errorKind: 'NoLines' };
  }

  const { issueDeliveryNote } = await apiForRequest();
  const result = await issueDeliveryNote({ customerId, lines, notes: notes || null });

  if (!result.ok) return toFormFailure(result.error);

  revalidatePath('/delivery-notes');
  revalidatePath('/products');
  return { status: 'success', createdNumber: result.value.number };
}

export async function voidDeliveryNoteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const deliveryNoteId = field(formData, 'deliveryNoteId');
  const reason = field(formData, 'reason');

  const { voidDeliveryNote } = await apiForRequest();
  const result = await voidDeliveryNote({ deliveryNoteId, reason });

  if (!result.ok) return toFormFailure(result.error);

  revalidatePath('/delivery-notes');
  revalidatePath('/products');
  return { status: 'success' };
}

export async function createProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { createProduct } = await apiForRequest();

  // `exactOptionalPropertyTypes` distingue "ausente" de "presente pero undefined".
  // Un campo opcional vacio se OMITE, en lugar de enviarse como undefined.
  const unit = field(formData, 'unit').trim();

  const result = await createProduct({
    sku: field(formData, 'sku'),
    name: field(formData, 'name'),
    price: field(formData, 'price'),
    cost: field(formData, 'cost') || null,
    initialStock: field(formData, 'initialStock') || null,
    minStock: field(formData, 'minStock') || null,
    ...(unit ? { unit } : {}),
  });

  if (!result.ok) return toFormFailure(result.error);

  revalidatePath('/products');
  return { status: 'success', createdCode: result.value.sku };
}

/**
 * Server Action: cuadrar el inventario tras un conteo fisico.
 *
 * Se envia el SALDO NUEVO, no la diferencia. Quien esta delante del estante ha
 * contado doce; pedirle que calcule "menos tres" es pedirle que haga una resta
 * con la que se puede equivocar, y el error entraria como si fuera un conteo.
 * La diferencia la calcula el dominio, que ya sabe cuanto habia.
 *
 * El motivo es obligatorio y lo exige el dominio, no este formulario: un ajuste
 * sin explicacion es indistinguible de un descuadre, y dentro de tres meses nadie
 * sabra si fue merma, robo o un error de captura.
 */
export async function adjustStockAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { adjustStock } = await apiForRequest();

  const result = await adjustStock({
    productId: field(formData, 'productId'),
    newBalance: field(formData, 'newBalance'),
    reason: field(formData, 'reason'),
  });

  if (!result.ok) return toFormFailure(result.error);

  revalidatePath('/products');

  // Se devuelve el saldo resultante y no un "listo" a secas: lo que la persona
  // necesita confirmar es que el numero de la pantalla coincide con el del
  // estante que acaba de contar.
  return { status: 'success', createdCode: result.value.current };
}

/**
 * Sacar un producto del catalogo, o devolverlo.
 *
 * El inventario que tuviera NO se toca. Es lo correcto: si quedaban tres bolsas en
 * el estante, siguen ahi. Poner el saldo a cero inventaria una salida de mercancia
 * que nunca ocurrio, y el libro de movimientos dejaria de explicar el saldo.
 */
export async function setProductStatusAction(formData: FormData): Promise<void> {
  const productId = formData.get('productId');
  const archived = formData.get('archived') === 'true';
  if (typeof productId !== 'string' || productId === '') redirect('/products');

  const { setProductStatus } = await apiForRequest();
  await setProductStatus({ productId, archived });

  revalidatePath('/products');
  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}`);
}
