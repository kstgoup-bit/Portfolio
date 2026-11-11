/* Read-only audit of the KR candidate list. Optional second argument: path to a user-supplied OFFLINE listing JSON. Never saves. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), U = require('../kr-radar/universe.js');
const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'kr-radar/data/universe.json'), 'utf8'));
const listingPath = process.argv[2];
if (listingPath) {
  const listing = JSON.parse(fs.readFileSync(listingPath, 'utf8'));
  const { data: checked, report } = U.crossCheck(data, listing, new Date().toISOString().slice(0, 10));
  console.log(JSON.stringify({ audit: U.audit(checked), report }, null, 2));
} else console.log(JSON.stringify(U.audit(data), null, 2));
