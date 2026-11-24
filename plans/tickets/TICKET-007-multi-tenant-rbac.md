# SDD Specification: TICKET-007 — Multi-Company & Multi-User RBAC Engine

## 1. Context & Business Need

In real-world business scenarios, a single user often manages multiple businesses (e.g., a holding company with distinct fiscal entities, a franchise operator, or an external accountant). Simultaneously, each business requires granular access delegation among team members (sales clerks, warehouse operators, accountants, administrators).

To satisfy this requirement with uncompromising security:

1. **N:M User-Company Membership**: Users (`users`) can be members of multiple tenants (`tenants`) via `memberships` records.
2. **PostgreSQL RLS Enforcement**: Every query strictly enforces `tenant_id = current_setting('app.current_tenant_id')` to prevent cross-company data leakage.
3. **Role-Based Access Control (RBAC)**:
   - `owner`: Subscription management, company settings, ownership transfer, full deletion.
   - `admin`: User invitations, chart of accounts management, fiscal strategy settings, audit log reviews.
   - `sales`: POS sales, quotes, invoices, payments, customer directory.
   - `warehouse`: Inventory dispatch, goods reception, stock counts and adjustments.
   - `viewer`: Read-only reporting, ledger, and trial balance viewing.

## 2. Ubiquitous Language & Core Concepts

- **Membership**: Associative entity linking a User to a Tenant with an assigned Role and status (`active` | `invited` | `suspended`).
- **TenantContext**: Contextual object injected per request containing `tenantId`, `userId`, `role`, and `fiscalCountry`.
- **RoleHierarchy**: Permission matrix determining authorized action paths across bounded contexts.
- **TenantSwitching**: Ability for an authenticated user to switch active tenant context seamlessly, issuing a new scoped JWT or session token.

## 3. Architecture & File Structure

```text
packages/domain/
  src/
    access/
      role.ts                 # Role value object & permission matrix
      membership.ts           # Membership aggregate
packages/application/
  src/
    ports/
      tenant-membership.port.ts
    use-cases/
      access/
        invite-user.use-case.ts
        change-member-role.use-case.ts
        switch-active-tenant.use-case.ts
apps/api/
  src/
    auth/
      roles.guard.ts
      tenant-context.guard.ts
plans/tickets/
  TICKET-007-multi-tenant-rbac.md
```

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: Multi-Company Membership Listing

- **Given** an authenticated user who is `owner` of Company A (`VE`) and `viewer` of Company B (`US`)
- **When** the user queries their available tenants
- **Then** both companies are returned with their respective roles, currencies, and fiscal jurisdictions.

### Scenario 2: Role Authorization Enforcement

- **Given** a user with role `sales` in Tenant `T`
- **When** the user attempts to execute an admin command (e.g., modifying the chart of accounts or inviting users)
- **Then** the request is rejected with HTTP 403 Forbidden.

### Scenario 3: Cross-Tenant Data Isolation (PostgreSQL RLS)

- **Given** active session for Tenant A
- **When** any query executes against invoices, customers, or ledger tables
- **Then** only records matching `tenant_id = 'A'` are visible, and any attempt to access Tenant B's data directly returns 0 results or throws an RLS violation.

## 5. Verification Checklist

- [x] Define RBAC permission matrix in `@corebiz/domain`
- [x] Implement `RolesGuard` and `TenantContextGuard` in `apps/api`
- [x] Provide test suite for role authorization and multi-company switching
- [x] Zero comments policy strictly respected
- [x] `pnpm typecheck`, `pnpm arch`, and `pnpm test:unit` passing 100%
