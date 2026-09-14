import 'server-only';
import type {
  AuditEntryView,
  AuditFilter,
  CustomerDetail,
  CustomerListItem,
  CustomerOption,
  DeliveryNoteListItem,
  DeliveryNoteView,
  GoodsReceiptListItem,
  GoodsReceiptView,
  Page,
  PendingInvitationView,
  ProductDetail,
  ProductListItem,
  ProductOption,
  ReadModels,
  SalesReport,
  StockMovementItem,
  SupplierDetail,
  SupplierListItem,
  SupplierOption,
  TeamMemberView,
} from '@corebiz/application';
import { get, getOrNull } from './client';

/**
 * El lado de LECTURA, servido por HTTP.
 *
 * Implements `ReadModels`, the SAME port the database and memory adapters fulfil. That is
 * what reduced the migration to one line per screen: the 29 pages still write
 * `queries.customers.list(...)` and neither know nor need to know whether it ends in a SQL
 * query or a trip to the API.
 *
 * Es tambien la prueba de que el puerto estaba bien dibujado. Un puerto que hubiera
 * filtrado detalles de la base de datos no se podria cumplir por HTTP.
 */

/**
 * JSON no tiene fechas.
 *
 * Todo `Date` cruza como cadena ISO y hay que devolverlo a su sitio, o
 * `getFormatter().dateTime()` de next-intl pinta "Invalid Date" — que parece un fallo
 * de formato cuando en realidad es de transporte, y se busca en el sitio equivocado.
 *
 * Se revive CAMPO A CAMPO y no con un reviver generico por expresion regular. La razon
 * es concreta: `AuditEntryView.summary` es JSON arbitrario escrito por los usuarios, y
 * un reviver que convierta "toda cadena que parezca una fecha" acabaria transformando
 * datos ajenos que solo habia que mostrar.
 */
function toDate(value: string): Date {
  return new Date(value);
}

function toDateOrNull(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

/** Une los parametros de consulta, omitiendo lo que no se ha pedido. */
function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

/** Lo que viaja por el cable: lo mismo, con las fechas en texto. */
type Wire<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | null
      ? string | null
      : T[K] extends readonly (infer U)[]
        ? readonly Wire<U>[]
        : T[K];
};

export function httpReadModels(): ReadModels {
  return {
    customers: {
      list: (filter) =>
        get<Page<CustomerListItem>>(
          `/v1/customers${query({
            limit: filter.limit,
            cursor: filter.cursor,
            search: filter.search,
            includeArchived: filter.includeArchived,
          })}`,
        ),
      options: (limit) =>
        get<readonly CustomerOption[]>(`/v1/customers/options${query({ limit })}`),
      byId: (id) => getOrNull<CustomerDetail>(`/v1/customers/${encodeURIComponent(id)}`),
    },

    products: {
      list: (filter) =>
        get<Page<ProductListItem>>(
          `/v1/products${query({
            limit: filter.limit,
            search: filter.search,
            includeArchived: filter.includeArchived,
          })}`,
        ),
      options: (limit) => get<readonly ProductOption[]>(`/v1/products/options${query({ limit })}`),
      byId: (id) => getOrNull<ProductDetail>(`/v1/products/${encodeURIComponent(id)}`),
      movements: async (productId, limit) => {
        const rows = await get<readonly Wire<StockMovementItem>[]>(
          `/v1/products/${encodeURIComponent(productId)}/movements${query({ limit })}`,
        );
        return rows.map((row) => ({ ...row, at: toDate(row.at) }));
      },
    },

    deliveryNotes: {
      list: async (filter) => {
        const page = await get<Page<Wire<DeliveryNoteListItem>>>(
          `/v1/delivery-notes${query({ limit: filter.limit, status: filter.status })}`,
        );
        return {
          ...page,
          items: page.items.map((item) => ({ ...item, issuedAt: toDateOrNull(item.issuedAt) })),
        };
      },
      findById: async (id) => {
        const note = await getOrNull<Wire<DeliveryNoteView>>(
          `/v1/delivery-notes/${encodeURIComponent(id)}`,
        );
        if (note === null) return null;
        return {
          ...note,
          issuedAt: toDateOrNull(note.issuedAt),
          deliveredAt: toDateOrNull(note.deliveredAt),
          exchangeRateAt: toDate(note.exchangeRateAt),
        };
      },
    },

    usage: {
      /*
       * La API acepta varios recursos de una vez y aqui se pide uno.
       *
       * El puerto pregunta por uno solo, y respetarlo es lo que permite que este
       * adaptador sea sustituible por los otros dos. Las pantallas que necesitan
       * varias cuotas ya las piden en paralelo con `Promise.all`, asi que el ahorro
       * de agruparlas seria de una conexion, no de un viaje.
       */
      current: async (resource) => {
        const counts = await get<Record<string, number>>(
          `/v1/usage${query({ resources: resource })}`,
        );
        return counts[resource] ?? 0;
      },
    },

    reports: {
      salesSummary: () => get<SalesReport>('/v1/reports/sales-summary'),
    },

    admin: {
      team: async () => {
        const rows = await get<readonly Wire<TeamMemberView>[]>('/v1/administration/team');
        return rows.map((row) => ({ ...row, joinedAt: toDate(row.joinedAt) }));
      },
      pendingInvitations: async () => {
        const rows = await get<readonly Wire<PendingInvitationView>[]>(
          '/v1/administration/invitations',
        );
        return rows.map((row) => ({ ...row, expiresAt: toDate(row.expiresAt) }));
      },
      auditLog: async (filter: AuditFilter) => {
        const page = await get<Page<Wire<AuditEntryView>>>(
          `/v1/administration/audit${query({
            limit: filter.limit,
            cursor: filter.cursor,
            action: filter.action,
            actorEmail: filter.actorEmail,
            from: filter.from?.toISOString(),
            to: filter.to?.toISOString(),
          })}`,
        );
        return {
          ...page,
          items: page.items.map((item) => ({ ...item, occurredAt: toDate(item.occurredAt) })),
        };
      },
      auditActions: () => get<readonly string[]>('/v1/administration/audit/actions'),
    },

    purchasing: {
      suppliers: (filter) =>
        get<Page<SupplierListItem>>(
          `/v1/purchasing/suppliers${query({
            limit: filter.limit,
            cursor: filter.cursor,
            search: filter.search,
            includeArchived: filter.includeArchived,
          })}`,
        ),
      supplierOptions: (limit) =>
        get<readonly SupplierOption[]>(`/v1/purchasing/suppliers/options${query({ limit })}`),
      supplierById: (id) =>
        getOrNull<SupplierDetail>(`/v1/purchasing/suppliers/${encodeURIComponent(id)}`),
      receipts: async (filter) => {
        const page = await get<Page<Wire<GoodsReceiptListItem>>>(
          `/v1/purchasing/receipts${query({ limit: filter.limit })}`,
        );
        return {
          ...page,
          items: page.items.map((item) => ({ ...item, receivedAt: toDateOrNull(item.receivedAt) })),
        };
      },
      receiptById: async (id) => {
        const receipt = await getOrNull<Wire<GoodsReceiptView>>(
          `/v1/purchasing/receipts/${encodeURIComponent(id)}`,
        );
        if (receipt === null) return null;
        return { ...receipt, receivedAt: toDateOrNull(receipt.receivedAt) };
      },
    },
  };
}
