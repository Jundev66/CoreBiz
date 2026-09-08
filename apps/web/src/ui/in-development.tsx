import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

/**
 * Un modulo que todavia no esta.
 *
 * La alternativa era no ensenarlo, y es peor. Un ERP al que le falta la mitad de lo
 * que un comercio espera —cobrar, presupuestar— y que ademas no lo dice, deja a
 * quien lo evalua buscando la pantalla durante diez minutos antes de concluir que
 * el sistema es incompleto Y confuso. Decirlo cuesta una pantalla y convierte un
 * hueco en un alcance declarado.
 *
 * Cada uno explica tres cosas, y las tres importan: que hara, por que no esta
 * todavia, y QUE HACER MIENTRAS TANTO. La tercera es la que evita que la pantalla
 * sea una disculpa.
 */

export interface InDevelopmentProps {
  /** Que resolvera el modulo, en una frase. */
  readonly summary: string;
  /** Lo que hara, en puntos. */
  readonly points: readonly string[];
  /** Por que no esta todavia. Sin rodeos. */
  readonly why: string;
  /** Que usar mientras tanto, si hay algo. */
  readonly meanwhile?: { readonly text: string; readonly href: string; readonly label: string };
}

export async function InDevelopment({ summary, points, why, meanwhile }: InDevelopmentProps) {
  const t = await getTranslations();

  return (
    <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] px-6 py-8">
      <p
        className="inline-block rounded-full border border-[var(--color-warn)] bg-[var(--color-warn)]/10 px-3 py-1 text-xs font-medium text-[var(--color-warn-ink)]"
        role="status"
      >
        {t('development.badge')}
      </p>

      <p className="mt-4 max-w-2xl text-base">{summary}</p>

      <ul className="mt-5 space-y-2 text-sm text-[var(--color-muted)]">
        {points.map((point) => (
          <li key={point}>· {point}</li>
        ))}
      </ul>

      <h2 className="mt-8 text-sm font-medium">{t('development.whyHeading')}</h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">{why}</p>

      {meanwhile && (
        <>
          <h2 className="mt-8 text-sm font-medium">{t('development.meanwhileHeading')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
            {meanwhile.text}{' '}
            <Link href={meanwhile.href} className="underline underline-offset-4">
              {meanwhile.label}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
