'use client';

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * El aviso flotante de "listo".
 *
 * Sustituye a lo que habia: un parrafo incrustado en el formulario que decia «Cliente
 * creado. Su codigo es CLT26000009» y dejaba a la persona exactamente donde estaba, con
 * el formulario vacio delante. Dos problemas en uno — el mensaje se leia como parte del
 * formulario, y despues de crear algo lo que uno quiere es VERLO en la lista.
 *
 * Ahora la accion redirige al listado y el aviso viaja en la URL. Se eligio el parametro
 * de consulta y no un estado nuevo por una razon concreta: sobrevive a la navegacion del
 * servidor sin inventar almacenamiento, funciona con el boton de atras y se puede
 * enlazar. Lo unico que hace falta despues es limpiarlo, para que recargar la pagina no
 * vuelva a anunciar algo que ocurrio hace diez minutos.
 *
 * `role="status"` y no `role="alert"`: esto es una confirmacion, no un problema. `alert`
 * interrumpe a quien usa un lector de pantalla en mitad de lo que este leyendo, y para
 * dar una buena noticia eso es maleducado.
 */

/** Lo que tarda en irse solo. Suficiente para leer un codigo de doce caracteres. */
const DURACION_MS = 6000;

export function Toast({ message }: { message: string }) {
  const t = useTranslations();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    /*
     * La URL se limpia con `history.replaceState`, NO con `router.replace`.
     *
     * La diferencia no es de estilo. `router.replace` le pide a Next que vuelva a
     * pedir la pantalla, y la pantalla ya sin el parametro deja de pasarle mensaje a
     * este componente: el aviso se mataba a si mismo un instante despues de aparecer.
     * Se vio en el navegador — la URL quedaba limpia y el aviso no llegaba a leerse.
     *
     * `history.replaceState` cambia lo que pone en la barra sin provocar navegacion
     * alguna. El parametro deja de estar —recargar ya no repite un aviso de hace diez
     * minutos, ni el boton de atras vuelve a el— y el aviso vive sus seis segundos.
     *
     * Se limpia AL PINTARSE y no al desaparecer, porque en cuanto esta en pantalla el
     * parametro ya cumplio su trabajo.
     */
    const url = new URL(window.location.href);
    if (url.searchParams.has('creado')) {
      url.searchParams.delete('creado');
      const query = url.searchParams.toString();
      window.history.replaceState(
        null,
        '',
        query === '' ? url.pathname : `${url.pathname}?${query}`,
      );
    }

    const temporizador = setTimeout(() => setVisible(false), DURACION_MS);
    return () => clearTimeout(temporizador);
    // Solo al montar: el aviso pertenece a la navegacion que lo trajo, y volver a
    // entrar reiniciaria el temporizador.
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-sm shadow-lg"
    >
      <div className="flex items-start gap-3">
        <Check
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]"
          strokeWidth={2.25}
        />
        <p className="flex-1">{message}</p>
        {/* Cerrar a mano existe porque seis segundos es poco para quien lee despacio y
            mucho para quien ya lo leyo. */}
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
        >
          <X aria-hidden="true" className="size-4" strokeWidth={2} />
          <span className="sr-only">{t('common.close')}</span>
        </button>
      </div>
    </div>
  );
}
