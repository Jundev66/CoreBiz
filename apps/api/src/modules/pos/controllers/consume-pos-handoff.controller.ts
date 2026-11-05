import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import {
  asId,
  Plan,
  PosDevice,
  PosRegister,
  type PosDeviceId,
  type PosRegisterId,
  type TenantId,
  type UserId,
} from '@corebiz/domain';
import {
  consumePosHandoffSchema,
  type ConsumePosHandoffInput,
  type ConsumePosHandoffResponse,
} from '@corebiz/contracts';
import { systemClock, type TenantContext } from '@corebiz/application';
import { postgresRuntime } from '@corebiz/infrastructure';
import { activeDriver, databaseUrl } from '../../../config/driver';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { verifyHandoffToken } from './create-pos-handoff.controller';

@ApiTags('pos')
@Controller('v1/pos')
export class ConsumePosHandoffController {
  @Post('handoff/consume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consumir token de handoff y autorizar dispositivo POS' })
  async run(
    @Body(new ZodValidationPipe(consumePosHandoffSchema)) body: ConsumePosHandoffInput,
  ): Promise<ConsumePosHandoffResponse> {
    const verified = verifyHandoffToken(body.handoffToken);
    if (!verified) {
      throw new UnauthorizedException({
        errorKind: 'InvalidHandoffToken',
        errorParams: { reason: 'Token invalid or expired' },
      });
    }

    const tenantId = asId<TenantId>(verified.tenantId);
    const userId = asId<UserId>(verified.userId);
    const ctx: TenantContext = {
      tenantId,
      tenantSlug: 'pos-terminal',
      actor: { userId, role: 'owner' },
      plan: Plan.of('free'),
      settings: {
        taxLabel: 'IVA',
        taxRateBp: 1600,
        baseCurrency: 'USD',
        exchangeRateScaled: null,
        exchangeRateAt: null,
      },
      isDemo: false,
    };

    if (activeDriver() === 'memory' || tenantId === '00000000-0000-4000-8000-000000000001') {
      return {
        deviceId: '018e245a-0000-7000-8000-000000000001',
        registerId: '00000000-0000-0000-0000-000000000099',
        registerCode: verified.registerCode || 'CAJA-01',
        deviceToken: 'pos-demo-token-000000000001',
        tenantId,
      };
    }

    const runtime = postgresRuntime({
      url: databaseUrl(),
      ctx,
      ids: { next: () => uuidv7() },
      clock: systemClock,
      trace: {
        actorEmail: 'pos-handoff@corebiz.app',
        ipHash: null,
        userAgent: 'POS Handoff Consumer',
      },
    });
    const uow = runtime.uow;

    return uow.run(async (repos) => {
      let register = await repos.posRegisters.findByCode(verified.registerCode);

      const now = new Date();
      if (!register) {
        const regRes = PosRegister.create({
          id: asId<PosRegisterId>(uuidv7()),
          tenantId,
          code: verified.registerCode || 'CAJA-01',
          name: 'Caja Principal',
          now,
        });
        if (!regRes.ok) {
          throw new Error('Register initialization failed');
        }
        register = regRes.value;
        await repos.posRegisters.save(register);
      }

      let device = await repos.posDevices.findByInstallationId(body.installationId);
      const secret = crypto.randomUUID();
      const token = `pos_dev_${tenantId}_${userId}_${secret}`;
      const tokenHash = createHash('sha256').update(token).digest('hex');

      if (!device) {
        const devRes = PosDevice.create({
          id: asId<PosDeviceId>(uuidv7()),
          tenantId,
          installationId: body.installationId,
          name: body.name || 'Terminal Mostrador',
          platform: body.platform ?? null,
          browser: body.browser ?? null,
          now,
        });
        if (!devRes.ok) {
          throw new Error('Device initialization failed');
        }
        device = devRes.value;
      }

      device.authorize(tokenHash, now);
      await repos.posDevices.save(device);

      return {
        deviceId: device.id,
        registerId: register.id,
        registerCode: register.code,
        deviceToken: token,
        tenantId,
      };
    });
  }
}
