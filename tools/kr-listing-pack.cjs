/* Wrap a user-supplied official listing CSV into a verification package (offline). Never calls the network; never stores keys.
   usage: node tools/kr-listing-pack.cjs <listing.csv> <out.json> <provider> <datasetName> <sourceUrl> <queriedAt YYYY-MM-DD> <licenseNote> */
'use strict';
const fs = require('node:fs'), crypto = require('node:crypto'), P = require('../kr-radar/pack.js');
const [csv, out, provider, datasetName, sourceUrl, queriedAt, licenseNote] = process.argv.slice(2);
if (!licenseNote) { console.error('인자 7개 필요: 위 usage 참조'); process.exit(2); }
const raw = fs.readFileSync(csv);
const r = P.buildPackage(raw.toString('utf8'), { provider, datasetName, sourceUrl, queriedAt, licenseNote }, { fileSha256: crypto.createHash('sha256').update(raw).digest('hex') });
if (!r.ok) { console.error(JSON.stringify(r.errors, null, 2)); process.exit(1); }
fs.writeFileSync(out, JSON.stringify(r.pkg, null, 1)); console.log('rows=' + r.pkg.rows.length + ' baseDate=' + r.pkg.provenance.baseDate + ' sha256=' + r.pkg.provenance.sha256);
