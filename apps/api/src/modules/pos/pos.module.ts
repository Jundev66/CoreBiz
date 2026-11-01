import { Module } from '@nestjs/common';
import { EnrollPosDeviceController } from './controllers/enroll-pos-device.controller';
import { GetPosCatalogController } from './controllers/get-pos-catalog.controller';
import { GetDemoPosCatalogController } from './controllers/get-demo-pos-catalog.controller';
import { GetDemoPosCustomersController } from './controllers/get-demo-pos-customers.controller';
import { SyncPosOperationsController } from './controllers/sync-pos-operations.controller';
import { GetPosConflictsController } from './controllers/get-pos-conflicts.controller';
import { ResolvePosConflictController } from './controllers/resolve-pos-conflict.controller';
import { ListPosSalesController } from './controllers/list-pos-sales.controller';
import { GetPosSaleByIdController } from './controllers/get-pos-sale-by-id.controller';

@Module({
  controllers: [
    EnrollPosDeviceController,
    GetPosCatalogController,
    GetDemoPosCatalogController,
    GetDemoPosCustomersController,
    SyncPosOperationsController,
    GetPosConflictsController,
    ResolvePosConflictController,
    ListPosSalesController,
    GetPosSaleByIdController,
  ],
})
export class PosModule {}
