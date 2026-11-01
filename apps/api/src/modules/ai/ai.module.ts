import { Module } from '@nestjs/common';
import {
  GetAiSettingsController,
  ListAiModelsController,
  SaveAiSettingsController,
  RemoveAiSettingsController,
  GetAssistantStatusController,
  ChatAssistantController,
} from './controllers';

@Module({
  controllers: [
    GetAiSettingsController,
    ListAiModelsController,
    SaveAiSettingsController,
    RemoveAiSettingsController,
    GetAssistantStatusController,
    ChatAssistantController,
  ],
})
export class AiModule {}
