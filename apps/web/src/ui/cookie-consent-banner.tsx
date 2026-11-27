'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Cookie } from 'lucide-react';

function persistConsent(choice: 'accepted' | 'essential'): void {
  localStorage.setItem('corebiz_cookie_consent', choice);
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `corebiz_cookie_consent=${choice}; path=/; max-age=15552000; SameSite=Lax${secure}`;
}

export function CookieConsentBanner() {
  const t = useTranslations('legal');
  const [hasConsented, setHasConsented] = useState(true);

  useEffect(() => {
    const consent = localStorage.getItem('corebiz_cookie_consent');
    if (!consent) {
      setHasConsented(false);
    }
  }, []);

  const handleAccept = () => {
    persistConsent('accepted');
    setHasConsented(true);
  };

  const handleEssentialOnly = () => {
    persistConsent('essential');
    setHasConsented(true);
  };

  if (hasConsented) return null;

  return (
    <div
      role="region"
      aria-label="Aviso de Privacidad y Cookies"
      className="fixed bottom-3 left-3 right-3 z-40 mx-auto max-w-xl rounded-xl border border-line bg-surface/95 px-3.5 py-2.5 shadow-lg backdrop-blur-md sm:bottom-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Cookie className="size-4 shrink-0 text-brand" aria-hidden="true" />
          <p className="text-[11px] leading-snug text-muted">
            <strong className="text-ink">{t('cookieConsentTitle')}:</strong>{' '}
            {t('cookieConsentNotice')}
          </p>
        </div>

        <div className="flex items-center justify-end gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleEssentialOnly}
            className="rounded-lg border border-line bg-subtle px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-canvas transition cursor-pointer whitespace-nowrap"
          >
            {t('cookiePreferences')}
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="rounded-lg bg-indigo-600 px-3 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-indigo-700 transition cursor-pointer whitespace-nowrap"
          >
            {t('cookieAccept')}
          </button>
        </div>
      </div>
    </div>
  );
}
