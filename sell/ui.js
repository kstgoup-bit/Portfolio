(function(){'use strict';
 const root=document.querySelector('#content'),message=document.querySelector('#message'),C=window.KSTSellCore,F=window.KSTSellFixtures;
 const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 function render(){root.replaceChildren();message.textContent='';if(!C||!F){message.textContent='합성 모듈 로드 실패 · 연결 후 새로고침하세요. 실제 평가 없음.';return;}
  const id=location.hash.slice(1),rows=F.cases(),row=rows.find(x=>x.id===id);if(id&&!row){message.textContent='알 수 없는 합성 사례 · 목록으로 복귀하세요.';return;}
  for(const data of row?[row]:rows){const r=C.evaluate(data,{today:F.today}),card=el('article','');card.append(el('h2',data.id),el('p',r.status));
   if(!row){const a=el('a','합성 상세 · '+data.id);a.href='#'+data.id;card.append(a);}
   else{card.append(el('p','연구일 '+F.today+' · 출처 example.invalid · 합성 가정'),el('p','수익률 검토 예시 '+r.returnPct.toFixed(1)+'%'));
    for(const [title,values] of [['증거 / 조건',r.reasons],['결측',r.missing],['반대 근거',r.counterEvidence],['계산식',r.formulas],['검토 알림',r.alerts]]){card.append(el('h3',title),el('p',values.join(' / ')||'없음'));}
    const replaceLabels={review:'합성 조건상 비교 검토 가능','no-case':'교체 근거 불충분',unknown:'평가 불가'};
    card.append(el('h3','집중도 계산'),el('p',(r.concentration?.weights||[]).map(w=>({account:'계좌',stock:'종목',sector:'업종'}[w.dimension])+' '+w.name+' '+(w.weight*100).toFixed(1)+'% / 합성 한도 '+(w.limit*100).toFixed(1)+'%').join(' · ')||'자료 부족'));
    card.append(el('h3','교체 비교'),el('p',replaceLabels[r.replacement?.status]||'평가 불가'),el('p',r.replacement?.formula||'자료 부족'));
    if(Number.isFinite(r.replacement?.netBenefit))card.append(el('p','합성 순 기대차익 '+r.replacement.netBenefit+' 기준통화 단위 · 보장 수익 아님'));
    for(const [label,item] of [['고평가',data.valuation],['투자 논리',data.thesis],['교체',data.replacement]])if(item?.evidence){const e=item.evidence;card.append(el('p',label+' 근거: '+e.summary+' · 기준일 '+e.asOf+' · 확인일 '+e.checkedAt+' · '+e.source));}
    card.append(el('p','질·세금·거래비용·현금 필요의 합성 비교입니다. 기대수익은 예측치이며 보장되지 않습니다.'));
   }root.append(card);
  }
 }
 document.querySelector('#list').onclick=()=>{location.hash='';render();};document.querySelector('#retry').onclick=()=>render();window.addEventListener('hashchange',render);render();
})();
