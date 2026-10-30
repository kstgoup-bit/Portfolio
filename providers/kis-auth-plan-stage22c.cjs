'use strict';
// Descriptor only. No secrets, token issuance, HTTP, or credential storage.
const authPlan=()=>({operation:'AUTH',method:'POST',path:'/oauth2/tokenP',syntheticOnly:true});
const validAuthPlan=p=>!!p&&Object.keys(p).sort().join(',')==='method,operation,path,syntheticOnly'&&p.operation==='AUTH'&&p.method==='POST'&&p.path==='/oauth2/tokenP'&&p.syntheticOnly===true;
module.exports={authPlan,validAuthPlan};
