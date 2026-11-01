import { Module } from '@nestjs/common';
import { GetSalesSummaryController, GetUsageController } from './controllers';

@Module({
  controllers: [GetSalesSummaryController, GetUsageController],
})
export class InsightsModule {}
