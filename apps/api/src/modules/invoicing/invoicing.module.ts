import { Module } from '@nestjs/common';
import { IssueInvoiceController, ApplyPaymentController } from './controllers';

@Module({
  controllers: [IssueInvoiceController, ApplyPaymentController],
})
export class InvoicingModule {}
