(function(){
 'use strict';
 const B=window.KSTPortfolioBackup;if(!B)return;
 const host=document.getElementById('portfolioBackupTools');if(!host)return;
 const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const msg=(text)=>{const m=document.getElementById('backupMsg');m.textContent=text;m.setAttribute('role','status');};
 function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function effective(){return {
  v5_gen:JSON.stringify(genStocks),v5_dom:JSON.stringify(domStocks),v5_ov:JSON.stringify(ovStocks),v5_pen:JSON.stringify(penStocks),v5_div:JSON.stringify(divList),v5_snap:JSON.stringify(snapshots),v5_deposits:JSON.stringify(deposits),v5_balGoals:JSON.stringify(balGoals),v5_fx:String(getRate()),
  v5_debtBank:JSON.stringify(loadDebtBank()),v5_debtHouse:JSON.stringify(loadDebtHouse()),v5_nonFinAssets:JSON.stringify(loadNonFinAssets())
 };}
 function refresh(){load();renderAll();}
 window.exportData=function(){try{const text=JSON.stringify(B.create(localStorage,effective()),null,2);if(new Blob([text]).size>B.MAX_BYTES)throw Error('용량 한도 초과');download(text,'KST-전체백업-v6-'+new Date().toISOString().slice(0,10)+'.json');msg('4개 계좌와 저장된 기록·설정을 백업했습니다. API 키·잠금·GAS 주소·레이더는 제외합니다.');}catch{msg('백업 실패: 손상 자료 또는 저장 접근 오류를 확인하세요. 현재 자료를 바꾸지 않았습니다.');}};
 function btn(text,fn){const b=el('button',text);b.type='button';b.style.cssText='min-height:44px;padding:10px;border:1px solid #90caf9;border-radius:8px;background:#eef5ff;color:#17446b;font:inherit;cursor:pointer';b.addEventListener('click',fn);return b;}
 let generation=0;
 window.importData=async function(event){
  const run=++generation,file=event.target.files[0];event.target.value='';if(!file)return;
  document.getElementById('portfolioRestorePreview')?.remove();
  try{
   if(file.size>B.MAX_BYTES)throw Error();const plan=B.parse(await file.text());if(run!==generation)return;
   const rows=B.preview(localStorage,plan),live={v5_gen:genStocks,v5_dom:domStocks,v5_ov:ovStocks,v5_pen:penStocks};for(const r of rows)if(live[r.key])r.before=live[r.key].length;const box=el('section');box.id='portfolioRestorePreview';box.style.cssText='background:#f3f7ff;padding:12px;border:1px solid #90caf9;border-radius:10px;margin-top:12px;overflow-wrap:anywhere';box.setAttribute('aria-label','전체 백업 복원 미리보기');
   box.append(el('h3','복원 미리보기 · 아직 적용하지 않았습니다'));
   const names={v5_gen:'일반',v5_dom:'ISA',v5_ov:'해외',v5_pen:'연금'};
   for(const k of B.ACCOUNTS){const r=rows.find(r=>r.key===k);box.append(el('p',names[k]+': '+(r?r.before+'개 → '+r.after+'개':'백업에 없음 · 현재 값 유지')));}
   for(const w of plan.warnings)box.append(el('p',w));
   box.append(el('p','포함된 종목·기록은 병합하지 않고 교체합니다. 중복 ID·손상 데이터는 거절합니다. 계좌가 빈 배열이면 빈 계좌로 복원합니다.'));
   box.append(el('p','변경 대상 키 '+rows.filter(r=>r.changed).length+'개. 적용 전 사본을 이 기기에 보관합니다. 사본 저장 실패 시 복원하지 않습니다.'));
   box.append(btn('복원 적용',()=>{try{B.apply(localStorage,plan);box.remove();refresh();msg('전체 백업 복원 완료. 적용 직전 상태로 되돌릴 수 있습니다.');}catch(e){msg(e.message||'복원 실패');}}),btn('복원 취소',()=>{generation++;box.remove();msg('복원을 취소했습니다. 기존 자료는 그대로입니다.');}));
   host.append(box);box.scrollIntoView({block:'center'});
  }catch{msg('복원 파일을 거절했습니다. JSON·버전·필드·용량을 확인하세요. 기존 자료는 변경하지 않았습니다.');}
 };
 host.append(el('p','전체 백업 v6: 일반·ISA·해외·연금, 자산/입금·배당·가계부 기록과 관련 설정. API 키·잠금 비밀번호·GAS 주소는 제외합니다. 레이더는 레이더 설정에서 별도 백업하세요.'));
 host.append(btn('전체 복원 되돌리기',()=>{try{if(!confirm('가장 최근 전체 복원 직전 상태로 돌아갈까요? 복원 이후 편집한 해당 항목도 바뀝니다.'))return;B.undo(localStorage);refresh();msg('전체 복원 직전 상태로 되돌렸습니다.');}catch(e){msg(e.message);}}));
 host.append(btn('복원 전 사본 내보내기',()=>{try{const j=B.readJournal(localStorage);if(!j)throw Error('복원 전 사본이 없습니다.');download(JSON.stringify({format:'kst-portfolio-recovery',schemaVersion:1,journal:j},null,2),'KST-복원전사본.json');msg('복원 전 사본을 내보냈습니다. 이 파일은 기술 지원용이며 일반 복원 파일과 다릅니다.');}catch(e){msg(e.message);}}));
 try{if(B.recover(localStorage))msg('중단된 전체 복원을 적용 직전 상태로 자동 복구했습니다.');}catch(e){msg(e.message);}
})();
