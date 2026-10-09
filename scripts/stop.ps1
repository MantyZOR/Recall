[CmdletBinding(SupportsShouldProcess)]
param()
$ErrorActionPreference = 'Stop'
$recallRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$recallStopData = if ($env:RECALL_DATA_DIR) { [IO.Path]::GetFullPath($env:RECALL_DATA_DIR) } else { Join-Path $recallRoot 'data' }
$recallStopPort = if ($env:RECALL_PORT) { [int]$env:RECALL_PORT } else { 8787 }
try {
    $recallRequest = [System.Net.HttpWebRequest]::Create('http://127.0.0.1:' + $recallStopPort + '/api/health')
    $recallRequest.Proxy = $null
    $recallRequest.Timeout = 2000
    $recallResponse = $recallRequest.GetResponse()
    $recallReader = [System.IO.StreamReader]::new($recallResponse.GetResponseStream())
    $recallHealth = $recallReader.ReadToEnd() | ConvertFrom-Json
    $recallReader.Close()
    $recallResponse.Close()
} catch {
    Write-Output 'Служба Recall сейчас не отвечает. Процессы не изменены.'
    exit 0
}
try {
    $recallControl = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $recallStopData 'control.json') | ConvertFrom-Json
    $recallPid = [int](Get-Content -Raw -LiteralPath (Join-Path $recallStopData 'service.pid'))
    $recallListener = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $recallStopPort -State Listen
    $recallProcess = Get-Process -Id $recallPid
    if ($recallHealth.serverId -ne $recallControl.serverId -or $recallListener.OwningProcess -ne $recallPid -or $recallProcess.ProcessName -ne 'node') { throw 'Процесс не подтверждён как служба этой папки. Ничего не остановлено.' }
    if ($PSCmdlet.ShouldProcess('Recall, PID ' + $recallPid,'Остановить локальную службу')) {
        Stop-Process -Id $recallPid -ErrorAction Stop
        Write-Output 'Служба Recall остановлена. Локальные данные сохранены. Для запуска открой Recall.exe.'
    }
} catch {
    Write-Output ('Не удалось остановить службу: ' + $_.Exception.Message)
    exit 1
}
