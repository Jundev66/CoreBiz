-- ============================================================================
-- Codigos automaticos para los registros maestros
--
-- Hasta aqui, quien daba de alta un cliente tenia que inventarse su codigo. Es
-- de las cosas que parecen menores y no lo son: obliga a decidir un formato el
-- primer dia, a recordarlo cada vez, y a lidiar con el rechazo por duplicado
-- cuando dos personas dan de alta a la vez. Nada de eso es trabajo del comercio.
--
-- Ahora los genera el sistema: `CLT26000001` — prefijo, ano, correlativo.
--
-- Se reutiliza `document_sequences`, que ya numeraba las notas de entrega con la
-- unica mecanica que aguanta concurrencia sin huecos. Escribir un contador nuevo
-- al lado habria sido escribir por segunda vez la parte dificil.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- El periodo
--
-- El ano va en el codigo, asi que el contador tiene que reiniciarse con el: sin
-- esto, el segundo cliente de 2027 seria `CLT27000002` solo si en 2026 hubo
-- exactamente uno, y el numero dejaria de significar nada.
--
-- Los DOCUMENTOS no llevan periodo y se quedan como estan (`NE-000008`). Su
-- numeracion ya esta impresa en papeles que hay por ahi; cambiarla ahora seria
-- romper la correspondencia entre lo que dice el sistema y lo que tiene el
-- cliente en la mano.
-- ---------------------------------------------------------------------------
alter table public.document_sequences
  add column if not exists period text not null default '';

alter table public.document_sequences drop constraint if exists document_sequences_pkey;
alter table public.document_sequences
  add constraint document_sequences_pkey primary key (tenant_id, doc_type, period);

alter table public.document_sequences drop constraint if exists document_sequences_type_check;
alter table public.document_sequences
  add constraint document_sequences_type_check check (
    doc_type in (
      -- Documentos: correlativo global, sin periodo.
      'quote', 'delivery_note', 'purchase_order', 'payment', 'goods_receipt',
      -- Registros maestros: correlativo por ano.
      'customer', 'product', 'supplier'
    )
  );
