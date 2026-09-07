import { getTranslations } from 'next-intl/server';

/**
 * Aviso de modulo reservado al plan de pago.
 *
 * Se muestra la pantalla con su titulo y su navegacion, no un 404 ni una
 * redireccion. Saber que existe algo mas es parte de como funciona un freemium
 * honesto: esconder el modulo entero haria imposible que alguien decidiera si le
 * interesa.
 *
 * Que esto se vea NO es lo que bloquea nada. El bloqueo vive en el caso de uso,
 * que devuelve `FeatureNotAvailable` venga la peticion de donde venga.
 */
export async function UpgradeNotice({ feature }: { feature: string }) {
  const t = await getTranslations();

  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-8 text-center">
      <p className="text-2xl" aria-hidden="true">
        🔒
      </p>
      <h2 className="mt-3 text-lg font-medium">{t('plans.lockedHeading', { feature })}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-muted)]">
        {t('plans.lockedBody')}
      </p>
    </div>
  );
}
