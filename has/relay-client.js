/* HAS 27단계 — 개인용 중계 서버 클라이언트(순수 모듈: 저장소·네트워크는 주입). 한 번에 종목 1개만 요청하고, 보유 수량·금액은 보내지 않는다(종목코드만).
   응답은 quote-model.normalize 를 거쳐 '미검증' 시세로만 쓴다. 비밀(접속 암호)은 이 모듈이 기록·반환하지 않는다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./quote-model.js')); else root.HASRelayClient = factory(root.HASQuoteModel); })(typeof globalThis !== 'undefined' ? globalThis : this, function (QM) {
  'use strict';
  var CFG_KEY = 'has_relay_cfg'; // 백업·GitHub 대상 아님(기기 보관 전용)
  function validUrl(u) { try { var x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password && !x.search && !x.hash; } catch (e) { return false; } }
  function loadCfg(storage) { try { var c = JSON.parse(storage.getItem(CFG_KEY) || 'null'); return c && validUrl(c.url) && typeof c.secret === 'string' && c.secret.length >= 24 ? { url: c.url.replace(/\/$/, ''), secret: c.secret } : null; } catch (e) { return null; } }
  function saveCfg(storage, url, secret) { if (!validUrl(url)) return { ok: false, reason: 'bad-url' }; if (typeof secret !== 'string' || secret.length < 24) return { ok: false, reason: 'secret-too-short' };
    try { storage.setItem(CFG_KEY, JSON.stringify({ url: url, secret: secret })); return { ok: true }; } catch (e) { return { ok: false, reason: 'storage-failed' }; } }
  function clearCfg(storage) { try { storage.removeItem(CFG_KEY); return true; } catch (e) { return false; } }
  function pathFor(market, ticker) { if (market === 'KR' && /^[0-9A-Z]{6}$/.test(ticker)) return '/v1/quote/kr/' + ticker; if (market === 'US' && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) return '/v1/quote/us/' + ticker; return null; }
  async function fetchQuote(cfg, market, ticker, fetchFn) {
    if (!cfg) return { ok: false, reason: 'not-configured' }; var p = pathFor(market, ticker); if (!p) return { ok: false, reason: 'bad-ticker' };
    var r; try { r = await fetchFn(cfg.url + p, { method: 'GET', headers: { 'x-has-auth': cfg.secret }, credentials: 'omit', referrerPolicy: 'no-referrer' }); } catch (e) { return { ok: false, reason: 'network' }; }
    var j = null; try { j = await r.json(); } catch (e) { return { ok: false, reason: 'bad-response', status: r.status }; }
    if (!r.ok || !j || !j.ok) return { ok: false, reason: (j && typeof j.reason === 'string') ? j.reason : 'http-' + r.status, status: r.status };
    var n = QM.normalize(Object.assign({}, j.quote, { verification: 'unverified' })), q = n && n.ok ? n.quote : null; if (!q || q.ticker !== ticker || q.market !== market) return { ok: false, reason: 'invalid-quote' };
    return { ok: true, quote: q };
  }
  return Object.freeze({ CFG_KEY: CFG_KEY, loadCfg: loadCfg, saveCfg: saveCfg, clearCfg: clearCfg, fetchQuote: fetchQuote, pathFor: pathFor });
});
