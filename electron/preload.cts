import { contextBridge, ipcRenderer } from 'electron';
import type { CaptureStatus, Frame, Procedure, StudioAPI, Workspace, ExportDocument, EngineConfig } from '../shared/types.js';

const api: StudioAPI = {
  load: () => ipcRenderer.invoke('workspace:load'),
  save: (workspace: Workspace) => ipcRenderer.invoke('workspace:save', workspace),
  settings: () => ipcRenderer.invoke('settings:get'),
  configure: (config: EngineConfig) => ipcRenderer.invoke('settings:configure', config),
  chooseEngineFile: (kind) => ipcRenderer.invoke('settings:choose-file', kind),
  openFolder: kind => ipcRenderer.invoke('settings:open-folder', kind),
  testConnection: () => ipcRenderer.invoke('ai:test'),
  displays: () => ipcRenderer.invoke('capture:displays'),
  startCapture: (id: string) => ipcRenderer.invoke('capture:start', id),
  captureNow: () => ipcRenderer.invoke('capture:now'),
  stopCapture: () => ipcRenderer.invoke('capture:stop'),
  onFrame: (callback: (frame: Frame) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, frame: Frame) => callback(frame);
    ipcRenderer.on('capture:frame', listener);
    return () => ipcRenderer.removeListener('capture:frame', listener);
  },
  onCaptureStatus: (callback: (status: CaptureStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: CaptureStatus) => callback(status);
    ipcRenderer.on('capture:status', listener);
    return () => ipcRenderer.removeListener('capture:status', listener);
  },
  transcribe: (audio: ArrayBuffer, mime: string, start: number, end: number) => ipcRenderer.invoke('ai:transcribe', audio, mime, start, end),
  generate: (procedure: Procedure) => ipcRenderer.invoke('ai:generate', procedure),
  review: (procedure: Procedure) => ipcRenderer.invoke('ai:review', procedure),
  importReferences: () => ipcRenderer.invoke('documents:import'),
  exportDocument: (procedure: ExportDocument, format: 'pdf' | 'docx') => ipcRenderer.invoke('documents:export', procedure, format),
};
contextBridge.exposeInMainWorld('studio', api);
