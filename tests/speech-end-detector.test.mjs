import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechEndDetector } from '../lib/speech-end-detector.ts';

test('separated clicks do not accumulate into a speech ending', () => {
  let ends = 0;
  const detector = new SpeechEndDetector(() => ends++);
  const noise = new Int16Array(320).fill(4000), silence = new Int16Array(320);
  for (let i = 0; i < 10; i++) { detector.push(noise); detector.push(silence); detector.push(silence); }
  for (let i = 0; i < 25; i++) detector.push(silence);
  assert.equal(ends, 0);
});

test('hybrid VAD flushes once after a full pause, never during a brief gap', () => {
  let ends = 0;
  const detector = new SpeechEndDetector(() => ends++);
  const voice = new Int16Array(320).fill(4000), silence = new Int16Array(320);
  for (let i = 0; i < 20; i++) detector.push(voice);
  for (let i = 0; i < 20; i++) detector.push(silence);
  assert.equal(ends, 0);
  detector.push(voice);
  for (let i = 0; i < 25; i++) detector.push(silence);
  assert.equal(ends, 1);
  for (let i = 0; i < 100; i++) detector.push(silence);
  assert.equal(ends, 1);
});

test('noise, muted resets, and longer-pause preferences do not end a turn early', () => {
  let ends = 0;
  const detector = new SpeechEndDetector(() => ends++, 1000);
  const voice = new Int16Array(320).fill(4000), silence = new Int16Array(320);
  for (let i = 0; i < 3; i++) detector.push(voice);
  for (let i = 0; i < 50; i++) detector.push(silence);
  assert.equal(ends, 0);
  for (let i = 0; i < 20; i++) detector.push(voice);
  detector.reset();
  for (let i = 0; i < 50; i++) detector.push(silence);
  assert.equal(ends, 0);
  for (let i = 0; i < 20; i++) detector.push(voice);
  for (let i = 0; i < 49; i++) detector.push(silence);
  assert.equal(ends, 0);
  detector.push(silence);
  assert.equal(ends, 1);
});
