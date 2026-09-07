import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { updatePasswordAction } from '@/actions/auth';
import { AuthForm } from '@/ui/auth-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('auth.reset.title'), robots: { index: false, follow: false } };
}

/**
 * Nueva contrasena.
 *
 * Se llega aqui desde el enlace del correo, que Supabase ya canjeo por una
 * sesion de recuperacion antes de renderizar esto. Por eso la pantalla no pide
 * la contrasena anterior: quien llega ya demostro que controla el buzon, que es
 * justo lo que hace falta cuando la anterior se olvido.
 *
 * La accion vuelve a comprobar que existe esa sesion. Sin esa comprobacion, la
 * Server Action seria un cambiador de contrasenas abierto a cualquiera.
 */
export default async function ResetPasswordPage() {
  const t = await getTranslations();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('auth.reset.title')}</h1>
      <p className="mt-2 mb-6 text-sm text-[var(--color-muted)]">{t('auth.reset.subtitle')}</p>

      <AuthForm
        action={updatePasswordAction}
        submitLabel={t('auth.reset.submit')}
        pendingLabel={t('auth.reset.pending')}
        fields={[
          {
            name: 'password',
            label: t('auth.newPassword'),
            type: 'password',
            autoComplete: 'new-password',
            hint: t('auth.passwordHint'),
            minLength: 8,
          },
        ]}
      />
    </>
  );
}
