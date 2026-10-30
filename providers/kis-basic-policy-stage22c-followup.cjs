'use strict';
// Reviewed scope classification, not a credential or runtime authorization service.
const BASIC = new Set(['personal-ephemeral-quote']);
const DEFERRED = new Set(['price-storage','long-retention','redistribution','independent-comparison']);
function classifyUsage(usage) {
 if(BASIC.has(usage))return Object.freeze({developmentAllowed:true,customerInquiryRequired:false,scope:'personal-own-assets',persistenceAllowed:false,independentVerification:false});
 if(DEFERRED.has(usage))return Object.freeze({developmentAllowed:false,customerInquiryRequired:false,scope:'deferred-unconfirmed-right',persistenceAllowed:false,independentVerification:false});
 return Object.freeze({developmentAllowed:false,customerInquiryRequired:false,scope:'excluded',persistenceAllowed:false,independentVerification:false});
}
module.exports={classifyUsage};
