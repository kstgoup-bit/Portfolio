'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {evaluate}=require('../has/review-fin-gate.js'),F=require('../has/fundamental-filter.js'),{toNormalized}=require('../has/dart-facts-adapter.js');
const NOW='2026-11-26T00:00:00Z';
const prov=()=>({ticker:'000001',market:'KR',synthetic:false,verification:'independent-verified',source:'opendart'});
const assess=(over)=>Object.assign({version:F.VERSION,signalHold:true,opinion:'판단 보류',ticker:'000001',name:'x',checks:[{id:'roe',status:'pass'}],asOf:'2025-12-31',filed:'2026-03-20',years:5,fallback:[],conflicts:[],label:'strong',labelKo:'우량 근거 충분',reviewEligible:true,provenance:prov()},over||{});
const price=()=>({ticker:'000001',market:'KR',currency:'KRW',priceType:'close',adjustment:'raw-close',verifier:'kis-crosscheck',verification:'independent-verified',status:'ok',marketDate:'2026-11-25',evidence:[{source:'kis',marketDate:'2026-11-25',close:1000},{source:'naver',marketDate:'2026-11-25',close:1000}]});
const cons=()=>({status:'agreed',ticker:'000001',market:'KR',verdict:'buy-review',decidedOn:'2026-11-25',reviewers:['claude','gpt'],evidence:'docs/team/GPT-REVIEW-x.md'});
const ok=()=>({card:{ticker:'000001',market:'KR',verdict:'buy-review',asOf:'2026-11-25'},assessment:assess(),price:price(),consensus:cons()});
const run=m=>{const i=ok();if(m)m(i);return evaluate(i,NOW);};
const held=(m,code,state='held')=>{const o=run(m);assert.equal(o.state,state,JSON.stringify(o));assert.ok(o.missing.includes(code),JSON.stringify(o));assert.equal(o.label,null);return o;};
test('모두 충족하면 해제, 라벨은 밸류에이션 미확인까지만',()=>{const o=run();assert.equal(o.state,'released');assert.deepEqual(o.missing,[]);assert.match(o.label,/재무 확인됨\(밸류에이션 미확인\)/);assert.equal(o.valuationLinked,false);assert.doesNotMatch(o.label,/%|원|주문|사세요|매수하세요/);assert.match(o.notice,/투자 자문이 아닙니다/);});
test('add-review도 해제 대상, 매수 쪽이 아니면 해당 없음',()=>{assert.equal(run(i=>{i.card.verdict='add-review';i.consensus.verdict='add-review';}).state,'released');for(const v of ['wait','hold-long','trim-review','sell-review',undefined])held(i=>i.card.verdict=v,'not-buy-side');});
test('재무 없음·다른 종목·형식 불량은 보류',()=>{held(i=>delete i.assessment,'financials-missing');held(i=>i.assessment.ticker='000002','financials-missing');held(i=>i.assessment.version='old','financials-missing');held(i=>i.assessment.signalHold=false,'financials-missing');held(i=>i.assessment.asOf='bad','financials-missing');held(i=>i.assessment.checks='x','financials-missing');});
test('재무 weak이면 막힘(blocked), insufficient·mixed는 보류',()=>{held(i=>{i.assessment.label='weak';i.assessment.reviewEligible=false;},'financials-weak','blocked');for(const l of ['mixed','insufficient']){held(i=>{i.assessment.label=l;i.assessment.reviewEligible=false;},'financials-not-strong');}held(i=>i.assessment.reviewEligible=false,'financials-not-strong');});
test('재무가 오래됐거나 3년 미만·충돌이면 보류',()=>{held(i=>i.assessment.asOf='2024-01-01','financials-stale-or-conflict');held(i=>i.assessment.years=2,'financials-stale-or-conflict');held(i=>i.assessment.conflicts=[{field:'revenue'}],'financials-stale-or-conflict');held(i=>i.assessment.asOf='2027-01-01','financials-stale-or-conflict');});
test('시세는 독립 대조·정상·최근일 때만',()=>{for(const v of ['single-source','unverified','synthetic','manual',undefined])held(i=>i.price.verification=v,'price-not-verified');for(const s of ['stale','error','date-mismatch','corporate-action-suspected','unknown'])held(i=>i.price.status=s,'price-not-verified');const md=d=>i=>{i.price.marketDate=d;i.price.evidence.forEach(e=>e.marketDate=d);};held(md('2026-11-10'),'price-not-verified');held(md('2026-11-27'),'price-not-verified');held(i=>delete i.price,'price-not-verified');assert.equal(run(md('2026-11-19')).state,'released');held(md('2026-11-18'),'price-not-verified');});
test('합의가 agreed가 아니면 보류(기록 없음·불일치·무응답·만료·단독)',()=>{for(const c of ['solo','disagree','no-response','expired','mismatch'])held(i=>i.consensus.status=c,'consensus-'+c);held(i=>i.consensus.status='<script>','consensus-unknown');held(i=>delete i.consensus,'consensus-unknown');});
test('여러 조건이 빠지면 모두 기록',()=>{const o=run(i=>{delete i.assessment;i.consensus.status='solo';i.price.status='error';});assert.deepEqual(o.missing.sort(),['consensus-solo','financials-missing','price-not-verified']);});
test('합성 표시가 있으면 해제 불가',()=>{held(i=>i.synthetic=true,'synthetic-input');held(i=>i.assessment.synthetic=true,'synthetic-input');held(i=>i.price.synthetic=true,'synthetic-input');});
test('입력·시각 형식 불량은 예외 없이 보류',()=>{for(const i of [null,undefined,3,[],{},{card:{}},{card:{ticker:'x',market:'JP',verdict:'buy-review'}}]){const o=evaluate(i,NOW);assert.equal(o.state,'held');}for(const n of ['2026-11-26','bad','2026-02-30T00:00:00Z',undefined])assert.deepEqual(evaluate(ok(),n).missing,['invalid-now']);});
test('입력을 바꾸지 않음',()=>{const i=ok(),s=JSON.stringify(i);evaluate(i,NOW);assert.equal(JSON.stringify(i),s);});
test('DART 변환 결과가 앱 판정을 거쳐 이 규칙에 도달(합성은 해제 불가)',()=>{
 const rows=y=>{const b={corp_code:'00000001',bsns_year:String(y),reprt_code:'11011',rcept_no:(y+1)+'0320000001',currency:'KRW',account_detail:'-'},r=(sj,id,a)=>({...b,sj_div:sj,account_id:id,thstrm_amount:a});return [r('IS','ifrs-full_Revenue','1,000'),r('IS','ifrs-full_ProfitLoss','100'),r('CF','ifrs-full_CashFlowsFromUsedInOperatingActivities','120'),r('CF','ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities','-30'),r('BS','ifrs-full_Equity','900'),r('BS','ifrs-full_CashAndCashEquivalents','300')];};
 const d={version:1,mode:'synthetic',instrument:{ticker:'000001',market:'KR',currency:'KRW'},corp:{corpCode:'00000001',name:'가상(합성)',fiscalYearEnd:'12-31'},identityReview:{reviewed:true,ticker:'000001',corpCode:'00000001',reviewedOn:'2026-11-25'},reports:[2025,2024,2023,2022,2021].map(y=>({bsnsYear:String(y),fsDiv:'CFS',response:{status:'000',list:rows(y)}}))};
 const n=toNormalized(d,NOW);assert.equal(n.ok,true);const a=F.assess(n,{now:Date.parse(NOW)});const i={card:{ticker:'000001',market:'KR',verdict:'buy-review',asOf:'2026-11-25'},assessment:Object.assign({},a,{synthetic:n.synthetic}),price:price(),consensus:cons()};
 const o=evaluate(i,NOW);assert.notEqual(o.state,'released');assert.ok(o.missing.includes('synthetic-input')||o.state==='held'||o.state==='blocked');
 // 호출자가 합성 표시를 옮기지 않아도(assess는 synthetic을 보존하지 않음) 출처 표시가 없으면 해제되지 않는다
 const j=Object.assign({},i,{assessment:a});const o2=evaluate(j,NOW);assert.notEqual(o2.state,'released',JSON.stringify(o2));});
