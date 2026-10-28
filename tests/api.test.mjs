import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import worker from '../worker/index.js';

const key = 'test-edit-key-only-never-a-live-credential';
const hash = createHash('sha256').update(key).digest('hex');
const document = {title:'Роудмап команды',earlyDeadline:'2026-11-02',deadline:'2026-11-05',note:'Уточнить срок',tasks:[{id:'one',name:'Тренажёры',owner:'Саша1 · Юля',start:'2026-10-28',end:'2026-10-29',status:'todo',actions:'Решить кейсы',result:'Ответы бота',depends:'Доступ',notes:'',optional:false,milestone:false}]};
// The fake replaces external R2 only. It models documented conditional writes.
class Bucket {
  value=null; n=0;
  async get(){const item=this.value; return item && {...item,json:async()=>JSON.parse(item.text)};}
  async put(_key,text,{onlyIf}={}){
    const match=onlyIf?.get('If-Match'), absent=onlyIf?.get('If-None-Match');
    if((match && this.value?.httpEtag!==match)||(absent==='*'&&this.value)) return null;
    const etag=String(++this.n); this.value={text,etag,httpEtag:'"'+etag+'"'}; return this.value;
  }
}
const env=()=>({BUCKET:new Bucket(),EDIT_KEY_SHA256:hash,ALLOWED_ORIGIN:'https://alex-pletnev.github.io'});
const req=(method='GET',data,auth=key,origin='https://alex-pletnev.github.io')=>new Request('https://service.example/api/roadmap',{method,headers:{Origin:origin,...(auth?{Authorization:'Bearer '+auth}:{}),'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
test('an unauthenticated visitor cannot change the shared document',async()=>{const e=env(); const r=await worker.fetch(req('PUT',{document,expectedRevision:'initial',actor:'Юля'},null),e,{});assert.equal(r.status,401);assert.equal(e.BUCKET.value,null);});
test('an authorized save is visible in a separate subsequent request',async()=>{const e=env();const s=await worker.fetch(req('PUT',{document,expectedRevision:'initial',actor:'Юля'}),e,{});assert.equal(s.status,200);const read=await worker.fetch(req('GET',null,null),e,{});const body=await read.json();assert.equal(body.document.tasks[0].owner,'Саша1 · Юля');assert.equal(body.updatedBy,'Юля');assert.notEqual(body.revision,'initial');});
test('a stale editor cannot overwrite another editor’s saved changes',async()=>{const e=env();await worker.fetch(req('PUT',{document,expectedRevision:'initial',actor:'Юля'}),e,{});const r=await worker.fetch(req('PUT',{document:{...document,title:'Stale edit'},expectedRevision:'initial',actor:'Саша1'}),e,{});assert.equal(r.status,409);const current=await (await worker.fetch(req(),e,{})).json();assert.equal(current.document.title,'Роудмап команды');});
test('bad calendar dates are rejected without changing shared state',async()=>{const e=env();const bad=structuredClone(document);bad.tasks[0].start='2026-02-31';const r=await worker.fetch(req('PUT',{document:bad,expectedRevision:'initial',actor:'Юля'}),e,{});assert.equal(r.status,400);assert.equal(e.BUCKET.value,null);});
test('empty titles and duplicate task identities are rejected',async()=>{for(const bad of [{...document,title:''},{...document,tasks:[document.tasks[0],document.tasks[0]]}]){const e=env();const r=await worker.fetch(req('PUT',{document:bad,expectedRevision:'initial',actor:'Юля'}),e,{});assert.equal(r.status,400);assert.equal(e.BUCKET.value,null);}});
test('a different website is not granted cross-origin write access',async()=>{const e=env();const r=await worker.fetch(req('PUT',{document,expectedRevision:'initial',actor:'Юля'},key,'https://unrelated.example'),e,{});assert.equal(r.status,403);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);});
test('the allowed Pages origin gets a preflight response for authenticated saves',async()=>{const r=await worker.fetch(new Request('https://service.example/api/roadmap',{method:'OPTIONS',headers:{Origin:'https://alex-pletnev.github.io','Access-Control-Request-Method':'PUT'}}),env(),{});assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://alex-pletnev.github.io');});
test('non-string task identifiers are rejected before storage',async()=>{for(const id of [null,123,['one'],undefined]){const e=env(),bad=structuredClone(document);bad.tasks[0].id=id;const r=await worker.fetch(req('PUT',{document:bad,expectedRevision:'initial',actor:'Юля'}),e,{});assert.equal(r.status,400);assert.equal(e.BUCKET.value,null);}});
