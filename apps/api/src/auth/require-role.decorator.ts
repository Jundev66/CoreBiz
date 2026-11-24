import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import type { Role } from '@corebiz/domain';

export const REQUIRED_ROLES = 'corebiz:required-roles';

export const Roles = (...roles: readonly Role[]): CustomDecorator<string> =>
  SetMetadata(REQUIRED_ROLES, roles);
