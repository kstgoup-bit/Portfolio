/* Read-only price references. Explicit refresh only; no orders, account writes or external AI. */
(function (W) {
  'use strict';
  var mounts = [], service = null, endpoint = '', snapshot = null, busy = false, error = '', sequence = 0, callbackId = 0;
  function node(tag, text) { var e = document.createElement(tag); if (text != null) e.textContent = text; return e; }
  function validEndpoint(value) {
    var u = new URL(value);
    if (u.protocol !== 'https:' || u.hostname !== 'script.google.com' || u.port || u.username || u.password || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname)) throw Error('설정된 GAS 주소 확인 필요');
    return u;
  }
  function transport(value) {
    return new Promise(function (resolve, reject) {
      var u; try { u = validEndpoint(value); } catch (e) { reject(e); return; }
      var cb = 'hasPriceReference_' + (++callbackId), script = document.createElement('script'), settled = false, timer;
      function finish(err, data) { if (settled) return; settled = true; clearTimeout(timer); script.onerror = null; script.remove(); delete W[cb]; if (err) reject(err); else resolve(data); }
      W[cb] = function (data) { finish(null, data); };
      u.searchParams.set('callback', cb); script.referrerPolicy = 'no-referrer'; script.src = u.href;
      script.onerror = function () { finish(Error('GAS 응답 실패')); };
      timer = setTimeout(function () { finish(Error('GAS 응답 시간 초과')); }, 10000);
      try { document.head.appendChild(script); } catch (e) { finish(e); }
    });
  }
  function inputs() {
    var targets = [], weights = {}, seen = {}, source = {}, names = {};
    [['gen', W.genStocks], ['dom', W.domStocks], ['ov', W.ovStocks], ['pen', W.penStocks]].forEach(function (pair) {
      var list = Array.isArray(pair[1]) ? pair[1] : []; source['v5_' + pair[0]] = JSON.stringify(list);
      list.forEach(function (s) {
        if (!s || typeof s.ticker !== 'string' || !Number.isFinite(s.quantity) || s.quantity <= 0 || /^DEP_/.test(s.ticker)) return;
        var market = pair[0] === 'ov' ? 'US' : 'KR', key = market + ':' + s.ticker;
        if (!seen[key]) { targets.push({ ticker: s.ticker, market: market }); seen[key] = true; names[key] = typeof s.name === 'string' ? s.name : s.ticker; }
      });
    });
    var fx = document.getElementById('usdKrw'); source.v5_fx = fx ? fx.value : null;
    try { source.v5_cma_amount = W.localStorage.getItem('v5_cma_amount'); } catch (e) {}
    if (W.HASPortfolioReader) { try { var p = W.HASPortfolioReader.read(source, { basis: 'real' }); if (p.complete) p.holdings.forEach(function (h) { var key = h.market + ':' + h.ticker; weights[key] = (weights[key] || 0) + h.weightPct; }); } catch (e) {} }
    var held = targets.slice();
    [{ticker:'QQQ',market:'US'},{ticker:'SPY',market:'US'},{ticker:'069500',market:'KR'}].forEach(function (t) { var key=t.market+':'+t.ticker; if(!seen[key]) {targets.push(t); seen[key]=true;} });
    return { targets: targets, held: held, names: names, weights: weights, signature: JSON.stringify(targets) };
  }
  function pct(x) { return Number.isFinite(x) ? (x > 0 ? '+' : '') + x.toFixed(1) + '%' : '자료 부족'; }
  function refresh() {
    if (busy) return;
    var input = inputs(), value = typeof W.gasUrl === 'string' ? W.gasUrl : '';
    try {
      validEndpoint(value);
      if (!W.HASLivePriceReference) throw Error('가격 근거 모듈을 불러오지 못했습니다');
      if (!input.held.length) throw Error('보유종목이 없습니다');
      if (!service || endpoint !== value) { service = W.HASLivePriceReference.createService({endpoint:value,transport:transport,now:function(){return Date.now();}}); endpoint=value; snapshot=null; }
    } catch (e) { error=e.message; renderAll(); return; }
    busy=true; error=''; var run=++sequence; renderAll();
    service.load(input.targets).then(function(result) {
      if(run!==sequence)return;
      if(inputs().signature!==input.signature || W.gasUrl!==value) {snapshot=null;error='보유종목 또는 GAS 설정이 변경되었습니다. 다시 확인해 주세요.';return;}
      snapshot=result; if(!result.ok) error=result.error==='unsupported-symbols'?'일부 항목은 시세 조회 미지원 · 지원 종목 결과는 아래에 표시합니다.':(result.error ? '조회 요청 또는 설정을 확인해 주세요 · ' + result.error : '일부 종목 조회 실패 · 지난 성공값 또는 자료 부족 상태를 표시합니다.');
    }).catch(function(){ if(run===sequence) error='조회 실패 · 마지막 성공값이 있으면 기준일과 함께 표시합니다.'; }).finally(function(){if(run===sequence){busy=false;renderAll();}});
  }
  function render(entry) {
    var root=entry.container; root.replaceChildren(); root.style.overflowWrap='anywhere'; root.dataset.testid='live-price-'+entry.kind;
    root.appendChild(node('h3',entry.kind==='fear'?'곡소리 가격 근거':entry.kind==='euphoria'?'환호성 가격 근거':'시세 참고 근거'));
    root.appendChild(node('p','가격 위치 1차 선별 · 단일 출처·조정 미검증 참고값이며 매수·매도 판단은 보류합니다.'));
    var button=node('button',busy?'조회 중…':'가격 근거 새로고침');button.type='button';button.disabled=busy;button.style.minHeight='44px';button.addEventListener('click',refresh);root.appendChild(button);
    var status=node('p',error || (snapshot?'마지막 조회 결과 · 아래 기준일 확인':'설정된 GAS에서 보유종목·지수 가격 이력을 조회합니다.'));status.setAttribute('role','status');root.appendChild(status);
    var info=inputs();
    if(!info.held.length){root.appendChild(node('p','보유종목 없음'));return;}
    info.held.forEach(function(t){
      var key=t.market+':'+t.ticker, card=node('article'), data=findRecord(snapshot,t), benchmark=findRecord(snapshot,{ticker:t.market==='KR'?'069500':'QQQ',market:t.market}), r=null;
      if(data&&W.HASLivePriceReference) { try {r=W.HASLivePriceReference.analyze(data.record || data,{ticker:t.ticker,market:t.market,now:Date.now(),benchmark:benchmark && {record:benchmark.record,ticker:benchmark.ticker,market:benchmark.market}});} catch(e){} }
      card.appendChild(node('h4',(info.names[key]||t.ticker)+' ('+t.ticker+')'));
      if(data&&data.status==='unsupported'){card.appendChild(node('p','시세 조회 미지원 항목 · 다른 지원 종목은 계속 조회합니다.'));root.appendChild(card);return;}
      if(!r||!r.ok){card.appendChild(node('p','가격 근거 없음 · 판단 보류'));root.appendChild(card);return;}
      var evidence=node('details');evidence.appendChild(node('summary','기간 수익률·계산 근거'));
      evidence.appendChild(node('p','고점 실제 시각 미확인 · 공급자 최근 거래시각 '+(r.high52MetadataAsOf||'미확인')+' · 직전 관측가격과의 참고 비교')); 
      evidence.appendChild(node('p','기준일 '+r.asOf+' · '+r.source+' · '+(r.currency|| (t.market==='KR'?'KRW':'USD'))));
      if(data.status==='stale' || snapshot.stale || data.error || (data.receiptDay && data.receiptDay !== new Date().toISOString().slice(0,10))) card.appendChild(node('p','지난 성공 자료 · 최신 조회 실패 또는 갱신 필요'));
      card.appendChild(node('p','52주 고점 대비 '+pct(r.drawdownPct)+' · '+r.asOf));
      [1,3,6].forEach(function(month){var ret=r.returns&&r.returns[month];evidence.appendChild(node('p',month+'개월 '+pct(ret&&ret.value)+(ret&&ret.startDate?' · '+ret.startDate+' ~ '+ret.endDate:'')+(ret&&Number.isFinite(ret.excessPct)?' · '+(t.market==='KR'?'069500':'QQQ')+' 대비 '+ret.excessPct.toFixed(1)+'%p':' · 지수 비교 보류')));});
      if(entry.kind==='euphoria') evidence.appendChild(node('p','보유 비중 '+pct(info.weights[key])+' · 앱 입력 평가액 기준, 확신 종목 지정과 한도 적용은 미연결'));
      card.appendChild(evidence);root.appendChild(card);
    });
    var detail=node('details');detail.appendChild(node('summary','자료 한계'));detail.appendChild(node('p','당일 막대는 확정 종가로 쓰지 않습니다. 배당·분할 조정 및 기업가치가 검증되지 않아 가격 상승·하락만으로 매매를 권하지 않습니다. 조회 자료는 이 화면 세션에서만 공유하며 앱 재실행 후에는 다시 조회합니다.'));root.appendChild(detail);
  }
  function findRecord(s,t) { if(!s)return null;var rows=s.items||[];if(Array.isArray(rows))return rows.find(function(r){return r.ticker===t.ticker&&r.market===t.market;})||null;return rows[t.market+':'+t.ticker]||rows[t.ticker]||null; }
  function renderAll(){mounts=mounts.filter(function(e){return e.container.isConnected;});mounts.forEach(render);}
  function mount(container,kind){if(!container)return;mounts=mounts.filter(function(e){return e.container!==container&&e.container.isConnected;});var entry={container:container,kind:kind};mounts.push(entry);render(entry);}
  W.HASLivePricePanel=Object.freeze({mount:mount});
})(window);
