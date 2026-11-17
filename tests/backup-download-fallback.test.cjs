'use strict';
// 백업 다운로드: 링크를 화면에 붙여 누르고, 막히는 브라우저용 '열기' 링크를 함께 제공한다.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const ROOT=path.resolve(__dirname,'..');
test('exportData: 숨은 앵커를 body에 붙여 클릭하고 열기 링크를 남긴다',()=>{
 const dom=new JSDOM('<body><div id="portfolioBackupTools"></div><div id="backupMsg"></div><input id="usdKrw" value="1400"></body>',{runScripts:'outside-only',url:'https://example.test/'});
 const w=dom.window;let clicked=null,blobs=0,revoked=0;
 w.URL.createObjectURL=()=>{blobs++;return 'blob:test/1';};w.URL.revokeObjectURL=()=>{revoked++;};
 w.HTMLAnchorElement.prototype.click=function(){clicked={download:this.download,href:this.href,inDom:this.isConnected,hidden:this.style.display==='none'};};
 w.eval('var genStocks=[],domStocks=[],ovStocks=[],penStocks=[],divList=[],snapshots=[],deposits=[],balGoals=[];function loadDebtBank(){return[]}function loadDebtHouse(){return[]}function loadNonFinAssets(){return[]}window.backupStateLoaded=true;window.KSTPortfolioBackup={MAX_BYTES:1e7,isWriteBlocked(){return false},create(){return{ok:1}}};');
 w.eval(fs.readFileSync(path.join(ROOT,'backup/ui.js'),'utf8'));
 w.exportData();
 a.ok(clicked,'앵커 클릭 안 됨');a.match(clicked.download,/^KST-전체백업-v7-\d{4}-\d{2}-\d{2}\.json$/);a.equal(clicked.inDom,true,'클릭 시 DOM에 붙어 있어야 함');a.equal(clicked.hidden,true);
 const link=w.document.getElementById('backupOpenLink');a.ok(link);a.equal(link.getAttribute('href'),'blob:test/1');a.equal(link.target,'_blank');
 a.match(w.document.getElementById('backupMsg').textContent,/백업을 만들었습니다/);
 a.equal(revoked,0,'즉시 해제 금지(열기 링크가 살아 있어야 함)');
 w.close();
});
test('exportData: 백업 실패 시 파일·열기 링크를 만들지 않는다',()=>{
 const dom=new JSDOM('<body><div id="portfolioBackupTools"></div><div id="backupMsg"></div></body>',{runScripts:'outside-only',url:'https://example.test/'});
 const w=dom.window;let n=0;w.URL.createObjectURL=()=>{n++;return 'blob:x';};
 w.eval('window.KSTPortfolioBackup={MAX_BYTES:1e7,isWriteBlocked(){return false},create(){return{}}};');
 w.eval(fs.readFileSync(path.join(ROOT,'backup/ui.js'),'utf8'));w.exportData();
 a.equal(n,0);a.equal(w.document.getElementById('backupOpenLink'),null);a.match(w.document.getElementById('backupMsg').textContent,/백업 실패/);
 w.close();
});
