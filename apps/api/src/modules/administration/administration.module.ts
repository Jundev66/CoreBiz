import { Module } from '@nestjs/common';
import {
  GetTeamController,
  GetInvitationsController,
  InviteUserController,
  RevokeInvitationController,
  ChangeMemberRoleController,
  RemoveMemberController,
  UpdateTenantSettingsController,
  GetAuditActionsController,
  ExportAuditCsvController,
  GetAuditLogController,
} from './controllers';

@Module({
  controllers: [
    GetTeamController,
    GetInvitationsController,
    InviteUserController,
    RevokeInvitationController,
    ChangeMemberRoleController,
    RemoveMemberController,
    UpdateTenantSettingsController,
    GetAuditActionsController,
    ExportAuditCsvController,
    GetAuditLogController,
  ],
})
export class AdministrationModule {}
