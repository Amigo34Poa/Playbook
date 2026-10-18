import { app } from 'electron';
import { mkdir, readFile, rename, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { workspaceSchema } from '../shared/schema.js';
import { z } from 'zod';
import type { EngineConfig, Settings, Workspace } from '../shared/types.js';

const file = (name: string) => path.join(app.getPath('userData'), name);
export async function atomicWrite(name: string, data: string): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(file(`${name}.tmp`), data, { mode: 0o600 });
  await rename(file(`${name}.tmp`), file(name));
}
export async function loadWorkspace(): Promise<Workspace> {
  try { return workspaceSchema.parse(JSON.parse(await readFile(file('workspace.json'), 'utf8'))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { company: 'Empresa confidencial', procedures: [] };
    throw new Error('Não foi possível ler os documentos locais. O arquivo original foi preservado. Verifique workspace.json na pasta de dados do aplicativo.');
  }
}
let saving: Promise<void> = Promise.resolve();
export function saveWorkspace(input: unknown): Promise<void> {
  const workspace = workspaceSchema.parse(input);
  const data = JSON.stringify(workspace);
  if (Buffer.byteLength(data) > 250 * 1024 * 1024) throw new Error('A biblioteca ultrapassou 250 MB. Remova capturas desnecessárias antes de salvar.');
  saving = saving.catch(() => {}).then(async () => {
    try { await copyFile(file('workspace.json'), file('workspace.backup.json')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await atomicWrite('workspace.json', data);
  });
  return saving;
}
export const engineConfigSchema = z.object({ whisperExecutable: z.string().max(4096), whisperModel: z.string().max(4096), llamaExecutable: z.string().max(4096), llamaModel: z.string().max(4096), threads: z.number().int().min(1).max(16) });
export async function readSettings(): Promise<EngineConfig> {
  try { return engineConfigSchema.parse(JSON.parse(await readFile(file('settings.json'), 'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { whisperExecutable: '', whisperModel: '', llamaExecutable: '', llamaModel: '', threads: 4 }; throw error; }
}
export async function getSettings(): Promise<Settings> {
  const settings = await readSettings();
  return { ...settings, configured: Boolean(settings.whisperExecutable && settings.whisperModel && settings.llamaExecutable && settings.llamaModel), running: false };
}
export async function configure(input: EngineConfig): Promise<Settings> {
  const settings = engineConfigSchema.parse(input);
  await atomicWrite('settings.json', JSON.stringify(settings));
  return getSettings();
}
