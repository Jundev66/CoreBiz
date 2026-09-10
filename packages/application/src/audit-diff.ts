/**
 * Que cambio, y nada mas.
 *
 * `AuditEntry` tiene un campo `diff` declarado desde el principio que no escribia nadie:
 * cada registro guardaba solo un `summary` con el codigo y el nombre, asi que el historial
 * decia QUE se habia tocado y nunca QUE habia cambiado.
 *
 * Se registra solo la diferencia y no la ficha entera a proposito. Un registro que repite
 * los doce campos en cada guardado obliga a comparar a ojo dos bloques casi identicos para
 * encontrar el unico que se movio — que es exactamente lo que alguien va a estar buscando
 * dentro de seis meses, normalmente con prisa y normalmente porque un precio no cuadra.
 */
export type Cambio = { readonly de: string | null; readonly a: string | null };

export function soloLoQueCambio(
  antes: Readonly<Record<string, string | null>>,
  despues: Readonly<Record<string, string | null>>,
): Record<string, Cambio> {
  const cambios: Record<string, Cambio> = {};
  for (const [campo, valor] of Object.entries(antes)) {
    const nuevo = despues[campo] ?? null;
    if (valor !== nuevo) cambios[campo] = { de: valor, a: nuevo };
  }
  return cambios;
}
