[CmdletBinding()]
param(
  [string]$SecretPath = (Join-Path $env:APPDATA 'Shoronpo\backup-secret.dpapi')
)

$ErrorActionPreference = 'Stop'
$first = Read-Host 'Frase secreta de backup (guardala tambien en tu gestor de contrasenas)' -AsSecureString
$second = Read-Host 'Repeti la frase secreta' -AsSecureString
$firstPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
$secondPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)
$firstText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPointer)
$secondText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPointer)
try {
  if ($firstText -cne $secondText) { throw 'Las frases secretas no coinciden.' }
  if ($firstText.Length -lt 16) { throw 'La frase secreta debe tener al menos 16 caracteres.' }
  $directory = Split-Path -Parent ([IO.Path]::GetFullPath($SecretPath))
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $first | ConvertFrom-SecureString | Set-Content -LiteralPath $SecretPath -Encoding ascii
  Write-Host "OK: secreto protegido con DPAPI para este usuario: $SecretPath"
}
finally {
  if ($firstPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPointer) }
  if ($secondPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPointer) }
  $firstText = $null
  $secondText = $null
}
