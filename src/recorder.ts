import { encodeWav } from '../shared/audio';
export class VoiceRecorder {
  private context?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private worklet?: AudioWorkletNode;
  private chunks: Float32Array[] = [];
  private samples = 0;
  private elapsed = 0;
  private active = false;
  private flushed?: () => void;
  constructor(private onChunk: (audio: ArrayBuffer, start: number, end: number) => void, private onError: (message: string) => void) {}
  async prepare(deviceId: string) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      this.stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => this.onError('O microfone foi desconectado. Encerre a gravação e confira os trechos já registrados.')));
      this.context = new AudioContext({ sampleRate: 16000 });
      await this.context.audioWorklet.addModule(new URL('./pcm-processor.js', import.meta.url));
      this.source = this.context.createMediaStreamSource(this.stream);
      this.worklet = new AudioWorkletNode(this.context, 'pcm-recorder');
      this.worklet.port.onmessage = event => {
        if (event.data === 'flushed') { this.flushed?.(); return; }
        if (!this.active) return;
        const samples = event.data as Float32Array;
        this.chunks.push(samples); this.samples += samples.length;
        if (this.samples >= this.context!.sampleRate * 20) this.flush();
      };
      this.source.connect(this.worklet); this.worklet.connect(this.context.destination);
    } catch (e) { await this.stop(); throw e; }
  }
  start() { this.active = true; void this.context?.resume(); }
  private flush() {
    if (!this.samples || !this.context) return;
    const all = new Float32Array(this.samples); let offset = 0;
    for (const chunk of this.chunks) { all.set(chunk, offset); offset += chunk.length; }
    const end = this.elapsed + this.samples / this.context.sampleRate;
    this.onChunk(encodeWav(all, this.context.sampleRate), this.elapsed, end);
    this.elapsed = end; this.samples = 0; this.chunks = [];
  }
  async stop() {
    if (this.active && this.worklet) {
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 500);
        this.flushed = () => { clearTimeout(timer); resolve(); };
        this.worklet!.port.postMessage('flush');
      });
    }
    this.active = false; this.flush(); this.source?.disconnect(); this.worklet?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    if (this.context && this.context.state !== 'closed') await this.context.close();
  }
}

export async function annotateFrame(frame: import('../shared/types').Frame, style: import('../shared/types').MarkStyle = 'smart', color = '#f59e0b'): Promise<import('../shared/types').Frame> {
  const originalImage = frame.originalImage ?? frame.image;
  const image = new Image(); image.src = originalImage; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = frame.width; canvas.height = frame.height;
  const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0, frame.width, frame.height);
  const r = frame.target ?? { x: Math.max(0, Math.min(.9, frame.cursor.x - .045)), y: Math.max(0, Math.min(.95, frame.cursor.y - .025)), width: .09, height: .05 };
  const x = Math.max(2, r.x * frame.width), y = Math.max(2, r.y * frame.height);
  const w = Math.max(4, Math.min(r.width * frame.width, frame.width - x - 2)), h = Math.max(4, Math.min(r.height * frame.height, frame.height - y - 2));
  const mark = style === 'smart' ? (/Button|MenuItem|Hyperlink|TabItem/.test(frame.action?.controlType ?? '') ? 'underline' : /Edit|ComboBox/.test(frame.action?.controlType ?? '') ? 'highlight' : 'circle') : style;
  ctx.strokeStyle = color; ctx.fillStyle = color + '45'; ctx.lineWidth = Math.max(3, frame.width / 400); ctx.lineCap = 'round';
  if (mark === 'underline') { ctx.beginPath(); ctx.moveTo(x, Math.min(frame.height - 2, y + h)); ctx.lineTo(x + w, Math.min(frame.height - 2, y + h)); ctx.stroke(); }
  else if (mark === 'circle') { ctx.beginPath(); ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI*2); ctx.stroke(); }
  else { ctx.fillRect(x,y,w,h); ctx.strokeRect(x,y,w,h); }
  return { ...frame, originalImage, annotation: { style, color }, image: canvas.toDataURL('image/jpeg', .88) };
}
