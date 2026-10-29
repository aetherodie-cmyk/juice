'use strict';
(() => {
  const Core = window.JuiceCore;
  const colors = {paper:['#fff','#e6e8ec'],amber:['#fcefd3','#f2dda8'],sage:['#ddebdD','#bfd8bf'],blue:['#d8e6f5','#b5cfec'],rose:['#f7dee2','#efc2ca'],lavender:['#e6e0f3','#cfc3e8'],grey:['#eaecef','#d5d9df'],charcoal:['#263241','#64748b'],navy:['#173b63','#648ab1'],forest:['#204d43','#70a395'],wine:['#7a263d','#b77487'],plum:['#50345f','#9d81ac']};
  const icons = {person:'👤',team:'👥',customer:'🙋',database:'🗄️',document:'📄',warning:'⚠️',check:'✅',arrow:'➜',phone:'☎️',mail:'✉️',ai:'✦',calendar:'🗓️',flag:'⚑',idea:'💡',gear:'⚙️',home:'🏠',office:'🏢',warehouse:'🏬',factory:'🏭',shop:'🛍️',bank:'🏦',cloud:'☁️',server:'🖥️',folder:'📁',file:'📃',spreadsheet:'📑',chart:'📊',barChart:'📈',search:'🔍',target:'🎯',lock:'🔒',key:'🔑',shield:'🛡️',bell:'🔔',clock:'🕒',hourglass:'⌛',stopwatch:'⏱️',pin:'📌',map:'🗺️',globe:'🌐',car:'🚗',truck:'🚚',plane:'✈️',ship:'🚢',package:'📦',cart:'🛒',money:'💵',coin:'🪙',receipt:'🧾',card:'💳',heart:'❤️',star:'⭐',sparkle:'✨',fire:'🔥',bulb:'💡',wrench:'🔧',hammer:'🔨',tools:'🛠️',laptop:'💻',desktop:'🖥️',mobile:'📱',printer:'🖨️',camera:'📷',video:'🎥',microphone:'🎙️',headphones:'🎧',play:'▶️',pause:'⏸️',stop:'⏹️',refresh:'🔄',plus:'➕',minus:'➖',info:'ℹ️',question:'❓',prohibited:'🚫',success:'🟢',pending:'🟡',fail:'🔴',up:'⬆️',down:'⬇️',left:'⬅️',right:'➡️',link:'🔗',branch:'🌿',inbox:'📥',outbox:'📤'};
  const canvas = document.getElementById('canvas');
  const world = document.getElementById('world');
  const svg = document.getElementById('linkLayer');
  const status = document.getElementById('viewerStatus');
  const imageDialog = document.getElementById('viewerImage');
  const ns = 'http://www.w3.org/2000/svg';
  let board = null;
  let view = {x:0,y:0,zoom:1};
  let drag = null;
  let resizeObserver = null;
  const cards = new Map();

  function applyView() {
    world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.zoom})`;
    canvas.style.backgroundSize = `${24 * view.zoom}px ${24 * view.zoom}px`;
    canvas.style.backgroundPosition = `${view.x}px ${view.y}px`;
    document.getElementById('viewerZoom').textContent = `${Math.round(view.zoom * 100)}%`;
  }
  function zoomTo(next, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX == null ? rect.width / 2 : clientX - rect.left;
    const y = clientY == null ? rect.height / 2 : clientY - rect.top;
    const zoom = Math.max(.3, Math.min(2.5, next));
    view.x = x - (x - view.x) * zoom / view.zoom;
    view.y = y - (y - view.y) * zoom / view.zoom;
    view.zoom = zoom;
    applyView();
  }
  function fit() {
    if (!board) return;
    const elements = [...world.querySelectorAll('.card,.group,.imgobj,.iconobj,.noteobj')];
    if (!elements.length) { view = {x:40,y:40,zoom:1}; applyView(); return; }
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const element of elements) {
      const x = parseFloat(element.style.left) || 0;
      const y = parseFloat(element.style.top) || 0;
      left = Math.min(left,x); top = Math.min(top,y);
      right = Math.max(right,x + element.offsetWidth);
      bottom = Math.max(bottom,y + element.offsetHeight);
    }
    const zoom = Math.max(.3, Math.min(1.5, (canvas.clientWidth - 96) / Math.max(1,right - left), (canvas.clientHeight - 96) / Math.max(1,bottom - top)));
    view = {zoom,x:(canvas.clientWidth - (left + right) * zoom) / 2,y:(canvas.clientHeight - (top + bottom) * zoom) / 2};
    applyView();
  }
  function blockNode(block, counter) {
    if (block.type === 'divider') { const line = document.createElement('div'); line.className = 'pvhr'; return line; }
    const element = document.createElement('div');
    if (block.type === 'image') {
      if (!block.src) return null;
      const image = document.createElement('img'); image.className = 'pvimg'; image.src = block.src; image.alt = '卡片圖片'; element.appendChild(image);
      image.addEventListener('click', () => openImage(block.src));
      return element;
    }
    if (block.type === 'diagram') {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'viewer-flow-open'; button.textContent = '放大流程圖';
      const host = document.createElement('div'); host.className = 'pvdiagram';
      const source = window.JuicePeleFlow.decode(block.html);
      window.JuicePeleFlow.draw(host, source);
      button.disabled = !host.querySelector('svg');
      button.addEventListener('click', () => window.JuiceClassicReader.open({svg:host.querySelector('svg'),title:'Classic 流程圖',opener:button}));
      element.append(button,host); return element;
    }
    const type = block.type;
    element.className = ({h1:'pvh1',h2:'pvh2',h3:'pvh3',bullet:'pvli',number:'pvli',quote:'pvq',callout:'pvc',code:'pvcode'})[type] || '';
    if (type === 'code') element.textContent = new DOMParser().parseFromString(block.html,'text/html').body.textContent;
    else if (type === 'bullet' || type === 'number' || type === 'todo') {
      if (type === 'bullet' || type === 'number') {
        const marker = document.createElement('span'); marker.textContent = type === 'bullet' ? '•' : `${counter}.`; element.appendChild(marker);
      }
      if (type === 'todo') { const marker = document.createElement('span'); marker.textContent = block.checked ? '☑ ' : '☐ '; element.appendChild(marker); }
      const content = document.createElement('span'); content.innerHTML = block.html; if (block.checked && type === 'todo') content.className = 'pvdone'; element.appendChild(content);
    } else element.innerHTML = block.html;
    return element;
  }
  function openImage(src) { imageDialog.querySelector('img').src = src; imageDialog.showModal(); }
  function renderCard(card) {
    const element = document.createElement('article'); element.className = `card${['charcoal','navy','forest','wine','plum'].includes(card.color) ? ' card-dark' : ''}`;
    if (card.shape !== 'note') element.classList.add(`shape-${card.shape}`);
    element.dataset.id = card.id; element.style.left = `${card.x}px`; element.style.top = `${card.y}px`;
    element.style.width = `${card.w || 240}px`; element.style.zIndex = String(100 + (card.z || 0));
    [element.style.background,element.style.borderColor] = colors[card.color] || colors.paper;
    const title = document.createElement('div'); title.className = 'ctitle'; title.textContent = card.title || '未命名卡片';
    const top = document.createElement('div'); top.className = 'ctop'; top.appendChild(title); element.appendChild(top);
    const preview = document.createElement('div'); preview.className = 'cprev'; let number = 0;
    for (const block of card.blocks) { number = block.type === 'number' ? number + 1 : 0; const node = blockNode(block,number); if (node) preview.appendChild(node); }
    element.appendChild(preview);
    if (card.tags.length) { const tags = document.createElement('div'); tags.className = 'ctags'; for (const tag of card.tags) { const item = document.createElement('span'); item.className = 'ctag'; item.textContent = `#${tag}`; tags.appendChild(item); } element.appendChild(tags); }
    world.appendChild(element); cards.set(card.id,element); resizeObserver.observe(element);
  }
  function renderBoard(next, filename, preserveView = false) {
    const previousView = {...view};
    resizeObserver?.disconnect(); resizeObserver = new ResizeObserver(() => drawLinks());
    board = next; cards.clear(); world.querySelectorAll(':scope > :not(#linkLayer)').forEach(element => element.remove());
    svg.querySelectorAll(':scope > :not(defs)').forEach(element => element.remove());
    for (const image of board.images) { const element = document.createElement('div'); element.className = `imgobj ${image.layer}`; element.style.cssText = `left:${image.x}px;top:${image.y}px;width:${image.w}px;opacity:${image.opacity}`; const img = document.createElement('img'); img.src = image.src; img.alt = '白板圖片'; img.addEventListener('load', () => drawLinks()); element.appendChild(img); element.addEventListener('click', () => openImage(image.src)); world.appendChild(element); }
    for (const group of board.groups) { const element = document.createElement('div'); element.className = 'group'; element.style.cssText = `left:${group.x}px;top:${group.y}px;width:${group.w}px;height:${group.h}px`; const head = document.createElement('div'); head.className = 'ghead'; const title = document.createElement('div'); title.className = 'gtitle'; title.textContent = group.title; head.appendChild(title); element.appendChild(head); world.appendChild(element); }
    for (const card of board.cards) renderCard(card);
    for (const icon of board.icons) { const element = document.createElement('div'); element.className = `iconobj ${icon.layer}`; element.style.cssText = `left:${icon.x}px;top:${icon.y}px;font-size:${icon.size}px`; if (icon.name === 'custom') { const img = document.createElement('img'); img.src = icon.src; img.alt = '自訂圖示'; element.appendChild(img); } else element.textContent = icons[icon.name] || icons.idea; world.appendChild(element); }
    for (const note of board.notes) { const element = document.createElement('div'); element.className = `noteobj ${note.layer}`; element.style.cssText = `left:${note.x}px;top:${note.y}px;width:${note.w}px;font-size:${note.size}px;color:${note.color}`; element.textContent = note.text; world.appendChild(element); }
    drawLinks(); if (preserveView) { view = previousView; applyView(); } else fit();
    document.getElementById('viewerName').textContent = filename.replace(/\.json$/i,'');
    if (!new URLSearchParams(location.search).has('file')) status.textContent = `${board.cards.length} 張卡片 · 本機唯讀 · 不會儲存或上傳`;
    for (const id of ['viewerFit','viewerIn','viewerOut']) document.getElementById(id).disabled = false;
  }
  function clearBoard() {
    resizeObserver?.disconnect(); board = null; cards.clear();
    world.querySelectorAll(':scope > :not(#linkLayer)').forEach(element => element.remove());
    svg.querySelectorAll(':scope > :not(defs)').forEach(element => element.remove());
    document.getElementById('viewerName').textContent = '尚未載入白板';
    for (const id of ['viewerFit','viewerIn','viewerOut']) document.getElementById(id).disabled = true;
  }
  window.JuiceClassicViewer = Object.freeze({load:renderBoard,clear:clearBoard,hasBoard:() => !!board});
  const vector = side => ({top:[0,-1],right:[1,0],bottom:[0,1],left:[-1,0]})[side];
  function anchor(card,element,position) { const width = element.offsetWidth, height = element.offsetHeight; return {x:card.x + (position.side === 'left' ? 0 : position.side === 'right' ? width : width * position.t),y:card.y + (position.side === 'top' ? 0 : position.side === 'bottom' ? height : height * position.t)}; }
  function endpoints(source,target,sourceEl,targetEl) {
    const startCenter = {x:source.x + sourceEl.offsetWidth/2,y:source.y + sourceEl.offsetHeight/2};
    const endCenter = {x:target.x + targetEl.offsetWidth/2,y:target.y + targetEl.offsetHeight/2};
    const dx = endCenter.x - startCenter.x, dy = endCenter.y - startCenter.y;
    const horizontal = Math.abs(dx) - (sourceEl.offsetWidth + targetEl.offsetWidth)/2 >= Math.abs(dy) - (sourceEl.offsetHeight + targetEl.offsetHeight)/2;
    const startSide = horizontal ? dx >= 0 ? 'right' : 'left' : dy >= 0 ? 'bottom' : 'top';
    const endSide = horizontal ? dx >= 0 ? 'left' : 'right' : dy >= 0 ? 'top' : 'bottom';
    return {startSide,endSide,start:anchor(source,sourceEl,{side:startSide,t:.5}),end:anchor(target,targetEl,{side:endSide,t:.5})};
  }
  function route(link,source,target,sourceEl,targetEl) {
    const automatic = endpoints(source,target,sourceEl,targetEl);
    const start = link.startAnchor ? anchor(source,sourceEl,link.startAnchor) : automatic.start;
    const end = link.endAnchor ? anchor(target,targetEl,link.endAnchor) : automatic.end;
    const startSide = link.startAnchor?.side || automatic.startSide, endSide = link.endAnchor?.side || automatic.endSide;
    if (link.style === 'orthogonal') {
      const from = vector(startSide), to = vector(endSide);
      const first = {x:start.x + from[0]*28,y:start.y + from[1]*28};
      const last = {x:end.x + to[0]*28,y:end.y + to[1]*28};
      const center = {x:(first.x+last.x)/2 + (link.manual ? link.bend?.x || 0 : 0),y:(first.y+last.y)/2 + (link.manual ? link.bend?.y || 0 : 0)};
      return [start,first,{x:center.x,y:first.y},center,{x:last.x,y:center.y},last,end].map((point,index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
    }
    const distance = Math.max(36,Math.min(140,Math.hypot(end.x-start.x,end.y-start.y)*.38));
    const from = vector(startSide), to = vector(endSide);
    let first = {x:start.x+from[0]*distance,y:start.y+from[1]*distance};
    let second = {x:end.x+to[0]*distance,y:end.y+to[1]*distance};
    if (link.manual && link.curveControls) { first = {x:start.x+link.curveControls[0].x,y:start.y+link.curveControls[0].y}; second = {x:end.x+link.curveControls[1].x,y:end.y+link.curveControls[1].y}; }
    return `M ${start.x} ${start.y} C ${first.x} ${first.y}, ${second.x} ${second.y}, ${end.x} ${end.y}`;
  }
  function drawLinks() {
    if (!board) return;
    svg.querySelectorAll(':scope > g').forEach(element => element.remove());
    world.querySelectorAll(':scope > .linklabel').forEach(element => element.remove());
    for (const link of board.links) {
      const source = board.cards.find(card => card.id === link.from), target = board.cards.find(card => card.id === link.to);
      const sourceEl = cards.get(link.from), targetEl = cards.get(link.to);
      if (!source || !target || !sourceEl || !targetEl) continue;
      const group = document.createElementNS(ns,'g'); group.dataset.id = link.id;
      const path = document.createElementNS(ns,'path'); path.classList.add('lvis'); path.setAttribute('d',route(link,source,target,sourceEl,targetEl));
      if (link.dir === 'to' || link.dir === 'both') path.setAttribute('marker-end','url(#arrowhead)');
      if (link.dir === 'both') path.setAttribute('marker-start','url(#arrowstart)');
      group.appendChild(path); svg.appendChild(group);
      if (link.label) { const label = document.createElement('div'); label.className = 'linklabel'; label.textContent = link.label; const middle = path.getPointAtLength(path.getTotalLength()/2); label.style.left = `${middle.x}px`; label.style.top = `${middle.y}px`; world.appendChild(label); }
    }
  }
  document.getElementById('viewerFile').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file || new URLSearchParams(location.search).has('file')) return;
    try { if (file.size > Core.MAX_BYTES) throw new Error('檔案超過 20 MB 限制'); const next = Core.normalize(Core.parse(await file.text())); renderBoard(next,file.name); }
    catch (error) { status.textContent = `無法載入：${error.message}。目前畫面未更動。`; }
    event.target.value = '';
  });
  document.getElementById('viewerFit').addEventListener('click',fit);
  document.getElementById('viewerIn').addEventListener('click',() => zoomTo(view.zoom*1.2));
  document.getElementById('viewerOut').addEventListener('click',() => zoomTo(view.zoom/1.2));
  imageDialog.querySelector('button').addEventListener('click',() => imageDialog.close());
  imageDialog.addEventListener('close',() => { imageDialog.querySelector('img').removeAttribute('src'); });
  canvas.addEventListener('pointerdown', event => { if (event.button !== 0 || event.target.closest('a,button,img')) return; drag = {id:event.pointerId,x:event.clientX,y:event.clientY,startX:view.x,startY:view.y}; canvas.setPointerCapture(event.pointerId); canvas.classList.add('panning'); });
  canvas.addEventListener('pointermove', event => { if (!drag || drag.id !== event.pointerId) return; view.x = drag.startX + event.clientX - drag.x; view.y = drag.startY + event.clientY - drag.y; applyView(); });
  const stopPan = () => { drag = null; canvas.classList.remove('panning'); };
  canvas.addEventListener('pointerup',stopPan); canvas.addEventListener('pointercancel',stopPan);
  canvas.addEventListener('wheel',event => { if (!board) return; event.preventDefault(); zoomTo(view.zoom * Math.exp(-event.deltaY*.001),event.clientX,event.clientY); },{passive:false});
  applyView();
})();
