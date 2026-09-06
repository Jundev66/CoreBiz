/**
 * Puerto de generacion de identificadores.
 *
 * Se usa UUID v7 en produccion: incluye la marca temporal en los bits altos, asi que
 * los identificadores son ordenables por fecha de creacion. Eso mantiene sanos los
 * indices B-tree de Postgres — con UUID v4 cada insercion cae en una pagina aleatoria
 * del indice y el rendimiento se degrada segun crece la tabla.
 */
export interface IdGenerator {
  next(): string;
}

/** Generador secuencial para tests: identificadores predecibles y legibles. */
export function sequentialIdGenerator(prefix = 'id'): IdGenerator {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return `${prefix}-${counter.toString().padStart(6, '0')}`;
    },
  };
}
