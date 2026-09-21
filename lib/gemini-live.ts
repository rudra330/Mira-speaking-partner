import type { RealtimeEvent, VoiceSettings } from "./conversation";
import { UtteranceRecorder } from "./whisper-recorder.ts";

type Options = {
  context: AudioContext; settings: VoiceSettings; textOnly: boolean; signal: AbortSignal;
  whisper?: boolean;
  onStream: (stream: MediaStream) => void;
  onEvent: (event: RealtimeEvent) => void;
  onPhase: (phase: "listening" | "transcribing" | "thinking" | "speaking") => void;
  onLevel: (output: number, input: number) => void;
  onBlocked: () => void; onError: (message: string) => void;
  onNotice?: (message: string) => void;
};
type ServerContent = {
  interrupted?: boolean; turnComplete?: boolean; generationComplete?: boolean;
  inputTranscription?: { text?: string }; outputTranscription?: { text?: string };
  modelTurn?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
};

export class GeminiLive {
  private socket: WebSocket | null = null;
  private capture: AudioWorkletNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private microphone: MediaStream | null = null;
  private output: GainNode;
  private outputMeter: AnalyserNode;
  private inputMeter: AnalyserNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private playAt = 0;
  private frame = 0;
  private closed = false;
  private ready = false;
  private generating = false;
  private muted = false;
  private inputId = "";
  private inputText = "";
  private outputId = "";
  private outputText = "";
  private dropOutput = false;
  private token = "";
  private model = "";
  private resumeHandle = "";
  private reconnecting = false;
  private recorder: UtteranceRecorder | null = null;
  private recordings: ArrayBuffer[] = [];
  private transcribing = false;
  private whisperSpeaking = false;
  private awaitingTurn = false;
  private pendingWhisperText = "";

