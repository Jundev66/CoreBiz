import { Module } from '@nestjs/common';
import { PosController } from './pos.controller';

@Module({
  controllers: [PosController],
})
export class PosModule {}
