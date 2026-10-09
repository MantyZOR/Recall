using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
class RecallLauncher {
 [STAThread] static void Main(string[] args) {
  try {
   string root=Path.GetDirectoryName(Application.ExecutablePath);
   string script=Path.Combine(root,"scripts","launcher.ps1");
   if(!File.Exists(script))throw new Exception("Папка Recall неполная. Распакуй весь архив перед запуском.");
   string background=Array.IndexOf(args,"--background")>=0?" -Background":"";
   Process.Start(new ProcessStartInfo {
    FileName=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"WindowsPowerShell","v1.0","powershell.exe"),
    Arguments="-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File \""+script+"\""+background,
    WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden
   });
  } catch(Exception e) { MessageBox.Show(e.Message,"Recall",MessageBoxButtons.OK,MessageBoxIcon.Error); }
 }
}
