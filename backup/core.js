/* Local-only portfolio backup. No keys, network, or default account resets. */
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f();else root.KSTPortfolioBackup=f();})(globalThis,function(){
 'use strict';
 const FORMAT='kst-portfolio-backup',VERSION=6,JOURNAL='kst.portfolio.restoreJournal',MAX_BYTES=20*1024*1024;
 const ACCOUNTS=['v5_gen','v5_dom','v5_ov','v5_pen'];
 const JSON_KEYS=[...ACCOUNTS,'v5_snap','v5_deposits','v5_div','v5_balGoals','v5_ledger','v5_fxHistory','v5_memos','v5_userThemeMap','v5_investPrinciples','v5_debtBank','v5_debtHouse','v5_nonFinAssets','v5_benchHist','v5_riskData','v5_rkCache'];
 const TEXT_KEYS=['v5_fx','v5_fg','v5_cma_amount','v5_lastAutoSnap','v5_divMonthFilter','v5_divSumMonth','v5_divSumYear','v5_divTickerYear'];
 const allowed=k=>JSON_KEYS.includes(k)||TEXT_KEYS.includes(k)||/^calc_[qp][123]_(dom|ov|pen|gen)_\d+$/.test(k);
 const object=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 const fail=s=>{throw new Error(s);};
 function safeTree(v,depth=0){
  if(depth>30)fail('자료 중첩 한도 초과');
  if(typeof v==='number'&&!Number.isFinite(v))fail('비유한 숫자');
  if(typeof v==='string'&&(/<[a-z/!]|\bon[a-z]+\s*=|javascript:|\u0000/i.test(v)))fail('실행 가능한 HTML/스크립트 문자열은 복원할 수 없습니다.');
  if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){if(['__proto__','prototype','constructor'].includes(k))fail('금지된 자료 속성');safeTree(x,depth+1);}
 }
 function stocks(a){
  if(!Array.isArray(a)||a.length>10000)fail('계좌는 종목 배열이어야 합니다.');
  const ids=new Set();for(const s of a){
   if(!object(s)||!(Number.isSafeInteger(s.id)&&s.id>=0)||ids.has(String(s.id))||typeof s.name!=='string'||!s.name.trim()||typeof s.ticker!=='string'||!s.ticker.trim()||!['quantity','avgPrice','currentPrice'].every(k=>finite(s[k])))fail('종목 필드 손상 또는 중복 ID');
   if(!/^[\p{L}\p{N}_.()·\- ]+$/u.test(s.ticker))fail('잘못된 티커');
   ids.add(String(s.id));
  }
 }
 function validateValue(k,raw){
  if(!allowed(k)||typeof raw!=='string'||raw.length>MAX_BYTES)fail('지원하지 않는 저장 키 또는 값');
  if(!JSON_KEYS.includes(k)){safeTree(raw);if(['v5_fx','v5_fg','v5_cma_amount','v5_lastAutoSnap'].includes(k)&&(!raw.trim()||!Number.isFinite(Number(raw))))fail('숫자 설정 손상');return;}
  let v;try{v=JSON.parse(raw);}catch{fail('저장 자료 JSON 손상: '+k);}safeTree(v);
  if(ACCOUNTS.includes(k))stocks(v);
  else if(['v5_div','v5_fxHistory','v5_memos','v5_debtBank','v5_debtHouse','v5_nonFinAssets'].includes(k)){if(!Array.isArray(v))fail('배열 형식 오류: '+k);}
  else if(!object(v))fail('객체 형식 오류: '+k);
  if(k==='v5_snap'||k==='v5_deposits'){
   const groups=k==='v5_snap'?['all','dom','ov','pen','gen']:['dom','ov','pen','gen'];
   for(const [g,rows] of Object.entries(v)){if(!groups.includes(g)||!Array.isArray(rows)||rows.some(r=>!object(r)||!finite(r.ts)||!(k==='v5_snap'?finite(r.val):finite(r.amount))))fail('기록 형식 오류: '+k);}
  }
  if(k==='v5_balGoals'&&Object.values(v).some(n=>!finite(n)||n<0||n>100))fail('목표 비중 형식 오류');
  if(['v5_debtBank','v5_debtHouse','v5_nonFinAssets'].includes(k)&&v.some(r=>!object(r)||typeof r.name!=='string'||!finite(r[k==='v5_debtBank'?'balance':'amount'])))fail('자산·부채 기록 형식 오류');
  if(k==='v5_userThemeMap'&&Object.values(v).some(t=>typeof t!=='string'))fail('분류 설정 형식 오류');
  if(k==='v5_div'&&v.some(r=>!object(r)||typeof r.date!=='string'||!finite(r.amount)))fail('배당 기록 형식 오류');
  if(k==='v5_fxHistory'&&v.some(r=>!object(r)||typeof r.d!=='string'||!finite(r.v)))fail('환율 기록 형식 오류');
  if(k==='v5_memos'&&v.some(r=>!object(r)||typeof r.text!=='string'))fail('메모 형식 오류');
  if(k==='v5_ledger')for(const month of Object.values(v)){if(!object(month))fail('가계부 형식 오류');for(const [type,rows]of Object.entries(month)){if(!['income','expense','invest'].includes(type)||!Array.isArray(rows)||rows.some(r=>!object(r)||typeof r.name!=='string'||!finite(r.amount)))fail('가계부 기록 손상');}}
 }
 function capture(storage,overrides={}){
  const values={};for(let i=0;i<storage.length;i++){const k=storage.key(i);if(allowed(k))values[k]=storage.getItem(k);}
  for(const [k,v]of Object.entries(overrides)){if(!allowed(k))fail('백업 범위 밖 키');values[k]=v;}
  return values;
 }
 function envelope(values){return {format:FORMAT,schemaVersion:VERSION,exportedAt:new Date().toISOString(),scope:'portfolio-only-no-secrets-no-radar',storage:values};}
 function create(storage,overrides={}){const original=capture(storage);for(const[k,v]of Object.entries(original))validateValue(k,v);const b=envelope(capture(storage,overrides));validateEnvelope(b);if(new TextEncoder().encode(JSON.stringify(b)).length>MAX_BYTES)fail('전체 백업 용량 한도 초과');return b;}
 function validateEnvelope(b){
  if(!object(b)||b.format!==FORMAT||b.schemaVersion!==VERSION||!object(b.storage))fail('지원하지 않는 전체 백업 스키마');
  if(!ACCOUNTS.every(k=>Object.hasOwn(b.storage,k)))fail('새 백업에 4개 계좌가 모두 필요합니다.');
  const keys=Object.keys(b.storage);if(keys.length>50000)fail('백업 키 한도 초과');
  for(const k of keys)validateValue(k,b.storage[k]);return b.storage;
 }
 function parse(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)fail('백업은 최대 20MiB입니다.');
  const b=JSON.parse(text);safeTree(b);
  if(b?.format===FORMAT)return {values:validateEnvelope(b),legacy:false,warnings:['포함된 키만 교체하며 누락된 설정은 유지합니다.']};
  if(!object(b)||!['v4','v5',4,5].includes(b.version))fail('알 수 없는 구버전 또는 미래 버전');
  const values={},warnings=['구버전 백업: 없는 계좌·설정은 현재 값을 유지합니다.'];
  for(const [field,key]of Object.entries({genStocks:'v5_gen',domStocks:'v5_dom',ovStocks:'v5_ov',penStocks:'v5_pen',divList:'v5_div',snapshots:'v5_snap',deposits:'v5_deposits',ledger:'v5_ledger',fxHistory:'v5_fxHistory',memos:'v5_memos',userThemeMap:'v5_userThemeMap'}))if(Object.hasOwn(b,field))values[key]=JSON.stringify(b[field]);
  if(Object.hasOwn(b,'stocks')&&!Object.hasOwn(b,'domStocks')){
   if(!Array.isArray(b.stocks)||b.stocks.some(s=>!['KR','US'].includes(s.market)))fail('구버전 시장 구분 오류');
   for(const [market,key]of [['KR','v5_dom'],['US','v5_ov']]){if(Object.hasOwn(values,key))continue;values[key]=JSON.stringify(b.stocks.filter(s=>s.market===market).map(s=>({...s,quantity:s.quantity??0,avgPrice:s.avgPrice??0,currentPrice:s.currentPrice??0})));}
  }
  if(Object.hasOwn(b,'pension')&&!Object.hasOwn(b,'penStocks')){if(!Array.isArray(b.pension))fail('구버전 연금 형식 오류');values.v5_pen=JSON.stringify(b.pension.map(s=>({...s,quantity:s.quantity??0,avgPrice:s.avgPrice??0,currentPrice:s.currentPrice??0})));}
  if(b.snapshots&&Object.hasOwn(b.snapshots,'normal')&&!Object.hasOwn(b.snapshots,'dom'))values.v5_snap=JSON.stringify({all:b.snapshots.normal});
  for(const [field,key]of [['usdKrw','v5_fx'],['fg','v5_fg']])if(Object.hasOwn(b,field)&&b[field]!==null)values[key]=String(b[field]);
  if(Object.hasOwn(b,'calcData')){if(!object(b.calcData))fail('계산기 자료 오류');for(const[k,v]of Object.entries(b.calcData)){if(!/^calc_[qp][123]_(dom|ov|pen|gen)_\d+$/.test(k))fail('구버전 계산기 키 범위 오류');values[k]=String(v);}}
  if(Object.hasOwn(b,'gasUrl'))warnings.push('GAS 주소는 보안 설정이므로 자동 복원하지 않습니다.');
  if(!Object.keys(values).length)fail('복원할 지원 자료가 없습니다.');for(const[k,v]of Object.entries(values))validateValue(k,v);
  if(!Object.hasOwn(values,'v5_gen'))warnings.push('일반계좌가 백업에 없습니다. 현재 일반계좌를 유지합니다.');
  return {values,legacy:true,warnings};
 }
 function resolved(storage,plan){
  const values={...plan.values};
  if(plan.legacy)for(const k of ['v5_snap','v5_deposits'])if(Object.hasOwn(values,k)){const current=JSON.parse(storage.getItem(k)||'{}');if(!object(current))fail('현재 기록 객체 손상');values[k]=JSON.stringify({...current,...JSON.parse(values[k])});}
  return values;
 }
 function preview(storage,plan){
  return Object.entries(resolved(storage,plan)).map(([key,value])=>({key,before:ACCOUNTS.includes(key)?JSON.parse(storage.getItem(key)||'[]').length:null,after:ACCOUNTS.includes(key)?JSON.parse(value).length:null,changed:storage.getItem(key)!==value}));
 }
 function readJournal(storage){
  const raw=storage.getItem(JOURNAL);if(raw===null)return null;
  const j=JSON.parse(raw);if(!object(j)||j.version!==1||!['prepared','applied','undone'].includes(j.status)||!object(j.before)||Object.entries(j.before).some(([k,v])=>!allowed(k)||(v!==null&&typeof v!=='string')))fail('복원 전 사본 손상. 원본은 보존합니다.');return j;
 }
 function rollback(storage,before){
  // Free changed keys first so restoring the original size cannot require extra space.
  for(const k of Object.keys(before))storage.removeItem(k);
  for(const[k,v]of Object.entries(before))if(v!==null)storage.setItem(k,v);
 }
 function apply(storage,plan){
  const pending=readJournal(storage);if(pending?.status==='prepared')fail('중단된 복원을 먼저 복구하세요.');
  const values=resolved(storage,plan),keys=Object.keys(values);for(const k of keys)validateValue(k,values[k]);
  const before=Object.fromEntries(keys.map(k=>[k,storage.getItem(k)]));
  const journal={version:1,status:'prepared',savedAt:new Date().toISOString(),before};
  try{storage.setItem(JOURNAL,JSON.stringify(journal));}catch{fail('복원 전 사본을 저장하지 못했습니다. 자료는 변경하지 않았습니다. 전체 백업을 따로 보관한 뒤 저장 공간을 확인하세요.');} // Must succeed before touching any portfolio key.
  try{for(const k of keys)storage.setItem(k,values[k]);journal.status='applied';storage.setItem(JOURNAL,JSON.stringify(journal));}
  catch(e){try{rollback(storage,before);journal.status='undone';storage.setItem(JOURNAL,JSON.stringify(journal));}catch{fail('자동 복구가 끝나지 않았습니다. 복원 전 사본을 보존했으니 앱 사용을 멈추고 사본을 내보내세요.');}fail('복원 실패. 변경 전 자료로 복구했습니다.');}
  return journal;
 }
 function undo(storage){const j=readJournal(storage);if(!j||j.status==='undone')fail('되돌릴 복원 전 사본이 없습니다.');rollback(storage,j.before);j.status='undone';storage.setItem(JOURNAL,JSON.stringify(j));}
 function recover(storage){const j=readJournal(storage);if(j?.status==='prepared'){undo(storage);return true;}return false;}
 return {FORMAT,VERSION,JOURNAL,MAX_BYTES,ACCOUNTS,JSON_KEYS,TEXT_KEYS,allowed,create,parse,preview,apply,undo,recover,readJournal,capture};
});
