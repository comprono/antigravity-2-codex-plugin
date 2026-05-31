param(
  [Parameter(Position = 0)]
  [ValidateSet("status", "open", "inspect", "path")]
  [string] $Command = "status"
)

$ErrorActionPreference = "Stop"

$installRoot = Join-Path $env:LOCALAPPDATA "Programs\Antigravity"
$exePath = Join-Path $installRoot "Antigravity.exe"
$userDataPath = Join-Path $env:APPDATA "Antigravity"
$devToolsPortFile = Join-Path $userDataPath "DevToolsActivePort"

function Get-AntigravityProcess {
  Get-Process -Name "Antigravity" -ErrorAction SilentlyContinue
}

function Get-DevToolsPort {
  if (Test-Path -LiteralPath $devToolsPortFile) {
    $lines = @(Get-Content -LiteralPath $devToolsPortFile -ErrorAction SilentlyContinue)
    if ($lines.Count -gt 0) {
      return [string]$lines[0]
    }
  }
  return $null
}

function Write-Status {
  $processes = @(Get-AntigravityProcess)
  $devToolsPort = Get-DevToolsPort

  [PSCustomObject]@{
    Installed = Test-Path -LiteralPath $exePath
    ExePath = $exePath
    UserDataPath = $userDataPath
    Running = $processes.Count -gt 0
    ProcessIds = @($processes | Select-Object -ExpandProperty Id)
    DevToolsPort = $devToolsPort
  } | ConvertTo-Json -Depth 4
}

switch ($Command) {
  "path" {
    Write-Output $exePath
  }

  "status" {
    Write-Status
  }

  "open" {
    if (-not (Test-Path -LiteralPath $exePath)) {
      throw "Antigravity.exe was not found at $exePath"
    }

    $existing = @(Get-AntigravityProcess)
    if ($existing.Count -eq 0) {
      Start-Process -FilePath $exePath -WorkingDirectory $installRoot
      Start-Sleep -Seconds 2
    }

    Write-Status
  }

  "inspect" {
    $packageFiles = @(
      Join-Path $installRoot "resources\app.asar.unpacked\node_modules\chrome-devtools-mcp\package.json"
    )

    $existingPackageFiles = @($packageFiles | Where-Object { Test-Path -LiteralPath $_ })
    $binPath = Join-Path $installRoot "resources\bin"
    $binFiles = @()
    if (Test-Path -LiteralPath $binPath) {
      $binFiles = @(Get-ChildItem -LiteralPath $binPath -File | Select-Object -ExpandProperty Name)
    }

    [PSCustomObject]@{
      InstallRoot = $installRoot
      ExePath = $exePath
      UserDataPath = $userDataPath
      DevToolsPort = Get-DevToolsPort
      BundledPackageFiles = $existingPackageFiles
      BinFiles = $binFiles
    } | ConvertTo-Json -Depth 5
  }
}
