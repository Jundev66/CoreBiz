import { Controller, Delete, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { destroyDemoSandbox } from '@corebiz/infrastructure';
import { ACTIVE_CONTEXT, IDENTITY } from '../../../tokens';
import type { ResolvedContext } from '../../../composition/context.provider';
import type { VerifiedIdentity } from '../../../auth/authenticated-request';
import { databaseUrl } from '../../../config/driver';
import { domainError } from '../../../http/api-error';

@ApiTags('sesion')
@ApiBearerAuth()
@Controller('v1/session')
export class DestroyDemoSessionController {
  constructor(
    @Inject(IDENTITY) private readonly identity: VerifiedIdentity,
    @Inject(ACTIVE_CONTEXT) private readonly resolved: ResolvedContext | null,
  ) {}

  @Delete('demo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Auto-destrucción inmediata de los datos y sandbox de demostración' })
  async run(): Promise<{ destroyed: boolean }> {
    if (this.resolved === null || !this.resolved.ctx.isDemo) {
      throw domainError('Forbidden');
    }

    const tenantId = this.resolved.ctx.tenantId;
    const userId = this.identity.userId;
    const destroyed = await destroyDemoSandbox(databaseUrl(), tenantId, userId);

    return { destroyed };
  }
}
