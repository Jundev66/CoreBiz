# SDD Specification: TICKET-021 — Fiscal Credit & Debit Notes Engine

**Status**: `PROPOSED (Ready for Implementation)`  
**Scope**: `packages/invoicing`, `packages/fiscal`, `packages/accounting`, `packages/contracts`, `apps/api`, `apps/web`

---

## 1. Context & Business Need

In statutory accounting and fiscal jurisprudence, an invoice that has been officially issued and communicated to a customer or submitted to the tax authority **cannot be modified, deleted, or simply marked void without a statutory audit trail**.

1. **Commercial Adjustments & Product Returns**:
   - Customer returns defective or unwanted items -> Requires a **Credit Note (Nota de Crédito)** to reduce customer balance and restore inventory stock.
   - Price adjustment, negotiated commercial discount after invoicing -> Requires a **Credit Note** to reduce receivables without affecting physical stock.
2. **Surcharges & Financial Charges**:
   - Billing error undercharging a customer, late payment interest, additional freight charges -> Requires a **Debit Note (Nota de Débito)** to increase customer balance and record additional revenue.
3. **Tax & Ledger Invariants**:
   - In Venezuela (SENIAT Providencia 00084 y 00093), Credit and Debit notes must explicitly reference the original affected Invoice Number (`affectedDocumentNumber`) and its Control Number.
   - In accounting, Credit Notes reverse or reduce revenue and VAT tax liability, preserving the double-entry balance:
     - Credit Note Debit: Sales Returns / Disallowances (`4.1.02` or `4102`) and VAT Debit Tax (`2.1.02`).
     - Credit Note Credit: Accounts Receivable (`1.1.02`).
       $$\sum \text{Debits} \equiv \sum \text{Credits}$$

---

## 2. Ubiquitous Language & Core Concepts

- **CreditNote**: An aggregate representing a downward fiscal adjustment against an existing issued invoice.
  - `creditNoteNumber`: Formal sequential document identifier (e.g. `NC-000001`).
  - `affectedInvoiceId`: UUID of the original invoice being credited.
  - `reason`: Reason for issuance (`RETURN`, `PRICE_CORRECTION`, `DISCOUNT`, `CANCELLATION`).
  - `lines`: Detailed items being credited (with quantity and price).
  - `restockItems`: Boolean indicating if merchandise should be returned to inventory.
- **DebitNote**: An aggregate representing an upward fiscal adjustment against an existing issued invoice.
  - `debitNoteNumber`: Formal sequential document identifier (e.g. `ND-000001`).
  - `affectedInvoiceId`: UUID of the original invoice being debited.
  - `reason`: Reason for issuance (`INTEREST`, `PRICE_CORRECTION`, `ADDITIONAL_CHARGE`).

---

## 3. Architecture & File Structure

```text
packages/invoicing/
  src/
    domain/
      model/
        credit-note.ts                   # CreditNote aggregate
        debit-note.ts                    # DebitNote aggregate
      port/
        credit-note-repository.ts
        debit-note-repository.ts
    application/
      commands/
        issue-credit-note.command.ts
        issue-debit-note.command.ts
      queries/
        list-credit-notes.query.ts
        get-credit-note-by-id.query.ts
packages/contracts/
  src/
    credit-notes.ts                      # Zod schemas & DTOs
    debit-notes.ts
apps/api/
  src/
    modules/
      invoicing/
        controllers/
          issue-credit-note.controller.ts
          list-credit-notes.controller.ts
apps/web/
  src/
    app/(app)/
      invoicing/
        credit-notes/
          page.tsx                       # Credit notes catalog and creation view
```

---

## 4. Domain Models & Invariants

1. **Credit Limit Invariant**: Total credited amount across all credit notes linked to an invoice cannot exceed the original invoice total amount:
   $$\sum \text{CreditNoteAmounts}(\text{invoiceId}) \le \text{InvoiceTotal}(\text{invoiceId})$$
2. **Inventory Reversion Invariant**: If `restockItems === true`, an incoming `stock_movement` of type `RETURN` is posted for each item returned.
3. **Statutory Book Reflection**:
   - SENIAT Libro de Ventas must record Credit Notes as negative entries or in dedicated columns, reducing the monthly fiscal debit.

---

## 5. Acceptance Criteria (Given / When / Then)

### Scenario 1: Total Return of Goods with Credit Note

- **Given**: An issued invoice #FAC-000100 for 5 units of `SKU-MILK-01` ($10.00 subtotal + $1.60 IVA = $11.60).
- **When**: The customer returns all 5 units with reason `RETURN` and `restockItems: true`.
- **Then**: Credit note #NC-000001 is issued for $11.60 linked to #FAC-000100.
- **And**: Customer open balance is reduced by $11.60.
- **And**: 5 units of `SKU-MILK-01` are added back into the warehouse stock.
- **And**: A balanced journal entry is posted debiting Sales Returns $10.00, debiting Fiscal Debit Tax $1.60, and crediting Accounts Receivable $11.60.

---

## 6. Quality Gates & Test Plan

1. **Double-Entry Balance Test**: Assert all Credit/Debit note commands produce journal entries satisfying $\sum \text{Debits} \equiv \sum \text{Credits}$.
2. **Over-Credit Prevention**: Attempt to issue credit note for $150 on a $100 invoice -> System rejects with `CreditExceedsInvoiceTotalException`.
3. **Playwright E2E**: Web UI flow creating a credit note from an existing invoice, asserting stock update and ledger balance.
