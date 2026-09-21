[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,
  [string]$SecretPath = (Join-Path $env:APPDATA 'Shoronpo\backup-secret.dpapi'),
  [string]$OutputRoot = (Join-Path $env:USERPROFILE 'Documents\Shoronpo-Backups-Encrypted'),
  [string]$RemoteName = 'shoronpo-drive',
  [string]$RemoteFolder = 'Shoronpo-Backups',
  [switch]$SkipUpload
)

$ErrorActionPreference = 'Stop'

function Resolve-Tool([string]$Name, [string[]]$Fallbacks) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  foreach ($candidate in $Fallbacks) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
  }
  throw "Falta '$Name'."
}

function Get-Sha256([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
  }
  finally { $stream.Dispose() }
}

$resolvedBackup = [IO.Path]::GetFullPath($BackupPath)
if (-not (Test-Path -LiteralPath $resolvedBackup -PathType Container)) { throw 'No existe la carpeta de backup.' }
if (-not (Test-Path -LiteralPath $SecretPath -PathType Leaf)) { throw 'Falta el secreto cifrado. Ejecuta setup_backup_secret.ps1.' }

$sevenZip = Resolve-Tool '7z' @('C:\Program Files\7-Zip\7z.exe')
$rclone = $null
if (-not $SkipUpload) { $rclone = Resolve-Tool 'rclone' @() }

$protectedSecret = (Get-Content -Raw -LiteralPath $SecretPath).Trim()
if ([string]::IsNullOrWhiteSpace($protectedSecret)) { throw 'El archivo de secreto esta vacio.' }
$secure = $protectedSecret | ConvertTo-SecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
$partialArchive = $null
try {
  New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
  $archiveName = "$(Split-Path -Leaf $resolvedBackup).7z"
  $finalArchive = Join-Path ([IO.Path]::GetFullPath($OutputRoot)) $archiveName
  $partialArchive = "$finalArchive.partial-$([Guid]::NewGuid().ToString('N'))"
  & $sevenZip a -t7z -mx=9 -mhe=on "-p$password" $partialArchive (Join-Path $resolvedBackup '*') | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Fallo el cifrado del backup.' }
  & $sevenZip t "-p$password" $partialArchive | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'El archivo cifrado no supera la prueba de integridad.' }
  Move-Item -LiteralPath $partialArchive -Destination $finalArchive -Force
  $partialArchive = $null
  $hash = Get-Sha256 $finalArchive
  $hashPath = "$finalArchive.sha256"
  "$hash  $archiveName" | Set-Content -LiteralPath $hashPath -Encoding ascii

  if (-not $SkipUpload) {
    & $rclone lsd "${RemoteName}:" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "No se pudo acceder al remoto rclone '$RemoteName'." }
    & $rclone copyto $finalArchive "${RemoteName}:$RemoteFolder/$archiveName" --checksum
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la subida del archivo cifrado.' }
    & $rclone copyto $hashPath "${RemoteName}:$RemoteFolder/$archiveName.sha256" --checksum
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la subida del hash.' }
    & $rclone check (Split-Path -Parent $finalArchive) "${RemoteName}:$RemoteFolder" --include $archiveName --include "$archiveName.sha256" --one-way
    if ($LASTEXITCODE -ne 0) { throw 'La copia remota no coincide con la copia local.' }
  }
  Write-Host "OK: backup cifrado y verificado: $finalArchive"
}
finally {
  if ($partialArchive -and (Test-Path -LiteralPath $partialArchive)) { Remove-Item -LiteralPath $partialArchive -Force }
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $password = $null
  $protectedSecret = $null
}
