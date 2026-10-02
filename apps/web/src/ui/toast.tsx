'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type ToastTone = 'error' | 'warning' | 'success' | 'info';

export interface ToastItem {
  readonly id: string;
  readonly tone: ToastTone;
  readonly title?: string | undefined;
  readonly message: string;
  readonly duration?: number | undefined;
}

type ToastListener = (toasts: readonly ToastItem[]) => void;

class ToastManager {
  private items: ToastItem[] = [];
  private listeners: Set<ToastListener> = new Set();
  private counter = 0;

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    listener(this.items);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const readonlyItems = [...this.items];
    this.listeners.forEach((listener) => listener(readonlyItems));
  }

  show(tone: ToastTone, message: string, options?: { title?: string; duration?: number }): string {
    const id = `toast-${Date.now()}-${++this.counter}`;
    const duration = options?.duration ?? (tone === 'error' ? 6000 : 4500);
    const item: ToastItem = {
      id,
      tone,
      title: options?.title,
      message,
      duration,
    };
    // Keep at most 4 toasts on screen
    this.items = [...this.items.slice(-3), item];
    this.notify();
    return id;
  }

  dismiss(id: string): void {
    this.items = this.items.filter((item) => item.id !== id);
    this.notify();
  }

  clear(): void {
    this.items = [];
    this.notify();
  }

  error(message: string, options?: { title?: string; duration?: number }): string {
    return this.show('error', message, options);
  }

  warning(message: string, options?: { title?: string; duration?: number }): string {
    return this.show('warning', message, options);
  }

  success(message: string, options?: { title?: string; duration?: number }): string {
    return this.show('success', message, options);
  }

  info(message: string, options?: { title?: string; duration?: number }): string {
    return this.show('info', message, options);
  }
}

export const toast = new ToastManager();

/**
 * Toast item individual con barra de tiempo y pausa al colocar el cursor encima.
 */
function ToastItemCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const t = useTranslations();
  const [isPaused, setIsPaused] = useState(false);
  const remainingRef = useRef(item.duration ?? 4500);
  const startRef = useRef(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startTimer = useCallback(() => {
    startRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      onDismiss(item.id);
    }, remainingRef.current);
  }, [item.id, onDismiss]);

  const pauseTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startRef.current));
    }
  }, []);

  useEffect(() => {
    if (!isPaused) {
      startTimer();
    } else {
      pauseTimer();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPaused, startTimer, pauseTimer]);

  const toneConfig = {
    error: {
      border: 'border-l-[4px] border-l-[var(--color-danger)]',
      bg: 'bg-surface shadow-xl border border-line',
      icon: <AlertCircle className="size-5 shrink-0 text-[var(--color-danger)]" strokeWidth={2} />,
      role: 'alert' as const,
      defaultTitle: 'Validación requerida',
    },
    warning: {
      border: 'border-l-[4px] border-l-[var(--color-warn)]',
      bg: 'bg-surface shadow-xl border border-line',
      icon: <AlertTriangle className="size-5 shrink-0 text-[var(--color-warn)]" strokeWidth={2} />,
      role: 'alert' as const,
      defaultTitle: 'Atención',
    },
    success: {
      border: 'border-l-[4px] border-l-[var(--color-success)]',
      bg: 'bg-surface shadow-xl border border-line',
      icon: (
        <CheckCircle2 className="size-5 shrink-0 text-[var(--color-success)]" strokeWidth={2} />
      ),
      role: 'status' as const,
      defaultTitle: 'Operación exitosa',
    },
    info: {
      border: 'border-l-[4px] border-l-[var(--color-brand)]',
      bg: 'bg-surface shadow-xl border border-line',
      icon: <Info className="size-5 shrink-0 text-[var(--color-brand)]" strokeWidth={2} />,
      role: 'status' as const,
      defaultTitle: 'Información',
    },
  }[item.tone];

  return (
    <div
      role={toneConfig.role}
      aria-live={item.tone === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`pointer-events-auto relative flex w-full max-w-md items-start gap-3 rounded-card p-4 transition-all duration-200 animate-in fade-in slide-in-from-top-3 ${toneConfig.bg} ${toneConfig.border}`}
    >
      <div className="mt-0.5">{toneConfig.icon}</div>
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-semibold text-ink">{item.title ?? toneConfig.defaultTitle}</h4>
        <p className="mt-0.5 text-xs sm:text-sm leading-relaxed text-ink-soft">{item.message}</p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label={t('common.close')}
        className="shrink-0 rounded-control p-1 text-muted transition hover:bg-subtle hover:text-ink"
      >
        <X className="size-4" strokeWidth={2} />
      </button>
    </div>
  );
}

/**
 * Contenedor global de Toasts.
 * Montado en RootLayout para escuchar avisos desde cualquier lugar del sistema.
 */
export function ToastContainer() {
  const [items, setItems] = useState<readonly ToastItem[]>([]);

  useEffect(() => {
    return toast.subscribe((newItems) => {
      setItems(newItems);
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <aside
      aria-label="Notificaciones"
      className="pointer-events-none fixed top-4 right-4 sm:top-5 sm:right-5 z-[9999] flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-2.5"
    >
      {items.map((item) => (
        <ToastItemCard key={item.id} item={item} onDismiss={(id) => toast.dismiss(id)} />
      ))}
    </aside>
  );
}

/**
 * Componente Toast original para compatibilidad con avisos en la URL (?creado=, ?guardado=).
 */
export function Toast({ message }: { message: string }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    const avisos = ['creado', 'guardado'].filter((clave) => url.searchParams.has(clave));
    if (avisos.length > 0) {
      for (const clave of avisos) url.searchParams.delete(clave);
      const query = url.searchParams.toString();
      window.history.replaceState(
        null,
        '',
        query === '' ? url.pathname : `${url.pathname}?${query}`,
      );
    }

    toast.success(message);
  }, [message]);

  return null;
}
