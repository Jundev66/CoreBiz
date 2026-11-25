# QA Specification & Adversarial Runbook: TICKET-023 (Accounts Receivable & Accounts Payable Aging Analysis)

## 1. Business Model Context

In commercial and B2B trade where payment terms are extended (Net 15, Net 30, Net 60), total open balance alone does not reflect cash flow health or default risk. Invoices overdue beyond 30, 60, or 90 days represent severe default and bad-debt risk under IFRS 9 / VEN-NIF / US GAAP, while current receivables fund near-term working capital.

TICKET-023 delivers the dual **Accounts Receivable (AR) & Accounts Payable (AP) Aging Analysis Engine**:

- Buckets: `CURRENT` ($dueDate \ge asOf$), `DAYS_1_30` (1-30 days overdue), `DAYS_31_60` (31-60 days overdue), `DAYS_61_90` (61-90 days overdue), `DAYS_90_PLUS` (>90 days overdue).
- Direction:
  - `RECEIVABLE`: Tracks outstanding customer invoice balances (linked to GL Account `1.1.02` Cuentas por Cobrar).
  - `PAYABLE`: Tracks outstanding supplier bill balances (linked to GL Account `2.1.01` Cuentas por Pagar Comerciales).
- Mathematical Invariant:
  $$\text{totalOpenBalance} \equiv \text{current} + \text{days1To30} + \text{days31To60} + \text{days61To90} + \text{days90Plus}$$
  strictly holds for every entity and for the grand totals.

---

## 2. What Was Built & Architectural Rationale

1. **Contracts (`@corebiz/contracts`)**:
   - `aging.ts`: Defined `agingBucketSchema`, `agingDirectionSchema`, `agingDocumentItemSchema`, `partnerAgingSummarySchema`, `agingReportResponseSchema`, `getArAgingQuerySchema`, and `getApAgingQuerySchema`.
2. **Domain Layer & Hexagonal Ports (`@corebiz/accounting`)**:
   - Ports: `ReceivableInvoicesPort` and `PayableBillsPort` decoupling accounting query handlers from concrete invoicing/purchasing tables and preventing circular package dependencies.
   - Exact calendar date normalization (`normalizeToDateOnly`, `computeDaysOverdue`, `determineAgingBucket`).
3. **Application Query Handlers (`@corebiz/accounting`)**:
   - `GetArAgingReportQueryHandler`: Aggregates customer invoices, groups by customer, partitions into aging buckets, sorts by total open balance descending.
   - `GetApAgingReportQueryHandler`: Aggregates supplier bills, partitions into aging buckets, sorts by total open balance descending.
4. **Application Adapters (`@corebiz/application`)**:
   - `InvoicingReceivableInvoicesAdapter`: Implements `ReceivableInvoicesPort` by pulling open, non-voided invoices with remaining balances from `InvoiceRepository`.
5. **API Controllers (`apps/api`)**:
   - `GET /v1/accounting/aging/ar`: Exposes AR Aging report with optional `asOfDate`, `customerId`, and `currency` filters. Requires `accounting:read`.
   - `GET /v1/accounting/aging/ap`: Exposes AP Aging report with optional `asOfDate`, `supplierId`, and `currency` filters. Requires `accounting:read`.

---

## 3. Blast Radius & Downstream Integrations

- **General Ledger Reconciliation**: The grand sum of `totalOpenMinor` in AR Aging reconciles with Account `1.1.02` in `get-trial-balance.query`.
- **Invoicing Context**: Uses active invoices from `packages/invoicing`; automatically excludes voided or fully paid invoices.
- **Treasury & Credit Controls**: Feeds credit limit validation and cash flow forecasting.

---

## 4. Client Acceptance Criteria Checklist

- [x] Invoices with due dates on or after `asOfDate` fall into `CURRENT`.
- [x] Invoices with 1-30 days overdue fall into `DAYS_1_30`.
- [x] Invoices with 31-60 days overdue fall into `DAYS_31_60`.
- [x] Invoices with 61-90 days overdue fall into `DAYS_61_90`.
- [x] Invoices with >90 days overdue fall into `DAYS_90_PLUS`.
- [x] Bucket Conservation Invariant holds: sum of buckets equals `totalOpenMinor` across every partner and grand total.
- [x] Fully paid (`remainingBalance == 0`) and voided (`status == 'VOID'`) invoices are omitted.
- [x] AP Aging calculates supplier payables across the same standard bucket structure.
- [x] Results sort by total open balance descending.

---

## 5. Adversarial 4-Tier Test Matrix

| Tier                                | Test Objective                             | Attack / Verification Vector                                                                                     | Expected Result                                                                           |
| :---------------------------------- | :----------------------------------------- | :--------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------- |
| **Tier 1: Nominal Flow**            | 3-invoice aging scenario (Spec Scenario 1) | Customer with due dates at +6, -14, and -84 days                                                                 | CURRENT: $100, DAYS_1_30: $200, DAYS_61_90: $300, total $600                              |
| **Tier 2: Adjacent & GL Integrity** | Invariant & status isolation               | Mix of paid, void, and active invoices across customers                                                          | Only active remaining balances included; bucket sums strictly match                       |
| **Tier 3: Multi-Tenant Attack**     | Cross-tenant data isolation                | Query aging passing Tenant B credentials for Tenant A data                                                       | Only invoices belonging to current session `tenantId` are returned                        |
| **Tier 4: Boundary & RBAC**         | Edge date offsets and unprivileged access  | 1. Due date = asOfDate (0 days)<br>2. Due date = asOfDate - 30 days vs - 31 days<br>3. Non-accountant role query | 1. Bucket: CURRENT<br>2. 30 $\to$ DAYS_1_30, 31 $\to$ DAYS_31_60<br>3. HTTP 403 Forbidden |
