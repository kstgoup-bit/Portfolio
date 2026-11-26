'use strict';
// has/price-verify-us.js 시험: 순수 대조·카드 입력 변환·조회 흐름(가짜 jsonp). 외부 접속 없음.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const P=require('../has/price-verify-us.js');
const NOW=Date.parse('2026-11-26T01:00:00Z'); // 뉴욕 11-25 20:00 → 11-25 봉은 확정
function days(from,to){const out=[];for(let t=Date.parse(from+'T00:00:00Z');t<=Date.parse(to+'T00:00:00Z');t+=86400000){const d=new Date(t).toISOString().slice(0,10),w=new Date(t).getUTCDay();if(w&&w<6)out.push(d);}return out;}
const ALL=days('2026-10-20','2026-11-25');
const yahoo=(t,f)=>({source:'yahoo-chart-v8',symbol:t,currency:'USD',bars:ALL.map((d,i)=>({d,c:f?f(d,i):100+i}))});
const kis=(t,f)=>({source:'kis-overseas-daily',symbol:t,currency:'USD',exchange:'NAS',bars:ALL.map((d,i)=>({d,c:f?f(d,i):100+i}))});
const cmp=(y,k,t)=>P.compare(y,k,{ticker:t||'AAA',now:NOW});
test('같은 종가면 match → 카드 입력은 독립 대조 완료·ok·기준일',()=>{const r=cmp(yahoo('AAA'),kis('AAA'));a.equal(r.status,'match');a.equal(r.checked,20);a.equal(r.latest.d,'2026-11-25');a.deepEqual(P.toTrust(r),{verification:'independent-verified',status:'ok',marketDate:'2026-11-25'});});
test('허용 차이 0.5%: 0.4%는 일치, 0.6%는 불일치(최근)·부분 일치(과거)',()=>{const r1=cmp(yahoo('AAA'),kis('AAA',(d,i)=>(100+i)*1.004));a.equal(r1.status,'match');const r2=cmp(yahoo('AAA'),kis('AAA',(d,i)=>(100+i)*1.006));a.equal(r2.status,'mismatch');a.equal(P.toTrust(r2).verification,'unverified');a.equal(P.toTrust(r2).status,'date-mismatch');
 const r3=cmp(yahoo('AAA'),kis('AAA',(d,i)=>i===ALL.length-5?(100+i)*1.2:100+i));a.equal(r3.status,'partial');a.equal(P.toTrust(r3).verification,'unverified');});
test('공통 날짜 5일 미만이면 short(미검증), 없으면 no-common-date',()=>{const few=(t,k)=>({source:k?'kis-overseas-daily':'yahoo-chart-v8',symbol:t,currency:'USD',bars:ALL.slice(-3).map((d,i)=>({d,c:100+i}))});const r=cmp(few('AAA',0),few('AAA',1));a.equal(r.status,'short');a.equal(P.toTrust(r).verification,'unverified');
 const k={source:'kis-overseas-daily',symbol:'AAA',currency:'USD',bars:[{d:'2026-01-05',c:100}]};a.equal(cmp(yahoo('AAA'),k).status,'no-common-date');});
test('두 출처 최신 날짜가 다르면(한쪽 지연) stale, 오래되면 stale',()=>{const k=kis('AAA');k.bars=k.bars.slice(0,-1);const r=cmp(yahoo('AAA'),k);a.equal(r.status,'stale');a.equal(r.stale,'source-lag');a.equal(P.toTrust(r).status,'stale');
 const old=P.compare(yahoo('AAA'),kis('AAA'),{ticker:'AAA',now:Date.parse('2026-12-10T01:00:00Z')});a.equal(old.status,'stale');a.equal(old.stale,'old');});
