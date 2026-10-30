'use strict';
const fs=require('node:fs'),path=require('node:path'),{fileStore}=require('./file-budget-store-stage22c.cjs'),{createBudget}=require('./request-budget-stage22c.cjs');
// No auto-initialization/reset: open the same existing approval journal for every provider/run.
function openLedger(file){
 if(typeof file!=='string'||!path.isAbsolute(file))throw Error('JOURNAL_PATH_REQUIRED');
 let fd;const lock=file+'.run-lock';
 try{
  const dir=fs.lstatSync(path.dirname(file)),stat=fs.lstatSync(file);
  if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)!==0||!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.uid!==process.getuid()||dir.uid!==process.getuid())throw Error();
  fd=fs.openSync(lock,'wx',0o600);fs.fsyncSync(fd);
  const budget=createBudget(fileStore(file));budget.snapshot();const initial=fs.fstatSync(fd);let released=false;
  return {budget,lease:Object.freeze({assertHeld(){if(released)throw Error('LEASE_LOST');const s=fs.lstatSync(lock);if(s.isSymbolicLink()||s.ino!==initial.ino||s.dev!==initial.dev)throw Error('LEASE_LOST');},release(){if(released)return;this.assertHeld();fs.closeSync(fd);fs.unlinkSync(lock);released=true;}})};
 }catch{if(fd!==undefined){try{fs.closeSync(fd);fs.unlinkSync(lock);}catch{}}throw Error('JOURNAL_NOT_READY');}
}
module.exports={openLedger};
