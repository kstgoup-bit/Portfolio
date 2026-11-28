'use strict';
// CR-FIN-P1(2026-11-28 지피 1730): gas/has-kis-overseas.gs 일봉 파서의 실패 폐쇄 합성 시험. 실제 GAS·KIS 호출 없음(VM 가짜 Utilities만).
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const SRC=fs.readFileSync(path.join(__dirname,'..','gas','has-kis-overseas.gs'),'utf8');
function load(){const fmt=(d,tz,p)=>{const o=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(x=>[x.type,x.value]));return p==='yyyy-MM-dd'?`${o.year}-${o.month}-${o.day}`:p==='HHmm'?o.hour+o.minute:'?';};
 const c=vm.createContext({Utilities:{formatDate:fmt,sleep(){}},UrlFetchApp:{fetch(){throw new Error('network')}},PropertiesService:{},ContentService:{},Logger:{log(){}}});vm.runInContext(SRC,c);return c;}
const G=load();
const ET=(s)=>Date.parse(s); // UTC ISO
const body=(rows,o1)=>JSON.stringify({rt_cd:'0',output1:o1===undefined?{rsym:'DNASAAPL'}:o1,output2:rows});
const r=(d,c)=>({xymd:d,clos:c});
const P=(rows,now,o1)=>G.hasKisUsParse_(body(rows,o1),'AAPL','NAS',now);
// 2026-11-27(금) ET 17:00 = 22:00Z, 2026-11-27 ET 12:00 = 17:00Z
const AFTER=ET('2026-11-27T22:00:00Z'),BEFORE=ET('2026-11-27T17:00:00Z');
test('정상: 확정 봉은 날짜순, 미검증 표시가 붙는다',()=>{const o=P([r('20261127','200.5'),r('20261126','199'),r('20261125','198')],AFTER);assert.equal(o.barCount,3);assert.equal(o.bars[2].d,'2026-11-27');assert.equal(o.intradayDropped,false);assert.equal(o.verification,'single-source-unverified');assert.equal(o.sessionCalendar,'unverified');assert.equal(o.currencyBasis,'request-assumed-unverified');assert.equal(o.identity,'rsym-suffix-match-format-unverified');});
test('16:30 이후에도 미래 날짜 봉이 있으면 거부(지피 반례 11-26/27/30)',()=>{assert.equal(P([r('20261130','201'),r('20261127','200'),r('20261126','199')],AFTER),null);});
test('16:30 이전: 미래 봉이 섞이면 조용히 버리지 않고 거부, 오늘 부분봉만 있으면 제외',()=>{assert.equal(P([r('20261130','201'),r('20261127','200'),r('20261126','199'),r('20261125','198')],BEFORE),null);const o=P([r('20261127','200'),r('20261126','199'),r('20261125','198')],BEFORE);assert.equal(o.intradayDropped,true);assert.equal(o.bars[o.bars.length-1].d,'2026-11-26');});
test('빈 행은 건너뛰고 형식 오류 행은 거부',()=>{assert.ok(P([r('20261127','200'),r('',''),{},r('20261126','199')],AFTER));for(const bad of [r('2026-11-27','200'),r('20261127',''),r('','200'),r('20261340','1'),r('20261127','abc'),{xymd:20261127,clos:'1'},null])assert.equal(P([r('20261126','199'),r('20261125','198'),bad],AFTER),null,JSON.stringify(bad));});
test('응답 종목 표시가 요청과 다르면 거부, 없으면 요청값 미검증으로 표시',()=>{assert.equal(P([r('20261127','200'),r('20261126','199')],AFTER,{rsym:'DNASMSFT'}),null);const o=P([r('20261127','200'),r('20261126','199')],AFTER,{});assert.equal(o.identity,'request-echo-unverified');});
test('같은 날 다른 값·봉 2개 미만·오류 응답은 거부',()=>{assert.equal(P([r('20261127','200'),r('20261127','201'),r('20261126','1')],AFTER),null);assert.equal(P([r('20261127','200')],AFTER),null);assert.equal(G.hasKisUsParse_(JSON.stringify({rt_cd:'1',output2:[]}),'AAPL','NAS',AFTER),null);assert.equal(G.hasKisUsParse_('x','AAPL','NAS',AFTER),null);});
test('파서는 네트워크를 쓰지 않는다',()=>{assert.ok(P([r('20261127','200'),r('20261126','199')],AFTER));});
