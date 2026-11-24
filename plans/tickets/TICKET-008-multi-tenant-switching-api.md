# SDD Specification: TICKET-008 — Multi-Company Tenant Switching & Membership API

## 1. Context & Business Need

Following the domain and port definitions in TICKET-007, users managing multiple legal entities across jurisdictions (`VE` and `US`) require public REST endpoints in `apps/api` to:

1. Discover all companies they belong to, along with their roles and active fiscal countries (`GET /v1/access/tenants`).
2. Switch active operational context to a specific company seamlessly (`POST /v1/access/tenants/switch`), allowing both web dashboards and POS terminals to operate under the selected company's RLS boundary.

## 2. Ubiquitous Language & Core Concepts

- **TenantMembershipSummary**: Lightweight projection containing `tenantId`, `tenantSlug`, `tenantName`, `fiscalCountry`, `currency`, `role`, and `status`.
- **TenantSwitchOutput**: Result of switching context containing the target tenant's identifiers, fiscal jurisdiction, currency, and role capabilities.
- **TenantSwitchInput**: DTO validating the target UUID tenant identifier.

## 3. Architecture & File Structure

```text
packages/contracts/
  src/
    access.ts                           # Zod schemas for tenant listing & switching
packages/application/
  src/
    queries/
      access/
        list-user-tenants.query.ts      # Query handler for user's tenant memberships
apps/api/
  src/
    modules/
      administration/
        controllers/
          list-user-tenants.controller.ts
          switch-tenant.controller.ts
plans/tickets/
  TICKET-008-multi-tenant-switching-api.md
```

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: List Multi-Company Memberships

- **Given** an authenticated user belonging to Tenant A (`VE`, `owner`) and Tenant B (`US`, `viewer`)
- **When** `GET /v1/access/tenants` is invoked with a valid bearer session
- **Then** HTTP 200 OK is returned with a list containing both tenants, their fiscal countries, base currencies, and roles.

### Scenario 2: Switch Active Tenant Successfully

- **Given** an authenticated user with active membership in Tenant B (`US`)
- **When** `POST /v1/access/tenants/switch` is invoked with `{ "targetTenantId": "tenant-b-id" }`
- **Then** HTTP 200 OK is returned with the new active tenant context (`tenantId`, `fiscalCountry: "US"`, `currency: "USD"`, `role: "viewer"`).

### Scenario 3: Reject Unauthorized Tenant Switch

- **Given** an authenticated user who is NOT a member of Tenant C (or membership is suspended)
- **When** `POST /v1/access/tenants/switch` is invoked with `{ "targetTenantId": "tenant-c-id" }`
- **Then** HTTP 403 Forbidden is returned with RFC 7807 problem details.

## 5. Verification Checklist

- [x] Define Zod schemas in `@corebiz/contracts` for tenant listing and switching
- [x] Implement `ListUserTenantsQueryHandler` in `@corebiz/application`
- [x] Implement `ListUserTenantsController` and `SwitchTenantController` in `apps/api`
- [x] Add unit and controller tests with Vitest doubles
- [x] Zero comments policy strictly respected
- [x] `pnpm typecheck`, `pnpm arch`, and `pnpm test:unit` passing 100%
