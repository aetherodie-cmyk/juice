"use strict";
(function(){
  const Core=window.JuiceCore;
  const COLORS={paper:{bg:'#FFFFFF',border:'#E6E8EC'},amber:{bg:'#FCEFD3',border:'#F2DDA8'},sage:{bg:'#DDEBDD',border:'#BFD8BF'},
    blue:{bg:'#D8E6F5',border:'#B5CFEC'},rose:{bg:'#F7DEE2',border:'#EFC2CA'},lavender:{bg:'#E6E0F3',border:'#CFC3E8'},grey:{bg:'#EAECEF',border:'#D5D9DF'}};
  const COLOR_KEYS=Object.keys(COLORS);
  const STORE_KEY='sju-whiteboard-v2';
  const BLOCK_TYPES=[
    {t:'text',label:'內文',icon:'¶'},{t:'h1',label:'標題 1',icon:'H1'},{t:'h2',label:'標題 2',icon:'H2'},{t:'h3',label:'標題 3',icon:'H3'},
    {t:'bullet',label:'項目清單',icon:'•'},{t:'number',label:'編號清單',icon:'1.'},{t:'todo',label:'待辦清單',icon:'☑'},
    {t:'quote',label:'引言',icon:'❝'},{t:'callout',label:'重點框',icon:'※'},{t:'code',label:'程式碼',icon:'</>'},
    {t:'divider',label:'分隔線',icon:'—'},{t:'image',label:'圖片',icon:'IMG'},{t:'diagram',label:'流程圖',icon:'◇'}];
  const VALID_TYPES=new Set(BLOCK_TYPES.map(b=>b.t));
  const PLACE={text:'輸入文字…',h1:'標題',h2:'標題',h3:'標題',bullet:'清單項目',number:'清單項目',todo:'待辦事項',quote:'引言',callout:'重點',code:'程式碼'};

  let state={cards:[],links:[],groups:[],images:[],icons:[],iconLibrary:[],notes:[],view:{x:0,y:0,zoom:1}};
  let selection=new Set(), extraSelection=new Set(), selectedGroup=null, openCardId=null, storageOK=true;

  const $=id=>document.getElementById(id);
  const canvas=$('canvas'),world=$('world'),linkSvg=$('linkLayer'),linkTips=$('linkTips'),cardbar=$('cardbar'),hint=$('hint'),banner=$('banner'),statusEl=$('statusText'),zoomEl=$('zoomLevel'),panel=$('panel');
  const cardEls=new Map(),linkEls=new Map(),groupEls=new Map(),imageEls=new Map(),iconEls=new Map(),noteEls=new Map(),linkLabelEls=new Map();
  let selectedImage=null, selectedIcon=null, selectedNote=null, bgEdit=false, selectedLink=null, syncHandle=null, syncReady=false, lastRead=0;
  const uid=Core.uid;
  const byId=(arr,id)=>arr.find(o=>o.id===id);
  const now=()=>Date.now();

  function plainText(html){const d=document.createElement('div');d.innerHTML=html||'';return d.textContent||'';}
  const stripScripts=Core.sanitize;

  function isURL(s){if(!s||/\s/.test(s))return false;if(/^https?:\/\//i.test(s))return true;
    return /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(s)&&/\.[a-z]{2,}($|\/)/i.test(s);}
  function normalizeURL(s){if(/^https?:\/\//i.test(s)||/^mailto:/i.test(s))return s;return 'https://'+s.replace(/^\/+/,'');}
  function escapeAttr(s){return (s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function escapeHtml(s){return (s||'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
  function mkBlock(type,html){return {id:uid(),type:VALID_TYPES.has(type)?type:'text',html:html||'',checked:false,src:''};}
  const normBlock=Core.block;
  function htmlToBlocks(html){
    const w=document.createElement('div');w.innerHTML=stripScripts(html||'');const bl=[];
    w.childNodes.forEach(n=>{
      if(n.nodeType===3){const t=n.textContent.trim();if(t)bl.push(mkBlock('text',escapeHtml(t)));return;}
      if(n.nodeType!==1)return;const tag=n.tagName.toLowerCase();
      if(tag==='h1')bl.push(mkBlock('h1',n.innerHTML));
      else if(tag==='h2')bl.push(mkBlock('h2',n.innerHTML));
      else if(tag==='h3')bl.push(mkBlock('h3',n.innerHTML));
      else if(tag==='ul')n.querySelectorAll(':scope>li').forEach(li=>bl.push(mkBlock('bullet',li.innerHTML)));
      else if(tag==='ol')n.querySelectorAll(':scope>li').forEach(li=>bl.push(mkBlock('number',li.innerHTML)));
      else if(tag==='blockquote')bl.push(mkBlock('quote',n.innerHTML));
      else if(tag==='pre')bl.push(mkBlock('code',escapeHtml(n.textContent)));
      else if(tag==='hr')bl.push(mkBlock('divider',''));
      else if(tag==='br'){}
      else n.innerHTML.split(/<br\s*\/?>/i).forEach(seg=>{if(seg.replace(/<[^>]*>/g,'').trim())bl.push(mkBlock('text',seg));});
    });
    return bl.length?bl:[mkBlock('text','')];
  }
  const blocksText=bl=>(bl||[]).map(b=>plainText(b.html)).join(' ');
  function countText(title,blocks){const t=(title||'')+' '+blocksText(blocks);
    const chars=[...t.replace(/\s/g,'')].length;
    const cjk=(t.match(/[\u4e00-\u9fff\u3040-\u30ff]/g)||[]).length;
    const latin=(t.match(/[A-Za-z0-9]+/g)||[]).length;
    return {words:cjk+latin,chars};}
  function relTime(ts){if(!ts)return '—';const s=Math.floor((now()-ts)/1000);
    if(s<60)return '剛剛';if(s<3600)return Math.floor(s/60)+' 分鐘前';if(s<86400)return Math.floor(s/3600)+' 小時前';
    if(s<86400*7)return Math.floor(s/86400)+' 天前';const d=new Date(ts);return d.getFullYear()+'/'+(d.getMonth()+1)+'/'+d.getDate();}
  function cardLabel(c){const t=(c.title||'').trim();if(t)return {text:t,faint:false};
    for(const b of c.blocks||[]){const p=plainText(b.html).trim();if(p)return {text:p.slice(0,28),faint:false};}
    return {text:'未命名卡片',faint:true};}

  // ---------- mobile controls / visual viewport ----------
  const mobileMedia=matchMedia('(max-width:640px), (pointer:coarse) and (max-width:1024px)');
  const isMobile=()=>mobileMedia.matches;
  let mobileMoveMode=false,mobileLayoutFrame=null;
  const mobileAddAnchor=document.createComment('desktop add'),mobileSelectAnchor=document.createComment('desktop select');
  $('btnAdd').before(mobileAddAnchor);$('btnSelect').before(mobileSelectAnchor);
  const mobileAddLabel=document.createElement('span');mobileAddLabel.className='mobile-action-label';mobileAddLabel.textContent='新增';$('btnAdd').append(mobileAddLabel);
  $('toolbarActions').querySelectorAll('button[data-tip]').forEach(button=>{
    button.title=button.title||button.dataset.tip;
    if(!button.textContent.trim()){const label=document.createElement('span');label.className='mobile-action-label';label.textContent=button.dataset.tip;button.append(label);}
  });
  function setToolbarMore(open){
    const panel=$('toolbarMorePanel'),toggle=$('btnToolsMore');open=!!open&&!isMobile();panel.hidden=!open;$('toolbar').classList.toggle('tools-open',open);toggle.setAttribute('aria-expanded',String(open));
    if(open){const rect=toggle.getBoundingClientRect();panel.style.top=Math.round(rect.bottom+8)+'px';panel.style.left=Math.round(Math.max(8,Math.min(rect.left,innerWidth-panel.offsetWidth-8)))+'px';}
  }
  $('btnToolsMore').addEventListener('click',()=>setToolbarMore($('toolbarMorePanel').hidden));
  $('toolbarMorePanel').addEventListener('click',event=>{if(event.target.closest('button'))setToolbarMore(false);});
  document.addEventListener('pointerdown',event=>{if(!$('toolbarMore').contains(event.target))setToolbarMore(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('toolbarMorePanel').hidden){setToolbarMore(false);$('btnToolsMore').focus();}});
  function setMobileMore(open){
    open=!!open&&isMobile();document.body.classList.toggle('mobile-more-open',open);$('mobileMoreBackdrop').hidden=!open;$('mobileMore').setAttribute('aria-expanded',String(open));
    const actions=$('toolbarActions');if(open){actions.setAttribute('role','dialog');actions.setAttribute('aria-modal','true');actions.setAttribute('aria-label','更多白板工具');actions.querySelector('button:not(:disabled)')?.focus();}else{actions.removeAttribute('role');actions.removeAttribute('aria-modal');actions.removeAttribute('aria-label');if(isMobile()&&actions.contains(document.activeElement))$('mobileMore').focus();}
  }
  function setMobileMove(value){
    mobileMoveMode=!!value;if(mobileMoveMode)setSelectMode(false);
    document.body.classList.toggle('mobile-move',mobileMoveMode);$('mobileMove').setAttribute('aria-pressed',String(mobileMoveMode));updateMobileHint();
  }
  function updateMobileHint(){
    $('mobileHint').textContent=mobileMoveMode?'移動模式：拖曳已選物件':selectMode?'框選模式：點選物件或拖曳空白處'+(selection.size+extraSelection.size?' · 已選 '+(selection.size+extraSelection.size)+' 個':''):'點卡片編輯 · 單指平移 · 雙指縮放';
  }
  function updateMobileStatus(){
    let text;
    if(gdCurrentFileId)text=!gdReady()?'需重新登入':gdSaving?'儲存中':gdConflict?'同步衝突':gdError?'同步失敗':gdDirty?'待同步':'已存 Drive';
    else if(!localSaved)text='本機保存失敗';
    else if(saveTimer)text='儲存中';
    else if(syncHandle)text=fileDirty?'同步檔待保存':'已存同步檔';
    else text=workspaceMeta.kind==='cache'?'本機副本':'已存本機';
    $('mobileSaveText').textContent=text;$('panelMobileSave').textContent=text;
  }
  function updateMobileViewport(){
    cancelAnimationFrame(mobileLayoutFrame);mobileLayoutFrame=requestAnimationFrame(()=>{
      const viewport=window.visualViewport,short=isMobile()&&(viewport?.height||innerHeight)<440;document.body.classList.toggle('mobile-keyboard',short);if(!short)document.body.classList.remove('mobile-appearance-open');$('mobileAppearance').setAttribute('aria-expanded',String(!short||document.body.classList.contains('mobile-appearance-open')));document.documentElement.style.setProperty('--mobile-height',(viewport?.height||innerHeight)+'px');document.documentElement.style.setProperty('--mobile-top',(viewport?.offsetTop||0)+'px');
      if(isMobile()&&panel.classList.contains('open')&&panel.contains(document.activeElement))document.activeElement.scrollIntoView({block:'nearest'});
    });
  }
  function updateMobileLayout(){
    setToolbarMore(false);
    if(isMobile()){
      $('mobileNav').prepend($('btnAdd'));$('mobileMore').before($('btnSelect'));
    }else{mobileAddAnchor.after($('btnAdd'));mobileSelectAnchor.after($('btnSelect'));setMobileMore(false);setMobileMove(false);}
    $('pClose').textContent=isMobile()?'完成':'收起';
    document.body.classList.toggle('mobile-editing',isMobile()&&panel.classList.contains('open'));updateMobileViewport();updateMobileStatus();
  }
  mobileMedia.addEventListener('change',updateMobileLayout);
  window.addEventListener('resize',updateMobileViewport);window.visualViewport?.addEventListener('resize',updateMobileViewport);window.visualViewport?.addEventListener('scroll',updateMobileViewport);
  $('mobileAppearance').addEventListener('click',()=>{const open=document.body.classList.toggle('mobile-appearance-open');$('mobileAppearance').setAttribute('aria-expanded',String(open));});
  $('mobileMove').addEventListener('click',()=>setMobileMove(!mobileMoveMode));
  $('mobileMore').addEventListener('click',()=>setMobileMore(!document.body.classList.contains('mobile-more-open')));
  $('mobileMoreBackdrop').addEventListener('click',()=>setMobileMore(false));
  $('toolbarActions').addEventListener('click',event=>{if(event.target.closest('button'))setMobileMore(false);});
  $('toolbarActions').addEventListener('keydown',event=>{if(!document.body.classList.contains('mobile-more-open')||event.key!=='Tab')return;const buttons=[...$('toolbarActions').querySelectorAll('button')].filter(el=>!el.disabled&&el.getClientRects().length);if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0]?.focus();}});
  function mobileSaveNow(){if(gdCurrentFileId)$('btnSaveNow').click();else{if(saveTimer)save();if(syncHandle&&fileDirty)writeSyncFile();updateMobileStatus();}}
  $('mobileSave').addEventListener('click',mobileSaveNow);$('panelMobileSave').addEventListener('click',mobileSaveNow);
  function renderMobileSearch(){
    const query=$('mobileQuery').value.trim().toLocaleLowerCase(),box=$('mobileResults');box.replaceChildren();
    const matches=state.cards.filter(card=>((card.title||'')+' '+blocksText(card.blocks)+' '+card.tags.join(' ')).toLocaleLowerCase().includes(query));
    if(!matches.length){const empty=document.createElement('p');empty.textContent='找不到符合的卡片';box.append(empty);return;}
    for(const card of matches.slice(0,50)){const button=document.createElement('button');button.textContent=cardLabel(card).text;button.addEventListener('click',()=>{$('mobileFinder').hidden=true;focusCardOnScreen(card);openPanel(card);});box.append(button);}
    if(matches.length>50){const note=document.createElement('p');note.textContent='顯示前 50 張，輸入關鍵字縮小範圍。';box.append(note);}
  }
  function closeMobileSearch(){$('mobileFinder').hidden=true;$('mobileFind').focus();}
  $('mobileFind').addEventListener('click',()=>{setMobileMore(false);$('mobileFinder').hidden=false;renderMobileSearch();$('mobileQuery').focus();});
  $('mobileQuery').addEventListener('input',renderMobileSearch);$('mobileFindClose').addEventListener('click',closeMobileSearch);
  $('mobileFinder').addEventListener('click',event=>{if(event.target===$('mobileFinder'))closeMobileSearch();});
  $('mobileFinder').addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();closeMobileSearch();}});
  setInterval(updateMobileStatus,1000);

  // ---------- start screen / local board library ----------
  const home=$('home'),workspaceQueue=Core.serial();
  let workspaceMeta={kind:'local',name:'本機白板'},homeDriveRequest=0,homeRoute='drive';
  function currentWorkspace(){
    if(gdCurrentFileId)return {kind:'drive',name:gdCurrentFileName.replace(/\.json$/,''),id:gdCurrentFileId,ownerId:gdUser?.permissionId||workspaceMeta.ownerId,pending:gdDirty,boardId:state.boardId};
    if(syncHandle)return {kind:'file',name:syncHandle.name,boardId:state.boardId};
    return {...workspaceMeta,boardId:state.boardId};
  }
  const workspaceTime=at=>at?new Date(at).toLocaleString():'尚未編輯';
  function archiveLocalWorkspace(){
    const meta=currentWorkspace();if(meta.kind!=='local'||loadFailed)return Promise.resolve();
    const snapshot=structuredClone(state),record={meta:{...meta,boardId:snapshot.boardId},state:snapshot};
    if(!snapshot.savedAt&&!snapshot.cards.length&&!snapshot.images.length&&!snapshot.groups.length)return Promise.resolve();
    return workspaceQueue(()=>Core.storeLocalBoard(record));
  }
  function canEditWorkspace(){return !loadFailed&&(gdCurrentFileId?gdReady()&&workspaceMeta.ownerId===gdUser?.permissionId:workspaceMeta.kind==='local'||!!syncHandle);}
  function closeHome(){if(!canEditWorkspace())return;home.hidden=true;$('app').inert=false;$('btnHome').focus();}
  function openHome(){
    if(transitioning||inboxBusy)return;if(saveTimer)save();closeMenu();setMobileMore(false);$('mobileFinder').hidden=true;
    home.hidden=false;$('app').inert=true;renderHome();$('homeContinue').focus();
  }
  function setHomeRoute(route){homeRoute=route;renderHome();}
  $('homeRouteDrive').addEventListener('click',()=>setHomeRoute('drive'));
  $('homeRouteLocal').addEventListener('click',()=>setHomeRoute('local'));
  function renderHome(){
    const meta=currentWorkspace(),cloud=homeRoute==='drive',bound=!!gdCurrentFileId;
    home.dataset.route=homeRoute;home.classList.toggle('home-needs-login',cloud&&!gdReady());
    $('homeRouteDrive').setAttribute('aria-pressed',String(cloud));$('homeRouteLocal').setAttribute('aria-pressed',String(!cloud));
    $('homeRouteHint').textContent=cloud?'登入自己的 Google 帳號，開啟雲端保存的白板，換裝置也能接續編輯。':'本機白板與 Google Drive 分開保存，不會因為登入就自動同步。共用此瀏覽器的人也能存取本機資料。';
    const showCurrent=cloud?bound&&gdReady():meta.kind==='local'||meta.kind==='file';
    $('homeCurrentName').textContent=showCurrent?(meta.name||'本機白板'):cloud?'開啟你的 Google Drive 白板':'建立或選擇本機白板';
    $('homeEyebrow').textContent=showCurrent?'繼續上次編輯':cloud?'雲端模式':'本機模式';
    $('homeCurrentMeta').textContent=showCurrent?`${cloud?'Google Drive':meta.kind==='file'?'本機同步檔':'這個瀏覽器'} · ${state.cards.length} 張卡片 · ${workspaceTime(state.savedAt)}`:cloud?'以 Drive 內容為正式版本；登入後選取白板才會進入編輯。':'內容只存在這個瀏覽器，請定期匯出備份。';
    $('homeContinue').textContent=cloud?(bound&&gdReady()?'繼續編輯雲端白板':gdReady()?'選擇我的 Drive 白板':'登入 Google，開啟白板'):showCurrent?'繼續編輯本機白板':'建立本機白板';
    $('homeContinue').disabled=loadFailed;
    $('homeExport').hidden=!showCurrent;$('homeExport').disabled=loadFailed;$('homeRaw').hidden=!loadFailed;
    $('homeDestination').value=cloud?'drive':'local';$('homeCreateForm').querySelector('[type="submit"]').disabled=cloud&&!gdReady();
    $('homeCreateHint').textContent=cloud?'建立在目前登入帳號的 Google Drive。':'建立獨立本機白板，只保存在此瀏覽器。';
    $('homeRecovery').hidden=cloud||meta.kind!=='cache'||!!meta.ownerId&&meta.ownerId!==gdUser?.permissionId;
    $('homeStatus').textContent=loadFailed?'目前本機資料無法讀取，請先下載原始備份修復。':gdDirty?'目前白板尚有未同步的編輯；切換時會先嘗試保存。':'';
    updateConnectionStatus();renderHomeLocal();renderHomeDrive();
  }
  async function renderHomeLocal(){
    const list=$('homeLocalList');list.textContent='載入中…';list.className='home-board-list';
    try{await workspaceQueue(async()=>{});const index=await Core.get('local-board-index');list.replaceChildren();
      if(!Array.isArray(index)||!index.length){list.textContent='還沒有其他本機白板，建立後會列在這裡。';list.classList.add('home-empty');return;}
      for(const item of index){if(typeof item.id!=='string'||typeof item.name!=='string')continue;
        const button=document.createElement('button');button.className='home-board'+(currentWorkspace().kind==='local'&&item.id===state.boardId?' active':'');
        const title=document.createElement('strong');title.textContent=item.name;const detail=document.createElement('span');detail.textContent='這個瀏覽器 · '+workspaceTime(item.savedAt);button.append(title,detail);
        button.addEventListener('click',async()=>{
          const ok=await transition(async()=>{
            const record=await Core.get('local-board:'+item.id);if(!record?.state)throw new Error('找不到這張本機白板，請從備份匯入');
            const next=normalize(record.state);await detachSources();state=next;workspaceMeta={kind:'local',name:item.name};editVersion++;resetScene();updateDriveBtn();
          });if(ok)closeHome();
        });list.append(button);
      }
    }catch(e){list.textContent='無法讀取本機白板清單；目前白板仍可繼續編輯或匯出。';reportError(e);}
  }
  async function renderHomeDrive(){
    const request=++homeDriveRequest,ready=gdReady(),list=$('homeDriveList');
    $('homeDriveLogin').hidden=ready;list.hidden=!ready;$('homeDriveRefresh').hidden=!ready;$('homeLogout').hidden=!ready;
    $('homeDriveOption').disabled=!ready;$('homeDriveOption').textContent=ready?'Google Drive':'Google Drive（請先登入）';
    $('homeAccount').textContent=ready?'目前帳號：'+(gdUser.emailAddress||gdUser.displayName):'尚未登入 Google';$('homeSwitchAccount').hidden=!ready;
    if(!ready)return;
    list.className='home-board-list';list.textContent='載入白板中…';
    try{const boards=await gdListBoards();if(request!==homeDriveRequest||!gdReady())return;list.replaceChildren();
      if(!boards.length){list.textContent='還沒有 Drive 白板，可從「建立新白板」開始。';return;}
      for(const board of boards){const button=document.createElement('button');button.className='home-board'+(board.id===gdCurrentFileId?' active':'');
        const title=document.createElement('strong');title.textContent=board.name.replace(/\.json$/,'');const detail=document.createElement('span');detail.textContent='Google Drive · '+workspaceTime(Date.parse(board.modifiedTime));button.append(title,detail);
        button.addEventListener('click',async()=>{try{if(await gdLoadBoard(board.id,board.name))closeHome();}catch(e){reportError(e);}});list.append(button);
      }
    }catch(e){if(request!==homeDriveRequest)return;list.textContent='白板載入失敗，可按「重新整理」重試，本機備份仍保留，可稍後重新登入。';reportError(e);}
  }
  $('btnHome').addEventListener('click',()=>{homeRoute=gdCurrentFileId?'drive':workspaceMeta.kind==='local'?'local':'drive';openHome();});
  $('homeContinue').addEventListener('click',()=>{
    if(loadFailed)return;
    if(homeRoute==='drive'){if(!gdReady()){gdLogin();return;}if(gdCurrentFileId&&canEditWorkspace())closeHome();else $('homeDriveList').scrollIntoView({block:'nearest'});return;}
    if(gdCurrentFileId||workspaceMeta.kind!=='local'&&!syncHandle){$('homeNewName').focus();return;}
    if(!state.savedAt)save();updateDriveBtn();closeHome();
  });
  $('homeLogin').addEventListener('click',gdLogin);
  $('homeDriveRefresh').addEventListener('click',renderHomeDrive);
  $('homeLogout').addEventListener('click',async()=>{await gdLogout();renderHome();});
  $('homeImport').addEventListener('click',()=>{if(homeRoute==='local')fileInput.click();});
  $('homeExport').addEventListener('click',()=>downloadJSON('whiteboard-'+Date.now()+'.json',state));
  $('homeRaw').addEventListener('click',()=>$('btnRawBackup').click());
  $('homeCreateForm').addEventListener('submit',async event=>{
    event.preventDefault();const name=$('homeNewName').value.trim();if(!name){$('homeNewName').focus();return;}
    if(homeRoute==='drive'){
      if(!gdReady()){reportError(new Error('請先登入 Google Drive'));return;}
      let file;const ok=await transition(async()=>{file=await gdCreateBoard(name);});
      if(ok){try{if(await gdLoadBoard(file.id,name+'.json')){$('homeNewName').value='';closeHome();}}catch(e){reportError(e);}}return;
    }
    const ok=await transition(async()=>{
      const index=await Core.get('local-board-index');if(Array.isArray(index)&&index.some(item=>item.name===name))throw new Error('已有同名本機白板，請使用其他名稱');
      const next=normalize({cards:[]});await detachSources();state=next;workspaceMeta={kind:'local',name};editVersion++;resetScene();save();await archiveLocalWorkspace();updateDriveBtn();
    });if(ok){$('homeNewName').value='';closeHome();}
  });
  async function keepAsLocal(snapshot,meta){
    const copy=normalize(structuredClone(snapshot));copy.boardId=uid();copy.savedAt=now();
    await Core.storeLocalBoard({meta:{kind:'local',name:(meta.name||'白板')+'（復原副本）',boardId:copy.boardId},state:copy});return copy;
  }
  $('homeRecoveryExport').addEventListener('click',()=>downloadJSON('drive-recovery-'+Date.now()+'.json',state));
  $('homeRecoveryLocal').addEventListener('click',async()=>{
    if(workspaceMeta.kind!=='cache')return;
    const ok=await transition(async()=>{const meta={...workspaceMeta},copy=await keepAsLocal(state,meta);await detachSources();state=copy;workspaceMeta={kind:'local',name:(meta.name||'白板')+'（復原副本）'};editVersion++;resetScene();});
    if(ok){homeRoute='local';renderHome();}
  });
  async function compareRecovery(remote,remoteName){
    const dialog=$('recoveryDialog'),snapshot=structuredClone(state),meta={...workspaceMeta};
    const summary=data=>`${data.cards.length} 張卡片 · ${workspaceTime(data.savedAt)}\n`+data.cards.slice(0,12).map(c=>c.title||'未命名卡片').join('\n');
    $('recoveryLocalSummary').textContent=(meta.name||'原白板')+'\n'+summary(snapshot);$('recoveryRemoteSummary').textContent=remoteName+'\n'+summary(remote);
    $('recoveryDownload').onclick=()=>downloadJSON('drive-recovery-'+Date.now()+'.json',snapshot);
    const choice=await new Promise(resolve=>{dialog.addEventListener('close',()=>resolve(dialog.returnValue),{once:true});dialog.returnValue='cancel';dialog.showModal();});
    if(choice==='cancel')return false;
    await Core.backup({local:snapshot,remote,meta},'確認雲端備份差異');
    if(choice==='local')await keepAsLocal(snapshot,meta);
    return true;
  }
  home.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&canEditWorkspace()&&!transitioning&&((homeRoute==='drive'&&gdCurrentFileId)||(homeRoute==='local'&&!gdCurrentFileId))){event.preventDefault();closeHome();return;}
    if(event.key!=='Tab')return;
    const focusable=[...home.querySelectorAll('button,input,select,a')].filter(el=>!el.disabled&&el.getClientRects().length),first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });

  // Session history tracks board content, not viewport or remote side effects.
  const HISTORY_LIMIT=50,HISTORY_BYTES=16*1024*1024;
  let historyPast=[],historyFuture=[],historyHead='',historyRestoring=false;
  const historyContent=()=>JSON.stringify({cards:state.cards,links:state.links,groups:state.groups,images:state.images,icons:state.icons,iconLibrary:state.iconLibrary,notes:state.notes});
  function updateHistoryButtons(){$('btnUndo').disabled=!historyPast.length||loadFailed;$('btnRedo').disabled=!historyFuture.length||loadFailed;}
  function resetHistory(){historyPast=[];historyFuture=[];historyHead=historyContent();updateHistoryButtons();}
  function captureHistory(key=null){
    if(historyRestoring)return;const content=historyContent();if(content===historyHead)return;
    const previous=historyPast.at(-1),time=now();
    if(key&&previous?.key===key&&time-previous.at<1000&&!historyFuture.length){previous.after=content;previous.at=time;}
    else historyPast.push({before:historyHead,after:content,key,at:time});
    historyHead=content;historyFuture=[];
    let bytes=historyPast.reduce((sum,item)=>sum+2*(item.before.length+item.after.length),0);
    while(historyPast.length>HISTORY_LIMIT||bytes>HISTORY_BYTES){const item=historyPast.shift();bytes-=2*(item.before.length+item.after.length);}
    updateHistoryButtons();
  }
  function restoreHistory(redo=false){
    if(loadFailed||transitioning||inboxBusy||drag||gdrag||idrag||iresz||marquee||linking)return;
    const from=redo?historyFuture:historyPast,to=redo?historyPast:historyFuture,item=from.pop();if(!item)return;
    const previousIds=new Set(state.cards.map(c=>c.id)),selected=[...selection],open=openCardId;
    const content=redo?item.after:item.before;
    historyRestoring=true;
    try{
      Object.assign(state,JSON.parse(content));historyHead=content;to.push(item);
      closePanel();clearSelection();buildScene();
      const wanted=state.cards.filter(c=>selected.includes(c.id)||!previousIds.has(c.id));wanted.forEach(c=>selectCard(c.id,true));
      if(open&&wanted.length<=1){const card=byId(state.cards,open);if(card)openPanel(card);}
      scheduleSave();idleStatus();
    }finally{historyRestoring=false;updateHistoryButtons();}
  }
  $('btnUndo').addEventListener('click',()=>restoreHistory());
  $('btnRedo').addEventListener('click',()=>restoreHistory(true));

  // ---------- storage ----------
  let saveTimer=null, editVersion=0, gdDirty=false, fileDirty=false, transitioning=false;
  let localSaved=true;
  const reportError=e=>showBanner(e.message||'操作失敗，請重試');
  const scheduleSave=(historyKey=null)=>{
    if(loadFailed){showBanner('請先下載原始資料備份後重新開啟白板');return;}
    captureHistory(historyKey);
    editVersion++;gdDirty=!!gdCurrentFileId||gdDirty;fileDirty=!!syncHandle||fileDirty;
    clearTimeout(saveTimer);saveTimer=setTimeout(()=>{saveTimer=null;save();},350);updateSaveStatus();
  };
  function persistLocalOnly(){
    try{localStorage.setItem(STORE_KEY,JSON.stringify(state));localStorage.setItem('sju-workspace-meta',JSON.stringify(currentWorkspace()));storageOK=true;localSaved=true;archiveLocalWorkspace().catch(e=>reportError(new Error('本機白板清單備份失敗：'+e.message)));return true;}
    catch(e){storageOK=false;localSaved=false;showBanner('本機儲存無法使用或已滿。雲端仍會嘗試同步，請匯出備份。');return false;}
  }
  function save(){
    if(loadFailed)return false;
    clearTimeout(saveTimer);saveTimer=null;state.schemaVersion=3;state.boardId=state.boardId||uid();state.savedAt=now();
    if(persistLocalOnly())flashStatus();
    if(syncReady&&fileDirty)scheduleFileWrite();
    if(gdReady()&&gdCurrentFileId&&gdDirty)scheduleGdWrite();
    return localSaved;
  }
  function load(){
    try{const raw=localStorage.getItem(STORE_KEY)||localStorage.getItem('sju-whiteboard-v1');if(raw)state=normalize(Core.parse(raw));
      try{const meta=JSON.parse(localStorage.getItem('sju-workspace-meta')||'null');if(meta?.boardId===state.boardId&&typeof meta.name==='string'&&meta.name.length<=200)workspaceMeta={...meta,kind:meta.kind==='local'?'local':'cache'};}catch(e){}}
    catch(e){showBanner('本機資料無法讀取；已停止自動保存，請先下載原始資料備份。');storageOK=false;localSaved=false;loadFailed=true;}
  }
  let loadFailed=false;
  function normalize(d){return Core.normalize(d,htmlToBlocks);}
  async function flushCurrent(){
    if(loadFailed)throw new Error('本機資料格式異常，請先下載原始資料備份後重新開啟');
    if(saveTimer)save();
    clearTimeout(gdWriteTimer);clearTimeout(fileWriteTimer);
    if(gdDirty&&gdCurrentFileId){if(!gdReady())throw new Error('尚有未同步內容，請先重新登入 Drive 或匯出備份');if(!await gdWriteFile())throw new Error('雲端尚未保存，已取消切換');}
    if(fileDirty&&syncHandle&&!await writeSyncFile())throw new Error('同步檔尚未保存，已取消切換');
    await archiveLocalWorkspace();if(workspaceMeta.kind==='cache')await stashAccountRecovery();await Core.backup(state,'切換前白板');
  }
  async function transition(action){
    if(transitioning||inboxBusy)return false;transitioning=true;document.body.inert=true;
    try{await flushCurrent();await action();return true;}catch(e){reportError(e);return false;}
    finally{transitioning=false;document.body.inert=false;}
  }
  async function destructive(action){
    if(transitioning||inboxBusy||loadFailed)return;transitioning=true;document.body.inert=true;
    try{await Core.backup(state,'刪除前白板');action();}catch(e){reportError(e);}
    finally{transitioning=false;document.body.inert=false;}
  }
  function resetScene(){resetHistory();closePanel();selection.clear();extraSelection.clear();selectedLink=null;selectedImage=null;selectedIcon=null;selectedNote=null;selectedGroup=null;buildScene();persistLocalOnly();idleStatus();updateDriveBtn();}
  function downloadJSON(name,value){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  window.addEventListener('beforeunload',e=>{if(saveTimer&&!loadFailed)save();if(gdDirty||fileDirty||!localSaved){e.preventDefault();e.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&saveTimer&&!loadFailed)save();});
  window.addEventListener('online',()=>{if(gdDirty&&gdReady())scheduleGdWrite();});
  window.addEventListener('storage',e=>{if(e.key===STORE_KEY)showBanner('另一個分頁已更新本機白板。請匯出目前內容，避免多分頁同時編輯。');});

  // ---------- coords / view ----------
  function screenToWorld(sx,sy){const r=canvas.getBoundingClientRect();return {x:(sx-r.left-state.view.x)/state.view.zoom,y:(sy-r.top-state.view.y)/state.view.zoom};}
  function cardCenter(c){const el=cardEls.get(c.id);const w=el?el.offsetWidth:224,h=el?el.offsetHeight:60;return {x:c.x+w/2,y:c.y+h/2};}
  function applyView(){const{x,y,zoom}=state.view;world.style.transform=`translate(${x}px,${y}px) scale(${zoom})`;
    canvas.style.backgroundSize=`${24*zoom}px ${24*zoom}px`;canvas.style.backgroundPosition=`${x}px ${y}px`;zoomEl.textContent=Math.round(zoom*100)+'%';}
  function setZoom(nz,cx,cy){nz=Math.min(2.5,Math.max(0.3,nz));const r=canvas.getBoundingClientRect();cx=(cx==null?r.width/2:cx-r.left);cy=(cy==null?r.height/2:cy-r.top);
    const wx=(cx-state.view.x)/state.view.zoom,wy=(cy-state.view.y)/state.view.zoom;state.view.zoom=nz;state.view.x=cx-wx*nz;state.view.y=cy-wy*nz;applyView();scheduleSave();}

  // ---------- build ----------
  function buildScene(){cardEls.forEach(e=>e.remove());cardEls.clear();groupEls.forEach(e=>e.remove());groupEls.clear();imageEls.forEach(e=>e.remove());imageEls.clear();iconEls.forEach(e=>e.remove());iconEls.clear();noteEls.forEach(e=>e.remove());noteEls.clear();linkEls.forEach(g=>{g.remove();g._tips?.remove();});linkEls.clear();linkLabelEls.forEach(e=>e.remove());linkLabelEls.clear();
    state.images.forEach(makeImageEl);applyBgEdit();updateBgBtn();
    state.groups.forEach(makeGroupEl);state.links.forEach(makeLinkEl);state.cards.forEach(makeCardEl);state.icons.forEach(makeIconEl);state.notes.forEach(makeNoteEl);refreshLinks();applyView();updateHint();updateGroupBtn();}
  const updateHint=()=>{hint.style.display=state.cards.length?'none':'flex';};

  // ---------- card tiles ----------
  function hasDiagram(c){return c.blocks?.some(b=>b.type==='diagram');}
  function flowPlusBlock(c){return c.blocks?.find(b=>window.JuiceFlowPlus.isBlock(b));}
  // Read-only entry point, also usable by future system-map detail links.
  function openClassicReader({cardId,blockId,opener}){
    const c=byId(state.cards,cardId),b=c?.blocks?.find(block=>block.id===blockId&&block.type==='diagram');
    if(!b)return false;
    const rendered=cardEls.get(c.id)?.querySelector('.pvdiagram[data-flow-block="'+CSS.escape(b.id)+'"] svg');
    const host=document.createElement('div');
    if(!rendered&&!window.JuicePeleFlow.draw(host,window.JuicePeleFlow.decode(b.html||''))){showBanner(host.textContent||'流程圖尚未完成渲染');return false;}
    try{return window.JuiceClassicReader.open({svg:rendered||host.querySelector('svg'),title:c.title||'Classic 流程圖',cardId:c.id,blockId:b.id,opener});}
    catch(error){showBanner(error.message);return false;}
  }
  window.JuiceClassicFlows=Object.freeze({openReader:openClassicReader});
  function classicReaderButton(c,b){
    const button=document.createElement('button');button.type='button';button.className='flow-reader-open';button.textContent='獨立檢視';button.dataset.flowBlock=b.id;
    button.addEventListener('pointerdown',event=>event.stopPropagation());
    button.addEventListener('dblclick',event=>event.stopPropagation());
    button.addEventListener('click',event=>{event.stopPropagation();openClassicReader({cardId:c.id,blockId:b.id,opener:button});});return button;
  }

  function makeCardEl(c){const el=document.createElement('div');el.className='card'+(hasDiagram(c)?' flowcard':'')+(flowPlusBlock(c)?' flowpluscard':'');el.dataset.id=c.id;
    el.innerHTML='<div class="ctop"><span class="ccaret">▾</span><div class="ctitle"></div></div><div class="cprev"></div><div class="ctags"></div><div class="handle"></div><div class="expand">⤢</div><div class="card-resize" title="調整流程圖卡寬度"></div>';
    world.appendChild(el);cardEls.set(c.id,el);placeCard(c);applyCardColor(c);applyCardShape(c);renderTile(c);
    el.addEventListener('pointerdown',e=>onCardDown(e,c));
    el.addEventListener('dblclick',e=>{e.stopPropagation();openPanel(c);});
    el.querySelector('.ccaret').addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();c.collapsed=!c.collapsed;renderTile(c);refreshLinksFor(c.id);scheduleSave();});
    el.querySelector('.handle').addEventListener('pointerdown',e=>onHandleDown(e,c));
    el.querySelector('.card-resize').addEventListener('pointerdown',e=>onCardResize(e,c));
    el.querySelector('.expand').addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();openPanel(c);});return el;}
  const MAX_PREVIEW_BLOCKS=14;
  function blocksPreviewHTML(blocks){let out='',num=0,n=0,hidden=0;
    for(const b of blocks||[]){
      const editable=b.type!=='divider'&&b.type!=='image';
      if(editable&&!plainText(b.html).trim())continue;
      if(b.type==='image'&&!b.src)continue;
      if(n>=MAX_PREVIEW_BLOCKS){hidden++;continue;}
      if(b.type!=='number')num=0;const txt=b.html||'';
      if(b.type==='h1')out+='<div class="pvh1">'+txt+'</div>';
      else if(b.type==='h2')out+='<div class="pvh2">'+txt+'</div>';
      else if(b.type==='h3')out+='<div class="pvh3">'+txt+'</div>';
      else if(b.type==='bullet')out+='<div class="pvli"><span>•</span><span>'+txt+'</span></div>';
      else if(b.type==='number'){num++;out+='<div class="pvli"><span>'+num+'.</span><span>'+txt+'</span></div>';}
      else if(b.type==='todo')out+='<div class="pvli"><span>'+(b.checked?'☑':'☐')+'</span><span class="'+(b.checked?'pvdone':'')+'">'+txt+'</span></div>';
      else if(b.type==='quote')out+='<div class="pvq">'+txt+'</div>';
      else if(b.type==='callout')out+='<div class="pvc">'+txt+'</div>';
      else if(b.type==='code')out+='<div class="pvcode">'+escapeHtml(plainText(txt))+'</div>';
      else if(b.type==='divider')out+='<div class="pvhr"></div>';
      else if(b.type==='image')out+=(b.src?'<img class="pvimg" src="'+escapeAttr(b.src)+'">':'');
       else if(b.type==='diagram')out+='<div class="pvdiagram" data-flow-block="'+escapeAttr(b.id)+'"></div>';
      else out+='<div>'+txt+'</div>';
      n++;}
    return {html:out,hidden};}
  function renderTile(c){const el=cardEls.get(c.id);if(!el)return;
    el.classList.toggle('flowpluscard',!!flowPlusBlock(c));
    const tt=el.querySelector('.ctitle'),pv=el.querySelector('.cprev'),tg=el.querySelector('.ctags'),caret=el.querySelector('.ccaret');
    const lbl=cardLabel(c),preview=blocksPreviewHTML(c.blocks),prev=preview.html;
    const hasContent=!!prev||(c.tags&&c.tags.length>0);
    caret.style.display=hasContent?'':'none';caret.textContent=c.collapsed?'▸':'▾';
    if(c.collapsed){tt.style.display='';tt.classList.toggle('empty',lbl.faint);tt.textContent=lbl.text;
      pv.style.display='none';pv.innerHTML='';tg.style.display='none';return;}
    const hasTitle=(c.title||'').trim();
    if(hasTitle){tt.style.display='';tt.classList.remove('empty');tt.textContent=hasTitle;
      if(prev){pv.style.display='';pv.innerHTML=prev;}else{pv.style.display='none';pv.innerHTML='';}}
    else if(prev){tt.style.display='none';pv.style.display='';pv.innerHTML=prev;}
    else{tt.style.display='';tt.classList.add('empty');tt.textContent='未命名卡片';pv.style.display='none';pv.innerHTML='';}
    if(prev&&preview.hidden){const more=document.createElement('button');more.type='button';more.className='pvmore';more.textContent='還有 '+preview.hidden+' 個區塊未顯示 · 點此展開';
      more.addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();openPanel(c);});pv.appendChild(more);}
    tg.innerHTML='';
    (c.tags||[]).forEach(t=>{const s=document.createElement('span');s.className='ctag';s.textContent='#'+t;tg.appendChild(s);});
    tg.style.display=(c.tags&&c.tags.length)?'':'none';
    // Juice x Pele: paint each Mermaid block without changing existing cards.
    pv.querySelectorAll('.pvdiagram').forEach(host=>{
      const block=(c.blocks||[]).find(b=>b.id===host.dataset.flowBlock);
      window.JuicePeleFlow.draw(host,window.JuicePeleFlow.decode(block?.html||''));
      if(block)host.before(classicReaderButton(c,block));
    });}
  const placeCard=c=>{const el=cardEls.get(c.id);el.style.left=c.x+'px';el.style.top=c.y+'px';el.style.width=c.w?c.w+'px':'';el.style.zIndex=String(100+(c.z||0));};
  const applyCardColor=c=>{const el=cardEls.get(c.id),col=COLORS[c.color];el.style.background=col.bg;el.style.borderColor=col.border;};
  function applyCardShape(c){const el=cardEls.get(c.id);if(!el)return;el.classList.remove('shape-rect','shape-pill');if(c.shape==='rect')el.classList.add('shape-rect');else if(c.shape==='pill')el.classList.add('shape-pill');}

  // ---------- links ----------
  const SVGNS='http://www.w3.org/2000/svg';
  function removeLinkEl(id){const g=linkEls.get(id);g?._tips?.remove();g?.remove();linkEls.delete(id);}
  function makeLinkEl(l){const g=document.createElementNS(SVGNS,'g');g.dataset.id=l.id;
    const hit=document.createElementNS(SVGNS,'path');hit.setAttribute('class','lhit');
    const vis=document.createElementNS(SVGNS,'path');vis.setAttribute('class','lvis');
    g.appendChild(hit);g.appendChild(vis);linkSvg.appendChild(g);linkEls.set(l.id,g);
    const tips=document.createElementNS(SVGNS,'g');tips.dataset.linkId=l.id;g._tips=tips;
    for(const part of ['start','end']){const path=document.createElementNS(SVGNS,'path');path.setAttribute('class','ltip '+part);tips.appendChild(path);}
    for(const part of ['start','end','control1','control2']){const handle=document.createElementNS(SVGNS,'circle');handle.setAttribute('class','link-control '+(part==='start'||part==='end'?'anchor':'route'));handle.setAttribute('r',part==='start'||part==='end'?8:7);handle.setAttribute('data-part',part);handle.setAttribute('aria-label',part==='start'?'拖曳起點錨點':part==='end'?'拖曳終點錨點':'拖曳路徑控制點');handle.addEventListener('pointerdown',event=>onLinkControlDown(event,l,part));tips.appendChild(handle);}linkTips.appendChild(tips);
    hit.addEventListener('pointerdown',e=>{e.stopPropagation();selectLink(l.id);});
    applyLinkDir(l);return g;}
  function applyLinkDir(l){const g=linkEls.get(l.id);if(!g)return;const vis=g.querySelector('.lvis');
    vis.removeAttribute('marker-end');vis.removeAttribute('marker-start');
    if(l.dir==='to'||l.dir==='both')vis.setAttribute('marker-end','url(#arrowhead)');
    if(l.dir==='both')vis.setAttribute('marker-start','url(#arrowstart)');
    const start=g._tips.querySelector('.start'),end=g._tips.querySelector('.end');
    start.removeAttribute('marker-start');end.removeAttribute('marker-end');
    if(l.dir==='both')start.setAttribute('marker-start','url(#arrowstart)');
    if(l.dir==='to'||l.dir==='both')end.setAttribute('marker-end','url(#arrowhead)');
    start.style.display=l.dir==='both'?'':'none';end.style.display=l.dir==='to'||l.dir==='both'?'':'none';}
  function linkPath(x1,y1,x2,y2,axis){const adx=Math.abs(x2-x1),ady=Math.abs(y2-y1);
    if(axis==='y'||(!axis&&ady>=adx)){const d=Math.min(ady/2,Math.max(40,ady*0.4));return `M ${x1} ${y1} C ${x1} ${y1+(y2>y1?d:-d)}, ${x2} ${y2-(y2>y1?d:-d)}, ${x2} ${y2}`;}
    const d=Math.min(adx/2,Math.max(40,adx*0.4));return `M ${x1} ${y1} C ${x1+(x2>x1?d:-d)} ${y1}, ${x2-(x2>x1?d:-d)} ${y2}, ${x2} ${y2}`;}
  function edgePoint(cx,cy,hw,hh,tx,ty){let dx=tx-cx,dy=ty-cy;if(!dx&&!dy)return {x:cx,y:cy};
    const sx=dx!==0?hw/Math.abs(dx):Infinity,sy=dy!==0?hh/Math.abs(dy):Infinity,s=Math.min(sx,sy);return {x:cx+dx*s,y:cy+dy*s};}
  function linkEndpoints(a,b,aw,ah,bw,bh){
    const dx=b.x-a.x,dy=b.y-a.y,hgap=Math.abs(dx)-(aw+bw)/2,vgap=Math.abs(dy)-(ah+bh)/2;
    // Aim at the middle of facing sides, away from rounded corners. Tips paint above shadows in their own non-interactive layer.
    // Cap clearance for close cards; overlapping cards retain the old boundary fallback.
    if(hgap>=0&&(vgap<0||hgap>=vgap)){const sign=dx>=0?1:-1,gap=Math.min(1,hgap/4);
      return [{x:a.x+sign*(aw/2+gap),y:a.y},{x:b.x-sign*(bw/2+gap),y:b.y},'x'];}
    if(vgap>=0){const sign=dy>=0?1:-1,gap=Math.min(1,vgap/4);
      return [{x:a.x,y:a.y+sign*(ah/2+gap)},{x:b.x,y:b.y-sign*(bh/2+gap)},'y'];}
    return [edgePoint(a.x,a.y,aw/2,ah/2,b.x,b.y),edgePoint(b.x,b.y,bw/2,bh/2,a.x,a.y)];
  }
  const sideVector=side=>({top:{x:0,y:-1},right:{x:1,y:0},bottom:{x:0,y:1},left:{x:-1,y:0}}[side]);
  function outsideControl(point,endpoint,side){const normal=sideVector(side),distance=(point.x-endpoint.x)*normal.x+(point.y-endpoint.y)*normal.y;
    if(distance>=24)return point;return{x:point.x+normal.x*(24-distance),y:point.y+normal.y*(24-distance)};}
  function anchorPoint(card,element,anchor){const width=element.offsetWidth,height=element.offsetHeight;
    return {x:card.x+(anchor.side==='left'?0:anchor.side==='right'?width:width*anchor.t),y:card.y+(anchor.side==='top'?0:anchor.side==='bottom'?height:height*anchor.t)};}
  function nearestAnchor(card,element,point){const width=element.offsetWidth,height=element.offsetHeight;
    const options=[['left',Math.abs(point.x-card.x),Math.max(.05,Math.min(.95,(point.y-card.y)/height))],['right',Math.abs(point.x-card.x-width),Math.max(.05,Math.min(.95,(point.y-card.y)/height))],['top',Math.abs(point.y-card.y),Math.max(.05,Math.min(.95,(point.x-card.x)/width))],['bottom',Math.abs(point.y-card.y-height),Math.max(.05,Math.min(.95,(point.x-card.x)/width))]];
    options.sort((first,second)=>first[1]-second[1]);return {side:options[0][0],t:Math.round(options[0][2]*1000)/1000};}
  function facingSide(point,center,width,height){const x=(point.x-center.x)/(width/2),y=(point.y-center.y)/(height/2);return Math.abs(x)>Math.abs(y)?x>=0?'right':'left':y>=0?'bottom':'top';}
  function linkGeometry(link,source,target,sourceElement,targetElement){
    const sourceCenter=cardCenter(source),targetCenter=cardCenter(target);
    const [automaticStart,automaticEnd,axis]=linkEndpoints(sourceCenter,targetCenter,sourceElement.offsetWidth,sourceElement.offsetHeight,targetElement.offsetWidth,targetElement.offsetHeight);
    const start=link.startAnchor?anchorPoint(source,sourceElement,link.startAnchor):automaticStart;
    const end=link.endAnchor?anchorPoint(target,targetElement,link.endAnchor):automaticEnd;
    const startSide=link.startAnchor?.side||facingSide(automaticStart,sourceCenter,sourceElement.offsetWidth,sourceElement.offsetHeight);
    const endSide=link.endAnchor?.side||facingSide(automaticEnd,targetCenter,targetElement.offsetWidth,targetElement.offsetHeight);
    if(link.style==='orthogonal'){
      const sourceVector=sideVector(startSide),targetVector=sideVector(endSide),clearance=28;
      const first={x:start.x+sourceVector.x*clearance,y:start.y+sourceVector.y*clearance};
      const last={x:end.x+targetVector.x*clearance,y:end.y+targetVector.y*clearance};
      const center={x:(first.x+last.x)/2+(link.manual?link.bend?.x||0:0),y:(first.y+last.y)/2+(link.manual?link.bend?.y||0:0)};
      const points=[start,first,{x:center.x,y:first.y},center,{x:last.x,y:center.y},last,end];
      const distinct=points.filter((point,index)=>index===0||point.x!==points[index-1].x||point.y!==points[index-1].y);
      return {d:distinct.map((point,index)=>(index?'L ':'M ')+point.x+' '+point.y).join(' '),start,end,startSide,endSide,controls:[center],base:{x:(first.x+last.x)/2,y:(first.y+last.y)/2}};
    }
    const dx=end.x-start.x,dy=end.y-start.y,span=Math.hypot(dx,dy),distance=Math.max(36,Math.min(140,span*.38));
    let first,second;
    if(!link.startAnchor&&!link.endAnchor&&!link.manual){
      const direction=axis==='y'||(!axis&&Math.abs(dy)>=Math.abs(dx))?'y':'x';
      const distanceAlong=Math.min(Math.abs(direction==='y'?dy:dx)/2,Math.max(40,Math.abs(direction==='y'?dy:dx)*.4));
      const signed=(direction==='y'?dy:dx)>=0?distanceAlong:-distanceAlong;
      first=direction==='y'?{x:start.x,y:start.y+signed}:{x:start.x+signed,y:start.y};
      second=direction==='y'?{x:end.x,y:end.y-signed}:{x:end.x-signed,y:end.y};
    }else{
      const sourceVector=sideVector(startSide),targetVector=sideVector(endSide);
      first={x:start.x+sourceVector.x*distance,y:start.y+sourceVector.y*distance};
      second={x:end.x+targetVector.x*distance,y:end.y+targetVector.y*distance};
    }
    if(link.manual&&link.curveControls){first={x:start.x+link.curveControls[0].x,y:start.y+link.curveControls[0].y};second={x:end.x+link.curveControls[1].x,y:end.y+link.curveControls[1].y};}
    if(link.startAnchor||link.manual)first=outsideControl(first,start,startSide);
    if(link.endAnchor||link.manual)second=outsideControl(second,end,endSide);
    return {d:`M ${start.x} ${start.y} C ${first.x} ${first.y}, ${second.x} ${second.y}, ${end.x} ${end.y}`,start,end,startSide,endSide,controls:[first,second]};
  }
  function ensureLabel(l){if(!l.label){const e=linkLabelEls.get(l.id);if(e){e.remove();linkLabelEls.delete(l.id);}return null;}
    let e=linkLabelEls.get(l.id);if(!e){e=document.createElement('div');e.className='linklabel';world.appendChild(e);linkLabelEls.set(l.id,e);}e.textContent=l.label;return e;}
  function updateOneLink(l){const a=byId(state.cards,l.from),b=byId(state.cards,l.to),g=linkEls.get(l.id);
    if(!a||!b||!g){if(g){g.querySelector('.lvis').setAttribute('d','');g.querySelector('.lhit').setAttribute('d','');}return;}
    const ea=cardEls.get(a.id),eb=cardEls.get(b.id),geometry=linkGeometry(l,a,b,ea,eb),{start:pa,end:pb,d}=geometry;
    g.querySelector('.lvis').setAttribute('d',d);g.querySelector('.lhit').setAttribute('d',d);
    const path=g.querySelector('.lvis'),length=path.getTotalLength(),span=Math.min(18,length/2);
    for(const part of ['start','end']){const from=part==='start'?0:length-span,to=part==='start'?span:length;let segment='';
      for(let i=0;i<=8;i++){const p=path.getPointAtLength(from+(to-from)*i/8);segment+=(i?' L ':'M ')+p.x+' '+p.y;}g._tips.querySelector('.'+part).setAttribute('d',segment);}
    for(const [part,point] of [['start',pa],['end',pb],['control1',geometry.controls[0]],['control2',geometry.controls[1]]]){
      const handle=g._tips.querySelector('[data-part="'+part+'"]');handle.hidden=!point;handle.style.display=point?'':'none';if(point){const normal=part==='start'||part==='end'?sideVector(part==='start'?geometry.startSide:geometry.endSide):{x:0,y:0};handle.setAttribute('cx',point.x+normal.x*14);handle.setAttribute('cy',point.y+normal.y*14);}}
    const lab=ensureLabel(l);if(lab){const mid=path.getPointAtLength(length/2);lab.style.left=mid.x+'px';lab.style.top=mid.y+'px';}}
  function refreshLinks(){state.links.forEach(updateOneLink);}
  function refreshLinksFor(id){state.links.forEach(l=>{if(l.from===id||l.to===id)updateOneLink(l);});}
  function selectLink(id){clearSelection();selectedLink=id;linkEls.get(id)?.classList.add('sel');linkEls.get(id)?._tips?.classList.add('selected');showLinkbar(id);}
  function deselectLink(){if(selectedLink){linkEls.get(selectedLink)?.classList.remove('sel');linkEls.get(selectedLink)?._tips?.classList.remove('selected');selectedLink=null;}hideLinkbar();}
  function showLinkbar(id){const l=byId(state.links,id);if(!l)return;const a=byId(state.cards,l.from),b=byId(state.cards,l.to);if(!a||!b)return;
    const ca=cardCenter(a),cb=cardCenter(b),mx=(ca.x+cb.x)/2,my=(ca.y+cb.y)/2,r=canvas.getBoundingClientRect();
    const sx=r.left+state.view.x+mx*state.view.zoom,sy=r.top+state.view.y+my*state.view.zoom,bar=$('linkbar');bar.style.display='flex';
    bar.querySelectorAll('.dirb').forEach(btn=>btn.classList.toggle('on',btn.dataset.dir===l.dir));
    bar.querySelectorAll('.styleb').forEach(btn=>btn.classList.toggle('on',btn.dataset.style===(l.style||'curve')));
    bar.querySelector('.lbl').value=l.label||'';bar.style.left=Math.max(8,Math.min(innerWidth-bar.offsetWidth-8,sx-bar.offsetWidth/2))+'px';bar.style.top=Math.max(58,sy-bar.offsetHeight-14)+'px';}
  function hideLinkbar(){$('linkbar').style.display='none';}
  const deleteLink=(id)=>destructive(()=>deleteLinkNow(id));
  function deleteLinkNow(id){state.links=state.links.filter(l=>l.id!==id);removeLinkEl(id);
    const e=linkLabelEls.get(id);if(e){e.remove();linkLabelEls.delete(id);}if(selectedLink===id){selectedLink=null;hideLinkbar();}
    if(openCardId)renderConn(curCard());scheduleSave();}
  $('linkbar').querySelectorAll('.dirb').forEach(btn=>btn.addEventListener('click',()=>{const l=byId(state.links,selectedLink);if(!l)return;l.dir=btn.dataset.dir;applyLinkDir(l);
    $('linkbar').querySelectorAll('.dirb').forEach(b=>b.classList.toggle('on',b===btn));scheduleSave();}));
  $('linkbar').querySelector('.lbl').addEventListener('input',function(){const l=byId(state.links,selectedLink);if(!l)return;l.label=this.value;updateOneLink(l);scheduleSave('link:'+l.id);});
  $('linkbar').querySelectorAll('.styleb').forEach(button=>button.addEventListener('click',()=>{const link=byId(state.links,selectedLink);if(!link)return;
    link.style=button.dataset.style;link.manual=false;delete link.curveControls;delete link.bend;updateOneLink(link);showLinkbar(link.id);scheduleSave();}));
  $('linkReset').addEventListener('click',()=>{const link=byId(state.links,selectedLink);if(!link)return;
    delete link.startAnchor;delete link.endAnchor;delete link.curveControls;delete link.bend;link.manual=false;updateOneLink(link);showLinkbar(link.id);scheduleSave();});
  $('linkDel').addEventListener('click',()=>{if(selectedLink)deleteLink(selectedLink);});
  let linkControlDrag=null;
  function onLinkControlDown(event,link,part){event.stopPropagation();event.preventDefault();selectLink(link.id);
    linkControlDrag={link,part,before:structuredClone(link)};window.addEventListener('pointermove',onLinkControlMove);window.addEventListener('pointerup',onLinkControlUp);window.addEventListener('pointercancel',onLinkControlUp);}
  function onLinkControlMove(event){if(!linkControlDrag)return;const {link,part}=linkControlDrag,source=byId(state.cards,link.from),target=byId(state.cards,link.to);
    if(!source||!target)return;const point=screenToWorld(event.clientX,event.clientY);
    if(part==='start'||part==='end'){
      const card=part==='start'?source:target,element=cardEls.get(card.id),key=part==='start'?'startAnchor':'endAnchor';
      link[key]=nearestAnchor(card,element,point);
    }else{
      const geometry=linkGeometry(link,source,target,cardEls.get(source.id),cardEls.get(target.id));link.manual=true;
      if(link.style==='orthogonal')link.bend={x:point.x-geometry.base.x,y:point.y-geometry.base.y};
      else{const controls=link.curveControls||geometry.controls.map((control,index)=>({x:control.x-(index?geometry.end.x:geometry.start.x),y:control.y-(index?geometry.end.y:geometry.start.y)}));
        const index=part==='control1'?0:1,endpoint=index?geometry.end:geometry.start,card=index?target:source,element=cardEls.get(card.id);
        const side=(index?link.endAnchor:link.startAnchor)?.side||facingSide(endpoint,cardCenter(card),element.offsetWidth,element.offsetHeight);
        const adjusted=outsideControl(point,endpoint,side);controls[index]={x:adjusted.x-endpoint.x,y:adjusted.y-endpoint.y};link.curveControls=controls;}
    }
    updateOneLink(link);}
  function onLinkControlUp(event){window.removeEventListener('pointermove',onLinkControlMove);window.removeEventListener('pointerup',onLinkControlUp);window.removeEventListener('pointercancel',onLinkControlUp);
    if(linkControlDrag){if(event.type==='pointercancel'){const {link,before}=linkControlDrag;for(const key of Object.keys(link))if(!(key in before))delete link[key];Object.assign(link,before);updateOneLink(link);}else scheduleSave('link-route:'+linkControlDrag.link.id);}linkControlDrag=null;}

  // ---------- groups ----------
  function makeGroupEl(g){const el=document.createElement('div');el.className='group';el.dataset.id=g.id;
    el.style.left=g.x+'px';el.style.top=g.y+'px';el.style.width=g.w+'px';el.style.height=g.h+'px';
    const head=document.createElement('div');head.className='ghead';const title=document.createElement('div');title.className='gtitle';title.textContent=g.title;
    const ungroup=document.createElement('button');ungroup.type='button';ungroup.className='gungroup';ungroup.textContent='解開群組';ungroup.setAttribute('aria-label','解開群組 '+g.title);
    ungroup.addEventListener('pointerdown',e=>e.stopPropagation());ungroup.addEventListener('click',e=>{e.stopPropagation();ungroupGroup(g.id);});
    head.append(title,ungroup);el.appendChild(head);world.appendChild(el);groupEls.set(g.id,el);
    title.addEventListener('dblclick',e=>{e.stopPropagation();title.setAttribute('contenteditable','true');title.focus();});
    title.addEventListener('blur',()=>{g.title=title.textContent||'群組';title.removeAttribute('contenteditable');scheduleSave();});
    title.addEventListener('pointerdown',e=>onGroupDown(e,g));return el;}

  // ---------- selection ----------
  const objectKey=(type,id)=>type+':'+id;
  const objectEl=(type,id)=>({image:imageEls,icon:iconEls,note:noteEls})[type]?.get(id);
  const objectValue=(type,id)=>byId(({card:state.cards,image:state.images,icon:state.icons,note:state.notes})[type]||[],id);
  const groupFor=(type,id)=>state.groups.find(g=>g.members?.some(m=>m.type===type&&m.id===id));
  function clearExtraSelection(){extraSelection.forEach(key=>{const index=key.indexOf(':');objectEl(key.slice(0,index),key.slice(index+1))?.classList.remove('sel');});extraSelection.clear();}
  function clearSelection(){selection.forEach(id=>cardEls.get(id)?.classList.remove('sel'));selection.clear();clearExtraSelection();selectGroup(null);deselectImage();deselectIcon();deselectNote();deselectLink();hideCardbar();updateGroupBtn();}
  function selectCard(id,additive){if(!additive)clearSelection();deselectLink();
    selection.add(id);cardEls.get(id)?.classList.add('sel');selectGroup(null);showCardbar();updateGroupBtn();}
  function selectExtra(type,id,additive=false){if(!additive)clearSelection();else{selectGroup(null);deselectLink();hideImgbar();hideIconbar();hideNotebar();selectedImage=selectedIcon=selectedNote=null;}
    const key=objectKey(type,id);if(additive&&extraSelection.has(key)){extraSelection.delete(key);objectEl(type,id)?.classList.remove('sel');}else{extraSelection.add(key);objectEl(type,id)?.classList.add('sel');}
    if(!additive&&extraSelection.has(key)){if(type==='image'){selectedImage=id;showImgbar();}else if(type==='icon'){selectedIcon=id;showIconbar();}else{selectedNote=id;showNotebar();}}
    hideCardbar();updateGroupBtn();}
  function selectGroup(id){if(selectedGroup)groupEls.get(selectedGroup)?.classList.remove('sel');selectedGroup=id;
    if(id){deselectLink();groupEls.get(id)?.classList.add('sel');selection.forEach(x=>cardEls.get(x)?.classList.remove('sel'));selection.clear();clearExtraSelection();deselectImage();deselectIcon();deselectNote();hideCardbar();updateGroupBtn();}}
  const updateGroupBtn=()=>{$('btnGroup').disabled=selection.size+extraSelection.size<2;$('btnDuplicate').disabled=!selection.size;updateMobileHint();};

  function duplicateSelection(){
    if(loadFailed||transitioning||inboxBusy||drag||marquee)return;
    const originals=state.cards.filter(c=>selection.has(c.id));if(!originals.length)return;
    if(state.cards.length+originals.length>10000){showBanner('卡片數量已達上限，請先整理白板');return;}
    const ids=new Map(originals.map(c=>[c.id,uid()])),stamp=now();
    const copies=originals.map(c=>{
      const copy=structuredClone(c);copy.id=ids.get(c.id);copy.x+=32;copy.y+=32;copy.createdAt=stamp;copy.updatedAt=stamp;
      copy.blocks.forEach(b=>b.id=uid());delete copy.sourceInbox;return copy;
    });
    const links=state.links.filter(l=>ids.has(l.from)&&ids.has(l.to)).map(l=>({...l,id:uid(),from:ids.get(l.from),to:ids.get(l.to)}));
    if(state.links.length+links.length>30000){showBanner('連線數量已達上限，請先整理白板');return;}
    closePanel();clearSelection();state.cards.push(...copies);state.links.push(...links);
    copies.forEach(makeCardEl);links.forEach(makeLinkEl);refreshLinks();copies.forEach(c=>selectCard(c.id,true));updateHint();scheduleSave();
  }
  $('btnDuplicate').addEventListener('click',duplicateSelection);

  function buildCardbar(){cardbar.innerHTML='';
    COLOR_KEYS.forEach(k=>{const s=document.createElement('div');s.className='swatch';s.dataset.color=k;s.style.background=COLORS[k].bg;s.style.borderColor=COLORS[k].border;s.title=k;
      s.addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();selection.forEach(id=>{const c=byId(state.cards,id);c.color=k;applyCardColor(c);if(id===openCardId){$('pHeadDot').style.background=COLORS[k].bg;$('pHeadDot').style.borderColor=COLORS[k].border;}});markSwatch();markPanelSwatch();scheduleSave();});cardbar.appendChild(s);});
    const vd=document.createElement('div');vd.className='vdiv';cardbar.appendChild(vd);
    [['置頂',true],['置底',false]].forEach(([label,front])=>{const button=document.createElement('button');button.className='act';button.textContent=label;button.onpointerdown=e=>{e.preventDefault();e.stopPropagation();orderCards(front);};cardbar.appendChild(button);});
    const open=document.createElement('button');open.className='act';open.textContent='展開';
    open.addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();const id=[...selection][0];if(id)openPanel(byId(state.cards,id));});cardbar.appendChild(open);
    const copy=document.createElement('button');copy.className='act';copy.textContent='複製';copy.addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();duplicateSelection();});cardbar.appendChild(copy);
    const del=document.createElement('button');del.className='act danger';del.textContent='刪除';
    del.addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();deleteSelection();});cardbar.appendChild(del);}
  function markSwatch(){const cs=[...selection].map(id=>byId(state.cards,id).color);const same=cs.every(c=>c===cs[0])?cs[0]:null;
    cardbar.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('on',s.dataset.color===same));}
  function showCardbar(){if(isMobile()&&!mobileMoveMode&&!selectMode){hideCardbar();return;}if(panel.classList.contains('open')){hideCardbar();return;}if(selection.size===0||extraSelection.size){hideCardbar();return;}let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
    selection.forEach(id=>{const c=byId(state.cards,id),el=cardEls.get(id);minx=Math.min(minx,c.x);miny=Math.min(miny,c.y);maxx=Math.max(maxx,c.x+el.offsetWidth);maxy=Math.max(maxy,c.y+el.offsetHeight);});
    const r=canvas.getBoundingClientRect();const sx=r.left+state.view.x+((minx+maxx)/2)*state.view.zoom,sy=r.top+state.view.y+miny*state.view.zoom;
    cardbar.style.display='flex';cardbar.style.left=Math.max(8,Math.min(innerWidth-cardbar.offsetWidth-8,sx-cardbar.offsetWidth/2))+'px';const top=sy-cardbar.offsetHeight-12;cardbar.style.top=(top>=58?top:r.top+state.view.y+maxy*state.view.zoom+12)+'px';markSwatch();}
  const hideCardbar=()=>{cardbar.style.display='none';};

  function addCard(wx,wy){const c={id:uid(),x:Math.round(wx-120),y:Math.round(wy-30),color:'paper',shape:'note',title:'',blocks:[mkBlock('text','')],tags:[],collapsed:false,createdAt:now(),updatedAt:now()};
    state.cards.push(c);makeCardEl(c);updateHint();selectCard(c.id,false);scheduleSave();openPanel(c,true);return c;}
  const deleteSelection=()=>destructive(()=>deleteSelectionNow());
  function deleteSelectionNow(){if(selectedGroup){ungroupGroup(selectedGroup);return;}
    selection.forEach(id=>{if(id===openCardId)closePanel();state.cards=state.cards.filter(c=>c.id!==id);
      state.links=state.links.filter(l=>{const keep=l.from!==id&&l.to!==id;if(!keep){removeLinkEl(l.id);const le=linkLabelEls.get(l.id);if(le){le.remove();linkLabelEls.delete(l.id);}}return keep;});
      cardEls.get(id)?.remove();cardEls.delete(id);removeMemberFromGroups('card',id);});clearSelection();updateHint();refreshLinks();scheduleSave();}
  function ungroupGroup(id){state.groups=state.groups.filter(g=>g.id!==id);groupEls.get(id)?.remove();groupEls.delete(id);if(selectedGroup===id)selectedGroup=null;scheduleSave();}
  function removeMemberFromGroups(type,id){state.groups.slice().forEach(g=>{if(!g.members)return;g.members=g.members.filter(m=>m.type!==type||m.id!==id);if(g.members.length<2){state.groups=state.groups.filter(other=>other!==g);groupEls.get(g.id)?.remove();groupEls.delete(g.id);if(selectedGroup===g.id)selectedGroup=null;}});}
  function fitGroupFor(type,id){const g=groupFor(type,id);if(!g?.members)return;let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
    g.members.forEach(m=>{const value=objectValue(m.type,m.id),el=m.type==='card'?cardEls.get(m.id):objectEl(m.type,m.id);if(!value||!el)return;minx=Math.min(minx,value.x);miny=Math.min(miny,value.y);maxx=Math.max(maxx,value.x+el.offsetWidth);maxy=Math.max(maxy,value.y+el.offsetHeight);});
    if(!Number.isFinite(minx))return;const pad=26;g.x=Math.round(minx-pad);g.y=Math.round(miny-pad);g.w=Math.round(maxx-minx+pad*2);g.h=Math.round(maxy-miny+pad*2);const el=groupEls.get(g.id);if(el){el.style.left=g.x+'px';el.style.top=g.y+'px';el.style.width=g.w+'px';el.style.height=g.h+'px';}}
  function makeGroup(){const members=[...selection].map(id=>({type:'card',id})),others=[...extraSelection].map(key=>{const index=key.indexOf(':');return{type:key.slice(0,index),id:key.slice(index+1)};});members.push(...others);
    if(members.length<2)return;if(members.some(m=>groupFor(m.type,m.id))){showBanner('所選物件已有群組，請先解開原群組');return;}
    let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
    members.forEach(m=>{const value=objectValue(m.type,m.id),el=m.type==='card'?cardEls.get(m.id):objectEl(m.type,m.id);if(!value||!el)return;minx=Math.min(minx,value.x);miny=Math.min(miny,value.y);maxx=Math.max(maxx,value.x+el.offsetWidth);maxy=Math.max(maxy,value.y+el.offsetHeight);});
    if(!Number.isFinite(minx))return;const pad=26,g={id:uid(),x:Math.round(minx-pad),y:Math.round(miny-pad),w:Math.round(maxx-minx+pad*2),h:Math.round(maxy-miny+pad*2),title:'群組',members};
    state.groups.push(g);makeGroupEl(g);clearSelection();setSelectMode(false);selectGroup(g.id);scheduleSave();}

  // ============ EDITOR PANEL ============
  const pTitle=$('pTitle'),pTags=$('pTags');
  function curCard(){return openCardId?byId(state.cards,openCardId):null;}
  function touch(c){c.updatedAt=now();renderInfo(c);}
  function autoGrow(ta){ta.style.height='auto';ta.style.height=ta.scrollHeight+'px';}

  function openPanel(c,focusTitle){openCardId=c.id;selectCard(c.id,false);
    const plus=flowPlusBlock(c);if(plus){closePanel();openFlowPlus(c,plus);return;}
    if(c.blocks.length===1&&hasDiagram(c)){closePanel();openFlowStudio(c,c.blocks[0]);return;}
    $('pHeadDot').style.background=COLORS[c.color].bg;$('pHeadDot').style.borderColor=COLORS[c.color].border;
    pTitle.value=c.title||'';autoGrow(pTitle);renderBlocks(c);renderTags(c);renderInfo(c);renderConn(c);renderPanelSwatches(c);renderShapePicker(c);
    panel.classList.add('open');hideCardbar();setMobileMore(false);document.body.classList.toggle('mobile-editing',isMobile());updateMobileViewport();updateMobileStatus();
    if(focusTitle){if(isMobile())pTitle.focus({preventScroll:true});else setTimeout(()=>pTitle.focus(),60);}}
  function closePanel(){closeMenu();panel.classList.remove('open');document.body.classList.remove('mobile-editing');openCardId=null;}
  $('pClose').addEventListener('click',()=>{closePanel();showCardbar();});

  pTitle.addEventListener('input',()=>{const c=curCard();if(!c)return;c.title=pTitle.value;autoGrow(pTitle);renderTile(c);refreshLinksFor(c.id);touch(c);scheduleSave('title:'+c.id);});
  pTitle.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const el=$('pBlocks').querySelector('.blk .ed');if(el)placeCaretEnd(el);}});

  // ---- block editor ----
  function isCaretAtStart(el){const s=window.getSelection();if(!s.rangeCount)return false;const r=s.getRangeAt(0).cloneRange();
    try{r.selectNodeContents(el);r.setEnd(s.getRangeAt(0).startContainer,s.getRangeAt(0).startOffset);}catch(e){return false;}return r.toString().length===0;}
  function placeCaretEnd(el){el.focus();const s=window.getSelection(),r=document.createRange();r.selectNodeContents(el);r.collapse(false);s.removeAllRanges();s.addRange(r);}

  function renderBlocks(c,focusId){const box=$('pBlocks');box.innerHTML='';let num=0;
    if(hasDiagram(c)){const tools=document.createElement('div');tools.className='flow-tools';tools.innerHTML='<span>流程圖大小</span>';
      [[360,'小'],[480,'中'],[680,'大'],[900,'特大'],[0,'適合內容']].forEach(([width,label])=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',()=>{const svg=cardEls.get(c.id)?.querySelector('.pvdiagram svg'),natural=svg?.viewBox?.baseVal?.width||900;c.w=width||Math.max(360,Math.min(1200,Math.ceil(natural+40)));placeCard(c);refreshLinksFor(c.id);touch(c);scheduleSave('size:'+c.id);});tools.appendChild(button);});box.appendChild(tools);}
    c.blocks.forEach((b,i)=>{if(b.type==='number')num++;else num=0;box.appendChild(makeBlockEl(c,b,i,num));});
    if(focusId){const el=box.querySelector('.blk[data-id="'+focusId+'"] .ed');if(el)placeCaretEnd(el);}}

  function makeBlockEl(c,b,i,num){
    const el=document.createElement('div');el.className='blk'+(b.checked?' done':'');el.dataset.id=b.id;el.dataset.type=b.type;
    const gut=document.createElement('div');gut.className='blk-gut';
    const add=document.createElement('button');add.textContent='＋';add.title='在下方新增區塊';
    add.addEventListener('click',e=>{e.stopPropagation();openInsertMenu(i,add);});
    const hd=document.createElement('button');hd.textContent='⋮';hd.title='區塊選項';
    hd.addEventListener('click',e=>{e.stopPropagation();openBlockMenu(b,i,hd);});
    gut.appendChild(add);gut.appendChild(hd);el.appendChild(gut);
    const main=document.createElement('div');main.className='blk-main';el.appendChild(main);

    if(b.type==='divider'){const hr=document.createElement('div');hr.className='hr';main.appendChild(hr);return el;}
    if(b.type==='image'){
      if(b.src){const img=document.createElement('img');img.src=b.src;main.appendChild(img);}
      else{const ph=document.createElement('div');ph.className='imgph';ph.textContent='點擊上傳或貼上圖片';ph.tabIndex=0;
        ph.addEventListener('click',()=>pickImage(src=>{b.src=src;touch(c);scheduleSave();renderTile(c);renderBlocks(c);}));
        ph.addEventListener('paste',event=>{const file=clipboardImage(event.clipboardData);if(!file)return;event.preventDefault();event.stopPropagation();readImageFile(file,src=>{b.src=src;touch(c);scheduleSave();renderTile(c);renderBlocks(c);});});main.appendChild(ph);}
      return el;}
    if(b.type==='diagram'){
      const editor=document.createElement('textarea');editor.className='pele-source';
      editor.setAttribute('aria-label','Mermaid 流程圖原始碼');
      editor.maxLength=window.JuicePeleFlow.MAX_SOURCE_LENGTH;
      editor.value=window.JuicePeleFlow.decode(b.html||'');
      const preview=document.createElement('div');preview.className='pele-preview';
      const studio=document.createElement('button');studio.type='button';studio.className='flow-studio-open';studio.textContent='⤢ 展開流程圖編輯器';
      studio.addEventListener('click',()=>openFlowStudio(c,b));
      const repaint=()=>window.JuicePeleFlow.draw(preview,editor.value);repaint();
      let paintTimer;editor.addEventListener('input',()=>{
        b.html=escapeHtml(editor.value);touch(c);scheduleSave('block:'+c.id+':'+b.id);
        clearTimeout(paintTimer);paintTimer=setTimeout(()=>{repaint();renderTile(c);refreshLinksFor(c.id);},220);
      });main.append(studio,classicReaderButton(c,b),editor,preview);return el;
    }
    if(b.type==='todo'){const chk=document.createElement('div');chk.className='chk';chk.textContent=b.checked?'✓':'';
      chk.addEventListener('click',()=>{b.checked=!b.checked;el.classList.toggle('done',b.checked);chk.textContent=b.checked?'✓':'';touch(c);renderTile(c);scheduleSave();});main.appendChild(chk);}
    if(b.type==='bullet'){const m=document.createElement('div');m.className='marker';m.textContent='•';main.appendChild(m);}
    if(b.type==='number'){const m=document.createElement('div');m.className='marker';m.textContent=num+'.';main.appendChild(m);}

    const ed=document.createElement('div');ed.className='ed';ed.contentEditable='true';ed.dataset.ph=PLACE[b.type]||'';ed.innerHTML=b.html||'';
    main.appendChild(ed);
    ed.addEventListener('input',()=>{b.html=stripScripts(ed.innerHTML);renderTile(c);refreshLinksFor(c.id);touch(c);scheduleSave('block:'+c.id+':'+b.id);});
    ed.addEventListener('keydown',e=>onBlockKey(e,c,b,ed));
    ed.addEventListener('paste',e=>onBlockPaste(e,c,b,ed));
    ed.addEventListener('drop',e=>{e.preventDefault();document.execCommand('insertText',false,e.dataTransfer?.getData('text/plain')||'');b.html=stripScripts(ed.innerHTML);renderTile(c);touch(c);scheduleSave();});
    ed.addEventListener('click',e=>{const a=e.target.closest('a');if(a&&a.href){e.preventDefault();window.open(a.href,'_blank','noopener');}});
    return el;}

  function onBlockPaste(e,c,b,ed){const cd=e.clipboardData||window.clipboardData;if(!cd)return;
    const image=clipboardImage(cd);
    if(image){e.preventDefault();readImageFile(image,(src)=>{const index=c.blocks.findIndex(x=>x.id===b.id),imageBlock=mkBlock('image','');imageBlock.src=src;c.blocks.splice(index+1,0,imageBlock);touch(c);scheduleSave();renderTile(c);renderBlocks(c);});return;}
    const raw=cd.getData('text/plain')||'';const text=raw.trim();e.preventDefault();
    if(isURL(text)){const url=normalizeURL(text);const sel=window.getSelection();
      if(sel&&sel.rangeCount&&!sel.isCollapsed)document.execCommand('createLink',false,url);
      else document.execCommand('insertHTML',false,'<a href="'+escapeAttr(url)+'">'+escapeHtml(text)+'</a>&nbsp;');}
    else document.execCommand('insertText',false,raw);
    b.html=stripScripts(ed.innerHTML);renderTile(c);touch(c);scheduleSave();}

  function onBlockKey(e,c,b,ed){
    const idx=c.blocks.findIndex(x=>x.id===b.id);
    if(e.key==='Enter'&&!e.shiftKey){
      if(b.type==='code'){e.preventDefault();document.execCommand('insertLineBreak');b.html=stripScripts(ed.innerHTML);touch(c);scheduleSave();return;}
      e.preventDefault();const empty=plainText(b.html).trim()==='';
      if((b.type==='bullet'||b.type==='number'||b.type==='todo')&&empty){b.type='text';b.checked=false;touch(c);scheduleSave();renderBlocks(c,b.id);return;}
      const nt=(b.type==='bullet'||b.type==='number'||b.type==='todo')?b.type:'text';
      const nb=mkBlock(nt,'');c.blocks.splice(idx+1,0,nb);touch(c);scheduleSave();renderBlocks(c,nb.id);return;}
    if(e.key==='Backspace'&&plainText(b.html).trim()===''&&isCaretAtStart(ed)){
      if(c.blocks.length>1){e.preventDefault();const prev=c.blocks[idx-1];c.blocks.splice(idx,1);touch(c);scheduleSave();renderTile(c);renderBlocks(c,prev?prev.id:c.blocks[0].id);}
      else if(b.type!=='text'){e.preventDefault();b.type='text';b.checked=false;scheduleSave();renderBlocks(c,b.id);}}}

  function openInsertMenu(index,anchor){const c=curCard();if(!c)return;const r=anchor.getBoundingClientRect();
    showMenu(BLOCK_TYPES.map(ty=>({icon:ty.icon,label:ty.label,onClick:()=>insertAfter(index,ty.t)})),r.left,r.bottom+4,'新增區塊');}
  function openBlockMenu(b,index,anchor){const c=curCard();if(!c)return;const r=anchor.getBoundingClientRect();
    const items=BLOCK_TYPES.filter(ty=>ty.t!=='image'||true).map(ty=>({icon:ty.icon,label:'轉為 '+ty.label,onClick:()=>changeType(b,ty.t)}));
    items.push({sep:true});
    if(index>0)items.push({icon:'↑',label:'上移',onClick:()=>moveBlock(index,-1)});
    if(index<c.blocks.length-1)items.push({icon:'↓',label:'下移',onClick:()=>moveBlock(index,1)});
    items.push({icon:'🗑',label:'刪除區塊',danger:true,onClick:()=>deleteBlock(index)});
    showMenu(items,r.left,r.bottom+4,'轉換類型');}
  function insertAfter(index,type){const c=curCard();if(!c)return;const nb=mkBlock(type,type==='diagram'?escapeHtml(window.JuicePeleFlow.TEMPLATE):'');c.blocks.splice(index+1,0,nb);touch(c);scheduleSave();
    if(type==='image'){renderBlocks(c);pickImage(src=>{nb.src=src;touch(c);scheduleSave();renderTile(c);renderBlocks(c);});}
    else if(type==='divider'){renderTile(c);renderBlocks(c);}else renderBlocks(c,nb.id);}
  function changeType(b,type){const c=curCard();if(!c)return;b.type=type;if(type!=='todo')b.checked=false;if(type==='diagram'&&!plainText(b.html).trim())b.html=escapeHtml(window.JuicePeleFlow.TEMPLATE);touch(c);scheduleSave();
    if(type==='image'&&!b.src){renderBlocks(c);pickImage(src=>{b.src=src;touch(c);scheduleSave();renderTile(c);renderBlocks(c);});}
    else{renderTile(c);renderBlocks(c,(type!=='divider'&&type!=='image')?b.id:null);}}
  function moveBlock(index,dir){const c=curCard();if(!c)return;const j=index+dir;if(j<0||j>=c.blocks.length)return;
    const t=c.blocks[index];c.blocks[index]=c.blocks[j];c.blocks[j]=t;touch(c);scheduleSave();renderTile(c);renderBlocks(c,t.id);}
  const deleteBlock=(index)=>destructive(()=>deleteBlockNow(index));
  function deleteBlockNow(index){const c=curCard();if(!c)return;c.blocks.splice(index,1);if(!c.blocks.length)c.blocks.push(mkBlock('text',''));
    touch(c);scheduleSave();renderTile(c);renderBlocks(c);}
  $('addBlk').addEventListener('click',()=>{const c=curCard();if(!c)return;openInsertMenu(c.blocks.length-1,$('addBlk'));});

  function pickImage(cb){const i=document.createElement('input');i.type='file';i.accept='image/*';
    i.onchange=()=>{const f=i.files[0];if(f)readImageFile(f,cb);};i.click();}
  function validImageFile(file){if(file.size>Core.MAX_BYTES||!/^image\/(png|jpeg|webp|gif)$/.test(file.type)){showBanner('請選擇 20 MB 內的 PNG、JPEG、WebP 或 GIF 圖片');return false;}return true;}
  function clipboardImage(clipboard){if(!clipboard)return null;for(const item of clipboard.items||[]){if(item.kind==='file'&&/^image\/(png|jpeg|webp|gif)$/.test(item.type)){const file=item.getAsFile();if(file)return file;}}for(const file of clipboard.files||[])if(/^image\/(png|jpeg|webp|gif)$/.test(file.type))return file;return null;}
  function readImageFile(file,cb,maxDim){if(!validImageFile(file))return;const reader=new FileReader();reader.onload=()=>resizeImage(reader.result,cb,maxDim);reader.onerror=()=>showBanner('無法讀取圖片');reader.readAsDataURL(file);}
  function resizeImage(dataUrl,cb,maxDim){const img=new Image();img.onload=()=>{const max=maxDim||1200;let w=img.width,h=img.height;
    if(w>max||h>max){const s=Math.min(max/w,max/h);w=Math.round(w*s);h=Math.round(h*s);}
    const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(img,0,0,w,h);
    try{cb(cv.toDataURL('image/jpeg',0.85),w,h);}catch(e){cb(dataUrl,w,h);}};img.onerror=()=>showBanner('圖片格式無法讀取');img.src=dataUrl;}

  // inline format toolbar (acts on focused block)
  $('rtbar').addEventListener('mousedown',e=>{const btn=e.target.closest('button'),dot=e.target.closest('.cdot');
    if(btn){e.preventDefault();
      if(btn.dataset.cmd)document.execCommand(btn.dataset.cmd,false,null);
      else if(btn.dataset.hl){if(!document.execCommand('hiliteColor',false,'#FBE6A2'))document.execCommand('backColor',false,'#FBE6A2');}
      else if(btn.dataset.link){const u=prompt('輸入連結網址：','https://');if(u&&u.trim()){const url=normalizeURL(u.trim());const sel=window.getSelection();
        if(sel&&sel.rangeCount&&!sel.isCollapsed)document.execCommand('createLink',false,url);
        else document.execCommand('insertHTML',false,'<a href="'+escapeAttr(url)+'">'+escapeHtml(u.trim())+'</a>&nbsp;');}}
      syncFocused();}
    else if(dot){e.preventDefault();document.execCommand('foreColor',false,dot.dataset.color);syncFocused();}});
  function syncFocused(){const ae=document.activeElement;if(!ae||!ae.classList.contains('ed'))return;const c=curCard();if(!c)return;
    const id=ae.closest('.blk').dataset.id;const b=c.blocks.find(x=>x.id===id);if(b){b.html=stripScripts(ae.innerHTML);renderTile(c);touch(c);scheduleSave();}}

  // ---- shared popup menu ----
  let activeMenu=null;
  function closeMenu(){if(activeMenu){activeMenu.remove();activeMenu=null;document.removeEventListener('pointerdown',onDocDown,true);}}
  function onDocDown(e){if(activeMenu&&!activeMenu.contains(e.target))closeMenu();}
  function showMenu(items,x,y,head){closeMenu();const m=document.createElement('div');m.className='bmenu';
    if(head){const h=document.createElement('div');h.className='mh';h.textContent=head;m.appendChild(h);}
    items.forEach(it=>{if(it.sep){const s=document.createElement('div');s.className='msep';m.appendChild(s);return;}
      const mi=document.createElement('div');mi.className='mi'+(it.danger?' danger':'');
      const ic=document.createElement('span');ic.className='mic';ic.textContent=it.icon||'';
      const lb=document.createElement('span');lb.textContent=it.label;mi.appendChild(ic);mi.appendChild(lb);
      mi.addEventListener('click',()=>{closeMenu();it.onClick&&it.onClick();});m.appendChild(mi);});
    document.body.appendChild(m);const mw=m.offsetWidth,mh=m.offsetHeight;
    m.style.left=Math.max(8,Math.min(x,innerWidth-mw-8))+'px';m.style.top=Math.max(8,Math.min(y,innerHeight-mh-8))+'px';
    activeMenu=m;setTimeout(()=>document.addEventListener('pointerdown',onDocDown,true),0);}

  // ---- tags / info / conn / colors ----
  function renderTags(c){pTags.innerHTML='';
    (c.tags||[]).forEach((t,i)=>{const chip=document.createElement('span');chip.className='tagchip';chip.innerHTML='<b>#</b>'+escapeHtml(t)+'<span class="x">×</span>';
      chip.querySelector('.x').addEventListener('click',()=>{c.tags.splice(i,1);renderTags(c);renderTile(c);touch(c);scheduleSave();});pTags.appendChild(chip);});
    const inp=document.createElement('input');inp.id='tagInput';inp.maxLength=200;inp.placeholder='+ 標籤';
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===','){e.preventDefault();const v=inp.value.trim().replace(/^#/,'');
      if(v&&!c.tags.includes(v)&&c.tags.length<100){c.tags.push(v);renderTags(c);renderTile(c);touch(c);scheduleSave();const ni=$('tagInput');if(ni)ni.focus();}}});pTags.appendChild(inp);}
  function renderInfo(c){$('iCreated').textContent=relTime(c.createdAt);$('iUpdated').textContent=relTime(c.updatedAt);
    const ct=countText(c.title,c.blocks);$('iCount').textContent=ct.words+' 字詞 · '+ct.chars+' 字元';}
  (function(){const sec=$('infoSec');let open=false;try{open=localStorage.getItem('sju-ui-info')==='1';}catch(e){}
    sec.classList.toggle('collapsed',!open);$('infoToggle').setAttribute('role','button');$('infoToggle').tabIndex=0;$('infoToggle').setAttribute('aria-expanded',String(open));
    $('infoToggle').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.currentTarget.click();}});
    $('infoToggle').addEventListener('click',()=>{const willOpen=sec.classList.contains('collapsed');sec.classList.toggle('collapsed',!willOpen);$('infoToggle').setAttribute('aria-expanded',String(willOpen));try{localStorage.setItem('sju-ui-info',willOpen?'1':'0');}catch(e){}});})();
  function connectedCards(id){const ids=new Set();state.links.forEach(l=>{if(l.from===id)ids.add(l.to);if(l.to===id)ids.add(l.from);});return [...ids].map(i=>byId(state.cards,i)).filter(Boolean);}
  function renderConn(c){const box=$('pConn');box.innerHTML='';const list=connectedCards(c.id);
    if(!list.length){box.textContent='尚無關聯';box.classList.add('pempty');return;}box.classList.remove('pempty');
    list.forEach(o=>{const lbl=cardLabel(o);const row=document.createElement('div');row.className='crow';
      row.innerHTML='<span class="cdotc" style="background:'+COLORS[o.color].bg+'"></span><span class="cname'+(lbl.faint?' faint':'')+'">'+escapeHtml(lbl.text)+'</span>';
      row.addEventListener('click',()=>{openPanel(o);focusCardOnScreen(o);});box.appendChild(row);});}
  function focusCardOnScreen(c){const r=canvas.getBoundingClientRect();const cc=cardCenter(c);state.view.x=r.width/2-(isMobile()?0:392/2)-cc.x*state.view.zoom;state.view.y=r.height/2-cc.y*state.view.zoom;applyView();}
  function renderPanelSwatches(c){const box=$('pSwatches');box.innerHTML='';    COLOR_KEYS.forEach(k=>{const s=document.createElement('button');s.type='button';s.className='pswatch';s.title={paper:'白色',amber:'米黃',sage:'淺綠',blue:'淺藍',rose:'粉紅',lavender:'淺紫',grey:'灰色'}[k];s.setAttribute('aria-label',s.title);s.dataset.color=k;s.style.background=COLORS[k].bg;s.style.borderColor=COLORS[k].border;
      s.addEventListener('click',()=>{c.color=k;applyCardColor(c);$('pHeadDot').style.background=COLORS[k].bg;$('pHeadDot').style.borderColor=COLORS[k].border;markPanelSwatch();markSwatch();touch(c);scheduleSave();});box.appendChild(s);});markPanelSwatch();}
  function markPanelSwatch(){const c=curCard();if(!c)return;$('pSwatches').querySelectorAll('.pswatch').forEach(s=>(s.classList.toggle('on',s.dataset.color===c.color),s.setAttribute('aria-pressed',String(s.dataset.color===c.color))));}
  const SHAPES=[{s:'note',label:'圓角'},{s:'rect',label:'直角'},{s:'pill',label:'膠囊'}];
  function renderShapePicker(c){const box=$('pShapes');box.innerHTML='';SHAPES.forEach(sp=>{const b=document.createElement('button');b.className='pshape'+(c.shape===sp.s?' on':'');b.textContent=sp.label;b.setAttribute('aria-pressed',String(c.shape===sp.s));
    b.addEventListener('click',()=>{c.shape=sp.s;applyCardShape(c);renderShapePicker(c);touch(c);scheduleSave();});box.appendChild(b);});}
  $('pDuplicate').addEventListener('click',()=>{const c=curCard();if(c){selection=new Set([c.id]);duplicateSelection();}});
  $('pAddLink').addEventListener('click',event=>{
    const c=curCard();if(!c)return;const linked=new Set(connectedCards(c.id).map(card=>card.id));
    const candidates=state.cards.filter(card=>card.id!==c.id&&!linked.has(card.id)),r=event.currentTarget.getBoundingClientRect();
    if(!candidates.length){showBanner('目前沒有其他可關聯的卡片');return;}
    showMenu(candidates.map(card=>({label:cardLabel(card).text,onClick:()=>{
      const link={id:uid(),from:c.id,to:card.id,dir:'none',label:''};state.links.push(link);makeLinkEl(link);refreshLinks();renderConn(c);touch(c);scheduleSave();
    }})),r.left,r.bottom+4,'連到哪張卡片？');
  });
  $('pDelete').addEventListener('click',()=>{const c=curCard();if(!c)return;selection=new Set([c.id]);deleteSelection();});

  // ---------- pointer: card drag ----------
  let drag=null;
  function onCardDown(e,c){if(e.target.classList.contains('handle')||e.target.classList.contains('expand')||e.target.classList.contains('ccaret')||e.target.classList.contains('card-resize'))return;
    const grouped=groupFor('card',c.id);if(grouped&&!e.shiftKey&&!selectMode){onGroupDown(e,grouped,true);return;}
    if(isMobile()&&!mobileMoveMode){e.stopPropagation();onCanvasDown(e,c,true);return;}e.stopPropagation();const additive=e.shiftKey;
    if(!selection.has(c.id))selectCard(c.id,additive);else if(additive){selection.delete(c.id);cardEls.get(c.id).classList.remove('sel');showCardbar();updateGroupBtn();return;}
    const start=screenToWorld(e.clientX,e.clientY);drag={start,items:[...selection].map(id=>{const cc=byId(state.cards,id);return{c:cc,ox:cc.x,oy:cc.y};}),moved:false,linkEl:e.target.closest('a')};
    cardEls.get(c.id).setPointerCapture(e.pointerId);cardEls.get(c.id).classList.add('dragging');hideCardbar();
    window.addEventListener('pointermove',onCardMove);window.addEventListener('pointerup',onCardUp);window.addEventListener('pointercancel',onCardUp);}
  function onCardMove(e){if(!drag)return;const p=screenToWorld(e.clientX,e.clientY);const dx=p.x-drag.start.x,dy=p.y-drag.start.y;if(!drag.moved&&Math.hypot(dx,dy)<(isMobile()?8:2))return;drag.moved=true;
    drag.items.forEach(it=>{it.c.x=Math.round(it.ox+dx);it.c.y=Math.round(it.oy+dy);placeCard(it.c);refreshLinksFor(it.c.id);});}
  function onCardUp(e){window.removeEventListener('pointermove',onCardMove);window.removeEventListener('pointerup',onCardUp);window.removeEventListener('pointercancel',onCardUp);
    if(e?.type==='pointercancel'&&drag){drag.items.forEach(it=>{it.c.x=it.ox;it.c.y=it.oy;placeCard(it.c);refreshLinksFor(it.c.id);});drag.moved=false;}
    document.querySelectorAll('.card.dragging').forEach(el=>el.classList.remove('dragging'));if(drag&&drag.moved)scheduleSave();showCardbar();
    if(!isMobile()&&e?.type!=='pointercancel'&&drag&&!drag.moved&&drag.linkEl&&drag.linkEl.href)window.open(drag.linkEl.href,'_blank','noopener');drag=null;}

  let cardResize=null;
  function onCardResize(e,c){if(!hasDiagram(c))return;e.stopPropagation();e.preventDefault();const start=screenToWorld(e.clientX,e.clientY),el=cardEls.get(c.id);cardResize={c,start,w:el.offsetWidth};e.currentTarget.setPointerCapture(e.pointerId);window.addEventListener('pointermove',onCardResizeMove);window.addEventListener('pointerup',onCardResizeUp);}
  function onCardResizeMove(e){if(!cardResize)return;const p=screenToWorld(e.clientX,e.clientY);cardResize.c.w=Math.max(280,Math.min(1200,Math.round(cardResize.w+p.x-cardResize.start.x)));placeCard(cardResize.c);refreshLinksFor(cardResize.c.id);}
  function onCardResizeUp(){window.removeEventListener('pointermove',onCardResizeMove);window.removeEventListener('pointerup',onCardResizeUp);if(cardResize){fitGroupFor('card',cardResize.c.id);touch(cardResize.c);scheduleSave('size:'+cardResize.c.id);}cardResize=null;}

  // ---------- pointer: link handle ----------
  let linking=null;
  function onHandleDown(e,c){e.stopPropagation();e.preventDefault();canvas.classList.add('linking');
    const tmp=document.createElementNS('http://www.w3.org/2000/svg','path');tmp.setAttribute('class','temp');linkSvg.appendChild(tmp);linking={from:c.id,tmp};
    window.addEventListener('pointermove',onLinkMove);window.addEventListener('pointerup',onLinkUp);}
  function onLinkMove(e){if(!linking)return;const a=byId(state.cards,linking.from),ca=cardCenter(a);const p=screenToWorld(e.clientX,e.clientY);linking.tmp.setAttribute('d',linkPath(ca.x,ca.y,p.x,p.y));}
  function onLinkUp(e){window.removeEventListener('pointermove',onLinkMove);window.removeEventListener('pointerup',onLinkUp);canvas.classList.remove('linking');
    const el=document.elementFromPoint(e.clientX,e.clientY);const target=el?el.closest('.card'):null;linking.tmp.remove();
    if(target&&target.dataset.id!==linking.from){const to=target.dataset.id;const dup=state.links.some(l=>(l.from===linking.from&&l.to===to)||(l.from===to&&l.to===linking.from));
      if(!dup){const l={id:uid(),from:linking.from,to,dir:'to',label:''};state.links.push(l);makeLinkEl(l);refreshLinks();if(openCardId===linking.from||openCardId===to)renderConn(curCard());scheduleSave();}}linking=null;}

  // ---------- pointer: groups ----------
  let gdrag=null;
  function onGroupDown(e,g,fromMember=false){if(isMobile()&&!mobileMoveMode){e.stopPropagation();onCanvasDown(e,null,true);return;}if(!fromMember&&e.target.getAttribute('contenteditable')==='true')return;e.stopPropagation();if(fromMember)e.preventDefault();selectGroup(g.id);const start=screenToWorld(e.clientX,e.clientY);
    const members=g.members||state.cards.filter(c=>{const cc=cardCenter(c);return cc.x>=g.x&&cc.x<=g.x+g.w&&cc.y>=g.y&&cc.y<=g.y+g.h;}).map(c=>({type:'card',id:c.id}));
    const inside=members.map(m=>({type:m.type,value:objectValue(m.type,m.id),el:m.type==='card'?cardEls.get(m.id):objectEl(m.type,m.id)})).filter(item=>item.value&&item.el).map(item=>({...item,ox:item.value.x,oy:item.value.y}));
    gdrag={g,start,gox:g.x,goy:g.y,inside,moved:false};e.target.setPointerCapture(e.pointerId);window.addEventListener('pointermove',onGroupMove);window.addEventListener('pointerup',onGroupUp);}
  function onGroupMove(e){if(!gdrag)return;const p=screenToWorld(e.clientX,e.clientY);const dx=p.x-gdrag.start.x,dy=p.y-gdrag.start.y;if(Math.abs(dx)>2||Math.abs(dy)>2)gdrag.moved=true;
    const g=gdrag.g;g.x=Math.round(gdrag.gox+dx);g.y=Math.round(gdrag.goy+dy);const el=groupEls.get(g.id);el.style.left=g.x+'px';el.style.top=g.y+'px';
    gdrag.inside.forEach(it=>{it.value.x=Math.round(it.ox+dx);it.value.y=Math.round(it.oy+dy);if(it.type==='card'){placeCard(it.value);refreshLinksFor(it.value.id);}else{it.el.style.left=it.value.x+'px';it.el.style.top=it.value.y+'px';}});}
  function onGroupUp(){window.removeEventListener('pointermove',onGroupMove);window.removeEventListener('pointerup',onGroupUp);if(gdrag&&gdrag.moved)scheduleSave();gdrag=null;}

  // Marquee selection uses client coordinates so pan/zoom and card sizes stay aligned.
  let selectMode=false,marquee=null;
  const selectionBox=$('selectionBox');
  function setSelectMode(value){selectMode=value;if(value&&isMobile()){mobileMoveMode=false;document.body.classList.remove('mobile-move');$('mobileMove').setAttribute('aria-pressed','false');}applyBgEdit();updateMobileHint();$('btnSelect').setAttribute('aria-pressed',String(value));canvas.classList.toggle('selecting',value);}
  $('btnSelect').addEventListener('click',()=>setSelectMode(!selectMode));
  function finishMarquee(cancel=false){
    if(!marquee)return;
    if(cancel){selection.forEach(id=>cardEls.get(id)?.classList.remove('sel'));selection=new Set(marquee.before);selection.forEach(id=>cardEls.get(id)?.classList.add('sel'));clearExtraSelection();extraSelection=new Set(marquee.beforeExtra);extraSelection.forEach(key=>{const index=key.indexOf(':');objectEl(key.slice(0,index),key.slice(index+1))?.classList.add('sel');});}
    marquee=null;selectionBox.hidden=true;showCardbar();updateGroupBtn();
  }

  let flowStudio=null;
  function ensureFlowStudio(){if(flowStudio)return flowStudio;const root=document.createElement('div');root.id='flowStudio';root.innerHTML='<section class="flow-studio-box" role="dialog" aria-modal="true" aria-label="流程圖編輯器"><header><strong>流程圖編輯器</strong><span>左側流程碼，右側即時預覽</span><button type="button" aria-label="關閉流程圖編輯器">×</button></header><main><textarea aria-label="流程圖原始碼"></textarea><div class="flow-studio-divider" aria-label="拖曳調整欄位寬度"></div><div class="flow-studio-preview"></div></main></section>';
    document.body.appendChild(root);root.querySelector('header button').addEventListener('click',()=>closeFlowStudio());root.addEventListener('pointerdown',e=>{if(e.target===root)closeFlowStudio();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&root.classList.contains('open')){e.preventDefault();closeFlowStudio();}});flowStudio=root;return root;}
  function closeFlowStudio(){if(!flowStudio)return;flowStudio.classList.remove('open');document.body.classList.remove('flow-studio-open');}
  function openFlowPlus(c,b){try{window.JuiceFlowPlus.open({card:c,block:b,onSave:()=>{touch(c);renderTile(c);refreshLinksFor(c.id);scheduleSave('flow-plus:'+c.id+':'+b.id);}});}catch(error){showBanner(error.message);}}
  function createFlowPlusCopy(c,b){
    const source=window.JuicePeleFlow.decode(b.html||'');let context;
    try{context=window.JuiceFlowPlus.createContext(source,c.id,b.aiContext||'');}catch(error){showBanner(error.message);return;}
    const copy=addCard(c.x+320,c.y+130);copy.title=(c.title||'流程圖')+' · Flow Plus';copy.w=Math.max(680,c.w||480);
    const block=mkBlock('diagram',b.html);block.aiContext=context;block.diagramPositions=b.diagramPositions||'';copy.blocks=[block];closePanel();renderTile(copy);touch(copy);scheduleSave();closeFlowStudio();openFlowPlus(copy,block);
  }
  function openFlowStudio(c,b){const root=ensureFlowStudio(),source=root.querySelector('textarea'),preview=root.querySelector('.flow-studio-preview'),divider=root.querySelector('.flow-studio-divider');const decoded=window.JuicePeleFlow.decode(b.html||'');source.flowPositions=b.diagramPositions||decoded.match(/%% juice-positions (.*)/)?.[1]||'';source.value=decoded.replace(/^%% juice-positions .*$/gm,'').trim();const repaint=()=>window.JuicePeleFlow.draw(preview,source.value);repaint();
    if(/^\s*subgraph\s/m.test(source.value)&&(c.w||480)===480){c.w=900;placeCard(c);refreshLinksFor(c.id);touch(c);scheduleSave('size:'+c.id);}
    root.querySelector('.studio-settings')?.remove();root.querySelector('.flow-builder')?.remove();root.classList.remove('visual-mode');
    const settings=document.createElement('div');settings.className='studio-settings';
    settings.appendChild(classicReaderButton(c,b));
    const title=document.createElement('input');title.value=c.title;title.setAttribute('aria-label','流程圖名稱');title.oninput=()=>{c.title=title.value;renderTile(c);touch(c);scheduleSave();};settings.appendChild(title);
    const aiPrompt=document.createElement('button');aiPrompt.textContent='讓 AI 幫我整理';aiPrompt.type='button';aiPrompt.onclick=()=>window.JuiceFlowAI.openPrompt(c.title,source.value+(b.aiContext?'\n討論紀錄：'+b.aiContext:''));settings.appendChild(aiPrompt);
    const plusCopy=document.createElement('button');plusCopy.textContent='建立 Flow Plus 副本';plusCopy.type='button';plusCopy.onclick=()=>createFlowPlusCopy(c,b);settings.appendChild(plusCopy);
    const aiImport=document.createElement('button');aiImport.textContent='貼上 AI 結果';aiImport.type='button';aiImport.onclick=()=>window.JuiceFlowAI.openImport(async(data,update)=>{
      if(update&&!state.cards.some(card=>card.id===c.id&&card.blocks.some(block=>block.id===b.id)))throw new Error('目前流程已不存在，請選擇新增流程圖');
      await Core.backup(structuredClone(state),'套用 AI 流程前');let target=c,block=b;
      if(!update){const r=canvas.getBoundingClientRect(),point=screenToWorld(r.left+r.width/2,r.top+r.height/2);target=addCard(point.x+80,point.y+80);target.w=data.lanes?.length?900:480;block=mkBlock('diagram','');target.blocks=[block];closePanel();}
      target.title=data.title;block.html=escapeHtml(data.mermaid);block.diagramPositions='';block.aiContext=JSON.stringify({questions:data.questions,assumptions:data.assumptions});touch(target);renderTile(target);refreshLinksFor(target.id);scheduleSave();openFlowStudio(target,block);showBanner(update?'已更新流程，原版可從復原備份取回':'已新增 AI 流程圖');
    });settings.appendChild(aiImport);
    let fromGraph=false,graphTimer;const mountGraph=()=>{const host=root.querySelector('.flow-builder');if(host)window.JuiceFlowBuilder.mount(host,source,()=>{fromGraph=true;source.oninput();fromGraph=false;});};
    if(source.graphListener)source.removeEventListener('input',source.graphListener);source.graphListener=()=>{if(fromGraph||!root.classList.contains('visual-mode'))return;clearTimeout(graphTimer);graphTimer=setTimeout(mountGraph,500);};source.addEventListener('input',source.graphListener);
    const visual=document.createElement('button');visual.textContent='圖形拖拉工具';visual.type='button';visual.onclick=()=>{if(root.classList.contains('visual-mode'))return;root.querySelector('.flow-builder')?.remove();const host=document.createElement('div');host.className='flow-builder';root.querySelector('main').appendChild(host);mountGraph();root.classList.add('visual-mode');};settings.appendChild(visual);
    const autoPreview=document.createElement('button');autoPreview.textContent='Pele 排版預覽';autoPreview.onclick=()=>{root.classList.remove('visual-mode');repaint();};settings.appendChild(autoPreview);
    COLOR_KEYS.forEach(color=>{const button=document.createElement('button');button.type='button';button.className='studio-color';button.style.background=COLORS[color].bg;button.title='流程圖背景 '+color;button.onclick=()=>{c.color=color;applyCardColor(c);preview.style.background=COLORS[color].bg;touch(c);scheduleSave();};settings.appendChild(button);});preview.style.background=COLORS[c.color].bg;
    const size=document.createElement('select');size.setAttribute('aria-label','流程圖寬度');[360,480,680,900,1200].forEach(w=>{const option=new Option(w+' px',w);size.add(option);});size.value=c.w||480;size.onchange=()=>{c.w=Number(size.value);placeCard(c);refreshLinksFor(c.id);scheduleSave();};settings.appendChild(size);
    const link=document.createElement('button');link.textContent='連到其他卡片';link.type='button';link.onclick=()=>{const candidates=state.cards.filter(other=>other.id!==c.id);const r=link.getBoundingClientRect();showMenu(candidates.map(other=>({label:cardLabel(other).text,onClick:()=>{if(!state.links.some(l=>l.from===c.id&&l.to===other.id)){const l={id:uid(),from:c.id,to:other.id,dir:'to',label:''};state.links.push(l);makeLinkEl(l);refreshLinks();scheduleSave();}}})),r.left,r.bottom,'選擇卡片');};settings.appendChild(link);root.querySelector('header').after(settings);
    source.oninput=()=>{b.html=escapeHtml(source.value);b.diagramPositions=source.flowPositions||'';if(/^\s*subgraph\s/m.test(source.value)&&(c.w||480)===480){c.w=900;placeCard(c);size.value='900';}const inline=$('pBlocks').querySelector('.blk[data-id="'+b.id+'"] .pele-source');if(inline&&inline!==source)inline.value=source.value;touch(c);scheduleSave('block:'+c.id+':'+b.id);repaint();renderTile(c);refreshLinksFor(c.id);};
    let split=null;divider.onpointerdown=e=>{e.preventDefault();const main=root.querySelector('main'),rect=main.getBoundingClientRect();split={rect,start:e.clientX,pct:parseFloat(main.style.getPropertyValue('--flow-source'))||50};divider.setPointerCapture(e.pointerId);};divider.onpointermove=e=>{if(!split)return;const pct=Math.max(28,Math.min(72,split.pct+(e.clientX-split.start)/split.rect.width*100));root.querySelector('main').style.setProperty('--flow-source',pct+'%');};divider.onpointerup=()=>{split=null;};
    root.classList.add('open');document.body.classList.add('flow-studio-open');visual.click();}
  function moveMarquee(e){
    const m=marquee;if(!m||m.pointerId!==e.pointerId)return;
    const r=canvas.getBoundingClientRect(),x=Math.max(r.left,Math.min(r.right,e.clientX)),y=Math.max(r.top,Math.min(r.bottom,e.clientY));
    const left=Math.min(m.x,x),top=Math.min(m.y,y),right=Math.max(m.x,x),bottom=Math.max(m.y,y);
    if(!m.moved&&Math.hypot(x-m.x,y-m.y)<4)return;m.moved=true;
    Object.assign(selectionBox.style,{left:(left-r.left)+'px',top:(top-r.top)+'px',width:(right-left)+'px',height:(bottom-top)+'px'});selectionBox.hidden=false;
    const next=new Set(m.additive?m.before:[]);
    cardEls.forEach((el,id)=>{const b=el.getBoundingClientRect();if(b.right>left&&b.left<right&&b.bottom>top&&b.top<bottom)next.add(id);});
    selection=next;cardEls.forEach((el,id)=>el.classList.toggle('sel',selection.has(id)));
    const extras=new Set(m.additive?m.beforeExtra:[]);for(const [type,map] of [['image',imageEls],['icon',iconEls],['note',noteEls]])map.forEach((el,id)=>{const b=el.getBoundingClientRect();if(b.right>left&&b.left<right&&b.bottom>top&&b.top<bottom)extras.add(objectKey(type,id));});
    extraSelection=extras;for(const [type,map] of [['image',imageEls],['icon',iconEls],['note',noteEls]])map.forEach((el,id)=>el.classList.toggle('sel',extras.has(objectKey(type,id))));updateGroupBtn();
  }

  // ---------- pointer: canvas ----------
  const pointers=new Map();let pan=null,pinch=null,lastTap=0,lastTapPos=null;
  function onCanvasDown(e,tapCard=null,fromObject=false){if(!fromObject&&(e.target.closest('.card')||e.target.closest('.group')))return;
    if(e.pointerType==='mouse'&&e.button!==0)return;
    if(marquee){finishMarquee(true);}
    if(!tapCard&&(selectMode||e.shiftKey)&&pointers.size===0){
      const before=new Set(selection),beforeExtra=new Set(extraSelection);clearSelection();if(e.shiftKey){selection=before;selection.forEach(id=>cardEls.get(id)?.classList.add('sel'));extraSelection=beforeExtra;extraSelection.forEach(key=>{const index=key.indexOf(':');objectEl(key.slice(0,index),key.slice(index+1))?.classList.add('sel');});}
      marquee={pointerId:e.pointerId,x:e.clientX,y:e.clientY,before,beforeExtra,additive:e.shiftKey,moved:false};hideCardbar();canvas.setPointerCapture(e.pointerId);e.preventDefault();return;
    }
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(e.pointerType!=='mouse'&&!isMobile()){const t=Date.now();if(t-lastTap<300&&lastTapPos&&Math.hypot(e.clientX-lastTapPos.x,e.clientY-lastTapPos.y)<24){const w=screenToWorld(e.clientX,e.clientY);addCard(w.x,w.y);lastTap=0;return;}lastTap=t;lastTapPos={x:e.clientX,y:e.clientY};}
    if(pointers.size===2){const pts=[...pointers.values()];pinch={d0:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),z0:state.view.zoom,cx:(pts[0].x+pts[1].x)/2,cy:(pts[0].y+pts[1].y)/2};pan=null;return;}
    if(!tapCard||!selectMode)clearSelection();pan={x:e.clientX,y:e.clientY,vx:state.view.x,vy:state.view.y,tapCard,moved:false};canvas.classList.add('panning');canvas.setPointerCapture(e.pointerId);}
  canvas.addEventListener('pointerdown',e=>onCanvasDown(e));
  canvas.addEventListener('pointermove',e=>{if(marquee){moveMarquee(e);return;}if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch&&pointers.size>=2){const pts=[...pointers.values()];const d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);setZoom(pinch.z0*(d/pinch.d0),pinch.cx,pinch.cy);return;}
    if(pan){if(Math.hypot(e.clientX-pan.x,e.clientY-pan.y)>(isMobile()?8:2))pan.moved=true;if(!pan.moved)return;state.view.x=pan.vx+(e.clientX-pan.x);state.view.y=pan.vy+(e.clientY-pan.y);applyView();}});
  function endPointer(e){if(marquee&&marquee.pointerId===e.pointerId){if(e.type==='pointerup')moveMarquee(e);finishMarquee(e.type==='pointercancel');return;}pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;if(pan){const ended=pan;canvas.classList.remove('panning');pan=null;if(ended.moved)scheduleSave();if(e.type==='pointerup'&&ended.tapCard&&!ended.moved){if(selectMode){const id=ended.tapCard.id;if(selection.has(id)){selection.delete(id);cardEls.get(id)?.classList.remove('sel');showCardbar();updateGroupBtn();}else selectCard(id,true);}else openPanel(ended.tapCard);}}}
  canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);
  canvas.addEventListener('lostpointercapture',e=>{if(marquee?.pointerId===e.pointerId)finishMarquee(true);});
  canvas.addEventListener('dblclick',e=>{if(isMobile())return;if(selectMode||e.shiftKey)return;if(e.target.closest('.card')||e.target.closest('.group')||e.target.closest('#linkLayer'))return;const w=screenToWorld(e.clientX,e.clientY);addCard(w.x,w.y);});
  canvas.addEventListener('wheel',e=>{e.preventDefault();if(marquee)return;if(e.ctrlKey||e.metaKey){setZoom(state.view.zoom*(e.deltaY<0?1.1:0.9),e.clientX,e.clientY);}else{state.view.x-=e.deltaX;state.view.y-=e.deltaY;applyView();scheduleSave();}},{passive:false});

  // ---------- keyboard ----------
  window.addEventListener('keydown',e=>{if(!home.hidden)return;if(e.key==='Escape'&&document.body.classList.contains('mobile-more-open')){setMobileMore(false);return;}const ae=document.activeElement;
    const typing=ae&&(ae.getAttribute('contenteditable')==='true'||ae.tagName==='INPUT'||ae.tagName==='TEXTAREA');
    if(typing){if(e.key==='Escape')ae.blur();return;}
    const command=(e.metaKey||e.ctrlKey)&&!e.altKey,key=e.key.toLowerCase();
    if(command&&key==='z'){e.preventDefault();restoreHistory(e.shiftKey);return;}
    if(command&&key==='y'){e.preventDefault();restoreHistory(true);return;}
    if(command&&key==='d'){e.preventDefault();duplicateSelection();return;}
    if(e.key==='Delete'||e.key==='Backspace'){if(selectedLink){e.preventDefault();deleteLink(selectedLink);}else if(selectedImage){e.preventDefault();deleteImage(selectedImage);}else if(selectedIcon){e.preventDefault();deleteIcon(selectedIcon);}else if(selectedNote){e.preventDefault();deleteNote(selectedNote);}else if(selection.size||selectedGroup){e.preventDefault();deleteSelection();}}
    else if(e.key==='Escape'){if(marquee){finishMarquee(true);return;}if(selectMode){setSelectMode(false);clearSelection();return;}if($('mapModal').classList.contains('open'))closeMapModal();else if(activeMenu)closeMenu();else if($('tagPanel').classList.contains('open'))closeTagPanel();else if(panel.classList.contains('open'))closePanel();else clearSelection();}
    else if(e.key==='g'||e.key==='G'){if(selection.size+extraSelection.size>=2)makeGroup();}});

  // ---------- toolbar ----------
  $('btnAdd').addEventListener('click',()=>{const r=canvas.getBoundingClientRect();const w=screenToWorld(r.left+r.width/2,r.top+r.height/2);addCard(w.x,w.y);});
  // Juice x Pele: create a normal Juice card containing one diagram block.
  $('btnFlow').addEventListener('click',()=>{
    const r=canvas.getBoundingClientRect();
    const w=screenToWorld(r.left+r.width/2,r.top+r.height/2);
    const c=addCard(w.x,w.y);c.title='新流程圖';c.w=480;
    c.blocks=[mkBlock('diagram',escapeHtml(window.JuicePeleFlow.TEMPLATE))];
    pTitle.value=c.title;renderTile(c);renderBlocks(c);touch(c);scheduleSave();
  });
  $('btnFlowPlus').addEventListener('click',()=>{
    const r=canvas.getBoundingClientRect(),w=screenToWorld(r.left+r.width/2,r.top+r.height/2),c=addCard(w.x,w.y),source=window.JuicePeleFlow.TEMPLATE;
    c.title='新 Flow Plus';c.w=900;const block=mkBlock('diagram',escapeHtml(source));block.aiContext=window.JuiceFlowPlus.createContext(source);c.blocks=[block];closePanel();renderTile(c);touch(c);scheduleSave();openFlowPlus(c,block);
  });
  $('btnGroup').addEventListener('click',makeGroup);
  $('btnZoomIn').addEventListener('click',()=>setZoom(state.view.zoom*1.15));
  $('btnZoomOut').addEventListener('click',()=>setZoom(state.view.zoom/1.15));
  $('btnFit').addEventListener('click',fitView);
  function fitView(){if(!state.cards.length){state.view={x:40,y:40,zoom:1};applyView();scheduleSave();return;}
    let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
    state.cards.forEach(c=>{const el=cardEls.get(c.id);minx=Math.min(minx,c.x);miny=Math.min(miny,c.y);maxx=Math.max(maxx,c.x+el.offsetWidth);maxy=Math.max(maxy,c.y+el.offsetHeight);});
    const r=canvas.getBoundingClientRect();const pad=80;const zoom=Math.min(1.6,Math.max(0.3,Math.min((r.width-pad)/(maxx-minx||1),(r.height-pad)/(maxy-miny||1))));
    state.view.zoom=zoom;state.view.x=(r.width-(maxx-minx)*zoom)/2-minx*zoom;state.view.y=(r.height-(maxy-miny)*zoom)/2-miny*zoom;applyView();scheduleSave();}
  $('btnExport').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='whiteboard-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(a.href);});
  const fileInput=$('fileInput');$('btnImport').addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',async e=>{
    const f=e.target.files[0];fileInput.value='';if(!f)return;
    try{if(f.size>Core.MAX_BYTES)throw new Error('檔案超過 20 MB 限制');const next=normalize(Core.parse(await f.text()));
      await transition(async()=>{await detachSources();state=next;workspaceMeta={kind:'local',name:f.name.replace(/\.json$/i,'').slice(0,200)||'匯入的白板'};editVersion++;resetScene();save();updateDriveBtn();closeHome();showBanner('已匯入為本機白板，原白板已保留復原快照');});
    }catch(e){reportError(e);}
  });
  $('btnRecovery').addEventListener('click',async event=>{
    const anchor=event.currentTarget.getBoundingClientRect();
    try{
      const snapshots=await Core.backups(),items=[];
      for(const snapshot of [...snapshots].reverse()){
        const value=snapshot.value,candidates=value.cards?[['白板',value]]:[['本機版本',value.local||value.board],['遠端版本',value.remote]];
        for(const [label,board] of candidates){if(!board||!Array.isArray(board.cards))continue;
          items.push({label:new Date(snapshot.at).toLocaleString()+' · '+label+' · '+board.cards.length+' 張卡片',onClick:()=>{downloadJSON('whiteboard-recovered-'+snapshot.at+'-'+label+'.json',board);showBanner('已下載復原白板，可使用「匯入」開啟');}});
        }
      }
      if(!snapshots.length){showBanner('目前還沒有復原快照');return;}
      items.push({sep:true},{label:'下載完整備份封存（含收件匣）',onClick:()=>downloadJSON('whiteboard-recovery-'+Date.now()+'.json',{version:1,snapshots})});
      showMenu(items,anchor.left,anchor.bottom+4,'下載要復原的版本');
    }catch(e){reportError(e);}
  });
  $('btnRawBackup').addEventListener('click',()=>{try{downloadJSON('whiteboard-local-raw.json',localStorage.getItem(STORE_KEY)||localStorage.getItem('sju-whiteboard-v1')||'{}');}catch(e){reportError(e);}});

  // ---------- status / storage meter ----------
  let statusTimer=null;
  const SIZE_WARN=3*1024*1024, SIZE_DANGER=4.2*1024*1024;
  function dataBytes(){try{return new Blob([JSON.stringify(state)]).size;}catch(e){return 0;}}
  function fmtSize(b){if(b<1024)return b+' B';if(b<1024*1024)return (b/1024).toFixed(0)+' KB';return (b/1024/1024).toFixed(2)+' MB';}
  function paintDot(b){const d=$('statusDot');d.classList.remove('warn','danger');if(b>=SIZE_DANGER)d.classList.add('danger');else if(b>=SIZE_WARN)d.classList.add('warn');}
  function idleStatus(){const b=dataBytes();statusEl.textContent=state.cards.length+' 張卡片 · '+fmtSize(b);paintDot(b);}
  function flashStatus(){const b=dataBytes();statusEl.textContent='已儲存 · '+state.cards.length+' 張卡片 · '+fmtSize(b);paintDot(b);clearTimeout(statusTimer);statusTimer=setTimeout(idleStatus,1400);}
  const showBanner=msg=>{banner.textContent=msg;banner.style.display='block';if(!home.hidden)$('homeStatus').textContent=msg;};

  // ============ TAG ORGANIZE & EXPORT ============
  let currentTag=null;
  function allTags(){const m=new Map();state.cards.forEach(c=>(c.tags||[]).forEach(t=>m.set(t,(m.get(t)||0)+1)));
    return [...m.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));}
  function openTagPanel(){currentTag=null;$('tagSel').style.display='none';renderTagList();$('tagPanel').classList.add('open');}
  function closeTagPanel(){$('tagPanel').classList.remove('open');}
  function renderTagList(){const box=$('tagList');box.innerHTML='';const tags=allTags();
    if(!tags.length){box.innerHTML='<div class="tpempty">尚未建立任何標籤。在卡片的「標籤」欄輸入即可。</div>';return;}
    tags.forEach(([t,n])=>{const b=document.createElement('div');b.className='tagbtn'+(t===currentTag?' on':'');
      b.innerHTML='#'+escapeHtml(t)+' <span class="cnt">'+n+'</span>';b.addEventListener('click',()=>selectTag(t));box.appendChild(b);});}
  function selectTag(t){currentTag=t;renderTagList();const cards=state.cards.filter(c=>(c.tags||[]).includes(t));
    $('tagSel').style.display='';$('tagSelTitle').textContent='標籤「'+t+'」· '+cards.length+' 張卡片';
    const box=$('tagCards');box.innerHTML='';
    cards.forEach(c=>{const lbl=cardLabel(c),snip=blocksText(c.blocks).trim().slice(0,46);const row=document.createElement('div');row.className='tcard';
      row.innerHTML='<div class="tct"><span class="tcd" style="background:'+COLORS[c.color].bg+'"></span>'+escapeHtml(lbl.text)+'</div>'+(snip?'<div class="tcp">'+escapeHtml(snip)+'</div>':'');
      row.addEventListener('click',()=>{openPanel(c);focusCardOnScreen(c);});box.appendChild(row);});}
  function htmlToMd(html){const d=document.createElement('div');d.innerHTML=html||'';
    const walk=node=>{let out='';node.childNodes.forEach(n=>{if(n.nodeType===3){out+=n.textContent;return;}if(n.nodeType!==1)return;
      const tag=n.tagName.toLowerCase(),inner=walk(n);
      if(tag==='b'||tag==='strong')out+='**'+inner+'**';else if(tag==='i'||tag==='em')out+='*'+inner+'*';
      else if(tag==='a')out+='['+inner+']('+(n.getAttribute('href')||'')+')';else if(tag==='br')out+='\n';else out+=inner;});return out;};
    return walk(d).trim();}
  function blocksToMd(blocks){const parts=[];let num=0;
    (blocks||[]).forEach(b=>{if(b.type!=='number')num=0;const editable=b.type!=='divider'&&b.type!=='image';const t=htmlToMd(b.html);
      if(editable&&!t)return;let line;
      switch(b.type){case 'h1':line='# '+t;break;case 'h2':line='## '+t;break;case 'h3':line='### '+t;break;
        case 'bullet':line='- '+t;break;case 'number':num++;line=num+'. '+t;break;case 'todo':line='- ['+(b.checked?'x':' ')+'] '+t;break;
        case 'quote':line='> '+t;break;case 'callout':line='> 💡 '+t;break;case 'code':line='```\n'+plainText(b.html)+'\n```';break;
        case 'divider':line='---';break;case 'image':line='*(圖片)*';break;default:line=t;}
      parts.push({line,list:(b.type==='bullet'||b.type==='number'||b.type==='todo')});});
    let md='';parts.forEach((p,i)=>{if(i>0)md+=(parts[i-1].list&&p.list)?'\n':'\n\n';md+=p.line;});return md;}
  function cardToMd(c){const title=(c.title||'').trim()||'未命名卡片';let s='## '+title+'\n';
    if(c.tags&&c.tags.length)s+='\n'+c.tags.map(t=>'#'+t).join(' ')+'\n';
    const body=blocksToMd(c.blocks);if(body)s+='\n'+body+'\n';return s;}
  function tagToMd(tag){const cards=state.cards.filter(c=>(c.tags||[]).includes(tag));
    let md='# 標籤：'+tag+'\n\n共 '+cards.length+' 張卡片\n';cards.forEach(c=>{md+='\n---\n\n'+cardToMd(c);});return md;}
  function downloadText(name,text){const blob=new Blob([text],{type:'text/markdown;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);}
  function copyText(text,btn){
    if(navigator.clipboard&&navigator.clipboard.writeText)
      navigator.clipboard.writeText(text).then(()=>flashCopy(btn)).catch(()=>fallbackCopy(text,btn));
    else fallbackCopy(text,btn);}
  function fallbackCopy(text,btn){const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.top='-9999px';ta.style.opacity='0';document.body.appendChild(ta);ta.focus();ta.select();
    let ok=false;try{ok=document.execCommand('copy');}catch(e){ok=false;}document.body.removeChild(ta);
    if(ok)flashCopy(btn);else showBanner('此瀏覽器在本機檔案模式下無法自動複製，請改用「下載格式說明」。');}
  function flashCopy(btn){if(!btn){showBanner('已複製到剪貼簿 ✓');return;}const o=btn.textContent;btn.textContent='已複製 ✓';setTimeout(()=>{btn.textContent=o;},1200);}
  $('btnTags').addEventListener('click',openTagPanel);
  $('tpClose').addEventListener('click',closeTagPanel);
  $('tagExport').addEventListener('click',()=>{if(currentTag)downloadText('標籤-'+currentTag+'-'+new Date().toISOString().slice(0,10)+'.md',tagToMd(currentTag));});
  $('tagCopy').addEventListener('click',e=>{if(currentTag)copyText(tagToMd(currentTag),e.currentTarget);});

  // ============ MAP BACKGROUND & IMAGE OBJECTS ============
  // image objects can sit below or above cards
  function makeImageEl(im){const el=document.createElement('div');el.className='imgobj '+(im.layer==='above'?'above':'below');el.dataset.id=im.id;
    el.style.left=im.x+'px';el.style.top=im.y+'px';el.style.width=im.w+'px';el.style.opacity=im.opacity;
    const img=document.createElement('img');img.src=im.src;el.appendChild(img);
    const res=document.createElement('div');res.className='ires';el.appendChild(res);
    world.appendChild(el);imageEls.set(im.id,el);
    el.addEventListener('pointerdown',e=>onImageDown(e,im));
    res.addEventListener('pointerdown',e=>onImageResize(e,im));return el;}
  function deselectImage(){if(selectedImage){imageEls.get(selectedImage)?.classList.remove('sel');selectedImage=null;}hideImgbar();}
  function selectImage(id,additive=false){selectExtra('image',id,additive);}
  function showImgbar(){const im=byId(state.images,selectedImage);if(!im)return;$('imgOpacity').value=im.opacity;$('imgLayer').value=im.layer==='above'?'above':'below';
    const r=canvas.getBoundingClientRect();const sx=r.left+state.view.x+(im.x+im.w/2)*state.view.zoom,sy=r.top+state.view.y+im.y*state.view.zoom;
    const bar=$('imgbar');bar.style.display='flex';bar.style.left=Math.max(8,Math.min(sx-bar.offsetWidth/2,innerWidth-bar.offsetWidth-8))+'px';bar.style.top=Math.max(58,sy-bar.offsetHeight-12)+'px';}
  function hideImgbar(){$('imgbar').style.display='none';}
  const deleteImage=(id)=>destructive(()=>deleteImageNow(id));
  function deleteImageNow(id){state.images=state.images.filter(i=>i.id!==id);imageEls.get(id)?.remove();imageEls.delete(id);extraSelection.delete(objectKey('image',id));removeMemberFromGroups('image',id);if(selectedImage===id)selectedImage=null;hideImgbar();updateBgBtn();scheduleSave();}
  function applyBgEdit(){imageEls.forEach(el=>{el.classList.toggle('editable',bgEdit||selectMode);el.style.pointerEvents=bgEdit||selectMode?'auto':'none';});if(!bgEdit&&!selectMode)deselectImage();}
  function setBgEdit(v){bgEdit=v;applyBgEdit();updateBgBtn();}
  function updateBgBtn(){const b=$('btnBg');if(!b)return;if(state.images.length){b.style.display='';b.textContent=bgEdit?'圖片：可編輯':'圖片：鎖定';}else b.style.display='none';}
  let idrag=null,iresz=null;
  function onImageDown(e,im){if((!bgEdit&&!selectMode)||e.target.classList.contains('ires'))return;e.stopPropagation();if(e.shiftKey||selectMode){selectImage(im.id,true);return;}
    const grouped=groupFor('image',im.id);if(grouped){onGroupDown(e,grouped,true);return;}selectImage(im.id);
    const start=screenToWorld(e.clientX,e.clientY);idrag={im,ox:im.x,oy:im.y,start,moved:false};imageEls.get(im.id).setPointerCapture(e.pointerId);hideImgbar();
    window.addEventListener('pointermove',onImageMove);window.addEventListener('pointerup',onImageUp);}
  function onImageMove(e){if(!idrag)return;const p=screenToWorld(e.clientX,e.clientY);const dx=p.x-idrag.start.x,dy=p.y-idrag.start.y;if(Math.abs(dx)>2||Math.abs(dy)>2)idrag.moved=true;
    idrag.im.x=Math.round(idrag.ox+dx);idrag.im.y=Math.round(idrag.oy+dy);const el=imageEls.get(idrag.im.id);el.style.left=idrag.im.x+'px';el.style.top=idrag.im.y+'px';}
  function onImageUp(){window.removeEventListener('pointermove',onImageMove);window.removeEventListener('pointerup',onImageUp);if(idrag&&idrag.moved)scheduleSave();showImgbar();idrag=null;}
  function onImageResize(e,im){if(!bgEdit)return;e.stopPropagation();e.preventDefault();const start=screenToWorld(e.clientX,e.clientY);iresz={im,ow:im.w,start};
    e.target.setPointerCapture(e.pointerId);hideImgbar();window.addEventListener('pointermove',onResizeMove);window.addEventListener('pointerup',onResizeUp);}
  function onResizeMove(e){if(!iresz)return;const p=screenToWorld(e.clientX,e.clientY);iresz.im.w=Math.max(80,Math.round(iresz.ow+(p.x-iresz.start.x)));imageEls.get(iresz.im.id).style.width=iresz.im.w+'px';}
  function onResizeUp(){window.removeEventListener('pointermove',onResizeMove);window.removeEventListener('pointerup',onResizeUp);if(iresz){fitGroupFor('image',iresz.im.id);scheduleSave();}showImgbar();iresz=null;}
  $('imgOpacity').addEventListener('input',e=>{const im=byId(state.images,selectedImage);if(!im)return;im.opacity=parseFloat(e.target.value);imageEls.get(im.id).style.opacity=im.opacity;scheduleSave();});
  $('imgLayer').addEventListener('change',e=>{const im=byId(state.images,selectedImage);if(!im)return;im.layer=e.target.value==='above'?'above':'below';const el=imageEls.get(im.id);el.classList.toggle('above',im.layer==='above');el.classList.toggle('below',im.layer==='below');scheduleSave();});
  $('imgLock').addEventListener('click',()=>setBgEdit(false));
  $('imgDelete').addEventListener('click',()=>{if(selectedImage)deleteImage(selectedImage);});
  $('btnBg').addEventListener('click',()=>setBgEdit(!bgEdit));
  function placeImageObject(dataUrl,w,h,opacity,dispCap){const r=canvas.getBoundingClientRect();const c0=screenToWorld(r.left+r.width/2,r.top+r.height/2);
    const dispW=Math.min(w||500,dispCap||700);const im={id:uid(),x:Math.round(c0.x-dispW/2),y:Math.round(c0.y-dispW*((h||300)/(w||500))/2),w:dispW,src:dataUrl,opacity:(opacity==null?0.55:opacity),layer:'below'};
    state.images.push(im);makeImageEl(im);setBgEdit(true);selectImage(im.id);scheduleSave();}
  function placeMapImage(dataUrl,w,h){placeImageObject(dataUrl,w,h,0.55,700);}
  function uploadReferenceImage(){const i=document.createElement('input');i.type='file';i.accept='image/*';
    i.onchange=()=>{const f=i.files[0];if(f)readImageFile(f,(src,w,h)=>placeImageObject(src,w,h,1,560),1800);};i.click();}

  // ---------- foreground / background icon objects ----------
  const ICONS={person:'👤',team:'👥',customer:'🙋',database:'🗄️',document:'📄',warning:'⚠️',check:'✅',arrow:'➜',phone:'☎️',mail:'✉️',ai:'✦',calendar:'🗓️',flag:'⚑',idea:'💡',gear:'⚙️',home:'🏠',office:'🏢',warehouse:'🏬',factory:'🏭',shop:'🛍️',bank:'🏦',cloud:'☁️',server:'🖥️',folder:'📁',file:'📃',spreadsheet:'📑',chart:'📊',barChart:'📈',search:'🔍',target:'🎯',lock:'🔒',key:'🔑',shield:'🛡️',bell:'🔔',clock:'🕒',hourglass:'⌛',stopwatch:'⏱️',pin:'📌',map:'🗺️',globe:'🌐',car:'🚗',truck:'🚚',plane:'✈️',ship:'🚢',package:'📦',cart:'🛒',money:'💵',coin:'🪙',receipt:'🧾',card:'💳',heart:'❤️',star:'⭐',sparkle:'✨',fire:'🔥',bulb:'💡',wrench:'🔧',hammer:'🔨',tools:'🛠️',laptop:'💻',desktop:'🖥️',mobile:'📱',printer:'🖨️',camera:'📷',video:'🎥',microphone:'🎙️',headphones:'🎧',play:'▶️',pause:'⏸️',stop:'⏹️',refresh:'🔄',plus:'➕',minus:'➖',info:'ℹ️',question:'❓',prohibited:'🚫',success:'🟢',pending:'🟡',fail:'🔴',up:'⬆️',down:'⬇️',left:'⬅️',right:'➡️',link:'🔗',branch:'🌿',inbox:'📥',outbox:'📤'};
  const ICON_LABELS={person:'人物',team:'團隊',customer:'客戶',database:'資料庫',document:'文件',warning:'警告',check:'完成',arrow:'箭頭',phone:'電話',mail:'郵件',ai:'AI',calendar:'行事曆',flag:'旗標',idea:'點子',gear:'設定',home:'住家',office:'辦公室',warehouse:'倉庫',factory:'工廠',shop:'商店',bank:'銀行',cloud:'雲端',server:'伺服器',folder:'資料夾',file:'檔案',spreadsheet:'試算表',chart:'圖表',barChart:'趨勢圖',search:'搜尋',target:'目標',lock:'鎖定',key:'金鑰',shield:'安全',bell:'通知',clock:'時鐘',hourglass:'沙漏',stopwatch:'計時',pin:'圖釘',map:'地圖',globe:'網路',car:'汽車',truck:'貨車',plane:'飛機',ship:'船',package:'包裹',cart:'購物車',money:'金錢',coin:'硬幣',receipt:'收據',card:'信用卡',heart:'喜愛',star:'星星',sparkle:'亮點',fire:'熱門',bulb:'燈泡',wrench:'扳手',hammer:'工具錘',tools:'工具',laptop:'筆電',desktop:'桌機',mobile:'手機',printer:'印表機',camera:'相機',video:'影片',microphone:'麥克風',headphones:'耳機',play:'播放',pause:'暫停',stop:'停止',refresh:'重新整理',plus:'新增',minus:'減少',info:'資訊',question:'問題',prohibited:'禁止',success:'成功',pending:'待處理',fail:'失敗',up:'向上',down:'向下',left:'向左',right:'向右',link:'連結',branch:'分支',inbox:'收件',outbox:'寄出'};
  function makeIconEl(icon){const el=document.createElement('button');el.type='button';el.className='iconobj '+icon.layer;el.dataset.id=icon.id;
    if(icon.name==='custom'&&icon.src){const image=document.createElement('img');image.src=icon.src;image.alt='自訂圖示';image.draggable=false;el.appendChild(image);}
    else el.textContent=ICONS[icon.name]||ICONS.idea;
    el.title='圖示：拖曳移動，右下角調整大小';el.style.left=icon.x+'px';el.style.top=icon.y+'px';el.style.fontSize=icon.size+'px';
    const resize=document.createElement('span');resize.className='icon-resize';el.appendChild(resize);world.appendChild(el);iconEls.set(icon.id,el);el.addEventListener('pointerdown',e=>onIconDown(e,icon));resize.addEventListener('pointerdown',e=>onIconResize(e,icon));}
  function deselectIcon(){if(selectedIcon){iconEls.get(selectedIcon)?.classList.remove('sel');selectedIcon=null;}hideIconbar();}
  function selectIcon(id,additive=false){selectExtra('icon',id,additive);}
  function showIconbar(){const icon=byId(state.icons,selectedIcon);if(!icon)return;const el=iconEls.get(icon.id),r=canvas.getBoundingClientRect(),bar=$('iconbar');bar.style.display='flex';bar.style.left=(r.left+state.view.x+(icon.x+icon.size/2)*state.view.zoom-bar.offsetWidth/2)+'px';bar.style.top=Math.max(58,r.top+state.view.y+(icon.y-20)*state.view.zoom-bar.offsetHeight)+'px';$('iconLayer').value=icon.layer;}
  function hideIconbar(){$('iconbar').style.display='none';}
  let iconDrag=null,iconResize=null;
  function onIconDown(e,icon){if(e.target.classList.contains('icon-resize'))return;e.stopPropagation();e.preventDefault();if(e.shiftKey||selectMode){selectIcon(icon.id,true);return;}
    const grouped=groupFor('icon',icon.id);if(grouped){onGroupDown(e,grouped,true);return;}selectIcon(icon.id);const start=screenToWorld(e.clientX,e.clientY);iconDrag={icon,start,x:icon.x,y:icon.y,moved:false};e.currentTarget.setPointerCapture(e.pointerId);window.addEventListener('pointermove',onIconMove);window.addEventListener('pointerup',onIconUp);}
  function onIconMove(e){if(!iconDrag)return;const p=screenToWorld(e.clientX,e.clientY);const dx=p.x-iconDrag.start.x,dy=p.y-iconDrag.start.y;iconDrag.moved||=Math.abs(dx)>2||Math.abs(dy)>2;iconDrag.icon.x=Math.round(iconDrag.x+dx);iconDrag.icon.y=Math.round(iconDrag.y+dy);const el=iconEls.get(iconDrag.icon.id);el.style.left=iconDrag.icon.x+'px';el.style.top=iconDrag.icon.y+'px';}
  function onIconUp(){window.removeEventListener('pointermove',onIconMove);window.removeEventListener('pointerup',onIconUp);if(iconDrag?.moved)scheduleSave();showIconbar();iconDrag=null;}
  function onIconResize(e,icon){e.stopPropagation();e.preventDefault();const start=screenToWorld(e.clientX,e.clientY);iconResize={icon,start,size:icon.size};e.currentTarget.setPointerCapture(e.pointerId);window.addEventListener('pointermove',onIconResizeMove);window.addEventListener('pointerup',onIconResizeUp);}
  function onIconResizeMove(e){if(!iconResize)return;const p=screenToWorld(e.clientX,e.clientY);iconResize.icon.size=Math.max(18,Math.min(160,Math.round(iconResize.size+p.x-iconResize.start.x)));iconEls.get(iconResize.icon.id).style.fontSize=iconResize.icon.size+'px';}
  function onIconResizeUp(){window.removeEventListener('pointermove',onIconResizeMove);window.removeEventListener('pointerup',onIconResizeUp);if(iconResize){fitGroupFor('icon',iconResize.icon.id);scheduleSave();}showIconbar();iconResize=null;}
  function deleteIcon(id){state.icons=state.icons.filter(icon=>icon.id!==id);iconEls.get(id)?.remove();iconEls.delete(id);extraSelection.delete(objectKey('icon',id));removeMemberFromGroups('icon',id);if(selectedIcon===id)selectedIcon=null;hideIconbar();scheduleSave();}
  function addIcon(data){const r=canvas.getBoundingClientRect(),p=screenToWorld(r.left+r.width/2,r.top+r.height/2);
    const icon={id:uid(),x:Math.round(p.x-22),y:Math.round(p.y-22),size:44,layer:'above',...data};state.icons.push(icon);makeIconEl(icon);selectIcon(icon.id);$('iconPalette').hidden=true;scheduleSave();}
  function saveIconToLibrary(src,label){
    if(state.iconLibrary.some(item=>item.src===src))return true;
    if(!/^data:image\/(?:png|webp);base64,/.test(src)||src.length>1024*1024||state.iconLibrary.length>=30||state.iconLibrary.reduce((size,item)=>size+item.src.length,0)+src.length>6*1024*1024)return false;
    state.iconLibrary.push({id:uid(),label:(label||'自訂圖示').slice(0,100),src});return true;
  }
  function readCustomIconFile(file){if(!/^image\/(png|webp)$/.test(file.type)||file.size>2*1024*1024){showBanner('自訂圖示請使用 2 MB 內的 PNG 或 WebP');return;}
    const reader=new FileReader();reader.onerror=()=>showBanner('無法讀取圖示');reader.onload=()=>{const image=new Image();image.onerror=()=>showBanner('圖示格式無法讀取');image.onload=()=>{
      const scale=Math.min(1,256/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const src=canvas.toDataURL('image/png');if(src.length>1024*1024){showBanner('圖示內容過大，請改用較簡單的圖片');return;}
      if(!saveIconToLibrary(src,file.name.replace(/\.[^.]+$/,'')||'自訂圖示'))showBanner('圖示已放入白板，但圖示庫容量已滿');addIcon({name:'custom',src});};image.src=reader.result;};reader.readAsDataURL(file);}
  function openIconPalette(){const palette=$('iconPalette');if(!palette.hidden){palette.hidden=true;return;}palette.replaceChildren();
    const search=document.createElement('input');search.type='search';search.placeholder='搜尋圖示';search.setAttribute('aria-label','搜尋圖示');palette.appendChild(search);
    const searchable=[];Object.entries(ICONS).forEach(([name,glyph])=>{const button=document.createElement('button');button.type='button';button.textContent=glyph;button.title=name;button.dataset.search=(name+' '+(ICON_LABELS[name]||name)).toLowerCase();button.setAttribute('aria-label',ICON_LABELS[name]||name);button.addEventListener('click',()=>addIcon({name}));palette.appendChild(button);searchable.push(button);});
    const saved=new Set(state.iconLibrary.map(item=>item.src)),library=[...state.iconLibrary];state.icons.forEach(icon=>{if(icon.name==='custom'&&icon.src&&!saved.has(icon.src)){saved.add(icon.src);library.push({id:null,label:'自訂圖示 '+(library.length+1),src:icon.src});}});
    if(library.length){const section=document.createElement('div');section.className='icon-library';const heading=document.createElement('strong');heading.textContent='我的圖示';section.appendChild(heading);
      library.forEach(item=>{const tile=document.createElement('div');tile.className='icon-library-item';tile.dataset.search=item.label.toLowerCase();const button=document.createElement('button');button.type='button';button.title=item.label;button.setAttribute('aria-label','插入 '+item.label);const image=document.createElement('img');image.src=item.src;image.alt='';button.appendChild(image);button.addEventListener('click',()=>{if(!item.id&&!saveIconToLibrary(item.src,item.label))showBanner('圖示庫容量已滿，仍可使用白板上的圖示');addIcon({name:'custom',src:item.src});});tile.appendChild(button);
        section.appendChild(tile);searchable.push(tile);});search.after(section);}
    search.addEventListener('input',()=>{const query=search.value.trim().toLowerCase();searchable.forEach(item=>{item.hidden=!!query&&!item.dataset.search.includes(query);});});
    const custom=document.createElement('div');custom.className='icon-custom';const upload=document.createElement('button');upload.type='button';upload.textContent='上傳自訂 PNG／WebP 圖示';upload.addEventListener('click',()=>{const input=document.createElement('input');input.type='file';input.accept='image/png,image/webp';input.addEventListener('change',()=>{if(input.files[0])readCustomIconFile(input.files[0]);});input.click();});
    custom.append(upload);palette.appendChild(custom);palette.hidden=false;search.focus();}
  $('btnIcon').addEventListener('click',openIconPalette);
  $('iconLayer').addEventListener('change',e=>{const icon=byId(state.icons,selectedIcon);if(!icon)return;icon.layer=e.target.value==='below'?'below':'above';const el=iconEls.get(icon.id);el.classList.toggle('below',icon.layer==='below');el.classList.toggle('above',icon.layer==='above');scheduleSave();});
  $('iconDelete').addEventListener('click',()=>{if(selectedIcon)deleteIcon(selectedIcon);});

  // ---------- free-position text ----------
  function makeNoteEl(note){const el=document.createElement('div');el.className='noteobj '+note.layer;el.dataset.id=note.id;el.contentEditable='true';el.spellcheck=true;el.textContent=note.text;el.style.left=note.x+'px';el.style.top=note.y+'px';el.style.fontSize=note.size+'px';el.style.color=note.color;world.appendChild(el);noteEls.set(note.id,el);
    el.style.width=(note.w||280)+'px';let previous=note.w||280;const observer=new ResizeObserver(()=>{const width=Math.round(el.offsetWidth);if(width!==previous&&el.isConnected){previous=width;note.w=Math.max(40,Math.min(1600,width));fitGroupFor('note',note.id);scheduleSave('note-width:'+note.id);}if(!el.isConnected)observer.disconnect();});observer.observe(el);
    el.addEventListener('pointerdown',e=>onNoteDown(e,note));el.addEventListener('dblclick',()=>{if(groupFor('note',note.id))el.focus();});el.addEventListener('input',()=>{note.text=el.textContent.slice(0,10000);fitGroupFor('note',note.id);scheduleSave('note:'+note.id);});el.addEventListener('blur',()=>{if(!note.text.trim())deleteNote(note.id);});}
  function deselectNote(){if(selectedNote){noteEls.get(selectedNote)?.classList.remove('sel');selectedNote=null;}hideNotebar();}
  function selectNote(id,additive=false){selectExtra('note',id,additive);}
  function showNotebar(){const note=byId(state.notes,selectedNote);if(!note)return;const r=canvas.getBoundingClientRect(),bar=$('notebar');bar.style.display='flex';bar.style.left=(r.left+state.view.x+(note.x+40)*state.view.zoom-bar.offsetWidth/2)+'px';bar.style.top=Math.max(58,r.top+state.view.y+(note.y-18)*state.view.zoom-bar.offsetHeight)+'px';$('noteSize').value=note.size;$('noteColor').value=note.color;$('noteLayer').value=note.layer;}
  function hideNotebar(){$('notebar').style.display='none';}
  let noteDrag=null;
  function onNoteDown(e,note){e.stopPropagation();const rect=e.currentTarget.getBoundingClientRect();if(e.clientX>rect.right-18&&e.clientY>rect.bottom-18)return;if(e.shiftKey||selectMode){e.preventDefault();selectNote(note.id,true);return;}
    if(e.target===e.currentTarget&&document.activeElement===e.currentTarget)return;const grouped=groupFor('note',note.id);if(grouped){onGroupDown(e,grouped,true);return;}selectNote(note.id);const start=screenToWorld(e.clientX,e.clientY);noteDrag={note,start,x:note.x,y:note.y,moved:false};e.currentTarget.setPointerCapture(e.pointerId);window.addEventListener('pointermove',onNoteMove);window.addEventListener('pointerup',onNoteUp);}
  function onNoteMove(e){if(!noteDrag)return;const p=screenToWorld(e.clientX,e.clientY),dx=p.x-noteDrag.start.x,dy=p.y-noteDrag.start.y;noteDrag.moved||=Math.abs(dx)>2||Math.abs(dy)>2;noteDrag.note.x=Math.round(noteDrag.x+dx);noteDrag.note.y=Math.round(noteDrag.y+dy);const el=noteEls.get(noteDrag.note.id);el.style.left=noteDrag.note.x+'px';el.style.top=noteDrag.note.y+'px';}
  function onNoteUp(){window.removeEventListener('pointermove',onNoteMove);window.removeEventListener('pointerup',onNoteUp);if(noteDrag?.moved)scheduleSave();showNotebar();noteDrag=null;}
  function deleteNote(id){state.notes=state.notes.filter(note=>note.id!==id);noteEls.get(id)?.remove();noteEls.delete(id);extraSelection.delete(objectKey('note',id));removeMemberFromGroups('note',id);if(selectedNote===id)selectedNote=null;hideNotebar();scheduleSave();}
  $('btnText').addEventListener('click',()=>{const r=canvas.getBoundingClientRect(),p=screenToWorld(r.left+r.width/2,r.top+r.height/2),note={id:uid(),x:Math.round(p.x-40),y:Math.round(p.y-14),text:'輸入文字',size:20,color:'#2A3038',layer:'above'};state.notes.push(note);makeNoteEl(note);selectNote(note.id);scheduleSave();setTimeout(()=>{const el=noteEls.get(note.id);el.focus();document.execCommand('selectAll');},0);});
  function orderCards(front){const sorted=[...state.cards].sort((a,b)=>(a.z||0)-(b.z||0)),chosen=sorted.filter(c=>selection.has(c.id)),rest=sorted.filter(c=>!selection.has(c.id));if(!chosen.length){showBanner('請先選取要調整層級的卡片');return;}(front?[...rest,...chosen]:[...chosen,...rest]).forEach((c,index)=>{c.z=index;placeCard(c);});scheduleSave();}
  $('btnFront').addEventListener('click',()=>orderCards(true));$('btnBack').addEventListener('click',()=>orderCards(false));
  // Object actions live beside the object and in its context menu.
  $('btnFront').hidden=true;$('btnBack').hidden=true;
  world.addEventListener('contextmenu',event=>{const card=event.target.closest('.card'),note=event.target.closest('.noteobj'),icon=event.target.closest('.iconobj'),group=event.target.closest('.group');if(!card&&!note&&!icon&&!group)return;event.preventDefault();event.stopPropagation();
    if(group){const g=byId(state.groups,group.dataset.id);selectGroup(g.id);showMenu([{label:'解開群組',onClick:()=>ungroupGroup(g.id)}],event.clientX,event.clientY,'群組操作');}
    else if(card){const c=byId(state.cards,card.dataset.id);selectCard(c.id,false);showMenu([{label:hasDiagram(c)?'編輯流程圖':'編輯卡片',onClick:()=>openPanel(c)},{label:'移到最上層',onClick:()=>orderCards(true)},{label:'移到最下層',onClick:()=>orderCards(false)},{label:'複製',onClick:duplicateSelection},{label:'刪除',danger:true,onClick:deleteSelection}],event.clientX,event.clientY,'卡片操作');}
    else if(note){const n=byId(state.notes,note.dataset.id);selectNote(n.id);showMenu([{label:'編輯文字',onClick:()=>note.focus()},{label:'文字大小與顏色',onClick:showNotebar},{label:n.layer==='above'?'放到卡片下方':'放到卡片上方',onClick:()=>{n.layer=n.layer==='above'?'below':'above';note.className='noteobj '+n.layer;showNotebar();scheduleSave();}},{label:'刪除',danger:true,onClick:()=>deleteNote(n.id)}],event.clientX,event.clientY,'文字操作');}
    else{const i=byId(state.icons,icon.dataset.id);selectIcon(i.id);showMenu([{label:i.layer==='above'?'放到卡片下方':'放到卡片上方',onClick:()=>{i.layer=i.layer==='above'?'below':'above';icon.className='iconobj '+i.layer;showIconbar();scheduleSave();}},{label:'刪除',danger:true,onClick:()=>deleteIcon(i.id)}],event.clientX,event.clientY,'圖示操作');}
  });
  $('noteSize').addEventListener('input',e=>{const note=byId(state.notes,selectedNote);if(!note)return;note.size=Number(e.target.value);noteEls.get(note.id).style.fontSize=note.size+'px';scheduleSave('note-style:'+note.id);});
  $('noteColor').addEventListener('input',e=>{const note=byId(state.notes,selectedNote);if(!note)return;note.color=e.target.value;noteEls.get(note.id).style.color=note.color;scheduleSave('note-style:'+note.id);});
  $('noteLayer').addEventListener('change',e=>{const note=byId(state.notes,selectedNote);if(!note)return;note.layer=e.target.value==='below'?'below':'above';const el=noteEls.get(note.id);el.className='noteobj '+note.layer;scheduleSave();});
  $('noteDelete').addEventListener('click',()=>{if(selectedNote)deleteNote(selectedNote);});

  // --- lightweight OSM map picker ---
  const TILE='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileURL=(z,x,y)=>TILE.replace('{z}',z).replace('{x}',x).replace('{y}',y);
  let mp={lat:25.0478,lng:121.5319,zoom:13,pins:[]};
  function project(lat,lng,z){const n=Math.pow(2,z)*256,x=(lng+180)/360*n,lr=lat*Math.PI/180,y=(1-Math.log(Math.tan(lr)+1/Math.cos(lr))/Math.PI)/2*n;return {x,y};}
  function unproject(x,y,z){const n=Math.pow(2,z)*256,lng=x/n*360-180,m=Math.PI*(1-2*y/n),lat=Math.atan(Math.sinh(m))*180/Math.PI;return {lat,lng};}
  function mapSize(){const m=$('mmMap');return {w:m.clientWidth,h:m.clientHeight};}
  function renderTiles(){const {w:W,h:H}=mapSize();const z=mp.zoom,c=project(mp.lat,mp.lng,z),tl={x:c.x-W/2,y:c.y-H/2},n=Math.pow(2,z);
    const tiles=$('mmTiles');tiles.innerHTML='';
    const tx0=Math.floor(tl.x/256),tx1=Math.floor((tl.x+W)/256),ty0=Math.floor(tl.y/256),ty1=Math.floor((tl.y+H)/256);
    for(let tx=tx0;tx<=tx1;tx++)for(let ty=ty0;ty<=ty1;ty++){if(ty<0||ty>=n)continue;const wx=((tx%n)+n)%n;
      const img=document.createElement('img');img.src=tileURL(z,wx,ty);img.style.left=(tx*256-tl.x)+'px';img.style.top=(ty*256-tl.y)+'px';tiles.appendChild(img);}
    renderPins(tl,z);}
  function renderPins(tl,z){const box=$('mmPins');box.innerHTML='';mp.pins.forEach((p,i)=>{const pp=project(p.lat,p.lng,z);
    const el=document.createElement('div');el.className='mm-pin';el.style.left=(pp.x-tl.x)+'px';el.style.top=(pp.y-tl.y)+'px';
    el.innerHTML='<div class="pinhead"><span>'+(i+1)+'</span></div>';
    el.addEventListener('click',ev=>{ev.stopPropagation();mp.pins.splice(i,1);renderTiles();mmHint();});box.appendChild(el);});}
  function mmHint(){$('mmHint').textContent=mp.pins.length?(mp.pins.length+' 個圖釘'):'尚未落點（可不落點，直接以目前範圍加入）';}
  (function(){const map=$('mmMap');let pan=null,moved=false;
    map.addEventListener('pointerdown',e=>{if(e.target.closest('.mm-pin')||e.target.closest('.mm-zoom'))return;map.classList.add('dragging');
      pan={x:e.clientX,y:e.clientY,c:project(mp.lat,mp.lng,mp.zoom)};moved=false;try{map.setPointerCapture(e.pointerId);}catch(err){}});
    map.addEventListener('pointermove',e=>{if(!pan)return;const dx=e.clientX-pan.x,dy=e.clientY-pan.y;if(Math.abs(dx)>3||Math.abs(dy)>3)moved=true;
      const ll=unproject(pan.c.x-dx,pan.c.y-dy,mp.zoom);mp.lat=ll.lat;mp.lng=ll.lng;renderTiles();});
    map.addEventListener('pointerup',e=>{map.classList.remove('dragging');
      if(pan&&!moved){const {w:W,h:H}=mapSize();const c=project(mp.lat,mp.lng,mp.zoom),tl={x:c.x-W/2,y:c.y-H/2},r=map.getBoundingClientRect();
        const ll=unproject(tl.x+(e.clientX-r.left),tl.y+(e.clientY-r.top),mp.zoom);mp.pins.push({lat:ll.lat,lng:ll.lng});renderTiles();mmHint();}pan=null;});
    map.addEventListener('wheel',e=>{e.preventDefault();const r=map.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top,{w:W,h:H}=mapSize();
      const c=project(mp.lat,mp.lng,mp.zoom),tl={x:c.x-W/2,y:c.y-H/2},before=unproject(tl.x+px,tl.y+py,mp.zoom);
      mp.zoom=Math.max(2,Math.min(19,mp.zoom+(e.deltaY<0?1:-1)));
      const bp=project(before.lat,before.lng,mp.zoom),nc=unproject(bp.x-px+W/2,bp.y-py+H/2,mp.zoom);mp.lat=nc.lat;mp.lng=nc.lng;renderTiles();},{passive:false});
    $('mmZin').addEventListener('click',()=>{mp.zoom=Math.min(19,mp.zoom+1);renderTiles();});
    $('mmZout').addEventListener('click',()=>{mp.zoom=Math.max(2,mp.zoom-1);renderTiles();});})();
  function doSearch(){const q=$('mmSearch').value.trim();if(!q)return;$('mmHint').textContent='搜尋中…';
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(q)).then(r=>r.json())
      .then(a=>{if(a&&a[0]){mp.lat=parseFloat(a[0].lat);mp.lng=parseFloat(a[0].lon);mp.zoom=14;renderTiles();mmHint();}else $('mmHint').textContent='找不到「'+q+'」';})
      .catch(()=>{$('mmHint').textContent='搜尋失敗（需要連網）';});}
  $('mmSearchBtn').addEventListener('click',doSearch);
  $('mmSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();doSearch();}});
  function openMapModal(){$('mapModal').classList.add('open');mmHint();setTimeout(renderTiles,40);}
  function closeMapModal(){$('mapModal').classList.remove('open');}
  $('btnMap').addEventListener('click',openMapModal);
  $('btnImg').addEventListener('click',uploadReferenceImage);
  document.addEventListener('paste',event=>{const target=event.target;if(target.closest('[contenteditable="true"],input,textarea,select'))return;const file=clipboardImage(event.clipboardData);if(!file)return;event.preventDefault();readImageFile(file,(src,w,h)=>placeImageObject(src,w,h,1,560),1800);});
  $('mmClose').addEventListener('click',closeMapModal);
  $('mmCancel').addEventListener('click',closeMapModal);
  $('mapModal').addEventListener('pointerdown',e=>{if(e.target.id==='mapModal')closeMapModal();});
  function drawPin(ctx,x,y,num){ctx.save();ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();ctx.beginPath();ctx.arc(x,y-14,11,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(x-7,y-9);ctx.lineTo(x+7,y-9);ctx.lineTo(x,y);ctx.closePath();ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(num,x,y-14);ctx.restore();}
  $('mmOk').addEventListener('click',function(){const {w:W,h:H}=mapSize();const z=mp.zoom,c=project(mp.lat,mp.lng,z),tl={x:c.x-W/2,y:c.y-H/2},n=Math.pow(2,z);
    const cv=document.createElement('canvas');cv.width=W;cv.height=H;const ctx=cv.getContext('2d');ctx.fillStyle='#E8EBF0';ctx.fillRect(0,0,W,H);
    const tx0=Math.floor(tl.x/256),tx1=Math.floor((tl.x+W)/256),ty0=Math.floor(tl.y/256),ty1=Math.floor((tl.y+H)/256);let ok=0;const jobs=[];
    for(let tx=tx0;tx<=tx1;tx++)for(let ty=ty0;ty<=ty1;ty++){if(ty<0||ty>=n)continue;const wx=((tx%n)+n)%n;
      jobs.push(new Promise(res=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>{try{ctx.drawImage(img,tx*256-tl.x,ty*256-tl.y,256,256);ok++;}catch(e){}res();};img.onerror=()=>res();img.src=tileURL(z,wx,ty);}));}
    $('mmOk').disabled=true;$('mmHint').textContent='擷取中…';
    Promise.all(jobs).then(()=>{$('mmOk').disabled=false;
      if(!ok){$('mmHint').textContent='地圖載入失敗（需連網，或圖磚被擋）';return;}
      mp.pins.forEach((p,i)=>{const pp=project(p.lat,p.lng,z);drawPin(ctx,pp.x-tl.x,pp.y-tl.y,i+1);});
      ctx.fillStyle='rgba(255,255,255,.85)';ctx.fillRect(0,H-20,W,20);ctx.fillStyle='#333';ctx.font='11px sans-serif';ctx.textAlign='left';ctx.fillText('© OpenStreetMap contributors · openstreetmap.org/copyright',8,H-6);
      let url;try{url=cv.toDataURL('image/jpeg',0.85);}catch(err){$('mmHint').textContent='擷取失敗：此圖磚不允許跨來源擷取';return;}
      closeMapModal();placeMapImage(url,W,H);});});

  // ============ AI INBOX ============
  let inboxHandle=null,inboxCards=[],inboxApproved=0,inboxSourceId=null;
  const INBOX_FSA_KEY='inboxHandle';
  function inboxSchemaText(){return `## AI 收件匣寫入格式說明（whiteboard-inbox.json）\n\n━━ 重要規則 ━━\n・請先讀取現有檔案，只在 inbox 陣列末尾「新增」項目\n・不要刪除或覆蓋現有項目（使用者審核後會自行移除）\n・若檔案不存在，從 {"version":1,"inbox":[]} 開始建立\n\n━━ JSON 格式 ━━\n{\n  "version": 1,\n  "inbox": [\n    {\n      "id": "唯一字串（8-12位英數，不可重複）",\n      "title": "卡片標題",\n      "blocks": [\n        {\n          "id": "唯一字串",\n          "type": "text",\n          "html": "內文（支援 <b>粗體</b> <i>斜體</i> <a href=\\"https://\\">連結</a>）",\n          "checked": false,\n          "src": ""\n        }\n      ],\n      "tags": ["標籤"],\n      "color": "amber",\n      "shape": "note",\n      "aiNote": "給使用者看的說明，不會出現在白板上",\n      "addedAt": ${Date.now()}\n    }\n  ]\n}\n\n━━ blocks type 選項 ━━\ntext h1 h2 h3  bullet number todo  quote callout code divider\n（todo 的 checked:true 代表已完成）\n\n━━ color 選項 ━━\npaper amber sage blue rose lavender grey\n\n━━ shape 選項 ━━\nnote（圓角預設） rect（直角） pill（膠囊）`;}
  function updateInboxBadge(){const b=$('ibBadge');if(!b)return;const n=inboxCards.length;b.style.display=n?'':'none';b.textContent=n;}
  const inboxQueue=Core.serial();
  let inboxBusy=false;
  async function linkInboxFile(){if(!FSA){showBanner('需要桌面版 Chrome 或 Edge 才能連結收件匣檔案。');return;}
    try{const[h]=await window.showOpenFilePicker({types:[{description:'JSON 收件匣',accept:{'application/json':['.json']}}]});
      const cards=Core.inbox(await (await h.getFile()).text());const previous=await idbGet(INBOX_FSA_KEY),previousId=await idbGet('inboxSourceId');
      const sourceId=previous&&previousId&&await h.isSameEntry(previous)?previousId:uid();
      await idbSet(INBOX_FSA_KEY,h);await idbSet('inboxSourceId',sourceId);inboxSourceId=sourceId;inboxHandle=h;inboxCards=cards;updateInboxBadge();renderInboxPanel();showBanner('已連結收件匣「'+h.name+'」');}catch(e){if(e.name!=='AbortError')reportError(e);}}
  async function readInbox(){if(!inboxHandle)return false;
    try{if(!await ensurePerm(inboxHandle))throw new Error('請重新授權收件匣檔案');inboxCards=Core.inbox(await (await inboxHandle.getFile()).text());updateInboxBadge();return true;}catch(e){reportError(e);return false;}}
  function inboxDropPos(){let maxX=0;state.cards.forEach(c=>{const el=cardEls.get(c.id);maxX=Math.max(maxX,c.x+(el?el.offsetWidth:240));});return{x:(state.cards.length?maxX+80:200),y:80+inboxApproved*200};}
  async function reviewCard(card,approve){return inboxQueue(async()=>{
    if(inboxBusy||transitioning)return;inboxBusy=true;document.body.inert=true;
    try{
      const drive=!!gdInboxFileId;
      if(drive&&!gdReady())throw new Error('請先重新登入 Drive');
      const handle=inboxHandle, fileId=gdInboxFileId;
      const source=(drive?'drive:'+fileId:'file:'+inboxSourceId)+':'+card.id;
      let raw,etag;
      if(drive){const r=await gdFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);raw=await r.text();etag=r.headers.get('etag');}
      else{if(!handle||!await ensurePerm(handle))throw new Error('請重新連結收件匣');raw=await(await handle.getFile()).text();}
      const latest=Core.inbox(raw);const current=latest.find(c=>c.id===card.id);
      if(!current){inboxCards=latest;return;}
      if(JSON.stringify(current)!==JSON.stringify(card))throw new Error('這張待審卡已被更新，請重新開啟收件匣後審核');
      await Core.backup({board:state,inbox:Core.parse(raw)},'審核前備份');
      if(approve&&!state.cards.some(c=>c.sourceInbox===source)){
        const pos=inboxDropPos();inboxApproved++;
        const c={...current,id:uid(),x:pos.x,y:pos.y,tags:[...new Set([...current.tags,'AI新增'])],collapsed:false,createdAt:now(),updatedAt:now(),sourceInbox:source};
        state.cards.push(c);makeCardEl(c);updateHint();scheduleSave();save();
      }
      // Save the destination first. Retry is idempotent through sourceInbox.
      if(approve){if(drive){if(!await gdWriteFile())throw new Error('白板尚未存入 Drive，待審卡已保留');}
        else if(syncHandle){if(!await writeSyncFile())throw new Error('白板尚未存入同步檔，待審卡已保留');}
        else if(!localSaved)throw new Error('白板尚未保存，待審卡已保留');}
      // Re-read immediately before removing only this item, preserving new arrivals.
      let newestRaw;
      if(drive){const r=await gdFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);newestRaw=await r.text();etag=r.headers.get('etag');}
      else newestRaw=await(await handle.getFile()).text();
      const newest=Core.inbox(newestRaw),item=newest.find(c=>c.id===card.id);
      if(item&&JSON.stringify(item)!==JSON.stringify(current))throw new Error('待審卡已更新，原項目已保留');
      const remaining=newest.filter(c=>c.id!==card.id),body=JSON.stringify({version:1,inbox:remaining});
      if(drive){await gdFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json',...(etag?{'If-Match':etag}:{})},body});}
      else{const w=await handle.createWritable();await w.write(body);await w.close();}
      inboxCards=remaining;
    }catch(e){reportError(e);}finally{resetHistory();inboxBusy=false;document.body.inert=false;updateInboxBadge();renderInboxPanel();}
  });}
  const approveCard=card=>reviewCard(card,true);
  const rejectCard=id=>{const card=inboxCards.find(c=>c.id===id);return card?reviewCard(card,false):Promise.resolve();};

  function renderInboxPanel(){const list=$('ibList'),empty=$('ibEmpty'),foot=$('ibFoot'),cnt=$('ibCnt');
    cnt.textContent=inboxCards.length?' · '+inboxCards.length+' 張待審':'';
    if(!inboxCards.length){list.replaceChildren();empty.style.display='';list.style.display='none';foot.style.display='none';
      if(gdReady()&&gdInboxFileId) empty.innerHTML='<div>✓ 收件匣是空的，目前沒有待審卡片。</div>';
      else if(gdReady()&&!gdInboxFileId) empty.innerHTML='<div>請先從「☁ Drive」選取一個白板，收件匣會自動連結。</div>';
      else if(inboxHandle) empty.innerHTML='<div>✓ 收件匣是空的，目前沒有待審卡片。</div>';
      else empty.innerHTML='<div>尚未連結收件匣檔案。<br><br>請點右上角「連結收件匣檔案」，選取你的 <b>whiteboard-inbox.json</b>。<br>點「複製格式說明」可取得給 AI 的完整指引。</div>';
      return;}
    empty.style.display='none';list.style.display='';foot.style.display='';
    list.innerHTML='';inboxCards.forEach(card=>{const lbl=cardLabel(card);const prev=blocksText(card.blocks).trim().slice(0,80);
      const el=document.createElement('div');el.className='ib-card';
      el.innerHTML='<div class="ib-ct"><span class="ib-cdot" style="background:'+COLORS[card.color].bg+';border:1px solid '+COLORS[card.color].border+'"></span>'+
        '<span class="ib-title">'+escapeHtml(lbl.text)+'</span></div>'+
        (prev?'<div class="ib-prev">'+escapeHtml(prev)+(prev.length>=80?'…':'')+'</div>':'')+
        (card.aiNote?'<div class="ib-note">💬 '+escapeHtml(card.aiNote)+'</div>':'')+
        (card.tags.length?'<div class="ib-tags">'+card.tags.map(t=>'<span class="ib-tag">#'+escapeHtml(t)+'</span>').join('')+'</div>':'')+
        '<div class="ib-acts"><button class="ib-ok">✓ 核准加入白板</button><button class="ib-no">✗ 刪除</button></div>';
      el.querySelector('.ib-ok').addEventListener('click',()=>{approveCard(card);renderInboxPanel();});
      el.querySelector('.ib-no').addEventListener('click',()=>{rejectCard(card.id);renderInboxPanel();});
      list.appendChild(el);});}
  function openInboxModal(){$('inboxModal').classList.add('open');updateInboxLink();
    const doRead=gdInboxFileId?gdReadInbox():readInbox();
    doRead.then(()=>{updateInboxBadge();renderInboxPanel();});}
  function closeInboxModal(){$('inboxModal').classList.remove('open');}
  $('ibClose').addEventListener('click',closeInboxModal);
  $('inboxModal').addEventListener('pointerdown',e=>{if(e.target.id==='inboxModal')closeInboxModal();});
  $('ibSchema').addEventListener('click',e=>copyText(inboxSchemaText(),e.currentTarget));
  $('ibSchemaDl').addEventListener('click',()=>{const blob=new Blob([inboxSchemaText()],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='收件匣格式說明.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
  function updateInboxLink(){const btn=$('ibLink');
    if(gdCurrentFileName){btn.textContent=gdCurrentFileName.replace(/\.json$/,'')+' inbox';btn.style.cursor='default';btn.title='Drive 模式：收件匣已自動對應當前白板';}
    else if(gdReady()&&!gdCurrentFileName){btn.textContent='請先選白板';btn.style.cursor='default';btn.title='';}
    else{btn.textContent='連結收件匣檔案';btn.style.cursor='';btn.title='';}}
  $('ibLink').addEventListener('click',()=>{if(!gdCurrentFileId)linkInboxFile();});
  $('ibApproveAll').addEventListener('click',async()=>{for(const c of [...inboxCards])await approveCard(c);});
  $('btnInbox').addEventListener('click',openInboxModal);
  async function restoreInbox(){try{const h=await idbGet(INBOX_FSA_KEY);if(h&&!gdCurrentFileId&&!inboxBusy){inboxHandle=h;inboxSourceId=await idbGet('inboxSourceId')||uid();await idbSet('inboxSourceId',inboxSourceId);updateInboxLink();}}catch(e){reportError(e);}}

  // ============ GOOGLE DRIVE SYNC ============
  const GD_CLIENT_ID='1095634620472-blghk96rqsjbusfob1hpgstf88qoaunb.apps.googleusercontent.com';
  const GD_SCOPE='https://www.googleapis.com/auth/drive.file';
  const GD_FOLDER='聚思白板';
  let gdToken=null,gdUser=null,gdFolderId=null,gdCurrentFileId=null,gdCurrentFileName=null,gdInboxFileId=null;
  let gdWriteTimer=null,gdRefreshTimer=null,gdBaseline=null,gdConflict=false,gdLastSavedAt=null,gdSaving=false,gdError='';
  const driveQueue=Core.serial();
  const fileURL=id=>`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`;
  const uploadURL=id=>`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media`;
  const scheduleGdWrite=()=>{clearTimeout(gdWriteTimer);gdWriteTimer=setTimeout(()=>{if(!gdConflict)gdWriteFile();},1200);};
  function gdReady(){return !!(gdToken?.access_token&&gdUser?.permissionId);}
  function gdInboxName(name){return name.replace(/\.json$/,'')+'-inbox.json';}
  async function gdFetch(url,opts={}){
    try{return await Core.request(url,opts,gdToken?.access_token);}
    catch(e){if(e.status===401){gdAuthLost();}throw e;}
  }
  let gdLoginBusy=false;
  function gdAuthLost(){
    if(saveTimer)save();gdToken=null;clearTimeout(gdRefreshTimer);clearTimeout(gdWriteTimer);
    updateDriveBtn();updateSaveStatus();
    if(gdCurrentFileId){homeRoute='drive';closeMenu();setMobileMore(false);closePanel();home.hidden=false;$('app').inert=true;renderHome();$('homeContinue').focus();}
    else if(!home.hidden)renderHome();
  }
  async function stashAccountRecovery(){
    const meta=currentWorkspace();if(!meta.ownerId||!meta.id)return;
    await Core.set('drive-recovery:'+meta.ownerId,{meta:{...meta,kind:'cache'},state:structuredClone(state)});
    await Core.backup({meta,state},'切換 Google 帳號前');
  }
  function gdLogin(){
    if(gdLoginBusy)return;
    if(!window.google?.accounts?.oauth2){showBanner('Google 登入服務載入中，請稍後再試。');return;}
    if(saveTimer)save();gdLoginBusy=true;
    const client=google.accounts.oauth2.initTokenClient({client_id:GD_CLIENT_ID,scope:GD_SCOPE,prompt:'select_account',
      callback:async resp=>{
        try{
          if(resp.error||!resp.access_token)throw new Error('Google 登入失敗，請重試');
          // Identity must be known before restoring any Drive binding or starting writes.
          const data=await(await Core.request('https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress,displayName)',{},resp.access_token)).json();
          if(!data.user?.permissionId)throw new Error('無法確認 Google 帳號，已停止連線');
          const previous=currentWorkspace();
          if(previous.ownerId&&previous.ownerId!==data.user.permissionId){
            await stashAccountRecovery();clearDriveBinding();state=normalize({cards:[]});workspaceMeta={kind:'local',name:'本機白板'};resetScene();
          }
          gdToken=resp;gdUser=data.user;gdFolderId=null;clearTimeout(gdRefreshTimer);
          if(!gdCurrentFileId&&workspaceMeta.kind!=='cache'){
            const record=await Core.get('drive-recovery:'+gdUser.permissionId);
            if(record?.meta?.ownerId===gdUser.permissionId&&record.state){await archiveLocalWorkspace();state=normalize(record.state);workspaceMeta={...record.meta,kind:'cache'};resetScene();}
          }
          gdRefreshTimer=setTimeout(()=>{gdAuthLost();showBanner('Google 授權已到期，雲端白板已暫停編輯。請重新登入。');},Math.max(1000,(Number(resp.expires_in)||3600)*1000));
          homeRoute='drive';updateDriveBtn();updateSaveStatus();if(home.hidden){if(canEditWorkspace())openDriveModal();else openHome();}else renderHome();
        }catch(e){gdToken=null;gdUser=null;updateDriveBtn();updateSaveStatus();reportError(e);}finally{gdLoginBusy=false;}
      },error_callback:()=>{gdLoginBusy=false;showBanner('Google 授權未完成，請重新登入');}});
    client.requestAccessToken({prompt:'select_account'});
  }
  async function gdLogout(){
    const ok=await transition(async()=>{
      await stashAccountRecovery();clearTimeout(gdRefreshTimer);gdToken=null;gdUser=null;gdFolderId=null;clearDriveBinding();
      if(workspaceMeta.kind!=='local'){state=normalize({cards:[]});workspaceMeta={kind:'local',name:'本機白板'};resetScene();}
      updateDriveBtn();closeDriveModal();
    });if(ok){homeRoute='drive';openHome();}
  }
  $('homeSwitchAccount').addEventListener('click',async()=>{await gdLogout();if(!gdReady())gdLogin();});
  function clearDriveBinding(){resetHistory();clearTimeout(gdWriteTimer);gdCurrentFileId=null;gdCurrentFileName=null;gdInboxFileId=null;gdBaseline=null;gdDirty=false;gdConflict=false;gdError='';gdLastSavedAt=null;inboxCards=[];updateInboxBadge();updateSaveStatus();}
  async function detachSources(){await unlinkSync();clearDriveBinding();updateDriveBtn();updateInboxLink();}
  async function gdList(q,fields='id,name'){
    const files=[];let pageToken='';
    do{const params=new URLSearchParams({q,fields:`nextPageToken,files(${fields})`,pageSize:'100',orderBy:'modifiedTime desc'});if(pageToken)params.set('pageToken',pageToken);
      const data=await(await gdFetch('https://www.googleapis.com/drive/v3/files?'+params)).json();files.push(...(data.files||[]));pageToken=data.nextPageToken||'';
    }while(pageToken);return files;
  }
  async function gdEnsureFolder(){
    if(gdFolderId)return gdFolderId;const owner=gdUser?.permissionId;
    const folders=await gdList(`name='${Core.queryValue(GD_FOLDER)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    if(!gdReady()||gdUser.permissionId!==owner)throw new Error('Google 帳號已變更');
    if(folders.length>1)throw new Error('Drive 有多個「聚思白板」資料夾，請先整理後重試');
    if(folders.length){gdFolderId=folders[0].id;return gdFolderId;}
    const data=await(await gdFetch('https://www.googleapis.com/drive/v3/files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:GD_FOLDER,mimeType:'application/vnd.google-apps.folder'})})).json();
    if(!gdReady()||gdUser.permissionId!==owner)throw new Error('Google 帳號已變更');
    if(!data.id)throw new Error('Drive 資料夾建立失敗');gdFolderId=data.id;return data.id;
  }
  async function gdListBoards(){const folder=await gdEnsureFolder();return(await gdList(`'${Core.queryValue(folder)}' in parents and mimeType='application/json' and trashed=false`,'id,name,modifiedTime,appProperties')).filter(f=>!f.name.endsWith('-inbox.json')&&f.appProperties?.juiceType!=='inbox');}
  async function gdReadFile(fileId){return(await gdFetch(fileURL(fileId)+'?alt=media')).text();}
  async function gdWriteFile(){
    return driveQueue(async()=>{
      if(!gdCurrentFileId)return false;if(!gdReady()||workspaceMeta.ownerId!==gdUser.permissionId){gdError='請使用原本的 Google 帳號重新登入';updateSaveStatus();return false;}if(!gdDirty)return true;
      const fileId=gdCurrentFileId,owner=gdUser.permissionId,token=gdToken.access_token,version=editVersion,body=JSON.stringify(state);
      gdSaving=true;gdError='';updateSaveStatus();
      try{
        if(gdConflict)throw new Error('同步衝突尚未處理。請先匯出目前白板，再重新開啟遠端白板');
        const r=await gdFetch(fileURL(fileId)+'?alt=media'),remote=await r.text(),etag=r.headers.get('etag');
        // Always preserve both candidates before any overwrite, including legacy files.
        await Core.backup({local:Core.parse(body),remote:Core.parse(remote),fileId},'Drive 寫入前');
        if(gdBaseline===null||remote!==gdBaseline){gdConflict=true;throw new Error('其他裝置已修改此白板，已停止覆寫。請匯出目前內容後，重新開啟遠端白板');}
        if(!gdReady()||gdUser.permissionId!==owner||gdToken.access_token!==token||gdCurrentFileId!==fileId)throw new Error('Google 連線已變更，已停止寫入');
        await gdFetch(uploadURL(fileId),{method:'PATCH',headers:{'Content-Type':'application/json',...(etag?{'If-Match':etag}:{})},body});
        gdBaseline=body;gdLastSavedAt=now();if(editVersion===version)gdDirty=false;
        persistLocalOnly();if(gdDirty)scheduleGdWrite();return true;
      }catch(e){if(e.status===412)gdConflict=true;gdError=e.message;reportError(e);return false;}
      finally{gdSaving=false;updateSaveStatus();}
    });
  }
  async function gdFindInboxFile(boardName,boardId=gdCurrentFileId){
    const folder=await gdEnsureFolder(),base=`'${Core.queryValue(folder)}' in parents and mimeType='application/json' and trashed=false`;
    let files=boardId?await gdList(`${base} and appProperties has { key='juiceBoardId' and value='${Core.queryValue(boardId)}' }`):[];
    if(!files.length)files=(await gdList(`${base} and name='${Core.queryValue(gdInboxName(boardName))}'`,'id,name,appProperties')).filter(f=>!f.appProperties?.juiceBoardId||f.appProperties.juiceBoardId===boardId);
    if(files.length>1)throw new Error('找到多份同名收件匣，請先整理後重試');return files[0]?.id||null;
  }
  async function gdCreateJSON(name,value,properties={}){
    const owner=gdUser?.permissionId,folder=await gdEnsureFolder(),form=new FormData();
    if(!gdReady()||gdUser.permissionId!==owner)throw new Error('Google 帳號已變更');
    form.append('metadata',new Blob([JSON.stringify({name,parents:[folder],mimeType:'application/json',appProperties:properties})],{type:'application/json'}));
    form.append('media',new Blob([JSON.stringify(value)],{type:'application/json'}));
    const data=await(await gdFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{method:'POST',body:form})).json();
    if(!data.id)throw new Error('Drive 檔案建立失敗');return data;
  }
  async function gdCreateInboxFile(name,boardId){return(await gdCreateJSON(gdInboxName(name),{version:1,inbox:[]},{juiceType:'inbox',juiceBoardId:boardId})).id;}
  async function gdReadInbox(){
    if(!gdInboxFileId)return false;
    try{inboxCards=Core.inbox(await gdReadFile(gdInboxFileId));updateInboxBadge();return true;}catch(e){reportError(e);return false;}
  }
  async function gdCreateBoard(name){
    if(name.endsWith('-inbox'))throw new Error('白板名稱不能以 -inbox 結尾');
    if((await gdListBoards()).some(b=>b.name===name+'.json'))throw new Error('已有同名白板，請使用其他名稱');
    const empty=normalize({cards:[]});empty.savedAt=now();return gdCreateJSON(name+'.json',empty,{juiceType:'board'});
  }
  async function gdDeleteBoard(fileId,fileName){
    const inboxId=await gdFindInboxFile(fileName,fileId);
    // Trash rather than permanently delete; recoverable from Drive Trash.
    for(const id of [fileId,inboxId].filter(Boolean))await gdFetch(fileURL(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})});
    if(gdCurrentFileId===fileId){clearDriveBinding();updateDriveBtn();}
  }
  async function gdLoadBoard(fileId,fileName){
    if(transitioning||inboxBusy)return false;
    // A conflict can only be discarded explicitly, after a recovery snapshot exists.
    if(gdConflict&&gdCurrentFileId===fileId){
      await Core.backup(state,'使用者重載衝突白板前');
      if(!confirm('目前內容已保留復原快照。要放棄尚未同步的編輯，重新載入 Drive 版本嗎？'))return false;
      gdDirty=false;gdConflict=false;
    }
    return transition(async()=>{
      const owner=gdUser?.permissionId;if(!gdReady())throw new Error('請先登入 Google');
      const raw=await gdReadFile(fileId),next=normalize(Core.parse(raw));
      if(workspaceMeta.kind==='cache'&&workspaceMeta.pending!==false&&(!workspaceMeta.ownerId||workspaceMeta.ownerId===owner)){
        if(!await compareRecovery(next,fileName.replace(/\.json$/,'')))throw new Error('已取消開啟，備份仍保留');
      }
      if(!gdReady()||gdUser.permissionId!==owner)throw new Error('Google 帳號已變更，請重新選取白板');
      let inboxId=await gdFindInboxFile(fileName,fileId);if(!inboxId)inboxId=await gdCreateInboxFile(fileName,fileId);
      const cards=Core.inbox(await gdReadFile(inboxId));
      if(!gdReady()||gdUser.permissionId!==owner)throw new Error('Google 帳號已變更，已停止開啟');
      await unlinkSync(); // A Drive board must never inherit a local file destination.
      state=next;workspaceMeta={kind:'drive',name:fileName.replace(/\.json$/,''),id:fileId,ownerId:owner,pending:false};gdCurrentFileId=fileId;gdCurrentFileName=fileName;gdInboxFileId=inboxId;gdBaseline=raw;
      gdDirty=false;gdConflict=false;gdError='';gdLastSavedAt=null;editVersion++;inboxCards=cards;
      resetScene();updateDriveBtn();updateInboxLink();updateInboxBadge();updateSaveStatus();showBanner('已載入白板「'+fileName.replace(/\.json$/,'')+'」');
    });
  }
  function updateConnectionStatus(){
    const ready=gdReady(),bound=!!gdCurrentFileId;
    const connection=ready?'Google 已連線':bound?'Google 授權已到期':'Google 未連線';
    const storage=bound?(!ready?'此白板暫停同步':gdSaving?'此白板同步中…':gdConflict?'此白板同步衝突':gdError?'此白板同步失敗':gdDirty?'此白板待同步':'此白板已同步 Drive')
      :syncHandle?'此白板使用同步檔':workspaceMeta.kind==='cache'?'此白板是本機副本，未同步 Drive':'此白板僅存本機';
    const text=connection+' · '+storage;
    const action=!ready?(bound||workspaceMeta.kind==='cache'?'重新登入 Google':'登入 Google'):!bound?'選擇 Drive 白板':gdConflict?'查看 Drive 白板':gdError||gdDirty?'立即同步':'管理 Drive';
    $('connectionText').textContent=text;$('homeConnectionText').textContent=homeRoute==='drive'&&!bound?connection+' · 尚未開啟雲端白板':text;
    $('connectionAction').textContent=action;$('homeConnectionAction').textContent=action;
    const detail=bound?'此白板已連結 Google Drive；授權有效時會自動同步。':'登入後還需要選取 Drive 白板，才會啟用這張雲端白板的同步。繼續編輯本機副本只會儲存在此瀏覽器。';
    $('connectionStatus').title=detail;$('homeConnectionText').title=detail;
  }
  function connectionAction(){
    if(!gdReady()){gdLogin();return;}
    if(gdCurrentFileId&&!gdConflict&&(gdError||gdDirty)){$('btnSaveNow').click();return;}
    if(home.hidden)openDriveModal();else $('homeDriveList').scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  $('connectionAction').addEventListener('click',connectionAction);
  $('homeConnectionAction').addEventListener('click',connectionAction);
  function updateDriveBtn(){
    const meta=currentWorkspace(),name=meta.name||'本機白板';
    $('driveBtnLbl').textContent=gdReady()?'Google 已連線':gdCurrentFileId?'Google 需重新登入':'登入 Google';
    updateConnectionStatus();
    const location=meta.kind==='local'?'（本機）':meta.kind==='cache'?'（本機副本）':meta.kind==='file'?'（同步檔）':'';
    $('boardName').textContent='· '+name+location;document.title=name+' · 聚思';
    $('driveAvatar').style.display='none';$('driveCloudIcon').style.display='';
  }
  async function renderDriveModal(){
    $('drvLogin').style.display=gdReady()?'none':'';$('drvLoggedIn').style.display=gdReady()?'':'none';if(!gdReady())return;
    $('drvUserRow').textContent='目前帳號：'+(gdUser.emailAddress||gdUser.displayName);const list=$('drvBoardList');list.textContent='載入中…';
    try{const boards=await gdListBoards();list.replaceChildren();if(!boards.length)list.textContent='尚無白板，請新增白板。';
      for(const b of boards){const row=document.createElement('div');row.className='drv-board'+(gdCurrentFileId===b.id?' active':'');
        const label=document.createElement('div');label.className='drv-board-name';label.textContent=b.name.replace(/\.json$/,'');
        const meta=document.createElement('div');meta.className='drv-board-meta';meta.textContent=new Date(b.modifiedTime).toLocaleString()+' 修改';
        const info=document.createElement('div');info.append(label,meta);const del=document.createElement('button');del.className='drv-board-del';del.textContent='🗑';del.title='移到 Drive 垃圾桶';row.append(info,del);
        del.addEventListener('click',async e=>{e.stopPropagation();if(!confirm('將白板「'+b.name+'」與收件匣移到 Drive 垃圾桶？'))return;
          await transition(()=>gdDeleteBoard(b.id,b.name));renderDriveModal();});
        row.addEventListener('click',async()=>{try{if(await gdLoadBoard(b.id,b.name))closeDriveModal();}catch(e){reportError(e);}});list.appendChild(row);
      }
    }catch(e){list.textContent='載入失敗，請關閉後重試。';reportError(e);}
  }
  function openDriveModal(){$('driveModal').classList.add('open');renderDriveModal();}
  function closeDriveModal(){$('driveModal').classList.remove('open');if(home.hidden&&!canEditWorkspace()){homeRoute='drive';openHome();}}
  $('drvClose').addEventListener('click',closeDriveModal);
  $('driveModal').addEventListener('pointerdown',e=>{if(e.target.id==='driveModal')closeDriveModal();});
  $('drvLoginBtn').addEventListener('click',gdLogin);$('drvLogout').addEventListener('click',gdLogout);
  $('btnDrive').addEventListener('click',()=>{if(gdReady())openDriveModal();else gdLogin();});
  $('drvNewBoard').addEventListener('click',async()=>{
    const name=prompt('白板名稱：','新白板')?.trim();if(!name)return;if(name.length>200){showBanner('白板名稱請限制在 200 字內');return;}
    let file;const ok=await transition(async()=>{file=await gdCreateBoard(name);});if(ok&&await gdLoadBoard(file.id,name+'.json'))closeDriveModal();
  });
  function fmtAgo(ts){if(!ts)return '尚未寫入 Drive';const seconds=Math.floor((now()-ts)/1000);return seconds<10?'剛剛儲存':seconds<60?seconds+'秒前儲存':Math.floor(seconds/60)+'分鐘前儲存';}
  function updateSaveStatus(){
    const active=!!gdCurrentFileId;$('saveStatus').style.display=active?'':'none';$('btnSaveNow').style.display=active?'':'none';
    $('btnSaveNow').classList.toggle('saving',gdSaving);$('btnSaveNow').disabled=gdSaving;
    $('saveStatus').textContent=!gdReady()?'需重新登入':gdSaving?'儲存中…':gdConflict?'同步衝突':gdError?'同步失敗，請重試':gdDirty?'尚未同步':fmtAgo(gdLastSavedAt);updateMobileStatus();updateConnectionStatus();
  }
  $('btnSaveNow').addEventListener('click',async()=>{if(!gdReady()){gdLogin();return;}if(saveTimer)save();if(await gdWriteFile())showBanner('已儲存到 Drive ✓');});
  setInterval(updateSaveStatus,30000);

  // ============ LOCAL JSON SYNC ============
  const FSA=!!(window.showOpenFilePicker&&window.showSaveFilePicker);
  const idbGet=Core.get,idbSet=Core.set,idbDel=Core.del;
  let fileWriteTimer=null,fileBaseline=null,fileConflict=false;
  const fileQueue=Core.serial();
  async function ensurePerm(h){if(!h)return false;try{const options={mode:'readwrite'};return await h.queryPermission(options)==='granted'||await h.requestPermission(options)==='granted';}catch(e){return false;}}
  function updateSyncBtn(status){const dot=$('syncDot');if(dot)dot.style.background=status==='ok'?'#5BB97E':status==='need'?'#E0A82E':status==='error'?'#D2453E':'#C2C8D2';}
  const scheduleFileWrite=()=>{clearTimeout(fileWriteTimer);fileWriteTimer=setTimeout(()=>writeSyncFile(),800);};
  async function writeSyncFile(){return fileQueue(async()=>{
    if(!syncHandle)return false;if(!fileDirty)return true;
    const handle=syncHandle,version=editVersion,body=JSON.stringify(state);
    try{
      if(fileConflict)throw new Error('同步檔發生衝突。請匯出目前內容後，解除連結並重新開啟檔案');
      if(!await ensurePerm(handle)){syncReady=false;updateSyncBtn('need');throw new Error('請重新授權同步檔案');}
      const raw=await(await handle.getFile()).text();
      await Core.backup({local:Core.parse(body),remote:raw?Core.parse(raw):null,fileName:handle.name},'同步檔寫入前');
      if(fileBaseline===null||raw!==fileBaseline){fileConflict=true;throw new Error('同步檔已被其他裝置修改，已停止覆寫；兩份內容已保留復原備份');}
      const writer=await handle.createWritable();await writer.write(body);await writer.close();fileBaseline=body;
      if(editVersion===version)fileDirty=false;else scheduleFileWrite();updateSyncBtn('ok');return true;
    }catch(e){updateSyncBtn('error');reportError(e);return false;}
  });}
  async function readAndMaybeLoad(){
    if(!syncHandle||transitioning||inboxBusy)return false;lastRead=now();
    try{
      if(!await ensurePerm(syncHandle)){syncReady=false;updateSyncBtn('need');return false;}syncReady=true;
      const raw=await(await syncHandle.getFile()).text();if(raw===fileBaseline){if(fileDirty)return writeSyncFile();return true;}
      if(fileDirty){await Core.backup({local:state,remote:Core.parse(raw)},'同步檔衝突');fileConflict=true;throw new Error('同步檔與目前編輯不同，已停止載入及覆寫，請匯出目前內容');}
      const next=normalize(Core.parse(raw));await Core.backup(state,'載入同步檔前');
      // Changes may have happened during the read/backup.
      if(fileDirty)throw new Error('讀取時有新編輯，請稍後重新同步');
      state=next;fileBaseline=raw;fileConflict=false;editVersion++;resetScene();updateSyncBtn('ok');return true;
    }catch(e){updateSyncBtn('error');reportError(e);return false;}
  }
  async function linkNewFile(){
    if(!FSA){showBanner('此瀏覽器不支援連結同步檔，請用桌面版 Chrome 或 Edge。');return;}
    try{const handle=await window.showSaveFilePicker({suggestedName:'whiteboard-sync.json',types:[{description:'JSON',accept:{'application/json':['.json']}}]});
      await transition(async()=>{
        const raw=await(await handle.getFile()).text();if(raw)throw new Error('此檔案已有內容，請使用「連結現有同步檔」，避免覆蓋');
        await detachSources();syncHandle=handle;workspaceMeta={kind:'file',name:handle.name};syncReady=true;fileBaseline=raw;fileDirty=true;state.savedAt=now();
        if(!await writeSyncFile())throw new Error('同步檔建立失敗，請重試');await idbSet('syncHandle',handle);persistLocalOnly();updateDriveBtn();showBanner('已建立同步檔「'+handle.name+'」。跨裝置使用需將檔案放在雲端同步資料夾。');
      });
    }catch(e){if(e.name!=='AbortError')reportError(e);}
  }
  async function linkExistingFile(){
    if(!FSA){showBanner('此瀏覽器不支援連結同步檔，請用桌面版 Chrome 或 Edge。');return;}
    try{const[handle]=await window.showOpenFilePicker({types:[{description:'JSON',accept:{'application/json':['.json']}}]});
      await transition(async()=>{const raw=await(await handle.getFile()).text(),next=normalize(Core.parse(raw));
        if(!await ensurePerm(handle))throw new Error('請授權同步檔');await detachSources();
        syncHandle=handle;syncReady=true;fileBaseline=raw;fileDirty=false;state=next;workspaceMeta={kind:'file',name:handle.name};editVersion++;await idbSet('syncHandle',handle);resetScene();updateSyncBtn('ok');showBanner('已載入同步檔「'+handle.name+'」');
      });
    }catch(e){if(e.name!=='AbortError')reportError(e);}
  }
  async function reconnectSync(){
    if(!syncHandle)return;
    if(await readAndMaybeLoad())showBanner('同步檔已連結');
  }
  async function syncNow(){if(saveTimer)save();if(await readAndMaybeLoad()&&fileDirty)await writeSyncFile();}
  async function unlinkSync(){clearTimeout(fileWriteTimer);syncHandle=null;syncReady=false;fileBaseline=null;fileDirty=false;fileConflict=false;await idbDel('syncHandle');updateSyncBtn('none');}
  $('btnSync').addEventListener('click',function(){const r=this.getBoundingClientRect(),items=[];
    if(!FSA){showMenu([{label:'此瀏覽器不支援，請用 Chrome／Edge'}],r.left,r.bottom+4,'跨裝置同步');return;}
    if(!syncHandle){items.push({icon:'＋',label:'建立新的同步檔',onClick:linkNewFile},{icon:'⇄',label:'連結現有同步檔',onClick:linkExistingFile});}
    else{items.push({icon:'⟳',label:syncReady?'立即同步':'重新連結並同步',onClick:syncReady?syncNow:reconnectSync});
      items.push({sep:true},{icon:'✕',label:'解除連結（保留目前白板）',danger:true,onClick:async()=>{
        try{if(saveTimer)save();await Core.backup(state,'解除同步檔前');await fileQueue(async()=>{});await unlinkSync();}catch(e){reportError(e);}
      }});
    }
    showMenu(items,r.left,r.bottom+4,syncHandle?'同步檔：'+syncHandle.name:'設定同步（單人跨裝置）');
  });
  window.addEventListener('focus',()=>{if(syncReady&&now()-lastRead>1500)readAndMaybeLoad();});
  async function restoreSync(){
    if(!FSA)return;try{const handle=await idbGet('syncHandle');if(handle){
      // Do not silently replace a cached board on reload. Explicitly reopen it.
      showBanner('上次同步檔為「'+handle.name+'」。目前保留本機內容，請由同步選單重新連結檔案。');
    }}catch(e){reportError(e);}
  }

  // ---------- init ----------
  buildCardbar();load();buildScene();resetHistory();
  if(!state.cards.length){state.view={x:40,y:40,zoom:1};applyView();}
  state.boardId=state.boardId||uid();idleStatus();updateDriveBtn();
  if(loadFailed){world.inert=true;panel.inert=true;}
  updateMobileLayout();restoreSync();restoreInbox();openHome();
})();
