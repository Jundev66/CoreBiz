# SDD Specification: TICKET-006 — External Integrations Headless API

## 1. Context & Business Need

CoreBiz is designed to operate as a financial, fiscal, and accounting core engine for third-party platforms (e-commerce, specialized billing systems, legacy ERPs, mobile POS). These external systems need to record commercial operations, generate invoices, and produce automatic double-entry accounting entries without managing fiscal compliance or accounting balance rules themselves.

The Integrations module must provide:

1. **API Key Authentication**: Machine-to-machine authentication via `x-api-key` bound to a specific tenant and actor role.
2. **Mandatory Idempotency**: `Idempotency-Key` header enforced on all write operations (`POST /v1/integrations/invoices`, `POST /v1/integrations/journal-entries`) to prevent duplicate transactions during network retries.
3. **Atomic Double-Entry Generation**: Commercial events automatically produce balanced journal entries ($\sum \text{Debits} \equiv \sum \text{Credits}$) in the tenant's chart of accounts based on the active fiscal jurisdiction (`VE` or `US`).

## 2. Ubiquitous Language & Core Concepts

- **IntegrationApiKey**: Cryptographically secure token generated per tenant with permissions and expiration dates.
- **IdempotencyKey**: Client-provided UUID or nonce ensuring at-most-once processing semantics.
- **ExternalInvoicePayload**: Simplified invoice payload submitted by external clients containing customer info, lines, and optional fiscal identifiers.
- **BalancedTransaction**: Transaction guarantee where fiscal calculation and accounting journal entry posting execute inside a single atomic Unit of Work.

## 3. Architecture & File Structure

```text
apps/api/
  src/
    modules/
      integrations/
        controllers/
          issue-integration-invoice.controller.ts
          post-integration-journal-entry.controller.ts
        guards/
          api-key.guard.ts
        integrations.module.ts
packages/contracts/
  src/
    integrations/
      integration-invoice.dto.ts
      integration-journal-entry.dto.ts
packages/application/
  src/
    use-cases/
      integrations/
        process-integration-invoice.use-case.ts
plans/tickets/
  TICKET-006-external-integrations-api.md
```

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: Valid External Invoice with Automatic Journal Entry

- **Given** an external system authorized with a valid `x-api-key` for tenant `T` in jurisdiction `'VE'`
- **When** `POST /v1/integrations/invoices` is called with idempotency key and valid invoice items
- **Then** the invoice is issued, tax is computed with `VenezuelaFiscalEngine`, a balanced journal entry is posted to the VEN-NIF chart of accounts, and HTTP 201 Created is returned with invoice and transaction IDs.

### Scenario 2: Idempotent Retried Request

- **Given** an external invoice request already successfully processed with idempotency key `IDEMP-001`
- **When** the external system retries the identical request with `IDEMP-001`
- **Then** no duplicate invoice or journal entry is created, and the previously computed response is returned with HTTP 200/201.

### Scenario 3: Unauthorized or Missing API Key

- **Given** an external request missing `x-api-key` or using a revoked key
- **When** the integrations endpoint is invoked
- **Then** HTTP 401 Unauthorized is returned with RFC 7807 problem details.

## 5. Verification Checklist

- [ ] Create DTO contracts in `@corebiz/contracts` for external integration payloads
- [ ] Implement `ApiKeyGuard` in `apps/api` validating tenant API keys
- [ ] Implement `issue-integration-invoice.controller.ts` with single-responsibility pattern
- [ ] Verify atomic transaction execution producing balanced journal entries
- [ ] Unit and controller tests with Vitest doubles
- [ ] Zero comments policy strictly enforced
- [ ] `pnpm typecheck`, `pnpm arch`, and `pnpm test:unit` passing 100%
