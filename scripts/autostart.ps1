param([ValidateSet('Status','Enable','Disable')][string]$Mode = 'Status')
$ErrorActionPreference = 'Stop'
$recallAutoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$recallAutoFolder = [Environment]::GetFolderPath('Startup')
$recallAutoPath = [IO.Path]::GetFullPath((Join-Path $recallAutoFolder 'Recall.lnk'))
if (-not $recallAutoPath.StartsWith([IO.Path]::GetFullPath($recallAutoFolder) + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Неверный путь автозапуска.' }
$recallAutoTarget = Join-Path $recallAutoRoot 'Recall.exe'
$recallAutoShell = New-Object -ComObject WScript.Shell
$recallAutoExists = Test-Path -LiteralPath $recallAutoPath
$recallAutoOwned = $false
if ($recallAutoExists) {
 $recallAutoExisting = $recallAutoShell.CreateShortcut($recallAutoPath)
 $recallAutoOwned = $recallAutoExisting.TargetPath -eq $recallAutoTarget -and $recallAutoExisting.Arguments -eq '--background'
}
if ($Mode -ne 'Status' -and $recallAutoExists -and -not $recallAutoOwned) { throw 'В автозапуске есть другая копия Recall. Сначала отключи автозапуск в её меню.' }
if ($Mode -eq 'Enable') {
 if (-not (Test-Path -LiteralPath $recallAutoTarget)) { throw 'Сначала собери Recall.exe.' }
 $recallAutoLink = $recallAutoShell.CreateShortcut($recallAutoPath)
 $recallAutoLink.TargetPath = $recallAutoTarget
 $recallAutoLink.Arguments = '--background'
 $recallAutoLink.WorkingDirectory = $recallAutoRoot
 $recallAutoLink.Description = 'Recall: локальная служба в фоне'
 $recallAutoLink.IconLocation = $recallAutoTarget + ',0'
 $recallAutoLink.Save()
 $recallAutoOwned = $true
}
if ($Mode -eq 'Disable' -and $recallAutoOwned) { Remove-Item -LiteralPath $recallAutoPath; $recallAutoOwned = $false }
[PSCustomObject]@{ Enabled=$recallAutoOwned; Path=$recallAutoPath }
