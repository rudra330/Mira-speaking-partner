// Observes already-streamed PCM; it never buffers or delays microphone audio.
export class SpeechEndDetector {
  private voicedMs = 0;
  private quietMs = 0;
  private speaking = false;
  private onEnd: () => void;
  private silenceMs: number;
  constructor(onEnd: () => void, silenceMs = 500) {
    this.onEnd = onEnd; this.silenceMs = silenceMs;
  }
  push(samples: Int16Array) {
    if (!samples.length) return;
    let power = 0;
    for (const sample of samples) power += (sample / 32768) ** 2;
    const speech = Math.sqrt(power / samples.length) > 0.008;
    const ms = samples.length / 16;
    if (speech) {
      this.voicedMs += ms; this.quietMs = 0;
      if (this.voicedMs >= 160) this.speaking = true;
    } else {
      this.quietMs += ms;
      if (!this.speaking && this.quietMs >= 40) this.voicedMs = 0;
      if (this.quietMs >= this.silenceMs) {
        const ended = this.speaking;
        this.reset();
        if (ended) this.onEnd();
      }
    }
  }
  reset() { this.voicedMs = this.quietMs = 0; this.speaking = false; }
}
