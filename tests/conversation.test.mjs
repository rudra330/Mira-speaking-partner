import test from "node:test";
import assert from "node:assert/strict";
import { updateTranscript, interruptTranscript, exportTranscript, timeLabel } from "../lib/conversation.ts";

test("reserves user turn order before asynchronous transcription completes", () => {
  let messages = updateTranscript([], {type:"input_audio_buffer.speech_started",item_id:"user1"});
  messages = updateTranscript(messages,{type:"response.output_audio_transcript.delta",item_id:"mira1",delta:"Hello!"});
  messages = updateTranscript(messages,{type:"conversation.item.input_audio_transcription.completed",item_id:"user1",transcript:"Hi Mira"});
  assert.deepEqual(messages.map(m=>[m.role,m.text]),[["user","Hi Mira"],["assistant","Hello!"]]);
});
test("late done events cannot restore text after an interruption", () => {
  let messages = updateTranscript([], {type:"response.output_audio_transcript.delta",item_id:"mira1",delta:"Let’s begin"});
  messages = interruptTranscript(messages,"mira1");
  messages = updateTranscript(messages,{type:"response.output_audio_transcript.delta",item_id:"mira1",delta:" with a long monologue"});
  messages = updateTranscript(messages,{type:"response.output_audio_transcript.done",item_id:"mira1",transcript:"Let’s begin with a long monologue"});
  assert.equal(messages[0].text,"Let’s begin");
  assert.equal(messages[0].status,"interrupted");
});
test("interruption does not change earlier completed replies",()=>{
 let messages=updateTranscript([],{type:"response.output_audio_transcript.done",item_id:"old",transcript:"First reply"});
 messages=updateTranscript(messages,{type:"response.output_audio_transcript.delta",item_id:"new",delta:"Second reply"});
 messages=interruptTranscript(messages,"new");
 assert.equal(messages[0].status,"final"); assert.equal(messages[1].status,"interrupted");
});
test("repeated final transcript event is idempotent and unrelated events ignored",()=>{
 const event={type:"conversation.item.input_audio_transcription.completed",item_id:"u1",transcript:"Hello"};
 const first=updateTranscript([],event);const second=updateTranscript(first,event);
 assert.deepEqual(first,second);assert.equal(updateTranscript(second,{type:"session.updated"}),second);
});
test("transcription failure preserves a visible turn instead of silently losing it",()=>{
 const messages=updateTranscript([],{type:"conversation.item.input_audio_transcription.failed",item_id:"u1"});
 assert.equal(messages[0].status,"final");assert.match(messages[0].text,/Could not transcribe/);
});
test("download labels interrupted speech and never includes credentials",()=>{
 const messages=interruptTranscript(updateTranscript([],{type:"response.output_audio_transcript.delta",item_id:"a1",delta:"Hello"}),"a1");
 assert.match(exportTranscript(messages,"Chat"),/interrupted; text may include unplayed words/);
 assert.equal(timeLabel(125),"02:05");
});
