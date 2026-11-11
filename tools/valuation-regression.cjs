'use strict';
// Explicit non-network subset, not a claim that the entire legacy suite passed.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),manifest=require('../docs/valuation/test-manifest.json');
const current=fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.cjs')).sort();
const expected=manifest.files.map(f=>path.basename(f)).concat(manifest.excluded).sort();
if(JSON.stringify(current)!==JSON.stringify(expected))throw new Error('Test inventory changed. Review the manifest instead of silently omitting new tests.');
console.log('Explicit exclusions:',manifest.excluded.join(', '));
const result=cp.spawnSync(process.execPath,['--require','./tests/lib/no-network.cjs','--test',...manifest.files],{cwd:root,stdio:'inherit'});
process.exit(result.status===null?1:result.status);
