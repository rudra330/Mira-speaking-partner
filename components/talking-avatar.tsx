"use client";

import { useEffect, useRef, useState } from 'react';
import type { TalkingHead } from '@met4citizen/talkinghead';
import { attachVisemes, loadVisemeWorklet, resetMouth, type AvatarAudio, type VisemeProcessor } from '@/lib/avatar-audio';

type HeadAudioModule = { HeadAudio: new (context: AudioContext, options: object) => VisemeProcessor };
let audioModule: Promise<HeadAudioModule> | undefined;
function loadAudioModule(): Promise<HeadAudioModule> {
  return audioModule ??= (import('@/lib/vendor/headaudio.min.mjs') as unknown as Promise<HeadAudioModule>).catch(error => { audioModule = undefined; throw error; });
}

export function TalkingAvatar({ audio, phase, muted }: { audio: AvatarAudio | null; phase: string; muted: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const head = useRef<TalkingHead | null>(null);
  const processor = useRef<VisemeProcessor | null>(null);
  const allowed = useRef(false);
  allowed.current = phase === 'speaking' && !muted;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [lipError, setLipError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let avatar: TalkingHead | undefined;
    let loading = true;
    setStatus('loading');
    const release = () => {
      if (!avatar) return;
      avatar.dispose();
      void avatar.audioCtx.close().catch(() => {});
      if (head.current === avatar) head.current = null;
      avatar = undefined;
    };
    void (async () => {
      try {
        const { TalkingHead } = await import('@met4citizen/talkinghead');
        if (cancelled || !container.current) return;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        avatar = new TalkingHead(container.current, {
          // The renderer owns a separate silent context; disposing it must never suspend a call.
          lipsyncModules: [], cameraView: 'head', cameraDistance: .8, cameraRotateEnable: false,
          cameraPanEnable: false, cameraZoomEnable: false, modelFPS: 30,
          modelPixelRatio: Math.min(window.devicePixelRatio, 1.5) / window.devicePixelRatio,
          avatarIdleEyeContact: .7, avatarSpeakingEyeContact: .85,
          avatarIdleHeadMove: reduced ? 0 : .18, avatarSpeakingHeadMove: reduced ? 0 : .22,
          modelMovementFactor: reduced ? 0 : .5,
          lightAmbientIntensity: 1.8, lightDirectIntensity: 10,
          lightDirectColor: 0xffe5d5, lightDirectTheta: .4,
          update: (dt: number) => { if (!cancelled) processor.current?.update(dt); },
        });
        await avatar.showAvatar({ url: '/avatars/mira-brunette.glb', body: 'F', avatarMood: 'neutral' });
        if (cancelled) { release(); return; }
        head.current = avatar;
        resetMouth(avatar);
        setStatus('ready');
        void loadAudioModule().catch(() => {});
      } catch (error) {
        release();
        if (!cancelled) { console.warn('Mira avatar could not load', error); setStatus('error'); }
      } finally { loading = false; }
    })();
    return () => {
      cancelled = true;
      // GLTF loading cannot be aborted. Dispose after it settles if still in flight.
      if (!loading) release();
    };
  }, [attempt]);

  useEffect(() => {
    const avatar = head.current;
    if (!audio || !avatar || status !== 'ready') return;
    let cancelled = false;
    let node: VisemeProcessor | undefined;
    let detach: (() => void) | undefined;
    setLipError(false);
    void (async () => {
      try {
        const [{ HeadAudio }] = await Promise.all([loadAudioModule(), loadVisemeWorklet(audio.context)]);
        if (cancelled || audio.context.state === 'closed') return;
        const current = new HeadAudio(audio.context, { processorOptions: {}, parameterData: { vadGateActiveDb: -40, vadGateInactiveDb: -60 } });
        node = current;
        await current.loadModel('/vendor/headaudio/model-en-mixed.bin');
        if (cancelled || (audio.context.state as string) === 'closed') { current.stop(); current.port.close(); return; }
        processor.current = current;
        current.onprocessorerror = () => {
          if (!cancelled) { detach?.(); detach = undefined; processor.current = null; setLipError(true); }
        };
        detach = attachVisemes(audio.source, current, avatar, () => allowed.current);
      } catch (error) {
        node?.stop(); node?.port.close();
        if (!cancelled) { console.warn('Mira lip sync could not start', error); setLipError(true); }
      }
    })();
    return () => {
      cancelled = true;
      detach?.();
      if (processor.current === node) processor.current = null;
      resetMouth(avatar);
    };
  }, [audio, status, attempt]);

  useEffect(() => {
    if (head.current && (phase !== 'speaking' || muted)) resetMouth(head.current, processor.current);
  }, [phase, muted]);

  return <div className={`talking-avatar avatar-${status}`} role="img" aria-label="Mira, an animated 3D AI companion">
    {status !== 'ready' && <img src="/mira-avatar.png" className="portrait" alt="" />}
    <div ref={container} className="avatar-canvas" aria-hidden="true" />
    {status !== 'ready' && <div className="avatar-load-status" role="status">{status === 'loading' ? 'Bringing Mira to life…' : <>3D avatar unavailable. Voice still works. <button onClick={() => setAttempt(n => n + 1)}>Retry</button></>}</div>}
    {lipError && <div className="avatar-load-status" role="status">Lip sync unavailable. Your conversation can continue.</div>}
  </div>;
}

