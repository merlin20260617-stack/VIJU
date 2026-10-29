import {defineFunction,SDKError,type ServerContext,type JsonValue} from '@lark-base-open/base-database-app-sdk/server';
import {input,output} from './contract.js';
import {PROJECT_ID,TABLES} from './bindings.js';
import {apply,BusinessError,type Actor} from '../../shared/shipping.mjs';
import {decode,planWrites,versionOf,matchesPlan,type Source,type Row} from '../../shared/base-state.mjs';
const reject=(code:string,message:string,wireCode=40001):never=>{throw new SDKError(code,message,{wireCode});};
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))return reject('INVALID_RESPONSE','读取台账失败，请刷新后再操作');return v as Record<string,unknown>;};
async function query(ctx:ServerContext,functionId:string,params:unknown[]){
 const result=object(await ctx.invokeFunction({projectId:PROJECT_ID,functionId,params}));
 if(result.code!==0)return reject('READ_FAILED','读取台账失败，请刷新后再操作');
 const rows=object(result.data).rows;if(!Array.isArray(rows))return reject('READ_FAILED','台账查询缺少数据，请刷新');return rows as Row[];
}
async function member(ctx:ServerContext):Promise<Actor>{
 const rows=await query(ctx,'whoami',[]);if(rows.length!==1)return reject('MEMBERSHIP_REQUIRED','请管理员配置唯一的发货平台角色');
 const r=rows[0],role=({Admin:'admin',Warehouse:'warehouse',Viewer:'viewer'} as Record<string,string>)[r.role];
 if(!role||typeof r.user_id!=='string')return reject('ACCESS_DENIED','仓库角色无效');
 const warehouses=String(r.warehouse_codes||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(role!=='admin'&&(warehouses.length!==1||warehouses[0]!==r.warehouse_codes))return reject('WAREHOUSE_REQUIRED','当前每位仓管或查看者须授权一个准确的仓库代码');
 return {id:r.user_id,role,warehouses};
}
const READERS={Factories:'baseFactories',Warehouses:'baseWarehouses',Products:'baseProducts',Customers:'baseCustomers',Orders:'baseOrders',ProductionBatches:'baseBatches',OpeningBalances:'baseOpening',DispatchEvents:'baseEvents',SyncReceipts:'baseReceipts'};
async function read(ctx:ServerContext){
 const entries=await Promise.all(Object.entries(READERS).map(async([table,id])=>{
  const all:Row[]=[];for(let offset=0;offset<=10000;offset+=500){const page=await query(ctx,id,[offset]);all.push(...page);if(all.length>10000)return reject('CAPACITY_REVIEW','台账超过当前测试版本读取范围，请先升级分页查询');if(page.length<500)break;}return [table,all] as const;
 }));return Object.fromEntries(entries) as Source;
}
const exposed=(state:ReturnType<typeof decode>['state'],actor:Actor)=>({...state,audit:actor.role==='admin'?state.audit:[],requests:{}});
const pending=(receipts:Row[],scope?:string)=>receipts.filter(r=>r.Status!=='Synced'&&(!scope||r.TransactionVersion==='*'||scope==='*'||r.TransactionVersion===scope));
const fields=(r:Row)=>r as Record<string,JsonValue>;
function target(name:string){if(!(name in TABLES))return reject('INVALID_TARGET','台账类型无效');return TABLES[name as keyof typeof TABLES];}
async function finish(ctx:ServerContext,receipt:Row){const result=await ctx.records.update(TABLES.SyncReceipts,{[receipt.record_id]:{Status:'Synced'}});return result.status==='success';}
export default defineFunction({input,output,handler:async(p,ctx)=>{
 let writesStarted=false;
 try{
 const actor=await member(ctx),source=await read(ctx);
 let decoded:ReturnType<typeof decode>;try{decoded=decode(source);}catch{return reject('LEDGER_INVALID','台账数据需要管理员核对，暂不能修改');}
 const {state,receipts}=decoded;
 const latest=new Map<string,any>();for(const r of [...receipts].filter(r=>r.Status==='Synced').sort((a,b)=>String(a.details?.audit?.at||'').localeCompare(String(b.details?.audit?.at||''))))for(const item of r.details?.plan||[])latest.set(item.table+':'+item.key,item);
 const ready=matchesPlan(source,[...latest.values()]);
 const workspace=()=>({state:exposed(state,actor),actor,ready,confirmed:receipts.filter(r=>r.Status==='Synced').map(r=>r.RequestKey),pending:pending(receipts).map(r=>({requestId:r.RequestKey,scope:r.TransactionVersion,status:r.Status})),storage:'lark-base'});
 if(p.operation==='workspace')return {payload:JSON.stringify(workspace())};
 if(actor.role==='viewer')return reject('READ_ONLY','只读用户不能修改');
 if(p.operation==='reconcile'){
  let requestId='';if(p.commandJson){try{const supplied=object(JSON.parse(p.commandJson));if(typeof supplied.requestId!=='string'||!/^[-A-Za-z0-9_]{1,120}$/.test(supplied.requestId))return reject('INVALID_REQUEST','核查操作编号无效');requestId=supplied.requestId;}catch{return reject('INVALID_REQUEST','核查操作编号无效');}}
  writesStarted=true;
  const observed=[];for(const r of pending(receipts)){
   if(actor.role!=='admin'&&r.TransactionVersion==='*')continue;
   const plan=r.details?.plan;if(!Array.isArray(plan)){observed.push({requestId:r.RequestKey,status:'review'});continue;}
   // Read replicas may lag: only a complete match closes a receipt.
   // Missing/conflicting data never triggers resubmission or rollback.
   const ok=matchesPlan(source,plan)&&await finish(ctx,r);observed.push({requestId:r.RequestKey,status:ok?'confirmed':'review'});
  }
  const requested=receipts.find(r=>r.RequestKey===requestId);
  const requestStatus=!requestId?null:requested?(requested.Status==='Synced'||observed.some(r=>r.requestId===requestId&&r.status==='confirmed')?'confirmed':'review'):'not_found';
  return {payload:JSON.stringify({observed,...workspace(),requestId,requestStatus,checkedAt:new Date().toISOString()})};
 }
 let command:Record<string,any>;try{command=object(JSON.parse(p.commandJson||''));}catch{return reject('INVALID_COMMAND','仓库操作参数无效');}
 if(typeof command.requestId!=='string'||!/^[-A-Za-z0-9_]{1,120}$/.test(command.requestId))return reject('INVALID_REQUEST','操作编号无效');
 const old=receipts.find(r=>r.RequestKey===command.requestId),fingerprint=JSON.stringify({actor:actor.id,operation:command.operation,payload:command.payload});
 if(old){if(old.details?.fingerprint!==fingerprint)return reject('REQUEST_CONFLICT','操作编号已被其他内容使用');return {payload:JSON.stringify({...workspace(),status:old.Status==='Synced'?'saved':'review',requestId:command.requestId})};}
 if(!ready||command.afterRequestId&&!receipts.some(r=>r.RequestKey===command.afterRequestId&&r.Status==='Synced'))return reject('READ_NOT_CAUGHT_UP','上次保存尚未在查询中完整显示，请稍后刷新再操作',40901);
 if(command.operation==='master'&&(!Array.isArray(command.payload?.rows)||command.payload.rows.length>200))return reject('BATCH_TOO_LARGE','每次最多保存200行资料，Excel大文件请按页面分批导入');
 if(command.operation==='order'&&(!Array.isArray(command.payload?.lines)||command.payload.lines.length>100))return reject('LINES_TOO_LARGE','单张订单最多100个产品');
 if(command.operation==='complete'&&(!Array.isArray(command.payload?.ids)||command.payload.ids.length>200))return reject('ORDERS_TOO_LARGE','每次最多确认200张订单');
 let next;try{next=apply(state,command,actor);}catch(e){if(e instanceof BusinessError)return reject('BUSINESS_REJECTED',e.message,command.expectedVersion!==state.version?40901:40001);return reject('INVALID_COMMAND','仓库操作内容无效');}
 const affected=['master','masterDelete'].includes(command.operation)?['*']:command.operation==='complete'?next.orders.filter(o=>command.payload.ids.includes(o.id)).map(o=>o.warehouse):command.operation==='withdraw'?[next.orders.find(o=>o.id===command.payload.id)?.warehouse]:[command.payload?.warehouse];
 const scopes=[...new Set(affected)];if(scopes.length!==1||!scopes[0])return reject('SINGLE_WAREHOUSE','一次操作只能涉及一个仓库');const scope=String(scopes[0]);
 if(pending(receipts,scope).length)return reject('REVIEW_REQUIRED','该仓库有上次操作待核查，请先核查操作结果');
 let plan;try{plan=planWrites(source,state,next,command);}catch{return reject('PLAN_INVALID','台账存在重复业务键，请管理员核对');}
 next.version=versionOf(next);next.audit.at(-1).version=next.version;
 const details=JSON.stringify({fingerprint,audit:next.audit.at(-1),plan});if(details.length>80000)return reject('REQUEST_TOO_LARGE','本次数据过多，请减少每批行数后重试');
 writesStarted=true;
 const receiptResult=await ctx.records.create(TABLES.SyncReceipts,[{RequestKey:command.requestId,Status:'Pending',TransactionVersion:scope,Details:details}]);
 if(receiptResult.status==='failed')return reject('RECEIPT_FAILED','未能建立操作记录，请稍后重试',40002);
 if(receiptResult.status!=='success')return {payload:JSON.stringify({status:'review',requestId:command.requestId})};
 const receiptId=receiptResult.appliedIds[0];let complete=true;
 // Each plan touches one business table. Base batches are not transactions.
 for(const table of [...new Set(plan.map(x=>x.table))]){
  const creates=plan.filter(x=>x.table===table&&!x.recordId&&!x.deleted),updates=plan.filter(x=>x.table===table&&x.recordId&&!x.deleted),deletes=plan.filter(x=>x.table===table&&x.deleted);
  if(creates.length){const result=await ctx.records.create(target(table),creates.map(x=>fields(x.fields)));if(result.status!=='success'){complete=false;break;}}
  if(updates.length){const result=await ctx.records.update(target(table),Object.fromEntries(updates.map(x=>[x.recordId!,fields(x.fields)])));if(result.status!=='success'){complete=false;break;}}
  if(deletes.length){const result=await ctx.records.delete(target(table),deletes.map(x=>x.recordId!));if(result.status!=='success'){complete=false;break;}}
 }
 if(!complete){await ctx.records.update(TABLES.SyncReceipts,{[receiptId]:{Status:'Review'}});return {payload:JSON.stringify({status:'review',requestId:command.requestId})};}
 const finalized=await finish(ctx,{record_id:receiptId});
 return {payload:JSON.stringify({status:finalized?'saved':'review',state:exposed(next,actor),actor,requestId:command.requestId,storage:'lark-base'})};
 }catch(error){
  // Only our pre-write business checks are definite failures. Never convert an
  // exception after a write attempt into permission to retry the operation.
  if(!writesStarted&&error instanceof SDKError&&[40001,40002,40901].includes(error.wireCode))return {payload:JSON.stringify({status:'rejected',message:error.safeMessage,definite:true,wireCode:error.wireCode})};
  throw error;
 }
}});

