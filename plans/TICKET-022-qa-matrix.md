# QA Specification & Adversarial Runbook: TICKET-022 (Physical Inventory Cycle Counting & Shrinkage Postings)

## 1. Business Model Context

In wholesale and retail environments, discrepancy inevitably accumulates between theoretical book inventory (derived from receiving purchases minus point-of-sale dispatches) and physical quantities present on store shelves or warehouse bays. This variance stems from internal shrinkage, shoplifting, damage in transit, expiration of perishables, or bulk fractional weighing errors.

TICKET-022 introduces a formal, auditable **Cycle Counting & Physical Inventory Audit (Toma Física)** aggregate. The system supports **blind counting** (omitting expected theoretical stock from count sheets to eliminate confirmation bias) and automates balanced double-entry general ledger adjustments when managerial approval occurs:

- Missing items (Shortage / Merma / Shrinkage): Debits Operational Expense `6.1.05` (_Mermas de Inventario_) and Credits Asset `1.1.03` (_Inventario de Mercancías_).
- Extra items (Surplus / Sobrante): Debits Asset `1.1.03` and Credits Operating Income `4.1.03` (_Ajustes Sobrantes de Inventario_).
- Double-entry invariant strictly holds: $\sum \text{Debits} \equiv \sum \text{Credits}$.

---

## 2. What Was Built & Architectural Rationale

1. **Contracts (`@corebiz/contracts`)**:
   - `inventory-audits.ts`: Defined `createInventoryAuditSchema`, `recordAuditCountsSchema`, `approveInventoryAuditSchema`, `cancelInventoryAuditSchema`, and response DTOs with strict zod validation.
2. **Domain Aggregate (`@corebiz/domain`)**:
   - `PhysicalInventoryAudit`: Enforces state transitions (`OPEN` $\to$ `IN_REVIEW` $\to$ `APPROVED` or `CANCELLED`).
   - `AuditLine`: Computes exact discrepancy quantities and monetary values using `Quantity` (scale 3) and `Money` (minor units with half-up rounding).
   - Port `PhysicalInventoryAuditRepository`.
3. **Application Layer (`@corebiz/application`)**:
   - Commands: `CreateInventoryAuditCommandHandler`, `RecordAuditCountsCommandHandler`, `ApproveInventoryAuditCommandHandler` (posts double-entry `JournalEntry` and adjusts warehouse stock), `CancelInventoryAuditCommandHandler`.
   - Queries: `ListInventoryAuditsQueryHandler`, `GetInventoryAuditDetailsQueryHandler` (enforces blind count data masking when active).
   - Memory adapter `InMemoryPhysicalInventoryAuditRepository`.
4. **API Modules (`apps/api`)**:
   - Controllers:
     - `POST /v1/inventory/audits` (Requires `stock:adjust`)
     - `POST /v1/inventory/audits/:id/counts` (Requires `stock:adjust`)
     - `POST /v1/inventory/audits/:id/approve` (Requires `stock:adjust`)
     - `POST /v1/inventory/audits/:id/cancel` (Requires `stock:adjust`)
     - `GET /v1/inventory/audits` (Requires `stock:read`)
     - `GET /v1/inventory/audits/:id` (Requires `stock:read`)

---

## 3. Blast Radius & Downstream Integrations

- **Warehouse Stock (`WarehouseRepository`)**: On audit approval, on-hand product stock is adjusted by `discrepancyQuantity`.
- **Double-Entry General Ledger (`JournalEntryRepository`)**: Discrepancies generate a permanent balanced journal entry (`sourceType: 'ADJUSTMENT'`).
- **Trial Balance (`get-trial-balance.query`)**: Expense account `6.1.05` and Asset account `1.1.03` accurately reflect physical write-offs.

---

## 4. Client Acceptance Criteria Checklist

- [x] Initializing an audit captures warehouse theoretical stock at freeze time.
- [x] Blind count sheets mask theoretical stock from counters during `OPEN` status.
- [x] Counters submit verified physical counts, transitioning audit to `IN_REVIEW`.
- [x] Managers approve audit: stock levels update to match physical counts.
- [x] Approving an audit with shortages debits `6.1.05` and credits `1.1.03`.
- [x] Approving an audit with surpluses debits `1.1.03` and credits `4.1.03`.
- [x] Zero-discrepancy audits approve cleanly without posting spurious journal entries.
- [x] Finalized or cancelled audits reject re-submission of counts or re-approval.

---

## 5. Adversarial 4-Tier Test Matrix

| Tier                             | Test Objective                          | Attack / Verification Vector                                                                                                    | Expected Result                                                                                                             |
| :------------------------------- | :-------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------- |
| **Tier 1: Nominal Flow**         | Complete cycle count lifecycle          | Create audit $\to$ record counts with shortage/surplus $\to$ approve                                                            | Audit approved, warehouse stock adjusted, balanced journal entry created                                                    |
| **Tier 2: Adjacent Integrity**   | Balance sheet verification              | Check Trial Balance and Warehouse on-hand stock after approval                                                                  | Debits match credits exactly; stock equals counted quantity                                                                 |
| **Tier 3: Multi-Tenant Attack**  | Cross-tenant data isolation             | Query `GET /v1/inventory/audits/:id` belonging to Tenant B with Tenant A auth                                                   | Returns 404 / `AuditNotFound`; zero cross-tenant leakage                                                                    |
| **Tier 4: RBAC & State Machine** | Exploit invalid transitions & privilege | 1. Direct approval of `OPEN` audit without counts<br>2. Re-recording counts on `APPROVED` audit<br>3. Cancelling without reason | 1. Rejection: `AuditNotReadyForApproval`<br>2. Rejection: `InvalidStatusTransition`<br>3. Rejection: `CancelReasonRequired` |
