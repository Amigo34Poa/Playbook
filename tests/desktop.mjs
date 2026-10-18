import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';

const dir = await mkdtemp(path.join(tmpdir(), 'playbook-desktop-test-'));
const extraArgs = [...(process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu'] : []), '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
const app = await electron.launch({ args: [...extraArgs, `--user-data-dir=${dir}`, '.'], env: { ...process.env, XDG_CACHE_HOME: path.join(dir, 'cache') } });
try {
  const page = await app.firstWindow();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await expect(page.getByText('Seu primeiro processo começa aqui', { exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => Boolean(window.studio)), true, 'preload deve disponibilizar IPC');
  assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), dir, 'dados do teste devem permanecer isolados');
  const external = [];
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1')) external.push(request.url()); });
  await page.getByRole('button', { name: 'Cadastro de cliente', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar etapa', exact: true }).click();
  await page.getByLabel('Título da etapa 1', { exact: true }).fill('Confira o cadastro');
  await page.getByLabel('Descrição da etapa 1', { exact: true }).fill('Valide o CNPJ e o endereço. Depois, clique em Salvar.');
  await page.getByRole('button', { name: 'Gravar processo', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Gravar uma demonstração' })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar gravação', exact: true }).click();
  await page.evaluate(() => window.studio.captureNow());
  await page.evaluate(() => window.studio.stopCapture());
  await expect(page.getByRole('button', { name: 'Gravar processo', exact: true })).toBeEnabled();
  await page.getByRole('tab', { name: /Procedimento/ }).click();
  await expect(page.getByLabel('Captura da etapa 1', { exact: true })).toContainText('Captura 1');
  await page.getByLabel('Captura da etapa 1', { exact: true }).selectOption({ index: 1 });
  await expect(page.getByText('Salvo neste computador', { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => window.studio.load());
  assert.equal(saved.procedures.length, 1); assert.ok(saved.procedures[0].frames.length >= 1);
  const p = saved.procedures[0];
  assert.ok(p.frames[0].image.startsWith('data:image/jpeg;base64,'));
  assert.equal(p.steps[0].frameId, p.frames[0].id);
  for (const format of ['pdf', 'docx']) {
    const target = path.join(dir, `procedimento.${format}`);
    await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, target);
    assert.equal(await page.evaluate(({ p, format }) => window.studio.exportDocument(p, format), { p, format }), true);
    assert.ok((await stat(target)).size > 1000);
  }
  const pdf = await pdfParse(await readFile(path.join(dir, 'procedimento.pdf')));
  assert.match(pdf.text, /Confira o cadastro/); assert.match(pdf.text, /endereço/);
  const word = await mammoth.convertToHtml({ buffer: await readFile(path.join(dir, 'procedimento.docx')) });
  assert.match(word.value, /Confira o cadastro/); assert.match(word.value, /data:image\/jpeg;base64/);
  const input = path.join(dir, 'orientacoes.txt'); await writeFile(input, 'Confira os dados do cliente antes de salvar.');
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, input);
  const refs = await page.evaluate(() => window.studio.importReferences()); assert.equal(refs[0].text, 'Confira os dados do cliente antes de salvar.');
  for (const format of ['pdf', 'docx']) {
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, path.join(dir, `procedimento.${format}`));
    const imported = await page.evaluate(() => window.studio.importReferences()); assert.match(imported[0].text, /Confira o cadastro/);
  }
  const wav = await import('../dist-electron/shared/audio.js');
  const samples = Array.from(new Uint8Array(wav.encodeWav(new Float32Array(1600))));
  await assert.rejects(page.evaluate(bytes => window.studio.transcribe(Uint8Array.from(bytes).buffer, 'audio/wav', 0, .1), samples), /executável whisper-cli/);
  await page.evaluate(dir => window.studio.configure({ whisperExecutable: `${dir}/motor-inexistente`, whisperModel: `${dir}/modelo-inexistente`, llamaExecutable: `${dir}/texto-inexistente`, llamaModel: `${dir}/gguf-inexistente`, threads: 1 }), dir);
  await page.reload();
  await page.getByRole('button', { name: /Cadastros Criar cadastro de cliente/ }).click();
  await page.getByRole('button', { name: 'Gravar processo', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /Gravar narração/ })).toBeChecked();
  await page.getByRole('button', { name: 'Iniciar gravação', exact: true }).click();
  await expect(page.getByRole('button', { name: /Encerrar ·/ })).toBeVisible();
  await page.waitForTimeout(1000); // Gera amostras com o microfone sintético do Chromium.
  await page.evaluate(() => window.studio.stopCapture());
  await expect(page.getByText(/aguardando recuperação/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar áudio WAV', exact: true })).toBeVisible();
  const recovery = await import('node:fs/promises').then(fs => fs.readdir(path.join(dir, 'audio-recovery')));
  assert.ok(recovery.some(name => name.endsWith('.wav')), 'áudio deve ser preservado se o motor estiver indisponível');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log(JSON.stringify({ status: 'passed', checks: ['preload e IPC', 'edição e persistência reais', 'captura nativa e destaque', 'PDF com texto', 'Word com imagem', 'importação TXT/PDF/DOCX', 'microfone sintético e AudioWorklet WAV', 'recuperação de áudio após falha', 'nenhuma requisição externa do renderer'], artifacts: dir }, null, 2));
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
}
