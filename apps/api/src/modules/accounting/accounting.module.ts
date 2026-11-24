import { Module } from '@nestjs/common';
import {
  PostJournalEntryController,
  GetTrialBalanceController,
  ListAccountsController,
  ListJournalEntriesController,
} from './controllers';

@Module({
  controllers: [
    PostJournalEntryController,
    GetTrialBalanceController,
    ListAccountsController,
    ListJournalEntriesController,
  ],
})
export class AccountingModule {}
