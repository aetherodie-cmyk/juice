'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.JuiceFlowLibraryCore=api;})(typeof window==='undefined'?globalThis:window,()=>{
  const FORMAT='juice-flow-library',VERSION=1,STORE_KEY='juice-flow-library-v1',MAX_BYTES=20*1024*1024;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const assert=(condition,message)=>{if(!condition)throw Error(message);};
  const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
  const boardId=value=>typeof value==='string'&&/^(classic|workspace):[A-Za-z0-9_-]{1,100}$/.test(value);
  const text=(value,max)=>typeof value==='string'&&value.length<=max;
  const number=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
  const blank=()=>({format:FORMAT,version:VERSION,revision:0,flows:[],references:[]});
  function validate(value){
    assert(value&&typeof value==='object'&&!Array.isArray(value),'流程知識庫格式不正確');
    const data=clone(value);
    assert(data.format===FORMAT&&data.version===VERSION&&Number.isSafeInteger(data.revision)&&data.revision>=0,'流程知識庫版本不正確');
    assert(Array.isArray(data.flows)&&data.flows.length<=150&&Array.isArray(data.references)&&data.references.length<=1000,'流程或引用數量超限');
    const flowIds=new Set(),referenceIds=new Set();let versionCount=0;
    for(const flow of data.flows){
      assert(flow&&id(flow.id)&&!flowIds.has(flow.id),'流程 ID 重複或無效');flowIds.add(flow.id);
      assert(text(flow.title,200)&&flow.title.trim()&&Array.isArray(flow.versions)&&flow.versions.length>=1&&flow.versions.length<=100,'流程名稱或版本數不正確');
      versionCount+=flow.versions.length;
      flow.versions.forEach((entry,index)=>{
        assert(entry&&entry.number===index+1&&text(entry.source,15000)&&entry.source.trim(),'流程版本或原文不正確');
        assert(entry.aiContext===undefined||text(entry.aiContext,50000),'流程詳情超過上限');
        assert(text(entry.summary,2000)&&typeof entry.createdAt==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.createdAt)&&Number.isFinite(Date.parse(entry.createdAt))&&new Date(entry.createdAt).toISOString()===entry.createdAt,'流程版本摘要或時間不正確');
      });
    }
    assert(versionCount<=1000,'流程版本總數超限');
    for(const reference of data.references){
      assert(reference&&id(reference.id)&&!referenceIds.has(reference.id),'引用 ID 重複或無效');referenceIds.add(reference.id);
      const flow=data.flows.find(item=>item.id===reference.flowId);
      assert(boardId(reference.boardId)&&flow&&Number.isSafeInteger(reference.version)&&reference.version>=1&&reference.version<=flow.versions.length,'引用指向不存在的白板、流程或版本');
      const display=reference.display;
      assert(display&&number(display.x,-100000,100000)&&number(display.y,-100000,100000)&&number(display.w,40,1400)&&number(display.h,30,1400)&&['overview','summary','detail'].includes(display.density),'引用顯示設定不正確');
    }
    return data;
  }
  function serialize(value){const raw=JSON.stringify(validate(value));assert(new TextEncoder().encode(raw).length<=MAX_BYTES,'流程知識庫超過 20 MB');return raw;}
  function parse(raw){assert(text(raw,MAX_BYTES)&&new TextEncoder().encode(raw).length<=MAX_BYTES,'流程知識庫超過 20 MB');let value;try{value=JSON.parse(raw);}catch{throw Error('流程知識庫 JSON 無法讀取');}return validate(value);}
  function change(value,update){const next=validate(value);update(next);next.revision++;return validate(next);}
  function createFlow(value,{id:flowId,title,source,aiContext,createdAt}){
    return change(value,next=>{assert(!next.flows.some(flow=>flow.id===flowId),'流程 ID 已存在');next.flows.push({id:flowId,title,versions:[{number:1,source,aiContext,summary:'建立流程',createdAt}]});});
  }
  function publish(value,flowId,{source,aiContext,summary,createdAt},expectedLatest){
    return change(value,next=>{const flow=next.flows.find(item=>item.id===flowId);assert(flow,'找不到流程主檔');assert(flow.versions.length===expectedLatest,'流程已有其他新版，請重新確認');const latest=flow.versions.at(-1);assert(source!==latest.source||aiContext!==latest.aiContext,'流程內容未變更');flow.versions.push({number:latest.number+1,source,aiContext,summary,createdAt});});
  }
  function addReference(value,{id:referenceId,boardId:targetBoard,flowId,version,display}){
    return change(value,next=>{assert(!next.references.some(reference=>reference.id===referenceId),'引用 ID 已存在');const flow=next.flows.find(item=>item.id===flowId);assert(flow,'找不到流程主檔');next.references.push({id:referenceId,boardId:targetBoard,flowId,version:version??flow.versions.length,display:clone(display)});});
  }
  function updateReference(value,referenceId,targetVersion,expectedVersion){
    return change(value,next=>{const reference=next.references.find(item=>item.id===referenceId);assert(reference,'找不到流程引用');assert(reference.version===expectedVersion,'引用版本已變更，請重新確認');reference.version=targetVersion;});
  }
  function setDisplay(value,referenceId,display){
    return change(value,next=>{const reference=next.references.find(item=>item.id===referenceId);assert(reference,'找不到流程引用');reference.display=clone(display);});
  }
  function removeReference(value,referenceId){
    return change(value,next=>{assert(next.references.some(item=>item.id===referenceId),'找不到流程引用');next.references=next.references.filter(item=>item.id!==referenceId);});
  }
  function resolve(value,referenceId){
    const data=validate(value),reference=data.references.find(item=>item.id===referenceId);assert(reference,'找不到流程引用');const flow=data.flows.find(item=>item.id===reference.flowId),entry=flow.versions[reference.version-1];return {...clone(reference),title:flow.title,source:entry.source,aiContext:entry.aiContext,summary:entry.summary,latestVersion:flow.versions.length,updateAvailable:reference.version<flow.versions.length};
  }
  function read(storage){const raw=storage.getItem(STORE_KEY);return raw===null?blank():parse(raw);}
  function assertTransition(previous,value){
    const before=validate(previous),next=validate(value);
    assert(next.revision===before.revision+1,'流程知識庫修訂號不連續');
    for(const flow of before.flows){const candidate=next.flows.find(item=>item.id===flow.id);assert(candidate&&candidate.versions.length>=flow.versions.length,'已保存的流程版本不可移除');assert(JSON.stringify(candidate.versions.slice(0,flow.versions.length))===JSON.stringify(flow.versions),'已保存的流程版本不可覆寫');}
    for(const reference of before.references){const candidate=next.references.find(item=>item.id===reference.id);if(candidate)assert(candidate.boardId===reference.boardId&&candidate.flowId===reference.flowId,'既有引用不可改指其他白板或流程');}
    return next;
  }
  function write(storage,previous,value){
    const before=read(storage),expected=validate(previous);
    assert(JSON.stringify(before)===JSON.stringify(expected),'流程知識庫已被其他分頁更改，請重新載入');
    const next=assertTransition(before,value);
    storage.setItem(STORE_KEY,serialize(next));return next;
  }
  return {FORMAT,VERSION,STORE_KEY,MAX_BYTES,blank,validate,parse,serialize,createFlow,publish,addReference,updateReference,setDisplay,removeReference,resolve,assertTransition,read,write};
});
