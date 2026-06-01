param(
  [Parameter(Position = 0)]
  [ValidateSet("status", "open", "inspect", "path", "models")]
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

function Get-LanguageServerProcess {
  @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq "language_server.exe" -or $_.CommandLine -like "*language_server.exe*" } |
    Select-Object -First 1)
}

function Get-LanguageServerInfo {
  $process = Get-LanguageServerProcess
  if (-not $process) {
    throw "Antigravity language_server.exe is not running. Open Antigravity first."
  }

  $csrfToken = $null
  if ($process.CommandLine -match "--csrf_token\s+([^\s]+)") {
    $csrfToken = $Matches[1]
  }

  $ports = @(Get-NetTCPConnection -OwningProcess $process.ProcessId -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalAddress -eq "127.0.0.1" } |
    Select-Object -ExpandProperty LocalPort |
    Sort-Object)

  $httpPort = $null
  $httpsPort = $null
  foreach ($port in $ports) {
    try {
      $headers = @{}
      if ($csrfToken) {
        $headers["X-Csrf-Token"] = $csrfToken
      }
      $health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/healthz" -Headers $headers -TimeoutSec 2 -ErrorAction Stop
      if ($health.StatusCode -eq 200) {
        $httpPort = $port
        break
      }
    } catch {
      # The HTTPS gRPC-web port rejects plain HTTP; continue probing.
    }
  }

  if ($ports.Count -gt 0) {
    $httpsPort = @($ports | Where-Object { $_ -ne $httpPort } | Select-Object -First 1)[0]
  }

  [PSCustomObject]@{
    ProcessId = $process.ProcessId
    HttpPort = $httpPort
    HttpsPort = $httpsPort
    CsrfToken = $csrfToken
  }
}

