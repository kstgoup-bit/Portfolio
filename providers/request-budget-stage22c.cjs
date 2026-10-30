'use strict';
/* Compare-and-swap journal contract for a FUTURE approved runner. Fixtures only in stage C.
 * Store must implement read() and cas(expectedRevision,next); persist reservation before any attempt.
 * No resetting on date changes; unknown pending records remain charged after restart. */
const {validAuthPlan}=require('./kis-auth-plan-stage22c.cjs');
const {validQuotePlan}=require('./kis-readonly-stage22c.cjs');
const MAX=40,states=['reserved','ok','error','timeout'];
const stamp=s=>typeof s==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s));
const keys=(o,want)=>!!o&&Object.keys(o).sort().join(',')===want.slice().sort().join(',');
const base=()=>({version:1,revision:0,entries:[]});
const clone=x=>JSON.parse(JSON.stringify(x));
function validJournal(j){
 if(!keys(j,['version','revision','entries'])||j.version!==1||!Number.isInteger(j.revision)||j.revision<0||!Array.isArray(j.entries)||j.entries.length>MAX||j.revision<j.entries.length)return false;
 return j.entries.every((e,i)=>keys(e,['id','operation','symbol','date','startedAt','status','retryOf'])&&e.id===i+1&&['AUTH','KR_CLOSE','US_CLOSE'].includes(e.operation)&&states.includes(e.status)&&stamp(e.startedAt)&& (e.operation==='AUTH'?e.symbol===null&&e.date===null:validEntryQuote(e))&&(e.retryOf===null||Number.isInteger(e.retryOf)&&e.retryOf>0&&e.retryOf<e.id&&j.entries[e.retryOf-1].operation===e.operation&&j.entries[e.retryOf-1].symbol===e.symbol&&j.entries[e.retryOf-1].date===e.date));
}
function validEntryQuote(e){try{const {quotePlan}=require('./kis-readonly-stage22c.cjs');return quotePlan(e.symbol,e.date).operation===e.operation;}catch{return false;}}
function createBudget(store){
 if(!store||typeof store.read!=='function'||typeof store.cas!=='function')throw Error('JOURNAL_STORE_REQUIRED');
 const read=()=>{let j;try{j=store.read();}catch{throw Error('JOURNAL_UNAVAILABLE');}if(!validJournal(j))throw Error('JOURNAL_INVALID');return clone(j);};
 const commit=(old,next)=>{let ok;try{ok=store.cas(old.revision,next);}catch{throw Error('JOURNAL_WRITE_FAILED');}if(ok!==true)throw Error('JOURNAL_CONFLICT');return clone(next);};
 return Object.freeze({
  reserve(plan,startedAt,retryOf=null){
   if(!validAuthPlan(plan)&&!validQuotePlan(plan))throw Error('REQUEST_NOT_ALLOWED');if(!stamp(startedAt))throw Error('TIME_REQUIRED');
   const old=read();if(old.entries.length>=MAX)throw Error('REQUEST_BUDGET_EXHAUSTED');
   if(plan.operation==='AUTH'&&old.entries.filter(e=>e.operation==='AUTH').length>=2)throw Error('AUTH_BUDGET_EXHAUSTED');
   if(retryOf!==null){if(!Number.isInteger(retryOf)||retryOf<1)throw Error('RETRY_NOT_ALLOWED');const prev=old.entries[retryOf-1];if(!prev||!['error','timeout'].includes(prev.status)||prev.operation!==plan.operation||prev.symbol!==(plan.symbol||null)||prev.date!==(plan.date||null)||old.entries.some(e=>e.retryOf===retryOf)||old.entries.filter(e=>e.retryOf!==null).length>=8)throw Error('RETRY_NOT_ALLOWED');let n=0,p=prev;while(p.retryOf!==null){n++;p=old.entries[p.retryOf-1];}if(n>=2)throw Error('RETRY_LIMIT');}
   const next=clone(old),entry={id:next.entries.length+1,operation:plan.operation,symbol:plan.symbol||null,date:plan.date||null,startedAt,status:'reserved',retryOf};next.entries.push(entry);next.revision++;commit(old,next);return clone(entry);
  },
  complete(id,status){if(!Number.isInteger(id)||id<1)throw Error('INVALID_ID');if(!states.includes(status)||status==='reserved')throw Error('INVALID_OUTCOME');const old=read(),next=clone(old),e=next.entries[id-1];if(!e||e.status!=='reserved')throw Error('OUTCOME_ALREADY_SET');e.status=status;next.revision++;commit(old,next);return clone(e);},
  snapshot(){const j=read();return {used:j.entries.length,remaining:MAX-j.entries.length,entries:j.entries};}
 });
}
module.exports={MAX,base,validJournal,createBudget};
