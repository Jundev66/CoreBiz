import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetTeamController } from '../../../src/modules/administration/controllers/get-team.controller';
import type { Runtime } from '../../../src/composition/runtime.provider';

describe('GetTeamController', () => {
  let controller: GetTeamController;
  let teamMock: ReturnType<typeof vi.fn>;
  let runtimeMock: Partial<Runtime>;

  beforeEach(() => {
    teamMock = vi.fn().mockResolvedValue([
      {
        userId: '018e245a-0000-7000-8000-000000000003',
        email: 'admin@corebiz.app',
        role: 'owner',
        joinedAt: new Date('2026-01-01T08:00:00Z'),
      },
    ]);

    runtimeMock = {
      queries: {
        admin: {
          team: teamMock,
        },
      } as unknown as Runtime['queries'],
    };

    controller = new GetTeamController(runtimeMock as Runtime);
  });

  it('returns team members from runtime queries', async () => {
    const response = await controller.run();

    expect(response).toHaveLength(1);
    expect(response[0]?.role).toBe('owner');
    expect(teamMock).toHaveBeenCalled();
  });
});
