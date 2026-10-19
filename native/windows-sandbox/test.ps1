param(
  [Parameter(Mandatory = $true)][string]$Executable
)

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$root = Join-Path $env:TEMP ("office-agent-windows-sandbox-" + [guid]::NewGuid().ToString("N"))
$workspace = Join-Path $root "workspace"
$canary = Join-Path $root "canary.txt"
$outside = Join-Path $root "outside.txt"
New-Item -ItemType Directory -Path $workspace -Force | Out-Null
Set-Content -Path $canary -Value "canary"
$env:CANARY_SECRET = "must-not-enter"

function Invoke-Sandbox {
  param([Parameter(Mandatory = $true)][string]$Command)
  $output = & $Executable --workspace $workspace --command $Command 2>&1 | Out-String
  [pscustomobject]@{ Code = $LASTEXITCODE; Output = $output.Trim() }
}

function Show-SandboxResult {
  param(
    [Parameter(Mandatory = $true)][string]$Step,
    [Parameter(Mandatory = $true)]$Result
  )
  Write-Host ("[{0}] exit code {1}" -f $Step, $Result.Code)
  if ($Result.Output) {
    Write-Host ("[{0}] helper output: {1}" -f $Step, $Result.Output)
  }
}

function Assert-HelperHealthy {
  param(
    [Parameter(Mandatory = $true)][string]$Step,
    [Parameter(Mandatory = $true)]$Result
  )
  if ($Result.Output -match "failed with (error|HRESULT)") {
    throw "Sandbox helper itself failed during '$Step': $($Result.Output)"
  }
}

try {
  $write = Invoke-Sandbox "cmd.exe /d /c echo ok > result.txt"
  Show-SandboxResult "workspace-write" $write
  if ($write.Code -ne 0 -or -not (Test-Path (Join-Path $workspace "result.txt"))) {
    throw "Workspace write failed with exit code $($write.Code). Helper output: $($write.Output)"
  }

  $environment = Invoke-Sandbox "cmd.exe /d /c if defined CANARY_SECRET (exit 1)"
  Show-SandboxResult "environment-isolation" $environment
  Assert-HelperHealthy "environment-isolation" $environment
  if ($environment.Code -ne 0) {
    throw "Environment isolation failed with exit code $($environment.Code). Helper output: $($environment.Output)"
  }

  $read = Invoke-Sandbox "cmd.exe /d /c type $canary"
  Show-SandboxResult "credential-read" $read
  Assert-HelperHealthy "credential-read" $read
  if ($read.Code -eq 0 -or $read.Output -match "canary") {
    throw "The sandbox read a host credential. Helper output: $($read.Output)"
  }

  $escape = Invoke-Sandbox "cmd.exe /d /c echo escaped > $outside"
  Show-SandboxResult "outside-write" $escape
  Assert-HelperHealthy "outside-write" $escape
  if (Test-Path $outside) {
    throw "The sandbox wrote outside the workspace. Helper output: $($escape.Output)"
  }

  $network = Invoke-Sandbox "cmd.exe /d /c curl.exe --fail --silent --max-time 2 http://example.com/ > nul"
  Show-SandboxResult "network-denial" $network
  Assert-HelperHealthy "network-denial" $network
  if ($network.Code -eq 0) {
    throw "The sandbox used the network without approval. Helper output: $($network.Output)"
  }

  Write-Output '{"ok":true,"platform":"win32","network":false}'
} catch {
  Write-Host "::error::$($_.Exception.Message)"
  exit 1
} finally {
  Remove-Item Env:CANARY_SECRET -ErrorAction SilentlyContinue
  Remove-Item -Path $root -Recurse -Force -ErrorAction SilentlyContinue
}
