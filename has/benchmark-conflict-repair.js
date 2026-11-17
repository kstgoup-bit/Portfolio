/* Benchmark conflict repair — DRY-RUN ONLY (GPT-20261117-0940).
 * Reads raw strings, never storage. Never writes, deletes, uploads or applies.
 * Not loaded by portfolio_v5.html. Output is a proposal for 순태씨 to review;
 * every proposal requires a separate explicit user approval before any real change. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./benchmark-history-policy.js'));else root.HASBenchConflictRepair=factory(root.HASBenchmarkHistory);})(typeof globalThis!=='undefined'?globalThis:this,function(H){
  'use strict';
  var IDS=['KS200','QQQ','SPY'],MAX_TOLERANCE=0.005;
  var own=function(o,k){return Object.prototype.hasOwnProperty.call(o,k);};
  var obj=function(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);};
  function fail(reason,extra){var o={ok:false,dryRun:true,applied:false,reason:reason,actions:[]};if(extra)for(var k in extra)o[k]=extra[k];return o;}
  function diffPct(a,b){return Math.round(Math.abs(b-a)/a*1e6)/1e4;}
  function weekday(d){var w=new Date(d+'T00:00:00Z').getUTCDay();return w!==0&&w!==6;}
  // Evidence is only usable when: tolerance valid, verified calendar function given,
  // >=2 entries from distinct APPROVED routes with distinct upstreams, identity/price kind
  // match, asOf after the regular close. Default approvedRoutes is empty -> never usable.
  function usableEvidence(list,id,d,opt){
    var s=H.specs[id],routes=obj(opt.approvedRoutes)?opt.approvedRoutes:{},tol=opt.tolerance===undefined?0:opt.tolerance;
    if(typeof tol!=='number'||!isFinite(tol)||tol<0||tol>MAX_TOLERANCE)return {ok:false,reason:'tolerance-invalid'};
    if(typeof opt.closeCalendar!=='function')return {ok:false,reason:'calendar-unverified'};
    var open;try{open=opt.closeCalendar(d,s.market);}catch(e){open=null;}
    if(open!==true)return {ok:false,reason:'calendar-closed-or-unknown'};
    var close=H.closeTimeMs(d,s.market),picked=[],usedRoutes={},usedUp={};
    (Array.isArray(list)?list:[]).forEach(function(e){
      if(!obj(e)||e.id!==id||e.d!==d||e.currency!==s.currency||e.market!==s.market||e.priceKind!=='regular-close'||typeof e.close!=='number'||!isFinite(e.close)||e.close<=0)return;
      if(typeof e.route!=='string'||!own(routes,e.route)||!obj(routes[e.route])||typeof routes[e.route].upstream!=='string')return; // self-declared upstream ignored
      var up=routes[e.route].upstream,at=typeof e.asOf==='string'?Date.parse(e.asOf):NaN;
      if(!isFinite(at)||at<close||usedRoutes[e.route]||usedUp[up])return;
      usedRoutes[e.route]=true;usedUp[up]=true;picked.push(e.close);
    });
    if(picked.length<2)return {ok:false,reason:'independent-evidence-insufficient'};
    var lo=Math.min.apply(null,picked),hi=Math.max.apply(null,picked);
    if((hi-lo)/lo>tol)return {ok:false,reason:'evidence-disagrees'};
    return {ok:true,closes:picked,tol:tol};
  }
  function within(v,closes,tol){return closes.every(function(c){return Math.abs(v-c)/c<=tol;});}
  function dupKey(c){return JSON.stringify([c.d,c.status,c.existing,c.alternative.close,c.alternative.source,c.alternative.finality]);}
  function earlier(a,b){var x=Date.parse(a.alternative.receivedAt),y=Date.parse(b.alternative.receivedAt);return x!==y?x<y:a.alternative.id<b.alternative.id;}
  function sortActions(list){return list.sort(function(a,b){return a.d<b.d?-1:a.d>b.d?1:a.action<b.action?-1:a.action>b.action?1:(a.ids[0]<b.ids[0]?-1:a.ids[0]>b.ids[0]?1:0);});}
  function summarize(g,read){
    var pend=g.conflicts.filter(function(c){return c.status==='pending-review';}).length;
    return {observations:g.observations.length,conflicts:g.conflicts.length,pending:pend,successors:g.conflicts.length-pend,saturated:g.conflicts.length>=H.limits.conflicts,headroom:H.limits.conflicts-g.conflicts.length,latestDate:read&&read.latestDate||null};
  }
  function planGroup(id,g,read,opt){
    var actions=[],groups=Object.create(null),order=[];
    g.conflicts.forEach(function(c){
      if(c.status==='provisional-successor'){actions.push({action:'keep',d:c.d,ids:[c.alternative.id],reason:'provisional-successor-normal'});return;}
      var k=dupKey(c);if(!groups[k]){groups[k]=[];order.push(k);}groups[k].push(c);
    });
    var removeIds=Object.create(null);
    order.sort().forEach(function(k){
      var list=groups[k].slice().sort(function(a,b){return earlier(a,b)?-1:1;}),rep=list[0],ex=rep.existing.close,al=rep.alternative.close;
      var base={d:rep.d,existingClose:ex,alternativeClose:al,diffPct:diffPct(ex,al),source:rep.alternative.source,finality:rep.alternative.finality,existingSource:own(rep.existing,'source')?rep.existing.source:'legacy-unknown'};
      if(list.length>1){
        var dropped=list.slice(1).map(function(c){return c.alternative.id;});
        dropped.forEach(function(x){removeIds[x]=true;});
        actions.push(Object.assign({action:'merge-duplicate',ids:dropped,keptId:rep.alternative.id,count:list.length,reason:'same-date-close-source-finality-existing'},base));
      }
      var ev=usableEvidence(opt.evidence,id,rep.d,opt),act,reason;
      if(rep.alternative.finality==='provisional'){act='hold';reason='intraday-provisional-unconfirmed';}
      else if(!ev.ok){act='hold';reason=ev.reason;}
      else{var mx=within(ex,ev.closes,ev.tol),ma=within(al,ev.closes,ev.tol);
        if(mx&&!ma){act='replace-proposal';reason='evidence-confirms-existing';base.choice='existing';}
        else if(ma&&!mx){act='replace-proposal';reason='evidence-confirms-alternative';base.choice='alternative';}
        else{act='hold';reason=mx?'evidence-ambiguous':'evidence-matches-neither';}}
      if(act==='hold'&&rep.existing&&own(rep.existing,'source')&&rep.existing.source!==rep.alternative.source)base.crossSource=true;
      actions.push(Object.assign({action:act,ids:[rep.alternative.id],reason:reason,requiresUserApproval:act==='replace-proposal'},base));
    });
    return {actions:sortActions(actions),removeIds:removeIds};
  }
  // storeRaw / legacyRaw are the exact stored strings (v5_benchHistV2 / v5_benchHist).
  function plan(storeRaw,legacyRaw,now,options){
    var opt=obj(options)?options:{};
    if(typeof storeRaw!=='string'||(legacyRaw!==null&&typeof legacyRaw!=='string'))return fail('raw-string-required');
    if(typeof now!=='number'||!isFinite(now))return fail('now-required');
    var ids=Array.isArray(opt.ids)?opt.ids.filter(function(x){return IDS.indexOf(x)>=0;}):IDS.slice();
    var parsed=H.parseTransportJSON(storeRaw);if(!parsed.ok)return fail('store-json');
    var store=parsed.data,valid=H.validateStore(store,legacyRaw,now);
    if(!valid.ok)return fail('store-invalid:'+valid.reason); // fail-closed: no partial plan
    var read=H.readStore(store,legacyRaw,now);if(!read.ok||!read.allValid)return fail('store-quarantined');
    var next=JSON.parse(storeRaw),out={},all=[];
    IDS.forEach(function(id){
      if(!own(store.series,id))return;
      var g=store.series[id];
      if(ids.indexOf(id)<0){out[id]={planned:false,before:summarize(g,read.series[id]),after:summarize(g,read.series[id]),actions:[]};return;}
      var p=planGroup(id,g,read.series[id],opt);
      next.series[id].conflicts=next.series[id].conflicts.filter(function(c){return !p.removeIds[c.alternative.id];});
      out[id]={planned:true,before:summarize(g,read.series[id]),after:summarize(next.series[id],null),actions:p.actions};
      out[id].after.latestDate=out[id].before.latestDate;
      p.actions.forEach(function(a){all.push(Object.assign({id:id},a));});
    });
    var simulatedRaw=JSON.stringify(next),check=H.validateStore(JSON.parse(simulatedRaw),legacyRaw,now);
    if(!check.ok)return fail('simulation-invalid:'+check.reason);
    var view=H.readStore(JSON.parse(simulatedRaw),legacyRaw,now),selectedSame=true;
    IDS.forEach(function(id){if(own(store.series,id)&&JSON.stringify(view.series[id].points)!==JSON.stringify(read.series[id].points))selectedSame=false;});
    if(!selectedSame)return fail('simulation-changed-active-prices');
    var counts={keep:0,'merge-duplicate':0,'replace-proposal':0,hold:0};all.forEach(function(a){counts[a.action]++;});
    return {ok:true,dryRun:true,applied:false,appliesTo:'simulated-copy-only',
      before:{storeFingerprint:H.fingerprint(storeRaw),legacyFingerprint:H.fingerprint(legacyRaw)},
      after:{storeFingerprint:H.fingerprint(simulatedRaw),legacyFingerprint:H.fingerprint(legacyRaw),legacyUnchanged:true,activePricesUnchanged:true},
      series:out,actions:all,counts:counts,simulatedStoreRaw:simulatedRaw,
      undo:{restoreRaw:storeRaw,restoreFingerprint:H.fingerprint(storeRaw),expectCurrentFingerprint:H.fingerprint(simulatedRaw),note:'compare current raw with expectCurrentFingerprint before restoring; legacy raw is never touched'},
      notes:['replace-proposal is NOT applied to the simulated store (schema v2 has no reviewed-resolution state); it needs 순태씨 approval and a separate migration review','intraday provisional pending conflicts stay on hold; no price is estimated, normalized or deleted']};
  }
  return Object.freeze({plan:plan,limits:Object.freeze({tolerance:MAX_TOLERANCE})});
});
