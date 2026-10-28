/* Offline check: does a listing package really come from the original CSV? Never touches the network.
   usage: node tools/kr-listing-integrity.cjs <original.csv> <package.json> */
'use strict';
const fs = require('node:fs'), crypto = require('node:crypto'), I = require('../kr-radar/integrity.js');
const [csv, pkg] = process.argv.slice(2); if (!pkg) { console.error('usage: <original.csv> <package.json>'); process.exit(2); }
const raw = fs.readFileSync(csv), r = I.verifyPackageAgainstCsv(raw.toString('utf8'), JSON.parse(fs.readFileSync(pkg, 'utf8')), crypto.createHash('sha256').update(raw).digest('hex'));
console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1);
