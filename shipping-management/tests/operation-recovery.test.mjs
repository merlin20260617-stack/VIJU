import test from 'node:test';
import assert from 'node:assert/strict';
import {definiteRejection,mayReviewMissing,requestConfirmed} from '../lark-app/page/src/lib/operation-recovery.mjs';
test('only explicitly rejected pre-write results are definite failures',()=>{assert.ok(definiteRejection({status:'rejected',definite:true,wireCode:40001}));assert.ok(definiteRejection({status:'rejected',definite:true,wireCode:40901}));for(const r of [{status:'review',definite:true,wireCode:40001},{status:'rejected',definite:false,wireCode:40001},{status:'rejected',definite:true,wireCode:500},null])assert.equal(definiteRejection(r),false);});
test('missing receipt allows manual review only for the exact ID and healthy complete reads',()=>{const r={requestId:'request-1',requestStatus:'not_found',ready:true,pending:[]};assert.ok(mayReviewMissing(r,'request-1'));for(const bad of [{...r,requestId:'other'},{...r,ready:false},{...r,pending:[{}]},{...r,requestStatus:'review'},{...r,pending:null}])assert.equal(mayReviewMissing(bad,'request-1'),false);assert.equal(mayReviewMissing(r,''),false);});
test('unrelated confirmations never release a pending operation',()=>{assert.equal(requestConfirmed({confirmed:['other']},'request-1'),false);assert.equal(requestConfirmed({confirmed:['request-1']},'request-1'),true);assert.equal(requestConfirmed(null,'request-1'),false);});

