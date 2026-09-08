import { Module } from '@nestjs/common';
import { DeliveryNotesController } from './delivery-notes.controller';

@Module({ controllers: [DeliveryNotesController] })
export class DeliveryNotesModule {}
