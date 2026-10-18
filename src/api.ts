import type { StudioAPI } from '../shared/types';

declare global { interface Window { studio?: StudioAPI } }
export const desktop = Boolean(window.studio);
const desktopOnly = async (): Promise<never> => { throw new Error('Este recurso está disponível no aplicativo desktop para Windows.'); };
// A visualização no navegador permite editar texto; não simula captura ou IA.
const browser: StudioAPI = {
  load: async () => JSON.parse(localStorage.getItem('playbook-preview') ?? '{"company":"Empresa confidencial","procedures":[]}'),
  save: async data => { localStorage.setItem('playbook-preview', JSON.stringify(data)); },
  settings: async () => ({ configured: false, textModel: 'gpt-4.1-mini', markStyle: 'smart', markColor: '#f59e0b' }),
  configure: desktopOnly, openFolder: desktopOnly, testConnection: desktopOnly, displays: desktopOnly,
  startCapture: desktopOnly, captureNow: desktopOnly, stopCapture: desktopOnly,
  onFrame: () => () => {}, onCaptureStatus: () => () => {}, transcribe: desktopOnly,
  generate: desktopOnly, review: desktopOnly, importReferences: desktopOnly, exportDocument: desktopOnly,
};
export const api = window.studio ?? browser;
