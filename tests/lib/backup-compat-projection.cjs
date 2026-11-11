'use strict';
// Reverse only the reviewed FG compatibility and truthful completion copy edits.
// Prior protection hashes stay unchanged; current and original bytes are pinned.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..'),edits=require('./has-backup-compat-edits.json'),pins=require('./backup-compat-pins.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function beforeBackupCompatBytes(file){
 let bytes=require('./risk-menu-projection.cjs').beforeRiskMenuBytes(file);
 if(edits[file]){
  if(sha(bytes)!==pins.currentSha256[file])throw Error('Unreviewed backup compatibility change: '+file);
  let text=bytes.toString('utf8');
  for(const[current,previous]of edits[file].slice().reverse()){
   if(!current||text.split(current).length!==2)throw Error('Backup compatibility projection not unique: '+file);
   text=text.replace(current,()=>previous);
  }
  bytes=Buffer.from(text,'utf8');
  if(sha(bytes)!==pins.baselineSha256[file])throw Error('Backup compatibility source baseline mismatch: '+file);
 }
 return bytes;
}
module.exports={beforeBackupCompatBytes};
