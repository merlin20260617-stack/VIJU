import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,apply} from '../lark-app/page/src/lib/domain/shipping.mjs';
import {planWrites,matchesPlan} from '../lark-app/server/shared/base-state.mjs';
const admin={id:'admin',role:'admin',warehouses:[]};
function sample(){return {...emptyState(),factories:[{code:'F',name:'工厂'}],warehouses:[{code:'W',name:'仓库',factory:'F'}],products:[{code:'P',name:'产品',pcsPerCarton:12,cartonsPerPallet:130}],customers:[{code:'C1',name:'客户一'},{code:'C2',name:'客户二'}]};}
const command=(s,type,codes)=>({operation:'masterDelete',payload:{type,codes},requestId:'delete-test',expectedVersion:s.version});
test('single and bulk unused customer deletion leave other masters intact',()=>{const s=sample();assert.deepEqual(apply(s,command(s,'customers',['C1']),admin).customers.map(c=>c.code),['C2']);assert.equal(apply(s,command(s,'customers',['C1','C2']),admin).customers.length,0);assert.equal(s.customers.length,2);});
test('referenced customer, product, warehouse and factory cannot be deleted',()=>{const s=sample();s.orders=[{id:'O',customer:'C1',warehouse:'W',status:'completed',lines:[{product:'P',qty:10}]}];for(const [type,code] of [['customers','C1'],['products','P'],['warehouses','W'],['factories','F']])assert.throws(()=>apply(s,command(s,type,[code]),admin),/已被/);});
test('opening and production references preserve product and warehouse history',()=>{for(const collection of ['opening','batches']){const s=sample();s[collection]=[{warehouse:'W',product:'P',qty:1}];for(const [type,code] of [['products','P'],['warehouses','W']])assert.throws(()=>apply(s,command(s,type,[code]),admin),/已被/);}});
test('invalid bulk selection never removes preceding valid rows',()=>{const s=sample();assert.throws(()=>apply(s,command(s,'customers',['C1','missing']),admin),/不存在/);assert.equal(s.customers.length,2);assert.throws(()=>apply(s,command(s,'customers',['C1','C1']),admin),/不同代码/);});
test('warehouse and viewer roles cannot delete masters',()=>{const s=sample();for(const role of ['warehouse','viewer'])assert.throws(()=>apply(s,command(s,'customers',['C1']),{id:'employee',role,warehouses:['W']}),/管理员|只读/);});
test('deletion plans contain only selected fixed-table record IDs and confirm absence',()=>{const s=sample(),c=command(s,'customers',['C1']),next=apply(s,c,admin),source={Customers:[{record_id:'recOne',Code:'C1',Name:'客户一'},{record_id:'recTwo',Code:'C2',Name:'客户二'}]},plan=planWrites(source,s,next,c);assert.equal(plan.length,1);assert.equal(plan[0].recordId,'recOne');assert.equal(plan[0].deleted,true);assert.equal(matchesPlan(source,plan),false);source.Customers.shift();assert.equal(matchesPlan(source,plan),true);assert.equal(source.Customers[0].Code,'C2');});

