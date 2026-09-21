$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$backupScript = Join-Path $repo 'scripts\backup_supabase.ps1'
$verifyScript = Join-Path $repo 'scripts\verify_backup.ps1'
$protectScript = Join-Path $repo 'scripts\protect_and_upload_backup.ps1'
$verifyEncryptedScript = Join-Path $repo 'scripts\verify_encrypted_backup.ps1'
$restoreScript = Join-Path $repo 'scripts\restore_supabase_test.ps1'
$temp = Join-Path ([IO.Path]::GetTempPath()) "shoronpo-backup-test-$([Guid]::NewGuid().ToString('N'))"
$bin = Join-Path $temp 'bin'
$out = Join-Path $temp 'out'
$encrypted = Join-Path $temp 'encrypted'
$secretPath = Join-Path $temp 'secret.dpapi'
$projectRef = 'abcdefghijklmnopqrst'
$oldPath = $env:PATH

function Assert-True([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Run-Backup([string]$Url, [string]$Mode = 'ok') {
  $env:SHORONPO_DB_URL = $Url
  $env:SHORONPO_MOCK_MODE = $Mode
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $runOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $backupScript -ProjectRef $projectRef -Environment staging -BackupRoot $out 2>&1
  $code = $LASTEXITCODE
  $ErrorActionPreference = $previousPreference
  return $code
}
function Run-Verify([string]$Path, [switch]$ShowOnFailure) {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $verifyOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $verifyScript -BackupPath $Path -ExpectedProjectRef $projectRef -ExpectedEnvironment staging 2>&1
  $code = $LASTEXITCODE
  $ErrorActionPreference = $previousPreference
  if ($code -ne 0 -and $ShowOnFailure) { $verifyOutput | Write-Host }
  return $code
}

try {
  New-Item -ItemType Directory -Path $bin, $out, $encrypted | Out-Null
  ConvertTo-SecureString 'test-passphrase-123456789' -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $secretPath -Encoding ascii
  $mock = @'
@echo off
setlocal EnableDelayedExpansion
if "%1"=="--version" (echo pg_dump 17.11& exit /b 0)
set outfile=
set previous=
for %%A in (%*) do (
  if "!previous!"=="--file" set outfile=%%~A
  set previous=%%~A
)
if "%SHORONPO_MOCK_MODE%"=="fail" echo %* | findstr /C:"--data-only" >nul && exit /b 9
if "%outfile%"=="" exit /b 8
echo mock sql>"%outfile%"
exit /b 0
'@
  Set-Content -LiteralPath (Join-Path $bin 'pg_dump.cmd') -Value $mock -Encoding ascii
  $psqlMock = @'
@echo off
if "%SHORONPO_PSQL_NONEMPTY%"=="1" (echo 1& exit /b 0)
echo %* | findstr /C:"select count(*) from pg_tables" >nul && (echo 0& exit /b 0)
echo %* | findstr /C:"sin RLS" >nul && (echo 12 tablas; 0 sin RLS& exit /b 0)
exit /b 0
'@
  Set-Content -LiteralPath (Join-Path $bin 'psql.cmd') -Value $psqlMock -Encoding ascii
  $env:PATH = "$bin;$oldPath"

  & powershell -NoProfile -ExecutionPolicy Bypass -File $backupScript -ProjectRef $projectRef -PreflightOnly | Out-Null
  Assert-True ($LASTEXITCODE -eq 0) 'Preflight fallo.'
  $code = Run-Backup "postgresql://postgres.${projectRef}:secret@aws.pooler.supabase.com:5432/postgres"
  Assert-True ($code -eq 0) 'El backup simulado debia completar.'
  $backup = Get-ChildItem -LiteralPath $out -Directory | Where-Object Name -notlike '.partial-*' | Select-Object -First 1
  Assert-True ($null -ne $backup) 'No se creo la carpeta final.'
  Assert-True ((Run-Verify $backup.FullName -ShowOnFailure) -eq 0) 'La verificacion integra fallo.'

  & powershell -NoProfile -ExecutionPolicy Bypass -File $protectScript -BackupPath $backup.FullName -SecretPath $secretPath -OutputRoot $encrypted -SkipUpload | Out-Null
  Assert-True ($LASTEXITCODE -eq 0) 'El cifrado simulado fallo.'
  $archive = Get-ChildItem -LiteralPath $encrypted -Filter '*.7z' -File | Select-Object -First 1
  Assert-True ($null -ne $archive) 'No se creo el archivo cifrado.'
  & powershell -NoProfile -ExecutionPolicy Bypass -File $verifyEncryptedScript -ArchivePath $archive.FullName -SecretPath $secretPath -ExpectedProjectRef $projectRef -ExpectedEnvironment staging | Out-Null
  Assert-True ($LASTEXITCODE -eq 0) 'La verificacion cifrada fallo.'

  $targetRef = 'zyxwvutsrqponmlkjihg'
  $env:SHORONPO_RESTORE_DB_URL = "postgresql://postgres.${targetRef}:secret@aws.pooler.supabase.com:5432/postgres"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $restoreScript -BackupPath $backup.FullName -SourceProjectRef $projectRef -TargetProjectRef $targetRef -SourceEnvironment staging | Out-Null
  Assert-True ($LASTEXITCODE -eq 0) 'La restauracion aislada simulada fallo.'

  $env:SHORONPO_RESTORE_DB_URL = "postgresql://postgres.${targetRef}:secret@aws.pooler.supabase.com:5432/postgres"
  $env:SHORONPO_PSQL_NONEMPTY = '1'
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & powershell -NoProfile -ExecutionPolicy Bypass -File $restoreScript -BackupPath $backup.FullName -SourceProjectRef $projectRef -TargetProjectRef $targetRef -SourceEnvironment staging 2>&1 | Out-Null
  $nonEmptyCode = $LASTEXITCODE
  $ErrorActionPreference = $previousPreference
  Remove-Item Env:SHORONPO_PSQL_NONEMPTY
  Assert-True ($nonEmptyCode -ne 0) 'Se permitio restaurar sobre un destino no vacio.'

  Add-Content -LiteralPath (Join-Path $backup.FullName 'data.sql') -Value 'corruption'
  Assert-True ((Run-Verify $backup.FullName) -ne 0) 'La corrupcion no fue detectada.'

  $before = @(Get-ChildItem -LiteralPath $out -Directory).Count
  $code = Run-Backup "postgresql://postgres.${projectRef}:secret@aws.pooler.supabase.com:5432/postgres" 'fail'
  Assert-True ($code -ne 0) 'El fallo forzado debia fallar.'
  Assert-True (@(Get-ChildItem -LiteralPath $out -Directory).Count -eq $before) 'Quedo una carpeta parcial tras el fallo.'
  $code = Run-Backup 'postgresql://postgres.otroproyecto00000000:secret@aws.pooler.supabase.com:5432/postgres'
  Assert-True ($code -ne 0) 'Se acepto una conexion de otro proyecto.'
  Write-Host 'OK: pruebas de backup y corrupcion aprobadas.'
}
finally {
  $env:PATH = $oldPath
  Remove-Item Env:SHORONPO_DB_URL -ErrorAction SilentlyContinue
  Remove-Item Env:SHORONPO_MOCK_MODE -ErrorAction SilentlyContinue
  Remove-Item Env:SHORONPO_RESTORE_DB_URL -ErrorAction SilentlyContinue
  Remove-Item Env:SHORONPO_PSQL_NONEMPTY -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
