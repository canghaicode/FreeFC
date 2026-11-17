[CmdletBinding()]
param(
  [ValidateSet('Preview', 'Upload')]
  [string]$Mode = 'Preview',
  [string]$Version = '',
  [string]$Description = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($Mode -eq 'Upload') {
  $Version = $Version.Trim()
  $Description = $Description.Trim()
  if (-not $Version -or -not $Description) {
    throw 'Usage: pnpm run upload:weapp -- -Version <version> -Description <description>'
  }
  if ($Version.Length -gt 32) {
    throw 'Upload version must not exceed 32 characters.'
  }
  if ($Description.Length -gt 100) {
    throw 'Upload description must not exceed 100 characters.'
  }
}

$port = 13841
$token = if ($env:WECHAT_DEVTOOLS_CLI_TOKEN) { $env:WECHAT_DEVTOOLS_CLI_TOKEN } else { 'rzkUHcw0VxhOFYPJstEDr99fFW8Beh6F' }
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$packageRunner = Join-Path $projectRoot 'pnpm.cmd'
$distPath = Join-Path $projectRoot 'dist'
$stepCount = if ($Mode -eq 'Upload') { 5 } else { 4 }

if (-not (Test-Path -LiteralPath $packageRunner -PathType Leaf)) {
  throw "Package runner not found: $packageRunner"
}

$launcher = Get-Command wechatide -ErrorAction SilentlyContinue
if ($null -eq $launcher) {
  $launcher = Get-Command wechatide.cmd -ErrorAction SilentlyContinue
}
if ($null -eq $launcher) {
  throw 'wechatide was not found. Reinstall WeChat DevTools or add wechatide to PATH.'
}

$devToolsCli = Join-Path (Split-Path -Parent $launcher.Source) 'cli.bat'
if (-not (Test-Path -LiteralPath $devToolsCli -PathType Leaf)) {
  throw "WeChat DevTools CLI was not found: $devToolsCli"
}

function Invoke-DevToolsCaptured {
  param([string[]]$Arguments)

  $output = @()
  $exitCode = -1
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    # Windows PowerShell promotes native stderr to ErrorRecord while capturing output.
    $ErrorActionPreference = 'Continue'
    $output = @(& $devToolsCli @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  $output | ForEach-Object { Write-Host $_ }
  return [PSCustomObject]@{
    ExitCode = $exitCode
    Text = $output -join [Environment]::NewLine
  }
}

Push-Location $projectRoot
try {
  Write-Host "[1/$stepCount] Removing the previous generated package..."
  if (Test-Path -LiteralPath $distPath) {
    Remove-Item -LiteralPath $distPath -Recurse -Force
  }

  Write-Host "[2/$stepCount] Building WeChat mini program..."
  & $packageRunner run build
  if ($LASTEXITCODE -ne 0) {
    throw "Taro build failed with exit code $LASTEXITCODE."
  }

  Write-Host "[3/$stepCount] Clearing WeChat compile and file caches..."
  & $devToolsCli cache --clean all --project $projectRoot --port $port --token $token --lang zh
  if ($LASTEXITCODE -ne 0) {
    throw "WeChat cache cleanup failed with exit code $LASTEXITCODE."
  }

  Write-Host "[4/$stepCount] Compiling and starting auto-preview..."
  $preview = Invoke-DevToolsCaptured @(
    'auto-preview', '--project', $projectRoot,
    '--port', [string]$port, '--token', $token, '--lang', 'zh'
  )
  if ($preview.ExitCode -ne 0 -or $preview.Text -match '\[error\]|✖\s+compile_start' -or $preview.Text -notmatch 'auto-preview') {
    throw "WeChat auto-preview failed with exit code $($preview.ExitCode)."
  }

  if ($Mode -eq 'Upload') {
    Write-Host "[5/$stepCount] Uploading version $Version..."
    $receiptPath = Join-Path ([IO.Path]::GetTempPath()) 'freefc-wechat-upload.json'
    Remove-Item -LiteralPath $receiptPath -Force -ErrorAction SilentlyContinue
    $upload = Invoke-DevToolsCaptured @(
      'upload', '--project', $projectRoot,
      '--version', $Version, '--desc', $Description,
      '--info-output', $receiptPath,
      '--port', [string]$port, '--token', $token, '--lang', 'zh'
    )
    if ($upload.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) {
      throw "WeChat upload failed with exit code $($upload.ExitCode)."
    }
    $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    if ($null -eq $receipt.size -or [long]$receipt.size.total -le 0) {
      throw 'WeChat upload receipt is invalid.'
    }
    Write-Host "Uploaded version $Version ($($receipt.size.total) bytes)."
  } else {
    Write-Host 'Clean build, cache cleanup, and auto-preview completed.'
  }
} finally {
  Pop-Location
}
