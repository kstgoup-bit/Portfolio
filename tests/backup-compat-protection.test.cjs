'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const pins=require('./lib/backup-compat-pins.json'),F=require('./lib/backup-compat-projection.cjs'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
test('backup compatibility changes reverse to exact newest reviewed source in only two runtime files',()=>{
 a.equal(pins.remoteBaseline,'d7c15c5fa876ca7f887a1ac85f81d14d492c6247');a.equal(pins.baselineTree,'031b0d5c4d17ddbeecfb4d006f1aaced10b2d627');a.deepEqual(Object.keys(pins.currentSha256).sort(),['backup/core.js','backup/ui.js']);
 for(const file of Object.keys(pins.currentSha256)){a.equal(sha(fs.readFileSync(path.join(__dirname,'..',file))),pins.currentSha256[file]);a.equal(sha(F.beforeBackupCompatBytes(file)),pins.baselineSha256[file]);}
});
