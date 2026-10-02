'use client';

import { Printer, Download } from 'lucide-react';
import { buttonClasses } from '@/ui/button';

export interface ContextualReportData {
  readonly reportTitle: string;
  readonly metrics: readonly { readonly label: string; readonly value: string }[];
  readonly tableHeaders?: readonly string[];
  readonly tableRows?: readonly (readonly (string | number)[])[];
}

export function ReportsActions({ data }: { readonly data: ContextualReportData }) {
  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const rows: string[][] = [
      [`Reporte de ${data.reportTitle} - CoreBiz`],
      ['Fecha de Generación', new Date().toLocaleString('es-VE')],
      [],
      ['Métrica', 'Valor'],
      ...data.metrics.map((m) => [m.label, m.value]),
    ];

    if (data.tableHeaders && data.tableRows && data.tableRows.length > 0) {
      rows.push([]);
      rows.push(['Detalle Tabular']);
      rows.push([...data.tableHeaders]);
      for (const row of data.tableRows) {
        rows.push(row.map((cell) => String(cell)));
      }
    }

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const slug = data.reportTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    link.setAttribute('download', `reporte-${slug}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={handlePrint}
        className={buttonClasses({ variant: 'secondary', size: 'sm' })}
        title="Imprimir reporte o exportar como documento PDF"
      >
        <Printer aria-hidden="true" className="size-4 text-muted" strokeWidth={2} />
        <span>Imprimir / PDF</span>
      </button>

      <button
        type="button"
        onClick={handleExportCsv}
        className={buttonClasses({ variant: 'secondary', size: 'sm' })}
        title="Descargar datos en formato CSV compatible con Excel"
      >
        <Download aria-hidden="true" className="size-4 text-muted" strokeWidth={2} />
        <span>Exportar CSV</span>
      </button>
    </div>
  );
}
