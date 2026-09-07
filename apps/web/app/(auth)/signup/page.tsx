import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { signUpAction } from '@/actions/auth';
import { AuthForm } from '@/ui/auth-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('auth.signup.title'), robots: { index: false, follow: false } };
}

export default async function SignUpPage() {
  const t = await getTranslations();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('auth.signup.title')}</h1>
      <p className="mt-2 mb-6 text-sm text-[var(--color-muted)]">{t('auth.signup.subtitle')}</p>

      {/*
        Tres campos y ni uno mas. Cada pregunta extra en un alta es una razon
        para abandonarla, y todo lo demas —moneda, impuesto, tasa de cambio—
        tiene un valor por defecto razonable y se cambia despues en Ajustes,
        cuando la persona ya tiene el sistema delante y entiende que le pregunta.
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
