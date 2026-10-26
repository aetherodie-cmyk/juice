const {test}=require('node:test');
const assert=require('node:assert/strict');
const Library=require('../assets/flow-library-core.js');
const timestamp='2026-10-26T00:00:00.000Z';
const display=(x=40)=>({x,y:80,w:480,h:180,density:'overview'});
const storage=()=>{const values=new Map();return{getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,value)};};
function threeBoards(){
  let data=Library.createFlow(Library.blank(),{id:'order-to-custom',title:'線上訂單轉客製單',source:'flowchart LR\n A[接單] --> B[建立客製單]',createdAt:timestamp});
  for(const [id,boardId] of [['overview','workspace:omg'],['orders','classic:orders'],['integration','classic:integration']])data=Library.addReference(data,{id,boardId,flowId:'order-to-custom',display:display()});
  return data;
}
test('one master can be pinned independently by three boards while display stays local',()=>{
  let data=threeBoards();assert.equal(data.flows.length,1);assert.equal(data.references.length,3);
  data=Library.setDisplay(data,'orders',display(720));assert.equal(Library.resolve(data,'orders').display.x,720);assert.equal(Library.resolve(data,'overview').display.x,40);
  data=Library.publish(data,'order-to-custom',{source:'flowchart LR\n A[接單] --> B[建立客製單] --> C[通知]',summary:'新增通知步驟',createdAt:timestamp},1);
  for(const reference of data.references){const resolved=Library.resolve(data,reference.id);assert.equal(resolved.version,1);assert.equal(resolved.latestVersion,2);assert.equal(resolved.updateAvailable,true);assert.equal(resolved.source,'flowchart LR\n A[接單] --> B[建立客製單]');}
  data=Library.updateReference(data,'orders',2,1);assert.equal(Library.resolve(data,'orders').version,2);assert.equal(Library.resolve(data,'orders').updateAvailable,false);assert.equal(Library.resolve(data,'overview').version,1);assert.equal(Library.resolve(data,'integration').version,1);
  data=Library.updateReference(data,'orders',1,2);assert.equal(Library.resolve(data,'orders').version,1);
  data=Library.removeReference(data,'orders');assert.equal(data.flows.length,1);assert.equal(data.flows[0].versions.length,2);
});
test('publishing requires the expected latest version and never edits saved source',()=>{
  const original=threeBoards();const next=Library.publish(original,'order-to-custom',{source:'flowchart LR\n A[接單] --> B[建立客製單] --> C[通知]',summary:'新增通知',createdAt:timestamp},1);
  assert.equal(original.flows[0].versions.length,1);assert.equal(next.flows[0].versions[0].source,original.flows[0].versions[0].source);
  assert.throws(()=>Library.publish(next,'order-to-custom',{source:'flowchart LR\n X --> Y',summary:'過期編輯',createdAt:timestamp},1),/新版/);
  assert.throws(()=>Library.publish(original,'order-to-custom',{source:original.flows[0].versions[0].source,summary:'空變更',createdAt:timestamp},1),/未變更/);
  assert.throws(()=>Library.updateReference(next,'orders',2,2),/已變更/);
});
test('persistence refuses silent version overwrite and concurrent-tab replacement',()=>{
  const browser=storage(),empty=Library.read(browser),first=Library.createFlow(empty,{id:'flow',title:'流程',source:'flowchart LR\n A --> B',createdAt:timestamp});
  Library.write(browser,empty,first);const loaded=Library.read(browser);assert.deepEqual(loaded,first);
  const revised=Library.publish(loaded,'flow',{source:'flowchart LR\n A --> B --> C',summary:'新增 C',createdAt:timestamp},1);
  Library.write(browser,loaded,revised);
  const tampered=structuredClone(revised);tampered.flows[0].versions[0].source='flowchart LR\n X --> Y';tampered.revision++;
  assert.throws(()=>Library.write(browser,revised,tampered),/不可覆寫/);
  const referenced=Library.addReference(revised,{id:'board-flow',boardId:'workspace:main',flowId:'flow',display:display()});Library.write(browser,revised,referenced);
  const retargeted=structuredClone(referenced);retargeted.references[0].boardId='workspace:other';retargeted.revision++;
  assert.throws(()=>Library.write(browser,referenced,retargeted),/不可改指/);
  assert.throws(()=>Library.write(browser,loaded,Library.addReference(loaded,{id:'old',boardId:'workspace:old',flowId:'flow',display:display()})),/其他分頁/);
  assert.deepEqual(Library.read(browser),referenced);
});
test('malformed references and corrupt storage are rejected without writing over old data',()=>{
  const browser=storage(),data=threeBoards(),raw=Library.serialize(data);browser.setItem(Library.STORE_KEY,raw);
  assert.throws(()=>Library.addReference(data,{id:'bad',boardId:'workspace:new',flowId:'missing',display:display()}),/找不到流程主檔/);
  assert.throws(()=>Library.addReference(data,{id:'bad',boardId:'workspace:new',flowId:'order-to-custom',version:2,display:display()}),/不存在/);
  assert.throws(()=>Library.setDisplay(data,'orders',{...display(),density:'invalid'}),/顯示設定/);
  assert.equal(browser.getItem(Library.STORE_KEY),raw);
  browser.setItem(Library.STORE_KEY,'{"broken":');assert.throws(()=>Library.read(browser),/JSON/);
  assert.throws(()=>Library.write(browser,Library.blank(),Library.createFlow(Library.blank(),{id:'new',title:'新流程',source:'flowchart LR\n A --> B',createdAt:timestamp})),/JSON/);
  assert.equal(browser.getItem(Library.STORE_KEY),'{"broken":');
});
