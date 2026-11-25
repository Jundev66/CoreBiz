# SDD Specification: TICKET-022 — Physical Inventory Cycle Counting & Shrinkage Postings

**Status**: `COMPLETED`  
**Scope**: `packages/domain`, `packages/application`, `packages/accounting`, `packages/contracts`, `apps/api`, `apps/web`

---

## 1. Context & Business Need

In physical commerce (supermarkets, retail stores, hardware shops, distribution hubs), discrepancy inevitably develops between the **theoretical book stock** (calculated from purchasing receptions minus sales) and the **physical stock** actually sitting on warehouse shelves.

Causes of discrepancy:

1. **Shrinkage & Theft (Mermas y Pérdidas)**: Shoplifting, internal shrinkage, broken packaging.
2. **Perishability & Expiration**: Spoiled food items, damaged chemicals, expired pharmaceuticals.
3. **Measurement & Dispensing Variance**: Bulk dry goods (rice, sugar, flour, cement) dispensed in partial fractional kilograms.
4. **Human Receiving / Dispatch Errors**: Incorrect counts accepted at loading dock.

### Current Limitation:

Currently, CoreBiz only allows manual single-product ad-hoc adjustments via `/products/[id]`. There is no structured, auditable **Cycle Count / Physical Inventory Take (Toma Física)** process that supports counting an entire warehouse or category, computing discrepancies, and automatically posting balanced financial shrinkage entries.

---

## 2. Ubiquitous Language & Core Concepts

- **PhysicalInventoryAudit (Toma Física)**: An aggregate representing a formal stock auditing event for a specific warehouse:
  - `auditNumber`: Sequential reference (e.g. `INV-AUD-000001`).
  - `warehouseId`: Location being audited.
  - `blindCount`: Boolean indicating if theoretical quantities are hidden from counter staff to prevent confirmation bias.
  - `status`:
    - `OPEN`: Audit scheduled, counting permitted.
    - `IN_REVIEW`: Counting completed, discrepancies flagged for managerial review.
    - `APPROVED`: Discrepancies accepted; inventory and accounting adjustments applied.
    - `CANCELLED`: Audit abandoned.
- **AuditLine**: Individual count record per SKU:
  - `theoreticalQuantity`: System quantity at audit freeze.
  - `countedQuantity`: Physical verified quantity.
  - `discrepancyQuantity`: $countedQuantity - theoreticalQuantity$.
  - `unitCost`: Cost assigned for monetary valuation of the variance.
  - `discrepancyMonetaryValue`: $discrepancyQuantity \times unitCost$.

---

## 3. Architecture & File Structure

```text
packages/domain/
  src/
    inventory/
      model/
        physical-inventory-audit.ts      # Audit aggregate & line entities
      port/
        physical-inventory-repository.ts
packages/application/
  src/
    inventory/
      commands/
        create-inventory-audit.command.ts
        record-audit-counts.command.ts
        approve-inventory-audit.command.ts
      queries/
        list-inventory-audits.query.ts
        get-inventory-audit-details.query.ts
packages/contracts/
  src/
    inventory-audits.ts                  # Zod schemas & DTOs
apps/api/
  src/
    modules/
      inventory/
        controllers/
          create-inventory-audit.controller.ts
          record-audit-counts.controller.ts
          approve-inventory-audit.controller.ts
          list-inventory-audits.controller.ts
apps/web/
  src/
    app/(app)/
      inventory/
        audits/
          page.tsx                       # Physical inventory takes management view
          [id]/
            page.tsx                     # Sheet counting and approval view
```

---

## 4. Financial & Accounting Invariants

When an inventory audit is approved with discrepancies:

1. **Inventory Valuation Update**: Product on-hand quantities and stock movements are adjusted to equal `countedQuantity`.
2. **Automated Balanced Shrinkage Journal Entry**:
   - If negative discrepancy (Shortage / Merma / Shrinkage):
     - **Debit**: Operational Expense: Mermas y Pérdidas de Inventario (`6.1.05` / `6500`).
     - **Credit**: Asset: Mercancías para la Venta / Inventario (`1.1.03` / `1300`).
   - If positive discrepancy (Surplus / Sobrante):
     - **Debit**: Asset: Inventario (`1.1.03` / `1300`).
     - **Credit**: Other Operating Income: Ajustes Sobrantes de Inventario (`4.1.03` / `4300`).
       $$\sum \text{Debits} \equiv \sum \text{Credits}$$

---

## 5. Acceptance Criteria (Given / When / Then)

### Scenario 1: Approval of Audit with Physical Shrinkage

- **Given**: Warehouse 1 has theoretical stock of 100 units of `SKU-OIL-01` at standard cost $2.00/unit ($200.00 total asset value).
- **When**: The audit team counts 95 units physically (5 units missing due to broken bottles).
- **And**: The store manager reviews and approves the audit.
- **Then**: Product on-hand stock is updated to 95 units.
- **And**: A stock movement of type `SHRINKAGE` for -5 units is posted.
- **And**: A balanced journal entry is created:
  - Debit: Account `6.1.05` (Mermas de Inventario) = $10.00.
  - Credit: Account `1.1.03` (Inventario de Mercancías) = $10.00.
  - Net difference = 0.00.

---

## 6. Quality Gates & Test Plan

1. **Domain Unit Tests**: Vitest tests on `PhysicalInventoryAudit` aggregate asserting state flow and line math.
2. **Accounting Invariant Test**: Assert that approving an audit with 50 short and surplus lines creates an exactly balanced journal entry.
3. **Playwright E2E**: Complete web flow: create audit, submit counted sheet, approve discrepancies, and verify Trial Balance reflecting expense in `6.1.05`.
