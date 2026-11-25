import type { CreditNote, CreditNoteFilter, CreditNoteRepository } from '../../domain';

export class InMemoryCreditNoteRepository implements CreditNoteRepository {
  private readonly storage = new Map<string, CreditNote>();
  private sequenceCounter = 0;

  findById(tenantId: string, id: string): Promise<CreditNote | null> {
    const note = this.storage.get(id);
    if (!note || note.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(note);
  }

  findByNumber(tenantId: string, creditNoteNumber: string): Promise<CreditNote | null> {
    for (const note of this.storage.values()) {
      if (note.tenantId === tenantId && note.creditNoteNumber === creditNoteNumber) {
        return Promise.resolve(note);
      }
    }
    return Promise.resolve(null);
  }

  listByInvoice(tenantId: string, affectedInvoiceId: string): Promise<readonly CreditNote[]> {
    const list: CreditNote[] = [];
    for (const note of this.storage.values()) {
      if (note.tenantId === tenantId && note.affectedInvoiceId === affectedInvoiceId) {
        list.push(note);
      }
    }
    return Promise.resolve(list);
  }

  listByTenant(tenantId: string, filter?: CreditNoteFilter): Promise<readonly CreditNote[]> {
    const list: CreditNote[] = [];
    for (const note of this.storage.values()) {
      if (note.tenantId !== tenantId) {
        continue;
      }
      if (filter?.customerId && note.customerId !== filter.customerId) {
        continue;
      }
      if (filter?.affectedInvoiceId && note.affectedInvoiceId !== filter.affectedInvoiceId) {
        continue;
      }
      list.push(note);
    }

    list.sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime());
    return Promise.resolve(list);
  }

  nextCreditNoteNumber(_tenantId: string): Promise<string> {
    this.sequenceCounter++;
    const padded = this.sequenceCounter.toString().padStart(6, '0');
    return Promise.resolve(`NC-${padded}`);
  }

  save(creditNote: CreditNote): Promise<void> {
    this.storage.set(creditNote.id, creditNote);
    return Promise.resolve();
  }

  clear(): void {
    this.storage.clear();
    this.sequenceCounter = 0;
  }
}
