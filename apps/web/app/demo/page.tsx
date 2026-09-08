import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { activeDriver } from '@/api/session';
import { currentUser, supabaseIsConfigured } from '@/auth/supabase';
import { demoConfig } from '@/demo/sandbox';
import { DemoStart } from '@/ui/demo-start';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('demo.title') };
}

/**
 * La pagina que hay detras del enlace del curriculum.
 *
 * Solo PINTA. Crear el visitante ocurre en `startDemoAction`, por POST, y esa
 * separacion es la que impide que un rastreador o la previsualizacion de un
 * enlace en un chat cree una cuenta y una copia de la base cada vez que alguien
 * comparte la direccion.
 */
export default async function DemoPage() {
  const t = await getTranslations();

  if (!demoConfig.enabled()) redirect('/login');

  // En modo memoria no hay nada que clonar ni sesion que crear: la aplicacion
  // entera YA es la demostracion.
  if (activeDriver() === 'memory') redirect('/customers');

  // Quien ya entro no vuelve a ver el boton: ofrecerle crear un segundo
  // visitante a quien ya tiene uno vivo acabaria en el limite por hora, que es
  // la peor forma posible de decirle "ya estas dentro".
  //
  // Se pasa como dato a `DemoStart` y NO se redirige aqui. Redirigir parece mas
  // limpio y rompe la pantalla: tras una Server Action, Next vuelve a renderizar
  // la ruta actual, y para entonces la accion YA ha iniciado la sesion. El
  // redirect se dispararia en ese segundo render y se llevaria por delante las
  // credenciales antes de que nadie pudiera leerlas.
  const alreadyInside = supabaseIsConfigured() && (await currentUser()) !== null;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{t('demo.title')}</h1>
      <p className="mt-3 text-[var(--color-muted)]">{t('demo.intro')}</p>

      {!alreadyInside && (
        <ul className="mt-6 space-y-2 text-sm text-[var(--color-muted)]">
          <li>· {t('demo.pointOwnCopy')}</li>
          <li>· {t('demo.pointCredentials')}</li>
          <li>· {t('demo.pointExpires')}</li>
        </ul>
      )}

      <DemoStart alreadyInside={alreadyInside} />

      <p className="mt-6 text-sm text-[var(--color-muted)]">
        {t('demo.orSignUp')}{' '}
        <Link href="/signup" className="underline underline-offset-4">
          {t('auth.signup.submit')}
        </Link>
      </p>

      <p className="mt-10 text-xs text-[var(--color-muted)]">{t('legal.notice')}</p>
    </main>
  );
}
