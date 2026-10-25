'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.JuiceWorkspace=api;})(typeof window==='undefined'?globalThis:window,()=>{
  const FORMAT='juice-workspace',VERSION=1,MAX_BYTES=2*1024*1024;
  const KINDS=['system','module','goal','task','process','decision','case','evidence'];
  const STATUSES=[null,'todo','doing','blocked','done'];
  const VIEWS=['system','roadmap','work','flow','results'];
  const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const clone=x=>JSON.parse(JSON.stringify(x));
  function assert(ok,message){if(!ok)throw new Error(message);}
  function string(x,max,name){assert(typeof x==='string'&&x.length<=max,name+'格式或長度不正確');}
  function id(x){assert(typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x),'ID 格式不正確');}
  function list(x,max,name){assert(Array.isArray(x)&&x.length<=max,name+'數量或格式不正確');}
  function unique(items,name){const seen=new Set();for(const x of items){assert(object(x),name+'物件格式不正確');id(x.id);assert(!seen.has(x.id),name+' ID 重複：'+x.id);seen.add(x.id);}return seen;}
  function refs(items,ids){list(items,100,'來源參照');for(const x of items)assert(ids.has(x),'來源不存在：'+x);}
  function validate(d){
    assert(object(d)&&d.format===FORMAT&&d.version===VERSION,'請使用 juice-workspace 第 1 版資料；不能匯入白板或 juice-flow JSON');
    id(d.id);string(d.title,200,'工作空間名稱');assert(Number.isSafeInteger(d.revision)&&d.revision>=1,'工作空間版本不正確');
    list(d.objects,1000,'物件');list(d.relations,5000,'關係');list(d.sources,200,'來源');list(d.assertions,2000,'註記');list(d.views,20,'視角');list(d.changes,1000,'變更紀錄');
    const ids=unique(d.objects,'物件'),sids=unique(d.sources,'來源');unique(d.relations,'關係');unique(d.assertions,'註記');unique(d.views,'視角');unique(d.changes,'變更');
    for(const s of d.sources){string(s.title,300,'來源名稱');string(s.locator,2000,'來源位置');string(s.version,100,'來源版本');string(s.note,2000,'來源說明');}
    for(const o of d.objects){assert(KINDS.includes(o.kind),'不支援的物件類型');string(o.title,300,'物件名稱');assert(o.title.trim(),'物件名稱不可空白');assert(object(o.fields),'物件欄位不正確');assert(Number.isSafeInteger(o.revision)&&o.revision>=1,'物件版本不正確');refs(o.sourceRefs,sids);string(o.note,2000,'物件說明');
      if(o.kind==='task'){assert(STATUSES.includes(o.fields.status),'任務狀態不正確');assert(o.fields.owner===null||typeof o.fields.owner==='string'&&o.fields.owner.length<=100,'負責人格式不正確');}
    }
    for(const r of d.relations){assert(ids.has(r.fromId)&&ids.has(r.toId),'關係指向不存在的物件');string(r.predicate,60,'關係類型');assert(r.predicate.trim(),'關係類型不可空白');assert(['source','proposed','confirmed'].includes(r.certainty),'關係確認狀態不正確');refs(r.sourceRefs,sids);}
    for(const a of d.assertions){assert(ids.has(a.subjectId),'註記對象不存在');string(a.field,100,'註記欄位');string(a.text,2000,'註記');assert(['confirmed','unconfirmed','conflict','proposed'].includes(a.certainty),'註記確認狀態不正確');refs(a.sourceRefs,sids);}
    for(const v of d.views){assert(VIEWS.includes(v.kind),'不支援的視角');string(v.title,100,'視角名稱');assert(object(v.layout),'布局格式不正確');for(const key of Object.keys(v.layout))assert(ids.has(key),'布局物件不存在');}
    for(const c of d.changes){assert(ids.has(c.objectId),'變更對象不存在');assert(object(c.before)&&object(c.after),'變更紀錄格式不正確');string(c.at,100,'變更時間');}
    return clone(d);
  }
  function parse(raw){string(raw,MAX_BYTES,'資料');assert(new TextEncoder().encode(raw).length<=MAX_BYTES,'檔案超過 2 MB 限制');let d;try{d=JSON.parse(raw);}catch{throw new Error('無法解析 JSON，原資料未變更');}return validate(d);}
  function serialize(d){const raw=JSON.stringify(validate(d),null,2);assert(new TextEncoder().encode(raw).length<=MAX_BYTES,'檔案超過 2 MB 限制，請先拆分工作空間');return raw;}
  function connected(d,objectId,predicate){const ids=new Set(d.relations.filter(r=>(!predicate||r.predicate===predicate)&&(r.fromId===objectId||r.toId===objectId)).map(r=>r.fromId===objectId?r.toId:r.fromId));return d.objects.filter(o=>ids.has(o.id));}
  function tasksFor(d,objectId){return connected(d,objectId).filter(o=>o.kind==='task');}
  function scopeForModule(d,moduleId){
    const module=d.objects.find(o=>o.id===moduleId&&o.kind==='module');if(!module)return [];
    const ids=new Set([moduleId]);
    for(const r of d.relations)if(r.toId===moduleId&&r.predicate==='belongsTo'){const o=d.objects.find(x=>x.id===r.fromId);if(o&&!['system','module'].includes(o.kind))ids.add(o.id);}
    let changed=true;while(changed){changed=false;for(const r of d.relations){if(!ids.has(r.fromId)||!['supports','affects','produces','checkedBy','documentedBy'].includes(r.predicate))continue;const o=d.objects.find(x=>x.id===r.toId);if(o&&!['system','module','task'].includes(o.kind)&&!ids.has(o.id)){ids.add(o.id);changed=true;}}}
    return d.objects.filter(o=>ids.has(o.id));
  }
  function confirmedSchedule(o){
    const s=o.fields.schedule;if(!object(s)||s.confirmed!==true)return null;
    const valid=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
    const start=s.startDate||s.endDate,end=s.endDate||s.startDate;
    return valid(start)&&valid(end)&&start<=end?{start,end}:null;
  }
  function patchTask(d,objectId,fields,now=new Date().toISOString()){
    const next=validate(d),task=next.objects.find(o=>o.id===objectId);assert(task?.kind==='task','只能修改任務物件');assert(object(fields)&&Object.keys(fields).every(k=>['status','owner'].includes(k)),'只能修改狀態與負責人');
    const before={status:task.fields.status,owner:task.fields.owner},after={...before,...fields};after.owner=typeof after.owner==='string'?after.owner.trim()||null:after.owner;
    if(before.status===after.status&&before.owner===after.owner)return next;
    assert(next.changes.length<1000,'變更紀錄已達上限，請先建立新工作空間版本');task.fields={...task.fields,...after};task.revision++;next.revision++;
    next.changes.push({id:'change-'+crypto.randomUUID(),objectId,before,after,at:now});
    for(const field of ['status','owner'])if(before[field]!==after[field]){
      const previous=next.assertions.find(a=>a.subjectId===objectId&&a.field===field&&a.origin==='workspace-editor'),aid=previous?.id||'manual-'+crypto.randomUUID();next.assertions=next.assertions.filter(a=>a.id!==aid);next.assertions.push({id:aid,subjectId:objectId,field,origin:'workspace-editor',text:'由使用者在 Workspace 編輯器更新於 '+now+'；不是原始專案文件的進度宣告',certainty:after[field]===null?'unconfirmed':'confirmed',sourceRefs:[]});
    }
    validate(next);serialize(next);return next;
  }
  return {FORMAT,VERSION,MAX_BYTES,KINDS,STATUSES,VIEWS,validate,parse,serialize,connected,tasksFor,scopeForModule,confirmedSchedule,patchTask};
});
