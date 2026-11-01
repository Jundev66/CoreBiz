import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueDeliveryNoteController } from '../../../src/modules/delivery-notes/controllers/issue-delivery-note.controller';
import { IssueDeliveryNoteDtoMother } from '../mothers/issue-delivery-note-dto.mother';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';

describe('IssueDeliveryNoteController', () => {
  let controller: IssueDeliveryNoteController;
  let useCasesMock: Partial<UseCases>;

  beforeEach(() => {
    useCasesMock = {
      issueDeliveryNote: vi.fn().mockResolvedValue(
        ok({
          id: '018e245a-0000-7000-8000-000000000050',
          number: 'NOT-000001',
        }),
      ),
    };

    controller = new IssueDeliveryNoteController(useCasesMock as UseCases);
  });

  it('delegates delivery note issuance to use case and returns id and number', async () => {
    const dto = IssueDeliveryNoteDtoMother.create();

    const response = await controller.run(dto);

    expect(response).toEqual({
      id: '018e245a-0000-7000-8000-000000000050',
      number: 'NOT-000001',
    });
    expect(useCasesMock.issueDeliveryNote).toHaveBeenCalledWith({
      customerId: dto.customerId,
      lines: dto.lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountBp: l.discountBp,
      })),
      notes: dto.notes,
    });
  });
});
