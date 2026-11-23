import { Module } from '@nestjs/common';
import {
  ListIntegrationDeliveryNotesController,
  ConfirmIntegrationDeliveryNoteController,
  DeliverIntegrationDeliveryNoteController,
  RegisterOrConfirmIntegrationDeliveryNoteController,
  GetIntegrationDeliveryNoteByIdController,
  HeadlessInvoiceIssueController,
} from './controllers';

@Module({
  controllers: [
    ListIntegrationDeliveryNotesController,
    ConfirmIntegrationDeliveryNoteController,
    DeliverIntegrationDeliveryNoteController,
    RegisterOrConfirmIntegrationDeliveryNoteController,
    GetIntegrationDeliveryNoteByIdController,
    HeadlessInvoiceIssueController,
  ],
})
export class IntegrationsModule {}
