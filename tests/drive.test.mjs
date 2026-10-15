import test from 'node:test';
import assert from 'node:assert/strict';
import { DriveClient, DRIVE_SCOPE, DriveError } from '../lib/drive/drive-client.ts';

const uid='account-one',email='mira-drive-check@example.com';
const props=(kind,owner=uid)=>({miraApp:'mira-speaking-partner',miraOwner:owner,miraKind:kind});
const at=new Date().toISOString();
const snapshot=(revision=1)=>({id:'ab4f2e33-37b1-44bd-9033-44bd7c270852',title:'Hello Mira',messages:[{id:'u1',role:'user',text:'Hello',at,status:'final',source:'voice'}],duration:12,revision,createdAt:at});
function fixture(options={}){
 const files=new Map([['folder-one',{id:'folder-one',name:'My Mira',mimeType:'application/vnd.google-apps.folder',parents:['root'],shared:false,appProperties:props('folder')}]]);
 const content=new Map(),calls=[];let serial=0,lost=false;
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 const transport=async(url,init={})=>{
  const parsed=new URL(url),method=init.method||'GET';calls.push({url,method,body:init.body,headers:new Headers(init.headers)});
  if(options.expired)return reply({error:{errors:[{reason:'authError'}]}},401);
  if(parsed.pathname.endsWith('/about'))return reply({user:{emailAddress:options.email||email}});
  if(parsed.pathname.endsWith('/generateIds'))return reply({ids:[`generated-${++serial}`]});
  if(parsed.pathname.startsWith('/upload/')){
   const parts=init.body.split(/\r\n/),jsons=parts.filter(part=>part.startsWith('{')).map(part=>JSON.parse(part));
   const [meta,data]=jsons;const id=parsed.pathname.split('/').at(-1)==='files'?meta.id:parsed.pathname.split('/').at(-1);
   if(method==='POST'&&files.has(id))return reply({},409);
   files.set(id,{...files.get(id),...meta,id,modifiedTime:at});content.set(id,data);
   if(options.loseResponse&&!lost){lost=true;throw new Error('connection lost after successful upload');}
   return reply({id});
  }
  const match=parsed.pathname.match(/\/files\/([^/]+)$/);
  if(match){
   const id=decodeURIComponent(match[1]),file=files.get(id);
   if(!file)return reply({},404);
   if(method==='PATCH'){Object.assign(file,JSON.parse(init.body));return reply(file);}
   if(parsed.searchParams.get('alt')==='media')return reply(content.get(id));
   return reply(file);
  }
  if(method==='POST'){
   const meta=JSON.parse(init.body),id=`folder-${++serial}`;files.set(id,{...meta,id,shared:false});return reply({id,name:meta.name});
  }
  const q=parsed.searchParams.get('q')||'';
  let result=[...files.values()].filter(file=>!file.trashed&&file.appProperties?.miraOwner===uid);
  if(q.includes("mimeType = 'application/vnd.google-apps.folder'"))result=result.filter(file=>file.mimeType==='application/vnd.google-apps.folder');
  if(q.includes("'folder-one' in parents"))result=result.filter(file=>file.parents?.includes('folder-one'));
  if(q.includes("miraConversation"))result=result.filter(file=>file.appProperties?.miraConversation===snapshot().id);
  return reply({files:result});
 };
 const store=new Map();const storage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
 const client=new DriveClient(uid,email,transport,options.noStorage?undefined:storage);
 const folder={id:'folder-one',name:'My Mira'};
 return {client,folder,files,content,calls,store,transport,storage};
}
test('Drive uses exactly drive.file and never saves before authorization',async()=>{
 assert.equal(DRIVE_SCOPE,'https://www.googleapis.com/auth/drive.file');
 const {client,folder,calls}=fixture();await assert.rejects(client.save(folder,snapshot()),/Reconnect/);assert.equal(calls.length,0);
});
test('Drive connection requires the same email as the signed-in Mira account',async()=>{
 const {client}=fixture({email:'another@example.com'});await assert.rejects(client.authorize('test-token',3600),/same email/);assert.equal(client.connected,false);
});
test('folder creation is private in My Drive with account ownership and no sharing API',async()=>{
 const {client,calls}=fixture();await client.authorize('test-token',3600);await client.createFolder('  My private Mira  ');
 const creation=JSON.parse(calls.find(call=>call.method==='POST').body);
 assert.deepEqual(creation.parents,['root']);assert.equal(creation.name,'My private Mira');assert.deepEqual(creation.appProperties,props('folder'));assert.ok(calls.every(call=>!call.url.includes('permissions')));
 await assert.rejects(client.createFolder('   '),/folder name/);
});
test('a completed transcript saves, lists, reopens, updates and moves to recoverable Drive trash',async()=>{
 const {client,folder,files,calls}=fixture();await client.authorize('test-token',3600);await client.save(folder,snapshot());
 const list=await client.list(folder);assert.equal(list.length,1);assert.equal(list[0].title,'Hello Mira');assert.equal(list[0].message_count,1);
 assert.deepEqual(await client.open(folder,list[0].id),snapshot());
 await client.save(folder,{...snapshot(2),title:'Updated'});assert.equal((await client.open(folder,list[0].id)).revision,2);assert.equal(files.size,2);
 await client.trash(folder,list[0].id);assert.equal((await client.list(folder)).length,0);assert.equal(files.get(list[0].id).trashed,true);
 assert.ok(calls.every(call=>call.method!=='DELETE'&&!call.url.includes('permissions')));
});
test('duplicate and stale saves never create another file or overwrite a newer revision',async()=>{
 const {client,folder,calls}=fixture();await client.authorize('test-token',3600);
 await Promise.all([client.save(folder,snapshot(2)),client.save(folder,snapshot(2)),client.save(folder,snapshot(1))]);
 assert.equal(calls.filter(call=>call.url.includes('/upload/')).length,1);assert.equal((await client.list(folder)).length,1);
});
test('a lost upload response recovers the same reserved ID on retry and after reload',async()=>{
 const f=fixture({loseResponse:true});await f.client.authorize('test-token',3600);await assert.rejects(f.client.save(f.folder,snapshot()),/could not be reached/);
 const restored=new DriveClient(uid,email,f.transport,f.storage);await restored.authorize('test-token',3600);await restored.save(f.folder,snapshot());
 assert.equal(f.calls.filter(call=>call.url.includes('/upload/')).length,1);assert.equal((await restored.list(f.folder)).length,1);
 assert.ok([...f.store.values()].every(value=>!value.includes('Hello')&&!value.includes('test-token')));
});
test('without browser storage, in-memory reserved IDs also prevent duplicate retries',async()=>{
 const f=fixture({loseResponse:true,noStorage:true});await f.client.authorize('test-token',3600);await assert.rejects(f.client.save(f.folder,snapshot()));await f.client.save(f.folder,snapshot());assert.equal(f.files.size,2);
});
test('shared or another Mira account’s folder cannot receive a transcript',async()=>{
 const f=fixture();await f.client.authorize('test-token',3600);f.files.get('folder-one').shared=true;await assert.rejects(f.client.save(f.folder,snapshot()),/private folder/);
 f.files.get('folder-one').shared=false;f.files.get('folder-one').appProperties.miraOwner='account-two';await assert.rejects(f.client.save(f.folder,snapshot()),/private folder/);assert.equal(f.calls.filter(call=>call.url.includes('/upload/')).length,0);
});
test('another account’s file and files outside the selected folder cannot be reopened or trashed',async()=>{
 const f=fixture();await f.client.authorize('test-token',3600);await f.client.save(f.folder,snapshot());const id=(await f.client.list(f.folder))[0].id;
 f.files.get(id).appProperties.miraOwner='account-two';await assert.rejects(f.client.open(f.folder,id),/does not belong/);await assert.rejects(f.client.trash(f.folder,id),/does not belong/);
 f.files.get(id).appProperties.miraOwner=uid;f.files.get(id).parents=['different-folder'];await assert.rejects(f.client.open(f.folder,id),/does not belong/);
});
test('expired/revoked access requests reconnection without overwriting a transcript',async()=>{
 const options={},f=fixture(options);await f.client.authorize('test-token',3600);options.expired=true;
 await assert.rejects(f.client.save(f.folder,snapshot()),error=>error instanceof DriveError&&error.reconnect);assert.equal(f.client.connected,false);assert.equal(f.files.size,1);
});
test('disconnect clears the token and blocks all further Drive requests',async()=>{
 const f=fixture();await f.client.authorize('test-token',3600);assert.equal(f.client.revokeToken(),'test-token');const count=f.calls.length;await assert.rejects(f.client.list(f.folder),/Reconnect/);assert.equal(f.calls.length,count);
});
test('invalid transcript JSON is rejected before rendering',async()=>{
 const f=fixture();await f.client.authorize('test-token',3600);await f.client.save(f.folder,snapshot());const id=(await f.client.list(f.folder))[0].id;f.content.set(id,{messages:'bad'});await assert.rejects(f.client.open(f.folder,id),/damaged/);
});
