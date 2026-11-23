# ARCH-001: QA Adversarial Test Matrix

## Tier 1: Functional & Nominal Flow

- Issue invoice in USD and VES.
- Calculate 16% IVA and 3% IGTF for Venezuelan fiscal context.
- Collect partial 50% payment; verify invoice status becomes `PARTIALLY_PAID`.
- Collect remaining 50% payment; verify invoice status becomes `PAID`.
- Verify automatic generation of balanced journal entries for both issuance and payment.

## Tier 2: Boundary & Monetary Integrity

- Reject invoice with negative line unit price or negative quantity.
- Reject payment exceeding remaining balance.
- Reject journal entry with debit sum != credit sum ($\sum \text{Debits} \ne \sum \text{Credits}$).
- Ensure integer cent math does not produce floating-point rounding errors.

## Tier 3: Security & Multi-Tenant Isolation (RLS)

- Tenant A issues invoices and creates journal entries.
- Tenant B authenticates and queries invoices and ledger.
- Tenant B must receive 0 records from Tenant A (assert strict RLS).

## Tier 4: Idempotency & Financial Concurrency

- 20 concurrent requests with identical `Idempotency-Key` attempting to issue the same invoice.
- Exactly 1 invoice is created; 19 requests receive cached identical response without duplicate journal entries.
