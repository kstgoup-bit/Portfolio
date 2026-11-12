'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('integrated real radar and euphoria share panel, preserve history, no startup request',t=>{
 const d=new JSDOM('<div id="panel-radar"></div>',{url:'https://synthetic.invalid/portfolio_v5.html',runScripts:'outside-only'}),w=d.window;t.after(()=>w.close());let fetches=0,mounts=[];
 w.fetch=()=>{fetches++;throw Error('No network');};w.scrollTo=()=>{};w.switchTab=tab=>{a.equal(tab,'radar');};
 w.KSTRadarCore={loadState:()=>({state:{settings:{}}}),fixtureProvider:()=>({})};w.KSTRadarProviders={};w.KSTRadarVerification={};w.HASLivePricePanel={mount:(el,kind)=>mounts.push(kind)};
 w.eval(read('radar/ui.js'));a.equal(fetches,0);a.deepEqual(mounts,['fear']);w.KSTRadar.openEuphoria();a.equal(w.location.hash,'#kst-radar/real/euphoria');a.equal(mounts.at(-1),'euphoria');
 w.history.replaceState(null,'','#kst-radar/real/list');w.dispatchEvent(new w.PopStateEvent('popstate'));a.equal(mounts.at(-1),'fear');a.equal(fetches,0);
});
test('only reviewed app wiring changes; historical calculations, records, SW unchanged',()=>{
 const P=require('./lib/live-data-projection.cjs'),pins=require('./lib/live-data-pins.json'),crypto=require('node:crypto');
 for(const f of Object.keys(pins.baselineSha256))a.equal(crypto.createHash('sha256').update(P.beforeLiveDataBytes(f)).digest('hex'),pins.baselineSha256[f]);
 const html=read('portfolio_v5.html');for(const file of ['has/live-price-reference.js','has/live-price-panel.js'])a.equal(html.split('src="'+file+'"').length,2);
 a.ok(html.indexOf('src="has/live-price-panel.js"')<html.indexOf('src="radar/ui.js"'));
 a.match(read('has/advisor-panel.js'),/ext = \{\}/); // unverified data never promoted to trading evidence
});
