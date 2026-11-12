(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./snapshot-policy.js'));
  else root.HASReturnAssessment = factory(root.HASSnapshotPolicy);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P) {
  'use strict';
  // Read-only assessment. Snapshot validation and recording remain in snapshot-policy.js.
  var MAX = Number.MAX_SAFE_INTEGER, MAX_ROWS = 50000, MAX_NODES = 500000, MAX_BYTES = 20 * 1024 * 1024;
  var ACCOUNTS = ['dom', 'ov', 'pen', 'gen'], DAY = 86400000, ASSESSMENTS = new WeakSet();
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function plain(v) { if (!v || typeof v !== 'object' || Array.isArray(v)) return false; var p = Object.getPrototypeOf(v); return p === null || Object.getPrototypeOf(p) === null; }
  function time(v) { return Number.isSafeInteger(v) && v > 0 && v <= 8640000000000000; }
  function finite(v) { return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX; }
  function positive(v) { return finite(v) && v > 0; }
  function keyOK(k) { return k === 'all' || ACCOUNTS.indexOf(k) >= 0; }
  function idOK(v) { return typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(v); }
  function strings(a) { return Array.isArray(a) && a.length <= 100 && a.every(function (s) { return typeof s === 'string' && s.length <= 200; }); }
  function unique(a) { return Array.from(new Set(a)); }
  function fail(code) { return { ok: false, code: code }; }
  function bounded(value) {
    var nodes = 0, bytes = 0, stack = new Set();
    function visit(v, depth) {
      if (++nodes > MAX_NODES || depth > 30) throw Error('resource-limit');
      if (v === null || typeof v === 'boolean') return;
      if (typeof v === 'number') { if (!finite(v)) throw Error('invalid-number'); return; }
      if (typeof v === 'string') { bytes += v.length * 3; if (bytes > MAX_BYTES) throw Error('resource-limit'); return; }
      if ((!Array.isArray(v) && !plain(v)) || stack.has(v)) throw Error('invalid-object');
      var keys = Reflect.ownKeys(v);
      if (keys.length > MAX_ROWS + 1 || (Array.isArray(v) && (v.length > MAX_ROWS || keys.length !== v.length + 1))) throw Error('resource-limit');
      stack.add(v);
      keys.forEach(function (k) {
        if (Array.isArray(v) && k === 'length') return;
        var d = Object.getOwnPropertyDescriptor(v, k);
        if (typeof k !== 'string' || ['__proto__', 'constructor', 'prototype'].indexOf(k) >= 0 || !d || !own(d, 'value') || !d.enumerable || (Array.isArray(v) && !/^(0|[1-9]\d*)$/.test(k))) throw Error('invalid-property');
        bytes += k.length * 3; if (bytes > MAX_BYTES) throw Error('resource-limit');
        visit(d.value, depth + 1);
      });
      stack.delete(v);
    }
    visit(value, 0);
  }
  function allowed(o, fields) { return Object.keys(o).every(function (k) { return fields.indexOf(k) >= 0; }); }
  function iso(v) { return P && P.isoTime(v); }
  function dateBounds(row) {
    var d = row.effectiveDate, offset = row.utcOffsetMinutes;
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isInteger(offset) || Math.abs(offset) > 840) return null;
    var calendarStart = iso(d + 'T00:00:00Z');
    if (calendarStart === null || calendarStart === undefined) return null;
    // Adding DAY here advances the UTC calendar date, NOT a local-day duration.
    var calendarNext = calendarStart + DAY, hasEnd = own(row, 'dateEndTs'), hasOffset = own(row, 'endUtcOffsetMinutes');
    if (hasEnd !== hasOffset) return null;
    if (!hasEnd) {
      // Earlier typed rows did not retain the next-midnight boundary. Any allowed
      // local offset may apply across that date, so never infer a 24-hour day.
      var earliest = calendarStart - 840 * 60000, latest = calendarNext + 840 * 60000;
      return time(earliest) && time(latest) ? { start: earliest, end: latest, precision: 'conservative-offset-range' } : null;
    }
    var endOffset = row.endUtcOffsetMinutes, start = calendarStart + offset * 60000;
    if (!Number.isInteger(endOffset) || Math.abs(endOffset) > 840 || !time(start) || !time(row.dateEndTs) || row.dateEndTs !== calendarNext + endOffset * 60000 || row.dateEndTs <= start || row.dateEndTs - start > 52 * 3600000) return null;
    return { start: start, end: row.dateEndTs, precision: 'declared-local-midnights' };
  }
  function validateFlows(rows, key, flowAccounts) {
    key = key === undefined ? 'all' : key;
    try {
      bounded(rows);
      if (!keyOK(key) || !Array.isArray(rows)) return fail('invalid-flows');
      if (flowAccounts !== undefined) {
        bounded(flowAccounts);
        if (!Array.isArray(flowAccounts) || flowAccounts.length !== rows.length || flowAccounts.some(function (account) { return ACCOUNTS.indexOf(account) < 0 || (key !== 'all' && account !== key); })) return fail('invalid-flow-context');
      }
      var ids = new Set(), signatures = new Set(), out = [];
      for (var i = 0; i < rows.length; i++) {
        var d = rows[i];
        if (!plain(d) || !time(d.ts) || !finite(d.amount) || d.amount === 0) return fail('invalid-flow');
        var typed = own(d, 'activityVersion');
        if (typed && (ACCOUNTS.indexOf(d.account) < 0 || (key !== 'all' && d.account !== key) || (flowAccounts !== undefined && d.account !== flowAccounts[i]))) return fail('flow-account-mismatch');
        var account = flowAccounts !== undefined ? flowAccounts[i] : typed ? d.account : key, signed = d.amount, kind = 'legacy', ref = 'legacy:' + account + ':' + i + ':' + d.ts + ':' + d.amount, bounds = null;
        if (typed) {
          if (!allowed(d, ['activityVersion', 'id', 'account', 'kind', 'ts', 'amount', 'currency', 'recordedAt', 'timeCertainty', 'effectiveDate', 'utcOffsetMinutes', 'dateEndTs', 'endUtcOffsetMinutes']) || d.activityVersion !== 1 || !idOK(d.id) || ACCOUNTS.indexOf(d.account) < 0 ||
              ['external-in', 'external-out', 'internal-buy', 'internal-sell'].indexOf(d.kind) < 0 || !positive(d.amount) || d.currency !== 'KRW' || iso(d.recordedAt) === null || iso(d.recordedAt) < d.ts || ['instant', 'date-only'].indexOf(d.timeCertainty) < 0) return fail('invalid-flow');
          if (d.timeCertainty === 'date-only') {
            bounds = dateBounds(d);
            if (!bounds || d.ts < bounds.start || d.ts >= bounds.end) return fail('invalid-flow-date');
          } else if (own(d, 'effectiveDate') || own(d, 'utcOffsetMinutes') || own(d, 'dateEndTs') || own(d, 'endUtcOffsetMinutes')) return fail('invalid-flow-date');
          ref = d.id; kind = d.kind; signed = kind === 'external-out' ? -d.amount : kind === 'external-in' ? d.amount : 0;
        }
        // Ambiguous duplicate capital is held, never silently counted twice or deduplicated.
        var signature = account + ':' + d.ts + ':' + (kind.indexOf('internal-') === 0 ? kind + ':' + d.amount : 'external:' + signed);
        if (ids.has(ref) || signatures.has(signature)) return fail('duplicate-flow');
        ids.add(ref); signatures.add(signature);
        out.push({ id: ref, account: account, ts: d.ts, amount: d.amount, signedAmount: signed, kind: kind, legacy: !typed, timeCertainty: typed ? d.timeCertainty : 'legacy', dateBounds: bounds });
      }
      return { ok: true, flows: out };
    } catch (e) { return fail(e.message === 'resource-limit' ? 'resource-limit' : 'invalid-flows'); }
  }
  function componentId(c) { return c.account + ':' + (own(c, 'stockId') ? 'id:' + c.stockId : 'ticker:' + c.ticker); }
  function shape(c) { return c ? { ticker: c.ticker, quantity: c.quantity, currency: c.currency, unit: c.unit } : null; }
  function sameShape(a, b) { return a === null || b === null ? a === b : a.ticker === b.ticker && a.quantity === b.quantity && a.currency === b.currency && a.unit === b.unit; }
  function shapeOK(c, account) {
    return c === null || (plain(c) && allowed(c, ['ticker', 'quantity', 'currency', 'unit']) && typeof c.ticker === 'string' && c.ticker.trim() && c.ticker.length <= 100 && positive(c.quantity) && c.quantity <= 1e12 && c.currency === (account === 'ov' ? 'USD' : 'KRW') && c.unit === 'per-held-unit');
  }
  function validateEvidence(rows) {
    try {
      bounded(rows);
      if (!Array.isArray(rows)) return fail('invalid-evidence');
      var ids = new Set(), pairs = new Set();
      for (var i = 0; i < rows.length; i++) {
        var e = rows[i];
        if (!plain(e) || !allowed(e, ['version', 'id', 'account', 'kind', 'fromTs', 'toTs', 'effectiveTs', 'recordedAt', 'timeCertainty', 'source', 'changes', 'flowIds', 'externalAmount', 'cashIncluded']) ||
            e.version !== 1 || !idOK(e.id) || ids.has(e.id) || ACCOUNTS.indexOf(e.account) < 0 || ['internal-trade', 'external-flow', 'tracking-change', 'cost-correction', 'unclassified'].indexOf(e.kind) < 0 ||
            !time(e.fromTs) || !time(e.toTs) || e.fromTs >= e.toTs || !time(e.effectiveTs) || e.effectiveTs <= e.fromTs || e.effectiveTs > e.toTs || iso(e.recordedAt) === null || iso(e.recordedAt) < e.effectiveTs ||
            e.timeCertainty !== 'instant' || e.source !== 'user-entered' || !Array.isArray(e.changes) || e.changes.length > 10000 || !Array.isArray(e.flowIds) || e.flowIds.length > MAX_ROWS || !e.flowIds.every(idOK) || new Set(e.flowIds).size !== e.flowIds.length || !finite(e.externalAmount) || typeof e.cashIncluded !== 'boolean') return fail('invalid-evidence');
        if (e.kind !== 'external-flow' && (e.externalAmount !== 0 || e.flowIds.length)) return fail('invalid-evidence-flow');
        if (e.kind === 'external-flow' && !e.flowIds.length) return fail('invalid-evidence-flow');
        if (e.kind === 'cost-correction' && e.changes.length) return fail('invalid-evidence-cost');
        var changeIds = new Set();
        for (var j = 0; j < e.changes.length; j++) {
          var c = e.changes[j];
          if (!plain(c) || !allowed(c, ['componentId', 'before', 'after']) || typeof c.componentId !== 'string' || c.componentId.length > 160 || c.componentId.indexOf(e.account + ':') !== 0 || changeIds.has(c.componentId) || !shapeOK(c.before, e.account) || !shapeOK(c.after, e.account) || sameShape(c.before, c.after)) return fail('invalid-evidence-change');
          changeIds.add(c.componentId);
        }
        var pair = e.account + ':' + e.fromTs + ':' + e.toTs;
        if (pairs.has(pair)) return fail('duplicate-evidence-transition');
        ids.add(e.id); pairs.add(pair);
      }
      return { ok: true, evidence: rows };
    } catch (e) { return fail(e.message === 'resource-limit' ? 'resource-limit' : 'invalid-evidence'); }
  }
  function metric(value, reasons, warnings) {
    reasons = unique(reasons || []); warnings = unique(warnings || []);
    var computable = finite(value);
    return { status: reasons.length || !computable ? 'hold' : warnings.length ? 'unverified' : 'available', computable: computable, valuePct: computable ? value : null, reasons: reasons, warnings: warnings };
  }
  function modifiedDietz(input) {
    try {
      bounded(input);
      if (!plain(input) || !time(input.startTs) || !time(input.endTs) || input.startTs >= input.endTs || !positive(input.startVal) || !finite(input.endVal) || input.endVal < 0) return metric(null, ['invalid-interval']);
      if (!own(input, 'flows')) return metric(null, ['missing-flow-history']);
      var checked = validateFlows(input.flows, input.key, input.flowAccounts);
      if (!checked.ok) return metric(null, [checked.code]);
      var net = 0, weighted = 0, warnings = ['external-flow-completeness-unverified'], uncertain = false;
      checked.flows.forEach(function (f) {
        if (!f.signedAmount) return;
        if (f.dateBounds && f.dateBounds.end > input.startTs && f.dateBounds.start <= input.endTs) uncertain = true;
        if (f.ts <= input.startTs || f.ts > input.endTs) return;
        if (f.legacy) warnings.push('legacy-flow-classification-unverified', 'legacy-flow-time-unverified');
        else warnings.push('user-entered-flow-unverified');
        net += f.signedAmount;
        weighted += f.signedAmount * ((input.endTs - f.ts) / (input.endTs - input.startTs));
        if (!finite(net) || !finite(weighted)) throw Error('flow-overflow');
      });
      if (uncertain) return metric(null, ['flow-time-uncertain'], warnings);
      var difference = input.endVal - input.startVal, numerator = difference - net, denominator = input.startVal + weighted;
      if (!finite(difference) || !finite(numerator) || !finite(denominator)) return metric(null, ['calculation-overflow'], warnings);
      if (denominator <= 0) return metric(null, ['nonpositive-dietz-capital'], warnings);
      var value = numerator / denominator * 100;
      if (!finite(value)) return metric(null, ['calculation-overflow'], warnings);
      var result = metric(value, [], warnings); result.netFlow = net; result.weightedFlow = weighted; result.denominator = denominator;
      return result;
    } catch (e) { return metric(null, [e.message === 'resource-limit' ? 'resource-limit' : e.message === 'flow-overflow' ? 'calculation-overflow' : 'invalid-flows']); }
  }
  function points(records) {
    var out = [];
    records.forEach(function (r) { if (r.dailyHistory) r.dailyHistory.entries.forEach(function (e) { out.push(e.point); }); else out.push(r); });
    return out.sort(function (a, b) { return a.ts - b.ts; });
  }
  function changes(previous, next) {
    var before = new Map(previous.components.map(function (c) { return [componentId(c), c]; })), after = new Map(next.components.map(function (c) { return [componentId(c), c]; }));
    var result = [];
    unique(Array.from(before.keys()).concat(Array.from(after.keys()))).sort().forEach(function (id) {
      var b = before.get(id), a = after.get(id);
      if (!sameShape(shape(b), shape(a))) result.push({ componentId: id, account: (a || b).account, before: shape(b), after: shape(a) });
    });
    return result;
  }
  function evidenceMatches(e, actual, linked) {
    if (!e.cashIncluded || (e.kind !== 'internal-trade' && e.kind !== 'external-flow') || e.changes.length !== actual.length) return false;
    var declared = new Map(e.changes.map(function (c) { return [c.componentId, c]; }));
    if (!actual.every(function (c) { var x = declared.get(c.componentId); return x && sameShape(c.before, x.before) && sameShape(c.after, x.after); })) return false;
    if (e.kind === 'external-flow') {
      var net = 0;
      for (var i = 0; i < e.flowIds.length; i++) {
        var f = linked.get(e.flowIds[i]);
        if (!f || f.legacy || f.account !== e.account || f.timeCertainty !== 'instant' || !f.signedAmount || f.ts !== e.effectiveTs || f.ts <= e.fromTs || f.ts > e.toTs) return false;
        net += f.signedAmount; if (!finite(net)) return false;
      }
      if (net !== e.externalAmount) return false;
    }
    return true;
  }
  function scopeAssessment(selected, fromTs, toTs, evidence, flows) {
    var reasons = [], warnings = [], events = [], evidenceCheck = validateEvidence(evidence), flowCheck = validateFlows(flows.rows, flows.key, flows.accounts);
    if (!evidenceCheck.ok) reasons.push(evidenceCheck.code);
    var eventsByPair = new Map(), flowsById = flowCheck.ok ? new Map(flowCheck.flows.map(function (f) { return [f.id, f]; })) : new Map();
    if (evidenceCheck.ok) evidence.forEach(function (e) { eventsByPair.set(e.account + ':' + e.fromTs + ':' + e.toTs, e); });
    var previous = selected[0];
    for (var i = 1; i < selected.length; i++) {
      var next = selected[i];
      if (previous.schemaVersion !== 1 || next.schemaVersion !== 1) {
        warnings.push('legacy-scope-unverified'); previous = next; continue;
      }
      var actual = changes(previous, next);
      var accounts = unique(actual.map(function (c) { return c.account; }));
      accounts.forEach(function (account) {
        var change = actual.filter(function (c) { return c.account === account; }), event = eventsByPair.get(account + ':' + previous.ts + ':' + next.ts);
        var explained = !!(event && flowCheck.ok && evidenceMatches(event, change, flowsById));
        events.push({ account: account, fromTs: previous.ts, toTs: next.ts, explained: explained, evidenceId: event ? event.id : null });
        if (!explained) {
          // A share-count change is not evidence of an external cash flow. Cash
          // balances may be updated days later: never infer trades or capital
          // from quantity/DEP_ offsets, and never certify this estimate.
          warnings.push('unexplained-holdings-change', 'cash-balance-timing-unverified');
          if (event) reasons.push(event.kind === 'tracking-change' ? 'tracking-scope-change' : 'transition-evidence-mismatch');
        }
        else warnings.push('user-declared-transition-unverified', 'cash-completeness-user-declared');
      });
      if (!actual.length) {
        var old = new Map(previous.components.map(function (c) { return [componentId(c), c]; }));
        if (next.components.some(function (c) { var b = old.get(componentId(c)); return own(b, 'avgPrice') && own(c, 'avgPrice') && b.avgPrice !== c.avgPrice; })) warnings.push('cost-basis-change-only');
        else if (previous.cost !== next.cost && next.components.some(function (c) { return !own(c, 'avgPrice') || !own(old.get(componentId(c)), 'avgPrice'); })) warnings.push('cost-basis-unverified');
      }
      previous = next;
    }
    // A persistent marker belongs to its original transition, not every later interval.
    var transitionPairs = new Set(events.map(function (e) { return e.fromTs + ':' + e.toTs; }));
    selected.forEach(function (s) {
      var mark = s.scopeChange;
      if (!mark) return;
      var at = iso(mark.changedAt);
      if (at <= fromTs || at > toTs) return;
      if (mark.types.indexOf('legacy-unknown') >= 0) warnings.push('legacy-scope-unverified');
      if (mark.types.indexOf('cost-basis') >= 0 || mark.types.indexOf('cost-basis-unknown') >= 0) warnings.push('cost-basis-change-only');
      if (mark.types.indexOf('holdings') >= 0 && !transitionPairs.has(mark.previousTs + ':' + at)) warnings.push('unexplained-scope-marker', 'cash-balance-timing-unverified');
    });
    return { status: reasons.length ? 'hold' : warnings.length ? 'unverified' : 'unchanged', reasons: unique(reasons), warnings: unique(warnings), transitions: events };
  }
  function sourceRegression(history, next) {
    if (next.schemaVersion !== 1) return false;
    var latest = new Map(), fx = null;
    history.forEach(function (s) {
      if (s.schemaVersion !== 1) return;
      s.components.forEach(function (c) { if (c.priceAsOf !== null) { var k = componentId(c) + ':' + c.ticker, t = iso(c.priceAsOf); if (!latest.has(k) || latest.get(k) < t) latest.set(k, t); } });
      if (s.fx && s.fx.priceAsOf !== null) fx = Math.max(fx || 0, iso(s.fx.priceAsOf));
    });
    return next.components.some(function (c) { var t = latest.get(componentId(c) + ':' + c.ticker); return t !== undefined && (c.priceAsOf === null || iso(c.priceAsOf) < t); }) || (fx !== null && next.fx && (next.fx.priceAsOf === null || iso(next.fx.priceAsOf) < fx));
  }
  function benchmarkAssessment(b, interval) {
    try {
      if (b === undefined || b === null) return metric(null, ['benchmark-unavailable']);
      bounded(b);
      if (!plain(b) || !allowed(b, ['valuePct', 'fromTs', 'toTs', 'currency', 'status', 'reasons', 'warnings']) || ['available', 'unverified', 'hold'].indexOf(b.status) < 0 || ['KRW', 'USD', 'mixed'].indexOf(b.currency) < 0 || !time(b.fromTs) || !time(b.toTs) || (own(b, 'reasons') && !strings(b.reasons)) || (own(b, 'warnings') && !strings(b.warnings))) return metric(null, ['invalid-benchmark']);
      var reasons = (b.reasons || []).slice(), warnings = (b.warnings || []).concat('benchmark-input-unverified');
      if (b.fromTs !== interval.fromTs || b.toTs !== interval.toTs) reasons.push('benchmark-interval-mismatch');
      if (b.status === 'hold') reasons.push('benchmark-unavailable');
      if (!finite(b.valuePct)) reasons.push('invalid-benchmark-value');
      var result = metric(b.valuePct, reasons, warnings); result.currency = b.currency; return result;
    } catch (e) { return metric(null, ['invalid-benchmark']); }
  }
  function issued(result) {
    function freeze(value) {
      if (value && typeof value === 'object') { Object.keys(value).forEach(function (k) { freeze(value[k]); }); Object.freeze(value); }
    }
    freeze(result); ASSESSMENTS.add(result); return result;
  }
  function unavailable(reason) {
    return issued({ signalHold: true, quality: 'unconfirmed', interval: null, raw: metric(null, [reason]), dietz: metric(null, [reason]), benchmark: metric(null, [reason]), alpha: metric(null, [reason]), scope: { status: 'hold', reasons: [reason], warnings: [], transitions: [] }, warnings: [] });
  }
  function assess(input) {
    try {
      if (!plain(input) || Reflect.ownKeys(input).some(function (k) { var d = Object.getOwnPropertyDescriptor(input, k); return typeof k !== 'string' || !d || !own(d, 'value'); })) return unavailable('invalid-input');
      var key = input.key === undefined ? 'all' : input.key;
      if (!P || !keyOK(key) || !time(input.targetTs) || !time(input.endTs) || input.targetTs > input.endTs) return unavailable('invalid-interval');
      if (P && P.passMemo) P.passMemo(input.records, 'return-assessment-bounded', function () { bounded(input.records); return true; }); else bounded(input.records);
      if (!Array.isArray(input.records) || input.records.some(function (s) { return !P.validateRecord(s).ok; }) || new Set(input.records.map(function (s) { return s.ts; })).size !== input.records.length) return unavailable('invalid-history');
      var records = input.records.slice().sort(function (a, b) { return a.ts - b.ts; }), observations = points(records), end = null;
      var isCurrent = own(input, 'currentCandidate');
      if (isCurrent) {
        if (input.currentCandidate === null || input.currentCandidate === undefined) return unavailable('current-incomplete');
        if (!P.validateRecord(input.currentCandidate).ok || input.currentCandidate.schemaVersion !== 1 || own(input.currentCandidate, 'dailyHistory') || own(input.currentCandidate, 'scopeChange') || own(input.currentCandidate, 'comparisonHold')) return unavailable('invalid-current');
        end = input.currentCandidate;
        if (end.ts !== input.endTs) return unavailable('current-time-mismatch');
      } else observations.forEach(function (s) { if (s.ts <= input.endTs) end = s; });
      if (!end) return unavailable('insufficient-history');
      var start = null;
      observations.forEach(function (s) { if (s.ts <= input.targetTs) start = s; });
      if (!start || start.ts >= end.ts) return unavailable('insufficient-history');
      var allPoints = observations.filter(function (s) { return s.ts <= end.ts; });
      if (isCurrent && sourceRegression(allPoints, end)) return unavailable('current-price-time-regression');
      var selected = [start].concat(allPoints.filter(function (s) { return s.ts > start.ts && (isCurrent ? s.ts < end.ts : s.ts <= end.ts); }));
      if (isCurrent) {
        var atEnd = allPoints.filter(function (s) { return s.ts === end.ts; });
        if (atEnd.length) atEnd = [atEnd[atEnd.length - 1]];
        // A same-time changed saved endpoint is ambiguous rather than an elapsed interval.
        if (atEnd.length && (atEnd[0].val !== end.val || (atEnd[0].schemaVersion === 1 && changes(atEnd[0], end).length))) return unavailable('ambiguous-current-endpoint');
        selected.push(end);
      }
      if (key !== 'all' && selected.some(function (s) { return s.schemaVersion === 1 && s.components.some(function (c) { return c.account !== key; }); })) return unavailable('snapshot-account-mismatch');
      var interval = { requestedFromTs: input.targetTs, requestedToTs: input.endTs, fromTs: start.ts, toTs: end.ts, actualDays: (end.ts - start.ts) / DAY, startEarlierThanRequested: start.ts < input.targetTs, endEarlierThanRequested: end.ts < input.endTs, startValue: start.val, endValue: end.val, currency: 'KRW', endpoint: isCurrent ? 'current-candidate' : 'stored' };
      var warnings = ['stored-value-change-not-investment-return', 'recorded-valuations-unconfirmed'];
      if (selected.some(function (s) { return s.schemaVersion !== 1; })) warnings.push('legacy-provenance-unverified');
      if (selected.some(function (s) { return !own(s, 'cost'); })) warnings.push('historical-cost-unavailable');
      if (selected.some(function (s) { return s.schemaVersion === 1 && s.components.some(function (c) { return c.currency === 'USD'; }); })) warnings.push('portfolio-krw-includes-fx-change');
      var flows = own(input, 'flows') ? input.flows : [], evidence = own(input, 'evidence') ? input.evidence : [];
      var scope = scopeAssessment(selected, start.ts, end.ts, evidence, { rows: flows, key: key, accounts: input.flowAccounts });
      var rawValue = start.val > 0 ? (end.val - start.val) / start.val * 100 : null;
      var raw = metric(rawValue, start.val > 0 ? finite(rawValue) ? [] : ['calculation-overflow'] : ['nonpositive-start-value'], warnings.concat(scope.warnings, scope.reasons.length ? ['scope-uncertain-value-change-only'] : []));
      var dietzInput = { key: key, startTs: start.ts, endTs: end.ts, startVal: start.val, endVal: end.val };
      if (own(input, 'flows')) dietzInput.flows = flows;
      if (own(input, 'flowAccounts')) dietzInput.flowAccounts = input.flowAccounts;
      var dietz = modifiedDietz(dietzInput);
      dietz = Object.assign({}, dietz, metric(dietz.valuePct, dietz.reasons.concat(scope.reasons), dietz.warnings.concat(warnings.filter(function (w) { return w !== 'stored-value-change-not-investment-return'; }), scope.warnings, ['tracked-assets-only-cash-coverage-unverified'])));
      return applyBenchmark(issued({ signalHold: true, quality: 'unconfirmed', interval: interval, raw: raw, dietz: dietz, scope: scope, warnings: unique(warnings) }), input.benchmark);
    } catch (e) { return unavailable(e.message === 'resource-limit' ? 'resource-limit' : 'invalid-history'); }
  }
  function applyBenchmark(assessment, supplied) {
    // Reuse the already assessed portfolio interval; no history rescan or mutation.
    try {
      if (!ASSESSMENTS.has(assessment)) return unavailable('invalid-assessment');
      bounded(assessment);
      if (!plain(assessment) || !assessment.interval) return assessment && assessment.signalHold === true ? assessment : unavailable('invalid-assessment');
      var interval = assessment.interval, d = assessment.dietz;
      if (!time(interval.fromTs) || !time(interval.toTs) || interval.fromTs >= interval.toTs || interval.currency !== 'KRW' || !plain(d) || !strings(d.reasons) || !strings(d.warnings) || typeof d.computable !== 'boolean' || (d.computable && !finite(d.valuePct))) return unavailable('invalid-assessment');
      var b = benchmarkAssessment(supplied, interval), reasons = d.reasons.concat(b.reasons), warnings = d.warnings.concat(b.warnings);
      if (d.status === 'hold' && !d.reasons.length) reasons.push('portfolio-return-unavailable');
      if (b.currency && b.currency !== 'KRW') reasons.push('benchmark-currency-mismatch');
      var alpha = metric(d.computable && b.computable ? d.valuePct - b.valuePct : null, reasons, warnings);
      return issued(Object.assign({}, assessment, { signalHold: true, quality: 'unconfirmed', benchmark: b, alpha: alpha }));
    } catch (e) { return unavailable('invalid-assessment'); }
  }
  return { assess: assess, assessReturnInterval: assess, applyBenchmark: applyBenchmark, modifiedDietz: modifiedDietz, validateFlows: validateFlows, validateEvidence: validateEvidence, MAX_ROWS: MAX_ROWS, MAX_TOTAL: MAX };
});
