$ErrorActionPreference='Stop'
$psql=Join-Path $env:LOCALAPPDATA 'Programs\PostgreSQL-17-binaries\pgsql\bin\psql.exe'
$migration=Join-Path (Split-Path $PSScriptRoot -Parent) 'supabase\migrations\0016_tspoonlab_orders.sql'
$secure=Read-Host 'Pega la contrasena de la base de datos de Supabase' -AsSecureString
$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try{
  $env:PGPASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  & $psql --host 'aws-1-eu-west-1.pooler.supabase.com' --port 5432 --username 'postgres.htuearldqvzqohoxwmdp' --dbname postgres --set ON_ERROR_STOP=on --file $migration
  if($LASTEXITCODE-ne 0){throw 'No se pudo aplicar el esquema de pedidos.'}
  Write-Host 'OK: esquema de pedidos y salidas aplicado.' -ForegroundColor Green
}finally{
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  if($pointer-ne[IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
}
Read-Host 'Presiona Enter para cerrar'
