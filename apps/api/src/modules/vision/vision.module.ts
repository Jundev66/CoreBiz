import { Module } from '@nestjs/common';
import { VisionController } from './vision.controller';

@Module({ controllers: [VisionController] })
export class VisionModule {}
