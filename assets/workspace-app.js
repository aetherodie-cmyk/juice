'use strict';
(()=>{
  const Core=window.JuiceWorkspace,$=id=>document.getElementById(id);
  const statusNames={unknown:'待確認',todo:'待辦',doing:'進行中',blocked:'受阻',done:'完成'};
  const kindNames={system:'系統',module:'模組',goal:'交付目標',task:'任務',process:'流程',decision:'設計決策',case:'Case',evidence:'成果證據'};
  const relationNames={belongsTo:'屬於',supports:'支援',affects:'影響',produces:'產出',checkedBy:'由案例檢核',documentedBy:'以產物佐證'};
  const certaintyNames={source:'來源記載',proposed:'POC 建議',confirmed:'已確認',unconfirmed:'待確認',conflict:'來源差異'};
  let state=null,selected=null,view='system',dirty=false,busy=false;
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function message(text,error=false){$('message').textContent=text;$('message').className=error?'error':'';$('message').setAttribute('role',error?'alert':'status');}
  function node(id){return state.objects.find(o=>o.id===id);}
  function saveState(){ $('saveState').textContent=state?(dirty?'有未匯出的變更':'尚未編輯 · 請自行保存檔案'):'尚未載入資料';}
  function status(o){return statusNames[o.fields.status||'unknown'];}
  function objectButton(o){
    const b=el('button',undefined,'object');b.type='button';b.dataset.objectId=o.id;b.setAttribute('aria-pressed',String(selected===o.id));
    const title=el('span',undefined,'identity');title.append(el('span',o.title),el('code',o.id));b.append(title);
    if(o.kind==='task'){b.append(el('span',status(o),'badge '+(o.fields.status||'')));b.append(el('span',o.fields.owner||'負責人待確認','task-note'));}
    b.addEventListener('click',()=>{selected=o.id;render();$('objectPanel').scrollIntoView({block:'nearest',behavior:'smooth'});});return b;
  }
  function taskSummary(target,host){
    const tasks=Core.tasksFor(state,target.id);if(!tasks.length){host.append(el('p','尚未建立關聯任務','empty'));return;}
    for(const task of tasks)host.append(objectButton(task));
  }
  function renderSystem(host){
    for(const system of state.objects.filter(o=>o.kind==='system')){
      host.append(objectButton(system));const tree=el('div',undefined,'tree');
      for(const module of state.objects.filter(o=>o.kind==='module'&&state.relations.some(r=>r.fromId===o.id&&r.toId===system.id&&r.predicate==='belongsTo'))){tree.append(objectButton(module));taskSummary(module,tree);}host.append(tree);
    }
    host.append(el('p','顯示本案例的系統歸屬與關聯任務；修改任務不改變系統的上線狀態。','muted'));
  }
  function renderRoadmap(host){
    const stages=el('div',undefined,'stages');for(const goal of state.objects.filter(o=>o.kind==='goal')){const col=el('section',undefined,'stage');col.append(el('p',goal.fields.phase||'階段待確認','muted'),objectButton(goal));taskSummary(goal,col);col.append(el('p',goal.note));stages.append(col);}host.append(stages,el('p','任務完成不自動完成目標，也不推定交付日期。','muted'));
  }
  function renderWork(host){
    const grid=el('div',undefined,'work-list');for(const key of ['unknown','todo','doing','blocked','done']){const tasks=state.objects.filter(o=>o.kind==='task'&&(o.fields.status||'unknown')===key);const col=el('section',undefined,'work-column');col.dataset.status=key;col.append(el('h3',statusNames[key]+' · '+tasks.length));for(const task of tasks)col.append(objectButton(task));if(!tasks.length)col.append(el('p','無任務','empty'));grid.append(col);}host.append(grid);
  }
  function renderFlow(host){
    for(const process of state.objects.filter(o=>o.kind==='process')){const group=el('section',undefined,'results-group');group.append(objectButton(process));const path=el('div',undefined,'path'),steps=Array.isArray(process.fields.path)?process.fields.path:[];steps.forEach((s,i)=>{if(i)path.append(el('span','→'));path.append(el('span',typeof s==='string'?s:'未命名步驟'));});group.append(path);const overlay=el('div',undefined,'flow-overlay');overlay.append(el('p','相關工作 · 非業務執行狀態','muted'));taskSummary(process,overlay);group.append(overlay);host.append(group);}
    host.append(el('p','這是獨立的流程關係閱讀視角，不會修改 Classic 或 Flow Plus 原始碼。','muted'));
  }
  function renderResults(host){
    for(const decision of state.objects.filter(o=>o.kind==='decision')){const group=el('section',undefined,'results-group');group.append(objectButton(decision));const linked=Core.connected(state,decision.id);for(const o of linked.filter(o=>['case','evidence'].includes(o.kind))){group.append(objectButton(o));group.append(el('p',o.fields.testResult===null?'測試結果待確認；未取得實測通過證據':String(o.fields.testResult||'未提供測試結果'),'muted'));}group.append(el('p','關聯工作','muted'));taskSummary(decision,group);host.append(group);}
    host.append(el('p','設計產物與測試通過證據分開保存；修改任務不變更 Case 結果。','muted'));
  }
  function sourceDetail(source){const section=el('div',undefined,'source');section.append(el('strong',source.title),el('p',source.version),el('code',source.locator),el('p',source.note));return section;}
  function renderPanel(){
    const panel=$('objectPanel');panel.replaceChildren();const o=node(selected);if(!o){panel.append(el('h2','選擇一個物件'),el('p','點選任務可修改狀態與負責人；其他物件僅供閱讀。'));return;}
    panel.append(el('p',kindNames[o.kind],'muted'),el('h2',o.title),el('code',o.id+' · revision '+o.revision),el('p',o.note));
    if(o.kind==='task'){
      const form=el('form');form.id='taskForm';const fields=el('fieldset');fields.disabled=busy;const label=el('label','狀態'),select=el('select');select.id='taskStatus';select.name='status';for(const [key,text] of Object.entries(statusNames)){const option=el('option',text);option.value=key;select.append(option);}select.value=o.fields.status||'unknown';label.append(select);const ownerLabel=el('label','負責人'),input=el('input');input.id='taskOwner';input.name='owner';input.maxLength=100;input.value=o.fields.owner||'';input.placeholder='留空代表待確認';ownerLabel.append(input);const save=el('button','儲存任務');save.id='saveTask';save.type='submit';fields.append(label,ownerLabel,save);form.append(fields,el('p','只更新此物件；五個視角讀取最新值。請下載 JSON 保存。','muted'));form.addEventListener('submit',e=>{e.preventDefault();try{const next=Core.patchTask(state,o.id,{status:select.value==='unknown'?null:select.value,owner:input.value});if(next.revision!==state.revision){state=next;dirty=true;}render();message('已更新 '+o.id+'；所有視角讀取同一筆資料，尚未匯出保存。');}catch(err){message(err.message,true);}});panel.append(form);
    }
    const relations=el('details');relations.open=true;relations.append(el('summary','關聯物件'));const related=el('div',undefined,'related');for(const r of state.relations.filter(r=>r.fromId===o.id||r.toId===o.id)){const target=node(r.fromId===o.id?r.toId:r.fromId);const b=el('button',(r.fromId===o.id?'→ ':'← ')+(relationNames[r.predicate]||r.predicate)+' · '+target.title+' · '+certaintyNames[r.certainty]);b.type='button';b.addEventListener('click',()=>{selected=target.id;render();});related.append(b);}relations.append(related);panel.append(relations);
    const assertions=state.assertions.filter(a=>a.subjectId===o.id);if(assertions.length){const details=el('details');details.open=true;details.append(el('summary','待確認與來源註記'));for(const a of assertions){const section=el('div',undefined,'assertion');section.append(el('strong',certaintyNames[a.certainty]+' · '+a.field),el('p',a.text));for(const sid of a.sourceRefs)section.append(el('p','來源 '+sid,'muted'));details.append(section);}panel.append(details);}
    const sources=el('details');sources.append(el('summary','來源資料'));for(const sid of o.sourceRefs)sources.append(sourceDetail(state.sources.find(s=>s.id===sid)));if(!o.sourceRefs.length)sources.append(el('p','此物件為 POC 建議或手動新增，未提供外部來源。'));panel.append(sources);
  }
  function render(){
    $('workspace').hidden=!state;$('exportButton').disabled=!state||busy;saveState();if(!state)return;
    $('workspaceTitle').textContent=state.title;$('workspaceRevision').textContent=state.id+' · revision '+state.revision;$('workspaceNote').textContent=typeof state.note==='string'?state.note:'';
    const tabs=$('viewTabs');tabs.replaceChildren();for(const v of state.views){const b=el('button',v.title);b.type='button';b.dataset.view=v.kind;b.setAttribute('aria-pressed',String(v.kind===view));b.addEventListener('click',()=>{view=v.kind;render();});tabs.append(b);}
    const host=$('viewContent');host.replaceChildren();host.append(el('h2',state.views.find(v=>v.kind===view)?.title||'系統'));({system:renderSystem,roadmap:renderRoadmap,work:renderWork,flow:renderFlow,results:renderResults})[view](host);renderPanel();
    const log=$('changeLog');log.replaceChildren();for(const c of state.changes.slice(-20).reverse())log.append(el('p',c.at+' · '+c.objectId+' · '+statusNames[c.before.status||'unknown']+' → '+statusNames[c.after.status||'unknown']+' · 負責人 '+(c.before.owner||'待確認')+' → '+(c.after.owner||'待確認')));if(!state.changes.length)log.append(el('p','尚無變更'));else log.append(el('p','顯示最近 20 筆；完整紀錄保留於匯出檔。','muted'));
  }
  function mayReplace(){return !dirty||window.confirm('目前有未匯出的變更。確定捨棄並載入另一份資料？');}
  function adopt(next){state=next;dirty=false;view=next.views[0]?.kind||'system';selected=next.objects.find(o=>o.kind==='task')?.id||next.objects[0]?.id||null;render();}
  async function loading(fn){if(busy)return;busy=true;for(const id of ['loadDemo','importButton','exportButton'])$(id).disabled=true;const fields=$('taskForm')?.querySelector('fieldset');if(fields)fields.disabled=true;try{await fn();}catch(err){message(err.message,true);}finally{busy=false;for(const id of ['loadDemo','importButton'])$(id).disabled=false;render();}}
  $('loadDemo').addEventListener('click',()=>{if(!mayReplace())return;loading(async()=>{const r=await fetch('assets/workspace-demo.json',{cache:'no-store'});if(!r.ok)throw new Error('無法載入範例，請用本機 HTTP 伺服器開啟');const next=Core.parse(await r.text());adopt(next);message('已載入歷史資料範例；所有狀態與負責人預設待確認。');});});
  $('importButton').addEventListener('click',()=>{if(!busy)$('workspaceFile').click();});
  $('workspaceFile').addEventListener('change',()=>{const file=$('workspaceFile').files[0];$('workspaceFile').value='';if(!file)return;loading(async()=>{if(file.size>Core.MAX_BYTES)throw new Error('檔案超過 2 MB 限制');const next=Core.parse(await file.text());if(!mayReplace())return;adopt(next);message('已載入獨立 Workspace 檔案；既有白板未變更。');});});
  $('exportButton').addEventListener('click',()=>{if(!state||busy)return;try{const raw=Core.serialize(state),blob=new Blob([raw],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=state.id+'.workspace.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);dirty=false;saveState();message('已交給瀏覽器下載；請確認檔案已保存，下次由「匯入 Workspace JSON」重新開啟。');}catch(err){message(err.message,true);}});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  render();
})();
