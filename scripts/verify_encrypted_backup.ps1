[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath,
  [Parameter(Mandatory = $true)]
  [string]$ExpectedProjectRef,
  [ValidateSet('staging', 'production')]
  [string]$ExpectedEnvironment,
  [string]$SecretPath = (Join-Path $env:APPDATA 'Shoronpo\backup-secret.dpapi')
)

$ErrorActionPreference = 'Stop'
function Get-Sha256([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
  }
  finally { $stream.Dispose() }
}

$sevenZip = (Get-Command 7z -ErrorAction SilentlyContinue).Source
if (-not $sevenZip) { $sevenZip = 'C:\Program Files\7-Zip\7z.exe' }
if (-not (Test-Path -LiteralPath $sevenZip -PathType Leaf)) { throw "Falta '7z'." }
$resolvedArchive = [IO.Path]::GetFullPath($ArchivePath)
$hashPath = "$resolvedArchive.sha256"
if (-not (Test-Path -LiteralPath $resolvedArchive -PathType Leaf)) { throw 'No existe el archivo cifrado.' }
if (-not (Test-Path -LiteralPath $hashPath -PathType Leaf)) { throw 'Falta el hash del archivo cifrado.' }
$expectedHash = ((Get-Content -Raw -LiteralPath $hashPath).Trim() -split '\s+')[0].ToLowerInvariant()
$actualHash = Get-Sha256 $resolvedArchive
if ($actualHash -ne $expectedHash) { throw 'El hash del archivo cifrado no coincide.' }

$protectedSecret = (Get-Content -Raw -LiteralPath $SecretPath).Trim()
if ([string]::IsNullOrWhiteSpace($protectedSecret)) { throw 'El archivo de secreto esta vacio.' }
$secure = $protectedSecret | ConvertTo-SecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
$temp = Join-Path ([IO.Path]::GetTempPath()) "shoronpo-restore-$([Guid]::NewGuid().ToString('N'))"
try {
  New-Item -ItemType Directory -Path $temp | Out-Null
  & $sevenZip x "-p$password" "-o$temp" $resolvedArchive -y | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo descifrar o extraer el backup.' }
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify_backup.ps1') -BackupPath $temp -ExpectedProjectRef $ExpectedProjectRef -ExpectedEnvironment $ExpectedEnvironment
  if ($LASTEXITCODE -ne 0) { throw 'El contenido descifrado no supero la verificacion.' }
  Write-Host 'OK: archivo cifrado descifrable y backup interno integro.'
}
finally {
  if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $password = $null
  $protectedSecret = $null
}
