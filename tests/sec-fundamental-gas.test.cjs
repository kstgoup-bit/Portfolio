'use strict';
// GAS 초안(gas/has-sec-fundamental.gs)을 가짜 UrlFetchApp·CacheService로 실행해 확인. 네트워크·실제 GAS 접근 없음.
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('fs');const path=require('path');const vm=require('vm');
const ROOT=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(ROOT,'gas/has-sec-fundamental.gs'),'utf8');
const filter=fs.readFileSync(path.join(ROOT,'has/fundamental-filter.js'),'utf8');
const hist=fs.readFileSync(path.join(ROOT,'gas/has-history-request.gs'),'utf8');
function facts(cik){const rows=[];for(let y=2021;y<=2025;y++){rows.push({start:y+'-01-01',end:y+'-12-31',val:1e9+y,filed:(y+1)+'-02-10',form:'10-K',fp:'FY',accn:'a'+y});}
  const mk=(v)=>({units:{USD:rows.map(r=>Object.assign({},r,{val:v+(r.end.slice(0,4)-2000)}))}});
  const o={entityName:'Test Co',facts:{'us-gaap':{NetIncomeLoss:mk(1e8),Revenues:mk(1e9)}}};if(cik!==undefined)o.cik=cik;return o;}
const MAP={0:{cik_str:320193,ticker:'AAPL',title:'Apple'},1:{cik_str:789019,ticker:'MSFT',title:'Microsoft'}};
// shared: 여러 실행(병렬 요청 흉내)이 같은 캐시·잠금·시계를 쓰도록 공유
function shared(){return {store:{},props:{},clock:{t:1_700_000_000_000},lockHeld:false,starts:[]};}
function env(opts){opts=opts||{};const sh=opts.shared||shared();const calls=[],store=sh.store,clock=sh.clock;
  class FakeDate extends Date{constructor(...a){super(...(a.length?a:[clock.t]));}static now(){return clock.t;}}
  const ctx={calls,store,clock,JSON,Math,Object,Array,Number,String,Error,Infinity,isFinite,Date:FakeDate,
    UrlFetchApp:{fetch(url,o){calls.push({url,o,t:clock.t});sh.starts.push(clock.t);if(opts.during)opts.during(url,sh);clock.t+=opts.fetchMs||30;if(opts.throwFetch&&opts.throwFetch(url))throw Error('net');
      if(opts.fail&&opts.fail(url))return {getResponseCode:()=>opts.code||503,getContentText:()=>''};
      if(url==='https://www.sec.gov/files/company_tickers.json')return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(opts.map||MAP)};
      const m=/CIK(\d{10})\.json$/.exec(url);const real=Number(m[1]);const cik=opts.cikOf?opts.cikOf(real):real;
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(facts(cik))};}},
    CacheService:{getScriptCache:()=>({get:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,put:(k,v)=>{store[k]=String(v);}})},
    PropertiesService:{getScriptProperties:()=>({getProperty(k){if(opts.propGet&&opts.propGet(k))throw Error('prop-get');return Object.prototype.hasOwnProperty.call(sh.props,k)?sh.props[k]:null;},
      setProperty(k,v){const r=opts.propSet&&opts.propSet(k,String(v),sh);if(r==='skip')return this;if(r)throw Error('prop-set');sh.props[k]=String(v);return this;}})},
    LockService:{getScriptLock:()=>({tryLock(){if(opts.lockBusy||sh.lockHeld)return false;sh.lockHeld=true;return true;},releaseLock(){sh.lockHeld=false;}})},
    Utilities:{sleep(ms){clock.t+=ms;}},ContentService:{MimeType:{JSON:'J',JAVASCRIPT:'JS'},createTextOutput(t){return {t,setMimeType(m){this.m=m;return this;}};}}};
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
test('티커 목록 실패 → 종목별 보류, 캐시 재사용(두 번째 요청은 지도·companyfacts 재호출 없음)',()=>{
  const bad=env({fail:u=>/company_tickers/.test(u)});const d=JSON.parse(call(bad,{tickers:'AAPL'}).t);assert.deepEqual([d.items.AAPL.ok,d.items.AAPL.reason],[false,'sec-ticker-map-failed']);
  const c=env();call(c,{tickers:'AAPL'});const n1=c.calls.length;assert.equal(n1,2);call(c,{tickers:'AAPL'});assert.equal(c.calls.length,n1);});