test('브라우저 전역·네트워크 미사용',()=>{const src=fs.readFileSync(require.resolve('../has/review-fin-gate.js'),'utf8');const c=vm.createContext({});vm.runInContext(src,c);assert.equal(c.HASReviewFinGate.evaluate(ok(),NOW).state,'released');for(const w of ['fetch(','XMLHttpRequest','localStorage','require('])assert.ok(!src.includes(w),w);});

// CR-FIN-P1 반례(2026-11-28 지피 1730): 모두 보류여야 한다
test('P1 합의: 문자열·다른 종목/시장/판단·오래된/미래·검토자 부족·근거 없음은 보류',()=>{
 held(i=>i.consensus='agreed','consensus-unstructured');
 held(i=>i.consensus.ticker='000002','consensus-mismatch');held(i=>i.consensus.market='US','consensus-mismatch');held(i=>i.consensus.verdict='add-review','consensus-mismatch');
 held(i=>i.consensus.decidedOn='2026-11-10','consensus-expired');held(i=>i.consensus.decidedOn='2026-11-27','consensus-expired');held(i=>i.consensus.decidedOn='2026-11-24','consensus-expired');held(i=>i.consensus.decidedOn='bad','consensus-expired');
 held(i=>i.consensus.reviewers=['claude'],'consensus-unverified');held(i=>delete i.consensus.reviewers,'consensus-unverified');held(i=>i.consensus.evidence='','consensus-unverified');});
