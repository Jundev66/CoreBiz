import Link from 'next/link';
import { can } from '@corebiz/domain';
import { ArrowDownLeft, ArrowUpRight, Banknote } from 'lucide-react';
import { apiForRequest } from '@/api/session';
import { listDocumentPayments } from '@/api/accounting';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { Badge } from '@/ui/feedback';
import { Card, Stat } from '@/ui/primitives';
import { NoAccess } from '@/ui/no-access';
import { PAYMENT_METHOD_LABELS } from '@/ui/payment-methods';

function formatMinor(minorStr: string, currency: string): string {
  const minor = BigInt(minorStr || '0');
  const sign = minor < 0n ? '-' : '';
  const abs = minor < 0n ? -minor : minor;
  const major = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${sign}${major}.${cents} ${currency}`;
}

export default async function DocumentPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { ctx } = await apiForRequest();
  const { tipo } = await searchParams;

  if (!can(ctx.actor, 'accounting:read')) {
    return (
      <Screen title="Cobros y Pagos">
        <NoAccess />
      </Screen>
    );
  }

  const direction = tipo === 'cobros' ? 'INBOUND' : tipo === 'pagos' ? 'OUTBOUND' : undefined;
  const payments = await listDocumentPayments(direction).catch(() => []);

  const inboundCount = payments.filter((p) => p.direction === 'INBOUND').length;
  const outboundCount = payments.filter((p) => p.direction === 'OUTBOUND').length;

  return (
    <Screen
      title="Cobros y Pagos (CxC / CxP)"
      subtitle="Trazabilidad unificada de cobros de facturas y pagos a proveedores con método, moneda y tasa"
    >
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="Total Movimientos"
          value={String(payments.length)}
          icon={Banknote}
          tone="brand"
        />
        <Stat
          label="Cobros (CxC)"
          value={String(inboundCount)}
          icon={ArrowDownLeft}
          tone="emerald"
        />
        <Stat label="Pagos (CxP)" value={String(outboundCount)} icon={ArrowUpRight} tone="amber" />
      </div>

      <Card className="mb-6 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <Link
            href="/accounting/payments"
            className={`rounded-control px-3 py-1.5 ${
              !direction ? 'bg-brand text-white' : 'text-muted hover:bg-subtle hover:text-ink'
            }`}
          >
            Todos
          </Link>
          <Link
            href="/accounting/payments?tipo=cobros"
            className={`rounded-control px-3 py-1.5 ${
              direction === 'INBOUND'
                ? 'bg-brand text-white'
                : 'text-muted hover:bg-subtle hover:text-ink'
            }`}
          >
            Cobros de Ventas (CxC)
          </Link>
          <Link
            href="/accounting/payments?tipo=pagos"
            className={`rounded-control px-3 py-1.5 ${
              direction === 'OUTBOUND'
                ? 'bg-brand text-white'
                : 'text-muted hover:bg-subtle hover:text-ink'
            }`}
          >
            Pagos a Proveedores (CxP)
          </Link>
        </div>
      </Card>

      {payments.length === 0 ? (
        <Empty icon={Banknote}>
          Aún no se han registrado cobros ni pagos trazables en este período.
        </Empty>
      ) : (
        <TableFrame>
          <thead>
            <tr className="border-b border-line bg-subtle/40 text-xs font-semibold uppercase text-muted">
              <th className="px-4 py-3">Nro.</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">Método</th>
              <th className="px-4 py-3">Cuenta</th>
              <th className="px-4 py-3">Referencia</th>
              <th className="px-4 py-3 text-right">Monto Operación</th>
              <th className="px-4 py-3 text-right">Aplicado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line text-xs text-ink">
            {payments.map((p) => {
              const docHref =
                p.documentType === 'INVOICE'
                  ? `/invoicing/${p.documentId}`
                  : `/purchases/${p.documentId}`;
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-mono font-bold">{p.paymentNumber}</td>
                  <td className="px-4 py-3">
                    <Badge tone={p.direction === 'INBOUND' ? 'success' : 'warn'}>
                      {p.direction === 'INBOUND' ? 'Cobro CxC' : 'Pago CxP'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(p.paymentDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={docHref} className="font-semibold text-brand hover:underline">
                      {p.documentType === 'INVOICE' ? 'Ver Factura' : 'Ver Compra'}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {p.accountCode ? `${p.accountCode} · ${p.accountName}` : p.accountId}
                  </td>
                  <td className="px-4 py-3 font-mono text-muted">{p.reference ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatMinor(p.paymentAmountMinor, p.paymentCurrency)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-ink">
                    {formatMinor(p.appliedAmountMinor, p.documentCurrency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableFrame>
      )}
    </Screen>
  );
}