test('JSONP: 안전한 콜백만, 위험 콜백은 일반 JSON, 응답에 < > & 없음',()=>{
  const c=env();assert.match(call(c,{tickers:'AAPL'},'cb_1').t,/^cb_1\(\{/);assert.equal(call(c,{tickers:'AAPL'},'alert(1)//').t[0],'{');assert.doesNotMatch(call(c,{tickers:'AAPL'}).t,/[<>&]/);});
test('응답은 앱 검증(validNormalized)을 통과하고, 저장소에 실제 연락처·키 없음',()=>{
  const c=env();const d=JSON.parse(call(c,{tickers:'AAPL'}).t);assert.equal(vm.runInContext('HASFundamentalFilter.validNormalized',c)(d.items.AAPL),true);
  assert.match(src,/CONTACT_EMAIL_HERE/);assert.doesNotMatch(src,/[\w.+-]+@[\w-]+\.[\w.]+/);});
test('배포 파일은 기존 doGet을 수정하지 않는다(연결 한 줄은 주석 안내뿐)',()=>{assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g,''),/function doGet/);});

// ── 지피 GPT-REVIEW-sec-gas-20261116-0930 CR-1: 요청 종목 ↔ SEC 원본 CIK 정합성
test('CR-1 정상 2종목은 서로 다른 CIK로 확정(cik 필드 = URL CIK)',()=>{
  const c=env();const d=JSON.parse(call(c,{tickers:'AAPL,MSFT'}).t);
  assert.deepEqual([d.items.AAPL.ok,d.items.AAPL.cik,d.items.MSFT.ok,d.items.MSFT.cik],[true,'320193',true,'789019']);
  for(const t of ['AAPL','MSFT'])assert.equal(vm.runInContext('HASFundamentalFilter.validNormalized',c)(d.items[t]),true);});
test('CR-1 원본 CIK 불일치·누락·위변조는 그 종목만 보류, 다른 종목 유지, 캐시에 안 남음',()=>{
  const cases=[[111,'sec-cik-mismatch'],[undefined,'sec-cik-missing'],[null,'sec-cik-missing'],['',"sec-cik-missing"],['789019x','sec-cik-mismatch'],['-789019','sec-cik-mismatch'],[789019.5,'sec-cik-mismatch'],[{v:789019},'sec-cik-mismatch'],['320193','sec-cik-mismatch']];
  for(const [bad,reason] of cases){const c=env({cikOf:r=>r===789019?bad:r});const d=JSON.parse(call(c,{tickers:'AAPL,MSFT'}).t);
    assert.equal(d.items.AAPL.ok,true,String(bad));assert.deepEqual([d.items.MSFT.ok,d.items.MSFT.reason],[false,reason],String(bad));
    assert.ok(!Object.keys(c.store).some(k=>/^HAS_SEC_F_MSFT/.test(k)),'불일치 자료 캐시 금지 '+String(bad));}});
test('CR-1 앞 0이 붙은 숫자 문자열 CIK는 같은 회사로 인정',()=>{
  const c=env({cikOf:r=>r===320193?'0000320193':r});const d=JSON.parse(call(c,{tickers:'AAPL'}).t);assert.deepEqual([d.items.AAPL.ok,d.items.AAPL.cik],[true,'320193']);});
