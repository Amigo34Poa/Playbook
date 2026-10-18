import { test } from 'node:test';
import assert from 'node:assert/strict';
import mammoth from 'mammoth';
import { buildDocx, printHtml } from '../electron/document-format.js';
import { draftSteps, emptyProcedure, nearestFrame } from '../shared/logic.js';
import { encodeWav } from '../shared/audio.js';
import { generatedSchema, workspaceSchema } from '../shared/schema.js';
import type { Frame } from '../shared/types.js';
import { docxText } from '../electron/import-reference.js';
import { zipSync, strToU8 } from 'fflate';

const frame: Frame = { id: 'b4be0817-6a57-4a42-8d9f-ddcd1108a63d', at: 5, image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jv1kAAAAASUVORK5CYII=', cursor: { x: .5, y: .5 }, width: 1, height: 1 };
test('associa a narração à captura temporalmente mais próxima, sem inventar imagens', () => {
  const later = { ...frame, id: '05db953c-b954-485b-a6d5-79f027c13994', at: 30 };
  assert.equal(nearestFrame([frame, later], 27)?.id, later.id);
  assert.equal(nearestFrame([], 27), undefined);
  const steps = draftSteps([{ start: 24, end: 30, text: '  Clique em Salvar.  ' }], [frame, later]);
  assert.equal(steps[0].frameId, later.id); assert.equal(steps[0].description, 'Clique em Salvar.');
});
test('codifica áudio PCM mono 16 kHz em WAV com recorte correto de amplitude', () => {
  const wav = encodeWav(new Float32Array([-2, 0, 2])); const view = new DataView(wav);
  assert.equal(Buffer.from(wav).subarray(0, 4).toString(), 'RIFF');
  assert.equal(view.getUint32(24, true), 16000); assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(40, true), 6); assert.equal(view.getInt16(44, true), -32768); assert.equal(view.getInt16(48, true), 32767);
});
test('exporta Word com conteúdo em português e imagem embutida', async () => {
  const p = { ...emptyProcedure(), title: 'Cadastro de cliente', role: 'Assistente de Vendas', objective: 'Registrar os dados com precisão.', frames: [frame], steps: [{ id: crypto.randomUUID(), title: 'Confira o CNPJ', description: 'Valide o nome e o endereço.\nDepois, salve o cadastro.', frameId: frame.id }] };
  const buffer = await buildDocx(p);
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  const html = await mammoth.convertToHtml({ buffer });
  assert.match(html.value, /Cadastro de cliente/); assert.match(html.value, /Assistente de Vendas/);
  assert.match(html.value, /endereço/); assert.match(html.value, /data:image\/png;base64/);
  assert.match(docxText(buffer), /endereço/); assert.match(docxText(buffer), /Depois, salve o cadastro/);
});
test('rejeita conteúdo Word com definição externa XML e arquivos sem documento principal', () => {
  assert.throws(() => docxText(zipSync({ 'word/document.xml': strToU8('<!DOCTYPE test SYSTEM "file:///etc/passwd"><test/>') })), /definição XML não suportada/);
  assert.throws(() => docxText(zipSync({ 'arquivo.txt': strToU8('texto') })), /documento Word/);
});
test('escapa texto importado no HTML de impressão e anexa somente capturas associadas', () => {
  const p = { ...emptyProcedure(), title: '<script>alert(1)</script>', frames: [frame], steps: [{ id: crypto.randomUUID(), title: 'Salvar & continuar', description: 'Use o campo <Nome>.' }] };
  const html = printHtml(p);
  assert.ok(!html.includes('<script>')); assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('Salvar &amp; continuar'));
  assert.ok(!html.includes('data:image/png'));
  const attached = printHtml({ ...p, steps: [{ ...p.steps[0], frameId: frame.id }] });
  assert.ok(attached.includes('data:image/png')); assert.ok(attached.includes('Captura da etapa 1'));
});
test('rejeita documentos locais inválidos e respostas incompletas da IA', () => {
  assert.equal(workspaceSchema.safeParse({ company: 'Confidencial', procedures: [emptyProcedure()] }).success, true);
  assert.equal(workspaceSchema.safeParse({ company: 'Confidencial', procedures: [{ ...emptyProcedure(), frames: [{ ...frame, image: 'https://externo.example/imagem.png' }] }] }).success, false);
  assert.equal(generatedSchema.safeParse({ objective: 'Cadastrar cliente', steps: [] }).success, false);
  assert.equal(generatedSchema.safeParse({ objective: 'Cadastrar cliente', steps: [{ title: 'Salvar', description: 'Clique em Salvar.', frameId: null }] }).success, true);
});
