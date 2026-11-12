$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'Ce script doit être exécuté sous Windows PowerShell 7+.' }
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Exécutez PowerShell avec les droits du compte administrateur pour créer le dossier privé et ses ACL.' }

$root = Join-Path $env:ProgramData 'AlphaAccess'
$data = Join-Path $root 'data'
$configPath = Join-Path $root 'private.env'
$runAs = Read-Host 'Compte Windows qui exécutera Alpha Access (ex. DOMAINE\alpha-access)'
if ([string]::IsNullOrWhiteSpace($runAs)) { throw 'Un compte de service Windows est requis.' }
$public = Read-Host 'URL publique HTTPS du nouveau sous-domaine (ex. https://acces.exemple.test)'
try { $publicUri = [uri]$public; if ($publicUri.Scheme -ne 'https' -or $publicUri.UserInfo -or $publicUri.AbsolutePath -ne '/' -or $publicUri.Query -or $publicUri.Fragment -or $publicUri.Host -match '\.(example|invalid|test)$') { throw 'invalid' } } catch { throw 'URL publique invalide. La valeur ne sera pas enregistrée.' }
$business = Read-Host 'Nom public du service (Entrée = ALPHA ACCESS)'
if ([string]::IsNullOrWhiteSpace($business)) { $business = 'ALPHA ACCESS' }
$paymentLabel = Read-Host 'Libellé des instructions de paiement manuel'
$paymentUrl = Read-Host 'URL HTTPS publique de contact requise en production'
try { $paymentUri = [uri]$paymentUrl; if ($paymentUri.Scheme -ne 'https' -or $paymentUri.UserInfo -or $paymentUri.Host -match '\.(example|invalid|test)$') { throw 'invalid' } } catch { throw 'URL de contact invalide. La valeur ne sera pas enregistrée.' }

$secureOrigin = Read-Host 'URL HTTPS du site origine (saisie masquée, après fermeture de Codex)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureOrigin)
try { $origin = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
try { $originUri = [uri]$origin; if ($originUri.Scheme -ne 'https' -or $originUri.UserInfo -or $originUri.AbsolutePath -ne '/' -or $originUri.Query -or $originUri.Fragment) { throw 'invalid' } } catch { $origin = $null; throw 'URL origine invalide. La valeur ne sera pas enregistrée.' }

New-Item -ItemType Directory -Force -Path $root,$data | Out-Null
& icacls.exe $root /inheritance:r /grant:r "${runAs}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' 'BUILTIN\Administrators:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Impossible de restreindre les permissions du dossier privé.' }
& icacls.exe $data /inheritance:r /grant:r "${runAs}:(OI)(CI)M" 'SYSTEM:(OI)(CI)F' 'BUILTIN\Administrators:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Impossible de restreindre les permissions du dossier de données.' }

function New-Secret { [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48)).TrimEnd('=').Replace('+','-').Replace('/','_') }
$lines = @(
  'HOST=127.0.0.1','PORT=8080',"PUBLIC_BASE_URL=$public",
  "ORIGIN_URL=$origin",'TRIAL_SECONDS=900',"DATABASE_PATH=$($data.Replace('\','/'))/alpha-access.sqlite",
  "SESSION_SECRET=$(New-Secret)","ACTIVATION_HASH_SECRET=$(New-Secret)","BUSINESS_NAME=$($business.Replace("`r",' ').Replace("`n",' '))",
  "PAYMENT_CONTACT_LABEL=$($paymentLabel.Replace("`r",' ').Replace("`n",' '))","PAYMENT_CONTACT_URL=$paymentUrl"
)
[IO.File]::WriteAllLines($configPath,$lines,[Text.UTF8Encoding]::new($false))
& icacls.exe $configPath /inheritance:r /grant:r "${runAs}:R" 'SYSTEM:F' 'BUILTIN\Administrators:F' | Out-Null
if ($LASTEXITCODE -ne 0) { Remove-Item -LiteralPath $configPath -Force; throw 'Impossible de restreindre les permissions du fichier privé.' }
[Environment]::SetEnvironmentVariable('ALPHA_PRIVATE_CONFIG_PATH',$configPath,'Machine')
[Environment]::SetEnvironmentVariable('NODE_ENV','production','Machine')
$env:ALPHA_PRIVATE_CONFIG_PATH=$configPath;$env:NODE_ENV='production'
$lines=$null;$origin=$null;$originUri=$null;$publicUri=$null;$paymentUri=$null;$secureOrigin.Dispose()
Write-Host "Configuration privée créée hors du projet. Chemin : $configPath"
Write-Host "Le compte autorisé est $runAs. Ne copiez pas le contenu du fichier dans le projet ni dans un outil IA."
