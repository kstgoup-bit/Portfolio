/* Offline verification of the candidate list against a USER-SUPPLIED official listing file. Never calls the network. Never saves; prints a report.
   usage: node tools/kr-listing-verify.cjs <listing-package.json> [YYYY-MM-DD today] */
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), L = require('../kr-radar/listing.js'), U = require('../kr-radar/universe.js');
const file = process.argv[2]; if (!file) { console.error('listing package path required'); process.exit(2); }
const today = process.argv[3] || new Date().toISOString().slice(0, 10);
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'kr-radar/data/universe.json'), 'utf8'));
const raw = fs.readFileSync(file), pkg = JSON.parse(raw.toString('utf8'));
// The hash of the supplied file is reported; provenance.sha256 must describe the ORIGINAL official download, so it is compared only when the package says it wraps this exact file.
const { data: out, report } = L.crossCheckOfficial(data, pkg, { today });
console.log(JSON.stringify({ suppliedFileSha256: crypto.createHash('sha256').update(raw).digest('hex'), audit: U.audit(out), report: { ...report, matched: report.matched.length, notFound: report.notFound.length, blockedByPackage: report.blockedByPackage.length } }, null, 2));
