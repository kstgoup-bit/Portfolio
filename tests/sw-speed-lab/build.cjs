'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=path.join(__dirname,'generated'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const kernel=fs.readFileSync(path.join(__dirname,'generation-cache.js'),'utf8');
const wrapper='const generation=HASGenerationCache.create({...HAS_RELEASE,scope:self.registration.scope},{caches,fetcher:fetch.bind(self),digest:crypto.subtle.digest.bind(crypto.subtle),getClient:id=>self.clients.get(id)});\nself.addEventListener("install",e=>e.waitUntil(generation.install()));\nself.addEventListener("activate",e=>e.waitUntil(generation.activate()));\nself.addEventListener("fetch",e=>{const response=generation.route(e);if(response)e.respondWith(response);});\n';
function build(rootDir=root){
 const files=new Set(['portfolio_v5.html','manifest.json','icon-192.png','icon-512.png']);
 function add(ref,from){if(/^(?:https?:|data:|#|\/\/)/.test(ref))return;if(/[?#]/.test(ref))throw Error('Unpinned query dependency: '+ref);const p=path.posix.normalize(path.posix.join(path.posix.dirname(from),ref));if(p.startsWith('../')||path.isAbsolute(p)||!fs.existsSync(path.join(rootDir,p)))throw Error('Invalid dependency: '+p);files.add(p);}
 const html=fs.readFileSync(path.join(rootDir,'portfolio_v5.html'),'utf8');
 for(const m of html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)=["']([^"']+)["'][^>]*>/g))add(m[1],'portfolio_v5.html');
 for(const p of files){if(!/\.(css|js)$/.test(p))continue;const text=fs.readFileSync(path.join(rootDir,p),'utf8');if(p.endsWith('.js')&&/\bimport\s*(?:\(|["'{*])/.test(text))throw Error('Review module dependency: '+p);if(p.endsWith('.css')){for(const m of text.matchAll(/url\(\s*["']?([^\s)'";]+)["']?\s*\)/g))add(m[1],p);for(const m of text.matchAll(/@import\s+["']([^"']+)["']/g))add(m[1],p);}}
 const assets=[...files].sort().map(p=>{const b=fs.readFileSync(path.join(rootDir,p)),kind=path.extname(p).slice(1);if(!require('./generation-cache.js').TYPES[kind])throw Error('Unsupported asset '+p);return {path:p,kind,size:b.length,sha256:hash(b)};});
 const release=hash(JSON.stringify({version:1,kernel,wrapper,assets}));const config={release,shell:'portfolio_v5.html',assets};
 const worker='// UNREGISTERED LAB CANDIDATE. Requires transition review before deployment.\n'+kernel+'\nconst HAS_RELEASE='+JSON.stringify(config)+';\n'+wrapper;
 return {config,worker};
}
if(require.main===module){const {config,worker}=build();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'service-worker.candidate.js'),worker);fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(config,null,2)+'\n');console.log(JSON.stringify({release:config.release,assets:config.assets.length,bytes:config.assets.reduce((s,a)=>s+a.size,0)},null,2));}
module.exports={build};
