# SDD Specification: TICKET-016 — Partner Drawings & Internal Stock/Cash Consumption

## 1. Context & Business Need

In small and mid-sized businesses, owners and shareholders often withdraw funds directly from cash drawers or remove physical products/merchandise from warehouse stock for personal use or partner dividend advances.

When these operations are performed informally without system records:

1. Cash drawers experience unexplained shortages, breaking cashier shift closing (`CloseCashShift`).
2. Warehouse stock counts develop inventory discrepancies and phantom shrinkage.
3. Accounting reports distort operational expenses by disguising capital withdrawals as company costs.

To solve this, CoreBiz introduces **Owner Drawings & Internal Consumption Traceability**:

- **Cash Withdrawals (Retiro de Dinero)**: Billed directly to the Partner Current Account (`Cuenta Corriente Socios / Retiros de Capital` in Equity `3.1.xx` or Receivable from Partner `1.2.xx`), crediting `Caja/Bancos`.
- **Merchandise Withdrawals (Autoconsumo de Inventario)**: Decrements warehouse stock via `StockMovement` (reason `OWNER_DRAWING`) and posts a balanced journal entry crediting `Inventario de Mercancías` at cost and debiting `Retiros de Socios`.
- **Strict Audit Trail**: Requiring partner identity, authorizing user, timestamp, purpose, and linked journal/inventory vouchers.

## 2. Ubiquitous Language & Core Concepts

- **PartnerDrawing**: Authorized withdrawal of financial funds or physical goods by a business shareholder or owner.
- **SelfConsumptionMovement**: Stock movement recording the reduction of physical inventory consumed by internal owners.
- **PartnerCurrentAccount**: General ledger account tracking net receivables or equity draws allocated to a specific partner.

## 3. Architecture & File Structure

```text
packages/accounting/
  src/
    domain/
      model/
        partner-drawing.ts               # Partner drawing aggregate
      port/
        partner-drawing-repository.ts
    application/
      commands/
        record-partner-cash-drawing.command.ts
        record-partner-stock-drawing.command.ts
      queries/
        list-partner-drawings.query.ts
packages/contracts/
  src/
    partner-drawings.ts                  # DTOs and validation schemas
apps/api/
  src/
    modules/
      accounting/
        controllers/
          record-partner-cash-drawing.controller.ts
          record-partner-stock-drawing.controller.ts
          list-partner-drawings.controller.ts
apps/web/
  app/(app)/
    accounting/
      drawings/
        page.tsx                         # Partner drawings and withdrawals viewer
```

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: Partner Cash Withdrawal

- **Given** an authorized owner requesting a $200.00 cash withdrawal from main drawer
- **When** executing `record-partner-cash-drawing`
- **Then** a balanced journal entry is posted:
  - Debit: Partner Drawings (`3.1.02` Equity or `1.2.05` Current Account) for $200.00
  - Credit: Cash (`1.1.01`) for $200.00
  - The drawing record is logged with partner ID, operator ID, and explanation.

### Scenario 2: Partner Merchandise Consumption

- **Given** an owner taking 5 units of product (unit cost $20.00, total inventory cost $100.00)
- **When** executing `record-partner-stock-drawing`
- **Then**:
  - Inventory quantity for the product is decremented by 5 units with reason `OWNER_DRAWING`.
  - A balanced journal entry is posted:
    - Debit: Partner Drawings for $100.00
    - Credit: Merchandise Inventory (`1.1.03`) for $100.00
  - Total Debits strictly equal Total Credits ($\sum D \equiv \sum C$).

## 5. Verification Checklist

- [x] Implement `PartnerDrawing` domain model in `@corebiz/accounting`
- [x] Connect stock reduction handler with `@corebiz/domain` product stock adjustments
- [x] Enforce double-entry balance on partner equity draw accounts
- [x] Expose REST controllers in `apps/api`
- [x] Implement audit dashboard in `apps/web`
- [x] Zero comments policy strictly respected
- [x] `pnpm typecheck`, `pnpm arch`, and `pnpm test:unit` passing 100%
