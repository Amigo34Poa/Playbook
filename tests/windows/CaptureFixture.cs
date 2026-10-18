using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
class CaptureFixture {
    [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr c);
    static Form Window;
    static Button Button;
    static void Emit(object value) { Console.WriteLine(new JavaScriptSerializer().Serialize(value)); Console.Out.Flush(); }
    [STAThread] static void Main() {
        SetProcessDpiAwarenessContext(new IntPtr(-4));
        Window = new Form { Text="Playbook capture fixture", StartPosition=FormStartPosition.Manual, Location=new Point(80,80), Size=new Size(600,420), BackColor=Color.FromArgb(20,70,210), TopMost=true };
        Button = new Button { Text="Arquivo", AccessibleName="Arquivo", Location=new Point(160,140), Size=new Size(180,60), UseVisualStyleBackColor=false, BackColor=Color.White };
        Window.Controls.Add(Button);
        Button.Click += delegate { Window.BackColor=Color.FromArgb(210,40,20); Button.Text="Depois do clique"; Button.AccessibleName="Depois do clique"; Emit(new { type="clicked" }); };
        Window.Shown += delegate {
            var rect=Button.RectangleToScreen(Button.ClientRectangle); var screen=Screen.FromControl(Window).Bounds;
            Emit(new { type="ready", x=rect.Left+rect.Width/2, y=rect.Top+rect.Height/2, sampleX=Window.Left+40, sampleY=Window.Top+100, screenX=screen.X, screenY=screen.Y, screenWidth=screen.Width, screenHeight=screen.Height });
            new Thread(delegate() {
                string line; while ((line=Console.ReadLine()) != null) {
                    if (line=="stop") break;
                    Window.Invoke(new Action(delegate { Window.Activate(); Cursor.Position=new Point(rect.Left+rect.Width/2,rect.Top+rect.Height/2); }));
                    if (line=="move") { Emit(new { type="moved" }); continue; }
                    Thread.Sleep(400);
                    mouse_event(line=="right" ? 0x0008u : 0x0002u,0,0,0,UIntPtr.Zero);
                    mouse_event(line=="right" ? 0x0010u : 0x0004u,0,0,0,UIntPtr.Zero);
                }
                Window.BeginInvoke(new Action(delegate { Window.Close(); }));
            }) { IsBackground=true }.Start();
        };
        Application.Run(Window);
    }
}
