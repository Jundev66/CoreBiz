# SDD Specification: TICKET-019 — Multi-Warehouse & Inter-Branch Stock Transfers Engine

**Status**: `COMPLETED`  
**Scope**: `packages/domain`, `packages/application`, `packages/contracts`, `apps/api`, `apps/web`

---

## 1. Context & Business Need

In commercial retail, wholesale, and multi-branch enterprises, inventory is rarely stored in a single physical location. Businesses operate:

1. **Central Distribution Warehouses (CEDI / Depósito Principal)**: Where bulk purchasing receptions arrive from suppliers.
2. **Branch Retail Stores / POS Locations (Sucursales / Puntos de Venta)**: Where customer foot traffic is serviced.
3. **In-Transit Fleet / Mobile Delivery Units**: Goods loaded on trucks moving between branches or out for customer delivery.

### Current Limitation:

Currently, CoreBiz tracks inventory balances globally per tenant (`Product.onHand` and `stock_movements`), without partitioning stock across physical locations. A sale in Branch A reduces global stock, preventing store managers from knowing if Branch B has physical units available to satisfy an order.

### Business Objective:

- Support multiple physical warehouses (`Warehouse`) per tenant with one designated default warehouse.
- Maintain isolated stock counters per `(tenantId, productId, warehouseId)`.
- Support formal **Inter-Warehouse Transfers (`InterWarehouseTransfer`)** with a two-phase state machine: `DRAFT` -> `IN_TRANSIT` (deducts source warehouse, adds to transit) -> `COMPLETED` (deducts transit, adds to destination warehouse) or `CANCELLED` (reverts back to source warehouse).

---

## 2. Ubiquitous Language & Core Concepts

- **Warehouse**: An aggregate representing a physical location where inventory resides.
  - `isDefault`: Indicates the primary warehouse used when no explicit location is specified.
  - `isActive`: Boolean flag indicating if the location can receive or dispatch stock.
- **WarehouseStock**: Read model or projection representing on-hand, reserved, and available quantity for a specific SKU in a specific warehouse.
- **InterWarehouseTransfer**: An aggregate modeling the transfer of stock between two distinct warehouses:
  - `sourceWarehouseId`: Origin of the goods.
  - `destinationWarehouseId`: Intended destination (must differ from source).
  - `transferNumber`: Sequential identifier (e.g. `TRF-000001`).
  - `status`:
    - `DRAFT`: Planned transfer, no stock affected.
    - `IN_TRANSIT`: Stock has left source warehouse and is on vehicle/courier.
    - `COMPLETED`: Stock physically verified and received at destination warehouse.
    - `CANCELLED`: Transfer aborted; stock restored to source warehouse.

---

## 3. Architecture & File Structure

```text
packages/domain/
  src/
    inventory/
      model/
        warehouse.ts                     # Warehouse aggregate
        warehouse-stock.ts               # Stock balance per location
        inter-warehouse-transfer.ts      # Transfer aggregate & state machine
      port/
        warehouse-repository.ts          # Warehouse persistence port
        transfer-repository.ts           # Transfer persistence port
packages/application/
  src/
    inventory/
      commands/
        create-warehouse.command.ts
        initiate-transfer.command.ts
        receive-transfer.command.ts
        cancel-transfer.command.ts
      queries/
        list-warehouses.query.ts
        get-warehouse-stock.query.ts
        list-transfers.query.ts
packages/contracts/
  src/
    warehouses.ts                        # Zod schemas & DTOs
    transfers.ts
apps/api/
  src/
    modules/
      inventory/
        controllers/
          create-warehouse.controller.ts
          list-warehouses.controller.ts
          initiate-transfer.controller.ts
          receive-transfer.controller.ts
          list-transfers.controller.ts
apps/web/
  src/
    app/(app)/
      inventory/
        warehouses/
          page.tsx                       # Warehouses management screen
        transfers/
          page.tsx                       # Inter-branch transfer requests screen
```

---

## 4. Domain Models & Invariants

### 4.1. Invariants:

1. **Distinct Locations Invariant**: `sourceWarehouseId !== destinationWarehouseId`. Self-transfers are invalid.
2. **Sufficient Stock Invariant**: When transitioning to `IN_TRANSIT`, source warehouse must have `availableStock >= requestedQuantity`. Negative warehouse stock is forbidden.
3. **At-Most-One Default**: A tenant can have exactly one default warehouse. Creating or updating a warehouse as default demotes any previous default.
4. **Conservation of Mass**: Total units across all locations + in-transit equals total tenant stock.

---

## 5. Acceptance Criteria (Given / When / Then)

### Scenario 1: Successful Inter-Warehouse Transfer Execution

- **Given**: Warehouse A ("Depósito Principal") has 50 units of SKU `SKU-MILK-01`.
- **And**: Warehouse B ("Sucursal Este") has 0 units of SKU `SKU-MILK-01`.
- **When**: The warehouse manager initiates a transfer of 20 units from Warehouse A to Warehouse B.
- **Then**: Transfer status becomes `IN_TRANSIT`.
- **And**: Warehouse A available stock drops to 30 units.
- **And**: In-transit stock records 20 units.
- **When**: The receiving clerk in Warehouse B confirms physical reception.
- **Then**: Transfer status becomes `COMPLETED`.
- **And**: Warehouse B stock becomes 20 units.
- **And**: In-transit stock drops to 0 units.

### Scenario 2: Prevention of Over-Drafting Warehouse Stock

- **Given**: Warehouse A has 10 units of SKU `SKU-BREAD-01`.
- **When**: An operator attempts to initiate a transfer of 15 units to Warehouse B.
- **Then**: The system rejects the command with `InsufficientWarehouseStockException`.
- **And**: Zero stock movements are recorded.

---

## 6. Quality Gates & Test Plan

1. **Domain Unit Tests**: Vitest tests on `Warehouse` and `InterWarehouseTransfer` aggregates checking state transitions and quantity conservation.
2. **Concurrency Test**: Simultaneous dispatches from the same warehouse do not cause race conditions or negative balances.
3. **Playwright E2E**: Web UI test creating a secondary warehouse, executing a transfer, and verifying stock table update.
