export function definiteRejection(result){return result?.status==='rejected'&&result.definite===true&&[40001,40002,40901].includes(result.wireCode);}
export function mayReviewMissing(result,requestId){return Boolean(requestId&&result?.requestId===requestId&&result.requestStatus==='not_found'&&result.ready===true&&Array.isArray(result.pending)&&result.pending.length===0);}
export function requestConfirmed(result,requestId){return Boolean(requestId&&Array.isArray(result?.confirmed)&&result.confirmed.includes(requestId));}

