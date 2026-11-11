// Offline candidate only. No SDK, OAuth flow, key downloads, credential files or network.
export class ClosedError extends Error {
  constructor(code, status = 503) { super(code); this.name = 'ClosedError'; this.code = code; this.status = status; }
}
export const deny = (code, status) => { throw new ClosedError(code, status); };
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const safeSecond = n => Number.isSafeInteger(n) && n >= 0;
const encoder = new TextEncoder();

// JSON.parse accepts duplicate keys. Reject them, excessive depth and prototype names first.
function strictJSON(text) {
  const tokens = text.match(/"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null|[{}\[\],:]|\S/g) || [];
  let p = 0;
  const eat = expected => { if (tokens[p++] !== expected) deny('auth-invalid', 401); };
  function value(depth) {
    if (depth > 12) deny('auth-invalid', 401);
    if (tokens[p] === '{') {
      p++; const keys = new Set();
      if (tokens[p] === '}') { p++; return; }
      while (true) {
        const raw = tokens[p++]; if (!raw || raw[0] !== '"') deny('auth-invalid', 401);
        const key = JSON.parse(raw);
        if (keys.has(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) deny('auth-invalid', 401);
        keys.add(key); eat(':'); value(depth + 1);
        if (tokens[p] === '}') { p++; return; } eat(',');
      }
    }
    if (tokens[p] === '[') {
      p++; if (tokens[p] === ']') { p++; return; }
      while (true) { value(depth + 1); if (tokens[p] === ']') { p++; return; } eat(','); }
    }
    const token = tokens[p++];
    if (!token || !/^(?:"|-?[0-9]|true$|false$|null$)/.test(token)) deny('auth-invalid', 401);
    JSON.parse(token);
  }
  value(0); if (p !== tokens.length) deny('auth-invalid', 401);
  const parsed = JSON.parse(text); if (!object(parsed)) deny('auth-invalid', 401); return parsed;
}

function decode(segment) {
  if (!/^[A-Za-z0-9_-]+$/.test(segment) || segment.length % 4 === 1) deny('auth-invalid', 401);
  const raw = atob(segment.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - segment.length % 4) % 4));
  const canonical = btoa(raw).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  if (canonical !== segment) deny('auth-invalid', 401);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

export function validateServerAuthConfig(config) {
  if (!object(config) || typeof config.projectId !== 'string' || !/^synthetic-[a-z0-9-]{3,60}$/.test(config.projectId) ||
      typeof config.ownerUid !== 'string' || !/^synthetic-[A-Za-z0-9_-]{1,100}$/.test(config.ownerUid)) deny('auth-config-unavailable');
  return Object.freeze({ projectId: config.projectId, ownerUid: config.ownerUid });
}

// Returned principals are projections, never the raw JWT, email, profile or signature.
export function createFirebaseVerifier({ config, keyProvider, subtle, now = Date.now } = {}) {
  const cfg = validateServerAuthConfig(config);
  if (typeof keyProvider !== 'function' || !subtle || typeof subtle.verify !== 'function') deny('auth-dependency-unavailable');
  return async function verify(authorization) {
    try {
      let lastNow = -1;
      const checkedNow = () => {
        const value = now();
        if (!Number.isSafeInteger(value) || value < 0 || value < lastNow) deny('auth-clock-unavailable');
        lastNow = value; return value;
      };
      if (typeof authorization !== 'string' || authorization.length > 8192 || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) deny('auth-invalid', 401);
      const jwt = authorization.slice(7), segments = jwt.split('.');
      if (segments.length !== 3) deny('auth-invalid', 401);
      const decoder = new TextDecoder('utf-8', { fatal: true });
      const header = strictJSON(decoder.decode(decode(segments[0])));
      const claims = strictJSON(decoder.decode(decode(segments[1])));
      if (header.alg !== 'RS256' || (header.typ !== undefined && header.typ !== 'JWT') ||
          typeof header.kid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(header.kid) ||
          Object.keys(header).some(k => !['alg', 'typ', 'kid'].includes(k))) deny('auth-invalid', 401);
      const second = Math.floor(checkedNow() / 1000);
      if (!safeSecond(second) || claims.aud !== cfg.projectId || claims.iss !== `https://securetoken.google.com/${cfg.projectId}` ||
          claims.sub !== cfg.ownerUid || (claims.user_id !== undefined && claims.user_id !== cfg.ownerUid) ||
          !safeSecond(claims.exp) || !safeSecond(claims.iat) || !safeSecond(claims.auth_time) ||
          claims.exp <= second || claims.iat > second || claims.auth_time > claims.iat ||
          claims.exp <= claims.iat || claims.exp - claims.iat > 3600 || second - claims.auth_time > 900 ||
          (claims.nbf !== undefined && (!safeSecond(claims.nbf) || claims.nbf > second)) ||
          !object(claims.firebase) || claims.firebase.sign_in_provider !== 'google.com' ||
          claims.firebase.tenant !== undefined) deny('auth-invalid', 401);
      // The provider is server-owned. No URL or supplied key is accepted from a request/JWT.
      let material;
      try { material = await keyProvider(Object.freeze({ kid: header.kid, projectId: cfg.projectId })); }
      catch { deny('auth-keys-unavailable'); }
      const key = material && material.key, keyNow = checkedNow();
      if (!material || material.kid !== header.kid || !Number.isSafeInteger(material.validUntilMs) ||
          material.validUntilMs <= keyNow || !key || key.type !== 'public' ||
          key.algorithm?.name !== 'RSASSA-PKCS1-v1_5' || key.algorithm?.hash?.name !== 'SHA-256' ||
          key.algorithm?.modulusLength < 2048 || !key.usages.includes('verify')) deny('auth-keys-unavailable');
      let validSignature;
      const signature = decode(segments[2]);
      try { validSignature = await subtle.verify('RSASSA-PKCS1-v1_5', key, signature, encoder.encode(segments[0] + '.' + segments[1])); }
      catch { deny('auth-unavailable', 401); }
      if (validSignature !== true) deny('auth-invalid', 401);
      const finalNow = checkedNow(), finalSecond = Math.floor(finalNow / 1000);
      if (material.validUntilMs <= finalNow) deny('auth-keys-unavailable');
      if (finalSecond >= claims.exp || finalSecond - claims.auth_time > 900) deny('auth-invalid', 401);
      return Object.freeze({ uid: cfg.ownerUid, projectId: cfg.projectId, authTime: claims.auth_time, issuedAt: claims.iat, expiresAt: claims.exp });
    } catch (error) { if (error instanceof ClosedError) throw error; deny('auth-unavailable', 401); }
  };
}

// A future reviewed official Firebase key fetch/rotation adapter must replace this dependency.
// This candidate never silently falls back to an emulator, unsigned JWT or request-supplied key.
export async function unavailableOfficialKeyProvider() { deny('official-key-provider-not-implemented'); }
