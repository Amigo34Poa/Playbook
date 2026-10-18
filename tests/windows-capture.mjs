import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
if (process.platform !== 'win32') { console.log('Native click test requires Windows.'); process.exit(0); }
const children = [];
function launch(name, args=[]) {
  const child=spawn(`native/windows/build/${name}.exe`,args,{stdio:['pipe','pipe','inherit']}); children.push(child);
  const messages=[]; let error;
  child.on('error', e => { error=e; });
  createInterface({ input: child.stdout }).on('line', line => { messages.push(JSON.parse(line.replace(/^\uFEFF/,''))); });
  async function next(type) {
    const deadline=Date.now()+12000;
    while(Date.now()<deadline) {
      if(error)throw error;
      const i=messages.findIndex(m=>m.type===type); if(i>=0)return messages.splice(i,1)[0];
      const failure=messages.find(m=>m.type==='error'); if(failure)throw new Error(failure.message);
      await new Promise(r=>setTimeout(r,30));
    }
    throw new Error(`Timed out waiting for ${name}: ${type}`);
  }
  return {child,messages,next};
}
try {
  const fixture=launch('CaptureFixture'); const info=await fixture.next('ready');
  const recorder=launch('ClickRecorder',['all']); await recorder.next('ready');
  fixture.child.stdin.write('move\n'); await fixture.next('moved');
  await new Promise(r=>setTimeout(r,600));
  assert.equal(recorder.messages.filter(m=>m.type==='frame').length,0,'hover must not create steps');
  fixture.child.stdin.write('click\n');
  const frame=await recorder.next('frame'); await fixture.next('clicked');
  assert.equal(frame.action.reason,'click'); assert.equal(frame.action.button,'left');
  assert.equal(frame.action.detection,'uia'); assert.equal(frame.action.controlName,'Arquivo');
  assert.equal(frame.action.controlType,'Button');
  assert.ok(frame.capturedAtMs<=frame.atMs, 'must retain the pre-click image');
  assert.ok(frame.target.width>0 && frame.target.width<.5); assert.ok(frame.target.height>0 && frame.target.height<.3);
  const decoded=jpeg.decode(Buffer.from(frame.image.split(',')[1],'base64'));
  const x=Math.floor((info.sampleX-info.screenX)/info.screenWidth*decoded.width);
  const y=Math.floor((info.sampleY-info.screenY)/info.screenHeight*decoded.height);
  const index=(y*decoded.width+x)*4;
  assert.ok(decoded.data[index+2]>150 && decoded.data[index]<80,'image must show blue background from before button changed it to red');
  fixture.child.stdin.write('right\n'); const right=await recorder.next('frame'); assert.equal(right.action.button,'right');
  recorder.child.stdin.write('capture\nstop\n');
  const manual=await recorder.next('frame'); assert.equal(manual.action.reason,'manual');
  await new Promise((resolve,reject)=>{ if(recorder.child.exitCode!==null)return resolve(); const timer=setTimeout(()=>reject(new Error('helper did not exit')),8000); recorder.child.once('exit',()=>{clearTimeout(timer);resolve();}); });
  console.log('Windows native capture passed: real clicks, UIA Button, pre-click image pixels, hover ignored, right click, manual capture drained on stop.');
} finally { for(const child of children){ child.stdin.end('stop\n'); child.kill(); } }
