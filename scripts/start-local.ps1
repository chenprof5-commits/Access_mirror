$ErrorActionPreference = 'Stop'
$env:NODE_ENV = 'development'
$env:ALPHA_PRIVATE_CONFIG_PATH = $null
$env:ALPHA_PRODUCTION_PREFLIGHT = $null
if (-not (Test-Path '.env')) {
  $template = Get-Content -Raw '.env.example'
  $s1 = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(36)).Replace('+','-').Replace('/','_').TrimEnd('=')
  $s2 = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(36)).Replace('+','-').Replace('/','_').TrimEnd('=')
  $template = $template.Replace('REMPLACER_PAR_SECRET_SESSION_TEST_LOCAL_0123456789',$s1).Replace('REMPLACER_PAR_SECRET_HACHAGE_TEST_LOCAL_0123456789',$s2)
  Set-Content -NoNewline '.env' $template
}
npm run db:migrate
$mock = Start-Process -FilePath 'node' -ArgumentList 'src/mock-origin.ts' -PassThru -WindowStyle Hidden
$app = Start-Process -FilePath 'node' -ArgumentList '--watch src/server.ts' -PassThru -WindowStyle Hidden
New-Item -ItemType Directory -Force 'data' | Out-Null
Set-Content 'data/local-processes.json' (@{ mock=$mock.Id; app=$app.Id } | ConvertTo-Json)
Write-Host 'ALPHA ACCESS: http://127.0.0.1:8080'
Write-Host 'Administration : http://127.0.0.1:8080/admin/login'
Write-Host 'Première utilisation : npm run admin:create'
