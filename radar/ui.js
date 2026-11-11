/* Progressive enhancement: DOM text nodes only; never reads portfolio storage. */
(function () {
  'use strict';
  const C=window.KSTRadarCore, P=window.KSTRadarProviders, V=window.KSTRadarVerification, root=document.getElementById('panel-radar');
  if(!C || !P || !V || !root)return;
  let storage;
  try {storage=window.localStorage;} catch {storage={getItem(){throw Error();},setItem(){throw Error();}};}
  const saved=C.loadState(storage);
  let state=saved.state,storageError=saved.error,mode='real',view='list',selected=null,loading=false,error='',universe=null,snapshot=null;
  let query='',sector='',sort='ticker',signalOnly=false,historySync=false,requestId=0,verification=null;
  const provider=C.fixtureProvider(window.fetch.bind(window));
  const $=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined && text!==null)e.textContent=String(text);if(cls)e.className=cls;return e;};
  function add(parent,...children){for(const c of children)if(c)parent.append(c);return parent;}
  function button(text,handler,cls){const b=$('button',text,cls);b.type='button';b.addEventListener('click',handler);return b;}
  function note(text,cls='kr-muted'){return $('p',text,cls);}
  function card(title){const el=$('section',null,'kr-card');if(title)add(el,$('h2',title));return el;}
  function select(label,options,value,change,id){const l=$('label',label),s=$('select');s.id=id;for(const [v,t] of options){const o=$('option',t);o.value=v;s.append(o);}s.value=value;s.addEventListener('change',()=>change(s.value));l.append(s);return l;}
  function announcement(text,bad=false){error=text;const el=document.getElementById('kr-message');if(el){el.hidden=false;el.textContent=text;el.setAttribute('role',bad?'alert':'status');}}
  const pct=v=>v===null?'데이터 부족':(v>=0?'+':'')+v.toFixed(1)+'%';
  const pp=v=>v===null?'데이터 부족':(v>=0?'+':'')+v.toFixed(1)+'%p';
  const currentRows=()=>mode==='demo'?(snapshot?.quotes||[]):(universe||[]);
  function assessment(t){return mode==='demo'?snapshot?.assessments.find(a=>a.ticker===t):null;}
  function results(q){return C.evaluateSignals(mode==='demo'?q:null,state.settings);}
  function route(push=true){
    if(historySync)return;
    const hash='#kst-radar/'+mode+'/'+view+(selected?'/'+selected:'');
    if(location.hash===hash)return;
    history[push?'pushState':'replaceState']({kstRadar:true},'',hash);
  }
  function navigate(next,t=null){view=next;selected=t;route();render();document.getElementById('kr-title').focus({preventScroll:true});window.scrollTo({top:0,left:0,behavior:'instant'});}
  function onTabChange(tab){
    if(historySync)return;
    if(tab==='radar')route();
    else if(location.hash.startsWith('#kst-radar/'))history.pushState({kstPortfolioTab:tab},'',location.pathname+location.search);
  }
  async function loadData(){
    const run=++requestId;loading=true;error='';snapshot=null;render();
    try {
      if(!universe){
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
        try {const options={signal:controller.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'};const r=await fetch('./radar/data/universe.json',options);if(!r.ok)throw Error();const raw=await r.json();const normalized=C.normalizeUniverse(raw);const review=await fetch('./radar/data/eligibility.json',options);if(!review.ok)throw Error();verification=V.auditUniverse(raw,await review.json(),new Date().toISOString().slice(0,10));universe=normalized;}
        finally{clearTimeout(timer);}
      }
      if(mode==='demo') {const data=await C.collect(provider);if(run===requestId)snapshot=data;}
    } catch {if(run===requestId)error='데이터 불러오기 실패 · 네트워크와 파일을 확인한 뒤 다시 시도하세요. 이전 성공 상태를 표시하지 않습니다.';}
    finally {if(run===requestId){loading=false;render();}}
  }
  function switchMode(next){mode=next;view='list';selected=null;query='';sector='';signalOnly=false;route();void loadData();}
  function download(){
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=$('a');
    a.href=url;a.download='kst-radar-settings-v1.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announcement('레이더 설정만 백업했습니다. 포트폴리오 백업은 기존 설정 메뉴를 이용하세요.');
  }
  function header(){
    add(root,$('div','KST · ANALYSIS RADAR','kr-eyebrow'));
    const title=$('h1','곡소리 레이더');title.id='kr-title';title.tabIndex=-1;add(root,title);
    add(root,note('급락은 분석의 시작입니다. 기업의 체력과 하락 이유를 함께 살펴보세요.'));
    const banner=$('div',null,'kr-banner');banner.dataset.testid='mode-banner';
    add(banner,$('strong',mode==='demo'?'데모 · 가상 기업 / 고정 데이터':'실제 데이터 · API 미연결'),note(mode==='demo'?'가상 기업 3개를 이용한 기능 시연입니다. 실제 시세·재무·매매 판단에 사용하지 마세요.':'확정 감시 0개 · 실제 시세 조회 0개. 검토 후보는 선정·재무 검증 전이며 추천 목록이 아닙니다.'));
    if(mode==='demo'&&snapshot){const dates=snapshot.quotes.map(q=>q.asOf).sort();const f=P.freshness(dates[0]);const badge=note((f.status==='stale'?'기준일 지연 · ':f.status==='unknown'?'기준일 확인 불가 · ':'')+'고정 데모 기준일 '+(dates[0]||'없음')+' · 거래일 캘린더 기반 최신성 확인이 아닙니다.','kr-status');badge.id='kr-freshness';badge.dataset.state=f.status;banner.append(badge);}
    add(root,banner,select('데이터 모드',[['real','실제 데이터 · 미연결'],['demo','데모 · 가상 데이터']],mode,switchMode,'kr-mode'));
    const nav=$('nav',null,'kr-actions');nav.setAttribute('aria-label','레이더 화면');
    for(const [v,t] of [['list','후보 목록'],['criteria','감시 기준'],['status','데이터 상태']]){const b=button(t,()=>navigate(v),view===v?'kr-primary':'');b.setAttribute('aria-current',String(view===v));nav.append(b);}
    const sell=$('a','환호성 매도 레이더 · 합성 연구');sell.href='./sell/index.html';sell.style.minHeight='44px';sell.style.display='inline-flex';sell.style.alignItems='center';nav.append(sell);
    add(root,nav);
    const m=$('div',error,'kr-status');m.id='kr-message';m.setAttribute('role',error?'alert':'status');m.setAttribute('aria-live','polite');if(!error)m.hidden=true;add(root,m);
    if(storageError)add(root,note(storageError,'kr-banner'));
    if(loading){const el=note('데이터 불러오는 중…','kr-status');el.setAttribute('role','status');add(root,el);}
    const reload=button('데이터 다시 읽기',()=>void loadData());reload.disabled=loading;add(root,reload);
  }
  function rowCard(q){
    const s=results(q),quality=C.evaluateQuality(assessment(q.ticker),mode),item=$('article',null,'kr-candidate');item.dataset.ticker=q.ticker;
    add(item,add($('div',null,'kr-row'),$('strong',q.ticker+' · '+q.company),$('span',mode==='demo'?'가상 기업':'검토 후보 · 보류','kr-pill')));
    add(item,note(q.sector+' · '+(q.exchange||'데모 거래소')));
    const metrics=$('div',null,'kr-kpis');
    for(const [label,value] of [['52주 고가 대비',pct(s.drawdown)],['S&P 500 대비',pp(s.marketExcess)],['업종 ETF 대비',pp(s.sectorExcess)]])add(metrics,add($('div'),$('span',label),$('b',value,value==='데이터 부족'?'kr-missing':'')));
    add(item,metrics,note(quality.score===null?quality.classification:'데모 '+quality.score+'점 · '+quality.classification));
    if(quality.flags.length)add(item,note(quality.flags.join(' / '),'kr-pill kr-risk'));
    if(mode==='real')add(item,note(q.holdReason));
    else add(item,note('분석 개시 신호 '+s.signals.length+'개 · 고정 기준일 '+q.asOf));
    add(item,button('상세 분석 · '+q.ticker,()=>navigate('detail',q.ticker)));
    return item;
  }
  function list(){
    const section=card('후보 목록');
    const counts=$('div',null,'kr-kpis');
    for(const [name,value] of [['확정 감시', (universe||[]).filter(x=>x.status==='active').length],['검토 후보',(universe||[]).filter(x=>x.reviewStatus==='candidate').length],['실제 조회',0]])add(counts,add($('div'),$('b',value),$('span',name)));
    add(section,counts,note(mode==='demo'?'아래 목록은 검토 후보와 무관한 가상 기업입니다.':'목표 규모는 약 200개입니다. 미검증 종목으로 숫자를 채우지 않습니다. 회사명·업종·거래소도 검증 전입니다.'));
    const tools=$('div',null,'kr-toolbar'),label=$('label','티커·회사명 검색','kr-wide'),search=$('input');search.type='search';search.value=query;search.id='kr-search';
    search.addEventListener('input',()=>{query=search.value;renderRows();});add(label,search);add(tools,label);
    const sectors=[...new Set(currentRows().map(r=>r.sector))].sort();
    add(tools,select('업종',[['','전체'],...sectors.map(s=>[s,s])],sector,v=>{sector=v;renderRows();},'kr-sector'));
    add(tools,select('정렬',[['ticker','티커순'],['drawdown','낙폭 큰 순'],['score','분석 점수순']],sort,v=>{sort=v;renderRows();},'kr-sort'));
    const signal=button(signalOnly?'전체 후보 보기':'분석 개시 신호만',()=>{signalOnly=!signalOnly;render();});signal.setAttribute('aria-pressed',String(signalOnly));signal.id='kr-signal';add(section,tools,signal);
    const rows=$('div');rows.id='kr-rows';rows.setAttribute('aria-live','polite');add(section,rows);add(root,section);renderRows();
  }
  function renderRows(){
    const container=document.getElementById('kr-rows');if(!container)return;container.replaceChildren();
    const rows=currentRows().filter(q=>(!query || (q.ticker+' '+q.company).toLowerCase().includes(query.toLowerCase())) && (!sector || q.sector===sector) && (!signalOnly || results(q).signals.length));
    rows.sort((a,b)=>{
      if(sort==='drawdown')return (results(a).drawdown??Infinity)-(results(b).drawdown??Infinity)||a.ticker.localeCompare(b.ticker);
      if(sort==='score')return (C.evaluateQuality(assessment(b.ticker),mode).score??-1)-(C.evaluateQuality(assessment(a.ticker),mode).score??-1)||a.ticker.localeCompare(b.ticker);
      return a.ticker.localeCompare(b.ticker);
    });
    add(container,note(rows.length+'개 표시'+(mode==='demo'?' · 모두 가상 데이터':'')));
    if(!rows.length)add(container,note(loading?'불러오는 중입니다.':'표시할 후보가 없습니다. 필터 또는 데이터 상태를 확인하세요.'));
    rows.forEach(q=>add(container,rowCard(q)));
  }
  function detail(){
    add(root,button('← 후보 목록으로',()=>navigate('list')));
    const q=currentRows().find(r=>r.ticker===selected),section=card('상세 분석');
    if(!q){add(section,note(loading?'불러오는 중입니다.':'해당 종목을 찾을 수 없습니다.'));add(root,section);return;}
    add(section,$('h3',q.ticker+' · '+q.company));
    const signals=results(q),a=assessment(q.ticker),quality=C.evaluateQuality(a,mode);
    add(section,$('div',quality.score===null?quality.classification:'데모 '+quality.score+' / 100 · '+quality.classification,'kr-metric'),note(quality.reason));
    quality.flags.forEach(f=>add(section,note(f,'kr-banner')));
    if(mode==='real'){
      add(section,note(q.selectionReason),note(q.holdReason));
      const dl=$('dl');for(const [k,v] of [['상태','검토 후보 / 보류'],['거래소',q.exchange+' (검증 전)'],['마지막 검증일',q.lastVerified||'미검증'],['평가 규칙',q.evaluationRule==='financial'?'금융 별도 평가':'일반 기업 (분류 재검토 필요)']])add(dl,$('dt',k),$('dd',v));add(section,dl);
    } else {
      const dl=$('dl');for(const [k,v] of [['기준일',q.asOf+' · 뉴욕 종가'],['종가',q.close===null?'데이터 부족':q.close+' '+q.currency],['52주 고가',q.high52w+' '+q.currency],['수정 기준',q.adjustment],['가격 출처',q.source.name+' / '+q.source.url],['3개월 기간',q.performance.start+' ~ '+q.performance.end],['비교 대상','S&P 500 대용 SPY / '+q.performance.sectorETF]])add(dl,$('dt',k),$('dd',v));add(section,dl);
      add(section,$('h3','1차 분석 개시 신호'));
      if(!signals.signals.length)add(section,note('확인된 신호 없음. 결측은 정상 상태를 뜻하지 않습니다.'));
      signals.signals.forEach(s=>add(section,note((s.type==='drawdown'?'52주 고가 대비 ':s.type==='market'?'S&P 500 대비 ':'업종 ETF 대비 ')+(s.type==='drawdown'?pct(s.value):pp(s.value))+' · 임계치 '+s.threshold+(s.type==='drawdown'?'%':'%p')+' · '+s.windowStart+' ~ '+s.windowEnd+' · '+s.asOf+' / '+s.close+' '+s.currency+' / '+s.adjustment+' / '+s.source.name,'kr-check')));
      signals.missing.forEach(m=>add(section,note('데이터 부족: '+m,'kr-banner')));
    }
    add(section,$('h3','2차 평가 근거'));
    if(!a || quality.score===null){add(section,note('점수는 표시하지 않습니다. 위험 요인 해소와 검증된 재무·정성 자료가 필요합니다.'));}
    else for(const k of Object.keys(C.WEIGHTS)) {
      const item=$('div',null,'kr-check');add(item,$('strong',C.LABELS[k]+' '+a.components[k]+' / '+C.WEIGHTS[k]));
      (a.claims||[]).filter(c=>c.component===k).forEach(c=>{add(item,note(c.claim),note('근거 URL: '+c.url+' · 기준일 '+c.asOf+' · 확인 여부: 가상 근거'),note('반대 시나리오: '+c.counterScenario));});add(section,item);
    }
    add(section,note('자동 매수·주문 기능은 없습니다. AI 분석은 연결하지 않았습니다. 향후 주장별 근거 URL·기준일·확인 여부·반대 시나리오를 필수로 검증합니다.'));add(root,section);
  }
  function criteria(){
    const section=card('감시 기준'),form=$('form'),grid=$('div',null,'kr-criteria');
    add(section,note('1차 낙폭은 분석 개시 신호입니다. 3개월 수익률 차이는 %p로 비교하며 기간·통화·분할 조정이 일치해야 합니다.'));
    const inputs=[];
    for(const [i,v] of state.settings.drawdowns.entries()){const l=$('label','52주 낙폭 구간 '+(i+1)+' (%, 양수)'),n=$('input');n.type='number';n.min='0.1';n.max='99.9';n.step='0.1';n.required=true;n.value=v;n.id='kr-dd-'+i;inputs.push(n);add(grid,add(l,n));}
    for(const [k,label] of [['marketUnderperformance','S&P 500 초과하락 (%p)'],['sectorUnderperformance','업종 ETF 초과하락 (%p)']]){const l=$('label',label),n=$('input');n.type='number';n.min='0.1';n.max='100';n.step='0.1';n.required=true;n.value=state.settings[k];n.id='kr-'+k;inputs.push(n);add(grid,add(l,n));}
    const submit=$('button','감시 기준 저장','kr-primary');submit.type='submit';submit.disabled=Boolean(storageError);add(form,grid,submit);
    form.addEventListener('submit',e=>{e.preventDefault();try{const settings=C.thresholds({drawdowns:inputs.slice(0,4).map(n=>Number(n.value)),marketUnderperformance:Number(inputs[4].value),sectorUnderperformance:Number(inputs[5].value)});state=C.saveState(storage,{schemaVersion:1,settings});announcement('레이더 감시 기준을 저장했습니다.');}catch{announcement('저장 실패: 임계치 순서 또는 저장 공간을 확인하세요.',true);}});
    add(section,form,$('h3','2차 평가 · 100점'));
    for(const k of Object.keys(C.WEIGHTS))add(section,note(C.LABELS[k]+' '+C.WEIGHTS[k]+'점'));
    add(section,note('85점 이상 최우선 분석 / 70~84 심층 분석 / 55~69 관찰 / 54 이하 보류. 데이터가 없으면 평가 불가.'),note('회계 부정·유동성 위기·핵심 경쟁력 훼손·주요 고객 상실 등 위험 플래그는 총점보다 우선합니다.','kr-banner'),note('금융기업: 자본적정성·자산건전성·조달 안정성 확인. 고성장기업: 현금 소진 기간·희석·단위 경제성 확인. 별도 점검이 없으면 평가 불가.'),note('초기 편입: 원칙적으로 시총 50억 달러 이상. 경쟁력·최근 재무건전성 근거와 검증일이 있어야 활성화합니다.'));
    add(root,section);
  }
  function status(){
    const section=card('데이터 상태');
    add(section,note(mode==='demo'?'공급자: KST 고정 테스트 데이터 / 실제 API 미연결':'공급자: 없음 / 실제 가격·재무 API 미연결'),note('확정 감시 '+(universe||[]).filter(s=>s.status==='active').length+'개 · 검토 후보 '+(universe||[]).filter(s=>s.reviewStatus==='candidate').length+'개 · 실제 시세 조회 0개'),note('데모: '+(mode==='demo'&&snapshot?'고정값 '+snapshot.quotes.length+'개 로드됨':'현재 로드하지 않음')+' · 로딩 오류 시 정상 완료로 표시하지 않습니다.'),note('레이더는 보유 종목·투자 기록·기존 API 키를 읽거나 전송하지 않습니다. 실제 연결에는 공급자 검증과 별도 서버 설계가 필요합니다.'),note('ChatGPT 예약 감시와 앱의 수집 서버는 별개입니다. 이 앱은 예약 감시를 생성하거나 실행하지 않습니다.'));
    const pilot=card('5종목 파일럿 · 미연결');pilot.id='kr-pilot-status';add(pilot,note(P.PILOT.join(' · ')),note('실제 가격 API 요청 0건 · 이용권·인증 미확보로 파일럿 미실시. 회사 식별 정보와 가격 검증은 다릅니다.'),note('공급자 어댑터·200종목 시험은 합성 응답으로만 검증합니다. 실제 감시 가동을 뜻하지 않습니다.'));if(verification)add(pilot,note('목록 검증 버전 '+verification.version+' · 활성 '+verification.active+' / 보류 '+verification.hold+' / 제외 '+verification.excluded+' · 증분 검증 후에만 편입합니다.'));add(section,pilot);
    add(section,$('h3','레이더 설정 백업 · 복원'),note('스키마 v1 · kst.radar 전용 공간. 기존 포트폴리오 백업에는 레이더 설정이 포함되지 않습니다.'));
    add(section,button('레이더 설정 백업',download));
    const label=$('label','설정 백업 파일 선택'),file=$('input');file.type='file';file.accept='.json,application/json';file.id='kr-restore';
    file.addEventListener('change',async()=>{const f=file.files[0];if(!f)return;try{if(f.size>100000)throw Error();const text=await f.text();C.migrateState(JSON.parse(text));if(!confirm('레이더 감시 기준만 복원할까요? 현재 레이더 설정의 사본을 먼저 보관합니다.'))return;state=C.restoreState(storage,text);storageError=null;announcement('레이더 설정을 복원했습니다.');}catch{announcement('복원 실패: 원본과 기존 투자 기록을 변경하지 않았습니다.',true);}finally{file.value='';}});
    add(section,add(label,file),button('복원 전 설정 되돌리기',()=>{try{state=C.undoRestore(storage);storageError=null;announcement('복원 전 레이더 설정으로 되돌렸습니다.');}catch{announcement('복원 전 사본을 읽거나 저장할 수 없습니다.',true);}}));
    add(section,note('기존 PWA 캐시 정책은 변경하지 않았습니다. 오프라인에서는 이전 HTML이 보이거나 레이더 파일 로드가 실패할 수 있습니다. 캐시 삭제 없이 먼저 연결 상태와 데이터 다시 읽기를 확인하세요.'));
    add(root,section);
  }
  function render(){root.replaceChildren();header();if(view==='detail')detail();else if(view==='criteria')criteria();else if(view==='status')status();else list();}
  function restoreRoute(){
    const match=location.hash.match(/^#kst-radar\/(real|demo)\/(list|detail|criteria|status)(?:\/([A-Z][A-Z0-9.-]{0,14}))?$/);
    historySync=true;
    if(match){const changed=mode!==match[1];mode=match[1];view=match[2];selected=match[3]||null;window.switchTab('radar');render();if(changed||(!snapshot&&mode==='demo'))void loadData();}
    else if(location.hash==='' && window.TAB_TO_GROUP?.[history.state?.kstPortfolioTab])window.switchTab(history.state.kstPortfolioTab);
    else if(location.hash==='')window.switchTab('dashboard');
    historySync=false;
  }
  window.KSTRadar={onTabChange};
  window.addEventListener('popstate',restoreRoute);
  render();void loadData();
  if(location.hash.startsWith('#kst-radar/'))restoreRoute();
})();
