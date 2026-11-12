'use strict';
// Verify the exact candidate, reverse ONLY the two scheduling edits, then verify
// the exact 127bca49 bytes before passing them to unchanged historical pins.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),edits=require('./speed-minimal-edits.json'),pins=require('./speed-minimal-pins.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function beforeSpeedBytes(file){
 let b=fs.readFileSync(path.join(root,file));if(!edits[file])return b;
 if(sha(b)!==pins.currentSha256[file])throw Error('Unreviewed speed change: '+file);
 let s=b.toString();for(const[current,previous]of edits[file].slice().reverse()){
  if(!current||s.split(current).length!==2)throw Error('Non-unique speed projection: '+file);
  s=s.replace(current,()=>previous);
 }
 b=Buffer.from(s);if(sha(b)!==pins.baselineSha256[file])throw Error('Speed baseline mismatch: '+file);return b;
}
module.exports={beforeSpeedBytes};
