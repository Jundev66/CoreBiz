import 'server-only';
import type {
  AdjustStockInput,
  ChangeMemberRoleInput,
  CreateCustomerInput,
  CreateProductInput,
  CreateSupplierInput,
  InviteUserInput,
  IssueDeliveryNoteInput,
  MarkDeliveredInput,
  ReceiveGoodsInput,
  SetCustomerStatusInput,
  SetProductStatusInput,
  SetSupplierStatusInput,
  UpdateTenantSettingsInput,
  VoidDeliveryNoteInput,
  VoidGoodsReceiptInput,
} from '@corebiz/application';
import { send } from './client';

/**
 * El lado de ESCRITURA, servido por HTTP.
 *
 * Cada funcion tiene la misma firma que el caso de uso al que sustituye y devuelve un
 * `Result`, no una excepcion. Eso no es comodidad: es lo que permite que las Server
 * Actions sigan escritas igual —`if (!result.ok) return { status: 'error', errorKind:
 * result.error.kind }`— y que la traduccion de errores no cambie ni una clave.
 *
 * Lo que aqui NO hay, y es lo importante: ninguna regla de negocio. El permiso, la
 * cuota y el gate de plan los sigue decidiendo el caso de uso, ahora al otro lado del
 * cable. Esta capa solo traduce.
 */

/** Una cadena vacia no es un valor: es la ausencia de uno. */
function orUndefined(value: string | null | undefined): string | undefined {
  return value === null || value === undefined || value === '' ? undefined : value;
}

export function httpCommands() {
  return {
    createCustomer: (input: CreateCustomerInput) =>
      send<{ id: string; code: string }>('POST', '/v1/customers', {
        name: input.name,
        taxId: orUndefined(input.taxId),
        email: orUndefined(input.email),
        phone: orUndefined(input.phone),
        creditLimit: orUndefined(input.creditLimit),
      }),

    setCustomerStatus: (input: SetCustomerStatusInput) =>
      send<{ archived: boolean }>(
        'PATCH',
        `/v1/customers/${encodeURIComponent(input.customerId)}/status`,
        { archived: input.archived },
      ),

    createProduct: (input: CreateProductInput) =>
      send<{ id: string; sku: string }>('POST', '/v1/products', {
        sku: orUndefined(input.sku),
        name: input.name,
        price: input.price,
        unit: orUndefined(input.unit),
        cost: orUndefined(input.cost),
        initialStock: orUndefined(input.initialStock),
        minStock: orUndefined(input.minStock),
        taxable: input.taxable,
        trackStock: input.trackStock,
      }),

    setProductStatus: (input: SetProductStatusInput) =>
      send<{ archived: boolean }>(
        'PATCH',
        `/v1/products/${encodeURIComponent(input.productId)}/status`,
        { archived: input.archived },
      ),

    adjustStock: (input: AdjustStockInput) =>
      send<{ previous: string; current: string }>(
        'POST',
        `/v1/products/${encodeURIComponent(input.productId)}/stock-adjustments`,
        { newBalance: input.newBalance, reason: input.reason },
      ),

    issueDeliveryNote: (input: IssueDeliveryNoteInput) =>
      send<{ id: string; number: string }>('POST', '/v1/delivery-notes', {
        customerId: input.customerId,
        lines: input.lines,
        quoteId: orUndefined(input.quoteId),
        notes: orUndefined(input.notes),
      }),

    markDelivered: (input: MarkDeliveredInput) =>
      send<{ number: string }>(
        'POST',
        `/v1/delivery-notes/${encodeURIComponent(input.deliveryNoteId)}/deliver`,
        { receivedBy: input.receivedBy ?? '' },
      ),

    voidDeliveryNote: (input: VoidDeliveryNoteInput) =>
      send<{ number: string }>(
        'POST',
        `/v1/delivery-notes/${encodeURIComponent(input.deliveryNoteId)}/void`,
        { reason: input.reason },
      ),

    // ── Administracion ───────────────────────────────────────────────────────
    inviteUser: (input: InviteUserInput) =>
      send<{ id: string; email: string; token: string; expiresAt: string }>(
        'POST',
        '/v1/administration/invitations',
        { email: input.email, role: input.role },
      ),

    changeMemberRole: (input: ChangeMemberRoleInput) =>
      send<{ userId: string; role: string }>(
        'PATCH',
        `/v1/administration/members/${encodeURIComponent(input.userId)}`,
        { role: input.role },
      ),

    removeMember: (userId: string) =>
      send<{ userId: string }>(
        'DELETE',
        `/v1/administration/members/${encodeURIComponent(userId)}`,
      ),

    revokeInvitation: (invitationId: string) =>
      send<{ id: string }>(
        'DELETE',
        `/v1/administration/invitations/${encodeURIComponent(invitationId)}`,
      ),

    updateTenantSettings: (input: UpdateTenantSettingsInput) =>
      send<unknown>('PATCH', '/v1/administration/settings', input),

    // ── Compras ──────────────────────────────────────────────────────────────
    createSupplier: (input: CreateSupplierInput) =>
      send<{ id: string; code: string }>('POST', '/v1/purchasing/suppliers', {
        name: input.name,
        taxId: orUndefined(input.taxId),
        email: orUndefined(input.email),
        phone: orUndefined(input.phone),
        contactName: orUndefined(input.contactName),
        notes: orUndefined(input.notes),
      }),

    setSupplierStatus: (input: SetSupplierStatusInput) =>
      send<{ archived: boolean }>(
        'PATCH',
        `/v1/purchasing/suppliers/${encodeURIComponent(input.supplierId)}/status`,
        { archived: input.archived },
      ),

    receiveGoods: (input: ReceiveGoodsInput) =>
      send<{ id: string; number: string }>('POST', '/v1/purchasing/receipts', {
        supplierId: input.supplierId,
        lines: input.lines,
        supplierReference: orUndefined(input.supplierReference),
        notes: orUndefined(input.notes),
      }),

    voidGoodsReceipt: (input: VoidGoodsReceiptInput & { goodsReceiptId: string }) =>
      send<{ number: string }>(
        'POST',
        `/v1/purchasing/receipts/${encodeURIComponent(input.goodsReceiptId)}/void`,
        { reason: input.reason },
      ),
  } as const;
}
