import test from 'node:test';
import assert from 'node:assert/strict';
import { UtteranceRecorder, pcmToWav } from '../lib/whisper-recorder.ts';
import { GeminiLive } from '../lib/gemini-live.ts';

test('speech recording retains onset, ends on a pause, and encodes real PCM16 WAV', () => {
  let starts = 0; const clips = [];
  const recorder = new UtteranceRecorder(() => starts++, clip => clips.push(clip));
  const silence = () => new Int16Array(800);
  for (let i = 0; i < 10; i++) recorder.push(silence());
  for (let i = 0; i < 12; i++) recorder.push(new Int16Array(800).fill(5000));
  for (let i = 0; i < 8; i++) recorder.push(silence());
  assert.equal(clips.length, 0, 'a brief pause must not cut the sentence');
  recorder.push(silence());
  assert.equal(starts, 1); assert.equal(clips.length, 1);
  const data = new DataView(clips[0]);
  assert.equal(data.getUint32(24, true), 16000);
  assert.equal(data.getUint16(22, true), 1);
  assert.equal(data.getUint32(40, true), clips[0].byteLength - 44);
  assert.ok(clips[0].byteLength > 16000);
  for (let i = 0; i < 40; i++) recorder.push(silence());
  assert.equal(clips.length, 1, 'silence must not become new user turns');
});

test('short noise releases listening state and long speech is bounded', () => {
  let stops = 0; const clips = [];
  const recorder = new UtteranceRecorder(() => {}, clip => clips.push(clip), 650, () => stops++);
  for (let i = 0; i < 3; i++) recorder.push(new Int16Array(800).fill(5000));
  for (let i = 0; i < 13; i++) recorder.push(new Int16Array(800));
  assert.equal(stops, 1); assert.equal(clips.length, 0);
  for (let i = 0; i < 310; i++) recorder.push(new Int16Array(800).fill(5000));
  assert.equal(clips.length, 1); assert.ok(clips[0].byteLength <= 480044);
  recorder.reset(); recorder.flush(); assert.equal(clips.length, 1);
});

test('give me more time preserves a long pause without splitting speech', () => {
  const clips = [];
  const recorder = new UtteranceRecorder(() => {}, clip => clips.push(clip), 1100);
  for (let i = 0; i < 12; i++) recorder.push(new Int16Array(800).fill(5000));
  for (let i = 0; i < 20; i++) recorder.push(new Int16Array(800));
  assert.equal(clips.length, 0);
  recorder.push(new Int16Array(800)); recorder.push(new Int16Array(800));
  assert.equal(clips.length, 1);
});

function fixture() {
  const sent = []; const events = []; const phases = [];
  const node = () => ({ connect() {}, disconnect() {}, gain: { value: 1 } });
  const controller = new AbortController();
  const live = new GeminiLive({ context: { currentTime: 1, createGain: node, createAnalyser: node }, whisper: true,
    settings: { language: 'en' }, signal: controller.signal, textOnly: false,
    onEvent: event => events.push(event), onPhase: phase => phases.push(phase), onLevel() {}, onBlocked() {}, onStream() {}, onError: message => { throw new Error(message); },
  });
  live.ready = true; live.socket = { readyState: 1, send: value => sent.push(JSON.parse(value)) };
  return { live, sent, events, phases, controller };
}

test('Whisper text is displayed and sent to Gemini; microphone bytes are not sent to Gemini', async t => {
  const { live, sent, events } = fixture();
  const wav = pcmToWav([new Int16Array(16000).fill(3000)]);
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/api/transcribe?language=en');
    assert.equal(init.headers['Content-Type'], 'audio/wav');
    assert.equal(init.body, wav);
    return Response.json({ text: 'Can you hear me?' });
  });
  live.recordings.push(wav);
  await live.transcribeRecordings();
  assert.equal(events[0].transcript, 'Can you hear me?');
  assert.equal(events[0].type, 'conversation.item.input_audio_transcription.completed');
  assert.deepEqual(sent, [{ realtimeInput: { activityStart: {} } }, { realtimeInput: { text: 'Can you hear me?' } }, { realtimeInput: { activityEnd: {} } }]);
});

test('speaking cancels server generation immediately and sends the next text after interruption acknowledgement', () => {
  const { live, sent, events } = fixture(); let stopped = 0;
  live.sendText('First question');
  live.sources.add({ stop() { stopped++; }, disconnect() {} });
  live.interruptWhisperReply();
  live.sendText('Actually, a different question');
  assert.equal(stopped, 1); assert.equal(sent.length, 4);
  assert.deepEqual(sent[3], { realtimeInput: { activityStart: {} } });
  const before = events.length;
  live.handleContent({ outputTranscription: { text: 'stale answer' } });
  assert.equal(events.length, before);
  live.handleContent({ interrupted: true, turnComplete: true });
  assert.equal(sent.length, 6, 'reuse the open activity; do not cancel it a second time');
  assert.equal(sent[4].realtimeInput.text, 'Actually, a different question');
  assert.deepEqual(sent[5], { realtimeInput: { activityEnd: {} } });
  live.handleContent({ outputTranscription: { text: 'The new answer' }, turnComplete: true });
  assert.ok(events.some(event => event.delta === 'The new answer'));
});

test('ending a conversation discards late Whisper results', async t => {
  const { live, sent, events, controller } = fixture();
  t.mock.method(globalThis, 'fetch', async () => { controller.abort(); return Response.json({ text: 'Late words' }); });
  live.recordings.push(pcmToWav([new Int16Array(16000)]));
  await live.transcribeRecordings();
  assert.equal(events.length, 0); assert.equal(sent.length, 0);
});
