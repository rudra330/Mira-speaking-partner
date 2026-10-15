import assert from 'node:assert/strict';
import test from 'node:test';
import { requestOrigin } from '../lib/request-origin.ts';

test('Next internal localhost URL uses the actual browser destination',()=>{
 assert.equal(requestOrigin(new Request('http://localhost:8787/api/auth/session',{headers:{host:'127.0.0.1:8787'}})),'http://127.0.0.1:8787');
});
test('Vercel HTTPS destination retains the deployment host and protocol',()=>{
 assert.equal(requestOrigin(new Request('https://internal.example/api/gemini',{headers:{host:'mira-example.vercel.app'}})),'https://mira-example.vercel.app');
});
test('forged forwarded host does not authorize another website',()=>{
 assert.equal(requestOrigin(new Request('https://mira-example.vercel.app/api/gemini',{headers:{host:'mira-example.vercel.app','x-forwarded-host':'attacker.example'}})),'https://mira-example.vercel.app');
});
test('missing Host preserves Cloudflare URL behavior',()=>{
 assert.equal(requestOrigin(new Request('https://mira.example/api/gemini')),'https://mira.example');
});
test('malformed Host cannot add credentials or URL paths',()=>{
 for(const host of ['attacker.example/path','attacker@example.com','example.com?query'])assert.equal(requestOrigin(new Request('https://mira.example/api/gemini',{headers:{host}})),'https://mira.example');
});