test('뉴욕 마감 전 오늘 봉은 제외, 16:30 이후는 확정으로 포함',()=>{const mk=()=>[yahoo('AAA'),kis('AAA')];
 const before=P.compare(...mk(),{ticker:'AAA',now:Date.parse('2026-11-25T20:00:00Z')}); // 뉴욕 15:00(EST)
 a.equal(before.latest.d,'2026-11-24');
 const after=P.compare(...mk(),{ticker:'AAA',now:Date.parse('2026-11-25T21:30:00Z')}); // 뉴욕 16:30
 a.equal(after.latest.d,'2026-11-25');
 const summer=P.compare(yahoo('AAA'),kis('AAA'),{ticker:'AAA',now:Date.parse('2026-11-25T20:29:00Z')});a.equal(summer.latest.d,'2026-11-24');});
test('모양 불량·다른 종목·다른 통화·다른 출처·같은 날 다른 값은 대조 안 함',()=>{const ok=()=>[yahoo('AAA'),kis('AAA')];
 const bad=(f,code)=>{const [y,k]=ok();f(y,k);a.equal(cmp(y,k).status,code);};
 bad((y,k)=>{k.symbol='BBB';},'missing-kis');bad((y,k)=>{y.symbol='BBB';},'missing-yahoo');bad((y,k)=>{k.currency='KRW';},'missing-kis');bad((y,k)=>{y.source='x';},'missing-yahoo');bad((y,k)=>{k.bars[2].c='100';},'missing-kis');bad((y,k)=>{k.bars[2].c=0;},'missing-kis');bad((y,k)=>{k.bars[0].d='2026-02-30';},'missing-kis');bad((y,k)=>{y.bars.push({d:y.bars[0].d,c:999});},'missing-yahoo');bad((y,k)=>{k.bars=[];},'missing-kis');bad((y,k)=>{y.bars=null;},'missing-yahoo');
 for(const t of ['aaa','','AAAAAA','A;B',null,5])a.equal(P.compare(yahoo('AAA'),kis('AAA'),{ticker:t,now:NOW}).status,'invalid-ticker');a.equal(cmp(null,null).status,'missing-kis');});
test('잠정·미확정 봉은 제외',()=>{const [y,k]=[yahoo('AAA'),kis('AAA')];k.bars[k.bars.length-1].finality='provisional';y.bars[y.bars.length-1].confirmed=false;const r=cmp(y,k);a.equal(r.latest.d,ALL[ALL.length-2]);a.equal(r.status,'match');});
test('toTrust: 실패·빈 값은 미검증, 날짜는 형식 확인',()=>{for(const r of [null,undefined,{},{ok:false,status:'missing-kis'},{ok:true,status:'partial',latest:{d:'2026-11-25'}},{ok:true,status:'match',latest:{d:'bad'}}])a.equal(P.toTrust(r).verification,'unverified');});
// ---- 조회 흐름 ----
function fakeSend(opt){const calls=[];const f=async(params)=>{calls.push(params);const ts=params.tickers.split(',');if(params.type==='history'){if(opt&&opt.yahooFail)throw Error('x');const o={};ts.forEach(t=>o[t]=yahoo(t));return o;}if(opt&&opt.kisError)return {error:opt.kisError};if(opt&&opt.kisThrow)throw Error('net');const o={};ts.forEach(t=>o[t]=(opt&&opt.kisBad&&opt.kisBad(t))||kis(t));return o;};f.calls=calls;return f;}
test('조회: Yahoo 이력 1번 + KIS 1번(티커 묶음), 결과·카드 입력 저장, 같은 시각 10분 안 재조회 거부',async()=>{P._reset();const s=fakeSend();const r=await P.verify(['AAA','BBB','AAA','bad'],{jsonp:s,now:()=>NOW});a.equal(r.ok,true);a.deepEqual(s.calls.map(c=>c.type),['history','kis-us']);a.equal(s.calls[0].market,'US');a.equal(s.calls[0].tickers,'AAA,BBB');
 a.equal(P.trustOf('AAA',NOW).verification,'independent-verified');a.equal(P.trustOf('ZZZ',NOW),null);a.equal(P.trustOf('AAA',NOW+25*3600000),null);
 const again=await P.verify(['AAA'],{jsonp:s,now:()=>NOW+60000});a.equal(again.reason,'too-soon');a.equal(s.calls.length,2);a.match(P.lastError(),/10분/);
 const later=await P.verify(['AAA'],{jsonp:s,now:()=>NOW+11*60000});a.equal(later.ok,true);a.equal(s.calls.length,4);});
