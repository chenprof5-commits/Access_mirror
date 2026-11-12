$ErrorActionPreference = 'Stop'
$node = node --version
if ($LASTEXITCODE -ne 0 -or [int]($node.TrimStart('v').Split('.')[0]) -lt 26) { throw 'Node.js 26 LTS ou ultérieur est requis en production.' }
. (Join-Path $PSScriptRoot 'production-preflight.ps1')
Assert-AlphaProductionPreflight
$env:NODE_ENV = 'production'
npm run db:migrate
npm run admin:create
