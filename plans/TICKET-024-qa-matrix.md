# Senior QA Master Plan & Adversarial Matrix: TICKET-024

**Feature**: Payment Terms (Cash/Credit), Collection Receipts & Receivable Traceability Engine  
**Scope**: `@corebiz/invoicing`, `@corebiz/accounting`, `@corebiz/contracts`, `apps/api`

---

## 1. Business Model Context & Ubiquitous Language

In commercial operations, mixing cash sales and credit sales without strict lifecycle boundaries is one of the primary causes of cash drawer discrepancies, fictitious open receivables, and delinquency.

- **Cash Sale (`CASH`)**: Immediate settlement upon delivery/billing. Debits Cash/Bank (`1.1.01`) directly, closing the transaction at issuance without creating open accounts receivable.
- **Credit Sale (`CREDIT`)**: Commercial trade credit with defined maturity (`creditDays`, `dueDate`). Debits Accounts Receivable (`1.1.02`), creating an open customer balance.
- **Collection Receipt (`PaymentReceipt`)**: Immutable commercial voucher (`RC-000001`) tracking payments received, payment method details (cash, bank transfer, card, mobile payment, Zelle), and allocations across one or more invoices.
- **Allocation Invariant**: A payment receipt must strictly allocate 100% of its collected amount across designated invoices without exceeding their open balances.

---

## 2. What Was Built & Architectural Rationale

1. **Contracts Layer (`@corebiz/contracts`)**:
   - `paymentConditionSchema` (`CASH` | `CREDIT`) and `paymentMethodTypeSchema`.
   - `createCollectionReceiptSchema` & `voidCollectionReceiptSchema`.
   - `paymentReceiptResponseSchema` with allocation breakdowns.
   - Updated `issueInvoiceSchema` supporting `paymentCondition` and optional `cashAccountId`.
2. **Invoicing Domain (`@corebiz/invoicing/domain`)**:
   - `PaymentCondition` & `InvoicePaymentMethod` Value Objects.
   - `PaymentReceipt` Aggregate Root with allocation validation and voiding logic.
   - Enhanced `Invoice` Aggregate supporting instant cash settlement (`PAID` at birth) and balance restoration on receipt voiding (`restorePayment`).
   - `PaymentReceiptRepository` port.
3. **Application Layer (`@corebiz/invoicing/application`)**:
   - `IssueInvoiceCommandHandler`: Country-aware, cash vs. credit journal entry generation.
   - `CreateCollectionReceiptCommandHandler`: Validates allocations, updates invoice balances, generates sequential receipt numbers (`RC-000001`), and writes balanced double-entry collection entries ($\text{Debit Cash/Bank} = \text{Credit AR}$).
   - `VoidCollectionReceiptCommandHandler`: Restores invoice balances and posts reversing journal entries.
   - `ListInvoiceReceiptsQueryHandler`: Full audit trail of payments applied to an invoice.
4. **API Controllers (`apps/api`)**:
   - `POST /v1/invoicing/receipts`
   - `POST /v1/invoicing/receipts/:id/void`
   - `GET /v1/invoicing/invoices/:id/receipts`

---

## 3. Blast Radius & Adjacent Flows Analysis

- **Upstream**:
  - Point of Sale (`apps/pos`): Can issue cash sales directly settled without generating artificial customer receivables.
  - Commercial B2B Billing: Enforces payment terms and maturity dates.
- **Downstream**:
  - General Ledger (`@corebiz/accounting`): Guaranteed balance ($\sum \text{Debits} \equiv \sum \text{Credits}$) on every issuance, collection, and reversal.
  - Statutory Fiscal Books (`@corebiz/fiscal`): Sales book records invoice total and tax independently of collection timing.
  - Accounts Receivable Aging (TICKET-023): Open credit invoices age accurately through maturity buckets; cash invoices never pollute aging reports.

---

## 4. 4-Tier Adversarial Test Matrix

### Tier 1: Nominal Business Flow Verification

- Issue cash invoice -> Assert status is `PAID`, remaining balance 0, and GL debits Cash account.
- Issue credit invoice -> Assert status is `ISSUED`, remaining balance = total, and GL debits AR account.
- Apply partial collection via Bank Transfer -> Assert status is `PARTIALLY_PAID`, remaining balance decreased, receipt `RC-000001` created, and GL entry balanced.
- Apply final collection -> Assert status is `PAID` with remaining balance 0.

### Tier 2: Adjacent & Multi-Invoice Allocation Integrity

- Customer has two open invoices ($100 and $200).
- Customer delivers a single payment of $250.
- Allocate $100 to Inv-1 and $150 to Inv-2 in a single receipt.
- Assert Inv-1 is `PAID`, Inv-2 is `PARTIALLY_PAID` ($50 remaining), and receipt total is $250.

### Tier 3: Edge Cases, Overpayment & Reversal Resistance

- Attempt to allocate $300 to an invoice with $200 open balance -> Rejection with `AllocationExceedsBalance`.
- Attempt to create receipt where sum of allocations ($150) != receipt amount ($200) -> Rejection with `AllocationSumMismatch`.
- Void an active collection receipt -> Assert invoice remaining balance is restored and reversing balanced journal entry is created.
- Attempt to double-void an already voided receipt -> Rejection with `ReceiptAlreadyVoided`.

### Tier 4: Financial Exploitation & Idempotency

- Concurrent duplicate submission of collection receipt with identical `Idempotency-Key` -> Exactly one receipt created; duplicate request safely returns existing receipt.
- Currency mismatch test: Attempt to apply VES allocation to USD invoice without explicit FX conversion -> Rejection with `InvoiceCurrencyMismatch`.
