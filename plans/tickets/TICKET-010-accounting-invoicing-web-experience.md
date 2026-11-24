# SDD Specification: TICKET-010 — Accounting & Invoicing Web Experience & Query Endpoints

## 1. Context & Business Need

With the domain, application, and fiscal engines in place for multi-country accounting and invoicing, end-users, accountants, and finance managers need direct, intuitive visibility into financial records in the CoreBiz web application (`apps/web`):

1. **Chart of Accounts (Plan de Cuentas)**: Real-time visual tree of accounts grouped by Category (Assets, Liabilities, Equity, Revenue, COGS, Expenses), dynamically adapted to the tenant's fiscal jurisdiction (VEN-NIF for Venezuela, US GAAP for United States).
2. **Trial Balance (Balance de Comprobación)**: Financial statement verifying the fundamental invariant $\sum \text{Debits} \equiv \sum \text{Credits}$ across all active accounts with net balances.
3. **General Ledger (Libro Diario / Asientos Contables)**: Chronological journal entries showing multi-line debits and credits generated from invoices, payments, and manual entries.
4. **Fiscal Invoicing (Facturación)**: Searchable list of issued invoices with official fiscal identifiers (SENIAT Control/Factura or US Invoice ID), currency totals, tax breakdowns, and real-time payment status.

## 2. Ubiquitous Language & Core Concepts

- **ChartOfAccountsTree**: Grouped collection of GL accounts categorized into standard financial buckets (ASSET, LIABILITY, EQUITY, REVENUE, COGS, EXPENSE).
- **TrialBalanceSummary**: Real-time aggregation of all debit and credit movements validating double-entry balance.
- **JournalEntryRecord**: Immutable double-entry financial transaction tied to an originating source document (INVOICE, PAYMENT, MANUAL).
- **FiscalInvoiceSummary**: Customer billing record showing statutory fiscal control numbers, tax basis points, and settled vs outstanding balances.

## 3. Architecture & File Structure

```text
packages/accounting/
  src/
    application/
      queries/
        list-accounts.query.ts
        list-journal-entries.query.ts
packages/invoicing/
  src/
    domain/
      port/
        invoice-repository.ts            # Add listByTenant()
    infrastructure/
      memory/
        in-memory-invoice-repository.ts  # Implement listByTenant()
      prisma/
        prisma-invoice-repository.ts     # Implement listByTenant()
    application/
      queries/
        list-invoices.query.ts
packages/contracts/
  src/
    accounting.ts                        # Schemas for accounts & journal entries query
    invoicing.ts                         # Schemas for invoice listing query
apps/api/
  src/
    modules/
      accounting/
        controllers/
          list-accounts.controller.ts
          list-journal-entries.controller.ts
      invoicing/
        controllers/
          list-invoices.controller.ts
apps/web/
  src/
    api/
      accounting.ts                      # Client queries
      invoicing.ts                       # Client queries
    auth/
      module-access.ts                   # Permission map for /accounting & /invoicing
    ui/
      shell.tsx                          # Add sidebar items for Contabilidad & Facturas
      sidebar-nav.tsx                    # Add accounting icon mappings if needed
  app/(app)/
    accounting/
      page.tsx                           # Chart of accounts
      trial-balance/
        page.tsx                         # Trial balance report
      journal-entries/
        page.tsx                         # General ledger entries
    invoicing/
      page.tsx                           # Invoices management table
```

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: Chart of Accounts Discovery

- **Given** an authenticated user in a Venezuelan or US company
- **When** navigating to `/accounting` or querying `GET /v1/accounting/accounts`
- **Then** the accounts are returned ordered by code, with standard templates provided automatically if no custom accounts were persisted yet.

### Scenario 2: Trial Balance Mathematical Balance Check

- **Given** posted transactions with debits and credits
- **When** requesting `GET /v1/accounting/trial-balance`
- **Then** total debits strictly match total credits (`isBalanced === true`).

### Scenario 3: Invoicing Fiscal Registry

- **Given** invoices issued via POS or Integrations API
- **When** opening `/invoicing` or calling `GET /v1/invoicing/invoices`
- **Then** all invoices for the tenant are listed with document numbers, control numbers, customer ID, subtotal, taxes, and status.

## 5. Verification Checklist

- [x] Implement `ListAccountsQueryHandler` in `@corebiz/accounting`
- [x] Implement `ListJournalEntriesQueryHandler` in `@corebiz/accounting`
- [x] Add `listByTenant` to `InvoiceRepository` and implementations in `@corebiz/invoicing`
- [x] Implement `ListInvoicesQueryHandler` in `@corebiz/invoicing`
- [x] Expose REST controllers in `apps/api` (`ListAccountsController`, `ListJournalEntriesController`, `ListInvoicesController`)
- [x] Add contracts in `@corebiz/contracts`
- [x] Implement web pages in `apps/web/app/(app)/accounting/` and `apps/web/app/(app)/invoicing/`
- [x] Update sidebar navigation and permission maps in `apps/web`
- [x] Zero comments policy strictly respected
- [x] `pnpm typecheck`, `pnpm arch`, and `pnpm test:unit` passing 100%
