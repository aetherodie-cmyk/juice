'use strict';
(function(root,factory){const rules=factory();if(typeof module==='object'&&module.exports)module.exports=rules;else root.JuiceNestedColorRules=rules;})(typeof window==='undefined'?globalThis:window,()=>({
  version:1,
  statuses:{
    unknown:{label:'待確認',color:'#8562b3'},
    todo:{label:'未開始',color:'#687789'},
    doing:{label:'進行中',color:'#2b72bd'},
    blocked:{label:'受阻',color:'#bd4939'},
    done:{label:'已完成',color:'#28835d'}
  }
}));
