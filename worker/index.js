const PAGE_HTML = /* INJECT_PAGE */ '';
const SEED_DOCUMENT = /* INJECT_SEED */ null;
const OBJECT_KEY = 'roadmap/document.json';
const MAX_BYTES = 200000;

function dateOK(value) {
  if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value;
}
function textValue(value, max, required=false) {
  if(typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error('Проверьте название и длину полей.');
  return value.trim();
}
function validateDocument(raw) {
  if(!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks) || !raw.tasks.length || raw.tasks.length>60) throw new Error('В плане должно быть от 1 до 60 задач.');
  if(!dateOK(raw.earlyDeadline)||!dateOK(raw.deadline)||raw.earlyDeadline>raw.deadline) throw new Error('Проверьте даты контрольной точки и дедлайна.');
  const ids=new Set();
  const tasks=raw.tasks.map(t=>{
    if(!t||typeof t.id!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(t.id)||ids.has(t.id)) throw new Error('Повторяющийся или некорректный идентификатор задачи.');
    ids.add(t.id);
    if(!dateOK(t.start)||!dateOK(t.end)||t.start>t.end) throw new Error('Дата окончания задачи должна быть не раньше начала.');
    if(!['todo','doing','done','blocked'].includes(t.status)) throw new Error('Неизвестный статус задачи.');
    return {id:t.id,name:textValue(t.name,100,true),owner:textValue(t.owner,160),start:t.start,end:t.end,status:t.status,
      actions:textValue(t.actions,5000),result:textValue(t.result,3000),depends:textValue(t.depends,2000),notes:textValue(t.notes,5000),optional:!!t.optional,milestone:!!t.milestone};
  });
  const dates=[raw.earlyDeadline,raw.deadline,...tasks.flatMap(t=>[t.start,t.end])].sort();
  if((Date.parse(dates.at(-1))-Date.parse(dates[0]))/86400000>366) throw new Error('Период плана не должен превышать один год.');
  return {title:textValue(raw.title,100,true),earlyDeadline:raw.earlyDeadline,deadline:raw.deadline,note:textValue(raw.note,2000),tasks};
}
async function authorized(request,env) {
  const header=request.headers.get('Authorization')||'';
  if(!header.startsWith('Bearer ')||header.length>256||!/^[a-f0-9]{64}$/.test(env.EDIT_KEY_SHA256||'')) return false;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(header.slice(7)));
  const hash=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
  let mismatch=0;for(let i=0;i<64;i++) mismatch|=hash.charCodeAt(i)^env.EDIT_KEY_SHA256.charCodeAt(i);
  return mismatch===0;
}
async function boundedJSON(request) {
  if(Number(request.headers.get('Content-Length'))>MAX_BYTES) throw new Error('Слишком большой документ.');
  const reader=request.body?.getReader();if(!reader) throw new Error('Пустой запрос.');
  let size=0;const chunks=[];
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES){await reader.cancel();throw new Error('Слишком большой документ.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url),origin=request.headers.get('Origin');
    const allowed=!origin||origin===url.origin||origin===env.ALLOWED_ORIGIN;
    const common={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};
    if(origin&&allowed){common['Access-Control-Allow-Origin']=origin;common['Access-Control-Allow-Methods']='GET, PUT, OPTIONS';common['Access-Control-Allow-Headers']='Authorization, Content-Type';common['Access-Control-Expose-Headers']='ETag';}
    const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...common,'Content-Type':'application/json; charset=utf-8',...extra}});
    if(!allowed) return json({error:'Этот источник не разрешён.'},403);
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:common});
    if(url.pathname==='/'&&request.method==='GET') return new Response(PAGE_HTML,{headers:{...common,'Content-Type':'text/html; charset=utf-8'}});
    if(url.pathname==='/api/access'&&request.method==='GET') return json({canEdit:await authorized(request,env)});
    if(url.pathname!=='/api/roadmap') return json({error:'Не найдено.'},404);
    if(!env.BUCKET) return json({error:'Общее хранилище ещё не подключено.'},503);
    try {
      if(request.method==='GET'){
        const object=await env.BUCKET.get(OBJECT_KEY);
        if(!object) return json({document:SEED_DOCUMENT,revision:'initial',updatedAt:null,updatedBy:null});
        const state=await object.json();return json({...state,revision:object.etag},200,{ETag:object.httpEtag});
      }
      if(request.method!=='PUT') return json({error:'Метод не поддерживается.'},405,{Allow:'GET, PUT, OPTIONS'});
      if(!await authorized(request,env)) return json({error:'Для сохранения нужна ссылка редактора.'},401);
      if(!request.headers.get('Content-Type')?.includes('application/json')) return json({error:'Ожидался JSON.'},415);
      let body,document,actor;
      try{body=await boundedJSON(request);document=validateDocument(body.document);actor=textValue(body.actor,80,true);if(typeof body.expectedRevision!=='string'||body.expectedRevision.length>128)throw new Error('Не указана версия плана.');}
      catch(error){return json({error:error instanceof SyntaxError?'Не удалось прочитать документ.':error.message},400);}
      const existing=await env.BUCKET.get(OBJECT_KEY);
      if(body.expectedRevision!==(existing?.etag||'initial')) return json({error:'Команда уже обновила план. Загрузите новую версию перед сохранением.',code:'conflict'},409);
      const conditions=new Headers(existing?{'If-Match':existing.httpEtag}:{'If-None-Match':'*'});
      const state={document,updatedAt:new Date().toISOString(),updatedBy:actor};
      const saved=await env.BUCKET.put(OBJECT_KEY,JSON.stringify(state),{onlyIf:conditions,httpMetadata:{contentType:'application/json'}});
      if(!saved) return json({error:'План изменился во время сохранения. Ваш черновик сохранён в форме.',code:'conflict'},409);
      return json({...state,revision:saved.etag},200,{ETag:saved.httpEtag});
    }catch{return json({error:'Не удалось связаться с общим хранилищем. Попробуйте ещё раз.'},503);}
  }
};
