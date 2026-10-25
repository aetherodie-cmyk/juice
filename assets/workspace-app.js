'use strict';
(()=>{
  const Core=window.JuiceWorkspace,$=id=>document.getElementById(id);
  const statusNames={unknown:'待確認',todo:'待辦',doing:'進行中',blocked:'受阻',done:'完成'};
  const kindNames={system:'系統',module:'功能範圍',goal:'階段／目標',task:'工作項目',process:'業務流程',decision:'設計決策',case:'Case',evidence:'成果證據'};
  const relationNames={belongsTo:'屬於',supports:'支援',affects:'影響',produces:'產出',checkedBy:'由案例檢核',documentedBy:'以產物佐證'};
  const certaintyNames={source:'來源記載',proposed:'POC 建議',confirmed:'已確認',unconfirmed:'待確認',conflict:'來源差異'};
  const detailViews={work:'工作',flow:'流程',timeline:'時程'};
  let state=null,selected=null,moduleId=null,view='work',dirty=false,busy=false;
  const drafts=new Map();let routeGuard=false,mapFitted=true,mapObserver=null,mapFit=null;
  const svgNS='http://www.w3.org/2000/svg';

  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function svg(tag,attrs={}){const n=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;}
  function message(text,error=false){$('message').textContent=text;$('message').className=error?'error':'';$('message').setAttribute('role',error?'alert':'status');}
  function node(id){return state?.objects.find(o=>o.id===id);}
  function scoped(){return Core.scopeForModule(state,moduleId);}
  function status(o){return statusNames[o.fields.status||'unknown'];}
  function scopedTasks(target){const scope=new Set(scoped().map(o=>o.id));return Core.tasksFor(state,target.id).filter(t=>scope.has(t.id));}
  function saveState(){ $('saveState').textContent=state?(drafts.size?'任務有尚未儲存的編輯':dirty?'有未匯出的變更':'資料已載入 · 獨立 JSON 模式'):'尚未載入資料';}
  function button(text,fn,cls){const b=el('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;}
  function selectObject(id){selected=id;render();$('objectPanel').focus({preventScroll:true});}
  function closePanel(){const previous=selected;selected=null;render();const target=$('viewContent').querySelector('[data-object-id="'+CSS.escape(previous||'')+'"]')||$('returnOverview')||$('viewContent').querySelector('button');target?.focus({preventScroll:true});}
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&selected){e.preventDefault();closePanel();}});
  function objectButton(o){
    const b=button(undefined,()=>selectObject(o.id),'object');b.dataset.objectId=o.id;b.setAttribute('aria-pressed',String(selected===o.id));
    const title=el('span',undefined,'identity');title.append(el('span',o.title),el('code',o.id));b.append(title);
    if(o.kind==='task'){const meta=el('span',undefined,'task-meta');meta.append(el('span',status(o),'badge '+(o.fields.status||'')),el('span',o.fields.owner||'負責人待確認','task-note'));b.append(meta);}
    return b;
  }
  function navigate(nextModule=null,nextView='work'){
    const hash=nextModule?'#feature/'+encodeURIComponent(nextModule)+'/'+nextView:'#overview';
    if(location.hash===hash){moduleId=nextModule;view=nextView;selected=null;render();}else location.hash=hash;
  }
  function readRoute(){
    if(!state)return;const parts=location.hash.slice(1).split('/');let id=null;try{id=decodeURIComponent(parts[1]||'');}catch{ /* Malformed external hash falls back to overview. */ }
    moduleId=parts[0]==='feature'&&node(id)?.kind==='module'?id:null;view=Object.hasOwn(detailViews,parts[2])?parts[2]:'work';selected=null;render();
  }
  window.addEventListener('hashchange',()=>{if(!routeGuard)readRoute();});
  window.addEventListener('resize',()=>mapFit?.());

  function progress(tasks){
    const n=tasks.length,done=tasks.filter(t=>t.fields.status==='done').length,unknown=tasks.filter(t=>t.fields.status===null).length;
    return n?`${n} 項工作 · ${done} 標記完成${unknown?' · '+unknown+' 狀態待確認':''}`:'尚未載入工作明細';
  }
  function projectModules(){const system=state.objects.find(o=>o.kind==='system');return state.objects.filter(o=>o.kind==='module'&&(!system||state.relations.some(r=>r.fromId===o.id&&r.toId===system.id&&r.predicate==='belongsTo')));}
  function renderOverview(host){
    const modules=projectModules(),system=state.objects.find(o=>o.kind==='system');
    const heading=el('div',undefined,'overview-heading');heading.append(el('div','PROJECT LANDSCAPE','eyebrow'),el('h2',system?system.title+' · 功能全覽':'工作空間 · 功能全覽'),el('p','選一塊拼圖深入查看。版圖依歷史資料整理，非完整或目前定案架構；灰色區塊尚未載入工作明細。','muted'));host.append(heading);
    const legend=el('div',undefined,'map-legend');legend.append(el('span','實線：功能歸屬'),el('span','虛線：流程連動'));const controls=el('div',undefined,'map-controls');for(const [fit,label] of [[true,'總覽'],[false,'原尺寸']]){const b=button(label,()=>{mapFitted=fit;render();});b.setAttribute('aria-pressed',String(mapFitted===fit));controls.append(b);}legend.append(controls);host.append(legend);
    const scroller=el('div',undefined,'overview-scroll');scroller.tabIndex=0;scroller.setAttribute('aria-label','OMG 功能版圖，可捲動');
    const board=el('div',undefined,'overview-board');board.dataset.overview='true';const links=svg('svg',{'aria-hidden':'true',class:'map-links'});board.append(links);
    const positions={
      'MOD-PARTY':[45,25],'MOD-PRODUCT':[335,5],'MOD-CHANNEL':[625,30],'MOD-RECEIVABLE':[915,15],
      'MOD-ORDER':[45,185],'MOD-AMD':[800,175],'MOD-SUBSCRIPTION':[35,375],'MOD-FULFILLMENT':[275,375],
      'MOD-DELIVERY':[515,375],'MOD-INVOICE':[755,375],'MOD-RMA':[995,375]
    };
    const layout=state.views.find(v=>v.kind==='system')?.layout||{};const boxes=new Map();let maxX=1210,maxY=530;
    modules.forEach((m,i)=>{
      const custom=layout[m.id],fallback=positions[m.id]||[35+(i%4)*290,740+Math.floor(i/4)*170];
      const x=custom&&Number.isFinite(custom.x)&&custom.x>=0&&custom.x<=4000?custom.x:fallback[0];
      const y=custom&&Number.isFinite(custom.y)&&custom.y>=0&&custom.y<=4000?custom.y:fallback[1];
      const tasks=Core.scopeForModule(state,m.id).filter(o=>o.kind==='task'),expanded=tasks.length>0,w=expanded?270:205,h=expanded?155:126;
      const tile=button(undefined,()=>navigate(m.id),'map-tile'+(expanded?' has-content':''));tile.dataset.moduleId=m.id;
      tile.setAttribute('aria-label','開啟 '+m.title);tile.style.left=x+'px';tile.style.top=y+'px';tile.style.width=w+'px';tile.style.minHeight=h+'px';
      tile.append(el('span',expanded?'本次案例 · 可深入探索':'功能範圍參考','tile-kicker'),el('strong',m.title),el('code',m.id),el('span',progress(tasks),'tile-meta'),el('span','進入功能 →','tile-action'));
      board.append(tile);boxes.set(m.id,{x,y,w,h});maxX=Math.max(maxX,x+w+25);maxY=Math.max(maxY,y+h+25);
    });
    const center={x:390,y:200,w:255,h:105};const root=button(undefined,()=>selectObject(system?.id),'project-root');root.style.left=center.x+'px';root.style.top=center.y+'px';root.append(el('span','OMG WORKSPACE','eyebrow'),el('strong',system?.title||state.title),el('span','從整體到每一塊功能','muted'));board.append(root);
    for(const [id,b] of boxes){const line=svg('path',{d:`M ${center.x+center.w/2} ${center.y+center.h/2} L ${b.x+b.w/2} ${b.y+b.h/2}`,class:'ownership-line'});links.append(line);}
    for(const owner of modules){const scope=Core.scopeForModule(state,owner.id),scopeIds=new Set(scope.filter(o=>o.kind==='process').map(o=>o.id));const destinations=new Set(state.relations.filter(r=>r.predicate==='affects'&&scopeIds.has(r.fromId)&&boxes.has(r.toId)&&r.toId!==owner.id).map(r=>r.toId));for(const dest of destinations){const a=boxes.get(owner.id),b=boxes.get(dest);links.append(svg('path',{d:`M ${a.x+a.w/2} ${a.y+a.h} C ${a.x+a.w/2} ${a.y+a.h+48}, ${b.x+b.w/2} ${b.y-48}, ${b.x+b.w/2} ${b.y}`,class:'dependency-line'}));}}
    board.style.width=maxX+'px';board.style.height=maxY+'px';links.setAttribute('width',maxX);links.setAttribute('height',maxY);const size=el('div',undefined,'map-size');size.append(board);scroller.append(size);host.append(scroller);
    mapFit=()=>{const available=Math.max(360,innerHeight-scroller.getBoundingClientRect().top-28);const scale=mapFitted?Math.max(.72,Math.min(1,scroller.clientWidth/maxX,available/maxY)):1;board.style.transform=`scale(${scale})`;size.style.width=Math.ceil(maxX*scale)+'px';size.style.height=Math.ceil(maxY*scale)+'px';};mapObserver=new ResizeObserver(mapFit);mapObserver.observe(scroller);requestAnimationFrame(mapFit);
    host.append(el('p','位置屬於觀看布局，不是業務資料。本版先提供閱讀與深入探索，尚未開放拖拉編排。','muted'));
    if(!modules.length)host.append(el('p','此檔案尚未提供系統功能歸屬關係；既有物件仍保留於匯出檔。','empty'));
  }

  function renderWork(host){
    const tasks=scoped().filter(o=>o.kind==='task');host.append(el('h2','工作安排'),el('p',progress(tasks)+'。狀態與負責人都來自同一筆工作資料。','muted'));
    if(!tasks.length){host.append(el('p','此功能尚未載入工作項目，不代表沒有工作或已完成。','empty'));return;}
    const grid=el('div',undefined,'work-list');for(const key of ['unknown','todo','doing','blocked','done']){
      const items=tasks.filter(o=>(o.fields.status||'unknown')===key);if(!items.length)continue;const col=el('section',undefined,'work-column');col.dataset.status=key;
      col.append(el('h3',statusNames[key]+' · '+items.length));const cards=el('div',undefined,'status-tasks');for(const task of items)cards.append(objectButton(task));col.append(cards);grid.append(col);
    }host.append(grid);
  }
  function renderFlow(host){
    const processes=scoped().filter(o=>o.kind==='process');host.append(el('h2','業務流程'),el('p','箭頭表示來源中記錄的步驟順序；尚無完整條件、退回與例外資料，不自行補畫。','muted'));
    if(!processes.length){host.append(el('p','此功能尚未載入流程資料。','empty'));return;}
    for(const process of processes){
      const group=el('section',undefined,'process-card');group.append(objectButton(process));
      const chart=el('div',undefined,'business-flow');chart.setAttribute('role','group');chart.setAttribute('aria-label',process.title+'流程圖');chart.dataset.processId=process.id;
      const steps=Array.isArray(process.fields.path)?process.fields.path:[];
      steps.forEach((step,i)=>{
        if(i){const connector=svg('svg',{viewBox:'0 0 44 24',class:'flow-connector','aria-hidden':'true'});connector.append(svg('path',{d:'M 1 12 H 39 M 31 5 L 39 12 L 31 19'}));chart.append(connector);}
        const b=button(undefined,()=>{selectObject(process.id);message('查看「'+process.title+'」的第 '+(i+1)+' 步；詳情以原流程資料為準。');},'flow-step '+(i===0||i===steps.length-1?'round':''));b.dataset.stepIndex=i;b.append(el('span',String(i+1),'step-number'),el('span',typeof step==='string'?step:'步驟內容待確認'));chart.append(b);
      });if(!steps.length)chart.append(el('p','尚未提供步驟','empty'));group.append(chart);
      const overlay=el('div',undefined,'flow-overlay');overlay.append(el('h3','影響此流程的工作'));for(const t of scopedTasks(process))overlay.append(objectButton(t));group.append(overlay);host.append(group);
    }host.append(el('p','工作完成只更新工作資訊，不代表訂單已核准、流程已執行或測試通過。','muted'));
  }
  function renderTimeline(host){
    host.append(el('h2','時程與里程碑'),el('p','只在日期軸放入已確認的排期；待確認的項目留在待排區。階段順序不代表日期或交付承諾。','muted'));
    const items=scoped().filter(o=>['goal','task'].includes(o.kind)),dated=items.map(o=>({o,s:Core.confirmedSchedule(o)})).filter(x=>x.s);
    if(dated.length){
      const day=86400000,min=Math.min(...dated.map(x=>Date.parse(x.s.start))),max=Math.max(...dated.map(x=>Date.parse(x.s.end)))+day,axis=el('section',undefined,'calendar-timeline');axis.append(el('h3','已確認排期'));
      const ticks=el('div',undefined,'timeline-ticks');for(const d of [min,min+(max-min)/2,max-day])ticks.append(el('span',new Date(d).toISOString().slice(0,10)));axis.append(ticks);
      for(const {o,s} of dated){const row=el('div',undefined,'dated-row');row.append(objectButton(o),el('p',s.start+(s.end!==s.start?' → '+s.end:''),'muted'));const track=el('div',undefined,'date-track'),bar=button(s.start+(s.end!==s.start?' → '+s.end:''),()=>selectObject(o.id),'date-bar');bar.style.left=((Date.parse(s.start)-min)/(max-min)*100)+'%';bar.style.width=Math.max(1,(Date.parse(s.end)+day-Date.parse(s.start))/(max-min)*100)+'%';bar.setAttribute('aria-label',o.title+'，'+s.start+' 至 '+s.end);track.append(bar);row.append(track);axis.append(row);}host.append(axis);
    }else{const empty=el('div',undefined,'undated-axis');empty.append(el('span','日期軸'),el('strong','尚無已確認日期'),el('span','不以示意日期代替實際排期'));host.append(empty);}
    const waiting=el('section',undefined,'waiting-schedule');waiting.append(el('h3','待排期 · 未確認日期'));
    const goals=items.filter(o=>o.kind==='goal'),placed=new Set();
    for(const goal of goals){const tasks=scopedTasks(goal).filter(o=>!Core.confirmedSchedule(o));if(Core.confirmedSchedule(goal)&&!tasks.length)continue;const stage=el('section',undefined,'milestone-stage');stage.append(el('div',goal.fields.phase||'階段待確認','eyebrow'),objectButton(goal),el('p',Core.confirmedSchedule(goal)?'目標日期已確認，以下工作仍待排期':'里程碑日期待確認','schedule-unknown'));for(const t of tasks){stage.append(objectButton(t));placed.add(t.id);}waiting.append(stage);}
    const others=items.filter(o=>o.kind==='task'&&!Core.confirmedSchedule(o)&&!placed.has(o.id));if(others.length){const stage=el('section',undefined,'milestone-stage');stage.append(el('h3','尚未關聯階段的工作'));others.forEach(o=>stage.append(objectButton(o)));waiting.append(stage);}
    if(!items.length)waiting.append(el('p','此功能尚未載入階段、日期與工作安排。','empty'));else if(items.every(o=>Core.confirmedSchedule(o)))waiting.append(el('p','所有已載入項目均有確認排期。','muted'));host.append(waiting);
  }

  function relatedResults(task){
    const first=Core.connected(state,task.id).filter(o=>['decision','case','evidence'].includes(o.kind)),ids=new Set(first.map(o=>o.id));
    for(const d of first.filter(o=>o.kind==='decision'))for(const o of Core.connected(state,d.id))if(['case','evidence'].includes(o.kind))ids.add(o.id);
    return state.objects.filter(o=>ids.has(o.id));
  }
  function sourceDetail(s){const section=el('div',undefined,'source');section.append(el('strong',s.title),el('p',s.version),el('code',s.locator),el('p',s.note));return section;}
  function rememberDraft(o,select,input){const values={status:select.value==='unknown'?null:select.value,owner:input.value};if(values.status===o.fields.status&&values.owner===(o.fields.owner||''))drafts.delete(o.id);else drafts.set(o.id,values);saveState();}
  function renderPanel(){
    const panel=$('objectPanel'),o=node(selected);panel.replaceChildren();panel.hidden=!o;$('workspaceLayout').classList.toggle('has-detail',!!o);if(!o)return;
    panel.tabIndex=-1;const close=button('關閉詳情',closePanel,'close-detail');panel.append(close,el('p',kindNames[o.kind],'eyebrow'),el('h2',o.title),el('code',o.id+' · revision '+o.revision),el('p',o.note));
    if(o.kind==='task'){
      const form=el('form');form.id='taskForm';const fields=el('fieldset');fields.disabled=busy;
      const label=el('label','狀態'),select=el('select');select.id='taskStatus';select.name='status';for(const [key,text] of Object.entries(statusNames)){const option=el('option',text);option.value=key;select.append(option);}
      const draft=drafts.get(o.id);select.value=(draft?draft.status:o.fields.status)||'unknown';label.append(select);
      const ownerLabel=el('label','負責人'),input=el('input');input.id='taskOwner';input.name='owner';input.maxLength=100;input.value=draft?draft.owner:o.fields.owner||'';input.placeholder='留空代表待確認';ownerLabel.append(input);
      select.addEventListener('change',()=>rememberDraft(o,select,input));input.addEventListener('input',()=>rememberDraft(o,select,input));
      const save=el('button','儲存任務');save.id='saveTask';save.type='submit';fields.append(label,ownerLabel,save,button('還原編輯',()=>{drafts.delete(o.id);render();}));form.append(fields,el('p','工作、流程與時程共用此筆資料。儲存後仍需下載 JSON 保存。','muted'));
      form.addEventListener('submit',e=>{e.preventDefault();try{const next=Core.patchTask(state,o.id,{status:select.value==='unknown'?null:select.value,owner:input.value});if(next.revision!==state.revision){state=next;dirty=true;}drafts.delete(o.id);render();message('已更新 '+o.id+'；相關視角讀取同一筆資料，尚未匯出保存。');}catch(err){message(err.message,true);}});panel.append(form);
      const results=el('section',undefined,'task-results');results.id='relatedResults';results.append(el('h3','相關細節與成果'));const artifacts=relatedResults(o);if(!artifacts.length)results.append(el('p','尚未提供關聯成果，不推定沒有成果。','muted'));for(const item of artifacts){results.append(objectButton(item));if(['case','evidence'].includes(item.kind))results.append(el('p',item.fields.testResult==null?'未取得實測通過證據':'來源測試結果：'+String(item.fields.testResult),'muted'));}panel.append(results);
    }
    if(['case','evidence'].includes(o.kind))panel.append(el('p',o.fields.testResult==null?'測試結果待確認；未取得實測通過證據':'來源測試結果：'+String(o.fields.testResult),'evidence-note'));
    const relations=el('details');relations.append(el('summary','關聯物件'));const related=el('div',undefined,'related');for(const r of state.relations.filter(r=>r.fromId===o.id||r.toId===o.id)){const target=node(r.fromId===o.id?r.toId:r.fromId);related.append(button((r.fromId===o.id?'→ ':'← ')+(relationNames[r.predicate]||r.predicate)+' · '+target.title+' · '+certaintyNames[r.certainty],()=>selectObject(target.id)));}relations.append(related);panel.append(relations);
    const assertions=state.assertions.filter(a=>a.subjectId===o.id);if(assertions.length){const details=el('details');details.append(el('summary','待確認與來源註記'));for(const a of assertions){const section=el('div',undefined,'assertion');section.append(el('strong',certaintyNames[a.certainty]+' · '+a.field),el('p',a.text));for(const sid of a.sourceRefs)section.append(el('p','來源 '+sid,'muted'));details.append(section);}panel.append(details);}
    const sources=el('details');sources.append(el('summary','來源資料'));for(const sid of o.sourceRefs)sources.append(sourceDetail(state.sources.find(s=>s.id===sid)));if(!o.sourceRefs.length)sources.append(el('p','未提供外部來源。'));panel.append(sources);
  }
  function renderHeader(){
    const h=$('exploreHeader');h.replaceChildren();
    if(!moduleId){h.append(el('p','工作空間 / OMG 功能版圖','breadcrumb'));return;}
    const module=node(moduleId),scope=scoped(),tasks=scope.filter(o=>o.kind==='task');const crumb=el('div',undefined,'breadcrumb');const back=button('← 返回 OMG 功能全覽',()=>navigate());back.id='returnOverview';crumb.append(back,el('span','/ '+module.title));h.append(crumb);
    const feature=el('div',undefined,'feature-heading');feature.append(el('div','FEATURE EXPLORER','eyebrow'),el('h2',module.title),el('p',progress(tasks),'muted'));const facts=el('div',undefined,'feature-context');facts.append(el('code',module.id),el('span',scope.filter(o=>o.kind==='process').length+' 條已載入流程'),el('span','交付與日期：以來源為準'));feature.append(facts);h.append(feature);
    const tabs=el('nav');tabs.id='viewTabs';tabs.setAttribute('aria-label','功能詳細視角');for(const [key,title] of Object.entries(detailViews)){const b=button(title,()=>navigate(moduleId,key));b.dataset.view=key;b.setAttribute('aria-pressed',String(view===key));tabs.append(b);}h.append(tabs);
  }
  function render(){
    mapObserver?.disconnect();mapObserver=null;mapFit=null;$('workspace').hidden=!state;document.body.classList.toggle('loaded',!!state);document.body.classList.toggle('in-overview',!!state&&!moduleId);$('globalOverview').hidden=!state||!moduleId;$('exportButton').disabled=!state||busy;saveState();if(!state)return;
    $('workspaceTitle').textContent=state.title;$('workspaceRevision').textContent=state.id+' · revision '+state.revision;renderHeader();
    const host=$('viewContent');host.replaceChildren();host.classList.toggle('overview-content',!moduleId);
    if(moduleId)({work:renderWork,flow:renderFlow,timeline:renderTimeline})[view](host);else renderOverview(host);renderPanel();
    const log=$('changeLog');log.replaceChildren();for(const c of state.changes.slice(-20).reverse())log.append(el('p',c.at+' · '+c.objectId+' · '+statusNames[c.before.status||'unknown']+' → '+statusNames[c.after.status||'unknown']+' · 負責人 '+(c.before.owner||'待確認')+' → '+(c.after.owner||'待確認')));if(!state.changes.length)log.append(el('p','尚無變更'));else log.append(el('p','顯示最近 20 筆；完整紀錄保留於匯出檔。','muted'));
  }
  function mayReplace(){return !(dirty||drafts.size)||window.confirm('目前有未保存的編輯或未匯出的變更。確定捨棄並載入另一份資料？');}
  function adopt(next){state=next;dirty=false;drafts.clear();moduleId=null;view='work';selected=null;routeGuard=true;history.replaceState(null,'','#overview');routeGuard=false;render();}
  async function loading(fn){if(busy)return;busy=true;for(const id of ['loadDemo','importButton','exportButton'])$(id).disabled=true;const fields=$('taskForm')?.querySelector('fieldset');if(fields)fields.disabled=true;try{await fn();}catch(err){message(err.message,true);}finally{busy=false;for(const id of ['loadDemo','importButton'])$(id).disabled=false;render();}}
  $('loadDemo').addEventListener('click',()=>{if(!mayReplace())return;loading(async()=>{const r=await fetch('assets/workspace-demo.json',{cache:'no-store'});if(!r.ok)throw new Error('無法載入範例，請用本機 HTTP 伺服器開啟');adopt(Core.parse(await r.text()));message('已載入 OMG 功能版圖；點選 Amendment 開始探索，未確認狀態與日期保持空白。');});});
  $('importButton').addEventListener('click',()=>{if(!busy)$('workspaceFile').click();});
  $('globalOverview').addEventListener('click',()=>navigate());
  $('workspaceFile').addEventListener('change',()=>{const file=$('workspaceFile').files[0];$('workspaceFile').value='';if(!file)return;loading(async()=>{if(file.size>Core.MAX_BYTES)throw new Error('檔案超過 2 MB 限制');const next=Core.parse(await file.text());if(!mayReplace())return;adopt(next);message('已載入獨立 Workspace 檔案；ID 與來源保留，既有白板未變更。');});});
  $('exportButton').addEventListener('click',()=>{if(!state||busy)return;if(drafts.size){message('尚有未儲存的任務編輯，請先儲存任務或還原編輯，再下載 JSON。',true);return;}try{const raw=Core.serialize(state),url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=el('a');a.href=url;a.download=state.id+'.workspace.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);dirty=false;saveState();message('已交給瀏覽器下載；請確認檔案已保存，下次由「匯入 Workspace JSON」重新開啟。');}catch(err){message(err.message,true);}});
  window.addEventListener('beforeunload',e=>{if(dirty||drafts.size){e.preventDefault();e.returnValue='';}});
  render();
})();
