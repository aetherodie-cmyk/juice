'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.JuiceNested=api;})(typeof window==='undefined'?globalThis:window,()=>{
  const FORMAT='juice-nested-board',VERSION=1,STORE_KEY='juice-nested-prototype-v1',MAX_BYTES=20*1024*1024;
  const STATUS=[null,'todo','doing','blocked','done'],COLORS=['paper','amber','sage','blue','rose','lavender','grey'],PURPOSES=['general','project','feature','work-group'];
  const validColor=value=>COLORS.includes(value)||typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value);
  const clone=x=>JSON.parse(JSON.stringify(x)),obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  function ok(value,message){if(!value)throw new Error(message);}
  function text(value,max,name){ok(typeof value==='string'&&value.length<=max,name+'格式或長度不正確');}
  function id(value){ok(typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value),'ID 格式不正確');}
  function list(value,max,name){ok(Array.isArray(value)&&value.length<=max,name+'數量或格式不正確');}
  function num(value,min,max){ok(typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max,'座標或尺寸不正確');}
  function ids(items){const s=new Set();for(const item of items){ok(obj(item),'物件格式不正確');id(item.id);ok(!s.has(item.id),'ID 重複：'+item.id);s.add(item.id);}return s;}
  function validDate(value){return value===null||typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
  function occurrence(d,path){const [pid,...edges]=path.split('/'),p=d.placements.find(x=>x.id===pid);if(!p)return null;let current=p.objectId;for(const edgeId of edges){const e=d.memberships.find(x=>x.id===edgeId&&x.containerId===current);if(!e)return null;current=e.objectId;}return d.objects.find(x=>x.id===current)||null;}
  function visibleCount(d){let n=0;const expanded=new Set(d.ui.expanded);const visit=(id,path)=>{ok(++n<=500,'展開後超過 500 個卡片引用，請先收合部分容器');const o=d.objects.find(x=>x.id===id);if(o.type==='container'&&expanded.has(path))for(const e of d.memberships.filter(x=>x.containerId===id))visit(e.objectId,path+'/'+e.id);};for(const p of d.placements)visit(p.objectId,p.id);return n;}
  function validate(d){
    ok(obj(d)&&d.format===FORMAT&&d.version===VERSION,'請使用 juice-nested-board 第 1 版原型檔');id(d.id);text(d.title,200,'名稱');ok(Number.isSafeInteger(d.revision)&&d.revision>=1,'版本不正確');
    ok(obj(d.board),'缺少原白板副本');ok(d.board.schemaVersion==null||[1,2,3].includes(d.board.schemaVersion),'不支援此白板版本');list(d.board.cards,200,'原白板卡片');list(d.board.links||[],1000,'原白板連線');const cardIds=ids(d.board.cards);ids(d.board.links||[]);for(const l of d.board.links||[])ok(cardIds.has(l.from)&&cardIds.has(l.to),'原白板連線指向不存在的卡片');
    list(d.objects,200,'巢狀物件');list(d.memberships,400,'引用');list(d.placements,100,'畫布卡片');ids(d.objects);ids(d.memberships);ids(d.placements);
    const map=new Map(d.objects.map(o=>[o.id,o]));for(const o of d.objects){ok(['container','task'].includes(o.type),'不支援的卡片類型');text(o.title,200,'卡片標題');ok(o.title.trim(),'卡片標題不可空白');ok(Number.isSafeInteger(o.revision)&&o.revision>=1,'卡片版本不正確');if(o.type==='container'){ok(validColor(o.color),'容器顏色不正確');ok(o.purpose==null||PURPOSES.includes(o.purpose),'容器用途不正確');}else{ok(o.color==null||validColor(o.color),'工作卡顏色不正確');ok(o.purpose==null,'工作卡不能設定容器用途');ok(STATUS.includes(o.status),'工作狀態不正確');ok(o.owner===null||typeof o.owner==='string'&&o.owner.length<=100,'負責人不正確');ok(validDate(o.dueDate),'日期格式不正確');text(o.description,10000,'說明');}}
    const pairs=new Set();for(const e of d.memberships){ok(map.get(e.containerId)?.type==='container'&&map.has(e.objectId),'引用的容器或物件不存在');const pair=e.containerId+'/'+e.objectId;ok(!pairs.has(pair),'同一容器不可重複加入相同物件');pairs.add(pair);}
    const done=new Map(),stack=new Set();function depth(id){ok(!stack.has(id),'容器引用形成循環');if(done.has(id))return done.get(id);stack.add(id);let n=1;for(const e of d.memberships.filter(e=>e.containerId===id))n=Math.max(n,1+depth(e.objectId));stack.delete(id);ok(n<=8,'巢狀深度最多 8 層');done.set(id,n);return n;}for(const o of d.objects)depth(o.id);
    for(const p of d.placements){ok(map.has(p.objectId),'畫布卡片指向不存在的物件');num(p.x,-100000,100000);num(p.y,-100000,100000);num(p.w,300,700);}
    ok(obj(d.boardPositions),'原白板位置覆層格式不正確');for(const [key,p] of Object.entries(d.boardPositions)){ok(cardIds.has(key)&&obj(p),'原白板位置參照不存在');num(p.x,-100000,100000);num(p.y,-100000,100000);}
    ok(obj(d.ui)&&obj(d.ui.view),'缺少觀看設定');num(d.ui.view.x,-1000000,1000000);num(d.ui.view.y,-1000000,1000000);num(d.ui.view.zoom,.25,2);
    for(const [key,type] of [['expanded','container'],['details','task']]){list(d.ui[key],500,'展開清單');const paths=new Set();for(const path of d.ui[key]){text(path,1200,'引用路徑');ok(!paths.has(path),'引用路徑重複');paths.add(path);ok(occurrence(d,path)?.type===type,'展開的引用路徑不正確');}}
    visibleCount(d);return clone(d);
  }
  function parse(raw){text(raw,MAX_BYTES,'資料');ok(new TextEncoder().encode(raw).length<=MAX_BYTES,'原型檔超過 20 MB');let d;try{d=JSON.parse(raw);}catch{throw new Error('JSON 無法讀取，原型資料未變更');}return validate(d);}
  function serialize(d){const raw=JSON.stringify(validate(d),null,2);ok(new TextEncoder().encode(raw).length<=MAX_BYTES,'原型檔超過 20 MB');return raw;}
  function patchTask(d,objectId,fields){const next=validate(d),o=next.objects.find(x=>x.id===objectId);ok(o?.type==='task','找不到工作卡');ok(obj(fields)&&Object.keys(fields).every(k=>['title','status','owner','dueDate','description','color'].includes(k)),'工作欄位不正確');const before=JSON.stringify(o);Object.assign(o,fields);if(typeof o.owner==='string')o.owner=o.owner.trim()||null;if(JSON.stringify(o)!==before){o.revision++;next.revision++;}validate(next);return next;}
  function patchContainer(d,objectId,fields){const next=validate(d),o=next.objects.find(x=>x.id===objectId);ok(o?.type==='container','找不到容器卡');ok(obj(fields)&&Object.keys(fields).every(k=>['title','purpose','color'].includes(k)),'容器欄位不正確');const before=JSON.stringify(o);Object.assign(o,fields);if(JSON.stringify(o)!==before){o.revision++;next.revision++;}validate(next);return next;}
  function toggle(d,path,key='expanded'){ok(['expanded','details'].includes(key),'不支援此展開設定');const next=clone(d),a=next.ui[key];next.ui[key]=a.includes(path)?a.filter(x=>x!==path):[...a,path];return validate(next);}
  function addReference(d,containerId,objectId){const next=clone(d);next.memberships.push({id:'ref-'+crypto.randomUUID(),containerId,objectId});next.revision++;return validate(next);}
  function addObject(d,type,title,position,purpose='general',color='amber'){const next=clone(d),id='object-'+crypto.randomUUID();next.objects.push(type==='container'?{id,type,title,color,purpose,revision:1}:{id,type,title,color,status:null,owner:null,dueDate:null,description:'',revision:1});next.placements.push({id:'place-'+crypto.randomUUID(),objectId:id,x:position.x,y:position.y,w:440});next.revision++;return validate(next);}
  function addChild(d,containerId,type,title,purpose='general',color='amber'){const next=validate(d),id='object-'+crypto.randomUUID();ok(next.objects.some(o=>o.id===containerId&&o.type==='container'),'找不到上層容器');next.objects.push(type==='container'?{id,type,title,color,purpose,revision:1}:{id,type,title,color,status:null,owner:null,dueDate:null,description:'',revision:1});next.memberships.push({id:'ref-'+crypto.randomUUID(),containerId,objectId:id});next.revision++;return validate(next);}
  function references(d,objectId){return d.memberships.filter(e=>e.objectId===objectId).length+d.placements.filter(p=>p.objectId===objectId).length;}
  function cleanUi(d){d.ui.expanded=d.ui.expanded.filter(path=>occurrence(d,path)?.type==='container');d.ui.details=d.ui.details.filter(path=>occurrence(d,path)?.type==='task');}
  function promoteUnplaced(d,objectIds,x,y){let offset=0;for(const objectId of new Set(objectIds)){if(references(d,objectId))continue;d.placements.push({id:'place-'+crypto.randomUUID(),objectId,x:Math.max(-100000,Math.min(100000,x)),y:Math.max(-100000,Math.min(100000,y+offset)),w:440});offset+=260;}}
  function removeOccurrence(d,path){const next=validate(d),current=occurrence(next,path);ok(current,'找不到此位置的卡片');const parts=path.split('/'),root=next.placements.find(p=>p.id===parts[0]);if(parts.length===1){ok(references(next,current.id)>1,'這是卡片最後一個位置；若要移除，請使用「刪除卡片」');next.placements=next.placements.filter(p=>p.id!==root.id);}else{const edgeId=parts.at(-1),edge=next.memberships.find(e=>e.id===edgeId);ok(edge&&edge.objectId===current.id,'找不到此引用');next.memberships=next.memberships.filter(e=>e.id!==edgeId);promoteUnplaced(next,[current.id],root.x+root.w+40,root.y);}cleanUi(next);next.revision++;return validate(next);}
  function deleteObject(d,objectId){const next=validate(d),current=next.objects.find(o=>o.id===objectId);ok(current,'找不到卡片');const children=next.memberships.filter(e=>e.containerId===objectId).map(e=>e.objectId),anchor=next.placements.find(p=>p.objectId===objectId)||next.placements[0]||{x:60,y:120};next.objects=next.objects.filter(o=>o.id!==objectId);next.memberships=next.memberships.filter(e=>e.containerId!==objectId&&e.objectId!==objectId);next.placements=next.placements.filter(p=>p.objectId!==objectId);promoteUnplaced(next,children,anchor.x,anchor.y);cleanUi(next);next.revision++;return validate(next);}
  const overlaps=(a,b,gap=0)=>a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;
  function layout(items,gap=18){
    const placed=[];const ordered=[...items].sort((a,b)=>Number(b.active)-Number(a.active)||a.y-b.y||a.x-b.x||a.id.localeCompare(b.id));
    for(const item of ordered){const p={...item,shifted:false};for(let pass=0;pass<=items.length;pass++){const hit=placed.filter(b=>(p.active||b.active||p.shifted||b.shifted)&&overlaps(p,b,gap));if(!hit.length)break;p.y=Math.max(...hit.map(b=>b.y+b.h+gap));p.shifted=true;}placed.push(p);}
    return placed;
  }
  function seed(board){
    if(board!=null)ok(obj(board)&&Array.isArray(board.cards),'請匯入白板 JSON 或巢狀原型檔，不接受 Workspace 或流程圖交換資料');
    const imported=board!=null,base=board||{schemaVersion:3,boardId:'demo-source-board',cards:[
      {id:'legacy-transfer',title:'轉單',x:60,y:160,w:230,color:'rose',blocks:[{id:'legacy-transfer-text',type:'text',html:'既有白板卡片與連線，保留原始資料。'}],tags:[]},
      {id:'legacy-order',title:'訂單',x:330,y:400,w:310,color:'amber',blocks:[{id:'legacy-order-text',type:'text',html:'展開上方容器時，這張卡會暫時向下避讓。'}],tags:[]},
      {id:'legacy-oracle',title:'Oracle',x:1140,y:350,w:230,color:'paper',blocks:[{id:'legacy-oracle-text',type:'text',html:'既有系統參考卡'}],tags:[]}
    ],links:[{id:'legacy-link-1',from:'legacy-transfer',to:'legacy-order',dir:'to',label:'既有連線'},{id:'legacy-link-2',from:'legacy-order',to:'legacy-oracle',dir:'to',label:'參考關係'}],groups:[],images:[],icons:[],iconLibrary:[],notes:[],view:{x:0,y:0,zoom:1},savedAt:0};
    const x=imported?Math.max(0,...base.cards.map(c=>(Number(c.x)||0)+(Number(c.w)||240)))+80:330;
    return validate({format:FORMAT,version:VERSION,id:'nested-'+crypto.randomUUID(),title:'JUICE-UI-001 · 巢狀卡片原型',revision:1,board:clone(base),boardPositions:{},objects:[
      {id:'C-OMG',type:'container',title:'OMG',color:'lavender',purpose:'project',revision:1},{id:'C-AMEND',type:'container',title:'異動',color:'amber',purpose:'feature',revision:1},{id:'C-WORK',type:'container',title:'工作清單',color:'amber',purpose:'work-group',revision:1},{id:'C-REVIEW',type:'container',title:'驗收準備 · 共用引用',color:'sage',purpose:'work-group',revision:1},
      {id:'T-PROTOTYPE',type:'task',title:'Prototype 確認',status:null,owner:null,dueDate:null,description:'操作範例：確認改址、止寄、復寄的 Prototype 是否符合需求。實際狀態、負責人與日期待確認；截圖中的示意值不視為事實。',revision:1},
      {id:'T-DEVELOP',type:'task',title:'功能開發',status:null,owner:null,dueDate:null,description:'本項僅為巢狀工作卡示範，不代表已承諾開發時程。',revision:1},
      {id:'T-TEST',type:'task',title:'使用者測試',status:null,owner:null,dueDate:null,description:'實際驗收範圍及證據待補。',revision:1}
    ],memberships:[{id:'M-OMG-AMEND',containerId:'C-OMG',objectId:'C-AMEND'},{id:'M-AMEND-WORK',containerId:'C-AMEND',objectId:'C-WORK'},{id:'M-WORK-PROTO',containerId:'C-WORK',objectId:'T-PROTOTYPE'},{id:'M-WORK-DEV',containerId:'C-WORK',objectId:'T-DEVELOP'},{id:'M-WORK-TEST',containerId:'C-WORK',objectId:'T-TEST'},{id:'M-REVIEW-PROTO',containerId:'C-REVIEW',objectId:'T-PROTOTYPE'}],placements:[{id:'P-OMG',objectId:'C-OMG',x,y:120,w:440},{id:'P-REVIEW',objectId:'C-REVIEW',x:x+510,y:120,w:360}],ui:{expanded:[],details:[],view:{x:30,y:30,zoom:.9}}});
  }
  return {FORMAT,VERSION,STORE_KEY,MAX_BYTES,STATUS,PURPOSES,validate,parse,serialize,patchTask,patchContainer,toggle,addReference,addObject,addChild,removeOccurrence,deleteObject,occurrence,visibleCount,layout,overlaps,seed};
});
