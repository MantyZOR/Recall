param([switch]$Background,[switch]$NoAutoStart,[switch]$SmokeTest,[string]$RenderPreview='')
$ErrorActionPreference = 'Stop'
$recallRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $recallRoot
$recallMenuData = if($env:RECALL_DATA_DIR){[IO.Path]::GetFullPath($env:RECALL_DATA_DIR)}else{Join-Path $recallRoot 'data'}
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
[xml]$recallXaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Title="Recall — запуск" Width="660" Height="820" MinWidth="550" MinHeight="620" WindowStartupLocation="CenterScreen" Background="#F8F8FB" FontFamily="Segoe UI" FontSize="16">
 <Window.Resources>
  <Style TargetType="Button"><Setter Property="Padding" Value="14,10"/><Setter Property="Margin" Value="0,0,10,8"/><Setter Property="MinHeight" Value="44"/><Setter Property="Background" Value="White"/><Setter Property="BorderBrush" Value="#D6D2E8"/><Setter Property="Foreground" Value="#2D2940"/><Setter Property="Cursor" Value="Hand"/></Style>
  <Style TargetType="TextBlock"><Setter Property="TextWrapping" Value="Wrap"/></Style>
  <Style TargetType="TextBox"><Setter Property="Padding" Value="10"/><Setter Property="BorderBrush" Value="#D6D2E8"/><Setter Property="FontSize" Value="16"/></Style>
 </Window.Resources>
 <DockPanel Margin="24">
  <StackPanel DockPanel.Dock="Top" Margin="0,0,0,20"><TextBlock Text="Recall" FontSize="32" FontWeight="Bold"/><TextBlock Text="Твоё пространство знаний · компьютер и телефон" Foreground="#706B80" Margin="0,4,0,0"/></StackPanel>
  <StackPanel DockPanel.Dock="Bottom" Margin="0,16,0,0">
   <CheckBox x:Name="Autostart" Content="Запускать службу при входе в Windows" Margin="0,0,0,12"/>
   <TextBlock Text="Закрытие этого окна оставляет службу работать. «Остановить» отключает обмен и освобождает порты. На телефоне можно продолжать учиться офлайн." FontSize="14" Foreground="#706B80"/>
  </StackPanel>
  <ScrollViewer VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Disabled">
   <StackPanel>
    <Border Background="#EEEDF9" Padding="16" CornerRadius="12" Margin="0,0,0,18"><StackPanel>
     <TextBlock x:Name="Status" Text="Проверяем службу…" FontWeight="SemiBold" FontSize="18"/>
     <TextBlock x:Name="Message" Foreground="#706B80" Margin="0,6,0,0" FontSize="14"/>
    </StackPanel></Border>
    <TextBlock Text="На компьютере" FontWeight="SemiBold"/>
    <TextBox x:Name="PcAddress" Text="http://localhost:8787" IsReadOnly="True" Margin="0,8,0,14"/>
    <WrapPanel><Button x:Name="OpenPc" Content="Открыть на ПК" Background="#5B50CA" Foreground="White"/><Button x:Name="ConnectPhone" Content="Подключить телефон"/></WrapPanel>
    <WrapPanel><Button x:Name="Start" Content="Запустить службу"/><Button x:Name="Stop" Content="Остановить"/></WrapPanel>
    <Border Background="White" BorderBrush="#E7E5EF" BorderThickness="1" Padding="16" CornerRadius="12" Margin="0,10,0,16"><StackPanel>
     <TextBlock Text="На телефоне" FontSize="18" FontWeight="SemiBold"/>
     <TextBox x:Name="PhoneAddress" Text="Подключение ещё не настроено" IsReadOnly="True" Margin="0,8,0,10"/>
     <Grid><Grid.ColumnDefinitions><ColumnDefinition Width="160"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions>
      <Image x:Name="SetupQr" Width="144" Height="144" HorizontalAlignment="Left" VerticalAlignment="Top"/>
      <StackPanel Grid.Column="1"><TextBlock Text="Сканируй QR камерой телефона" FontWeight="SemiBold"/><TextBlock Text="Откроются шаги для iPhone и Android: сертификат, установка и связывание с ПК." Margin="0,8,0,0" Foreground="#706B80" FontSize="14"/><Button x:Name="CopySetup" Content="Копировать адрес" Margin="0,12,0,0"/></StackPanel>
     </Grid>
     <TextBlock x:Name="NetworkHint" Foreground="#9A642B" FontSize="14" Margin="0,12,0,0"/>
    </StackPanel></Border>
    <Expander Header="Настройка сети" Margin="0,0,0,16"><StackPanel Margin="0,12,0,0">
     <TextBlock Text="Адрес компьютера в домашней сети. Выбирай тот Wi-Fi или кабель, который доступен телефону." FontSize="14" Foreground="#706B80"/>
     <ComboBox x:Name="AddressPicker" Padding="8" Margin="0,8,0,10" DisplayMemberPath="Label"/>
     <Button x:Name="SetupTls" Content="Настроить адрес и HTTPS"/>
     <TextBlock Text="IP телефона для разрешения в брандмауэре Windows" Margin="0,8,0,8"/>
     <TextBox x:Name="PhoneIp" ToolTip="Например, 192.168.1.233"/>
     <CheckBox x:Name="LocalNetwork" Content="Несколько устройств в доверенных частных сетях" Margin="0,10,0,0"/>
     <Button x:Name="AllowLan" Content="Разрешить телефон в сети" Margin="0,10,0,8"/>
     <TextBlock Text="Для нескольких устройств включи переключатель: доступ будет разрешён только в частных сетях Windows на выбранном адаптере, включая постоянное имя компьютера. В публичной сети остаётся режим для конкретного IP телефона. Windows запросит права администратора." FontSize="14" Foreground="#706B80"/>
    </StackPanel></Expander>
    <Expander Header="Если удалил приложение с телефона"><StackPanel Margin="0,12,0,0"><TextBlock Text="1. Добавь Recall на экран телефона ещё раз. Если сертификат сохранился, переустанавливать его не нужно.&#10;&#10;2. На ПК в «Устройствах» отключи прежнее сопряжение и создай новый код.&#10;&#10;3. На телефоне открой новую иконку, свяжи устройства и дождись загрузки карточек с ПК. Для ещё не переданных изменений нужна сохранённая копия." FontSize="14"/><Button x:Name="RestoreHelp" Content="Открыть инструкцию" Margin="0,12,0,0"/></StackPanel></Expander>
   </StackPanel>
  </ScrollViewer>
 </DockPanel>
