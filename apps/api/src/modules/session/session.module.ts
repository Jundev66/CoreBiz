import { Module } from '@nestjs/common';
import { GetSessionController, DestroyDemoSessionController } from './controllers';

@Module({
  controllers: [DestroyDemoSessionController, GetSessionController],
})
export class SessionModule {}
