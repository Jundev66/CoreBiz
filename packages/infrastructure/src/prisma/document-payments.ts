import type { PrismaClient } from '@corebiz/prisma-client';
import type { TenantContext } from '@corebiz/application';
import { readOnly, withTenant } from './session';

export type InstallmentFrequency = 'SINGLE' | 'BIWEEKLY' | 'MONTHLY';
export type DocumentKind = 'INVOICE' | 'PURCHASE';
export type PaymentDirection = 'INBOUND' | 'OUTBOUND';
export type DocumentPaymentMethod =
  | 'CASH_USD'
  | 'CASH_VES'
  | 'ZELLE'
  | 'MOBILE_PAY'
  | 'BANK_TRANSFER'
  | 'USDT'
  | 'POS_CARD'
  | 'OTHER';

export interface DocumentInstallmentRow {
  readonly id: string;
  readonly documentType: DocumentKind;
  readonly documentId: string;
  readonly installmentNumber: number;
  readonly frequency: InstallmentFrequency;
  readonly dueDate: Date;
  readonly currency: string;
  readonly amountMinor: bigint;
  readonly paidMinor: bigint;
  readonly status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID';
}

export interface DocumentPaymentRow {
  readonly id: string;
  readonly direction: PaymentDirection;
  readonly documentType: DocumentKind;
  readonly documentId: string;
  readonly installmentId: string | null;
  readonly paymentNumber: string;
  readonly paymentMethod: DocumentPaymentMethod;
  readonly paymentCurrency: string;
  readonly paymentAmountMinor: bigint;
  readonly documentCurrency: string;
  readonly appliedAmountMinor: bigint;
  readonly exchangeRateScaled: bigint;
  readonly accountId: string;
  readonly accountCode: string | null;
  readonly accountName: string | null;
  readonly journalEntryId: string | null;
  readonly paymentDate: Date;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly status: string;
}

export interface CreateInstallmentScheduleInput {
  readonly documentType: DocumentKind;
  readonly documentId: string;
  readonly frequency: InstallmentFrequency;
  readonly count: number;
  readonly startDate: Date;
  readonly creditDays: number;
  readonly currency: string;
  readonly totalMinor: bigint;
}

export interface RecordDocumentPaymentInput {
  readonly direction: PaymentDirection;
  readonly documentType: DocumentKind;
  readonly documentId: string;
  readonly installmentId?: string | undefined;
  readonly paymentMethod: DocumentPaymentMethod;
  readonly paymentCurrency: string;
  readonly paymentAmountMinor: bigint;
  readonly documentCurrency: string;
  readonly appliedAmountMinor: bigint;
  readonly exchangeRateScaled: bigint;
  readonly accountId: string;
  readonly journalEntryId?: string | undefined;
  readonly paymentDate: Date;
  readonly reference?: string | undefined;
  readonly notes?: string | undefined;
}

export interface DocumentPaymentStore {
  createInstallmentSchedule(
    input: CreateInstallmentScheduleInput,
  ): Promise<readonly DocumentInstallmentRow[]>;
  listInstallments(
    documentType: DocumentKind,
    documentId: string,
  ): Promise<readonly DocumentInstallmentRow[]>;
  recordPayment(input: RecordDocumentPaymentInput): Promise<DocumentPaymentRow>;
  listPaymentsByDocument(
    documentType: DocumentKind,
    documentId: string,
  ): Promise<readonly DocumentPaymentRow[]>;
  listPaymentsByDirection(
    direction?: PaymentDirection,
    limit?: number,
  ): Promise<readonly DocumentPaymentRow[]>;
}

const RATE_SCALE = 100_000_000n;

export function convertMinorUnits(
  amountMinor: bigint,
  fromCurrency: string,
  toCurrency: string,
  exchangeRateScaled: bigint,
): bigint {
  if (fromCurrency === toCurrency || exchangeRateScaled <= 0n) {
    return amountMinor;
  }
  if (fromCurrency === 'VES' && toCurrency === 'USD') {
    return (amountMinor * RATE_SCALE) / exchangeRateScaled;
  }
  if (fromCurrency === 'USD' && toCurrency === 'VES') {
    return (amountMinor * exchangeRateScaled) / RATE_SCALE;
  }
  return amountMinor;
}

