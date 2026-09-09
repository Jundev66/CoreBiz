'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { apiForRequest } from '@/api/session';
import { toFormFailure } from '@/api/failure';

/**
 * Server Actions de compras.
 *
 * El modulo entero esta reservado al plan PRO, y el gate lo aplica el caso de
 * uso — no estas funciones, ni la ruta, ni la visibilidad del enlace. Estas
 * acciones son exactamente el camino que usaria alguien invocandolas a mano
 * desde la consola del navegador, y por eso son el sitio donde comprobar que el
 * limite de verdad esta puesto: no lo estan comprobando ellas.
 */

export interface PurchasingState {
  readonly status: 'idle' | 'success' | 'error';
  readonly errorKind?: string;
  readonly errorParams?: Readonly<Record<string, string | number>>;
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

const supplierInput = z.object({
  name: z.string().trim().min(2).max(120),
  taxId: z.string().trim().optional(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
});

export async function createSupplierAction(
  _prev: PurchasingState,
  formData: FormData,
): Promise<PurchasingState> {
  const parsed = supplierInput.safeParse({
    name: formData.get('name'),
    taxId: formData.get('taxId') ?? undefined,
    email: formData.get('email') ?? undefined,
    phone: formData.get('phone') ?? undefined,
    contactName: formData.get('contactName') ?? undefined,
  });
  if (!parsed.success) return { status: 'error', errorKind: 'InvalidFormat' };

  const { createSupplier } = await apiForRequest();
  const result = await createSupplier({
    name: parsed.data.name,
    taxId: parsed.data.taxId || null,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
    contactName: parsed.data.contactName || null,
  });

  if (!result.ok) return failure(result.error);

  revalidatePath('/purchases/suppliers');
  return { status: 'success', createdNumber: result.value.code };
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
    return { status: 'error', errorKind: 'InvalidFormat' };
  }

  const reference = formData.get('supplierReference');

  const { receiveGoods } = await apiForRequest();
  const result = await receiveGoods({
    supplierId,
    lines: parseLines(formData),
    supplierReference: typeof reference === 'string' && reference !== '' ? reference : null,
  });

  if (!result.ok) return failure(result.error);

  // La recepcion cambia el inventario, asi que la pantalla de productos y la de
  // compras dejan de ser validas a la vez.
  revalidatePath('/purchases');
  revalidatePath('/products');

  return { status: 'success', createdNumber: result.value.number };
}

/**
 * Archivar un proveedor, o devolverlo a la lista.
 *
 * El gate PRO lo aplica el caso de uso, no esta funcion: una Server Action se puede
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
