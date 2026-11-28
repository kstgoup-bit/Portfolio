'use strict';
/* TEST-ONLY 합성 fixture — review-fin-gate 계약 시험 전용(CR-FIN-P1-R5).
 * 실제 기업·실제 출처가 아니다. synthetic:false·출처 id는 계약 형식을 시험하려는 값일 뿐, 실제 출처로 승격·앱 연결·발행 금지. */
const G=require('../../has/review-fin-gate.js'),F=require('../../has/fundamental-filter.js');
const NOW='2026-11-26T00:00:00Z';
const H=c=>c.repeat(64).slice(0,64),C40='a'.repeat(40);
const TRUST_SPEC={priceVerifiers:{'has-price-verify':{version:'1'}},priceProviders:{kis:{group:'kis'},naver:{group:'naver'},'kis-mirror':{group:'kis'}},finSources:{'opendart-norm':{version:'1'}},consensusVerifiers:{'has-consensus-verify':{version:'1'}}};
const TRUST=G.__createTrustForContractTest(TRUST_SPEC);
const prov=()=>({ticker:'000001',market:'KR',currency:'KRW',companyId:'00000001',synthetic:false,source:{id:'opendart-norm',version:'1'},normalizedSha256:H('b'),filed:'2026-03-20',collectedAt:'2026-11-24T00:00:00Z'});
const CK=()=>[['roe','pass'],['margin','pass'],['leverage','pass'],['interest','pass'],['fcf','pass'],['quality','warn'],['stability','pass'],['valuation','na']].map(([id,status])=>({id,name:id,status,value:null,evidence:'합성 근거 '+id,counter:'-'}));
const assess=(over)=>Object.assign({version:F.VERSION,signalHold:true,opinion:'판단 보류',ticker:'000001',name:'x',checks:CK(),asOf:'2025-12-31',filed:'2026-03-20',years:5,fallback:[],conflicts:[],label:'strong',labelKo:'우량 근거 충분',reviewEligible:true,provenance:prov()},over||{});
const ev=(provider,close)=>({provider,ticker:'000001',market:'KR',currency:'KRW',priceType:'close',adjustment:'raw-close',marketDate:'2026-11-25',session:'final',close,collectedAt:'2026-11-25T09:00:00Z',synthetic:false});
const price=()=>({ticker:'000001',market:'KR',currency:'KRW',priceType:'close',adjustment:'raw-close',marketDate:'2026-11-25',session:'final',verifier:{id:'has-price-verify',version:'1'},verifiedAt:'2026-11-25T10:00:00Z',synthetic:false,evidence:[ev('kis',1000),ev('naver',1000)]});
const cons=()=>({status:'agreed',ticker:'000001',market:'KR',verdict:'buy-review',cardSha256:H('c'),decidedOn:'2026-11-25',verifier:{id:'has-consensus-verify',version:'1'},verifiedAt:'2026-11-25T12:00:00Z',reviews:[{reviewer:'claude',path:'docs/team/CLAUDE-DEV-x.md',commit:C40,sha256:H('d'),reviewedOn:'2026-11-25'},{reviewer:'gpt',path:'docs/team/GPT-REVIEW-x.md',commit:'b'.repeat(40),sha256:H('e'),reviewedOn:'2026-11-25'}]});
const card=()=>({ticker:'000001',market:'KR',verdict:'buy-review',asOf:'2026-11-25',sha256:H('c')});
const ok=()=>({card:card(),assessment:assess(),price:price(),consensus:cons()});
// 실제 F.assess()가 strong을 내는 합성 companyfacts(미국 형식, 실제 기업 아님)
function facts(years){const g={};
  function put(tag,end,val,flow){g[tag]=g[tag]||{units:{USD:[]}};const y=+end.slice(0,4);const e={end,val,form:'10-K',fp:'FY',fy:y,filed:(y+1)+'-02-15',accn:'0000000000-'+y};if(flow)e.start=y+'-01-01';g[tag].units.USD.push(e);}
  years.forEach((r,i)=>{const end=(2025-i)+'-12-31';put('Revenues',end,r.rev,true);put('OperatingIncomeLoss',end,r.op,true);put('NetIncomeLoss',end,r.ni,true);put('NetCashProvidedByUsedInOperatingActivities',end,r.ocf,true);put('PaymentsToAcquirePropertyPlantAndEquipment',end,r.capex,true);put('InterestExpense',end,r.int,true);put('StockholdersEquity',end,r.eq,false);put('CashAndCashEquivalentsAtCarryingValue',end,r.cash,false);put('LongTermDebt',end,r.debt,false);});
  return {cik:123,entityName:'Synthetic Co (TEST-ONLY)',facts:{'us-gaap':g}};}
const GOOD=Array.from({length:5},()=>({rev:1000,op:250,ni:200,ocf:260,capex:60,int:10,eq:1000,cash:300,debt:400}));
function strongUS(){const a=F.assess(F.normalize(facts(GOOD),{ticker:'SYN'}),{now:Date.parse(NOW)});return a;}
module.exports={NOW,H,C40,TRUST_SPEC,TRUST,prov,CK,assess,ev,price,cons,card,ok,strongUS};
