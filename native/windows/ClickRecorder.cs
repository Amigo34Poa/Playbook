// Independent Windows Steps Recorder equivalent: mouse clicks, UI Automation and pre-click images.
// No keyboard hook and no reading of ValuePattern/TextPattern or password values.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;
using System.Windows.Forms;

class ClickRecorder {
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct MouseData { public POINT pt; public uint mouseData, flags, time; public UIntPtr extra; }
    delegate IntPtr HookProc(int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, HookProc callback, IntPtr module, uint thread);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);

    class Snapshot { public byte[] Bytes; public Rectangle Bounds; public int Width, Height; public long At; }
    class ControlInfo { public string Name, Kind; public System.Windows.Rect Bounds; public bool Password; public POINT Point; public long At; }
    class Request { public Snapshot Image; public ControlInfo Control; public POINT Point; public string Button, Reason; public long At; }
    static readonly object OutputLock = new object(), ImageLock = new object();
    static readonly Dictionary<string, Snapshot> Images = new Dictionary<string, Snapshot>();
    static readonly BlockingCollection<Request> Queue = new BlockingCollection<Request>(160);
    static readonly AutoResetEvent QueryNow = new AutoResetEvent(false), ControlReady = new AutoResetEvent(false);
    static readonly ManualResetEvent Done = new ManualResetEvent(false);
    static readonly HookProc Callback = MouseHook;
    static volatile ControlInfo LatestControl;
    static volatile bool Stopping;
    static string SelectedScreen;
    static POINT QueryPoint;
    static IntPtr Hook;
    static long Now() { return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); }
    static void Emit(object value) {
        var serializer = new JavaScriptSerializer { MaxJsonLength = 12000000 };
        lock(OutputLock) { Console.WriteLine(serializer.Serialize(value)); Console.Out.Flush(); }
    }
    static bool Contains(Rectangle r, POINT p) { return p.X >= r.Left && p.X < r.Right && p.Y >= r.Top && p.Y < r.Bottom; }
    static double Clamp(double n) { return Math.Max(0, Math.Min(1, n)); }
    static void Stop() { Stopping = true; Done.Set(); QueryNow.Set(); Application.Exit(); }

    [STAThread] static int Main(string[] args) {
        Console.OutputEncoding = new UTF8Encoding(false);
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { SetProcessDPIAware(); }
        try {
            if (args.Length == 2) {
                int x = int.Parse(args[0]), y = int.Parse(args[1]);
                SelectedScreen = Screen.FromPoint(new Point(x,y)).DeviceName;
            } else if (args.Length != 1 || args[0] != "all") throw new Exception("Monitor invalido.");
            Application.EnableVisualStyles();
            var images = new Thread(ImageLoop) { IsBackground = true }; images.Start();
            var controls = new Thread(ControlLoop) { IsBackground = true }; controls.SetApartmentState(ApartmentState.MTA); controls.Start();
            var writer = new Thread(WriteLoop) { IsBackground = true }; writer.Start();
            var input = new Thread(delegate() {
                try { string line; while ((line = Console.ReadLine()) != null) { if (line == "stop") break; if (line == "capture") { POINT p; GetCursorPos(out p); Enqueue(p, "none", "manual"); } } } catch { }
                Stop();
            }) { IsBackground = true }; input.Start();
            // At least one valid image must exist before recording is declared ready.
            long deadline = Now() + 8000;
            while (!Stopping && Now() < deadline) { lock(ImageLock) { if (Images.Count > 0) break; } Thread.Sleep(30); }
            lock(ImageLock) { if (Images.Count == 0) throw new Exception("O Windows nao forneceu uma imagem da tela."); }
            Hook = SetWindowsHookEx(14, Callback, GetModuleHandle(null), 0);
            if (Hook == IntPtr.Zero) throw new Exception("Nao foi possivel instalar o observador de cliques: " + Marshal.GetLastWin32Error());
            Emit(new { type="ready", atMs=Now() });
            if (!Stopping) Application.Run();
            Stopping = true; Queue.CompleteAdding(); writer.Join(5000);
            return 0;
        } catch(Exception e) { Emit(new { type="error", message=e.Message }); return 1; }
        finally { Stopping = true; Done.Set(); if (Hook != IntPtr.Zero) UnhookWindowsHookEx(Hook); }
    }
    static IntPtr MouseHook(int code, IntPtr message, IntPtr data) {
        if (code >= 0 && !Stopping && (message.ToInt32() == 0x201 || message.ToInt32() == 0x204)) {
            var mouse = (MouseData)Marshal.PtrToStructure(data, typeof(MouseData));
            Enqueue(mouse.pt, message.ToInt32() == 0x204 ? "right" : "left", "click");
        }
        return CallNextHookEx(Hook, code, message, data);
    }
    static void Enqueue(POINT point, string button, string reason) {
        if (Stopping) return;
        var screen = Screen.FromPoint(new Point(point.X, point.Y));
        if (SelectedScreen != null && screen.DeviceName != SelectedScreen) return;
        Snapshot snapshot;
        lock(ImageLock) { if (!Images.TryGetValue(screen.DeviceName, out snapshot)) return; }
        long at = Now();
        // Query UIA on another thread, while bounding the delay in the mouse hook to 35 ms.
        var control = LatestControl;
        if (!Matches(control, point, at)) {
            QueryPoint = point; ControlReady.Reset(); QueryNow.Set(); ControlReady.WaitOne(35);
            control = LatestControl;
        }
        if (!Matches(control, point, at)) control = null;
        if (at - snapshot.At > 1500) { Emit(new { type="warning", message="Imagem da tela desatualizada; este clique nao foi registrado." }); return; }
        if (!Queue.TryAdd(new Request { Image=snapshot, Control=control, Point=point, Button=button, Reason=reason, At=at })) Emit(new { type="error", message="Fila de cliques cheia. Encerre e divida a demonstracao." });
    }
    static bool Matches(ControlInfo c, POINT p, long at) {
        return c != null && at - c.At < 250 && Math.Abs(c.Point.X-p.X) <= 5 && Math.Abs(c.Point.Y-p.Y) <= 5 && c.Bounds.Contains(new System.Windows.Point(p.X,p.Y));
    }
    static void ControlLoop() {
        while (!Stopping) {
            try {
                bool requested = QueryNow.WaitOne(70);
                POINT point; if (requested) point = QueryPoint; else GetCursorPos(out point);
                var element = AutomationElement.FromPoint(new System.Windows.Point(point.X,point.Y));
                ControlInfo candidate = null;
                for (int i=0; element != null && i<8; i++) {
                    var c = element.Current;
                    var kind = c.ControlType.ProgrammaticName.Replace("ControlType.", "");
                    var rect = c.BoundingRectangle;
                    var monitor = Screen.FromPoint(new Point(point.X,point.Y)).Bounds;
                    bool valid = !rect.IsEmpty && rect.Width >= 4 && rect.Height >= 4 && rect.Width*rect.Height < monitor.Width*(double)monitor.Height*.65 && rect.Contains(new System.Windows.Point(point.X,point.Y));
                    if (valid && candidate == null) candidate = new ControlInfo { Name=c.IsPassword ? "Campo protegido" : c.Name, Kind=kind, Bounds=rect, Password=c.IsPassword, Point=point, At=Now() };
                    if (valid && new [] { "Button","MenuItem","Hyperlink","Edit","ComboBox","CheckBox","RadioButton","TabItem","ListItem","TreeItem" }.Contains(kind)) {
                        candidate = new ControlInfo { Name=c.IsPassword ? "Campo protegido" : c.Name, Kind=kind, Bounds=rect, Password=c.IsPassword, Point=point, At=Now() }; break;
                    }
                    element = TreeWalker.ControlViewWalker.GetParent(element);
                }
                LatestControl = candidate; ControlReady.Set();
            } catch { LatestControl = null; ControlReady.Set(); }
        }
    }
    static void ImageLoop() {
        var encoder = ImageCodecInfo.GetImageEncoders().First(c => c.MimeType == "image/jpeg");
        while (!Stopping) {
            foreach(var s in Screen.AllScreens) {
                if (SelectedScreen != null && s.DeviceName != SelectedScreen) continue;
                try {
                    var b = s.Bounds; long capturedAt = Now();
                    using(var full = new Bitmap(b.Width,b.Height)) {
                        using(var g = Graphics.FromImage(full)) g.CopyFromScreen(b.X,b.Y,0,0,b.Size,CopyPixelOperation.SourceCopy);
                        double scale = Math.Min(1,1600.0/Math.Max(b.Width,b.Height));
                        int w = Math.Max(1,(int)(b.Width*scale)), h = Math.Max(1,(int)(b.Height*scale));
                        using(var resized = new Bitmap(w,h)) using(var g = Graphics.FromImage(resized)) using(var stream = new MemoryStream()) using(var quality = new EncoderParameters(1)) {
                            g.InterpolationMode=InterpolationMode.HighQualityBilinear; g.DrawImage(full,0,0,w,h);
                            quality.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,85L);
                            resized.Save(stream,encoder,quality);
                            var image = new Snapshot { Bytes=stream.ToArray(), Bounds=b, Width=w, Height=h, At=capturedAt };
                            lock(ImageLock) Images[s.DeviceName]=image;
                        }
                    }
                } catch { /* A secure desktop or unavailable monitor must not become a fabricated image. */ }
            }
            Done.WaitOne(140);
        }
    }
    static void WriteLoop() {
        int count=0;
        while (!Queue.IsCompleted) {
            Request r; if (!Queue.TryTake(out r,100)) continue;
            if (count >= 120) { if (count++ == 120) Emit(new { type="warning", message="Limite de 120 capturas atingido. Encerre esta sessao para continuar em outra." }); continue; }
            count++;
            var b=r.Image.Bounds; var c=r.Control;
            double left=c == null ? r.Point.X-65 : c.Bounds.Left, top=c == null ? r.Point.Y-24 : c.Bounds.Top;
            double right=c == null ? r.Point.X+65 : c.Bounds.Right, bottom=c == null ? r.Point.Y+24 : c.Bounds.Bottom;
            double x=Clamp((left-b.X)/b.Width), y=Clamp((top-b.Y)/b.Height), ex=Clamp((right-b.X)/b.Width), ey=Clamp((bottom-b.Y)/b.Height);
            Emit(new { type="frame", atMs=r.At, capturedAtMs=r.Image.At, image="data:image/jpeg;base64,"+Convert.ToBase64String(r.Image.Bytes), width=r.Image.Width, height=r.Image.Height,
                cursor=new { x=Clamp((r.Point.X-b.X)/(double)b.Width), y=Clamp((r.Point.Y-b.Y)/(double)b.Height) },
                target=new { x=x,y=y,width=Math.Max(.001,ex-x),height=Math.Max(.001,ey-y) },
                action=new { reason=r.Reason, button=r.Button, controlName=c == null ? "" : (c.Name ?? "").Substring(0,Math.Min(300,(c.Name ?? "").Length)), controlType=c == null ? "" : c.Kind, detection=c == null ? "point" : "uia" },
                screen=new { x=b.X,y=b.Y,width=b.Width,height=b.Height } });
        }
    }
}
