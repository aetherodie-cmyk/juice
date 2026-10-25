'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.JuiceWorkspaceNativeCore=api;})(typeof window==='undefined'?globalThis:window,()=>{
  const clone=x=>JSON.parse(JSON.stringify(x));
  const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
  const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
  const text=(x,n)=>typeof x==='string'&&x.length<=n;
  const num=(x,min,max)=>Number.isFinite(x)&&x>=min&&x<=max;
  const blank=()=>({version:1,items:[],links:[]});
  function validate(value,d){
    const n=clone(value);assert(n&&n.version===1&&Array.isArray(n.items)&&n.items.length<=150&&Array.isArray(n.links)&&n.links.length<=300,'自由白板格式或數量超限');
    const ids=new Set();for(const item of [...n.items,...n.links]){assert(item&&id(item.id)&&!ids.has(item.id),'自由物件 ID 重複或無效');ids.add(item.id);}
    for(const o of n.items){assert(['card','note','image','icon','flow'].includes(o.kind),'未知自由物件種類');assert(text(o.title,200)&&text(o.text||'',20000),'自由文字過長');assert(num(o.x,-100000,100000)&&num(o.y,-100000,100000)&&num(o.w,40,1400)&&num(o.h,30,1400),'自由物件位置或尺寸無效');
      if(['image','icon'].includes(o.kind)&&o.src)assert(text(o.src,7*1024*1024)&&(/^(?:https:\/\/)/i.test(o.src)||/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(o.src)),'圖片來源不安全或超過 7 MB');
      if(o.kind==='image')assert(o.src,'圖片缺少來源');if(o.kind==='icon')assert(o.src||text(o.glyph,8)&&o.glyph.length>0,'圖示缺少內容');
      if(o.kind==='flow'){assert((typeof o.source==='string')!==!!o.ref,'流程需有原文或單一引用');if(o.source!=null)assert(text(o.source,15000),'流程文字超過 15000 字');if(o.ref){assert(['source','native'].includes(o.ref.kind),'流程引用種類無效');if(o.ref.kind==='source')assert(d.board.cards.some(c=>c.id===o.ref.cardId&&(c.blocks||[]).some(b=>b.id===o.ref.blockId&&b.type==='diagram')),'來源流程圖已不存在');else assert(n.items.some(i=>i.id===o.ref.id&&i.kind==='flow'),'引用流程圖已不存在');}}
    }
    for(const o of n.items.filter(o=>o.kind==='flow')){const seen=new Set();let current=o;while(current.ref?.kind==='native'){assert(!seen.has(current.id),'流程圖引用形成循環');seen.add(current.id);current=n.items.find(i=>i.id===current.ref.id);}}
    function endpoint(e){assert(e&&['native','object','source'].includes(e.kind)&&id(e.id),'連線端點格式無效');assert(e.kind==='native'?n.items.some(i=>i.id===e.id):e.kind==='object'?d.objects.some(i=>i.id===e.id):d.board.cards.some(i=>i.id===e.id),'連線指向不存在的物件');}
    for(const l of n.links){endpoint(l.from);endpoint(l.to);assert(JSON.stringify(l.from)!==JSON.stringify(l.to),'不可連到自己');assert(['none','to','both'].includes(l.dir)&&text(l.label,200),'連線方向或標籤無效');}
    return n;
  }
  function put(d,item){const n=clone(d.native||blank()),at=n.items.findIndex(o=>o.id===item.id);if(at<0)n.items.push(clone(item));else n.items[at]=clone(item);return validate(n,d);}
  function link(d,item){const n=clone(d.native||blank()),at=n.links.findIndex(o=>o.id===item.id);if(at<0)n.links.push(clone(item));else n.links[at]=clone(item);return validate(n,d);}
  function remove(d,itemId){const n=clone(d.native||blank());assert(!n.items.some(o=>o.ref?.kind==='native'&&o.ref.id===itemId),'尚有流程圖引用此物件，請先移除引用');n.items=n.items.filter(o=>o.id!==itemId);n.links=n.links.filter(l=>l.id!==itemId&&!(l.from.kind==='native'&&l.from.id===itemId)&&!(l.to.kind==='native'&&l.to.id===itemId));return validate(n,d);}
  function source(d,item){const seen=new Set();while(item.ref?.kind==='native'){if(seen.has(item.id))return null;seen.add(item.id);item=d.native.items.find(o=>o.id===item.ref.id);if(!item)return null;}if(item.ref?.kind==='source'){const c=d.board.cards.find(c=>c.id===item.ref.cardId),b=c?.blocks?.find(b=>b.id===item.ref.blockId);return b?{text:b.html,title:c.title,encoded:true}:null;}return {text:item.source||'',title:item.title,encoded:false};}
  return {blank,validate,put,link,remove,source};
});
