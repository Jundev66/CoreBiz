import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { visionExtractRequestSchema, type VisionExtractResponse } from '@synapse-vision/core';
import { AssistantThrottleGuard } from '../../../auth/assistant-throttle.guard';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { ZodValidationPipe } from '../../../http/zod-validation.pipe';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('vision')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/vision')
export class ExtractVisionDocumentController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post('extract')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AssistantThrottleGuard)
  @RequirePermission('assistant:use')
  @ApiOperation({ summary: 'Leer los datos de una nota de entrega desde una imagen' })
  async run(
    @Body(new ZodValidationPipe(visionExtractRequestSchema))
    body: z.infer<typeof visionExtractRequestSchema>,
  ): Promise<VisionExtractResponse> {
    const image =
      body.filename === undefined
        ? { imageBase64: body.imageBase64, mimeType: body.mimeType }
        : { imageBase64: body.imageBase64, mimeType: body.mimeType, filename: body.filename };

    const result = unwrapOrThrow(await this.useCases.extractDeliveryNote(image));

    return {
      mode: result.mode,
      ...(result.cached !== undefined ? { cached: result.cached } : {}),
      ...(result.documentHash !== undefined ? { documentHash: result.documentHash } : {}),
      extraction: result.extraction,
      matches: result.matches.map((row) => row.map((match) => ({ ...match }))),
      ...(result.document === undefined
        ? {}
        : {
            document: {
              filename: result.document.filename,
              mimeType: result.document.mimeType,
              base64: Buffer.from(result.document.bytes).toString('base64'),
            },
          }),
    };
  }
}
