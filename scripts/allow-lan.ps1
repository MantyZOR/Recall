param([string]$PhoneAddress = '',[switch]$LocalNetwork)
$ErrorActionPreference = 'Stop'
if ($PhoneAddress -and ($PhoneAddress -notmatch '^(?:\d{1,3}\.){3}\d{1,3}$' -or ([System.Net.IPAddress]::Parse($PhoneAddress)).AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork)) { throw 'Некорректный IPv4 телефона.' }
$recallRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$recallLog = Join-Path $recallRoot 'data\lan-setup.log'
$null = [System.IO.Directory]::CreateDirectory((Split-Path -Parent $recallLog))
$recallIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$recallPrincipal = [Security.Principal.WindowsPrincipal]::new($recallIdentity)
if (-not $recallPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    try {
        $recallArguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"'
        if ($PhoneAddress) { $recallArguments += ' -PhoneAddress ' + $PhoneAddress }
        if ($LocalNetwork) { $recallArguments += ' -LocalNetwork' }
        $recallChild = Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -ArgumentList $recallArguments -Wait -PassThru
        if (Test-Path -LiteralPath $recallLog) { Get-Content -LiteralPath $recallLog }
        exit $recallChild.ExitCode
    } catch {
        Write-Error 'Windows не разрешила запуск с правами администратора. Правила сети не изменены.'
        exit 1
    }
}
try {
    $recallConfig = Get-Content -Raw -LiteralPath (Join-Path $recallRoot 'certs\config.json') | ConvertFrom-Json
    $recallAddress = [System.Net.IPAddress]::Parse($recallConfig.address)
    if ($recallAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { throw 'Нужен IPv4 из настройки Recall.' }
    $recallInterface = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -eq $recallAddress.ToString() } | Select-Object -First 1
    if (-not $recallInterface) { throw 'Адрес Recall отсутствует на компьютере. Сначала обнови настройку HTTPS.' }
    $recallProfile = Get-NetConnectionProfile -InterfaceIndex $recallInterface.InterfaceIndex
    $recallCategory = $recallProfile.NetworkCategory.ToString()
    if ($LocalNetwork) {
        if ($recallCategory -ne 'Private') { throw 'Для нескольких устройств выбери доверенную частную сеть Windows. Публичные сети этим режимом не разрешаются.' }
        $recallNode = Join-Path $recallRoot 'runtime\node.exe'
        if (-not (Test-Path -LiteralPath $recallNode)) { $recallNode = (Get-Command 'node.exe' -ErrorAction Stop).Source }
        foreach ($recallProtocol in @('TCP','UDP')) {
            $recallRuleName = 'Recall-Private-MultiDevice-' + $recallProtocol
            $recallPorts = if ($recallProtocol -eq 'TCP') { @(8443,8788) } else { @(5353) }
            if (Get-NetFirewallRule -Name $recallRuleName -ErrorAction SilentlyContinue) {
                Set-NetFirewallRule -Name $recallRuleName -Enabled True -Direction Inbound -Action Allow -Profile Private -Protocol $recallProtocol -LocalPort $recallPorts -LocalAddress Any -RemoteAddress LocalSubnet -Program $recallNode -InterfaceAlias $recallInterface.InterfaceAlias -EdgeTraversalPolicy Block | Out-Null
            } else {
                New-NetFirewallRule -Name $recallRuleName -DisplayName ('Recall: частная сеть (' + $recallProtocol + ')') -Description 'Recall для нескольких устройств: только частная локальная подсеть и выбранный сетевой адаптер, Node.js, TCP 8443/8788 или mDNS UDP 5353.' -Enabled True -Direction Inbound -Action Allow -Profile Private -Protocol $recallProtocol -LocalPort $recallPorts -LocalAddress Any -RemoteAddress LocalSubnet -Program $recallNode -InterfaceAlias $recallInterface.InterfaceAlias -EdgeTraversalPolicy Block | Out-Null
            }
        }
        $recallMessage = 'Готово: несколько устройств разрешены в частной локальной сети на выбранном адаптере. При смене Wi-Fi правило работает только если новая сеть также частная.'
        Set-Content -LiteralPath $recallLog -Value $recallMessage -Encoding UTF8
        Write-Output $recallMessage
        exit 0
    }
    if ($recallCategory -notin 'Private','Public') { throw 'Этот скрипт предназначен для домашнего подключения.' }
    $recallRemote = 'LocalSubnet'
    if ($recallCategory -eq 'Public') {
        if (-not $PhoneAddress) { throw 'Windows считает эту сеть публичной. Для доступа только своего телефона укажи -PhoneAddress и его IPv4. Категория сети не изменяется.' }
        $recallRemote = $PhoneAddress
    }
    $recallNode = Join-Path $recallRoot 'runtime\node.exe'
    if (-not (Test-Path -LiteralPath $recallNode)) { $recallNode = (Get-Command 'node.exe' -ErrorAction Stop).Source }
    $recallRuleName = 'Recall-Local-LAN'
    $recallRule = Get-NetFirewallRule -Name $recallRuleName -ErrorAction SilentlyContinue
    if ($recallRule) {
        Set-NetFirewallRule -Name $recallRuleName -Enabled True -Direction Inbound -Action Allow -Profile $recallCategory -Protocol TCP -LocalPort 8443,8788 -LocalAddress $recallAddress.ToString() -RemoteAddress $recallRemote -Program $recallNode -InterfaceAlias $recallInterface.InterfaceAlias -EdgeTraversalPolicy Block | Out-Null
    } else {
        New-NetFirewallRule -Name $recallRuleName -DisplayName 'Recall: телефон в домашней сети' -Description 'Recall HTTPS 8443 и открытый сертификат 8788. Только Node.js и указанный адрес домашней сети; на Public доступ ограничен одним телефоном.' -Enabled True -Direction Inbound -Action Allow -Profile $recallCategory -Protocol TCP -LocalPort 8443,8788 -LocalAddress $recallAddress.ToString() -RemoteAddress $recallRemote -Program $recallNode -InterfaceAlias $recallInterface.InterfaceAlias -EdgeTraversalPolicy Block | Out-Null
    }
    $recallMessage = 'Готово: Recall разрешён для ' + $recallAddress + ' на ' + $recallInterface.InterfaceAlias + ', TCP 8443 и 8788; профиль ' + $recallCategory + '; разрешённый адрес клиента: ' + $recallRemote + '.'
    Set-Content -LiteralPath $recallLog -Value $recallMessage -Encoding UTF8
    Write-Output $recallMessage
} catch {
    $recallMessage = 'Не удалось настроить доступ: ' + $_.Exception.Message
    Set-Content -LiteralPath $recallLog -Value $recallMessage -Encoding UTF8
    Write-Output $recallMessage
    exit 1
}

