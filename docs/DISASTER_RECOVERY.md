# Protocolo de backup y recuperación — Shoronpo

## Alcance y objetivos

Este protocolo cubre la base PostgreSQL de Supabase en plan Free. El backup lógico incluye el esquema `public`, sus datos y los datos de `auth`; no incluye objetos binarios de Storage, secretos, configuración de Auth, Edge Functions ni variables de Netlify. Esos componentes se reconstruyen desde Git y desde el inventario seguro de secretos.

- **RPO normal:** hasta 7 días, por el backup semanal.
- **RPO de cambios:** cero respecto del punto inmediatamente anterior a una migración o importación, porque se exige una copia previa.
- **RTO objetivo:** 4 horas para una base pequeña, sujeto a disponibilidad de Supabase, creación del proyecto temporal y validación funcional.
- Nunca se restaura encima del proyecto afectado. El reemplazo se valida primero en otro proyecto.

## Proyectos identificados

- Staging: `shoronpo-dev` — `htuearldqvzqohoxwmdp`.
- Producción: `shoronpo-prod` — `krpiprwplhxrxlhzcuak`.

Los scripts exigen indicar la referencia y rechazan una cadena de otro proyecto. No reutilizar la referencia de staging para una copia productiva.

## Frecuencia, conservación y destinos

Crear una copia de producción todos los lunes, antes y después de migraciones, antes de una importación masiva y después de cambios importantes de permisos. Conservar ocho semanales y doce mensuales.

Mantener dos copias completas:

1. Carpeta local `Documents\Shoronpo-Backups`.
2. Copia cifrada en Google Drive o en un disco externo separado.

Los backups contienen datos personales y nunca se suben a Git ni se dejan en enlaces públicos.

## Preparación del equipo

1. Instalar herramientas PostgreSQL 17 (`pg_dump` y `psql`). Docker no es necesario.
2. Ejecutar:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup_supabase.ps1 `
     -ProjectRef krpiprwplhxrxlhzcuak -Environment production -PreflightOnly
   ```

3. Confirmar `OK` y preparar el segundo destino cifrado.

## Crear y verificar un backup productivo

