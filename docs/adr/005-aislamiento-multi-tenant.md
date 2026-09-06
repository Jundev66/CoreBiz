# ADR 005 — Aislamiento multi-tenant en cuatro capas

- **Estado**: aceptada
- **Fecha**: 2026-09-06

## Contexto

En un SaaS multi-tenant, que un cliente vea los datos de otro no es un bug: es el final del
producto. Un único `WHERE` olvidado basta para provocarlo.

## Decisión

Esquema compartido con `tenant_id` y **cuatro capas independientes** de contención:

1. **RLS de Postgres** con `FORCE ROW LEVEL SECURITY`. Última línea de defensa, imposible de
   saltar desde el rol `authenticated`.
2. **El contexto de tenant se inyecta en la transacción**, no se pasa como parámetro. Un caso
   de uso no puede "olvidar" el tenant porque nunca llega a elegirlo: lo recibe ya fijado el
   Unit of Work.
3. **Los repositorios filtran además explícitamente** por `tenant_id`. Si una migración
   desactivase una política por error, el filtro sigue conteniendo la fuga.
4. **Una matriz de tests** recorre todas las tablas con `tenant_id` y, para cada una, verifica
   que un tenant no puede leer, insertar ni mover filas de otro, y que RLS está a la vez
   habilitada y forzada.

## Trampas que esto evita (y que hay que respetar)

- **`set_config(..., true)` — local a la transacción.** Con `false`, la variable del tenant
  queda pegada a una conexión que Supavisor reutiliza después para **otro tenant**. Es una
  fuga de datos entre clientes, y de las difíciles de detectar porque solo aparece bajo
  concurrencia. Hay un test que abre dos transacciones consecutivas sobre la misma conexión
  con tenants distintos y comprueba que la segunda no ve nada de la primera.
- **`FORCE ROW LEVEL SECURITY`, no solo `ENABLE`.** Sin `FORCE`, el propietario de la tabla
  salta sus propias políticas.
- **`SECURITY DEFINER` siempre con `set search_path = ''`.** Sin eso, la función es un vector
  de escalada de privilegios.
- **La clave `service_role` bypassea RLS por completo.** Vive en cuarentena en un único
  módulo, con una regla de dependency-cruiser que falla el build ante cualquier importación
  no autorizada, una guarda en runtime que lanza si se evalúa en el navegador, y `gitleaks`
  en CI.

## Por qué la matriz de tests importa

Añadir una tabla nueva sin política RLS **rompe el build automáticamente**. Es la diferencia
entre "creemos que el aislamiento funciona" y "el aislamiento está verificado en cada push".

Es también la respuesta concreta a la pregunta que cualquiera debería hacer ante un SaaS
multi-tenant: _¿cómo sabes que no filtra datos?_
