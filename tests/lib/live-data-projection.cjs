'use strict';
// Exact reviewed integration edits only; retain historical baseline pins unchanged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const edits=require('./live-data-edits.json'),pins=require('./live-data-pins.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function beforeLiveDataBytes(file){let bytes=fs.readFileSync(path.join(__dirname,'../..',file));if(!edits[file])return bytes;if(sha(bytes)!==pins.currentSha256[file])throw Error('Unreviewed live data integration: '+file);let text=bytes.toString();for(const [current,baseline]of edits[file].slice().reverse()){if(text.split(current).length!==2)throw Error('Non-unique live data projection');text=text.replace(current,()=>baseline);}bytes=Buffer.from(text);if(sha(bytes)!==pins.baselineSha256[file])throw Error('Live data baseline mismatch');return bytes;}
module.exports={beforeLiveDataBytes};
