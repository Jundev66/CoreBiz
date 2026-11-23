'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldAlert, X, FileText } from 'lucide-react';

export function LegalDisclaimerBanner() {
  const t = useTranslations('legal');
  const [isDismissed, setIsDismissed] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem('corebiz_dismiss_demo_banner');
    if (!dismissed) {
      setIsDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem('corebiz_dismiss_demo_banner', '1');
    setIsDismissed(true);
  };

  if (isDismissed) return null;

  return (
    <>
      <aside
        role="region"
        aria-label="Aviso Legal de Demostración"
        className="relative z-40 bg-brand-soft border-b border-brand/20 px-3 py-1.5 text-xs text-ink"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex shrink-0 items-center gap-1 rounded-pill bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand uppercase tracking-wider">
              <ShieldAlert className="size-3" />
              <span>Demo</span>
            </span>
            <p className="truncate text-ink-soft">
              <strong className="text-ink">{t('syntheticShieldTitle')}:</strong>{' '}
              {t('syntheticShieldNotice')}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1 font-semibold text-brand hover:underline cursor-pointer"
            >
              <FileText className="size-3" />
              <span>{t('viewLegalNotice')}</span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Cerrar aviso"
              className="rounded-lg p-1 text-muted hover:bg-surface hover:text-ink transition cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-brand-soft text-brand">
                  <ShieldAlert className="size-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-ink">{t('termsTitle')}</h3>
                  <p className="text-xs text-muted">{t('syntheticShieldTitle')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1 text-muted hover:bg-subtle hover:text-ink cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-ink-soft">
              <p className="rounded-xl border border-line bg-canvas p-3 font-medium">
                {t('syntheticShieldNotice')}
              </p>
              <p>{t('termsBody')}</p>
            </div>

            <div className="pt-2 border-t border-line flex justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-hover transition cursor-pointer"
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
