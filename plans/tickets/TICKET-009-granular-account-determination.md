# SDD Specification: TICKET-009 — Granular Account Determination & Multi-Account Revenue Allocation

## 1. Context & Business Need

Businesses frequently bill composite transactions containing distinct economic activities (e.g., physical goods subject to standard VAT/Sales Tax vs advisory services or exempt goods). In financial accounting, physical sales must credit product sales revenue (e.g., `4.1.01` in VEN-NIF / `4010` in US GAAP), while service fees must credit service revenues (e.g., `4.1.02` in VEN-NIF / `4020` in US GAAP).

To prevent manual accounting selection by sales clerks or cashiers, CoreBiz implements the **Two-Tier Account Determination Pattern**:

1. **Tier 1 (Item Override)**: If an invoice line specifies an explicit `revenueAccountId`, its line subtotal is credited directly to that account.
2. **Tier 2 (Company Fallback)**: If an invoice line leaves `revenueAccountId` unset, its line subtotal defaults to the tenant's primary revenue account (`command.revenueAccountId`).

The double-entry invariant ($\sum \text{Debits} \equiv \sum \text{Credits}$) must be strictly preserved across all split revenue lines and statutory tax allocations.

## 2. Ubiquitous Language & Core Concepts

- **LineRevenueAllocation**: Subtotal amount allocated to a specific General Ledger account based on item override or company fallback.
- **AggregatedRevenueCredits**: Grouped credit lines where multiple items sharing the same `revenueAccountId` are aggregated into a single balanced ledger line.
- **CompanyFallbackAccount**: Primary revenue account defined by tenant configuration or active fiscal jurisdiction template.

## 3. Architecture & File Structure

```text
packages/invoicing/
  src/
    application/
      commands/
        issue-invoice.command.ts         # Multi-account revenue splitting logic
    domain/
      model/
        invoice-line.ts                  # Optional revenueAccountId on invoice line
packages/contracts/
  src/
    invoicing.ts                         # Update invoice line schema
    integrations.ts                      # Update integration line schema
    products.ts                          # Optional accounting fields on products
packages/domain/
  src/
    products/
      product.ts                         # Optional revenueAccountId and inventoryAccountId
plans/tickets/
  TICKET-009-granular-account-determination.md
```

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: Mixed Invoice with Specific and Fallback Revenue Accounts

- **Given** an invoice containing Line 1 ($100.00 with override account `acc-services`) and Line 2 ($50.00 without override account, with fallback `acc-goods`)
- **When** `IssueInvoiceCommandHandler` executes
- **Then** the resulting journal entry contains:
  - Debit: Accounts Receivable for total ($174.00 including 16% tax)
  - Credit: `acc-services` for $100.00
  - Credit: `acc-goods` for $50.00
  - Credit: Tax Payable for $24.00
  - Total Debits ($174.00) strictly equal Total Credits ($174.00).

### Scenario 2: Aggregation of Identical Accounts across Multiple Lines

- **Given** an invoice where 3 distinct items map to the same fallback revenue account
- **When** the invoice is issued
- **Then** the revenue credits for that account are cleanly summed into a single line, preventing unnecessary ledger clutter.

### Scenario 3: Backward Compatibility for Single-Account Invoices

- **Given** an external or POS invoice providing only the tenant-level `revenueAccountId`
- **When** `IssueInvoiceCommandHandler` executes
- **Then** the invoice and balanced journal entry are generated with 100% backward compatibility.

## 5. Verification Checklist

- [x] Update `InvoiceLineCreationInput` in `@corebiz/invoicing` to accept optional `revenueAccountId`
- [x] Implement multi-account revenue aggregation in `IssueInvoiceCommandHandler`
- [x] Update contracts in `@corebiz/contracts` (`invoicing.ts`, `integrations.ts`, `products.ts`)
- [x] Add optional `revenueAccountId` and `inventoryAccountId` to `ProductProps` in `@corebiz/domain`
- [x] Add unit tests for mixed-account revenue splitting and double-entry invariants
- [x] Zero comments policy strictly respected
- [x] `pnpm typecheck`, `pnpm arch`, and `pnpm test:unit` passing 100%
