# SDD Specification: TICKET-024 — Payment Terms (Cash/Credit), Collection Receipts & Receivable Traceability Engine

**Status**: `PROPOSED (Ready for Implementation)`  
**Scope**: `packages/invoicing`, `packages/accounting`, `packages/contracts`, `packages/db`, `apps/api`, `apps/web`

---

## 1. Context & Business Need

In commercial B2B and retail transactions, money management requires strict, transparent separation between cash sales (contado) and credit sales (crédito), as well as immutable auditability for partial and full collections (cobros parciales):

1. **Cash vs. Credit Sales**:
   - Currently, all invoices issue with an automatic debit to Accounts Receivable (`1.1.02`), even when the customer pays immediately at the counter.
   - For cash sales (`CASH`), payment must be captured and settled immediately upon invoice issuance, directly debiting Cash/Bank accounts without forcing an artificial open receivable state.
   - For credit sales (`CREDIT`), the invoice defines strict credit terms (`creditDays`, `dueDate`), enforces customer credit limit checks (`creditLimit`), and establishes an open debt obligation in the customer portfolio.
2. **Immutable Collection Receipts (Recibos de Cobro)**:
   - Partial or total payments currently decrease `paid_minor` on `invoices` and create a journal entry, but fail to record an immutable commercial payment receipt entity.
   - Businesses require consecutive receipt numbering (`RC-000001`), payment method categorization (Cash, Bank Transfer, POS Card, Mobile Pay / Zelle), transactional metadata (bank, reference code, terminal ID, batch, auth code), and clear multi-invoice allocation tracking.
3. **Credit Traceability & Customer Exposure**:
   - Finance and credit managers must see the full chronological history of payments made against each invoice, with real-time customer credit exposure monitoring.

---

## 2. Ubiquitous Language & Core Concepts

- **PaymentCondition**:
  - `CASH`: Immediate settlement upon issuance. Requires payment method details and immediately debits Cash/Bank (`1.1.01`).
  - `CREDIT`: Commercial credit granted to customer. Requires `creditDays` and `dueDate`. Enforces credit limit and debits Accounts Receivable (`1.1.02`).
- **PaymentMethodType**:
  - `CASH_USD` / `CASH_VES`: Physical cash with optional cash-drawer ID.
  - `BANK_TRANSFER`: Wire transfer with bank name and transaction reference.
  - `DEBIT_CARD` / `CREDIT_CARD`: Card transaction with terminal ID, batch/lote, and authorization code.
  - `MOBILE_PAY`: Instant mobile payment (Venezuela Pago Móvil) with originating bank, phone, and reference.
  - `ZELLE`: Digital dollar transfer with sender email/phone and confirmation code.
- **PaymentReceipt (Aggregate Root)**:
  - Commercial receipt entity tracking money collected from a customer:
    - `id`: UUID.
    - `tenantId`: Tenant UUID.
    - `receiptNumber`: Sequential tenant-scoped identifier (`RC-000001`).
    - `customerId`: Customer UUID.
    - `amount`: `Money` minor units.
    - `paymentMethod`: `PaymentMethodType`.
    - `reference`: Transaction/auth reference string.
    - `bankAccountId`: Target bank or cash account ID.
    - `receiptDate`: Timestamp of collection.
    - `notes`: Optional memo.
    - `status`: `ACTIVE` | `VOIDED`.
    - `allocations`: List of `PaymentReceiptAllocation` items.
- **PaymentReceiptAllocation**:
  - Maps payment amount to an invoice:
    - `invoiceId`: Invoice UUID.
    - `amount`: Minor units applied to invoice principal.
    - `previousBalance`: Balance before payment application.
    - `newBalance`: Balance after payment application.
- **CreditLimitGuard**: Domain service checking whether:
  $$\text{CurrentUnpaidReceivables} + \text{NewInvoiceTotal} \le \text{CustomerCreditLimit}$$
  If exceeded, issuance is rejected or flagged as unapproved credit.

---

## 3. Mathematical Formulation & Invariants

1. **Receipt Allocation Conservation Invariant**:
   $$\sum_{i=1}^{n} \text{allocation.amount}_i \equiv \text{receipt.amount}$$
   A payment receipt cannot allocate more or less money than what was actually received.
2. **Remaining Balance Boundary Invariant**:
   For any invoice allocation:
   $$\text{allocation.amount} \le \text{invoice.remainingBalance}$$
   $$\text{newBalance} \equiv \text{previousBalance} - \text{allocation.amount}$$
3. **Double-Entry Balance on Cash Issuance**:
   - $\text{Debit Cash / Bank} = \text{Invoice Total}$
   - $\text{Credit Sales Revenue} = \text{Invoice Subtotal}$
   - $\text{Credit Tax Payable} = \text{Invoice Tax Total}$
     Balance: $\sum \text{Debits} \equiv \sum \text{Credits}$.
4. **Double-Entry Balance on Collection Receipt**:
   - $\text{Debit Cash / Bank} = \text{Receipt Amount}$
   - $\text{Credit Accounts Receivable} = \text{Receipt Amount}$
     Balance: $\sum \text{Debits} \equiv \sum \text{Credits}$.
