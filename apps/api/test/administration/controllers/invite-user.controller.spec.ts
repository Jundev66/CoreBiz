import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InviteUserController } from '../../../src/modules/administration/controllers/invite-user.controller';
import { ok } from '@corebiz/domain';
import type { UseCases } from '../../../src/composition/use-cases.provider';

describe('InviteUserController', () => {
  let controller: InviteUserController;
  let useCasesMock: Partial<UseCases>;

  beforeEach(() => {
    useCasesMock = {
      inviteUser: vi.fn().mockResolvedValue(
        ok({
          invitationId: '018e245a-0000-7000-8000-000000000701',
          token: 'invitation-clear-token-12345',
        }),
      ),
    };

    controller = new InviteUserController(useCasesMock as UseCases);
  });

  it('delegates user invitation to use case', async () => {
    const response = await controller.run({
      email: 'operador@tienda.com',
      role: 'sales',
    });

    expect(response).toEqual({
      invitationId: '018e245a-0000-7000-8000-000000000701',
      token: 'invitation-clear-token-12345',
    });
    expect(useCasesMock.inviteUser).toHaveBeenCalledWith({
      email: 'operador@tienda.com',
      role: 'sales',
    });
  });

  it('throws domain error for unknown role', async () => {
    await expect(
      controller.run({
        email: 'operador@tienda.com',
        role: 'superman',
      }),
    ).rejects.toThrow();
  });
});
