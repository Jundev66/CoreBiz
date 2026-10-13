import {
  Money,
  type CustomerId,
  type DeliveryNoteId,
  type Payment,
  type PaymentId,
  type TenantId,
} from '@corebiz/domain';
import type { PaymentRepository } from '@corebiz/application';
import { fromPayment, fromPaymentAllocations, toPayment } from './mappers';
import { isRowKey } from './record-id';
import type { Tx } from './session';

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  async findById(id: PaymentId): Promise<Payment | null> {
    if (!isRowKey(id)) return null;

    const row = await this.tx.payments.findFirst({
      where: { tenant_id: this.tenantId, id },
    });
    if (row === null) return null;

    const allocations = await this.tx.payment_allocations.findMany({
      where: { tenant_id: this.tenantId, payment_id: row.id },
    });

    return toPayment(row, allocations);
  }

  async findByNumber(number: string): Promise<Payment | null> {
    const row = await this.tx.payments.findFirst({
      where: { tenant_id: this.tenantId, number },
    });
    if (row === null) return null;

    const allocations = await this.tx.payment_allocations.findMany({
      where: { tenant_id: this.tenantId, payment_id: row.id },
    });

    return toPayment(row, allocations);
  }

  async save(payment: Payment): Promise<void> {
    const row = fromPayment(payment);

    await this.tx.payments.upsert({
      where: { id: row.id },
      create: row,
      update: {
        status: row.status,
        voided_at: row.voided_at ?? null,
        void_reason: row.void_reason ?? null,
        notes: row.notes ?? null,
      },
    });

    const allocations = fromPaymentAllocations(payment);
    if (allocations.length > 0) {
      await this.tx.payment_allocations.createMany({
        data: allocations,
        skipDuplicates: true,
      });
    }
  }

  async outstandingBalanceFor(customerId: CustomerId, currency: 'USD' | 'VES'): Promise<Money> {
    const notes = await this.tx.delivery_notes.findMany({
      where: {
        tenant_id: this.tenantId,
        customer_id: customerId,
        status: { not: 'voided' },
      },
      select: { total_minor: true },
    });

    const totalIssued = notes.reduce((acc, n) => acc + BigInt(n.total_minor), 0n);

    const payments = await this.tx.payments.findMany({
      where: {
        tenant_id: this.tenantId,
        customer_id: customerId,
        status: { not: 'voided' },
      },
      select: { amount_minor: true },
    });

    const totalPaid = payments.reduce((acc, p) => acc + BigInt(p.amount_minor), 0n);

    const balanceMinor = totalIssued > totalPaid ? totalIssued - totalPaid : 0n;
    return Money.fromMinor(balanceMinor, currency);
  }

  async outstandingBalanceForDeliveryNote(deliveryNoteId: DeliveryNoteId): Promise<Money> {
    const note = await this.tx.delivery_notes.findFirst({
      where: { tenant_id: this.tenantId, id: deliveryNoteId },
      select: { total_minor: true, currency: true, status: true },
    });

    if (!note || note.status === 'voided') {
      return Money.zero('USD');
    }

    const allocations = await this.tx.payment_allocations.findMany({
      where: {
        tenant_id: this.tenantId,
        delivery_note_id: deliveryNoteId,
        payments: { status: { not: 'voided' } },
      },
      select: { amount_minor: true },
    });

    const totalAllocated = allocations.reduce((acc, a) => acc + BigInt(a.amount_minor), 0n);
    const noteTotal = BigInt(note.total_minor);
    const remaining = noteTotal > totalAllocated ? noteTotal - totalAllocated : 0n;

    return Money.fromMinor(remaining, note.currency as 'USD' | 'VES');
  }
}
