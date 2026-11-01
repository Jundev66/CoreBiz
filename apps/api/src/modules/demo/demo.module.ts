import { Module } from '@nestjs/common';
import { StartDemoSandboxController } from './controllers';

@Module({
  controllers: [StartDemoSandboxController],
})
export class DemoModule {}
