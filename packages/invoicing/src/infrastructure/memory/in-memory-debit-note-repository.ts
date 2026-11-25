import type { DebitNote, DebitNoteFilter, DebitNoteRepository } from '../../domain';

export class InMemoryDebitNoteRepository implements DebitNoteRepository {
  private readonly storage = new Map<string, DebitNote>();
  private sequenceCounter = 0;

  findById(tenantId: string, id: string): Promise<DebitNote | null> {
    const note = this.storage.get(id);
    if (!note || note.tenantId !== tenantId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(note);
  }

  findByNumber(tenantId: string, debitNoteNumber: string): Promise<DebitNote | null> {
    for (const note of this.storage.values()) {
      if (note.tenantId === tenantId && note.debitNoteNumber === debitNoteNumber) {
        return Promise.resolve(note);
      }
    }
    return Promise.resolve(null);
  }

  listByInvoice(tenantId: string, affectedInvoiceId: string): Promise<readonly DebitNote[]> {
    const list: DebitNote[] = [];
    for (const note of this.storage.values()) {
      if (note.tenantId === tenantId && note.affectedInvoiceId === affectedInvoiceId) {
        list.push(note);
      }
    }
    return Promise.resolve(list);
  }

  listByTenant(tenantId: string, filter?: DebitNoteFilter): Promise<readonly DebitNote[]> {
    const list: DebitNote[] = [];
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

  nextDebitNoteNumber(_tenantId: string): Promise<string> {
    this.sequenceCounter++;
    const padded = this.sequenceCounter.toString().padStart(6, '0');
    return Promise.resolve(`ND-${padded}`);
  }

  save(debitNote: DebitNote): Promise<void> {
    this.storage.set(debitNote.id, debitNote);
    return Promise.resolve();
  }

  clear(): void {
    this.storage.clear();
    this.sequenceCounter = 0;
  }
}
