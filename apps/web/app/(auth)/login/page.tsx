import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { signInAction } from '@/actions/auth';
import { AuthForm } from '@/ui/auth-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  // Las pantallas de cuenta no se indexan: no aportan nada en un buscador y
  // aparecer ahi solo invita a que alguien las pruebe.
  return { title: t('auth.login.title'), robots: { index: false, follow: false } };
}

export default async function LoginPage() {
  const t = await getTranslations();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('auth.login.title')}</h1>
      <p className="mt-2 mb-6 text-sm text-[var(--color-muted)]">{t('auth.login.subtitle')}</p>

      <AuthForm
        action={signInAction}
        submitLabel={t('auth.login.submit')}
        pendingLabel={t('auth.login.pending')}
        fields={[
          {
            name: 'email',
            label: t('auth.email'),
            type: 'email',
            autoComplete: 'email',
          },
          {
            name: 'password',
            label: t('auth.password'),
            type: 'password',
            // `current-password` deja que el gestor de contrasenas del navegador
            // rellene la que ya existe en lugar de ofrecer generar una nueva.
            autoComplete: 'current-password',
          },
        ]}
      />

      <div className="mt-6 space-y-2 text-sm">
        <p>
          <Link href="/forgot-password" className="underline underline-offset-4">
            {t('auth.login.forgot')}
          </Link>
        </p>
        <p className="text-[var(--color-muted)]">
          {t('auth.login.noAccount')}{' '}
          <Link href="/signup" className="underline underline-offset-4">
            {t('auth.login.createAccount')}
          </Link>
        </p>
      </div>

      {/* La demostracion se ofrece aqui a proposito: quien llega desde un CV no
          quiere crear una cuenta para mirar, y esconder la puerta detras de un
          registro es la forma mas eficaz de que no la abra nadie. */}
      <p className="mt-6 border-t border-[var(--color-line)] pt-6 text-sm text-[var(--color-muted)]">
        {t('auth.login.demoHint')}{' '}
        <Link href="/customers" className="underline underline-offset-4">
          {t('auth.login.demoLink')}
        </Link>
      </p>
    </>
  );
}
