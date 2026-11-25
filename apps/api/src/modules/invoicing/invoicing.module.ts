import { Module } from '@nestjs/common';
import {
  IssueInvoiceController,
  ApplyPaymentController,
  ListInvoicesController,
  CreateCollectionReceiptController,
  VoidCollectionReceiptController,
  ListInvoiceReceiptsController,
  IssueCreditNoteController,
  ListCreditNotesController,
  IssueDebitNoteController,
  ListDebitNotesController,
} from './controllers';

@Module({
  controllers: [
    IssueInvoiceController,
    ApplyPaymentController,
    ListInvoicesController,
    CreateCollectionReceiptController,
    VoidCollectionReceiptController,
    ListInvoiceReceiptsController,
    IssueCreditNoteController,
    ListCreditNotesController,
    IssueDebitNoteController,
    ListDebitNotesController,
  ],
})
export class InvoicingModule {}
