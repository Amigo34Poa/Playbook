import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { SaxesParser } from 'saxes';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import type { Reference } from '../shared/types.js';

export function docxText(data: Uint8Array): string {
  let total = 0;
  const entries = unzipSync(data, { filter: entry => {
    if (!/^word\/(document|footnotes|endnotes)\.xml$/.test(entry.name)) return false;
    total += entry.originalSize;
    if (total > 20 * 1024 * 1024) throw new Error('O conteúdo descompactado do Word ultrapassa 20 MB. Divida o documento.');
    return true;
  } });
  if (!entries['word/document.xml']) throw new Error('O arquivo não é um documento Word .docx válido.');
  return ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml'].filter(name => entries[name]).map(name => {
    const xml = strFromU8(entries[name]);
    if (/<!DOCTYPE/i.test(xml)) throw new Error('O documento contém uma definição XML não suportada. Salve uma nova cópia em .docx.');
    let inText = false; let text = '';
    const parser = new SaxesParser({ xmlns: true });
    parser.on('opentag', node => { if (node.local === 't') inText = true; if (node.local === 'tab') text += '\t'; if (node.local === 'br') text += '\n'; });
    parser.on('text', value => { if (inText) text += value; });
    parser.on('closetag', node => { if (node.local === 't') inText = false; if (['p', 'tr'].includes(node.local)) text += '\n'; });
    parser.write(xml).close(); return text;
  }).join('\n').trim();
}
export async function extractReference(filePath: string): Promise<Reference> {
  if ((await stat(filePath)).size > 15 * 1024 * 1024) throw new Error(`${path.basename(filePath)} ultrapassa o limite de 15 MB por arquivo.`);
  const data = await readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();
  let text: string;
  if (extension === '.docx') text = docxText(data);
  else if (extension === '.pdf') text = (await pdfParse(data)).text;
  else if (['.txt', '.md'].includes(extension)) text = data.toString('utf8');
  else throw new Error('Formato não suportado. Use PDF, DOCX, TXT ou MD.');
  text = text.replace(/\u0000/g, '').trim();
  if (!text) throw new Error(`${path.basename(filePath)} não contém texto extraível. PDFs digitalizados precisam de OCR antes da importação.`);
  if (text.length > 200000) throw new Error(`${path.basename(filePath)} tem mais de 200 mil caracteres. Divida o documento antes de importar.`);
  return { id: randomUUID(), name: path.basename(filePath), text, importedAt: new Date().toISOString() };
}
