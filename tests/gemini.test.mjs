import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { GeminiLive } from '../lib/gemini-live.ts';
import { updateTranscript, interruptTranscript, defaultSettings } from '../lib/conversation.ts';

function fixture() {
  let messages = []; let speaking = ''; const phases = [];
  const node = () => ({ connect() {}, disconnect() {}, gain: { value: 1 } });
  const live = new GeminiLive({ context: { currentTime: 1, createGain: node, createAnalyser: node }, settings: defaultSettings, signal: new AbortController().signal,
    onEvent: event => {
      if (event.type === 'input_audio_buffer.speech_started') messages = interruptTranscript(messages, speaking);
      if (event.type === 'response.output_audio_transcript.delta') speaking = event.item_id;
      messages = updateTranscript(messages, event);
    }, onPhase: phase => { phases.push(phase); if (phase === 'listening') speaking = ''; }, onLevel() {}, onError() {}, onBlocked() {}, onStream() {},
  });
  return { live, messages: () => messages, phases };
}
test('Gemini keeps cumulative user transcription, including a late fragment', () => {
  const { live, messages } = fixture();
  live.handleContent({ inputTranscription: { text: 'Hello' } });
  live.handleContent({ outputTranscription: { text: 'Hi there.' } });
  live.handleContent({ inputTranscription: { text: ' Mira' } });
  live.handleContent({ turnComplete: true });
  assert.deepEqual(messages().map(m => [m.role, m.text, m.status]), [['user', 'Hello Mira', 'final'], ['assistant', 'Hi there.', 'final']]);
});

test('input transcripts appear as partial text while the user is still speaking', () => {
  const { live, messages, phases } = fixture();
  live.handleContent({ inputTranscription: { text: 'Hello' } });
  live.handleContent({ inputTranscription: { text: ' Mira' } });
  assert.equal(messages()[0].text, 'Hello Mira');
  assert.equal(messages()[0].status, 'partial');
  assert.equal(phases.at(-1), 'listening');
  live.handleContent({ turnComplete: true });
  assert.equal(messages()[0].status, 'final');
});
test('Gemini barge-in stops queued sound and marks the unfinished reply', () => {
  const { live, messages } = fixture(); let stopped = 0;
  live.handleContent({ outputTranscription: { text: 'A longer answer' } });
  live.sources.add({ stop() { stopped++; }, disconnect() {} });
  live.handleContent({ interrupted: true });
  assert.equal(stopped, 1); assert.equal(live.sources.size, 0);
  assert.equal(messages()[0].status, 'interrupted');
  live.handleContent({ inputTranscription: { text: 'Actually, change the topic.' } });
  live.handleContent({ outputTranscription: { text: 'Of course.' }, turnComplete: true });
  assert.equal(messages()[0].text, 'A longer answer');
  assert.equal(messages().at(-1).text, 'Of course.');
});
test('typed interruption ignores stale output until Gemini acknowledges the interruption', () => {
  const { live, messages } = fixture(); const sent = [];
  live.ready = true; live.socket = { readyState: 1, send: data => sent.push(JSON.parse(data)) };
  live.handleContent({ outputTranscription: { text: 'Old answer' } });
  assert.equal(live.sendText('New question'), true);
  live.handleContent({ outputTranscription: { text: ' stale words' } });
  assert.equal(messages()[0].text, 'Old answer');
  live.handleContent({ interrupted: true, turnComplete: true });
  live.handleContent({ outputTranscription: { text: 'New answer' }, turnComplete: true });
  assert.equal(sent[0].clientContent.turnComplete, true);
  assert.equal(messages().at(-1).text, 'New answer');
});

