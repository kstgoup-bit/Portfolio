'use strict';
// 실제 SEC companyconcept 값(2026-11-15 KST 조회, tests/fixtures/sec-sample-20261115/*.txt — 각 파일 첫 줄에 출처 URL)로 재무 필터 대조.
// 기대값은 손계산으로 확인한 값. 판정 라벨은 매수 권유가 아니며 항상 판단 보류.
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('fs');const path=require('path');
const F=require('../has/fundamental-filter.js');
const NOW=Date.parse('2026-11-15T00:00:00Z');const DIR=path.join(__dirname,'fixtures','sec-sample-20261115');
function load(t){const facts={};const lines=fs.readFileSync(path.join(DIR,t+'.txt'),'utf8').split('\n');
  assert.match(lines[0],/^# .*https:\/\/data\.sec\.gov\/api\/xbrl\/companyconcept\/CIK\d{10}\/us-gaap\/<TAG>\.json 조회 2026-11-15/);
  for(const l of lines){if(!l||l[0]==='#')continue;const p=l.split('|');assert.equal(p.length,7,l);const [tag,s,end,val,filed,form,accn]=p;assert.match(val,/^-?\d+$/);
    const e={end,val:Number(val),filed,form,fp:'FY',accn};if(s!=='-')e.start=s;((facts[tag]=facts[tag]||{units:{USD:[]}}).units.USD).push(e);}
  return {cik:t,entityName:t,facts:{'us-gaap':facts}};}
function run(t){const n=F.normalize(load(t),{ticker:t});return {n,a:F.assess(n,{now:NOW})};}
const chk=(a,id)=>a.checks.find(c=>c.id===id);
test('AAPL: 최신 연도(FY2026) 일부 태그 미반영 → 부채·이익률은 직전 결산(2025-09-27) 사용·표시, 이자비용 FY2024부터 미공시 → n/a',()=>{
  const {n,a}=run('AAPL');assert.equal(a.asOf,'2026-09-26');assert.equal(n.years[0].operatingIncome,null);
  assert.equal(chk(a,'leverage').value,0.5);assert.match(chk(a,'leverage').evidence,/2025-09-27 결산 기준/);// (90678-35934)/111482=0.49
  assert.match(chk(a,'margin').evidence,/2025-09-27 결산 기준/);assert.equal(chk(a,'margin').value,32);// 133050/416161
  assert.equal(chk(a,'interest').status,'na');assert.equal(chk(a,'roe').value,157.5);// 자사주 매입으로 작은 자본 — 반론 문구 존재
  assert.equal(a.label,'strong');assert.equal(a.signalHold,true);assert.equal(a.opinion,'판단 보류');});
test('MSFT: InterestExpense(FY2024까지) → InterestExpenseNonoperating 대체, 이자보상 155237/3051=50.9',()=>{
  const {a}=run('MSFT');assert.equal(chk(a,'interest').value,50.9);assert.equal(chk(a,'leverage').value,0.1);assert.equal(chk(a,'roe').value,34.3);assert.equal(a.label,'strong');});
test('NVDA: 설비투자 태그 PaymentsToAcquireProductiveAssets 대체로 FCF 5년 판정, 순현금',()=>{
  const {n,a}=run('NVDA');assert.equal(n.years[0].capex,6042000000);assert.equal(chk(a,'fcf').value,5);assert.match(chk(a,'leverage').evidence,/순현금/);assert.equal(chk(a,'interest').value,503.4);});
test('JNJ: 10-K 안 분기 값은 제외, 자본은 비지배지분 포함 태그 대체(평균 ROE 31%), 영업이익 미공시 → 이익률 n/a',()=>{
  const {n,a}=run('JNJ');assert.equal(n.years.length,5);assert.equal(n.years[2].netIncome,35153000000);assert.equal(chk(a,'roe').value,31);assert.equal(chk(a,'margin').status,'na');assert.equal(a.label,'strong');});
test('JPM: 예금(Deposits) 공시 → 금융업으로 판정 보류(영업현금흐름 음수를 취약으로 오판하지 않음)',()=>{
  const {n,a}=run('JPM');assert.equal(n.financial,true);assert.equal(a.label,'insufficient');assert.match(a.reason,/금융업/);assert.equal(a.reviewEligible,false);});
test('판정 가능 항목 4개뿐이면 취약 없어도 우량 근거 충분이 아니라 혼재',()=>{
  const l=load('JNJ');delete l.facts['us-gaap'].StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest;
  const a=F.assess(F.normalize(l),{now:NOW});assert.equal(a.label,'mixed');assert.match(a.reason,/근거 부족/);
  const f=F.assess(F.normalize(load('MSFT'),{financial:true}),{now:NOW});assert.equal(f.label,'insufficient');});
