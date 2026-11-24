import { Module } from '@nestjs/common';
import {
  GetSalesBookController,
  GetPurchasesBookController,
  GetUsTaxSummaryController,
} from './controllers';

@Module({
  controllers: [GetSalesBookController, GetPurchasesBookController, GetUsTaxSummaryController],
})
export class FiscalModule {}
