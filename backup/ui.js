(function(){
 'use strict';
 const B=window.KSTPortfolioBackup;if(!B)return;
 const host=document.getElementById('portfolioBackupTools');if(!host)return;
 const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const msg=(text)=>{const m=document.getElementById('backupMsg');m.textContent=text;m.setAttribute('role','status');};
 function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function effective(){
  if(window.backupStateLoaded!==true)throw Error('계좌 자료를 읽지 못했으므로 백업하지 않습니다.');
  const fx=(document.getElementById('usdKrw')||{}).value;
  if(typeof fx!=='string'||!fx.trim())throw Error('실제 환율 입력값이 없습니다. 기본값으로 백업하지 않습니다.');
  return {
  v5_gen:JSON.stringify(genStocks),v5_dom:JSON.stringify(domStocks),v5_ov:JSON.stringify(ovStocks),v5_pen:JSON.stringify(penStocks),v5_div:JSON.stringify(divList),v5_snap:JSON.stringify(snapshots),v5_deposits:JSON.stringify(deposits),v5_balGoals:JSON.stringify(balGoals),v5_fx:fx,
  v5_debtBank:JSON.stringify(loadDebtBank()),v5_debtHouse:JSON.stringify(loadDebtHouse()),v5_nonFinAssets:JSON.stringify(loadNonFinAssets())
 };}
 function isWriteBlocked(){return B.isWriteBlocked(localStorage);}
 window.HASBackupUI=Object.freeze({isWriteBlocked,showBlocked});
 function prepareRuntimeChange(){
  if(isWriteBlocked())throw Error('중단되거나 손상된 복원 사본이 있습니다. 자동 복구하지 않습니다. 사본을 내보내고 별도 검토하세요.');
  if(typeof window.invalidateBackupRuntime!=='function')throw Error('복원 안전 연결을 확인하지 못했습니다. 자료를 바꾸지 않았습니다.');
  window.invalidateBackupRuntime();
 }
 function refresh(){load();if(typeof benchmarkHistory!=='undefined')benchmarkHistory={KS200:[],NDX:[],SPY:[]};if(typeof loadBenchmarkCacheSync==='function')loadBenchmarkCacheSync();renderAll();}
 window.exportData=function(){try{if(isWriteBlocked()){showBlocked();return;}const text=JSON.stringify(B.create(localStorage,effective()),null,2);if(new Blob([text]).size>B.MAX_BYTES)throw Error('용량 한도 초과');download(text,'KST-전체백업-v7-'+new Date().toISOString().slice(0,10)+'.json');msg('v7 전체 백업을 만들었습니다. 4개 계좌·활동 분류와 원본 지수 기록·별도 충돌 보류 자료를 보존합니다. 보류 자료는 계산에 사용하지 않습니다. API 키·잠금·GAS 주소·레이더는 제외합니다.');}catch{msg('백업 실패: 손상 자료 또는 저장 접근 오류를 확인하세요. 현재 자료를 바꾸지 않았습니다.');}};
 function downloadJournal(){const j=B.readJournal(localStorage);if(!j)throw Error('복원 전 사본이 없습니다.');download(JSON.stringify({format:'kst-portfolio-recovery',schemaVersion:1,journal:j},null,2),'KST-복원전사본.json');}
 function showBlocked(){
  if(!isWriteBlocked())return false;
  let box=document.getElementById('portfolioRecoveryHold');if(box)return true;
  box=el('section');box.id='portfolioRecoveryHold';box.setAttribute('role','alert');box.setAttribute('aria-label','복원 확인 필요');box.style.cssText='position:fixed;inset:0;z-index:100001;background:#fff;color:#17263b;padding:28px;overflow:auto;font:16px/1.6 sans-serif';
  box.append(el('h2','복원 상태 확인이 필요합니다'));
  box.append(el('p','중단되거나 손상된 복원 사본이 있습니다. 기록·복원·자동 갱신을 중지했습니다. 자료를 자동으로 복구하거나 초기화하지 않습니다.'));
  const result=el('p','읽을 수 있는 복원 전 사본은 아래에서 내보낼 수 있습니다. 사본 자체가 손상되면 내보내기도 중단합니다. 원본을 삭제하거나 재설치하지 말고 별도 검토하세요. 이 파일에는 개인 금융 기록이 있으므로 공개하지 마세요.');
  box.append(btn('복원 전 사본 내보내기',()=>{try{downloadJournal();result.textContent='사본을 내보냈습니다. 일반 복원 파일로 불러오지 마세요.';}catch{result.textContent='사본이 손상되었거나 지원하지 않는 형식이어서 내보내지 못했습니다. 원본 저장값은 변경하지 않았습니다.';}}),result);
  document.body.append(box);return true;
 }
 function btn(text,fn){const b=el('button',text);b.type='button';b.style.cssText='min-height:44px;padding:10px;border:1px solid #90caf9;border-radius:8px;background:#eef5ff;color:#17446b;font:inherit;cursor:pointer';b.addEventListener('click',fn);return b;}
 let generation=0;
 window.importData=async function(event){
  const run=++generation,file=event.target.files[0];event.target.value='';if(!file)return;
  document.getElementById('portfolioRestorePreview')?.remove();
  try{
   if(isWriteBlocked())throw Error();if(file.size>B.MAX_BYTES)throw Error();const plan=B.parse(await file.text());if(run!==generation)return;
   const rows=B.preview(localStorage,plan),liveBefore=JSON.stringify(effective());const box=el('section');box.id='portfolioRestorePreview';box.style.cssText='background:#f3f7ff;padding:12px;border:1px solid #90caf9;border-radius:10px;margin-top:12px;overflow-wrap:anywhere';box.setAttribute('aria-label','전체 백업 복원 미리보기');
   box.append(el('h3','복원 미리보기 · 아직 적용하지 않았습니다'));
   const names={v5_gen:'일반',v5_dom:'ISA',v5_ov:'해외',v5_pen:'연금'};
   for(const k of B.ACCOUNTS){const r=rows.find(r=>r.key===k);box.append(el('p',names[k]+': '+(r?r.before+'개 → '+r.after+'개':'백업에 없음 · 현재 값 유지')));}
   for(const w of plan.warnings)box.append(el('p',w));
   box.append(el('p','포함된 계좌·기록 그룹은 교체하며 빠진 그룹은 유지합니다. 새 활동의 중복 ID·손상 데이터는 거절합니다. 구버전 기록은 자동 분류하지 않습니다. 계좌가 빈 배열이면 빈 계좌로 복원합니다.'));
   box.append(el('p','변경 대상 키 '+rows.filter(r=>r.changed).length+'개. 적용 전 사본을 이 기기에 보관합니다. 사본 저장 실패 시 복원하지 않습니다. 다른 탭은 닫고 진행하세요. 여러 저장 키의 완전한 동시 변경은 보장하지 않습니다.'));
   box.append(btn('복원 적용',()=>{try{if(run!==generation)throw Error('이전 미리보기입니다. 파일을 다시 선택하세요.');if(JSON.stringify(effective())!==liveBefore)throw Error('미리보기 이후 화면 자료가 바뀌었습니다. 파일을 다시 선택하세요.');prepareRuntimeChange();B.apply(localStorage,plan);generation++;box.remove();refresh();msg(plan.legacy?'구버전 백업에 포함된 자료만 복원했습니다. 없는 계좌·설정은 복구된 것이 아닙니다. 추가 편집 전에는 적용 직전 상태로 되돌릴 수 있습니다.':'전체 백업 복원 완료. 추가 편집 전에는 적용 직전 상태로 되돌릴 수 있습니다.');}catch(e){msg(e.message||'복원 실패');}}),btn('복원 취소',()=>{generation++;box.remove();msg('복원을 취소했습니다. 기존 자료는 그대로입니다.');}));
   host.append(box);box.scrollIntoView({block:'center'});
  }catch{if(run!==generation)return;msg('복원 파일을 거절했습니다. JSON·버전·필드·용량을 확인하세요. 기존 자료는 변경하지 않았습니다.');}
 };
 host.append(el('p','전체 백업 v7: 일반·ISA·해외·연금, 자산·입출금/내부 매매 분류·배당·가계부·지수 원본과 별도 관측/충돌 보류 기록, 관련 설정. v4·v5·v6 가져오기도 지원합니다. 새 v7 파일은 구버전 앱에서 열지 마세요. API 키·잠금 비밀번호·GAS 주소는 제외합니다. 레이더는 별도 백업하세요.'));
 host.append(el('p','같은 날짜의 구버전 지수 관측은 원문을 보존하고 계산에서 읽기 전용 보류합니다. 충돌 대안은 별도 보관하며 자동 채택하지 않습니다. 지수 원본과 보조 기록의 연결이 달라지면 보조 기록을 보류하며 자동 삭제·재연결하지 않습니다.'));
 host.append(btn('전체 복원 되돌리기',()=>{try{if(!confirm('가장 최근 전체 복원 직전 상태로 돌아갈까요? 복원 이후 편집이 감지되면 덮어쓰지 않고 중단합니다.'))return;prepareRuntimeChange();B.undo(localStorage);generation++;document.getElementById('portfolioRestorePreview')?.remove();refresh();msg('전체 복원 직전 상태로 되돌렸습니다.');}catch(e){msg(e.message);}}));
 host.append(btn('복원 전 사본 내보내기',()=>{try{downloadJournal();msg('복원 전 사본을 내보냈습니다. 이 파일은 기술 지원용이며 일반 복원 파일과 다릅니다.');}catch(e){msg(e.message);}}));
 if(isWriteBlocked()){showBlocked();msg('중단되거나 손상된 전체 복원 사본이 있습니다. 기록·복원·자동 갱신을 중지하고 사본을 내보내세요. 자동 복구하지 않습니다.');}
})();
