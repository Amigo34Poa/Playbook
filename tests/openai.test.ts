import test from 'node:test';
import assert from 'node:assert/strict';
import { openaiRequest, transcriptionSegments } from '../electron/openai-client.js';
import { clickStep, mergeNarration } from '../shared/logic.js';
import { frameSchema } from '../shared/schema.js';
import { randomUUID } from 'node:crypto';

test('OpenAI uses fixed HTTPS destination, bearer header and multipart WAV without screenshots', async () => {
  const form = new FormData(); form.append('model','whisper-1'); form.append('language','pt');
  form.append('file', new Blob(['RIFF fixture'],{type:'audio/wav'}),'narracao.wav');
  const result = await openaiRequest('fake-test-key','audio/transcriptions',{method:'POST',body:form},async (url,init) => {
    assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');
    assert.equal((init?.headers as any).Authorization,'Bearer fake-test-key');
    assert.equal(init?.redirect,'error');
    const body=init?.body as FormData;
    assert.equal(body.get('language'),'pt'); assert.equal(body.has('image'),false);
    assert.equal((body.get('file') as File).type,'audio/wav');
    return new Response(JSON.stringify({text:'Clique em Arquivo',segments:[{start:.2,end:1,text:'Clique em Arquivo'}]}));
  });
  assert.deepEqual(transcriptionSegments(result,20,21),[{start:20.2,end:21,text:'Clique em Arquivo'}]);
});
test('provider errors never expose key or returned error body; retries are not automatic', async () => {
  let calls=0;
  await assert.rejects(openaiRequest('secret','chat/completions',{},async () => { calls++; return new Response('secret + confidential user text',{status:401}); }), e => e instanceof Error && !e.message.includes('secret') && e.message.includes('Chave inválida'));
  assert.equal(calls,1);
  await assert.rejects(openaiRequest('secret','models',{},async () => { throw new Error('secret'); }), /Confira a internet/);
});
test('click steps retain exact UIA names and narration enriches the existing step', () => {
  const frame=frameSchema.parse({id:randomUUID(),at:4,image:'data:image/jpeg;base64,YQ==',width:800,height:600,cursor:{x:.4,y:.5},target:{x:.3,y:.4,width:.2,height:.1},action:{reason:'click',button:'left',controlName:'Arquivo',controlType:'Button',detection:'uia'}});
  const step=clickStep(frame); assert.equal(step.title,'Clique: Arquivo'); assert.equal(step.frameId,frame.id);
  const steps=mergeNarration([step],[{start:3,end:5,text:'Abra Arquivo para iniciar.'}],[frame]);
  assert.equal(steps.length,1); assert.match(steps[0].description,/Abra Arquivo/);
  assert.equal(frameSchema.safeParse({...frame,target:{x:.95,y:.4,width:.2,height:.1}}).success,false);
  // Old libraries remain readable with no action/target/original image.
  assert.ok(frameSchema.parse({id:randomUUID(),at:0,image:frame.image,width:800,height:600,cursor:frame.cursor}));
});
