import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, getFormatter } from 'next-intl/server';
import { forRequest } from '@/composition/container';
import { PrintButton } from '@/ui/print-button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // El titulo del documento acaba siendo el nombre del archivo al guardar como
  // PDF, asi que lleva el correlativo: "NE-000012.pdf" y no "documento.pdf".
  return { title: id, robots: { index: false, follow: false } };
}

/**
 * La nota de entrega, lista para imprimir.
 *
 * NO se genera un PDF en el servidor, y merece explicarse porque es la decision
 * que mas se cuestiona de esta pantalla.
 *
 * Un PDF de servidor exige o una libreria que dibuja cajas a mano —peor
 * tipografia, peor manejo de texto largo, cientos de lineas de codigo de
 * maquetacion— o un navegador sin cabeza, que no cabe en el limite de tamano de
 * una funcion del plan gratuito de Vercel. Las dos opciones cuestan mucho y
 * empeoran el resultado.
 *
 * El navegador ya sabe convertir una pagina en PDF, con mejor tipografia que
 * cualquiera de esas librerias, y "Imprimir" es un boton que quien usa esto ya
 * sabe usar. Se paga el precio de depender del dialogo de impresion; se gana un
 * documento que se ve bien, se puede guardar como PDF y no cuesta nada servir.
 *
 * La pantalla se sirve SIN el marco de la aplicacion: sin navegacion, sin plan,
 * sin barra de cuenta. Lo que se imprime tiene que ser el documento, no una
 * captura de la aplicacion con el documento dentro.
 */
export default async function PrintDeliveryNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();
  const format = await getFormatter();
  const { ctx, queries } = await forRequest();

  const note = await queries.deliveryNotes.findById(id);

  // 404 y no 403: un 403 confirmaria que el documento existe en otra empresa.
  if (!note) notFound();

  return (
    <main className="mx-auto max-w-[21cm] bg-white p-8 text-black print:p-0">
      {/* Solo se ve en pantalla. Al imprimir sobra, y peor: se imprimiria. */}
      <div className="mb-8 flex items-center justify-between gap-4 print:hidden">
        <a href={`/delivery-notes/${id}`} className="text-sm underline underline-offset-4">
          ← {t('common.back')}
        </a>
        <PrintButton label={t('deliveryNotes.print')} hint={t('deliveryNotes.printHint')} />
      </div>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-6 border-b border-neutral-300 pb-6">
        <div>
          <h1 className="text-2xl font-semibold">{ctx.tenantSlug}</h1>
          <p className="mt-1 text-sm text-neutral-600">{t('legal.deliveryNoteKind')}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-xl font-semibold">{note.number}</p>
          <p className="mt-1 text-sm text-neutral-600">
            {note.issuedAt === null ? '—' : format.dateTime(note.issuedAt, { dateStyle: 'long' })}
          </p>
        </div>
      </header>

      <section className="mb-8 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t('deliveryNotes.customer')}
          </h2>
          <p className="mt-1 text-lg font-medium">{note.customerName}</p>
        </div>
        <div className="sm:text-right">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t('deliveryNotes.exchangeRate')}
          </h2>
          {/*
            La tasa va CON su fecha de captura, aqui mas que en ninguna otra
            pantalla: este papel puede reimprimirse dentro de un ano, y sin la
            fecha el numero invita a leerse como la tasa de hoy.
          */}
          <p className="mt-1 font-medium">
            {note.exchangeRate}{' '}
            <span className="text-sm font-normal text-neutral-600">
              ({format.dateTime(note.exchangeRateAt, { dateStyle: 'medium' })})
            </span>
          </p>
        </div>
      </section>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-neutral-300 text-left">
            <th scope="col" className="py-2 pr-2 font-medium">
              {t('deliveryNotes.description')}
            </th>
            <th scope="col" className="py-2 px-2 text-right font-medium">
              {t('deliveryNotes.quantity')}
            </th>
            <th scope="col" className="py-2 px-2 text-right font-medium">
              {t('deliveryNotes.unitPrice')}
            </th>
            <th scope="col" className="py-2 pl-2 text-right font-medium">
              {t('deliveryNotes.lineTotal')}
            </th>
          </tr>
        </thead>
        <tbody>
          {note.lines.map((line) => (
            <tr key={line.lineNo} className="border-b border-neutral-200">
              <td className="py-2 pr-2">
                {line.description}
                <span className="ml-1 text-neutral-500">({line.unit})</span>
              </td>
              <td className="py-2 px-2 text-right tabular-nums">{line.quantity}</td>
              <td className="py-2 px-2 text-right tabular-nums">{line.unitPrice}</td>
              <td className="py-2 pl-2 text-right tabular-nums">{line.lineTotal}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-6 flex justify-end">
        <dl className="w-full max-w-xs space-y-1 text-sm">
          <Row label={t('deliveryNotes.subtotal')} value={note.subtotal} />
          <Row label={note.taxLabel} value={note.tax} />
          <Row label={t('deliveryNotes.total')} value={note.total} strong />
          {/* El equivalente en la otra moneda, con la tasa congelada arriba. */}
          <Row label={t('deliveryNotes.totalBs')} value={`Bs ${note.totalSecondary}`} muted />
        </dl>
      </section>

      {note.voidReason !== null && (
        <p className="mt-8 border border-neutral-400 p-3 text-sm font-medium">
          {t('deliveryNotes.statuses.voided')}: {note.voidReason}
        </p>
      )}

      <section className="mt-16 grid gap-12 sm:grid-cols-2">
        <SignatureLine label={t('deliveryNotes.deliveredBy')} />
        <SignatureLine label={t('deliveryNotes.receivedBy')} />
      </section>

      {/*
        El aviso legal. Va SIEMPRE y va impreso, no solo en pantalla: es lo que
        impide que este papel se confunda con un comprobante con valor
        tributario. `scripts/check-non-fiscal.sh` vigila el vocabulario del
        codigo; esta linea es su contraparte visible.
      */}
      <footer className="mt-12 border-t border-neutral-300 pt-4">
        <p className="text-center text-xs font-medium uppercase tracking-wide text-neutral-600">
          {t('legal.notice')}
        </p>
      </footer>
    </main>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={muted === true ? 'text-neutral-500' : ''}>{label}</dt>
      <dd
        className={
          strong === true
            ? 'text-base font-semibold tabular-nums'
            : muted === true
              ? 'text-neutral-500 tabular-nums'
              : 'tabular-nums'
        }
      >
        {value}
      </dd>
    </div>
  );
}

/** Linea de firma. Un albaran sin firma no prueba que nadie recibiera nada. */
function SignatureLine({ label }: { label: string }) {
  return (
    <div>
      <div className="h-12 border-b border-neutral-400" />
      <p className="mt-2 text-xs uppercase tracking-wide text-neutral-500">{label}</p>
    </div>
  );
}
