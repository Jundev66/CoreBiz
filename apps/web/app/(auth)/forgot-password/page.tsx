import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requestPasswordResetAction } from '@/actions/auth';
import { AuthForm } from '@/ui/auth-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('auth.forgot.title'), robots: { index: false, follow: false } };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('auth.forgot.title')}</h1>
      <p className="mt-2 mb-6 text-sm text-[var(--color-muted)]">{t('auth.forgot.subtitle')}</p>

      {/*
        El mensaje de exito es el mismo exista o no la direccion. Decir "esa
        cuenta no existe" seria comodo para quien se equivoco escribiendo, y a la
        vez convertiria este formulario en un comprobador de correos registrados.
      */}
      <AuthForm
        action={requestPasswordResetAction}
        submitLabel={t('auth.forgot.submit')}
        pendingLabel={t('auth.forgot.pending')}
        sentMessage={t('auth.forgot.sent')}
        fields={[{ name: 'email', label: t('auth.email'), type: 'email', autoComplete: 'email' }]}
      />

      <p className="mt-6 text-sm">
        <Link href="/login" className="underline underline-offset-4">
          {t('auth.forgot.back')}
        </Link>
      </p>
    </>
  );
}
