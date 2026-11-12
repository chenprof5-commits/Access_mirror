$ErrorActionPreference = 'Stop'
$pidFile = 'data/local-processes.json'
if (Test-Path $pidFile) {
  $pids = Get-Content -Raw $pidFile | ConvertFrom-Json
  foreach ($id in @($pids.app,$pids.mock)) { Stop-Process -Id $id -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $pidFile -Force
}
Write-Host 'Processus locaux arrêtés.'
