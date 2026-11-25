import { Module } from '@nestjs/common';
import {
  CreateWarehouseController,
  ListWarehousesController,
  GetWarehouseStockController,
  InitiateTransferController,
  ReceiveTransferController,
  CancelTransferController,
  ListTransfersController,
  CreateInventoryAuditController,
  RecordAuditCountsController,
  ApproveInventoryAuditController,
  CancelInventoryAuditController,
  ListInventoryAuditsController,
  GetInventoryAuditDetailsController,
} from './controllers';

@Module({
  controllers: [
    CreateWarehouseController,
    ListWarehousesController,
    GetWarehouseStockController,
    InitiateTransferController,
    ReceiveTransferController,
    CancelTransferController,
    ListTransfersController,
    CreateInventoryAuditController,
    RecordAuditCountsController,
    ApproveInventoryAuditController,
    CancelInventoryAuditController,
    ListInventoryAuditsController,
    GetInventoryAuditDetailsController,
  ],
})
export class InventoryModule {}
