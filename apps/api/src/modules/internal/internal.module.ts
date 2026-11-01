import { Module } from '@nestjs/common';
import { HitRateLimitController, PurgeExpiredDemosController } from './controllers';

@Module({
  controllers: [HitRateLimitController, PurgeExpiredDemosController],
})
export class InternalModule {}
