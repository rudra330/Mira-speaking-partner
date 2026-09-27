import test from 'node:test';
import assert from 'node:assert/strict';
import { attachVisemes, resetMouth, loadVisemeWorklet } from '../lib/avatar-audio.ts';

test('lip sync observes playback without replacing it, and detaches only its own tap', () => {
  const audible = {};
  const connections = new Set([audible]);
  const source = { connect: node => connections.add(node), disconnect: node => connections.delete(node) };
  let stopped = false, closed = false, enabled = true;
  const processor = { visemeAlphas: [1], visemeActive: 0, stop: () => { stopped = true; }, port: { close: () => { closed = true; } } };
  const head = { isSpeaking: false, mtAvatar: { viseme_aa: { realtime: 0, needsUpdate: false }, eyeBlinkLeft: { realtime: .2 } } };
  const detach = attachVisemes(source, processor, head, () => enabled);
  processor.onstarted(); processor.onvalue('viseme_aa', .65);
  assert.equal(head.isSpeaking, true);
  assert.equal(head.mtAvatar.viseme_aa.realtime, .65);
  enabled = false; resetMouth(head, processor);
  processor.onvalue('viseme_aa', .5);
  assert.equal(head.mtAvatar.viseme_aa.realtime, 0);
  assert.equal(head.mtAvatar.eyeBlinkLeft.realtime, .2);
  assert.equal(processor.visemeActive, -1);
  const lateMessage = processor.onvalue;
  detach(); lateMessage('viseme_aa', .7);
  assert.equal(head.mtAvatar.viseme_aa.realtime, 0);
  assert.deepEqual([...connections], [audible]);
  assert.equal(stopped && closed, true);
});

test('switching tabs can reattach without registering the worklet twice', async () => {
  let calls = 0;
  const context = { audioWorklet: { addModule: async () => { calls++; } } };
  await Promise.all([loadVisemeWorklet(context), loadVisemeWorklet(context)]);
  await loadVisemeWorklet(context);
  assert.equal(calls, 1);
});

test('a temporary worklet load failure can be retried', async () => {
  let calls = 0;
  const context = { audioWorklet: { addModule: async () => { if (++calls === 1) throw Error('offline'); } } };
  await assert.rejects(loadVisemeWorklet(context));
  await loadVisemeWorklet(context);
  assert.equal(calls, 2);
});

test('HeadAudio recognizes aa, including index zero, and silence releases the mouth', async () => {
  globalThis.AudioWorkletNode = class { constructor() { this.port = { onmessage: null }; } };
  const { HeadAudio } = await import('../lib/vendor/headaudio.min.mjs');
  const processor = new HeadAudio({}, { processorOptions: {} });
  const values = {};
  processor.onvalue = (key, value) => { values[key] = value; };
  processor.port.onmessage({ data: { event: 'viseme', viseme: 0 } });
  processor.update(100);
  assert.ok(values.viseme_aa > .5);
  processor.port.onmessage({ data: { event: 'ended' } });
  processor.update(100);
  assert.ok(Math.abs(values.viseme_aa) < 1e-10);
  delete globalThis.AudioWorkletNode;
});
