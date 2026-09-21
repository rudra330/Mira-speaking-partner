"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { defaultSettings, interruptTranscript, updateTranscript, type Message, type Snapshot, type VoiceSettings, type RealtimeEvent } from "./conversation";
import { GeminiLive } from "./gemini-live";

type Phase = "idle" | "connecting" | "listening" | "transcribing" | "thinking" | "speaking" | "ended";
type Config = { sessionReady: boolean; configured: boolean; provider: "openai" | "gemini"; transcription: "whisper" | "native"; name: string | null };
type SaveState = "empty" | "saving" | "saved" | "error";
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000), headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error((data as { error?: string }).error || "Something went wrong. Please try again.");
  return data as T;
}

export function useMira() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volumeMuted, setVolumeMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [level, setLevel] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("empty");
  const [config, setConfig] = useState<Config | null>(null);
  const [settings, setSettings] = useState<VoiceSettings>(defaultSettings);
  const [apiKey, setApiKey] = useState(""); // Deliberately memory-only; never persist credentials.
  const [voiceIsolation, setVoiceIsolation] = useState(false);
  const ref = useRef({ phase: "idle" as Phase, messages: [] as Message[], duration: 0, id: "", createdAt: "", revision: 0, startedAt: 0, muted: false, speakingItem: "", generating: false, pendingText: "" });
  const pc = useRef<RTCPeerConnection | null>(null);
  const gemini = useRef<GeminiLive | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const context = useRef<AudioContext | null>(null);
  const abort = useRef<AbortController | null>(null);
  const frame = useRef(0);
  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(new Map<string, Snapshot>());
  const saving = useRef(false);
  const mounted = useRef(true);

  const transition = useCallback((next: Phase) => { ref.current.phase = next; if (mounted.current) setPhase(next); }, []);
  const flush = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      while (pending.current.size) {
        const snapshot = pending.current.values().next().value as Snapshot;
        if (mounted.current) setSaveState("saving");
        try {
          await fetchJson("/api/conversations", { method: "PUT", body: JSON.stringify(snapshot) });
          if (pending.current.get(snapshot.id)?.revision === snapshot.revision) pending.current.delete(snapshot.id);
        } catch {
          if (mounted.current) setSaveState("error");
          return;
        }
      }
      if (mounted.current) setSaveState("saved");
    } finally { saving.current = false; }
  }, []);
  const queueSave = useCallback((immediate = false) => {
    const current = ref.current;
    if (!current.id || !current.messages.length) return;
    const title = current.messages.find(m => m.role === "user" && m.text)?.text.slice(0, 90) || "A conversation with Mira";
    pending.current.set(current.id, { id: current.id, title, messages: current.messages, duration: current.duration, createdAt: current.createdAt, revision: ++current.revision });
    if (mounted.current) setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (immediate) void flush();
    else saveTimer.current = setTimeout(() => void flush(), 700);
  }, [flush]);
  const changeMessages = useCallback((update: (old: Message[]) => Message[]) => {
    const next = update(ref.current.messages);
    if (next === ref.current.messages) return;
    ref.current.messages = next;
    if (mounted.current) setMessages(next);
    queueSave();
  }, [queueSave]);
  const cleanup = useCallback(() => {
    abort.current?.abort(); abort.current = null;
    if (connectTimer.current) clearTimeout(connectTimer.current);
    if (disconnectTimer.current) clearTimeout(disconnectTimer.current);
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach(track => { track.onended = null; track.stop(); }); stream.current = null;
    gemini.current?.close(); gemini.current = null;
    if (dc.current) { dc.current.onclose = null; dc.current.onerror = null; dc.current.onmessage = null; dc.current.close(); dc.current = null; }
    if (pc.current) { pc.current.onconnectionstatechange = null; pc.current.ontrack = null; pc.current.close(); pc.current = null; }
    if (audio.current) { audio.current.pause(); audio.current.srcObject = null; audio.current = null; }
    if (context.current) { void context.current.close().catch(() => {}); context.current = null; }
    ref.current.generating = false; ref.current.pendingText = ""; ref.current.speakingItem = "";
    if (mounted.current) { setLevel(0); setMicLevel(0); setMuted(false); setVolumeMuted(false); setAudioBlocked(false); }
    ref.current.muted = false;
  }, []);
  const end = useCallback(() => {
    if (ref.current.phase === "idle" || ref.current.phase === "ended") return;
    changeMessages(old => interruptTranscript(old, ref.current.speakingItem));
    cleanup(); transition("ended"); queueSave(true);
  }, [changeMessages, cleanup, queueSave, transition]);
  const sendEvent = useCallback((event: object) => {
    if (dc.current?.readyState !== "open") return false;
    dc.current.send(JSON.stringify(event)); return true;
  }, []);
  const sendTextNow = useCallback((text: string) => {
    const id = `text_${crypto.randomUUID().replaceAll("-", "")}`;
    if (!sendEvent({ type: "conversation.item.create", item: { id, type: "message", role: "user", content: [{ type: "input_text", text }] } })) return false;
    changeMessages(old => [...old, { id, role: "user", text, at: new Date().toISOString(), status: "final", source: "text" }]);
    sendEvent({ type: "response.create" }); ref.current.generating = true; transition("thinking"); return true;
  }, [changeMessages, sendEvent, transition]);
  const sendText = useCallback((text: string) => {
    text = text.trim();
    if (gemini.current) {
      if (!text || text.length > 4000 || !gemini.current.sendText(text)) return false;
      changeMessages(old => [...interruptTranscript(old, ref.current.speakingItem), { id: `text_${crypto.randomUUID()}`, role: "user", text, at: new Date().toISOString(), status: "final", source: "text" }]);
      ref.current.speakingItem = "";
      return true;
    }
    if (!text || text.length > 4000 || dc.current?.readyState !== "open") return false;
    // Wait for response.done after cancel before requesting the next response.
    if (ref.current.generating) {
      if (ref.current.pendingText) { setError("Your message is being sent. Please wait a moment before sending another."); return false; }
      ref.current.pendingText = text;
      sendEvent({ type: "response.cancel" });
      sendEvent({ type: "output_audio_buffer.clear" });
      changeMessages(old => interruptTranscript(old, ref.current.speakingItem));
      return true;
    }
    if (ref.current.phase === "speaking") {
      sendEvent({ type: "output_audio_buffer.clear" });
      changeMessages(old => interruptTranscript(old, ref.current.speakingItem));
    }
    return sendTextNow(text);
  }, [changeMessages, sendEvent, sendTextNow]);

  const start = useCallback(async (textOnly = false, firstText = "") => {
    if (!["idle", "ended"].includes(ref.current.phase)) return;
    if (pending.current.size) { setError("Your previous transcript is still saving. Please wait, or use Retry if saving failed."); return; }
    setError(""); setDuration(0); setMuted(textOnly); setAudioBlocked(false);
    ref.current.duration = 0; ref.current.muted = textOnly;
    ref.current.messages = []; setMessages([]); setSaveState("empty");
    ref.current.id = crypto.randomUUID(); ref.current.createdAt = new Date().toISOString(); ref.current.revision = 0;
    transition("connecting");
    const controller = new AbortController(); abort.current = controller;
    const active = () => !controller.signal.aborted && mounted.current;
    connectTimer.current = setTimeout(() => { if (active() && ref.current.phase === "connecting") { end(); setError("The connection timed out. Check your network and try again."); } }, 35_000);
    try {
      if (!window.isSecureContext || !window.RTCPeerConnection) throw new Error("Live voice needs a secure browser. Open this page in the latest Chrome, Edge, or Safari.");
      const audioContext = new AudioContext(); context.current = audioContext;
      void audioContext.resume().catch(() => {});
      if (config?.provider === "gemini" && !apiKey) {
        const live = new GeminiLive({
          context: audioContext, settings, textOnly, signal: controller.signal, whisper: config.transcription === "whisper",
          onStream: capture => {
            stream.current = capture;
            const track = capture.getAudioTracks()[0];
            track.onended = () => { end(); setError("Your microphone was disconnected. Reconnect it and start again."); };
            setVoiceIsolation(!!(track.getSettings() as MediaTrackSettings & { voiceIsolation?: boolean }).voiceIsolation);
          },
          onEvent: data => {
            if (!active()) return;
            if (data.type === "input_audio_buffer.speech_started") changeMessages(old => interruptTranscript(old, ref.current.speakingItem));
            if (data.type === "response.output_audio_transcript.delta") ref.current.speakingItem = data.item_id || "";
            changeMessages(old => updateTranscript(old, data));
            if (data.type === "response.done") queueSave(true);
            if (ref.current.messages.length >= 480) { end(); setError("This conversation is full. Check the save status, then start a new conversation to continue."); }
          },
          onPhase: next => { if (active()) { if (next === "listening") ref.current.speakingItem = ""; transition(next); } },
          onLevel: (output, input) => { if (active()) { setLevel(output); setMicLevel(input); } },
          onBlocked: () => { if (active()) setAudioBlocked(true); },
          onError: message => { if (active()) { end(); setError(message); } },
          onNotice: message => { if (active()) setError(message); },
        });
        gemini.current = live;
        await live.connect();
        if (!active()) { live.close(); return; }
        if (connectTimer.current) clearTimeout(connectTimer.current);
        ref.current.startedAt = Date.now(); transition("listening");
        if (firstText.trim()) {
          changeMessages(old => [...old, { id: `text_${crypto.randomUUID()}`, role: "user", text: firstText.trim(), at: new Date().toISOString(), status: "final", source: "text" }]);
          live.sendText(firstText.trim());
        } else live.sendText("Greet me as Mira in one brief sentence and ask what is on my mind.");
        return;
      }
      let micAnalyser: AnalyserNode | undefined;
      let outputAnalyser: AnalyserNode | undefined;
      const connection = new RTCPeerConnection(); pc.current = connection;
      const remoteAudio = new Audio(); remoteAudio.autoplay = true; remoteAudio.setAttribute("playsinline", ""); audio.current = remoteAudio;
      connection.ontrack = event => {
        if (!active()) return;
        const remote = event.streams[0] || new MediaStream([event.track]);
        remoteAudio.srcObject = remote;
        void remoteAudio.play().catch(() => { if (active()) setAudioBlocked(true); });
        outputAnalyser = audioContext.createAnalyser(); outputAnalyser.fftSize = 256;
        audioContext.createMediaStreamSource(remote).connect(outputAnalyser);
      };
      if (textOnly) connection.addTransceiver("audio", { direction: "recvonly" });
      else {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access is unavailable in this browser. Open Mira in Chrome, Edge, or Safari.");
        const supported = navigator.mediaDevices.getSupportedConstraints() as MediaTrackSupportedConstraints & { voiceIsolation?: boolean };
        const capture = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: settings.noiseReduction, autoGainControl: true, channelCount: 1, ...(supported.voiceIsolation ? { voiceIsolation: settings.noiseReduction } : {}) }, video: false });
        if (!active()) { capture.getTracks().forEach(t => t.stop()); return; }
        stream.current = capture;
        const track = capture.getAudioTracks()[0];
        if (!track) throw new Error("No microphone was found. Connect one and try again.");
        track.onended = () => { end(); setError("Your microphone was disconnected. Reconnect it and start again."); };
        setVoiceIsolation(!!(track.getSettings() as MediaTrackSettings & { voiceIsolation?: boolean }).voiceIsolation);
        connection.addTrack(track, capture);
        micAnalyser = audioContext.createAnalyser(); micAnalyser.fftSize = 256;
        audioContext.createMediaStreamSource(capture).connect(micAnalyser);
      }
      const buffer = new Uint8Array(256);
      const rms = (analyser?: AnalyserNode) => {
        if (!analyser) return 0;
        analyser.getByteTimeDomainData(buffer); let sum = 0;
        for (const sample of buffer) sum += ((sample - 128) / 128) ** 2;
        return Math.min(1, Math.sqrt(sum / buffer.length) * 4);
      };
      let lastFrame = 0;
      const animate = (now: number) => {
        if (!active()) return;
        if (now - lastFrame > 65) { setLevel(rms(outputAnalyser)); setMicLevel(ref.current.muted ? 0 : rms(micAnalyser)); lastFrame = now; }
        frame.current = requestAnimationFrame(animate);
      };
      frame.current = requestAnimationFrame(animate);
      connection.onconnectionstatechange = () => {
        if (!active()) return;
        if (connection.connectionState === "failed" || connection.connectionState === "closed") { end(); setError("The call disconnected. Your transcript is kept below; start again to reconnect."); }
        if (connection.connectionState === "disconnected") disconnectTimer.current = setTimeout(() => { if (active() && connection.connectionState === "disconnected") { end(); setError("The connection was lost. Please check your network."); } }, 5000);
        if (connection.connectionState === "connected" && disconnectTimer.current) clearTimeout(disconnectTimer.current);
      };
      const channel = connection.createDataChannel("oai-events"); dc.current = channel;
      const seen = new Set<string>();
      channel.onmessage = event => {
        if (!active()) return;
        let data: RealtimeEvent & { event_id?: string };
        try { data = JSON.parse(event.data); } catch { return; }
        if (data.event_id) { if (seen.has(data.event_id)) return; seen.add(data.event_id); if (seen.size > 4000) seen.delete(seen.values().next().value!); }
        if (data.type === "input_audio_buffer.speech_started") {
          changeMessages(old => interruptTranscript(old, ref.current.speakingItem));
          ref.current.speakingItem = ""; transition("listening");
          // WebRTC's server-managed output buffer cancels and truncates unheard audio automatically.
        }
        if (data.type === "input_audio_buffer.speech_stopped") transition("thinking");
        if (data.type === "response.created") { ref.current.generating = true; if (ref.current.phase !== "speaking") transition("thinking"); }
        if (data.type === "response.output_audio_transcript.delta") ref.current.speakingItem = data.item_id || "";
        if (data.type === "output_audio_buffer.started") transition("speaking");
        if (data.type === "output_audio_buffer.stopped" || data.type === "output_audio_buffer.cleared") { ref.current.speakingItem = ""; transition("listening"); }
        changeMessages(old => updateTranscript(old, data));
        if (data.type === "conversation.item.input_audio_transcription.failed") setError("One turn could not be transcribed. You can still keep talking.");
        if (data.type === "response.done") {
          ref.current.generating = false;
          if (data.response?.status === "failed") { setError("Mira could not reply to that turn. Please try again."); transition("listening"); }
          const pendingText = ref.current.pendingText;
          ref.current.pendingText = "";
          if (pendingText) sendTextNow(pendingText);
          queueSave(true);
        }
        if (data.type === "error") {
          if (data.error?.code === "response_cancel_not_active") {
            ref.current.generating = false;
            const pendingText = ref.current.pendingText; ref.current.pendingText = "";
            if (pendingText) sendTextNow(pendingText);
          } else setError("The voice service reported an error. Try your last message again, or end and reconnect.");
        }
        if (ref.current.messages.length >= 480) { end(); setError("This conversation is full. Check the save status, then start a new conversation to continue."); }
      };
      channel.onopen = () => {
        if (!active()) return;
        if (connectTimer.current) clearTimeout(connectTimer.current);
        ref.current.startedAt = Date.now(); transition("listening");
        if (firstText.trim()) sendTextNow(firstText.trim());
        else { sendEvent({ type: "response.create", response: { instructions: "Greet the user warmly as Mira in one short sentence and ask what's on their mind. You are an AI companion. Do not deliver a feature explanation." } }); ref.current.generating = true; }
      };
      channel.onclose = () => { if (active()) { end(); setError("Your voice connection ended. Start again when you’re ready."); } };
      channel.onerror = () => { if (active()) { end(); setError("The live connection was interrupted. Please try again."); } };
      const offer = await connection.createOffer(); await connection.setLocalDescription(offer);
      const response = await fetch("/api/realtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sdp: offer.sdp, apiKey: apiKey || undefined, ...settings }), signal: controller.signal });
      if (!active()) return;
      if (!response.ok) { const data = await response.json() as { error?: string }; throw new Error(data.error || "Unable to connect. Please try again."); }
      await connection.setRemoteDescription({ type: "answer", sdp: await response.text() });
    } catch (failure) {
      if (!active()) return;
      cleanup(); transition("ended");
      const name = failure instanceof Error ? failure.name : "";
      setError(name === "NotAllowedError" ? "Microphone permission was not granted. Allow it in your browser’s site settings, then try again. You can also type a message." : name === "NotFoundError" ? "No microphone was found. Connect one or type a message instead." : name === "NotReadableError" ? "Your microphone is busy or unavailable. Close other apps using it and try again." : failure instanceof Error ? failure.message : "Unable to start the conversation.");
    }
  }, [apiKey, config, settings, changeMessages, cleanup, end, queueSave, sendEvent, sendTextNow, transition]);
  const toggleMic = useCallback(() => {
    if (!stream.current) return;
    ref.current.muted = !ref.current.muted;
    stream.current.getAudioTracks().forEach(track => { track.enabled = !ref.current.muted; });
    gemini.current?.setMicMuted(ref.current.muted);
    setMuted(ref.current.muted);
  }, []);
  const toggleVolume = useCallback(() => {
    if (gemini.current) { setVolumeMuted(previous => { gemini.current?.setVolumeMuted(!previous); return !previous; }); return; }
    if (!audio.current) return;
    audio.current.muted = !audio.current.muted; setVolumeMuted(audio.current.muted);
  }, []);
  const enableAudio = useCallback(async () => {
    try { await context.current?.resume(); await audio.current?.play(); setAudioBlocked(false); } catch { setError("Audio playback was blocked. Check your browser’s sound permissions."); }
  }, []);
  const reset = useCallback(() => {
    if (!["idle", "ended"].includes(ref.current.phase) || pending.current.size) return false;
    ref.current.messages = []; ref.current.duration = 0; ref.current.id = "";
    setMessages([]); setDuration(0); setError(""); setSaveState("empty"); transition("idle"); return true;
  }, [transition]);

  useEffect(() => {
    mounted.current = true;
    void fetchJson<Config>("/api/config").then(setConfig).catch(() => setError("Unable to check your connection. Refresh the page to try again."));
    try {
      const stored = JSON.parse(localStorage.getItem("mira.voice-preferences") || "null");
      if (stored && ["marin", "cedar", "coral", "sage"].includes(stored.voice) && ["far_field", "near_field"].includes(stored.microphone) && ["auto", "low"].includes(stored.pace) && ["auto", "en", "bn"].includes(stored.language) && typeof stored.noiseReduction === "boolean") setSettings(stored);
    } catch { /* Device preferences are optional. */ }
    const timer = setInterval(() => {
      if (["listening", "transcribing", "thinking", "speaking"].includes(ref.current.phase)) {
        const elapsed = Math.floor((Date.now() - ref.current.startedAt) / 1000);
        ref.current.duration = elapsed; setDuration(elapsed);
        if (elapsed && elapsed % 15 === 0) queueSave(true);
        if (elapsed >= 1800) { end(); setError("Your 30-minute session has ended. Start a new conversation whenever you’re ready."); }
      }
    }, 1000);
    const retryTimer = setInterval(() => { if (pending.current.size) void flush(); }, 15000);
    const beforeUnload = (event: BeforeUnloadEvent) => { if (pending.current.size) { event.preventDefault(); event.returnValue = ""; } };
    const pageHide = () => {
      end();
      for (const snapshot of pending.current.values()) {
        const content = JSON.stringify(snapshot);
        if (new Blob([content]).size < 60_000) void fetch("/api/conversations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: content, keepalive: true }).catch(() => {});
      }
    };
    window.addEventListener("beforeunload", beforeUnload); window.addEventListener("pagehide", pageHide);
    return () => {
      mounted.current = false; clearInterval(timer); clearInterval(retryTimer); if (saveTimer.current) clearTimeout(saveTimer.current);
      window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("pagehide", pageHide); cleanup();
    };
  }, [cleanup, end, flush, queueSave]);
  const updateSettings = useCallback((next: VoiceSettings) => {
    setSettings(next); try { localStorage.setItem("mira.voice-preferences", JSON.stringify(next)); } catch { /* Keep in-memory preferences. */ }
  }, []);
  return { phase, messages, duration, muted, volumeMuted, audioBlocked, level, micLevel, error, setError, saveState, config, settings, updateSettings, apiKey, setApiKey, voiceIsolation, start, end, toggleMic, toggleVolume, enableAudio, sendText, reset, retrySave: flush, currentId: ref.current.id, hasMicrophone: !!stream.current };
}
