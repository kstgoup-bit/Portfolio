'use strict';
// Explicit local journal only. Never reads app storage; no credential/price fields.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{base,validJournal}=require('./request-budget-stage22c.cjs');
function fileStore(file){
 if(typeof file!=='string'||!path.isAbsolute(file))throw Error('ABSOLUTE_JOURNAL_PATH_REQUIRED');
 const read=()=>{if(fs.lstatSync(file).isSymbolicLink())throw Error('SYMLINK_FORBIDDEN');const s=JSON.parse(fs.readFileSync(file,'utf8'));if(!validJournal(s))throw Error('JOURNAL_INVALID');return s;};
 return Object.freeze({
  initializeNew(){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(base()));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}},
  read,
  cas(expectedRevision,next){
   if(!validJournal(next)||next.revision!==expectedRevision+1)throw Error('INVALID_COMMIT');
   let lock,tmp;
   try{
    lock=fs.openSync(file+'.lock','wx',0o600);
    const current=read();if(current.revision!==expectedRevision)return false;
    // Reservations/outcomes cannot delete or rewrite history, including after restart.
    const count=next.entries.length-current.entries.length;
    if(count!==0&&count!==1)throw Error('HISTORY_TRUNCATION');
    if(count===1){if(JSON.stringify(next.entries.slice(0,-1))!==JSON.stringify(current.entries)||next.entries.at(-1).status!=='reserved')throw Error('HISTORY_REWRITE');}
    else {let changed=0;for(let i=0;i<current.entries.length;i++){const a=current.entries[i],b=next.entries[i];if(JSON.stringify(a)!==JSON.stringify(b)){changed++;if(a.status!=='reserved'||b.status==='reserved'||JSON.stringify({...a,status:b.status})!==JSON.stringify(b))throw Error('HISTORY_REWRITE');}}if(changed!==1)throw Error('OUTCOME_CHANGE_REQUIRED');}
    tmp=file+'.'+randomUUID()+'.tmp';const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(next));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);tmp=null;const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
    return true;
   }finally{if(tmp){try{fs.unlinkSync(tmp);}catch{}}if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(file+'.lock');}}
  }
 });
}
module.exports={fileStore};
