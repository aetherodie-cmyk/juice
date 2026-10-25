'use strict';
window.JuiceNestedViews={init(api){
  const C=window.JuiceNested,$=id=>document.getElementById(id),panel=$('tablePanel'),rows=$('tableRows');
  const columns={title:'工作名稱',status:'狀態',owner:'負責人',dueDate:'期限',scope:'本階段範圍'};
  const scopes={unknown:'範圍待確認',in:'◆ 本階段',out:'◇ 非本階段'};
  const defaults=()=>({view:'work',visible:true,fullscreen:false,width:480,sort:'title',desc:false,search:'',owner:'',status:'all',scope:'all',columns:['title','status','owner','dueDate','scope'],collapsed:[]});
  let cfg=defaults();
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function btn(text,fn,cls){const n=el('button',text,cls);n.type='button';n.onclick=fn;return n;}
  function select(options,value,label,fn){const s=el('select');s.setAttribute('aria-label',label);for(const [v,t] of Object.entries(options)){const op=el('option',t);op.value=v;s.append(op);}s.value=value;s.onchange=()=>fn(s.value);return s;}
  function changed(){api.getState().ui.list=structuredClone(cfg);api.changed();}
  function rule(o){return api.rules().statuses[o.status||'unknown'];}
  function saveDraftControl(input,commit){let last=input.value;const apply=()=>{if(last===input.value)return;const value=input.value;if(commit(value)!==false)last=value;};input.onchange=apply;input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.blur();apply();}};}
  function renderChrome(){
    panel.hidden=!cfg.visible;panel.classList.toggle('list-fullscreen',cfg.fullscreen);$('workspaceBody').style.setProperty('--list-width',cfg.width+'px');
    $('listSplitter').setAttribute('aria-valuemin','300');$('listSplitter').setAttribute('aria-valuemax','1000');$('listSplitter').setAttribute('aria-valuenow',String(cfg.width));
    $('workspaceBody').classList.toggle('list-hidden',!cfg.visible);$('workspaceBody').classList.toggle('list-expanded',cfg.visible&&cfg.fullscreen);
    $('toggleTable').textContent=cfg.visible?'隱藏清單':'顯示清單';$('toggleTable').setAttribute('aria-expanded',String(cfg.visible));
    $('listFullscreen').textContent=cfg.fullscreen?'返回右側':'全畫面';$('listFullscreen').setAttribute('aria-pressed',String(cfg.fullscreen));
    $('workControls').hidden=false;$('tableTitle').textContent='樹狀工作表格';
    const r=api.rules().statuses;for(const [id,key] of [['filterSearch','search'],['filterOwner','owner'],['filterStatus','status'],['filterScope','scope'],['sortField','sort']])$(id).value=cfg[key];
    $('sortDirection').textContent=cfg.desc?'降冪 ↓':'升冪 ↑';
    $('filterStatus').replaceChildren(...Object.entries({all:'全部狀態',...Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v.label]))}).map(([v,t])=>{const n=el('option',t);n.value=v;return n;}));$('filterStatus').value=cfg.status;
    $('columnOptions').replaceChildren();for(const [key,label] of Object.entries(columns)){const wrap=el('label'),input=el('input');input.type='checkbox';input.checked=cfg.columns.includes(key);input.disabled=key==='title';input.onchange=()=>{cfg.columns=Object.keys(columns).filter(k=>k===key?input.checked:cfg.columns.includes(k));changed();renderRows();};wrap.append(input,document.createTextNode(label));$('columnOptions').append(wrap);}
  }
  function nameButton(o,path){const b=btn(o.title,()=>api.locate(o.id,path),'locate-card');b.setAttribute('aria-label','定位 '+o.title);return b;}
  function advanced(o,item){
    const state=api.getState(),dialog=el('dialog',undefined,'table-info'),heading=el('h2',o.title+' · 進階資訊'),details=el('dl');
    const refs=state.memberships.filter(m=>m.objectId===o.id).length+state.placements.filter(p=>p.objectId===o.id).length;
    for(const [key,value] of [['ID',o.id],['類型',o.type==='task'?'工作':({project:'專案',feature:'功能','work-group':'工作群組'}[o.purpose]||'容器')],['完整路徑',[...item.parents,o.title].join(' › ')||'未放置'],['此處關係',item.unplaced?'未放置':item.primary?'主要歸屬':'引用'],['主要歸屬',C.primaryLabel(state,o.id)],['顯示位置',String(refs)]])details.append(el('dt',key),el('dd',value));
    const close=btn('關閉',()=>dialog.close());dialog.append(heading,details,close);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();close.focus();
  }
  function renderRows(){
    rows.replaceChildren();const state=api.getState(),data=C.occurrences(state),byId=new Map(state.objects.map(o=>[o.id,o])),all=state.objects.filter(o=>o.type==='task'),seen=new Set(data.rows.map(i=>i.id));
    const entries=[...data.rows,...state.objects.filter(o=>!seen.has(o.id)&&!data.truncated).map(o=>({id:o.id,path:'unplaced:'+o.id,parents:[],depth:0,unplaced:true}))];
    const search=cfg.search.trim().toLowerCase(),filtering=!!(search||cfg.owner||cfg.status!=='all'||cfg.scope!=='all');
    const matches=o=>o.type==='task'&&(!search||(o.title+' '+o.description).toLowerCase().includes(search))&&(!cfg.owner||(o.owner||'').toLowerCase().includes(cfg.owner.toLowerCase()))&&(cfg.status==='all'||(o.status||'unknown')===cfg.status)&&(cfg.scope==='all'||(o.scope||'unknown')===cfg.scope);
    const keep=new Set(),matched=new Set(all.filter(matches).map(o=>o.id));for(const i of entries){const o=byId.get(i.id);if(matches(o)){let p=i.path;while(p){keep.add(p);const at=p.lastIndexOf('/');p=at<0?'':p.slice(0,at);}}}
    const statusOrder={unknown:0,todo:1,doing:2,blocked:3,done:4},children=new Map();
    for(const i of entries){const at=i.path.lastIndexOf('/'),parent=at<0?'':i.path.slice(0,at);if(!children.has(parent))children.set(parent,[]);children.get(parent).push(i);}
    function compare(a,b){const x=byId.get(a.id),y=byId.get(b.id);let n=cfg.sort==='status'?(statusOrder[x.status||'unknown']-statusOrder[y.status||'unknown']):String(x[cfg.sort]||(cfg.sort==='dueDate'?'9999':'')).localeCompare(String(y[cfg.sort]||(cfg.sort==='dueDate'?'9999':'')),'zh-Hant');return(cfg.desc?-n:n)||x.title.localeCompare(y.title,'zh-Hant')||a.path.localeCompare(b.path);}
    $('tableHead').replaceChildren(...cfg.columns.map(k=>el('th',columns[k])));
    function append(parent){for(const item of (children.get(parent)||[]).sort(compare)){
      if(filtering&&!keep.has(item.path))continue;const o=byId.get(item.id),row=el('tr');row.dataset.objectId=o.id;row.dataset.path=item.path;row.dataset.type=o.type;row.dataset.depth=item.depth;row.dataset.ownership=item.primary?'primary':'reference';
      if(o.type==='task'){row.dataset.status=o.status||'unknown';row.style.setProperty('--status-color',rule(o).color);}
      for(const key of cfg.columns){const td=el('td');td.dataset.column=key;
        if(key==='title'){const name=el('div',undefined,'table-name');name.style.paddingLeft=item.depth*16+'px';if(o.type==='container'){const open=filtering||!cfg.collapsed.includes(item.path),toggle=btn(open?'▾':'▸',()=>{cfg.collapsed=open?[...new Set([...cfg.collapsed,item.path])]:cfg.collapsed.filter(p=>p!==item.path);changed();renderRows();},'table-branch');toggle.disabled=filtering;toggle.setAttribute('aria-label',(open?'收合表格 ':'展開表格 ')+o.title);toggle.setAttribute('aria-expanded',String(open));name.append(toggle);}else name.append(el('span','', 'table-spacer'));name.append(nameButton(o,item.unplaced?undefined:item.path));if(!item.primary&&!item.unplaced){const ref=el('span','↗','table-reference');ref.title='引用：修改會同步所有位置';name.append(ref);}const info=btn('⋯',()=>advanced(o,item),'table-advanced');info.setAttribute('aria-label',o.title+' 進階資訊');name.append(info);td.append(name);}
        else if(o.type==='container'){if(key==='status'){const s=C.taskSummary(state,o.id);td.append(el('span',s.total+' 項工作 · 完成 '+s.done+' · 受阻 '+s.blocked,'table-summary'));}else td.textContent=key==='scope'?scopes[o.scope||'unknown']:'—';}
        else if(key==='status')td.append(select(Object.fromEntries(Object.entries(api.rules().statuses).map(([k,v])=>[k,v.label])),o.status||'unknown',o.title+' 表格狀態',v=>api.updateTask(o.id,'status',v==='unknown'?null:v)));
        else if(key==='scope')td.append(select(scopes,o.scope||'unknown',o.title+' 本階段範圍',v=>api.updateTask(o.id,'scope',v==='unknown'?null:v)));
        else{const input=el('input');input.type=key==='dueDate'?'date':'text';input.value=o[key]||'';input.maxLength=100;input.placeholder='待確認';input.setAttribute('aria-label',o.title+(key==='owner'?' 表格負責人':' 表格期限'));saveDraftControl(input,v=>api.updateTask(o.id,key,v||null));td.append(input);}row.append(td);
      }rows.append(row);if(filtering||!cfg.collapsed.includes(item.path))append(item.path);
    }}append('');
    $('tableCount').textContent=matched.size+'／'+all.length+' 項唯一工作 · 引用不重複計數';
    $('listSummary').textContent=Object.entries(api.rules().statuses).map(([k,v])=>v.label+' '+all.filter(o=>(o.status||'unknown')===k).length).join(' · ')+' ｜非功能完成率';
    if(!rows.children.length){const row=el('tr'),td=el('td','沒有符合條件的工作');td.colSpan=cfg.columns.length;row.append(td);rows.append(row);}
    if(data.truncated){const row=el('tr'),td=el('td','已達 500 個顯示位置；統計仍計算完整唯一工作。請縮小資料範圍。');td.colSpan=cfg.columns.length;row.append(td);rows.append(row);}
  }
  function render(){renderChrome();renderRows();}
  function restore(){cfg={...defaults(),...api.getState().ui.list,view:'work'};cfg.columns=Object.keys(columns).filter(k=>k==='title'||cfg.columns.includes(k));render();}
  $('toggleTable').onclick=()=>{cfg.visible=!cfg.visible;changed();render();};$('closeList').onclick=()=>{cfg.visible=false;changed();render();};
  $('listFullscreen').onclick=()=>{cfg.fullscreen=!cfg.fullscreen;changed();render();};
  for(const [id,key] of [['filterSearch','search'],['filterOwner','owner']])$(id).oninput=()=>{cfg[key]=$(id).value;changed();renderRows();};
  for(const [id,key] of [['filterStatus','status'],['filterScope','scope'],['sortField','sort']])$(id).onchange=()=>{cfg[key]=$(id).value;changed();renderRows();};
  $('sortDirection').onclick=()=>{cfg.desc=!cfg.desc;changed();renderChrome();renderRows();};$('clearFilters').onclick=()=>{Object.assign(cfg,{search:'',owner:'',status:'all',scope:'all'});changed();render();};
  const splitter=$('listSplitter');let resizing=false;
  splitter.onpointerdown=e=>{if(e.button!==0)return;resizing=true;splitter.setPointerCapture(e.pointerId);};splitter.onpointermove=e=>{if(!resizing)return;cfg.width=Math.min(1000,Math.max(300,innerWidth-e.clientX));renderChrome();};splitter.onpointerup=splitter.onpointercancel=()=>{if(resizing){resizing=false;changed();}};
  splitter.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();cfg.width=Math.max(300,Math.min(1000,cfg.width+(e.key==='ArrowLeft'?30:-30)));changed();renderChrome();};
  $('colorRules').onclick=()=>api.editRules();
  return {render,restore,revealCanvas(){if(cfg.fullscreen){cfg.fullscreen=false;changed();render();}}};
}};
