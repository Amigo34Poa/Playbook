import type { Frame, Procedure, Step, Transcript } from './types.js';

export function nearestFrame(frames: Frame[], at: number): Frame | undefined {
  return frames.reduce<Frame | undefined>((best, frame) => !best || Math.abs(frame.at - at) < Math.abs(best.at - at) ? frame : best, undefined);
}

export function draftSteps(transcripts: Transcript[], frames: Frame[]): Step[] {
  return transcripts.filter(t => t.text.trim()).map((t, index) => ({
    id: crypto.randomUUID(), title: `Etapa ${index + 1}`, description: t.text.trim(),
    frameId: nearestFrame(frames, (t.start + t.end) / 2)?.id,
  }));
}

export function emptyProcedure(): Procedure {
  return {
    id: crypto.randomUUID(), title: 'Novo procedimento', role: 'Equipe comercial', category: 'Vendas',
    objective: '', updatedAt: new Date().toISOString(), steps: [], frames: [], transcripts: [], references: [], review: '',
  };
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

export function clickStep(frame: Frame): Step {
  const a = frame.action;
  const name = a?.controlName?.trim();
  const action = a?.reason === 'manual' ? 'Captura manual' : a?.button === 'right' ? 'Clique com o botão direito' : 'Clique';
  return { id: crypto.randomUUID(), frameId: frame.id,
    title: name ? `${action}: ${name}`.slice(0,500) : `${action} na região destacada`,
    description: name ? `${action} em “${name}”.` : 'Confira a região destacada e descreva a ação realizada. O controle não foi identificado pelo Windows.' };
}
export function mergeNarration(steps: Step[], transcripts: Transcript[], frames: Frame[]): Step[] {
  const next = steps.map(s => ({ ...s }));
  for (const t of transcripts) {
    const frame = nearestFrame(frames.filter(f => f.at >= t.start - 3 && f.at <= t.end + 3), (t.start+t.end)/2);
    const step = frame && next.find(s => s.frameId === frame.id);
    if (step) step.description += `\n\nNarração: ${t.text.trim()}`;
    else next.push(...draftSteps([t], []));
  }
  return next;
}
