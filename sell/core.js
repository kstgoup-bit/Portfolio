/* Pure synthetic research contract. No portfolio/storage/network/order integration. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.KSTSellCore=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const STATES={unknown:'평가 불가',hold:'장기 보유 검토',weight:'비중 점검',trim:'일부 매도 검토',thesis:'투자 논리 훼손 재검토'};
 const num=x=>typeof x==='number'&&Number.isFinite(x);
 const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
 function evidence(e,today,maxAge=120){
  if(!e||!day(today)||!day(e.asOf)||!day(e.checkedAt)||typeof e.summary!=='string'||!e.summary.trim()||typeof e.counterEvidence!=='string'||!e.counterEvidence.trim())return false;
  try{const u=new URL(e.source);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)return false;}catch{return false;}
  const age=(Date.parse(today)-Date.parse(e.asOf))/86400000,checked=(Date.parse(today)-Date.parse(e.checkedAt))/86400000;
  return age>=0&&age<=maxAge&&checked>=0&&checked<=30;
 }
 function concentration(positions,limits){
  if(!Array.isArray(positions)||!positions.length||positions.length>10000||!limits||!['account','stock','sector'].every(k=>num(limits[k])&&limits[k]>0&&limits[k]<=1))return {status:'unknown',missing:['보유 평가액/사용자 승인 한도']};
  const totals={account:Object.create(null),stock:Object.create(null),sector:Object.create(null)};let total=0;
  for(const p of positions){if(!p||!num(p.value)||p.value<0||p.currency!=='BASE'||!['account','stock','sector'].every(k=>typeof p[k]==='string'&&p[k].length>0&&p[k].length<=80))return {status:'unknown',missing:['동일 기준통화 평가액/분류']};total+=p.value;for(const k of Object.keys(totals))totals[k][p[k]]=(totals[k][p[k]]||0)+p.value;}
  if(!num(total)||total<=0)return {status:'unknown',missing:['양수 포트폴리오 총액']};
  const breaches=[],weights=[];for(const k of Object.keys(totals))for(const [name,value] of Object.entries(totals[k])){const weight=value/total;weights.push({dimension:k,name,weight,limit:limits[k]});if(weight>limits[k])breaches.push({dimension:k,name,weight,limit:limits[k]});}
  return {status:breaches.length?'review':'within',total,weights,breaches,formula:'분류별 동일 기준통화 평가액 합계 / 전체 평가액 합계'};
 }
 function replacement(r,today){
  if(!r||!evidence(r.evidence,today)||!['currentQuality','alternativeQuality','currentYield','alternativeYield','taxCost','tradeCost','cashNeed','availableCash','horizonYears'].every(k=>num(r[k])&&r[k]>=0)||r.horizonYears<=0||r.currentQuality>100||r.alternativeQuality>100)return {status:'unknown',missing:['질·가격/기대수익률·세금·비용·현금·기간의 비교 근거']};
  // All cash flows and costs must be in the same user-supplied base-currency units.
  if(r.currency!=='BASE')return {status:'unknown',missing:['교체 비교 기준통화']};
  const netBenefit=(r.alternativeYield-r.currentYield)*r.horizonYears-r.taxCost-r.tradeCost;
  return {status:r.cashNeed<=r.availableCash&&r.alternativeQuality>=r.currentQuality&&netBenefit>0?'review':'no-case',netBenefit,formula:'(대안 연간 기대수익액 − 현재 연간 기대수익액) × 기간 − 세금 − 거래비용',evidence:r.evidence};
 }
 function evaluate(input,{today}={}){
  const out={mode:'synthetic',status:STATES.unknown,automaticAction:false,missing:[],reasons:[],counterEvidence:[],formulas:[],alerts:[]};
  if(!input||input.mode!=='synthetic'||!/^SELL-DEMO-[A-Z0-9-]+$/.test(input.id||'')){out.missing.push('합성 전용 입력 계약');return out;}
  const q=input.quote;
  if(!day(today)||!q||q.synthetic!==true||!day(q.asOf)||q.asOf>today||(Date.parse(today)-Date.parse(q.asOf))/86400000>4||q.adjustment!=='split-adjusted'||q.currency!=='USD'||!num(q.price)||q.price<=0||!num(q.cost)||q.cost<=0||q.costBasis!=='same-split-basis'){out.missing.push('최신성/분할 기준이 일치하는 합성 시세·취득가');return out;}
  const gain=(q.price/q.cost-1)*100;out.returnPct=gain;out.formulas.push('(동일 분할 기준 가격 / 취득가 − 1) × 100');
  for(const threshold of [20,30,50,100,200])if(gain+1e-9>=threshold)out.alerts.push('+'+threshold+'% 검토 알림 예시 · 매도 트리거 아님');
  const v=input.valuation;
  let expensive=false;
  if(!v||!evidence(v.evidence,today)||!['multiple','historicalHigh','growthPct','fcfYieldPct','outlookGrowthPct'].every(k=>num(v[k]))||v.multiple<=0||v.historicalHigh<=0||!num(v.historyYears)||v.historyYears<3)out.missing.push('밸류에이션·3년 이상 과거범위·성장·현금흐름·전망 근거');
  else{expensive=v.multiple>v.historicalHigh&&v.growthPct<=v.outlookGrowthPct&&v.fcfYieldPct<2;out.reasons.push(expensive?'합성 고평가 괴리 조건 충족':'합성 고평가 괴리 조건 미충족');out.counterEvidence.push(v.evidence.counterEvidence);out.formulas.push('현재 배수 > 과거 상단 AND 성장률 ≤ 전망 성장률 AND FCF 수익률 < 2% (연구용 고정 가정)');}
  const t=input.thesis;let impaired=false;
  if(!t||!evidence(t.evidence,today)||!Array.isArray(t.factors)||t.factors.length!==5||t.factors.some(f=>!f||!['moat','earnings','cashflow','debt','marketShare'].includes(f.name)||!['stable','structural-deterioration','uncertain'].includes(f.state))||t.factors.some(f=>f.state==='uncertain')||new Set(t.factors.map(f=>f.name)).size!==5)out.missing.push('경쟁력·실적·현금흐름·부채·점유율 구조적 검토');
  else{impaired=t.factors.some(f=>f.state==='structural-deterioration');out.reasons.push(impaired?'구조적 악화 근거 재검토 필요':'합성 투자 논리 유지 가정');out.counterEvidence.push(t.evidence.counterEvidence);}
  const c=concentration(input.positions,input.approvedLimits);out.concentration=c;if(c.status==='unknown')out.missing.push(...c.missing);else{out.formulas.push(c.formula);if(c.breaches.length)out.reasons.push('사전 승인 가정 한도 초과 '+c.breaches.length+'건');}
  out.replacement=replacement(input.replacement,today);
  // Independent warning flags remain visible even when an overall assessment is incomplete.
  out.flags={expensive,impaired,concentrated:c.status==='review'};
  if(out.missing.length)return out;
  if(impaired)out.status=STATES.thesis;
  else if(c.status==='review')out.status=STATES.weight;
  else if(expensive&&out.replacement.status==='review')out.status=STATES.trim;
  else if(expensive){out.missing.push('고평가만으로 매도 판단 불가 · 교체/현금 필요 검토');out.status=STATES.unknown;}
  else out.status=STATES.hold;
  return out;
 }
 return {STATES,evidence,concentration,replacement,evaluate};
});
