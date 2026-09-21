class MiraCapture extends AudioWorkletProcessor {
  constructor() {
    super(); this.samples = new Int16Array(800); this.position = 0;
    this.phase = 0; this.sum = 0; this.count = 0; this.enabled = true;
    this.port.onmessage = event => { this.enabled = event.data.enabled; this.position = this.phase = this.sum = this.count = 0; };
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input || !this.enabled) return true;
    for (const sample of input) {
      this.sum += sample; this.count++; this.phase += 16000;
      if (this.phase >= sampleRate) {
        this.phase -= sampleRate;
        this.samples[this.position++] = Math.round(Math.max(-1, Math.min(1, this.sum / this.count)) * 32767);
        this.sum = this.count = 0;
        if (this.position === this.samples.length) {
          this.port.postMessage(this.samples.buffer, [this.samples.buffer]);
          this.samples = new Int16Array(800); this.position = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('mira-capture', MiraCapture);
