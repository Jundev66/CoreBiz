# SDD Specification: TICKET-002 — Accounting Bounded Context (`@corebiz/accounting`)

## 1. Context & Business Need

Double-entry accounting is the financial bedrock of CoreBiz. To ensure modularity, auditability, and clean boundaries across multi-company and multi-currency operations, the accounting logic must be extracted into an independent bounded context package (`@corebiz/accounting`).

This package must encapsulate the fundamental accounting invariant ($\sum \text{Debits} \equiv \sum \text{Credits}$), multi-tenant isolation, chart of accounts hierarchy supporting multi-country standards (Venezuelan FCCPV vs US GAAP), and strict subpath exports (`./domain`, `./application`, `./infrastructure`).

## 2. Ubiquitous Language & Core Concepts

- **Double-Entry Invariant**: Every journal entry must have total debits exactly equal to total credits ($\sum D = \sum C$). Entries failing this condition cannot be constructed.
- **AccountCode**: Value Object representing hierarchical decimal dot notation (e.g. `1`, `1.1`, `1.1.01`, `1.1.01.001`). Provides level depth and parent code derivation. Compatible with multi-country charts of accounts.
- **AccountCategory**: Core classifications: `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `COGS`, `EXPENSE`.
- **Normal Balance Side**:
  - `DEBIT`: ASSET, COGS, EXPENSE.
  - `CREDIT`: LIABILITY, EQUITY, REVENUE.
- **Account**: Entity representing a general ledger account scoped to a specific `tenantId`.
- **JournalEntryLine**: Value Object capturing debit and credit `Money` amounts for an account. Must have strictly one side positive (debit > 0 and credit == 0, or credit > 0 and debit == 0).
- **JournalEntry**: Aggregate Root representing a balanced transaction on a given date with an autoincrementing `entryNumber` per tenant.
- **TrialBalance**: Query aggregating all debit and credit movements per account in a specified date range and currency, verifying ledger balance.

## 3. Package Structure (Single Package with Subpath Exports)

```text
packages/accounting/
  package.json              # exports: ., ./domain, ./application, ./infrastructure
  tsconfig.json             # extends ../../tsconfig.base.json
  src/
    index.ts                # re-exports domain, application, and infrastructure
    domain/
      index.ts
      model/
        account-code.ts
        account-type.ts
        account.ts
        journal-entry-line.ts
        journal-entry.ts
      port/
        accounting-repository.ts
    application/
      index.ts
      commands/
        post-journal-entry.command.ts
      queries/
        get-trial-balance.query.ts
    infrastructure/
      index.ts
      prisma/
        prisma-account-repository.ts
        prisma-journal-entry-repository.ts
      memory/
        in-memory-account-repository.ts
        in-memory-journal-entry-repository.ts
  tests/
    account-code.test.ts
    journal-entry.test.ts
    post-journal-entry.test.ts
    get-trial-balance.test.ts
    mothers/
      AccountCodeMother.ts
      AccountMother.ts
      JournalEntryMother.ts
```

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: Unbalanced Journal Entry Rejection

- **Given** a journal entry creation request with Debit of $100.00 USD and Credit of $90.00 USD
- **When** `JournalEntry.create` is invoked
- **Then** it returns an `Err(UnbalancedJournalEntry)` containing discrepancy of $10.00 USD (1000 minor units).

### Scenario 2: Multi-Currency Journal Line Guard

- **Given** a journal entry line with Debit in `USD` and Credit in `VES`
- **When** `JournalEntryLine.create` is invoked
- **Then** it returns an `Err(JournalLineCurrencyMismatch)`.

### Scenario 3: Hierarchical Account Code Navigation

- **Given** an account code `1.1.01.002`
- **When** `parentCode()` is called
- **Then** it returns `1.1.01`, and `level()` returns 4.

### Scenario 4: Post Journal Entry Application Command

- **Given** valid active accounts and a balanced debit/credit input payload
- **When** `PostJournalEntryCommandHandler.execute` is called
- **Then** it persists the entry with the next sequential tenant entry number and returns `Ok({ entryId, entryNumber })`.

### Scenario 5: Trial Balance Query Execution

- **Given** journal entries posted in a period for currency `USD`
- **When** `GetTrialBalanceQueryHandler.execute` is called
- **Then** total debits match total credits, and `isBalanced` is `true`.

### Scenario 6: Architectural Boundary & Subpath Exports

- **Given** `@corebiz/accounting`
- **Then** `./domain` depends ONLY on `@corebiz/shared-kernel`, `./application` depends on `./domain`, and `./infrastructure` implements ports without leaky abstractions.
- **Given** `.dependency-cruiser.cjs`
- **Then** running `pnpm arch` reports 0 violations.

## 5. Verification Checklist

- [x] `packages/accounting` scaffolded via `pnpm new:context accounting`
- [x] Domain models and ports migrated to `packages/accounting/src/domain/`
- [x] Application command & query handlers migrated to `packages/accounting/src/application/`
- [x] Infrastructure Prisma and in-memory repositories migrated to `packages/accounting/src/infrastructure/`
- [x] Subpath exports configured in `packages/accounting/package.json`
- [x] Existing domain/application/infrastructure references updated with re-exports for backwards compatibility
- [x] Test suite with Object Mothers in `packages/accounting/tests/`
- [x] Zero comments in all source and test files
- [x] `pnpm typecheck`, `pnpm arch`, and `pnpm test:unit` passing 100%
