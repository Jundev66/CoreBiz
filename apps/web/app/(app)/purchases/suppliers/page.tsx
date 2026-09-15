import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Archive, ArrowLeft, Building2 } from 'lucide-react';
import { can } from '@corebiz/domain';
import { withSession } from '@/api/session';
import { Screen, TableFrame, Empty } from '@/ui/shell';
import { ButtonLink } from '@/ui/button';
import { Badge } from '@/ui/feedback';
import { DesktopOnly, MobileList } from '@/ui/list';
import { SupplierForm } from '@/ui/supplier-form';
import { StatusToggle } from '@/ui/detail';
import { setSupplierStatusAction } from '@/actions/purchasing';
import { noticeCode } from '@/ui/notice-code';
import { NoAccess } from '@/ui/no-access';

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
  const includeArchived = archivados === '1';
  const { ctx, data: page } = await withSession((queries) =>
    queries.purchasing.suppliers({ limit: 50, includeArchived }),
  );

  // The session and the list travel together. A role the API refuses gets a notice rather
  // than the server error page.
  if (page === null) {
    return (
      <Screen title={t('suppliers.title')}>
        <NoAccess />
      </Screen>
    );
  }

  // Quien no puede escribir proveedores ve el listado y nada mas. Ocultar el formulario
  // NO es la medida de seguridad —el caso de uso revalida el permiso— pero enseñar un
  // formulario que va a fallar al enviarlo hace perder el tiempo y parecer un fallo.
  const puedeEscribir = can(ctx.actor, 'supplier:write');

  const stateBadge = (archived: boolean) =>
    archived ? (
      <Badge tone="warn">{t('status.archived')}</Badge>
    ) : (
      <Badge tone="success">{t('status.active')}</Badge>
    );

  return (
    <Screen
      title={t('suppliers.title')}
      subtitle={t('suppliers.subtitle')}
      {...(createdCode !== null ? { toast: t('suppliers.created', { code: createdCode }) } : {})}
      {...(guardado !== undefined ? { toast: t('common.saved') } : {})}
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section aria-labelledby="suppliers-list" className="min-w-0 space-y-4">
          <h2 id="suppliers-list" className="sr-only">
            {t('suppliers.title')}
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink
              href={includeArchived ? '/purchases/suppliers' : '/purchases/suppliers?archivados=1'}
              variant="secondary"
              size="sm"
            >
              {includeArchived ? (
                <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={2} />
              ) : (
                <Archive aria-hidden="true" className="size-4" strokeWidth={1.75} />
              )}
              {includeArchived ? t('common.back') : t('suppliers.showArchived')}
            </ButtonLink>
          </div>

          {/* No table at all when the list is empty: the E2E suite reads "a table exists"
              as "a supplier exists". */}
          {page.items.length === 0 ? (
            <Empty icon={Building2}>{t('suppliers.empty')}</Empty>
          ) : (
            <>
              <DesktopOnly>
                <TableFrame>
                  <thead>
                    <tr className="border-b border-line bg-subtle/60">
                      <th scope="col" className={TH}>
                        {t('suppliers.code')}
                      </th>
                      <th scope="col" className={TH}>
                        {t('suppliers.name')}
                      </th>
                      <th scope="col" className={TH}>
                        {t('suppliers.contact')}
                      </th>
                      <th scope="col" className={TH}>
                        {t('suppliers.phone')}
                      </th>
                      <th scope="col" className={`${TH} text-right`}>
                        {t('suppliers.state')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map((supplier) => (
                      <tr
                        key={supplier.id}
                        className={`border-b border-line transition-colors last:border-0 hover:bg-subtle/40 ${supplier.archived ? 'opacity-60' : ''}`}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-ink-soft">
                          {supplier.code}
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">{supplier.name}</td>
                        <td className="px-4 py-3 text-muted">{supplier.contactName ?? '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted">
                          {supplier.phone ?? '—'}
                        </td>
                        {/* Un proveedor cabe entero en su fila, asi que no tiene ficha
                            aparte: el estado y su cambio van aqui mismo. Una pantalla de
                            detalle que repitiera estas cuatro columnas seria un clic de
                            mas para ver lo que ya se esta viendo. */}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center justify-end gap-3">
                            {stateBadge(supplier.archived)}
                            {puedeEscribir && (
                              <Link
                                href={`/purchases/suppliers/${supplier.id}/edit`}
                                className="text-sm font-medium text-brand underline-offset-4 hover:underline"
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
              </DesktopOnly>

              {/* A supplier has no detail screen, so the phone card carries its own
                  actions instead of being a single tappable link. */}
              <MobileList>
                {page.items.map((supplier) => (
                  <li key={supplier.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className={`min-w-0 flex-1 ${supplier.archived ? 'opacity-60' : ''}`}>
                        <p className="truncate text-[15px] font-medium text-ink">{supplier.name}</p>
                        <p className="mt-0.5 truncate text-[13px] text-muted">
                          <span className="font-mono text-xs">{supplier.code}</span>
                          {supplier.contactName && ` · ${supplier.contactName}`}
                          {supplier.phone && ` · ${supplier.phone}`}
                        </p>
                      </div>
                      <div className="shrink-0">{stateBadge(supplier.archived)}</div>
                    </div>
                    {puedeEscribir && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <ButtonLink
                          href={`/purchases/suppliers/${supplier.id}/edit`}
                          variant="secondary"
                          size="sm"
                        >
                          {t('common.edit')}
                        </ButtonLink>
                        <StatusToggle
                          action={setSupplierStatusAction}
                          idField="supplierId"
                          id={supplier.id}
                          archived={supplier.archived}
                          archiveLabel={t('suppliers.archive')}
                          restoreLabel={t('suppliers.restore')}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </MobileList>
            </>
          )}
        </section>

        {puedeEscribir && (
          <aside
            aria-labelledby="supplier-form-heading"
            className="rounded-card border border-line bg-surface p-5 shadow-xs lg:sticky lg:top-6"
          >
            <h2 id="supplier-form-heading" className="mb-4 text-base font-semibold text-ink">
              {t('suppliers.new')}
            </h2>
            <SupplierForm />
          </aside>
        )}
      </div>
    </Screen>
  );
}

const TH = 'px-4 py-2.5 text-xs font-medium tracking-wide text-muted uppercase';
