import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createBusinessAction } from '@/actions/auth';
import { currentUser } from '@/auth/supabase';
import { AuthForm } from '@/ui/auth-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('auth.onboarding.title'), robots: { index: false, follow: false } };
}

/**
 * Donde nace la empresa. El unico sitio, ahora.
 *
 * Antes habia dos caminos: este y el propio registro, que creaba la empresa al vuelo con
 * el nombre y nada mas. Dos caminos que crean el mismo objeto acaban pidiendo cosas
 * distintas, y eso fue justo lo que paso — por el atajo del registro la empresa nacia
 * SIN TASA DE CAMBIO, y sin tasa no se emite una sola nota de entrega. El negocio estaba
 * roto desde el primer minuto y solo se arreglaba si alguien encontraba Ajustes.
 *
 * Registrarse sigue costando tres campos. Lo demas se pregunta aqui, con la persona ya
 * dentro y con el sistema delante, que es cuando "impuesto informativo" y "tasa de
 * cambio" significan algo.
 *
 * El nombre viene prerrellenado desde los metadatos de la cuenta: se escribio al
 * registrarse y no hay razon para volver a pedirlo. Se deja editable porque a veces uno
 * se equivoca escribiendo el nombre de su propio negocio, y este es el ultimo momento
 * comodo para corregirlo.
 */
export default async function OnboardingPage() {
  const t = await getTranslations();
  const user = await currentUser();

  // Sin sesion no hay empresa que crear. Se manda a acceder en lugar de mostrar
  // un formulario que fallaria al enviarse.
  if (user === null) redirect('/login');

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.onboarding.title')}</h1>
        <p className="mt-2 mb-6 text-sm text-[var(--color-muted)]">
          {t('auth.onboarding.subtitle')}
        </p>

        <AuthForm
          action={createBusinessAction}
          submitLabel={t('auth.onboarding.submit')}
          pendingLabel={t('auth.onboarding.pending')}
          fields={[
            {
              name: 'businessName',
              label: t('auth.businessName'),
              autoComplete: 'organization',
              defaultValue: user.businessName ?? '',
              hint: t('auth.signup.businessHint'),
              minLength: 2,
            },
            {
              name: 'baseCurrency',
              label: t('settings.fields.baseCurrency'),
              defaultValue: 'USD',
              options: [
                { value: 'USD', label: 'USD' },
                { value: 'VES', label: 'VES' },
              ],
              hint: t('settings.hints.baseCurrency'),
            },
            {
              name: 'taxLabel',
              label: t('settings.fields.taxLabel'),
              defaultValue: 'Impuesto informativo',
              hint: t('settings.hints.taxLabel'),
              minLength: 2,
            },
            {
              name: 'taxRate',
              label: t('settings.fields.taxRate'),
              defaultValue: '16',
              hint: t('settings.hints.taxRate'),
            },
            {
              // Opcional de verdad: quien opere solo en su moneda base no tiene ninguna
              // que dar. Pero se pregunta AQUI y no en Ajustes porque sin ella la
              // empresa no puede emitir, y descubrirlo el primer dia de trabajo es
              // peor que responder una pregunta de mas hoy.
              name: 'exchangeRate',
              label: t('settings.fields.exchangeRate'),
              optional: true,
              hint: t('auth.onboarding.exchangeRateHint'),
            },
          ]}
        />
      </div>
    </div>
  );
}
