'use strict';
// Host-side sequential polling: await each async observation before judging it.
async function pollAsync(probe,{accept=value=>Boolean(value),timeoutMs=15000,intervalMs=25,label='async condition',clock=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const started=clock();let last,finished=false,timer;
 const timeout=()=>Error('Timed out waiting for '+label+'; last='+JSON.stringify(last));
 const work=async()=>{for(;;){
   last=await probe();if(finished)return;
   if(accept(last))return last;
   if(clock()-started>=timeoutMs)throw timeout();
   await sleep(intervalMs);if(finished)return;
 }};
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(timeout()),timeoutMs);});
 try{return await Promise.race([work(),deadline]);}finally{finished=true;clearTimeout(timer);}
}
module.exports={pollAsync};
