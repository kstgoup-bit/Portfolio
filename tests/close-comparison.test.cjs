'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../has/close-comparison.js');
const fixtures = require('../has/close-comparison-fixtures.js');
const run = p => engine.compareJSON(JSON.stringify(p));
test('declared same close supports distinct publication times, never verification', () => {
  const r = run(fixtures.create('agree'));
  assert.equal(r.status, 'agree'); assert.equal(r.spreadPct, 0.2); assert.ok(Object.isFrozen(r));
  for (const k of ['freshnessVerified', 'independenceVerified', 'usableForSignals', 'calendarVerified', 'latestSessionVerified']) assert.equal(r[k], false);
  assert.equal(r.verification, 'unverified'); assert.equal(r.liveConnection, 'unavailable');
});
test('conflict and shared provenance never imply independent sources', () => {
  assert.equal(run(fixtures.create('conflict')).status, 'conflict');
  assert.equal(run(fixtures.create('shared-origin')).originRelationship, 'shared');
});
test('session identity and evidence fail closed', () => {
  for (const [field, value] of [['ticker','OTHER'],['exchange','NXT'],['tradingDate','2026-11-10'],['completion','preliminary'],['session','extended'],['definition','last-trade'],['adjustment','split-adjusted'],['provenance','unknown'],['source','gas'],['publishedAt','2026-11-09T06:29:00.000Z'],['retrievedAt','2026-11-09T08:00:00.000Z'],['observedAt','2026-11-09T06:29:00.000Z']]) {
    const p = fixtures.create('agree'); p.kis[field] = value;
    assert.equal(run(p).status, 'incomparable', field);
  }
  for (const scenario of ['missing-source','pre-close','closed','adjusted']) assert.equal(run(fixtures.create(scenario)).status,'incomparable');
});
test('primitive bounded JSON, secret and duplicate keys, finite prices only', () => {
  for (const input of [null, {}, new String('{}'), '{', ' '.repeat(engine.MAX_BYTES + 1), '{"version":1,"version":1}', '{"v":1,"\\u0076":2}']) assert.equal(engine.compareJSON(input).status, 'invalid');
  for (const price of [0,-1,1e13,1e-10,'100']) { const p=fixtures.create('agree');p.kis.price=price;assert.equal(run(p).status,'invalid'); }
  const p=fixtures.create('agree');p.kis.appsecret='DO-NOT-ECHO'; const r=run(p);assert.equal(r.status,'invalid');assert.ok(!JSON.stringify(r).includes('DO-NOT-ECHO'));
  let touched=false; assert.equal(engine.compareJSON({toString(){touched=true;}}).status,'invalid');assert.equal(touched,false);
});
test('required source/calendar declarations and adjusted inputs withheld', () => {
  const base=fixtures.create('agree');
  for (const field of Object.keys(base.gas).filter(k => k !== 'publishedAt')) { const p=fixtures.create('agree');delete p.gas[field];assert.equal(run(p).status,'incomparable',field); }
  for (const field of Object.keys(base.calendar)) { const p=fixtures.create('agree');delete p.calendar[field];assert.equal(run(p).status,'incomparable',field); }
  for (const adjustment of ['split-adjusted','total-return']) { const p=fixtures.create('agree');p.gas.adjustment=p.kis.adjustment=adjustment;assert.equal(run(p).reason,'adjusted-close-withheld'); }
});
test('US DST and early close use venue time while preserving historical-only status', () => {
  function us(date, time, type='regular') {
    const p=fixtures.create('agree'); p.analysisAt=date+'T23:00:00.000Z';
    for(const q of [p.gas,p.kis]) Object.assign(q,{market:'US',exchange:'NYSE',currency:'USD',tradingDate:date,publishedAt:date+'T22:01:00.000Z',retrievedAt:date+'T22:02:00.000Z'});
    Object.assign(p.calendar,{market:'US',exchange:'NYSE',timeZone:'America/New_York',tradingDate:date,sessionType:type,scheduledCloseAt:date+'T'+time+':00.000Z'});return p;
  }
  assert.equal(run(us('2026-07-06','20:00')).status,'agree');
  assert.equal(run(us('2026-11-09','21:00')).status,'agree');
  assert.equal(run(us('2026-11-09','20:00')).reason,'calendar-schedule-mismatch');
  assert.equal(run(us('2026-11-27','18:00','early-close')).status,'agree');
  assert.equal(run(us('2026-11-27','18:00')).reason,'calendar-schedule-mismatch');
});

test('unknown publication is not fabricated; final close evidence remains mandatory', () => {
  const p=fixtures.create('agree');delete p.gas.publishedAt;delete p.kis.publishedAt;
  assert.equal(run(p).status,'agree');assert.equal(run(p).finalityVerified,false);
  p.kis.closeEvidence='unknown';assert.equal(run(p).reason,'missing-close-evidence');
});
