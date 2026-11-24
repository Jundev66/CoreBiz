import { Module } from '@nestjs/common';
import {
  IssueInvoiceController,
  ApplyPaymentController,
  ListInvoicesController,
} from './controllers';

@Module({
  controllers: [IssueInvoiceController, ApplyPaymentController, ListInvoicesController],
})
export class InvoicingModule {}
