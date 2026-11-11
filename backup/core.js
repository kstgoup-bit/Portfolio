/* Local-only portfolio backup. No network or credential capture. Storage is NOT transactional. */
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f(require('../has/snapshot-policy.js'),require('../has/return-assessment.js'),require('../has/benchmark-history-policy.js'));else root.KSTPortfolioBackup=f(root.HASSnapshotPolicy,root.HASReturnAssessment,root.HASBenchmarkHistory);})(globalThis,function(snapshotPolicy,returnAssessment,benchmarkPolicy){
 'use strict';
 const FORMAT='kst-portfolio-backup',VERSION=7,JOURNAL='kst.portfolio.restoreJournal',MAX_BYTES=20*1024*1024;
 const LIMITS=Object.freeze({depth:30,nodes:500000,array:50000,keys:50000,string:MAX_BYTES});
 const ACCOUNTS=Object.freeze(['v5_gen','v5_dom','v5_ov','v5_pen']);
 const JSON_KEYS=Object.freeze([...ACCOUNTS,'v5_snap','v5_deposits','v5_div','v5_balGoals','v5_ledger','v5_fxHistory','v5_memos','v5_userThemeMap','v5_investPrinciples','v5_debtBank','v5_debtHouse','v5_nonFinAssets','v5_benchHist','v5_benchHistV2','v5_riskData','v5_rkCache']);
 const TEXT_KEYS=Object.freeze(['v5_fx','v5_fg','v5_cma_amount','v5_lastAutoSnap','v5_divMonthFilter','v5_divSumMonth','v5_divSumYear','v5_divTickerYear']);
 const calc=k=>/^calc_[qp][123]_(dom|ov|pen|gen)_\d+$/.test(k);
 const allowed=k=>typeof k==='string'&&k.length<=256&&(JSON_KEYS.includes(k)||TEXT_KEYS.includes(k)||calc(k));
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const object=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&[Object.prototype,null].includes(Object.getPrototypeOf(o));
 const finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER;
 const nonnegative=n=>finite(n)&&n>=0;
 const timestamp=n=>Number.isSafeInteger(n)&&n>=0&&n<=8640000000000000;
 const fail=s=>{throw new Error(s);};
 const bytes=s=>new TextEncoder().encode(s).length;
 const freeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
 const forbiddenKey=k=>['__proto__','prototype','constructor'].includes(k);
 const secretKey=k=>/^(?:.*[_-])?(?:api[_-]?key|secret|clientsecret|password|passwd|credential|access[_-]?token|refresh[_-]?token|private[_-]?key|authorization)$/i.test(k)||/^(?:geminiKey|alphaVantageKey|gasUrl)$/i.test(k);
 function safeTree(v,depth=0,budget={nodes:0}){
  if(depth>LIMITS.depth||++budget.nodes>LIMITS.nodes)fail('자료 중첩 또는 항목 한도 초과');
  if(typeof v==='number'&&!finite(v))fail('비유한 숫자 또는 안전한 숫자 범위 초과');
  if(typeof v==='string'){
   if(v.length>LIMITS.string)fail('문자열 한도 초과');
   if(/<[a-z/!]|\bon[a-z]+\s*=|javascript:|\u0000/i.test(v))fail('실행 가능한 HTML/스크립트 문자열은 복원할 수 없습니다.');
   if(/\bsk-(?:proj-)?[a-z0-9_-]{12,}|\bBearer\s+[a-z0-9._~-]{8,}|https?:\/\/[^\s/]*:[^\s/@]*@|[?&](?:api[_-]?key|token|secret|password)=[^&#\s]+/i.test(v))fail('인증정보로 보이는 값은 백업하거나 복원할 수 없습니다.');
  }
  if(v&&typeof v==='object'){
   if(!Array.isArray(v)&&!object(v))fail('일반 JSON 객체만 허용합니다.');
   const keys=Reflect.ownKeys(v);if(keys.length>LIMITS.keys+(Array.isArray(v)?1:0)||(Array.isArray(v)&&v.length>LIMITS.array))fail('항목 한도 초과');
   for(const k of keys){
    if(typeof k!=='string'||forbiddenKey(k)||secretKey(k))fail('금지된 자료 속성 또는 인증정보 속성');
    if(Array.isArray(v)&&k==='length')continue;
    const d=Object.getOwnPropertyDescriptor(v,k);if(!d||!own(d,'value')||!d.enumerable)fail('JSON이 아닌 자료 속성');
    safeTree(d.value,depth+1,budget);
   }
  }else if(v!==null&&!['string','number','boolean'].includes(typeof v))fail('JSON이 아닌 자료 값');
 }
 /* Inspect tokens BEFORE JSON.parse: a reviver cannot detect overwritten duplicate keys.
    Resource limits also apply to encoded JSON strings inside a versioned envelope. */
 function parseJSON(text){
  if(typeof text!=='string'||text.length>MAX_BYTES||bytes(text)>MAX_BYTES)fail('백업은 최대 20MiB입니다.');
  let i=0,nodes=0;const ws=()=>{while(i<text.length&&/[\t\n\r ]/.test(text[i]))i++;};
  function str(){const start=i++;let escaped=false;while(i<text.length){const c=text[i++];if(!escaped&&c==='"'){let s;try{s=JSON.parse(text.slice(start,i));}catch{fail('JSON 문자열 손상');}if(s.length>LIMITS.string)fail('문자열 한도 초과');return s;}if(!escaped&&c==='\\')escaped=true;else escaped=false;}fail('JSON 문자열 손상');}
  function value(depth){
   if(depth>LIMITS.depth||++nodes>LIMITS.nodes)fail('자료 중첩 또는 항목 한도 초과');ws();const c=text[i];
   if(c==='"'){str();return;}
   if(c==='{'||c==='['){const obj=c==='{',end=obj?'}':']',seen=new Set();i++;ws();if(text[i]===end){i++;return;}let count=0;
    while(i<text.length){if(++count>(obj?LIMITS.keys:LIMITS.array))fail('항목 한도 초과');ws();if(obj){if(text[i]!=='"')fail('JSON 속성 손상');const k=str();if(k.length>256||forbiddenKey(k)||seen.has(k))fail('중복 또는 금지된 JSON 속성');seen.add(k);ws();if(text[i++]!==':')fail('JSON 구분자 손상');}value(depth+1);ws();if(text[i]===end){i++;return;}if(text[i++]!==',')fail('JSON 구분자 손상');}fail('JSON 끝 손상');
   }
   const m=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));if(!m)fail('JSON 값 손상');i+=m[0].length;
  }
  value(0);ws();if(i!==text.length)fail('JSON 뒤에 추가 자료가 있습니다.');try{return JSON.parse(text);}catch{fail('JSON 형식 손상');}
 }
 function instant(v){
  if(typeof v!=='string')return false;const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(v);
  if(!m||+m[1]<1970||+m[2]<1||+m[2]>12||+m[3]<1||+m[3]>new Date(Date.UTC(+m[1],+m[2],0)).getUTCDate()||+m[4]>23||+m[5]>59||+m[6]>59)return false;
  if(m[8]!=='Z'&&(+m[8].slice(1,3)>14||+m[8].slice(4)>59||(+m[8].slice(1,3)===14&&+m[8].slice(4)!==0)))return false;
  return Number.isFinite(Date.parse(v));
 }
 const nullableInstant=v=>v===null||instant(v);
 const componentId=c=>own(c,'stockId')?c.account+':id:'+c.stockId:c.account+':ticker:'+c.ticker;
 const componentIdValid=c=>!own(c,'stockId')||(Number.isSafeInteger(c.stockId)&&c.stockId>=0);
 const account=v=>['gen','dom','ov','pen'].includes(v);
 const ticker=v=>typeof v==='string'&&v.trim().length>0&&v.length<=100&&/^[\p{L}\p{N}_.()·\- ]+$/u.test(v);
 function priceMeta(v){if(!object(v)||!finite(v.value)||v.value<=0||v.value>1e12||!Number.isInteger(v.maxAgeDays)||v.maxAgeDays<1||v.maxAgeDays>4||!instant(v.priceAsOf)||!['KRW','USD'].includes(v.currency)||v.unit!=='per-held-unit')fail('수동 가격 출처 형식 오류');}
 function stocks(a){
  if(!Array.isArray(a)||a.length>10000)fail('계좌는 종목 배열이어야 합니다.');
  const ids=new Set();for(const s of a){
   if(!object(s)||!(Number.isSafeInteger(s.id)&&s.id>=0)||ids.has(s.id)||typeof s.name!=='string'||!s.name.trim()||!ticker(s.ticker)||!['quantity','avgPrice','currentPrice'].every(k=>nonnegative(s[k])&&s[k]<=1e12))fail('종목 필드 손상 또는 중복 ID');ids.add(s.id);
   if(own(s,'pricingMode')&&!['manual','quote'].includes(s.pricingMode))fail('가격 방식 형식 오류');
   if(own(s,'manualPrice'))priceMeta(s.manualPrice);
   if(s.pricingMode==='manual'&&!own(s,'manualPrice'))fail('수동 가격 출처가 없습니다.');
  }
 }
 function provenance(s){
  // Revision payloads use the same pure validator as recording, including flat
  // history, aggregate valuation, source-time and scope-change invariants.
  if(own(s,'cost')&&!nonnegative(s.cost))fail('기록 원가 형식 오류');
  if(own(s,'schemaVersion')&&s.schemaVersion!==1)fail('지원하지 않는 기록 출처 버전');
  const fields=['origin','priceAsOf','recordedAt','quality','signalHold','manualComponents','components','fx','dailyHistory','scopeChange','comparisonHold'];
  if(!fields.some(k=>own(s,k))&&!own(s,'schemaVersion'))return;
  if(!snapshotPolicy||typeof snapshotPolicy.validateRecord!=='function'||!snapshotPolicy.validateRecord(s).ok)fail('기록 정책을 불러오지 못했거나 기록 출처·평가 합계 형식이 올바르지 않습니다');
  if(s.schemaVersion!==1||!['manual-included','session-quote','entered-balance'].includes(s.origin)||!nullableInstant(s.priceAsOf)||!instant(s.recordedAt)||s.quality!=='unconfirmed'||s.signalHold!==true||!Array.isArray(s.manualComponents)||!Array.isArray(s.components)||!own(s,'fx'))fail('기록 출처 필드 손상');
  const ids=new Set();for(const c of s.components){if(!object(c)||!account(c.account)||!componentIdValid(c)||!ticker(c.ticker)||!nonnegative(c.quantity)||c.quantity>1e12||!nonnegative(c.price)||c.price>1e12||!['KRW','USD'].includes(c.currency)||c.unit!=='per-held-unit'||!['manual','session-quote','entered-balance'].includes(c.origin)||!nullableInstant(c.priceAsOf)||!nullableInstant(c.receivedAt))fail('기록 구성 가격 형식 오류');const id=componentId(c);if(ids.has(id))fail('중복 기록 구성 가격');ids.add(id);}
  const manualIds=new Set();for(const c of s.manualComponents){if(!object(c)||!account(c.account)||!componentIdValid(c)||!ticker(c.ticker))fail('수동 기록 구성 형식 오류');priceMeta(c);const id=componentId(c);if(manualIds.has(id))fail('중복 수동 기록 구성');manualIds.add(id);}
  const manual=s.components.filter(c=>c.origin==='manual'),expectedOrigin=manual.length?'manual-included':s.components.some(c=>c.origin==='session-quote')?'session-quote':'entered-balance';
  if(s.origin!==expectedOrigin||manual.length!==s.manualComponents.length)fail('기록 출처 구성이 일치하지 않습니다.');
  for(const c of manual){const m=s.manualComponents.find(x=>componentId(x)===componentId(c)&&x.ticker===c.ticker);if(!m||m.value!==c.price||m.priceAsOf!==c.priceAsOf||m.currency!==c.currency||m.unit!==c.unit||m.maxAgeDays!==c.maxAgeDays)fail('수동 가격 출처 구성이 일치하지 않습니다.');}
  if(s.fx!==null&&(!object(s.fx)||!finite(s.fx.value)||s.fx.value<=0||s.fx.value>1e6||s.fx.currencyPair!=='USD/KRW'||s.fx.origin!=='session-quote'||!nullableInstant(s.fx.priceAsOf)||!instant(s.fx.receivedAt)))fail('기록 환율 출처 형식 오류');
 }
 function benchmark(v){
  const allowedFields=['KS200','QQQ','SPY','fetchedAt','fetchedAtISO'];if(Object.keys(v).some(k=>!allowedFields.includes(k)))fail('지원하지 않는 지수 기록 필드');
  if(!benchmarkPolicy||typeof benchmarkPolicy.validateSeries!=='function')fail('지수 기록 검증 정책을 불러오지 못했습니다.');
  for(const sym of ['KS200','QQQ','SPY'])if(own(v,sym)){
   // Backup retains legacy duplicate-date evidence. Runtime may quarantine it;
   // backup never deduplicates, relabels, or makes it available for calculations.
   const checked=benchmarkPolicy.validateSeries(v[sym],sym,8640000000000000,{allowDuplicateDates:true,legacyOnly:true});
   if(!checked.ok)fail('지수 기록 가격·시각·중복 또는 정렬 오류');
  }
  if(own(v,'fetchedAt')&&(typeof v.fetchedAt!=='string'||v.fetchedAt.length>100))fail('지수 수신 날짜 형식 오류');
  if(own(v,'fetchedAtISO')&&!nullableInstant(v.fetchedAtISO))fail('지수 수신 시각 형식 오류');
 }
 function sidecar(v){
  if(!benchmarkPolicy||typeof benchmarkPolicy.validateStore!=='function'||!benchmarkPolicy.validateStore(v).ok)fail('지수 관측·충돌 보류 기록 형식 오류');
 }
 function boundSidecar(raw,legacyRaw){
  const v=parseJSON(raw);sidecar(v);
  const checked=benchmarkPolicy.validateStore(v,legacyRaw);
  if(checked.ok)return;
  // Legacy duplicates can be archived and restored read-only, but cannot hide
  // new overlap, conflict-target errors, or a changed fingerprint.
  const read=benchmarkPolicy.readStore(v,legacyRaw,8640000000000000);
  if(!read.ok)fail('지수 보조 기록과 원본 지수 기록의 연결이 다릅니다. 원본은 변경하지 않았습니다.');
  for(const id of ['KS200','QQQ','SPY'])if(!read.series[id].ok){
   const old=read.legacy.series[id],group=v.series[id];
   if(read.series[id].reason!=='cache-date-conflict'||!old.compatible||!old.compatible.ok||group&&(group.observations.length||group.conflicts.length))fail('지수 보조 기록의 통합 그룹 또는 충돌 대상이 유효하지 않습니다.');
  }
 }
 function archiveWarnings(values){
  const warnings=[];
  if(!own(values,'v5_benchHist'))warnings.push('지수 기록이 백업에 없습니다. 현재 지수 기록을 유지합니다.');
  else{
   const legacy=parseJSON(values.v5_benchHist);
   for(const id of ['KS200','QQQ','SPY'])if(own(legacy,id)&&benchmarkPolicy.validateSeries(legacy[id],id,8640000000000000,{allowDuplicateDates:true,legacyOnly:true}).readOnly)warnings.push(id+'의 같은 날짜 구버전 지수 관측은 원문 그대로 보존하며 계산에서는 읽기 전용 보류합니다.');
  }
  if(!own(values,'v5_benchHistV2'))warnings.push('지수 보조 기록이 백업에 없습니다. 현재 보조 기록을 유지하며 원본 연결이 달라지면 사용을 보류합니다.');
  else warnings.push('지수 관측과 충돌 보류 자료를 별도로 보존합니다. 복원 전 원본 연결과 누락 그룹을 검증하며 자동 재연결·삭제·변환하지 않습니다.');
  return warnings;
 }
 function validateValue(k,raw,sourceVersion=VERSION){
  if(!allowed(k)||typeof raw!=='string'||raw.length>MAX_BYTES)fail('지원하지 않는 저장 키 또는 값');
  if(k==='v5_benchHistV2'&&sourceVersion!==VERSION)fail('구버전 백업에는 새 지수 보조 기록을 넣을 수 없습니다.');
  if(!JSON_KEYS.includes(k)){
   safeTree(raw);
   if(['v5_fx','v5_fg','v5_cma_amount','v5_lastAutoSnap'].includes(k)||calc(k)){
    if(calc(k)&&raw==='')return;
    if(!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)||!finite(Number(raw)))fail('숫자 설정 손상');
    const n=Number(raw);if((k==='v5_fx'&&n<=0)||(k==='v5_fg'&&(n<0||n>100))||((k==='v5_cma_amount'||calc(k))&&n<0)||(k==='v5_lastAutoSnap'&&!timestamp(n)))fail('숫자 설정 범위 오류');
   }return;
  }
  const v=parseJSON(raw);safeTree(v);
  if(ACCOUNTS.includes(k))stocks(v);
  else if(['v5_div','v5_fxHistory','v5_memos','v5_debtBank','v5_debtHouse','v5_nonFinAssets'].includes(k)){if(!Array.isArray(v))fail('배열 형식 오류: '+k);}
  else if(!object(v))fail('객체 형식 오류: '+k);
  if(k==='v5_snap'||k==='v5_deposits'){
   const groups=k==='v5_snap'?['all','dom','ov','pen','gen']:['dom','ov','pen','gen'];
   const typed=[];
   for(const [g,rows] of Object.entries(v)){
    if(!groups.includes(g)||!Array.isArray(rows))fail('기록 형식 오류: '+k);const seen=new Set(),groupTyped=[];
    for(const r of rows){
     if(!object(r)||!timestamp(r.ts)||!(k==='v5_snap'?nonnegative(r.val):finite(r.amount))||(k==='v5_snap'&&seen.has(r.ts)))fail('기록 형식 또는 중복 오류: '+k);
     seen.add(r.ts);if(k==='v5_snap')provenance(r);
     else if(own(r,'activityVersion')){if(sourceVersion!==VERSION)fail('구버전 백업에는 새 활동 분류를 넣을 수 없습니다.');groupTyped.push(r);typed.push(r);}
    }
    if(groupTyped.length&&(!returnAssessment||!returnAssessment.validateFlows(groupTyped,g).ok))fail('입출금·내부 매매 활동 형식 또는 중복 오류');
   }
   // Only the explicit activityVersion marker opts into v7 semantics. Historical
   // rows (including inert id/kind metadata and duplicates) are never rewritten.
   if(typed.length&&!returnAssessment.validateFlows(typed,'all').ok)fail('입출금·내부 매매 활동 ID 또는 중복 오류');
  }
  if(k==='v5_benchHist')benchmark(v);
  if(k==='v5_benchHistV2')sidecar(v);
  if(k==='v5_balGoals'&&(Object.keys(v).some(g=>!['all','dom','ov','pen','gen'].includes(g))||Object.values(v).some(n=>!finite(n)||n<0||n>100)))fail('목표 비중 형식 오류');
  if(['v5_debtBank','v5_debtHouse','v5_nonFinAssets'].includes(k)&&v.some(r=>!object(r)||typeof r.name!=='string'||!nonnegative(r[k==='v5_debtBank'?'balance':'amount'])))fail('자산·부채 기록 형식 오류');
  if(k==='v5_userThemeMap'&&Object.values(v).some(t=>typeof t!=='string'))fail('분류 설정 형식 오류');
  if(k==='v5_div'&&v.some(r=>!object(r)||typeof r.date!=='string'||!finite(r.amount)))fail('배당 기록 형식 오류');
  if(k==='v5_fxHistory'&&v.some(r=>!object(r)||typeof r.d!=='string'||!finite(r.v)||r.v<=0))fail('환율 기록 형식 오류');
  if(k==='v5_memos'&&v.some(r=>!object(r)||typeof r.text!=='string'))fail('메모 형식 오류');
  if(k==='v5_ledger')for(const month of Object.values(v)){if(!object(month))fail('가계부 형식 오류');for(const [type,rows]of Object.entries(month)){if(!['income','expense','invest'].includes(type)||!Array.isArray(rows)||rows.some(r=>!object(r)||typeof r.name!=='string'||!finite(r.amount)))fail('가계부 기록 손상');}}
 }
 function capture(storage,overrides={}){
  if(!object(overrides))fail('백업 대체값 형식 오류');safeTree(overrides);
  const values={};if(!Number.isSafeInteger(storage.length)||storage.length>LIMITS.keys)fail('저장 키 한도 초과');
  for(let i=0;i<storage.length;i++){const k=storage.key(i);if(allowed(k))values[k]=storage.getItem(k);}
  for(const [k,v]of Object.entries(overrides)){if(!allowed(k))fail('백업 범위 밖 키');values[k]=v;}return values;
 }
 function envelope(values){return {format:FORMAT,schemaVersion:VERSION,exportedAt:new Date().toISOString(),scope:'portfolio-only-no-secrets-no-radar',storage:values};}
 function create(storage,overrides={}){
  if(isWriteBlocked(storage))fail('중단되거나 손상된 복원 사본이 있어 일반 백업을 만들지 않습니다.');
  const original=capture(storage);for(const[k,v]of Object.entries(original))validateValue(k,v);
  if(!object(overrides))fail('백업 대체값 형식 오류');safeTree(overrides);const b=envelope({...original,...overrides});validateEnvelope(b);
  const again=capture(storage);if(JSON.stringify(original)!==JSON.stringify(again))fail('백업 도중 자료가 바뀌었습니다. 다시 미리 확인하세요.');
  if(bytes(JSON.stringify(b))>MAX_BYTES)fail('전체 백업 용량 한도 초과');return b;
 }
 function validateEnvelope(b){
  if(!object(b)||b.format!==FORMAT||![6,VERSION].includes(b.schemaVersion)||!object(b.storage))fail('지원하지 않는 전체 백업 스키마');
  if(Object.keys(b).some(k=>!['format','schemaVersion','exportedAt','scope','storage'].includes(k)))fail('지원하지 않는 백업 메타데이터');
  if(own(b,'exportedAt')&&!instant(b.exportedAt))fail('백업 생성 시각 형식 오류');
  if(own(b,'scope')&&b.scope!=='portfolio-only-no-secrets-no-radar')fail('지원하지 않는 백업 범위');
  if(!ACCOUNTS.every(k=>own(b.storage,k)))fail('새 백업에 4개 계좌가 모두 필요합니다.');
  const keys=Object.keys(b.storage);if(keys.length>LIMITS.keys)fail('백업 키 한도 초과');for(const k of keys)validateValue(k,b.storage[k],b.schemaVersion);return b.storage;
 }
 const plans=new WeakMap();
 function parsedPlan(values,legacy,warnings,sourceVersion){const plan=freeze({values,legacy,warnings,sourceVersion});plans.set(plan,new WeakMap());return plan;}
 function parse(text){
  const b=parseJSON(text);
  if(object(b)&&own(b,'gasUrl')&&['v4','v5',4,5].includes(b.version))delete b.gasUrl; // Never copy legacy endpoint/credentials into the plan or journal.
  safeTree(b);
  if(b&&b.format===FORMAT){const values=validateEnvelope(b),warnings=['포함된 키만 교체하며 누락된 설정·기록 그룹은 유지합니다.',...archiveWarnings(values)];return parsedPlan(values,false,warnings,b.schemaVersion);}
  if(!object(b)||!['v4','v5',4,5].includes(b.version))fail('알 수 없는 구버전 또는 미래 버전');
  const values={},warnings=['구버전 백업: 없는 계좌·설정·기록 그룹은 현재 값을 유지합니다.','GAS 주소·API 키·잠금정보는 복원하지 않습니다.'];
  const fields={genStocks:'v5_gen',domStocks:'v5_dom',ovStocks:'v5_ov',penStocks:'v5_pen',divList:'v5_div',snapshots:'v5_snap',deposits:'v5_deposits',ledger:'v5_ledger',fxHistory:'v5_fxHistory',memos:'v5_memos',userThemeMap:'v5_userThemeMap',balGoals:'v5_balGoals',benchHist:'v5_benchHist'};
  const known=[...Object.keys(fields),'version','exportedAt','date','stocks','pension','usdKrw','fg','calcData'];if(Object.keys(b).some(k=>!known.includes(k)))fail('지원하지 않는 구버전 백업 필드');
  for(const [field,key]of Object.entries(fields))if(own(b,field))values[key]=JSON.stringify(b[field]);
  if(own(b,'stocks')&&!own(b,'domStocks')){
   if(!Array.isArray(b.stocks)||b.stocks.some(s=>!object(s)||!['KR','US'].includes(s.market)))fail('구버전 시장 구분 오류');
   for(const [market,key]of [['KR','v5_dom'],['US','v5_ov']]){if(own(values,key))continue;values[key]=JSON.stringify(b.stocks.filter(s=>s.market===market).map(s=>({...s,quantity:s.quantity??0,avgPrice:s.avgPrice??0,currentPrice:s.currentPrice??0})));}
  }
  if(own(b,'pension')&&!own(b,'penStocks')){if(!Array.isArray(b.pension)||b.pension.some(s=>!object(s)))fail('구버전 연금 형식 오류');values.v5_pen=JSON.stringify(b.pension.map(s=>({...s,quantity:s.quantity??0,avgPrice:s.avgPrice??0,currentPrice:s.currentPrice??0})));}
  if(b.snapshots&&own(b.snapshots,'normal')){if(own(b.snapshots,'all')||own(b.snapshots,'dom'))fail('구버전 기록 그룹이 충돌합니다.');const groups={...b.snapshots,all:b.snapshots.normal};delete groups.normal;values.v5_snap=JSON.stringify(groups);}
  if(own(b,'usdKrw')){if(!finite(b.usdKrw))fail('구버전 숫자 설정 형식 오류');values.v5_fx=String(b.usdKrw);}
  // The real v5 exporter reads localStorage directly: fg is a string or null.
  // Null means no exported setting, never zero or a request to delete a value.
  // String syntax and the 0..100 range still pass the common stored-value check.
  if(own(b,'fg')){
   if(b.fg===null)warnings.push('구버전 FG 설정이 비어 있어 현재 값을 유지합니다. 없는 값을 0으로 만들지 않습니다.');
   else if(typeof b.fg==='string'||finite(b.fg))values.v5_fg=String(b.fg);
   else fail('구버전 숫자 설정 형식 오류');
  }
  if(own(b,'calcData')){if(!object(b.calcData))fail('계산기 자료 오류');for(const[k,v]of Object.entries(b.calcData)){if(!calc(k)||!['string','number'].includes(typeof v))fail('구버전 계산기 키 또는 값 범위 오류');values[k]=String(v);}}
  if(!Object.keys(values).length)fail('복원할 지원 자료가 없습니다.');for(const[k,v]of Object.entries(values))validateValue(k,v,5);
  if(!own(values,'v5_gen'))warnings.push('일반계좌가 백업에 없습니다. 현재 일반계좌는 유지하지만 이 파일만으로 새 기기에서 일반계좌를 복구할 수 없는 불완전 백업입니다. 반영·기기 변경 전 일반계좌가 포함된 별도 독립 백업을 확보하세요.');
  warnings.push(...archiveWarnings(values));
  if(['v4',4].includes(b.version))warnings.push('v4 변환은 미리보기 계획입니다. 적용하지 않으면 아무 자료도 바뀌지 않습니다.');
  return parsedPlan(values,true,warnings,b.version);
 }
 function checkPlan(plan){if(!plans.has(plan))fail('검증된 백업 계획이 아닙니다. 파일을 다시 선택하세요.');}
 function resolved(storage,plan){
  checkPlan(plan);const values={...plan.values},dependencies={};
  function currentRaw(k){const raw=storage.getItem(k);dependencies[k]=raw;if(raw!==null)validateValue(k,raw);return raw;}
  for(const k of ['v5_snap','v5_deposits','v5_benchHist','v5_balGoals'])if(own(values,k)){
   const raw=currentRaw(k),current=raw===null?{}:parseJSON(raw),incoming=parseJSON(values[k]);
   // Omitted groups are unknown, not empty. Preserve incoming raw text whenever
   // it covers every current field, which is essential for exact hash binding.
   const missing=Object.keys(current).filter(g=>!own(incoming,g));
   if(missing.length){
    if(k==='v5_benchHist'&&own(values,'v5_benchHistV2'))fail('누락된 현재 지수 그룹을 합치면 보조 기록의 원본 연결이 바뀝니다. 복원하지 않았습니다.');
    values[k]=JSON.stringify({...current,...incoming});
   }
  }
  if(own(values,'v5_benchHistV2')){
   const raw=currentRaw('v5_benchHistV2'),incoming=parseJSON(values.v5_benchHistV2);
   if(raw!==null){
    const current=parseJSON(raw),missing=Object.keys(current.series).filter(g=>!own(incoming.series,g));
    if(missing.length){
     if(current.legacyFingerprint!==incoming.legacyFingerprint)fail('누락된 지수 보조 그룹의 원본 연결이 달라 합칠 수 없습니다. 복원하지 않았습니다.');
     values.v5_benchHistV2=JSON.stringify({...incoming,series:{...current.series,...incoming.series}});
    }
   }
   const legacyRaw=own(values,'v5_benchHist')?values.v5_benchHist:currentRaw('v5_benchHist');
   boundSidecar(values.v5_benchHistV2,legacyRaw);
  }
  // Validate the combined result too: omitted groups can carry typed IDs that
  // collide with an otherwise valid incoming group.
  for(const[k,v]of Object.entries(values))validateValue(k,v);
  return {values,dependencies};
 }
 function readCurrent(storage,values){const before={};for(const k of Object.keys(values)){before[k]=storage.getItem(k);if(before[k]!==null)validateValue(k,before[k]);}return before;}
 const same=(storage,values)=>Object.entries(values).every(([k,v])=>storage.getItem(k)===v);
 function preview(storage,plan){
  const {values,dependencies}=resolved(storage,plan),before=readCurrent(storage,values),journal=storage.getItem(JOURNAL);readJournal(storage);
  if(!same(storage,dependencies)||!same(storage,before))fail('미리보기 중 자료가 바뀌었습니다. 파일을 다시 선택하세요.');
  const rows=Object.entries(values).map(([key,value])=>({key,before:ACCOUNTS.includes(key)?(before[key]===null?0:parseJSON(before[key]).length):null,after:ACCOUNTS.includes(key)?parseJSON(value).length:null,changed:before[key]!==value}));
  plans.get(plan).set(storage,{before,journal,dependencies});return rows;
 }
 function readJournal(storage){
  const raw=storage.getItem(JOURNAL);if(raw===null)return null;const j=parseJSON(raw);safeTree(j);
  if(!object(j)||![1,2].includes(j.version)||!['prepared','applied','undone'].includes(j.status)||!object(j.before)||Object.keys(j.before).length===0)fail('복원 전 사본 손상. 원본은 보존합니다.');
  for(const[k,v]of Object.entries(j.before)){if(!allowed(k)||(v!==null&&typeof v!=='string'))fail('복원 전 사본 손상. 원본은 보존합니다.');if(v!==null)validateValue(k,v);}
  if(Object.keys(j).some(k=>!['version','status','savedAt','before','after'].includes(k))||(own(j,'savedAt')&&!instant(j.savedAt)))fail('복원 전 사본 메타데이터 손상');
  if(j.version===2){if(!instant(j.savedAt)||!object(j.after)||Object.keys(j.after).length!==Object.keys(j.before).length||Object.keys(j.before).some(k=>!own(j.after,k)))fail('복원 전 사본 대상 손상');for(const[k,v]of Object.entries(j.after))validateValue(k,v);}
  return j;
 }
 function rollbackOwned(storage,before,after,ownedJournal){
  if(storage.getItem(JOURNAL)!==ownedJournal)fail('다른 작업의 사본이 감지되어 자동 복구하지 않습니다.');
  for(const k of Object.keys(before))if(storage.getItem(k)!==before[k]&&storage.getItem(k)!==after[k])fail('다른 편집이 감지되어 자동 복구하지 않습니다.');
  for(const[k,v]of Object.entries(before)){
   if(storage.getItem(JOURNAL)!==ownedJournal)fail('복원 전 사본이 바뀌었습니다.');
   const now=storage.getItem(k);if(now===v)continue;if(now!==after[k])fail('다른 편집이 감지되었습니다.');
   if(v===null)storage.removeItem(k);else storage.setItem(k,v);if(storage.getItem(k)!==v)fail('복구 저장 확인 실패');
  }
 }
 function apply(storage,plan){
  checkPlan(plan);const pending=readJournal(storage);if(pending&&(pending.status==='prepared'||pending.version!==2&&pending.status!=='undone'))fail('중단된 복원이 있습니다. 자동 복구하지 않습니다. 사본을 내보내고 별도 검토하세요.');
  const seen=plans.get(plan).get(storage);if(seen&&(!same(storage,seen.before)||!same(storage,seen.dependencies)||storage.getItem(JOURNAL)!==seen.journal))fail('미리보기 이후 자료가 바뀌었습니다. 파일을 다시 선택하세요.');
  const {values,dependencies}=resolved(storage,plan),before=readCurrent(storage,values),oldJournal=storage.getItem(JOURNAL);
  if(!same(storage,dependencies))fail('자료가 바뀌어 복원하지 않았습니다.');
  if(seen&&(JSON.stringify(seen.before)!==JSON.stringify(before)||seen.journal!==oldJournal))fail('미리보기 이후 자료가 바뀌었습니다. 파일을 다시 선택하세요.');
  for(const[k,v]of Object.entries(values))validateValue(k,v);
  const journal={version:2,status:'prepared',savedAt:new Date().toISOString(),before,after:values};let prepared=JSON.stringify(journal);
  if(bytes(prepared)>MAX_BYTES)fail('복원 전 사본 용량 한도 초과. 자료는 변경하지 않았습니다.');
  if(!same(storage,before)||!same(storage,dependencies)||storage.getItem(JOURNAL)!==oldJournal)fail('자료가 바뀌어 복원하지 않았습니다.');
  try{storage.setItem(JOURNAL,prepared);if(storage.getItem(JOURNAL)!==prepared)fail('사본 저장 확인 실패');}catch{fail('복원 전 사본을 저장하지 못했습니다. 자료는 변경하지 않았습니다. 전체 백업을 따로 보관한 뒤 저장 공간을 확인하세요.');}
  const expected={...dependencies,...before};let ownedJournal=prepared;
  try{
   for(const[k,v]of Object.entries(values)){if(storage.getItem(JOURNAL)!==prepared||!same(storage,expected))fail('동시 편집 감지');storage.setItem(k,v);expected[k]=v;if(storage.getItem(k)!==v)fail('복원 저장 확인 실패');}
   if(!same(storage,expected)||storage.getItem(JOURNAL)!==prepared)fail('동시 편집 감지');
   journal.status='applied';const applied=JSON.stringify(journal);storage.setItem(JOURNAL,applied);ownedJournal=storage.getItem(JOURNAL)===applied?applied:prepared;if(storage.getItem(JOURNAL)!==applied)fail('복원 완료 표시 저장 실패');
  }catch(e){try{rollbackOwned(storage,before,values,ownedJournal);journal.status='undone';storage.setItem(JOURNAL,JSON.stringify(journal));}catch{fail('자동 복구가 끝나지 않았습니다. 다른 편집 또는 저장 실패가 있을 수 있습니다. 앱 사용을 멈추고 복원 전 사본을 내보내세요.');}fail('복원 실패. 변경 전 자료로 복구했습니다.');}
  plans.get(plan).delete(storage);return journal;
 }
 function undo(storage){
  const j=readJournal(storage);if(!j||j.status==='undone')fail('되돌릴 복원 전 사본이 없습니다.');
  if(j.version!==2||j.status==='prepared')fail('중단되었거나 구형인 복원은 자동으로 되돌리지 않습니다. 사본을 내보내고 별도 검토하세요.');
  if(!same(storage,j.after))fail('복원 이후 자료가 바뀌었습니다. 편집을 덮어쓰지 않도록 되돌리기를 중단했습니다.');
  const raw=storage.getItem(JOURNAL);if(!same(storage,j.after)||storage.getItem(JOURNAL)!==raw)fail('자료가 바뀌었습니다.');
  j.status='prepared';const prepared=JSON.stringify(j);storage.setItem(JOURNAL,prepared);
  try{rollbackOwned(storage,j.before,j.after,prepared);j.status='undone';storage.setItem(JOURNAL,JSON.stringify(j));}catch{fail('되돌리기를 끝내지 못했습니다. 자동 재시도하지 마세요. 사본을 내보내고 별도 검토하세요.');}
 }
 function isWriteBlocked(storage){try{const j=readJournal(storage);return !!j&&(j.status==='prepared'||j.version!==2&&j.status!=='undone');}catch{return true;}}
 function recover(storage){const j=readJournal(storage);if(j?.status==='prepared')fail('중단된 복원은 자동 복구하지 않습니다. 사본을 내보내고 별도 검토하세요.');return false;}
 return Object.freeze({FORMAT,VERSION,JOURNAL,MAX_BYTES,LIMITS,ACCOUNTS,JSON_KEYS,TEXT_KEYS,allowed,validateStoredValue:validateValue,create,parse,preview,apply,undo,recover,readJournal,capture,isWriteBlocked});
});
