using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Sockets;
using System.Reflection;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

static class RecallSetup {
 const string ProductMarker=".recall-installation", AppMarker=".recall-installed", Owner="Recall Windows installation v1";
 const string RegistryKey=@"Software\Microsoft\Windows\CurrentVersion\Uninstall\Recall";
 const long MaxUnpacked=256L*1024*1024;
 static readonly string DefaultRoot=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","Recall");
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=4*1024*1024};
 static string root, source, log;
 static bool quiet, noShortcuts;
 static string App {get{return Child(root,"app");}}
 static string Previous {get{return Child(root,".previous-app");}}
 static bool Registered {get{return !noShortcuts&&String.Equals(root,DefaultRoot,StringComparison.OrdinalIgnoreCase);}}

 [STAThread] static int Main(string[] args) {
  try {
   if(!Environment.Is64BitOperatingSystem)throw new Exception("Для этой сборки нужна 64-разрядная Windows.");
   quiet=args.Contains("--quiet");noShortcuts=args.Contains("--no-shortcuts");
   log=Option(args,"--log");source=Option(args,"--from");
#if MAINTENANCE
   root=Path.GetDirectoryName(Application.ExecutablePath);
   if(!quiet&&MessageBox.Show("Удалить приложение? Карточки, настройки и сертификаты останутся.","Recall",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return 0;
   Remove();
   if(!quiet)MessageBox.Show("Приложение удалено. Данные сохранены в "+root,"Recall");
#else
   root=Path.GetFullPath(Option(args,"--dir")??DefaultRoot).TrimEnd(Path.DirectorySeparatorChar);
   if(String.IsNullOrEmpty(Path.GetDirectoryName(root)))throw new Exception("Выбери отдельную папку для Recall.");
   if(quiet)Install();else return ShowSetup();
#endif
   return 0;
  } catch(Exception e){Report(e.Message);return 1;}
 }
 static string Option(string[] args,string key){
  var i=Array.IndexOf(args,key);
  if(i<0)return null;
  if(i+1==args.Length||args[i+1].StartsWith("--"))throw new Exception("Не указан параметр "+key+".");
  return args[i+1];
 }
 static void Report(string message){
  if(log!=null)File.WriteAllText(log,message);
  if(!quiet)MessageBox.Show(message,"Recall",MessageBoxButtons.OK,MessageBoxIcon.Error);
 }
 static string Child(string parent,string name){
  var full=Path.GetFullPath(Path.Combine(parent,name));
  if(!full.StartsWith(parent+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("Путь выходит за пределы папки Recall.");
  return full;
 }
 static void CheckPath(string path){
  for(var p=path;!String.IsNullOrEmpty(p);p=Path.GetDirectoryName(p)){
   if(!File.Exists(p)&&!Directory.Exists(p))continue;
   if((File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0)throw new Exception("Recall не изменяет папки и файлы, перенаправленные ссылкой: "+p);
  }
 }
 static IEnumerable<string> Tree(string dir){
  CheckPath(dir);
  foreach(var entry in Directory.EnumerateFileSystemEntries(dir)){
   if((File.GetAttributes(entry)&FileAttributes.ReparsePoint)!=0)throw new Exception("В папке Recall обнаружена ссылка: "+entry);
   yield return entry;
   if(Directory.Exists(entry))foreach(var nested in Tree(entry))yield return nested;
  }
 }
 static string Hash(Stream bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
 static bool Owned(string dir){
  CheckPath(dir);var marker=Child(dir,ProductMarker);
  CheckPath(marker);return File.Exists(marker)&&File.ReadAllText(marker)==Owner;
 }
 static bool ProgramFolder(string dir){
  CheckPath(dir);var marker=Child(dir,AppMarker);CheckPath(marker);Version version;
  return File.Exists(marker)&&Version.TryParse(File.ReadAllText(marker).Trim(),out version);
 }
 static void DeleteStaging(string dir){
  if(!Directory.Exists(dir))return;
  if(!dir.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("Неверная папка подготовки.");
  foreach(var entry in Tree(dir)){} // Verify the entire tree before deleting any entry.
  Directory.Delete(dir,true);
 }
 static void RetireProgram(string dir){
  if(!Directory.Exists(dir))return;
  if(!ProgramFolder(dir))throw new Exception("Папка приложения не распознана. Её файлы не изменены.");
  var contents=Tree(dir).ToArray();
  var manifestPath=Child(dir,"RELEASE.json");CheckPath(manifestPath);
  var clean=false;
  if(File.Exists(manifestPath)){
   try{
    var manifest=Json.DeserializeObject(File.ReadAllText(manifestPath)) as Dictionary<string,object>;
    var files=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
    foreach(var item in (object[])manifest["files"]){
     var entry=(Dictionary<string,object>)item;
     files[ArchivePath(dir,(string)entry["path"])]=(string)entry["sha256"];
    }
    var directories=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    foreach(var file in files.Keys)for(var folder=Path.GetDirectoryName(file);folder!=dir;folder=Path.GetDirectoryName(folder))directories.Add(folder);
    clean=contents.All(file=>{
     if(Directory.Exists(file))return directories.Contains(file);
     if(file==manifestPath||file==Child(dir,AppMarker))return true;
     string expected;if(!files.TryGetValue(file,out expected))return false;
     using(var stream=File.OpenRead(file))return Hash(stream)==expected;
    });
   }catch(Exception){clean=false;}
  }
  if(clean)DeleteStaging(dir);
  else Directory.Move(dir,Child(root,"saved-app-"+Guid.NewGuid().ToString("N").Substring(0,10)));
 }
 static string ArchivePath(string parent,string value){
  var parts=value.Split('/');
  if(value.Contains("\\")||parts.Any(p=>p.Length==0||p=="."||p==".."||p.EndsWith(".")||p.EndsWith(" ")||p.IndexOfAny(Path.GetInvalidFileNameChars())>=0)
     ||String.Equals(parts[0],"data",StringComparison.OrdinalIgnoreCase)||String.Equals(parts[0],"certs",StringComparison.OrdinalIgnoreCase)
     ||String.Equals(parts[0],AppMarker,StringComparison.OrdinalIgnoreCase))
   throw new Exception("Некорректный путь в установщике.");
  return Child(parent,String.Join(Path.DirectorySeparatorChar.ToString(),parts));
 }
 static Stream Resource(string name){
  var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream(name);
  if(stream==null)throw new Exception("В установщике нет всех файлов. Скачай RecallSetup.exe заново.");
  return stream;
 }
 static void Extract(string stage){
  using(var payload=Resource("Recall.Payload")){
   if(Hash(payload)!=ReleaseBuild.Digest)throw new Exception("Установщик повреждён. Скачай RecallSetup.exe заново.");
   payload.Position=0;
   using(var archive=new ZipArchive(payload,ZipArchiveMode.Read)){
    if(archive.Entries.Count>10000)throw new Exception("Слишком много файлов в установщике.");
    var files=new HashSet<string>(StringComparer.OrdinalIgnoreCase);long total=0;
    foreach(var entry in archive.Entries){
     var target=ArchivePath(stage,entry.FullName);
     if(!files.Add(target)||(total+=entry.Length)>MaxUnpacked)throw new Exception("Некорректный архив установщика.");
     Directory.CreateDirectory(Path.GetDirectoryName(target));
     using(var input=entry.Open())using(var output=new FileStream(target,FileMode.CreateNew))input.CopyTo(output);
    }
   }
  }
  foreach(var file in new[]{"Recall.exe","runtime/node.exe","dist/index.html","server/index.mjs","RELEASE.json"})
   if(!File.Exists(ArchivePath(stage,file)))throw new Exception("В установщике не хватает файла "+file+".");
  File.WriteAllText(Child(stage,AppMarker),ReleaseBuild.Version);
 }
 static bool PortInUse(){
  int port;if(!Int32.TryParse(Environment.GetEnvironmentVariable("RECALL_PORT"),out port)||port<1||port>65535)port=8787;
  using(var tcp=new TcpClient()){
   try{return tcp.ConnectAsync("127.0.0.1",port).Wait(750)&&tcp.Connected;}
   catch(AggregateException){return false;}
  }
 }
 static void StopInstalled(){
  if(!PortInUse())return;
  var script=ArchivePath(App,"scripts/stop.ps1");CheckPath(script);
  if(!File.Exists(script))throw new Exception("Останови старую службу через её меню Recall.");
  var ps=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"WindowsPowerShell","v1.0","powershell.exe");
  var info=new ProcessStartInfo{FileName=ps,Arguments="-NoProfile -ExecutionPolicy Bypass -File \""+script+"\"",WorkingDirectory=App,UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden};
  info.EnvironmentVariables.Remove("RECALL_DATA_DIR");info.EnvironmentVariables.Remove("RECALL_CERTS_DIR");
  using(var process=Process.Start(info)){
   if(!process.WaitForExit(20000)||process.ExitCode!=0||PortInUse())throw new Exception("Останови службу в открытом меню Recall и повтори.");
  }
 }
 static void CopyState(string from,string to){
  if(!Directory.Exists(from))return;
  var security=new DirectorySecurity();var user=WindowsIdentity.GetCurrent().User;
  security.SetAccessRuleProtection(true,false);
  foreach(var sid in new[]{user,new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null)})
   security.AddAccessRule(new FileSystemAccessRule(sid,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
  Directory.CreateDirectory(to,security);
  foreach(var entry in Tree(from)){
   var relative=entry.Substring(from.Length+1);
   if(relative=="launch.lock"||relative=="service.pid")continue;
   var target=Child(to,relative);
   if(Directory.Exists(entry))Directory.CreateDirectory(target);
   else File.Copy(entry,target,false);
  }
 }
 static void ValidateSource(){
  if(String.IsNullOrWhiteSpace(source)){source=null;return;}
  source=Path.GetFullPath(source).TrimEnd(Path.DirectorySeparatorChar);CheckPath(source);
  if(source.Equals(root,StringComparison.OrdinalIgnoreCase)||source.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)
     ||!File.Exists(Child(source,"Recall.exe"))||!File.Exists(ArchivePath(source,"server/index.mjs")))
   throw new Exception("Выбери старую папку, в которой лежит Recall.exe.");
  if(Directory.Exists(Child(root,"data"))||Directory.Exists(Child(root,"certs")))throw new Exception("Здесь уже есть данные Recall. Обновление не смешивает две базы. Сними выбор старой папки.");
  if(PortInUse())throw new Exception("В старом Recall нажми «Остановить» и повтори перенос.");
 }
 static void Install(){
  CheckPath(root);
  if(Directory.Exists(root)&&!Owned(root)&&Directory.EnumerateFileSystemEntries(root).Any())throw new Exception("Папка установки уже занята. Её файлы не изменены.");
  Directory.CreateDirectory(root);
  var marker=Child(root,ProductMarker);CheckPath(marker);
  if(!File.Exists(marker))File.WriteAllText(marker,Owner);
  var lockPath=Child(root,".install.lock");CheckPath(lockPath);
  using(var installLock=new FileStream(lockPath,FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None)){
   if(Directory.Exists(Previous)&&!Directory.Exists(App)&&ProgramFolder(Previous))Directory.Move(Previous,App);
   if(Directory.Exists(App)){
    if(!ProgramFolder(App))throw new Exception("Папка приложения не распознана.");
    if(new Version(File.ReadAllText(Child(App,AppMarker)))>new Version(ReleaseBuild.Version))throw new Exception("Уже установлена более новая версия Recall.");
   }
   ValidateSource();
   var stage=Child(root,".install-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(stage);
   var stagedApp=Child(stage,"app");Directory.CreateDirectory(stagedApp);
   var installedState=new List<string>();var swapped=false;
   try{
    Extract(stagedApp);
    if(source!=null)foreach(var folder in new[]{"data","certs"})CopyState(Child(source,folder),Child(stage,folder));
    if(Directory.Exists(App))StopInstalled();
    if(PortInUse())throw new Exception("Останови запущенную службу Recall перед установкой.");
    RetireProgram(Previous);
    if(Directory.Exists(App)){foreach(var entry in Tree(App)){}Directory.Move(App,Previous);}
    try{
     Directory.Move(stagedApp,App);
     foreach(var folder in new[]{"data","certs"})if(Directory.Exists(Child(stage,folder))){var target=Child(root,folder);Directory.Move(Child(stage,folder),target);installedState.Add(folder);}
     swapped=true;
    }catch{
     foreach(var folder in installedState)Directory.Move(Child(root,folder),Child(stage,folder));
     if(Directory.Exists(App)&&ProgramFolder(App))Directory.Move(App,stagedApp);
     if(Directory.Exists(Previous))Directory.Move(Previous,App);
     throw;
    }
    Register();
    RetireProgram(Previous);
   }finally{
    try{DeleteStaging(stage);}catch{if(!swapped)throw;}
   }
  }
 }
 static string Shortcut {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"Recall.lnk");}}
 static dynamic ShortcutObject(){
  dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
  return shell.CreateShortcut(Shortcut);
 }
 static void Register(){
  if(!Registered)return;
  var maintenance=Child(root,"RecallMaintenance.exe");CheckPath(maintenance);
  using(var src=Resource("Recall.Maintenance"))using(var dst=new FileStream(maintenance,FileMode.Create))src.CopyTo(dst);
  using(var key=Registry.CurrentUser.CreateSubKey(RegistryKey)){
   key.SetValue("DisplayName","Recall");key.SetValue("DisplayVersion",ReleaseBuild.Version);
   key.SetValue("InstallLocation",root);key.SetValue("DisplayIcon",Child(App,"Recall.exe"));
   key.SetValue("UninstallString","\""+maintenance+"\"");key.SetValue("NoModify",1);key.SetValue("NoRepair",1);
  }
  dynamic shortcut=ShortcutObject();
  if(!File.Exists(Shortcut)||String.Equals((string)shortcut.TargetPath,Child(App,"Recall.exe"),StringComparison.OrdinalIgnoreCase)){
   shortcut.TargetPath=Child(App,"Recall.exe");shortcut.WorkingDirectory=App;shortcut.Description="Recall — карточки и локальная синхронизация";shortcut.Save();
  }
 }
 static void Remove(){
  if(!Owned(root))throw new Exception("Эта папка не создана установщиком Recall.");
  var lockPath=Child(root,".install.lock");CheckPath(lockPath);
  using(var installLock=new FileStream(lockPath,FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None)){
   if(Directory.Exists(App)){
    StopInstalled();
    var startup=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup),"Recall.lnk");
    if(File.Exists(startup)){
     dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));dynamic link=shell.CreateShortcut(startup);
     if(String.Equals((string)link.TargetPath,Child(App,"Recall.exe"),StringComparison.OrdinalIgnoreCase))File.Delete(startup);
    }
    RetireProgram(App);
   }
   RetireProgram(Previous);
   if(File.Exists(Shortcut)&&String.Equals((string)ShortcutObject().TargetPath,Child(App,"Recall.exe"),StringComparison.OrdinalIgnoreCase))File.Delete(Shortcut);
   bool registered;
   using(var key=Registry.CurrentUser.OpenSubKey(RegistryKey))registered=key!=null&&String.Equals((string)key.GetValue("InstallLocation"),root,StringComparison.OrdinalIgnoreCase);
   if(registered)Registry.CurrentUser.DeleteSubKeyTree(RegistryKey,false);
  }
 }
 static int ShowSetup(){
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  var form=new Form{Text="Установка Recall",Width=540,Height=335,StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false,AutoScaleMode=AutoScaleMode.Dpi};
  var layout=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,WrapContents=false,Padding=new Padding(20),AutoScroll=true};
  var heading=new Label{Text="Recall "+ReleaseBuild.Version,Width=470,Height=36,Font=new System.Drawing.Font("Segoe UI",20,System.Drawing.FontStyle.Bold)};
  var info=new Label{Width=470,Height=64,Text="Все файлы приложения будут установлены в:\r\n"+root+"\r\nПри обновлении карточки и подключения сохранятся."};
  var migrate=new Button{Text="Перенести данные из старой папки…",AutoSize=true};
  var reset=new Button{Text="Не переносить",AutoSize=true,Enabled=source!=null};
  var migration=new FlowLayoutPanel{Width=470,Height=37};migration.Controls.Add(migrate);migration.Controls.Add(reset);
  var note=new Label{Width=470,Height=40,Text="Можно установить и без переноса."};
  var actions=new FlowLayoutPanel{Width=470,Height=50};
  var run=new Button{Text=Directory.Exists(App)?"Обновить":"Установить",AutoSize=true,Height=36};
  var cancel=new Button{Text="Закрыть",AutoSize=true,Height=36};
  var open=new CheckBox{Text="Открыть Recall после установки",Checked=true,AutoSize=true};
  actions.Controls.Add(run);actions.Controls.Add(cancel);actions.Controls.Add(open);
  foreach(var control in new Control[]{heading,info,migration,note,actions})layout.Controls.Add(control);
  form.Controls.Add(layout);form.AcceptButton=run;form.CancelButton=cancel;
  migration.Visible=!Directory.Exists(Child(root,"data"))&&!Directory.Exists(Child(root,"certs"));
  migrate.Click+=(sender,e)=>{using(var picker=new FolderBrowserDialog{Description="Выбери старую распакованную папку Recall"}){
   if(picker.ShowDialog(form)==DialogResult.OK){source=picker.SelectedPath;note.Text="Перенос из: "+source;reset.Enabled=true;}
  }};
  reset.Click+=(sender,e)=>{source=null;note.Text="Можно установить и без переноса.";reset.Enabled=false;};
  cancel.Click+=(sender,e)=>form.Close();
  bool busy=false;int result=0;form.FormClosing+=(sender,e)=>{if(busy)e.Cancel=true;};
  run.Click+=async(sender,e)=>{
   busy=true;run.Enabled=false;cancel.Enabled=false;migrate.Enabled=false;reset.Enabled=false;note.Text="Устанавливаем Recall…";
   try{
    await Task.Run((Action)Install);busy=false;result=0;
    if(open.Checked)Process.Start(new ProcessStartInfo{FileName=Child(App,"Recall.exe"),WorkingDirectory=App,UseShellExecute=true});
    form.Close();
   }catch(Exception error){busy=false;result=1;note.Text="Не удалось завершить установку.";run.Enabled=true;cancel.Enabled=true;migrate.Enabled=true;reset.Enabled=source!=null;Report(error.Message);}
  };
  Application.Run(form);return result;
 }
}
