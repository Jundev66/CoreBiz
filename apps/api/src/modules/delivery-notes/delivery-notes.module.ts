import { Module } from '@nestjs/common';
import {
  ListDeliveryNotesController,
  GetDeliveryNoteByIdController,
  IssueDeliveryNoteController,
  MarkDeliveryNoteDeliveredController,
  VoidDeliveryNoteController,
} from './controllers';

@Module({
  controllers: [
    ListDeliveryNotesController,
    GetDeliveryNoteByIdController,
    IssueDeliveryNoteController,
    MarkDeliveryNoteDeliveredController,
    VoidDeliveryNoteController,
  ],
})
export class DeliveryNotesModule {}
