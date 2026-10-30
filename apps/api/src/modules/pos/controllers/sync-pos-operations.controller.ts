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
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('pos')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/pos')
export class SyncPosOperationsController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post('sync')
  @RequirePermission('payment:receive')
  @ApiOperation({ summary: 'Sincronizar lote de operaciones offline' })
  async run(
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
}
