import { Module } from '@nestjs/common';
import {
  GetSalesBookController,
  GetPurchasesBookController,
  GetUsTaxSummaryController,
  CreateFiscalSequenceRangeController,
  ListFiscalSequenceRangesController,
  IssueWithholdingVoucherController,
  VoidWithholdingVoucherController,
  ListWithholdingVouchersController,
} from './controllers';

@Module({
  controllers: [
    GetSalesBookController,
    GetPurchasesBookController,
    GetUsTaxSummaryController,
    CreateFiscalSequenceRangeController,
    ListFiscalSequenceRangesController,
    IssueWithholdingVoucherController,
    VoidWithholdingVoucherController,
    ListWithholdingVouchersController,
  ],
})
export class FiscalModule {}
