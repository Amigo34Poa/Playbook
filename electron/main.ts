import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, session, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { CaptureSession } from './capture.js';
import { configure, getSettings, loadWorkspace, saveWorkspace } from './storage.js';
import { generate, review, testConnection, transcribe } from './ai.js';
import { exportDocument, importReferences } from './documents.js';
import { frameSchema, procedureSchema, stepSchema } from '../shared/schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let window: BrowserWindow;
let capture: CaptureSession;
let closing = false;
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
app.on('second-instance', () => { if (window && !window.isDestroyed()) { window.restore(); window.focus(); } });

function register(channel: string, handler: (...args: any[]) => unknown) {
  ipcMain.handle(channel, (event, ...args) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Origem não autorizada.');
    return handler(...args);
  });
}

app.whenReady().then(async () => {
  if (!hasInstanceLock) return;
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(contents === window?.webContents && details.isMainFrame && permission === 'media' && 'mediaTypes' in details && Boolean(details.mediaTypes?.length) && Boolean(details.mediaTypes?.every(type => type === 'audio'))));
  window = new BrowserWindow({ width: 1440, height: 960, minWidth: 1020, minHeight: 720, backgroundColor: '#f5f7f6', title: 'Playbook Studio', autoHideMenuBar: true,
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  capture = new CaptureSession(window);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('close', event => {
    if (closing) return;
    event.preventDefault();
    void dialog.showMessageBox(window, { type: 'question', title: 'Fechar Playbook Studio', message: 'Deseja fechar o aplicativo?', detail: 'Se houver uma gravação ou processamento em andamento, conclua e aguarde a indicação “Salvo neste computador” antes de sair.', buttons: ['Continuar trabalhando', 'Fechar'], defaultId: 0, cancelId: 0 }).then(result => {
      if (result.response === 1) { closing = true; void capture.stop().finally(() => window.close()); }
    });
  });
  register('workspace:load', loadWorkspace);
  register('workspace:save', saveWorkspace);
  register('settings:get', getSettings);
  register('settings:configure', configure);
  register('settings:open-folder', async kind => {
    z.enum(['resources', 'data']).parse(kind);
    const target = kind === 'data' ? app.getPath('userData') : app.isPackaged ? process.resourcesPath : app.getAppPath();
    const error = await shell.openPath(target); if (error) throw new Error('Não foi possível abrir a pasta no explorador de arquivos.');
  });
  register('ai:test', testConnection);
  register('capture:displays', async () => { const screens = (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 420, height: 260 } })).map(s => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() })); return process.platform === 'win32' && screens.length ? [{ id: 'all', name: 'Todos os monitores · acompanhar cliques', thumbnail: screens[0].thumbnail }, ...screens] : screens; });
  register('capture:start', id => capture.start(z.string().parse(id)));
  register('capture:now', () => capture.capture());
  register('capture:stop', () => capture.stop());
  register('ai:transcribe', (audio, mime, start, end) => {
    if (!(audio instanceof ArrayBuffer)) throw new Error('Áudio inválido.');
    return transcribe(audio, z.literal('audio/wav').parse(mime), z.number().nonnegative().parse(start), z.number().nonnegative().parse(end));
  });
  register('ai:generate', p => generate(procedureSchema.parse(p)));
  register('ai:review', p => review(procedureSchema.parse(p)));
  register('documents:import', () => importReferences(window));
  register('documents:export', (p, format) => exportDocument(window, z.object({ title: z.string().max(500), role: z.string().max(500), category: z.string().max(500), objective: z.string().max(30000), steps: z.array(stepSchema).max(500), frames: z.array(frameSchema).max(300) }).parse(p), z.enum(['pdf', 'docx']).parse(format)));
  if (process.env.VITE_DEV_SERVER_URL === 'http://127.0.0.1:5173') await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else await window.loadFile(path.join(here, '../../dist/index.html'));
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { void capture?.stop(); });
