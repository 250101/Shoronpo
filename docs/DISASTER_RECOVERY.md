# Protocolo de backup y recuperación — Shoronpo

## Objetivos

- Recuperar la operación sin improvisar ni sobrescribir la única copia de los datos.
- Mantener copias manuales fuera del repositorio mientras Supabase esté en el plan Free.
- Probar cada restauración en un proyecto nuevo antes de cualquier cambio de producción.

## Frecuencia y conservación

Crear un backup todos los lunes, antes y después de una migración, antes de una importación masiva y después de un cambio importante de permisos o roles.

Conservar ocho copias semanales y doce mensuales. Mantener al menos dos copias en medios diferentes; una debe estar cifrada y fuera del equipo habitual. Los backups contienen datos reales y nunca se suben a Git.

## Preparación única del equipo de respaldo

1. Instalar las herramientas de línea de comandos de PostgreSQL 17 (`pg_dump` y `pg_dumpall`). Docker no es necesario.
2. Ejecutar `powershell -ExecutionPolicy Bypass -File scripts/backup_supabase.ps1 -PreflightOnly`.
3. Preparar un segundo destino cifrado para la copia externa.

## Crear un backup

1. En Supabase abrir el proyecto `shoronpo-dev` y elegir **Connect**.
2. Copiar la cadena de conexión directa o de sesión.
3. Abrir PowerShell dentro del repositorio y ejecutar:

   ```powershell
   $env:SHORONPO_DB_URL = Read-Host 'Pegá la cadena de conexión de Supabase'
   powershell -ExecutionPolicy Bypass -File scripts/backup_supabase.ps1
   ```

4. El script crea `roles.sql`, `schema.sql`, `data.sql` y `manifest.json`, comprueba que no estén vacíos y calcula SHA-256.
5. Copiar la carpeta completa a un segundo medio cifrado.
6. Cerrar la terminal. El script elimina `SHORONPO_DB_URL` al terminar, incluso si falla.

## Verificación mensual

1. Crear un proyecto Supabase temporal y vacío.
2. Nunca usar la referencia de producción `htuearldqvzqohoxwmdp` como destino del ensayo.
3. Seguir la guía oficial de restauración de Supabase con `psql`, en este orden: `roles.sql`, `schema.sql`, `data.sql`.
4. Verificar los conteos:

   ```sql
   select count(*) from public.products;
   select count(*) from public.inventory_periods;
   select count(*) from public.inventory_lines;
   select count(*) from public.inventory_reconciliations;
   ```

5. Confirmar que todas las tablas de negocio tienen RLS:

   ```sql
   select n.nspname, c.relname, c.relrowsecurity
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
   order by c.relname;
   ```

6. Crear usuarios de prueba y repetir las pruebas de permisos de `supabase/tests/0010_inventory_domain_test.sql`.
7. Eliminar el proyecto temporal sólo después de documentar el resultado del ensayo.

## Protocolo ante incidentes

### El sitio no carga, pero Supabase funciona

1. No restaurar la base de datos.
2. Revisar el último deploy de Netlify y la consola del navegador.
3. Volver a publicar el último deploy exitoso o el tag `pre-supabase-cutover-2026-09-15` si el incidente pertenece al frontend.
4. El tag anterior a Supabase depende de reactivar manualmente el Apps Script archivado.

### Un usuario no puede ingresar

1. No restaurar la base completa.
2. Revisar el usuario en Supabase Auth, `profiles`, `user_roles` y `user_locations`.
3. Confirmar `is_active` y la ubicación asignada.
4. Corregir sólo el usuario afectado y registrar la acción.

### Datos borrados o alterados por error

1. Detener nuevas escrituras y anotar la hora exacta del incidente.
2. Crear un backup del estado dañado antes de tocar nada.
3. Elegir la última copia anterior al incidente.
4. Restaurarla en un proyecto Supabase nuevo, nunca sobre producción.
5. Validar conteos, RLS, roles, conciliaciones y acceso desde un staging de Netlify.
6. Sólo después, cambiar la URL y clave pública del frontend y su CSP mediante una rama de emergencia.
7. Publicar, verificar y conservar el proyecto anterior hasta cerrar el incidente.

### Supabase está caído

1. Consultar el estado oficial y no ejecutar migraciones ni restauraciones durante la incidencia.
2. Si la interrupción es breve, esperar: una restauración no corrige una caída del proveedor.
3. Si se decide migrar de emergencia, restaurar la última copia en un proyecto nuevo y repetir la validación y el cambio de frontend.

## Prohibiciones

- No restaurar encima del proyecto de producción.
- No guardar contraseñas, cadenas de conexión, tokens o claves `service_role` en archivos del proyecto.
- No considerar válido un backup sin `manifest.json` o con archivos vacíos.
- No borrar el proyecto afectado hasta validar el reemplazo y cerrar formalmente el incidente.
