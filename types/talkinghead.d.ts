declare module '@met4citizen/talkinghead' {
  export class TalkingHead {
    constructor(element: HTMLElement, options: Record<string, unknown>);
    audioCtx: AudioContext;
    isSpeaking: boolean;
    mtAvatar: Record<string, { realtime?: number; needsUpdate: boolean }>;
    opt: { update: ((dt: number) => void) | null };
    showAvatar(avatar: { url: string; body: string; avatarMood: string }): Promise<void>;
    dispose(): void;
  }
}
