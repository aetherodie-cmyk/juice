const {test,expect}=require('@playwright/test');
const empty=(title='')=>({cards:title?[{id:'card1',title,blocks:[{id:'block1',type:'text',html:'Hello'}],tags:[]}]:[],links:[],groups:[],images:[],view:{x:0,y:0,zoom:1},savedAt:123});
async function mockDrive(page,{writeStatus=200,bad=false,name='Board A.json'}={}){
  const api={files:{a:JSON.stringify(empty('Remote A')),b:bad?'not json':JSON.stringify(empty('Remote B')),ia:JSON.stringify({version:1,inbox:[]}),ib:JSON.stringify({version:1,inbox:[]})},writes:[],reads:[],writeStatus,listPage:0,created:[]};
  await page.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'application/javascript',body:`window.google={accounts:{oauth2:{initTokenClient:opts=>({requestAccessToken:()=>opts.callback({access_token:'mock-token',expires_in:3600})})}}};`}));
  await page.route('https://www.googleapis.com/**',async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method();
    const reply=(body,status=200,extra={})=>route.fulfill({status,contentType:typeof body==='string'?'application/json':'application/json',headers:{etag:'"mock"',...extra},body:typeof body==='string'?body:JSON.stringify(body)});
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
test.afterEach(async({page})=>{expect(page.appErrors||[]).toEqual([]);});
async function boot(page,{showHome=false}={}){const errors=[];page.appErrors=errors;page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR:',e.stack);});await page.goto('/');await expect(page.locator('#home')).toBeVisible();if(!showHome&&await page.locator('#homeContinue').isEnabled())await page.locator('#homeContinue').click();await expect(page.locator('#btnAdd')).toBeVisible();return errors;}
async function openBoard(page,name='Board A'){await page.locator('#btnDrive').click();await expect(page.locator('.drv-board-name').first()).toBeVisible();await page.locator('.drv-board-name').filter({hasText:name}).click();await expect(page.locator('#boardName')).toHaveText('· '+name);}
async function editTitle(page,title){await page.locator('.card').first().dblclick();await page.locator('#pTitle').fill(title);await page.locator('#pClose').click();}
async function stored(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('sju-whiteboard-v2')));}

test('create, edit, reload and legacy entry share the same app',async({page})=>{
  await mockDrive(page);const errors=await boot(page);await page.locator('#btnAdd').click();await page.locator('#pTitle').fill('Local board');await page.locator('#pClose').click();await page.waitForTimeout(500);
  expect((await stored(page)).cards[0].title).toBe('Local board');await page.goto('/whiteboard.html');await expect(page).toHaveURL(/index.html/);await page.locator('#homeContinue').click();await expect(page.locator('.ctitle')).toHaveText('Local board');expect(errors).toEqual([]);
});
test('sanitizer removes active content but preserves supported formatting',async({page})=>{
  await mockDrive(page);await boot(page);
  const result=await page.evaluate(()=>JuiceCore.sanitize('<b onclick="alert(1)">bold</b><img src=x onerror="alert(1)"><svg onload="alert(1)"></svg><a href="javascript:alert(1)">bad</a><span style="color:red;background-image:url(https://evil.test)">red</span><a href="https://example.com">good</a>'));
  expect(result).toContain('<b>bold</b>');expect(result).not.toMatch(/onclick|onerror|onload|javascript:|<img|<svg|background-image/);expect(result).toContain('noopener noreferrer');expect(result).toContain('color: red');
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
  await boot(page);await openBoard(page);await page.locator('#btnInbox').click();await expect(page.locator('.ib-ok')).toBeVisible();api.writeStatus=403;await page.locator('.ib-ok').click();await expect(page.locator('#banner')).toContainText('待審卡已保留');expect(JSON.parse(api.files.ia).inbox).toHaveLength(1);
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
async function chooseSync(page,label){await page.locator('#btnSync').click();await page.locator('.bmenu').getByText(label,{exact:true}).click();}

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
  await boot(page);await openBoard(page);await page.locator('#btnInbox').click();
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
  await page.locator('#btnRecovery').click();const download=page.waitForEvent('download');await page.locator('.bmenu .mi').first().click();expect((await download).suggestedFilename()).toMatch(/^whiteboard-recovered-/);expect((await page.evaluate(()=>JuiceCore.backups())).some(s=>s.value.cards?.[0]?.title==='Before delete')).toBe(true);
});

