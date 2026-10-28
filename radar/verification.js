/* Evidence-based review workflow. Pure functions; never activates unreviewed tickers. */
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f();else root.KSTRadarVerification=f();})(globalThis,function(){
 'use strict';
 const CHECKS=Object.freeze(['listing','marketCap','financialHealth','moat','sector','dataRights']);
 const date=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
 const url=x=>{try{return new URL(x).protocol==='https:';}catch{return false;}};
 const text=x=>typeof x==='string'&&!!x.trim();
 const copy=x=>JSON.parse(JSON.stringify(x));
 function evidence(check,asOf){return check?.status==='pass'&&date(check.checkedAt)&&date(check.asOf)&&check.asOf<=check.checkedAt&&check.checkedAt<=asOf&&(Date.parse(asOf)-Date.parse(check.checkedAt))<=30*86400000&&url(check.sourceURL)&&typeof check.note==='string'&&!!check.note.trim();}
 function current(k,c,asOf){const limit=['listing','marketCap','sector'].includes(k)?30:['financialHealth','moat'].includes(k)?450:Infinity;return evidence(c,asOf)&&(Date.parse(asOf)-Date.parse(c.asOf))<=limit*86400000;}
 function decision(security,record,asOf){
  if(!date(asOf)||record?.ticker!==security?.ticker)return {status:'hold',reasons:['검증 기록 또는 기준일 불일치']};
  const checks=record.checks||{},reasons=[];
  if((record.riskFlags||[]).length)return {status:'hold',reasons:['위험 플래그 우선 검토']};
  for(const k of CHECKS){const c=checks[k];
   if(c?.status==='fail'&&current(k,{...c,status:'pass'},asOf))return {status:k==='dataRights'?'hold':'excluded',reasons:[k+': '+c.note]};
   if(!current(k,c,asOf))reasons.push(k+' 미확인·근거 부족 또는 기준일 지연');
  }
  if(current('marketCap',checks.marketCap,asOf)){if(!Number.isFinite(checks.marketCap.valueUSD))reasons.push('시총 숫자 근거 부족');else if(checks.marketCap.valueUSD<5000000000)return {status:'excluded',reasons:['시총 50억 달러 기준 미달']};}
  if(evidence(checks.listing,asOf)&&checks.listing.value!=='active')reasons.push('현재 상장 상태 확인 필요');
  if(evidence(checks.sector,asOf)&&!text(checks.sector.value))reasons.push('업종 값 확인 필요');
  for(const k of ['financialHealth','moat'])if(evidence(checks[k],asOf)&&!text(checks[k].counterScenario))reasons.push(k+' 반대 근거 필요');
  const extra=security.evaluationRule==='financial'?['capitalAdequacy','assetQuality','funding']:security.evaluationRule==='high-growth'?['cashRunway','dilution','unitEconomics']:[];
  for(const k of extra)if(!evidence(record.ruleChecks?.[k],asOf))reasons.push(k+' 별도 적격성 확인 필요');
  return {status:reasons.length?'hold':'active',reasons:reasons.length?reasons:['모든 편입 검증 항목 충족']};
 }
 function auditUniverse(universe,registry,asOf){
  if(universe?.schemaVersion!==1||registry?.schemaVersion!==1||registry.universeVersion!==universe.version||!Array.isArray(registry.records)||!Array.isArray(universe.securities))throw Error('검증 목록 버전/스키마 불일치');
  const records=new Map();for(const r of registry.records){if(records.has(r.ticker))throw Error('중복 검증 티커');records.set(r.ticker,r);}
  if(records.size!==universe.securities.length||new Set(universe.securities.map(s=>s.ticker)).size!==universe.securities.length)throw Error('검증 목록 범위 불일치');
  const rows=universe.securities.map(s=>{if(!records.has(s.ticker))throw Error('검증 기록 누락');const d=decision(s,records.get(s.ticker),asOf);if(!['active','hold','excluded'].includes(s.status))throw Error('잘못된 종목 상태');if(s.status==='active'&&d.status!=='active')throw Error('검증되지 않은 활성화 차단');if(s.status==='excluded'&&d.status!=='excluded')throw Error('근거 없는 제외 차단');return {ticker:s.ticker,declaredStatus:s.status,...d};});
  return {version:registry.version,rows,active:rows.filter(r=>r.declaredStatus==='active'&&r.status==='active').length,hold:rows.filter(r=>r.declaredStatus==='hold').length,excluded:rows.filter(r=>r.declaredStatus==='excluded').length,eligible:rows.filter(r=>r.status==='active').length};
 }
 function createRevision(universe,registry,changes,{expectedVersion,nextVersion,asOf}={}){
  auditUniverse(universe,registry,asOf);
  if(expectedVersion!==universe.version||typeof nextVersion!=='string'||!nextVersion.trim()||nextVersion===expectedVersion||!Array.isArray(changes)||!changes.length)throw Error('버전 충돌 또는 빈 변경');
  const u=copy(universe),r=copy(registry),seen=new Set();
  for(const record of changes){const security=u.securities.find(s=>s.ticker===record.ticker);if(!security||seen.has(record.ticker))throw Error('목록 밖 또는 중복 변경');seen.add(record.ticker);const d=decision(security,record,asOf);Object.assign(security,{status:d.status,reviewStatus:d.status==='active'?'verified':'candidate',lastVerified:d.status==='active'?asOf:null,lastReviewed:asOf,evidenceUrl:d.status==='active'?record.checks.listing.sourceURL:null,holdReason:d.reasons.join(' / ')});r.records[r.records.findIndex(x=>x.ticker===record.ticker)]=copy(record);}
  u.version=nextVersion;r.universeVersion=nextVersion;r.version=nextVersion+'-review';auditUniverse(u,r,asOf);return {universe:u,registry:r};
 }
 return {CHECKS,decision,auditUniverse,createRevision};
});
