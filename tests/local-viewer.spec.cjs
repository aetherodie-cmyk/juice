const {test,expect} = require('@playwright/test');

const tinyImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=';
const board = {
  schemaVersion:3,boardId:'readonly-test',savedAt:1000,view:{x:20,y:30,zoom:1},
  cards:[
    {id:'first',x:40,y:50,w:280,color:'navy',title:'深色卡片',blocks:[{id:'text',type:'text',html:'<b>安全文字</b><script>window.viewerAttack=true</script>'},{id:'pic',type:'image',src:tinyImage}],tags:['重要']},
    {id:'second',x:420,y:80,w:300,title:'流程卡片',blocks:[{id:'flow',type:'diagram',html:'flowchart LR\n A[開始] --> B[結束]'}]}
  ],
  links:[{id:'route',from:'first',to:'second',dir:'to',style:'orthogonal',label:'下一步',manual:true,bend:{x:20,y:30}}],
  groups:[{id:'group',x:20,y:20,w:740,h:330,title:'測試群組'}],
  images:[{id:'background',x:20,y:360,w:100,src:tinyImage,layer:'below'}],
  icons:[{id:'icon',x:150,y:360,name:'star',size:42,layer:'above'}],
  notes:[{id:'note',x:230,y:360,w:220,text:'唯讀備註',size:20,color:'#2A3038',layer:'above'}]
};

test('local Classic JSON renders without editor or persistence', async ({page}) => {
  await page.addInitScript(() => {
    window.viewerWrites = [];
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) { window.viewerWrites.push('storage'); return setItem.apply(this,args); };
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) { window.viewerWrites.push('indexedDB'); return open.apply(this,args); };
  });
  await page.goto('/view.html');
  await page.locator('#viewerFile').setInputFiles({name:'acceptance.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(board))});
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('.card-dark')).toHaveCount(1);
  await expect(page.locator('.group .gtitle')).toHaveText('測試群組');
  await expect(page.locator('.noteobj')).toHaveText('唯讀備註');
  await expect(page.locator('.iconobj')).toHaveText('⭐');
  await expect(page.locator('#linkLayer g')).toHaveCount(1);
  await expect(page.locator('.linklabel')).toHaveText('下一步');
  await expect(page.locator('.card .pvimg')).toHaveCount(1);
  await page.locator('.card .pvimg').click();
  await expect(page.locator('#viewerImage')).toBeVisible();
  await page.locator('#viewerImage button').click();
  await expect(page.locator('#viewerImage')).not.toBeVisible();
  if (await page.locator('.viewer-flow-open').isEnabled()) {
    await page.locator('.viewer-flow-open').click();
    await expect(page.locator('#classicFlowReader')).toBeVisible();
    await page.locator('#classicFlowReader [data-reader-close]').click();
  }
  expect(await page.evaluate(() => window.viewerAttack)).toBeUndefined();
  expect(await page.locator('[contenteditable]').count()).toBe(0);
  expect(await page.locator('script[src="assets/app.js"]').count()).toBe(0);
  await expect(page.locator('#viewerStatus')).toContainText('本機唯讀');
  const before = await page.locator('#world').evaluate(element => element.style.transform);
  await page.locator('#viewerIn').click();
  await expect(page.locator('#world')).not.toHaveAttribute('style',`transform: ${before};`);
  const position = await page.locator('.card[data-id="first"]').evaluate(element => [element.style.left,element.style.top]);
  await page.mouse.move(900,450); await page.mouse.down(); await page.mouse.move(980,490); await page.mouse.up();
  expect(await page.locator('.card[data-id="first"]').evaluate(element => [element.style.left,element.style.top])).toEqual(position);
  expect(await page.evaluate(() => window.viewerWrites)).toEqual([]);
  await page.reload();
  await expect(page.locator('.card')).toHaveCount(0);
});

test('invalid JSON never replaces the displayed board', async ({page}) => {
  await page.goto('/view.html');
  await page.locator('#viewerFile').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(board))});
  await page.locator('#viewerFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('#viewerStatus')).toContainText('無法載入');
});

