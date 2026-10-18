class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super(); this.buffer = new Float32Array(4096); this.used = 0;
    this.port.onmessage = event => {
      if (event.data === 'flush') {
        if (this.used) this.port.postMessage(this.buffer.slice(0, this.used));
        this.used = 0; this.port.postMessage('flushed');
      }
    };
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] / channels.length;
      this.buffer[this.used++] = value;
      if (this.used === this.buffer.length) {
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(4096); this.used = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-recorder', PcmProcessor);
