// 시험 전용: 네트워크 접근 시도를 기록하고 차단한다(--require 로 주입). 마커 파일 경로는 NO_NET_MARKER.
'use strict';
const fs = require('node:fs');
const mark = what => { try { fs.appendFileSync(process.env.NO_NET_MARKER, what + '\n'); } catch { /* ignore */ } };
for (const m of ['https', 'http']) { const mod = require('node:' + m); for (const f of ['request', 'get']) mod[f] = () => { mark(m + '.' + f); throw new Error('network blocked by test'); }; }
const net = require('node:net'); net.connect = net.createConnection = () => { mark('net.connect'); throw new Error('network blocked by test'); };
const tls = require('node:tls'); tls.connect = () => { mark('tls.connect'); throw new Error('network blocked by test'); };
const dns = require('node:dns'); dns.lookup = () => { mark('dns.lookup'); throw new Error('network blocked by test'); };
if (globalThis.fetch) globalThis.fetch = () => { mark('fetch'); throw new Error('network blocked by test'); };
