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
