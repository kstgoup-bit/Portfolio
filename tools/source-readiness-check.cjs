#!/usr/bin/env node
'use strict';
/* Explicit local manifest only. Bounded read, no network, writes or raw input/error echo. */
const fs=require('node:fs');
const S=require('../has/source-readiness');
let fd;
try{
  if(process.argv.length!==3)throw Error('input');
  const path=process.argv[2],stat=fs.lstatSync(path);
  if(!stat.isFile()||stat.size>S.MAX_BYTES)throw Error('input');
  fd=fs.openSync(path,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  const opened=fs.fstatSync(fd);
  if(!opened.isFile()||opened.size>S.MAX_BYTES)throw Error('input');
  const buffer=Buffer.alloc(S.MAX_BYTES+1);
  let length=0,n;
  while(length<buffer.length&&(n=fs.readSync(fd,buffer,length,buffer.length-length,null))>0)length+=n;
  if(length>S.MAX_BYTES)throw Error('input');
  const r=S.inspectJSON(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,length)));
  process.stdout.write(JSON.stringify(r,null,2)+'\n');
  // 0 means declarations complete only, never live or verified.
  process.exitCode=r.status==='declared-only'?0:r.status==='incomplete'?2:1;
}catch(_){process.stdout.write(JSON.stringify({status:'invalid',verification:'unverified',liveConnection:'unavailable',issues:['local-manifest-unreadable-or-invalid']})+'\n');process.exitCode=1;}
finally{if(fd!==undefined)fs.closeSync(fd);}
