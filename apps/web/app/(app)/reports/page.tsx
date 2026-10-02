import Link from 'next/link';
import { getTranslations, getFormatter } from 'next-intl/server';
import {
  BarChart3,
  Boxes,
  FileText,
  PieChart,
  TrendingUp,
  Wallet,
  CheckCircle2,
  ShoppingCart,
  UsersRound,
  AlertTriangle,
  Truck,
} from 'lucide-react';
import { withSession } from '@/api/session';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Stat } from '@/ui/primitives';
import { DesktopOnly, MobileList, MobileStaticItem } from '@/ui/list';
import { Badge } from '@/ui/feedback';
import { NoAccess } from '@/ui/no-access';
import { can } from '@corebiz/domain';
import { ReportsActions, type ContextualReportData } from '@/ui/reports-actions';

/**
 * Centro de Reportes y Analítica Multi-Contextual de CoreBiz.
 *
 * Ofrece reportes ejecutivos segmentados por contexto operativo:
 * 1. Resumen General (Balance de ventas, compras e inventario)
 * 2. Ventas & Despachos (Rendimiento comercial y notas de entrega)
 * 3. Compras & Proveedores (Inversión en suministros y entradas)
 * 4. Inventario & Stock (Valorización en almacén y alertas de reposición)
 * 5. Clientes & Cartera (Métricas de clientes y crédito otorgado)
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const t = await getTranslations();
  const format = await getFormatter();
  const { tab = 'resumen' } = await searchParams;

  const { ctx, data } = await withSession(async (queries) => {
    const [report, deliveryNotes, purchases, products, customers, suppliers] = await Promise.all([
      queries.reports.salesSummary(),
      queries.deliveryNotes.list({ limit: 100 }),
      queries.purchasing.receipts({ limit: 100 }),
      queries.products.list({ limit: 100, includeArchived: true }),
      queries.customers.list({ limit: 100, includeArchived: true }),
      queries.purchasing.suppliers({ limit: 100, includeArchived: true }),
    ]);
    return { report, deliveryNotes, purchases, products, customers, suppliers };
  });

  if (!can(ctx.actor, 'report:read') || !data || data.report === null) {
    return (
      <Screen title={t('reports.title')}>
        <NoAccess />
      </Screen>
    );
  }

  const { report, deliveryNotes: _deliveryNotes, purchases, products, customers, suppliers } = data;

  const units = (value: number): string =>
    value.toLocaleString('es-VE', { maximumFractionDigits: 3 });

  const parseAmount = (val: string | null | undefined): number => {
    if (!val) return 0;
    const str = String(val).trim();
    if (str.includes(',') && str.includes('.')) {
      if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
        return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
      }
      return parseFloat(str.replace(/,/g, '')) || 0;
    }
    if (str.includes(',')) {
      return parseFloat(str.replace(',', '.')) || 0;
    }
    return parseFloat(str) || 0;
  };

  // Cálculos de Ventas
  const totalSalesNum = parseAmount(report.salesTotal);
  const maxRevenue = Math.max(...report.bestSellers.map((b) => parseAmount(b.revenue)), 1);
  const totalUnitsSold = report.bestSellers.reduce((acc, curr) => acc + curr.units, 0);

  // Cálculos de Compras
  const validPurchases = purchases.items.filter((p) => p.status !== 'voided');
  const totalPurchasesNum = validPurchases.reduce((acc, curr) => acc + parseAmount(curr.total), 0);
  const avgPurchaseReceipt =
    validPurchases.length > 0 ? totalPurchasesNum / validPurchases.length : 0;

  // Cálculos de Inventario
  const totalProductsCount = products.items.filter((p) => !p.archived).length;
  const lowStockProducts = products.items.filter(
    (p) => !p.archived && p.trackStock && p.belowMinimum,
  );
  const trackedStockProducts = products.items.filter((p) => !p.archived && p.trackStock).length;

  // Cálculos de Clientes
  const activeCustomers = customers.items.filter((c) => !c.archived);
  const totalCreditLimitNum = activeCustomers.reduce(
    (acc, curr) => acc + (curr.creditLimit ? parseAmount(curr.creditLimit) : 0),
    0,
  );

  // Margen Operativo Bruto
  const grossMarginNum = totalSalesNum - totalPurchasesNum;

  // Preparar exportación contextual según la pestaña activa
  let exportData: ContextualReportData;

  switch (tab) {
    case 'ventas':
      exportData = {
        reportTitle: 'Ventas y Despachos',
        metrics: [
          { label: 'Ventas del Período', value: `$ ${report.salesTotal}` },
          { label: 'Documentos Emitidos', value: String(report.documentCount) },
          { label: 'Ticket Promedio', value: `$ ${report.averageTicket}` },
          { label: 'Unidades Vendidas', value: `${units(totalUnitsSold)} uds` },
        ],
        tableHeaders: ['Producto', 'Unidades', 'Ingresos ($)'],
        tableRows: report.bestSellers.map((b) => [b.name, units(b.units), `$ ${b.revenue}`]),
      };
      break;
    case 'compras':
      exportData = {
        reportTitle: 'Compras y Proveedores',
        metrics: [
          { label: 'Total Invertido en Compras', value: `$ ${totalPurchasesNum.toFixed(2)}` },
          { label: 'Recepciones Realizadas', value: String(validPurchases.length) },
          { label: 'Promedio por Recepción', value: `$ ${avgPurchaseReceipt.toFixed(2)}` },
          { label: 'Proveedores Registrados', value: String(suppliers.items.length) },
        ],
        tableHeaders: ['Número', 'Proveedor', 'Líneas', 'Total ($)'],
        tableRows: validPurchases.map((p) => [
          p.number,
          p.supplierName,
          p.lineCount,
          `$ ${p.total}`,
        ]),
      };
      break;
    case 'inventario':
      exportData = {
        reportTitle: 'Inventario y Existencias',
        metrics: [
          { label: 'Valoración Total de Inventario', value: `$ ${report.inventoryValue}` },
          { label: 'Total SKUs Activos', value: String(totalProductsCount) },
          { label: 'Productos con Bajo Stock', value: String(lowStockProducts.length) },
          { label: 'Productos con Control de Stock', value: String(trackedStockProducts) },
        ],
        tableHeaders: ['SKU', 'Producto', 'Existencia', 'Unidad', 'Precio ($)'],
        tableRows: products.items
          .filter((p) => !p.archived)
          .map((p) => [
            p.sku,
            p.name,
            p.trackStock ? (p.onHand ?? '0') : 'No controlado',
            p.unit,
            `$ ${p.price}`,
          ]),
      };
      break;
    case 'clientes':
      exportData = {
        reportTitle: 'Clientes y Cartera',
        metrics: [
          { label: 'Clientes Registrados', value: String(customers.items.length) },
          { label: 'Clientes Activos', value: String(activeCustomers.length) },
          { label: 'Límite de Crédito Concedido', value: `$ ${totalCreditLimitNum.toFixed(2)}` },
        ],
        tableHeaders: ['Código', 'Nombre', 'RIF / Cédula', 'Límite Crédito ($)'],
        tableRows: activeCustomers.map((c) => [
          c.code,
          c.name,
          c.taxId ?? 'N/D',
          c.creditLimit ? `$ ${c.creditLimit}` : '$ 0.00',
        ]),
      };
      break;
    default:
      exportData = {
        reportTitle: 'Resumen Ejecutivo General',
        metrics: [
          { label: 'Ventas del Período', value: `$ ${report.salesTotal}` },
          { label: 'Total Compras', value: `$ ${totalPurchasesNum.toFixed(2)}` },
          { label: 'Margen Bruto Estimado', value: `$ ${grossMarginNum.toFixed(2)}` },
          { label: 'Valoración del Inventario', value: `$ ${report.inventoryValue}` },
          { label: 'Documentos Emitidos', value: String(report.documentCount) },
          { label: 'Ticket Promedio', value: `$ ${report.averageTicket}` },
        ],
        tableHeaders: ['Producto Destacado', 'Unidades', 'Ingresos ($)'],
        tableRows: report.bestSellers.map((b) => [b.name, units(b.units), `$ ${b.revenue}`]),
      };
      break;
  }

  const TABS = [
    { id: 'resumen', label: 'Resumen General', icon: BarChart3 },
    { id: 'ventas', label: 'Ventas', icon: Wallet },
    { id: 'compras', label: 'Compras', icon: ShoppingCart },
    { id: 'inventario', label: 'Inventario', icon: Boxes },
    { id: 'clientes', label: 'Clientes', icon: UsersRound },
  ] as const;

  return (
    <Screen
      title={t('reports.title')}
      subtitle="Centro de analítica ejecutiva, control financiero y rendimiento operativo"
      action={<ReportsActions data={exportData} />}
    >
      <div className="space-y-6 lg:space-y-8">
        {/* Cabecera formal para impresión */}
        <div className="hidden print:block border-b border-line pb-4">
          <h1 className="text-xl font-bold text-ink">
            Reporte de {exportData.reportTitle} - CoreBiz ERP
          </h1>
          <p className="text-xs text-muted">
            Generado el {new Date().toLocaleDateString('es-VE')}{' '}
            {new Date().toLocaleTimeString('es-VE')}
          </p>
        </div>

        {/* Selector de Contexto / Pestañas de Reporte */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-line pb-2.5 print:hidden">
          {TABS.map((tItem) => {
            const isSelected = tab === tItem.id;
            const Icon = tItem.icon;
            return (
              <Link
                key={tItem.id}
                href={tItem.id === 'resumen' ? '/reports' : `/reports?tab=${tItem.id}`}
                className={`inline-flex items-center gap-1.5 rounded-control px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                  isSelected
                    ? 'bg-brand text-brand-ink shadow-xs'
                    : 'border border-line bg-surface text-ink hover:border-[var(--color-brand)] hover:bg-subtle'
                }`}
              >
                <Icon aria-hidden="true" className="size-3.5" strokeWidth={2} />
                <span>{tItem.label}</span>
              </Link>
            );
          })}
        </div>

        {/* 1. VISTA: RESUMEN GENERAL */}
        {tab === 'resumen' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <Stat
                label={t('reports.salesTotal')}
                value={`$ ${report.salesTotal}`}
                icon={Wallet}
                tone="emerald"
              />
              <Stat
                label={t('reports.documentsIssued')}
                value={String(report.documentCount)}
                icon={FileText}
                tone="violet"
              />
              <Stat
                label={t('reports.averageTicket')}
                value={`$ ${report.averageTicket}`}
                icon={TrendingUp}
                tone="sky"
              />
              <Stat
                label={t('reports.stockValue')}
                value={`$ ${report.inventoryValue}`}
                icon={Boxes}
                tone="amber"
              />
            </div>

            {/* Tarjetas de Eficiencia Operativa y Balance */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 print:grid-cols-4">
              <div className="rounded-control border border-line bg-surface p-4">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Compras Realizadas</span>
                  <ShoppingCart aria-hidden="true" className="size-4 text-sky-500" />
                </div>
                <p className="mt-2 text-xl font-semibold text-ink tabular-nums">
                  $ {totalPurchasesNum.toFixed(2)}
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  {validPurchases.length} recepciones registradas
                </p>
              </div>

              <div className="rounded-control border border-line bg-surface p-4">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Margen Bruto</span>
                  <TrendingUp
                    aria-hidden="true"
                    className={`size-4 ${grossMarginNum >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
                  />
                </div>
                <p className="mt-2 text-xl font-semibold text-ink tabular-nums">
                  $ {grossMarginNum.toFixed(2)}
                </p>
                <p className="mt-1 text-[11px] text-muted">Balance ventas vs compras</p>
              </div>

              <div className="rounded-control border border-line bg-surface p-4">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Unidades Despachadas</span>
                  <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-500" />
                </div>
                <p className="mt-2 text-xl font-semibold text-ink tabular-nums">
                  {units(totalUnitsSold)}{' '}
                  <span className="text-xs font-normal text-muted">uds.</span>
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  Promedio por Documento:{' '}
                  {report.documentCount > 0
                    ? (totalUnitsSold / report.documentCount).toFixed(1)
                    : '0'}{' '}
                  uds
                </p>
              </div>

              <div className="rounded-control border border-line bg-surface p-4">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Salud de Inventario</span>
                  <AlertTriangle
                    aria-hidden="true"
                    className={`size-4 ${lowStockProducts.length > 0 ? 'text-amber-500' : 'text-emerald-500'}`}
                  />
                </div>
                <p className="mt-2 text-xl font-semibold text-ink tabular-nums">
                  {lowStockProducts.length > 0
                    ? `${lowStockProducts.length} bajo mínimo`
                    : 'Óptimo'}
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  {trackedStockProducts} productos con existencias rastreadas
                </p>
              </div>
            </div>

            {/* Gráfico y Top Productos */}
            {report.bestSellers.length > 0 && (
              <section
                aria-labelledby="overview-chart"
                className="rounded-card border border-line bg-surface p-4 sm:p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 id="overview-chart" className="text-sm font-semibold text-ink">
                      {t('reports.topProducts')}
                    </h2>
                    <p className="text-xs text-muted">Distribución de Ingresos por Producto</p>
                  </div>
                  <span className="text-xs font-mono text-muted">Total: $ {report.salesTotal}</span>
                </div>
                <div className="space-y-3">
                  {report.bestSellers.map((item, index) => {
                    const revenueNum = parseFloat(item.revenue.replace(/,/g, '')) || 0;
                    const percentOfTotal =
                      totalSalesNum > 0 ? Math.round((revenueNum / totalSalesNum) * 100) : 0;
                    const barWidth = Math.max(6, Math.round((revenueNum / maxRevenue) * 100));
                    return (
                      <div key={item.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-ink">
                            {index + 1}. {item.name} ({units(item.units)} uds)
                          </span>
                          <span className="font-semibold text-ink tabular-nums">
                            $ {item.revenue} ({percentOfTotal}%)
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-subtle">
                          <svg
                            className="h-full w-full"
                            viewBox="0 0 100 8"
                            preserveAspectRatio="none"
                            aria-hidden="true"
                          >
                            <rect
                              x="0"
                              y="0"
                              width={barWidth}
                              height="8"
                              rx="4"
                              className="fill-brand"
                            />
                          </svg>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}

        {/* 2. VISTA: REPORTE DE VENTAS */}
        {tab === 'ventas' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <Stat
                label={t('reports.salesTotal')}
                value={`$ ${report.salesTotal}`}
                icon={Wallet}
                tone="emerald"
              />
              <Stat
                label={t('reports.documentsIssued')}
                value={String(report.documentCount)}
                icon={FileText}
                tone="violet"
              />
              <Stat
                label={t('reports.averageTicket')}
                value={`$ ${report.averageTicket}`}
                icon={TrendingUp}
                tone="sky"
              />
              <Stat
                label="Unidades Vendidas"
                value={units(totalUnitsSold)}
                icon={CheckCircle2}
                tone="amber"
              />
            </div>

            {/* Desglose de Productos Vendidos */}
            <section aria-labelledby="sales-breakdown">
              <h2 id="sales-breakdown" className="text-base font-semibold text-ink mb-3">
                {t('reports.topProducts')}
              </h2>
              {report.bestSellers.length === 0 ? (
                <Empty icon={BarChart3}>{t('reports.noSales')}</Empty>
              ) : (
                <>
                  <DesktopOnly>
                    <TableFrame>
                      <thead>
                        <tr className="border-b border-line bg-subtle/60">
                          <th scope="col" className={TH}>
                            Producto
                          </th>
                          <th scope="col" className={`${TH} text-right`}>
                            {t('reports.units')}
                          </th>
                          <th scope="col" className={`${TH} text-right`}>
                            Participación
                          </th>
                          <th scope="col" className={`${TH} text-right`}>
                            Total Vendido ($)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.bestSellers.map((row, index) => {
                          const revenueNum = parseFloat(row.revenue.replace(/,/g, '')) || 0;
                          const percent =
                            totalSalesNum > 0 ? Math.round((revenueNum / totalSalesNum) * 100) : 0;
                          return (
                            <tr key={row.name} className="border-b border-line hover:bg-subtle/40">
                              <td className="px-4 py-3 font-medium text-ink">
                                <span className="mr-2 text-xs text-muted">{index + 1}.</span>
                                {row.name}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                {units(row.units)} uds.
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-muted">
                                {percent}%
                              </td>
                              <td className="px-4 py-3 text-right font-medium tabular-nums">
                                $ {row.revenue}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </TableFrame>
                  </DesktopOnly>
                  <MobileList>
                    {report.bestSellers.map((row, index) => {
                      const revenueNum = parseFloat(row.revenue.replace(/,/g, '')) || 0;
                      const percent =
                        totalSalesNum > 0 ? Math.round((revenueNum / totalSalesNum) * 100) : 0;
                      return (
                        <MobileStaticItem
                          key={row.name}
                          title={`${index + 1}. ${row.name}`}
                          subtitle={`${units(row.units)} uds. · ${percent}% participación`}
                          trailing={`$ ${row.revenue}`}
                        />
                      );
                    })}
                  </MobileList>
                </>
              )}
            </section>
          </div>
        )}

        {/* 3. VISTA: REPORTE DE COMPRAS & PROVEEDORES */}
        {tab === 'compras' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <Stat
                label="Inversión en Compras"
                value={`$ ${totalPurchasesNum.toFixed(2)}`}
                icon={ShoppingCart}
                tone="sky"
              />
              <Stat
                label="Recepciones Registradas"
                value={String(validPurchases.length)}
                icon={Truck}
                tone="violet"
              />
              <Stat
                label="Costo Promedio Entrada"
                value={`$ ${avgPurchaseReceipt.toFixed(2)}`}
                icon={TrendingUp}
                tone="amber"
              />
              <Stat
                label="Proveedores Activos"
                value={String(suppliers.items.filter((s) => !s.archived).length)}
                icon={UsersRound}
                tone="emerald"
              />
            </div>

            <section aria-labelledby="purchases-table">
              <h2 id="purchases-table" className="text-base font-semibold text-ink mb-3">
                Historial de Recepciones de Mercancía
              </h2>
              {validPurchases.length === 0 ? (
                <Empty icon={Truck}>No hay recepciones de compra registradas todavía.</Empty>
              ) : (
                <>
                  <DesktopOnly>
                    <TableFrame>
                      <thead>
                        <tr className="border-b border-line bg-subtle/60">
                          <th scope="col" className={TH}>
                            Número
                          </th>
                          <th scope="col" className={TH}>
                            Proveedor
                          </th>
                          <th scope="col" className={TH}>
                            Fecha
                          </th>
                          <th scope="col" className={`${TH} text-right`}>
                            Líneas
                          </th>
                          <th scope="col" className={`${TH} text-right`}>
                            Total ($)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {validPurchases.map((p) => (
                          <tr key={p.id} className="border-b border-line hover:bg-subtle/40">
                            <td className="px-4 py-3 font-mono text-xs font-medium text-brand">
                              {p.number}
                            </td>
                            <td className="px-4 py-3 font-medium text-ink">{p.supplierName}</td>
                            <td className="px-4 py-3 text-muted text-xs">
                              {p.receivedAt
                                ? format.dateTime(p.receivedAt, { dateStyle: 'medium' })
                                : '—'}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">{p.lineCount}</td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums">
                              $ {p.total}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </TableFrame>
                  </DesktopOnly>
                  <MobileList>
                    {validPurchases.map((p) => (
                      <MobileStaticItem
                        key={p.id}
                        title={p.supplierName}
                        subtitle={`${p.number} · ${p.receivedAt ? format.dateTime(p.receivedAt, { dateStyle: 'medium' }) : '—'}`}
                        trailing={`$ ${p.total}`}
                        trailingHint={`${p.lineCount} líneas`}
                      />
                    ))}
                  </MobileList>
                </>
              )}
            </section>
          </div>
        )}

        {/* 4. VISTA: REPORTE DE INVENTARIO */}
        {tab === 'inventario' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <Stat
                label={t('reports.stockValue')}
                value={`$ ${report.inventoryValue}`}
                icon={Boxes}
                tone="amber"
              />
              <Stat
                label="SKUs en Catálogo"
                value={String(totalProductsCount)}
                icon={PieChart}
                tone="sky"
              />
              <Stat
                label="Alertas de Bajo Stock"
                value={String(lowStockProducts.length)}
                icon={AlertTriangle}
                tone={lowStockProducts.length > 0 ? 'rose' : 'emerald'}
              />
              <Stat
                label="Control de Existencias"
                value={String(trackedStockProducts)}
                icon={CheckCircle2}
                tone="emerald"
              />
            </div>

            {/* Alertas de Stock Bajo si existen */}
            {lowStockProducts.length > 0 && (
              <div className="rounded-control border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-xs uppercase tracking-wide">
                  <AlertTriangle className="size-4" />
                  <span>Productos que requieren reposición inmediata</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {lowStockProducts.map((p) => (
                    <span
                      key={p.id}
                      className="rounded-full border border-amber-500/40 bg-surface px-2.5 py-1 text-xs font-medium text-ink"
                    >
                      {p.name} ({p.onHand ?? '0'} {p.unit})
                    </span>
                  ))}
                </div>
              </div>
            )}

            <section aria-labelledby="inventory-table">
              <h2 id="inventory-table" className="text-base font-semibold text-ink mb-3">
                Existencias por Producto en Almacén
              </h2>
              <>
                <DesktopOnly>
                  <TableFrame>
                    <thead>
                      <tr className="border-b border-line bg-subtle/60">
                        <th scope="col" className={TH}>
                          SKU
                        </th>
                        <th scope="col" className={TH}>
                          Producto
                        </th>
                        <th scope="col" className={`${TH} text-right`}>
                          Stock
                        </th>
                        <th scope="col" className={`${TH} text-right`}>
                          Unidad
                        </th>
                        <th scope="col" className={`${TH} text-right`}>
                          Precio ($)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.items
                        .filter((p) => !p.archived)
                        .map((p) => (
                          <tr key={p.id} className="border-b border-line hover:bg-subtle/40">
                            <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                            <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {p.trackStock ? (p.onHand ?? '0') : '—'}{' '}
                              {p.belowMinimum && (
                                <span className="ml-1.5">
                                  <Badge tone="warn">Bajo</Badge>
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted text-xs">
                              {p.unit}
                            </td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums">
                              $ {p.price}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </TableFrame>
                </DesktopOnly>
                <MobileList>
                  {products.items
                    .filter((p) => !p.archived)
                    .map((p) => (
                      <MobileStaticItem
                        key={p.id}
                        title={p.name}
                        subtitle={`SKU: ${p.sku} · ${p.trackStock ? `${p.onHand ?? '0'} ${p.unit}` : 'No controlado'}`}
                        trailing={`$ ${p.price}`}
                        trailingHint={
                          p.belowMinimum ? <Badge tone="warn">Bajo stock</Badge> : undefined
                        }
                      />
                    ))}
                </MobileList>
              </>
            </section>
          </div>
        )}

        {/* 5. VISTA: REPORTE DE CLIENTES & CARTERA */}
        {tab === 'clientes' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <Stat
                label="Clientes Registrados"
                value={String(customers.items.length)}
                icon={UsersRound}
                tone="emerald"
              />
              <Stat
                label="Cartera Activa"
                value={String(activeCustomers.length)}
                icon={CheckCircle2}
                tone="sky"
              />
              <Stat
                label="Crédito Total Concedido"
                value={`$ ${totalCreditLimitNum.toFixed(2)}`}
                icon={Wallet}
                tone="violet"
              />
              <Stat
                label="Ticket Promedio"
                value={`$ ${report.averageTicket}`}
                icon={TrendingUp}
                tone="amber"
              />
            </div>

            <section aria-labelledby="customers-table">
              <h2 id="customers-table" className="text-base font-semibold text-ink mb-3">
                Cartera de Clientes
              </h2>
              <>
                <DesktopOnly>
                  <TableFrame>
                    <thead>
                      <tr className="border-b border-line bg-subtle/60">
                        <th scope="col" className={TH}>
                          Código
                        </th>
                        <th scope="col" className={TH}>
                          Razón Social
                        </th>
                        <th scope="col" className={TH}>
                          Identificación (RIF/CI)
                        </th>
                        <th scope="col" className={`${TH} text-right`}>
                          Límite de Crédito
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeCustomers.map((c) => (
                        <tr key={c.id} className="border-b border-line hover:bg-subtle/40">
                          <td className="px-4 py-3 font-mono text-xs">{c.code}</td>
                          <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                          <td className="px-4 py-3 text-muted text-xs">
                            {c.taxId ?? 'Sin registrar'}
                          </td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums">
                            {c.creditLimit ? `$ ${c.creditLimit}` : '$ 0.00'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </TableFrame>
                </DesktopOnly>
                <MobileList>
                  {activeCustomers.map((c) => (
                    <MobileStaticItem
                      key={c.id}
                      title={c.name}
                      subtitle={`${c.code} · ${c.taxId ?? 'Sin RIF'}`}
                      trailing={c.creditLimit ? `$ ${c.creditLimit}` : '$ 0.00'}
                      trailingHint="Límite de crédito"
                    />
                  ))}
                </MobileList>
              </>
            </section>
          </div>
        )}
      </div>
    </Screen>
  );
}

const TH = 'px-4 py-2.5 text-xs font-medium tracking-wide text-muted uppercase';
