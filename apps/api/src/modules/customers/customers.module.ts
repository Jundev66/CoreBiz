import { Module } from '@nestjs/common';
import {
  GetCustomerOptionsController,
  ListCustomersController,
  CreateCustomerController,
  SetCustomerStatusController,
  UpdateCustomerController,
  GetCustomerByIdController,
} from './controllers';

@Module({
  controllers: [
    GetCustomerOptionsController,
    ListCustomersController,
    CreateCustomerController,
    SetCustomerStatusController,
    UpdateCustomerController,
    GetCustomerByIdController,
  ],
})
export class CustomersModule {}
