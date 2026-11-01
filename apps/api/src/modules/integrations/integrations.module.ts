import { Module } from '@nestjs/common';
import {
  ListIntegrationDeliveryNotesController,
  ConfirmIntegrationDeliveryNoteController,
  DeliverIntegrationDeliveryNoteController,
  RegisterOrConfirmIntegrationDeliveryNoteController,
  GetIntegrationDeliveryNoteByIdController,
} from './controllers';

@Module({
  controllers: [
    ListIntegrationDeliveryNotesController,
    ConfirmIntegrationDeliveryNoteController,
    DeliverIntegrationDeliveryNoteController,
    RegisterOrConfirmIntegrationDeliveryNoteController,
    GetIntegrationDeliveryNoteByIdController,
  ],
})
export class IntegrationsModule {}
