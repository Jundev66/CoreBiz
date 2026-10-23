import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type z } from 'zod';
import { visionExtractRequestSchema, type VisionExtractResponse } from '@synapse-vision/core';
import type { ReindexVisionEmbeddingsReport } from '@corebiz/application';
import { AssistantThrottleGuard } from '../../auth/assistant-throttle.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../http/api-error';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { USE_CASES } from '../../tokens';
import type { UseCases } from '../../composition/use-cases.provider';

/**
 * Synapse Vision, served by CoreBiz.
 *
 * The path is `v1/vision` and not `v1/ai/...` on purpose: this is a different capability with
 * a different contract (`@synapse-vision/core` owns the request and response shapes), so it
 * gets its own path a third-party view can point at without knowing anything about the
 * assistant.
 *
 * The image travels in the body and is NEVER logged. The tenant is not in the request: it
 * comes from the verified session. Without a provider configured the call still answers —with
 * the demo document— so a production install can show the capability working.
 */
@ApiTags('vision')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/vision')
export class VisionController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post('extract')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AssistantThrottleGuard)
  @RequirePermission('assistant:use')
  @ApiOperation({ summary: 'Leer los datos de una nota de entrega desde una imagen' })
  async extract(
    @Body(new ZodValidationPipe(visionExtractRequestSchema))
    body: z.infer<typeof visionExtractRequestSchema>,
  ): Promise<VisionExtractResponse> {
    // `exactOptionalPropertyTypes`: zod da `filename?: string | undefined`, y el puerto pide
    // `filename?: string`. Se arma sin la propiedad cuando no viene, en lugar de pasar
    // `undefined` explicito.
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
      // Copia a arrays mutables: el contrato Zod declara listas normales y los puertos las
      // devuelven de solo lectura.
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

  /**
   * (Re)construye el indice vectorial del catalogo para la busqueda semantica.
   *
   * Es una operacion de CONFIGURACION —reindexar toca todo el catalogo—, asi que pide
   * `ai:configure` y no `assistant:use`: quien solo puede preguntar al asistente no debe
   * poder lanzar un trabajo que recorre la empresa entera. Si el despliegue no tiene
   * embeddings configurados, responde `AiNotConfigured` (409), no un error tecnico.
   */
  @Post('embeddings/reindex')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ai:configure')
  @ApiOperation({ summary: '(Re)indexar el catalogo para la busqueda semantica' })
  async reindexEmbeddings(): Promise<ReindexVisionEmbeddingsReport> {
    return unwrapOrThrow(await this.useCases.reindexVisionEmbeddings());
  }
}
