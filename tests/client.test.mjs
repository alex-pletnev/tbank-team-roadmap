import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// DOM stand-ins permit exercising the real asynchronous app handlers in Node.
class Element {
 constructor(){this.hidden=false;this.open=false;this.value='';this.checked=false;this.textContent='';this.className='';this.clientWidth=800;this.listeners={};this.style={setProperty(){}};this.classList={toggle(){}};this.fields=new Map();this.elements={namedItem:name=>{if(!this.fields.has(name))this.fields.set(name,new Element());return this.fields.get(name);}};}
 addEventListener(type,fn){this.listeners[type]=fn;}replaceChildren(){}append(){}setAttribute(){}scrollIntoView(){}querySelectorAll(){return [...this.fields.values()];}showModal(){this.open=true;}close(){this.open=false;}select(){}click(){}
}
function harness(){
 const nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 const initial=JSON.parse(fs.readFileSync(new URL('../web/seed.json',import.meta.url),'utf8'));
 const response={document:initial,revision:'r1',updatedAt:null,updatedBy:null};
 const context=vm.createContext({INITIAL_DOCUMENT:initial,document:{getElementById:el,createElement:()=>new Element(),createTextNode:t=>t,hidden:false},location:{hostname:'example.github.io',origin:'https://example.github.io',pathname:'/roadmap/',search:'',hash:'#edit=test'},history:{replaceState(){}},sessionStorage:{getItem(){return '';},setItem(){}},URLSearchParams,URL,Blob,Intl,Date,Math,Map,Set,JSON,structuredClone,Response,AbortSignal,crypto,innerWidth:1200,navigator:{},confirm:()=>true,addEventListener(){},setInterval(){},setTimeout(){return 0;},clearTimeout(){},fetch:async url=>Response.json(url.endsWith('/api/access')?{canEdit:true}:response)});
 vm.runInContext(fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8'),context);
 return {context,el,response};
}
test('a read started before a successful save cannot revert the visible saved task',async()=>{
 const {context,el,response}=harness();await new Promise(setImmediate);
 el('edit-button').listeners.click();
 el('task-form').elements.namedItem('name').value='Saved new task title';
 el('task-form').elements.namedItem('actor').value='Review';el('task-form').listeners.input();
 let releaseRead;
 context.fetch=async(_url,options)=>{if(options.method==='PUT'){const payload=JSON.parse(options.body);return Response.json({document:payload.document,revision:'r2',updatedAt:null,updatedBy:'Review'});}return new Promise(resolve=>releaseRead=()=>resolve(Response.json(response)));};
 const oldRead=el('reload-button').listeners.click();
 await el('task-form').listeners.submit({preventDefault(){}});
 assert.equal(el('detail-title').textContent,'Saved new task title');assert.equal(el('task-dialog').open,false);
 releaseRead();await oldRead;
 assert.equal(el('detail-title').textContent,'Saved new task title');
});
test('failed conflict reload preserves the unsaved task form',async()=>{
 const {context,el}=harness();await new Promise(setImmediate);el('edit-button').listeners.click();
 el('task-form').elements.namedItem('name').value='My unsaved title';el('task-form').listeners.input();context.fetch=async()=>{throw new Error('offline');};
 await el('load-current').listeners.click();
 assert.equal(el('task-dialog').open,true);assert.equal(el('task-form').elements.namedItem('name').value,'My unsaved title');assert.equal(el('task-error').hidden,false);
});
