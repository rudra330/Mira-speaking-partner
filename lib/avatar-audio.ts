export type AvatarAudio = { context: AudioContext; source: AudioNode };

export type AvatarRig = {
  isSpeaking: boolean;
  mtAvatar: Record<string, { realtime?: number; needsUpdate: boolean }>;
};

export type VisemeProcessor = AudioWorkletNode & {
  loadModel(url: string): Promise<void>;
  update(dt: number): void;
  stop(): void;
  visemeActive: number;
  visemeAlphas: number[];
  onvalue: ((key: string, value: number) => void) | null;
  onstarted: (() => void) | null;
  onended: (() => void) | null;
};

const worklets = new WeakMap<AudioContext, Promise<void>>();

export function loadVisemeWorklet(context: AudioContext) {
  let loading = worklets.get(context);
  if (!loading) {
    loading = context.audioWorklet.addModule('/vendor/headaudio/headworklet.min.mjs');
    worklets.set(context, loading);
    void loading.catch(() => worklets.delete(context));
  }
  return loading;
}

export function resetMouth(head: AvatarRig, processor?: VisemeProcessor | null) {
  head.isSpeaking = false;
  if (processor) { processor.visemeActive = -1; processor.visemeAlphas.fill(0); }
  for (const [key, morph] of Object.entries(head.mtAvatar)) {
    if (key.startsWith('viseme_')) { morph.realtime = 0; morph.needsUpdate = true; }
  }
}

// This is a silent parallel tap. Never disconnect the source's audible output.
export function attachVisemes(source: AudioNode, processor: VisemeProcessor, head: AvatarRig, enabled: () => boolean) {
  let disposed = false;
  processor.onvalue = (key, value) => {
    if (disposed || !enabled()) return;
    const morph = head.mtAvatar[key];
    if (morph) { morph.realtime = value; morph.needsUpdate = true; }
  };
  processor.onstarted = () => { if (!disposed && enabled()) head.isSpeaking = true; };
  processor.onended = () => { if (!disposed) head.isSpeaking = false; };
  source.connect(processor);
  return () => {
    disposed = true;
    processor.onvalue = processor.onstarted = processor.onended = null;
    try { source.disconnect(processor); } catch { /* The call may already have closed. */ }
    processor.stop();
    processor.port.close();
    resetMouth(head, processor);
  };
}
