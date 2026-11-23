'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Cookie, ShieldCheck } from 'lucide-react';

export function CookieConsentBanner() {
  const t = useTranslations('legal');
  const [hasConsented, setHasConsented] = useState(true);

  useEffect(() => {
    const consent = localStorage.getItem('corebiz_cookie_consent');
    if (!consent) {
      setHasConsented(false);
    }
  }, []);

  const handleConsent = () => {
    localStorage.setItem('corebiz_cookie_consent', 'accepted');
    setHasConsented(true);
  };

  if (hasConsented) return null;

  return (
    <div
      role="region"
      aria-label="Aviso de Privacidad y Cookies"
      className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-2xl rounded-2xl border border-line bg-surface/95 p-4 shadow-2xl backdrop-blur-md sm:bottom-6 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <Cookie className="size-5" />
          </span>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-ink">{t('cookieConsentTitle')}</h4>
              <span className="inline-flex items-center gap-1 rounded-pill bg-success-soft px-1.5 py-0.2 text-[9px] font-bold text-success-ink">
                <ShieldCheck className="size-3" />
                <span>Zero Tracking</span>
              </span>
            </div>
            <p className="text-xs text-muted leading-relaxed">{t('cookieConsentNotice')}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={handleConsent}
            className="rounded-xl border border-line bg-subtle px-3 py-1.5 text-xs font-semibold text-ink hover:bg-canvas transition cursor-pointer"
          >
            {t('cookiePreferences')}
          </button>
          <button
            type="button"
            onClick={handleConsent}
            className="rounded-xl bg-brand px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-brand-hover transition cursor-pointer"
          >
            {t('cookieAccept')}
          </button>
        </div>
      </div>
    </div>
  );
}
