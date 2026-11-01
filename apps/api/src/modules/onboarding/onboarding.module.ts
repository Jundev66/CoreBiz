import { Module } from '@nestjs/common';
import {
  CreateTenantController,
  PreviewInvitationController,
  AcceptInvitationController,
} from './controllers';

@Module({
  controllers: [CreateTenantController, PreviewInvitationController, AcceptInvitationController],
})
export class OnboardingModule {}