test('P1 시세: 다른 티커·시장·통화·가격 종류, 근거 부족·단일 출처·날짜/값 불량은 보류',()=>{
 for(const m of [i=>i.price.ticker='000002',i=>i.price.market='US',i=>i.price.currency='USD',i=>delete i.price.currency,i=>i.price.priceType='open',i=>delete i.price.adjustment,i=>delete i.price.verifier,
  i=>delete i.price.evidence,i=>i.price.evidence=[],i=>i.price.evidence.pop(),i=>i.price.evidence[1].source='kis',i=>i.price.evidence[0].marketDate='2026-11-24',
  i=>i.price.evidence[0].close=NaN,i=>i.price.evidence[0].close=Infinity,i=>i.price.evidence[0].close='1000',i=>i.price.evidence[0].close=0,i=>i.price.evidence[0]=null,
  i=>i.card.asOf='2026-11-24'])held(m,'price-not-verified');});
test('P1 재무: years NaN/Infinity/소수, conflicts 누락·비배열, 빈 근거, 출처 표시 없음·미검증·다른 종목은 보류',()=>{
 for(const y of [NaN,Infinity,-Infinity,4.5,'5'])held(i=>i.assessment.years=y,'financials-missing');
 held(i=>delete i.assessment.conflicts,'financials-missing');held(i=>i.assessment.conflicts='x','financials-missing');
 held(i=>i.assessment.checks=[],'financials-no-evidence');held(i=>i.assessment.checks=[null],'financials-no-evidence');held(i=>i.assessment.checks=[{id:'roe'}],'financials-no-evidence');
 held(i=>delete i.assessment.provenance,'financials-unverified');held(i=>i.assessment.provenance.verification='unverified','financials-unverified');held(i=>i.assessment.provenance.ticker='000002','financials-unverified');
 held(i=>i.assessment.provenance.market='US','financials-unverified');held(i=>delete i.assessment.provenance.source,'financials-unverified');held(i=>delete i.assessment.provenance.synthetic,'synthetic-input');});
test('P1 합성·미검증 표시 전파: 값이 false가 아니면 모두 보류',()=>{for(const v of [true,'true',1,'yes',null])held(i=>i.assessment.provenance.synthetic=v,'synthetic-input');held(i=>i.price.synthetic='1','synthetic-input');held(i=>i.synthetic=null,'synthetic-input');assert.equal(run(i=>{i.synthetic=false;i.price.synthetic=false;i.assessment.synthetic=false;}).state,'released');});
test('P1 카드 기준일 없음·미래·오래됨은 보류',()=>{for(const d of [undefined,'bad','2026-11-27','2026-11-10'])assert.deepEqual(run(i=>i.card.asOf=d).missing,['card-date-invalid']);});
test('P1 미국 카드는 USD 시세만',()=>{const o=run(i=>{for(const k of [i.card,i.assessment.provenance,i.price,i.consensus])k.market='US';i.card.ticker=i.assessment.ticker=i.assessment.provenance.ticker=i.price.ticker=i.consensus.ticker='AAPL';i.price.currency='USD';});assert.equal(o.state,'released',JSON.stringify(o));});
