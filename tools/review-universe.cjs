/* Read-only audit by default. A revision is produced in memory only, never saved here. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),V=require('../radar/verification.js');
const root=path.join(__dirname,'..');
const universe=JSON.parse(fs.readFileSync(path.join(root,'radar/data/universe.json'))),registry=JSON.parse(fs.readFileSync(path.join(root,'radar/data/eligibility.json')));
const asOf=process.argv[2]||new Date().toISOString().slice(0,10);
console.log(JSON.stringify({asOf,...V.auditUniverse(universe,registry,asOf)},null,2));
