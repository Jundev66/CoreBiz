import { Module } from '@nestjs/common';
import {
  GetSupplierOptionsController,
  ListSuppliersController,
  CreateSupplierController,
  SetSupplierStatusController,
  UpdateSupplierController,
  GetSupplierByIdController,
  ConfirmVisionReceiptController,
  ListGoodsReceiptsController,
  ReceiveGoodsController,
  VoidGoodsReceiptController,
  GetGoodsReceiptByIdController,
} from './controllers';

@Module({
  controllers: [
    GetSupplierOptionsController,
    ListSuppliersController,
    CreateSupplierController,
    SetSupplierStatusController,
    UpdateSupplierController,
    GetSupplierByIdController,
    ConfirmVisionReceiptController,
    ListGoodsReceiptsController,
    ReceiveGoodsController,
    VoidGoodsReceiptController,
    GetGoodsReceiptByIdController,
  ],
})
export class PurchasingModule {}
