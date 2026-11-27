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
  PayGoodsReceiptController,
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
    PayGoodsReceiptController,
  ],
})
export class PurchasingModule {}
