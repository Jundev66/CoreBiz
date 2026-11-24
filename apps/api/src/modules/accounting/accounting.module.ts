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
  ],
})
export class AccountingModule {}
