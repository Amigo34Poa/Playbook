import { app } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { frameSchema } from '../shared/schema.js';
import type { Frame } from '../shared/types.js';

export class WindowsRecorder {
  private child?: ChildProcessWithoutNullStreams;
  private closed?: Promise<void>;
  private stopping = false;
  constructor(private frame: (frame: Frame) => void, private notice: (message: string) => void, private ended: () => void) {}
  async start(args: string[]) {
    const executable = app.isPackaged ? path.join(process.resourcesPath, 'native', 'ClickRecorder.exe') : path.join(app.getAppPath(), 'native/windows/build/ClickRecorder.exe');
    const child = spawn(executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child; this.stopping = false;
    this.closed = new Promise(resolve => child.once('close', () => { this.child = undefined; resolve(); if (!this.stopping) this.ended(); }));
    let buffer = '', started = 0, count = 0;
    child.stderr.resume(); child.stdin.on('error', () => {});
    await new Promise<void>((resolve, reject) => {
      const fail = (message: string) => { clearTimeout(timeout); reject(new Error(message)); if (started) { this.notice(message); void this.stop(); this.ended(); } };
      const timeout = setTimeout(() => { fail('O gravador do Windows não iniciou. Reinstale o aplicativo ou confira as permissões de captura.'); child.kill(); }, 12000);
      child.once('error', () => fail('Gravador nativo indisponível. Reinstale o aplicativo Windows.'));
      child.once('close', code => { clearTimeout(timeout); if (!started) reject(new Error('O gravador nativo encerrou antes de iniciar.')); else if (code && !this.stopping) this.notice('O gravador nativo encerrou inesperadamente.'); });
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        buffer += chunk;
        if (buffer.length > 12_000_000) { fail('Mensagem do gravador excedeu o limite.'); child.kill(); return; }
        let end: number;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end).replace(/^\uFEFF/, ''); buffer = buffer.slice(end + 1);
          try {
            const message = JSON.parse(line);
            if (message.type === 'ready' && !started && Number.isFinite(message.atMs)) { started = message.atMs; clearTimeout(timeout); resolve(); }
            else if (message.type === 'frame' && started && count < 120) {
              const parsed = frameSchema.parse({ ...message, id: randomUUID(), at: Math.max(0, (message.atMs - started) / 1000) });
              count++; this.frame(parsed);
            } else if (message.type === 'warning') this.notice(String(message.message).slice(0, 500));
            else if (message.type === 'error') fail('O Windows não conseguiu continuar a captura. Confira as permissões e tente novamente.');
          } catch { fail('O gravador retornou uma captura inválida.'); child.kill(); }
        }
      });
    });
  }
  capture() { this.child?.stdin.write('capture\n'); }
  async stop() {
    this.stopping = true;
    const child = this.child; if (!child) return;
    child.stdin.end('stop\n');
    const timeout = setTimeout(() => child.kill(), 6000);
    await this.closed; clearTimeout(timeout);
  }
}
