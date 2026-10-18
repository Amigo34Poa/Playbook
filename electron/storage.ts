import { app, safeStorage } from 'electron';
import { mkdir, readFile, rename, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { workspaceSchema, markStyleSchema } from '../shared/schema.js';
import { z } from 'zod';
import type { OnlineConfig, Settings, Workspace } from '../shared/types.js';

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
export const onlineConfigSchema = z.object({
  textModel: z.enum(['gpt-4.1-mini', 'gpt-4.1']), markStyle: markStyleSchema,
  markColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  apiKey: z.string().trim().min(10).max(512).optional(), removeKey: z.boolean().optional(),
});
const storedSchema = onlineConfigSchema.omit({ apiKey: true, removeKey: true }).extend({ encryptedKey: z.string().max(4096).optional() });
export async function readSettings() {
  try { return storedSchema.parse(JSON.parse(await readFile(file('online-settings.json'), 'utf8'))); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Não foi possível ler as configurações online. O arquivo foi preservado.');
    return { textModel: 'gpt-4.1-mini' as const, markStyle: 'smart' as const, markColor: '#f59e0b', encryptedKey: undefined }; }
}
export async function getApiKey(): Promise<string> {
  const s = await readSettings();
  if (!s.encryptedKey) throw new Error('Configure sua chave da OpenAI nas configurações.');
  try { return safeStorage.decryptString(Buffer.from(s.encryptedKey, 'base64')); }
  catch { throw new Error('O Windows não conseguiu desbloquear a chave. Configure-a novamente nesta conta.'); }
}
export async function getSettings(): Promise<Settings> {
  const { encryptedKey, ...s } = await readSettings();
  return { ...s, configured: Boolean(encryptedKey) };
}
export async function configure(input: OnlineConfig): Promise<Settings> {
  const { apiKey, removeKey, ...s } = onlineConfigSchema.parse(input);
  let { encryptedKey } = await readSettings();
  if (removeKey) encryptedKey = undefined;
  if (apiKey) {
    if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) throw new Error('Armazenamento seguro indisponível. Configure a chave no aplicativo Windows.');
    encryptedKey = safeStorage.encryptString(apiKey).toString('base64');
  }
  await atomicWrite('online-settings.json', JSON.stringify({ ...s, encryptedKey }));
  return getSettings();
}
