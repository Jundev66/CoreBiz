import { uuidv7 } from 'uuidv7';
import {
  CreateAccountCommandHandler,
  createDefaultAccountsForJurisdiction,
  ExecuteTreasurySwapCommandHandler,
  JournalEntry,
  JournalEntryLine,
  RecordDisbursementCommandHandler,
  RecordPartnerCashDrawingCommandHandler,
} from '@corebiz/accounting';
import { ApplyInvoicePaymentCommandHandler, IssueInvoiceCommandHandler } from '@corebiz/invoicing';
import { makeReceiveGoods, systemClock, type TenantContext } from '@corebiz/application';
import { asId, Money, Plan, type TenantId, type UserId } from '@corebiz/domain';
import { postgresRuntime } from '@corebiz/infrastructure';
import { DEMO_SEEDER } from '../tokens';
import { makePayGoodsReceipt } from './pay-goods-receipt';
import { memoryAccountingRepos } from './memory-driver';

export type DemoSeeder = (url: string, rawTenantId: string, rawUserId: string) => Promise<void>;

function daysAgo(base: Date, days: number): Date {
  return new Date(base.getTime() - days * 86_400_000);
}

function daysFrom(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000);
}

export async function seedDemoShowcase(
  url: string,
  rawTenantId: string,
  rawUserId: string,
): Promise<void> {
  const tenantId = asId<TenantId>(rawTenantId);
  const userId = asId<UserId>(rawUserId);

  const ctx: TenantContext = {
    tenantId,
    tenantSlug: 'demo-showcase',
    actor: { userId, role: 'owner' },
    plan: Plan.of('pro'),
    settings: {
      taxLabel: 'IVA',
      taxRateBp: 1600,
      baseCurrency: 'USD',
      fiscalCountry: 'VE',
      exchangeRateScaled: 50_0000_0000n,
      exchangeRateAt: new Date(),
    },
    isDemo: true,
  };

  const runtime = postgresRuntime({
    url,
    ctx,
    ids: { next: () => uuidv7() },
    clock: systemClock,
    trace: {
      actorEmail: 'demo-seeder@corebiz.demo',
      ipHash: null,
      userAgent: 'Demo Showcase Seeder',
    },
  });
  const sharedAccounting = memoryAccountingRepos();

  const seededAccounts = createDefaultAccountsForJurisdiction(rawTenantId, 'VE');
  for (const acc of seededAccounts) {
    await runtime.accounts.save(acc).catch(() => {});
  }

  const createAccHandler = new CreateAccountCommandHandler(runtime.accounts);
  const cashRoot = seededAccounts.find((a) => a.code.value === '1.1.01');
  const cryptoRoot = seededAccounts.find((a) => a.code.value === '1.1.04');

  let usdBankId = cashRoot?.id ?? '';
  let vesBankId = cashRoot?.id ?? '';
  if (cashRoot) {
    const usdBankRes = await createAccHandler.execute({
      id: uuidv7(),
      tenantId: rawTenantId,
      code: '1.1.01.01',
      name: 'Banco USD / Zelle',
      category: 'ASSET',
      isReconcilable: true,
      parentId: cashRoot.id,
    });
    if (usdBankRes.ok) {
      usdBankId = usdBankRes.value.accountId;
    }

    const vesBankRes = await createAccHandler.execute({
      id: uuidv7(),
      tenantId: rawTenantId,
      code: '1.1.01.02',
      name: 'Banco Nacional VES',
      category: 'ASSET',
      isReconcilable: true,
      parentId: cashRoot.id,
    });
    if (vesBankRes.ok) {
      vesBankId = vesBankRes.value.accountId;
    }
  }

  let usdtWalletId = cryptoRoot?.id ?? '';
  if (cryptoRoot) {
    const usdtRes = await createAccHandler.execute({
      id: uuidv7(),
      tenantId: rawTenantId,
      code: '1.1.04.01',
      name: 'Wallet USDT (Binance)',
      category: 'ASSET',
      isReconcilable: true,
      parentId: cryptoRoot.id,
    });
    if (usdtRes.ok) {
      usdtWalletId = usdtRes.value.accountId;
    }
  }

  const findAcc = (code: string) => seededAccounts.find((a) => a.code.value === code)?.id ?? '';
  const cashId = findAcc('1.1.01');
  const arId = findAcc('1.1.02');
  const inventoryId = findAcc('1.1.03');
  const taxCreditId = findAcc('1.1.05');
  const apId = findAcc('2.1.01');
  const taxPayableId = findAcc('2.1.02');
  const equityId = findAcc('3.1.01');
  const drawingsAccId = findAcc('3.1.02');
  const revenueId = findAcc('4.1.01');
  const feeAccId = findAcc('6.1.02');
  const logisticsAccId = findAcc('6.1.03');
  const utilitiesAccId = findAcc('6.1.04');

  const today = new Date();
  const openingDate = daysAgo(today, 65);

  const openingLines = [
    JournalEntryLine.create(
      cashId,
      Money.fromMinor(15000_00n, 'USD'),
      Money.zero('USD'),
      'Caja Principal apertura',
    ),
    JournalEntryLine.create(
      usdBankId,
      Money.fromMinor(12000_00n, 'USD'),
      Money.zero('USD'),
      'Banco USD / Zelle apertura',
    ),
    JournalEntryLine.create(
      usdtWalletId,
      Money.fromMinor(5000_00n, 'USD'),
      Money.zero('USD'),
      'Wallet USDT apertura',
    ),
    JournalEntryLine.create(
      equityId,
      Money.zero('USD'),
      Money.fromMinor(32000_00n, 'USD'),
      'Capital Social inicial',
    ),
  ]
    .filter((r) => r.ok)
    .map((r) => r.value);

  if (openingLines.length === 4) {
    const entryNumber = await runtime.journalEntries.nextEntryNumber(rawTenantId);
    const openingEntry = JournalEntry.create({
      id: uuidv7(),
      tenantId: rawTenantId,
      entryNumber,
      date: openingDate,
      description: 'Asiento de apertura - Capital Social USD',
      sourceType: 'MANUAL',
      sourceId: rawTenantId,
      lines: openingLines,
    });
    if (openingEntry.ok) {
      await runtime.journalEntries.save(openingEntry.value).catch(() => {});
    }
  }

  const openingVesLines = [
    JournalEntryLine.create(
      cashId,
      Money.fromMinor(500_000_00n, 'VES'),
      Money.zero('VES'),
      'Fondo operativo apertura VES',
    ),
    JournalEntryLine.create(
      vesBankId,
      Money.fromMinor(1_000_000_00n, 'VES'),
      Money.zero('VES'),
      'Banco Nacional VES apertura',
    ),
    JournalEntryLine.create(
      equityId,
      Money.zero('VES'),
      Money.fromMinor(1_500_000_00n, 'VES'),
      'Capital de trabajo inicial VES',
    ),
  ]
    .filter((r) => r.ok)
    .map((r) => r.value);

  if (openingVesLines.length === 3) {
    const entryNumber = await runtime.journalEntries.nextEntryNumber(rawTenantId);
    const openingVesEntry = JournalEntry.create({
      id: uuidv7(),
      tenantId: rawTenantId,
      entryNumber,
      date: openingDate,
      description: 'Asiento de apertura - Fondo operativo VES',
      sourceType: 'MANUAL',
      sourceId: rawTenantId,
      lines: openingVesLines,
    });
    if (openingVesEntry.ok) {
      await runtime.journalEntries.save(openingVesEntry.value).catch(() => {});
    }
  }

  const [customersPage, productsPage, suppliersPage] = await Promise.all([
    runtime.queries.customers.list({ limit: 10 }),
    runtime.queries.products.list({ limit: 10 }),
    runtime.queries.purchasing.suppliers({ limit: 5 }),
  ]);
  const customerPool = customersPage.items.filter((c) => c.code !== 'CLI-CF');
  const firstCustomer = customerPool[0] ?? customersPage.items[0];
  const secondCustomer = customerPool[1] ?? firstCustomer;
  const thirdCustomer = customerPool[2] ?? firstCustomer;
  const fourthCustomer = customerPool[3] ?? secondCustomer;
  const firstProduct = productsPage.items[0];
  const secondProduct = productsPage.items[1] ?? firstProduct;
  const thirdProduct = productsPage.items[2] ?? firstProduct;
  const fourthProduct = productsPage.items[3] ?? firstProduct;
  const firstSupplier = suppliersPage.items[0];
  const secondSupplier = suppliersPage.items[1] ?? firstSupplier;

  const createPurchaseRecorder = (entryDate: Date) =>
    makeReceiveGoods({
      uow: runtime.uow,
      ctx,
      clock: { now: () => entryDate },
      ids: { next: () => uuidv7() },
      onPurchaseRecorded: async (event) => {
        const subtotalMinor = event.receipt.total.minorUnits;
        const taxBp = Math.round(event.taxPercentage * 100);
        const taxMinor = (subtotalMinor * BigInt(taxBp)) / 10000n;
        const totalWithTaxMinor = subtotalMinor + taxMinor;
        const currency = event.receipt.currency;
        const docRef = event.supplierReference || event.receipt.number;

        const purchaseLines = [
          JournalEntryLine.create(
            inventoryId,
            Money.fromMinor(subtotalMinor, currency),
            Money.zero(currency),
            `Compra inventario - ${docRef}`,
          ),
          ...(taxMinor > 0n
            ? [
                JournalEntryLine.create(
                  taxCreditId || taxPayableId,
                  Money.fromMinor(taxMinor, currency),
                  Money.zero(currency),
                  `IVA Crédito Fiscal - ${docRef}`,
                ),
              ]
            : []),
          JournalEntryLine.create(
            apId,
            Money.zero(currency),
            Money.fromMinor(totalWithTaxMinor, currency),
            `Cuentas por Pagar - ${docRef}`,
          ),
        ]
          .filter((r) => r.ok)
          .map((r) => r.value);

        if (purchaseLines.length >= 2) {
          const entryNumber = await runtime.journalEntries.nextEntryNumber(rawTenantId);
          const jeResult = JournalEntry.create({
            id: uuidv7(),
            tenantId: rawTenantId,
            entryNumber,
            date: event.receipt.receivedAt ?? entryDate,
            description: `Factura de compra ${docRef} (${event.supplier.name})`,
            sourceType: 'PURCHASE',
            sourceId: event.receipt.id,
            lines: purchaseLines,
          });
          if (jeResult.ok) {
            await runtime.journalEntries.save(jeResult.value).catch(() => {});
          }
        }
      },
    });

  const payGoodsReceipt = makePayGoodsReceipt({
    ctx,
    purchasingQueries: runtime.queries.purchasing,
    accounts: runtime.accounts,
    journalEntries: runtime.journalEntries,
  });

  if (firstSupplier && firstProduct) {
    const receiveRecent = createPurchaseRecorder(daysAgo(today, 10));
    const pur1Res = await receiveRecent({
      supplierId: firstSupplier.id,
      lines: [
        {
          productId: firstProduct.id,
          quantity: '25',
          unitCost: '18.00',
        },
        ...(secondProduct && secondProduct.id !== firstProduct.id
          ? [
              {
                productId: secondProduct.id,
                quantity: '15',
                unitCost: '14.00',
              },
            ]
          : []),
      ],
      supplierReference: 'FC-PROV-0001',
      controlNumber: '00-000412',
      paymentCondition: 'CREDIT',
      creditDays: 30,
      taxPercentage: 16,
      currency: 'USD',
      notes: 'Reposición inicial de inventario demo',
    }).catch(() => null);

    if (pur1Res?.ok) {
      const total1 = secondProduct && secondProduct.id !== firstProduct.id ? 765_60n : 522_00n;
      await runtime.documentPayments
        .createInstallmentSchedule({
          documentType: 'PURCHASE',
          documentId: pur1Res.value.id,
          frequency: 'MONTHLY',
          count: 2,
          startDate: daysAgo(today, 10),
          creditDays: 30,
          currency: 'USD',
          totalMinor: total1,
        })
        .catch(() => {});
    }
  }

  if (secondSupplier && thirdProduct) {
    const receiveOverdue = createPurchaseRecorder(daysAgo(today, 38));
    const overdueRes = await receiveOverdue({
      supplierId: secondSupplier.id,
      lines: [
        {
          productId: thirdProduct.id,
          quantity: '20',
          unitCost: '12.50',
        },
      ],
      supplierReference: 'FC-PROV-0002',
      controlNumber: '00-000389',
      paymentCondition: 'CREDIT',
      creditDays: 15,
      taxPercentage: 16,
      currency: 'USD',
      notes: 'Compra a crédito con abono parcial y saldo vencido',
    }).catch(() => null);

    if (overdueRes?.ok) {
      await runtime.documentPayments
        .createInstallmentSchedule({
          documentType: 'PURCHASE',
          documentId: overdueRes.value.id,
          frequency: 'BIWEEKLY',
          count: 3,
          startDate: daysAgo(today, 38),
          creditDays: 15,
          currency: 'USD',
          totalMinor: 290_00n,
        })
        .catch(() => {});

      const pay2Res = await payGoodsReceipt({
        receiptId: overdueRes.value.id,
        amountMinor: 120_00n,
        currency: 'USD',
        paymentDate: daysAgo(today, 18),
        sourceAccountId: usdBankId,
        payableAccountId: apId,
        reference: 'ZELLE-PROV-002',
      }).catch(() => null);

      if (pay2Res?.ok) {
        await runtime.documentPayments
          .recordPayment({
            direction: 'OUTBOUND',
            documentType: 'PURCHASE',
            documentId: overdueRes.value.id,
            paymentMethod: 'ZELLE',
            paymentCurrency: 'USD',
            paymentAmountMinor: 120_00n,
            documentCurrency: 'USD',
            appliedAmountMinor: 120_00n,
            exchangeRateScaled: 100_000_000n,
            accountId: usdBankId,
            journalEntryId: pay2Res.value.journalEntryId,
            paymentDate: daysAgo(today, 18),
            reference: 'ZELLE-PROV-002',
          })
          .catch(() => {});
      }
    }
  }

  if (firstSupplier && fourthProduct) {
    const receivePaid = createPurchaseRecorder(daysAgo(today, 4));
    const paidRes = await receivePaid({
      supplierId: firstSupplier.id,
      lines: [
        {
          productId: fourthProduct.id,
          quantity: '10',
          unitCost: '22.00',
        },
      ],
      supplierReference: 'FC-PROV-0003',
      controlNumber: '00-000445',
      paymentCondition: 'CASH',
      creditDays: 0,
      taxPercentage: 16,
      currency: 'USD',
      notes: 'Compra de contado liquidada en Banco USD',
    }).catch(() => null);

    if (paidRes?.ok) {
      const pay3Res = await payGoodsReceipt({
        receiptId: paidRes.value.id,
        amountMinor: 255_20n,
        currency: 'USD',
        paymentDate: daysAgo(today, 4),
        sourceAccountId: usdBankId,
        payableAccountId: apId,
        reference: 'TRANSF-PROV-003',
      }).catch(() => null);

      if (pay3Res?.ok) {
        await runtime.documentPayments
          .recordPayment({
            direction: 'OUTBOUND',
            documentType: 'PURCHASE',
            documentId: paidRes.value.id,
            paymentMethod: 'BANK_TRANSFER',
            paymentCurrency: 'USD',
            paymentAmountMinor: 255_20n,
            documentCurrency: 'USD',
            appliedAmountMinor: 255_20n,
            exchangeRateScaled: 100_000_000n,
            accountId: usdBankId,
            journalEntryId: pay3Res.value.journalEntryId,
            paymentDate: daysAgo(today, 4),
            reference: 'TRANSF-PROV-003',
          })
          .catch(() => {});
      }
    }
  }

  if (firstCustomer) {
    const issueInvoice = new IssueInvoiceCommandHandler(runtime.invoices, runtime.journalEntries);
    const applyPayment = new ApplyInvoicePaymentCommandHandler(
      runtime.invoices,
      runtime.journalEntries,
    );

    const inv1Id = uuidv7();
    const inv1Date = daysAgo(today, 10);
    await issueInvoice.execute({
      id: inv1Id,
      tenantId: rawTenantId,
      customerId: firstCustomer.id,
      documentType: 'STANDARD',
      documentNumber: 'FAC-000001',
      issueDate: inv1Date,
      dueDate: daysFrom(inv1Date, 30),
      currency: 'USD',
      receivableAccountId: arId,
      revenueAccountId: revenueId,
      taxPayableAccountId: taxPayableId,
      cashAccountId: cashId,
      paymentCondition: 'CREDIT',
      lines: [
        {
          id: uuidv7(),
          description: firstProduct?.name ?? 'Mercancía Comercial Demo',
          quantity: '10',
          unitPriceMinor: 42_00n,
          taxPercentage: 16,
          productId: firstProduct?.id,
          revenueAccountId: revenueId,
        },
      ],
    });

    await runtime.documentPayments
      .createInstallmentSchedule({
        documentType: 'INVOICE',
        documentId: inv1Id,
        frequency: 'BIWEEKLY',
        count: 3,
        startDate: inv1Date,
        creditDays: 30,
        currency: 'USD',
        totalMinor: 487_20n,
      })
      .catch(() => {});

    const payInv1Res = await applyPayment.execute({
      invoiceId: inv1Id,
      tenantId: rawTenantId,
      amountMinor: 200_00n,
      currency: 'USD',
      cashAccountId: usdBankId,
      receivableAccountId: arId,
      paymentDate: daysAgo(today, 6),
      reference: 'ZELLE-DEMO-01',
      issueExchangeRate: 50,
      paymentExchangeRate: 50,
    });

    if (payInv1Res.ok) {
      await runtime.documentPayments
        .recordPayment({
          direction: 'INBOUND',
          documentType: 'INVOICE',
          documentId: inv1Id,
          paymentMethod: 'ZELLE',
          paymentCurrency: 'USD',
          paymentAmountMinor: 200_00n,
          documentCurrency: 'USD',
          appliedAmountMinor: 200_00n,
          exchangeRateScaled: 100_000_000n,
          accountId: usdBankId,
          journalEntryId: payInv1Res.value.journalEntryId,
          paymentDate: daysAgo(today, 6),
          reference: 'ZELLE-DEMO-01',
        })
        .catch(() => {});
    }

    if (secondCustomer) {
      const inv2Date = daysAgo(today, 5);
      const inv2Id = uuidv7();
      const inv2Res = await issueInvoice.execute({
        id: inv2Id,
        tenantId: rawTenantId,
        customerId: secondCustomer.id,
        documentType: 'STANDARD',
        documentNumber: 'FAC-000002',
        issueDate: inv2Date,
        dueDate: inv2Date,
        currency: 'USD',
        receivableAccountId: arId,
        revenueAccountId: revenueId,
        taxPayableAccountId: taxPayableId,
        cashAccountId: cashId,
        paymentCondition: 'CASH',
        lines: [
          {
            id: uuidv7(),
            description: firstProduct?.name ?? 'Venta Contado Demo',
            quantity: '5',
            unitPriceMinor: 30_00n,
            taxPercentage: 16,
            productId: firstProduct?.id,
            revenueAccountId: revenueId,
          },
        ],
      });
      if (inv2Res.ok) {
        await runtime.documentPayments
          .recordPayment({
            direction: 'INBOUND',
            documentType: 'INVOICE',
            documentId: inv2Id,
            paymentMethod: 'CASH_USD',
            paymentCurrency: 'USD',
            paymentAmountMinor: 174_00n,
            documentCurrency: 'USD',
            appliedAmountMinor: 174_00n,
            exchangeRateScaled: 100_000_000n,
            accountId: cashId,
            journalEntryId: inv2Res.value.journalEntryId,
            paymentDate: inv2Date,
            reference: 'FAC-000002',
          })
          .catch(() => {});
      }
    }

    if (thirdCustomer) {
      const inv3Date = daysAgo(today, 32);
      const inv3Id = uuidv7();
      const inv3Res = await issueInvoice.execute({
        id: inv3Id,
        tenantId: rawTenantId,
        customerId: thirdCustomer.id,
        documentType: 'STANDARD',
        documentNumber: 'FAC-000003',
        issueDate: inv3Date,
        dueDate: daysFrom(inv3Date, 15),
        currency: 'USD',
        receivableAccountId: arId,
        revenueAccountId: revenueId,
        taxPayableAccountId: taxPayableId,
        cashAccountId: cashId,
        paymentCondition: 'CREDIT',
        lines: [
          {
            id: uuidv7(),
            description: secondProduct?.name ?? 'Lote Mercancía Mayorista',
            quantity: '8',
            unitPriceMinor: 25_00n,
            taxPercentage: 16,
            productId: secondProduct?.id,
            revenueAccountId: revenueId,
          },
          {
            id: uuidv7(),
            description: thirdProduct?.name ?? 'Suministro Complementario',
            quantity: '4',
            unitPriceMinor: 25_00n,
            taxPercentage: 16,
            productId: thirdProduct?.id,
            revenueAccountId: revenueId,
          },
        ],
      });
      if (inv3Res.ok) {
        await runtime.documentPayments
          .createInstallmentSchedule({
            documentType: 'INVOICE',
            documentId: inv3Id,
            frequency: 'MONTHLY',
            count: 2,
            startDate: inv3Date,
            creditDays: 15,
            currency: 'USD',
            totalMinor: 348_00n,
          })
          .catch(() => {});
      }
    }

    if (fourthCustomer) {
      const inv4Id = uuidv7();
      const inv4Date = daysAgo(today, 60);
      await issueInvoice.execute({
        id: inv4Id,
        tenantId: rawTenantId,
        customerId: fourthCustomer.id,
        documentType: 'STANDARD',
        documentNumber: 'FAC-000004',
        issueDate: inv4Date,
        dueDate: daysFrom(inv4Date, 15),
        currency: 'USD',
        receivableAccountId: arId,
        revenueAccountId: revenueId,
        taxPayableAccountId: taxPayableId,
        cashAccountId: cashId,
        paymentCondition: 'CREDIT',
        lines: [
          {
            id: uuidv7(),
            description: fourthProduct?.name ?? 'Despacho Corporativo Demo',
            quantity: '15',
            unitPriceMinor: 40_00n,
            taxPercentage: 16,
            productId: fourthProduct?.id,
            revenueAccountId: revenueId,
          },
        ],
      });

      await runtime.documentPayments
        .createInstallmentSchedule({
          documentType: 'INVOICE',
          documentId: inv4Id,
          frequency: 'MONTHLY',
          count: 3,
          startDate: inv4Date,
          creditDays: 15,
          currency: 'USD',
          totalMinor: 696_00n,
        })
        .catch(() => {});

      const payInv4Res = await applyPayment.execute({
        invoiceId: inv4Id,
        tenantId: rawTenantId,
        amountMinor: 196_00n,
        currency: 'USD',
        cashAccountId: usdBankId,
        receivableAccountId: arId,
        paymentDate: daysAgo(today, 35),
        reference: 'TRANSF-DEMO-02',
        issueExchangeRate: 50,
        paymentExchangeRate: 50,
      });

      if (payInv4Res.ok) {
        await runtime.documentPayments
          .recordPayment({
            direction: 'INBOUND',
            documentType: 'INVOICE',
            documentId: inv4Id,
            paymentMethod: 'BANK_TRANSFER',
            paymentCurrency: 'USD',
            paymentAmountMinor: 196_00n,
            documentCurrency: 'USD',
            appliedAmountMinor: 196_00n,
            exchangeRateScaled: 100_000_000n,
            accountId: usdBankId,
            journalEntryId: payInv4Res.value.journalEntryId,
            paymentDate: daysAgo(today, 35),
            reference: 'TRANSF-DEMO-02',
          })
          .catch(() => {});
      }
    }

    const inv5Date = daysAgo(today, 3);
    const inv5Id = uuidv7();
    const inv5Res = await issueInvoice.execute({
      id: inv5Id,
      tenantId: rawTenantId,
      customerId: firstCustomer.id,
      documentType: 'STANDARD',
      documentNumber: 'FAC-000005',
      issueDate: inv5Date,
      dueDate: daysFrom(inv5Date, 30),
      currency: 'VES',
      receivableAccountId: arId,
      revenueAccountId: revenueId,
      taxPayableAccountId: taxPayableId,
      cashAccountId: vesBankId,
      paymentCondition: 'CREDIT',
      lines: [
        {
          id: uuidv7(),
          description: firstProduct?.name ?? 'Venta Nacional en Bolívares',
          quantity: '10',
          unitPriceMinor: 1_200_00n,
          taxPercentage: 16,
          productId: firstProduct?.id,
          revenueAccountId: revenueId,
        },
      ],
    });
    if (inv5Res.ok) {
      await runtime.documentPayments
        .createInstallmentSchedule({
          documentType: 'INVOICE',
          documentId: inv5Id,
          frequency: 'BIWEEKLY',
          count: 2,
          startDate: inv5Date,
          creditDays: 30,
          currency: 'VES',
          totalMinor: 13_920_00n,
        })
        .catch(() => {});
    }
  }

  const swapHandler = new ExecuteTreasurySwapCommandHandler(
    runtime.accounts,
    runtime.journalEntries,
    sharedAccounting.treasurySwaps,
  );
  await swapHandler.execute({
    id: uuidv7(),
    tenantId: rawTenantId,
    date: daysAgo(today, 2),
    sourceAccountId: usdBankId,
    sourceCurrency: 'USD',
    sourceAmountMinor: 500_00n,
    targetAccountId: usdtWalletId,
    targetCurrency: 'USD',
    targetAmountMinor: 498_00n,
    feeAccountId: feeAccId,
    feeAmountMinor: 2_00n,
    exchangeRateScaled: 1_0000_0000n,
    counterpartyReference: 'BINANCE-P2P-DEMO-01',
    operatorUserId: rawUserId,
    description: 'Adquisición de liquidez digital USDT para pagos internacionales',
  });

  await swapHandler.execute({
    id: uuidv7(),
    tenantId: rawTenantId,
    date: daysAgo(today, 1),
    sourceAccountId: vesBankId,
    sourceCurrency: 'VES',
    sourceAmountMinor: 25_000_00n,
    targetAccountId: usdBankId,
    targetCurrency: 'USD',
    targetAmountMinor: 500_00n,
    feeAccountId: feeAccId,
    feeAmountMinor: 0n,
    exchangeRateScaled: 50_0000_0000n,
    counterpartyReference: 'MESA-CAMBIO-DEMO-01',
    operatorUserId: rawUserId,
    description: 'Conversión de excedente en bolívares a USD a tasa BCV',
  });

  const disbursementHandler = new RecordDisbursementCommandHandler(
    runtime.accounts,
    runtime.journalEntries,
    sharedAccounting.disbursements,
  );
  await disbursementHandler.execute({
    id: uuidv7(),
    tenantId: rawTenantId,
    date: daysAgo(today, 2),
    category: 'LOGISTICS',
    beneficiary: 'Logística Nacional Demo C.A.',
    taxId: 'J-40112233-9',
    receiptNumber: 'FLETE-DEMO-01',
    sourceAccountId: cashId,
    expenseAccountId: logisticsAccId,
    currency: 'USD',
    amountMinor: 45_00n,
    notes: 'Flete de reposición de inventario',
  });

  await disbursementHandler.execute({
    id: uuidv7(),
    tenantId: rawTenantId,
    date: daysAgo(today, 1),
    category: 'UTILITIES_RENT',
    beneficiary: 'Servicios Corporativos Demo C.A.',
    taxId: 'J-40223344-1',
    receiptNumber: 'SERV-DEMO-02',
    sourceAccountId: vesBankId,
    expenseAccountId: utilitiesAccId,
    currency: 'VES',
    amountMinor: 4_500_00n,
    notes: 'Pago de servicios básicos y conectividad mensual',
  });

  const drawingHandler = new RecordPartnerCashDrawingCommandHandler(
    runtime.accounts,
    runtime.journalEntries,
    sharedAccounting.partnerDrawings,
  );
  await drawingHandler.execute({
    id: uuidv7(),
    tenantId: rawTenantId,
    date: today,
    partnerId: 'partner-demo-01',
    partnerName: 'Socio Fundador Demo',
    currency: 'USD',
    amountMinor: 100_00n,
    drawingAccountId: drawingsAccId,
    cashAccountId: cashId,
    operatorUserId: rawUserId,
    notes: 'Anticipo de dividendos del período',
  });
}

export const demoSeederProvider = {
  provide: DEMO_SEEDER,
  useValue: seedDemoShowcase,
};
