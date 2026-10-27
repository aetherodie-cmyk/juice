const {test,expect}=require('@playwright/test');

const board=(cards,links)=>({schemaVersion:3,boardId:'issue-17-test',cards,links,groups:[],images:[],icons:[],notes:[],view:{x:0,y:0,zoom:1},savedAt:1});
async function boot(page,data){await page.addInitScript(value=>{if(!localStorage.getItem('sju-whiteboard-v2'))localStorage.setItem('sju-whiteboard-v2',JSON.stringify(value));},data);await page.goto('/');await page.locator('#homeRouteLocal').click();await page.locator('#homeContinue').click();await expect(page.locator('#linkLayer g[data-id]')).toHaveCount(data.links.length);}
async function saved(page){await page.waitForTimeout(450);return page.evaluate(()=>JSON.parse(localStorage.getItem('sju-whiteboard-v2')));}
async function clickLink(page,id){const point=await page.locator(`#linkLayer [data-id="${id}"] .lvis`).evaluate(path=>{const value=path.getPointAtLength(path.getTotalLength()/2);return{x:value.x,y:value.y};});const canvas=await page.locator('#canvas').boundingBox();await page.mouse.click(canvas.x+point.x,canvas.y+point.y);await expect(page.locator('#linkbar')).toBeVisible();}
async function dragHandle(page,id,part,point){const handle=await page.locator(`#linkTips [data-link-id="${id}"] [data-part="${part}"]`).boundingBox(),canvas=await page.locator('#canvas').boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(canvas.x+point.x,canvas.y+point.y,{steps:6});await page.mouse.up();}
async function endpoint(page,id){return page.locator(`#linkLayer [data-id="${id}"] .lvis`).evaluate(path=>{const value=path.getPointAtLength(path.getTotalLength());return{x:value.x,y:value.y,d:path.getAttribute('d')};});}
async function lastSegment(page,id){return page.locator(`#linkLayer [data-id="${id}"] .lvis`).evaluate(path=>{const length=path.getTotalLength(),before=path.getPointAtLength(Math.max(0,length-4)),end=path.getPointAtLength(length);return{before:{x:before.x,y:before.y},end:{x:end.x,y:end.y}};});}

test('legacy whiteboard links stay compatible and route fields survive normalization',async({page})=>{
  const original=board([{id:'a',title:'Old A',x:40,y:50},{id:'b',title:'Old B',x:410,y:90}],[{id:'old',from:'a',to:'b',dir:'to',label:'existing'}]);
  await boot(page,original);expect((await saved(page)).links[0]).toEqual(original.links[0]);
  const normalized=await page.evaluate(value=>JuiceCore.normalize(value),{...original,links:[{...original.links[0],style:'orthogonal',startAnchor:{side:'left',t:.32},endAnchor:{side:'right',t:.65},manual:true,bend:{x:-70,y:85}}]});
  expect(normalized.links[0]).toMatchObject({from:'a',to:'b',style:'orthogonal',startAnchor:{side:'left',t:.32},endAnchor:{side:'right',t:.65},manual:true,bend:{x:-70,y:85}});
  await expect(page.evaluate(value=>JuiceCore.normalize(value),{...original,links:[{...original.links[0],endAnchor:{side:'diagonal',t:2}}]})).rejects.toThrow();
});

test('case A: T02 inlet, orthogonal bend and arrow survive reload',async({page})=>{
  await boot(page,board([{id:'middle',title:'中台傳送訂單',x:70,y:80,w:220},{id:'t02',title:'T02',x:480,y:320,w:200}],[{id:'case-a',from:'middle',to:'t02',dir:'to',label:'訂單'}]));
  await clickLink(page,'case-a');
  await dragHandle(page,'case-a','end',{x:480,y:350});
  await page.locator('#linkbar [data-style="orthogonal"]').click();
  await dragHandle(page,'case-a','control1',{x:365,y:245});
  let link=(await saved(page)).links[0];expect(link).toMatchObject({from:'middle',to:'t02',endAnchor:{side:'left'},style:'orthogonal',manual:true});
  expect((await endpoint(page,'case-a')).x).toBeCloseTo(480,1);
  const arrival=await lastSegment(page,'case-a');expect(arrival.before.x).toBeLessThan(arrival.end.x);
  expect(await page.locator('#linkLayer [data-id="case-a"] .lvis').getAttribute('marker-end')).toBe('url(#arrowhead)');
  await page.reload();await page.locator('#homeRouteLocal').click();await page.locator('#homeContinue').click();
  expect((await saved(page)).links[0]).toEqual(link);expect((await endpoint(page,'case-a')).x).toBeCloseTo(480,1);
  const target=await page.locator('.card[data-id="t02"]').boundingBox();await page.mouse.move(target.x+55,target.y+20);await page.mouse.down();await page.mouse.move(target.x+135,target.y+60,{steps:6});await page.mouse.up();
  const moved=(await saved(page)).links[0];expect(moved.bend).toEqual(link.bend);expect(moved.endAnchor).toEqual(link.endAnchor);expect((await endpoint(page,'case-a')).x).toBeCloseTo(560,1);
});

