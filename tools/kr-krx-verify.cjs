/* OFFLINE: 사용자가 직접 내려받은 KRX상장종목정보 응답 파일(XML/JSON)을 후보 목록과 대조한다. 네트워크·인증키·저장 없음.
   usage: node tools/kr-krx-verify.cjs <response-file>... [--today=YYYY-MM-DD] [--attest-official] [--exclusions=file.json] [--rights-confirmed]
   --attest-official 없이는 어떤 종목도 verified 로 기록되지 않는다(합성/예시 파일로 공식 검증 성공을 만들 수 없음). 출력에는 원본 응답을 넣지 않는다. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), K = require('../kr-radar/krx-api.js');
const args = process.argv.slice(2), files = args.filter(a => !a.startsWith('--')), opt = n => (args.find(a => a.startsWith('--' + n + '=')) || '').split('=').slice(1).join('=');
if (!files.length) { console.error('response file path required'); process.exit(2); }
const today = opt('today') || new Date().toISOString().slice(0, 10), attest = args.includes('--attest-official');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'kr-radar/data/universe.json'), 'utf8'));
const exclusions = opt('exclusions') ? JSON.parse(fs.readFileSync(opt('exclusions'), 'utf8')) : [];
const pages = files.map(f => { const raw = fs.readFileSync(f); return K.parseResponse(raw.toString('utf8'), { origin: attest ? 'user-supplied-official' : 'fixture', responseSha256: crypto.createHash('sha256').update(raw).digest('hex') }); });
const listing = pages.length === 1 ? { ...pages[0], baseDate: pages[0].rows[0] && pages[0].rows[0].baseDate } : K.assemblePages(pages);
const rep = K.compareCandidates(data, listing, { today, exclusions, rightsConfirmed: args.includes('--rights-confirmed') });
console.log(JSON.stringify({ files: files.length, pageErrors: pages.map(p => p.errors), mode: rep.mode, errors: rep.errors, counts: rep.counts, officialVerifiedCount: rep.officialVerifiedCount, realApiRequests: 0, realPriceApiRequests: 0, actualActiveCount: 0, notes: rep.notes, log: rep.log.filter(l => l.result !== 'pending').slice(0, 200) }, null, 2));
