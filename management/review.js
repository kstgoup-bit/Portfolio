/* Stage6 design contract only: synthetic inputs, no account/storage/network/order wiring. */
'use strict';
const SELL_STATES=new Set(['장기 보유 검토','비중 점검','일부 매도 검토','투자 논리 훼손 재검토','평가 불가']);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
function composeReview(input,{today}={}){
 const out={schemaVersion:1,mode:'synthetic-design',status:'평가 불가',reasons:[],reviews:[],automaticAction:false,order:null,actualActiveCount:0};
 if(!input||input.mode!=='synthetic'||!/^PLAN-DEMO-[A-Z0-9-]+$/.test(input.companyId||'')||!day(today)){out.reasons.push('합성 설계 전용 입력 필요');return out;}
 const p=input.policy;
 if(!p||p.mode!=='synthetic'||!['pensionCore','overseasSatellite'].includes(p.role)||p.reviewConfirmed!==true){out.reasons.push('합성 계좌 정책 확인 대기 · 실제 정책 승인 아님');return out;}
 if(!finite(p.targetWeight)||!finite(p.maxWeight)||p.targetWeight<0||p.maxWeight<=0||p.targetWeight>p.maxWeight||p.maxWeight>1||!finite(input.currentWeight)||input.currentWeight<0||input.currentWeight>1){out.reasons.push('목표/최대/현재 비중 확인 필요');return out;}
 out.policyRole=p.role;out.weight={current:input.currentWeight,target:p.targetWeight,max:p.maxWeight,gap:input.currentWeight-p.targetWeight,formula:'현재 비중 − 명시한 합성 목표 비중'};
 for(const [name,r] of [['매수',input.buy],['매도',input.sell]]){
  if(!r||r.mode!=='synthetic'||r.companyId!==input.companyId||!day(r.asOf)||r.asOf>today||(Date.parse(today)-Date.parse(r.asOf))/86400000>4){out.reasons.push(name+' 검토의 합성 출처/대상/기준일 불일치');continue;}
  if(name==='매수'?!['review','none','unavailable'].includes(r.status):!SELL_STATES.has(r.status)){out.reasons.push(name+' 상태 계약 오류');continue;}
  if(r.status==='unavailable'||r.status==='평가 불가'){out.reasons.push(name+' 근거 부족');continue;}
  out.reviews.push({kind:name,status:r.status,asOf:r.asOf});
 }
 if(input.valuationConfidence!=='reviewed')out.reasons.push('기업 가치평가 불확실/결측');
 if(input.buy?.asOf!==input.sell?.asOf)out.reasons.push('매수·매도 기준 거래일 불일치');
 if(out.reasons.length)return out;
 const s=input.sell.status,b=input.buy.status;
 if(b==='review'&&['일부 매도 검토','투자 논리 훼손 재검토'].includes(s)){out.status='상충 근거 재검토';out.reasons.push('매수·매도 검토를 상계하거나 주문으로 변환하지 않음');}
 else if(s==='투자 논리 훼손 재검토'){out.status=s;out.reasons.push('구조적 악화 근거와 반대 근거를 우선 재검토');}
 else if(input.currentWeight>p.maxWeight||s==='비중 점검'){out.status='비중 점검';out.reasons.push('승인 가정 한도 초과 또는 매도 모듈의 비중 검토');}
 else if(s==='일부 매도 검토'){out.status=s;out.reasons.push('매도 연구의 비용/대안 검토 근거 확인 필요');}
 else if(b==='review'){out.status='매수 근거 검토';out.reasons.push('목표 비중 차이만으로 매수하지 않음');}
 else{out.status='장기 보유 검토';out.reasons.push('새 행동을 제안하지 않고 기존 근거를 정기 확인');}
 return out;
}
module.exports={composeReview};