</Window>
'@
$recallWindow = [Windows.Markup.XamlReader]::Load([Xml.XmlNodeReader]::new($recallXaml))
$recallControls = @{}
foreach ($recallName in @('Status','Message','PcAddress','PhoneAddress','OpenPc','ConnectPhone','Start','Stop','SetupQr','CopySetup','NetworkHint','AddressPicker','SetupTls','PhoneIp','AllowLan','LocalNetwork','RestoreHelp','Autostart')) { $recallControls[$recallName]=$recallWindow.FindName($recallName) }
if (Test-Path -LiteralPath (Join-Path $recallRoot 'public\icon-192.png')) { $recallWindow.Icon=[Windows.Media.Imaging.BitmapFrame]::Create([Uri](Join-Path $recallRoot 'public\icon-192.png')) }
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
 $recallControls.NetworkHint.Text=if(-not $info.addressAvailable){'Настроенный IP больше не принадлежит этому ПК. Выбери новый адрес в настройке сети; перед сменой сохрани архив на телефоне.'}elseif(-not $info.phoneOrigin){'Для первого подключения телефона раскрой «Настройка сети».'}else{''}
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
 $recallControls.OpenPc.IsEnabled=$recallOurs; $recallControls.ConnectPhone.IsEnabled=$recallOurs
 $recallControls.Stop.IsEnabled=$recallOurs; $recallControls.Start.IsEnabled=-not $recallFound
 $recallControls.CopySetup.IsEnabled=$recallOurs -and [bool]$script:recallSetupOrigin
}
$recallControls.OpenPc.Add_Click({ Open-RecallUrl $recallControls.PcAddress.Text })
$recallControls.ConnectPhone.Add_Click({ Open-RecallUrl ($recallControls.PcAddress.Text + '/?page=devices') })
$recallControls.CopySetup.Add_Click({ if($script:recallSetupOrigin){[Windows.Clipboard]::SetText($script:recallSetupOrigin);Show-RecallMessage 'Адрес страницы подключения скопирован.'} })
$recallControls.RestoreHelp.Add_Click({ if($script:recallSetupOrigin){Open-RecallUrl $script:recallSetupOrigin}else{Open-RecallUrl ($recallControls.PcAddress.Text + '/?page=devices')} })
$recallControls.Start.Add_Click({ Start-RecallService })
$recallControls.Stop.Add_Click({ Start-RecallJob 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'stop.ps1')) 'stop' })
$recallControls.SetupTls.Add_Click({
 $recallChoice=$recallControls.AddressPicker.SelectedItem
 if(-not $recallChoice -or -not $recallNode){Show-RecallMessage 'Выбери сетевой адрес и проверь Node.js.';return}
 $script:recallSelectedAddress=$recallChoice.Address
 $recallConfigPath=Join-Path $recallRoot 'certs\config.json'
 if(Test-Path -LiteralPath $recallConfigPath){
  $recallConfig=Get-Content -Raw -Encoding UTF8 -LiteralPath $recallConfigPath | ConvertFrom-Json
  if($recallConfig.address -ne $script:recallSelectedAddress){
   if([Windows.MessageBox]::Show('Новый IP создаёт другой адрес приложения на телефоне. Сначала сохрани полный архив по старому адресу. Продолжить смену адреса?','Recall','YesNo','Question') -ne 'Yes'){return}
  }
 }
 Start-RecallJob 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'stop.ps1')) 'stop-for-tls'
})
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
   elseif($recallDone.Kind -eq 'start'){$recallInfo=$recallOutput|ConvertFrom-Json;Set-RecallInfo $recallInfo;Show-RecallMessage 'Готово. Открой приложение на ПК или подключи телефон.'}
   elseif($recallDone.Kind -eq 'stop-for-tls'){Start-RecallJob $recallNode @((Join-Path $PSScriptRoot 'setup-tls.mjs'),'--address',$script:recallSelectedAddress,'--renew') 'tls'}
   elseif($recallDone.Kind -eq 'tls'){Start-RecallService}
   else{Show-RecallMessage $recallOutput}
   $recallDone.Process.Dispose();Update-RecallHealth
  }
  foreach($recallBusyName in @('Start','Stop','SetupTls','AllowLan')){if($script:recallJob){$recallControls[$recallBusyName].IsEnabled=$false}else{if($recallBusyName -in @('SetupTls','AllowLan')){$recallControls[$recallBusyName].IsEnabled=$true}}}
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
 if($recallNode){try{$recallPreviewInfo=(& $recallNode (Join-Path $PSScriptRoot 'launch.mjs') --status-only --json --no-browser | Out-String)|ConvertFrom-Json;if($recallPreviewInfo.ready){Set-RecallInfo $recallPreviewInfo;Update-RecallHealth}}catch{}}
 $recallVisual=$recallWindow.Content;$recallVisual.Background=$recallWindow.Background
 $recallVisual.Measure([Windows.Size]::new(660,820));$recallVisual.Arrange([Windows.Rect]::new(0,0,660,820));$recallVisual.UpdateLayout()
 $recallRender=New-Object Windows.Media.Imaging.RenderTargetBitmap(660,820,96,96,[Windows.Media.PixelFormats]::Pbgra32)
 $recallRender.Render($recallVisual);$recallEncoder=New-Object Windows.Media.Imaging.PngBitmapEncoder;$recallEncoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($recallRender))
 $null=[IO.Directory]::CreateDirectory((Split-Path -Parent $recallPreviewPath));$recallFile=[IO.File]::Create($recallPreviewPath);$recallEncoder.Save($recallFile);$recallFile.Close();Write-Output 'Launcher preview rendered.';exit
}
$recallWindow.Add_ContentRendered({ if(-not $NoAutoStart){Start-RecallService}else{Update-RecallHealth};$recallTimer.Start() })
$recallWindow.Add_Closed({$recallTimer.Stop()})
$null=$recallWindow.ShowDialog()
