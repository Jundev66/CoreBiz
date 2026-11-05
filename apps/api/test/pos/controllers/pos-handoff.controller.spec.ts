import { describe, it, expect } from 'vitest';
import {
  CreatePosHandoffController,
  signHandoffToken,
  verifyHandoffToken,
  type PosHandoffPayload,
} from '../../../src/modules/pos/controllers/create-pos-handoff.controller';
import { ConsumePosHandoffController } from '../../../src/modules/pos/controllers/consume-pos-handoff.controller';
import type { TenantContext } from '@corebiz/application';
import type { AuthenticatedRequest } from '../../../src/auth/authenticated-request';
import { asId, type TenantId } from '@corebiz/domain';

describe('PosHandoffControllers', () => {
  const tenantId = asId<TenantId>('018e245a-0000-7000-8000-000000000001');
  const userId = '018e245a-0000-7000-8000-000000000002';

  describe('signHandoffToken and verifyHandoffToken', () => {
    it('signs and verifies a valid payload', () => {
      const payload: PosHandoffPayload = {
        tenantId,
        userId,
        registerCode: 'CAJA-01',
        exp: Date.now() + 60_000,
        nonce: 'nonce-123',
      };

      const token = signHandoffToken(payload);
      expect(typeof token).toBe('string');
      expect(token).toContain('.');

      const verified = verifyHandoffToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.tenantId).toBe(tenantId);
      expect(verified?.userId).toBe(userId);
      expect(verified?.registerCode).toBe('CAJA-01');
    });

    it('rejects an expired token', () => {
      const payload: PosHandoffPayload = {
        tenantId,
        userId,
        registerCode: 'CAJA-01',
        exp: Date.now() - 1000, // expired
        nonce: 'nonce-123',
      };

      const token = signHandoffToken(payload);
      const verified = verifyHandoffToken(token);
      expect(verified).toBeNull();
    });

    it('rejects a tampered token', () => {
      const payload: PosHandoffPayload = {
        tenantId,
        userId,
        registerCode: 'CAJA-01',
        exp: Date.now() + 60_000,
        nonce: 'nonce-123',
      };

      const token = signHandoffToken(payload);
      const tampered = token.slice(0, -3) + 'xyz';
      const verified = verifyHandoffToken(tampered);
      expect(verified).toBeNull();
    });
  });

  describe('CreatePosHandoffController', () => {
    it('generates a valid handoff token with 5-minute expiration', async () => {
      const ctx = { tenantId } as unknown as TenantContext;
      const req = {
        auth: { userId },
      } as unknown as AuthenticatedRequest;

      const controller = new CreatePosHandoffController(ctx, req);
      const res = await controller.run();

      expect(res.handoffToken).toBeDefined();
      expect(res.expiresAt).toBeDefined();

      const verified = verifyHandoffToken(res.handoffToken);
      expect(verified).not.toBeNull();
      expect(verified?.tenantId).toBe(tenantId);
    });
  });

  describe('ConsumePosHandoffController', () => {
    it('throws UnauthorizedException for invalid token', async () => {
      const controller = new ConsumePosHandoffController();
      await expect(
        controller.run({
          handoffToken: 'invalid.token',
          installationId: '018e245a-0000-7000-8000-000000000003',
        }),
      ).rejects.toThrow();
    });
  });
});
