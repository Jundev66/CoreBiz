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
export type SettingsSection = 'business' | 'accounting' | 'team' | 'audit' | 'ai';

const SECTIONS: readonly {
  id: SettingsSection;
  href: string;
  permission?: Permission;
  customLabel?: string;
}[] = [
  { id: 'business', href: '/settings' },
  {
    id: 'accounting',
    href: '/settings/accounting',
    permission: 'accounting:read',
    customLabel: 'Cuentas Contables',
  },
  { id: 'team', href: '/settings/team', permission: 'user:read' },
  { id: 'audit', href: '/settings/audit', permission: 'audit:read' },
  { id: 'ai', href: '/settings/ai', permission: 'ai:configure' },
];

/** A segmented control: it scrolls sideways on its own instead of pushing the page wider. */
export async function SettingsNav({ current, actor }: { current: SettingsSection; actor: Actor }) {
  const t = await getTranslations();

  return (
    <nav aria-label={t('settings.title')} className="mb-6 sm:mb-8">
      <div className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-control bg-subtle p-1">
        {SECTIONS.filter(
          ({ permission }) => permission === undefined || can(actor, permission),
        ).map((section) => {
          const active = section.id === current;
          return (
            <Link
              key={section.id}
              href={section.href}
              aria-current={active ? 'page' : undefined}
              className={`rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                active ? 'bg-surface text-ink shadow-xs' : 'text-muted hover:text-ink'
              }`}
            >
              {section.customLabel ?? t(`settings.tabs.${section.id}`)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
