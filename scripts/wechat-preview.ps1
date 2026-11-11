$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$port = 13841
$token = 'rzkUHcw0VxhOFYPJstEDr99fFW8Beh6F'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$packageRunner = Join-Path $projectRoot 'pnpm.cmd'

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

Push-Location $projectRoot
try {
  Write-Host '[1/3] Building WeChat mini program...'
  & $packageRunner run build
  if ($LASTEXITCODE -ne 0) {
    throw "Taro build failed with exit code $LASTEXITCODE."
  }

  Write-Host '[2/3] Clearing WeChat compile cache...'
  & $devToolsCli cache --clean compile --project $projectRoot --port $port --token $token --lang zh
  if ($LASTEXITCODE -ne 0) {
    throw "WeChat cache cleanup failed with exit code $LASTEXITCODE."
  }

  Write-Host '[3/3] Compiling and starting auto-preview...'
  & $devToolsCli auto-preview --project $projectRoot --port $port --token $token --lang zh
  if ($LASTEXITCODE -ne 0) {
    throw "WeChat auto-preview failed with exit code $LASTEXITCODE."
  }

  Write-Host 'Build, cache cleanup, and auto-preview completed.'
} finally {
  Pop-Location
}
