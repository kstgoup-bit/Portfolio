'use strict';
// GAS 초안(gas/has-dart-fundamental.gs)을 가짜 UrlFetchApp·속성·캐시·잠금으로 실행. 네트워크·실제 GAS·실제 키 없음(키는 시험용 가짜 40자).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const R=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const src=R('gas/has-dart-fundamental.gs').replace(/var HAS_DART_CORPS = \{[\s\S]*?\n\};/,"var HAS_DART_CORPS = {'000001':{corpCode:'00000001',name:'시험전자',reviewedOn:'2026-11-25'},'000002':{corpCode:'00000002',name:'시험중공업',reviewedOn:'2026-11-25'},'000003':{corpCode:'bad',name:'x',reviewedOn:'2026-11-25'}};");
const adapter=R('has/dart-facts-adapter.js'),hist=R('gas/has-history-request.gs');
const KEY='a'.repeat(40);
const rows=(corp,y)=>{const b={corp_code:corp,bsns_year:String(y),reprt_code:'11011',rcept_no:(y+1)+'0320000001',currency:'KRW',account_detail:'-'},r=(sj,id,a)=>({...b,sj_div:sj,account_id:id,thstrm_amount:a});return [r('IS','ifrs-full_Revenue','1,000'),r('IS','ifrs-full_ProfitLoss','100'),r('BS','ifrs-full_Equity','900')];};
function env(o){o=o||{};const calls=[],store={},props=o.props||{HAS_DART_KEY:KEY},clock={t:1_700_000_000_000};let held=false;
 const FD=class extends Date{constructor(...a){super(...(a.length?a:[Date.parse('2026-11-26T00:00:00Z')+0]));}static now(){return clock.t;}};
 const ctx={calls,store,clock,JSON,Math,Object,Array,Number,String,Error,isFinite,encodeURIComponent,Date:FD,
  UrlFetchApp:{fetch(url,opt){calls.push({url,opt,t:clock.t});clock.t+=20;if(o.throwFetch)throw Error('net '+url);const m=/corp_code=(\d{8})&bsns_year=(\d{4})/.exec(url);const st=o.status?o.status(m[1],+m[2]):'000';
   if(o.http)return {getResponseCode:()=>o.http,getContentText:()=>''};if(o.badJson)return {getResponseCode:()=>200,getContentText:()=>'<html>'};
   return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({status:st,message:'x',list:st==='000'?rows(m[1],+m[2]):[]})};}},
  CacheService:{getScriptCache:()=>({get:k=>k in store?store[k]:null,put:(k,v)=>{store[k]=String(v);}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>k in props?props[k]:null})},
  LockService:{getScriptLock:()=>({tryLock(){if(o.busy||held)return false;held=true;return true;},releaseLock(){held=false;}})},
  Utilities:{sleep(ms){clock.t+=ms;}},ContentService:{MimeType:{JSON:'J',JAVASCRIPT:'JS'},createTextOutput(t){return {t,setMimeType(m){this.m=m;return this;}};}}};
 vm.createContext(ctx);vm.runInContext(adapter,ctx);vm.runInContext(hist,ctx);vm.runInContext(src,ctx);return ctx;}
const call=(c,q,cb)=>JSON.parse(c.hasDartFundamentalResponse_({parameter:q},cb).t);
test('정상: 종목당 5건 요청, 키·연결·사업보고서 코드 고정, 변환 결과 반환, 키는 응답에 없음',()=>{const c=env();const raw=c.hasDartFundamentalResponse_({parameter:{tickers:'000001'}}).t;const d=JSON.parse(raw);assert.equal(d.ok,true);assert.equal(d.items['000001'].ok,true);assert.equal(d.items['000001'].years.length,5);assert.equal(c.calls.length,5);
 assert.ok(c.calls.every(x=>/^https:\/\/opendart\.fss\.or\.kr\/api\/fnlttSinglAcntAll\.json\?crtfc_key=a{40}&corp_code=00000001&bsns_year=20\d\d&reprt_code=11011&fs_div=CFS$/.test(x.url)&&x.opt.followRedirects===false));assert.ok(!raw.includes(KEY));assert.ok(!raw.includes('opendart'));assert.equal(d.items['000001'].synthetic,false);});
