export interface Step {
  id: string;
  title: string;
  description: string;
  frameId?: string;
}
export interface Frame {
  id: string;
  at: number;
  image: string;
  cursor: { x: number; y: number };
  width: number;
  height: number;
}
export interface Transcript { start: number; end: number; text: string }
export interface Reference { id: string; name: string; text: string; importedAt: string }
export interface Procedure {
  id: string;
  title: string;
  role: string;
  category: string;
  objective: string;
  updatedAt: string;
  steps: Step[];
  frames: Frame[];
  transcripts: Transcript[];
  references: Reference[];
  review: string;
}
export interface Workspace { company: string; procedures: Procedure[] }
export interface EngineConfig { whisperExecutable: string; whisperModel: string; llamaExecutable: string; llamaModel: string; threads: number }
export interface Settings extends EngineConfig { configured: boolean; running: boolean }
export interface DisplaySource { id: string; name: string; thumbnail: string }
export interface CaptureStatus { active: boolean; count: number; message?: string }
export interface ExportDocument { title: string; role: string; category: string; objective: string; steps: Step[]; frames: Frame[] }
export interface StudioAPI {
  load(): Promise<Workspace>;
  save(workspace: Workspace): Promise<void>;
  settings(): Promise<Settings>;
  configure(config: EngineConfig): Promise<Settings>;
  chooseEngineFile(kind: 'executable' | 'whisper' | 'llama'): Promise<string | null>;
  openFolder(kind: 'resources' | 'data'): Promise<void>;
  testConnection(): Promise<void>;
  displays(): Promise<DisplaySource[]>;
  startCapture(displayId: string): Promise<void>;
  captureNow(): Promise<void>;
  stopCapture(): Promise<void>;
  onFrame(callback: (frame: Frame) => void): () => void;
  onCaptureStatus(callback: (status: CaptureStatus) => void): () => void;
  transcribe(audio: ArrayBuffer, mime: string, start: number, end: number): Promise<Transcript[]>;
  generate(procedure: Procedure): Promise<{ objective: string; steps: Step[] }>;
  review(procedure: Procedure): Promise<string>;
  importReferences(): Promise<Reference[]>;
  exportDocument(procedure: ExportDocument, format: 'pdf' | 'docx'): Promise<boolean>;
}