test('case B: one business link supports left and right alternate routes without moving nodes',async({page})=>{
  await boot(page,board([{id:'decision',title:'找到可用客編？',x:470,y:80,w:220},{id:'erp',title:'ERP 比對或建立客編',x:120,y:330,w:240}],[{id:'case-b',from:'decision',to:'erp',dir:'to',label:'否'}]));
  await clickLink(page,'case-b');
  await dragHandle(page,'case-b','start',{x:470,y:120});
  await dragHandle(page,'case-b','end',{x:360,y:370});
  await page.locator('#linkbar [data-style="orthogonal"]').click();
  await dragHandle(page,'case-b','control1',{x:55,y:250});
  const first=(await saved(page)).links[0];expect(first).toMatchObject({startAnchor:{side:'left'},endAnchor:{side:'right'},style:'orthogonal',manual:true});
  const firstTip=await endpoint(page,'case-b');expect(firstTip.x).toBeCloseTo(360,1);
  const firstArrival=await lastSegment(page,'case-b');expect(firstArrival.before.x).toBeGreaterThan(firstArrival.end.x);
  await page.locator('#linkbar [data-style="curve"]').click();
  await dragHandle(page,'case-b','start',{x:690,y:120});
  await dragHandle(page,'case-b','control1',{x:800,y:190});
  const second=(await saved(page)).links[0];expect(second).toMatchObject({startAnchor:{side:'right'},style:'curve',manual:true});
  const secondTip=await endpoint(page,'case-b');expect(secondTip.x).toBeCloseTo(360,1);
  const secondArrival=await lastSegment(page,'case-b');expect(secondArrival.before.x).toBeGreaterThan(secondArrival.end.x);
  expect((await saved(page)).links).toHaveLength(1);
  expect((await saved(page)).cards.map(card=>({id:card.id,x:card.x,y:card.y}))).toEqual([{id:'decision',x:470,y:80},{id:'erp',x:120,y:330}]);
  await page.reload();await page.locator('#homeRouteLocal').click();await page.locator('#homeContinue').click();expect((await saved(page)).links[0]).toEqual(second);expect((await endpoint(page,'case-b')).d).toBe(secondTip.d);
  await clickLink(page,'case-b');
  await page.locator('#linkReset').click();const reset=(await saved(page)).links[0];expect(reset.startAnchor).toBeUndefined();expect(reset.endAnchor).toBeUndefined();expect(reset.manual).toBe(false);
});

test('manual anchor tracks diagram card resize while route offsets stay unchanged',async({page})=>{
  const data=board([{id:'source',title:'Source',x:80,y:80,w:220},{id:'flow',title:'Flow card',x:500,y:300,w:380,blocks:[{id:'diagram',type:'diagram',html:'flowchart LR\n A --> B'}]}],[{id:'resizing',from:'source',to:'flow',dir:'to',label:'',style:'orthogonal',endAnchor:{side:'top',t:.5},manual:true,bend:{x:40,y:-20}}]);
  await boot(page,data);const before=await endpoint(page,'resizing');await page.locator('.card[data-id="flow"]').click();const handle=await page.locator('.card[data-id="flow"] .card-resize').boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+120,handle.y+handle.height/2,{steps:6});await page.mouse.up();
  const after=await endpoint(page,'resizing'),savedLink=(await saved(page)).links[0];expect(after.x-before.x).toBeCloseTo(60,0);expect(savedLink.bend).toEqual({x:40,y:-20});expect(savedLink.endAnchor).toEqual({side:'top',t:.5});
});

test('moving an unrelated card never recalculates a manual link',async({page})=>{
  const data=board([{id:'a',title:'A',x:70,y:80},{id:'b',title:'B',x:470,y:290},{id:'other',title:'Unrelated',x:760,y:180}],[{id:'fixed',from:'a',to:'b',dir:'to',label:'',style:'curve',startAnchor:{side:'right',t:.35},endAnchor:{side:'top',t:.7},manual:true,curveControls:[{x:140,y:20},{x:30,y:-90}]}]);
  await boot(page,data);const before=await endpoint(page,'fixed'),card=await page.locator('.card[data-id="other"]').boundingBox();
  await page.mouse.move(card.x+40,card.y+20);await page.mouse.down();await page.mouse.move(card.x+100,card.y+65,{steps:5});await page.mouse.up();
  expect((await endpoint(page,'fixed')).d).toBe(before.d);expect((await saved(page)).links[0]).toMatchObject(data.links[0]);
});
