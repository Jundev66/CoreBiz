import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

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

const SECTIONS: readonly { id: SettingsSection; href: string }[] = [
  { id: 'business', href: '/settings' },
  { id: 'team', href: '/settings/team' },
  { id: 'audit', href: '/settings/audit' },
];

export async function SettingsNav({ current }: { current: SettingsSection }) {
  const t = await getTranslations();

  return (
    <nav aria-label={t('settings.title')} className="mb-8 flex flex-wrap gap-2">
      {SECTIONS.map((section) => {
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
      })}
    </nav>
  );
}