test('CR-1 캐시 키에 CIK 포함, 티커의 CIK가 바뀌면 이전 회사 캐시를 쓰지 않음, 위조된 캐시 값은 재수집',()=>{
  const sh=shared();const c=env({shared:sh});call(c,{tickers:'AAPL'});
  assert.ok(Object.prototype.hasOwnProperty.call(sh.store,'HAS_SEC_F_AAPL_0000320193'));
  // 티커 지도가 바뀜(새 CIK) → 이전 캐시 무시, 새 CIK로 요청
  sh.store['HAS_SEC_CIK_AAPL']='789019';const c2=env({shared:sh});const d2=JSON.parse(call(c2,{tickers:'AAPL'}).t);
  assert.equal(d2.items.AAPL.cik,'789019');assert.ok(c2.calls.some(x=>x.url.endsWith('CIK0000789019.json')));
  // 올바른 키에 다른 CIK·다른 티커·검증 불통과 값이 들어있으면 재수집
  for(const tamper of [o=>{o.cik='111';},o=>{o.ticker='MSFT';},o=>{o.years='x';}]){
    const v=JSON.parse(sh.store['HAS_SEC_F_AAPL_0000789019']);tamper(v);sh.store['HAS_SEC_F_AAPL_0000789019']=JSON.stringify(v);
    const c3=env({shared:sh});const d3=JSON.parse(call(c3,{tickers:'AAPL'}).t);assert.equal(c3.calls.length,1);assert.deepEqual([d3.items.AAPL.ok,d3.items.AAPL.cik,d3.items.AAPL.ticker],[true,'789019','AAPL']);}});
// ── CR-2: SEC 이용률(지도+회사자료 모든 요청, 실행 합산)
test('CR-2 지도도 관문 통과, 같은 실행·다른 실행 모두 SEC 요청 시작 간격 ≥250ms, 분당 상한 준수',()=>{
  const sh=shared();const a=env({shared:sh,fetchMs:5}),b=env({shared:sh,fetchMs:5});
  call(a,{tickers:'AAPL,MSFT'});call(b,{tickers:'AAPL,MSFT'});   // b는 캐시 적중 → 요청 0
  assert.equal(b.calls.length,0);assert.ok(a.calls[0].url.endsWith('company_tickers.json'));
  const st=sh.starts;assert.equal(st.length,3);for(let i=1;i<st.length;i++)assert.ok(st[i]-st[i-1]>=250,`간격 ${st[i]-st[i-1]}`);
  // 캐시를 비우고 다른 실행이 바로 이어 요청해도 공유 시각 때문에 간격 유지
  for(const k of Object.keys(sh.store))if(/^HAS_SEC_(F|CIK)_/.test(k))delete sh.store[k];
  const c=env({shared:sh,fetchMs:5});call(c,{tickers:'AAPL'});for(let i=1;i<sh.starts.length;i++)assert.ok(sh.starts[i]-sh.starts[i-1]>=250);});
test('CR-2 분당 상한 도달 → 요청하지 않고 sec-rate-hold, 남은 종목도 보류',()=>{
  const sh=shared();sh.props.HAS_SEC_GATE_STATE=JSON.stringify({last:0,min:Math.floor(sh.clock.t/60000),n:60,until:0,pending:0});sh.store['HAS_SEC_CIK_AAPL']='320193';sh.store['HAS_SEC_CIK_MSFT']='789019';
  const c=env({shared:sh});const d=JSON.parse(call(c,{tickers:'AAPL,MSFT'}).t);assert.equal(c.calls.length,0);
  assert.deepEqual([d.items.AAPL.reason,d.items.MSFT.reason],['sec-rate-hold','sec-rate-hold']);});
test('CR-2 다른 실행이 요청 차례를 쥐고 있으면(잠금 실패) 요청 0, sec-busy 보류',()=>{
  const c=env({lockBusy:true});const d=JSON.parse(call(c,{tickers:'AAPL,MSFT'}).t);assert.equal(c.calls.length,0);
  assert.deepEqual([d.items.AAPL.reason,d.items.MSFT.reason],['sec-busy','sec-busy']);});
