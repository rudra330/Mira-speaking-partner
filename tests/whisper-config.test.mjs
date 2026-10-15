import test from 'node:test';
import assert from 'node:assert/strict';
import { whisperConfiguration } from '../lib/whisper-config.ts';

test('OpenAI Whisper needs a key but no self-hosted URL and keeps its official destination', () => {
  const config = whisperConfiguration({ WHISPER_API_STYLE: 'openai', WHISPER_API_KEY: 'test-only', WHISPER_URL: 'https://unrelated.example' });
  assert.equal(config.endpoint.href, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(config.model, 'whisper-1');
  assert.equal(config.provider, 'openai');
  assert.equal(config.multipart, true);
  assert.equal(whisperConfiguration({ WHISPER_API_STYLE: 'openai' }), null);
  assert.equal(whisperConfiguration({ WHISPER_API_STYLE: 'openai', WHISPER_API_KEY: '  ' }), null);
  assert.equal(whisperConfiguration({ WHISPER_ENABLED: 'false', WHISPER_API_STYLE: 'openai', WHISPER_API_KEY: 'test-only' }), null);
});

test('self-hosted transcription keeps Speaches and raw endpoint formats', () => {
  const env = { WHISPER_API_KEY: 'test-only', WHISPER_URL: 'https://whisper.example/service' };
  const speaches = whisperConfiguration({ ...env, WHISPER_API_STYLE: 'speaches' });
  assert.equal(speaches.endpoint.href, 'https://whisper.example/service/v1/audio/transcriptions');
  assert.equal(speaches.model, 'Systran/faster-whisper-base');
  assert.equal(speaches.multipart, true);
  const raw = whisperConfiguration({ ...env, WHISPER_API_STYLE: 'raw' });
  assert.equal(raw.endpoint.href, 'https://whisper.example/service/transcribe');
  assert.equal(raw.multipart, false);
});

test('incomplete or insecure self-hosted configuration cannot enable Whisper', () => {
  const env = { WHISPER_API_KEY: 'test-only', WHISPER_API_STYLE: 'speaches' };
  for (const WHISPER_URL of [undefined, 'invalid', 'http://remote.example', 'ftp://whisper.example']) {
    assert.equal(whisperConfiguration({ ...env, WHISPER_URL }), null);
  }
  assert.ok(whisperConfiguration({ ...env, WHISPER_URL: 'http://127.0.0.1:8765' }));
});
