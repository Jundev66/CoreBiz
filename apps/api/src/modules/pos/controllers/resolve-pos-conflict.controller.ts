import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { resolveConflictSchema, type ResolveConflictInput } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('pos')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/pos')
export class ResolvePosConflictController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post('conflicts/:id/resolve')
  @RequirePermission('stock:adjust')
  @ApiOperation({ summary: 'Resolver inconsistencia de inventario' })
  async run(
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
