import { redirect } from 'next/navigation';

/**
 * La captura de documentos con Synapse Visión se integró de forma contextual en el
 * módulo de Compras / Recepción de Mercancía, permitiendo leer remitos y facturas de
 * proveedores para registrar la entrada y alimentar el inventario.
 */
export default function VisionPage() {
  redirect('/purchases/scan');
}
