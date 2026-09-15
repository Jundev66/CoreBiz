import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createBusinessAction } from '@/actions/auth';
import { currentUser } from '@/auth/supabase';
import { AuthForm } from '@/ui/auth-form';
import { Logo } from '@/ui/logo';

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
 *
 * It lives outside `(auth)` but wears the same frame — the wash, the logo, the centred
 * card — so the step right after signing up does not look like a different product.
 */
export default async function OnboardingPage() {
  const t = await getTranslations();
  const user = await currentUser();

  // Sin sesion no hay empresa que crear. Se manda a acceder en lugar de mostrar
  // un formulario que fallaria al enviarse.
  if (user === null) redirect('/login');

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-linear-to-b from-brand-soft to-transparent"
      />

      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo name={t('app.name')} size="lg" />
        </Link>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-md sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {t('auth.onboarding.title')}
          </h1>
          <p className="mt-1.5 mb-6 text-sm text-muted">{t('auth.onboarding.subtitle')}</p>

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
      </main>

      <footer className="relative mx-auto w-full max-w-md px-6 pb-8">
        <p className="text-center text-xs text-muted">{t('legal.notice')}</p>
      </footer>
    </div>
  );
}
