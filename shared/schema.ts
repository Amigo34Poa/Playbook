import { z } from 'zod';

export const rectSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).refine(r => r.x + r.width <= 1.002 && r.y + r.height <= 1.002);
export const markStyleSchema = z.enum(['smart', 'highlight', 'circle', 'underline']);
export const imageSchema = z.string().max(6_000_000).regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/);
export const frameSchema = z.object({
  id: z.string().uuid(), at: z.number().nonnegative(),
  manuallyAdjusted: z.boolean().optional(), image: imageSchema, originalImage: imageSchema.optional(), target: rectSchema.optional(),
  annotation: z.object({ style: markStyleSchema, color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).optional(),
  action: z.object({ reason: z.enum(['click','manual']), button: z.enum(['left','right','none']), controlName: z.string().max(300), controlType: z.string().max(100), detection: z.enum(['uia','point']) }).optional(),
  cursor: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  width: z.number().int().positive().max(16384), height: z.number().int().positive().max(16384),
});
export const stepSchema = z.object({ id: z.string().uuid(), title: z.string().max(500), description: z.string().max(30000), frameId: z.string().uuid().optional() });
export const transcriptSchema = z.object({ start: z.number().nonnegative(), end: z.number().nonnegative(), text: z.string().max(100000) });
export const referenceSchema = z.object({ id: z.string().uuid(), name: z.string().max(500), text: z.string().max(200000), importedAt: z.string() });
export const procedureSchema = z.object({
  id: z.string().uuid(), title: z.string().max(500), role: z.string().max(500), category: z.string().max(500),
  objective: z.string().max(30000), updatedAt: z.string(), steps: z.array(stepSchema).max(500),
  frames: z.array(frameSchema).max(300), transcripts: z.array(transcriptSchema).max(2000),
  references: z.array(referenceSchema).max(30), review: z.string().max(100000),
});
export const workspaceSchema = z.object({ company: z.string().max(500), procedures: z.array(procedureSchema).max(100) });
export const generatedSchema = z.object({
  objective: z.string().max(30000),
  steps: z.array(z.object({ title: z.string().min(1).max(500), description: z.string().min(1).max(30000), frameId: z.string().nullable().optional() })).min(1).max(500),
});