5. **Immutability & Reversal Invariant**:
   Payment receipts cannot be modified. Voiding a receipt requires an explicit voiding event that restores invoice balances and posts an automated reversing journal entry.

---

## 4. Architecture & File Structure

```text
packages/invoicing/
  src/
    domain/
      model/
        payment-condition.ts           # CASH | CREDIT enum & value object
        payment-method.ts              # Supported methods & metadata interface
        payment-receipt.ts             # PaymentReceipt aggregate root & allocations
        invoice.ts                     # Enhanced with paymentCondition & payment receipts list
      port/
        payment-receipt-repository.ts  # Port for receipt persistence & next sequence
    application/
      commands/
        issue-invoice.command.ts       # Enhanced to support CASH (instant settlement) and CREDIT
        create-collection-receipt.command.ts # Use case to collect partial/full payments
        void-collection-receipt.command.ts   # Use case to void receipt with accounting reversal
      queries/
        list-invoice-payments.query.ts # History of payments per invoice
        get-customer-credit-statement.query.ts # Credit movements & live exposure
    infrastructure/
      prisma/
        prisma-payment-receipt-repository.ts
      memory/
        in-memory-payment-receipt-repository.ts
packages/contracts/
  src/
    invoicing.ts                       # Updated schemas with paymentCondition & receipts
    payment-receipts.ts                # DTOs & Zod schemas for receipts and allocations
packages/db/
  prisma/
    schema.prisma                      # payment_receipts and payment_receipt_allocations models
apps/api/
  src/
    modules/
      invoicing/
        controllers/
          create-collection-receipt.controller.ts
          list-invoice-receipts.controller.ts
          void-collection-receipt.controller.ts
```

---

## 5. Acceptance Criteria (Given / When / Then)

### Scenario 1: Cash Invoice Issuance with Immediate Settlement

- **Given** an invoice issuance command with `paymentCondition: 'CASH'`, `paymentMethod: 'CASH_USD'`, and target `cashAccountId: '1.1.01.01'`
- **When** `IssueInvoiceCommandHandler.execute` is invoked
- **Then** the invoice is created with status `PAID`, `paidAmount` equals `total`, and remaining balance is 0.
- **And** a balanced journal entry is posted debiting Cash/Bank and crediting Revenue and Tax Payable directly, bypassing Accounts Receivable.

### Scenario 2: Credit Invoice Issuance with Credit Limit Validation

- **Given** a customer with credit limit $500.00 USD and current open balance $400.00 USD
- **When** attempting to issue a credit invoice of $150.00 USD
- **Then** issuance is rejected with `Err(CustomerCreditLimitExceeded)` indicating available credit is $100.00 USD.

### Scenario 3: Partial Collection with Consecutive Receipt Number

- **Given** an issued credit invoice of $1,000.00 USD with remaining balance $1,000.00 USD
- **When** a partial collection of $400.00 USD is recorded via Bank Transfer with reference `TRF-98765`
- **Then** a `PaymentReceipt` is created with next sequential number (e.g. `RC-000001`).
- **And** the invoice status transitions to `PARTIALLY_PAID` with remaining balance $600.00 USD.
- **And** an automated balanced journal entry is posted debiting Bank Account and crediting Accounts Receivable for $400.00 USD.

### Scenario 4: Multi-Invoice Payment Allocation

- **Given** a customer with two open invoices: Inv-1 (balance $300.00) and Inv-2 (balance $500.00)
- **When** customer delivers a payment of $600.00 USD allocated as $300.00 to Inv-1 and $300.00 to Inv-2
- **Then** a single `PaymentReceipt` is created for $600.00 USD with two allocations.
- **And** Inv-1 status transitions to `PAID` ($0.00 balance) and Inv-2 transitions to `PARTIALLY_PAID` ($200.00 balance).

### Scenario 5: Immutable Receipt Voiding with Balance Restoration

- **Given** an active `PaymentReceipt` of $400.00 USD applied to an invoice
- **When** the receipt is voided with reason `"Cheque devuelto sin fondos"`
- **Then** the receipt status transitions to `VOIDED`.
- **And** the invoice remaining balance is restored from $600.00 USD back to $1,000.00 USD.
- **And** a reversing journal entry is posted debiting Accounts Receivable and crediting Cash/Bank for $400.00 USD.

---

## 6. Quality Gates & Test Plan

1. **Pure Domain Tests**: Vitest unit tests in `packages/invoicing/tests/` asserting allocation invariants, credit limit calculation, and receipt creation.
2. **Double-Entry Balance Tests**: Assert that all generated journal entries strictly enforce $\sum \text{Debits} \equiv \sum \text{Credits}$.
3. **Database & RLS Verification**: Test multi-tenant isolation on `payment_receipts` using PostgreSQL RLS.
4. **Adversarial QA Matrix**: Include concurrent double-collection spamming to verify `Idempotency-Key` on receipt generation.
