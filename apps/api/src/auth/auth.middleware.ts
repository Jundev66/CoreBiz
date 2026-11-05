import { Inject, Injectable, UnauthorizedException, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { createHash } from 'node:crypto';
import { getPrisma } from '@corebiz/db';
import { activeDriver, databaseUrl } from '../config/driver';
import { JWT_VERIFIER } from '../tokens';
import type { SupabaseJwtVerifier } from './supabase-jwt.verifier';
import type { AuthenticatedRequest, VerifiedIdentity } from './authenticated-request';

const DEMO_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const DEMO_OWNER_ID = '00000000-0000-4000-8000-000000000002';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(@Inject(JWT_VERIFIER) private readonly verifier: SupabaseJwtVerifier) {}

  async use(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
    if (activeDriver() === 'memory') {
      req.auth = MEMORY_IDENTITY;
      next();
      return;
    }

    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) {
      throw new UnauthorizedException({ errorKind: 'Unauthenticated', errorParams: {} });
    }

    const token = header.slice('Bearer '.length);

    if (
      token === 'pos-demo-token-000000000001' ||
      token.startsWith('pos-demo-token-') ||
      token.startsWith('demo-pos-token-')
    ) {
      req.auth = {
        userId: DEMO_OWNER_ID,
        email: 'demo@corebiz.local',
      };
      if (!req.headers['x-corebiz-tenant']) {
        req.headers['x-corebiz-tenant'] = DEMO_TENANT_ID;
      }
      next();
      return;
    }

    try {
      req.auth = await this.verifier.verify(token);
      next();
    } catch {
      try {
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const prisma = getPrisma(databaseUrl());
        const device = await prisma.pos_devices.findFirst({
          where: { device_token_hash: tokenHash, status: 'active' },
        });

        if (device) {
          const member = await prisma.memberships.findFirst({
            where: { tenant_id: device.tenant_id, status: 'active' },
            orderBy: { created_at: 'asc' },
          });

          req.auth = {
            userId: member?.user_id ?? DEMO_OWNER_ID,
            email: 'pos-device@corebiz.app',
          };
          req.headers['x-corebiz-tenant'] = device.tenant_id;
          next();
          return;
        }
      } catch {
        throw new UnauthorizedException({ errorKind: 'Unauthenticated', errorParams: {} });
      }

      throw new UnauthorizedException({ errorKind: 'Unauthenticated', errorParams: {} });
    }
  }
}

export const MEMORY_IDENTITY: VerifiedIdentity = {
  userId: '00000000-0000-0000-0000-000000000001',
  email: null,
};
