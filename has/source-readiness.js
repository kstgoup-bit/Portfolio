/* Offline metadata checklist only. No transport, authentication, storage or evidence verification. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.HASSourceReadiness=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MAX_BYTES=32768;
  const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=300;
  const choice=(...values)=>x=>values.includes(x);
  const yes=x=>x===true;
  const instant=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x.replace('Z','.000Z');
  const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
  // References are local redacted evidence identifiers, never URLs, credentials or raw payloads.
  const ref=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
  const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const schemas={
    transport:{kind:choice('gas','direct','file'),sampleRef:ref,keysOmitted:yes},
    upstream:{provider:text,originId:ref,evidenceRef:ref},
    quote:{exchangeAt:instant,receivedAt:instant,type:choice('realtime','delayed','close'),delaySeconds:x=>Number.isInteger(x)&&x>=0&&x<=86400,exchangeTimeEvidenceRef:ref,entitlementEvidenceRef:ref},
    rights:{personalDisplay:yes,derivedAnalytics:yes,storagePolicy:choice('not-stored','declared-permitted'),redistributionPolicy:choice('not-shared','declared-permitted'),evidenceRef:ref},
    comparison:{originId:ref,originEvidenceRef:ref,sampleRef:ref},
    history:{sampleRef:ref,adjustment:choice('raw','split','split-dividend'),adjustmentEvidenceRef:ref,calendarEvidenceRef:ref,timeZone:choice('America/New_York','Asia/Seoul'),from:day,through:day},
    financials:{provider:choice('SEC','DART','other'),sampleRef:ref,filingRef:ref,entityIdentityRef:ref,periodRef:ref,unitsRef:ref,revisionPolicyRef:ref,secSelectionRef:ref}
  };
  function inspectRaw(input){
    const out={version:1,status:'invalid',verification:'unverified',liveConnection:'unavailable',independenceVerified:false,secretScanPerformed:false,checks:[],issues:[],notice:'Offline metadata declarations only. No source, account entitlement, secret removal, exchange clock, source independence or live connection has been verified.'};
    const issue=code=>out.issues.push(code);
    if(typeof input!=='string'||input.length>MAX_BYTES){issue('input-type-or-size');return out;}
    let bytes=0;for(const ch of input){const n=ch.codePointAt(0);bytes+=n<=0x7f?1:n<=0x7ff?2:n<=0xffff?3:4;}
    if(bytes>MAX_BYTES){issue('input-type-or-size');return out;}
    let p;try{p=JSON.parse(input);}catch(_){issue('invalid-json');return out;}
    if(!object(p)||p.version!==1||!['synthetic','imported'].includes(p.mode)){issue('invalid-envelope');return out;}
    const allowed=['version','mode',...Object.keys(schemas)];
    if(Object.keys(p).some(k=>!allowed.includes(k))){issue('unexpected-field');return out;}
    for(const [section,schema] of Object.entries(schemas)){
      const data=p[section];
      if(data!==undefined&&(!object(data)||Object.keys(data).some(k=>!Object.hasOwn(schema,k)))){issue('unexpected-field-or-section');return out;}
    }
    out.mode=p.mode;
    for(const [section,schema] of Object.entries(schemas)){
      const data=p[section];
      for(const [field,valid] of Object.entries(schema)){
        if(field==='secSelectionRef'&&data&&data.provider!=='SEC')continue;
        const value=data&&data[field];
        out.checks.push({field:section+'.'+field,status:value===undefined?'missing':valid(value)?'declared-only':'invalid'});
      }
    }
    const invalidate=(field,code)=>{out.checks.find(c=>c.field===field).status='invalid';issue(code);};
    const q=p.quote;
    if(q&&instant(q.exchangeAt)&&instant(q.receivedAt)&&Date.parse(q.exchangeAt)>Date.parse(q.receivedAt))invalidate('quote.exchangeAt','exchange-after-receipt');
    if(q&&((q.type==='realtime'&&q.delaySeconds!==0)||(q.type==='delayed'&&!(q.delaySeconds>0))))invalidate('quote.delaySeconds','quote-delay-mismatch');
    if(p.upstream&&p.comparison&&ref(p.upstream.originId)&&ref(p.comparison.originId)&&p.upstream.originId.toLowerCase()===p.comparison.originId.toLowerCase())invalidate('comparison.originId','shared-declared-origin');
    if(p.history&&day(p.history.from)&&day(p.history.through)&&p.history.from>p.history.through)invalidate('history.through','history-range-reversed');
    // A label GAS describes a relay, not upstream source evidence.
    if(p.upstream&&text(p.upstream.provider)&&/^\s*(gas|google apps script)\s*$/i.test(p.upstream.provider))invalidate('upstream.provider','relay-is-not-upstream');
    out.status=out.checks.some(c=>c.status==='invalid')?'invalid':out.checks.some(c=>c.status==='missing')?'incomplete':'declared-only';
    return out;
  }
  function deepFreeze(x){if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.freeze(x);Object.values(x).forEach(deepFreeze);}return x;}
  function inspectJSON(input){return deepFreeze(inspectRaw(input));} // 호출자가 결과를 바꿔 '준비됨'처럼 보이게 만들 수 없도록 동결
  return Object.freeze({VERSION:1,MAX_BYTES,inspectJSON});
});
