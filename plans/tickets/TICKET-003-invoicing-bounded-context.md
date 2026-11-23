# SDD Specification: TICKET-003 — Invoicing Bounded Context (`@corebiz/invoicing`)

## 1. Context & Business Need

The invoicing domain is the commercial and accounts receivable core of CoreBiz. In a multi-country, multi-currency, and multi-tenant enterprise system, billing requires strict isolation, deterministic state machines, and seamless integration with fiscal jurisdictions and double-entry accounting.

To prevent architectural bloat and cross-context coupling, the invoicing domain must be extracted into an independent bounded context package (`@corebiz/invoicing`).

This package encapsulates:

- Invoice lifecycle state machine (`DRAFT` -> `ISSUED` -> `PARTIALLY_PAID` -> `PAID` / `VOID`).
- Multi-currency financial amounts (`Money` with `bigint` minor units) and line items (`Quantity` with scale 4).
- Dual-country fiscal control metadata (Venezuela: control number `00-xxxxxx`, fiscal printer serial; US: exemption certificate number, PO number).
- Application use cases: `IssueInvoiceCommandHandler` and `ApplyInvoicePaymentCommandHandler`.
- Automatic synchronization with `@corebiz/accounting` for balanced double-entry posting ($\sum \text{Debits} \equiv \sum \text{Credits}$) on invoice issuance and payment reception.
- Strict subpath exports (`.`, `./domain`, `./application`, `./infrastructure`).

## 2. Ubiquitous Language & Core Concepts

- **Invoice**: Aggregate Root managing commercial billing state, total amounts, paid amounts, remaining balances, and line items.
- **InvoiceLine**: Entity representing a billed product or service, linking `Quantity`, unit price `Money`, `TaxRate` (basis points), and resulting subtotal and tax amounts.
- **FiscalControlData**: Value Object containing jurisdiction-specific fiscal issuance metadata (Venezuela: `controlNumber`, `machineFiscalSerial`; United States: `taxExemptionCertificate`, `jurisdictionStateCode`).
- **InvoiceStatus**: `DRAFT` | `ISSUED` | `PARTIALLY_PAID` | `PAID` | `VOID`.
- **InvoiceType**: `STANDARD` | `CREDIT_NOTE` | `DEBIT_NOTE` | `EXPORT`.
- **IssueInvoiceCommand**: Application command that computes line subtotals and taxes, builds the `Invoice` aggregate, validates currency coherence, saves the invoice, and automatically posts the balanced accounts receivable journal entry:
  - $\text{Debit Accounts Receivable} = \text{Invoice Total}$
  - $\text{Credit Sales Revenue} = \text{Invoice Subtotal}$
  - $\text{Credit Tax Payable} = \text{Invoice Tax Total}$
- **ApplyInvoicePaymentCommand**: Application command that applies a payment to an open invoice, enforces balance invariants, transitions status (`PARTIALLY_PAID` or `PAID`), and automatically posts the balanced collection journal entry:
  - $\text{Debit Cash / Bank} = \text{Payment Amount}$
  - $\text{Credit Accounts Receivable} = \text{Payment Amount}$
- **InvoiceRepository**: Primary port interface (`findById`, `findByNumber`, `listByCustomer`, `save`).

## 3. Package Structure (Single Package with Subpath Exports)

```text
packages/invoicing/
  package.json              # exports: ., ./domain, ./application, ./infrastructure
  tsconfig.json             # extends ../../tsconfig.base.json
  src/
    index.ts                # re-exports domain, application, and infrastructure
    domain/
      index.ts
      model/
        invoice-status.ts
        invoice-type.ts
        invoice-line.ts
        fiscal-control-data.ts
        invoice.ts
      port/
        invoice-repository.ts
    application/
      index.ts
      commands/
        issue-invoice.command.ts
        apply-invoice-payment.command.ts
    infrastructure/
      index.ts
      prisma/
        prisma-invoice-repository.ts
      memory/
        in-memory-invoice-repository.ts
  tests/
    invoice.test.ts
    issue-invoice.test.ts
    apply-invoice-payment.test.ts
    prisma-invoice-repository.test.ts
    mothers/
      InvoiceMother.ts
      InvoiceLineMother.ts
```

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: Invoice Issuance with Automatic Balanced Journal Entry

- **Given** an issuance command with valid lines, currency `USD`, and valid receivable/revenue/tax accounts
- **When** `IssueInvoiceCommandHandler.execute` is invoked
- **Then** the invoice is created with status `ISSUED`, total calculated with line taxes, and a balanced double-entry journal entry is posted where $\text{Debits} \equiv \text{Credits}$.

### Scenario 2: Partial and Full Payment State Transitions

- **Given** an issued invoice of $1,000.00 USD with remaining balance $1,000.00 USD
- **When** a partial payment of $400.00 USD is applied via `ApplyInvoicePaymentCommandHandler`
- **Then** remaining balance becomes $600.00 USD and status transitions to `PARTIALLY_PAID`.
- **When** a second payment of $600.00 USD is applied
- **Then** remaining balance becomes $0.00 USD and status transitions to `PAID`.

### Scenario 3: Overpayment Invariant Protection

- **Given** an issued invoice with remaining balance of $250.00 USD
- **When** an attempted payment of $300.00 USD is applied
- **Then** it returns an `Err(PaymentExceedsRemainingBalance)` with remaining balance 25000 and attempted payment 30000 minor units.

### Scenario 4: Currency Mismatch Guard

- **Given** an invoice denominated in `USD`
- **When** an attempted payment is submitted in `VES`
- **Then** it returns an `Err(InvoiceCurrencyMismatch)`.

### Scenario 5: Voiding Restrictions on Settled Invoices

- **Given** an invoice with `paidAmount > 0`
- **When** `void()` is called
- **Then** it returns an `Err(CannotVoidPaidInvoice)`.

### Scenario 6: Architectural Boundary & Subpath Exports

- **Given** `@corebiz/invoicing`
- **Then** `./domain` depends ONLY on `@corebiz/shared-kernel` and `@corebiz/fiscal`, `./application` depends on `./domain` and `@corebiz/accounting`, and `./infrastructure` implements ports without leaky abstractions.
- **Given** `.dependency-cruiser.cjs`
- **Then** running `pnpm arch` reports 0 violations.

## 5. Verification Checklist

- [x] `packages/invoicing` scaffolded via `pnpm new:context invoicing`
- [x] Domain models (`Invoice`, `InvoiceLine`, `FiscalControlData`, `InvoiceStatus`, `InvoiceType`) and repository port implemented in `packages/invoicing/src/domain/`
- [x] Application command handlers (`IssueInvoice`, `ApplyInvoicePayment`) implemented in `packages/invoicing/src/application/`
- [x] Infrastructure Prisma and in-memory repositories implemented in `packages/invoicing/src/infrastructure/`
- [x] Subpath exports configured in `packages/invoicing/package.json`
- [x] Existing domain/application/infrastructure references updated with re-exports for backwards compatibility
- [x] Comprehensive test suite with Object Mothers in `packages/invoicing/tests/`
- [x] Zero comments in all source and test files
- [x] `pnpm typecheck`, `pnpm arch`, and `pnpm test:unit` passing 100%
