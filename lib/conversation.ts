export type Message = { id: string; role: "user" | "assistant"; text: string; at: string; status: "partial" | "final" | "interrupted"; source: "voice" | "text" };
export type Snapshot = { id: string; title: string; messages: Message[]; duration: number; revision: number; createdAt: string };
export type HistoryEntry = { id: string; title: string; message_count: number; duration: number; created_at: string; updated_at: string };
export type VoiceSettings = { voice: "marin" | "cedar" | "coral" | "sage"; noiseReduction: boolean; microphone: "near_field" | "far_field"; pace: "auto" | "low"; language: "auto" | "en" | "bn" };
export const defaultSettings: VoiceSettings = { voice: "marin", noiseReduction: true, microphone: "far_field", pace: "auto", language: "auto" };
export type RealtimeEvent = { type: string; item_id?: string; delta?: string; transcript?: string; error?: { message?: string; code?: string }; item?: { id: string; role?: string }; response?: { id: string; status?: string; status_details?: { error?: { message?: string } } } };

/** Immutable event reducer. Interrupted items must never regain unplayed text. */
export function updateTranscript(messages: Message[], event: RealtimeEvent): Message[] {
  const id = event.item_id || event.item?.id;
  if (!id) return messages;
  const input = event.type === "input_audio_buffer.speech_started" || event.type.startsWith("conversation.item.input_audio_transcription.");
  const output = event.type.startsWith("response.output_audio_transcript.");
  if (!input && !output) return messages;
  const index = messages.findIndex(m => m.id === id);
  const previous = index >= 0 ? messages[index] : undefined;
  if (previous?.status === "interrupted") return messages;
  const done = event.type.endsWith(".completed") || event.type.endsWith(".done");
  if (previous?.status === "final" && !done) return messages;
  let text = done ? (event.transcript ?? previous?.text ?? "") : (previous?.text ?? "") + (event.delta ?? "");
  if (event.type.endsWith(".failed")) text = "[Could not transcribe this turn]";
  const next: Message = { id, role: input ? "user" : "assistant", text, at: previous?.at ?? new Date().toISOString(), status: done || event.type.endsWith(".failed") ? "final" : "partial", source: "voice" };
  if (index < 0) return [...messages, next];
  return messages.map((m, i) => i === index ? next : m);
}
export function interruptTranscript(messages: Message[], itemId?: string): Message[] {
  return messages.map(m => m.role === "assistant" && (m.id === itemId || m.status === "partial") ? { ...m, status: "interrupted" } : m);
}
export function exportTranscript(messages: Message[], title: string) {
  return `${title}\nMira conversation transcript\n\n${messages.map(m => `${m.role === "user" ? "You" : "Mira"} (${new Date(m.at).toLocaleTimeString()})${m.status === "interrupted" ? " [interrupted; text may include unplayed words]" : ""}\n${m.text || "[No transcript available]"}`).join("\n\n")}`;
}
export function timeLabel(seconds: number) { return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`; }
