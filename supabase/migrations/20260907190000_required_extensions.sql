-- ============================================================================
-- Las extensiones que el sistema da por hechas
--
-- Este archivo no crea nada: COMPRUEBA. Y existe porque su ausencia es la clase
-- de fallo que no aparece donde se causa.
--
-- Media docena de funciones llaman a `extensions.uuid_generate_v4()`,
-- `extensions.uuid_generate_v5()`, `extensions.crypt()`, `extensions.digest()` y
-- `extensions.gen_salt()`. Si `uuid-ossp` o `pgcrypto` no estan instaladas,
-- `supabase db push` termina en verde —ninguna migracion las necesita para
-- APLICARSE— y el sistema revienta la primera vez que alguien se registra o abre
-- la demostracion, con un "function does not exist" que no menciona ni la
-- extension ni como instalarla.
--
-- Aqui falla el despliegue, que es donde se puede arreglar en un minuto.
--
-- Van en el esquema `extensions` y no en `public` porque asi las instala
-- Supabase, y porque todas las funciones del proyecto llevan `set search_path =
-- ''` y las invocan con el nombre completo. Una copia en `public` no serviria: la
-- llamada seguiria buscandolas donde no estan.
-- ============================================================================

do $$
declare
  v_faltan text[] := '{}';
  v_nombre text;
begin
  foreach v_nombre in array array['uuid-ossp', 'pgcrypto'] loop
    if not exists (
      select 1
        from pg_extension e
        join pg_namespace n on n.oid = e.extnamespace
       where e.extname = v_nombre and n.nspname = 'extensions'
    ) then
      v_faltan := v_faltan || v_nombre;
    end if;
  end loop;

  if cardinality(v_faltan) > 0 then
    raise exception
      'MISSING_EXTENSIONS: faltan % en el esquema `extensions`. Instalalas desde el panel de Supabase (Database -> Extensions) o con: create extension if not exists "<nombre>" with schema extensions;',
      array_to_string(v_faltan, ', ')
      using errcode = 'P0001';
  end if;
end $$;
