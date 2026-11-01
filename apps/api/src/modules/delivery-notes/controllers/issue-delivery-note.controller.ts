import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { issueDeliveryNoteSchema } from '@corebiz/contracts';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('ventas')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/delivery-notes')
export class IssueDeliveryNoteController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post()
  @RequirePermission('delivery_note:issue')
  @ApiOperation({ summary: 'Emitir una nota de entrega' })
  async run(
    @Body(new ZodValidationPipe(issueDeliveryNoteSchema))
    body: z.infer<typeof issueDeliveryNoteSchema>,
  ): Promise<{ id: string; number: string }> {
    return unwrapOrThrow(
      await this.useCases.issueDeliveryNote({
        customerId: body.customerId,
        lines: body.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          ...(line.unitPrice !== undefined ? { unitPrice: line.unitPrice } : {}),
          ...(line.discountBp !== undefined ? { discountBp: line.discountBp } : {}),
        })),
        notes: body.notes || null,
      }),
    );
  }
}