test('요청 간격 250ms 이상·직렬',()=>{const c=env();call(c,{tickers:'000001,000002'});for(let i=1;i<c.calls.length;i++)assert.ok(c.calls[i].t-c.calls[i-1].t>=250);});
test('잘못된 요청 거부(요청 0건)',()=>{for(const t of [undefined,'','12345','1234567','000001,000002,000004,000005','00000a','000001;x','../x','000001,,000002']){const c=env();assert.deepEqual(call(c,{tickers:t}),{error:'bad-request'},String(t));assert.equal(c.calls.length,0);}});
test('키 없음·형식 불량이면 요청 0건',()=>{for(const p of [{},{HAS_DART_KEY:'short'},{HAS_DART_KEY:'z'.repeat(40)}]){const c=env({props:p});assert.deepEqual(call(c,{tickers:'000001'}),{error:'dart-key-missing'});assert.equal(c.calls.length,0);}});
test('목록에 없거나 확인값이 불량한 종목은 요청 0건',()=>{const c=env();const d=call(c,{tickers:'000009,000003'});assert.deepEqual([d.items['000009'].reason,d.items['000003'].reason],['unknown-ticker','unknown-ticker']);assert.equal(c.calls.length,0);});
test('status 013(자료 없음)은 그 해만 비고 계속, 전부 013이면 변환 거부',()=>{const c=env({status:(corp,y)=>y===2024?'013':'000'});const d=call(c,{tickers:'000001'});assert.equal(d.items['000001'].ok,true);assert.equal(d.items['000001'].years.length,4);assert.equal(c.calls.length,5);const e=env({status:()=>'013'});assert.equal(call(e,{tickers:'000001'}).items['000001'].reason,'no-usable-year');});
test('키 오류·한도(010·011·012·020)·기타 상태는 즉시 전체 중단, 사유 코드만',()=>{for(const st of ['010','011','012','020','800','900']){const c=env({status:()=>st});const d=call(c,{tickers:'000001,000002'});assert.equal(d.items['000001'].reason,'dart-status-'+st);assert.equal(d.items['000002'].reason,'dart-status-'+st);assert.equal(c.calls.length,1);}});
test('HTTP 오류·예외·깨진 응답도 중단하고 주소·키 노출 없음',()=>{for(const o of [{http:503},{throwFetch:true},{badJson:true}]){const c=env(o);const raw=c.hasDartFundamentalResponse_({parameter:{tickers:'000001,000002'}}).t;assert.equal(c.calls.length,1);assert.ok(!raw.includes(KEY));assert.ok(!raw.includes('https://')&&!raw.includes('opendart'));assert.equal(JSON.parse(raw).items['000002'].ok,false);}});
test('변환 결과 캐시: 두 번째 요청은 DART 재호출 없음, 위조 캐시는 무시',()=>{const c=env();call(c,{tickers:'000001'});assert.equal(c.calls.length,5);call(c,{tickers:'000001'});assert.equal(c.calls.length,5);const k=Object.keys(c.store).find(x=>x.startsWith('HAS_DART_F_'));assert.ok(!c.store[k].includes(KEY));c.store[k]=JSON.stringify({ok:true,ticker:'000002',corpCode:'00000002'});call(c,{tickers:'000001'});assert.equal(c.calls.length,10);});
test('다른 실행이 잠금 중이면 요청 0건 dart-busy, 실행 뒤 잠금 해제',()=>{assert.deepEqual(call(env({busy:true}),{tickers:'000001'}),{error:'dart-busy'});const c=env();call(c,{tickers:'000001'});assert.deepEqual(Object.keys(call(c,{tickers:'000001'})),['ok','asOf','items']);});
test('JSONP: 안전한 콜백만, 응답에 < > & 없음',()=>{const c=env();const o=c.hasDartFundamentalResponse_({parameter:{tickers:'000001'}},'cb1');assert.match(o.t,/^cb1\(/);assert.equal(o.m,'JS');const x=c.hasDartFundamentalResponse_({parameter:{tickers:'000001'}},'alert(1)//');assert.equal(x.m,'J');assert.ok(!/[<>&]/.test(x.t));});
test('저장소 파일에 실제 키·회사코드·연락처 없음, 자리표시자 목록은 비어 있음',()=>{const raw=R('gas/has-dart-fundamental.gs');assert.ok(!/crtfc_key=[0-9a-fA-F]{40}/.test(raw));assert.ok(/var HAS_DART_CORPS = \{\s*\/\/[^\n]*\n\};/.test(raw));assert.ok(!/@/.test(raw.replace(/e\.parameter/g,'')));});
test('기존 doGet은 건드리지 않음(연결은 주석 안내뿐)',()=>{const raw=R('gas/has-dart-fundamental.gs');assert.ok(!/^function doGet/m.test(raw));assert.ok(/^ \*   if \(e\.parameter/m.test(raw));});
