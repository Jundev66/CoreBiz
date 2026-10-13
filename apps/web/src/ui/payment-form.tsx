'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, DollarSign } from 'lucide-react';
import { receivePaymentAction, type PaymentActionState } from '@/actions/payments';
import { buttonClasses } from '@/ui/button';
import { Alert } from '@/ui/feedback';
import { CONTROL_CLASSES, LABEL_CLASSES, TEXTAREA_CLASSES } from '@/ui/field';
import { Card } from '@/ui/primitives';
import { toast } from '@/ui/toast';

const INITIAL: PaymentActionState = { status: 'idle' };

export interface CustomerOption {
  readonly id: string;
  readonly label: string;
}

export interface ReceivableNoteItem {
  readonly deliveryNoteId: string;
  readonly number: string;
  readonly issuedAt: Date | null;
  readonly total: string;
  readonly paidAmount: string;
  readonly balance: string;
  readonly currency: string;
}

export function PaymentForm({
  customers,
  selectedCustomerId,
  receivables,
}: {
  customers: readonly CustomerOption[];
  selectedCustomerId?: string;
  receivables: readonly ReceivableNoteItem[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, formAction, pending] = useActionState(receivePaymentAction, INITIAL);

  const [customerId, setCustomerId] = useState(selectedCustomerId ?? customers[0]?.id ?? '');
  const [paymentMethod, setPaymentMethod] = useState<
    'cash_usd' | 'cash_ves' | 'bank_transfer' | 'mobile_pay' | 'other'
  >('cash_usd');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [manualAmount, setManualAmount] = useState<string>('');

  useEffect(() => {
    if (selectedCustomerId && selectedCustomerId !== customerId) {
      setCustomerId(selectedCustomerId);
    }
  }, [selectedCustomerId, customerId]);

  useEffect(() => {
    if (state.status === 'error' && state.errorKind) {
      toast.error(t(`errors.${state.errorKind}`, state.errorParams ?? {}));
    }
  }, [state, t]);

  const handleCustomerChange = (newCustomerId: string) => {
    setCustomerId(newCustomerId);
    setAllocations({});
    setManualAmount('');
    startTransition(() => {
      router.push(`/payments/new?customerId=${encodeURIComponent(newCustomerId)}`);
    });
  };

  const handleSetAllocation = (noteId: string, val: string) => {
    const updated = { ...allocations, [noteId]: val };
    setAllocations(updated);

    // Auto-update total amount
    const totalAllocated = Object.values(updated).reduce((acc, curr) => {
      const n = Number(curr.replace(',', '.'));
      return acc + (isNaN(n) ? 0 : n);
    }, 0);
    setManualAmount(totalAllocated > 0 ? totalAllocated.toFixed(2) : '');
  };

  const handlePayFullNote = (note: ReceivableNoteItem) => {
    handleSetAllocation(note.deliveryNoteId, note.balance);
  };

  const handlePayAllNotes = () => {
    const updated: Record<string, string> = {};
    let total = 0;
    for (const note of receivables) {
      updated[note.deliveryNoteId] = note.balance;
      const b = Number(note.balance.replace(',', '.'));
      total += isNaN(b) ? 0 : b;
    }
    setAllocations(updated);
    setManualAmount(total.toFixed(2));
  };

  const totalAllocatedNum = Object.values(allocations).reduce((acc, curr) => {
    const n = Number(curr.replace(',', '.'));
    return acc + (isNaN(n) ? 0 : n);
  }, 0);

  const totalPendingBalance = receivables.reduce((acc, note) => {
    const b = Number(note.balance.replace(',', '.'));
    return acc + (isNaN(b) ? 0 : b);
  }, 0);

  return (
    <form action={formAction} className="space-y-6">
      <Card className="space-y-4 p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink">{t('payments.generalInfo')}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL_CLASSES}>{t('payments.customer')}</span>
            <select
              name="customerId"
              value={customerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
              className={`mt-1.5 ${CONTROL_CLASSES}`}
              required
            >
              <option value="" disabled>
                {t('common.select')}
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={LABEL_CLASSES}>{t('payments.method')}</span>
            <select
              name="paymentMethod"
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(
                  e.target.value as
                    'cash_usd' | 'cash_ves' | 'bank_transfer' | 'mobile_pay' | 'other',
                )
              }
              className={`mt-1.5 ${CONTROL_CLASSES}`}
              required
            >
              <option value="cash_usd">{t('payments.methods.cash_usd')}</option>
              <option value="cash_ves">{t('payments.methods.cash_ves')}</option>
              <option value="bank_transfer">{t('payments.methods.bank_transfer')}</option>
              <option value="mobile_pay">{t('payments.methods.mobile_pay')}</option>
              <option value="other">{t('payments.methods.other')}</option>
            </select>
          </label>

          <label className="block">
            <span className={LABEL_CLASSES}>{t('payments.amount')} ($)</span>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted">
                <DollarSign className="size-4" />
              </span>
              <input
                type="text"
                name="amount"
                required
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                placeholder="0.00"
                className={`pl-8 ${CONTROL_CLASSES}`}
              />
            </div>
          </label>

          <label className="block">
            <span className={LABEL_CLASSES}>{t('payments.reference')}</span>
            <input
              type="text"
              name="reference"
              maxLength={120}
              placeholder={t('payments.referenceHint')}
              className={`mt-1.5 ${CONTROL_CLASSES}`}
            />
          </label>
        </div>

        <label className="block">
          <span className={LABEL_CLASSES}>{t('payments.notes')}</span>
          <textarea
            name="notes"
            rows={2}
            maxLength={500}
            placeholder={t('payments.notesHint')}
            className={`mt-1.5 ${TEXTAREA_CLASSES}`}
          />
        </label>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{t('payments.pendingNotes')}</h2>
            <p className="mt-0.5 text-xs text-muted">
              {t('payments.totalReceivable')}: ${totalPendingBalance.toFixed(2)}
            </p>
          </div>
          {receivables.length > 0 && (
            <button
              type="button"
              onClick={handlePayAllNotes}
              className={buttonClasses({ variant: 'secondary', size: 'sm' })}
            >
              <Check className="mr-1 size-3.5" />
              {t('payments.payAll')}
            </button>
          )}
        </div>

        {receivables.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            {customerId
              ? t('payments.noReceivablesForCustomer')
              : t('payments.selectCustomerFirst')}
          </p>
        ) : (
          <div className="mt-4 divide-y divide-line overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                  <th className="py-2.5 pr-4 font-medium">{t('deliveryNotes.number')}</th>
                  <th className="py-2.5 px-4 font-medium text-right">{t('deliveryNotes.total')}</th>
                  <th className="py-2.5 px-4 font-medium text-right">
                    {t('payments.alreadyPaid')}
                  </th>
                  <th className="py-2.5 px-4 font-medium text-right">{t('payments.balance')}</th>
                  <th className="py-2.5 pl-4 font-medium text-right">
                    {t('payments.allocateAmount')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {receivables.map((note) => {
                  const currentAlloc = allocations[note.deliveryNoteId] ?? '';
                  return (
                    <tr key={note.deliveryNoteId} className="hover:bg-surface-raised/40">
                      <td className="py-3 pr-4 font-mono font-medium text-ink">
                        {note.number}
                        <input
                          type="hidden"
                          name="allocation-deliveryNoteId"
                          value={note.deliveryNoteId}
                        />
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-muted">
                        ${note.total}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-muted">
                        ${note.paidAmount}
                      </td>
                      <td className="py-3 px-4 text-right font-medium tabular-nums text-ink">
                        ${note.balance}
                      </td>
                      <td className="py-3 pl-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="text"
                            name="allocation-amount"
                            value={currentAlloc}
                            onChange={(e) =>
                              handleSetAllocation(note.deliveryNoteId, e.target.value)
                            }
                            placeholder="0.00"
                            className={`w-28 text-right font-mono tabular-nums ${CONTROL_CLASSES}`}
                          />
                          <button
                            type="button"
                            onClick={() => handlePayFullNote(note)}
                            title={t('payments.payFullNote')}
                            className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                          >
                            Max
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
          <div className="text-sm">
            <span className="text-muted">{t('payments.totalAllocated')}: </span>
            <span className="font-semibold tabular-nums text-ink">
              ${totalAllocatedNum.toFixed(2)}
            </span>
          </div>
        </div>
      </Card>

      {state.status === 'error' && state.errorKind && (
        <Alert tone="danger" role="alert">
          {t(`errors.${state.errorKind}`, state.errorParams ?? {})}
        </Alert>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className={buttonClasses({ variant: 'secondary' })}
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={pending || receivables.length === 0}
          className={buttonClasses({ variant: 'primary' })}
        >
          {pending ? t('common.saving') : t('payments.registerSubmit')}
        </button>
      </div>
    </form>
  );
}
