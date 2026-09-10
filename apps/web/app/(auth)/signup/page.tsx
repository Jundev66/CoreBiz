import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { signUpAction } from '@/actions/auth';
import { demoConfig, signupConfig } from '@/demo/sandbox';
import { AuthForm } from '@/ui/auth-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('auth.signup.title'), robots: { index: false, follow: false } };
}

export default async function SignUpPage() {
  const t = await getTranslations();

  /*
   * Con el alta cerrada la pantalla EXPLICA y ofrece la demostracion, en lugar de
   * redirigir a /login.
   *
   * Redirigir seria mas corto y peor: quien llega aqui desde un enlace de un curriculum
   * quiere probar el sistema, y soltarlo en un formulario de acceso donde no tiene
   * credenciales lo deja sin saber que hacer. Decirle "esto esta cerrado, pasa por
   * aqui" responde la pregunta que traia.
   *
   * No es la medida que cierra el alta: eso lo hace la API, cuyo endpoint deja de
   * existir. Esto es la parte que se ve.
   */
  if (!signupConfig.enabled()) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.signup.closedTitle')}</h1>
        <p className="mt-2 mb-6 text-sm text-[var(--color-muted)]">{t('auth.signup.closedBody')}</p>

        {demoConfig.enabled() && (
          <Link
            href="/demo"
            className="block w-full rounded-md bg-[var(--color-brand)] px-5 py-3 text-center text-sm font-medium text-[var(--color-brand-ink)]"
          >
            {t('auth.signup.closedDemo')}
          </Link>
        )}

        <p className="mt-6 text-sm text-[var(--color-muted)]">
          {t('auth.signup.haveAccount')}{' '}
          <Link href="/login" className="underline underline-offset-4">
            {t('auth.signup.signIn')}
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('auth.signup.title')}</h1>
      <p className="mt-2 mb-6 text-sm text-[var(--color-muted)]">{t('auth.signup.subtitle')}</p>

      {/*
        Tres campos y ni uno mas. Cada pregunta extra en un alta es una razon para
        abandonarla, y lo demas —moneda, impuesto, tasa de cambio— se pregunta en el
        paso siguiente, con la persona ya dentro y el sistema delante, que es cuando
        esas palabras significan algo.
      */}
      <AuthForm
        action={signUpAction}
        submitLabel={t('auth.signup.submit')}
        pendingLabel={t('auth.signup.pending')}
        sentMessage={t('auth.signup.checkEmail')}
        fields={[
          {
            name: 'businessName',
            label: t('auth.businessName'),
            autoComplete: 'organization',
            hint: t('auth.signup.businessHint'),
            minLength: 2,
          },
          { name: 'email', label: t('auth.email'), type: 'email', autoComplete: 'email' },
          {
            name: 'password',
            label: t('auth.password'),
            type: 'password',
            autoComplete: 'new-password',
            hint: t('auth.passwordHint'),
            minLength: 8,
          },
        ]}
      />

      <p className="mt-6 text-sm text-[var(--color-muted)]">
        {t('auth.signup.haveAccount')}{' '}
        <Link href="/login" className="underline underline-offset-4">
          {t('auth.signup.signIn')}
        </Link>
      </p>
    </>
  );
}
