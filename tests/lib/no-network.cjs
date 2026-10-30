'use strict';
/* 19단계: 시험 프로세스 외부 접속 원천 차단. node --require 로 불러와 net/dns/http(s)/fetch를 가로챈다.
   127.0.0.1·localhost·::1 만 허용. 그 밖의 접속 시도는 즉시 예외를 던지고 기록한다(process 종료 시 시도 수 출력, 0이어야 정상). */
if (globalThis.__hasNoNetworkInstalled) { module.exports = globalThis.__hasNoNetworkInstalled; return; }
const net = require('net'), dns = require('dns'), tls = require('tls');
const LOCAL = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0', '']);
const attempts = []; process.env.HAS_TEST_NO_NETWORK = '1';
const hostOf = a => { const o = a[0]; if (o && typeof o === 'object') return String(o.host || o.hostname || o.path ? (o.host || o.hostname || '') : ''); return typeof a[1] === 'string' ? a[1] : ''; };
const deny = (what, host) => { attempts.push(what + ':' + host); const e = new Error('NO_EXTERNAL_NETWORK: 시험 중 외부 접속 시도 차단 (' + what + ' ' + host + ')'); e.code = 'NO_EXTERNAL_NETWORK'; throw e; };
// 22단계: Node의 내부 connect 인자 정규화에 의존하지 않고 요청 생성 전에 차단한다.
for (const protocol of ['http', 'https']) {
  const mod = require(protocol);
  for (const method of ['request', 'get']) {
    const original = mod[method];
    mod[method] = function (...args) {
      const input = args[0]; let host = '';
      if (typeof input === 'string' || input instanceof URL) { try { host = new URL(input).hostname; } catch { deny(protocol, 'invalid-url'); } }
      else if (input && typeof input === 'object') host = input.hostname || input.host || 'localhost';
      if (!LOCAL.has(host)) deny(protocol, host);
      return original.apply(this, args);
    };
  }
}
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...a) { const o = a[0]; if (o && typeof o === 'object' && o.path) return origConnect.apply(this, a); const host = o && typeof o === 'object' ? (o.host || '') : (typeof a[1] === 'string' ? a[1] : ''); if (!LOCAL.has(host)) deny('connect', host); return origConnect.apply(this, a); };
const origTls = tls.connect; tls.connect = function (...a) { const o = a[0] || {}; deny('tls', String(o.host || o.servername || '')); return origTls.apply(this, a); };
for (const fn of ['lookup', 'resolve', 'resolve4', 'resolve6']) { const o = dns[fn]; dns[fn] = function (host, ...rest) { if (!LOCAL.has(String(host))) deny('dns.' + fn, String(host)); return o.call(this, host, ...rest); }; }
if (typeof globalThis.fetch === 'function') { const f = globalThis.fetch; globalThis.fetch = function (u, ...r) { let h = ''; try { h = new URL(typeof u === 'string' ? u : u.url).hostname; } catch { } if (!LOCAL.has(h)) deny('fetch', h || String(u)); return f.call(this, u, ...r); }; }
process.on('exit', () => { if (attempts.length && process.env.HAS_BLOCK_LOG) { try { require('fs').appendFileSync(process.env.HAS_BLOCK_LOG, attempts.map(x => process.pid + ' ' + x).join('\n') + '\n'); } catch { } } if (attempts.length) { console.error('외부 접속 시도 ' + attempts.length + '회 차단됨: ' + attempts.join(', ')); } });
globalThis.__hasNoNetworkInstalled = { attempts }; module.exports = globalThis.__hasNoNetworkInstalled;
