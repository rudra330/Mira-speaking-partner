import test from 'node:test';
import assert from 'node:assert/strict';
import { geminiVoices, geminiActivityDetection, defaultGeminiModel, geminiGenerationConfig } from '../lib/gemini-config.ts';

test('low-latency Live setup omits unsupported thinking config and preserves 2.5 overrides', () => {
  assert.equal(defaultGeminiModel, 'gemini-3.8-live');
  assert.equal('thinkingConfig' in geminiGenerationConfig(defaultGeminiModel, 'marin'), false);
  assert.equal(geminiGenerationConfig(defaultGeminiModel, 'marin').speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Sulafat');
  assert.deepEqual(geminiGenerationConfig('gemini-2.5-flash-native-audio-latest', 'marin').thinkingConfig, { thinkingBudget: 0 });
});

test('existing voice preferences resolve to the new warm, soft, and gentle voices', () => {
  assert.equal(geminiVoices.marin.name, 'Sulafat');
  assert.equal(geminiVoices.cedar.name, 'Achernar');
  assert.equal(geminiVoices.sage.name, 'Vindemiatrix');
  assert.ok(Object.values(geminiVoices).every(voice => !['Charon', 'Puck'].includes(voice.name)));
});

test('responsive native detection preserves the longer pause and manual Whisper modes', () => {
  const natural = geminiActivityDetection('auto', false);
  const patient = geminiActivityDetection('low', false);
  assert.equal(natural.startOfSpeechSensitivity, 'START_SENSITIVITY_HIGH');
  assert.equal(natural.endOfSpeechSensitivity, 'END_SENSITIVITY_HIGH');
  assert.equal(natural.silenceDurationMs, 500);
  assert.ok(natural.prefixPaddingMs > 0, 'retain the start of the spoken word');
  assert.equal(patient.silenceDurationMs, 1000);
  assert.deepEqual(geminiActivityDetection('auto', true), { disabled: true });
});
