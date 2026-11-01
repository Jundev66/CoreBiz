import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { purgeExpiredDemos } from '@corebiz/infrastructure';
import { InternalSecretGuard } from '../../../auth/internal-secret.guard';
import { activeDriver, databaseUrl } from '../../../config/driver';

@ApiExcludeController()
@UseGuards(InternalSecretGuard)
@Controller('internal')
export class PurgeExpiredDemosController {
  @Post('cron/purge')
  async run(): Promise<{ purged: number }> {
    if (activeDriver() === 'memory') return { purged: 0 };
    return { purged: await purgeExpiredDemos(databaseUrl()) };
  }
}
