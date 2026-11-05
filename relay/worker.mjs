/* HAS 27단계 — Cloudflare Workers 진입점. 비밀(KIS_APP_KEY, KIS_APP_SECRET, HAS_RELAY_PROOF)은 Cloudflare 비밀 저장소(secret)로만 넣는다. 이 파일·저장소에는 없다. */
import core from './relay-core.js';
export default {
  async fetch(request, env) {
    const url = new URL(request.url), headers = {};
    request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const r = await core.handle({ method: request.method, path: url.pathname + (url.search ? '?' : ''), headers }, env, (u, i) => fetch(u, i), Date.now());
    if (r.log) console.log(JSON.stringify(r.log));
    const h = new Headers(r.headers); h.set('content-type', 'application/json; charset=utf-8');
    return new Response(r.body === null ? null : JSON.stringify(r.body), { status: r.status, headers: h });
  }
};
