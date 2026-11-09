/* Offline draft mapper. SEC-looking input and user review are not authentication. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.HASSECFacts=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const cik=x=> typeof x==='number'&&Number.isSafeInteger(x)&&x>0&&x<=9999999999?String(x):typeof x==='string'&&/^\d{1,10}$/.test(x)&&Number(x)>0?String(Number(x)):null;
const SPECS={
revenue:['duration','USD','RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet'],
netIncome:['duration','USD','NetIncomeLoss'],operatingIncome:['duration','USD','OperatingIncomeLoss'],
operatingCashFlow:['duration','USD','NetCashProvidedByUsedInOperatingActivities'],
capex:['duration','USD','PaymentsToAcquirePropertyPlantAndEquipment'],
liabilities:['instant','USD','Liabilities'],equity:['instant','USD','StockholdersEquity'],
cash:['instant','USD','CashAndCashEquivalentsAtCarryingValue'],
eps:['duration','USD/shares','EarningsPerShareDiluted'],
dilutedShares:['duration','shares','WeightedAverageNumberOfDilutedSharesOutstanding'],
sharesOutstanding:['instant','shares','CommonStockSharesOutstanding'],interestExpense:['duration','USD','InterestExpense']};
for(const k of ['revenue','eps','operatingCashFlow','capex'])SPECS[k+'Prev']=SPECS[k];
const syntheticMarker=x=>typeof x==='string'&&/synthetic|invented|not a real issuer|발명|가상|합성/i.test(x);
function markedSynthetic(x){if(!x||typeof x!=='object')return false;return Object.entries(x).some(([k,v])=>(k==='synthetic'&&v===true)||(['source','reference','entityName','description','label','notice','note','origin'].includes(k)&&syntheticMarker(v))||(v&&typeof v==='object'&&markedSynthetic(v)));}
const notice='Read-only draft mapping, not independently verified source truth or complete financial statements. No TTM synthesis, sector inference, valuation assumptions or verification promotion. Date-only filed dates cannot establish intraday availability. Synthetic data is invented.';
// Reject exotic objects/accessors before reading values; bounded traversal, not JSON.stringify on caller objects.
function copyJSON(input){let nodes=0,chars=0;const seen=new Set();function walk(x,depth){if(++nodes>150000||depth>16)throw Error('input-limit');if(x===null||typeof x==='boolean')return x;if(typeof x==='number'){if(!Number.isFinite(x))throw Error('non-json');return x;}if(typeof x==='string'){chars+=x.length;if(chars>4000000)throw Error('input-limit');return x;}if(typeof x!=='object'||seen.has(x))throw Error('non-json');const p=Object.getPrototypeOf(x);if(!Array.isArray(x)&&p!==Object.prototype&&p!==null)throw Error('non-json');seen.add(x);const keys=Reflect.ownKeys(x);if(keys.length>50000)throw Error('input-limit');const out=Array.isArray(x)?[]:{};for(const k of keys){if(Array.isArray(x)&&k==='length')continue;if(typeof k!=='string'||['__proto__','constructor','prototype'].includes(k))throw Error('non-json');const d=Object.getOwnPropertyDescriptor(x,k);if(!d||!own(d,'value')||!d.enumerable)throw Error('non-json');Object.defineProperty(out,k,{value:walk(d.value,depth+1),enumerable:true,writable:true,configurable:true});}seen.delete(x);return out;}return walk(input,0);}
function select(input,nowISO){const out={status:'invalid',instrument:null,mode:null,observations:{},selectionEvidence:[],issues:[],notice};const issue=(code,field)=>out.issues.push({code,field:field||null});let d;try{d=copyJSON(input);}catch(e){issue(e.message==='input-limit'?'input-limit':'non-json');return out;}
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
if(!obj(d)||d.version!==1||!['synthetic','imported'].includes(d.mode)||typeof nowISO!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(nowISO)||!day(nowISO.slice(0,10))||!Number.isFinite(Date.parse(nowISO))){issue('invalid-envelope');return out;}
if(d.mode==='imported'&&markedSynthetic(d)){issue('synthetic-origin-mismatch');return out;}
const today=nowISO.slice(0,10),i=d.instrument,raw=d.companyfacts,r=d.identityReview;
if(!obj(i)||typeof i.ticker!=='string'||!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(i.ticker)||i.market!=='US'||i.currency!=='USD'||!obj(raw)||!cik(raw.cik)||!obj(raw.facts)||!obj(raw.facts['us-gaap'])||typeof raw.entityName!=='string'||!raw.entityName.trim()||raw.entityName.length>300){issue('invalid-instrument-or-companyfacts');return out;}
out.instrument={ticker:i.ticker,market:'US',currency:'USD'};out.mode=d.mode;
if(!obj(r)||r.reviewed!==true||r.ticker!==i.ticker||cik(r.cik)!==cik(raw.cik)||!day(r.reviewedOn)||r.reviewedOn>today){issue('identity-review-required');return out;}
if(!obj(d.selections)||Object.keys(d.selections).length<1||Object.keys(d.selections).length>24){issue('selection-limit');return out;}
let factCount=0;for(const ns of Object.values(raw.facts)){if(!obj(ns)){issue('malformed-facts');return out;}for(const tag of Object.values(ns)){if(!obj(tag)||!obj(tag.units)){issue('malformed-facts');return out;}for(const rows of Object.values(tag.units)){if(!Array.isArray(rows)){issue('malformed-facts');return out;}factCount+=rows.length;if(factCount>20000){issue('fact-limit');return out;}if(rows.some(x=>!obj(x))){issue('malformed-facts');return out;}}}}
for(const [field,s]of Object.entries(d.selections)){
const fail=code=>issue(code,field),spec=own(SPECS,field)?SPECS[field]:null;
if(!spec||!obj(s)||Object.keys(s).some(k=>!['tag','unit','accession','start','end','form','filed'].includes(k))){fail('unsupported-selection');continue;}
if(!spec.slice(2).includes(s.tag)||s.unit!==spec[1]){fail('tag-or-unit-mismatch');continue;}
if(typeof s.accession!=='string'||!/^\d{10}-\d{2}-\d{6}$/.test(s.accession)||!day(s.end)||!day(s.filed)||!['10-K','10-K/A','10-Q','10-Q/A'].includes(s.form)||s.end>s.filed||s.filed>today){fail('invalid-filing-selector');continue;}
const instant=spec[0]==='instant';const length=day(s.start)?(Date.parse(s.end)-Date.parse(s.start))/86400000:NaN;
const kind=instant?'instant':length>=330&&length<=380?'annual':length>=65&&length<=110?'quarter':null;
if(!kind||(instant&&own(s,'start'))||(!instant&&s.start>=s.end)||(kind==='annual'&&!/^10-K/.test(s.form))){fail('period-or-form-mismatch');continue;}
const tag=raw.facts['us-gaap'][s.tag],rows=tag&&tag.units[s.unit];if(!Array.isArray(rows)){fail('fact-not-found');continue;}
const periodMatch=f=>f.end===s.end&&(instant?!own(f,'start'):f.start===s.start);
const matches=rows.filter(f=>periodMatch(f)&&f.accn===s.accession&&f.filed===s.filed&&f.form===s.form);
if(matches.length!==1){fail(matches.length?'ambiguous-fact':'fact-not-found');continue;}
const f=matches[0];
if(typeof f.val!=='number'||!Number.isFinite(f.val)||Math.abs(f.val)>1e18||(f.val!==0&&Math.abs(f.val)<1e-12)||['scale','decimals','multiplier'].some(k=>own(f,k))||((field==='capex'||field==='capexPrev')&&f.val<0)){fail('unsupported-value-or-scaling');continue;}
// Same accession/period with differing metadata cannot silently select a competing row.
if(rows.some(g=>g!==f&&periodMatch(g)&&g.accn===s.accession)){fail('conflicting-accession-facts');continue;}
const candidates=rows.filter(g=>periodMatch(g));
if(candidates.some(g=>!day(g.filed)||g.filed<s.end||typeof g.accn!=='string'||!/^\d{10}-\d{2}-\d{6}$/.test(g.accn)||!['10-K','10-K/A','10-Q','10-Q/A'].includes(g.form))){fail('ambiguous-revision-history');continue;}
if(candidates.some(g=>g!==f&&g.filed<=today&&(g.filed>s.filed||g.filed===s.filed&&g.accn!==s.accession))){fail('superseded-or-ambiguous-revision');continue;}
const url='https://www.sec.gov/Archives/edgar/data/'+cik(raw.cik)+'/'+s.accession.replace(/-/g,'')+'/'+s.accession+'-index.html';
const period=instant?{kind,end:s.end}:{kind,start:s.start,end:s.end};
const filingAgeDays=Math.floor((Date.parse(today)-Date.parse(s.filed))/86400000),periodAgeDays=Math.floor((Date.parse(today)-Date.parse(s.end))/86400000);
if(filingAgeDays>185||(!/Prev$/.test(field)&&periodAgeDays>185))fail('stale-draft-fact');
out.observations[field]={value:f.val,unit:s.unit==='USD/shares'?'USD/share':s.unit,period,asOf:s.filed,basis:'reported',verification:'unverified',source:d.mode==='synthetic'?'SYNTHETIC: invented SEC-shaped fixture, not SEC evidence':'Imported unverified SEC-shaped data; '+url};
out.selectionEvidence.push({field,namespace:'us-gaap',tag:s.tag,unit:s.unit,accession:s.accession,form:s.form,filed:s.filed,period:{...period},cik:cik(raw.cik),entityName:raw.entityName,sourceURL:d.mode==='synthetic'?null:url,generatedExampleURL:d.mode==='synthetic'?url:null,filingAgeDays,periodAgeDays,identityReview:'caller-reviewed-only',verification:'unverified',revisionPolicy:'latest available exact tag/unit/period in supplied snapshot only'});
}
const count=Object.keys(out.observations).length;out.status=count?(out.issues.length?'partial':'ready'):'invalid';return out;
}
return Object.freeze({select});
});
