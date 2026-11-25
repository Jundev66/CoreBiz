# SDD Specification: TICKET-023 — Accounts Receivable & Accounts Payable Aging Analysis Engine

**Status**: `COMPLETED`  
**Scope**: `packages/accounting`, `packages/invoicing`, `packages/contracts`, `apps/api`, `apps/web`

---

## 1. Context & Business Need

In commercial B2B operations and businesses granting trade credit to clients or receiving payment terms from suppliers (e.g. Net 15, Net 30, Net 60), tracking total open balances alone is insufficient for sound treasury management:

1. **Working Capital & Cash Flow Forecasting**:
   - The chief financial officer (CFO) and credit manager must foresee incoming cash week-by-week to meet operational expenses, payroll, and debt maturities.
2. **Credit Risk & Delinquency (Morosidad)**:
   - Invoices overdue by 90+ days carry severe default risk. Early alerts prevent extending further credit to delinquent customers.
3. **Statutory Bad Debt Allowance (Provisión de Cuentas Incobrables)**:
   - Under international standards (IFRS 9 / VEN-NIF / US GAAP), enterprises must calculate Expected Credit Loss (ECL) based on aging maturity buckets.

---

## 2. Ubiquitous Language & Core Concepts

- **AgingBucket**: Defined time interval classifying unpaid receivables or payables by days past maturity:
  - `CURRENT`: Not yet due ($dueDate \ge today$).
  - `DAYS_1_30`: 1 to 30 days past due.
  - `DAYS_31_60`: 31 to 60 days past due.
  - `DAYS_61_90`: 61 to 90 days past due.
  - `DAYS_90_PLUS`: More than 90 days delinquent.
- **AgingReport**: Consolidated projection grouping outstanding balances by partner (customer or supplier):
  - `entityId`: CustomerId or SupplierId.
  - `entityName`: Customer or Supplier legal name.
  - `taxId`: RIF or EIN.
  - `totalOpenBalance`: Sum of all unpaid document balances.
  - `currentAmount`: Unexpired balance.
  - `days1To30`: Balance 1-30 days overdue.
  - `days31To60`: Balance 31-60 days overdue.
  - `days61To90`: Balance 61-90 days overdue.
  - `days90Plus`: Balance >90 days overdue.
- **AgingDirection**:
  - `RECEIVABLE`: Accounts Receivable (Cuentas por Cobrar `1.1.02` / `1200`).
  - `PAYABLE`: Accounts Payable (Cuentas por Pagar `2.1.01` / `2000`).

---

## 3. Architecture & File Structure

```text
packages/accounting/
  src/
    application/
      queries/
        get-ar-aging-report.query.ts     # Accounts receivable aging calculator
        get-ap-aging-report.query.ts     # Accounts payable aging calculator
packages/contracts/
  src/
    aging.ts                             # Zod schemas & AgingReport DTOs
apps/api/
  src/
    modules/
      accounting/
        controllers/
          get-ar-aging.controller.ts
          get-ap-aging.controller.ts
apps/web/
  src/
    app/(app)/
      accounting/
        aging/
          page.tsx                       # Accounts Receivable & Payable Aging dashboard
```

---

## 4. Invariants & Mathematical Formulation

1. **Bucket Conservation Invariant**: For every customer or supplier record:
   $$\text{totalOpenBalance} \equiv \text{currentAmount} + \text{days1To30} + \text{days31To60} + \text{days61To90} + \text{days90Plus}$$
2. **General Ledger Reconciliation Invariant**: At any reconciliation date $T$:
   - The sum of all customer aging balances must equal the balance of Account `1.1.02` (Cuentas por Cobrar Clientes) in the Trial Balance.
   - The sum of all supplier aging balances must equal the balance of Account `2.1.01` (Cuentas por Pagar Comerciales) in the Trial Balance.

---

## 5. Acceptance Criteria (Given / When / Then)

### Scenario 1: Correct Categorization Across Aging Buckets

- **Given**: Customer "Cliente Mayorista 01" has three unpaid invoices on 2026-11-24:
  - Inv 1: Due on 2026-11-30 ($100.00, not overdue).
  - Inv 2: Due on 2026-11-10 ($200.00, 14 days overdue).
  - Inv 3: Due on 2026-09-01 ($300.00, 84 days overdue).
- **When**: The accountant requests the Accounts Receivable Aging Report as of 2026-11-24.
- **Then**: Total open balance is $600.00.
- **And**: `currentAmount` is $100.00.
- **And**: `days1To30` is $200.00.
- **And**: `days61To90` is $300.00.
- **And**: `days31To60` and `days90Plus` are $0.00.

---

## 6. Quality Gates & Test Plan

1. **Boundary & Date Tests**: Vitest tests simulating edge leap years, end-of-month dates, and negative day offsets.
2. **Reconciliation Test**: Verify that the sum of the aging query strictly matches the Trial Balance Accounts Receivable line.
3. **Playwright E2E**: Test UI rendering of the Aging table with drill-down filters by bucket and export.
