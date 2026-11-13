'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(require('path').join(__dirname,'..','portfolio_v5.html'),'utf8');
const m=/<script>\n\/\* 속도: Intl\.DateTimeFormat[\s\S]*?<\/script>/.exec(html);
test('Intl.DateTimeFormat 캐시: 결과 동일, 같은 설정은 같은 객체 재사용',()=>{
  assert.ok(m,'snippet exists before first deferred script');
  assert.ok(html.indexOf(m[0])<html.indexOf('<script defer src="'));
  const code=m[0].replace(/^<script>|<\/script>$/g,'');
  const sb={Intl:{DateTimeFormat:Intl.DateTimeFormat}};vm.createContext(sb);vm.runInContext(code,sb);
  const F=sb.Intl.DateTimeFormat,O=Intl.DateTimeFormat;
  const opt={timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'};
  const a=new F('en-CA',opt),b=new F('en-CA',{...opt});
  assert.equal(a,b);
  const d=new Date('2026-11-13T15:30:00Z');
  for(const tz of ['Asia/Seoul','America/New_York','UTC'])
    assert.equal(new F('en-CA',{...opt,timeZone:tz}).format(d),new O('en-CA',{...opt,timeZone:tz}).format(d));
  assert.notEqual(new F('en-CA',{...opt,timeZone:'UTC'}),a);
  assert.ok(a instanceof O); assert.equal(typeof F.supportedLocalesOf,'function');
  assert.ok(new F() instanceof O); assert.throws(()=>new F('en-CA',{timeZone:'Nope/Zone'}));
});
