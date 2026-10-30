import { Body, Controller, Inject, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { asId, PosDevice, type PosDeviceId } from '@corebiz/domain';
import {
  enrollDeviceSchema,
  type EnrollDeviceInput,
  type EnrollDeviceResponse,
} from '@corebiz/contracts';
import type { TenantContext } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { RUNTIME, TENANT_CONTEXT } from '../../../tokens';
import type { Runtime } from '../../../composition/runtime.provider';

@ApiTags('pos')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/pos')
export class EnrollPosDeviceController {
  constructor(
    @Inject(RUNTIME) private readonly runtime: Runtime,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post('devices/enroll')
  @RequirePermission('payment:receive')
  @ApiOperation({ summary: 'Vincular dispositivo a una caja POS' })
  async run(
    @Body(new ZodValidationPipe(enrollDeviceSchema)) body: EnrollDeviceInput,
  ): Promise<EnrollDeviceResponse> {
    return this.runtime.uow.run(async (repos) => {
      const register = await repos.posRegisters.findByCode(body.pairingCode);

      if (!register || register.status !== 'active') {
        throw new NotFoundException({
          errorKind: 'RegisterNotFound',
          errorParams: { code: body.pairingCode },
        });
      }

      let device = await repos.posDevices.findByInstallationId(body.installationId);
      const now = new Date();
      const token = crypto.randomUUID();
      const tokenHash = createHash('sha256').update(token).digest('hex');

      if (!device) {
        const devRes = PosDevice.create({
          id: asId<PosDeviceId>(uuidv7()),
          tenantId: this.ctx.tenantId,
          installationId: body.installationId,
          name: body.name,
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
      };
    });
  }
}
