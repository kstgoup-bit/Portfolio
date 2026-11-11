'use strict';
// Portable source proof: reverse only enumerated reviewed edits, then verify the
// exact baseline SHA256. No local Git commit or Git executable is required.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..');
const edits=require('./has-daily-repair-edits.json'),pins=require('./daily-repair-pins.json');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function beforeDailyRepairBytes(file){
  let bytes=require('./daily-followup-projection.cjs').beforeFollowupBytes(file);
  if(edits[file]){
    let text=bytes.toString('utf8');
    for(const [current,previous]of edits[file].slice().reverse()){
      if(!current||text.split(current).length!==2)throw Error('Daily repair projection is not unique: '+file);
      text=text.replace(current,()=>previous);
    }
    bytes=Buffer.from(text,'utf8');
  }
  if(pins.baselineSha256[file]&&sha(bytes)!==pins.baselineSha256[file])throw Error('Unreviewed daily repair source change: '+file);
  return bytes;
}
const beforeDailyRepairText=file=>beforeDailyRepairBytes(file).toString('utf8');
function assertPortableKisPreservation(){
  const original=require('./kis-protected-source.json');
  for(const[file,hash]of Object.entries(original.files))if(sha(beforeDailyRepairBytes(file))!==hash)throw Error('KIS protected source changed: '+file);
  const added=[];
  function walk(file){const full=path.join(ROOT,file);if(fs.statSync(full).isDirectory()){for(const name of fs.readdirSync(full))walk(file+'/'+name);}else if(!Object.hasOwn(original.files,file))added.push(file);}
  original.protectedPaths.forEach(walk);
  if(JSON.stringify(added.sort())!==JSON.stringify(Object.keys(pins.addedRuntimeFiles).sort()))throw Error('Unreviewed protected source addition');
  for(const[file,hash]of Object.entries(pins.addedRuntimeFiles))if(sha(require('./daily-followup-projection.cjs').beforeFollowupBytes(file))!==hash)throw Error('Reviewed new runtime source differs: '+file);
  return Object.keys(original.files).length;
}
module.exports={beforeDailyRepairBytes,beforeDailyRepairText,assertPortableKisPreservation};
