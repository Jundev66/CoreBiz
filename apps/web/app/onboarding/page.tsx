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
 * El paso que existe porque el alta puede partirse en dos.
 *
 * Si Supabase esta configurado para confirmar el correo, la cuenta se crea hoy y
 * la primera sesion llega cuando la persona abre el enlace, quiza al dia
 * siguiente y desde otro dispositivo. La empresa no se puede crear en el momento
 * del registro porque entonces no habia sesion con la que crearla.
 *
 * El nombre viene prerrellenado desde los metadatos de la cuenta: se escribio al
 * registrarse y no hay razon para volver a pedirlo. Se deja editable porque a
 * veces uno se equivoca escribiendo el nombre de su propio negocio, y este es el
 * ultimo momento comodo para corregirlo.
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
          ]}
        />
      </div>
    </div>
  );
}
