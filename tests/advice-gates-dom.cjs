'use strict';
// Synthetic DOM behavior only; not layout, mobile, exchange, or live API validation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.join(__dirname,'../has');
const html = fs.readFileSync(path.join(root,'advisor-app.html'),'utf8');
const dom = new JSDOM(html,{runScripts:'outside-only',url:'https://offline.invalid/has/advisor-app.html'});
const w = dom.window, d = w.document;
const get = id => d.querySelector('[data-testid="'+id+'"]');
const click = id => { assert.ok(get(id),id); get(id).click(); };
(async () => {
// jsdom has no scrolling/layout implementation; only DOM state is asserted.
w.scrollTo = () => {};
const settle = () => new Promise(resolve => w.setTimeout(resolve,30));
w.localStorage.setItem('record-sentinel','unchanged');
w.fetch = () => { throw new Error('Network must not be called'); };
for(const m of html.matchAll(/<script src="([^"]+)"/g)) w.eval(fs.readFileSync(path.join(root,m[1]),'utf8'));
assert.match(get('sec-summary').textContent,/비중 축소 검토 2/);
assert.match(get('sec-summary').textContent,/매수 검토 1/);
assert.equal(w.__advResult.errors.length,0);
for(let i=0;i<2;i++) {
  click('btn-fail'); assert.match(get('sec-summary').textContent,/판단 보류 4/);
  assert.equal(w.__advResult.advices.some(a=>a.opinion==='매수 검토'),false);
  click('btn-retry'); assert.match(get('sec-summary').textContent,/매수 검토 1/);
}
click('open-SYN-KR2'); await settle();
assert.match(get('detail-card').textContent,/확인된 사실/);
assert.match(get('detail-card').textContent,/반대 근거/);
click('btn-back'); await settle();
assert.equal(get('view-detail').hidden,true);
click('tab-alerts'); await settle();
const count=d.querySelectorAll('[data-testid="alert"]').length;
click('btn-again'); assert.equal(d.querySelectorAll('[data-testid="alert"]').length,count);
assert.match(get('alert-log').textContent,/억제 [1-9]/);
assert.equal(w.localStorage.getItem('record-sentinel'),'unchanged');
assert.equal(w.localStorage.length,1); assert.equal(w.sessionStorage.length,0);
console.log('PASS synthetic adviser DOM: initial counts, repeated failure/retry, detail/hash dismissal, duplicate alerts, no record writes. No browser-layout claim.');
w.close();
})().catch(error => { w.close(); console.error(error); process.exitCode=1; });
