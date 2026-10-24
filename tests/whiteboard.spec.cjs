const {test,expect}=require('@playwright/test');
const fs=require('fs');
const omgExample=require('./fixtures/ORDER-MIDDLE-OMG-v2-example.json');
const omgMermaid=fs.readFileSync(require.resolve('./fixtures/ORDER-MIDDLE-OMG-swimlane.mmd'),'utf8');
const empty=(title='')=>({cards:title?[{id:'card1',title,blocks:[{id:'block1',type:'text',html:'Hello'}],tags:[]}]:[],links:[],groups:[],images:[],view:{x:0,y:0,zoom:1},savedAt:123});
async function mockDrive(page,{writeStatus=200,bad=false,name='Board A.json'}={}){
  const api={files:{a:JSON.stringify(empty('Remote A')),b:bad?'not json':JSON.stringify(empty('Remote B')),ia:JSON.stringify({version:1,inbox:[]}),ib:JSON.stringify({version:1,inbox:[]})},writes:[],reads:[],writeStatus,listPage:0,created:[],user:{permissionId:'user-a',emailAddress:'alice@example.test',displayName:'Alice'}};
  await page.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'application/javascript',body:`window.google={accounts:{oauth2:{initTokenClient:opts=>({requestAccessToken:()=>opts.callback({access_token:'mock-token',expires_in:3600})})}}};`}));
  await page.route('https://www.googleapis.com/**',async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method();
    const reply=(body,status=200,extra={})=>route.fulfill({status,contentType:typeof body==='string'?'application/json':'application/json',headers:{etag:'"mock"',...extra},body:typeof body==='string'?body:JSON.stringify(body)});
    if(url.pathname.endsWith('/about'))return reply({user:api.user});
    const id=url.pathname.match(/\/files\/([^/]+)$/)?.[1];
    if(id&&method==='GET'){api.reads.push(id);return reply(api.files[id]??'{}');}
    if(id&&method==='PATCH'){
      api.writes.push({id,body:req.postData()});if(api.writeStatus!==200)return reply({error:'mock failure'},api.writeStatus);
      api.files[id]=req.postData();return reply({id});
    }
    if(url.pathname.endsWith('/files')&&method==='GET'){
      const q=url.searchParams.get('q')||'';
      if(q.includes("mimeType='application/vnd.google-apps.folder'"))return reply({files:[{id:'folder',name:'聚思白板'}]});
      if(q.includes('appProperties has')){const board=q.includes("value='a'")?'a':q.includes("value='b'")?'b':null;return reply({files:board?[{id:'i'+board,name:'Inbox'}]:api.created.filter(f=>f.appProperties?.juiceBoardId&&q.includes("value='"+f.appProperties.juiceBoardId+"'"))});}
      if(q.includes("name='"))return reply({files:api.created.filter(f=>q.includes("name='"+f.name+"'"))});
      return reply({files:[{id:'a',name,modifiedTime:'2026-07-13T04:40:00Z'},{id:'b',name:'Board B.json',modifiedTime:'2026-07-13T04:40:00Z'},...api.created]});
    }
    if(method==='POST'&&url.pathname.endsWith('/files')&&url.searchParams.get('uploadType')==='multipart'){
      const request=new Request(url,{method:'POST',headers:{'Content-Type':req.headers()['content-type']},body:req.postDataBuffer()});const form=await request.formData();const metadata=JSON.parse(await form.get('metadata').text()),id='created'+api.created.length;api.created.push({...metadata,id,modifiedTime:'2026-10-17T09:00:00Z'});api.files[id]=await form.get('media').text();return reply({id});
    }
    return reply({id:'new-file'});
  });
  return api;
}
async function mockPele(page){
  await page.route('https://cdn.jsdelivr.net/npm/pele@1.9.0/dist/pele.global.js',route=>route.fulfill({contentType:'application/javascript',body:`window.pele={render:(source,options)=>{if(options.links!==false||options.images!==false)throw new Error('unsafe options');if(source.includes('broken'))throw new Error('<script>bad diagram</script>');return {svg:'<svg xmlns="http://www.w3.org/2000/svg"><script>window.pwned=true</script><a href="https://example.test"><text>Flow preview</text></a></svg>'};}};`}));
}
test.afterEach(async({page})=>{expect(page.appErrors||[]).toEqual([]);});
async function boot(page,{showHome=false}={}){const errors=[];page.appErrors=errors;page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR:',e.stack);});await page.goto('/');await expect(page.locator('#home')).toBeVisible();if(!showHome){await page.locator('#homeRouteLocal').click();if(await page.locator('#homeContinue').isEnabled())await page.locator('#homeContinue').click();await expect(page.locator('#btnAdd')).toBeVisible();}return errors;}
async function openBoard(page,name='Board A'){await page.locator('#btnDrive').click();await expect(page.locator('.drv-board-name').first()).toBeVisible();await page.locator('.drv-board-name').filter({hasText:name}).click();await expect(page.locator('#boardName')).toHaveText('· '+name);}
async function editTitle(page,title){await page.locator('.card').first().dblclick();await page.locator('#pTitle').fill(title);await page.locator('#pClose').click();}
async function stored(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('sju-whiteboard-v2')));}
async function clickTool(page,id){const button=page.locator('#'+id);if(!await button.isVisible())await page.locator('#btnToolsMore').click();await button.click();}

