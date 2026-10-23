/* Shared validation, persistence and request helpers. No application state here. */
'use strict';
window.JuiceCore = (() => {
  const MAX_BYTES = 20 * 1024 * 1024;
  const TYPES = new Set('text h1 h2 h3 bullet number todo quote callout code divider image diagram'.split(' '));
  const COLORS = new Set('paper amber sage blue rose lavender grey'.split(' '));
  const ICONS = new Set('person team database document warning check arrow phone mail ai calendar flag idea gear'.split(' '));
  const uid = () => crypto.randomUUID();
  const object = x => x && typeof x === 'object' && !Array.isArray(x);
  function assert(ok, message = '資料格式不正確'){if(!ok)throw new Error(message);}
  function text(x, max = 200000){assert(x == null || typeof x === 'string');assert(!x || x.length <= max, '文字超過長度限制');return x || '';}
  function id(x){if(x == null)return uid();assert(typeof x === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x), '識別碼格式不正確');return x;}
  function num(x, fallback = 0, min = -1e7, max = 1e7){if(x == null)return fallback;assert(typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max, '數值超過範圍');return x;}
  function array(x, max = 10000){if(x == null)return [];assert(Array.isArray(x) && x.length <= max, '清單格式或長度不正確');return x;}
  function unique(items){const ids=new Set();for(const item of items){assert(!ids.has(item.id), '識別碼重複');ids.add(item.id);}return items;}
  function safeImage(src){src=text(src, MAX_BYTES);if(!src)return '';assert(/^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=\s]+$/.test(src) || /^https:\/\//i.test(src), '圖片只接受 HTTPS 或內嵌點陣圖');return src;}
  function sanitize(html){
    const template=document.createElement('template');template.innerHTML=text(html);
    const allowed=new Set('B STRONG I EM U S STRIKE BR A SPAN FONT DIV P H1 H2 H3 UL OL LI BLOCKQUOTE PRE CODE HR'.split(' '));
    const clean=node=>{
      for(const child of [...node.childNodes]){
        if(child.nodeType !== Node.ELEMENT_NODE){if(child.nodeType !== Node.TEXT_NODE)child.remove();continue;}
        if(!allowed.has(child.tagName)){
          if(/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|SVG|MATH|TEMPLATE|FORM|INPUT|BUTTON|LINK|META|IMG)$/.test(child.tagName)){child.remove();continue;}
          clean(child);child.replaceWith(...child.childNodes);continue;
        }
        const href=child.getAttribute('href')||'';
        const color=child.tagName==='FONT'?child.getAttribute('color'):null;
        const styles={};for(const key of ['color','background-color','font-weight','font-style','text-decoration']){
          const val=child.style.getPropertyValue(key);if(val && !/url|expression|var\(/i.test(val))styles[key]=val;
        }
        for(const attr of [...child.attributes])child.removeAttribute(attr.name);
        for(const [key,val] of Object.entries(styles))child.style.setProperty(key,val);
        if(color && /^(#[\da-f]{3,8}|[a-z]{1,20})$/i.test(color))child.style.color=color;
        if(child.tagName==='A'){
          let url=href.trim();if(/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(url))url='https://'+url;
          if(/^(https?:\/\/|mailto:)/i.test(url)){child.setAttribute('href',url);child.setAttribute('target','_blank');child.setAttribute('rel','noopener noreferrer');}
        }
        clean(child);
      }
    };
    clean(template.content);return template.innerHTML;
  }
  function block(b){assert(object(b));return {id:id(b.id),type:TYPES.has(b.type)?b.type:'text',html:sanitize(text(b.html)),checked:!!b.checked,src:safeImage(b.src)};}
  function card(c, legacy){
    assert(object(c));let blocks,title=text(c.title,10000);
    if(c.blocks != null)blocks=unique(array(c.blocks,5000).map(block));
    else if(c.body)blocks=legacy(text(c.body));
    else if(c.text){const lines=text(c.text).split('\n');title=title||(lines.shift()||'').slice(0,120);blocks=lines.filter(line=>line.trim()).map(line=>{const el=document.createElement('div');el.textContent=line;return block({html:el.innerHTML});});}
    if(!blocks || !blocks.length)blocks=[block({})];
    const result={id:id(c.id),x:num(c.x),y:num(c.y),color:COLORS.has(c.color)?c.color:'paper',shape:['note','rect','pill'].includes(c.shape)?c.shape:'note',title,blocks,tags:array(c.tags,100).map(t=>text(t,200)),collapsed:!!c.collapsed,createdAt:num(c.createdAt,Date.now(),0,1e15),updatedAt:num(c.updatedAt,c.createdAt||Date.now(),0,1e15)};
    if(c.w != null)result.w=num(c.w,240,180,960);
    if(c.sourceInbox)result.sourceInbox=text(c.sourceInbox,300);
    return result;
  }
  function normalize(d, legacy=html=>[block({html})]){
    assert(object(d) && Array.isArray(d.cards), '缺少白板 cards 清單');
    assert(d.schemaVersion == null || [1,2,3].includes(d.schemaVersion), '不支援此資料版本');
    const cards=unique(array(d.cards).map(c=>card(c,legacy))), ids=new Set(cards.map(c=>c.id));
    const links=unique(array(d.links,30000).map(l=>{assert(object(l));assert(ids.has(l.from)&&ids.has(l.to), '連線指向不存在的卡片');return {id:id(l.id),from:l.from,to:l.to,dir:['none','to','both'].includes(l.dir)?l.dir:'none',label:text(l.label,10000)};}));
    const groups=unique(array(d.groups).map(g=>{assert(object(g));return{id:id(g.id),x:num(g.x),y:num(g.y),w:num(g.w,240,1),h:num(g.h,160,1),title:text(g.title,10000)||'群組'};}));
    const images=unique(array(d.images,1000).map(i=>{assert(object(i));return{id:id(i.id),x:num(i.x),y:num(i.y),w:num(i.w,600,1),src:safeImage(i.src),opacity:num(i.opacity,0.55,0,1)};}));
    const icons=unique(array(d.icons,1000).map(i=>{assert(object(i));return{id:id(i.id),x:num(i.x),y:num(i.y),name:ICONS.has(i.name)?i.name:'idea',size:num(i.size,44,18,160),layer:i.layer==='below'?'below':'above'};}));
    const v=d.view||{};assert(object(v));
    return {schemaVersion:3,boardId:id(d.boardId),cards,links,groups,images,icons,view:{x:num(v.x),y:num(v.y),zoom:num(v.zoom,1,0.3,2.5)},savedAt:num(d.savedAt,0,0,1e15)};
  }
  function parse(raw){assert(typeof raw==='string' && new Blob([raw]).size<=MAX_BYTES, '檔案超過 20 MB 限制');return JSON.parse(raw);}
  function inbox(raw){
    const d=parse(raw);assert(object(d)&&d.version===1&&Array.isArray(d.inbox), '收件匣格式不正確');
    return unique(array(d.inbox).map(c=>{
      assert(object(c)&&typeof c.id==='string', '收件匣卡片需要固定 ID');
      const stable={...c,createdAt:c.createdAt??c.addedAt??0,updatedAt:c.updatedAt??c.createdAt??c.addedAt??0};
      stable.blocks=c.blocks==null||Array.isArray(c.blocks)&&!c.blocks.length?[{id:'inbox-block-0'}]:array(c.blocks,5000).map((b,i)=>{assert(object(b));return {...b,id:b.id||'inbox-block-'+i};});
      return {...card(stable,html=>[block({id:'inbox-block-0',html})]),aiNote:text(c.aiNote,10000),addedAt:num(c.addedAt,0,0,1e15)};
    }));
  }
  function serial(){let tail=Promise.resolve();return fn=>{const next=tail.then(fn);tail=next.catch(()=>{});return next;};}
  function db(mode, action){return new Promise((resolve,reject)=>{
    const open=indexedDB.open('sju-sync',2);let settled=false;
    const finish=(err,value)=>{if(settled)return;settled=true;clearTimeout(timeout);err?reject(err):resolve(value);};
    const timeout=setTimeout(()=>finish(new Error('本機資料庫沒有回應')),5000);
    open.onupgradeneeded=()=>{for(const name of ['kv','recovery'])if(!open.result.objectStoreNames.contains(name))open.result.createObjectStore(name);};
    open.onerror=()=>finish(open.error);open.onblocked=()=>finish(new Error('請關閉其他舊版白板分頁後重試'));
    open.onsuccess=()=>{const database=open.result;if(settled){database.close();return;}const tx=database.transaction(['kv','recovery'],mode);let value;
      try{value=action(tx);}catch(e){database.close();finish(e);return;}
      tx.oncomplete=()=>{database.close();finish(null,value?.result);};tx.onabort=tx.onerror=()=>{database.close();finish(tx.error||new Error('本機資料庫寫入失敗'));};};
  });}
  const get=key=>db('readonly',tx=>tx.objectStore('kv').get(key));
  const set=(key,value)=>db('readwrite',tx=>tx.objectStore('kv').put(value,key));
  const del=key=>db('readwrite',tx=>tx.objectStore('kv').delete(key));
  const backup=(value,reason)=>db('readwrite',tx=>{
    const store=tx.objectStore('recovery');store.put({at:Date.now(),reason,value},Date.now()+'-'+uid());
    const keys=store.getAllKeys();keys.onsuccess=()=>{for(const key of keys.result.slice(0,-20))store.delete(key);};
  });
  const backups=()=>db('readonly',tx=>tx.objectStore('recovery').getAll());
  function storeLocalBoard(record){return db('readwrite',tx=>{
    const kv=tx.objectStore('kv'),id=record.state.boardId;
    kv.put(record,'local-board:'+id);
    const request=kv.get('local-board-index');request.onsuccess=()=>{
      const index=Array.isArray(request.result)?request.result:[];
      kv.put([{id,name:record.meta.name,savedAt:record.state.savedAt||0},...index.filter(item=>item.id!==id)],'local-board-index');
    };
  });}
  async function request(url,opts,token){
    assert(token,'請重新登入 Drive；尚未同步的內容仍保留');
    const method=opts.method||'GET';
    for(let attempt=0;attempt<3;attempt++){
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
      try{
        const r=await fetch(url,{...opts,cache:'no-store',signal:controller.signal,headers:{...opts.headers,Authorization:'Bearer '+token}});
        if(r.ok)return r;
        if((r.status===429||r.status>=500)&&attempt<2 && (method==='GET'||method==='PATCH')){await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));continue;}
        const e=new Error(r.status===401?'Drive 授權已過期，請重新登入':r.status===412?'其他裝置已修改檔案，已停止覆寫':`Drive 請求失敗（${r.status}）`);e.status=r.status;throw e;
      }catch(e){if(e.name==='AbortError')throw new Error('Drive 請求逾時，請重試');throw e;}finally{clearTimeout(timeout);}
    }
  }
  const queryValue=value=>String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  return {uid,sanitize,block,normalize,parse,inbox,serial,get,set,del,backup,backups,storeLocalBoard,request,queryValue,MAX_BYTES};
})();