for(const code of [429,403])test(`CR-2 ${code} → 재요청 없이 10분 전체 중단, 중단 중 요청 0, 지난 뒤 재개`,()=>{
  const sh=shared();const c=env({shared:sh,fail:u=>/companyfacts/.test(u),code});const d=JSON.parse(call(c,{tickers:'AAPL,MSFT'}).t);
  assert.equal(c.calls.filter(x=>/companyfacts/.test(x.url)).length,1,'같은 실행 안 재요청 없음');
  assert.deepEqual([d.items.AAPL.reason,d.items.MSFT.reason],['sec-http-'+code,'sec-cooldown']);
  const c2=env({shared:sh});const d2=JSON.parse(call(c2,{tickers:'AAPL'}).t);assert.equal(c2.calls.length,0);assert.equal(d2.items.AAPL.reason,'sec-cooldown');
  sh.clock.t+=10*60*1000+1;const c3=env({shared:sh});const d3=JSON.parse(call(c3,{tickers:'AAPL'}).t);assert.equal(d3.items.AAPL.ok,true);assert.equal(c3.calls.length,1);});
test('CR-2 지도 요청이 429면 종목 보류(sec-http-429)·이후 중단, 지도에 없는 티커는 1시간 기억해 지도 재조회 없음',()=>{
  const sh=shared();const c=env({shared:sh,fail:u=>/company_tickers/.test(u),code:429});const d=JSON.parse(call(c,{tickers:'AAPL'}).t);
  assert.equal(d.items.AAPL.reason,'sec-http-429');const c2=env({shared:sh});assert.equal(JSON.parse(call(c2,{tickers:'AAPL'}).t).items.AAPL.reason,'sec-cooldown');assert.equal(c2.calls.length,0);
  const s2=shared();const u=env({shared:s2});call(u,{tickers:'ZZZZ'});const u2=env({shared:s2});const du=JSON.parse(call(u2,{tickers:'ZZZZ'}).t);
  assert.equal(du.items.ZZZZ.reason,'unknown-ticker');assert.equal(u2.calls.length,0);assert.equal(s2.store['HAS_SEC_CIK_ZZZZ'],'0');});
test('CR-2 캐시 항목은 100KB·6시간 한도 안쪽',()=>{
  const sh=shared();const c=env({shared:sh});call(c,{tickers:'AAPL,MSFT'});for(const [k,v] of Object.entries(sh.store))assert.ok(v.length<=90000,k);
  assert.match(src,/HAS_SEC_CACHE_SECONDS = 21600;/);assert.match(src,/HAS_SEC_CIK_CACHE_SECONDS = 21600;/);});

// ── 지피 GPT-REVIEW-sec-gas-20261116-1030 CR-3/CR-4: 허가 상태는 퇴거 없는 스크립트 속성, 실패 시 요청 보류(fail closed)
const ST=sh=>JSON.parse(sh.props.HAS_SEC_GATE_STATE);
test('CR-3 허가 상태는 CacheService에 두지 않음(캐시를 매번 통째로 비워도 간격·분당 상한 유지)',()=>{
  const sh=shared();const tk=['AAPL','MSFT'];
  for(let i=0;i<80;i++){for(const k of Object.keys(sh.store))delete sh.store[k];   // 매 실행 전 캐시 전부 조기 퇴거
    sh.clock.t+=1;const c=env({shared:sh,fetchMs:1});call(c,{tickers:tk[i%2]});}
  assert.ok(!Object.keys(sh.store).some(k=>/^HAS_SEC_(LAST_MS|N_|COOLDOWN)/.test(k)),'허가 상태 캐시 키 없음');
  const st=sh.starts;for(let i=1;i<st.length;i++)assert.ok(st[i]-st[i-1]>=250,`간격 ${st[i]-st[i-1]}`);
  const perMin={};for(const t of st){const m=Math.floor(t/60000);perMin[m]=(perMin[m]||0)+1;}
  for(const [m,n] of Object.entries(perMin))assert.ok(n<=60,`분 ${m}: ${n}건`);
  assert.ok(st.length>=60,'충분히 요청해 상한 검사가 의미 있음 '+st.length);});
