-- ============================================================================
-- Fuera el estado 'draft' de los dos documentos que lo admitian.
--
-- Nunca se produjo. No hay constructor, ni caso de uso, ni pantalla que lo genere:
-- una nota de entrega nace EMITIDA —emitirla es lo que saca la mercancia del almacen—
-- y una recepcion nace RECIBIDA, porque existe justamente porque la mercancia llego.
-- Un borrador de cualquiera de las dos es otro documento con otro nombre: un
-- presupuesto en ventas, una orden de compra en compras.
--
-- La restriccion se estrecha en la BASE y no solo en el dominio a proposito. Dejar la
-- columna aceptando un valor que el codigo ya no sabe leer es peor que no haberlo
-- quitado: la fila entraria y reventaria al hidratarla, lejos de donde se escribio.
--
-- Si alguna fila tuviera 'draft', este ALTER FALLA y la migracion no pasa. Es lo
-- correcto: significaria que el estado si se usaba y hay que mirarlo, no forzarlo.
-- ============================================================================

alter table public.delivery_notes
  drop constraint if exists delivery_notes_status_check;

alter table public.delivery_notes
  add constraint delivery_notes_status_check
  check (status in ('issued', 'delivered', 'voided'));

alter table public.goods_receipts
  drop constraint if exists goods_receipts_status_check;

alter table public.goods_receipts
  add constraint goods_receipts_status_check
  check (status in ('received', 'voided'));
