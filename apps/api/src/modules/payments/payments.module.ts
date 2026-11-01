import { Module } from '@nestjs/common';
import {
  GetCustomerReceivablesController,
  GetCustomerBalanceController,
  ListCustomerPaymentsController,
  ReceiveCustomerPaymentController,
  VoidCustomerPaymentController,
  GetPaymentByIdController,
} from './controllers';

@Module({
  controllers: [
    GetCustomerReceivablesController,
    GetCustomerBalanceController,
    ListCustomerPaymentsController,
    ReceiveCustomerPaymentController,
    VoidCustomerPaymentController,
    GetPaymentByIdController,
  ],
})
export class PaymentsModule {}
