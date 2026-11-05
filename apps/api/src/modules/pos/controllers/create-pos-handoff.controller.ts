import { Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import type { CreatePosHandoffResponse } from '@corebiz/contracts';
import type { TenantContext } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { TENANT_CONTEXT } from '../../../tokens';

export interface PosHandoffPayload {
  readonly tenantId: string;
  readonly userId: string;
  readonly registerCode: string;
  readonly exp: number;
  readonly nonce: string;
}

export function getHandoffSecret(): string {
  return process.env.INTERNAL_API_SECRET || 'corebiz-pos-handoff-internal-signing-key-9988';
}

export function signHandoffToken(payload: PosHandoffPayload): string {
  const secret = getHandoffSecret();
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyHandoffToken(token: string): PosHandoffPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [data, sig] = parts;
    if (!data || !sig) return null;
    const secret = getHandoffSecret();
    const expectedSig = createHmac('sha256', secret).update(data).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const payload = JSON.parse(
      Buffer.from(data, 'base64url').toString('utf-8'),
    ) as PosHandoffPayload;
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

@ApiTags('pos')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/pos')
export class CreatePosHandoffController {
  constructor(@Inject(TENANT_CONTEXT) private readonly ctx: TenantContext) {}

  @Post('handoff')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('payment:read')
  @ApiOperation({ summary: 'Generar token de handoff para abrir o emparejar la terminal POS' })
  async run(): Promise<CreatePosHandoffResponse> {
    await Promise.resolve();
    const exp = Date.now() + 5 * 60 * 1000; // 5 minutos
    const userId = this.ctx.actor.userId;
    const payload: PosHandoffPayload = {
      tenantId: this.ctx.tenantId,
      userId,
      registerCode: 'CAJA-01',
      exp,
      nonce: uuidv7(),
    };

    const handoffToken = signHandoffToken(payload);

    return {
      handoffToken,
      expiresAt: new Date(exp).toISOString(),
    };
  }
}
