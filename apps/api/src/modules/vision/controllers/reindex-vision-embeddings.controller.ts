import { Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ReindexVisionEmbeddingsReport } from '@corebiz/application';
import { PermissionsGuard } from '../../../auth/permissions.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { unwrapOrThrow } from '../../../http/api-error';
import { USE_CASES } from '../../../tokens';
import type { UseCases } from '../../../composition/use-cases.provider';

@ApiTags('vision')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('v1/vision')
export class ReindexVisionEmbeddingsController {
  constructor(@Inject(USE_CASES) private readonly useCases: UseCases) {}

  @Post('embeddings/reindex')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ai:configure')
  @ApiOperation({ summary: '(Re)indexar el catalogo para la busqueda semantica' })
  async run(): Promise<ReindexVisionEmbeddingsReport> {
    return unwrapOrThrow(await this.useCases.reindexVisionEmbeddings());
  }
}
