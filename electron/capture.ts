import { BrowserWindow, desktopCapturer, globalShortcut, screen } from 'electron';
import { randomUUID } from 'node:crypto';
import { WindowsRecorder } from './windows-recorder.js';
import type { Frame } from '../shared/types.js';

export class CaptureSession {
  private active = false;
  private started = 0;
  private displayId = '';
  private sourceId = '';
  private busy?: Promise<void>;
  private finishing?: Promise<void>;
  private count = 0;
  private native?: WindowsRecorder;
  constructor(private window: BrowserWindow) {}
  private status(active: boolean, message?: string) { if (!this.window.isDestroyed()) this.window.webContents.send('capture:status', { active, count: this.count, message }); }
  private frame(frame: Frame) { this.count++; if (!this.window.isDestroyed()) this.window.webContents.send('capture:frame', frame); this.status(true); }
  async start(id: string) {
    if (this.active || this.finishing) throw new Error('Uma gravação já está em andamento.');
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
    const source = id === 'all' ? sources[0] : sources.find(s => s.id === id);
    const display = screen.getAllDisplays().find(d => String(d.id) === source?.display_id);
    if (!source || !display) throw new Error('Monitor indisponível. Selecione a tela novamente.');
    this.displayId = source.display_id; this.sourceId = source.id; this.count = 0;
    this.active = true; this.window.minimize();
    try {
      if (process.platform === 'win32') {
        const p = screen.dipToScreenPoint({ x: display.bounds.x + Math.floor(display.bounds.width / 2), y: display.bounds.y + Math.floor(display.bounds.height / 2) });
        this.native = new WindowsRecorder(f => this.frame(f), m => this.status(true, m), () => { void this.stop(); });
        await this.native.start(id === 'all' ? ['all'] : [String(p.x), String(p.y)]);
      }
      this.started = Date.now();
      const manual = globalShortcut.register('CommandOrControl+Shift+Space', () => { void this.capture().catch(e => this.stop(e.message)); });
      const stop = globalShortcut.register('CommandOrControl+Shift+Enter', () => { void this.stop(); });
      this.status(true, !manual || !stop ? 'Um atalho está ocupado. Use os controles da janela para encerrar.' : process.platform !== 'win32' ? 'Captura automática por clique disponível no Windows. Use a captura manual neste sistema.' : undefined);
    } catch (e) { await this.stop(); throw e; }
  }
  async capture() {
    if (!this.active || this.busy || this.count >= 120) return;
    if (this.native) { this.native.capture(); return; }
    this.busy = this.manual();
    try { await this.busy; } finally { this.busy = undefined; }
  }
  private async manual() {
    const display = screen.getAllDisplays().find(d => String(d.id) === this.displayId);
    if (!display) throw new Error('O monitor foi desconectado.');
    const point = screen.getCursorScreenPoint(); const { x, y, width, height } = display.bounds;
    if (point.x < x || point.x >= x + width || point.y < y || point.y >= y + height) return;
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1600, height: 1600 } });
    const source = sources.find(s => s.id === this.sourceId);
    if (!source || source.thumbnail.isEmpty()) throw new Error('O sistema não forneceu a imagem do monitor.');
    const size = source.thumbnail.getSize();
    this.frame({ id: randomUUID(), at: (Date.now() - this.started) / 1000, image: `data:image/jpeg;base64,${source.thumbnail.toJPEG(85).toString('base64')}`, cursor: { x: (point.x-x)/width, y: (point.y-y)/height }, width: size.width, height: size.height, action: { reason: 'manual', button: 'none', controlName: '', controlType: '', detection: 'point' } });
  }
  async stop(message?: string): Promise<void> {
    if (this.finishing) return this.finishing;
    if (!this.active) return;
    this.finishing = (async () => {
      await this.native?.stop(); await this.busy;
      this.native = undefined; this.active = false;
      globalShortcut.unregister('CommandOrControl+Shift+Space'); globalShortcut.unregister('CommandOrControl+Shift+Enter');
      this.status(false, message);
      if (!this.window.isDestroyed()) { this.window.restore(); this.window.focus(); }
    })();
    try { await this.finishing; } finally { this.finishing = undefined; }
  }
}
