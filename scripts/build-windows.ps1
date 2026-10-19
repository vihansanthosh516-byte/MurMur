param([switch]$Restart, [switch]$PackageOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot

# Scoop keeps its toolchains beside the rustup shim, rather than under ~/.rustup.
$rustupCommand = Get-Command rustup -ErrorAction Stop
$rustupRoot = Split-Path (Split-Path (Split-Path $rustupCommand.Source -Parent) -Parent) -Parent
$scoopToolchains = Join-Path $rustupRoot '.rustup'
$scoopCargo = Join-Path $rustupRoot '.cargo'
if (-not $env:RUSTUP_HOME -and (Test-Path (Join-Path $scoopToolchains 'toolchains'))) { $env:RUSTUP_HOME = $scoopToolchains }
if (-not $env:CARGO_HOME -and (Test-Path $scoopCargo)) { $env:CARGO_HOME = $scoopCargo }

Push-Location -LiteralPath (Join-Path $projectRoot 'src-tauri')
try {
  $metadataText = & cargo metadata --no-deps --format-version 1
  $metadataExit = $LASTEXITCODE
} finally { Pop-Location }
if ($metadataExit -ne 0) { throw 'Cargo could not find its toolchain.' }
$metadata = $metadataText | ConvertFrom-Json
$targetDirectory = [System.IO.Path]::GetFullPath($metadata.target_directory)
$executable = Join-Path $targetDirectory 'release/murmur.exe'
$running = @(Get-Process murmur -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $executable })
if ($running.Count -gt 0) {
  if (-not $Restart) { throw 'Murmur is running from the build directory. Finish recording, then run npm run build:windows -- -Restart.' }
  Start-Process -FilePath $executable -ArgumentList '--quit' -WindowStyle Hidden -Wait
  $running | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue
  if (Get-Process -Id $running.Id -ErrorAction SilentlyContinue) { throw 'Murmur did not quit. Quit it from the tray before rebuilding.' }
}

$package = Get-Content package.json -Raw | ConvertFrom-Json
if ($PackageOnly) {
  if (-not (Test-Path $executable) -or (Get-Item $executable).VersionInfo.ProductVersion -ne $package.version) { throw 'PackageOnly requires an already-built executable with the current package version.' }
  & npm run tauri -- bundle --bundles nsis --config src-tauri/tauri.local.conf.json
} else {
  & npm run tauri -- build --bundles nsis --config src-tauri/tauri.local.conf.json
}
if ($LASTEXITCODE -ne 0) { throw 'Windows build failed.' }
$installerName = "Murmur_$($package.version)_x64-setup.exe"
$installer = Join-Path $targetDirectory "release/bundle/nsis/$installerName"
if (-not (Test-Path $installer)) { throw "Installer was not created: $installer" }
$actualVersion = (Get-Item $executable).VersionInfo.ProductVersion
if ($actualVersion -ne $package.version) { throw "Executable version mismatch: $actualVersion" }
Copy-Item -LiteralPath $installer -Destination (Join-Path $projectRoot $installerName) -Force
Write-Output "Verified executable version: $actualVersion"
Write-Output "Installer: $(Join-Path $projectRoot $installerName)"
if ($Restart) { Start-Process -FilePath $executable -WindowStyle Hidden }
