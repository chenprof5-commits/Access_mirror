function Assert-AlphaProductionPreflight {
  $ErrorActionPreference = 'Stop'
  if (-not $env:ALPHA_PRIVATE_CONFIG_PATH) { throw 'ALPHA_PRIVATE_CONFIG_PATH absent.' }
  $configFile = [IO.Path]::GetFullPath($env:ALPHA_PRIVATE_CONFIG_PATH)
  if (-not (Test-Path -LiteralPath $configFile -PathType Leaf)) { throw 'Fichier privé absent.' }
  $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  if ($configFile.StartsWith($repo,[StringComparison]::OrdinalIgnoreCase)) { throw 'Le fichier privé doit être hors du projet.' }
  $root = Split-Path -Parent $configFile
  $current = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $broadSids = @('S-1-1-0','S-1-5-11','S-1-5-32-545','S-1-5-4')
  $data = Join-Path $root 'data'
  if (-not (Test-Path -LiteralPath $data -PathType Container)) { throw 'Dossier de données privé absent.' }
  $protectedItems=@($root,$data,$configFile)
  foreach($dbFile in @((Join-Path $data 'alpha-access.sqlite'),(Join-Path $data 'alpha-access.sqlite-wal'),(Join-Path $data 'alpha-access.sqlite-shm'))){if(Test-Path -LiteralPath $dbFile -PathType Leaf){$protectedItems+=,$dbFile}}
  foreach ($item in $protectedItems) {
    $acl = Get-Acl -LiteralPath $item
    foreach ($rule in $acl.Access) {
      if ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) { continue }
      try { $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } catch { continue }
      if ($sid -in $broadSids) { throw 'Une ACL autorise un groupe trop large sur le fichier privé ou son dossier.' }
    }
  }
  $fileAcl = Get-Acl -LiteralPath $configFile
  $hasRead = $false
  foreach ($rule in $fileAcl.Access) {
    if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and $rule.IdentityReference.Value -eq $current -and $rule.FileSystemRights.ToString().Contains('Read')) { $hasRead = $true }
  }
  if (-not $hasRead) { throw 'Le compte courant ne possède pas une permission de lecture explicite sur le fichier privé.' }
  $dataAcl=Get-Acl -LiteralPath $data;$hasModify=$false
  foreach($rule in $dataAcl.Access){if($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and $rule.IdentityReference.Value -eq $current -and ($rule.FileSystemRights.ToString().Contains('Modify') -or $rule.FileSystemRights.ToString().Contains('FullControl'))){$hasModify=$true}}
  if(-not $hasModify){throw 'Le compte courant ne possède pas une permission de modification explicite sur la base privée.'}
  $env:ALPHA_PRODUCTION_PREFLIGHT = 'verified'
}
