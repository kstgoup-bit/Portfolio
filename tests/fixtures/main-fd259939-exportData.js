function exportData() {
  var calcData={};
  for(var i=0;i<localStorage.length;i++){
    var k=localStorage.key(i);
    if(k&&(k.startsWith("calc_q")||k.startsWith("calc_p"))) calcData[k]=localStorage.getItem(k);
  }
  var ledgerData={};
  try{ledgerData=JSON.parse(localStorage.getItem("v5_ledger")||"{}");}catch(e){}
  var fxHistory=[];
  try{fxHistory=JSON.parse(localStorage.getItem("v5_fxHistory")||"[]");}catch(e){}
  var fgVal=localStorage.getItem("v5_fg")||null;
  var memoData=[];
  try{memoData=JSON.parse(localStorage.getItem("v5_memos")||"[]");}catch(e){}
  var userThemeMap={};
  try{userThemeMap=JSON.parse(localStorage.getItem("v5_userThemeMap")||"{}");}catch(e){}
  var backup={version:"v5",date:new Date().toLocaleString("ko-KR"),domStocks:domStocks,ovStocks:ovStocks,penStocks:penStocks,divList:divList,snapshots:snapshots,deposits:deposits,gasUrl:gasUrl,usdKrw:parseFloat(document.getElementById("usdKrw").value)||1370,calcData:calcData,ledger:ledgerData,fxHistory:fxHistory,fg:fgVal,memos:memoData,userThemeMap:userThemeMap};
  var blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
  var url=URL.createObjectURL(blob);
  var a=document.createElement("a");
  a.href=url; a.download="포트폴리오_백업_"+new Date().toISOString().slice(0,10)+".json";
  a.click(); URL.revokeObjectURL(url);
  document.getElementById("backupMsg").textContent="✅ 백업 완료! 카카오톡 나에게 보내기로 보관하세요.";
  document.getElementById("backupMsg").style.color="var(--green-mid)";
}
