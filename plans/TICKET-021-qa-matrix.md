# Senior QA Master Plan & Adversarial Matrix: TICKET-021

**Feature**: Fiscal Credit & Debit Notes Engine  
**Scope**: `@corebiz/invoicing`, `@corebiz/contracts`, `apps/api`

---

## 1. Business Model Context & Ubiquitous Language

In statutory accounting and fiscal jurisprudence, an invoice once issued to a customer cannot be modified, deleted, or destroyed without an official fiscal adjustment:

- **Credit Note (`CreditNote`)**: Formal fiscal document reducing accounts receivable and tax liabilities when goods are returned, or commercial discounts / price reductions are granted.
- **Debit Note (`DebitNote`)**: Formal fiscal document increasing accounts receivable and tax liabilities for late payment interest, undercharge corrections, or additional freight charges.
- **Affected Invoice Linkage**: Every credit and debit note must explicitly identify the original invoice (`affectedInvoiceId`, `affectedDocumentNumber`) and its control number.
- **Over-Credit Prevention Invariant**: Total credit notes applied to an invoice can never exceed the invoice original total amount:
  $$\sum \text{CreditNoteAmounts}(\text{invoiceId}) \le \text{InvoiceTotal}(\text{invoiceId})$$
- **Double-Entry Balance Invariant**:
  - Credit Note: Debit Sales Returns (`4.1.01`) + Debit Tax Liability (`2.1.02`) = Credit Accounts Receivable (`1.1.02`).
  - Debit Note: Debit Accounts Receivable (`1.1.02`) = Credit Surcharge Revenue (`4.1.01`) + Credit Tax Liability (`2.1.02`).
    $$\sum \text{Debits} \equiv \sum \text{Credits}$$

---

## 2. What Was Built & Architectural Rationale

1. **Contracts Layer (`@corebiz/contracts`)**:
   - `creditNoteReasonSchema` (`RETURN`, `PRICE_CORRECTION`, `DISCOUNT`, `CANCELLATION`, `OTHER`).
   - `debitNoteReasonSchema` (`INTEREST`, `PRICE_CORRECTION`, `ADDITIONAL_CHARGE`, `OTHER`).
   - `issueCreditNoteSchema`, `listCreditNotesQuerySchema`, `creditNoteResponseSchema`.
   - `issueDebitNoteSchema`, `listDebitNotesQuerySchema`, `debitNoteResponseSchema`.
2. **Invoicing Domain Layer (`@corebiz/invoicing/domain`)**:
   - `CreditNote` Aggregate: Calculates subtotal, taxTotal, total, enforces non-empty lines, matching currencies, and affected invoice reference.
   - `DebitNote` Aggregate: Surcharge calculations and affected invoice reference.
   - `Invoice` Enhancement: Tracks `creditedAmount`, recalculates `remainingBalance` (`total - paid - credited`), and exposes `applyCredit()` method with over-credit rejection.
   - Ports: `CreditNoteRepository` and `DebitNoteRepository`.
3. **Invoicing Application Layer (`@corebiz/invoicing/application`)**:
   - `IssueCreditNoteCommandHandler`: Validates invoice status and remaining balance, updates invoice credited amount, generates balanced double-entry ledger entry, and persists credit note.
   - `IssueDebitNoteCommandHandler`: Validates invoice status, generates balanced double-entry ledger entry, and persists debit note.
   - Queries: `ListCreditNotesQueryHandler`, `ListDebitNotesQueryHandler`.
4. **API Controllers & Module Wiring (`apps/api`)**:
   - `POST /v1/invoicing/credit-notes`: Emits credit note.
   - `GET /v1/invoicing/credit-notes`: Lists credit notes with invoice and customer filters.
   - `POST /v1/invoicing/debit-notes`: Emits debit note.
   - `GET /v1/invoicing/debit-notes`: Lists debit notes with invoice and customer filters.
   - Controllers registered in `InvoicingModule`.

---

## 3. 4-Tier Adversarial Test Matrix

### Tier 1: Nominal Credit Note Lifecycle & Full Return

- Invoice issued for $100.00 subtotal + 16% IVA ($16.00) = $116.00 total.
- Issue Credit Note for full return of goods ($116.00) with `restockItems: true`.
- Assert Credit Note assigned number `NC-000001`.
- Assert invoice `creditedAmount` updated to $116.00, `remainingBalance` reduced to $0.00, and invoice status transitions to `PAID`.
- Assert balanced journal entry posted: Debit Sales Returns $100.00, Debit Tax $16.00, Credit Accounts Receivable $116.00.

### Tier 2: Partial Credit & Debit Note Surcharge

- Invoice issued for $150.00 total.
- Issue partial Credit Note for $20.00 discount -> Invoice `remainingBalance` decreases to $130.00 and status remains `PARTIALLY_PAID`.
- Issue Debit Note for $10.00 interest + $1.60 tax ($11.60 total) -> Assert Debit Note assigned `ND-000001`.
- Assert balanced journal entry posted: Debit Accounts Receivable $11.60, Credit Surcharge Revenue $10.00, Credit Tax $1.60.

### Tier 3: Invariant Protection & Over-Credit Rejection

- Attempt to issue Credit Note for $150.00 against an invoice with $100.00 remaining balance -> Rejection with `CreditExceedsRemainingBalance`.
- Attempt to issue Credit Note or Debit Note against a `VOID` invoice -> Rejection with `CannotCreditVoidInvoice` or `CannotDebitVoidInvoice`.
- Attempt to create note with mismatched line currencies -> Rejection with `CreditNoteCurrencyMismatch` / `DebitNoteCurrencyMismatch`.

### Tier 4: Multi-Tenant Boundary & Query Isolation

- Issue credit and debit notes for Tenant Alpha and Tenant Beta.
- Assert Tenant Alpha queries return only Alpha notes with no leakage of Beta documents.
- Assert attempt to apply credit note referencing an invoice belonging to another tenant fails with `InvoiceNotFound`.