test('local speech stops playback before server acknowledgement and preserves the new turn', () => {
  const { live, messages, phases } = fixture(); let stopped = 0;
  const sent = [];
  live.ready = true; live.socket = { readyState: 1, send: data => sent.push(JSON.parse(data)) };
  live.handleContent({ inputTranscription: { text: 'My first question.' } });
  live.handleContent({ outputTranscription: { text: 'A long answer' } });
  live.sources.add({ stop() { stopped++; }, disconnect() {} });
  live.nativeSpeechStarted();
  assert.equal(stopped, 1, 'stop locally before any server response');
  assert.equal(phases.at(-1), 'listening');
  assert.equal(messages()[1].status, 'interrupted');
  live.handleContent({ outputTranscription: { text: ' stale words' } });
  assert.equal(messages()[1].text, 'A long answer');
  live.handleContent({ inputTranscription: { text: 'Actually, ' } });
  live.handleContent({ interrupted: true });
  live.handleContent({ turnComplete: true });
  live.handleContent({ inputTranscription: { text: 'change the topic.' } });
  assert.equal(messages().at(-1).text, 'Actually, change the topic.');
  assert.equal(messages().at(-1).status, 'partial');
  live.nativeSpeechEnded();
  assert.deepEqual(sent, [{ realtimeInput: { audioStreamEnd: true } }]);
  assert.equal(phases.at(-1), 'thinking');
  live.handleContent({ outputTranscription: { text: 'Of course.' }, turnComplete: true });
  assert.deepEqual(messages().map(m => [m.role, m.text, m.status]), [
    ['user', 'My first question.', 'final'], ['assistant', 'A long answer', 'interrupted'],
    ['user', 'Actually, change the topic.', 'final'], ['assistant', 'Of course.', 'final'],
  ]);
});

test('local interruption also clears audio after the server finished generating', () => {
  const { live, messages } = fixture(); let stopped = 0;
  live.ready = true;
  live.sources.add({ stop() { stopped++; }, disconnect() {} });
  live.handleContent({ outputTranscription: { text: 'An already generated answer.' }, turnComplete: true });
  live.nativeSpeechStarted();
  assert.equal(stopped, 1);
  assert.equal(messages()[0].status, 'interrupted');
  live.nativeSpeechEnded();
  live.handleContent({ inputTranscription: { text: 'My next question.' } });
  live.handleContent({ outputTranscription: { text: 'A new reply.' }, turnComplete: true });
  assert.equal(messages().at(-1).text, 'A new reply.');
});

test('speech callbacks after mute or close cannot interrupt or send data', () => {
  const { live } = fixture(); const sent = [];
  live.ready = true; live.socket = { readyState: 1, send: data => sent.push(data) };
  live.muted = true; live.nativeSpeechStarted(); live.nativeSpeechEnded();
  live.muted = false; live.closed = true; live.nativeSpeechStarted(); live.nativeSpeechEnded();
  assert.equal(live.nativeSpeaking, false); assert.equal(sent.length, 0);
});

test('pause flushing during model loading cannot suppress playback or create a new turn', () => {
  const { live } = fixture(); const sent = [];
  live.ready = true; live.socket = { readyState: 1, send: data => sent.push(JSON.parse(data)) };
  live.handleContent({ outputTranscription: { text: 'An answer in progress.' } });
  live.finalizeNativeAudio();
  assert.equal(live.nativeSpeaking, false);
  assert.equal(live.dropOutput, false);
  assert.equal(sent.length, 1);
  live.nativeSpeechEnded();
  assert.equal(sent.length, 1, 'duplicate end signals are ignored');
});
test('microphone mute flushes capture state and tells Gemini the audio stream ended', () => {
  const { live } = fixture(); const sent = []; const port = [];
  live.ready = true; live.socket = { readyState: 1, send: data => sent.push(JSON.parse(data)) };
  live.capture = { port: { postMessage: data => port.push(data) } };
  live.setMicMuted(true);
  assert.deepEqual(sent, [{ realtimeInput: { audioStreamEnd: true } }]);
  assert.deepEqual(port, [{ enabled: false }]);
});
test('audio capture downsamples 48 kHz microphone input to 16 kHz and stops while muted', () => {
  let Processor; const chunks = [];
  const sandbox = { sampleRate: 48000, AudioWorkletProcessor: class { port = { postMessage: buffer => chunks.push(new Int16Array(buffer)), onmessage: null }; }, registerProcessor: (_name, type) => { Processor = type; } };
  vm.runInNewContext(readFileSync(new URL('../public/mira-pcm-worklet.js', import.meta.url), 'utf8'), sandbox);
  const processor = new Processor();
  processor.process([[new Float32Array(4800).fill(0.2)]]);
  assert.equal(chunks.length, 5); assert.equal(chunks[0].length, 320);
  assert.ok(Math.abs(chunks[0][0] - 6553) <= 1);
  processor.port.onmessage({ data: { enabled: false } });
  processor.process([[new Float32Array(4800).fill(1)]]);
  assert.equal(chunks.length, 5);
});
