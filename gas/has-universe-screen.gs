/* Deployment proposal ONLY. Existing doGet/history remain unchanged.
 * After explicit GAS approval: add live-price-reference.js + universe-screen.js,
 * this file, a reviewed manifest; dispatch type=screen to hasScreenResponse_.
 * No automatic trigger installation. hasScreenStart_(manifest) then scheduled
 * hasScreenStep_ processes <=12 stocks, never 400 in a phone request.
 */
// 계산 가정(미검증): 1회 실행 4.5분 예산 < GAS 6분 한계, 묶음당 최대 12종목, 조각 8000자 < 속성 값 9KB,
// 조각 15개(120000자) 이하, 전체 속성 430000자 이하. 실제 GAS 할당량·실행시간은 배포 전 확인 필요.
var HAS_SCREEN_RUN_BUDGET_MS=270000,HAS_SCREEN_MAX_RESPONSE_CHARS=600000;
function hasScreenDigest_(text){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.US_ASCII).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function hasScreenStore_(slot, value) {
  var props=PropertiesService.getScriptProperties(),prefix='HAS_SCREEN_'+slot+'_',old=props.getProperty(prefix+'HEAD');
  var encoded=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(value),'application/json')).getBytes());
  if(encoded.length>120000)throw Error('screen-storage-size-limit');
  var id=Utilities.getUuid().replace(/-/g,''),count=Math.ceil(encoded.length/8000),parts={},head={id:id,count:count,len:encoded.length,sha256:hasScreenDigest_(encoded)};
  for(var i=0;i<count;i++)parts[prefix+id+'_'+i]=encoded.slice(i*8000,(i+1)*8000);
  var all=props.getProperties(),bytes=JSON.stringify(all).length+JSON.stringify(parts).length;
  // Existing script properties are included; never evict unrelated/user data.
  if(bytes>430000)throw Error('screen-storage-budget');
  try {
    props.setProperties(parts,false);
    var joined='';for(var j=0;j<count;j++){var part=props.getProperty(prefix+id+'_'+j);if(part!==parts[prefix+id+'_'+j])throw Error('screen-write-verification');joined+=part;}
    if(joined!==encoded)throw Error('screen-write-verification');
    // Commit pointer LAST. A reader only sees previous or new complete payload.
    props.setProperty(prefix+'HEAD',JSON.stringify(head));
  }catch(e){throw e;} // Failed orphan parts are cleared at next locked step.
  if(old){var h=JSON.parse(old);for(var k=0;k<h.count;k++)props.deleteProperty(prefix+h.id+'_'+k);}
}
function hasScreenRead_(slot) {
  var p=PropertiesService.getScriptProperties(),prefix='HAS_SCREEN_'+slot+'_',raw=p.getProperty(prefix+'HEAD');if(!raw)return null;
  var h=JSON.parse(raw);if(!/^[a-f0-9]{32}$/.test(h.id)||!Number.isInteger(h.count)||h.count<1||h.count>15||!Number.isInteger(h.len)||!/^[a-f0-9]{64}$/.test(h.sha256))throw Error('screen-invalid-pointer');var encoded='';
  for(var i=0;i<h.count;i++){var s=p.getProperty(prefix+h.id+'_'+i);if(s===null)throw Error('screen-incomplete-storage');encoded+=s;}
  // 조각이 모두 있어도 내용이 바뀌었으면 거부한다(길이·SHA-256).
  if(encoded.length!==h.len||hasScreenDigest_(encoded)!==h.sha256)throw Error('screen-integrity');
  return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(encoded))).getDataAsString('UTF-8'));
}
function hasScreenClean_(){
 var p=PropertiesService.getScriptProperties(),all=p.getProperties();['WORK','PUBLIC'].forEach(function(slot){var prefix='HAS_SCREEN_'+slot+'_',h=all[prefix+'HEAD']?JSON.parse(all[prefix+'HEAD']):null;Object.keys(all).forEach(function(k){if(k.indexOf(prefix)===0&&k!==prefix+'HEAD'&&(!h||k.indexOf(prefix+h.id+'_')!==0))p.deleteProperty(k);});});
}
function hasScreenStart_(manifest){
 var lock=LockService.getScriptLock();if(!lock.tryLock(1000))throw Error('screen-busy');try{
  HASUniverseScreen.validateUniverse(manifest);if(manifest.members.some(function(t){return t.scope==='extra';}))throw Error('private-extras-require-authenticated-channel');hasScreenClean_();var old=hasScreenRead_('WORK');if(old&&old.next<old.batches.length&&Date.now()-Date.parse(old.startedAt)<=24*3600000)throw Error('screen-generation-in-progress');
  hasScreenStore_('WORK',{generation:Utilities.getUuid(),startedAt:new Date().toISOString(),universe:manifest,batches:HASUniverseScreen.batches(manifest),next:0,rows:[]});
 }finally{lock.releaseLock();}
}
function hasScreenStep_(){
 var lock=LockService.getScriptLock();if(!lock.tryLock(1000))return {status:'busy'};try{
  hasScreenClean_();var work=hasScreenRead_('WORK');if(!work)return {status:'not-started'};if(work.next>=work.batches.length)return {status:'finished'};
  if(Date.now()-Date.parse(work.startedAt)>24*3600000)throw Error('screen-generation-expired-start-new-reviewed-run');
  var batch=work.batches[work.next],market=batch[0].market,benchmark=market==='KR'?'069500':'SPY',records={},b=null;
  try{records=hasGetHistories_(batch.map(function(t){return t.ticker;}).join(','),market)||{};}catch(e){}
  try{var br=hasGetHistories_(benchmark,market);b=br&&br[benchmark]?{record:br[benchmark],ticker:benchmark,market:market}:null;}catch(e){}
  var now=new Date().toISOString();batch.forEach(function(t){work.rows.push(HASUniverseScreen.summarize(t,records[t.ticker],b,now));});work.next++;
  if(work.next===work.batches.length){var summary=HASUniverseScreen.assemble(work.universe,work.rows,{generation:work.generation,generatedAt:now});HASUniverseScreen.validateSummary(summary,Date.now());hasScreenStore_('PUBLIC',summary);}
  hasScreenStore_('WORK',work);return {status:work.next===work.batches.length?'published':'partial',done:work.rows.length,total:work.universe.members.length};
 }finally{lock.releaseLock();}
}
/* 시간 예산 안에서 묶음을 이어 처리. 다음 묶음이 예산을 넘길 것 같으면 멈추고 다음 트리거에서 재개. */
function hasScreenRun_(budgetMs){
 var start=Date.now(),budget=Math.min(budgetMs||HAS_SCREEN_RUN_BUDGET_MS,HAS_SCREEN_RUN_BUDGET_MS),slowest=0,out={status:'not-started'},n=0;
 while(n<60){var t=Date.now();if(n>0&&t-start+slowest>budget){out.stoppedForTime=true;break;}out=hasScreenStep_();n++;slowest=Math.max(slowest,Date.now()-t);if(out.status!=='partial')break;}
 out.steps=n;return out;
}
/* 공개 응답 전 검사: 완료 세대 형식, 만료, 매수 후보 없음, 개인(extra) 종목 없음. */
function hasScreenPublicCheck_(data,now){HASUniverseScreen.validateSummary(data,now);if(data.items.some(function(r){return r.scope!=='core';}))throw Error('screen-private-row');return data;}
function hasScreenResponse_(callback){
 var lock=LockService.getScriptLock(),data;if(!lock.tryLock(1000))data={error:'screen-busy'};else{try{var pub=hasScreenRead_('PUBLIC');data=pub?hasScreenPublicCheck_(pub,Date.now()):{error:'screen-not-published'};}catch(e){data={error:/expired/.test(String(e&&e.message))?'screen-expired':'screen-unavailable'};}finally{lock.releaseLock();}}
 var json=JSON.stringify(data);if(json.length>HAS_SCREEN_MAX_RESPONSE_CHARS)json=JSON.stringify({error:'screen-too-large'});json=json.replace(/[<>&\u2028\u2029]/g,function(c){return '\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);});var cb=hasHistoryCallback_(callback)?callback:null;
 return ContentService.createTextOutput(cb?cb+'('+json+')':json).setMimeType(cb?ContentService.MimeType.JAVASCRIPT:ContentService.MimeType.JSON);
}
