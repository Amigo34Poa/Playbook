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

export async function annotateFrame<T extends { image: string; width: number; height: number; cursor: { x: number; y: number } }>(frame: T): Promise<T> {
  const image = new Image(); image.src = frame.image; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = frame.width; canvas.height = frame.height;
  const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
  const x = frame.cursor.x * frame.width, y = frame.cursor.y * frame.height;
  const boxWidth = Math.min(150, frame.width), boxHeight = Math.min(62, frame.height);
  ctx.fillStyle = 'rgba(37,178,126,0.15)'; ctx.strokeStyle = '#0ab77f'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(Math.max(2, Math.min(frame.width - boxWidth - 2, x - boxWidth / 2)), Math.max(2, Math.min(frame.height - boxHeight - 2, y - boxHeight / 2)), boxWidth, boxHeight, 8); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
  return { ...frame, image: canvas.toDataURL('image/jpeg', 0.88) };
}
