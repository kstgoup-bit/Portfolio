'use strict';
// Runs the exact main fd259939 exportData function using invented account data
// and in-memory storage, Blob, DOM and URL objects. No user/browser data or I/O.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
const B=require('../backup/core.js');
const source=fs.readFileSync(path.join(__dirname,'fixtures/main-fd259939-exportData.js'),'utf8');
const stock=(id,ticker)=>({id,name:'Synthetic '+ticker,ticker,quantity:2,avgPrice:80,currentPrice:100});
function memory(seed={}){const m=new Map(Object.entries(seed)),writes=[];return {get length(){return m.size;},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem(k,v){writes.push([k,String(v)]);m.set(k,String(v));},removeItem(k){writes.push([k,null]);m.delete(k);},all:()=>Object.fromEntries(m),writes};}
function exported(fg,extra={}){
 const initial={v5_gen:JSON.stringify([stock(4,'GENERAL')]),v5_ledger:'{"2026-10":{"income":[{"name":"Synthetic income","amount":100}]}}',v5_fxHistory:'[{"d":"2026-11-10","v":1400}]',v5_memos:'[{"text":"Synthetic memo"}]',v5_userThemeMap:'{"SYNTH":"Synthetic theme"}',calc_q1_gen_4:'2',...extra};if(fg!==undefined)initial.v5_fg=fg;
 const storage=memory(initial),msg={textContent:'',style:{}},blobs=[],clicks=[];
 const ctx={localStorage:storage,domStocks:[stock(1,'DOM')],ovStocks:[stock(2,'US')],penStocks:[stock(3,'PEN')],genStocks:JSON.parse(initial.v5_gen),divList:[{date:'2026-11-09',amount:3}],snapshots:{all:[{ts:1,val:100}],gen:[{ts:2,val:25}]},deposits:{gen:[{ts:1,amount:20}]},gasUrl:'https://synthetic.invalid/not-a-real-deployment',document:{getElementById:id=>id==='usdKrw'?{value:'1400'}:msg,createElement:()=>({click(){clicks.push(this.download);}})},Blob:class{constructor(parts){this.text=parts.join('');}},URL:{createObjectURL:b=>{blobs.push(b);return 'blob:synthetic';},revokeObjectURL(){}},Date:class extends Date{constructor(...args){super(...(args.length?args:['2026-11-11T00:00:00Z']));}}};
 vm.runInNewContext(source+';exportData();',ctx);a.equal(blobs.length,1);a.equal(clicks.length,1);a.equal(storage.writes.length,0);return {text:blobs[0].text,document:JSON.parse(blobs[0].text),storage};
}
for(const [name,fg,want] of [['missing',undefined,null],['empty','',null],['fifty','50','50'],['zero','0','0'],['hundred','100','100'],['fraction','50.5','50.5']])test('real main export '+name+' parses, previews, restores synthetically and roundtrips without losing settings',()=>{
 const x=exported(fg),doc=x.document; a.equal(doc.version,'v5');a.equal(doc.fg,want);a.equal(Object.hasOwn(doc,'genStocks'),false);a.equal(x.storage.getItem('v5_gen'),JSON.stringify([stock(4,'GENERAL')]));
 const p=B.parse(x.text),before=JSON.stringify(doc),target=memory({v5_gen:JSON.stringify([stock(9,'KEEP')]),v5_dom:'[]',v5_ov:'[]',v5_pen:'[]',v5_fg:'25'});B.preview(target,p);a.equal(target.writes.length,0);B.apply(target,p);
 a.equal(target.getItem('v5_fg'),want??'25');a.equal(target.getItem('v5_gen'),JSON.stringify([stock(9,'KEEP')]));a.deepEqual(JSON.parse(target.getItem('v5_dom')),doc.domStocks);a.equal(target.getItem('calc_q1_gen_4'),'2');a.equal(target.getItem('v5_fx'),'1400');a.equal(target.getItem('v5_gas'),null);a.equal(JSON.stringify(doc),before);
 const complete=B.create(target),again=B.parse(JSON.stringify(complete)),fresh=memory();B.apply(fresh,again);for(const[k,v]of Object.entries(complete.storage))a.equal(fresh.getItem(k),v,k);
 B.undo(target);a.equal(target.getItem('v5_fg'),'25');a.equal(target.getItem('v5_gen'),JSON.stringify([stock(9,'KEEP')]));
});
test('null is an absent optional setting, never numeric zero, deletion or string null',()=>{
 const p=B.parse(exported(undefined).text);a.equal(Object.hasOwn(p.values,'v5_fg'),false);const empty=memory();B.apply(empty,p);a.equal(empty.getItem('v5_fg'),null);a.equal(empty.writes.some(([k])=>k==='v5_fg'),false);
});
test('main export has no independent general-account copy and fresh-target restore must say incomplete',()=>{
 const x=exported('50'),p=B.parse(x.text),dst=memory();a.equal(Object.hasOwn(p.values,'v5_gen'),false);a.match(p.warnings.join(' '),/일반계좌.*백업에 없습니다/);a.match(p.warnings.join(' '),/새 기기.*복구|독립.*백업|불완전/);
 B.apply(dst,p);a.equal(dst.getItem('v5_gen'),null);a.throws(()=>B.create(dst),/4개 계좌/);
});
for(const value of [-1,101,'-1','101','NaN','Infinity','1e999','',' 50 ','050','0x32','50x',true,{},[],null])test('invalid FG strictness or documented null semantics: '+JSON.stringify(value),()=>{
 const d=exported('50').document;d.fg=value;
 if(value===null){a.equal(Object.hasOwn(B.parse(JSON.stringify(d)).values,'v5_fg'),false);return;}
 a.throws(()=>B.parse(JSON.stringify(d)));
});
test('numeric legacy FG remains supported and modern envelopes stay string-only and bounded',()=>{
 const d=exported('50').document;for(const fg of [0,50,100]){d.fg=fg;a.equal(B.parse(JSON.stringify(d)).values.v5_fg,String(fg));}
 const s=memory(Object.fromEntries(B.ACCOUNTS.map(k=>[k,'[]'])));s.setItem('v5_fg','50');const out=B.create(s);for(const fg of [null,50,'101']){const bad=JSON.parse(JSON.stringify(out));bad.storage.v5_fg=fg;a.throws(()=>B.parse(JSON.stringify(bad)));}
});
test('wrong USD exchange representation is not accidentally widened by FG compatibility',()=>{const d=exported('50').document;for(const usdKrw of [null,'1400',0,-1,true]){d.usdKrw=usdKrw;a.throws(()=>B.parse(JSON.stringify(d)));}});
test('explicit general-account data roundtrips to a fresh destination, unlike an omitted account',()=>{
 const d=exported('50').document;d.genStocks=[stock(4,'GENERAL')];const target=memory(),p=B.parse(JSON.stringify(d));B.apply(target,p);a.deepEqual(JSON.parse(target.getItem('v5_gen')),d.genStocks);a.equal(B.create(target).storage.v5_gen,JSON.stringify(d.genStocks));
});
test('captured main exporter is byte-pinned to immutable source metadata',()=>{
 const pin=require('./fixtures/main-fd259939-exportData.json');a.equal(pin.commit,'fd2599398d2f2ef1816ca9b64ea134ea8811309d');a.equal(pin.githubBlobSha,'de4d506b4d7c05eab198f0e87ae74114b2305be5');a.equal(crypto.createHash('sha256').update(source).digest('hex'),pin.functionSha256);
});
function uiHarness(seed={}){
 const {JSDOM}=require('jsdom'),d=new JSDOM('<!doctype html><div id="portfolioBackupTools"></div><div id="backupMsg"></div><input id="usdKrw" value="1400">',{runScripts:'outside-only'}),w=d.window,s=memory(seed),calls=[];
 Object.defineProperty(w,'localStorage',{value:s});w.KSTPortfolioBackup=B;w.backupStateLoaded=true;w.Element.prototype.scrollIntoView=function(){};
 w.eval("var genStocks=[],domStocks=[],ovStocks=[],penStocks=[],divList=[],snapshots={},deposits={},balGoals={},benchmarkHistory={};function loadDebtBank(){return [];}function loadDebtHouse(){return [];}function loadNonFinAssets(){return [];}");
 w.load=()=>calls.push('load');w.renderAll=()=>calls.push('render');w.invalidateBackupRuntime=()=>calls.push('invalidate');w.confirm=()=>true;
 w.eval(fs.readFileSync(path.join(__dirname,'../backup/ui.js'),'utf8'));
 return {d,w,s,calls,text:()=>w.document.body.textContent,button:t=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===t),select:async text=>w.importData({target:{files:[{size:Buffer.byteLength(text),text:async()=>text}],value:'synthetic'}})};
}
test('real backup UI exposes incomplete main export, cancellation is read-only and apply avoids full-restoration claim',async()=>{
 const h=uiHarness({v5_gen:JSON.stringify([stock(9,'KEEP')]),v5_dom:'[]',v5_ov:'[]',v5_pen:'[]',v5_fg:'25'});try{
  const input=exported('50').text,before=h.s.all();await h.select(input);a.match(h.text(),/불완전 백업/);a.match(h.text(),/별도 독립 백업/);a.equal(h.s.writes.length,0);h.button('복원 취소').click();a.deepEqual(h.s.all(),before);
  await h.select(input);h.button('복원 적용').click();const msg=h.w.document.getElementById('backupMsg').textContent;a.match(msg,/포함된 자료만 복원/);a.match(msg,/없는 계좌·설정은 복구된 것이 아닙니다/);a.doesNotMatch(msg,/전체 백업 복원 완료/);a.equal(h.s.getItem('v5_gen'),before.v5_gen);a.equal(h.s.getItem('v5_fg'),'50');
  h.button('전체 복원 되돌리기').click();a.equal(h.s.getItem('v5_fg'),'25');a.equal(h.s.getItem('v5_gen'),before.v5_gen);
 }finally{h.d.window.close();}
});
test('fresh synthetic UI never claims absent general account was recovered',async()=>{
 const h=uiHarness();try{await h.select(exported(undefined).text);a.match(h.text(),/일반: 백업에 없음/);a.match(h.text(),/새 기기에서 일반계좌를 복구할 수 없는/);h.button('복원 적용').click();a.equal(h.s.getItem('v5_gen'),null);a.equal(h.s.getItem('v5_fg'),null);a.match(h.w.document.getElementById('backupMsg').textContent,/없는 계좌·설정은 복구된 것이 아닙니다/);}finally{h.d.window.close();}
});
test('modern complete backup retains normal restoration message',async()=>{
 const h=uiHarness(),src=memory(Object.fromEntries(B.ACCOUNTS.map(k=>[k,'[]'])));try{await h.select(JSON.stringify(B.create(src)));h.button('복원 적용').click();a.match(h.w.document.getElementById('backupMsg').textContent,/전체 백업 복원 완료/);}finally{h.d.window.close();}
});
