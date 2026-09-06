[CmdletBinding()]
param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

if ($env:PROCESSOR_ARCHITECTURE -notin @('AMD64', 'IA64')) {
  throw "This setup script requires Windows x64. Detected: $env:PROCESSOR_ARCHITECTURE"
}

$version = '16.8-1'
$archiveName = "postgresql-$version-windows-x64-binaries.zip"
$downloadUrl = "https://get.enterprisedb.com/postgresql/$archiveName"
$expectedSha256 = '46903BB56BB0A40A81768703FA7420F0690095685DA040BED2C584B900A1124C'
$repoRoot = Split-Path -Parent $PSScriptRoot
$targetRoot = Join-Path $repoRoot 'resources\postgres-binaries\win32\x64'
$cacheRoot = Join-Path $repoRoot '.cache\postgres'
$archivePath = Join-Path $cacheRoot $archiveName
$extractRoot = Join-Path $cacheRoot 'extract'

New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
if ($Force -or -not (Test-Path $archivePath)) {
  Write-Host "Downloading $downloadUrl"
  Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath -UseBasicParsing
}

$actualSha256 = (Get-FileHash -Path $archivePath -Algorithm SHA256).Hash.ToUpperInvariant()
if ($actualSha256 -ne $expectedSha256) {
  Remove-Item -Force $archivePath
  throw "PostgreSQL archive checksum mismatch. Expected $expectedSha256 but received $actualSha256."
}
Write-Host "Verified SHA-256: $actualSha256"

Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $extractRoot
New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
$tar = Get-Command tar.exe -ErrorAction SilentlyContinue
if (-not $tar) {
  throw "Windows tar.exe is required to extract PostgreSQL. Install Windows 10/11 tar support or use PowerShell Expand-Archive manually."
}
& $tar.Source -xf $archivePath -C $extractRoot
if ($LASTEXITCODE -ne 0) {
  throw "tar.exe failed to extract the verified PostgreSQL archive with exit code $LASTEXITCODE."
}
$sourceRoot = Join-Path $extractRoot 'pgsql'
$required = @('bin\initdb.exe', 'bin\pg_ctl.exe', 'bin\createdb.exe', 'bin\postgres.exe')
foreach ($relativePath in $required) {
  if (-not (Test-Path (Join-Path $sourceRoot $relativePath))) {
    throw "The verified archive is missing $relativePath."
  }
}

Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $targetRoot
New-Item -ItemType Directory -Force -Path (Split-Path $targetRoot) | Out-Null
Copy-Item -Path $sourceRoot -Destination $targetRoot -Recurse -Force

Write-Host "Installed PostgreSQL $version Windows x64 binaries at $targetRoot"
Get-ChildItem (Join-Path $targetRoot 'bin') -Filter '*.exe' |
  Where-Object Name -in @('initdb.exe', 'pg_ctl.exe', 'createdb.exe', 'postgres.exe') |
  Select-Object -ExpandProperty FullName
