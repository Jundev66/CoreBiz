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
  ],
})
export class AccountingModule {}
