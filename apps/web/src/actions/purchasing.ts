'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parseSupplierForm, parseSupplierUpdateForm } from '@corebiz/contracts';
import { apiForRequest } from '@/api/session';
import { toFormFailure } from '@/api/failure';
import { formRejection } from './field-errors';

/**
 * Server Actions de compras.
 *
 * Estas funciones NO deciden nada: validan la forma del formulario y reenvian. Los
 * permisos los comprueba el caso de uso, no la ruta ni la visibilidad del enlace.
 * Son exactamente el camino que usaria alguien invocandolas a mano desde la consola
 * del navegador, y por eso son el sitio donde se ve que el limite esta en otra parte.
 */

export interface PurchasingState {
  readonly status: 'idle' | 'success' | 'error';
  readonly errorKind?: string;
  readonly errorParams?: Readonly<Record<string, string | number>>;
  /**
   * Per-field errors, rendered next to their input.
   *
   * They were not declared while `formRejection` already returned them, so they travelled
   * and nothing rendered them: a supplier value that was too long only said "Check the
   * data" without pointing at which. A spread does not trigger excess-property checks, so
   * nothing flagged the disconnect.
   */
  readonly fieldErrors?: Readonly<Record<string, string>>;
  readonly createdNumber?: string;
}

const failure = toFormFailure;

/**
 * Extrae un campo de texto del formulario.
 *
 * `FormData.get` devuelve `File | string | null`: un `String(...)` directo sobre un
 * archivo produciria "[object File]" y lo colaria como si fuese un dato valido. Aqui
 * cualquier cosa que no sea texto se trata como ausente.
 */
