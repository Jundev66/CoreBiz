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
import { voidDeliveryNoteSchema } from '@corebiz/contracts';
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
export class VoidDeliveryNoteController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('delivery_note:void')
  @ApiOperation({ summary: 'Anular una nota emitida, devolviendo el inventario' })
  async run(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(voidDeliveryNoteSchema))
    body: z.infer<typeof voidDeliveryNoteSchema>,
  ): Promise<unknown> {
    return unwrapOrThrow(
      await this.useCases.voidDeliveryNote({ deliveryNoteId: id, reason: body.reason }),
    );
  }
}
