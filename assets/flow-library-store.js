'use strict';
window.JuiceFlowLibraryStore=(()=>{
  const Core=window.JuiceFlowLibraryCore,DB_NAME='juice-flow-library-db-v1',STORE='catalog',KEY='main';
  function open(){return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||Error('無法開啟流程知識庫'));
    request.onblocked=()=>reject(Error('流程知識庫升級被其他分頁阻擋，請關閉舊分頁後重試'));
  });}
  async function read(){const database=await open();return new Promise((resolve,reject)=>{
    const transaction=database.transaction(STORE,'readonly'),request=transaction.objectStore(STORE).get(KEY);let result;
    request.onsuccess=()=>{try{result=request.result===undefined?Core.blank():Core.parse(request.result);}catch(error){transaction.abort();reject(error);}};
    transaction.oncomplete=()=>{database.close();resolve(result);};
    transaction.onabort=transaction.onerror=()=>{database.close();reject(transaction.error||Error('流程知識庫讀取失敗'));};
  });}
  async function transact(update){const database=await open();return new Promise((resolve,reject)=>{
    const transaction=database.transaction(STORE,'readwrite'),objectStore=transaction.objectStore(STORE),request=objectStore.get(KEY);let result,failed;
    request.onsuccess=()=>{try{const previous=request.result===undefined?Core.blank():Core.parse(request.result);result=Core.assertTransition(previous,update(previous));objectStore.put(Core.serialize(result),KEY);}catch(error){failed=error;transaction.abort();}};
    transaction.oncomplete=()=>{database.close();resolve(result);};
    transaction.onabort=transaction.onerror=()=>{database.close();reject(failed||transaction.error||Error('流程知識庫寫入失敗'));};
  });}
  async function restore(raw){const imported=Core.parse(raw),database=await open();return new Promise((resolve,reject)=>{
    const transaction=database.transaction(STORE,'readwrite'),objectStore=transaction.objectStore(STORE),request=objectStore.get(KEY);let failed;
    request.onsuccess=()=>{try{const current=request.result===undefined?Core.blank():Core.parse(request.result);if(current.revision!==0||current.flows.length||current.references.length)throw Error('流程庫已有資料；為避免覆蓋，僅可還原到空白流程庫');objectStore.put(Core.serialize(imported),KEY);}catch(error){failed=error;transaction.abort();}};
    transaction.oncomplete=()=>{database.close();resolve(imported);};
    transaction.onabort=transaction.onerror=()=>{database.close();reject(failed||transaction.error||Error('流程知識庫還原失敗'));};
  });}
  return Object.freeze({DB_NAME,read,transact,restore});
})();
