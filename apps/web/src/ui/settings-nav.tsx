import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { can, type Actor, type Permission } from '@corebiz/domain';

/**
 * Navegacion entre las tres pantallas de ajustes.
 *
 * Vive aqui y no dentro de una de ellas porque un archivo de pagina de Next solo
 * puede exportar la pagina y su metadata: exportar ademas un componente compartido
 * desde ahi rompe el build de formas que el mensaje de error no explica bien.
 *
 * La pestana activa lleva `aria-current="page"` ademas del color. El color solo
 * lo ve quien puede verlo.
 */
export type SettingsSection = 'business' | 'team' | 'audit';

/**
 * `permission` is what is needed for the tab to lead somewhere.
 *
 * "Team" and "Audit" only exist for whoever can read them: without this, three of the five
 * roles had two tabs there that answered with an error. "Business" needs no permission
 * because it reads nothing from the API — it renders what the session context carries.
 */
const SECTIONS: readonly { id: SettingsSection; href: string; permission?: Permission }[] = [
  { id: 'business', href: '/settings' },
  { id: 'team', href: '/settings/team', permission: 'user:read' },
  { id: 'audit', href: '/settings/audit', permission: 'audit:read' },
];

export async function SettingsNav({ current, actor }: { current: SettingsSection; actor: Actor }) {
  const t = await getTranslations();

  return (
    <nav aria-label={t('settings.title')} className="mb-8 flex flex-wrap gap-2">
      {SECTIONS.filter(({ permission }) => permission === undefined || can(actor, permission)).map(
        (section) => {
          const active = section.id === current;
          return (
            <Link
              key={section.id}
              href={section.href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'rounded-md bg-[var(--color-brand)] px-3 py-1.5 text-sm font-medium text-[var(--color-brand-ink)]'
                  : 'rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm transition hover:border-[var(--color-brand)]'
              }
            >
              {t(`settings.tabs.${section.id}`)}
            </Link>
          );
        },
      )}
    </nav>
  );
}
