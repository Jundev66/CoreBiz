'use server';

import { revalidatePath } from 'next/cache';
import { recordPartnerCashDrawing, recordPartnerStockDrawing } from '@/api/partner-drawings';
import {
  recordPartnerCashDrawingSchema,
  recordPartnerStockDrawingSchema,
} from '@corebiz/contracts';

export interface PartnerDrawingActionState {
  readonly status: 'idle' | 'success' | 'error';
  readonly message?: string;
  readonly error?: string;
  readonly drawingNumber?: string;
}

export async function recordPartnerCashDrawingAction(
  _prev: PartnerDrawingActionState,
  formData: FormData,
): Promise<PartnerDrawingActionState> {
  const dateStr = formData.get('date') as string;
  const partnerId = formData.get('partnerId') as string;
  const partnerName = formData.get('partnerName') as string;
  const drawingAccountId = formData.get('drawingAccountId') as string;
  const cashAccountId = formData.get('cashAccountId') as string;
  const currency = formData.get('currency') as 'USD' | 'VES' | 'EUR';
  const amount = formData.get('amount') as string;
  const notes = formData.get('notes') as string;

  const parseResult = recordPartnerCashDrawingSchema.safeParse({
    date: new Date(dateStr),
    partnerId,
    partnerName,
    drawingAccountId,
    cashAccountId,
    currency,
    amount,
    notes,
  });

  if (!parseResult.success) {
    return { status: 'error', error: 'Datos de retiro de efectivo inválidos' };
  }

  const result = await recordPartnerCashDrawing(parseResult.data);
  if (!result.ok) {
    return { status: 'error', error: result.error.kind };
  }

  revalidatePath('/accounting/drawings');
  return {
    status: 'success',
    message: `Retiro de efectivo #${result.value.drawingNumber} registrado`,
    drawingNumber: result.value.drawingNumber,
  };
}

export async function recordPartnerStockDrawingAction(
  _prev: PartnerDrawingActionState,
  formData: FormData,
): Promise<PartnerDrawingActionState> {
  const dateStr = formData.get('date') as string;
  const partnerId = formData.get('partnerId') as string;
  const partnerName = formData.get('partnerName') as string;
  const drawingAccountId = formData.get('drawingAccountId') as string;
  const inventoryAccountId = formData.get('inventoryAccountId') as string;
  const currency = formData.get('currency') as 'USD' | 'VES' | 'EUR';
  const productId = formData.get('productId') as string;
  const quantity = Number(formData.get('quantity'));
  const unitCost = formData.get('unitCost') as string;
  const notes = formData.get('notes') as string;

  const parseResult = recordPartnerStockDrawingSchema.safeParse({
    date: new Date(dateStr),
    partnerId,
    partnerName,
    drawingAccountId,
    inventoryAccountId,
    currency,
    productId,
    quantity,
    unitCost,
    notes,
  });

  if (!parseResult.success) {
    return { status: 'error', error: 'Datos de autoconsumo de mercancía inválidos' };
  }

  const result = await recordPartnerStockDrawing(parseResult.data);
  if (!result.ok) {
    return { status: 'error', error: result.error.kind };
  }

  revalidatePath('/accounting/drawings');
  return {
    status: 'success',
    message: `Autoconsumo de inventario #${result.value.drawingNumber} registrado`,
    drawingNumber: result.value.drawingNumber,
  };
}
