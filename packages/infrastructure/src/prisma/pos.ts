import { randomUUID } from 'node:crypto';
import {
  asId,
  Money,
  Quantity,
  PosRegister,
  PosDevice,
  CashShift,
  PosSale,
  InventoryConflict,
  type PosRegisterId,
  type PosRegisterStatus,
  type PosDeviceId,
  type PosDeviceStatus,
  type PosShiftId,
  type CashShiftStatus,
  type CashMovementType,
  type PosSaleId,
  type PosSaleStatus,
  type PosPaymentMethod,
  type InventoryConflictId,
  type ConflictType,
  type ConflictStatus,
  type ConflictResolutionType,
  type TenantId,
  type UserId,
  type ProductId,
} from '@corebiz/domain';
import type {
  PosRegisterRepository,
  PosDeviceRepository,
  CashShiftRepository,
  PosSaleRepository,
  InventoryConflictRepository,
  PosSyncOperationRepository,
  PosSyncOperation,
} from '@corebiz/application';
import type { Tx } from './session';

export class PrismaPosRegisterRepository implements PosRegisterRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  async findById(id: PosRegisterId): Promise<PosRegister | null> {
    const row = await this.tx.pos_registers.findFirst({
      where: { tenant_id: this.tenantId, id },
    });
    if (!row) return null;
    return PosRegister.rehydrate({
      id: asId<PosRegisterId>(row.id),
      tenantId: asId<TenantId>(row.tenant_id),
      name: row.name,
      code: row.code,
      status: row.status as PosRegisterStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  async findByCode(code: string): Promise<PosRegister | null> {
    const row = await this.tx.pos_registers.findFirst({
      where: { tenant_id: this.tenantId, code: code.toUpperCase() },
    });
    if (!row) return null;
    return PosRegister.rehydrate({
      id: asId<PosRegisterId>(row.id),
      tenantId: asId<TenantId>(row.tenant_id),
      name: row.name,
      code: row.code,
      status: row.status as PosRegisterStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  async list(filter?: { status?: string }): Promise<readonly PosRegister[]> {
    const rows = await this.tx.pos_registers.findMany({
      where: {
        tenant_id: this.tenantId,
        ...(filter?.status ? { status: filter.status } : {}),
      },
      orderBy: { code: 'asc' },
    });
    return rows.map((row) =>
      PosRegister.rehydrate({
        id: asId<PosRegisterId>(row.id),
        tenantId: asId<TenantId>(row.tenant_id),
        name: row.name,
        code: row.code,
        status: row.status as PosRegisterStatus,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    );
  }

  async save(register: PosRegister): Promise<void> {
    await this.tx.pos_registers.upsert({
      where: { id: register.id },
      create: {
        id: register.id,
        tenant_id: this.tenantId,
        name: register.name,
        code: register.code,
        status: register.status,
        created_at: register.createdAt,
        updated_at: register.updatedAt,
      },
      update: {
        name: register.name,
        status: register.status,
        updated_at: register.updatedAt,
      },
    });
  }
}

export class PrismaPosDeviceRepository implements PosDeviceRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  async findById(id: PosDeviceId): Promise<PosDevice | null> {
    const row = await this.tx.pos_devices.findFirst({
      where: { tenant_id: this.tenantId, id },
    });
    if (!row) return null;
    return PosDevice.rehydrate({
      id: asId<PosDeviceId>(row.id),
      tenantId: asId<TenantId>(row.tenant_id),
      installationId: row.installation_id,
      name: row.name,
      platform: row.platform,
      browser: row.browser,
      status: row.status as PosDeviceStatus,
      deviceTokenHash: row.device_token_hash,
      registeredAt: row.registered_at,
      lastSeenAt: row.last_seen_at,
    });
  }

  async findByInstallationId(installationId: string): Promise<PosDevice | null> {
    const row = await this.tx.pos_devices.findFirst({
      where: { tenant_id: this.tenantId, installation_id: installationId },
    });
    if (!row) return null;
    return PosDevice.rehydrate({
      id: asId<PosDeviceId>(row.id),
      tenantId: asId<TenantId>(row.tenant_id),
      installationId: row.installation_id,
      name: row.name,
      platform: row.platform,
      browser: row.browser,
      status: row.status as PosDeviceStatus,
      deviceTokenHash: row.device_token_hash,
      registeredAt: row.registered_at,
      lastSeenAt: row.last_seen_at,
    });
  }

  async save(device: PosDevice): Promise<void> {
    await this.tx.pos_devices.upsert({
      where: { id: device.id },
      create: {
        id: device.id,
        tenant_id: this.tenantId,
        installation_id: device.installationId,
        name: device.name,
        platform: device.platform,
        browser: device.browser,
        status: device.status,
        device_token_hash: device.deviceTokenHash,
        registered_at: device.registeredAt,
        last_seen_at: device.lastSeenAt,
      },
      update: {
        name: device.name,
        status: device.status,
        device_token_hash: device.deviceTokenHash,
        last_seen_at: device.lastSeenAt,
      },
    });
  }
}

export class PrismaCashShiftRepository implements CashShiftRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  async findById(id: PosShiftId): Promise<CashShift | null> {
    const row = await this.tx.pos_cash_shifts.findFirst({
      where: { tenant_id: this.tenantId, id },
      include: { cash_movements: true },
    });
    if (!row) return null;

    const cashSales = await this.tx.pos_sales.aggregate({
      where: {
        tenant_id: this.tenantId,
        shift_id: row.id,
        payment_method: 'cash',
        status: 'completed',
      },
      _sum: { total_minor: true },
    });

    return CashShift.rehydrate({
      id: asId<PosShiftId>(row.id),
      tenantId: asId<TenantId>(row.tenant_id),
      registerId: asId<PosRegisterId>(row.register_id),
      deviceId: asId<PosDeviceId>(row.device_id),
      openedByUserId: asId<UserId>(row.opened_by_user_id),
      openedAt: row.opened_at,
      initialFloat: Money.fromMinor(row.initial_float_minor, 'USD'),
      status: row.status as CashShiftStatus,
      closedByUserId: row.closed_by_user_id ? asId<UserId>(row.closed_by_user_id) : null,
      closedAt: row.closed_at,
      declaredCash:
        row.declared_cash_minor != null ? Money.fromMinor(row.declared_cash_minor, 'USD') : null,
      systemCash:
        row.system_cash_minor != null ? Money.fromMinor(row.system_cash_minor, 'USD') : null,
      cashVariance:
        row.cash_variance_minor != null ? Money.fromMinor(row.cash_variance_minor, 'USD') : null,
      notes: row.notes,
      movements: row.cash_movements.map((m) => ({
        id: m.id,
        type: m.movement_type as CashMovementType,
        amount: Money.fromMinor(m.amount_minor, 'USD'),
        reason: m.reason,
        occurredAt: m.occurred_at,
      })),
      totalCashSales: Money.fromMinor(cashSales._sum.total_minor ?? 0n, 'USD'),
    });
  }

  async findActiveByRegisterId(registerId: PosRegisterId): Promise<CashShift | null> {
    const row = await this.tx.pos_cash_shifts.findFirst({
      where: { tenant_id: this.tenantId, register_id: registerId, status: 'open' },
      include: { cash_movements: true },
    });
    if (!row) return null;

    const cashSales = await this.tx.pos_sales.aggregate({
      where: {
        tenant_id: this.tenantId,
        shift_id: row.id,
        payment_method: 'cash',
        status: 'completed',
      },
      _sum: { total_minor: true },
    });

    return CashShift.rehydrate({
      id: asId<PosShiftId>(row.id),
      tenantId: asId<TenantId>(row.tenant_id),
      registerId: asId<PosRegisterId>(row.register_id),
      deviceId: asId<PosDeviceId>(row.device_id),
      openedByUserId: asId<UserId>(row.opened_by_user_id),
      openedAt: row.opened_at,
      initialFloat: Money.fromMinor(row.initial_float_minor, 'USD'),
      status: row.status as CashShiftStatus,
      closedByUserId: row.closed_by_user_id ? asId<UserId>(row.closed_by_user_id) : null,
      closedAt: row.closed_at,
      declaredCash:
        row.declared_cash_minor != null ? Money.fromMinor(row.declared_cash_minor, 'USD') : null,
      systemCash:
        row.system_cash_minor != null ? Money.fromMinor(row.system_cash_minor, 'USD') : null,
      cashVariance:
        row.cash_variance_minor != null ? Money.fromMinor(row.cash_variance_minor, 'USD') : null,
      notes: row.notes,
      movements: row.cash_movements.map((m) => ({
        id: m.id,
        type: m.movement_type as CashMovementType,
        amount: Money.fromMinor(m.amount_minor, 'USD'),
        reason: m.reason,
        occurredAt: m.occurred_at,
      })),
      totalCashSales: Money.fromMinor(cashSales._sum.total_minor ?? 0n, 'USD'),
    });
  }

  async save(shift: CashShift): Promise<void> {
    await this.tx.pos_cash_shifts.upsert({
      where: { id: shift.id },
      create: {
        id: shift.id,
        tenant_id: this.tenantId,
        register_id: shift.registerId,
        device_id: shift.deviceId,
        opened_by_user_id: shift.openedByUserId,
        opened_at: shift.openedAt,
        initial_float_minor: shift.initialFloat.minorUnits,
        status: shift.status,
        closed_by_user_id: shift.closedByUserId,
        closed_at: shift.closedAt,
        declared_cash_minor: shift.declaredCash?.minorUnits ?? null,
        system_cash_minor: shift.systemCash?.minorUnits ?? null,
        cash_variance_minor: shift.cashVariance?.minorUnits ?? null,
        notes: shift.notes,
      },
      update: {
        status: shift.status,
        closed_by_user_id: shift.closedByUserId,
        closed_at: shift.closedAt,
        declared_cash_minor: shift.declaredCash?.minorUnits ?? null,
        system_cash_minor: shift.systemCash?.minorUnits ?? null,
        cash_variance_minor: shift.cashVariance?.minorUnits ?? null,
        notes: shift.notes,
      },
    });

    for (const mov of shift.movements) {
      await this.tx.pos_cash_movements.upsert({
        where: { id: mov.id },
        create: {
          id: mov.id,
          tenant_id: this.tenantId,
          shift_id: shift.id,
          movement_type: mov.type,
          amount_minor: mov.amount.minorUnits,
          reason: mov.reason,
          occurred_at: mov.occurredAt,
        },
        update: {},
      });
    }
  }
}

export class PrismaPosSaleRepository implements PosSaleRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  async findById(id: PosSaleId): Promise<PosSale | null> {
    const row = await this.tx.pos_sales.findFirst({
      where: { tenant_id: this.tenantId, id },
      include: {
        lines: {
          include: {
            product: {
              select: { name: true },
            },
          },
        },
      },
    });
    if (!row) return null;

    return PosSale.rehydrate({
      id: asId<PosSaleId>(row.id),
      tenantId: asId<TenantId>(row.tenant_id),
      registerId: asId<PosRegisterId>(row.register_id),
      deviceId: asId<PosDeviceId>(row.device_id),
      shiftId: asId<PosShiftId>(row.shift_id),
      cashierUserId: asId<UserId>(row.cashier_user_id),
      operationId: row.operation_id,
      ticketNumber: row.ticket_number,
      status: row.status as PosSaleStatus,
      subtotal: Money.fromMinor(row.subtotal_minor, 'USD'),
      tax: Money.fromMinor(row.tax_minor, 'USD'),
      total: Money.fromMinor(row.total_minor, 'USD'),
      paymentMethod: row.payment_method as PosPaymentMethod,
      occurredAt: row.occurred_at,
      receivedAt: row.received_at,
      postedAt: row.posted_at,
      lines: row.lines.map((l) => ({
        id: l.id,
        productId: l.product_id ? asId<ProductId>(l.product_id) : null,
        temporaryName: l.temporary_name ?? l.product?.name ?? null,
        barcodeScanned: l.barcode_scanned,
        quantity: Quantity.fromScaled(l.quantity),
        unitPrice: Money.fromMinor(l.unit_price_minor, 'USD'),
        lineTotal: Money.fromMinor(l.line_total_minor, 'USD'),
      })),
    });
  }

  async findByOperationId(operationId: string): Promise<PosSale | null> {
    const row = await this.tx.pos_sales.findFirst({
      where: { tenant_id: this.tenantId, operation_id: operationId },
      include: {
        lines: {
          include: {
            product: {
              select: { name: true },
            },
          },
        },
      },
    });
    if (!row) return null;

    return PosSale.rehydrate({
      id: asId<PosSaleId>(row.id),
      tenantId: asId<TenantId>(row.tenant_id),
      registerId: asId<PosRegisterId>(row.register_id),
      deviceId: asId<PosDeviceId>(row.device_id),
      shiftId: asId<PosShiftId>(row.shift_id),
      cashierUserId: asId<UserId>(row.cashier_user_id),
      operationId: row.operation_id,
      ticketNumber: row.ticket_number,
      status: row.status as PosSaleStatus,
      subtotal: Money.fromMinor(row.subtotal_minor, 'USD'),
      tax: Money.fromMinor(row.tax_minor, 'USD'),
      total: Money.fromMinor(row.total_minor, 'USD'),
      paymentMethod: row.payment_method as PosPaymentMethod,
      occurredAt: row.occurred_at,
      receivedAt: row.received_at,
      postedAt: row.posted_at,
      lines: row.lines.map((l) => ({
        id: l.id,
        productId: l.product_id ? asId<ProductId>(l.product_id) : null,
        temporaryName: l.temporary_name ?? l.product?.name ?? null,
        barcodeScanned: l.barcode_scanned,
        quantity: Quantity.fromScaled(l.quantity),
        unitPrice: Money.fromMinor(l.unit_price_minor, 'USD'),
        lineTotal: Money.fromMinor(l.line_total_minor, 'USD'),
      })),
    });
  }

  async list(filter?: { limit?: number; cursor?: string }): Promise<readonly PosSale[]> {
    const limit = Math.min(100, Math.max(1, filter?.limit ?? 50));
    const rows = await this.tx.pos_sales.findMany({
      where: { tenant_id: this.tenantId },
      include: {
        lines: {
          include: {
            product: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { occurred_at: 'desc' },
      take: limit,
      ...(filter?.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });

    return rows.map((row) =>
      PosSale.rehydrate({
        id: asId<PosSaleId>(row.id),
        tenantId: asId<TenantId>(row.tenant_id),
        registerId: asId<PosRegisterId>(row.register_id),
        deviceId: asId<PosDeviceId>(row.device_id),
        shiftId: asId<PosShiftId>(row.shift_id),
        cashierUserId: asId<UserId>(row.cashier_user_id),
        operationId: row.operation_id,
        ticketNumber: row.ticket_number,
        status: row.status as PosSaleStatus,
        subtotal: Money.fromMinor(row.subtotal_minor, 'USD'),
        tax: Money.fromMinor(row.tax_minor, 'USD'),
        total: Money.fromMinor(row.total_minor, 'USD'),
        paymentMethod: row.payment_method as PosPaymentMethod,
        occurredAt: row.occurred_at,
        receivedAt: row.received_at,
        postedAt: row.posted_at,
        lines: row.lines.map((l) => ({
          id: l.id,
          productId: l.product_id ? asId<ProductId>(l.product_id) : null,
          temporaryName: l.temporary_name ?? l.product?.name ?? null,
          barcodeScanned: l.barcode_scanned,
          quantity: Quantity.fromScaled(l.quantity),
          unitPrice: Money.fromMinor(l.unit_price_minor, 'USD'),
          lineTotal: Money.fromMinor(l.line_total_minor, 'USD'),
        })),
      }),
    );
  }

  async save(sale: PosSale): Promise<void> {
    await this.tx.pos_sales.upsert({
      where: { id: sale.id },
      create: {
        id: sale.id,
        tenant_id: this.tenantId,
        register_id: sale.registerId,
        device_id: sale.deviceId,
        shift_id: sale.shiftId,
        cashier_user_id: sale.cashierUserId,
        operation_id: sale.operationId,
        ticket_number: sale.ticketNumber,
        status: sale.status,
        subtotal_minor: sale.subtotal.minorUnits,
        tax_minor: sale.tax.minorUnits,
        total_minor: sale.total.minorUnits,
        payment_method: sale.paymentMethod,
        occurred_at: sale.occurredAt,
        received_at: sale.receivedAt,
        posted_at: sale.postedAt,
      },
      update: {
        status: sale.status,
      },
    });

    for (const line of sale.lines) {
      await this.tx.pos_sale_lines.upsert({
        where: { id: line.id },
        create: {
          id: line.id,
          tenant_id: this.tenantId,
          sale_id: sale.id,
          product_id: line.productId,
          temporary_name: line.temporaryName,
          barcode_scanned: line.barcodeScanned,
          quantity: line.quantity.scaledValue,
          unit_price_minor: line.unitPrice.minorUnits,
          line_total_minor: line.lineTotal.minorUnits,
        },
        update: {},
      });
    }
  }
}

export class PrismaInventoryConflictRepository implements InventoryConflictRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  async findById(id: InventoryConflictId): Promise<InventoryConflict | null> {
    const row = await this.tx.inventory_conflicts.findFirst({
      where: { tenant_id: this.tenantId, id },
      include: { conflict_movements: true },
    });
    if (!row) return null;

    return InventoryConflict.rehydrate({
      id: asId<InventoryConflictId>(row.id),
      tenantId: asId<TenantId>(row.tenant_id),
      productId: row.product_id ? asId<ProductId>(row.product_id) : null,
      conflictType: row.conflict_type as ConflictType,
      status: row.status as ConflictStatus,
      detectedAt: row.detected_at,
      stockBefore: row.stock_before,
      quantityAttempted: row.quantity_attempted,
      stockAfter: row.stock_after,
      shortageQuantity: row.shortage_quantity,
      assignedTo: row.assigned_to ? asId<UserId>(row.assigned_to) : null,
      resolutionType: row.resolution_type as ConflictResolutionType | null,
      resolutionNotes: row.resolution_notes,
      resolvedBy: row.resolved_by ? asId<UserId>(row.resolved_by) : null,
      resolvedAt: row.resolved_at,
      relations: row.conflict_movements.map((m) => ({
        id: m.id,
        stockMovementId: m.stock_movement_id,
        saleId: m.sale_id,
        relationType: m.relation_type as 'cause' | 'context' | 'resolution',
        createdAt: m.created_at,
      })),
    });
  }

  async findOpenByProductId(productId: string): Promise<InventoryConflict | null> {
    const row = await this.tx.inventory_conflicts.findFirst({
      where: {
        tenant_id: this.tenantId,
        product_id: productId,
        status: { in: ['open', 'investigating'] },
      },
      include: { conflict_movements: true },
    });
    if (!row) return null;

    return InventoryConflict.rehydrate({
      id: asId<InventoryConflictId>(row.id),
      tenantId: asId<TenantId>(row.tenant_id),
      productId: row.product_id ? asId<ProductId>(row.product_id) : null,
      conflictType: row.conflict_type as ConflictType,
      status: row.status as ConflictStatus,
      detectedAt: row.detected_at,
      stockBefore: row.stock_before,
      quantityAttempted: row.quantity_attempted,
      stockAfter: row.stock_after,
      shortageQuantity: row.shortage_quantity,
      assignedTo: row.assigned_to ? asId<UserId>(row.assigned_to) : null,
      resolutionType: row.resolution_type as ConflictResolutionType | null,
      resolutionNotes: row.resolution_notes,
      resolvedBy: row.resolved_by ? asId<UserId>(row.resolved_by) : null,
      resolvedAt: row.resolved_at,
      relations: row.conflict_movements.map((m) => ({
        id: m.id,
        stockMovementId: m.stock_movement_id,
        saleId: m.sale_id,
        relationType: m.relation_type as 'cause' | 'context' | 'resolution',
        createdAt: m.created_at,
      })),
    });
  }

  async list(filter?: { status?: string }): Promise<readonly InventoryConflict[]> {
    const rows = await this.tx.inventory_conflicts.findMany({
      where: {
        tenant_id: this.tenantId,
        ...(filter?.status ? { status: filter.status } : {}),
      },
      include: { conflict_movements: true },
      orderBy: { detected_at: 'desc' },
    });

    return rows.map((row) =>
      InventoryConflict.rehydrate({
        id: asId<InventoryConflictId>(row.id),
        tenantId: asId<TenantId>(row.tenant_id),
        productId: row.product_id ? asId<ProductId>(row.product_id) : null,
        conflictType: row.conflict_type as ConflictType,
        status: row.status as ConflictStatus,
        detectedAt: row.detected_at,
        stockBefore: row.stock_before,
        quantityAttempted: row.quantity_attempted,
        stockAfter: row.stock_after,
        shortageQuantity: row.shortage_quantity,
        assignedTo: row.assigned_to ? asId<UserId>(row.assigned_to) : null,
        resolutionType: row.resolution_type as ConflictResolutionType | null,
        resolutionNotes: row.resolution_notes,
        resolvedBy: row.resolved_by ? asId<UserId>(row.resolved_by) : null,
        resolvedAt: row.resolved_at,
        relations: row.conflict_movements.map((m) => ({
          id: m.id,
          stockMovementId: m.stock_movement_id,
          saleId: m.sale_id,
          relationType: m.relation_type as 'cause' | 'context' | 'resolution',
          createdAt: m.created_at,
        })),
      }),
    );
  }

  async save(conflict: InventoryConflict): Promise<void> {
    await this.tx.inventory_conflicts.upsert({
      where: { id: conflict.id },
      create: {
        id: conflict.id,
        tenant_id: this.tenantId,
        product_id: conflict.productId,
        conflict_type: conflict.conflictType,
        status: conflict.status,
        detected_at: conflict.detectedAt,
        stock_before: conflict.stockBefore,
        quantity_attempted: conflict.quantityAttempted,
        stock_after: conflict.stockAfter,
        shortage_quantity: conflict.shortageQuantity,
        assigned_to: conflict.assignedTo,
        resolution_type: conflict.resolutionType,
        resolution_notes: conflict.resolutionNotes,
        resolved_by: conflict.resolvedBy,
        resolved_at: conflict.resolvedAt,
      },
      update: {
        status: conflict.status,
        assigned_to: conflict.assignedTo,
        resolution_type: conflict.resolutionType,
        resolution_notes: conflict.resolutionNotes,
        resolved_by: conflict.resolvedBy,
        resolved_at: conflict.resolvedAt,
      },
    });

    for (const rel of conflict.relations) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rel.id);
      const rowId = isUuid ? rel.id : randomUUID();
      await this.tx.inventory_conflict_movements.upsert({
        where: { id: rowId },
        create: {
          id: rowId,
          tenant_id: this.tenantId,
          conflict_id: conflict.id,
          stock_movement_id: rel.stockMovementId,
          sale_id: rel.saleId,
          relation_type: rel.relationType,
          created_at: rel.createdAt,
        },
        update: {},
      });
    }
  }
}

export class PrismaPosSyncOperationRepository implements PosSyncOperationRepository {
  constructor(
    private readonly tx: Tx,
    private readonly tenantId: TenantId,
  ) {}

  async findByOperationId(operationId: string): Promise<PosSyncOperation | null> {
    const row = await this.tx.pos_sync_operations.findFirst({
      where: { tenant_id: this.tenantId, operation_id: operationId },
    });
    if (!row) return null;

    return {
      id: row.id,
      operationId: row.operation_id,
      deviceId: row.device_id,
      operationType: row.operation_type,
      sequence: Number(row.sequence),
      payloadHash: row.payload_hash,
      status: row.status as 'received' | 'processed' | 'failed',
      receivedAt: row.received_at,
      processedAt: row.processed_at,
      errorMessage: row.error_message,
    };
  }

  async save(operation: PosSyncOperation): Promise<void> {
    const existing = await this.tx.pos_sync_operations.findFirst({
      where: { tenant_id: this.tenantId, operation_id: operation.operationId },
    });

    let seqToUse = BigInt(operation.sequence);
    const existingSeq = await this.tx.pos_sync_operations.findFirst({
      where: {
        tenant_id: this.tenantId,
        device_id: operation.deviceId,
        sequence: seqToUse,
      },
    });

    if (existingSeq && existingSeq.operation_id !== operation.operationId) {
      const maxRow = await this.tx.pos_sync_operations.findFirst({
        where: { tenant_id: this.tenantId, device_id: operation.deviceId },
        orderBy: { sequence: 'desc' },
      });
      seqToUse = (maxRow?.sequence ?? 0n) + 1n;
    }

    if (existing) {
      await this.tx.pos_sync_operations.update({
        where: { id: existing.id },
        data: {
          status: operation.status,
          processed_at: operation.processedAt,
          error_message: operation.errorMessage,
        },
      });
    } else {
      await this.tx.pos_sync_operations.create({
        data: {
          id: operation.id,
          tenant_id: this.tenantId,
          operation_id: operation.operationId,
          device_id: operation.deviceId,
          operation_type: operation.operationType,
          sequence: seqToUse,
          payload_hash: operation.payloadHash,
          status: operation.status,
          received_at: operation.receivedAt,
          processed_at: operation.processedAt,
          error_message: operation.errorMessage,
        },
      });
    }
  }
}
