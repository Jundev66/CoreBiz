import { describe, it, expect, beforeEach } from 'vitest';
import {
  Customer,
  Money,
  Product,
  Quantity,
  asId,
  unwrap,
  type CustomerId,
  type ProductId,
  type TenantId,
} from '@corebiz/domain';
import {
  InMemoryUnitOfWork,
  createSalesStores,
  makeTestContext,
  type SalesStores,
} from '../../adapters/memory/index';
import { fixedClock } from '../../ports/clock';
import { sequentialIdGenerator } from '../../ports/id-generator';
import { makeIssueDeliveryNote } from '../sales/issue-delivery-note';
import { makeReceiveCustomerPayment } from './receive-customer-payment';
import { makeVoidCustomerPayment } from './void-customer-payment';

const TENANT = asId<TenantId>('tenant-test');
const NOW = new Date('2026-10-14T12:00:00.000Z');
const usd = (v: string) => unwrap(Money.of(v, 'USD'));
const qty = (v: string) => unwrap(Quantity.of(v));

describe('Payments & Accounts Receivable Use Cases', () => {
  let stores: SalesStores;
  let uow: InMemoryUnitOfWork;

  const clock = fixedClock(NOW);
  const ids = sequentialIdGenerator('pay-id');

  const seedCustomer = (creditLimit?: string) => {
    const customer = unwrap(
      Customer.create({
        id: asId<CustomerId>('cus-1'),
        tenantId: TENANT,
        code: 'CLI-001',
        name: 'Distribuidora Central',
        creditLimit: creditLimit ? usd(creditLimit) : null,
        createdAt: NOW,
      }),
    );
    stores.customers.set(customer.id, customer);
    return customer;
  };

  const seedProduct = (sku: string, price: string, stock: string) => {
    const product = unwrap(
      Product.create({
        id: asId<ProductId>(`prd-${sku}`),
        tenantId: TENANT,
        sku,
        name: `Producto ${sku}`,
        price: usd(price),
        initialStock: qty(stock),
        createdAt: NOW,
      }),
    );
    stores.products.set(product.id, product);
    return product;
  };

  beforeEach(() => {
    stores = createSalesStores();
    uow = new InMemoryUnitOfWork(stores, stores.usage, TENANT);
  });

  it('registra cobro parcial y total, reduciendo la deuda de la nota y del cliente', async () => {
    const ctx = makeTestContext();
    const issueNote = makeIssueDeliveryNote({
      uow,
      ctx,
      clock,
      ids: sequentialIdGenerator('dn-id'),
    });
    const receivePayment = makeReceiveCustomerPayment({ uow, ctx, clock, ids });

    const customer = seedCustomer('500'); // Límite de $500
    const product = seedProduct('A1', '50', '100'); // $50 cada uno

    // Emitir nota por 2 unidades = $100 total (taxRateBp es 1600 en test context = $116)
    const noteRes = await issueNote({
      customerId: customer.id,
      lines: [{ productId: product.id, quantity: '2' }],
    });
    expect(noteRes.ok).toBe(true);
    if (!noteRes.ok) return;

    const noteId = noteRes.value.id;
    const noteTotal = noteRes.value.total;

    // Verificar saldo inicial antes de cobrar
    const balanceBefore = await uow.run((r) =>
      r.payments.outstandingBalanceFor(customer.id, 'USD'),
    );
    expect(balanceBefore.toString()).toBe(noteTotal);

    // 1. Cobro parcial de $60
    const pay1Res = await receivePayment({
      customerId: customer.id,
      amount: '60.00',
      paymentMethod: 'bank_transfer',
      reference: 'TRANS-001',
      allocations: [{ deliveryNoteId: noteId, amount: '60.00' }],
    });

    expect(pay1Res.ok).toBe(true);
    if (!pay1Res.ok) return;
    expect(pay1Res.value.number).toBe('REC-000001');

    // Saldo pendiente del cliente disminuyó exactamente en $60
    const balanceAfterP1 = await uow.run((r) =>
      r.payments.outstandingBalanceFor(customer.id, 'USD'),
    );
    const expectedRemaining = unwrap(usd(noteTotal).subtract(usd('60.00'))).toString();
    expect(balanceAfterP1.toString()).toBe(expectedRemaining);

    // Saldo restante de la nota
    const noteBal1 = await uow.run((r) =>
      r.payments.outstandingBalanceForDeliveryNote(asId(noteId)),
    );
    expect(noteBal1.toString()).toBe(expectedRemaining);

    // 2. Intentar abonar más del saldo restante debe fallar
    const invalidPayRes = await receivePayment({
      customerId: customer.id,
      amount: '100.00',
      paymentMethod: 'cash_usd',
      allocations: [{ deliveryNoteId: noteId, amount: '100.00' }],
    });
    expect(invalidPayRes.ok).toBe(false);
    if (invalidPayRes.ok) return;
    expect(invalidPayRes.error.kind).toBe('AllocationExceedsBalance');

    // 3. Cobro final por el monto exacto restante
    const pay2Res = await receivePayment({
      customerId: customer.id,
      amount: expectedRemaining,
      paymentMethod: 'cash_usd',
      allocations: [{ deliveryNoteId: noteId, amount: expectedRemaining }],
    });
    expect(pay2Res.ok).toBe(true);

    // La deuda queda en cero
    const finalBalance = await uow.run((r) => r.payments.outstandingBalanceFor(customer.id, 'USD'));
    expect(finalBalance.isZero).toBe(true);
  });

  it('activa el límite de crédito: bloquea ventas cuando la deuda supera el límite y las desbloquea tras el cobro', async () => {
    const ctx = makeTestContext();
    const issueNote = makeIssueDeliveryNote({
      uow,
      ctx,
      clock,
      ids: sequentialIdGenerator('dn-id'),
    });
    const receivePayment = makeReceiveCustomerPayment({ uow, ctx, clock, ids });

    const customer = seedCustomer('100'); // Límite estricto de $100
    const product = seedProduct('A1', '70', '100'); // $70 cada uno

    // Primera venta de 1 unidad ($70 + imp = $81.20) cabe en el límite de $100
    const note1Res = await issueNote({
      customerId: customer.id,
      lines: [{ productId: product.id, quantity: '1' }],
    });
    expect(note1Res.ok).toBe(true);
    if (!note1Res.ok) return;

    // Segunda venta de 1 unidad ($81.20 + $81.20 = $162.40 > $100) debe ser BLOQUEADA
    const note2Blocked = await issueNote({
      customerId: customer.id,
      lines: [{ productId: product.id, quantity: '1' }],
    });
    expect(note2Blocked.ok).toBe(false);
    if (note2Blocked.ok) return;
    expect(note2Blocked.error.kind).toBe('CreditLimitExceeded');

    // El cliente viene y paga la primera nota completa
    const payRes = await receivePayment({
      customerId: customer.id,
      amount: note1Res.value.total,
      paymentMethod: 'cash_usd',
      allocations: [{ deliveryNoteId: note1Res.value.id, amount: note1Res.value.total }],
    });
    expect(payRes.ok).toBe(true);

    // Con la deuda saldada ($0), la segunda venta ahora sí PASA
    const note2Allowed = await issueNote({
      customerId: customer.id,
      lines: [{ productId: product.id, quantity: '1' }],
    });
    expect(note2Allowed.ok).toBe(true);
  });

  it('anula un cobro con motivo, restaurando la deuda pendiente', async () => {
    const ctx = makeTestContext();
    const issueNote = makeIssueDeliveryNote({
      uow,
      ctx,
      clock,
      ids: sequentialIdGenerator('dn-id'),
    });
    const receivePayment = makeReceiveCustomerPayment({ uow, ctx, clock, ids });
    const voidPayment = makeVoidCustomerPayment({ uow, ctx, clock });

    const customer = seedCustomer('500');
    const product = seedProduct('A1', '50', '100');

    const noteRes = await issueNote({
      customerId: customer.id,
      lines: [{ productId: product.id, quantity: '1' }],
    });
    if (!noteRes.ok) return;

    const payRes = await receivePayment({
      customerId: customer.id,
      amount: noteRes.value.total,
      paymentMethod: 'bank_transfer',
      reference: 'TRANS-999',
      allocations: [{ deliveryNoteId: noteRes.value.id, amount: noteRes.value.total }],
    });
    if (!payRes.ok) return;

    // Saldo estaba en cero tras el pago
    const balancePaid = await uow.run((r) => r.payments.outstandingBalanceFor(customer.id, 'USD'));
    expect(balancePaid.isZero).toBe(true);

    // Anular cobro (ej. transferencia no acreditada)
    const voidRes = await voidPayment({
      paymentId: payRes.value.id,
      reason: 'Transferencia no acreditada en banco',
    });
    expect(voidRes.ok).toBe(true);

    // El saldo vuelve a ser la deuda completa de la nota
    const balanceRestored = await uow.run((r) =>
      r.payments.outstandingBalanceFor(customer.id, 'USD'),
    );
    expect(balanceRestored.toString()).toBe(noteRes.value.total);
  });
});
