using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Forms=System.Windows.Forms;
using Microsoft.Win32;

static class RecallSetup {
 const string ProductMarker=".recall-installation", AppMarker=".recall-installed", Owner="Recall Windows installation v1";
 const string RegistryKey=@"Software\Microsoft\Windows\CurrentVersion\Uninstall\Recall";
 const long MaxUnpacked=256L*1024*1024;
 static readonly string DefaultRoot=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","Recall");
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=4*1024*1024};
 static string root, source, priorRoot, log;
 static bool quiet, noShortcuts, desktopLink=true;
 static string App {get{return Child(root,"app");}}
 static string Previous {get{return Child(root,".previous-app");}}

 [STAThread] static int Main(string[] args) {
  try {
   if(!Environment.Is64BitOperatingSystem)throw new Exception("Для этой сборки нужна 64-разрядная Windows.");
   quiet=args.Contains("--quiet");noShortcuts=args.Contains("--no-shortcuts");
   log=Option(args,"--log");source=Option(args,"--from");
#if MAINTENANCE
   root=Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
   if(!quiet&&MessageBox.Show("Удалить приложение? Карточки, настройки и сертификаты останутся.","Recall",MessageBoxButton.YesNo,MessageBoxImage.Question)!=MessageBoxResult.Yes)return 0;
   Remove();
   if(!quiet)MessageBox.Show("Приложение удалено. Данные сохранены в "+root,"Recall");
#else
   var previous=Option(args,"--move-from");
   priorRoot=previous!=null?DirectoryPath(previous):RegisteredRoot();
   root=DirectoryPath(Option(args,"--dir")??priorRoot??DefaultRoot);
   var preview=Option(args,"--render-preview");
   if(quiet&&preview==null)Install();else return ShowSetup(preview);
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
  if(!quiet)MessageBox.Show(message,"Recall",MessageBoxButton.OK,MessageBoxImage.Error);
 }
 static bool SamePath(string a,string b){return String.Equals(a,b,StringComparison.OrdinalIgnoreCase);}
 static bool Below(string parent,string child){return child.StartsWith(parent+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase);}
 static string DirectoryPath(string value){
  var text=Environment.ExpandEnvironmentVariables((value??"").Trim().Trim('"'));
  if(text.Length<3||text[1]!=':'||(text[2]!='\\'&&text[2]!='/')||text.Substring(2).Contains(":"))throw new ArgumentException("Укажи полный путь к локальной папке.");
  var full=Path.GetFullPath(text).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar);
  if(String.IsNullOrEmpty(Path.GetDirectoryName(full)))throw new ArgumentException("Выбери отдельную папку для Recall.");
  return full;
 }
 static string RegisteredRoot(){
  if(noShortcuts)return null;
  using(var key=Registry.CurrentUser.OpenSubKey(RegistryKey)){
   var value=key==null?null:key.GetValue("InstallLocation") as string;
   if(String.IsNullOrWhiteSpace(value))return null;
   try{var candidate=DirectoryPath(value);return Owned(candidate)?candidate:null;}
   catch(IOException){return null;}catch(ArgumentException){return null;}catch(UnauthorizedAccessException){return null;}catch(NotSupportedException){return null;}
  }
 }
 static bool HasState(string directory){return Directory.Exists(Child(directory,"data"))||Directory.Exists(Child(directory,"certs"));}
 static string MoveFrom(string destination){return priorRoot!=null&&!SamePath(priorRoot,destination)?priorRoot:null;}
 static string Child(string parent,string name){
  var full=Path.GetFullPath(Path.Combine(parent,name));
  if(!Below(parent,full))throw new Exception("Путь выходит за пределы папки Recall.");
  return full;
 }
 static void CheckPath(string path){
  for(var p=path;!String.IsNullOrEmpty(p);p=Path.GetDirectoryName(p)){
   if(!File.Exists(p)&&!Directory.Exists(p))continue;
   if((File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0)throw new IOException("Recall не изменяет папки и файлы, перенаправленные ссылкой: "+p);
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
    foreach(var file in files.Keys)for(var folder=Path.GetDirectoryName(file);folder!=null&&!SamePath(folder,dir);folder=Path.GetDirectoryName(folder))directories.Add(folder);
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
 static void StopInstalled(string program){
  if(!PortInUse())return;
  if(!ProgramFolder(program))throw new Exception("Останови старую службу через её меню Recall.");
  var script=ArchivePath(program,"scripts/stop.ps1");CheckPath(script);
  if(!File.Exists(script))throw new Exception("Останови старую службу через её меню Recall.");
  var ps=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"WindowsPowerShell","v1.0","powershell.exe");
  var info=new ProcessStartInfo{FileName=ps,Arguments="-NoProfile -ExecutionPolicy Bypass -File \""+script+"\"",WorkingDirectory=program,UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden};
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
 static string TransferSource(string moving){
  if(source!=null&&moving!=null)throw new Exception("Для переноса установленной версии достаточно выбрать новую папку установки.");
  var from=source!=null?DirectoryPath(source):moving;
  if(from==null)return null;
  CheckPath(from);
  if(SamePath(root,from)||Below(root,from)||Below(from,root))throw new Exception("Выбери отдельную папку. Она не должна находиться внутри старой или содержать её.");
  if(moving!=null){
   var previousApp=Child(moving,"app");
   if(!Owned(moving)||!ProgramFolder(previousApp))throw new Exception("Не удалось найти прежнюю установку Recall.");
   if(new Version(File.ReadAllText(Child(previousApp,AppMarker)))>new Version(ReleaseBuild.Version))throw new Exception("Уже установлена более новая версия Recall.");
  }else if(!File.Exists(Child(from,"Recall.exe"))||!File.Exists(ArchivePath(from,"server/index.mjs"))){
   throw new Exception("Выбери старую папку, в которой лежит Recall.exe.");
  }
  if(HasState(root)||Directory.Exists(App))throw new Exception("В выбранной папке уже есть другая копия Recall. Для переноса выбери пустую папку.");
  if(moving==null&&PortInUse())throw new Exception("В старом Recall нажми «Остановить» и повтори перенос.");
  return from;
 }
 static FileStream Lock(string directory){
  var file=Child(directory,".install.lock");CheckPath(file);
  return new FileStream(file,FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);
 }
 static void Install(){
  var moving=MoveFrom(root);
  var from=TransferSource(moving);
  CheckPath(root);
  if(Directory.Exists(root)&&!Owned(root)&&Directory.EnumerateFileSystemEntries(root).Any())throw new Exception("Папка установки уже занята. Её файлы не изменены.");
  Directory.CreateDirectory(root);
  var marker=Child(root,ProductMarker);CheckPath(marker);
  if(!File.Exists(marker))File.WriteAllText(marker,Owner);
  using(var installLock=Lock(root))
  using(var oldLock=moving!=null?Lock(moving):null){
   if(Directory.Exists(Previous)&&!Directory.Exists(App)&&ProgramFolder(Previous))Directory.Move(Previous,App);
   if(Directory.Exists(App)){
    if(!ProgramFolder(App))throw new Exception("Папка приложения не распознана.");
    if(new Version(File.ReadAllText(Child(App,AppMarker)))>new Version(ReleaseBuild.Version))throw new Exception("Уже установлена более новая версия Recall.");
   }
   from=TransferSource(moving);
   var stage=Child(root,".install-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(stage);
   var stagedApp=Child(stage,"app");Directory.CreateDirectory(stagedApp);
   var installedState=new List<string>();var swapped=false;
   try{
    Extract(stagedApp);
    if(moving!=null)StopInstalled(Child(moving,"app"));
    if(from!=null)foreach(var folder in new[]{"data","certs"})CopyState(Child(from,folder),Child(stage,folder));
    if(Directory.Exists(App))StopInstalled(App);
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
    Register(moving);
    RetireProgram(Previous);
   }finally{
    try{DeleteStaging(stage);}catch{if(!swapped)throw;}
   }
  }
 }
 [ComImport,Guid("00021401-0000-0000-C000-000000000046")]
 class ShellLink {}
 // IShellLinkW methods must follow the Windows SDK vtable order.
 [ComImport,Guid("000214F9-0000-0000-C000-000000000046"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface IShellLinkW {
  void GetPath([Out,MarshalAs(UnmanagedType.LPWStr)] StringBuilder file,int length,IntPtr findData,uint flags);
  void GetIDList(out IntPtr idList);
  void SetIDList(IntPtr idList);
  void GetDescription([Out,MarshalAs(UnmanagedType.LPWStr)] StringBuilder text,int length);
  void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string text);
  void GetWorkingDirectory([Out,MarshalAs(UnmanagedType.LPWStr)] StringBuilder path,int length);
  void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string path);
  void GetArguments([Out,MarshalAs(UnmanagedType.LPWStr)] StringBuilder arguments,int length);
  void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string arguments);
  void GetHotkey(out ushort hotkey);
  void SetHotkey(ushort hotkey);
  void GetShowCmd(out int command);
  void SetShowCmd(int command);
  void GetIconLocation([Out,MarshalAs(UnmanagedType.LPWStr)] StringBuilder path,int length,out int index);
  void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path,int index);
  void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path,uint reserved);
  void Resolve(IntPtr window,uint flags);
  void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
 }
 static bool IsOwnedShortcut(string file,string target,string arguments){
  if(target==null||!File.Exists(file)||(File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)return false;
  var link=(IShellLinkW)new ShellLink();
  try{
   const int ReadOnly=0;
   const uint RawPath=4;
   ((IPersistFile)link).Load(file,ReadOnly);
   var path=new StringBuilder(260);
   var args=new StringBuilder(2048);
   link.GetPath(path,path.Capacity,IntPtr.Zero,RawPath);
   link.GetArguments(args,args.Capacity);
   return SamePath(Environment.ExpandEnvironmentVariables(path.ToString()),target)&&SamePath(args.ToString(),arguments);
  }catch(COMException){return false;}catch(IOException){return false;}
  finally{Marshal.ReleaseComObject(link);}
 }
 static readonly string[] LinkNames={"Recall.lnk","Recall (установлен).lnk","Recall (приложение).lnk"};
 static void WriteShortcut(string file,string target,string arguments){
  var link=(IShellLinkW)new ShellLink();
  try{
   link.SetPath(target);
   link.SetArguments(arguments);
   link.SetWorkingDirectory(Path.GetDirectoryName(target));
   link.SetIconLocation(target,0);
   link.SetDescription("Recall — карточки и локальная синхронизация");
   ((IPersistFile)link).Save(file,true);
  }finally{Marshal.ReleaseComObject(link);}
 }
 static void EnsureShortcut(string folder,string target,string former,bool create){
  if(String.IsNullOrWhiteSpace(folder))return;
  if(create)Directory.CreateDirectory(folder);
  var candidates=LinkNames.Select(name=>Path.Combine(folder,name)).ToArray();
  var existing=candidates.Where(file=>IsOwnedShortcut(file,target,"")||IsOwnedShortcut(file,former,"")).ToArray();
  if(existing.Length>0){foreach(var file in existing)WriteShortcut(file,target,"");return;}
  if(!create)return;
  var next=candidates.FirstOrDefault(file=>!File.Exists(file)&&!Directory.Exists(file));
  if(next==null)throw new Exception("Не удалось создать ярлык Recall в папке "+folder+". Имена уже заняты.");
  WriteShortcut(next,target,"");
 }
 static void RemoveShortcuts(string folder,string target){
  if(String.IsNullOrWhiteSpace(folder))return;
  foreach(var name in LinkNames){var file=Path.Combine(folder,name);if(IsOwnedShortcut(file,target,""))File.Delete(file);}
 }
 static void Register(string moving){
  if(noShortcuts)return;
  var target=Child(App,"Recall.exe");
  var former=moving!=null?ArchivePath(moving,"app/Recall.exe"):source!=null?Child(DirectoryPath(source),"Recall.exe"):null;
  var maintenance=Child(root,"RecallMaintenance.exe");CheckPath(maintenance);
  using(var src=Resource("Recall.Maintenance"))using(var dst=new FileStream(maintenance,FileMode.Create))src.CopyTo(dst);
  using(var key=Registry.CurrentUser.CreateSubKey(RegistryKey)){
   key.SetValue("DisplayName","Recall");key.SetValue("DisplayVersion",ReleaseBuild.Version);
   key.SetValue("InstallLocation",root);key.SetValue("DisplayIcon",target);
   key.SetValue("UninstallString","\""+maintenance+"\"");key.SetValue("NoModify",1);key.SetValue("NoRepair",1);
  }
  EnsureShortcut(Environment.GetFolderPath(Environment.SpecialFolder.Programs,Environment.SpecialFolderOption.DoNotVerify),target,former,true);
  EnsureShortcut(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory,Environment.SpecialFolderOption.DoNotVerify),target,former,desktopLink);
  var startup=Environment.GetFolderPath(Environment.SpecialFolder.Startup);
  if(!String.IsNullOrWhiteSpace(startup)){
   var link=Path.Combine(startup,"Recall.lnk");if(IsOwnedShortcut(link,former,"--background"))WriteShortcut(link,target,"--background");
  }
 }
 static void Remove(){
  if(!Owned(root))throw new Exception("Эта папка не создана установщиком Recall.");
  using(var installLock=Lock(root)){
   var target=Child(App,"Recall.exe");
   if(Directory.Exists(App)){
    StopInstalled(App);
    RetireProgram(App);
   }
   RetireProgram(Previous);
   if(!noShortcuts){
    RemoveShortcuts(Environment.GetFolderPath(Environment.SpecialFolder.Programs),target);
    RemoveShortcuts(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),target);
    var startup=Environment.GetFolderPath(Environment.SpecialFolder.Startup);
    if(!String.IsNullOrWhiteSpace(startup)){
     var link=Path.Combine(startup,"Recall.lnk");if(IsOwnedShortcut(link,target,"--background"))File.Delete(link);
    }
   }
   bool registered;
   using(var key=Registry.CurrentUser.OpenSubKey(RegistryKey))registered=key!=null&&String.Equals((string)key.GetValue("InstallLocation"),root,StringComparison.OrdinalIgnoreCase);
   if(registered)Registry.CurrentUser.DeleteSubKeyTree(RegistryKey,false);
  }
 }
 static string ResourceText(string name){
  using(var reader=new StreamReader(Resource(name)))return reader.ReadToEnd();
 }
 sealed class FolderDialogOwner:Forms.IWin32Window {
  public IntPtr Handle{get;private set;}
  public FolderDialogOwner(Window window){Handle=new WindowInteropHelper(window).Handle;}
 }
 static string BrowseDirectory(Window window,string initial,string description){
  string directory=null;
  try{directory=DirectoryPath(initial);}
  catch(ArgumentException){}catch(IOException){}catch(NotSupportedException){}
  while(directory!=null&&!Directory.Exists(directory))directory=Path.GetDirectoryName(directory);
  using(var dialog=new Forms.FolderBrowserDialog{Description=description,SelectedPath=directory??"",ShowNewFolderButton=true})
   return dialog.ShowDialog(new FolderDialogOwner(window))==Forms.DialogResult.OK?dialog.SelectedPath:null;
 }
 static Task InstallInBackground(){
  var completion=new TaskCompletionSource<bool>();
  var installer=new Thread(()=>{
   try{Install();completion.SetResult(true);}
   catch(Exception error){completion.SetException(error);}
  });
  installer.SetApartmentState(ApartmentState.STA);
  installer.Start();
  return completion.Task;
 }
 static void RenderPreview(Window window,string path){
  var visual=(FrameworkElement)window.Content;
  int width=(int)window.Width,height=(int)window.Height-39;
  visual.Measure(new Size(width,height));visual.Arrange(new Rect(0,0,width,height));visual.UpdateLayout();
  var bitmap=new RenderTargetBitmap(width,height,96,96,PixelFormats.Pbgra32);bitmap.Render(visual);
  var png=new PngBitmapEncoder();png.Frames.Add(BitmapFrame.Create(bitmap));
  var file=Path.GetFullPath(path);CheckPath(file);
  using(var output=new FileStream(file,FileMode.CreateNew))png.Save(output);
 }
 static int ShowSetup(string preview){
  var window=(Window)XamlReader.Parse(ResourceText("Recall.Setup").Replace("<!-- RECALL_THEME -->",ResourceText("Recall.Theme")));
  using(var icon=Resource("Recall.Icon"))window.Icon=BitmapFrame.Create(icon,BitmapCreateOptions.None,BitmapCacheOption.OnLoad);
  ((Image)window.FindName("BrandIcon")).Source=window.Icon;
  ((TextBlock)window.FindName("VersionText")).Text="v"+ReleaseBuild.Version;
  var destination=(TextBox)window.FindName("Destination");
  var browse=(Button)window.FindName("Browse");
  var heading=(TextBlock)window.FindName("Heading");
  var pathHint=(TextBlock)window.FindName("PathHint");
  var dataHint=(TextBlock)window.FindName("DataHint");
  var migration=(WrapPanel)window.FindName("Migration");
  var chooseSource=(Button)window.FindName("ChooseSource");
  var resetSource=(Button)window.FindName("ResetSource");
  var createDesktop=(CheckBox)window.FindName("DesktopLink");
  var open=(CheckBox)window.FindName("LaunchAfter");
  var message=(TextBlock)window.FindName("Message");
  var cancel=(Button)window.FindName("Cancel");
  var run=(Button)window.FindName("Run");
  destination.Text=root;
  Action<string> showMessage=value=>{
   message.Text=value;
   message.Visibility=String.IsNullOrEmpty(value)?Visibility.Collapsed:Visibility.Visible;
  };
  Action refresh=()=>{
   try{
    var directory=DirectoryPath(destination.Text);
    var moving=MoveFrom(directory)!=null;
    var updating=Directory.Exists(Child(directory,"app"));
    var hasState=HasState(directory);
    var canImport=!moving&&!updating&&!hasState;
    heading.Text=moving||updating?"Обновление Recall":"Установка Recall";
    run.Content=moving?"Перенести и обновить":updating?"Обновить":"Установить";
    pathHint.Text=moving?"Recall будет работать из новой папки.":updating?"Можно обновить здесь или выбрать другую папку.":"Укажи путь или выбери папку через «Обзор».";
    dataHint.Text=moving?"Данные и сертификаты скопируются. Старая папка останется на месте.":
      updating||hasState?"Карточки, настройки и подключения сохранятся.":
      source!=null?"Данные будут скопированы из "+source:"Если Recall уже был распакован из ZIP, можно перенести его данные.";
    migration.Visibility=canImport?Visibility.Visible:Visibility.Collapsed;
    resetSource.Visibility=source!=null?Visibility.Visible:Visibility.Collapsed;
    run.IsEnabled=true;
   }catch(ArgumentException error){pathHint.Text=error.Message;run.IsEnabled=false;}
    catch(IOException error){pathHint.Text=error.Message;run.IsEnabled=false;}
    catch(NotSupportedException error){pathHint.Text=error.Message;run.IsEnabled=false;}
  };
  destination.TextChanged+=(sender,e)=>{showMessage(null);refresh();};
  browse.Click+=(sender,e)=>{
   try{
    var selected=BrowseDirectory(window,destination.Text,"Выбери папку для установки Recall");
    if(selected==null)return;
    if(Path.GetPathRoot(selected)==selected||(!Owned(selected)&&Directory.EnumerateFileSystemEntries(selected).Any()))
     selected=Path.Combine(selected,"Recall");
    destination.Text=selected;
   }catch(Exception error){showMessage(error.Message);}
  };
  chooseSource.Click+=(sender,e)=>{
   try{
    var selected=BrowseDirectory(window,source,"Выбери старую папку, в которой лежит Recall.exe");
    if(selected!=null){source=DirectoryPath(selected);showMessage(null);refresh();}
   }catch(Exception error){showMessage(error.Message);}
  };
  resetSource.Click+=(sender,e)=>{source=null;showMessage(null);refresh();};
  cancel.Click+=(sender,e)=>window.Close();
  bool busy=false;int result=0;
  window.Closing+=(sender,e)=>{if(busy)e.Cancel=true;};
  window.PreviewKeyDown+=(sender,e)=>{
   if(e.Key==System.Windows.Input.Key.Escape&&!busy){e.Handled=true;window.Close();}
  };
  var editable=new Control[]{destination,browse,chooseSource,resetSource,createDesktop,open,cancel,run};
  run.Click+=async(sender,e)=>{
   root=DirectoryPath(destination.Text);
   if(migration.Visibility!=Visibility.Visible)source=null;
   desktopLink=createDesktop.IsChecked==true;
   busy=true;foreach(var control in editable)control.IsEnabled=false;
   showMessage("Устанавливаем Recall…");
   try{await InstallInBackground();}
   catch(Exception error){
    busy=false;result=1;foreach(var control in editable)control.IsEnabled=true;
    showMessage(error is UnauthorizedAccessException?"Нет доступа к папке. Выбери папку, доступную твоей учётной записи.":error.Message);
    if(log!=null)File.WriteAllText(log,error.Message);
    return;
   }
   busy=false;result=0;
   if(open.IsChecked==true){
    try{Process.Start(new ProcessStartInfo{FileName=Child(App,"Recall.exe"),WorkingDirectory=App,UseShellExecute=true});}
    catch(System.ComponentModel.Win32Exception){MessageBox.Show(window,"Recall установлен. Открой его через ярлык.","Recall");}
   }
   window.Close();
  };
  refresh();
  if(preview!=null)RenderPreview(window,preview);
  else window.ShowDialog();
  return result;
 }
}
