// Short in-memory PCM recordings. Raw microphone audio never goes to Gemini.
export function pcmToWav(chunks: Int16Array[]) {
  const count = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const label = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  label(0, "RIFF"); view.setUint32(4, 36 + count * 2, true); label(8, "WAVE"); label(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  label(36, "data"); view.setUint32(40, count * 2, true);
  let offset = 44;
  for (const chunk of chunks) for (const sample of chunk) { view.setInt16(offset, sample, true); offset += 2; }
  return buffer;
}

export class UtteranceRecorder {
  private preRoll: Int16Array[] = [];
  private chunks: Int16Array[] = [];
  private samples = 0;
  private voiced = 0;
  private onset = 0;
  private quiet = 0;
  private speaking = false;
  private onStart: () => void;
  private onRecording: (audio: ArrayBuffer) => void;
  private pauseMs: number;
  private onStop: () => void;
  constructor(onStart: () => void, onRecording: (audio: ArrayBuffer) => void, pauseMs = 450, onStop = () => {}) {
    this.onStart = onStart; this.onRecording = onRecording; this.pauseMs = pauseMs; this.onStop = onStop;
  }
  push(samples: Int16Array) {
    let power = 0; for (const sample of samples) power += (sample / 32768) ** 2;
    const speech = Math.sqrt(power / Math.max(1, samples.length)) > 0.008;
    const ms = samples.length / 16;
    if (!this.speaking) {
      this.preRoll.push(samples); while (this.preRoll.length > 6) this.preRoll.shift();
      this.onset = speech ? this.onset + ms : 0;
      if (this.onset < 150) return;
      this.speaking = true; this.voiced = this.onset;
      this.chunks = this.preRoll; this.preRoll = [];
      this.samples = this.chunks.reduce((total, chunk) => total + chunk.length, 0);
      this.onStart(); return;
    }
    this.chunks.push(samples); this.samples += samples.length;
    this.quiet = speech ? 0 : this.quiet + ms;
    if (speech) this.voiced += ms;
    if (this.quiet >= this.pauseMs || this.samples >= 240000) this.flush();
  }
  flush() {
    const chunks = this.chunks; const keep = this.speaking && this.voiced >= 200;
    this.reset();
    if (keep) this.onRecording(pcmToWav(chunks));
    this.onStop();
  }
  reset() {
    this.preRoll = []; this.chunks = []; this.samples = this.voiced = this.onset = this.quiet = 0; this.speaking = false;
  }
}
