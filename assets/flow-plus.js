/* Structured detail layer for Juice diagram blocks. Mermaid remains the graph source. */
'use strict';
window.JuiceFlowPlus=(()=>{
  const FIELDS=[
    ['step','原始步驟編號'],['stageId','所屬階段'],['actor','執行者'],
    ['trigger','觸發時機'],['conditions','執行條件'],['actions','處理動作'],
    ['inputs','輸入資料'],['outputs','輸出資料'],['effects','狀態及資料變更'],
    ['notes','詳細說明'],['questions','待確認事項'],['source','原始資料來源']
  ];
  const safeText=value=>typeof value==='string'?value:'';
  function contextOf(block){try{const value=JSON.parse(block.aiContext||'');return value?.flowPlus?.version===1&&value.flowPlus.nodes&&typeof value.flowPlus.nodes==='object'&&!Array.isArray(value.flowPlus.nodes)?value:null;}catch(e){return null;}}
  function isBlock(block){return block?.type==='diagram'&&!!contextOf(block);}
  function createContext(source,sourceCardId='',classicContext=''){
    const model=window.JuiceFlowBuilder.parse(source);
    if(model.unsupported.length||!model.nodes.length)throw new Error('此流程含圖形工具尚未支援的語法，無法安全建立 Flow Plus 副本；原始流程未更動。');
    const nodes={};model.nodes.forEach(node=>{nodes[node.id]={id:node.id,step:'',name:node.label,type:node.shape,lane:node.lane||'',stageId:'',actor:'',trigger:'',conditions:'',actions:'',inputs:'',outputs:'',effects:'',notes:'',questions:'',source:''};});
    let previous={};try{previous=JSON.parse(classicContext||'{}');}catch(e){}
    const result=JSON.stringify({questions:Array.isArray(previous?.questions)?previous.questions:[],assumptions:Array.isArray(previous?.assumptions)?previous.assumptions:[],flowPlus:{version:1,sourceCardId,nodes}});
    if(result.length>50000)throw new Error('此流程的詳情超過保存上限，無法建立 Flow Plus 副本。');
    return result;
  }
  let root=null,redraw=null;
  function ensure(){if(root)return root;root=document.createElement('div');root.id='flowPlus';root.hidden=true;
    root.innerHTML='<section class="fp-shell" role="dialog" aria-modal="true" aria-label="Flow Plus 工作區"><header><div><strong>Flow Plus</strong><span class="fp-title"></span></div><div class="fp-header-actions"><span class="fp-status" role="status"></span><button type="button" class="fp-close" aria-label="關閉 Flow Plus">×</button></div></header><div class="fp-body"><div class="fp-scroll"><div class="fp-graph"><svg class="fp-edges" aria-hidden="true"></svg><div class="fp-lanes"></div></div></div><aside class="fp-details" aria-label="節點詳細資訊"><div class="fp-details-head"><strong>節點詳細資訊</strong><button type="button" class="fp-hide-details" aria-label="關閉節點詳細資訊">×</button></div><div class="fp-detail-body"></div></aside></div></section>';
    document.body.append(root);return root;}
  function open({card,block,onSave}){
    const host=ensure(),source=window.JuicePeleFlow.decode(block.html||''),model=window.JuiceFlowBuilder.parse(source),context=contextOf(block);
    if(!context)throw new Error('Flow Plus 詳情資料格式不正確；原始流程未更動。');
    if(model.unsupported.length)throw new Error('此流程含尚未支援的 Mermaid 語法；請先用 Classic 檢查原文。');
    const details=host.querySelector('.fp-details'),body=host.querySelector('.fp-detail-body'),lanes=host.querySelector('.fp-lanes'),graph=host.querySelector('.fp-graph'),svg=host.querySelector('.fp-edges'),status=host.querySelector('.fp-status');
    let selected='';host.querySelector('.fp-title').textContent=card.title||'未命名流程';status.textContent='點選步驟查看與編輯詳情';
    const laneName=id=>model.lanes.find(lane=>lane.id===id)?.label||'泳道外／來源';
    const record=node=>context.flowPlus.nodes[node.id]||{};
    function saveDetail(id,key,value){
      const next=structuredClone(context);next.flowPlus.nodes[id]??={id};next.flowPlus.nodes[id][key]=value;
      const json=JSON.stringify(next);if(json.length>50000){status.textContent='詳情超過保存上限 50,000 字，請縮短內容';return;}
      context.flowPlus=next.flowPlus;block.aiContext=json;onSave();status.textContent='變更已記錄';renderSummaries();
    }
    function renderDetail(id){selected=id;const node=model.nodes.find(item=>item.id===id);if(!node)return;details.hidden=false;body.replaceChildren();
      const head=document.createElement('div');head.className='fp-node-heading';const name=document.createElement('h2');name.textContent=node.label;const meta=document.createElement('p');meta.textContent=node.id+' · '+laneName(node.lane)+' · '+node.shape;head.append(name,meta);body.append(head);
      FIELDS.forEach(([key,label])=>{const wrap=document.createElement('label');wrap.className='fp-field';const span=document.createElement('span');span.textContent=label;const input=key==='step'||key==='stageId'||key==='actor'||key==='trigger'||key==='source'?document.createElement('input'):document.createElement('textarea');input.setAttribute('aria-label',label);input.value=safeText(record(node)[key]);input.maxLength=4000;input.placeholder='待補充';input.addEventListener('input',()=>saveDetail(id,key,input.value));wrap.append(span,input);body.append(wrap);});
      host.querySelectorAll('.fp-node').forEach(el=>el.classList.toggle('selected',el.dataset.node===id));
    }
    function renderSummaries(){model.nodes.forEach(node=>{const el=lanes.querySelector('[data-node="'+node.id+'"]');if(!el)return;const info=record(node),outgoing=model.edges.filter(edge=>edge.from===node.id&&edge.label).map(edge=>edge.label).join('／');el.querySelector('.fp-condition').textContent='條件：'+(safeText(info.conditions).trim()||outgoing||'待補充');el.querySelector('.fp-result').textContent='結果：'+(safeText(info.outputs).trim()||safeText(info.effects).trim()||'待補充');});}
    function drawEdges(){const bounds=graph.getBoundingClientRect(),w=Math.max(graph.scrollWidth,lanes.scrollWidth),h=Math.max(graph.scrollHeight,lanes.scrollHeight);svg.setAttribute('width',w);svg.setAttribute('height',h);svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.replaceChildren();
      const ns='http://www.w3.org/2000/svg',defs=document.createElementNS(ns,'defs'),marker=document.createElementNS(ns,'marker'),tip=document.createElementNS(ns,'path');marker.setAttribute('id','fp-arrow');marker.setAttribute('viewBox','0 0 10 10');marker.setAttribute('refX','9');marker.setAttribute('refY','5');marker.setAttribute('markerWidth','8');marker.setAttribute('markerHeight','8');marker.setAttribute('orient','auto-start-reverse');tip.setAttribute('d','M0 0 L10 5 L0 10 Z');tip.setAttribute('fill','#8b0d12');marker.append(tip);defs.append(marker);svg.append(defs);
      const get=id=>{const el=lanes.querySelector('[data-node="'+id+'"]');if(!el)return null;const r=el.getBoundingClientRect();return {x:r.left-bounds.left,y:r.top-bounds.top,w:r.width,h:r.height};};
      model.edges.forEach((edge,index)=>{const a=get(edge.from),b=get(edge.to);if(!a||!b)return;const vertical=Math.abs(a.x-b.x)<Math.min(a.w,b.w)/2,forward=vertical?b.y>=a.y:b.x>=a.x,backtrack=vertical&&!forward;
        const ax=backtrack?a.x+a.w:vertical?a.x+a.w/2:a.x+(forward?a.w:0),ay=backtrack?a.y+a.h/2:vertical?a.y+(forward?a.h:0):a.y+a.h/2;
        const bx=backtrack?b.x+b.w:vertical?b.x+b.w/2:b.x+(forward?0:b.w),by=backtrack?b.y+b.h/2:vertical?b.y+(forward?0:b.h):b.y+b.h/2,bend=vertical?Math.max(36,Math.abs(by-ay)/2):Math.max(50,Math.abs(bx-ax)/2),routeX=Math.max(ax,bx)+40+(index%3)*14;
        const d=backtrack?`M${ax} ${ay} C${routeX} ${ay},${routeX} ${by},${bx} ${by}`:vertical?`M${ax} ${ay} C${ax} ${ay+bend},${bx} ${by-bend},${bx} ${by}`:`M${ax} ${ay} C${ax+(forward?bend:-bend)} ${ay},${bx-(forward?bend:-bend)} ${by},${bx} ${by}`;
        const path=document.createElementNS(ns,'path');path.setAttribute('d',d);path.setAttribute('fill','none');path.setAttribute('stroke','#8b0d12');path.setAttribute('stroke-width','2');path.setAttribute('marker-end','url(#fp-arrow)');if(edge.dotted)path.setAttribute('stroke-dasharray','5 5');svg.append(path);
        if(edge.label){const text=document.createElementNS(ns,'text');text.setAttribute('x',backtrack?routeX:(ax+bx)/2);text.setAttribute('y',(ay+by)/2-8);text.setAttribute('text-anchor','middle');text.setAttribute('paint-order','stroke');text.setAttribute('stroke','#fff');text.setAttribute('stroke-width','5');text.setAttribute('fill','#333');text.textContent=edge.label;svg.append(text);}
      });
    }
    lanes.replaceChildren();const groups=[{id:'',label:'泳道外／來源'},...model.lanes];groups.forEach(group=>{const nodes=model.nodes.filter(node=>(node.lane||'')===group.id);if(!nodes.length)return;const column=document.createElement('section');column.className='fp-lane';column.dataset.lane=group.id;const title=document.createElement('h3');title.textContent=group.label;column.append(title);nodes.forEach(node=>{const button=document.createElement('button');button.type='button';button.className='fp-node '+node.shape;button.dataset.node=node.id;const name=document.createElement('strong');name.textContent=node.label;const lane=document.createElement('small');lane.textContent=group.label;const condition=document.createElement('span');condition.className='fp-condition';const result=document.createElement('span');result.className='fp-result';button.append(name,lane,condition,result);button.onclick=()=>renderDetail(node.id);column.append(button);});lanes.append(column);});
    renderSummaries();body.textContent='點選流程節點，右側會顯示作業詳情。';details.hidden=false;host.hidden=false;redraw=drawEdges;requestAnimationFrame(drawEdges);
    host.querySelector('.fp-hide-details').onclick=()=>{details.hidden=true;selected='';host.querySelectorAll('.fp-node').forEach(el=>el.classList.remove('selected'));};
    host.querySelector('.fp-close').onclick=()=>{host.hidden=true;redraw=null;};
    host.onkeydown=event=>{if(event.key==='Escape'){event.stopPropagation();if(!details.hidden&&selected){details.hidden=true;selected='';}else{host.hidden=true;redraw=null;}}};
    host.querySelector('.fp-close').focus();
  }
  window.addEventListener('resize',()=>{if(redraw)requestAnimationFrame(redraw);});
  return Object.freeze({isBlock,createContext,open});
})();
