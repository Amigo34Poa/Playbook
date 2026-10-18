import { BrowserWindow, desktopCapturer, globalShortcut, screen } from 'electron';
import { randomUUID } from 'node:crypto';
import type { Frame } from '../shared/types.js';

export class CaptureSession {
  private timer?: ReturnType<typeof setInterval>;
  private started = 0;
  private displayId = '';
  private sourceId = '';
  private lastMoved = 0;
  private lastCaptured = 0;
  private lastPoint = { x: -99999, y: -99999 };
  private moved = true;
  private busy = false;
  private count = 0;
  constructor(private window: BrowserWindow) {}

  async start(id: string) {
    if (this.timer) throw new Error('Uma gravação já está em andamento.');
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
    const source = sources.find(s => s.id === id);
    if (!source || !screen.getAllDisplays().some(d => String(d.id) === source.display_id)) throw new Error('Monitor indisponível. Selecione a tela novamente.');
    this.displayId = source.display_id; this.sourceId = id;
    this.started = Date.now(); this.count = 0; this.lastCaptured = 0; this.lastMoved = Date.now(); this.moved = true;
    this.window.minimize();
    this.timer = setInterval(() => {
      const point = screen.getCursorScreenPoint();
      if (Math.hypot(point.x - this.lastPoint.x, point.y - this.lastPoint.y) > 5) {
        this.lastPoint = point; this.lastMoved = Date.now(); this.moved = true;
      }
      if (this.moved && Date.now() - this.lastMoved > 900 && Date.now() - this.lastCaptured > 2500) {
        void this.capture().catch(e => this.stop(e instanceof Error ? e.message : 'Falha na captura.'));
      }
    }, 300);
    globalShortcut.register('CommandOrControl+Shift+Space', () => { void this.capture().catch(e => this.stop(e.message)); });
    globalShortcut.register('CommandOrControl+Shift+Enter', () => this.stop());
    this.window.webContents.send('capture:status', { active: true, count: 0 });
  }
  async capture() {
    if (!this.timer || this.busy) return;
    if (this.count >= 120) { this.window.webContents.send('capture:status', { active: true, count: this.count, message: 'Limite de 120 capturas atingido. O áudio continua sendo gravado.' }); return; }
    const display = screen.getAllDisplays().find(d => String(d.id) === this.displayId);
    if (!display) throw new Error('O monitor foi desconectado. A gravação foi encerrada.');
    const point = screen.getCursorScreenPoint();
    const { x, y, width, height } = display.bounds;
    if (point.x < x || point.x >= x + width || point.y < y || point.y >= y + height) return;
    this.busy = true;
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1600, height: 1600 } });
      if (!this.timer) return;
      const source = sources.find(s => s.id === this.sourceId);
      if (!source || source.thumbnail.isEmpty()) throw new Error('O sistema não forneceu a imagem do monitor.');
      const size = source.thumbnail.getSize();
      const frame: Frame = { id: randomUUID(), at: (Date.now() - this.started) / 1000, image: `data:image/jpeg;base64,${source.thumbnail.toJPEG(85).toString('base64')}`, cursor: { x: (point.x - x) / width, y: (point.y - y) / height }, width: size.width, height: size.height };
      this.count++; this.lastCaptured = Date.now(); this.moved = false;
      this.window.webContents.send('capture:frame', frame);
      this.window.webContents.send('capture:status', { active: true, count: this.count });
    } finally { this.busy = false; }
  }
  stop(message?: string) {
    if (!this.timer) return;
    clearInterval(this.timer); this.timer = undefined;
    globalShortcut.unregister('CommandOrControl+Shift+Space');
    globalShortcut.unregister('CommandOrControl+Shift+Enter');
    if (!this.window.isDestroyed()) {
      this.window.webContents.send('capture:status', { active: false, count: this.count, message });
      this.window.restore(); this.window.focus();
    }
  }
}
