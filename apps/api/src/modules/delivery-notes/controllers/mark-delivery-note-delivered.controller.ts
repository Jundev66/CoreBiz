import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { markDeliveredSchema } from '@corebiz/contracts';
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
export class MarkDeliveryNoteDeliveredController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post(':id/deliver')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('delivery_note:deliver')
  @ApiOperation({ summary: 'Confirmar que el cliente recibio la mercancia' })
  async run(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(markDeliveredSchema))
    body: z.infer<typeof markDeliveredSchema>,
  ): Promise<unknown> {
    return unwrapOrThrow(
      await this.useCases.markDelivered({
        deliveryNoteId: id,
        receivedBy: body.receivedBy || null,
      }),
    );
  }
}
