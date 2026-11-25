# Senior QA Master Plan & Adversarial Matrix: TICKET-019

**Feature**: Multi-Warehouse & Inter-Branch Stock Transfers Engine  
**Scope**: `@corebiz/domain`, `@corebiz/application`, `@corebiz/contracts`, `apps/api`

---

## 1. Business Model Context & Ubiquitous Language

Enterprises with multiple retail branches, distribution hubs, or secondary storage facilities require strict physical stock segregation and auditable inventory movement:

- **Warehouse (`Warehouse`)**: Physical or logical location holding stock for a tenant. Exactly one warehouse per tenant can be designated as `isDefault`.
- **Inter-Warehouse Transfer (`InterWarehouseTransfer`)**: Formal shipment of items from a source warehouse to a destination warehouse.
- **In-Transit Reservation (`IN_TRANSIT`)**: Stock deducted from the source warehouse upon transfer dispatch, temporarily in transit between locations.
- **Physical Receipt (`COMPLETED`)**: Confirmation that physical merchandise arrived at destination warehouse, increasing its available stock.
- **Shipment Cancellation (`CANCELLED`)**: Voiding of the transfer order before receipt, triggering automated stock rollback to the originating warehouse.

---

## 2. What Was Built & Architectural Rationale

1. **Contracts Layer (`@corebiz/contracts`)**:
   - `warehouseSchema` & `createWarehouseSchema` (code, name, address, isDefault).
   - `transferStatusSchema` (`DRAFT`, `IN_TRANSIT`, `COMPLETED`, `CANCELLED`).
   - `initiateTransferSchema` & `cancelTransferSchema`.
2. **Domain Layer (`@corebiz/domain`)**:
   - `Warehouse` Aggregate: Validates alphanumeric uppercase code, manages activation and default toggle.
   - `InterWarehouseTransfer` Aggregate: Manages state machine transitions (`DRAFT` -> `IN_TRANSIT` -> `COMPLETED` / `CANCELLED`), non-empty line validation, and cancellation reason requirement.
   - Ports: `WarehouseRepository` and `TransferRepository`.
3. **Application Layer (`@corebiz/application`)**:
   - `CreateWarehouseCommandHandler`: Prevents duplicate warehouse codes per tenant, automatically demotes prior default warehouse.
   - `InitiateTransferCommandHandler`: Validates active status of both warehouses, enforces distinct source/destination, asserts sufficient stock, reserves stock, and assigns consecutive `TRF-XXXXXX` sequence.
   - `ReceiveTransferCommandHandler`: Completes transfer and adds quantities to destination warehouse stock.
   - `CancelTransferCommandHandler`: Cancels transfer and returns reserved quantities back to source warehouse.
   - Queries: `ListWarehousesQueryHandler`, `ListTransfersQueryHandler`, `GetWarehouseStockQueryHandler`.
4. **API Controllers & Module (`apps/api`)**:
   - `POST /v1/inventory/warehouses`: Create warehouse.
   - `GET /v1/inventory/warehouses`: List tenant warehouses.
   - `GET /v1/inventory/warehouses/:warehouseId/stock/:productId`: Query warehouse-specific stock.
   - `POST /v1/inventory/transfers`: Initiate transfer.
   - `GET /v1/inventory/transfers`: List tenant transfers.
   - `POST /v1/inventory/transfers/:id/receive`: Confirm physical receipt.
   - `POST /v1/inventory/transfers/:id/cancel`: Cancel transfer and rollback stock.
   - `InventoryModule` registered in `AppModule`.

---

## 3. 4-Tier Adversarial Test Matrix

### Tier 1: Nominal Transfer Lifecycle

- Register Central Warehouse (`CENTRAL`) and Branch 1 (`BRANCH-1`).
- Set initial stock of 100 units of Product A at Central.
- Initiate transfer of 30 units from Central to Branch 1.
- Assert source stock decreases to 70 units immediately (`IN_TRANSIT`).
- Assert transfer number assigned is `TRF-000001`.
- Receive transfer at Branch 1 -> Status transitions to `COMPLETED`.
- Assert destination stock increases to 30 units.

### Tier 2: Cancellation & Reversal Integrity

- Initiate transfer of 20 units of Product B from Source to Destination.
- Assert source stock decreases from 50 to 30 units.
- Cancel transfer with formal reason ("Damaged packaging during transit load").
- Assert status transitions to `CANCELLED`.
- Assert source warehouse stock is restored to 50 units.
- Assert attempt to cancel without a reason fails with `CancelReasonRequired`.

### Tier 3: Invariant Protection & Guardrails

- **Same Location**: Attempt to initiate transfer where `sourceWarehouseId === destinationWarehouseId` -> Fails with `SameSourceAndDestination`.
- **Inactive Warehouse**: Attempt to dispatch from or receive into an inactive warehouse -> Fails with `SourceWarehouseInactive` or `DestinationWarehouseInactive`.
- **Insufficient Stock**: Attempt to transfer 25 units when only 10 exist at source -> Fails with `InsufficientWarehouseStock`.
- **Finalized Mutation**: Attempt to receive or cancel a transfer that is already `COMPLETED` or `CANCELLED` -> Fails with `InvalidTransferStatusTransition` or `TransferAlreadyFinalized`.

### Tier 4: Multi-Tenant Boundary & Default Warehouse Demotion

- Register default warehouse `WH-01` for Tenant Alpha.
- Register second warehouse `WH-02` with `isDefault: true` for Tenant Alpha.
- Assert `WH-01` is automatically demoted (`isDefault: false`) and `WH-02` is now default.
- Create warehouse `MAIN` in Tenant Alpha and `MAIN` in Tenant Beta -> Succeeds without conflict.
- Assert Tenant Alpha cannot view, transfer to, or query stock of Tenant Beta warehouses.
