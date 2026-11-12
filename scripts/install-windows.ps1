$ErrorActionPreference = 'Stop'
$node = node --version
if ($LASTEXITCODE -ne 0) { throw 'Installez Node.js LTS avant de continuer.' }
$major = [int]($node.TrimStart('v').Split('.')[0])
if ($major -lt 24) { throw "Node.js 24 LTS minimum requis. Version trouvée : $node" }
Write-Host "Node $node détecté. Aucun paquet externe requis pour la V1."
npm run build