export function scaleExchangeRate(rateDecimal: number | string | undefined): bigint {
  if (rateDecimal === undefined || rateDecimal === '') return RATE_SCALE;
  const parsed =
    typeof rateDecimal === 'number'
      ? rateDecimal
      : Number.parseFloat(rateDecimal.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return RATE_SCALE;
  return BigInt(Math.round(parsed * 100_000_000));
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function makePrismaDocumentPaymentStore(
  prisma: PrismaClient,
  ctx: TenantContext,
): DocumentPaymentStore {
  return {
    async createInstallmentSchedule(input) {
      if (input.totalMinor <= 0n) return [];
      const count = input.frequency === 'SINGLE' ? 1 : Math.max(1, Math.min(48, input.count));
      const baseAmount = input.totalMinor / BigInt(count);
      const remainder = input.totalMinor % BigInt(count);

      const rows = Array.from({ length: count }, (_, idx) => {
        const installmentNumber = idx + 1;
        const amountMinor = idx === count - 1 ? baseAmount + remainder : baseAmount;
        let dueDate: Date;
        if (input.frequency === 'BIWEEKLY') {
          dueDate = addDays(input.startDate, installmentNumber * 15);
        } else if (input.frequency === 'MONTHLY') {
          dueDate = addMonths(input.startDate, installmentNumber);
        } else {
          dueDate = addDays(input.startDate, Math.max(1, input.creditDays));
        }

        return {
          id: crypto.randomUUID(),
          tenant_id: ctx.tenantId,
          document_type: input.documentType,
          document_id: input.documentId,
          installment_number: installmentNumber,
          frequency: input.frequency,
          due_date: dueDate,
          currency: input.currency,
          amount_minor: amountMinor,
          paid_minor: 0n,
          status: 'PENDING' as const,
        };
      });

      await withTenant(prisma, ctx, async (tx) => {
        await tx.document_installments.createMany({ data: rows });
      });

      return rows.map((r) => ({
        id: r.id,
        documentType: r.document_type,
        documentId: r.document_id,
        installmentNumber: r.installment_number,
        frequency: r.frequency,
        dueDate: r.due_date,
        currency: r.currency,
        amountMinor: r.amount_minor,
        paidMinor: r.paid_minor,
        status: r.status,
      }));
    },

    async listInstallments(documentType, documentId) {
      return readOnly(prisma, ctx, async (tx) => {
        const rows = await tx.document_installments.findMany({
          where: {
            tenant_id: ctx.tenantId,
            document_type: documentType,
            document_id: documentId,
          },
          orderBy: { installment_number: 'asc' },
        });
        return rows.map((r) => ({
          id: r.id,
          documentType: r.document_type as DocumentKind,
          documentId: r.document_id,
          installmentNumber: r.installment_number,
          frequency: r.frequency as InstallmentFrequency,
          dueDate: r.due_date,
          currency: r.currency,
          amountMinor: r.amount_minor,
          paidMinor: r.paid_minor,
          status: r.status as 'PENDING' | 'PARTIALLY_PAID' | 'PAID',
        }));
      });
    },

    async recordPayment(input) {
      return withTenant(prisma, ctx, async (tx) => {
        const prefix = input.direction === 'INBOUND' ? 'COB' : 'PAG';
        const existingCount = await tx.document_payments.count({
          where: { tenant_id: ctx.tenantId, direction: input.direction },
        });
        const paymentNumber = `${prefix}-${String(existingCount + 1).padStart(6, '0')}`;

        let remainingToAllocate = input.appliedAmountMinor;
        let linkedInstallmentId = input.installmentId ?? null;

        if (remainingToAllocate > 0n) {
          const openInstallments = await tx.document_installments.findMany({
            where: {
              tenant_id: ctx.tenantId,
              document_type: input.documentType,
              document_id: input.documentId,
              status: { in: ['PENDING', 'PARTIALLY_PAID'] },
              ...(input.installmentId ? { id: input.installmentId } : {}),
            },
            orderBy: { installment_number: 'asc' },
          });

          for (const inst of openInstallments) {
            if (remainingToAllocate <= 0n) break;
            if (!linkedInstallmentId) {
              linkedInstallmentId = inst.id;
            }
            const instRemaining = inst.amount_minor - inst.paid_minor;
            if (instRemaining <= 0n) continue;
            const applyHere =
              remainingToAllocate >= instRemaining ? instRemaining : remainingToAllocate;
            const newPaid = inst.paid_minor + applyHere;
            const newStatus = newPaid >= inst.amount_minor ? 'PAID' : 'PARTIALLY_PAID';

            await tx.document_installments.update({
              where: { id: inst.id },
              data: {
                paid_minor: newPaid,
                status: newStatus,
                updated_at: new Date(),
              },
            });
            remainingToAllocate -= applyHere;
          }
        }

        const created = await tx.document_payments.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: ctx.tenantId,
            direction: input.direction,
            document_type: input.documentType,
            document_id: input.documentId,
            installment_id: linkedInstallmentId,
            payment_number: paymentNumber,
            payment_method: input.paymentMethod,
            payment_currency: input.paymentCurrency,
            payment_amount_minor: input.paymentAmountMinor,
            document_currency: input.documentCurrency,
            applied_amount_minor: input.appliedAmountMinor,
            exchange_rate_scaled: input.exchangeRateScaled,
            account_id: input.accountId,
            journal_entry_id: input.journalEntryId ?? null,
            payment_date: input.paymentDate,
            reference: input.reference ?? null,
            notes: input.notes ?? null,
            status: 'POSTED',
          },
          include: {
            account: { select: { code: true, name: true } },
          },
        });

        return {
          id: created.id,
          direction: created.direction as PaymentDirection,
          documentType: created.document_type as DocumentKind,
          documentId: created.document_id,
          installmentId: created.installment_id,
          paymentNumber: created.payment_number,
          paymentMethod: created.payment_method as DocumentPaymentMethod,
          paymentCurrency: created.payment_currency,
          paymentAmountMinor: created.payment_amount_minor,
          documentCurrency: created.document_currency,
          appliedAmountMinor: created.applied_amount_minor,
          exchangeRateScaled: created.exchange_rate_scaled,
          accountId: created.account_id,
          accountCode: created.account?.code ?? null,
          accountName: created.account?.name ?? null,
          journalEntryId: created.journal_entry_id,
          paymentDate: created.payment_date,
          reference: created.reference,
          notes: created.notes,
          status: created.status,
        };
      });
    },

    async listPaymentsByDocument(documentType, documentId) {
      return readOnly(prisma, ctx, async (tx) => {
        const rows = await tx.document_payments.findMany({
          where: {
            tenant_id: ctx.tenantId,
            document_type: documentType,
            document_id: documentId,
          },
          include: {
            account: { select: { code: true, name: true } },
          },
          orderBy: { payment_date: 'desc' },
        });
        return rows.map((r) => ({
          id: r.id,
          direction: r.direction as PaymentDirection,
          documentType: r.document_type as DocumentKind,
          documentId: r.document_id,
          installmentId: r.installment_id,
          paymentNumber: r.payment_number,
          paymentMethod: r.payment_method as DocumentPaymentMethod,
          paymentCurrency: r.payment_currency,
          paymentAmountMinor: r.payment_amount_minor,
          documentCurrency: r.document_currency,
          appliedAmountMinor: r.applied_amount_minor,
          exchangeRateScaled: r.exchange_rate_scaled,
          accountId: r.account_id,
          accountCode: r.account?.code ?? null,
          accountName: r.account?.name ?? null,
          journalEntryId: r.journal_entry_id,
          paymentDate: r.payment_date,
          reference: r.reference,
          notes: r.notes,
          status: r.status,
        }));
      });
    },

    async listPaymentsByDirection(direction, limit = 100) {
      return readOnly(prisma, ctx, async (tx) => {
        const rows = await tx.document_payments.findMany({
          where: {
            tenant_id: ctx.tenantId,
            ...(direction ? { direction } : {}),
          },
          include: {
            account: { select: { code: true, name: true } },
          },
          orderBy: { payment_date: 'desc' },
          take: limit,
        });
        return rows.map((r) => ({
          id: r.id,
          direction: r.direction as PaymentDirection,
          documentType: r.document_type as DocumentKind,
          documentId: r.document_id,
          installmentId: r.installment_id,
          paymentNumber: r.payment_number,
          paymentMethod: r.payment_method as DocumentPaymentMethod,
          paymentCurrency: r.payment_currency,
          paymentAmountMinor: r.payment_amount_minor,
          documentCurrency: r.document_currency,
          appliedAmountMinor: r.applied_amount_minor,
          exchangeRateScaled: r.exchange_rate_scaled,
          accountId: r.account_id,
          accountCode: r.account?.code ?? null,
          accountName: r.account?.name ?? null,
          journalEntryId: r.journal_entry_id,
          paymentDate: r.payment_date,
          reference: r.reference,
          notes: r.notes,
          status: r.status,
        }));
      });
    },
  };
}
