(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./close-comparison-fixtures.js'));else root.HASCloseEvidenceFixtures=factory(root.HASCloseComparisonFixtures);})(typeof globalThis!=='undefined'?globalThis:this,function(fixtures){
  'use strict';
  function create(scenario){var comparison=fixtures.create(scenario),evidence={};['calendar','gas','kis'].forEach(function(k){evidence[k]={sourceId:'synthetic-'+k+'-v1',revision:'simulation-v1',reviewId:'simulation-not-reviewed',provider:k,instrumentType:'listed-equity',market:'KR',exchange:'KRX',adjustment:'raw',validFrom:'2026-11-09',validThrough:'2026-11-09',correctionState:'current',supersedes:null,semantics:'synthetic-official-regular-close',finality:'synthetic-final'};});return {version:1,mode:'synthetic',comparison:comparison,evidence:evidence};}
  return Object.freeze({create:create});
});