function campo(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export async function createSupplierAction(
  _prev: PurchasingState,
  formData: FormData,
): Promise<PurchasingState> {
  const parsed = parseSupplierForm(formData);
  if (!parsed.success) {
    return { status: 'error', errorKind: 'InvalidFormat', ...(await formRejection(parsed.error)) };
  }

  const { createSupplier } = await apiForRequest();
  const result = await createSupplier({
    name: parsed.data.name,
    taxId: parsed.data.taxId || null,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
    contactName: parsed.data.contactName || null,
    // El contrato y la API lo aceptan desde el principio y esta accion lo dejaba caer.
    // La pantalla todavia no ofrece el campo, asi que hoy llega vacio siempre; lo que
    // se arregla es que deje de perderse en el camino el dia que se ofrezca.
    notes: parsed.data.notes || null,
  });

  if (!result.ok) return failure(result.error);

  revalidatePath('/purchases/suppliers');
  // El formulario de proveedores vive AL LADO de su listado, asi que "volver" es
  // quedarse: lo que cambia es que el aviso sale flotando y la lista ya trae el nuevo.
  redirect(`/purchases/suppliers?creado=${encodeURIComponent(result.value.code)}`);
}

/**
 * Corregir la ficha de un proveedor.
 *
 * Vuelve al listado y no a una ficha, al reves que clientes y productos, por un motivo
 * concreto: los proveedores NO tienen pantalla de detalle propia. Se administran desde
 * su listado, asi que ahi es donde se comprueba que el cambio quedo bien.
 */
export async function updateSupplierAction(
  _prev: PurchasingState,
  formData: FormData,
): Promise<PurchasingState> {
  const parsed = parseSupplierUpdateForm(formData);
  if (!parsed.success) {
    return { status: 'error', errorKind: 'InvalidFormat', ...(await formRejection(parsed.error)) };
  }

  const { updateSupplier } = await apiForRequest();
  const result = await updateSupplier({
    supplierId: parsed.data.supplierId,
    name: parsed.data.name,
    // Cadena vacia y no null: al corregir, un campo en blanco significa vaciarlo.
    taxId: parsed.data.taxId ?? '',
    email: parsed.data.email ?? '',
    phone: parsed.data.phone ?? '',
    contactName: parsed.data.contactName ?? '',
    notes: parsed.data.notes ?? '',
  });

  if (!result.ok) return failure(result.error);

  revalidatePath('/purchases/suppliers');
  redirect(`/purchases/suppliers?guardado=${encodeURIComponent(result.value.code)}`);
}

/**
 * Las lineas llegan como arrays paralelos del formulario.
 *
 * Es como los envia un `<form>` con varios campos del mismo nombre, y se
 * recomponen aqui en el borde. Recorrer por indice y descartar las filas vacias
 * evita que una linea a medio rellenar —el caso normal cuando alguien anade un
 * renglon y cambia de idea— haga fallar el envio entero.
 */
function parseLines(formData: FormData) {
  const productIds = formData.getAll('productId').map(String);
  const quantities = formData.getAll('quantity').map(String);
  const costs = formData.getAll('unitCost').map(String);

  return productIds.flatMap((productId, index) => {
    const quantity = quantities[index] ?? '';
    const unitCost = costs[index] ?? '';
    if (productId === '' || quantity.trim() === '' || unitCost.trim() === '') return [];

    // La coma decimal es lo normal en español. Sin esta conversion, "1,5" se
    // interpretaria como texto invalido y el mensaje culparia a quien escribio
    // bien su propio idioma.
    return [
      {
        productId,
        quantity: quantity.replace(',', '.'),
        unitCost: unitCost.replace(',', '.'),
      },
    ];
  });
}

export async function receiveGoodsAction(
  _prev: PurchasingState,
  formData: FormData,
): Promise<PurchasingState> {
  const supplierId = formData.get('supplierId');
  if (typeof supplierId !== 'string' || supplierId === '') {
    return { status: 'error', errorKind: 'InvalidFormat', ...(await formRejection()) };
  }

  const reference = formData.get('supplierReference');
  const notes = formData.get('notes');

  const { receiveGoods } = await apiForRequest();
  const result = await receiveGoods({
    supplierId,
    lines: parseLines(formData),
    supplierReference: typeof reference === 'string' && reference !== '' ? reference : null,
    notes: typeof notes === 'string' && notes.trim() !== '' ? notes : null,
  });

  if (!result.ok) return failure(result.error);

  // La recepcion cambia el inventario, asi que la pantalla de productos y la de
  // compras dejan de ser validas a la vez.
  revalidatePath('/purchases');
  revalidatePath('/products');

  redirect(`/purchases?creado=${encodeURIComponent(result.value.number)}`);
}

/**
 * Archivar un proveedor, o devolverlo a la lista.
 *
 * El permiso lo comprueba el caso de uso, no esta funcion: una Server Action se puede
 * invocar directamente, asi que un modulo protegido solo por el enlace del menu no
 * esta protegido.
 */
export async function setSupplierStatusAction(formData: FormData): Promise<void> {
  const supplierId = formData.get('supplierId');
  const archived = formData.get('archived') === 'true';
  if (typeof supplierId !== 'string' || supplierId === '') redirect('/purchases/suppliers');

  const { setSupplierStatus } = await apiForRequest();
  await setSupplierStatus({ supplierId, archived });

  revalidatePath('/purchases/suppliers');
  redirect('/purchases/suppliers');
}

/**
 * Anular una recepcion ya registrada.
 *
 * Puede fallar por un motivo que no tiene equivalente en ventas: si la mercancia recibida
 * ya se vendio, el saldo no da para deshacer la entrada. Ese error viaja como cualquier
 * otro y la pantalla lo traduce; no se traga aqui.
 */
export async function voidGoodsReceiptAction(
  _prev: PurchasingState,
  formData: FormData,
): Promise<PurchasingState> {
  const goodsReceiptId = campo(formData, 'goodsReceiptId');
  const reason = campo(formData, 'reason');

  const { voidGoodsReceipt } = await apiForRequest();
  const result = await voidGoodsReceipt({ goodsReceiptId, reason });

  if (!result.ok) return failure(result.error);

  revalidatePath('/purchases');
  revalidatePath('/products');
  // Y la ficha desde la que se anula, que es la unica pantalla que el usuario esta
  // mirando en ese momento. Sin esto se queda ensenando la recepcion como si siguiera
  // viva.
  revalidatePath(`/purchases/${goodsReceiptId}`);
  return { status: 'success' };
}
