'use strict';
// Synthetic dispatcher only. respond must be an offline fixture callback; no live transport supplied.
const Q=require('./kis-readonly-stage22c.cjs'),{requestSpec}=require('./kis-request-spec-stage22c-followup.cjs'),{classifyUsage}=require('./kis-basic-policy-stage22c-followup.cjs');
const safe=(code,requestId=null,extra={})=>({ok:false,code,requestId,held:true,realVerified:false,signalEnabled:false,quotes:[],...extra});
function createFixtureRunner({mode,budget,respond,now,timeoutMs=10000}={}){
 if(mode!=='synthetic'||!budget||typeof budget.reserve!=='function'||typeof budget.complete!=='function'||typeof respond!=='function'||typeof now!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('OFFLINE_FIXTURE_CONFIGURATION_REQUIRED');
 let busy=false,stopped=false;
 return Object.freeze({
  async quote({symbol,date,context,retryOf=null,usage='personal-ephemeral-quote'}={}){
   if(stopped)return safe('SESSION_STOPPED');if(busy)return safe('SESSION_BUSY');
   if(!classifyUsage(usage).developmentAllowed)return safe('USAGE_DEFERRED');
   if(context?.synthetic!==true)return safe('SYNTHETIC_ONLY');
   let spec,ctx;try{spec=requestSpec(Q.quotePlan(symbol,date));ctx=JSON.parse(JSON.stringify(context));}catch{return safe('INVALID_QUOTE_REQUEST');}
   busy=true;let entry,timer;const abort=new AbortController();
   try{
    // Commit the budget reservation before invoking even a fixture responder.
    try{entry=budget.reserve(spec.plan,now(),retryOf);}catch{stopped=true;return safe('BUDGET_RESERVATION_DENIED');}
    let response;
    try{
     response=await Promise.race([Promise.resolve().then(()=>respond(spec,{signal:abort.signal})),new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('FIXTURE_TIMEOUT'));},timeoutMs);})]);
    }catch(e){
     const timeout=abort.signal.aborted;
     try{budget.complete(entry.id,timeout?'timeout':'error');}catch{stopped=true;return safe('JOURNAL_COMPLETION_FAILED',entry.id);}
     return safe(timeout?'FIXTURE_TIMEOUT':'FIXTURE_RESPONDER_FAILED',entry.id);
    }finally{clearTimeout(timer);}
    let outcome;
    if(!response||!Number.isInteger(response.status)||response.status<100||response.status>599){stopped=true;outcome=safe('INVALID_RESPONSE',entry.id);}
    else if(response.status!==200){
     const advice=Q.errorPolicy(response.status,0,response.retryAfterSeconds);
     if(advice.stop)stopped=true;
     outcome=safe(response.status>=300&&response.status<400?'REDIRECT_BLOCKED':'HTTP_ERROR',entry.id,{retryAdvice:advice});
    }else{
     const normalized=Q.validateFixture(spec.plan,response.envelope,ctx);
     outcome={...normalized,requestId:entry.id,held:true,realVerified:false,signalEnabled:false};
     if(!normalized.ok)stopped=true;
    }
    try{budget.complete(entry.id,outcome.ok?'ok':'error');}catch{stopped=true;return safe('JOURNAL_COMPLETION_FAILED',entry.id);}
    return outcome;
   }finally{clearTimeout(timer);busy=false;}
  }
 });
}
module.exports={createFixtureRunner};
