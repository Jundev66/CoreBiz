-- ============================================================================
-- Busqueda semantica de catalogo (RAG) para Synapse Vision
--
-- Indexa productos y proveedores como vectores para que la lectura de una nota
-- de entrega pueda emparejar una descripcion escrita a mano —"harina 1kg", "aceite
-- de maiz un litro"— con el catalogo real, aunque las palabras no coincidan
-- exactamente. Es una MEJORA del emparejamiento por texto, nunca un requisito:
-- sin vectores, el puente sigue resolviendo por `contains`.
--
-- Un vector por (tenant, tipo, entidad). La dimension (768) la fija el modelo de
-- embeddings configurado (nomic-embed-text). Cambiarla NO es un `alter column`:
-- los vectores viejos quedan incomparables y hay que reindexar, asi que el modelo
-- se guarda en cada fila y el reindexado reemplaza por lote.
--
-- El aislamiento es el de siempre: `tenant_id` + RLS con `app.current_tenant()`,
-- que fija el Unit of Work DENTRO de la transaccion. Una busqueda vectorial que
-- corra fuera de esa transaccion no ve el GUC y RLS la niega, que es justo lo
-- que se quiere.
-- ============================================================================

-- La extension va en el esquema `extensions`, como las demas del proyecto
-- (`uuid-ossp`, `pgcrypto`): todas las funciones llevan `set search_path = ''` y
-- nombran a sus dependencias cualificadas. Sin la extension, esta migracion no
-- aplica —y falla aqui, que es donde se arregla en un minuto.
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- vision_embeddings
-- ---------------------------------------------------------------------------
create table if not exists public.vision_embeddings (
  tenant_id   uuid        not null references public.tenants (id) on delete cascade,
  entity_type text        not null,
  entity_id   uuid        not null,

  -- El texto indexado (nombre + sku/codigo), para poder mostrar la sugerencia.
  label       text        not null,
  -- Que modelo genero el vector. Filtrar por el al buscar evita mezclar espacios.
  model       text        not null,
  embedding   extensions.vector(768) not null,

  updated_at  timestamptz not null default now(),

  primary key (tenant_id, entity_type, entity_id),
  constraint vision_embeddings_entity_type_check check (entity_type in ('product', 'supplier'))
);

-- Indice HNSW con distancia coseno. El operador de la busqueda es `<=>` (coseno),
-- asi que el indice tiene que ser `vector_cosine_ops` o Postgres no lo usa.
create index if not exists vision_embeddings_hnsw
  on public.vision_embeddings using hnsw (embedding extensions.vector_cosine_ops);

-- Filtro por tenant y tipo SIEMPRE precede a la busqueda vectorial; este indice
-- acota el conjunto antes de que HNSW ordene.
create index if not exists vision_embeddings_tenant_entity_idx
  on public.vision_embeddings (tenant_id, entity_type);

drop trigger if exists trg_vision_embeddings_touch on public.vision_embeddings;
create trigger trg_vision_embeddings_touch before update on public.vision_embeddings
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Politicas RLS
-- ---------------------------------------------------------------------------
alter table public.vision_embeddings enable row level security;
alter table public.vision_embeddings force row level security;

drop policy if exists vision_embeddings_select on public.vision_embeddings;
create policy vision_embeddings_select on public.vision_embeddings for select to authenticated
  using (tenant_id = app.current_tenant() and app.is_member());

drop policy if exists vision_embeddings_insert on public.vision_embeddings;
create policy vision_embeddings_insert on public.vision_embeddings for insert to authenticated
  with check (tenant_id = app.current_tenant() and app.can_write());

drop policy if exists vision_embeddings_update on public.vision_embeddings;
create policy vision_embeddings_update on public.vision_embeddings for update to authenticated
  using (tenant_id = app.current_tenant() and app.can_write())
  with check (tenant_id = app.current_tenant() and app.can_write());

-- El reindexado borra las filas de una entidad que dejo de existir; se permite el
-- delete acotado al tenant con permiso de escritura, no el borrado libre.
drop policy if exists vision_embeddings_delete on public.vision_embeddings;
create policy vision_embeddings_delete on public.vision_embeddings for delete to authenticated
  using (tenant_id = app.current_tenant() and app.can_write());

grant select, insert, update, delete on public.vision_embeddings to authenticated;

-- Disparador trg_guard_demo_template para proteger la plantilla de la demo
drop trigger if exists trg_guard_demo_template on public.vision_embeddings;
create trigger trg_guard_demo_template before insert or update or delete on public.vision_embeddings
  for each row execute function app.guard_demo_template();
