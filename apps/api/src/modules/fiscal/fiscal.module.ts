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
  ListTaxRateConfigsController,
  CreateTaxRateConfigController,
  SetDefaultTaxRateConfigController,
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
    ListTaxRateConfigsController,
    CreateTaxRateConfigController,
    SetDefaultTaxRateConfigController,
  ],
})
export class FiscalModule {}
