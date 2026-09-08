/**
 * El periodo que agrupa los correlativos de los registros maestros.
 *
 * Es el ano en dos digitos, que es exactamente lo que entra en el codigo
 * (`CLT26000001`). Vive aqui y no repetido en cada caso de uso porque el dia que
 * alguien decida numerar por mes, el cambio tiene que ser uno solo — tres copias
 * de la misma linea es como se acaba con dos formatos conviviendo.
 *
 * Recibe el instante en lugar de leer el reloj: es lo que permite que un test
 * fije el ano y compruebe el formato sin esperar a enero.
 */
export function periodOf(now: Date): string {
  return String(now.getFullYear()).slice(-2);
}
