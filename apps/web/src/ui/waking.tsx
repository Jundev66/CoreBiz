'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { buttonClasses } from '@/ui/button';

/**
 * La espera mientras la API despierta.
 *
 * Es el UNICO componente de cliente que hace peticiones en toda la aplicacion, y
 * conviene decir por que se admite aqui: no hay forma de sondear desde el servidor sin
 * dejar una peticion abierta durante un minuto, y una peticion de un minuto en Vercel
 * se corta antes de terminar. El sondeo tiene que vivir en el navegador.
 *
 * No pide datos de nadie: pregunta a una ruta propia si la API responde, y esa ruta no
 * devuelve mas que un booleano.
 *
 * Si el JavaScript no carga, la pagina sigue diciendo lo que pasa y ofreciendo el
 * enlace para reintentar a mano. Se degrada a un texto y un enlace, que es
 * exactamente lo que hace el resto de la aplicacion.
 */

export interface WakingProps {
  /** A donde volver cuando la API conteste. */
  readonly next: string;
  readonly labels: {
    readonly waiting: string;
    readonly ready: string;
    readonly stuck: string;
    readonly retry: string;
  };
}

/** Cada cuanto se pregunta. Dos segundos: ni ansioso ni desatento. */
const POLL_MS = 2_000;

/** A partir de aqui se admite que esta tardando mas de lo normal. */
const PATIENCE_MS = 75_000;

export function Waking({ next, labels }: WakingProps) {
  const router = useRouter();
  const [state, setState] = useState<'waiting' | 'ready' | 'stuck'>('waiting');
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();

    async function poll(): Promise<void> {
      if (cancelled) return;

      const passed = Date.now() - started;
      setElapsed(Math.round(passed / 1000));

      const ready = await fetch('/api/wake', { cache: 'no-store' })
        .then((res) => res.json() as Promise<{ ready: boolean }>)
        .then((body) => body.ready)
        .catch(() => false);

      if (cancelled) return;

      if (ready) {
        setState('ready');
        // `replace` y no `push`: esta pantalla no deberia quedarse en el historial,
        // porque volver atras desde donde ibas te traeria a una espera ya terminada.
        router.replace(next);
        return;
      }

      setState(passed > PATIENCE_MS ? 'stuck' : 'waiting');
      window.setTimeout(() => void poll(), POLL_MS);
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  const Icon = state === 'ready' ? CheckCircle2 : state === 'stuck' ? AlertTriangle : Loader2;
  const tone =
    state === 'ready'
      ? 'bg-success-soft text-success-ink'
      : state === 'stuck'
        ? 'bg-warn-soft text-warn-ink'
        : 'bg-brand-soft text-ink';

  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-3 rounded-control px-4 py-3 ${tone}`}>
        <Icon
          aria-hidden="true"
          className={`size-4 shrink-0 ${state === 'waiting' ? 'animate-spin text-brand' : ''}`}
          strokeWidth={2}
        />
        <p aria-live="polite" className="text-sm">
          {state === 'ready' ? labels.ready : state === 'stuck' ? labels.stuck : labels.waiting}
          {state === 'waiting' && elapsed > 0 ? ` (${String(elapsed)} s)` : ''}
        </p>
      </div>

      {state === 'stuck' && (
        <a href={next} className={buttonClasses({ variant: 'secondary', block: true })}>
          {labels.retry}
        </a>
      )}
    </div>
  );
}
