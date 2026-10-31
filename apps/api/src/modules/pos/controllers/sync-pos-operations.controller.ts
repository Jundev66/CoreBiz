import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  posSyncBatchSchema,
  openCashShiftSchema,
  recordCashMovementSchema,
  closeCashShiftSchema,
  issuePosSaleSchema,
  type PosSyncBatchInput,
  type PosSyncBatchResponse,
  type PosSyncItemResult,
} from '@corebiz/contracts';
import type { PosQueueJobData, TenantContext } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { TENANT_CONTEXT, USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

export type SyncOperationItem = PosSyncBatchInput['operations'][number];
export type CommandBuilder = (op: SyncOperationItem) => { type: string } & Record<string, unknown>;

export const COMMAND_DESERIALIZERS: Readonly<Record<string, CommandBuilder>> = {
  'shift.open': (op) => {
    const raw = (op.payload ?? {});
    const normalized = {
      ...raw,
      initialFloatMinor:
        typeof raw.initialFloatMinor === 'number' || typeof raw.initialFloatMinor === 'bigint'
          ? raw.initialFloatMinor.toString()
          : (raw.initialFloatMinor ?? '0'),
      currency: raw.currency ?? 'USD',
      openedAt: raw.openedAt ?? new Date().toISOString(),
    };
    return {
      type: 'shift.open',
      ...openCashShiftSchema.parse(normalized),
    };
  },
  'cash.movement': (op) => {
    const parsed = recordCashMovementSchema.parse(op.payload);
    const { type: movementType, ...rest } = parsed;
    return { type: 'cash.movement', movementType, ...rest };
  },
  'shift.close': (op) => ({
    type: 'shift.close',
    ...closeCashShiftSchema.parse(op.payload),
  }),
  'sale.issue': (op) => {
    const raw = op.payload ?? {};
    let paymentMethod = raw.paymentMethod;
    if (paymentMethod === 'cash_usd' || paymentMethod === 'cash_ves') {
      paymentMethod = 'cash';
    } else if (paymentMethod === 'pago_movil') {
      paymentMethod = 'transfer';
    } else if (paymentMethod === 'punto_debito') {
      paymentMethod = 'card';
    }

    const lines = Array.isArray(raw.lines)
      ? raw.lines.map((l: Record<string, unknown>) => ({
          ...l,
          quantity: typeof l.quantity === 'number' ? l.quantity.toString() : l.quantity,
          unitPriceMinor:
            typeof l.unitPriceMinor === 'number' || typeof l.unitPriceMinor === 'bigint'
              ? l.unitPriceMinor.toString()
              : l.unitPriceMinor,
        }))
      : raw.lines;

    const normalized = {
      ...raw,
      paymentMethod,
      lines,
    };

    return {
      type: 'sale.issue',
      ...issuePosSaleSchema.parse(normalized),
      sequence: op.sequence,
      payloadHash: op.payloadHash,
    };
  },
};

@ApiTags('pos')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/pos')
export class SyncPosOperationsController {
  constructor(
    @Inject(USE_CASES) private readonly useCases: UseCases,
    @Inject(TENANT_CONTEXT) private readonly ctx: TenantContext,
  ) {}

  @Post('sync')
  @RequirePermission('payment:receive')
  @ApiOperation({ summary: 'Sincronizar lote de operaciones offline' })
  async run(
    @Body(new ZodValidationPipe(posSyncBatchSchema)) body: PosSyncBatchInput,
  ): Promise<PosSyncBatchResponse> {
    const isAsyncMode = process.env.QUEUE_DRIVER === 'bullmq';

    if (isAsyncMode) {
      const queueJobs: PosQueueJobData[] = body.operations.map((op) => ({
        tenantId: this.ctx.tenantId,
        userId: this.ctx.actor.userId,
        deviceId: body.deviceId,
        operation: op,
      }));

      const queueResult = await this.useCases.posSyncQueue.enqueueBatch(queueJobs);

      if (queueResult.ok) {
        return {
          results: body.operations.map((op) => ({
            operationId: op.operationId,
            status: 'enqueued',
          })),
          syncedAt: new Date().toISOString(),
        };
      }
    }

    const results: PosSyncItemResult[] = [];
    console.log(
      `[API /v1/pos/sync] Incoming batch from device ${body.deviceId}: ${body.operations.length} operations`,
    );

    for (const op of body.operations) {
      try {
        const buildCommand = COMMAND_DESERIALIZERS[op.type];
        if (!buildCommand) {
          console.warn(`[API /v1/pos/sync] Unsupported operation type: ${op.type}`);
          results.push({
            operationId: op.operationId,
            status: 'failed',
            error: 'Unsupported operation type',
          });
          continue;
        }

        const cmd = buildCommand(op);
        const dispatchResult = await this.useCases.posCommandBus.dispatch(cmd);

        if (!dispatchResult.ok) {
          const errObj = dispatchResult.error as { kind?: string } | undefined;
          const errorMsg = errObj?.kind ?? 'OperationRejected';
          console.warn(
            `[API /v1/pos/sync] Operation ${op.operationId} (${op.type}) rejected: ${errorMsg}`,
          );
          results.push({
            operationId: op.operationId,
            status: 'failed',
            error: errorMsg,
          });
        } else {
          const val = dispatchResult.value as { status?: string; conflictId?: string } | undefined;
          const status = val?.status === 'duplicate' ? 'duplicate' : 'processed';
          console.log(
            `[API /v1/pos/sync] Operation ${op.operationId} (${op.type}) succeeded: ${status}`,
          );
          results.push({
            operationId: op.operationId,
            status,
            ...(val?.conflictId ? { conflictId: val.conflictId } : {}),
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Sync dispatch error';
        console.error(
          `[API /v1/pos/sync] Operation ${op.operationId} (${op.type}) exception:`,
          errorMsg,
        );
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
}
