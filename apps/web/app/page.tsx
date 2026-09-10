import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { activeDriver } from '@/api/session';
import { currentUser, supabaseIsConfigured } from '@/auth/supabase';
import { signupConfig } from '@/demo/sandbox';

/**
 * Portada.
 *
 * Hace dos trabajos y conviene que se note cual es cual: para quien ya usa el
 * sistema es el punto de partida del dia, y para quien llega desde un enlace es
 * la explicacion de que es esto. Por eso los modulos van arriba —lo que se usa
 * todos los dias no se esconde detras de un texto de bienvenida— y la invitacion
 * a crear cuenta va debajo, donde solo la lee quien todavia no tiene una.
 *
 * No llama a `apiForRequest()` a proposito: eso montaria el contenedor de datos y,
 * sin sesion ni demostracion disponible, redirigiria a la pantalla de acceso. La
 * portada tiene que poder verse siempre.
 */
export default async function HomePage() {
  const t = await getTranslations();
  const driver = activeDriver();
  const user = supabaseIsConfigured() ? await currentUser() : null;

  const modules = [
    { href: '/customers', label: t('nav.customers'), hint: t('customers.subtitle') },
    { href: '/products', label: t('nav.products'), hint: t('products.subtitle') },
    { href: '/delivery-notes', label: t('nav.deliveryNotes'), hint: t('deliveryNotes.subtitle') },
    { href: '/reports', label: t('nav.reports'), hint: t('reports.subtitle') },
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10">
        <h1 className="text-4xl font-semibold tracking-tight">{t('app.name')}</h1>
        <p className="mt-2 text-lg text-[var(--color-muted)]">{t('app.tagline')}</p>
      </header>

      {driver === 'memory' && (
        <div className="mb-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <p className="text-sm font-medium">{t('demo.banner')}</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{t('demo.memoryDriver')}</p>
        </div>
      )}

      <nav aria-label={t('app.name')}>
        <ul className="space-y-3">
          {modules.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center justify-between gap-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-4 transition hover:border-[var(--color-brand)]"
              >
                <span>
                  <span className="block font-medium">{item.label}</span>
                  <span className="mt-0.5 block text-sm text-[var(--color-muted)]">
                    {item.hint}
                  </span>
                </span>
                <span aria-hidden="true" className="text-[var(--color-muted)]">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Solo para quien no ha entrado. A quien ya tiene sesion, invitarle a
          crear una cuenta le sobra y le confunde. */}
      {user === null && (
        <section className="mt-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <h2 className="text-base font-medium">{t('home.ownAccount')}</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{t('home.ownAccountHint')}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {/* Probar va PRIMERO y con el color de marca. Los modulos de arriba
                llevan al acceso mientras no haya sesion, asi que sin esta puerta
                quien llega desde un enlace solo encuentra un formulario que
                todavia no tiene motivos para rellenar. */}
            <Link
              href="/demo"
              className="rounded-md bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand-ink)]"
            >
              {t('demo.start')}
            </Link>
            {signupConfig.enabled() && (
              <Link
                href="/signup"
                className="rounded-md border border-[var(--color-line)] px-4 py-2 text-sm font-medium"
              >
                {t('auth.signup.submit')}
              </Link>
            )}
            <Link
              href="/login"
              className="rounded-md border border-[var(--color-line)] px-4 py-2 text-sm font-medium"
            >
              {t('auth.login.submit')}
            </Link>
          </div>
        </section>
      )}

      <footer className="mt-16 border-t border-[var(--color-line)] pt-6">
        <p className="text-sm text-[var(--color-muted)]">{t('legal.notice')}</p>
      </footer>
    </main>
  );
}
