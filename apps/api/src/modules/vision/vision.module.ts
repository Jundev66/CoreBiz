import { Module } from '@nestjs/common';
import { ExtractVisionDocumentController, ReindexVisionEmbeddingsController } from './controllers';

@Module({
  controllers: [ExtractVisionDocumentController, ReindexVisionEmbeddingsController],
})
export class VisionModule {}