async function mockCloud(page) {
  const cloud = {version:1,body:JSON.stringify(board),allowed:true,networkError:false,requests:[],account:'viewer@example.test'};
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({contentType:'application/javascript',body:'window.google={accounts:{oauth2:{initTokenClient:options=>({requestAccessToken:()=>options.callback({access_token:"test-token",expires_in:3600})})}}};'}));
  await page.route('https://apis.google.com/js/api.js', route => route.fulfill({contentType:'application/javascript',body:'window.gapi={load:(_name,options)=>options.callback()};'}));
  await page.route('https://www.googleapis.com/**', route => {
    const request = route.request(), url = new URL(request.url());
    cloud.requests.push({method:request.method(),path:url.pathname,query:url.search});
    if (url.pathname.endsWith('/about')) return route.fulfill({contentType:'application/json',body:JSON.stringify({user:{permissionId:'viewer',emailAddress:cloud.account}})});
    if (!cloud.allowed) return route.fulfill({status:403,body:'{}'});
    if (cloud.networkError) return route.fulfill({status:503,body:'{}'});
    if (url.searchParams.get('alt') === 'media') return route.fulfill({contentType:'application/json',body:cloud.body});
    return route.fulfill({contentType:'application/json',body:JSON.stringify({name:'test-board.json',mimeType:'application/json',modifiedTime:'2026-10-29T09:00:00Z',version:String(cloud.version),trashed:false})});
  });
  return cloud;
}

test('fixed Drive link is read-only and updates in place without losing view', async ({page}) => {
  const cloud = await mockCloud(page);
  await page.addInitScript(() => {
    window.viewerWrites = [];
    Storage.prototype.setItem = function () { window.viewerWrites.push('localStorage'); };
    IDBFactory.prototype.open = function () { window.viewerWrites.push('indexedDB'); throw new Error('viewer must not open IndexedDB'); };
  });
  await page.goto('/view.html?file=testfile123456');
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.locator('#viewerLocalLoad')).toBeHidden();
  await page.locator('#viewerLogin').click();
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('#viewerAccount')).toHaveText('viewer@example.test');
  const initialView = await page.locator('#world').evaluate(element => element.style.transform);
  cloud.version = 2;
  cloud.body = JSON.stringify({...board,cards:[{...board.cards[0],title:'雲端新版'},board.cards[1]]});
  await page.locator('#viewerRefresh').click();
  await expect(page.locator('.card[data-id="first"] .ctitle')).toHaveText('雲端新版');
  expect(await page.locator('#world').evaluate(element => element.style.transform)).toBe(initialView);
  expect(cloud.requests.every(request => request.method === 'GET')).toBe(true);
  expect(await page.evaluate(() => window.viewerWrites)).toEqual([]);
  await page.locator('#viewerLogout').click();
  await expect(page.locator('.card')).toHaveCount(0);
});

test('permission denial never displays cloud content and requires file authorization', async ({page}) => {
  const cloud = await mockCloud(page); cloud.allowed = false;
  await page.goto('/view.html?file=testfile123456');
  await page.locator('#viewerLogin').click();
  await expect(page.locator('#viewerStatus')).toContainText('無法讀取指定檔案');
  await expect(page.locator('#viewerPicker')).toBeVisible();
  await expect(page.locator('.card')).toHaveCount(0);
  await page.locator('#viewerPicker').click();
  await expect(page.locator('#viewerStatus')).toContainText('尚未設定 Google Picker API key');
  expect(cloud.requests.every(request => request.method === 'GET')).toBe(true);
});

test('revoked access clears already displayed board', async ({page}) => {
  const cloud = await mockCloud(page);
  await page.goto('/view.html?file=testfile123456');
  await page.locator('#viewerLogin').click();
  await expect(page.locator('.card')).toHaveCount(2);
  cloud.allowed = false;
  await page.locator('#viewerRefresh').click();
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.locator('#viewerStatus')).toContainText('已停止讀取並清除內容');
  await expect(page.locator('#viewerRefresh')).toBeDisabled();
});
