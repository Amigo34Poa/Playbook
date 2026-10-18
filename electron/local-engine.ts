import { spawn, type ChildProcess } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { app } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { readSettings } from './storage.js';
import type { Transcript } from '../shared/types.js';

let server: ChildProcess | undefined;
let starting: Promise<void> | undefined;
let port = 0;
let serverError = '';
const voiceWorkers = new Set<ChildProcess>();
const token = randomBytes(32).toString('hex');
export function engineRunning() { return Boolean(server && !server.killed && server.exitCode === null && port); }
export function stopEngine() { server?.kill(); server = undefined; port = 0; for (const worker of voiceWorkers) worker.kill(); }
async function requireFile(file: string, label: string, executable = false) {
  if (!file || !path.isAbsolute(file)) throw new Error(`Selecione ${label} nas configurações da IA local.`);
  try { await access(file, executable && process.platform !== 'win32' ? constants.X_OK : constants.R_OK); }
  catch { throw new Error(`Não foi possível acessar ${label}. Selecione o arquivo novamente.`); }
}
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer(); s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const address = s.address(); if (address && typeof address !== 'string') { const p = address.port; s.close(() => resolve(p)); } else { s.close(); reject(new Error('Não foi possível reservar uma porta local.')); } });
  });
}
async function start() {
  const cfg = await readSettings();
  await requireFile(cfg.llamaExecutable, 'o executável llama-server', true);
  await requireFile(cfg.llamaModel, 'o modelo de texto GGUF');
  const selectedPort = await freePort();
  serverError = '';
  const child = spawn(cfg.llamaExecutable, ['-m', cfg.llamaModel, '--host', '127.0.0.1', '--port', String(selectedPort), '--api-key', token, '-c', '16384', '-t', String(cfg.threads), '-ngl', '0'], { windowsHide: true, cwd: path.dirname(cfg.llamaExecutable), stdio: ['ignore', 'ignore', 'pipe'] });
  server = child;
  child.stderr?.on('data', data => { serverError = (serverError + String(data)).slice(-3000); });
  let failure = '';
  child.on('error', () => { failure = 'Não foi possível iniciar o motor de texto. Confira o executável e as DLLs da mesma distribuição.'; });
  child.on('exit', () => { if (server === child) { port = 0; server = undefined; } });
  try {
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      if (failure) throw new Error(failure);
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`O motor de texto encerrou ao carregar o modelo. Verifique RAM, modelo e DLLs. ${serverError.replaceAll(token, '[redigido]').slice(-700)}`);
      try { const response = await fetch(`http://127.0.0.1:${selectedPort}/health`, { signal: AbortSignal.timeout(1500) }); if (response.ok) { port = selectedPort; return; } } catch { /* Modelo ainda carregando. */ }
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    throw new Error('O modelo de texto não carregou em 3 minutos. Verifique memória disponível e compatibilidade do modelo GGUF.');
  } catch (e) { child.kill(); throw e; }
}
export async function ensureEngine() {
  if (engineRunning()) return;
  if (!starting) starting = start().finally(() => { starting = undefined; });
  await starting;
}
export async function localChat(body: unknown): Promise<unknown> {
  await ensureEngine();
  const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(600000) });
  if (!response.ok) throw new Error(`O motor local retornou erro ${response.status}. Reduza o conteúdo ou verifique o modelo.`);
  return response.json();
}
let transcribing: Promise<unknown> = Promise.resolve();
export async function transcribeLocal(audio: ArrayBuffer, start: number, end: number): Promise<Transcript[]> {
  if (audio.byteLength < 44 || audio.byteLength > 24 * 1024 * 1024) throw new Error('Trecho de áudio WAV inválido ou muito grande.');
  const recoveryDir = path.join(app.getPath('userData'), 'audio-recovery');
  await mkdir(recoveryDir, { recursive: true });
  const recoveryId = `${Date.now()}-${randomUUID()}`;
  const recoveryFile = path.join(recoveryDir, `${recoveryId}.wav`);
  await writeFile(recoveryFile, Buffer.from(audio));
  await writeFile(path.join(recoveryDir, `${recoveryId}.json`), JSON.stringify({ start, end, recordedAt: new Date().toISOString() }));
  const operation = transcribing.catch(() => {}).then(async () => {
    const cfg = await readSettings();
    await requireFile(cfg.whisperExecutable, 'o executável whisper-cli', true); await requireFile(cfg.whisperModel, 'o modelo de voz multilíngue');
    const dir = await mkdtemp(path.join(os.tmpdir(), 'playbook-audio-'));
    try {
      const wav = path.join(dir, 'audio.wav'); const out = path.join(dir, 'transcript');
      await writeFile(wav, Buffer.from(audio));
      await new Promise<void>((resolve, reject) => {
        const child = spawn(cfg.whisperExecutable, ['-m', cfg.whisperModel, '-f', wav, '-l', 'pt', '-oj', '-of', out, '-t', String(cfg.threads), '-ng'], { cwd: path.dirname(cfg.whisperExecutable), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
        voiceWorkers.add(child);
        let stderr = '';
        child.stderr?.on('data', data => { stderr = (stderr + String(data)).slice(-1000); });
        const timeout = setTimeout(() => { child.kill(); reject(new Error('A transcrição levou mais de 10 minutos. Use um modelo de voz menor.')); }, 600000);
        child.on('error', () => { voiceWorkers.delete(child); clearTimeout(timeout); reject(new Error('Não foi possível iniciar whisper-cli. Confira o executável e as DLLs da distribuição.')); });
        child.on('exit', code => { voiceWorkers.delete(child); clearTimeout(timeout); if (code === 0) resolve(); else reject(new Error(`Falha na transcrição local. Verifique o modelo de voz. ${stderr.slice(-500)}`)); });
      });
      const result = JSON.parse(await readFile(`${out}.json`, 'utf8')) as { transcription?: { offsets: { from: number; to: number }; text: string }[] };
      if (!Array.isArray(result.transcription)) throw new Error('O motor de voz retornou um formato inesperado. Use uma versão recente do whisper.cpp.');
      const transcripts = result.transcription.filter(t => typeof t.text === 'string' && t.text.trim() && t.offsets).map(t => ({ start: Math.min(end, start + Math.max(0, t.offsets.from / 1000)), end: Math.min(end, start + Math.max(0, t.offsets.to / 1000)), text: t.text.trim() }));
      await rm(recoveryFile, { force: true }); await rm(path.join(recoveryDir, `${recoveryId}.json`), { force: true });
      return transcripts;
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  transcribing = operation;
  return operation;
}
