'use strict';
// Validate exact current bytes and reverse only the enumerated menu/copy changes.
// Historical baseline pins remain unchanged; this adds a new preservation layer.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..'),edits=require('./risk-menu-edits.json'),pins=require('./risk-menu-pins.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function beforeRiskMenuBytes(file){
 let bytes=require('./speed-minimal-projection.cjs').beforeSpeedBytes(file);
 if(edits[file]){
  if(sha(bytes)!==pins.currentSha256[file])throw Error('Unreviewed risk-menu change: '+file);
  let text=bytes.toString('utf8');
  for(const[current,previous]of edits[file].slice().reverse()){
   if(!current||text.split(current).length!==2)throw Error('Risk-menu projection not unique: '+file);
   text=text.replace(current,()=>previous);
  }
  bytes=Buffer.from(text,'utf8');
  if(sha(bytes)!==pins.baselineSha256[file])throw Error('Risk-menu source baseline mismatch: '+file);
 }
 return bytes;
}
module.exports={beforeRiskMenuBytes};
