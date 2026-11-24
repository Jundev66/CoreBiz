import { Module } from '@nestjs/common';
import {
  ListIntegrationDeliveryNotesController,
  ConfirmIntegrationDeliveryNoteController,
  DeliverIntegrationDeliveryNoteController,
  RegisterOrConfirmIntegrationDeliveryNoteController,
  GetIntegrationDeliveryNoteByIdController,
  HeadlessInvoiceIssueController,
  IssueIntegrationInvoiceController,
  PostIntegrationJournalEntryController,
} from './controllers';

@Module({
  controllers: [
    ListIntegrationDeliveryNotesController,
    ConfirmIntegrationDeliveryNoteController,
    DeliverIntegrationDeliveryNoteController,
    RegisterOrConfirmIntegrationDeliveryNoteController,
    GetIntegrationDeliveryNoteByIdController,
    HeadlessInvoiceIssueController,
    IssueIntegrationInvoiceController,
    PostIntegrationJournalEntryController,
  ],
})
export class IntegrationsModule {}
