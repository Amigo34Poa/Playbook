import { BrowserWindow, dialog, app } from 'electron';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { extractReference } from './import-reference.js';
import { buildDocx, printHtml } from './document-format.js';
import type { ExportDocument, Reference } from '../shared/types.js';

export async function importReferences(parent: BrowserWindow): Promise<Reference[]> {
  const result = await dialog.showOpenDialog(parent, { title: 'Importar documentos de referência', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Documentos', extensions: ['pdf', 'docx', 'txt', 'md'] }] });
  if (result.canceled) return [];
  if (result.filePaths.length > 10) throw new Error('Importe até 10 arquivos por vez.');
  return Promise.all(result.filePaths.map(extractReference));
}
export async function pdfBuffer(document: ExportDocument): Promise<Buffer> {
  const dir = await mkdtemp(path.join(app.getPath('temp'), 'playbook-export-'));
  const file = path.join(dir, 'document.html');
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await writeFile(file, printHtml(document));
    await window.loadFile(file);
    await window.webContents.executeJavaScript('Promise.all(Array.from(document.images, img => img.decode()))');
    return await window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  } finally { window.destroy(); await rm(dir, { recursive: true, force: true }); }
}
export async function exportDocument(parent: BrowserWindow, document: ExportDocument, format: 'pdf' | 'docx'): Promise<boolean> {
  if (!document.steps.length) throw new Error('Adicione pelo menos uma etapa antes de exportar.');
  const name = document.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').slice(0, 100).trim() || 'Procedimento';
  const result = await dialog.showSaveDialog(parent, { title: 'Exportar procedimento', defaultPath: `${name}.${format}`, filters: [{ name: format === 'pdf' ? 'Documento PDF' : 'Documento Word', extensions: [format] }] });
  if (result.canceled || !result.filePath) return false;
  const data = format === 'pdf' ? await pdfBuffer(document) : await buildDocx(document);
  await writeFile(result.filePath, data);
  return true;
}
