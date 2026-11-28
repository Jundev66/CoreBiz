export const DOCUMENT_PAYMENT_METHODS = [
  { value: 'CASH_USD', label: 'Efectivo USD ($)' },
  { value: 'CASH_VES', label: 'Efectivo VES (Bs)' },
  { value: 'ZELLE', label: 'Zelle' },
  { value: 'MOBILE_PAY', label: 'Pago Móvil' },
  { value: 'BANK_TRANSFER', label: 'Transferencia Bancaria' },
  { value: 'USDT', label: 'USDT / Cripto' },
  { value: 'POS_CARD', label: 'Punto de Venta / Tarjeta' },
  { value: 'OTHER', label: 'Otro método' },
] as const;

export const PAYMENT_METHOD_LABELS: Record<string, string> = Object.fromEntries(
  DOCUMENT_PAYMENT_METHODS.map((m) => [m.value, m.label]),
);

export type InstallmentFrequencyOption = 'SINGLE' | 'BIWEEKLY' | 'MONTHLY';

export interface InstallmentPreviewItem {
  readonly number: number;
  readonly dueDate: Date;
  readonly amount: number;
}

export function buildInstallmentPreview(
  totalAmount: number,
  frequency: InstallmentFrequencyOption,
  count: number,
  creditDays: number,
  startDate = new Date(),
): readonly InstallmentPreviewItem[] {
  if (totalAmount <= 0) return [];
  const safeCount = frequency === 'SINGLE' ? 1 : Math.max(1, Math.min(48, count));
  const rawEach = Math.floor((totalAmount / safeCount) * 100) / 100;
  const items: InstallmentPreviewItem[] = [];
  let accumulated = 0;

  for (let i = 1; i <= safeCount; i++) {
    const due = new Date(startDate.getTime());
    if (frequency === 'BIWEEKLY') {
      due.setDate(due.getDate() + i * 15);
    } else if (frequency === 'MONTHLY') {
      due.setMonth(due.getMonth() + i);
    } else {
      due.setDate(due.getDate() + Math.max(1, creditDays));
    }
    const amount =
      i === safeCount ? Math.max(0, Math.round((totalAmount - accumulated) * 100) / 100) : rawEach;
    accumulated += amount;
    items.push({ number: i, dueDate: due, amount });
  }
  return items;
}

export function convertCurrencyAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRate: number,
): number {
  if (!Number.isFinite(amount) || fromCurrency === toCurrency || exchangeRate <= 0) {
    return amount;
  }
  if (fromCurrency === 'USD' && toCurrency === 'VES') {
    return amount * exchangeRate;
  }
  if (fromCurrency === 'VES' && toCurrency === 'USD') {
    return amount / exchangeRate;
  }
  return amount;
}