function Invoke-AntigravityGrpcJson {
  param(
    [Parameter(Mandatory = $true)]
    [int] $Port,
    [Parameter(Mandatory = $true)]
    [string] $CsrfToken,
    [Parameter(Mandatory = $true)]
    [string] $Method,
    [Parameter(Mandatory = $true)]
    [object] $Message
  )

  $previousCallback = [System.Net.ServicePointManager]::ServerCertificateValidationCallback
  [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

  try {
    $json = $Message | ConvertTo-Json -Depth 20 -Compress
    $messageBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $body = New-Object byte[] (5 + $messageBytes.Length)
    $body[0] = 0
    $body[1] = [byte](($messageBytes.Length -shr 24) -band 0xff)
    $body[2] = [byte](($messageBytes.Length -shr 16) -band 0xff)
    $body[3] = [byte](($messageBytes.Length -shr 8) -band 0xff)
    $body[4] = [byte]($messageBytes.Length -band 0xff)
    [Array]::Copy($messageBytes, 0, $body, 5, $messageBytes.Length)

    $request = [System.Net.HttpWebRequest]::Create("https://127.0.0.1:$Port/exa.language_server_pb.LanguageServerService/$Method")
    $request.Method = "POST"
    $request.ContentType = "application/grpc-web+json"
    $request.Headers.Add("X-Grpc-Web", "1")
    $request.Headers.Add("X-User-Agent", "CONNECT_ES_USER_AGENT")
    $request.Headers.Add("x-codeium-csrf-token", $CsrfToken)
    $request.ContentLength = $body.Length

    $requestStream = $request.GetRequestStream()
    try {
      $requestStream.Write($body, 0, $body.Length)
    } finally {
      $requestStream.Dispose()
    }

    $response = $request.GetResponse()
    try {
      $memory = New-Object System.IO.MemoryStream
      $response.GetResponseStream().CopyTo($memory)
      $bytes = $memory.ToArray()
    } finally {
      $response.Dispose()
    }

    $offset = 0
    $messages = @()
    $trailers = ""
    while ($offset + 5 -le $bytes.Length) {
      $flag = [int]$bytes[$offset]
      $length = ([int]$bytes[$offset + 1] -shl 24) -bor ([int]$bytes[$offset + 2] -shl 16) -bor ([int]$bytes[$offset + 3] -shl 8) -bor [int]$bytes[$offset + 4]
      $offset += 5
      if ($length -lt 0 -or $offset + $length -gt $bytes.Length) {
        throw "Invalid gRPC-web frame length from Antigravity language server."
      }

      $frameBytes = New-Object byte[] $length
      [Array]::Copy($bytes, $offset, $frameBytes, 0, $length)
      $offset += $length

      if (($flag -band 0x80) -ne 0) {
        $trailers = [System.Text.Encoding]::UTF8.GetString($frameBytes)
      } else {
        $messages += [System.Text.Encoding]::UTF8.GetString($frameBytes) | ConvertFrom-Json
      }
    }

    if ($trailers -and $trailers -notmatch "grpc-status:\s*0") {
      throw "Antigravity gRPC-web call failed: $trailers"
    }
    if ($messages.Count -eq 0) {
      return $null
    }
    return $messages[0]
  } finally {
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = $previousCallback
  }
}

function Convert-QuotaInfo {
  param(
    [object] $QuotaInfo
  )

  if (-not $QuotaInfo) {
    return [PSCustomObject]@{
      Status = "unknown"
      RemainingFraction = $null
      RemainingPercent = $null
      ResetTimeUtc = $null
    }
  }

  $remainingFraction = $null
  if ($QuotaInfo.PSObject.Properties.Name -contains "remainingFraction") {
    $remainingFraction = [double]$QuotaInfo.remainingFraction
  }

  $resetTimeUtc = $null
  if ($QuotaInfo.PSObject.Properties.Name -contains "resetTime") {
    $resetTimeUtc = $QuotaInfo.resetTime
  }

  $status = "available"
  if ($remainingFraction -ne $null) {
    if ($remainingFraction -le 0) {
      $status = "exhausted"
    } elseif ($remainingFraction -lt 0.2) {
      $status = "low"
    }
  } elseif ($resetTimeUtc) {
    try {
      if ([datetime]::Parse($resetTimeUtc).ToUniversalTime() -gt [datetime]::UtcNow) {
        $status = "exhausted"
      }
    } catch {
      $status = "unknown"
    }
  } else {
    $status = "unknown"
  }

  $remainingPercent = $null
  if ($remainingFraction -ne $null) {
    $remainingPercent = [math]::Round($remainingFraction * 100, 1)
  }

  [PSCustomObject]@{
    Status = $status
    RemainingFraction = $remainingFraction
    RemainingPercent = $remainingPercent
    ResetTimeUtc = $resetTimeUtc
  }
}

function Get-AntigravityModels {
  $server = Get-LanguageServerInfo
  if (-not $server.CsrfToken) {
    throw "Could not find the Antigravity language server CSRF token in the running process command line."
  }
  if (-not $server.HttpsPort) {
    throw "Could not find the Antigravity language server HTTPS gRPC-web port."
  }

  $modelsResponse = Invoke-AntigravityGrpcJson -Port $server.HttpsPort -CsrfToken $server.CsrfToken -Method "GetAvailableModels" -Message @{ forceRefresh = $false }
  $creditsResponse = Invoke-AntigravityGrpcJson -Port $server.HttpsPort -CsrfToken $server.CsrfToken -Method "GetLoadCodeAssist" -Message @{ forceRefresh = $false }

  $models = @()
  $rawModels = $modelsResponse.response.models
  if ($rawModels) {
    foreach ($modelId in @($rawModels.PSObject.Properties.Name | Sort-Object)) {
      $model = $rawModels.$modelId
      $quota = Convert-QuotaInfo -QuotaInfo $model.quotaInfo
      $models += [PSCustomObject]@{
        Id = $modelId
        DisplayName = $model.displayName
        ApiProvider = $model.apiProvider
        Disabled = [bool]$model.disabled
        Quota = $quota
      }
    }
  }

  $creditInfo = $null
  $tier = $creditsResponse.response.currentTier
  $availableCredits = @()
  if ($tier -and $tier.PSObject.Properties.Name -contains "availableCredits") {
    $availableCredits = @($tier.availableCredits)
  }
  $creditInfo = [PSCustomObject]@{
    CurrentTierId = $tier.id
    CurrentTierName = $tier.name
    AvailableCredits = $availableCredits
    UpgradeSubscriptionType = $tier.upgradeSubscriptionType
  }

  [PSCustomObject]@{
    Source = "Antigravity local language server gRPC-web"
    GeneratedAtUtc = [datetime]::UtcNow.ToString("o")
    LanguageServer = [PSCustomObject]@{
      ProcessId = $server.ProcessId
      HttpPort = $server.HttpPort
      HttpsPort = $server.HttpsPort
    }
    Note = "Antigravity exposes per-model quota fraction/reset metadata, not a raw token ledger."
    CreditStatus = $creditInfo
    Models = $models
  } | ConvertTo-Json -Depth 12
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

  "models" {
    Get-AntigravityModels
  }
}
