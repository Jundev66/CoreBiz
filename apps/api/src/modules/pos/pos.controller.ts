import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { asId, PosDevice, type PosDeviceId } from '@corebiz/domain';
import {
  enrollDeviceSchema,
  posSyncBatchSchema,
  catalogDeltaQuerySchema,
  resolveConflictSchema,
  openCashShiftSchema,
  recordCashMovementSchema,
  closeCashShiftSchema,
  issuePosSaleSchema,
  type EnrollDeviceInput,
  type EnrollDeviceResponse,
  type PosSyncBatchInput,
  type PosSyncBatchResponse,
  type CatalogDeltaQuery,
  type ResolveConflictInput,
  type PosSyncItemResult,
} from '@corebiz/contracts';
import type { TenantContext } from '@corebiz/application';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../http/api-error';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { RUNTIME, TENANT_CONTEXT, USE_CASES } from '../../tokens';
import type { Runtime } from '../../composition/runtime.provider';
import type { UseCases } from '../../composition/use-cases.provider';

@ApiTags('pos')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/pos')
export class PosController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(RUNTIME) private readonly runtime: Runtime,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post('devices/enroll')
  @RequirePermission('payment:receive')
  @ApiOperation({ summary: 'Vincular dispositivo a una caja POS' })
  async enrollDevice(
    @Body(new ZodValidationPipe(enrollDeviceSchema)) body: EnrollDeviceInput,
  ): Promise<EnrollDeviceResponse> {
    return this.runtime.uow.run(async (repos) => {
      const register = await repos.posRegisters.findByCode(body.pairingCode);

      if (!register || register.status !== 'active') {
        throw new NotFoundException({
          errorKind: 'RegisterNotFound',
          errorParams: { code: body.pairingCode },
        });
      }

      let device = await repos.posDevices.findByInstallationId(body.installationId);
      const now = new Date();
      const token = crypto.randomUUID();
      const tokenHash = createHash('sha256').update(token).digest('hex');

      if (!device) {
        const devRes = PosDevice.create({
          id: asId<PosDeviceId>(uuidv7()),
          tenantId: this.ctx.tenantId,
          installationId: body.installationId,
          name: body.name,
          platform: body.platform ?? null,
          browser: body.browser ?? null,
          now,
        });
        if (!devRes.ok) {
          throw new Error('Device initialization failed');
        }
        device = devRes.value;
      }

      device.authorize(tokenHash, now);
      await repos.posDevices.save(device);

      return {
        deviceId: device.id,
        registerId: register.id,
        registerCode: register.code,
        deviceToken: token,
      };
    });
  }

  @Post('sync')
  @RequirePermission('payment:receive')
  @ApiOperation({ summary: 'Sincronizar lote de operaciones offline' })
  async syncBatch(
    @Body(new ZodValidationPipe(posSyncBatchSchema)) body: PosSyncBatchInput,
  ): Promise<PosSyncBatchResponse> {
    const results: PosSyncItemResult[] = [];

    for (const op of body.operations) {
      try {
        let cmd: { type: string } & Record<string, unknown>;

        if (op.type === 'shift.open') {
          const parsed = openCashShiftSchema.parse(op.payload);
          cmd = { type: 'shift.open', ...parsed };
        } else if (op.type === 'cash.movement') {
          const parsed = recordCashMovementSchema.parse(op.payload);
          const { type: movementType, ...restMovement } = parsed;
          cmd = { type: 'cash.movement', movementType, ...restMovement };
        } else if (op.type === 'shift.close') {
          const parsed = closeCashShiftSchema.parse(op.payload);
          cmd = { type: 'shift.close', ...parsed };
        } else if (op.type === 'sale.issue') {
          const parsed = issuePosSaleSchema.parse(op.payload);
          cmd = {
            type: 'sale.issue',
            ...parsed,
            sequence: op.sequence,
            payloadHash: op.payloadHash,
          };
        } else {
          results.push({
            operationId: op.operationId,
            status: 'failed',
            error: 'Unsupported operation type',
          });
          continue;
        }

        const dispatchResult = await this.useCases.posCommandBus.dispatch(cmd);

        if (!dispatchResult.ok) {
          const errObj = dispatchResult.error as { kind?: string } | undefined;
          results.push({
            operationId: op.operationId,
            status: 'failed',
            error: errObj?.kind ?? 'OperationRejected',
          });
        } else {
          const val = dispatchResult.value as { status?: string; conflictId?: string } | undefined;
          results.push({
            operationId: op.operationId,
            status: val?.status === 'duplicate' ? 'duplicate' : 'processed',
            ...(val?.conflictId ? { conflictId: val.conflictId } : {}),
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Sync dispatch error';
        results.push({
          operationId: op.operationId,
          status: 'failed',
          error: errorMsg,
        });
      }
    }

    return {
      results,
      syncedAt: new Date().toISOString(),
    };
  }

  @Get('catalog')
  @RequirePermission('product:read')
  @ApiOperation({ summary: 'Descargar catalogo delta para operacion offline' })
  async getCatalog(
    @Query(new ZodValidationPipe(catalogDeltaQuerySchema)) query: CatalogDeltaQuery,
  ) {
    const catalogPage = await this.runtime.queries.products.list({
      limit: query.limit,
    });

    return {
      items: catalogPage.items.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        price: p.price,
        trackStock: p.trackStock,
        onHand: p.onHand ?? '0',
      })),
      serverTime: new Date().toISOString(),
    };
  }

  @Get('conflicts')
  @RequirePermission('stock:read')
  @ApiOperation({ summary: 'Listar inconsistencias y sobreventas de inventario' })
  async getConflicts() {
    return this.runtime.uow.run(async (repos) => {
      const conflicts = await repos.inventoryConflicts.list({ status: 'open' });
      return conflicts.map((c) => ({
        id: c.id,
        productId: c.productId,
        conflictType: c.conflictType,
        status: c.status,
        detectedAt: c.detectedAt.toISOString(),
        stockBefore: (Number(c.stockBefore) / 1000).toString(),
        quantityAttempted: (Number(c.quantityAttempted) / 1000).toString(),
        stockAfter: (Number(c.stockAfter) / 1000).toString(),
        shortageQuantity: (Number(c.shortageQuantity) / 1000).toString(),
        assignedTo: c.assignedTo,
        resolutionType: c.resolutionType,
        resolutionNotes: c.resolutionNotes,
      }));
    });
  }

  @Post('conflicts/:id/resolve')
  @RequirePermission('stock:adjust')
  @ApiOperation({ summary: 'Resolver inconsistencia de inventario' })
  async resolveConflict(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveConflictSchema)) body: ResolveConflictInput,
  ) {
    const result = await this.useCases.resolveInventoryConflict({
      conflictId: id,
      resolutionType: body.resolutionType,
      notes: body.notes,
    });
    return unwrapOrThrow(result);
  }
}