1. En Supabase, abrir `shoronpo-prod` y copiar la conexión **Session pooler**. No usar Transaction pooler.
2. En PowerShell, dentro del repositorio:

   ```powershell
   $secure = Read-Host 'Pega la conexion Session pooler de produccion' -AsSecureString
   $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
   try {
     $env:SHORONPO_DB_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
     powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup_supabase.ps1 `
       -ProjectRef krpiprwplhxrxlhzcuak -Environment production
   } finally {
     [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
     Remove-Item Env:SHORONPO_DB_URL -ErrorAction SilentlyContinue
   }
   ```

3. El script no expone la contraseña en los argumentos de `pg_dump`, crea primero una carpeta oculta parcial y sólo la publica cuando los tres archivos y el manifiesto son válidos.
4. Verificar nuevamente la copia antes de moverla:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify_backup.ps1 `
     -BackupPath 'C:\Users\marti\Documents\Shoronpo-Backups\production-...' `
     -ExpectedProjectRef krpiprwplhxrxlhzcuak -ExpectedEnvironment production
   ```

5. La primera vez, crear una frase secreta de al menos 16 caracteres y guardarla tambien en el gestor de contrasenas:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup_backup_secret.ps1
   ```

6. Cifrar, comprobar y subir la copia a Google Drive:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/protect_and_upload_backup.ps1 `
     -BackupPath 'C:\Users\marti\Documents\Shoronpo-Backups\production-...'
   ```

   El remoto `shoronpo-drive` debe usar el alcance `drive.file`. La frase queda protegida por DPAPI para el usuario de Windows; no se guarda en Git ni en Drive. Para comprobar que una copia remota descargada es descifrable:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify_encrypted_backup.ps1 `
     -ArchivePath 'C:\ruta\production-....7z' `
     -ExpectedProjectRef krpiprwplhxrxlhzcuak -ExpectedEnvironment production
   ```

7. Nunca copiar ni compartir los SQL sin cifrar fuera del equipo.

> Accion pendiente: sustituir el `client_id` compartido de rclone por un cliente OAuth propio de Shoronpo. rclone aviso el 21-09-2026 que el cliente compartido sera retirado durante 2026. La copia existente sigue siendo valida, pero no se debe asumir que futuras subidas funcionaran hasta completar este cambio.

## Ensayo mensual de restauración

1. Crear un proyecto Supabase temporal y vacío. No usar staging ni producción.
2. Desactivar cron, webhooks y conectores externos en el destino.
3. Copiar su conexión Session pooler y ejecutar:

   ```powershell
   $secure = Read-Host 'Pega la conexion Session pooler del proyecto temporal' -AsSecureString
   $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
   try {
     $env:SHORONPO_RESTORE_DB_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
     powershell -NoProfile -ExecutionPolicy Bypass -File scripts/restore_supabase_test.ps1 `
       -BackupPath 'C:\ruta\production-...' `
       -SourceProjectRef krpiprwplhxrxlhzcuak `
       -TargetProjectRef REFERENCIA_TEMPORAL
   } finally {
     [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
     Remove-Item Env:SHORONPO_RESTORE_DB_URL -ErrorAction SilentlyContinue
   }
   ```

El script verifica hashes, rechaza origen y destino iguales, comprueba que `public` esté vacío y ejecuta la restauración en una sola transacción. Un error revierte el bloque completo.

Después de restaurar:

1. Comparar conteos de `products`, `inventory_periods`, `inventory_lines`, `inventory_reconciliations`, producciones y pedidos.
2. Confirmar que todas las tablas de negocio tienen RLS.
3. Ejecutar las pruebas de permisos y las pruebas automatizadas del frontend.
4. Probar inicio de sesión, lectura por rol y rechazo de escrituras indebidas.
5. Registrar fecha, copia usada, duración, conteos y resultado. Sólo entonces eliminar el proyecto temporal.

## Procedimiento durante un incidente

### Frontend caído con Supabase sano

No restaurar datos. Revisar Netlify y republicar el último deploy aprobado.

### Usuario sin acceso

No restaurar la base. Revisar Auth, `profiles`, `user_roles`, `user_locations` e `is_active`; corregir únicamente la cuenta afectada.

### Datos borrados o alterados

1. Detener nuevas escrituras y registrar la hora exacta.
2. Crear una copia del estado dañado para análisis.
3. Elegir la última copia íntegra anterior al incidente.
4. Restaurar en un proyecto nuevo y aislado.
5. Validar datos, RLS, roles y frontend contra el proyecto recuperado.
6. Cambiar las variables de producción sólo durante una ventana aprobada y conservar el proyecto anterior hasta cerrar el incidente.

### Supabase caído

Consultar el estado oficial y mantener el registro manual. Una restauración no corrige una caída del proveedor. Migrar sólo si la interrupción supera el RTO acordado y existe un destino independiente validado.

## Responsabilidades

- **Administrador de Shoronpo:** ejecuta la copia semanal, confirma el manifiesto y registra el resultado.
- **Responsable del obrador:** activa el registro manual y confirma el impacto operativo.
- **Responsable técnico:** realiza el ensayo mensual, valida RLS/conteos y coordina cualquier conmutación.
- **Dirección:** autoriza una conmutación de producción o una recuperación que implique pérdida dentro del RPO.

## Prohibiciones

- Restaurar sobre staging o producción.
- Usar una copia cuyo manifiesto o hash no valide.
- Guardar contraseñas o conexiones en archivos, Git, chats o capturas.
- Confundir la referencia de staging con producción.
- Borrar el proyecto afectado antes de validar el reemplazo.
- Considerar respaldados los objetos de Storage o secretos sólo porque existe un dump PostgreSQL.

## Evidencia automatizada

`tests/backup-scripts.test.ps1` fuerza y verifica: copia completa, cifrado y descifrado, corrupcion de archivo, conexion a proyecto incorrecto, fallo durante el dump, limpieza de parciales, restauracion simulada y rechazo de un destino no vacio.

Evidencia real del 21-09-2026:

- Backup logico de produccion `krpiprwplhxrxlhzcuak` creado y validado por hashes.
- Archivo cifrado descifrado y contenido interno validado.
- Archivo `.7z` y su `.sha256` copiados a `Google Drive/Shoronpo-Backups` y comparados por rclone sin diferencias.
- El ensayo contra un proyecto Supabase temporal real sigue pendiente; las pruebas automatizadas no sustituyen ese ensayo.
