import test from 'node:test';
import assert from 'node:assert/strict';
import { registerWithName, retryAuthConnection } from '../lib/auth/auth-actions.ts';
const network={code:'auth/network-request-failed'};
test('partial signup recovers the existing account and saves its name without creating twice',async()=>{
 let creates=0,signins=0,profiles=0;
 const credential={user:{uid:'same-user'}};
 const result=await registerWithName({},'test@example.com','synthetic-password',' Mira ',{
  create:async()=>{creates++;throw network;},signIn:async()=>{signins++;return credential;},profile:async(user,data)=>{profiles++;assert.equal(user.uid,'same-user');assert.equal(data.displayName,'Mira');if(profiles===1)throw network;}
 });
 assert.equal(result,credential);assert.equal(creates,1);assert.equal(signins,1);assert.equal(profiles,2);
});
test('existing-account and invalid-password errors are not retried or hidden',async()=>{
 let signins=0;
 await assert.rejects(registerWithName({},'test@example.com','password','Mira',{create:async()=>{throw{code:'auth/email-already-in-use'};},signIn:async()=>{signins++;},profile:async()=>{}}));
 assert.equal(signins,0);
 let attempts=0;await assert.rejects(retryAuthConnection(async()=>{attempts++;throw{code:'auth/invalid-credential'};}));assert.equal(attempts,1);
});
test('network retry is bounded when Firebase stays unavailable',async()=>{
 let attempts=0;await assert.rejects(retryAuthConnection(async()=>{attempts++;throw network;}));assert.equal(attempts,2);
});
