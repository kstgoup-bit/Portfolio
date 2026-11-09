/* Standalone, in-memory reader. No networking, persistence, orders, or portfolio access. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let sampleText = null;
  const text = value => value == null ? '자료 없음' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  function el(tag, value, cls) { const n = document.createElement(tag); if (value !== undefined) n.textContent = text(value); if (cls) n.className = cls; return n; }
  function status(message) { $('status').textContent = message; }
  function clear() { ['quote-body', 'chart-body', 'signal-body', 'issue-body'].forEach(id => $(id).replaceChildren(el('p', '분석 대기 · 표시할 결과 없음', 'empty'))); }
  function list(parent, values) { if (!values || !values.length) return; const ul = el('ul'); values.forEach(v => ul.append(el('li', v))); parent.append(ul); }
  function detail(parent, title, data) { const d = el('details'); d.append(el('summary', title), el('pre', data)); parent.append(d); }
  function svgNode(tag, attrs, value) { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs || {}).forEach(([k,v]) => n.setAttribute(k, String(v))); if(value !== undefined) n.textContent = text(value); return n; }
  function chart(data, instrument) {
    const body = $('chart-body'); body.replaceChildren(el('p', '차트 종목: ' + text(instrument), 'result-meta'), el('p', '차트 상태: ' + text(data.status)));
    list(body, data.issues); list(body, data.warnings);
    const metadata = Object.fromEntries(Object.entries(data).filter(([key]) => !['points','metrics','issues','warnings'].includes(key)));
    detail(body, '차트 출처·검증 정보 (입력 기준)', metadata);
    const points = Array.isArray(data.points) ? data.points : [];
    const finite = v => typeof v === 'number' && Number.isFinite(v);
    const values = points.flatMap(p => ['close','sma20','sma50'].map(k => p && p[k])).filter(finite);
    if (!values.length) { body.append(el('p', '유효한 가격 관측값이 없어 차트를 그리지 않습니다.', 'empty')); return; }
    const low = Math.min(...values), high = Math.max(...values), span = high - low || Math.max(Math.abs(low) * .02, 1);
    const x = i => 64 + (points.length > 1 ? i / (points.length - 1) * 604 : 302), y = v => 204 - (v-low) / span * 158;
    const fig = el('figure'), svg = svgNode('svg', {viewBox:'0 0 720 250', role:'img', 'aria-labelledby':'chart-title chart-desc'});
    svg.append(svgNode('title', {id:'chart-title'}, '입력 종가와 이동평균'), svgNode('desc', {id:'chart-desc'}, '종목 ' + text(instrument) + '. ' + points.length + '개 관측. 종가 실선, 20개 평균 긴 점선, 50개 평균 짧은 점선. 가격 범위 ' + low + '부터 ' + high));
    svg.append(svgNode('text',{x:2,y:46},high.toLocaleString('ko-KR',{maximumFractionDigits:2})), svgNode('text',{x:2,y:204},low.toLocaleString('ko-KR',{maximumFractionDigits:2})));
    ['close','sma20','sma50'].forEach(key => {
      let segments = [], current = [];
      points.forEach((p,i) => { if (p && finite(p[key])) current.push([x(i),y(p[key])]); else if(current.length) { segments.push(current); current=[]; } });
      if(current.length) segments.push(current);
      segments.forEach(segment => { svg.append(svgNode('polyline',{points:segment.map(p=>p.join(',')).join(' '),class:'chart-line '+key})); if(segment.length === 1) svg.append(svgNode('circle',{cx:segment[0][0],cy:segment[0][1],r:3,class:'chart-line '+key})); });
    });
    svg.append(svgNode('text',{x:64,y:238},points[0] && points[0].date),svgNode('text',{x:668,y:238,'text-anchor':'end'},points[points.length-1] && points[points.length-1].date));
    fig.append(svg,el('figcaption','자료 내 최솟값·최댓값으로 축을 정합니다. 거래량은 아래 원자료에서 확인할 수 있습니다.')); body.append(fig);
    const legend=el('div',undefined,'legend'); [['close','종가'],['sma20','20개 평균'],['sma50','50개 평균']].forEach(([k,v])=>legend.append(el('span',v,k))); body.append(legend);
    const metrics=el('div',undefined,'metrics'); [['returnPct','기간 수익률 (%)'],['maxDrawdownPct','최대 낙폭 (%)'],['annualizedVolatilityPct','연환산 변동성 (%)'],['rsi14','RSI 14']].forEach(([k,label])=>{ const n=el('p',label,'metric-value'), v=(data.metrics||{})[k]; n.append(el('strong',finite(v)?v.toFixed(2):'자료 부족')); metrics.append(n); }); body.append(metrics);
    detail(body,'접근 가능한 원자료 · 날짜, 종가, 거래량, 이동평균',points);
  }
  function render(result, origin, now) {
    const q=result.quote||{}, body=$('quote-body'); body.replaceChildren(el('p',origin,'badge'),el('p','검사 기준 시각: '+now),el('p','입력 선언 모드: '+text(result.mode)),el('p','종목: '+text(result.instrument)),el('h3',q.label||q.status||'판단 보류'));
    body.append(el('p','가격·출처·거래소 시각·수신 시각은 입력값입니다. 최신성 판정이 실시간 연결 또는 권리 검증을 뜻하지 않습니다.','muted'));
    detail(body,'선택 시세 · 출처 / 거래소 시각 / 수신 시각 / 권리',q.selected); detail(body,'교차 검증 시세와 비교',q.comparison); list(body,q.issues);
    chart(result.chart||{},result.instrument);
    const signals=$('signal-body'); signals.replaceChildren(); const grid=el('div',undefined,'summary-grid');
    [['quality','기업의 질'],['valuation','가격과 가치'],['sentiment','시장 심리']].forEach(([key,label])=>{const s=el('article',undefined,'signal');s.dataset.signal=key; const v=result.valuation&&result.valuation[key];s.append(el('h3',label),el('p',v?v.status:'자료 부족 · 판단 보류')); if(v) detail(s,'근거와 가정',v);grid.append(s);}); signals.append(grid,el('p','가격 흐름만으로 기업의 질이나 적정가치를 결정하지 않습니다.','muted'));
    if(result.valuation) detail(signals,'재무 분석 전체 · 출처와 불확실성',result.valuation);
    if(result.secFacts) { const sec=el('section'); sec.dataset.secFacts='preview'; sec.append(el('h3','SEC 형식 재무 자료 미리보기'),el('p','미검증 · 입력된 자료의 선택 결과입니다. SEC 원문 조회·회사 동일성·완전한 재무제표를 확인한 것이 아닙니다.','warning'),el('p','선택 상태: '+text(result.secFacts.status))); detail(sec,'선택한 수치 · 단위 · 기간 · 출처',result.secFacts.observations); detail(sec,'선택 근거 · 공시일 · 접수번호 · 출처',result.secFacts.selectionEvidence); list(sec,result.secFacts.issues); if(result.secFacts.notice) sec.append(el('p',result.secFacts.notice,'muted')); signals.append(sec); }
    const issues=$('issue-body'); issues.replaceChildren(el('p','전체 판정: '+text(result.status))); list(issues,result.issues); list(issues,result.warnings); if(result.notice) issues.append(el('p',result.notice));
  }
  $('document-input').addEventListener('input',()=>{sampleText=null;clear();$('origin').textContent='입력 출처: IMPORTED · 사용자 붙여넣기/편집 · 미검증';status('입력이 변경되었습니다. 다시 분석하세요.');});
  $('load-sample').addEventListener('click',()=>{sampleText=null;clear();try { if(!window.HASMarketFixtures) throw new Error('합성 예시 모듈을 불러오지 못했습니다.'); sampleText=JSON.stringify(window.HASMarketFixtures.create(),null,2);$('document-input').value=sampleText;$('origin').textContent='입력 출처: SYNTHETIC · 합성 시험 예시';status('SYNTHETIC 합성 예시 준비 · 실제 종목/시세 아님'); }catch(e){status(e.message);}});
  $('analyze').addEventListener('click',()=>{clear();try{const raw=$('document-input').value;if(!raw.trim())throw new Error('자료 JSON을 입력하세요.');if(new TextEncoder().encode(raw).length>1000000)throw new Error('JSON은 UTF-8 1 MB 이내로 입력하세요.');let pack;try{pack=JSON.parse(raw);}catch(_){throw new Error('JSON 형식 오류: 따옴표와 쉼표를 확인하세요.');}if(!pack||typeof pack!=='object'||Array.isArray(pack))throw new Error('JSON 객체를 입력하세요.');if(!window.HASMarketData||typeof window.HASMarketData.analyzePack!=='function')throw new Error('분석 엔진을 불러오지 못했습니다.');const synthetic=sampleText!==null&&raw===sampleText,now=synthetic?window.HASMarketFixtures.NOW:new Date().toISOString(),origin=synthetic?'SYNTHETIC · 합성 예시 · 고정 시험 시각':'IMPORTED · 사용자 입력 · 미검증';render(window.HASMarketData.analyzePack(pack,now),origin,now);status('검사 완료 · 거절 사유와 출처를 확인하세요. 실시간 연결 없음.');}catch(e){clear();status('분석하지 못했습니다: '+e.message);}});
  $('reset').addEventListener('click',()=>{sampleText=null;$('document-input').value='';$('origin').textContent='입력 출처: 없음';clear();status('화면 입력·결과를 비웠습니다. 기존 기록 변경 없음.');});
  window.addEventListener('pageshow',()=>{clear();status('분석 대기 · 현재 입력을 다시 분석하세요.');}); clear();
})();
