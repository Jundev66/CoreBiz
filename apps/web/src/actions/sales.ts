'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parseProductUpdateForm } from '@corebiz/contracts';
import { apiForRequest } from '@/api/session';
import { toFormFailure } from '@/api/failure';
import { rememberFailure } from '@/api/last-error';
import type { ActionState } from './customers';
import { formRejection } from './field-errors';

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
 * El descuento se teclea en PORCENTAJE y viaja en puntos basicos.
 *
 * La conversion vive aqui, en el borde, y no en el contrato ni en el dominio: dentro
 * el descuento es un entero de puntos basicos —1250 es un 12,5 %— precisamente para no
 * arrastrar decimales por todo el calculo. Lo que cambia en el borde es solo la unidad
 * con la que una persona esta comoda escribiendo.
 *
 * Un texto que no es un numero se trata como ausencia, no como cero: escribir "doce" no
 * debe aplicar un descuento del 0 % en silencio, debe dejar la linea sin descuento.
 */
function discountToBasisPoints(raw: string): number | undefined {
  const percent = Number(raw.trim().replace(',', '.'));
  if (raw.trim() === '' || !Number.isFinite(percent)) return undefined;
  return Math.round(percent * 100);
}

/**
 * Las lineas llegan como campos repetidos del formulario (`line-product`,
 * `line-quantity`, `line-price`, `line-discount`). Se recomponen aqui emparejando por
 * posicion, y se descartan las filas vacias: dejar una fila en blanco sin querer no
 * deberia impedir emitir.
 *
 * Precio y descuento se OMITEN cuando vienen vacios en lugar de enviarse como cadena
 * vacia o como cero. Ausente significa "el precio de catalogo, sin descuento", que es
 * lo normal; mandarlos siempre convertiria cada linea en una negociacion.
 */
function parseLines(formData: FormData) {
  const textos = (name: string) =>
    formData.getAll(name).filter((v): v is string => typeof v === 'string');

  const productIds = textos('line-product');
  const quantities = textos('line-quantity');
  const prices = textos('line-price');
  const discounts = textos('line-discount');

  return productIds
    .map((productId, index) => {
      const unitPrice = (prices[index] ?? '').trim();
      const discountBp = discountToBasisPoints(discounts[index] ?? '');
      return {
        productId,
        quantity: quantities[index] ?? '',
        ...(unitPrice !== '' ? { unitPrice } : {}),
        ...(discountBp !== undefined ? { discountBp } : {}),
      };
    })
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
    // Recorded here too: this rejection does NOT go through `send()`, so without this line
    // the help panel would stay silent on the most common error of the screen. See
    // `api/last-error.ts`.
    await rememberFailure('Required');
    return { status: 'error', errorKind: 'Required', errorParams: { field: 'customerId' } };
  }
  if (lines.length === 0) {
    await rememberFailure('NoLines');
    return { status: 'error', errorKind: 'NoLines' };
  }

  const { issueDeliveryNote } = await apiForRequest();
  const result = await issueDeliveryNote({ customerId, lines, notes: notes || null });

  if (!result.ok) return toFormFailure(result.error);

  revalidatePath('/delivery-notes');
  revalidatePath('/products');
  redirect(`/delivery-notes?creado=${encodeURIComponent(result.value.number)}`);
}

/**
 * Server Action: confirmar que el cliente recibio la mercancia.
 *
 * NO revalida `/products`, y la ausencia es deliberada: confirmar la entrega no mueve
 * inventario. El stock salio al emitir la nota; aqui solo se anota que llego a su
 * destino y quien firmo el recibo.
 */
export async function markDeliveredAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const deliveryNoteId = field(formData, 'deliveryNoteId');
  const receivedBy = field(formData, 'receivedBy').trim();

  const { markDelivered } = await apiForRequest();
  const result = await markDelivered({ deliveryNoteId, receivedBy: receivedBy || null });

  if (!result.ok) return toFormFailure(result.error);

  revalidatePath('/delivery-notes');
  revalidatePath(`/delivery-notes/${deliveryNoteId}`);
  // Tambien la version imprimible: la linea de firma «Recibido por» pasa de estar en
  // blanco a llevar el nombre, y es el sitio donde ese dato se usa de verdad.
  revalidatePath(`/delivery-notes/${deliveryNoteId}/print`);
  return { status: 'success' };
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
  // Y la ficha desde la que se anula, que es la unica pantalla que el usuario esta
  // mirando en ese momento. Sin esto se queda enseñando la nota como si siguiera viva.
  revalidatePath(`/delivery-notes/${deliveryNoteId}`);
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
    // Una casilla sin marcar NO viaja en el formulario. Se manda el booleano explicito
    // en los dos sentidos, porque el dominio da ambos por ciertos cuando faltan y
    // omitirlos convertiria un "no" en un "si".
    taxable: formData.has('taxable'),
    trackStock: formData.has('trackStock'),
  });

  if (!result.ok) return toFormFailure(result.error);

  revalidatePath('/products');
  // Vuelta al catalogo con el SKU en la URL: es donde se comprueba que el producto
  // quedo como se queria, y donde se le ajusta el stock si hace falta.
  redirect(`/products?creado=${encodeURIComponent(result.value.sku)}`);
}

/**
 * Server Action: corregir la ficha de un producto.
 *
 * NO toca el inventario, y no depende de que este archivo se acuerde: el esquema no
 * acepta el saldo, el caso de uso comprueba que no cambio, y el dominio garantiza que
 * ninguno de los metodos que se invocan deja un movimiento pendiente. Para cuadrar el
 * saldo esta `adjustStockAction`, que exige un motivo.
 *
 * Vuelve a la ficha, no al catalogo: quien corrige un precio quiere verlo corregido.
 */
export async function updateProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseProductUpdateForm(formData);
  if (!parsed.success) {
    return { status: 'error', errorKind: 'InvalidFormat', ...(await formRejection(parsed.error)) };
  }

  const { updateProduct } = await apiForRequest();

  const result = await updateProduct({
    productId: parsed.data.productId,
    name: parsed.data.name,
    price: parsed.data.price,
    // Cadena vacia y no null: aqui significa VACIALO. La excepcion es `unit`, que el
    // dominio conserva si llega en blanco — un producto sin unidad deja las cantidades
    // del papel sin significado.
    unit: parsed.data.unit ?? '',
    cost: parsed.data.cost ?? '',
    minStock: parsed.data.minStock ?? '',
    description: parsed.data.description ?? '',
    taxable: parsed.data.taxable ?? true,
  });

  if (!result.ok) return toFormFailure(result.error);

  revalidatePath('/products');
  revalidatePath(`/products/${parsed.data.productId}`);
  redirect(`/products/${encodeURIComponent(parsed.data.productId)}?guardado=1`);
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
