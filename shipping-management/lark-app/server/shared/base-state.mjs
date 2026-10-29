import {emptyState} from './shipping.mjs';
const text=(r,k)=>typeof r[k]==='string'?r[k]:'';
const num=(r,k)=>typeof r[k]==='number'?r[k]:0;
export function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export function versionOf(state){
 const data=canonical(Object.fromEntries(['factories','warehouses','products','customers','orders','batches','opening'].map(k=>[k,[...state[k]].sort((a,b)=>String(a.code||a.id).localeCompare(String(b.code||b.id)))])));
 let a=2166136261,b=5381;for(let i=0;i<data.length;i++){a=Math.imul(a^data.charCodeAt(i),16777619);b=Math.imul(b,33)^data.charCodeAt(i);}return (a>>>6)*134217728+(b>>>5);
}
export const asInstant=value=>value?new Date(value.replace(' ','T')+'+01:00').toISOString():null;
export const stamp=value=>value?new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value))+'.'+String(new Date(value).getMilliseconds()).padStart(3,'0'):null;
const parsed=value=>{try{return JSON.parse(value);}catch{throw new Error('台账内容无效，请管理员核对');}};
export function decode(source){
 const state=emptyState();
 for(const [collection,table] of [['factories','Factories'],['warehouses','Warehouses'],['products','Products'],['customers','Customers']])state[collection]=source[table].map(r=>({code:text(r,'Code'),name:text(r,'Name'),...(table==='Warehouses'?{factory:text(r,'FactoryCode')}:{ }),...(table==='Products'?{pcsPerCarton:num(r,'PcsPerCarton'),cartonsPerPallet:num(r,'CartonsPerPallet')}:{})}));
 state.orders=source.Orders.map(r=>({id:text(r,'OrderKey'),number:text(r,'OrderNumber'),date:text(r,'OrderDate'),customer:text(r,'CustomerCode'),warehouse:text(r,'WarehouseCode'),sequence:num(r,'Sequence'),status:r.Status==='Completed'?'completed':'pending',lines:parsed(text(r,'LinesJson')||'[]'),completedAt:asInstant(text(r,'CompletedAt'))}));
 state.batches=source.ProductionBatches.map(r=>({id:text(r,'BatchKey'),reference:text(r,'Reference'),warehouse:text(r,'WarehouseCode'),product:text(r,'ProductCode'),qty:num(r,'Quantity'),producedAt:asInstant(text(r,'ProducedAt'))}));
 state.opening=source.OpeningBalances.map(r=>({id:text(r,'Reference'),reference:text(r,'Reference'),warehouse:text(r,'WarehouseCode'),product:text(r,'ProductCode'),qty:num(r,'Quantity')}));
 const receipts=source.SyncReceipts.map(r=>({...r,details:parsed(text(r,'Details')||'{}')}));
 state.audit=source.DispatchEvents.map(r=>{const payload=parsed(text(r,'PayloadJson')||'{}');const operation=Array.isArray(payload.ids)?'complete':payload.reason&&payload.id?'withdraw':'legacy';return {id:text(r,'EventKey'),actor:text(r,'ActorId'),operation,payload,at:asInstant(text(r,'OccurredAt')),version:Number(r.SyncVersion)||0};});
 for(const r of receipts){if(r.Status==='Synced'&&r.details.audit){state.audit=state.audit.filter(a=>a.id!==r.RequestKey);state.audit.push(r.details.audit);state.requests[r.RequestKey]=r.details.fingerprint;}}
 state.audit.sort((a,b)=>a.at.localeCompare(b.at));
 state.version=versionOf(state);
 for(const collection of ['factories','warehouses','products','customers'])if(new Set(state[collection].map(r=>r.code)).size!==state[collection].length)throw new Error('基础资料代码重复，请管理员核对');
 if(new Set(state.orders.map(r=>r.id)).size!==state.orders.length||new Set(state.orders.map(r=>r.number)).size!==state.orders.length)throw new Error('订单台账存在重复，请管理员核对');
 return {state,receipts};
}
export function planWrites(source,previous,next,command){
 const plan=[];const add=(table,key,fields,match)=>{const matches=source[table].filter(match);if(matches.length>1)throw new Error('台账业务键重复，请管理员核对');plan.push({table,key,recordId:matches[0]?.record_id||null,fields});};
 if(command.operation==='masterDelete'){
  const table={factories:'Factories',warehouses:'Warehouses',products:'Products',customers:'Customers'}[command.payload.type];
  for(const code of command.payload.codes){const found=source[table].filter(r=>r.Code===code);if(found.length!==1)throw new Error('待删除资料不存在或重复');plan.push({table,key:code,recordId:found[0].record_id,fields:{},deleted:true});}return plan;
 }
 if(command.operation==='master'){
  const names={factories:'Factories',warehouses:'Warehouses',products:'Products',customers:'Customers'},type=command.payload.type;
  for(const r of next[type]){const old=previous[type].find(x=>x.code===r.code);if(canonical(old)===canonical(r))continue;add(names[type],r.code,{Code:r.code,Name:r.name,...(type==='warehouses'?{FactoryCode:r.factory}:{}),...(type==='products'?{PcsPerCarton:r.pcsPerCarton,CartonsPerPallet:r.cartonsPerPallet}:{}),SyncVersion:command.requestId},x=>x.Code===r.code);}
 }else if(['order','complete','withdraw'].includes(command.operation)){
  for(const r of next.orders){const old=previous.orders.find(x=>x.id===r.id);if(canonical(old)===canonical(r))continue;add('Orders',r.id,{OrderKey:r.id,OrderNumber:r.number,OrderDate:r.date,CustomerCode:r.customer,WarehouseCode:r.warehouse,Sequence:r.sequence,Status:r.status==='completed'?'Completed':'Pending',TotalCartons:r.lines.reduce((n,l)=>n+l.qty,0),LinesJson:JSON.stringify(r.lines),CompletedAt:stamp(r.completedAt),SyncVersion:command.requestId},x=>x.OrderKey===r.id);}
 }else if(command.operation==='production'){
  const r=next.batches.at(-1);add('ProductionBatches',r.id,{BatchKey:r.id,Reference:r.reference,WarehouseCode:r.warehouse,ProductCode:r.product,Quantity:r.qty,ProducedAt:stamp(r.producedAt),AvailableAt:stamp(new Date(Date.parse(r.producedAt)+86400000).toISOString()),SyncVersion:command.requestId},x=>x.BatchKey===r.id);
 }else if(command.operation==='opening'){
  const r=next.opening.at(-1);r.id=r.reference;add('OpeningBalances',r.reference,{Reference:r.reference,WarehouseCode:r.warehouse,ProductCode:r.product,Quantity:r.qty,SyncVersion:command.requestId},x=>x.Reference===r.reference);
 }
 return plan;
}
export function matchesPlan(source,plan){return plan.every(p=>{
 if(p.deleted)return !source[p.table].some(x=>x.record_id===p.recordId||x.Code===p.key);
 const r=source[p.table].find(x=>p.recordId?x.record_id===p.recordId:p.table==='Orders'?x.OrderKey===p.key:p.table==='ProductionBatches'?x.BatchKey===p.key:p.table==='OpeningBalances'?x.Reference===p.key:x.Code===p.key);
 if(!r)return false;return Object.entries(p.fields).filter(([k])=>k!=='SyncVersion'&&k!=='AvailableAt').every(([k,v])=>canonical(r[k]??null)===canonical(v));
});}

