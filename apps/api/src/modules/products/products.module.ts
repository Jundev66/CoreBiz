import { Module } from '@nestjs/common';
import {
  ListProductsController,
  GetProductOptionsController,
  GetLowStockProductsController,
  CreateProductController,
  GetProductByIdController,
  GetProductMovementsController,
  UpdateProductController,
  SetProductStatusController,
  AdjustProductStockController,
} from './controllers';

@Module({
  controllers: [
    ListProductsController,
    GetProductOptionsController,
    GetLowStockProductsController,
    CreateProductController,
    GetProductByIdController,
    GetProductMovementsController,
    UpdateProductController,
    SetProductStatusController,
    AdjustProductStockController,
  ],
})
export class ProductsModule {}
