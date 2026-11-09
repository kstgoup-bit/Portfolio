/* Pure bounded offline evidence gate. No I/O, key handling, authentication or trading. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./close-comparison.js'), require('./close-evidence-sources.js'));
  else root.HASCloseEvidence = factory(root.HASCloseComparison, root.HASCloseEvidenceSources);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, sources) {
  'use strict';
  var MAX_BYTES = 16384;
  var REF = ['sourceId','revision','reviewId','provider','instrumentType','market','exchange','adjustment','validFrom','validThrough','correctionState','supersedes','semantics','finality'];
  var Q = ['source','ticker','market','exchange','currency','tradingDate','price','definition','session','completion','adjustment','upstreamOrigin','provenance','closeEvidence','publishedAt','retrievedAt','observedAt'];
  var C = ['market','exchange','tradingDate','sessionType','scheduledCloseAt','provenance','timeZone','reference'];
  function obj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function shape(x, fields) { return obj(x) && Object.keys(x).every(function(k) { return fields.indexOf(k) >= 0; }); }
  function scalarRecord(x, fields) { return shape(x, fields) && Object.keys(x).every(function(k) { return x[k] === null || typeof x[k] === 'number' && Number.isFinite(x[k]) || typeof x[k] === 'string' && x[k].length <= 128; }); }
  function date(x) { return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x+'T00:00:00.000Z')) && new Date(x+'T00:00:00.000Z').toISOString().slice(0,10) === x; }
  function result(reason, invalid) {
    return Object.freeze({status: invalid ? 'invalid' : 'incomparable', reason: reason, spreadPct: null, tolerancePct: 0.5,
      verification: 'unverified', independenceVerified: false, usableForSignals: false, freshnessVerified: false,
      liveConnection: 'unavailable', finalityVerified: false, calendarVerified: false, latestSessionVerified: false,
      comparisonBasis: 'evidence-withheld', originRelationship: 'unknown'});
  }
  function parse(text) {
    if (typeof text !== 'string' || text.length > MAX_BYTES) return null;
    var bytes=0, depth=0, stack=[], m, re=/"(?:\\.|[^"\\])*"|[{}\[\]]/g;
    for(var i=0;i<text.length;i++) { var c=text.charCodeAt(i); bytes+=c<128?1:c<2048?2:3; if(c>=0xd800&&c<=0xdbff&&i+1<text.length&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){bytes++;i++;} if(bytes>MAX_BYTES)return null; }
    try {
      while((m=re.exec(text))) {
        if(m[0]==='{' || m[0]==='[') { if(++depth>5)return null; stack.push(m[0]==='{'?Object.create(null):null); }
        else if(m[0]==='}' || m[0]===']') {depth--;stack.pop();}
        else if(stack.length && stack[stack.length-1] && /^\s*:/.test(text.slice(re.lastIndex))) {var key=JSON.parse(m[0]), seen=stack[stack.length-1];if(Object.prototype.hasOwnProperty.call(seen,key))return null;seen[key]=true;}
      }
      return JSON.parse(text);
    } catch (_) { return null; }
  }
  function refReason(r, provider, q) {
    if (!r || REF.some(function(k){return r[k] === undefined || (r[k] === null && k !== 'supersedes');})) return 'missing-evidence-reference';
    if (r.provider !== provider) return 'evidence-provider-mismatch';
    if (r.instrumentType !== 'listed-equity' || r.market !== q.market || r.exchange !== q.exchange || r.adjustment !== 'raw' || q.adjustment !== 'raw') return 'evidence-scope-mismatch';
    if (!date(r.validFrom) || !date(r.validThrough) || r.validFrom > r.validThrough || !date(q.tradingDate) || q.tradingDate < r.validFrom || q.tradingDate > r.validThrough) return 'evidence-coverage-gap';
    if (r.correctionState !== 'current' || r.supersedes !== null) return 'evidence-correction-unresolved';
    return null;
  }
  function compareJSON(text) {
    var p=parse(text);
    if(!shape(p,['version','mode','comparison','evidence']) || p.version!==1 || ['synthetic','normalized'].indexOf(p.mode)<0 ||
      !shape(p.comparison,['version','analysisAt','calendar','gas','kis']) || !shape(p.evidence,['calendar','gas','kis'])) return result('invalid-input',true);
    var c=p.comparison, e=p.evidence;
    if(c.gas===null || c.kis===null)return result('missing-source');
    if(c.calendar===null)return result('missing-calendar');
    if(c.version!==1 || typeof c.analysisAt!=='string' || c.analysisAt.length>32 ||
      !scalarRecord(c.calendar,C) || !scalarRecord(c.gas,Q) || !scalarRecord(c.kis,Q) ||
      !['calendar','gas','kis'].every(function(k){return e[k] === null || e[k] === undefined || scalarRecord(e[k],REF);})) return result('invalid-input',true);
    var synthetic=p.mode==='synthetic';
    if([c.calendar,c.gas,c.kis].some(function(q){return q.provenance !== (synthetic?'synthetic':'normalized-declaration');})) return result('evidence-provenance-mismatch');
    if(sources.knownClosed(c.calendar,'listed-equity')) return result('official-calendar-closed');
    for(var i=0;i<3;i++) {
      var k=['calendar','gas','kis'][i], q=k==='calendar'?c.gas:c[k], r=e[k], failure=refReason(r,k,q);
      if(failure)return result(failure);
      if(synthetic) {
        if(r.sourceId!=='synthetic-'+k+'-v1' || r.revision!=='simulation-v1' || r.reviewId!=='simulation-not-reviewed' || r.semantics!=='synthetic-official-regular-close' || r.finality!=='synthetic-final') return result('synthetic-reference-mismatch');
      }
    }
    if(!synthetic) {
      var r=e.calendar, registered=sources.closure;
      if(r.sourceId!==registered.sourceId)return result('calendar-source-unreviewed');
      if(r.revision!==registered.revision || r.reviewId!==registered.reviewId)return result('calendar-revision-unreviewed');
      if(r.validFrom!==registered.validFrom || r.validThrough!==registered.validThrough)return result('calendar-coverage-unregistered');
      // A negative-only disclosure notice cannot authorize any open session or provider finality.
      return result('calendar-positive-evidence-unavailable');
    }
    // Only fully synthetic research reaches price arithmetic. Real/imported inputs always hold.
    return core.compareJSON(JSON.stringify(c));
  }
  return Object.freeze({compareJSON:compareJSON,MAX_BYTES:MAX_BYTES});
});
