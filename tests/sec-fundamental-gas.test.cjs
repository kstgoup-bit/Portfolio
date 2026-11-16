'use strict';
// GAS 초안(gas/has-sec-fundamental.gs)을 가짜 UrlFetchApp·CacheService로 실행해 확인. 네트워크·실제 GAS 접근 없음.
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('fs');const path=require('path');const vm=require('vm');
const ROOT=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(ROOT,'gas/has-sec-fundamental.gs'),'utf8');
const filter=fs.readFileSync(path.join(ROOT,'has/fundamental-filter.js'),'utf8');
const hist=fs.readFileSync(path.join(ROOT,'gas/has-history-request.gs'),'utf8');
function facts(){const rows=[];for(let y=2021;y<=2025;y++){rows.push({start:y+'-01-01',end:y+'-12-31',val:1e9+y,filed:(y+1)+'-02-10',form:'10-K',fp:'FY',accn:'a'+y});}
  const mk=(v)=>({units:{USD:rows.map(r=>Object.assign({},r,{val:v+(r.end.slice(0,4)-2000)}))}});
  return {cik:320193,entityName:'Test Co',facts:{'us-gaap':{NetIncomeLoss:mk(1e8),Revenues:mk(1e9)}}};}
function env(opts){opts=opts||{};const calls=[],store={};
  const ctx={calls,store,JSON,Date,Math,Object,Array,Number,String,Error,Infinity,isFinite,
    UrlFetchApp:{fetch(url,o){calls.push({url,o});if(opts.fail&&opts.fail(url))return {getResponseCode:()=>opts.code||503,getContentText:()=>''};
      if(url==='https://www.sec.gov/files/company_tickers.json')return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({0:{cik_str:320193,ticker:'AAPL',title:'Apple'},1:{cik_str:789019,ticker:'MSFT',title:'Microsoft'}})};
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(facts())};}},
    CacheService:{getScriptCache:()=>({get:k=>store[k]||null,put:(k,v)=>{store[k]=v;}})},
    Utilities:{sleep(){}},ContentService:{MimeType:{JSON:'J',JAVASCRIPT:'JS'},createTextOutput(t){return {t,setMimeType(m){this.m=m;return this;}};}}};
  vm.createContext(ctx);vm.runInContext(filter,ctx);vm.runInContext(hist,ctx);vm.runInContext(src,ctx);return ctx;}
const call=(ctx,q,cb)=>{const o=ctx.hasSecFundamentalResponse_({parameter:q},cb);return o;};
test('정상: 요청 티커만, User-Agent 선언, 새 규칙 URL, normalize 결과 포함',()=>{
  const c=env();const o=call(c,{tickers:'aapl,MSFT'});const d=JSON.parse(o.t);assert.equal(d.ok,true);assert.deepEqual(Object.keys(d.items).sort(),['AAPL','MSFT']);
  assert.equal(d.items.AAPL.ok,true);assert.equal(d.items.AAPL.ticker,'AAPL');assert.equal(d.items.AAPL.years.length,5);assert.equal(o.m,'J');
  assert.ok(c.calls.every(x=>/^https:\/\/(www\.sec\.gov\/files\/company_tickers\.json|data\.sec\.gov\/api\/xbrl\/companyfacts\/CIK\d{10}\.json)$/.test(x.url)));
  assert.ok(c.calls.some(x=>x.url.endsWith('CIK0000320193.json'))&&c.calls.some(x=>x.url.endsWith('CIK0000789019.json')));
  assert.ok(c.calls.every(x=>x.o.headers['User-Agent']&&x.o.followRedirects===false));
  assert.equal(c.vm,undefined);});
test('잘못된 요청 거부: 빈 값·7개·형식 위반·특수문자(네트워크 호출 0)',()=>{
  for(const t of [undefined,'','A,B,C,D,E,F,G','AAPL;DROP','../x','TOOLONGTICKER','aapl,,msft','AAPL,<b>']){const c=env();const d=JSON.parse(call(c,{tickers:t}).t);assert.deepEqual(d,{error:'bad-request'},String(t));assert.equal(c.calls.length,0);}});
test('모르는 티커·SEC 오류는 종목별 ok:false, 나머지는 계속',()=>{
  const c=env({fail:u=>u.endsWith('CIK0000789019.json')});const d=JSON.parse(call(c,{tickers:'AAPL,MSFT,ZZZZ'}).t);
  assert.equal(d.items.AAPL.ok,true);assert.deepEqual([d.items.MSFT.ok,d.items.MSFT.reason],[false,'sec-http-503']);assert.deepEqual([d.items.ZZZZ.ok,d.items.ZZZZ.reason],[false,'unknown-ticker']);});
test('티커 목록 실패 → error, 캐시 재사용(두 번째 요청은 companyfacts 재호출 없음)',()=>{
  const bad=env({fail:u=>/company_tickers/.test(u)});assert.deepEqual(JSON.parse(call(bad,{tickers:'AAPL'}).t),{error:'sec-ticker-map-failed'});
  const c=env();call(c,{tickers:'AAPL'});const n1=c.calls.filter(x=>/companyfacts/.test(x.url)).length;call(c,{tickers:'AAPL'});assert.equal(c.calls.filter(x=>/companyfacts/.test(x.url)).length,n1);});
test('JSONP: 안전한 콜백만, 위험 콜백은 일반 JSON, 응답에 < > & 없음',()=>{
  const c=env();assert.match(call(c,{tickers:'AAPL'},'cb_1').t,/^cb_1\(\{/);assert.equal(call(c,{tickers:'AAPL'},'alert(1)//').t[0],'{');assert.doesNotMatch(call(c,{tickers:'AAPL'}).t,/[<>&]/);});
test('응답은 앱 검증(validNormalized)을 통과하고, 저장소에 실제 연락처·키 없음',()=>{
  const c=env();const d=JSON.parse(call(c,{tickers:'AAPL'}).t);assert.equal(vm.runInContext('HASFundamentalFilter.validNormalized',c)(d.items.AAPL),true);
  assert.match(src,/CONTACT_EMAIL_HERE/);assert.doesNotMatch(src,/[\w.+-]+@[\w-]+\.[\w.]+/);});
test('배포 파일은 기존 doGet을 수정하지 않는다(연결 한 줄은 주석 안내뿐)',()=>{assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g,''),/function doGet/);});
