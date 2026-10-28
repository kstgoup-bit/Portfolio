'use strict';const {test}=require('node:test'),a=require('node:assert/strict'),C=require('../sell/core.js'),F=require('../sell/fixtures.js');
const run=x=>C.evaluate(x,{today:F.today});
test('five explainable synthetic states',()=>a.deepEqual(F.cases().map(x=>run(x).status),Object.values(C.STATES).slice(1).concat(C.STATES.unknown)));
test('real mode refused',()=>{const x=F.base();x.mode='real';a.equal(run(x).status,C.STATES.unknown);});
test('actual ticker refused',()=>{const x=F.base();x.id='MSFT';a.equal(run(x).status,C.STATES.unknown);});
for(const [label,change] of [
 ['missing quote',x=>x.quote=null],['stale quote',x=>x.quote.asOf='2020-01-01'],['future quote',x=>x.quote.asOf='2099-01-01'],['invalid date',x=>x.quote.asOf='2026-02-30'],['unadjusted split',x=>x.quote.adjustment='raw'],['different cost basis',x=>x.quote.costBasis='raw'],['zero cost',x=>x.quote.cost=0],['NaN price',x=>x.quote.price=NaN],['missing valuation',x=>x.valuation=null],['stale evidence',x=>x.valuation.evidence.asOf='2020-01-01'],['missing counter evidence',x=>x.valuation.evidence.counterEvidence=''],['credential URL',x=>x.valuation.evidence.source='https://example.invalid/?apikey=secret'],['uncertain thesis',x=>x.thesis.factors[0].state='uncertain'],['incomplete thesis',x=>x.thesis.factors.pop()],['missing limits',x=>x.approvedLimits=null],['mixed currency',x=>x.positions[0].currency='USD'],['negative holding',x=>x.positions[0].value=-1]])test(label+' unavailable',()=>{const x=F.base();change(x);a.equal(run(x).status,C.STATES.unknown);});
for(const price of [1,120,130,150,200,300])test('gain '+price+' never triggers selling by itself',()=>{const x=F.base();x.quote.price=price;const r=run(x);a.equal(r.status,C.STATES.hold);a.equal(r.automaticAction,false);});
test('split equivalent values yield same return',()=>{const x=F.base(),y=F.base();y.quote.price/=4;y.quote.cost/=4;a.equal(run(x).returnPct,run(y).returnPct);});
test('valuation and thesis impairment independent',()=>{const x=F.cases()[2];a.equal(run(x).flags.impaired,false);x.thesis.factors[1].state='structural-deterioration';a.equal(run(x).status,C.STATES.thesis);});
test('conflicting evidence retained and uncertain blocks',()=>{const x=F.base();x.thesis.factors[0].state='uncertain';a.equal(run(x).status,C.STATES.unknown);a.ok(run(x).counterEvidence.length);});
test('high gain cannot fill missing evidence',()=>{const x=F.base();x.quote.price=500;x.valuation=null;a.equal(run(x).status,C.STATES.unknown);});
test('expensive with missing replacement cannot infer trim',()=>{const x=F.cases()[2];x.replacement=null;a.equal(run(x).status,C.STATES.unknown);});
test('tax costs and cash needs block replacement',()=>{const x=F.cases()[2];x.replacement.taxCost=100;a.equal(run(x).replacement.status,'no-case');a.equal(run(x).status,C.STATES.unknown);x.replacement.taxCost=0;x.replacement.cashNeed=100;a.equal(run(x).replacement.status,'no-case');});
test('cheaper by drawdown without quality never qualifies',()=>{const x=F.cases()[2];x.replacement.alternativeQuality=50;a.equal(run(x).replacement.status,'no-case');});
test('concentration exact limit no breach; prototype-like names safe',()=>{const x=F.base();x.positions[0].stock='__proto__';x.approvedLimits={account:.5,stock:.5,sector:.5};a.equal(run(x).concentration.status,'within');});
test('no input mutation',()=>{const x=F.base(),s=JSON.stringify(x);run(x);a.equal(JSON.stringify(x),s);});

test('nested actual quote cannot enter synthetic evaluation',()=>{const x=F.base();x.quote.synthetic=false;a.equal(run(x).status,C.STATES.unknown);});
test('20 percent boundary yields reminder only',()=>{const x=F.base();x.quote.price=120;a.equal(run(x).alerts.length,1);a.equal(run(x).status,C.STATES.hold);});

test('malformed thesis factor fails closed without exception',()=>{const x=F.base();x.thesis.factors[0]=null;a.equal(run(x).status,C.STATES.unknown);});
