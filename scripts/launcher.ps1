param([switch]$Background,[switch]$NoAutoStart,[switch]$SmokeTest,[string]$RenderPreview='')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'locations.ps1')
Set-Location -LiteralPath $recallRoot
$recallMenuData = $recallDataDirectory
$recallMenuPort = if($env:RECALL_PORT){[int]$env:RECALL_PORT}else{8787}
$recallNode = Join-Path $recallRoot 'runtime\node.exe'
if (-not (Test-Path -LiteralPath $recallNode)) {
 $recallNodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
 if ($recallNodeCommand) { $recallNode = $recallNodeCommand.Source } else { $recallNode = $null }
}
if ($Background) {
 if ($recallNode) { & $recallNode (Join-Path $PSScriptRoot 'launch.mjs') --json --no-browser | Out-Null }
 exit
}
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
$recallXaml=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'recall-launcher.xaml') -Raw -Encoding UTF8
$recallTheme=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'recall-windows-theme.xaml') -Raw -Encoding UTF8
$recallWindow=[Windows.Markup.XamlReader]::Parse($recallXaml.Replace('<!-- RECALL_THEME -->',$recallTheme))
$recallControls = @{}
foreach ($recallName in @('BrandIcon','StatusPlate','Status','Message','PcAddress','PhoneAddress','OpenPc','ConnectPhone','Start','Stop','Update','Network','SetupQr','SetupAddress','CopySetup','NetworkHint','AddressPicker','SetupTls','PhoneIpOptions','PhoneIp','AllowLan','LocalNetwork','RestoreHelp','Autostart')) { $recallControls[$recallName]=$recallWindow.FindName($recallName) }
$recallIconPath=Join-Path $recallRoot 'public\icon-192.png'
if (Test-Path -LiteralPath $recallIconPath) {
 $recallIconStream=[IO.File]::OpenRead($recallIconPath)
 try { $recallWindow.Icon=[Windows.Media.Imaging.BitmapFrame]::Create($recallIconStream,'None','OnLoad') }
 finally { $recallIconStream.Dispose() }
 $recallControls.BrandIcon.Source=$recallWindow.Icon
}
$script:recallJob=$null; $script:recallSetupOrigin=$null; $script:recallSelectedAddress=$null; $script:recallChangingStartup=$false
function Show-RecallMessage([string]$text) { $recallControls.Message.Text=$text }
function Open-RecallUrl([string]$url) {
 if ($url -and $url -match '^https?://') { Start-Process -FilePath explorer.exe -ArgumentList $url -WindowStyle Hidden }
}
function Start-RecallJob([string]$file,[string[]]$arguments,[string]$kind) {
 if ($script:recallJob) { return }
 $recallInfo=New-Object Diagnostics.ProcessStartInfo
 $recallInfo.FileName=$file
 $recallInfo.Arguments=($arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '
 $recallInfo.WorkingDirectory=$recallRoot
 $recallInfo.UseShellExecute=$false; $recallInfo.CreateNoWindow=$true; $recallInfo.WindowStyle='Hidden'
 $recallInfo.RedirectStandardOutput=$true; $recallInfo.RedirectStandardError=$true
 $recallInfo.StandardOutputEncoding=[Text.Encoding]::UTF8; $recallInfo.StandardErrorEncoding=[Text.Encoding]::UTF8
 $recallProcess=New-Object Diagnostics.Process; $recallProcess.StartInfo=$recallInfo
 if (-not $recallProcess.Start()) { throw 'Не удалось запустить действие.' }
 $script:recallJob=[PSCustomObject]@{Process=$recallProcess;Out=$recallProcess.StandardOutput.ReadToEndAsync();Err=$recallProcess.StandardError.ReadToEndAsync();Kind=$kind}
 Show-RecallMessage 'Подожди несколько секунд…'
}
function Start-RecallService {
 if (-not $recallNode) { Show-RecallMessage 'Установи Node.js 24 или новее либо используй переносимую сборку с включённым Node.js.'; return }
 Start-RecallJob $recallNode @((Join-Path $PSScriptRoot 'launch.mjs'),'--json','--no-browser') 'start'
}
function Set-RecallInfo($info) {
 $recallControls.PcAddress.Text=$info.desktopOrigin
 $recallControls.PhoneAddress.Text=if($info.phoneOrigin){$info.phoneOrigin}else{'Подключение ещё не настроено'}
 $script:recallSetupOrigin=$info.setupOrigin
 $recallControls.SetupAddress.Text=if($info.setupOrigin){'Первое подключение: ' + $info.setupOrigin}else{''}
 if ($info.setupQr) {
  $recallBytes=[Convert]::FromBase64String(($info.setupQr -split ',')[1])
  $recallBitmap=New-Object Windows.Media.Imaging.BitmapImage
  $recallBitmap.BeginInit(); $recallBitmap.CacheOption='OnLoad'; $recallBitmap.StreamSource=New-Object IO.MemoryStream(,$recallBytes); $recallBitmap.EndInit(); $recallBitmap.Freeze()
  $recallControls.SetupQr.Source=$recallBitmap
 }
 $recallControls.AddressPicker.Items.Clear()
 foreach ($recallAddress in $info.addresses) {
  $recallChoice=[PSCustomObject]@{Address=$recallAddress.address;Label=$recallAddress.name + ' · ' + $recallAddress.address}
  $null=$recallControls.AddressPicker.Items.Add($recallChoice)
  if ($recallAddress.address -eq $info.address) { $recallControls.AddressPicker.SelectedItem=$recallChoice }
 }
 if ($recallControls.AddressPicker.SelectedIndex -lt 0 -and $recallControls.AddressPicker.Items.Count) { $recallControls.AddressPicker.SelectedIndex=0 }
 $recallControls.NetworkHint.Text=if(-not $info.phoneOrigin){'Для первого подключения телефона раскрой «Настройка сети».'}elseif(-not $info.addressAvailable){'IP изменился. Для обмена Recall использует постоянное имя; новый код не нужен.'}else{'Код подключения создаётся в «Устройствах» на ПК.'}
}
function Update-RecallHealth {
 if ($script:recallJob) { return }
 $recallOurs=$false; $recallFound=$false
 try {
  $recallRequest=[Net.HttpWebRequest]::Create('http://127.0.0.1:' + $recallMenuPort + '/api/health'); $recallRequest.Proxy=$null; $recallRequest.Timeout=500
  $recallResponse=$recallRequest.GetResponse(); $recallReader=New-Object IO.StreamReader($recallResponse.GetResponseStream())
  $recallHealth=$recallReader.ReadToEnd() | ConvertFrom-Json; $recallReader.Close(); $recallResponse.Close(); $recallFound=$true
  $recallControl=Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $recallMenuData 'control.json') | ConvertFrom-Json
  $recallOurs=$recallHealth.ok -and $recallHealth.serverId -eq $recallControl.serverId
 } catch {}
 $recallControls.Status.Text=if($recallOurs){'Служба работает'}elseif($recallFound){'Порт занят другой копией Recall'}else{'Служба остановлена'}
 $recallTone=if($recallOurs){'Blue'}elseif($recallFound){'Lilac'}else{'Rose'}
 $recallControls.StatusPlate.Background=$recallWindow.FindResource($recallTone+'Brush')
 $recallControls.Status.Foreground=$recallWindow.FindResource($recallTone+'Ink')
 $recallControls.OpenPc.IsEnabled=$recallOurs; $recallControls.ConnectPhone.IsEnabled=$recallOurs
 $recallControls.Stop.IsEnabled=$recallOurs; $recallControls.Start.IsEnabled=-not $recallFound
 $recallControls.CopySetup.IsEnabled=$recallOurs -and [bool]$script:recallSetupOrigin
}
$recallControls.OpenPc.Add_Click({ Open-RecallUrl $recallControls.PcAddress.Text })
$recallControls.ConnectPhone.Add_Click({
 if(-not $script:recallSetupOrigin){$recallControls.Network.IsExpanded=$true;Show-RecallMessage 'Выбери адрес сети и нажми «Настроить адрес и HTTPS». Затем разреши Recall в частной сети.';return}
 Open-RecallUrl ($recallControls.PcAddress.Text + '/?page=devices')
})
$recallControls.CopySetup.Add_Click({ if($script:recallSetupOrigin){[Windows.Clipboard]::SetText($script:recallSetupOrigin);Show-RecallMessage 'Адрес страницы подключения скопирован.'} })
$recallControls.RestoreHelp.Add_Click({ if($script:recallSetupOrigin){Open-RecallUrl $script:recallSetupOrigin}else{Open-RecallUrl ($recallControls.PcAddress.Text + '/?page=devices')} })
$recallControls.Start.Add_Click({ Start-RecallService })
$recallControls.Stop.Add_Click({ Start-RecallJob 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'stop.ps1')) 'stop' })
$recallControls.Update.Add_Click({
 if(-not $recallInstalled){Open-RecallUrl 'https://github.com/MantyZOR/Recall/releases/latest';return}
 if($recallNode){Start-RecallJob $recallNode @((Join-Path $PSScriptRoot 'update.mjs')) 'check-update'}
})
$recallControls.SetupTls.Add_Click({
 $recallChoice=$recallControls.AddressPicker.SelectedItem
 if(-not $recallChoice -or -not $recallNode){Show-RecallMessage 'Выбери сетевой адрес и проверь Node.js.';return}
 $script:recallSelectedAddress=$recallChoice.Address
 $recallConfigPath=Join-Path $recallCertDirectory 'config.json'
 if(Test-Path -LiteralPath $recallConfigPath){
  $recallConfig=Get-Content -Raw -Encoding UTF8 -LiteralPath $recallConfigPath | ConvertFrom-Json
  if($recallConfig.address -ne $script:recallSelectedAddress){
   if([Windows.MessageBox]::Show('Новый IP создаёт другой адрес приложения на телефоне. Сначала сохрани полный архив по старому адресу. Продолжить смену адреса?','Recall','YesNo','Question') -ne 'Yes'){return}
  }
 }
 Start-RecallJob 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'stop.ps1')) 'stop-for-tls'
})
$recallNetworkMode={
 $recallControls.PhoneIpOptions.Visibility=if($recallControls.LocalNetwork.IsChecked){'Collapsed'}else{'Visible'}
 $recallControls.AllowLan.Content=if($recallControls.LocalNetwork.IsChecked){'Разрешить в частной сети'}else{'Разрешить этому телефону'}
}
$recallControls.LocalNetwork.Add_Checked($recallNetworkMode)
$recallControls.LocalNetwork.Add_Unchecked($recallNetworkMode)
$recallControls.AllowLan.Add_Click({
 if ($recallControls.LocalNetwork.IsChecked) { Start-RecallJob 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'allow-lan.ps1'),'-LocalNetwork') 'lan';return }
 $recallIp=$recallControls.PhoneIp.Text.Trim()
 if($recallIp -and ($recallIp -notmatch '^(?:\d{1,3}\.){3}\d{1,3}$' -or ($recallIp.Split('.') | Where-Object {[int]$_ -gt 255}))){Show-RecallMessage 'Укажи IPv4 телефона, например 192.168.1.233.';return}
 Start-RecallJob 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'allow-lan.ps1'),'-PhoneAddress',$recallIp) 'lan'
})
try { $recallAuto=& (Join-Path $PSScriptRoot 'autostart.ps1') -Mode Status; $recallControls.Autostart.IsChecked=$recallAuto.Enabled } catch { Show-RecallMessage $_.Exception.Message }
$recallStartupAction={
 if($script:recallChangingStartup){return}
 try { $recallMode=if($recallControls.Autostart.IsChecked){'Enable'}else{'Disable'}; $null=& (Join-Path $PSScriptRoot 'autostart.ps1') -Mode $recallMode;Show-RecallMessage 'Настройка автозапуска сохранена.' }
 catch { $script:recallChangingStartup=$true;$recallControls.Autostart.IsChecked=-not $recallControls.Autostart.IsChecked;$script:recallChangingStartup=$false;Show-RecallMessage $_.Exception.Message }
}
$recallControls.Autostart.Add_Checked($recallStartupAction); $recallControls.Autostart.Add_Unchecked($recallStartupAction)
$recallTimer=New-Object Windows.Threading.DispatcherTimer; $recallTimer.Interval=[TimeSpan]::FromMilliseconds(200); $script:recallTick=0
$recallTimer.Add_Tick({
 try {
  if($script:recallJob -and $script:recallJob.Process.HasExited -and $script:recallJob.Out.IsCompleted -and $script:recallJob.Err.IsCompleted){
   $recallDone=$script:recallJob;$script:recallJob=$null;$recallOutput=$recallDone.Out.Result.Trim()
   if($recallDone.Process.ExitCode -ne 0){if($recallDone.Kind -eq 'start'){try{Show-RecallMessage ($recallOutput|ConvertFrom-Json).error}catch{Show-RecallMessage $recallOutput}}else{Show-RecallMessage ($recallOutput + ' ' + $recallDone.Err.Result).Trim()}}
   elseif($recallDone.Kind -eq 'start'){$recallInfo=$recallOutput|ConvertFrom-Json;Set-RecallInfo $recallInfo;Show-RecallMessage 'Служба продолжит работать после закрытия окна.'}
   elseif($recallDone.Kind -eq 'stop-for-tls'){Start-RecallJob $recallNode @((Join-Path $PSScriptRoot 'setup-tls.mjs'),'--address',$script:recallSelectedAddress,'--renew') 'tls'}
   elseif($recallDone.Kind -eq 'tls'){Start-RecallService}
   elseif($recallDone.Kind -eq 'check-update'){
    $recallRelease=$recallOutput|ConvertFrom-Json
    if($recallRelease.available){
     if([Windows.MessageBox]::Show(('Доступна версия ' + $recallRelease.version + '. Скачать и открыть установщик? Карточки и подключения сохранятся.'),'Recall','YesNo','Question') -eq 'Yes'){
      Start-RecallJob $recallNode @((Join-Path $PSScriptRoot 'update.mjs'),$recallRelease.tag) 'download-update'
     }else{Show-RecallMessage 'Обновление отложено.'}
    }else{Show-RecallMessage 'Установлена актуальная версия Recall.'}
   }
   elseif($recallDone.Kind -eq 'download-update'){
    $recallInstaller=($recallOutput|ConvertFrom-Json).path
    Start-Process -FilePath $recallInstaller
    $recallWindow.Close()
   }
   else{Show-RecallMessage $recallOutput}
   $recallDone.Process.Dispose();Update-RecallHealth
  }
  foreach($recallBusyName in @('Start','Stop','SetupTls','AllowLan','Update')){if($script:recallJob){$recallControls[$recallBusyName].IsEnabled=$false}else{if($recallBusyName -in @('SetupTls','AllowLan','Update')){$recallControls[$recallBusyName].IsEnabled=$true}}}
  if(-not $script:recallJob -and ($script:recallTick++ % 15 -eq 0)){Update-RecallHealth}
 }catch{Show-RecallMessage $_.Exception.Message;$script:recallJob=$null}
})
if($SmokeTest){
 Start-RecallService;$recallTimer.Start();$recallUntil=[DateTime]::UtcNow.AddSeconds(30)
 while($script:recallJob -and [DateTime]::UtcNow -lt $recallUntil){
  $recallFrame=New-Object Windows.Threading.DispatcherFrame
  $null=$recallWindow.Dispatcher.BeginInvoke([Windows.Threading.DispatcherPriority]::Background,[Action]{$recallFrame.Continue=$false})
  [Windows.Threading.Dispatcher]::PushFrame($recallFrame);Start-Sleep -Milliseconds 50
 }
 $recallTimer.Stop()
 if($script:recallJob -or -not $recallControls.OpenPc.IsEnabled){throw ('Menu startup failed: '+$recallControls.Message.Text)}
 [PSCustomObject]@{Ready=$true;Desktop=$recallControls.PcAddress.Text;Autostart=[bool]$recallControls.Autostart.IsChecked;StopEnabled=[bool]$recallControls.Stop.IsEnabled}|ConvertTo-Json -Compress
 exit
}
if ($RenderPreview) {
 $recallPreviewPath=[IO.Path]::GetFullPath($RenderPreview)
 if(-not $recallPreviewPath.StartsWith($recallRoot + '\',[StringComparison]::OrdinalIgnoreCase)){throw 'Preview must stay in the Recall folder.'}
 if($recallNode){try{$recallPreviewInfo=(& $recallNode (Join-Path $PSScriptRoot 'launch.mjs') --status-only --json --no-browser | Out-String)|ConvertFrom-Json;if($recallPreviewInfo.ready){Set-RecallInfo $recallPreviewInfo}}catch{}}
 Update-RecallHealth
 $recallVisual=$recallWindow.Content
 $recallWidth=[int]$recallWindow.Width;$recallHeight=[int]$recallWindow.Height-39
 $recallVisual.Measure([Windows.Size]::new($recallWidth,$recallHeight));$recallVisual.Arrange([Windows.Rect]::new(0,0,$recallWidth,$recallHeight));$recallVisual.UpdateLayout()
 $recallRender=New-Object Windows.Media.Imaging.RenderTargetBitmap($recallWidth,$recallHeight,96,96,[Windows.Media.PixelFormats]::Pbgra32)
 $recallRender.Render($recallVisual);$recallEncoder=New-Object Windows.Media.Imaging.PngBitmapEncoder;$recallEncoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($recallRender))
 $null=[IO.Directory]::CreateDirectory((Split-Path -Parent $recallPreviewPath));$recallFile=[IO.File]::Create($recallPreviewPath);$recallEncoder.Save($recallFile);$recallFile.Close();Write-Output 'Launcher preview rendered.';exit
}
$recallWindow.Add_ContentRendered({ if(-not $NoAutoStart){Start-RecallService}else{Update-RecallHealth};$recallTimer.Start() })
$recallWindow.Add_Closed({$recallTimer.Stop()})
$null=$recallWindow.ShowDialog()
