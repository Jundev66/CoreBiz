import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueIntegrationInvoiceController } from '../../../src/modules/integrations/controllers/issue-integration-invoice.controller';
import type { IntegrationInvoiceInput } from '@corebiz/contracts';
import type { Runtime } from '../../../src/composition/runtime.provider';

describe('IssueIntegrationInvoiceController', () => {
  let controller: IssueIntegrationInvoiceController;
  let saveInvoiceSpy: ReturnType<typeof vi.fn>;
  let saveJournalEntrySpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    saveInvoiceSpy = vi.fn().mockResolvedValue(undefined);
    saveJournalEntrySpy = vi.fn().mockResolvedValue(undefined);

    const runtimeMock = {
      invoices: {
        save: saveInvoiceSpy,
        findById: vi.fn(),
      },
      journalEntries: {
        save: saveJournalEntrySpy,
        nextEntryNumber: vi.fn().mockResolvedValue(101n),
        findById: vi.fn(),
        findByTenant: vi.fn(),
      },
      accounts: {} as never,
      uow: {} as never,
      queries: {} as never,
    } as unknown as Runtime;

    controller = new IssueIntegrationInvoiceController(runtimeMock);
  });

  it('issues invoice and generates balanced journal entry successfully', async () => {
    const input: IntegrationInvoiceInput = {
      customerId: '018e245a-0000-7000-8000-000000000001',
      documentType: 'STANDARD',
      documentNumber: 'EXT-INV-001',
      controlNumber: '00-00001234',
      issueDate: new Date('2026-11-23T12:00:00Z'),
      dueDate: new Date('2026-12-23T12:00:00Z'),
      currency: 'USD',
      receivableAccountId: '018e245a-0000-7000-8000-000000000010',
      revenueAccountId: '018e245a-0000-7000-8000-000000000020',
      taxPayableAccountId: '018e245a-0000-7000-8000-000000000030',
      lines: [
        {
          description: 'SaaS Subscription Tier 1',
          quantity: '1',
          unitPrice: '100.00',
          taxPercentage: 16,
        },
      ],
    };

    const res = await controller.run(undefined, input);

    expect(res.ok).toBe(true);
    expect(res.invoiceId).toBeDefined();
    expect(res.journalEntryId).toBeDefined();
    expect(saveInvoiceSpy).toHaveBeenCalled();
    expect(saveJournalEntrySpy).toHaveBeenCalled();
  });

  it('accepts custom tenant ID header when supplied by external gateway', async () => {
    const input: IntegrationInvoiceInput = {
      customerId: '018e245a-0000-7000-8000-000000000001',
      documentType: 'STANDARD',
      documentNumber: 'EXT-INV-002',
      issueDate: new Date('2026-11-23T12:00:00Z'),
      dueDate: new Date('2026-12-23T12:00:00Z'),
      currency: 'USD',
      lines: [
        {
          description: 'Item 1',
          quantity: '2',
          unitPrice: '50.00',
          taxPercentage: 0,
        },
      ],
    };

    const customTenant = '018e245a-9999-7000-8000-000000000001';
    const res = await controller.run(customTenant, input);

    expect(res.ok).toBe(true);
    expect(saveInvoiceSpy).toHaveBeenCalled();
  });
});
