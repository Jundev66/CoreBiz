import { Module } from '@nestjs/common';
import { PostJournalEntryController, GetTrialBalanceController } from './controllers';

@Module({
  controllers: [PostJournalEntryController, GetTrialBalanceController],
})
export class AccountingModule {}
