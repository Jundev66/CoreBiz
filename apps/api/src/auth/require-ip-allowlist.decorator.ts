import { SetMetadata } from '@nestjs/common';

export const REQUIRE_IP_ALLOWLIST_KEY = 'corebiz:require-ip-allowlist';

export const RequireIpAllowlist = (required: boolean = true) =>
  SetMetadata(REQUIRE_IP_ALLOWLIST_KEY, required);
