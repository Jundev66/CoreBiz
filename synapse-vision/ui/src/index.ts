/**
 * @package @synapse-vision/ui
 *
 * La vista desacoplada de Synapse Vision: un componente React que consume el contrato
 * HTTP y no conoce ni el host ni sus rutas.
 *
 * LEE `AGENTS.md` antes de modificar este paquete.
 */
export { VisionAssistant, type VisionAssistantProps } from './vision-assistant';
export {
  createFetchVisionTransport,
  VisionTransportError,
  type VisionTransport,
  type FetchVisionTransportOptions,
} from './transport';
export {
  initialVisionUiState,
  visionUiReducer,
  type VisionUiState,
  type VisionUiEvent,
} from './machine';
export { useVision, type UseVisionResult, type VisionFileInput } from './use-vision';
