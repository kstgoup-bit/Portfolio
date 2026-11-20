/* 곡소리 후보 Top 10 (3개 먼저, 나머지는 펼치기). 가격 위치만 본 임시 순위이며 매수 의견을 만들지 않는다.
 * 네트워크: 사용자가 '곡소리 후보 조회'를 누를 때만 GAS 요약 1회(JSONP, type=screen). 자동 조회 없음.
 * 저장: 메모리 캐시만(한국시간 날짜 기준), localStorage·백업 쓰기 없음. 재무 확인(2차): 요약 항목의 fundamental(normalize 결과)이 있을 때만 재무 라벨, 없으면 '미연결'. 어떤 경우든 의견은 '판단 보류'. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASFearTop = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var LIMIT = 10, VISIBLE = 3;
  // 표시 전용 종목 이름(코스피200·미국200 구성종목 파일 기준 2026-11-12). 판정·정렬에 쓰지 않는다.
  var NAMES = {"KR:005930":"삼성전자","KR:000660":"SK하이닉스","KR:402340":"SK스퀘어","KR:373220":"LG에너지솔루션","KR:207940":"삼성바이오로직스","KR:009150":"삼성전기","KR:005380":"현대차","KR:105560":"KB금융","KR:032830":"삼성생명","KR:068270":"셀트리온","KR:028260":"삼성물산","KR:055550":"신한지주","KR:006400":"삼성SDI","KR:000270":"기아","KR:034730":"SK","KR:012450":"한화에어로스페이스","KR:086790":"하나금융지주","KR:012330":"현대모비스","KR:034020":"두산에너빌리티","KR:329180":"HD현대중공업","KR:035420":"NAVER","KR:000810":"삼성화재","KR:316140":"우리금융지주","KR:066570":"LG전자","KR:005490":"POSCO홀딩스","KR:015760":"한국전력","KR:011200":"HMM","KR:138040":"메리츠금융지주","KR:010120":"LS ELECTRIC","KR:010130":"고려아연","KR:096770":"SK이노베이션","KR:033780":"KT&G","KR:018260":"삼성에스디에스","KR:042700":"한미반도체","KR:017670":"SK텔레콤","KR:298040":"효성중공업","KR:051910":"LG화학","KR:009540":"HD한국조선해양","KR:003670":"포스코퓨처엠","KR:086280":"현대글로비스","KR:267260":"HD현대일렉트릭","KR:024110":"기업은행","KR:010140":"삼성중공업","KR:042660":"한화오션","KR:035720":"카카오","KR:003550":"LG","KR:180640":"한진칼","KR:030200":"KT","KR:028050":"삼성E&A","KR:006800":"미래에셋증권","KR:003490":"대한항공","KR:010950":"S-Oil","KR:272210":"한화시스템","KR:047810":"한국항공우주","KR:005830":"DB손해보험","KR:323410":"카카오뱅크","KR:267250":"HD현대","KR:000150":"두산","KR:003230":"삼양식품","KR:000720":"현대건설","KR:278470":"에이피알","KR:259960":"크래프톤","KR:0126Z0":"삼성에피스홀딩스","KR:047050":"포스코인터내셔널","KR:064350":"현대로템","KR:005940":"NH투자증권","KR:079550":"LIG디펜스앤에어로스페이스","KR:443060":"HD현대마린솔루션","KR:307950":"현대오토에버","KR:161390":"한국타이어앤테크놀로지","KR:078930":"GS","KR:064400":"LG씨엔에스","KR:021240":"코웨이","KR:090430":"아모레퍼시픽","KR:326030":"SK바이오팜","KR:011070":"LG이노텍","KR:071050":"한국금융지주","KR:352820":"하이브","KR:016360":"삼성증권","KR:032640":"LG유플러스","KR:007660":"이수페타시스","KR:128940":"한미약품","KR:006260":"LS","KR:000100":"유한양행","KR:009830":"한화솔루션","KR:029780":"삼성카드","KR:039490":"키움증권","KR:241560":"두산밥캣","KR:175330":"JB금융지주","KR:047040":"대우건설","KR:377300":"카카오페이","KR:271560":"오리온","KR:267270":"HD건설기계","KR:036570":"NC","KR:000880":"한화","KR:138930":"BNK금융지주","KR:062040":"산일전기","KR:034220":"LG디스플레이","KR:036460":"한국가스공사","KR:000990":"DB하이텍","KR:001440":"대한전선","KR:012750":"에스원","KR:008930":"한미사이언스","KR:010060":"OCI홀딩스","KR:011790":"SKC","KR:004020":"현대제철","KR:454910":"두산로보틱스","KR:051900":"LG생활건강","KR:066970":"엘앤에프","KR:088350":"한화생명","KR:111770":"영원무역","KR:022100":"포스코DX","KR:302440":"SK바이오사이언스","KR:001040":"CJ","KR:001450":"현대해상","KR:002380":"KCC","KR:192820":"코스맥스","KR:035250":"강원랜드","KR:052690":"한전기술","KR:251270":"넷마블","KR:028670":"팬오션","KR:018880":"한온시스템","KR:026960":"동서","KR:009420":"한올바이오파마","KR:383220":"F&F","KR:457190":"이수스페셜티케미컬","KR:097950":"CJ제일제당","KR:139130":"iM금융지주","KR:161890":"한국콜마","KR:017800":"현대엘리베이터","KR:004170":"신세계","KR:004370":"농심","KR:007340":"DN오토모티브","KR:011780":"금호석유화학","KR:282330":"BGF리테일","KR:375500":"DL이앤씨","KR:023530":"롯데쇼핑","KR:030000":"제일기획","KR:081660":"미스토홀딩스","KR:082740":"한화엔진","KR:112610":"씨에스윈드","KR:000240":"한국앤컴퍼니","KR:002790":"아모레퍼시픽홀딩스","KR:004990":"롯데지주","KR:005850":"에스엘","KR:007070":"GS리테일","KR:009970":"영원무역홀딩스","KR:011170":"롯데케미칼","KR:014680":"한솔케미칼","KR:450080":"에코프로머티","KR:000120":"CJ대한통운","KR:006040":"동원산업","KR:006280":"녹십자","KR:051600":"한전KPS","KR:069960":"현대백화점","KR:073240":"금호타이어","KR:103140":"풍산","KR:139480":"이마트","KR:204320":"HL만도","KR:483650":"달바글로벌","KR:298020":"효성티앤씨","KR:008770":"호텔신라","KR:011210":"현대위아","KR:007310":"오뚜기","KR:069620":"대웅제약","KR:001800":"오리온홀딩스","KR:071970":"HD현대마린엔진","KR:192080":"더블유게임즈","KR:120110":"코오롱인더","KR:000080":"하이트진로","KR:361610":"SK아이이테크놀로지","KR:300720":"한일시멘트","KR:001430":"세아베스틸지주","KR:280360":"롯데웰푸드","KR:009240":"한샘","KR:005300":"롯데칠성","KR:004000":"롯데정밀화학","KR:003240":"태광산업","KR:003090":"대웅","KR:000210":"DL","KR:298050":"HS효성첨단소재","KR:285130":"SK케미칼","KR:268280":"미원에스씨","KR:185750":"종근당","KR:137310":"에스디바이오센서","KR:093370":"후성","KR:071320":"지역난방공사","KR:034230":"파라다이스","KR:0220W0":"한화머시너리앤서비스홀딩스","KR:017960":"한국카본","KR:003030":"세아제강지주","KR:002030":"아세아","KR:005420":"코스모화학","KR:456040":"OCI","KR:006650":"대한유화","KR:008730":"율촌화학","KR:002840":"미원상사","KR:001680":"대상","KR:000670":"영풍","KR:014820":"동원시스템즈","KR:069260":"TKG휴켐스","US:AAPL":"Apple","US:NVDA":"NVIDIA","US:MSFT":"Microsoft","US:AMZN":"Amazon","US:AMD":"AMD","US:MU":"Micron","US:TSLA":"Tesla","US:META":"Meta","US:GOOGL":"Alphabet A","US:AVGO":"Broadcom","US:WMT":"Walmart","US:SPCX":"Space Exploration Technologies(미검증)","US:GOOG":"Alphabet C","US:COST":"Costco","US:CSCO":"Cisco","US:PLTR":"Palantir","US:INTC":"Intel","US:AMAT":"Applied Materials","US:LRCX":"Lam Research","US:TXN":"Texas Instruments","US:PANW":"Palo Alto","US:NFLX":"Netflix","US:AMGN":"Amgen","US:LIN":"Linde","US:CRWD":"CrowdStrike","US:GILD":"Gilead","US:KLAC":"KLA","US:ADI":"Analog Devices","US:PEP":"PepsiCo","US:QCOM":"Qualcomm","US:TMUS":"T-Mobile US","US:SHOP":"Shopify","US:ISRG":"Intuitive Surgical","US:MRVL":"Marvell","US:ASML":"ASML","US:VRTX":"Vertex","US:SNDK":"Sandisk","US:STX":"Seagate","US:ADP":"ADP","US:SBUX":"Starbucks","US:BKNG":"Booking","US:APP":"AppLovin","US:WDC":"Western Digital","US:MAR":"Marriott","US:CEG":"Constellation Energy","US:CSX":"CSX","US:REGN":"Regeneron","US:FTNT":"Fortinet","US:ADBE":"Adobe","US:INTU":"Intuit","US:MRNA":"Moderna","US:CDNS":"Cadence","US:CTAS":"Cintas","US:MNST":"Monster","US:SNPS":"Synopsys","US:CMCSA":"Comcast","US:ARM":"Arm","US:MDLZ":"Mondelez","US:ROST":"Ross","US:ABNB":"Airbnb","US:MELI":"MercadoLibre","US:ORLY":"O'Reilly","US:MPWR":"Monolithic Power","US:HON":"Honeywell Intl","US:AEP":"American Electric Power","US:DASH":"DoorDash","US:NXPI":"NXP","US:FAST":"Fastenal","US:DDOG":"Datadog","US:PCAR":"PACCAR","US:LITE":"Lumentum","US:IDXX":"IDEXX","US:ADSK":"Autodesk","US:HONA":"Honeywell Aerospace(미검증)","US:PDD":"PDD","US:FANG":"Diamondback","US:XEL":"Xcel Energy","US:CCEP":"Coca-Cola Europacific","US:PYPL":"PayPal","US:BKR":"Baker Hughes","US:KDP":"Keurig Dr Pepper","US:ROP":"Roper","US:EXC":"Exelon","US:FER":"Ferrovial","US:TTWO":"Take-Two","US:MSTR":"Strategy","US:PAYX":"Paychex","US:TER":"Teradyne","US:TRI":"Thomson Reuters","US:ALAB":"Astera Labs","US:RKLB":"Rocket Lab","US:WDAY":"Workday","US:GEHC":"GE HealthCare","US:ODFL":"Old Dominion","US:MCHP":"Microchip","US:DXCM":"Dexcom","US:NBIS":"Nebius","US:CPRT":"Copart","US:CRWV":"CoreWeave","US:AXON":"Axon","US:ALNY":"Alnylam","US:LLY":"Eli Lilly + Co","US:BRK.B":"Berkshire Hathaway Inc Cl B","US:JPM":"Jpmorgan Chase + Co","US:V":"Visa Inc Class A Shares","US:XOM":"Exxonmobil Holdings Corp","US:JNJ":"Johnson + Johnson","US:MA":"Mastercard Inc   A","US:ABBV":"Abbvie Inc","US:CVX":"Chevron Corp","US:PG":"Procter + Gamble Co/The","US:KO":"Coca Cola Co/The","US:UNH":"Unitedhealth Group Inc","US:MRK":"Merck + Co. Inc.","US:HD":"Home Depot Inc","US:GE":"General Electric","US:BAC":"Bank Of America Corp","US:PM":"Philip Morris International","US:CAT":"Caterpillar Inc","US:RTX":"Rtx Corp","US:GS":"Goldman Sachs Group Inc","US:WFC":"Wells Fargo + Co","US:TMO":"Thermo Fisher Scientific Inc","US:ORCL":"Oracle Corp","US:IBM":"Intl Business Machines Corp","US:MS":"Morgan Stanley","US:GEV":"Ge Vernova Inc","US:ANET":"Arista Networks Inc","US:C":"Citigroup Inc","US:DIS":"Walt Disney Co/The","US:APH":"Amphenol Corp Cl A","US:MCD":"Mcdonald S Corp","US:VZ":"Verizon Communications Inc","US:ABT":"Abbott Laboratories","US:UNP":"Union Pacific Corp","US:CRM":"Salesforce Inc","US:NEE":"Nextera Energy Inc","US:WELL":"Welltower Inc","US:BLK":"Blackrock Inc","US:DE":"Deere + Co","US:COP":"Conocophillips","US:AXP":"American Express Co","US:PFE":"Pfizer Inc","US:ACN":"Accenture Plc Cl A","US:T":"At+T Inc","US:TJX":"Tjx Companies Inc","US:SCHW":"Schwab (Charles) Corp","US:DHR":"Danaher Corp","US:SPGI":"S+P Global Inc","US:UBER":"Uber Technologies Inc","US:ETN":"Eaton Corp Plc","US:PGR":"Progressive Corp","US:BA":"Boeing Co/The","US:CB":"Chubb Ltd","US:MO":"Altria Group Inc","US:LOW":"Lowe S Cos Inc","US:BMY":"Bristol Myers Squibb Co","US:MCK":"Mckesson Corp","US:MDT":"Medtronic Plc","US:LMT":"Lockheed Martin Corp","US:PLD":"Prologis Inc","US:PH":"Parker Hannifin Corp","US:COF":"Capital One Financial Corp","US:NEM":"Newmont Corp","US:MPC":"Marathon Petroleum Corp","US:CVS":"Cvs Health Corp","US:CME":"Cme Group Inc","US:DELL":"Dell Technologies  C","US:SYK":"Stryker Corp","US:VLO":"Valero Energy Corp","US:SO":"Southern Co/The","US:EQIX":"Equinix Inc","US:PSX":"Phillips 66","US:NOW":"Servicenow Inc","US:BNY":"Bank Of New York Mellon Corp","US:ICE":"Intercontinental Exchange In","US:DUK":"Duke Energy Corp","US:MRSH":"Marsh + Mclennan Cos","US:MMM":"3M Co","US:GLW":"Corning Inc","US:USB":"Us Bancorp","US:TT":"Trane Technologies Plc","US:ELV":"Elevance Health Inc","US:EMR":"Emerson Electric Co","US:PNC":"Pnc Financial Services Group","US:GD":"General Dynamics Corp","US:PWR":"Quanta Services Inc","US:WM":"Waste Management Inc","US:BX":"Blackstone Inc","US:HWM":"Howmet Aerospace Inc","US:AMT":"American Tower Corp","US:MSI":"Motorola Solutions Inc","US:FCX":"Freeport Mcmoran Inc","US:JCI":"Johnson Controls Internation","US:WMB":"Williams Cos Inc","US:TRV":"Travelers Cos Inc/The","US:HLT":"Hilton Worldwide Holdings In","US:UPS":"United Parcel Service Cl B","US:EOG":"Eog Resources Inc","US:VRT":"Vertiv Holdings Co A","US:RCL":"Royal Caribbean Cruises Ltd"};
  function nameOf(market, ticker) { var k = market + ':' + ticker; return Object.prototype.hasOwnProperty.call(NAMES, k) ? NAMES[k] : ''; }
  function select(summary, now, rank) {
    now = now == null ? Date.now() : now;
    var ranked = [], aged = false;
    if (summary && Array.isArray(summary.items) && typeof rank === 'function') {
      ranked = rank(summary, now).slice(0, LIMIT);
      aged = now - Date.parse(summary.generatedAt) > 86400000;
    }
    return { rows: ranked, visible: ranked.slice(0, VISIBLE), hidden: ranked.slice(VISIBLE), aged: aged, total: ranked.length };
  }
  function kstDay(t) { return new Date(t + 32400000).toISOString().slice(0, 10); }
  function pct(x) { return Number.isFinite(x) ? (x > 0 ? '+' : '') + x.toFixed(1) + '%' : '자료 부족'; }
  function mount(container, deps) {
    if (!container || typeof document === 'undefined') return null;
    var W = typeof window !== 'undefined' ? window : {};
    deps = deps || {};
    var screen = deps.screen || W.HASUniverseScreen, now = deps.now || Date.now;
    var state = { summary: null, busy: false, error: '', expanded: false, cache: null, serial: 0 };
    function node(tag, text) { var e = document.createElement(tag); if (text != null) e.textContent = text; return e; }
    function endpoint() {
      if (deps.endpoint) return deps.endpoint();
      var v = typeof W.gasUrl === 'string' ? W.gasUrl : '';
      return W.HASLivePriceReference.validateEndpoint(v);
    }
    function transport(ep) {
      if (deps.transport) return deps.transport(ep);
      return new Promise(function (resolve, reject) {
        var u = new URL(ep), cb = 'hasFearTop_' + (++state.serial), s = document.createElement('script'), done = false, timer;
        function end(err, data) { if (done) return; done = true; clearTimeout(timer); s.remove(); W[cb] = function () {}; if (err) reject(err); else resolve(data); }
        W[cb] = function (data) { end(null, data); };
        u.searchParams.set('type', 'screen'); u.searchParams.set('callback', cb); u.searchParams.set('_', String(Date.now()));
        s.src = u.href; s.referrerPolicy = 'no-referrer';
        s.onerror = function () { end(Error('요약 조회 실패')); };
        timer = setTimeout(function () { end(Error('요약 응답 시간 초과')); }, 12000);
        document.head.appendChild(s);
      });
    }
    function reason(e) {
      var m = e && e.message || '';
      if (/^Invalid URL/.test(m) || /GAS/.test(m) || m === 'invalid-gas-endpoint') return 'GAS가 연결되지 않았거나 주소 확인이 필요합니다';
      return /^[a-z0-9-]+$/.test(m) ? '자료 확인 필요 (' + m + ')' : (m || '조회 실패');
    }
    function synthetic(s) {
      return /synthetic|test-only/i.test(String(s.generation)) || (s.sources || []).some(function (x) { var v = x && x.source || {}; return /synthetic|test-only|example\.invalid/i.test(String(v.version) + ' ' + String(v.url)); });
    }
    function fund(r) {
      var F = deps.fundamental || W.HASFundamentalFilter;
      if (!F || typeof F.display !== 'function') return null;
      try { return F.display(r.fundamental, { now: now(), market: r.market, ticker: r.ticker, context: 'fear' }); } catch (e) { return { text: '재무: 판정 오류 · 판단 보류', note: '', lines: [] }; }
    }
    function card(r, i, aged) {
      var a = node('article');
      var nm = nameOf(r.market, r.ticker);
      a.appendChild(node('strong', (i + 1) + '. ' + (nm ? nm + ' (' + r.ticker + ')' : r.ticker) + ' · ' + r.market));
      a.appendChild(node('p', (aged ? '지난 요약 · ' : '') + '52주 고점 대비 ' + pct(r.drawdownPct) + ' · 자료 기준일 ' + (r.asOf || '없음')));
      a.appendChild(node('p', '가격 참고값 ' + (Number.isFinite(r.price) ? r.price.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + ' ' + (r.currency || '통화 미상') : '없음') + ' · 종가 확정·조정기준 미검증'));
      var fd = fund(r);
      a.appendChild(node('p', fd ? fd.text : 'AI 의견: 판단 보류 · 기업 확인(재무) 전'));
      if (fd && fd.note) a.appendChild(node('p', fd.note));
      var d = node('details'); d.appendChild(node('summary', '근거·반론 보기'));
      d.appendChild(node('p', '근거: 고점 대비 하락폭이 후보 200종목 중 큰 편입니다. 반론: 가격 하락은 기업가치 훼손일 수도 있습니다. 재무·실적·공시 확인 전에는 매수를 권하지 않습니다.'));
      [1, 3, 6].forEach(function (n) {
        var x = r.returns && r.returns[n], ok = x && Number.isFinite(x.value);
        d.appendChild(node('p', n + '개월 ' + pct(x && x.value) + (ok && x.startDate ? ' (' + x.startDate + '~' + x.endDate + ')' : '') + ' · 지수 초과 ' + (x && Number.isFinite(x.excessPct) ? x.excessPct.toFixed(1) + '%p' : '자료 부족')));
      });
      d.appendChild(node('p', (r.source || '출처 없음') + ' · ' + (r.currency || '통화 미상') + ' · 조정/종가확정 미검증'));
      if (fd) fd.lines.forEach(function (t) { d.appendChild(node('p', t)); });
      a.appendChild(d); return a;
    }
    function render() {
      container.replaceChildren(); container.dataset.testid = 'fear-top'; container.style.overflowWrap = 'anywhere';
      container.appendChild(node('h3', '곡소리 후보 Top 10'));
      container.appendChild(node('p', '200종목 중 가격 하락폭만 본 임시 순위입니다. 재무 라벨은 미국 SEC 연간 공시 참고(밸류에이션 연결 전)이며 매수 권유가 아닙니다. 최종 결정은 순태씨가 합니다.'));
      var btn = node('button', state.busy ? '조회 중…' : '곡소리 후보 조회'); btn.type = 'button'; btn.disabled = state.busy; btn.style.minHeight = '44px'; btn.addEventListener('click', refresh); container.appendChild(btn);
      var st = node('p', state.error || (state.summary ? '' : '버튼을 누르면 설정된 GAS에서 오늘의 요약을 1회 조회합니다.')); st.setAttribute('role', 'status'); container.appendChild(st);
      if (!state.summary) return;
      var sel = select(state.summary, now(), screen && screen.rank);
      st.textContent = state.error || ((synthetic(state.summary) ? '합성 시험 자료(실제 시세 아님) · ' : '') + '요약 ' + state.summary.generatedAt + ' · 후보 ' + sel.total + '개');
      if (!sel.total) { container.appendChild(node('p', '표시할 후보 없음 · 판단 보류 (자료가 오래됐거나 부족합니다)')); return; }
      sel.visible.forEach(function (r, i) { container.appendChild(card(r, i, sel.aged)); });
      if (sel.hidden.length) {
        var more = node('div'); more.id = 'fear-top-more'; more.hidden = !state.expanded;
        sel.hidden.forEach(function (r, i) { more.appendChild(card(r, i + VISIBLE, sel.aged)); });
        var tg = node('button', state.expanded ? '나머지 접기' : '나머지 ' + sel.hidden.length + '개 펼치기'); tg.type = 'button'; tg.style.minHeight = '44px';
        tg.setAttribute('aria-expanded', String(state.expanded)); tg.setAttribute('aria-controls', 'fear-top-more');
        tg.addEventListener('click', function () { state.expanded = !state.expanded; render(); });
        container.appendChild(tg); container.appendChild(more);
      }
    }
    function accept(s) { state.summary = screen.validateSummary(s, now()); state.error = ''; }
    function refresh() {
      if (state.busy) return Promise.resolve();
      var ep;
      try { ep = endpoint(); } catch (e) { state.error = '조회 보류: ' + reason(e) + ' · 판단 보류'; render(); return Promise.resolve(); }
      var day = kstDay(now());
      if (state.cache && state.cache.ep === ep && state.cache.day === day) { try { accept(state.cache.value); render(); return Promise.resolve(); } catch (e) { state.cache = null; } }
      state.busy = true; state.error = ''; render();
      return transport(ep).then(function (s) { accept(s); state.cache = { ep: ep, day: day, value: s }; })
        .catch(function (e) { state.error = '조회 보류: ' + reason(e) + (state.summary ? ' · 아래는 지난 성공 자료입니다.' : ' · 판단 보류'); })
        .then(function () { state.busy = false; render(); });
    }
    render();
    return { refresh: refresh };
  }
  return Object.freeze({ select: select, mount: mount, nameOf: nameOf, LIMIT: LIMIT, VISIBLE: VISIBLE });
});
