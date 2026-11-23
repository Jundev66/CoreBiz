# ARCH-001: File References, Directory Structure & Route Mappings

## 1. Package File Map

### 1.1. `packages/domain`

- `src/fiscal/value-objects/rif.ts` & `rif.test.ts`
- `src/fiscal/value-objects/ein.ts` & `ein.test.ts`
- `src/fiscal/value-objects/tax-rate.ts` & `tax-rate.test.ts`
- `src/fiscal/port/fiscal-jurisdiction-port.ts`
- `src/accounting/model/account-code.ts` & `account-code.test.ts`
- `src/accounting/model/account-type.ts`
- `src/accounting/model/account.ts` & `account.test.ts`
- `src/accounting/model/journal-entry-line.ts`
- `src/accounting/model/journal-entry.ts` & `journal-entry.test.ts`
- `src/accounting/port/accounting-repository.ts`
- `src/invoicing/model/invoice-id.ts`
- `src/invoicing/model/invoice-status.ts`
- `src/invoicing/model/invoice-type.ts`
- `src/invoicing/model/invoice-line.ts`
- `src/invoicing/model/invoice.ts` & `invoice.test.ts`
- `src/invoicing/port/invoice-repository.ts`

### 1.2. `packages/application`

- `src/accounting/commands/post-journal-entry.command.ts`
- `src/accounting/queries/get-trial-balance.query.ts`
- `src/accounting/queries/get-general-ledger.query.ts`
- `src/invoicing/commands/issue-invoice.command.ts`
- `src/invoicing/commands/apply-invoice-payment.command.ts`
- `src/invoicing/commands/void-invoice.command.ts`

### 1.3. `packages/infrastructure`

- `src/fiscal/adapters/venezuela-fiscal-engine.ts`
- `src/fiscal/adapters/united-states-fiscal-engine.ts`
- `src/accounting/repositories/prisma-account-repository.ts`
- `src/accounting/repositories/prisma-journal-entry-repository.ts`
- `src/invoicing/repositories/prisma-invoice-repository.ts`

### 1.4. `apps/api` (NestJS 11 Controllers)

- `src/modules/accounting/controllers/post-journal-entry.controller.ts`
- `src/modules/accounting/controllers/get-trial-balance.controller.ts`
- `src/modules/invoicing/controllers/issue-invoice.controller.ts`
- `src/modules/invoicing/controllers/apply-payment.controller.ts`
- `src/modules/integrations/controllers/headless-invoice-issue.controller.ts`