  private options: Options;
  constructor(options: Options) {
    this.options = options;
    this.output = options.context.createGain();
    this.outputMeter = options.context.createAnalyser(); this.outputMeter.fftSize = 256;
    this.output.connect(this.outputMeter); this.outputMeter.connect(options.context.destination);
  }
  private emit(event: RealtimeEvent) { if (!this.closed) this.options.onEvent(event); }
  private fail(message: string) { if (!this.closed && !this.options.signal.aborted) this.options.onError(message); }
  async connect() {
    const { context, settings, signal } = this.options;
    signal.throwIfAborted();
    if (!this.options.textOnly) {
      if (!navigator.mediaDevices?.getUserMedia || !context.audioWorklet) throw new Error("Live voice needs a recent Chrome, Edge, or Safari browser.");
      const supported = navigator.mediaDevices.getSupportedConstraints() as MediaTrackSupportedConstraints & { voiceIsolation?: boolean };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: settings.noiseReduction, autoGainControl: true, channelCount: 1, ...(supported.voiceIsolation ? { voiceIsolation: settings.noiseReduction } : {}) }, video: false });
      if (signal.aborted) { stream.getTracks().forEach(track => track.stop()); signal.throwIfAborted(); }
      this.microphone = stream; this.options.onStream(stream);
      await context.audioWorklet.addModule("/mira-pcm-worklet.js"); signal.throwIfAborted();
      this.capture = new AudioWorkletNode(context, "mira-capture");
      this.micSource = context.createMediaStreamSource(stream);
      this.inputMeter = context.createAnalyser(); this.inputMeter.fftSize = 256;
      this.micSource.connect(this.inputMeter); this.micSource.connect(this.capture);
      // The worklet outputs silence; connecting it keeps capture processing active on Safari.
      this.capture.connect(context.destination);
      if (this.options.whisper) {
        this.recorder = new UtteranceRecorder(() => {
          this.whisperSpeaking = true;
          this.interruptWhisperReply();
          this.options.onPhase("listening");
        }, recording => {
          this.whisperSpeaking = false;
          if (this.recordings.length >= 3) { this.fail("Transcription is taking too long. Please reconnect and try again."); return; }
          this.recordings.push(recording);
          void this.transcribeRecordings();
        }, settings.pace === "low" ? 1100 : 650, () => { this.whisperSpeaking = false; this.flushWhisperText(); });
      }
      this.capture.port.onmessage = event => {
        if (!this.ready || this.closed || this.muted) return;
        if (this.recorder) { this.recorder.push(new Int16Array(event.data as ArrayBuffer)); return; }
        if ((this.socket?.bufferedAmount ?? 0) > 256000) { this.fail("Your network is too slow for live audio. Reconnect when it improves."); return; }
        const bytes = new Uint8Array(event.data as ArrayBuffer);
        let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
        this.send({ realtimeInput: { audio: { data: btoa(binary), mimeType: "audio/pcm;rate=16000" } } });
      };
    }
    const response = await fetch("/api/gemini", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings), signal });
    const data = await response.json() as { token?: string; model?: string; error?: string };
    if (!response.ok || !data.token || !data.model) throw new Error(data.error || "Unable to start the live connection.");
    signal.throwIfAborted(); this.token = data.token; this.model = data.model;
    await this.openSocket(); signal.throwIfAborted();
    if (context.state !== "running") this.options.onBlocked();
    const buffer = new Uint8Array(256);
    const level = (meter: AnalyserNode | null) => {
      if (!meter) return 0; meter.getByteTimeDomainData(buffer);
      let sum = 0; for (const value of buffer) sum += ((value - 128) / 128) ** 2;
      return Math.min(1, Math.sqrt(sum / buffer.length) * 4);
    };
    let lastFrame = 0;
    const animate = (now: number) => {
      if (this.closed) return;
      if (now - lastFrame > 65) { this.options.onLevel(level(this.outputMeter), this.muted ? 0 : level(this.inputMeter)); lastFrame = now; }
      this.frame = requestAnimationFrame(animate);
    };
    this.frame = requestAnimationFrame(animate);
  }
  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=" + encodeURIComponent(this.token));
      this.socket = socket; socket.binaryType = "arraybuffer";
      const timeout = setTimeout(() => { reject(new Error("The live connection timed out.")); socket.close(); }, 15000);
      let opened = false;
      socket.onopen = () => socket.send(JSON.stringify({ setup: { model: this.model, sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {} } }));
      socket.onmessage = event => {
        if (this.closed || this.socket !== socket) return;
        let data;
        try { data = JSON.parse(typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data)); } catch { return; }
        if (data.setupComplete) { clearTimeout(timeout); opened = true; this.ready = true; this.reconnecting = false; this.flushWhisperText(); resolve(); }
        if (data.sessionResumptionUpdate?.resumable) this.resumeHandle = data.sessionResumptionUpdate.newHandle || "";
        if (data.serverContent) this.handleContent(data.serverContent);
        if (data.goAway && this.resumeHandle && !this.reconnecting) {
          this.reconnecting = true; this.ready = false;
          void this.openSocket().then(() => socket.close()).catch(() => this.fail("The voice connection ended. Your transcript is kept; start a new conversation to continue."));
        }
        if (data.error) { clearTimeout(timeout); reject(new Error("The voice service could not connect.")); this.fail("The voice service reported an error. Please end and reconnect."); }
      };
      socket.onerror = () => { clearTimeout(timeout); if (!opened) reject(new Error("Could not reach the voice service. Check your network and try again.")); };
      socket.onclose = event => {
        clearTimeout(timeout);
        if (!opened) reject(new Error(event.code === 1008 ? "The voice account cannot start a session. Check its API quota or billing." : "The voice connection closed before it was ready."));
        else if (this.socket === socket && !this.closed) this.fail("The voice connection ended. Your transcript is kept; start again to reconnect.");
      };
    });
  }
  private send(message: object) {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.ready) return false;
    this.socket.send(JSON.stringify(message)); return true;
  }
  private finishInput() {
    if (this.inputId) this.emit({ type: "conversation.item.input_audio_transcription.completed", item_id: this.inputId, transcript: this.inputText });
  }
  private beginInput() {
    if (this.inputId) return;
    this.inputId = `g_user_${crypto.randomUUID()}`; this.inputText = "";
    // Transcription may arrive late; only Gemini's interruption event may stop a reply.
    this.emit({ type: "conversation.item.input_audio_transcription.delta", item_id: this.inputId, delta: "" });
  }
  private stopAudio() {
    for (const source of this.sources) { source.onended = null; try { source.stop(); } catch {} source.disconnect(); }
    this.sources.clear(); this.playAt = this.options.context.currentTime;
  }
  private handleContent(content: ServerContent) {
    if (content.interrupted) {
      this.stopAudio(); this.outputId = ""; this.outputText = ""; this.dropOutput = false; this.generating = false;
      this.emit({ type: "input_audio_buffer.speech_started" }); this.options.onPhase("listening");
    }
    if (!this.options.whisper && content.inputTranscription?.text) {
      this.beginInput(); this.inputText += content.inputTranscription.text;
      this.emit({ type: "conversation.item.input_audio_transcription.completed", item_id: this.inputId, transcript: this.inputText });
      this.options.onPhase("thinking");
    }
    if (!this.dropOutput && (content.outputTranscription?.text || content.modelTurn?.parts?.length)) {
      this.finishInput();
      if (!this.outputId) { this.outputId = `g_mira_${crypto.randomUUID()}`; this.outputText = ""; }
      this.generating = true;
      if (content.outputTranscription?.text) {
        this.outputText += content.outputTranscription.text;
        this.emit({ type: "response.output_audio_transcript.delta", item_id: this.outputId, delta: content.outputTranscription.text });
      }
      for (const part of content.modelTurn?.parts ?? []) {
        if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/pcm")) this.play(part.inlineData.data, Number(/rate=(\d+)/.exec(part.inlineData.mimeType)?.[1] || 24000));
      }
    }
    if (content.turnComplete) {
      this.finishInput(); this.inputId = ""; this.inputText = "";
      if (this.outputId && !this.dropOutput) this.emit({ type: "response.output_audio_transcript.done", item_id: this.outputId, transcript: this.outputText });
      this.outputId = ""; this.outputText = ""; this.generating = false; this.dropOutput = false;
      this.emit({ type: "response.done" });
      this.awaitingTurn = false;
      if (!this.sources.size) this.options.onPhase(this.transcribing ? "transcribing" : "listening");
      this.flushWhisperText();
    }
  }
  private play(encoded: string, rate: number) {
    const binary = atob(encoded); const pcm = new DataView(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) pcm.setUint8(i, binary.charCodeAt(i));
    const context = this.options.context;
    const buffer = context.createBuffer(1, Math.floor(binary.length / 2), rate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = pcm.getInt16(i * 2, true) / 32768;
    const source = context.createBufferSource(); source.buffer = buffer; source.connect(this.output);
    this.playAt = Math.max(context.currentTime + 0.025, this.playAt);
    source.start(this.playAt); this.playAt += buffer.duration; this.sources.add(source);
    this.options.onPhase("speaking");
    source.onended = () => { source.disconnect(); this.sources.delete(source); if (!this.closed && !this.sources.size && !this.generating) this.options.onPhase("listening"); };
  }
  sendText(text: string) {
    if (!this.ready || this.closed) return false;
    if (this.options.whisper) {
      if (this.awaitingTurn || this.sources.size) this.interruptWhisperReply();
      this.pendingWhisperText = [this.pendingWhisperText, text].filter(Boolean).join("\n");
      this.flushWhisperText();
      return true;
    }
    this.dropOutput = this.generating;
    this.stopAudio(); this.finishInput(); this.inputId = ""; this.inputText = "";
    this.outputId = ""; this.outputText = "";
    this.options.onPhase("thinking");
    return this.send({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true } });
  }
  private interruptWhisperReply() {
    this.stopAudio();
    this.dropOutput = this.awaitingTurn;
    this.emit({ type: "input_audio_buffer.speech_started" });
  }
  private flushWhisperText() {
    if (!this.options.whisper || !this.pendingWhisperText || this.awaitingTurn || this.whisperSpeaking || this.transcribing || this.recordings.length || this.closed || !this.ready) return;
    const text = this.pendingWhisperText;
    this.outputId = ""; this.outputText = ""; this.dropOutput = false;
    if (this.send({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true } })) {
      this.pendingWhisperText = ""; this.awaitingTurn = true; this.generating = true;
      this.options.onPhase("thinking");
    }
  }
  private async transcribeRecordings() {
    if (this.transcribing || this.closed) return;
    this.transcribing = true;
    try {
      while (this.recordings.length && !this.closed) {
        if (!this.whisperSpeaking) this.options.onPhase("transcribing");
        const recording = this.recordings.shift()!;
        const response = await fetch(`/api/transcribe?language=${this.options.settings.language}`, {
          method: "POST", headers: { "Content-Type": "audio/wav" }, body: recording,
          signal: AbortSignal.any([this.options.signal, AbortSignal.timeout(45000)]),
        });
        const data = await response.json() as { text?: string; error?: string };
        if (this.closed || this.options.signal.aborted) return;
        if (!response.ok) throw new Error(data.error || "Whisper could not transcribe your speech. Please try again.");
        if (data.text?.trim()) {
          const text = data.text.trim();
          this.emit({ type: "conversation.item.input_audio_transcription.completed", item_id: `whisper_${crypto.randomUUID()}`, transcript: text });
          this.pendingWhisperText = [this.pendingWhisperText, text].filter(Boolean).join("\n");
        } else this.options.onNotice?.("No clear speech was recognized. Please try speaking again.");
      }
    } catch (error) {
      if (!this.closed && !this.options.signal.aborted) this.fail(error instanceof Error ? error.message : "Whisper transcription failed. Please reconnect.");
    } finally {
      this.transcribing = false;
      if (!this.closed) {
        this.flushWhisperText();
        if (!this.awaitingTurn && !this.sources.size) this.options.onPhase("listening");
      }
    }
  }
  setMicMuted(muted: boolean) {
    if (this.options.whisper && muted) { this.recorder?.flush(); this.whisperSpeaking = false; this.flushWhisperText(); }
    this.muted = muted; this.capture?.port.postMessage({ enabled: !muted });
    if (muted && !this.options.whisper) this.send({ realtimeInput: { audioStreamEnd: true } });
  }
  setVolumeMuted(muted: boolean) { this.output.gain.value = muted ? 0 : 1; }
  close() {
    this.closed = true; this.ready = false; cancelAnimationFrame(this.frame); this.stopAudio();
    this.recorder?.reset(); this.recordings = []; this.pendingWhisperText = "";
    this.socket?.close(); this.capture?.disconnect(); this.capture?.port.close(); this.micSource?.disconnect();
    this.microphone?.getTracks().forEach(track => track.stop()); this.output.disconnect(); this.outputMeter.disconnect();
  }
}
