import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { can } from '@corebiz/domain';
import { apiForRequest } from '@/api/session';
import { Shell, TableFrame, Empty } from '@/ui/shell';
import { SupplierForm } from '@/ui/supplier-form';
import { StatusBadge, StatusToggle } from '@/ui/detail';
import { setSupplierStatusAction } from '@/actions/purchasing';
import { noticeCode } from '@/ui/notice-code';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('suppliers.title') };
}

/**
 * Proveedores.
 *
 * El formulario va al lado de la lista y no en otra pantalla: dar de alta un
 * proveedor casi siempre ocurre mientras se registra una entrada de mercancia,
 * y obligar a navegar a otra ruta y volver rompe esa tarea por la mitad.
 */
export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ archivados?: string; creado?: string; guardado?: string }>;
}) {
  const t = await getTranslations();
  const { archivados, creado, guardado } = await searchParams;
  const createdCode = noticeCode(creado);
  const { ctx, session, queries } = await apiForRequest();

  // Quien no puede escribir proveedores ve el listado y nada mas. Ocultar el formulario
  // NO es la medida de seguridad —el caso de uso revalida el permiso— pero enseñar un
  // formulario que va a fallar al enviarlo hace perder el tiempo y parecer un fallo.
  const puedeEscribir = can(ctx.actor, 'supplier:write');

  const page = await queries.purchasing.suppliers({
    limit: 50,
    includeArchived: archivados === '1',
  });

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={t('suppliers.title')}
      subtitle={t('suppliers.subtitle')}
      {...(createdCode !== null ? { toast: t('suppliers.created', { code: createdCode }) } : {})}
      {...(guardado !== undefined ? { toast: t('common.saved') } : {})}
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="suppliers-list">
          <h2 id="suppliers-list" className="sr-only">
            {t('suppliers.title')}
          </h2>

          <p className="mb-4 text-sm">
            <Link
              href={
                archivados === '1' ? '/purchases/suppliers' : '/purchases/suppliers?archivados=1'
              }
              className="underline underline-offset-4 text-[var(--color-muted)]"
            >
              {archivados === '1' ? t('common.back') : t('suppliers.showArchived')}
            </Link>
          </p>

          {page.items.length === 0 ? (
            <Empty>{t('suppliers.empty')}</Empty>
          ) : (
            <TableFrame>
              <thead>
                <tr className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('suppliers.code')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('suppliers.name')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('suppliers.contact')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('suppliers.phone')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t('suppliers.state')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className={
                      supplier.archived
                        ? 'border-b border-[var(--color-line)] opacity-60 last:border-0'
                        : 'border-b border-[var(--color-line)] last:border-0'
                    }
                  >
                    <td className="px-4 py-3 font-mono text-xs">{supplier.code}</td>
                    <td className="px-4 py-3 font-medium">{supplier.name}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {supplier.contactName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{supplier.phone ?? '—'}</td>
                    {/* Un proveedor cabe entero en su fila, asi que no tiene ficha
                        aparte: el estado y su cambio van aqui mismo. Una pantalla de
                        detalle que repitiera estas cuatro columnas seria un clic de
                        mas para ver lo que ya se esta viendo. */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <StatusBadge
                          archived={supplier.archived}
                          activeLabel={t('status.active')}
                          archivedLabel={t('status.archived')}
                        />
                        {puedeEscribir && (
                          <Link
                            href={`/purchases/suppliers/${supplier.id}/edit`}
                            className="rounded-[var(--radius-control)] border border-[var(--color-line-strong)] px-2.5 py-1 text-xs font-medium transition hover:bg-[var(--color-subtle)]"
                          >
                            {t('common.edit')}
                          </Link>
                        )}
                        {puedeEscribir && (
                          <StatusToggle
                            action={setSupplierStatusAction}
                            idField="supplierId"
                            id={supplier.id}
                            archived={supplier.archived}
                            archiveLabel={t('suppliers.archive')}
                            restoreLabel={t('suppliers.restore')}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </section>

        {puedeEscribir && (
          <aside aria-labelledby="supplier-form-heading">
            <h2 id="supplier-form-heading" className="mb-4 text-lg font-medium">
              {t('suppliers.new')}
            </h2>
            <SupplierForm />
          </aside>
        )}
      </div>
    </Shell>
  );
}
