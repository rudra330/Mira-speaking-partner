import assert from 'node:assert/strict';
import { firebaseConfig } from '../lib/auth/firebase-config.ts';
if (process.env.MIRA_AUTH_INTEGRATION !== '1') throw new Error('Set MIRA_AUTH_INTEGRATION=1 to run real Firebase checks with disposable test accounts.');
const base=process.env.MIRA_BASE_URL||'http://127.0.0.1:8787';
const request=(path,options={})=>fetch(base+path,{...options,signal:AbortSignal.timeout(25000)});
const firebase=async(method,body)=>{
 const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${firebaseConfig.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok)throw new Error(`Firebase ${method} failed: ${data.error?.message||response.status}`);return data;
};
const users=[];
try{
 const configResponse=await request('/api/config');assert.equal(configResponse.status,200);const config=await configResponse.json();assert.equal(config.configured,true);
 for(const route of ['/sign-in','/sign-up','/forgot-password'])assert.equal((await request(route)).status,200);
 assert.ok([403,404].includes((await request('/.env.local')).status));
 assert.equal((await request('/api/conversations')).status,401);
 assert.equal((await request('/api/gemini',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 assert.equal((await request('/api/conversations',{headers:{Authorization:'Bearer forged'}})).status,401);
 const password=crypto.randomUUID()+'Aa9!';const email=`mira-production-check-${crypto.randomUUID()}@example.com`;
 const first=await firebase('signUp',{email,password,returnSecureToken:true});users.push(first);
 await firebase('update',{idToken:first.idToken,displayName:'Mira production validation',returnSecureToken:false});
 const returning=await firebase('signInWithPassword',{email,password,returnSecureToken:true});assert.equal(returning.localId,first.localId);assert.equal(returning.displayName,'Mira production validation');
 await assert.rejects(firebase('signInWithPassword',{email,password:'incorrect!',returnSecureToken:true}));
 await firebase('sendOobCode',{email,requestType:'PASSWORD_RESET'});
 const second=await firebase('signUp',{email:`mira-production-check-${crypto.randomUUID()}@example.com`,password,returnSecureToken:true});users.push(second);
 const headers={Authorization:`Bearer ${returning.idToken}`,origin:base,'Content-Type':'application/json'};
 assert.equal((await request('/api/auth/session',{method:'POST',headers})).status,200,'authentication must work without D1');
 assert.equal((await request('/api/auth/session',{method:'POST',headers:{...headers,origin:'https://untrusted.example','x-forwarded-host':'untrusted.example'}})).status,403,'untrusted forwarded host must not change the app origin');
 for(const user of [first,second])assert.equal((await request('/api/conversations',{method:'PUT',headers:{...headers,Authorization:`Bearer ${user.idToken}`},body:'{}'})).status,410,'no new server transcript storage for either account');
 assert.equal((await request('/api/gemini',{method:'POST',headers:{...headers,origin:'https://unrelated.example'},body:'{}'})).status,403);
 const tokenResponse=await request('/api/gemini',{method:'POST',headers,body:JSON.stringify({voice:'marin',language:'en'})});assert.equal(tokenResponse.status,200);
 const credentials=await tokenResponse.json();
 await new Promise((resolve,reject)=>{
  const socket=new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token='+encodeURIComponent(credentials.token));socket.binaryType='arraybuffer';let audio=0,text=0;
  const timer=setTimeout(()=>{socket.close();reject(new Error('Live audio timed out'));},25000);
  socket.onopen=()=>socket.send(JSON.stringify({setup:{model:credentials.model}}));
  socket.onmessage=event=>{
   const data=JSON.parse(typeof event.data==='string'?event.data:new TextDecoder().decode(event.data));
   if(data.setupComplete)socket.send(JSON.stringify({clientContent:{turns:[{role:'user',parts:[{text:'Say hello in one short sentence.'}]}],turnComplete:true}}));
   text+=data.serverContent?.outputTranscription?.text?.length||0;
   for(const part of data.serverContent?.modelTurn?.parts||[])audio+=part.inlineData?.data?.length||0;
   if(data.serverContent?.turnComplete){clearTimeout(timer);socket.close();try{assert.ok(audio>0&&text>0);resolve();}catch(error){reject(error);}}
   if(data.error){clearTimeout(timer);socket.close();reject(new Error('Gemini Live returned a provider error'));}
  };
  socket.onerror=()=>{clearTimeout(timer);reject(new Error('Gemini Live connection failed'));};
 });
 console.log('Passed: production routes, real Firebase signup/name/returning sign-in/wrong-password rejection/reset request, auth without D1, both accounts denied new server saves, forged-token and origin rejection, private environment protection, and real Gemini spoken audio plus transcript.');
}finally{
 for(const user of users)await firebase('delete',{idToken:user.idToken});
 console.log('Removed only disposable production-check accounts. No user conversations were changed.');
}