test('CR-3 캐시 적중·미적중 혼합, 지도+companyfacts 전체 요청량: 분당 60 초과 시 이후 실행 요청 0',()=>{
  const sh=shared();let total=0,held=0;
  for(let i=0;i<100;i++){if(i%3===0)for(const k of Object.keys(sh.store))delete sh.store[k];
    const c=env({shared:sh,fetchMs:1});const d=JSON.parse(call(c,{tickers:'AAPL,MSFT'}).t);total+=c.calls.length;
    if(Object.values(d.items).some(x=>x.reason==='sec-rate-hold'))held++;}
  const perMin={};for(const t of sh.starts){const m=Math.floor(t/60000);perMin[m]=(perMin[m]||0)+1;}
  for(const n of Object.values(perMin))assert.ok(n<=60);assert.equal(total,sh.starts.length);assert.ok(held>0,'상한 보류 발생');});
test('CR-3 병렬: 한 실행이 SEC 요청 중이면(잠금 유지) 다른 실행은 요청 0·sec-busy',()=>{
  const sh=shared();let inner=null;
  const a=env({shared:sh,during:(u)=>{if(!inner&&/companyfacts/.test(u)){const b=env({shared:sh});inner={b,d:JSON.parse(call(b,{tickers:'MSFT'}).t)};}}});
  const d=JSON.parse(call(a,{tickers:'AAPL'}).t);assert.equal(d.items.AAPL.ok,true);
  assert.equal(inner.b.calls.length,0);assert.equal(inner.d.items.MSFT.reason,'sec-busy');assert.equal(ST(sh).pending,0);});
test('CR-3 상태 읽기·쓰기 실패, 손상 상태 → 요청 0(sec-state-hold), 손상 상태는 10분 중단으로 덮어씀',()=>{
  for(const o of [{propGet:()=>true},{propSet:()=>true}]){const c=env(o);const d=JSON.parse(call(c,{tickers:'AAPL,MSFT'}).t);
    assert.equal(c.calls.length,0);assert.deepEqual([d.items.AAPL.reason,d.items.MSFT.reason],['sec-state-hold','sec-state-hold']);}
  for(const bad of ['{x','null','{"last":-1,"min":0,"n":0,"until":0,"pending":0}','{"last":0,"min":0,"n":"1","until":0,"pending":0}']){
    const sh=shared();sh.props.HAS_SEC_GATE_STATE=bad;const c=env({shared:sh});const d=JSON.parse(call(c,{tickers:'AAPL'}).t);
    assert.equal(c.calls.length,0,bad);assert.equal(d.items.AAPL.reason,'sec-state-hold');assert.ok(ST(sh).until>sh.clock.t,bad);
    const c2=env({shared:sh});call(c2,{tickers:'AAPL'});assert.equal(c2.calls.length,0,'중단 중 '+bad);}
  // 쓰기는 성공했다고 하지만 되읽은 값이 다르면 요청하지 않음
  const c=env({propSet:(k,v,sh)=>{sh.props[k]=v.replace('"pending":','"pending":0,"x":');return 'skip';}});
  const d=JSON.parse(call(c,{tickers:'AAPL'}).t);assert.equal(c.calls.length,0);assert.equal(d.items.AAPL.reason,'sec-state-hold');});
