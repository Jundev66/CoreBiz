import { z } from 'zod';
import { currencySchema, recordIdSchema } from './common';

export const tenantRoleSchema = z.enum(['owner', 'admin', 'sales', 'warehouse', 'viewer']);
export const tenantStatusSchema = z.enum(['active', 'invited', 'suspended']);
export const fiscalCountrySchema = z.enum(['VE', 'US']);

export const tenantMembershipSummarySchema = z
  .object({
    tenantId: recordIdSchema,
    tenantSlug: z.string().trim().min(1).max(50),
    tenantName: z.string().trim().min(1).max(120),
    fiscalCountry: fiscalCountrySchema,
    currency: currencySchema,
    role: tenantRoleSchema,
    status: tenantStatusSchema,
  })
  .strict();

export const listUserTenantsResponseSchema = z
  .object({
    tenants: z.array(tenantMembershipSummarySchema),
  })
  .strict();

export const switchTenantInputSchema = z
  .object({
    targetTenantId: recordIdSchema,
  })
  .strict();

export const switchTenantResponseSchema = z
  .object({
    ok: z.literal(true),
    tenantId: recordIdSchema,
    tenantSlug: z.string(),
    fiscalCountry: fiscalCountrySchema,
    currency: currencySchema,
    role: tenantRoleSchema,
  })
  .strict();

export type TenantRoleInput = z.infer<typeof tenantRoleSchema>;
export type TenantStatusInput = z.infer<typeof tenantStatusSchema>;
export type FiscalCountryInput = z.infer<typeof fiscalCountrySchema>;
export type TenantMembershipSummary = z.infer<typeof tenantMembershipSummarySchema>;
export type ListUserTenantsResponse = z.infer<typeof listUserTenantsResponseSchema>;
export type SwitchTenantInput = z.infer<typeof switchTenantInputSchema>;
export type SwitchTenantResponse = z.infer<typeof switchTenantResponseSchema>;
