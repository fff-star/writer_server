param(
  [Parameter(Mandatory = $true)][string]$Executable
)

$ErrorActionPreference = "Stop"
$root = Join-Path $env:TEMP ("office-agent-windows-sandbox-" + [guid]::NewGuid().ToString("N"))
$workspace = Join-Path $root "workspace"
$canary = Join-Path $root "canary.txt"
$outside = Join-Path $root "outside.txt"
New-Item -ItemType Directory -Path $workspace -Force | Out-Null
Set-Content -Path $canary -Value "canary"
$env:CANARY_SECRET = "must-not-enter"

try {
  & $Executable --workspace $workspace --command "cmd.exe /d /c echo ok > result.txt"
  $writeExitCode = $LASTEXITCODE
  if ($writeExitCode -ne 0 -or -not (Test-Path (Join-Path $workspace "result.txt"))) {
    throw "Workspace write failed with exit code $writeExitCode"
  }

  & $Executable --workspace $workspace --command "cmd.exe /d /c if defined CANARY_SECRET (exit 1)"
  $environmentExitCode = $LASTEXITCODE
  if ($environmentExitCode -ne 0) {
    throw "Environment isolation failed with exit code $environmentExitCode"
  }

  & $Executable --workspace $workspace --command "cmd.exe /d /c type $canary"
  if ($LASTEXITCODE -eq 0) {
    throw "The sandbox read a host credential"
  }

  & $Executable --workspace $workspace --command "cmd.exe /d /c echo escaped > $outside"
  if (Test-Path $outside) {
    throw "The sandbox wrote outside the workspace"
  }

  & $Executable --workspace $workspace --command "cmd.exe /d /c curl.exe --fail --silent --max-time 2 http://example.com/ > nul"
  if ($LASTEXITCODE -eq 0) {
    throw "The sandbox used the network without approval"
  }

  Write-Output '{"ok":true,"platform":"win32","network":false}'
} catch {
  Write-Host "::error::$($_.Exception.Message)"
  exit 1
} finally {
  Remove-Item Env:CANARY_SECRET -ErrorAction SilentlyContinue
  Remove-Item -Path $root -Recurse -Force -ErrorAction SilentlyContinue
}
