import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { apiForRequest } from '@/api/session';
import { Shell } from '@/ui/shell';
import { InDevelopment } from '@/ui/in-development';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('payments.title') };
}

/**
 * Cobros — en desarrollo.
 *
 * Es el modulo que mas se nota que falta, y por una razon concreta: el limite de
 * credito de un cliente YA esta implementado y probado en el dominio, pero la
 * consulta de saldo pendiente devuelve siempre cero porque no hay cobros que
 * restar. La regla existe y no llega a dispararse nunca.
 *
 * Se ensena en lugar de esconderse porque un comercio que vende fiado va a buscar
 * esta pantalla el primer dia, y no encontrarla ni encontrar una explicacion es
 * peor que encontrar esto.
 */
export default async function PaymentsPage() {
  const t = await getTranslations();
  const { ctx, session } = await apiForRequest();

  return (
    <Shell
      ctx={ctx}
      session={session}
      title={t('payments.title')}
      subtitle={t('payments.subtitle')}
    >
      <InDevelopment
        summary={t('payments.summary')}
        points={[
          t('payments.pointRecord'),
          t('payments.pointBalance'),
          t('payments.pointCreditLimit'),
          t('payments.pointAging'),
        ]}
        why={t('payments.why')}
        meanwhile={{
          text: t('payments.meanwhile'),
          href: '/customers',
          label: t('nav.customers'),
        }}
      />
    </Shell>
  );
}
