import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostJournalEntryController } from '../../../src/modules/accounting/controllers/post-journal-entry.controller';
import { PostJournalEntryDtoMother } from '../mothers/post-journal-entry-dto.mother';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';
import type { TenantContext } from '@corebiz/application';

describe('PostJournalEntryController', () => {
  let controller: PostJournalEntryController;
  let useCasesMock: {
    postJournalEntry: {
      execute: ReturnType<typeof vi.fn>;
    };
  };
  let tenantCtxMock: TenantContext;

  beforeEach(() => {
    useCasesMock = {
      postJournalEntry: {
        execute: vi.fn().mockResolvedValue(
          ok({
            entryId: '018e245a-0000-7000-8000-000000000099',
            entryNumber: 1n,
          }),
        ),
      },
    };

    tenantCtxMock = {
      tenantId: '018e245a-0000-7000-8000-000000000001',
    } as unknown as TenantContext;

    controller = new PostJournalEntryController(useCasesMock as unknown as UseCases, tenantCtxMock);
  });

  it('posts balanced journal entry and returns entryId and stringified entryNumber', async () => {
    const dto = PostJournalEntryDtoMother.create();

    const response = await controller.run(dto);

    expect(response).toEqual({
      entryId: '018e245a-0000-7000-8000-000000000099',
      entryNumber: '1',
    });
    expect(useCasesMock.postJournalEntry.execute).toHaveBeenCalled();
  });
});
