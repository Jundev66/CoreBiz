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
import { systemClock, type TenantContext } from '@corebiz/application';
import { asId, Money, Plan, type TenantId, type UserId } from '@corebiz/domain';
import { postgresRuntime } from '@corebiz/infrastructure';
import { DEMO_SEEDER } from '../tokens';
import { memoryAccountingRepos } from './memory-driver';

export type DemoSeeder = (url: string, rawTenantId: string, rawUserId: string) => Promise<void>;

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
  const taxPayableId = findAcc('2.1.02');
  const equityId = findAcc('3.1.01');
  const drawingsAccId = findAcc('3.1.02');
  const revenueId = findAcc('4.1.01');
  const feeAccId = findAcc('6.1.02');
  const logisticsAccId = findAcc('6.1.03');

  const openingLines = [
    JournalEntryLine.create(
      cashId,
      Money.fromMinor(5000_00n, 'USD'),
      Money.zero('USD'),
      'Caja Principal apertura',
    ),
    JournalEntryLine.create(
      usdBankId,
      Money.fromMinor(2500_00n, 'USD'),
      Money.zero('USD'),
      'Banco USD / Zelle apertura',
    ),
    JournalEntryLine.create(
      equityId,
      Money.zero('USD'),
      Money.fromMinor(7500_00n, 'USD'),
      'Capital Social inicial',
    ),
  ]
    .filter((r) => r.ok)
    .map((r) => r.value);

  if (openingLines.length === 3) {
    const entryNumber = await runtime.journalEntries.nextEntryNumber(rawTenantId);
    const openingEntry = JournalEntry.create({
      id: uuidv7(),
      tenantId: rawTenantId,
      entryNumber,
      date: new Date(),
      description: 'Asiento de apertura - Capital Social',
      sourceType: 'MANUAL',
      sourceId: rawTenantId,
      lines: openingLines,
    });
    if (openingEntry.ok) {
      await runtime.journalEntries.save(openingEntry.value).catch(() => {});
    }
  }

  const customersPage = await runtime.queries.customers.list({ limit: 10 });
  const productsPage = await runtime.queries.products.list({ limit: 10 });
  const firstCustomer =
    customersPage.items.find((c) => c.code !== 'CLI-CF') ?? customersPage.items[0];
  const secondCustomer = customersPage.items[1] ?? firstCustomer;
  const firstProduct = productsPage.items[0];

  const today = new Date();
  if (firstCustomer) {
    const issueInvoice = new IssueInvoiceCommandHandler(runtime.invoices, runtime.journalEntries);
    const inv1Id = uuidv7();
    const in30Days = new Date(today.getTime() + 30 * 86_400_000);

    await issueInvoice.execute({
      id: inv1Id,
      tenantId: rawTenantId,
      customerId: firstCustomer.id,
      documentType: 'STANDARD',
      documentNumber: 'FAC-000001',
      issueDate: today,
      dueDate: in30Days,
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

    const applyPayment = new ApplyInvoicePaymentCommandHandler(
      runtime.invoices,
      runtime.journalEntries,
    );
    await applyPayment.execute({
      invoiceId: inv1Id,
      tenantId: rawTenantId,
      amountMinor: 200_00n,
      currency: 'USD',
      cashAccountId: usdBankId,
      receivableAccountId: arId,
      paymentDate: today,
      reference: 'ZELLE-DEMO-01',
      issueExchangeRate: 50,
      paymentExchangeRate: 50,
    });

    if (secondCustomer) {
      await issueInvoice.execute({
        id: uuidv7(),
        tenantId: rawTenantId,
        customerId: secondCustomer.id,
        documentType: 'STANDARD',
        documentNumber: 'FAC-000002',
        issueDate: today,
        dueDate: today,
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
    date: today,
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

  const disbursementHandler = new RecordDisbursementCommandHandler(
    runtime.accounts,
    runtime.journalEntries,
    sharedAccounting.disbursements,
  );
  await disbursementHandler.execute({
    id: uuidv7(),
    tenantId: rawTenantId,
    date: today,
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
