(() => {
  'use strict';
  const API_ORIGIN = 'https://tbank-roadmap-team-alex.silly-macaw-6951.chatgpt.site';
  const API = location.hostname.endsWith('.github.io') ? API_ORIGIN : location.origin;
  const $ = id => document.getElementById(id);
  const statusNames = {todo:'Не начато',doing:'В работе',done:'Готово',blocked:'Нужна помощь'};
  let state={document:INITIAL_DOCUMENT,revision:null,updatedAt:null,updatedBy:null};
  let selected=INITIAL_DOCUMENT.tasks[0].id,canEdit=false,dirty=false,busy=false,editingId=null,draft=null,baseRevision=null;
  let stateEpoch=0;
  let toastTimer;
  const storage={get(k){try{return sessionStorage.getItem(k)||'';}catch{return '';}},set(k,v){try{sessionStorage.setItem(k,v);}catch{}}};
  const hash=new URLSearchParams(location.hash.slice(1));
  let editKey=hash.get('edit')||storage.get('roadmap-edit-key');
  if(hash.has('edit')){storage.set('roadmap-edit-key',editKey);history.replaceState(null,'',location.pathname+location.search);}
  const fmt=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'});
  const shortFmt=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'});
  const date=s=>new Date(s+'T00:00:00Z');
  const dateText=s=>fmt.format(date(s));
  const range=(a,b)=>a===b?dateText(a):shortFmt.format(date(a))+' — '+shortFmt.format(date(b));
  const dayDiff=(a,b)=>Math.round((date(b)-date(a))/86400000);
  const dayAt=(start,n)=>new Date(date(start).getTime()+n*86400000).toISOString().slice(0,10);
  function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
  function connection(message,problem=false){$('connection').textContent=message;$('connection').classList.toggle('problem',problem);}
  async function call(path,options={}){
    let response;
    try{response=await fetch(API+path,{cache:'no-store',credentials:API===location.origin?'same-origin':'omit',signal:AbortSignal.timeout(15000),...options,headers:{...(editKey?{Authorization:'Bearer '+editKey}:{}),...options.headers}});}
    catch{throw new Error('Нет связи с общим планом. Проверьте интернет и повторите попытку.');}
    const type=response.headers.get('content-type')||'';
    if(!type.includes('application/json')) throw new Error('Общий доступ ещё не включён или требуется вход. Показана исходная версия.');
    const body=await response.json();
    if(!response.ok){const error=new Error(body.error||'Не удалось сохранить изменения.');error.status=response.status;throw error;}
    return body;
  }
  function setAccess(){
    $('access-mode').textContent=canEdit?'Редактор':'Просмотр';$('access-mode').classList.toggle('editor',canEdit);
    for(const id of ['edit-button','settings-button','add-button','editor-share'])$(id).hidden=!canEdit;
    $('readonly-hint').hidden=canEdit;
  }
  function bounds(){const all=[state.document.earlyDeadline,state.document.deadline,...state.document.tasks.flatMap(t=>[t.start,t.end])].sort();return {start:all[0],end:all.at(-1),days:dayDiff(all[0],all.at(-1))+1};}
  function drawTimeline(){
    const b=bounds(),axis=$('timeline-axis'),rows=$('task-rows');axis.replaceChildren();rows.replaceChildren();
    const caption=document.createElement('span');caption.className='axis-caption';caption.textContent='ЗАДАЧА / ВЕДУЩИЙ';
    const axes=document.createElement('div');axes.className='axis-dates';axes.style.setProperty('--days',b.days);
    const months=document.createElement('div');months.className='axis-months';
    let monthStart=0;
    for(let i=0;i<=b.days;i++)if(i===b.days||dayAt(b.start,i).slice(0,7)!==dayAt(b.start,monthStart).slice(0,7)){
      const span=document.createElement('span');span.style.gridColumn=(monthStart+1)+' / '+(i+1);span.textContent=new Intl.DateTimeFormat('ru-RU',{month:'long',timeZone:'UTC'}).format(date(dayAt(b.start,monthStart)));months.append(span);monthStart=i;
    }
    const days=document.createElement('div');days.className='axis-days';
    const available=Math.max(150,rows.clientWidth-(innerWidth<480?158:215));
    const every=Math.max(1,Math.ceil(b.days/(available/22)));
    for(let i=0;i<b.days;i++){if(i%every!==0&&i!==b.days-1)continue;const n=document.createElement('span');n.textContent=String(date(dayAt(b.start,i)).getUTCDate());n.style.gridColumn=String(i+1);days.append(n);}
    axes.append(months,days);axis.append(caption,axes);
    state.document.tasks.forEach(task=>{
      const row=document.createElement('button');row.type='button';row.className='task-row';row.setAttribute('aria-pressed',String(task.id===selected));row.setAttribute('aria-label',task.name+', '+range(task.start,task.end)+', '+statusNames[task.status]+', '+task.owner);
      const label=document.createElement('span');label.className='task-label';
      const name=document.createElement('span');name.className='task-name';const dot=document.createElement('i');dot.className='status-dot '+task.status;dot.setAttribute('aria-hidden','true');name.append(dot,document.createTextNode(task.name));
      const owner=document.createElement('span');owner.className='task-owner';owner.textContent=task.owner||'Ответственный не назначен';
      const mobile=document.createElement('span');mobile.className='task-date-mobile';mobile.textContent=range(task.start,task.end);
      label.append(name,owner,mobile);
      const lane=document.createElement('span');lane.className='task-lane';lane.style.setProperty('--days',b.days);lane.setAttribute('aria-hidden','true');
      for(let i=0;i<b.days;i+=every){const line=document.createElement('i');line.className='gridline';line.style.left=((i+.5)/b.days*100)+'%';lane.append(line);}
      const bar=document.createElement('span');bar.className='task-bar '+task.status+(task.optional?' reserve':'')+(task.milestone?' milestone':'');bar.style.gridColumn=(dayDiff(b.start,task.start)+1)+' / '+(dayDiff(b.start,task.end)+2);lane.append(bar);
      row.append(label,lane);row.addEventListener('click',()=>{selected=task.id;drawTimeline();drawDetail();if(innerWidth<800)$('task-detail').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});});rows.append(row);
    });
  }
  function drawDetail(){
    const tasks=state.document.tasks;let task=tasks.find(t=>t.id===selected);if(!task){task=tasks[0];selected=task.id;}
    $('detail-number').textContent='ЭТАП '+String(tasks.indexOf(task)+1).padStart(2,'0')+' / '+tasks.length;
    $('detail-status').textContent=statusNames[task.status];$('detail-status').className='status-badge '+task.status;
    $('detail-title').textContent=task.name;$('detail-dates').textContent=range(task.start,task.end)+(task.optional?' · резерв':'');
    for(const field of ['owner','actions','result','depends','notes'])$('detail-'+field).textContent=task[field]||(field==='notes'?'Пока нет заметок.':field==='owner'?'Ответственный не назначен.':'Не указано.');
  }
  function render(){
    const doc=state.document,b=bounds();$('project-title').textContent=doc.title;document.title=doc.title+' · Кейс Т-Банка';
    $('period-label').textContent=range(b.start,b.end);$('early-deadline').textContent=dateText(doc.earlyDeadline);$('final-deadline').textContent=dateText(doc.deadline);$('project-note').textContent=doc.note;
    $('progress-label').textContent=doc.tasks.filter(t=>t.status==='done').length+' из '+doc.tasks.length+' готово';
    $('updated-label').textContent=state.updatedAt?'Обновлено '+new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(new Date(state.updatedAt))+' МСК · '+state.updatedBy:'Исходный план · роли с пометкой «предлагаю» ещё нужно согласовать';
    drawTimeline();drawDetail();setAccess();
  }
  async function load({silent=false}={}){
    const readEpoch=stateEpoch;
    try{const next=await call('/api/roadmap');if(readEpoch!==stateEpoch)return;if(!next.document||!Array.isArray(next.document.tasks)||!next.document.tasks.length)throw new Error('Общий план пока пуст.');
      if(busy||$('task-dialog').open||$('settings-dialog').open){if(next.revision!==state.revision)connection('Команда обновила план. Ваш открытый черновик сохранён.',true);return;}
      const changed=next.revision!==state.revision;state=next;stateEpoch++;if(changed||!silent)render();connection('Общая версия · изменения автоматически проверяются каждые 20 секунд.');
    }catch(error){if(readEpoch!==stateEpoch)return;connection(error.message,true);if(!silent&&state.revision!==null)toast(error.message);}
  }
  function formValue(form,name){return form.elements.namedItem(name);}
  function clearError(id){$(id).hidden=true;$(id).textContent='';}
  function showError(id,message){$(id).textContent=message;$(id).hidden=false;$(id).scrollIntoView({block:'nearest'});}
  function openTask(id){
    if(!canEdit)return;if(state.revision===null){toast('Сначала загрузите общую версию.');return;}
    editingId=id;draft=structuredClone(state.document);baseRevision=state.revision;
    const t=id?draft.tasks.find(t=>t.id===id):{id:crypto.randomUUID(),name:'Новая задача',owner:'',start:draft.tasks[0].start,end:draft.tasks[0].start,status:'todo',actions:'',result:'',depends:'',notes:'',optional:false,milestone:false};
    if(!id){draft.tasks.push(t);editingId=t.id;}
    const form=$('task-form');for(const key of ['name','owner','start','end','status','actions','result','depends','notes'])formValue(form,key).value=t[key];
    for(const key of ['optional','milestone'])formValue(form,key).checked=t[key];formValue(form,'actor').value=storage.get('roadmap-actor');
    $('task-dialog-title').textContent=id?'Редактировать задачу':'Новая задача';clearError('task-error');$('conflict-actions').hidden=true;dirty=false;$('task-dialog').showModal();
  }
  function collectTask(){const form=$('task-form'),task=draft.tasks.find(t=>t.id===editingId);for(const key of ['name','owner','start','end','status','actions','result','depends','notes'])task[key]=formValue(form,key).value.trim();for(const key of ['optional','milestone'])task[key]=formValue(form,key).checked;return task;}
  async function save(doc,actor,form,errorId){
    busy=true;stateEpoch++;const controls=[...form.querySelectorAll('input,select,textarea,button')];controls.forEach(x=>x.disabled=true);clearError(errorId);
    try{const saved=await call('/api/roadmap',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({document:doc,expectedRevision:baseRevision,actor})});state=saved;stateEpoch++;storage.set('roadmap-actor',actor);dirty=false;render();connection('Изменения сохранены для всей команды.');toast('Сохранено для всех');return true;}
    catch(error){showError(errorId,error.message+(error.status===409?' Ваши поля остались в форме.':' Изменения остались в форме и ещё не сохранены.'));if(errorId==='task-error')$('conflict-actions').hidden=error.status!==409;return false;}
    finally{busy=false;controls.forEach(x=>x.disabled=false);}
  }
  $('task-form').addEventListener('submit',async event=>{event.preventDefault();const form=$('task-form');const task=collectTask();if(task.end<task.start){showError('task-error','Окончание не может быть раньше начала.');return;}if(await save(draft,formValue(form,'actor').value.trim(),form,'task-error')){selected=editingId;$('task-dialog').close();render();}});
  function closeEditor(dialog){if(busy)return;if(dirty&&!confirm('Закрыть редактор без сохранения изменений?'))return;dirty=false;dialog.close();load({silent:true});}
  for(const [dialogId,closeId,formId] of [['task-dialog','task-close','task-form'],['settings-dialog','settings-close','settings-form']]){$(closeId).addEventListener('click',()=>closeEditor($(dialogId)));$(dialogId).addEventListener('cancel',e=>{e.preventDefault();closeEditor($(dialogId));});$(formId).addEventListener('input',()=>dirty=true);}
  $('edit-button').addEventListener('click',()=>openTask(selected));$('add-button').addEventListener('click',()=>openTask(null));
  $('settings-button').addEventListener('click',()=>{if(state.revision===null)return;draft=structuredClone(state.document);baseRevision=state.revision;const form=$('settings-form');for(const key of ['title','earlyDeadline','deadline','note'])formValue(form,key).value=draft[key];formValue(form,'actor').value=storage.get('roadmap-actor');clearError('settings-error');dirty=false;$('settings-dialog').showModal();});
  $('settings-form').addEventListener('submit',async e=>{e.preventDefault();const form=$('settings-form');for(const key of ['title','earlyDeadline','deadline','note'])draft[key]=formValue(form,key).value.trim();if(draft.earlyDeadline>draft.deadline){showError('settings-error','Контрольная точка должна быть не позже финального срока.');return;}if(await save(draft,formValue(form,'actor').value.trim(),form,'settings-error'))$('settings-dialog').close();});
  $('download-draft').addEventListener('click',()=>{collectTask();const blob=new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='roadmap-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('load-current').addEventListener('click',async()=>{
    if(!confirm('Загрузить версию команды? Несохранённые поля заменятся. Сначала скачайте черновик, если нужно сохранить свои правки.'))return;
    busy=true;stateEpoch++;const controls=[...$('task-form').querySelectorAll('input,select,textarea,button')];controls.forEach(x=>x.disabled=true);
    try{const next=await call('/api/roadmap');if(!next.document?.tasks?.length)throw new Error('Общий план пока недоступен.');
      const previousId=editingId;state=next;stateEpoch++;dirty=false;$('task-dialog').close();render();openTask(state.document.tasks.some(t=>t.id===previousId)?previousId:null);
    }catch(error){showError('task-error',error.message+' Ваши несохранённые поля сохранены в форме.');}
    finally{busy=false;controls.forEach(x=>x.disabled=false);}
  });
  $('reload-button').addEventListener('click',()=>load());
  $('share-button').addEventListener('click',()=>{const clean=location.origin+location.pathname;$('view-link').value=clean;$('edit-link').value=canEdit?clean+'#edit='+encodeURIComponent(editKey):'';$('copy-feedback').textContent='';$('share-dialog').showModal();});
  $('share-close').addEventListener('click',()=>$('share-dialog').close());
  async function copy(id){try{await navigator.clipboard.writeText($(id).value);$('copy-feedback').textContent='Ссылка скопирована.';}catch{$(id).select();$('copy-feedback').textContent='Ссылка выделена. Скопируйте её вручную.';}}
  $('copy-view').addEventListener('click',()=>copy('view-link'));$('copy-edit').addEventListener('click',()=>copy('edit-link'));
  addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
  let resizeTimer;addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(drawTimeline,120);});
  render();
  (async()=>{await load();if(editKey){try{const result=await call('/api/access');canEdit=result.canEdit;if(!canEdit)toast('Ссылка редактора недействительна. Доступен просмотр.');}catch{canEdit=false;}setAccess();}})();
  setInterval(()=>{if(!document.hidden&&!busy)load({silent:true});},20000);
})();