for(const code of [429,403])test(`CR-4 ${code} 뒤 중단 기록 실패(쓰기 예외) → pending이 남아 다음 실행 요청 0·10분 중단, 이후 재개`,()=>{
  const sh=shared();let n=0;
  const c=env({shared:sh,fail:u=>/companyfacts/.test(u),code,propSet:(k,v)=>{n++;return /"until":[1-9]/.test(v)&&/"pending":0/.test(v);}});
  const d=JSON.parse(call(c,{tickers:'AAPL,MSFT'}).t);assert.deepEqual([d.items.AAPL.reason,d.items.MSFT.reason],['sec-http-'+code,'sec-cooldown']);
  assert.ok(ST(sh).pending>0,'중단 기록 실패 → pending 남음');
  for(const k of Object.keys(sh.store))delete sh.store[k];   // 캐시 조기 제거까지 겹쳐도
  sh.clock.t+=1000;const c2=env({shared:sh});const d2=JSON.parse(call(c2,{tickers:'AAPL'}).t);
  assert.equal(c2.calls.length,0);assert.equal(d2.items.AAPL.reason,'sec-cooldown');assert.equal(ST(sh).pending,0);assert.ok(ST(sh).until>=sh.clock.t+10*60*1000-1);
  const c3=env({shared:sh});call(c3,{tickers:'AAPL'});assert.equal(c3.calls.length,0,'중단 중');
  sh.clock.t+=10*60*1000+1;const c4=env({shared:sh});const d4=JSON.parse(call(c4,{tickers:'AAPL'}).t);assert.equal(d4.items.AAPL.ok,true);});
test('CR-4 429 뒤 중단 기록 성공 + 캐시 즉시 제거 → 다음 실행 요청 0(중단 시각은 속성에 있음)',()=>{
  const sh=shared();const c=env({shared:sh,fail:u=>/companyfacts/.test(u),code:429});call(c,{tickers:'AAPL'});
  assert.equal(ST(sh).pending,0);assert.ok(ST(sh).until>sh.clock.t);for(const k of Object.keys(sh.store))delete sh.store[k];
  const c2=env({shared:sh});assert.equal(JSON.parse(call(c2,{tickers:'AAPL'}).t).items.AAPL.reason,'sec-cooldown');assert.equal(c2.calls.length,0);});
test('CR-4 병렬: 429 받은 실행이 기록하기 전에는 잠금 때문에 다른 실행이 요청 못 함',()=>{
  const sh=shared();let inner=null;
  const a=env({shared:sh,fail:u=>/companyfacts/.test(u),code:429,during:()=>{if(!inner){const b=env({shared:sh});inner={b,d:JSON.parse(call(b,{tickers:'MSFT'}).t)};}}});
  call(a,{tickers:'AAPL'});assert.equal(inner.b.calls.length,0);assert.equal(inner.d.items.MSFT.reason,'sec-busy');
  const c=env({shared:sh});assert.equal(JSON.parse(call(c,{tickers:'MSFT'}).t).items.MSFT.reason,'sec-cooldown');assert.equal(c.calls.length,0);});
test('CR-4 실행이 요청 도중 끝남(결과 미기록) → 다음 실행은 차단 가능성으로 보고 중단',()=>{
  const sh=shared();sh.props.HAS_SEC_GATE_STATE=JSON.stringify({last:sh.clock.t-5000,min:0,n:0,until:0,pending:sh.clock.t-5000});
  const c=env({shared:sh});assert.equal(JSON.parse(call(c,{tickers:'AAPL'}).t).items.AAPL.reason,'sec-cooldown');assert.equal(c.calls.length,0);});
test('CR-4 네트워크 예외는 차단 아님: pending 해제, 다음 실행 정상',()=>{
  const sh=shared();const c=env({shared:sh,throwFetch:u=>/companyfacts/.test(u)});const d=JSON.parse(call(c,{tickers:'AAPL'}).t);
  assert.equal(d.items.AAPL.reason,'sec-fetch-failed');assert.equal(ST(sh).pending,0);assert.equal(ST(sh).until,0);
  const c2=env({shared:sh});assert.equal(JSON.parse(call(c2,{tickers:'AAPL'}).t).items.AAPL.ok,true);});