test('local inbox uses a persistent source ID and saves the board before removing the item',async({page})=>{
  await mockDrive(page);await mockLocalFile(page,JSON.stringify({version:1,inbox:[{id:'local-item',title:'Local AI',blocks:[]}]}));await boot(page);await page.locator('#btnInbox').click();await page.locator('#ibLink').click();await expect(page.locator('.ib-ok')).toBeVisible();await page.locator('.ib-ok').click();await expect(page.locator('.ib-ok')).toHaveCount(0);
  const board=await stored(page);expect(board.cards[0].title).toBe('Local AI');expect(board.cards[0].sourceInbox).toMatch(/^file:[a-f0-9-]+:local-item$/);expect(await page.evaluate(async()=>JSON.parse(await(await testHandle.getFile()).text()).inbox)).toEqual([]);
});
test('legacy text and rich HTML migrate without active attributes',async({page})=>{
  await mockDrive(page);await boot(page);const data=await page.evaluate(()=>JuiceCore.normalize({cards:[{id:'old',text:'Old title\nBody <literal>'},{id:'rich',body:'<b onclick="alert(1)">Rich</b>'}]}));expect(data.cards[0].title).toBe('Old title');expect(data.cards[0].blocks[0].html).toBe('Body &lt;literal&gt;');expect(data.cards[1].blocks[0].html).toBe('<b>Rich</b>');expect(data.schemaVersion).toBe(3);
});
test('toolbar remains scrollable at phone width',async({page})=>{
  await mockDrive(page);await page.setViewportSize({width:390,height:844});await boot(page);await page.locator('#btnRecovery').click();await expect(page.locator('#banner')).toHaveText('目前還沒有復原快照');await page.locator('#btnAdd').click();await expect(page.locator('#panel')).toHaveClass('open');await expect(page.locator('#pClose')).toBeInViewport();
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
  await selectionBoard(page);await selectFirstTwo(page);await rectangle(page,140,177,200,217);await page.locator('#btnUndo').click();await page.waitForTimeout(500);expect((await stored(page)).cards.map(c=>[c.x,c.y])).toEqual([[100,100],[400,100],[800,400]]);
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

async function createHomeLocal(page,name){await page.locator('#homeNewName').fill(name);await page.locator('#homeDestination').selectOption('local');await page.locator('#homeCreateForm').getByRole('button',{name:'建立白板',exact:true}).click();await expect(page.locator('#home')).toBeHidden();}
test('start screen offers optional login and safely continues the cached board',async({page})=>{
  await mockDrive(page);await page.addInitScript(data=>localStorage.setItem('sju-whiteboard-v2',JSON.stringify(data)),{...empty('Previous work'),savedAt:Date.now()});await boot(page,{showHome:true});await expect(page.locator('#homeLogin')).toBeVisible();await expect(page.locator('#homeCurrentMeta')).toContainText('1 張卡片');await expect(page.locator('#homeContinue')).toHaveText('繼續編輯');await page.locator('#homeContinue').click();await expect(page.locator('.ctitle')).toHaveText('Previous work');await page.locator('#btnHome').click();await expect(page.locator('#home')).toBeVisible();await page.locator('#home').screenshot({path:'/tmp/juice-start-screen.png'});
});
test('named local boards retain separate contents across switching and reload',async({page})=>{
  await mockDrive(page);await boot(page,{showHome:true});await createHomeLocal(page,'Alpha');await page.locator('#btnAdd').click();await page.locator('#pTitle').fill('Alpha content');await page.locator('#btnHome').click();await expect(page.locator('#homeLocalList .home-board strong')).toHaveText(['Alpha']);await createHomeLocal(page,'Beta');await page.locator('#btnAdd').click();await page.locator('#pTitle').fill('Beta content');await page.locator('#btnHome').click();await expect(page.locator('#homeLocalList .home-board')).toHaveCount(2);await page.locator('#homeLocalList .home-board').filter({hasText:'Alpha'}).click();await expect(page.locator('.ctitle')).toHaveText('Alpha content');await expect(page.locator('#boardName')).toHaveText('· Alpha（本機）');await page.reload();await expect(page.locator('#homeCurrentName')).toHaveText('Alpha');await expect(page.locator('#homeLocalList .home-board')).toHaveCount(2);await page.locator('#homeLocalList .home-board').filter({hasText:'Beta'}).click();await expect(page.locator('.ctitle')).toHaveText('Beta content');
});
test('Drive login and board selection work directly from the start screen',async({page})=>{
  const api=await mockDrive(page);await boot(page,{showHome:true});await page.locator('#homeLogin').click();await expect(page.locator('#homeDriveList .home-board')).toHaveCount(2);expect(api.writes).toHaveLength(0);await page.locator('#homeDriveList .home-board').filter({hasText:'Board A'}).click();await expect(page.locator('#home')).toBeHidden();await expect(page.locator('.ctitle')).toHaveText('Remote A');await page.locator('#btnHome').click();await expect(page.locator('#homeCurrentMeta')).toContainText('Google Drive');
});
test('Drive cache reload is labelled as an offline copy and never writes automatically',async({page})=>{
  const api=await mockDrive(page);await boot(page);await openBoard(page);await page.reload();await expect(page.locator('#homeCurrentName')).toHaveText('Board A');await expect(page.locator('#homeCurrentMeta')).toContainText('本機副本');await page.locator('#homeContinue').click();await expect(page.locator('#boardName')).toContainText('本機副本');expect(api.writes).toHaveLength(0);
});
test('start screen import opens a named local board',async({page})=>{
  await mockDrive(page);await boot(page,{showHome:true});const chooser=page.waitForEvent('filechooser');await page.locator('#homeImport').click();await(await chooser).setFiles({name:'Imported plan.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(empty('Imported content')))});await expect(page.locator('#home')).toBeHidden();await expect(page.locator('#boardName')).toHaveText('· Imported plan（本機）');await expect(page.locator('.ctitle')).toHaveText('Imported content');
});
test('failed save blocks switching from start screen and preserves pending work',async({page})=>{
  const api=await mockDrive(page,{writeStatus:403});await boot(page);await openBoard(page);await editTitle(page,'Pending');await page.locator('#btnHome').click();await page.locator('#homeDriveList .home-board').filter({hasText:'Board B'}).click();await expect(page.locator('#homeStatus')).toContainText('取消切換');await expect(page.locator('#home')).toBeVisible();await expect(page.locator('#homeCurrentName')).toHaveText('Board A');api.writeStatus=200;await page.locator('#homeContinue').click();await expect(page.locator('.ctitle')).toHaveText('Pending');
});
test('start screen works at phone width without horizontal scrolling',async({page})=>{
  await mockDrive(page);await page.setViewportSize({width:390,height:700});await boot(page,{showHome:true});expect(await page.locator('#home').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await expect(page.locator('#homeContinue')).toBeInViewport();await page.locator('#home').screenshot({path:'/tmp/juice-start-screen-mobile.png'});
});

test('start screen creates a Drive board and pairs a new inbox',async({page})=>{
  const api=await mockDrive(page);await boot(page,{showHome:true});await page.locator('#homeLogin').click();await expect(page.locator('#homeDriveOption')).toBeEnabled();await page.locator('#homeNewName').fill('New cloud board');await page.locator('#homeDestination').selectOption('drive');await page.locator('#homeCreateForm').getByRole('button',{name:'建立白板',exact:true}).click();await expect(page.locator('#home')).toBeHidden();await expect(page.locator('#boardName')).toHaveText('· New cloud board');expect(api.created.map(f=>f.name)).toEqual(['New cloud board.json','New cloud board-inbox.json']);expect(api.created[1].appProperties.juiceBoardId).toBe(api.created[0].id);
});
