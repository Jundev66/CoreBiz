'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { forRequest } from '@/composition/container';

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

function failure(error: Record<string, unknown> & { kind: string }): PurchasingState {
  const params: Record<string, string | number> = {};
  for (const key of ['code', 'limit', 'resource', 'requiredPlan', 'sku', 'field'] as const) {
    const value = error[key];
    if (typeof value === 'string' || typeof value === 'number') params[key] = value;
  }
  return { status: 'error', errorKind: error.kind, errorParams: params };
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

  const { createSupplier } = await forRequest();
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

  const { receiveGoods } = await forRequest();
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

  const { setSupplierStatus } = await forRequest();
  await setSupplierStatus({ supplierId, archived });

  revalidatePath('/purchases/suppliers');
  redirect('/purchases/suppliers');
}
