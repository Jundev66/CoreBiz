import { Module } from '@nestjs/common';
import { AiSettingsController, AssistantController } from './ai.controller';

@Module({ controllers: [AiSettingsController, AssistantController] })
export class AiModule {}
