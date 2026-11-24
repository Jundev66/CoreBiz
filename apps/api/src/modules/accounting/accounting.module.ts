import { Module } from '@nestjs/common';
import {
  PostJournalEntryController,
  GetTrialBalanceController,
  ListAccountsController,
  ListJournalEntriesController,
  ImportBankStatementController,
  MatchReconciliationController,
  RecordBankAdjustmentController,
  GetReconciliationStatusController,
  ListBankStatementsController,
  RunForexRevaluationController,
  GetForexExposureController,
  ExecuteTreasurySwapController,
  ListTreasurySwapsController,
  RecordPartnerCashDrawingController,
  RecordPartnerStockDrawingController,
  ListPartnerDrawingsController,
} from './controllers';

@Module({
  controllers: [
    PostJournalEntryController,
    GetTrialBalanceController,
    ListAccountsController,
    ListJournalEntriesController,
    ImportBankStatementController,
    MatchReconciliationController,
    RecordBankAdjustmentController,
    GetReconciliationStatusController,
    ListBankStatementsController,
    RunForexRevaluationController,
    GetForexExposureController,
    ExecuteTreasurySwapController,
    ListTreasurySwapsController,
    RecordPartnerCashDrawingController,
    RecordPartnerStockDrawingController,
    ListPartnerDrawingsController,
  ],
})
export class AccountingModule {}
