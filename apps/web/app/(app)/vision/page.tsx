import { redirect } from 'next/navigation';

/**
 * La captura de documentos con Synapse Visión se integró de forma contextual en el
 * módulo de Notas de Entrega (y futuros flujos transaccionales), evitando que funcione
 * como un módulo aislado o huérfano en la navegación principal.
 */
export default function VisionPage() {
  redirect('/delivery-notes/new?scan=1');
}