test('조회: 티커는 최대 5개, 없으면 호출 0',async()=>{P._reset();const s=fakeSend();await P.verify(['A','B','C','D','E','F','G'],{jsonp:s,now:()=>NOW});a.equal(s.calls[0].tickers,'A,B,C,D,E');P._reset();const s2=fakeSend();a.equal((await P.verify([],{jsonp:s2,now:()=>NOW})).reason,'no-tickers');a.equal(s2.calls.length,0);});
test('조회: KIS 오류·연결 실패는 미검증으로 남기고 오류 코드만 기록(키·주소 없음)',async()=>{for(const [o,code] of [[{kisError:'kis-budget'},'kis-budget'],[{kisError:'secret-detail-xyz'},'kis-error'],[{kisThrow:1},'kis-unreachable']]){P._reset();const r=await P.verify(['AAA'],{jsonp:fakeSend(o),now:()=>NOW});a.equal(r.error,code);a.equal(P.lastError(),code);a.equal(P.trustOf('AAA',NOW).verification,'unverified');a.ok(!String(P.lastError()).includes('secret-detail'));}});
test('조회: Yahoo 실패면 missing-yahoo로 미검증, 한 종목 KIS 값 불량이어도 다른 종목은 유지',async()=>{P._reset();await P.verify(['AAA'],{jsonp:fakeSend({yahooFail:1}),now:()=>NOW});a.equal(P.resultOf('AAA').r.status,'missing-yahoo');a.equal(P.trustOf('AAA',NOW).verification,'unverified');
 P._reset();await P.verify(['AAA','BBB'],{jsonp:fakeSend({kisBad:t=>t==='BBB'?{source:'kis-overseas-daily',symbol:'BBB',currency:'USD',bars:[{d:'x',c:1}]}:null}),now:()=>NOW});a.equal(P.trustOf('AAA',NOW).verification,'independent-verified');a.equal(P.trustOf('BBB',NOW).verification,'unverified');});
test('조회: 동시에 두 번 시작하지 않음',async()=>{P._reset();let release;const slow=(params)=>new Promise(r=>{release=()=>r(params.type==='history'?{AAA:yahoo('AAA')}:{AAA:kis('AAA')});});const p1=P.verify(['AAA'],{jsonp:slow,now:()=>NOW});a.equal(P.isBusy(),true);a.equal((await P.verify(['AAA'],{jsonp:slow,now:()=>NOW})).reason,'busy');release();await new Promise(r=>setTimeout(r,0));release();await p1;a.equal(P.isBusy(),false);});
test('모듈은 저장소·쓰기·주문·키를 쓰지 않고 GAS 주소만 https script.google.com으로 제한',()=>{const s=fs.readFileSync(path.join(__dirname,'..','has/price-verify-us.js'),'utf8');for(const w of ['localStorage','sessionStorage','indexedDB','innerHTML','eval(','crtfc_key','KIS_APP'])a.ok(!s.includes(w),w);a.ok(/hostname !== 'script\.google\.com'/.test(s));});
test('브라우저 전역으로도 동작',()=>{const ctx=vm.createContext({Intl,Date,Object,Array,Number,Promise,Error,URL,setTimeout,clearTimeout,document:{}});vm.runInContext(fs.readFileSync(path.join(__dirname,'..','has/price-verify-us.js'),'utf8'),ctx);a.equal(ctx.HASPriceVerifyUS.compare(yahoo('AAA'),kis('AAA'),{ticker:'AAA',now:NOW}).status,'match');});
