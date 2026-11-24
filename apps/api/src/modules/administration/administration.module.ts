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
  ListUserTenantsController,
  SwitchTenantController,
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
    ListUserTenantsController,
    SwitchTenantController,
  ],
})
export class AdministrationModule {}