test('create, edit, reload and legacy entry share the same app',async({page})=>{
  await mockDrive(page);const errors=await boot(page);await page.locator('#btnAdd').click();await page.locator('#pTitle').fill('Local board');await page.locator('#pClose').click();await page.waitForTimeout(500);
  expect((await stored(page)).cards[0].title).toBe('Local board');await page.goto('/whiteboard.html');await expect(page).toHaveURL(/index.html/);await page.locator('#homeRouteLocal').click();await page.locator('#homeContinue').click();await expect(page.locator('.ctitle')).toHaveText('Local board');expect(errors).toEqual([]);
});
test('sanitizer removes active content but preserves supported formatting',async({page})=>{
  await mockDrive(page);await boot(page);
  const result=await page.evaluate(()=>JuiceCore.sanitize('<b onclick="alert(1)">bold</b><img src=x onerror="alert(1)"><svg onload="alert(1)"></svg><a href="javascript:alert(1)">bad</a><span style="color:red;background-image:url(https://evil.test)">red</span><a href="https://example.com">good</a>'));
  expect(result).toContain('<b>bold</b>');expect(result).not.toMatch(/onclick|onerror|onload|javascript:|<img|<svg|background-image/);expect(result).toContain('noopener noreferrer');expect(result).toContain('color: red');
});
test('Pele flow card creates, edits, copies, restores and reloads safely',async({page})=>{
  await mockDrive(page);await mockPele(page);await boot(page);
  await page.locator('#btnFlow').click();await expect(page.locator('.pele-source')).toHaveValue(/flowchart LR/);await expect(page.locator('.pele-preview svg')).toBeVisible();
  await expect(page.locator('.pele-preview script')).toHaveCount(0);await expect(page.locator('.pele-preview a')).toHaveCount(0);
  await page.locator('.pele-source').fill('flowchart TD\nStart --> Finish');await page.waitForTimeout(500);
  let data=await stored(page);expect(data.schemaVersion).toBe(3);expect(data.cards[0].blocks[0]).toMatchObject({type:'diagram',html:'flowchart TD\nStart --&gt; Finish'});
  await page.locator('#addBlk').click();await page.locator('.bmenu').getByText('流程圖',{exact:true}).click();await expect(page.locator('.pele-source')).toHaveCount(2);
  await page.locator('#pClose').click();await page.locator('.card').click();await page.locator('#btnDuplicate').click();await expect(page.locator('.card')).toHaveCount(2);
  await page.waitForTimeout(500);data=await stored(page);expect(data.cards[1].blocks[0].type).toBe('diagram');await page.locator('#btnUndo').click();await expect(page.locator('.card')).toHaveCount(1);await page.locator('#btnRedo').click();await expect(page.locator('.card')).toHaveCount(2);
  await page.waitForTimeout(500);await page.reload();await page.locator('#homeRouteLocal').click();await page.locator('#homeContinue').click();await expect(page.locator('.card')).toHaveCount(2);await expect(page.locator('.pvdiagram svg')).toHaveCount(4);
});
test('flow studio, flow card sizing and layered icons persist safely',async({page})=>{
  await mockDrive(page);await mockPele(page);await boot(page);
  await page.locator('#btnFlow').click();await expect(page.locator('.card')).toHaveCSS('width','480px');
  await page.locator('.flow-tools').getByText('小',{exact:true}).click();await expect(page.locator('.card')).toHaveCSS('width','360px');
  await page.locator('.flow-studio-open').click();await expect(page.locator('#flowStudio')).toHaveClass(/open/);await expect(page.locator('.fb-node').first()).toBeVisible();await page.locator('#flowStudio header button').click();await expect(page.locator('#flowStudio')).not.toHaveClass(/open/);
  await page.locator('.flow-studio-open').click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'圖形拖拉工具',exact:true}).click();await expect(page.locator('.fb-node')).toHaveCount(4);await page.locator('[data-add="rect"]').click();await expect(page.locator('.fb-node')).toHaveCount(5);await page.locator('#flowStudio header button').click();
  await clickTool(page,'btnIcon');await page.locator('#iconPalette').getByTitle('warning').click();await expect(page.locator('.iconobj')).toHaveCount(1);await page.locator('#iconLayer').selectOption('below');await page.waitForTimeout(500);
  const data=await stored(page);expect(data.cards[0].w).toBe(360);expect(data.icons[0]).toMatchObject({name:'warning',layer:'below',size:44});
});
test('expanded icon picker and clipboard screenshot paste preserve image layer',async({page,context})=>{
  await mockDrive(page);await context.grantPermissions(['clipboard-read','clipboard-write']);await boot(page);
  await clickTool(page,'btnIcon');const palette=page.locator('#iconPalette');
  await expect(palette.getByRole('searchbox',{name:'搜尋圖示'})).toBeVisible();
  await palette.getByRole('searchbox',{name:'搜尋圖示'}).fill('倉庫');
  await expect(palette.getByTitle('warehouse')).toBeVisible();await expect(palette.getByTitle('warning')).toBeHidden();
  await palette.getByTitle('warehouse').click();
  await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;canvas.getContext('2d').fillRect(0,0,2,2);
    const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);});
  await page.locator('#canvas').click({position:{x:20,y:20}});await page.keyboard.press('Control+V');
  await expect(page.locator('.imgobj.below')).toHaveCount(1);
  await expect(page.locator('#imgLayer')).toHaveValue('below');
  await page.locator('#imgLayer').selectOption('above');
  await expect(page.locator('.imgobj.above')).toHaveCSS('z-index','20000');
  await page.waitForTimeout(500);
  const data=await stored(page);expect(data.icons[0].name).toBe('warehouse');expect(data.images[0]).toMatchObject({layer:'above'});expect(data.images[0].src).toMatch(/^data:image\/jpeg;base64,/);
  const normalized=await page.evaluate(image=>({modern:JuiceCore.normalize({...JSON.parse(localStorage.getItem('sju-whiteboard-v2')),images:[image]}).images[0],legacy:JuiceCore.normalize({...JSON.parse(localStorage.getItem('sju-whiteboard-v2')),images:[{...image,layer:undefined}]}).images[0]}),data.images[0]);
  expect(normalized.modern.layer).toBe('above');expect(normalized.legacy.layer).toBe('below');
  await page.reload();await page.locator('#homeRouteLocal').click();await page.locator('#homeContinue').click();
  await expect(page.locator('.imgobj.above')).toHaveCount(1);
});
test('uploaded transparent custom icon survives save and reload',async({page})=>{
  await page.setViewportSize({width:900,height:800});await mockDrive(page);await boot(page);await expect(page.locator('#btnIcon')).toBeHidden();
  await clickTool(page,'btnIcon');await expect(page.locator('#iconPalette')).toBeVisible();
  const dataUrl=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;canvas.getContext('2d').fillRect(0,0,1,1);return canvas.toDataURL('image/png');});
  const chooser=page.waitForEvent('filechooser');await page.locator('#iconPalette').getByRole('button',{name:'上傳自訂 PNG／WebP 圖示'}).click();
  await (await chooser).setFiles({name:'my-icon.png',mimeType:'image/png',buffer:Buffer.from(dataUrl.split(',')[1],'base64')});
  await expect(page.locator('.iconobj img')).toHaveCount(1);await page.waitForTimeout(500);
  const saved=await stored(page);expect(saved.icons[0]).toMatchObject({name:'custom',layer:'above'});expect(saved.icons[0].src).toMatch(/^data:image\/png;base64,/);
  expect((await page.evaluate(icon=>JuiceCore.normalize({...JSON.parse(localStorage.getItem('sju-whiteboard-v2')),icons:[icon]}).icons[0],saved.icons[0])).src).toBe(saved.icons[0].src);
  await page.reload();await page.locator('#homeRouteLocal').click();await page.locator('#homeContinue').click();await expect(page.locator('.iconobj img')).toHaveCount(1);
  const alpha=await page.locator('.iconobj img').evaluate(async image=>{await image.decode();const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;canvas.getContext('2d').drawImage(image,0,0);return canvas.getContext('2d').getImageData(1,1,1,1).data[3];});expect(alpha).toBe(0);
});
test('free-position text persists with its appearance and layer',async({page})=>{
  await mockDrive(page);await boot(page);await clickTool(page,'btnText');await expect(page.locator('.noteobj')).toHaveText('輸入文字');
  await page.locator('.noteobj').fill('白板標註');await page.locator('#noteSize').fill('28');await page.locator('#noteColor').fill('#c5403b');await page.locator('#noteLayer').selectOption('below');await page.waitForTimeout(500);
  expect((await stored(page)).notes[0]).toMatchObject({text:'白板標註',size:28,color:'#c5403b',layer:'below'});
});
test('graph editing keeps source visible and synchronizes both ways',async({page})=>{
  await mockDrive(page);await mockPele(page);await boot(page);await page.locator('#btnFlow').click();await page.locator('.flow-studio-open').click();await page.getByRole('button',{name:'圖形拖拉工具',exact:true}).click();
  const source=page.locator('#flowStudio textarea');await expect(source).toBeVisible();await source.fill('flowchart TD\nA[原始文字] --> B[下一步]\nstyle A fill:#ffeeaa');await expect(page.locator('.fb-node')).toHaveCount(2);await expect(page.locator('.fb-node').first()).toHaveText('原始文字');await page.locator('[data-add="rect"]').click();await expect(source).toHaveValue(/style A fill:#ffeeaa/);await expect(source).toHaveValue(/flowchart TD/);await expect(source).toHaveValue(/新步驟/);
});
test('structured flow forms preserve semantics and reject unsupported conversion',async({page})=>{
 await mockDrive(page);await mockPele(page);await boot(page);await page.locator('#btnFlow').click();await page.locator('.flow-studio-open').click();await page.getByRole('button',{name:'圖形拖拉工具',exact:true}).click();
 const source=page.locator('#flowStudio textarea');await page.locator('[data-list]').click();await page.getByRole('textbox',{name:'步驟 2 名稱',exact:true}).fill('確認客戶資料');await expect(source).toHaveValue(/B\{確認客戶資料\}/);await page.getByRole('textbox',{name:'連線 2 條件',exact:true}).fill('核准');await expect(source).toHaveValue(/\|核准\|/);
 const roundtrip=await page.evaluate(()=>{const model=JuiceFlowBuilder.parse(document.querySelector('#flowStudio textarea').value);return JuiceFlowBuilder.parse(JuiceFlowBuilder.serialize(model));});expect(roundtrip.nodes).toHaveLength(4);expect(roundtrip.edges).toHaveLength(4);expect(roundtrip.edges[3].dotted).toBe(true);
 await page.locator('#flowStudio').screenshot({path:'/tmp/juice-structured-flow.png'});
 await source.fill('flowchart LR\nsubgraph X\nA[Test]\nend');await expect(page.locator('.fb-status')).toContainText('尚未支援');await expect(page.locator('[data-add="rect"]')).toBeDisabled();await expect(source).toHaveValue('flowchart LR\nsubgraph X\nA[Test]\nend');
 const nested='flowchart LR\nsubgraph OUT [外部]\nsubgraph INNER [內部]\nA[步驟]\nend\nend';await source.fill(nested);await expect(page.locator('[data-add-lane]')).toBeDisabled();await expect(source).toHaveValue(nested);
 const styled='flowchart LR\nsubgraph X [系統]\nA[步驟]\nend\nstyle A fill:#ffeeaa';await source.fill(styled);await expect(page.locator('[data-add="rect"]')).toBeDisabled();await expect(source).toHaveValue(styled);
 const commented='flowchart LR\n%% 保留原始說明\nsubgraph X [系統]\nA[步驟]\nend';await source.fill(commented);await expect(page.locator('[data-add="rect"]')).toBeDisabled();await expect(source).toHaveValue(commented);
});
test('juice-flow v2 validates lanes and simple subgraphs round-trip',async({page})=>{
 await mockDrive(page);await boot(page);
 const sample={format:'juice-flow',version:2,title:'接單通知',direction:'TD',lanes:[{id:'MIDDLE',label:'中台'},{id:'OMG',label:'OMG 接單模組'}],nodes:[{id:'UPSTREAM',label:'上游交易結果',type:'round'},{id:'RECEIVE',label:'接收交易結果',type:'rect',lane:'MIDDLE'},{id:'ORDER',label:'建立訂單',type:'rect',lane:'OMG'},{id:'FAIL',label:'接收失敗通知',type:'rect',lane:'MIDDLE'}],edges:[{from:'UPSTREAM',to:'RECEIVE',label:'',dotted:false},{from:'RECEIVE',to:'ORDER',label:'送交接單',dotted:false},{from:'ORDER',to:'FAIL',label:'建立失敗',dotted:true}],questions:['失敗後是否由人員處理？'],assumptions:[]};
 const result=await page.evaluate(data=>{const parsed=JuiceFlowAI.parse(JSON.stringify(data)),source=JuiceFlowBuilder.serialize(parsed.model),again=JuiceFlowBuilder.parse(source);return{source,lanes:again.lanes,nodes:again.nodes.map(({id,lane})=>({id,lane})),edges:again.edges,unsupported:again.unsupported};},sample);
 expect(result.source).toContain('subgraph MIDDLE [中台]');expect(result.source).toContain('subgraph OMG [OMG 接單模組]');expect(result.source.indexOf('UPSTREAM')).toBeLessThan(result.source.indexOf('subgraph MIDDLE'));expect(result.unsupported).toEqual([]);expect(Object.fromEntries(result.nodes.map(n=>[n.id,n.lane]))).toEqual(Object.fromEntries(sample.nodes.map(n=>[n.id,n.lane||''])));expect(result.edges.map(e=>[e.from,e.to,e.dotted])).toEqual(sample.edges.map(e=>[e.from,e.to,e.dotted]));
 const invalid=[{lanes:[sample.lanes[0],sample.lanes[0]]},{lanes:[{id:'RECEIVE',label:'衝突'}]},{nodes:[{...sample.nodes[0],lane:'MISSING'},...sample.nodes.slice(1)]},{lanes:[{id:'BAD',label:'錯誤[名稱]'}]},{version:3}];
 for(const change of invalid){const error=await page.evaluate(data=>{try{JuiceFlowAI.parse(JSON.stringify(data));return '';}catch(e){return e.message;}},{...sample,...change});expect(error).toBeTruthy();}
 const v1={...sample,version:1,nodes:sample.nodes.map(({lane,...n})=>n)};delete v1.lanes;expect((await page.evaluate(data=>JuiceFlowAI.parse(JSON.stringify(data)).model.lanes,v1))).toEqual([]);
 const existing=await page.evaluate(source=>{const model=JuiceFlowBuilder.parse(source),again=JuiceFlowBuilder.parse(JuiceFlowBuilder.serialize(model));return{unsupported:model.unsupported,lanes:again.lanes,nodes:again.nodes.map(n=>[n.id,n.lane]),edges:again.edges.map(e=>[e.from,e.to,e.label])};},omgMermaid);expect(existing.unsupported).toEqual([]);expect(existing.lanes.map(l=>l.label)).toEqual(['中台','OMG 接單模組']);expect(existing.nodes.find(([id])=>id==='START')[1]).toBe('');expect(existing.edges).toContainEqual(['OMG_CHECK','MIDDLE_FAIL','失敗']);expect(existing.edges).toHaveLength(8);
});
test('lane editor renames, moves nodes, adds and removes lanes without losing edges',async({page})=>{
 await mockDrive(page);await mockPele(page);await boot(page);await page.locator('#btnFlow').click();await page.locator('.flow-studio-open').click();const source=page.locator('#flowStudio textarea');
 await source.fill('flowchart TD\n  UPSTREAM(上游)\n  subgraph MIDDLE [中台]\n  RECEIVE[接收交易結果]\n  FAIL[接收失敗通知]\n  end\n  subgraph OMG [OMG 接單模組]\n  ORDER[建立訂單]\n  end\n  UPSTREAM --> RECEIVE\n  RECEIVE --> ORDER\n  ORDER -.-> |失敗通知| FAIL');
 await page.getByRole('button',{name:'圖形拖拉工具',exact:true}).click();await expect(page.locator('.fb-lane')).toHaveCount(2);await expect(page.locator('.fb-lane[data-lane="MIDDLE"]')).toContainText('中台');await expect(page.locator('.fb-node[data-node="UPSTREAM"]')).toHaveAttribute('data-lane','');await expect(page.locator('.fb-node[data-node="ORDER"]')).toHaveAttribute('data-lane','OMG');
 await page.locator('[data-list]').click();await page.getByRole('textbox',{name:'泳道 MIDDLE 名稱'}).fill('中台作業');await page.getByRole('textbox',{name:'泳道 MIDDLE 名稱'}).press('Tab');await expect(source).toHaveValue(/subgraph MIDDLE \[中台作業\]/);
 await page.locator('.fb-node[data-node="FAIL"]').dblclick();await page.getByRole('combobox',{name:'所屬泳道',exact:true}).selectOption('OMG');await page.getByRole('button',{name:'儲存設定',exact:true}).click();await expect(page.locator('.fb-node[data-node="FAIL"]')).toHaveAttribute('data-lane','OMG');
 await page.locator('[data-add-lane]').click();await expect(page.locator('.fb-lane')).toHaveCount(3);await page.getByRole('textbox',{name:'泳道 LANE1 名稱'}).fill('OMS');await page.getByRole('textbox',{name:'泳道 LANE1 名稱'}).press('Tab');await page.locator('.fb-lane-row').filter({hasText:'LANE1'}).getByRole('button',{name:'移出節點並刪除'}).click();await expect(page.locator('.fb-lane')).toHaveCount(2);
 await page.locator('.fb-lane-row').filter({hasText:'OMG'}).getByRole('button',{name:'移出節點並刪除'}).click();await expect(page.locator('.fb-node[data-node="ORDER"]')).toHaveAttribute('data-lane','');await expect(source).toHaveValue(/ORDER -\.-> \|失敗通知\| FAIL/);
 await page.locator('#flowStudio header button').click();await page.waitForTimeout(500);await page.reload();await page.locator('#homeRouteLocal').click();await page.locator('#homeContinue').click();await page.locator('.card').dblclick();await page.locator('.flow-studio-open').click();await page.getByRole('button',{name:'圖形拖拉工具',exact:true}).click();await expect(page.locator('.fb-lane[data-lane="MIDDLE"]')).toContainText('中台作業');await expect(page.locator('.fb-node[data-node="FAIL"]')).toHaveAttribute('data-lane','');expect((await page.evaluate(()=>JuiceFlowBuilder.parse(document.querySelector('#flowStudio textarea').value))).edges).toHaveLength(3);
});
test('OMG v2 example imports with two lanes and an outside upstream source',async({page})=>{
 await mockDrive(page);await mockPele(page);await boot(page);await page.locator('#btnFlow').click();await page.locator('.flow-studio-open').click();await page.getByRole('button',{name:'貼上 AI 結果',exact:true}).click();const area=page.getByRole('textbox',{name:'AI 流程結果',exact:true});await area.fill(JSON.stringify({...omgExample,nodes:[{...omgExample.nodes[0],lane:'MISSING'},...omgExample.nodes.slice(1)]}));await page.getByRole('button',{name:'驗證並預覽',exact:true}).click();await expect(page.locator('.flow-ai-dialog [role=status]')).toContainText('不存在的泳道');await area.fill(JSON.stringify(omgExample));await page.getByRole('button',{name:'驗證並預覽',exact:true}).click();await expect(page.locator('.flow-ai-preview svg')).toBeVisible();await expect(page.locator('.flow-ai-dialog [role=status]')).toContainText('9 個步驟');await page.getByRole('button',{name:'更新目前流程',exact:true}).click();
 const source=page.locator('#flowStudio textarea');await expect(source).toHaveValue(/subgraph MIDDLE \[中台\]/);await expect(source).toHaveValue(/subgraph OMG \[OMG 接單模組\]/);await expect(source).toHaveValue(/OMG_CHECK --> \|失敗\| MIDDLE_FAIL/);await expect(source).not.toHaveValue(/重試|自動修復/);
 await page.getByRole('button',{name:'圖形拖拉工具',exact:true}).click();await expect(page.locator('.fb-lane')).toHaveCount(2);await expect(page.locator('.fb-node[data-node="START"]')).toHaveAttribute('data-lane','');await expect(page.locator('.fb-node[data-node="OMG_CHECK"]')).toHaveAttribute('data-lane','OMG');await expect(page.locator('.fb-node[data-node="MIDDLE_FAIL"]')).toHaveAttribute('data-lane','MIDDLE');
});
test('direct next-step creation connects automatically and exports clean text',async({page})=>{
 await mockDrive(page);await mockPele(page);await boot(page);await page.locator('#btnFlow').click();await page.locator('.flow-studio-open').click();await page.getByRole('button',{name:'圖形拖拉工具',exact:true}).click();await page.locator('.fb-node').first().click();await page.locator('.fb-node-actions').getByRole('button',{name:'＋ 下一步',exact:true}).click();await page.getByRole('textbox',{name:'節點文字',exact:true}).fill('接續處理');await page.getByRole('textbox',{name:'節點文字',exact:true}).press('Enter');await expect(page.locator('#flowStudio textarea')).toHaveValue(/A --> S1/);await expect(page.locator('#flowStudio textarea')).toHaveValue(/S1\[接續處理\]/);await page.locator('[data-layout]').click();await page.waitForTimeout(500);const state=await stored(page);expect(state.cards[0].blocks[0].html).not.toContain('juice-positions');expect(state.cards[0].blocks[0].diagramPositions).toBeTruthy();const download=page.waitForEvent('download');await page.locator('[data-export]').click();expect((await download).suggestedFilename()).toBe('flowchart.mmd');
});
test('node dialog renames codes and preserves connections and extended shapes',async({page})=>{
 await mockDrive(page);await mockPele(page);await boot(page);await page.locator('#btnFlow').click();await page.locator('.flow-studio-open').click();await expect(page.locator('.fb-forms')).toBeHidden();await page.locator('.fb-node').first().dblclick();await page.getByRole('textbox',{name:'節點編碼',exact:true}).fill('B');await page.getByRole('button',{name:'儲存設定',exact:true}).click();await expect(page.locator('.fb-dialog-error')).toContainText('已被其他');await page.getByRole('textbox',{name:'節點編碼',exact:true}).fill('ORDER_CHECK');await page.getByRole('combobox',{name:'節點形狀',exact:true}).selectOption('database');await page.getByRole('button',{name:'儲存設定',exact:true}).click();await expect(page.locator('#flowStudio textarea')).toHaveValue(/ORDER_CHECK\[\(取得資料\)\]/);await expect(page.locator('#flowStudio textarea')).toHaveValue(/ORDER_CHECK --> B/);
 const shapes=await page.evaluate(()=>{const m=JuiceFlowBuilder.parse('flowchart LR\nA((圓形)) --> B[(資料庫)]\nB --> C[[子程序]]');return JuiceFlowBuilder.parse(JuiceFlowBuilder.serialize(m));});expect(shapes.unsupported).toEqual([]);expect(shapes.nodes.map(n=>n.shape)).toEqual(['circle','database','subroutine']);
});
test('AI clipboard import validates, previews and applies only reviewed content',async({page})=>{
 await mockDrive(page);await mockPele(page);await boot(page);await page.locator('#btnFlow').click();await page.locator('.flow-studio-open').click();
 await page.getByRole('button',{name:'讓 AI 幫我整理',exact:true}).click();await expect(page.getByRole('textbox',{name:'流程整理提示詞',exact:true})).toHaveValue(/取得資料/);await expect(page.getByRole('textbox',{name:'流程整理提示詞',exact:true})).toHaveValue(/juice-flow/);await page.locator('.flow-ai-dialog').getByRole('button',{name:'關閉',exact:true}).click();
 const payload={format:'juice-flow',version:1,title:'訂單核准',nodes:[{id:'START',label:'接收訂單',type:'round'},{id:'CHECK',label:'核准訂單',type:'decision'}],edges:[{from:'START',to:'CHECK',label:'送審',dotted:false}],questions:['退回後由誰補件？'],assumptions:[]};
 await page.getByRole('button',{name:'貼上 AI 結果',exact:true}).click();const area=page.getByRole('textbox',{name:'AI 流程結果',exact:true});await area.fill(JSON.stringify({...payload,edges:[{from:'START',to:'MISSING',label:''}]}));await page.getByRole('button',{name:'驗證並預覽',exact:true}).click();await expect(page.locator('.flow-ai-dialog [role=status]')).toContainText('不存在');await expect(page.getByRole('button',{name:'更新目前流程',exact:true})).toBeHidden();
 await area.fill(JSON.stringify(payload));await page.getByRole('button',{name:'驗證並預覽',exact:true}).click();await expect(page.locator('.flow-ai-preview svg')).toBeVisible();await expect(page.locator('.flow-ai-dialog [role=status]')).toContainText('退回後由誰補件');await area.fill(JSON.stringify({...payload,title:'修改後的草稿'}));await expect(page.getByRole('button',{name:'更新目前流程',exact:true})).toBeHidden();await page.getByRole('button',{name:'驗證並預覽',exact:true}).click();await page.getByRole('button',{name:'更新目前流程',exact:true}).click();await expect(page.locator('.flow-ai-dialog')).toHaveCount(0);await expect(page.getByRole('textbox',{name:'流程圖名稱',exact:true})).toHaveValue('修改後的草稿');await page.waitForTimeout(500);let data=await stored(page);expect(data.cards).toHaveLength(1);expect(data.cards[0].blocks[0].html).toContain('START');expect(data.cards[0].blocks[0].aiContext).toContain('退回後由誰補件');
 await page.getByRole('button',{name:'貼上 AI 結果',exact:true}).click();await page.getByRole('textbox',{name:'AI 流程結果',exact:true}).fill(JSON.stringify(payload));await page.getByRole('button',{name:'驗證並預覽',exact:true}).click();await page.getByRole('button',{name:'新增為流程圖',exact:true}).click();await page.waitForTimeout(500);data=await stored(page);expect(data.cards).toHaveLength(2);expect(data.cards[1].title).toBe('訂單核准');
});
test('flow node rename and delete work and card actions use context menus',async({page})=>{
 await mockDrive(page);await mockPele(page);await boot(page);await page.locator('#btnFlow').click();await page.locator('.flow-studio-open').click();await page.getByRole('button',{name:'圖形拖拉工具',exact:true}).click();
 await expect(page.locator('[data-delete]')).toBeDisabled();await page.locator('.fb-node').first().dblclick();await page.getByRole('textbox',{name:'節點文字',exact:true}).fill('已修改的節點');await page.getByRole('textbox',{name:'節點文字',exact:true}).press('Enter');await expect(page.locator('#flowStudio textarea')).toHaveValue(/已修改的節點/);await page.locator('.fb-node').first().click();await page.locator('[data-delete]').click();await expect(page.locator('.fb-node')).toHaveCount(3);
 await page.locator('#flowStudio header button').click();await page.locator('#pClose').click();await page.locator('.card').click({button:'right'});await expect(page.locator('.bmenu')).toContainText('移到最上層');await expect(page.locator('#btnFront')).toBeHidden();
});
test('diagram blocks survive JSON import, legacy normalization and Drive round trips',async({page})=>{
  const api=await mockDrive(page);await mockPele(page);await boot(page);
  const imported={schemaVersion:3,cards:[{id:'flow',x:30,y:40,title:'Imported flow',blocks:[{id:'diagram-block',type:'diagram',html:'flowchart LR\nA --&gt; B'}],tags:[]}],links:[],groups:[],images:[],view:{x:0,y:0,zoom:1}};
  await page.locator('#fileInput').setInputFiles({name:'flow.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});await expect(page.locator('.ctitle')).toHaveText('Imported flow');
  expect((await stored(page)).cards[0].blocks[0]).toMatchObject({type:'diagram',html:'flowchart LR\nA --&gt; B'});
  const legacy=await page.evaluate(()=>JuiceCore.normalize({cards:[{id:'old-flow',title:'Old flow',blocks:[{id:'old-block',type:'diagram',html:'flowchart LR\\nA --&gt; B'}]}],links:[],groups:[],images:[],view:{}}));expect(legacy.schemaVersion).toBe(3);expect(legacy.cards[0].blocks[0].type).toBe('diagram');
  await page.locator('#btnDrive').click();await page.locator('.drv-board-name').filter({hasText:'Board A'}).click();await page.locator('#btnFlow').click();await page.locator('.pele-source').fill('flowchart LR\nCloud --> Saved');await page.waitForTimeout(500);await page.locator('#btnSaveNow').click();await expect(page.locator('#saveStatus')).toHaveText('剛剛儲存');
  expect(JSON.parse(api.files.a).cards.at(-1).blocks[0]).toMatchObject({type:'diagram',html:'flowchart LR\nCloud --&gt; Saved'});
});
test('Pele flow card remains usable at mobile width',async({page})=>{
  await mockDrive(page);await mockPele(page);await page.setViewportSize({width:390,height:700});await boot(page);
  await page.locator('#mobileMore').click();await page.locator('#btnFlow').click();await expect(page.locator('.pele-source')).toBeVisible();await expect(page.locator('.pele-preview svg')).toBeVisible();
  expect(await page.locator('#panel').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});
test('invalid JSON import preserves existing board and source',async({page})=>{
  await mockDrive(page);await boot(page);await openBoard(page);await page.locator('#fileInput').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"cards":"invalid"}')});await expect(page.locator('#banner')).toContainText('cards');await expect(page.locator('#boardName')).toHaveText('· Board A');await expect(page.locator('.ctitle')).toHaveText('Remote A');
});
test('Drive HTTP failure is never reported as saved; switching is blocked',async({page})=>{
  const api=await mockDrive(page,{writeStatus:403});await boot(page);await openBoard(page);await editTitle(page,'Pending edit');await page.locator('#btnSaveNow').click();await expect(page.locator('#saveStatus')).toHaveText('同步失敗，請重試');await expect(page.locator('#banner')).toContainText('403');
  await page.locator('#btnDrive').click();await page.locator('.drv-board-name').filter({hasText:'Board B'}).click();await expect(page.locator('#banner')).toContainText('取消切換');await expect(page.locator('#boardName')).toHaveText('· Board A');expect(api.writes.every(w=>w.id==='a')).toBe(true);
  api.writeStatus=200;await page.locator('#drvClose').click();await page.locator('#btnSaveNow').click();await expect(page.locator('#saveStatus')).toHaveText('剛剛儲存');expect(JSON.parse(api.files.a).cards[0].title).toBe('Pending edit');
});
test('localStorage quota failure still allows Drive save',async({page})=>{
  const api=await mockDrive(page);await boot(page);await openBoard(page);
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError');};});
  await editTitle(page,'Cloud survives quota');await page.locator('#btnSaveNow').click();await expect(page.locator('#saveStatus')).toHaveText('剛剛儲存');expect(JSON.parse(api.files.a).cards[0].title).toBe('Cloud survives quota');
});
test('remote conflict preserves both candidates and blocks overwrite',async({page})=>{
  const api=await mockDrive(page);await boot(page);await openBoard(page);await editTitle(page,'Local candidate');api.files.a=JSON.stringify(empty('Other device'));
  await page.locator('#btnSaveNow').click();await expect(page.locator('#saveStatus')).toHaveText('同步衝突');expect(api.writes).toHaveLength(0);
  const snapshots=await page.evaluate(()=>JuiceCore.backups());expect(snapshots.some(s=>s.value.local?.cards?.[0]?.title==='Local candidate'&&s.value.remote?.cards?.[0]?.title==='Other device')).toBe(true);
});
test('corrupt remote board never replaces current content',async({page})=>{
  await mockDrive(page,{bad:true});await boot(page);await openBoard(page);await page.locator('#btnDrive').click();await page.locator('.drv-board-name').filter({hasText:'Board B'}).click();await expect(page.locator('#banner')).toContainText('JSON');await expect(page.locator('#boardName')).toHaveText('· Board A');await expect(page.locator('.ctitle')).toHaveText('Remote A');
});
test('Drive filenames render as text',async({page})=>{
  await mockDrive(page,{name:'<img src=x onerror=alert(1)>.json'});await boot(page);await page.locator('#btnDrive').click();await expect(page.locator('.drv-board-name').first()).toHaveText('<img src=x onerror=alert(1)>');await expect(page.locator('.drv-board-name img')).toHaveCount(0);
});
test('Drive read-modify-write does not lose rapid edits',async({page})=>{
  const api=await mockDrive(page);await boot(page);await openBoard(page);await editTitle(page,'First');await page.locator('#btnSaveNow').click();await expect(page.locator('#saveStatus')).toHaveText('剛剛儲存');await editTitle(page,'Second');await page.locator('#btnSaveNow').click();await expect(page.locator('#saveStatus')).toHaveText('剛剛儲存');expect(JSON.parse(api.files.a).cards[0].title).toBe('Second');
});
test('schema rejects invalid dimensions, duplicate IDs, bad references and active images',async({page})=>{
  await mockDrive(page);await boot(page);
  const results=await page.evaluate(()=>[
    {cards:[{id:'x'},{id:'x'}]}, {cards:[],view:{zoom:0}}, {cards:[],links:[{from:'missing',to:'missing'}]}, {cards:[{blocks:[{src:'data:image/svg+xml,<svg onload=alert(1) />'}]}]}, {cards:[],schemaVersion:99}
  ].map(d=>{try{JuiceCore.normalize(d);return false;}catch{return true;}}));expect(results).toEqual([true,true,true,true,true]);
});
test('approved inbox card remains pending when destination save fails; retry does not duplicate',async({page})=>{
  const api=await mockDrive(page);api.files.ia=JSON.stringify({version:1,inbox:[{id:'incoming1',title:'AI item',blocks:[{id:'incomingblock',type:'text',html:'AI text'}]}]});
  await boot(page);await openBoard(page);await clickTool(page,'btnInbox');await expect(page.locator('.ib-ok')).toBeVisible();api.writeStatus=403;await page.locator('.ib-ok').click();await expect(page.locator('#banner')).toContainText('待審卡已保留');expect(JSON.parse(api.files.ia).inbox).toHaveLength(1);
  api.writeStatus=200;await page.locator('.ib-ok').click();await expect(page.locator('.ib-ok')).toHaveCount(0);expect(JSON.parse(api.files.a).cards.filter(c=>c.title==='AI item')).toHaveLength(1);expect(JSON.parse(api.files.ia).inbox).toHaveLength(0);
});
test('import creates a detached local board and backs up the former Drive board',async({page})=>{
  const api=await mockDrive(page);await boot(page);await openBoard(page);await page.locator('#fileInput').setInputFiles({name:'board.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(empty('Imported')))});await expect(page.locator('#banner')).toContainText('已匯入');await expect(page.locator('#boardName')).toContainText('本機');await editTitle(page,'Only local');await page.waitForTimeout(1800);expect(api.writes).toHaveLength(0);expect((await stored(page)).cards[0].title).toBe('Only local');
});

async function mockLocalFile(page,initial){
  await page.addInitScript(initial=>{
    const ready=(async()=>{const dir=await navigator.storage.getDirectory(),h=await dir.getFileHandle('whiteboard-sync.json',{create:true});const w=await h.createWritable();await w.write(initial);await w.close();window.testHandle=h;return h;})();
    FileSystemFileHandle.prototype.queryPermission=async()=> 'granted';FileSystemFileHandle.prototype.requestPermission=async()=> 'granted';
    window.showOpenFilePicker=async()=>[await ready];window.showSaveFilePicker=async()=>await ready;
  },initial);
}
async function chooseSync(page,label){await clickTool(page,'btnSync');await page.locator('.bmenu').getByText(label,{exact:true}).click();}

test('local file conflict preserves local edits and never overwrites external changes',async({page})=>{
  await mockDrive(page);await mockLocalFile(page,JSON.stringify(empty('File board')));await boot(page);await chooseSync(page,'連結現有同步檔');await expect(page.locator('#banner')).toContainText('已載入同步檔');await editTitle(page,'Unsynced local');
  await page.evaluate(async raw=>{const w=await testHandle.createWritable();await w.write(raw);await w.close();},JSON.stringify(empty('External edit')));
  await chooseSync(page,'立即同步');await expect(page.locator('#banner')).toContainText('停止載入及覆寫');expect(await page.evaluate(async()=>JSON.parse(await(await testHandle.getFile()).text()).cards[0].title)).toBe('External edit');expect((await stored(page)).cards[0].title).toBe('Unsynced local');
});
test('switching from a local file to Drive detaches the old file destination',async({page})=>{
  const api=await mockDrive(page);await mockLocalFile(page,JSON.stringify(empty('File board')));await boot(page);await chooseSync(page,'連結現有同步檔');await expect(page.locator('#banner')).toContainText('已載入同步檔');await openBoard(page);await editTitle(page,'Drive only');await page.locator('#btnSaveNow').click();await expect(page.locator('#saveStatus')).toHaveText('剛剛儲存');
  expect(await page.evaluate(async()=>JSON.parse(await(await testHandle.getFile()).text()).cards[0].title)).toBe('File board');expect(JSON.parse(api.files.a).cards[0].title).toBe('Drive only');
});
test('new sync file picker refuses to replace an existing nonempty file',async({page})=>{
  await mockDrive(page);await mockLocalFile(page,JSON.stringify(empty('Existing')));await boot(page);await chooseSync(page,'建立新的同步檔');await expect(page.locator('#banner')).toContainText('此檔案已有內容');expect(await page.evaluate(async()=>JSON.parse(await(await testHandle.getFile()).text()).cards[0].title)).toBe('Existing');
});
test('401 requires login and preserves dirty board',async({page})=>{
  const api=await mockDrive(page,{writeStatus:401});await boot(page);await openBoard(page);await editTitle(page,'Keep me');await page.locator('#btnSaveNow').click();await expect(page.locator('#saveStatus')).toHaveText('需重新登入');expect((await stored(page)).cards[0].title).toBe('Keep me');expect(JSON.parse(api.files.a).cards[0].title).toBe('Remote A');
});
test('412 conditional update stops overwrite and exposes conflict',async({page})=>{
  await mockDrive(page,{writeStatus:412});await boot(page);await openBoard(page);await editTitle(page,'Conditional candidate');await page.locator('#btnSaveNow').click();await expect(page.locator('#saveStatus')).toHaveText('同步衝突');
});
test('new inbox arrivals during approval survive the inbox update',async({page})=>{
  const api=await mockDrive(page);api.files.ia=JSON.stringify({version:1,inbox:[{id:'first',title:'First',blocks:[]}]});
  await boot(page);await openBoard(page);await clickTool(page,'btnInbox');
  await page.route('https://www.googleapis.com/upload/drive/v3/files/a?uploadType=media',async route=>{
    api.files.a=route.request().postData();const data=JSON.parse(api.files.ia);data.inbox.push({id:'second',title:'New arrival',blocks:[]});api.files.ia=JSON.stringify(data);await route.fulfill({status:200,body:'{}'});
  });
  await page.locator('.ib-ok').click();await expect(page.locator('.ib-title')).toHaveText('New arrival');expect(JSON.parse(api.files.ia).inbox.map(c=>c.id)).toEqual(['second']);
});
test('corrupt local data is retained for raw backup',async({page})=>{
  await mockDrive(page);await page.addInitScript(()=>localStorage.setItem('sju-whiteboard-v2','broken-json'));await boot(page);await expect(page.locator('#banner')).toContainText('停止自動保存');await expect(page.locator('#homeContinue')).toBeDisabled();expect(await page.evaluate(()=>localStorage.getItem('sju-whiteboard-v2'))).toBe('broken-json');const download=page.waitForEvent('download');await page.locator('#homeRaw').click();expect((await download).suggestedFilename()).toBe('whiteboard-local-raw.json');
});

test('Drive transient 429 retries and only then reports success',async({page})=>{
  const api=await mockDrive(page);await boot(page);await openBoard(page);let attempts=0;
  await page.route('https://www.googleapis.com/upload/drive/v3/files/a?uploadType=media',async route=>{attempts++;if(attempts===1)return route.fulfill({status:429,body:'{}'});api.files.a=route.request().postData();return route.fulfill({status:200,body:'{}'});});
  await editTitle(page,'Retry saved');await page.locator('#btnSaveNow').click();await expect(page.locator('#saveStatus')).toHaveText('剛剛儲存');expect(attempts).toBe(2);expect(JSON.parse(api.files.a).cards[0].title).toBe('Retry saved');
});
test('Drive lists all pages of board results',async({page})=>{
  await mockDrive(page);await boot(page);
  await page.route('https://www.googleapis.com/drive/v3/files?**',async route=>{
    const url=new URL(route.request().url()),q=url.searchParams.get('q');if(!q.includes("'folder' in parents"))return route.fallback();
    const data=url.searchParams.get('pageToken')?{files:[{id:'b',name:'Second page.json',modifiedTime:'2026-07-13T04:40:00Z'}]}:{files:[{id:'a',name:'First page.json',modifiedTime:'2026-07-13T04:40:00Z'}],nextPageToken:'next'};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.locator('#btnDrive').click();await expect(page.locator('.drv-board-name')).toHaveText(['First page','Second page']);
});
test('deletion creates a downloadable recovery board',async({page})=>{
  await mockDrive(page);await boot(page);await page.locator('#btnAdd').click();await page.locator('#pTitle').fill('Before delete');await page.locator('#pDelete').click();await expect(page.locator('.card')).toHaveCount(0);
  await clickTool(page,'btnRecovery');const download=page.waitForEvent('download');await page.locator('.bmenu .mi').first().click();expect((await download).suggestedFilename()).toMatch(/^whiteboard-recovered-/);expect((await page.evaluate(()=>JuiceCore.backups())).some(s=>s.value.cards?.[0]?.title==='Before delete')).toBe(true);
});

test('local inbox uses a persistent source ID and saves the board before removing the item',async({page})=>{
  await mockDrive(page);await mockLocalFile(page,JSON.stringify({version:1,inbox:[{id:'local-item',title:'Local AI',blocks:[]}]}));await boot(page);await clickTool(page,'btnInbox');await page.locator('#ibLink').click();await expect(page.locator('.ib-ok')).toBeVisible();await page.locator('.ib-ok').click();await expect(page.locator('.ib-ok')).toHaveCount(0);
  const board=await stored(page);expect(board.cards[0].title).toBe('Local AI');expect(board.cards[0].sourceInbox).toMatch(/^file:[a-f0-9-]+:local-item$/);expect(await page.evaluate(async()=>JSON.parse(await(await testHandle.getFile()).text()).inbox)).toEqual([]);
});
test('legacy text and rich HTML migrate without active attributes',async({page})=>{
  await mockDrive(page);await boot(page);const data=await page.evaluate(()=>JuiceCore.normalize({cards:[{id:'old',text:'Old title\nBody <literal>'},{id:'rich',body:'<b onclick="alert(1)">Rich</b>'}]}));expect(data.cards[0].title).toBe('Old title');expect(data.cards[0].blocks[0].html).toBe('Body &lt;literal&gt;');expect(data.cards[1].blocks[0].html).toBe('<b>Rich</b>');expect(data.schemaVersion).toBe(3);
});
test('toolbar remains scrollable at phone width',async({page})=>{
  await mockDrive(page);await page.setViewportSize({width:390,height:844});await boot(page);await page.locator('#mobileMore').click();await page.locator('#btnRecovery').click();await expect(page.locator('#banner')).toHaveText('目前還沒有復原快照');await page.locator('#btnAdd').click();await expect(page.locator('#panel')).toHaveClass('open');await expect(page.locator('#pClose')).toBeInViewport();
});

async function selectionBoard(page,view={x:0,y:0,zoom:1}){
  await mockDrive(page);await page.addInitScript(data=>localStorage.setItem('sju-whiteboard-v2',JSON.stringify(data)),{cards:[{id:'one',x:100,y:100,title:'One'},{id:'two',x:400,y:100,title:'Two'},{id:'three',x:800,y:400,title:'Three'}],view});await boot(page);
}
async function rectangle(page,x1,y1,x2,y2){await page.mouse.move(x1,y1);await page.mouse.down();await page.mouse.move(x2,y2,{steps:8});await page.mouse.up();}
test('marquee selects multiple cards and dragging moves them together',async({page})=>{
  await selectionBoard(page);await page.locator('#btnSelect').click();await rectangle(page,80,132,660,300);await expect(page.locator('.card.sel')).toHaveCount(2);await expect(page.locator('#btnGroup')).toBeEnabled();
  const box=await page.locator('[data-id="one"].card').boundingBox();await rectangle(page,box.x+40,box.y+25,box.x+100,box.y+65);await page.waitForTimeout(500);const data=await stored(page);expect(data.cards.map(c=>[c.x,c.y])).toEqual([[160,140],[460,140],[800,400]]);
  await page.locator('#btnSelect').click();await rectangle(page,700,350,730,380);await page.waitForTimeout(500);expect((await stored(page)).view).toMatchObject({x:30,y:30});
});
test('Shift drag supports reverse selection and adding to the selection',async({page})=>{
  await selectionBoard(page);await page.keyboard.down('Shift');await rectangle(page,350,300,80,132);await page.keyboard.up('Shift');await expect(page.locator('.card.sel')).toHaveCount(1);
  await page.keyboard.down('Shift');await rectangle(page,380,300,660,145);await page.keyboard.up('Shift');await expect(page.locator('.card.sel')).toHaveCount(2);await expect(page.locator('#btnSelect')).toHaveAttribute('aria-pressed','false');
});
test('marquee works after pan and zoom, empty click clears selection',async({page})=>{
  await selectionBoard(page,{x:50,y:40,zoom:0.5});await page.locator('#btnSelect').click();await rectangle(page,90,132,380,210);await expect(page.locator('.card.sel')).toHaveCount(2);await page.mouse.click(700,350);await expect(page.locator('.card.sel')).toHaveCount(0);await expect(page.locator('#selectionBox')).toBeHidden();
});
test('Escape cancels the current rectangle and restores previous selection',async({page})=>{
  await selectionBoard(page);await page.locator('#btnSelect').click();await rectangle(page,80,132,350,300);await expect(page.locator('.card.sel')).toHaveCount(1);await page.mouse.move(700,350);await page.mouse.down();await page.mouse.move(1100,600);await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('.card.sel')).toHaveCount(1);await expect(page.locator('#selectionBox')).toBeHidden();
});

async function selectFirstTwo(page){await page.locator('#btnSelect').click();await rectangle(page,80,132,660,300);await expect(page.locator('.card.sel')).toHaveCount(2);}
test('duplicate preserves rich content, remaps IDs and only copies internal links',async({page})=>{
  await mockDrive(page);await page.addInitScript(()=>localStorage.setItem('sju-whiteboard-v2',JSON.stringify({cards:[{id:'one',x:100,y:100,title:'One',color:'sage',shape:'rect',tags:['test'],sourceInbox:'drive:inbox:one',blocks:[{id:'b1',type:'todo',html:'<b>Task</b>',checked:true},{id:'b2',type:'text',html:'Text'}]},{id:'two',x:400,y:100,title:'Two'},{id:'three',x:800,y:400,title:'Three'}],links:[{id:'l1',from:'one',to:'two',dir:'to',label:'internal'},{id:'l2',from:'one',to:'three',dir:'none',label:'external'}]})));await boot(page);await selectFirstTwo(page);await page.locator('#btnDuplicate').click();await expect(page.locator('.card')).toHaveCount(5);await expect(page.locator('.card.sel')).toHaveCount(2);await page.waitForTimeout(500);
  const data=await stored(page),a=data.cards[3],b=data.cards[4];expect(a).toMatchObject({title:'One',color:'sage',shape:'rect',tags:['test'],x:132,y:132});expect(a.sourceInbox).toBeUndefined();expect(a.blocks[0]).toMatchObject({type:'todo',html:'<b>Task</b>',checked:true});expect(a.id).not.toBe('one');expect(a.blocks[0].id).not.toBe('b1');expect(data.links).toHaveLength(3);expect(data.links[2]).toMatchObject({from:a.id,to:b.id,label:'internal',dir:'to'});
  await page.locator('#btnUndo').click();await expect(page.locator('.card')).toHaveCount(3);await page.locator('#btnRedo').click();await expect(page.locator('.card')).toHaveCount(5);await page.waitForTimeout(500);expect((await stored(page)).cards[3].id).toBe(a.id);
});
test('batch move and delete each undo and redo in one step',async({page})=>{
  await selectionBoard(page);await selectFirstTwo(page);const box=await page.locator('[data-id="one"].card').boundingBox();await rectangle(page,box.x+40,box.y+25,box.x+100,box.y+65);await page.locator('#btnUndo').click();await page.waitForTimeout(500);expect((await stored(page)).cards.map(c=>[c.x,c.y])).toEqual([[100,100],[400,100],[800,400]]);
  await page.locator('#btnRedo').click();await page.waitForTimeout(500);expect((await stored(page)).cards[0].x).toBe(160);await page.keyboard.press('Delete');await expect(page.locator('.card')).toHaveCount(1);await page.locator('#btnUndo').click();await expect(page.locator('.card')).toHaveCount(3);await expect(page.locator('.card.sel')).toHaveCount(2);await page.locator('#btnRedo').click();await expect(page.locator('.card')).toHaveCount(1);
});
test('new content action clears redo while pan and zoom do not create history',async({page})=>{
  await selectionBoard(page);await rectangle(page,700,350,730,380);await page.locator('#btnZoomIn').click();await expect(page.locator('#btnUndo')).toBeDisabled();await page.locator('[data-id="one"].card').click();await page.locator('#btnDuplicate').click();await page.locator('#btnUndo').click();await expect(page.locator('#btnRedo')).toBeEnabled();await page.locator('#btnAdd').click();await expect(page.locator('#btnRedo')).toBeDisabled();
});
test('keyboard duplication and history shortcuts preserve normal text undo',async({page})=>{
  await selectionBoard(page);await page.locator('[data-id="one"].card').click();await page.keyboard.press('Control+d');await expect(page.locator('.card')).toHaveCount(4);await page.keyboard.press('Control+z');await expect(page.locator('.card')).toHaveCount(3);await page.keyboard.press('Control+Shift+z');await expect(page.locator('.card')).toHaveCount(4);
  await page.locator('#btnAdd').click();await page.locator('#pTitle').pressSequentially('Typing');await page.locator('#pTitle').press((process.platform==='darwin'?'Meta':'Control')+'+z');await expect(page.locator('#pTitle')).not.toHaveValue('Typing');await expect(page.locator('.card')).toHaveCount(5);
});
test('history resets when importing another board',async({page})=>{
  await selectionBoard(page);await page.locator('[data-id="one"].card').click();await page.locator('#btnDuplicate').click();await expect(page.locator('#btnUndo')).toBeEnabled();await page.locator('#fileInput').setInputFiles({name:'other.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(empty('Other board')))});await expect(page.locator('#banner')).toContainText('已匯入');await expect(page.locator('#btnUndo')).toBeDisabled();await expect(page.locator('#btnRedo')).toBeDisabled();
});
test('undo duplication persists to Drive',async({page})=>{
  const api=await mockDrive(page);await boot(page);await openBoard(page);await page.locator('.card').click();await page.locator('#btnDuplicate').click();await page.locator('#btnSaveNow').click();await expect(page.locator('#saveStatus')).toHaveText('剛剛儲存');expect(JSON.parse(api.files.a).cards).toHaveLength(2);await page.locator('#btnUndo').click();await page.locator('#btnSaveNow').click();await expect(page.locator('#saveStatus')).toHaveText('剛剛儲存');expect(JSON.parse(api.files.a).cards).toHaveLength(1);
});

test('continuous title typing is one board undo step',async({page})=>{
  await mockDrive(page);await boot(page);await page.locator('#btnAdd').click();await page.locator('#pTitle').pressSequentially('Continuous title');await page.locator('#btnUndo').click();await expect(page.locator('.card')).toHaveCount(1);await expect(page.locator('#pTitle')).toHaveValue('');await page.locator('#btnUndo').click();await expect(page.locator('.card')).toHaveCount(0);await page.locator('#btnRedo').click();await expect(page.locator('.card')).toHaveCount(1);await page.locator('#btnRedo').click();await expect(page.locator('.ctitle')).toHaveText('Continuous title');
});
test('undo deletion restores card content and connecting links together',async({page})=>{
  await mockDrive(page);await page.addInitScript(()=>localStorage.setItem('sju-whiteboard-v2',JSON.stringify({cards:[{id:'one',x:100,y:100,title:'One'},{id:'two',x:400,y:100,title:'Two'}],links:[{id:'link',from:'one',to:'two',label:'keep connection',dir:'both'}]})));await boot(page);await page.locator('[data-id="one"].card').click();await page.keyboard.press('Delete');await expect(page.locator('.card')).toHaveCount(1);await page.locator('#btnUndo').click();await expect(page.locator('.card')).toHaveCount(2);await page.waitForTimeout(500);expect((await stored(page)).links).toEqual([{id:'link',from:'one',to:'two',dir:'both',label:'keep connection'}]);
});

test('compact panel exposes everyday controls without scrolling at phone size',async({page})=>{
  await mockDrive(page);await page.setViewportSize({width:390,height:600});await boot(page);await page.locator('#btnAdd').click();await page.locator('#pTitle').fill('biz1');await expect(page.locator('#pDuplicate')).toBeInViewport();await expect(page.locator('#pDelete')).toBeInViewport();await expect(page.locator('#pShapes')).toBeInViewport();await expect(page.locator('#tagInput')).toBeInViewport();await expect(page.locator('#pAddLink')).toBeInViewport();await expect(page.locator('#infoToggle')).toBeInViewport();
  expect(await page.locator('.pbody').evaluate(el=>el.scrollHeight<=el.clientHeight)).toBe(true);
  const sections=await page.locator('.pbody > .psec').evaluateAll(els=>els.map(el=>el.id||el.textContent));expect(sections.at(-1)).toBe('infoSec');
  await page.locator('#pSwatches').getByRole('button',{name:'淺藍'}).click();await page.locator('#pShapes').getByRole('button',{name:'直角'}).click();await page.waitForTimeout(450);expect((await stored(page)).cards[0]).toMatchObject({color:'blue',shape:'rect'});
  await page.locator('#infoToggle').click();await expect(page.locator('#iCreated')).toBeVisible();await page.locator('#infoToggle').press('Enter');await expect(page.locator('#iCreated')).toBeHidden();await expect(page.locator('#cardbar')).toBeHidden();await page.locator('#infoToggle').evaluate(el=>el.blur());await page.locator('#panel').screenshot({path:'/tmp/juice-compact-panel.png'});
});
test('panel controls stay available while reading long content',async({page})=>{
  await mockDrive(page);await page.addInitScript(()=>localStorage.setItem('sju-whiteboard-v2',JSON.stringify({cards:[{id:'long',x:100,y:100,title:'Long card',blocks:Array.from({length:60},(_,i)=>({id:'line'+i,type:'text',html:'Content line '+i}))}]})));await boot(page);await page.locator('.card').dblclick();await page.locator('.pbody').evaluate(el=>el.scrollTop=el.scrollHeight);await expect(page.locator('#pDuplicate')).toBeInViewport();await expect(page.locator('#pDelete')).toBeInViewport();await expect(page.locator('#pSwatches')).toBeInViewport();await expect(page.locator('#pShapes')).toBeInViewport();await expect(page.locator('#rtbar')).toBeInViewport();
});
test('panel creates links with a picker and can undo them',async({page})=>{
  await selectionBoard(page);await page.locator('[data-id="one"].card').dblclick();await page.locator('#pAddLink').click();await page.locator('.bmenu').getByText('Two',{exact:true}).click();await expect(page.locator('#pConn .crow')).toHaveText('Two');await page.waitForTimeout(450);expect((await stored(page)).links[0]).toMatchObject({from:'one',to:'two'});await page.locator('#btnUndo').click();await expect(page.locator('#pConn')).toHaveText('尚無關聯');
});
test('panel duplicate button copies the open card',async({page})=>{
  await selectionBoard(page);await page.locator('[data-id="one"].card').dblclick();await page.locator('#pDuplicate').click();await expect(page.locator('.card')).toHaveCount(4);await page.waitForTimeout(450);expect((await stored(page)).cards[3]).toMatchObject({title:'One',x:132,y:132});
});

async function createHomeLocal(page,name){await page.locator('#homeRouteLocal').click();await page.locator('#homeNewName').fill(name);await page.locator('#homeCreateForm').getByRole('button',{name:'建立白板',exact:true}).click();await expect(page.locator('#home')).toBeHidden();}
test('start screen offers optional login and safely continues the cached board',async({page})=>{
  await mockDrive(page);await page.addInitScript(data=>localStorage.setItem('sju-whiteboard-v2',JSON.stringify(data)),{...empty('Previous work'),savedAt:Date.now()});await boot(page,{showHome:true});await expect(page.locator('#homeContinue')).toBeVisible();await page.locator('#homeRouteLocal').click();await expect(page.locator('#homeCurrentMeta')).toContainText('1 張卡片');await expect(page.locator('#homeContinue')).toHaveText('繼續編輯本機白板');await page.locator('#homeContinue').click();await expect(page.locator('.ctitle')).toHaveText('Previous work');await page.locator('#btnHome').click();await expect(page.locator('#home')).toBeVisible();await page.locator('#home').screenshot({path:'/tmp/juice-start-screen.png'});
});
test('named local boards retain separate contents across switching and reload',async({page})=>{
  await mockDrive(page);await boot(page,{showHome:true});await createHomeLocal(page,'Alpha');await page.locator('#btnAdd').click();await page.locator('#pTitle').fill('Alpha content');await page.locator('#btnHome').click();await expect(page.locator('#homeLocalList .home-board strong')).toHaveText(['Alpha']);await createHomeLocal(page,'Beta');await page.locator('#btnAdd').click();await page.locator('#pTitle').fill('Beta content');await page.locator('#btnHome').click();await expect(page.locator('#homeLocalList .home-board')).toHaveCount(2);await page.locator('#homeLocalList .home-board').filter({hasText:'Alpha'}).click();await expect(page.locator('.ctitle')).toHaveText('Alpha content');await expect(page.locator('#boardName')).toHaveText('· Alpha（本機）');await page.reload();await page.locator('#homeRouteLocal').click();await expect(page.locator('#homeCurrentName')).toHaveText('Alpha');await expect(page.locator('#homeLocalList .home-board')).toHaveCount(2);await page.locator('#homeLocalList .home-board').filter({hasText:'Beta'}).click();await expect(page.locator('.ctitle')).toHaveText('Beta content');
});
test('Drive login and board selection work directly from the start screen',async({page})=>{
  const api=await mockDrive(page);await boot(page,{showHome:true});await page.locator('#homeContinue').click();await expect(page.locator('#homeDriveList .home-board')).toHaveCount(2);expect(api.writes).toHaveLength(0);await page.locator('#homeDriveList .home-board').filter({hasText:'Board A'}).click();await expect(page.locator('#home')).toBeHidden();await expect(page.locator('.ctitle')).toHaveText('Remote A');await page.locator('#btnHome').click();await expect(page.locator('#homeCurrentMeta')).toContainText('Google Drive');
});
test('Drive cache reload requires login and explicit cloud selection',async({page})=>{
  const api=await mockDrive(page);await boot(page);await openBoard(page);await page.reload();
  await expect(page.locator('#homeContinue')).toHaveText('登入 Google，開啟白板');await page.keyboard.press('Escape');await expect(page.locator('#home')).toBeVisible();
  await page.locator('#homeContinue').click();await expect(page.locator('#homeDriveList .home-board')).toHaveCount(2);await expect(page.locator('#home')).toBeVisible();
  await page.locator('#homeDriveList .home-board').filter({hasText:'Board A'}).click();await expect(page.locator('#home')).toBeHidden();await expect(page.locator('.ctitle')).toHaveText('Remote A');expect(api.writes).toHaveLength(0);
});
test('start screen import opens a named local board',async({page})=>{
  await mockDrive(page);await boot(page,{showHome:true});await page.locator('#homeRouteLocal').click();const chooser=page.waitForEvent('filechooser');await page.locator('#homeImport').click();await(await chooser).setFiles({name:'Imported plan.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(empty('Imported content')))});await expect(page.locator('#home')).toBeHidden();await expect(page.locator('#boardName')).toHaveText('· Imported plan（本機）');await expect(page.locator('.ctitle')).toHaveText('Imported content');
});
test('failed save blocks switching from start screen and preserves pending work',async({page})=>{
  const api=await mockDrive(page,{writeStatus:403});await boot(page);await openBoard(page);await editTitle(page,'Pending');await page.locator('#btnHome').click();await page.locator('#homeDriveList .home-board').filter({hasText:'Board B'}).click();await expect(page.locator('#homeStatus')).toContainText('取消切換');await expect(page.locator('#home')).toBeVisible();await expect(page.locator('#homeCurrentName')).toHaveText('Board A');api.writeStatus=200;await page.locator('#homeContinue').click();await expect(page.locator('.ctitle')).toHaveText('Pending');
});
test('start screen works at phone width without horizontal scrolling',async({page})=>{
  await mockDrive(page);await page.setViewportSize({width:390,height:700});await boot(page,{showHome:true});expect(await page.locator('#home').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await expect(page.locator('#homeContinue')).toBeInViewport();await page.locator('#home').screenshot({path:'/tmp/juice-start-screen-mobile.png'});
});

test('start screen creates a Drive board and pairs a new inbox',async({page})=>{
  const api=await mockDrive(page);await boot(page,{showHome:true});await page.locator('#homeContinue').click();await expect(page.locator('#homeDriveOption')).toBeEnabled();await page.locator('#homeNewName').fill('New cloud board');await page.locator('#homeCreateForm').getByRole('button',{name:'建立白板',exact:true}).click();await expect(page.locator('#home')).toBeHidden();await expect(page.locator('#boardName')).toHaveText('· New cloud board');expect(api.created.map(f=>f.name)).toEqual(['New cloud board.json','New cloud board-inbox.json']);expect(api.created[1].appProperties.juiceBoardId).toBe(api.created[0].id);
});

test.describe('mobile touch workflow',()=>{
  test.use({viewport:{width:390,height:700},hasTouch:true,isMobile:true});
  test('tap opens editor without moving the card and tools stay reachable',async({page})=>{
    await selectionBoard(page);const before=await stored(page);await page.locator('[data-id="one"].card').tap();await expect(page.locator('#panel')).toHaveClass('open');await expect(page.locator('#pTitle')).toHaveValue('One');await expect(page.locator('#pClose')).toHaveText('完成');await expect(page.locator('#pClose')).toBeInViewport();await expect(page.locator('#mobileNav')).toBeHidden();expect((await stored(page)).cards[0].x).toBe(before.cards[0].x);await page.locator('#pClose').tap();await expect(page.locator('#mobileNav')).toBeVisible();await page.screenshot({path:'/tmp/juice-mobile-canvas.png',animations:'disabled'});
  });
  test('touch drag browses the canvas until move mode is enabled',async({page})=>{
    await selectionBoard(page);const session=await page.context().newCDPSession(page);
    async function swipe(x,y,dx,dy){await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=5;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/5,y:y+dy*i/5}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    let box=await page.locator('[data-id="one"].card').boundingBox();await swipe(box.x+40,box.y+23,50,40);await expect(page.locator('#panel')).not.toHaveClass('open');await page.waitForTimeout(450);let data=await stored(page);expect(data.cards[0]).toMatchObject({x:100,y:100});expect(data.view).toMatchObject({x:50,y:40});await page.locator('#mobileMove').tap();await expect(page.locator('#mobileMove')).toHaveAttribute('aria-pressed','true');box=await page.locator('[data-id="one"].card').boundingBox();await swipe(box.x+40,box.y+23,40,30);await page.waitForTimeout(450);data=await stored(page);expect(data.cards[0]).toMatchObject({x:140,y:130});expect(data.view).toMatchObject({x:50,y:40});
  });
  test('mobile search finds card text and opens the result',async({page})=>{
    await selectionBoard(page);await page.locator('#mobileFind').tap();await page.locator('#mobileQuery').fill('Three');await expect(page.locator('#mobileResults button')).toHaveText('Three');await page.locator('#mobileResults button').tap();await expect(page.locator('#pTitle')).toHaveValue('Three');await expect(page.locator('#mobileFinder')).toBeHidden();
  });
  test('touch selection supports moving multiple cards together',async({page})=>{
    await mockDrive(page);await page.addInitScript(()=>localStorage.setItem('sju-whiteboard-v2',JSON.stringify({cards:[{id:'one',x:20,y:80,title:'One'},{id:'two',x:20,y:240,title:'Two'}],view:{x:0,y:0,zoom:1}})));await boot(page);await page.locator('#btnSelect').tap();await page.locator('[data-id="one"].card').tap();await page.locator('[data-id="two"].card').tap();await expect(page.locator('.card.sel')).toHaveCount(2);await page.locator('#mobileMove').tap();await expect(page.locator('#btnSelect')).toHaveAttribute('aria-pressed','false');
    const session=await page.context().newCDPSession(page),box=await page.locator('[data-id="one"].card').boundingBox(),x=box.x+50,y=box.y+25;await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=5;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+30*i/5,y:y+20*i/5}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(450);expect((await stored(page)).cards.map(c=>[c.x,c.y])).toEqual([[50,100],[50,260]]);
  });
  test('more tools work without horizontal toolbar scrolling',async({page})=>{
    await mockDrive(page);await boot(page);await page.locator('#mobileMore').tap();await expect(page.locator('#btnExport')).toBeInViewport();const download=page.waitForEvent('download');await page.locator('#btnExport').tap();await download;await expect(page.locator('#mobileMore')).toHaveAttribute('aria-expanded','false');expect(await page.locator('#mobileNav').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  });
  test('editor adapts to reduced viewport height and keeps completion visible',async({page})=>{
    await mockDrive(page);await boot(page);await page.locator('#btnAdd').tap();await page.setViewportSize({width:390,height:360});await expect(page.locator('#pClose')).toBeInViewport();await expect(page.locator('#panelMobileSave')).toBeInViewport();await expect(page.locator('#panel .ptools')).toBeHidden();await page.locator('#mobileAppearance').tap();await expect(page.locator('#panel .ptools')).toBeVisible();await page.locator('#mobileAppearance').tap();await page.locator('#pTitle').fill('Keyboard test');await expect(page.locator('#pTitle')).toHaveValue('Keyboard test');await page.setViewportSize({width:390,height:700});await page.locator('#panel').screenshot({path:'/tmp/juice-mobile-editor.png',animations:'disabled'});
  });
});

test.describe('mobile pinch and resizing',()=>{
  test.use({viewport:{width:390,height:700},hasTouch:true,isMobile:true});
  test('two finger zoom starting on a card never opens or moves it',async({page})=>{
    await selectionBoard(page);const session=await page.context().newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:140,y:177},{x:280,y:177}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:120,y:177},{x:300,y:177}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(450);await expect(page.locator('#panel')).not.toHaveClass('open');const data=await stored(page);expect(data.view.zoom).toBeGreaterThan(1);expect(data.cards[0]).toMatchObject({x:100,y:100});
  });
  test('changing to desktop restores the existing toolbar and preserves content',async({page})=>{
    await selectionBoard(page);await expect(page.locator('#mobileNav #btnAdd')).toBeVisible();await page.setViewportSize({width:844,height:390});await expect(page.locator('#mobileNav #btnAdd')).toBeVisible();await page.setViewportSize({width:1280,height:800});await expect(page.locator('#toolbarActions #btnAdd')).toBeVisible();await expect(page.locator('#mobileNav')).toBeHidden();await page.locator('[data-id="one"].card').dblclick();await expect(page.locator('#pTitle')).toHaveValue('One');await expect(page.locator('#pClose')).toHaveText('收起');
  });
});

test('connection status distinguishes login from the current board sync',async({page})=>{
  const api=await mockDrive(page);await boot(page,{showHome:true});
  await expect(page.locator('#homeConnectionText')).toHaveText('Google 未連線 · 尚未開啟雲端白板');
  await page.locator('#homeContinue').click();await expect(page.locator('#homeDriveList .home-board')).toHaveCount(2);
  await expect(page.locator('#homeConnectionText')).toHaveText('Google 已連線 · 尚未開啟雲端白板');
  await page.locator('#homeRouteLocal').click();await page.locator('#homeContinue').click();await expect(page.locator('#connectionText')).toHaveText('Google 已連線 · 此白板僅存本機');
  await expect(page.locator('#connectionAction')).toHaveText('選擇 Drive 白板');expect(api.writes).toHaveLength(0);
  await page.locator('#connectionAction').click();await page.locator('.drv-board-name').filter({hasText:'Board A'}).click();
  await expect(page.locator('#connectionText')).toHaveText('Google 已連線 · 此白板已同步 Drive');
  await page.reload();await expect(page.locator('#homeConnectionText')).toHaveText('Google 未連線 · 尚未開啟雲端白板');
  await page.keyboard.press('Escape');await expect(page.locator('#home')).toBeVisible();await expect(page.locator('#homeContinue')).toHaveText('登入 Google，開啟白板');expect(api.writes).toHaveLength(0);
});

test('connection status reflects failed saves and rejected Google authorization',async({page})=>{
  const api=await mockDrive(page,{writeStatus:403});await boot(page);await openBoard(page);await editTitle(page,'Unsaved');await page.locator('#btnSaveNow').click();
  await expect(page.locator('#connectionText')).toContainText('同步失敗');await expect(page.locator('#connectionAction')).toHaveText('立即同步');
  api.writeStatus=200;await page.locator('#connectionAction').click();await expect(page.locator('#connectionText')).toContainText('已同步 Drive');
  await page.route('https://www.googleapis.com/drive/v3/files/a?alt=media',r=>r.fulfill({status:401,body:'expired'}));
  await editTitle(page,'Expired');await page.locator('#btnSaveNow').click();await expect(page.locator('#connectionText')).toHaveText('Google 授權已到期 · 此白板暫停同步');await expect(page.locator('#connectionAction')).toHaveText('重新登入 Google');
});

test('cloud starts first and local editing requires choosing the local route',async({page})=>{
  await mockDrive(page);await boot(page,{showHome:true});await expect(page.locator('#homeRouteDrive')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#homeImport')).toBeHidden();await expect(page.locator('#homeLocalSection')).toBeHidden();
  await page.keyboard.press('Escape');await expect(page.locator('#home')).toBeVisible();await page.locator('#homeRouteLocal').click();await expect(page.locator('#homeDriveSection')).toBeHidden();await page.locator('#homeContinue').click();await expect(page.locator('#home')).toBeHidden();await expect(page.locator('#connectionText')).toContainText('僅存本機');
});

test('legacy pending cache is compared and can be saved separately without cloud overwrite',async({page})=>{
  const api=await mockDrive(page);await page.addInitScript(()=>{const state={boardId:'legacy',cards:[{id:'old',title:'Unsynced legacy content'}],view:{x:0,y:0,zoom:1}};localStorage.setItem('sju-whiteboard-v2',JSON.stringify(state));localStorage.setItem('sju-workspace-meta',JSON.stringify({kind:'drive',id:'a',name:'Board A',boardId:'legacy'}));});
  await boot(page,{showHome:true});await page.locator('#homeContinue').click();await page.locator('#homeDriveList .home-board').filter({hasText:'Board A'}).click();await expect(page.locator('#recoveryDialog')).toBeVisible();await expect(page.locator('#recoveryLocalSummary')).toContainText('Unsynced legacy content');await expect(page.locator('#recoveryRemoteSummary')).toContainText('Remote A');
  await page.locator('#recoveryDialog button[value="cancel"]').click();await expect(page.locator('#home')).toBeVisible();expect(api.writes).toHaveLength(0);
  await page.locator('#homeDriveList .home-board').filter({hasText:'Board A'}).click();await page.locator('#recoveryDialog button[value="local"]').click();await expect(page.locator('#home')).toBeHidden();await expect(page.locator('.ctitle')).toHaveText('Remote A');expect(api.writes).toHaveLength(0);
  await page.locator('#btnHome').click();await page.locator('#homeRouteLocal').click();await page.locator('#homeLocalList .home-board').filter({hasText:'Board A（復原副本）'}).click();await expect(page.locator('.ctitle')).toHaveText('Unsynced legacy content');await expect(page.locator('#connectionText')).toContainText('僅存本機');
});

test('expired cloud authorization locks editing and another account never inherits the binding',async({page})=>{
  const api=await mockDrive(page,{writeStatus:401});await boot(page);await openBoard(page);await editTitle(page,'Alice pending');await page.locator('#btnSaveNow').click();await expect(page.locator('#home')).toBeVisible();expect(await page.locator('#app').evaluate(el=>el.inert)).toBe(true);await page.keyboard.press('Escape');await expect(page.locator('#home')).toBeVisible();
  api.user={permissionId:'user-b',emailAddress:'bob@example.test',displayName:'Bob'};api.writeStatus=200;await page.locator('#homeContinue').click();await expect(page.locator('#homeAccount')).toContainText('bob@example.test');await expect(page.locator('#homeCurrentName')).not.toHaveText('Board A');
  expect(await page.evaluate(async()=>{const record=await JuiceCore.get('drive-recovery:user-a');return record.state.cards[0].title;})).toBe('Alice pending');
  await page.locator('#homeDriveList .home-board').filter({hasText:'Board B'}).click();await expect(page.locator('.ctitle')).toHaveText('Remote B');expect(api.writes).toHaveLength(1);expect(JSON.parse(api.files.a).cards[0].title).toBe('Remote A');
  await page.locator('#btnHome').click();await page.locator('#homeLogout').click();await expect(page.locator('#homeAccount')).toHaveText('尚未登入 Google');await page.keyboard.press('Escape');await expect(page.locator('#home')).toBeVisible();
  api.user={permissionId:'user-a',emailAddress:'alice@example.test',displayName:'Alice'};await page.locator('#homeContinue').click();await expect(page.locator('#homeAccount')).toContainText('alice@example.test');await page.locator('#homeDriveList .home-board').filter({hasText:'Board A'}).click();await expect(page.locator('#recoveryLocalSummary')).toContainText('Alice pending');await page.locator('#recoveryDialog button[value="local"]').click();await expect(page.locator('.ctitle')).toHaveText('Remote A');
});

test('failed identity lookup never enables cloud creation or binding',async({page})=>{
  const api=await mockDrive(page);api.user={};await boot(page,{showHome:true});await page.locator('#homeContinue').click();await expect(page.locator('#homeStatus')).toContainText('無法確認 Google 帳號');await expect(page.locator('#homeAccount')).toHaveText('尚未登入 Google');await expect(page.locator('#homeDriveList')).toBeHidden();expect(api.writes).toHaveLength(0);
});

test('timed authorization expiry returns to the cloud gate and same account can reconnect',async({page})=>{
  await mockDrive(page);await page.clock.install();await boot(page);await openBoard(page);await page.clock.fastForward(3600001);await expect(page.locator('#home')).toBeVisible();await expect(page.locator('#homeContinue')).toHaveText('登入 Google，開啟白板');await page.keyboard.press('Escape');await expect(page.locator('#home')).toBeVisible();
  await page.locator('#homeContinue').click();await expect(page.locator('#homeAccount')).toContainText('alice@example.test');await expect(page.locator('#homeContinue')).toHaveText('繼續編輯雲端白板');await page.locator('#homeContinue').click();await expect(page.locator('.ctitle')).toHaveText('Remote A');
});

test('logging in from local editor cannot expose a restored cloud cache for editing',async({page})=>{
  await mockDrive(page);await boot(page);await page.evaluate(async()=>{await JuiceCore.set('drive-recovery:user-a',{meta:{kind:'cache',id:'a',ownerId:'user-a',pending:true,name:'Private cloud'},state:{boardId:'pending-a',cards:[{id:'private',title:'Pending cloud content'}]}});});
  await page.locator('#btnDrive').click();await expect(page.locator('#home')).toBeVisible();await expect(page.locator('#homeAccount')).toContainText('alice@example.test');await page.keyboard.press('Escape');await expect(page.locator('#home')).toBeVisible();expect(await page.locator('#app').evaluate(el=>el.inert)).toBe(true);
  await page.locator('#homeDriveList .home-board').filter({hasText:'Board A'}).click();await expect(page.locator('#recoveryLocalSummary')).toContainText('Pending cloud content');await page.locator('#recoveryDialog button[value="cancel"]').click();await expect(page.locator('#home')).toBeVisible();
});
