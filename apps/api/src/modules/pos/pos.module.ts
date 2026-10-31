import { Module } from '@nestjs/common';
import { EnrollPosDeviceController } from './controllers/enroll-pos-device.controller';
import { GetPosCatalogController } from './controllers/get-pos-catalog.controller';
import { GetDemoPosCatalogController } from './controllers/get-demo-pos-catalog.controller';
import { SyncPosOperationsController } from './controllers/sync-pos-operations.controller';
import { GetPosConflictsController } from './controllers/get-pos-conflicts.controller';
import { ResolvePosConflictController } from './controllers/resolve-pos-conflict.controller';

@Module({
  controllers: [
    EnrollPosDeviceController,
    GetPosCatalogController,
    GetDemoPosCatalogController,
    SyncPosOperationsController,
    GetPosConflictsController,
    ResolvePosConflictController,
  ],
})
export class PosModule {}
