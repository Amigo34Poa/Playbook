import { Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from 'docx';
import { escapeHtml } from '../shared/logic.js';
import type { ExportDocument } from '../shared/types.js';

export function printHtml(document: ExportDocument): string {
  const e = escapeHtml;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>
  @page{size:A4;margin:18mm}*{box-sizing:border-box}body{font:11pt/1.6 Arial,sans-serif;color:#172534}h1{font-size:28pt;line-height:1.2;margin:8mm 0}h2{font-size:16pt;margin:9mm 0 3mm}.eyebrow{font-size:9pt;text-transform:uppercase;letter-spacing:2px;color:#287761}.meta{color:#546477;border-bottom:1px solid #ddd;padding-bottom:6mm}p{white-space:pre-wrap;overflow-wrap:anywhere}img{max-width:100%;max-height:180mm;object-fit:contain;border:1px solid #dbe4e3;border-radius:5px}.figure{break-inside:avoid;margin:5mm 0}.caption{font-size:9pt;color:#657382;margin-top:2mm}.step h2{break-after:avoid}</style></head><body>
  <div class="eyebrow">Playbook comercial · Procedimento operacional</div><h1>${e(document.title)}</h1><p class="meta">${e(document.role)} · ${e(document.category)}</p>
  ${document.objective ? `<h2>Objetivo</h2><p>${e(document.objective)}</p>` : ''}
  ${document.steps.map((s, i) => {
    const frame = document.frames.find(f => f.id === s.frameId);
    return `<section class="step"><h2>${i + 1}. ${e(s.title)}</h2><p>${e(s.description)}</p>${frame ? `<div class="figure"><img src="${frame.image}" alt="Captura da etapa ${i + 1}"><div class="caption">Etapa ${i + 1} · Região indicada pelo cursor durante a demonstração</div></div>` : ''}</section>`;
  }).join('')}
  </body></html>`;
}

export async function buildDocx(document: ExportDocument): Promise<Buffer> {
  const children: Paragraph[] = [new Paragraph({ text: 'PLAYBOOK COMERCIAL', spacing: { after: 200 } }),
    new Paragraph({ text: document.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `${document.role} · ${document.category}`, spacing: { after: 400 } })];
  if (document.objective) children.push(new Paragraph({ text: 'Objetivo', heading: HeadingLevel.HEADING_1 }), new Paragraph({ text: document.objective }));
  for (const [index, step] of document.steps.entries()) {
    children.push(new Paragraph({ text: `${index + 1}. ${step.title}`, heading: HeadingLevel.HEADING_1, keepNext: true }));
    for (const line of step.description.split('\n')) children.push(new Paragraph({ children: [new TextRun(line)], spacing: { after: 160 } }));
    const frame = document.frames.find(f => f.id === step.frameId);
    if (frame) {
      const width = Math.min(frame.width, 600);
      const height = Math.min(680, width * frame.height / frame.width);
      const scaledWidth = height * frame.width / frame.height;
      children.push(new Paragraph({ children: [new ImageRun({ type: frame.image.startsWith('data:image/png') ? 'png' : 'jpg', data: Buffer.from(frame.image.split(',')[1], 'base64'), transformation: { width: scaledWidth, height }, altText: { title: step.title, description: `Captura da etapa ${index + 1}`, name: 'Captura de tela' } })] }));
      children.push(new Paragraph({ text: `Etapa ${index + 1} · Região indicada pelo cursor`, spacing: { after: 300 } }));
    }
  }
  return Packer.toBuffer(new Document({ creator: 'Playbook Studio', title: document.title, sections: [{ properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } }, children }] }));
}
