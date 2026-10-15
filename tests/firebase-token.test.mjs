import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { verifyFirebaseToken } from '../lib/auth/firebase-token.ts';
import { authErrorMessage } from '../lib/auth/auth-errors.ts';

test('Firebase token verification rejects forged, expired and wrong-project identities', async () => {
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const other = await generateKeyPair('RS256');
  const now=Math.floor(Date.now()/1000);
  const token = (claims={}) => new SignJWT({sub:'user-one',auth_time:now,iat:now,exp:now+3600,iss:'https://securetoken.google.com/mira-speaking-partner',aud:'mira-speaking-partner',...claims}).setProtectedHeader({alg:'RS256',kid:'test-key'}).sign(privateKey);
  const key=async()=>publicKey;
  assert.deepEqual(await verifyFirebaseToken(await token(),key),{userId:'firebase:user-one'});
  for(const claims of [{aud:'other-project'},{iss:'https://example.com'},{exp:now-60},{sub:''},{sub:'x'.repeat(129)},{auth_time:now+60},{iat:now+60},{auth_time:'bad'}])await assert.rejects(verifyFirebaseToken(await token(claims),key));
  await assert.rejects(verifyFirebaseToken(await token(),async()=>other.publicKey));
  await assert.rejects(verifyFirebaseToken('not-a-token',key));
});

test('auth errors guide returning users and do not echo backend credentials',()=>{
  assert.match(authErrorMessage({code:'auth/email-already-in-use'}),/Sign in instead/);
  assert.match(authErrorMessage({code:'auth/unauthorized-domain'}),/authorize/);
  assert.match(authErrorMessage({code:'auth/operation-not-allowed'}),/enable/);
  assert.equal(authErrorMessage({message:'private-token-value'}).includes('private-token-value'),false);
});
