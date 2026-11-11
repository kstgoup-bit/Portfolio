'use strict';
// Reverse only this followup's enumerated edits before the existing historical
// proofs. Both current and prior byte hashes are pinned; no Git dependency.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..'),edits=require('./has-daily-followup-edits.json'),pins=require('./daily-followup-pins.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function beforeFollowupBytes(file){
 let bytes=fs.readFileSync(path.join(ROOT,file));
 if(edits[file]){
  if(sha(bytes)!==pins.currentSha256[file])throw Error('Unreviewed followup change: '+file);
  let text=bytes.toString('utf8');
  for(const[current,previous]of edits[file].slice().reverse()){
   if(!current||text.split(current).length!==2)throw Error('Followup projection not unique: '+file);
   text=text.replace(current,()=>previous);
  }
  bytes=Buffer.from(text,'utf8');
  if(sha(bytes)!==pins.baselineSha256[file])throw Error('Followup source baseline mismatch: '+file);
 }
 return bytes;
}
module.exports={beforeFollowupBytes};
