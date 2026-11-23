import type { LocalSale } from './db';
import { getJurisdictionConfig } from './config/pos-jurisdiction';

export function formatReceiptHtml(sale: LocalSale, jurisdictionOverride?: string): string {
  const config = getJurisdictionConfig(jurisdictionOverride || sale.country || 'VE');
  const isUs = config.jurisdiction === 'US';

  const dateFormatted = new Date(sale.occurredAt).toLocaleString(isUs ? 'en-US' : 'es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const subtotalUsd = (Number(sale.subtotalMinor) / 100).toFixed(2);
  const taxUsd = (Number(sale.taxMinor) / 100).toFixed(2);
  const totalUsd = (Number(sale.totalMinor) / 100).toFixed(2);

  const rate = parseFloat(sale.exchangeRateBcv || '36.50');
  const totalVes = (parseFloat(totalUsd) * rate).toFixed(2);
  const subtotalVes = (parseFloat(subtotalUsd) * rate).toFixed(2);
  const taxVes = (parseFloat(taxUsd) * rate).toFixed(2);

  const linesHtml = sale.lines
    .map((l) => {
      const price = (Number(l.unitPriceMinor) / 100).toFixed(2);
      const total = (Number(l.lineTotalMinor) / 100).toFixed(2);
      return `
        <tr>
          <td style="padding: 4px 0; font-size: 11px;">${l.quantity}x ${l.name}</td>
          <td style="padding: 4px 0; text-align: right; font-family: monospace; font-size: 11px;">$${price}</td>
          <td style="padding: 4px 0; text-align: right; font-family: monospace; font-size: 11px; font-weight: bold;">$${total}</td>
        </tr>
      `;
    })
    .join('');

  const totalsHtml = isUs
    ? `
    <table class="meta-table" style="font-size: 11px;">
      <tr>
        <td>SUBTOTAL:</td>
        <td class="text-right font-bold" style="font-family: monospace;">$${subtotalUsd}</td>
      </tr>
      <tr>
        <td>${config.taxLabel}:</td>
        <td class="text-right font-bold" style="font-family: monospace;">$${taxUsd}</td>
      </tr>
      <tr style="font-size: 13px;">
        <td class="font-bold" style="padding-top: 4px;">TOTAL DUE:</td>
        <td class="text-right font-bold" style="font-family: monospace; padding-top: 4px;">$${totalUsd}</td>
      </tr>
    </table>
    `
    : `
    <table class="meta-table" style="font-size: 11px;">
      <tr>
        <td>SUBTOTAL:</td>
        <td class="text-right font-bold" style="font-family: monospace;">$${subtotalUsd} / Bs. ${subtotalVes}</td>
      </tr>
      <tr>
        <td>${config.taxLabel}:</td>
        <td class="text-right font-bold" style="font-family: monospace;">$${taxUsd} / Bs. ${taxVes}</td>
      </tr>
      <tr style="font-size: 13px;">
        <td class="font-bold" style="padding-top: 4px;">TOTAL A PAGAR:</td>
        <td class="text-right font-bold" style="font-family: monospace; padding-top: 4px;">$${totalUsd}</td>
      </tr>
      <tr style="font-size: 11px; color: #374151;">
        <td style="padding-top: 4px;">TOTAL BS. (TASA BCV ${rate.toFixed(2)}):</td>
        <td class="text-right font-bold" style="font-family: monospace; padding-top: 4px;">Bs. ${totalVes}</td>
      </tr>
    </table>
    `;

  return `<!DOCTYPE html>
<html lang="${isUs ? 'en' : 'es'}">
<head>
  <meta charset="UTF-8">
  <title>Ticket ${sale.ticketNumber}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      width: 76mm;
      margin: 0 auto;
      padding: 12px 8px;
      color: #111827;
      background: #ffffff;
      font-size: 11px;
      line-height: 1.3;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-bold { font-weight: bold; }
    .divider { border-top: 1px dashed #9ca3af; margin: 8px 0; }
    .header h1 { margin: 0; font-size: 14px; font-weight: 900; letter-spacing: 0.5px; }
    .header p { margin: 2px 0; font-size: 10px; color: #4b5563; }
    .meta-table, .items-table { width: 100%; border-collapse: collapse; }
    .meta-table td { padding: 2px 0; font-size: 10px; }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 9999px;
      font-size: 9px;
      font-weight: bold;
      background: ${sale.syncStatus === 'synced' ? '#dcfce7' : '#fef3c7'};
      color: ${sale.syncStatus === 'synced' ? '#166534' : '#92400e'};
    }
  </style>
</head>
<body>
  <div class="header text-center">
    <h1>${config.storeName}</h1>
    <p>${config.storeTaxId}</p>
    <p>${config.storeAddress}</p>
    <p class="font-bold">${config.receiptTitle}</p>
    <p style="font-size: 9px;">${config.receiptSubtitle}</p>
  </div>

  <div class="divider"></div>

  <table class="meta-table">
    <tr>
      <td class="font-bold">TICKET N°:</td>
      <td class="text-right font-bold" style="font-family: monospace;">${sale.ticketNumber}</td>
    </tr>
    <tr>
      <td class="font-bold">SECUENCIA:</td>
      <td class="text-right" style="font-family: monospace;">${sale.receiptSequenceNumber}</td>
    </tr>
    <tr>
      <td>${isUs ? 'DATE / TIME:' : 'FECHA / HORA:'}</td>
      <td class="text-right">${dateFormatted}</td>
    </tr>
    <tr>
      <td>${isUs ? 'REGISTER / SHIFT:' : 'CAJA / TURNO:'}</td>
      <td class="text-right">${sale.registerCode}</td>
    </tr>
    <tr>
      <td>${isUs ? 'SYNC STATUS:' : 'ESTADO SYNC:'}</td>
      <td class="text-right"><span class="badge">${sale.syncStatus === 'synced' ? (isUs ? 'SYNCED' : 'SINCRONIZADA') : isUs ? 'OFFLINE (QUEUED)' : 'OFFLINE (EN COLA)'}</span></td>
    </tr>
  </table>

  <div class="divider"></div>

  <table class="meta-table">
    <tr>
      <td class="font-bold">${isUs ? 'CUSTOMER:' : 'CLIENTE:'}</td>
      <td class="text-right">${sale.customerName}</td>
    </tr>
    <tr>
      <td class="font-bold">${config.taxIdLabel}:</td>
      <td class="text-right" style="font-family: monospace;">${sale.customerDoc}</td>
    </tr>
    <tr>
      <td>${isUs ? 'TENDER:' : 'CONDICIÓN:'}</td>
      <td class="text-right">${isUs ? 'PAID' : 'CONTADO'} (${sale.paymentMethod.toUpperCase()})</td>
    </tr>
    ${
      sale.paymentReference
        ? `<tr>
      <td>${isUs ? 'REFERENCE:' : 'REFERENCIA:'}</td>
      <td class="text-right" style="font-family: monospace; font-weight: bold;">${sale.paymentReference}</td>
    </tr>`
        : ''
    }
  </table>

  <div class="divider"></div>

  <table class="items-table">
    <thead>
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <th style="text-align: left; padding-bottom: 4px; font-size: 10px;">${isUs ? 'DESCRIPTION' : 'DESCRIPCIÓN'}</th>
        <th style="text-align: right; padding-bottom: 4px; font-size: 10px;">${isUs ? 'PRICE' : 'P.U.'}</th>
        <th style="text-align: right; padding-bottom: 4px; font-size: 10px;">TOTAL</th>
      </tr>
    </thead>
    <tbody>
      ${linesHtml}
    </tbody>
  </table>

  <div class="divider"></div>

  ${totalsHtml}

  <div class="divider"></div>

  <div class="text-center" style="font-size: 9px; color: #6b7280; margin-top: 10px;">
    <p>${isUs ? 'Thank you for your business!' : 'Gracias por su compra'}</p>
    <p>${isUs ? 'Official purchase receipt for customer records' : 'Documento de control interno para entrega de mercancía'}</p>
    <p style="font-family: monospace; font-size: 8px;">REF: ${sale.operationId.slice(0, 16)}...</p>
  </div>
</body>
</html>`;
}

export function downloadReceiptFile(sale: LocalSale, jurisdiction?: string): void {
  const html = formatReceiptHtml(sale, jurisdiction);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Ticket-${sale.ticketNumber}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function printReceipt(sale: LocalSale, jurisdiction?: string): void {
  const html = formatReceiptHtml(sale, jurisdiction);
  const printWindow = window.open('', '_blank', 'width=450,height=650');
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 350);
}
