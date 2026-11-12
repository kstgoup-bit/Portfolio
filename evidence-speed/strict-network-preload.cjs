'use strict';
// Test-runner compatibility guard. Node 24 can pass normalized socket tuples
// past the historical guard. Reject non-loopback HTTP requests at their public
// API before request creation, then keep the repository's original guard too.
const G=require('../tests/lib/no-network.cjs');
for(const mod of [require('node:http'),require('node:https')])for(const method of ['get','request']){
 const original=mod[method];mod[method]=function(...args){
  const first=args[0];let host='';
  if(typeof first==='string'||first instanceof URL){host=new URL(first).hostname;}
  else if(first&&typeof first==='object'){host=first.hostname||first.host||'localhost';host=host.replace(/:\d+$/,'');}
  if(!['localhost','127.0.0.1','::1','[::1]'].includes(host)){
   G.attempts.push('http.'+method+':'+host);const error=new Error('NO_EXTERNAL_NETWORK: test guard');error.code='NO_EXTERNAL_NETWORK';throw error;
  }
  return original.apply(this,args);
 };
}
