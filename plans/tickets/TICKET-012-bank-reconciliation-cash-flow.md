# SDD Specification: TICKET-012 — Bank Reconciliation & Cash Flow Engine

## 1. Context & Business Need

Enterprises process dozens or hundreds of cash and bank movements daily (POS deposits, electronic wire transfers, credit card settlements, vendor checks, and supplier payments). Without systematic bank reconciliation, financial statements drift from cash reality, leading to unnoticed bank commissions, bounced transactions, or duplicate postings.

CoreBiz requires a **Bank Reconciliation Engine** in `@corebiz/accounting` that:

1. Imports external bank statements (CSV / OFX / JSON).
2. Performs automated matching against posted General Ledger movements for the designated cash/bank account (`1.1.01` in VEN-NIF / `1010` in US GAAP).
3. Flags transit deposits and unpresented checks.
4. Generates direct, balanced double-entry adjustments for bank maintenance fees or interest revenues ($\sum \text{Debits} \equiv \sum \text{Credits}$).

## 2. Ubiquitous Language & Core Concepts

- **BankStatement**: Statement issued by a financial institution for a specific bank account covering a defined date window.
- **BankStatementLine**: Single bank movement showing transaction date, bank reference, description, debit/credit amount, and balance.
- **ReconciliationMatch**: Pair linking a `BankStatementLine` to a corresponding `JournalEntryLine` in the General Ledger.
- **UnreconciledDifference**: Difference between the ending bank statement balance and the book cash balance, decomposed into transit items and unrecorded bank adjustments.

## 3. Architecture & File Structure

```text
packages/accounting/
  src/
    domain/
      model/
        bank-statement.ts                # Bank statement aggregate
        bank-statement-line.ts           # Statement line value object
        reconciliation-match.ts          # Match entity
      port/
        bank-statement-repository.ts
    application/
      commands/
        import-bank-statement.command.ts
        match-reconciliation.command.ts
        record-bank-adjustment.command.ts
      queries/
        get-reconciliation-status.query.ts
packages/contracts/
  src/
    reconciliation.ts                    # DTOs and validation schemas
apps/api/
  src/
    modules/
      accounting/
        controllers/
          import-bank-statement.controller.ts
          match-reconciliation.controller.ts
          get-reconciliation-status.controller.ts
apps/web/
  app/(app)/
    accounting/
      reconciliation/
        page.tsx                         # Bank reconciliation dashboard
```

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: Automated Transaction Matching

- **Given** an imported bank statement with credit line $500.00 (Ref #98765) and a recorded payment journal entry of $500.00
- **When** executing `match-reconciliation`
- **Then** the statement line and journal entry line are marked as `RECONCILED` with zero variance.

### Scenario 2: Unrecorded Bank Commission Auto-Adjustment

- **Given** an unrecorded bank debit of $15.00 for monthly account maintenance fees
- **When** the accountant triggers `record-bank-adjustment`
- **Then** a balanced journal entry is automatically posted:
  - Debit: Operating Expense (Bank Fees) for $15.00
  - Credit: Bank Account for $15.00
  - The statement line transitions to `RECONCILED`.

## 5. Verification Checklist

- [x] Implement `BankStatement` and `BankStatementLine` domain models in `@corebiz/accounting`
- [x] Implement `ImportBankStatementCommandHandler` and `MatchReconciliationCommandHandler`
- [x] Enforce double-entry invariants on bank adjustment postings
- [x] Expose REST controllers in `apps/api`
- [x] Implement web reconciliation dashboard in Next.js 16
- [x] Zero comments policy strictly respected
- [x] `pnpm typecheck`, `pnpm arch`, and `pnpm test:unit` passing 100%
