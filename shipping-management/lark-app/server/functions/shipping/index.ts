import {defineFunction,SDKError,type ServerContext,type JsonValue} from '@lark-base-open/base-database-app-sdk/server';
import {input,output} from './contract.js';
import {PROJECT_ID,TABLES} from './bindings.js';
type Row=Record<string,JsonValue>;
const fail=(code:string,message:string):never=>{throw new SDKError(code,message,{wireCode:40001});};
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))return fail('INVALID_RESPONSE','服务返回无效，请稍后核查');return v as Record<string,unknown>;};
const s=(r:Row,k:string)=>typeof r[k]==='string'?r[k] as string:'';
const n=(r:Row,k:string)=>typeof r[k]==='number'?r[k] as number:0;
const row=(v:unknown)=>obj(v) as Row;
const stamp=(value:string)=>{const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;return new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date)+'.'+String(date.getMilliseconds()).padStart(3,'0');};
async function member(ctx:ServerContext){
  const result=obj(await ctx.invokeFunction({projectId:PROJECT_ID,functionId:'whoami',params:[]}));if(result.code!==0)return fail('ACCESS_DENIED','无法确认仓库权限');
  const rows=obj(result.data).rows;if(!Array.isArray(rows)||rows.length!==1)return fail('MEMBERSHIP_REQUIRED','请管理员先为您配置发货平台角色');
  const m=row(rows[0]),role=({Admin:'admin',Warehouse:'warehouse',Viewer:'viewer'} as Record<string,string>)[s(m,'role')];if(!role||!s(m,'user_id'))return fail('ACCESS_DENIED','仓库角色无效');
  return {id:s(m,'user_id'),role,warehouses:s(m,'warehouse_codes').split(',').map(x=>x.trim()).filter(Boolean)};
}
async function bridge(payload:unknown){
  const token=process.env.SHIPPING_TX_TOKEN;if(!token)return fail('TRANSACTION_NOT_CONFIGURED','事务服务尚未完成安全连接，真实发货暂不可用');
  const response=await globalThis.fetch('https://viju-shipping-transactions.viju-chatgpt-4417.chatgpt.site/api/bridge',{method:'POST',headers:{'content-type':'application/json','OAI-Sites-Authorization':'Bearer '+token},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
  const body=await response.json().catch(()=>null);if(!response.ok){const message=body&&typeof body==='object'&&'error' in body&&typeof body.error==='string'?body.error:'事务服务暂不可用，请保留操作编号后核查';throw new SDKError('TRANSACTION_REJECTED',message.slice(0,200),{wireCode:response.status===409?40901:response.status<500?40002:50202});}return obj(body);
}
type Projection={table:keyof typeof TABLES,key:string,fields:Row};
function projections(effects:unknown[],mappings:Record<string,string>):Projection[]{
  const result:Projection[]=[];
  for(const raw of effects){const effect=obj(raw),r=row(effect.row),collection=String(effect.collection),key=collection+':'+String(effect.key),version=String(effect.version||'');
    const add=(table:keyof typeof TABLES,fields:Row,k=key)=>result.push({table,key:k,fields:{...fields,SyncVersion:version}});
    switch(collection){
      case 'factories':add('Factories',{Code:s(r,'code'),Name:s(r,'name')});break;
      case 'warehouses':add('Warehouses',{Code:s(r,'code'),Name:s(r,'name'),FactoryCode:s(r,'factory')});break;
      case 'products':add('Products',{Code:s(r,'code'),Name:s(r,'name'),PcsPerCarton:n(r,'pcsPerCarton'),CartonsPerPallet:n(r,'cartonsPerPallet')});break;
      case 'customers':add('Customers',{Code:s(r,'code'),Name:s(r,'name')});break;
      case 'orders':{
        const lines=Array.isArray(r.lines)?r.lines.map(row):[],id=s(r,'id');
        add('Orders',{OrderNumber:s(r,'number'),OrderKey:id,OrderDate:s(r,'date'),CustomerCode:s(r,'customer'),WarehouseCode:s(r,'warehouse'),Sequence:n(r,'sequence'),Status:r.status==='completed'?'Completed':'Pending',TotalCartons:lines.reduce((sum,l)=>sum+n(l,'qty'),0),LinesJson:JSON.stringify(lines),CompletedAt:stamp(s(r,'completedAt'))});
        const active=new Set<string>();for(const l of lines){const lineKey='lines:'+id+':'+s(l,'product');active.add(lineKey);add('OrderLines',{LineKey:lineKey,OrderKey:id,ProductCode:s(l,'product'),ProductName:s(l,'name'),Quantity:n(l,'qty'),PcsPerCarton:n(l,'pcsPerCarton'),CartonsPerPallet:n(l,'cartonsPerPallet'),WarehouseCode:s(r,'warehouse'),OrderDate:s(r,'date'),Active:true},lineKey);}
        for(const old of Object.keys(mappings))if(old.startsWith('lines:'+id+':')&&!active.has(old))add('OrderLines',{Active:false},old);break;
      }
      case 'batches':add('ProductionBatches',{Reference:s(r,'reference'),BatchKey:s(r,'id'),WarehouseCode:s(r,'warehouse'),ProductCode:s(r,'product'),Quantity:n(r,'qty'),ProducedAt:stamp(s(r,'producedAt')),AvailableAt:stamp(new Date(Date.parse(s(r,'producedAt'))+86400000).toISOString())});break;
      case 'opening':add('OpeningBalances',{Reference:s(r,'reference'),WarehouseCode:s(r,'warehouse'),ProductCode:s(r,'product'),Quantity:n(r,'qty')});break;
      case 'audit':{const p=row(r.payload);add('DispatchEvents',{EventKey:s(r,'id'),OrderKeys:typeof p.id==='string'?p.id:Array.isArray(p.ids)?p.ids.join(','):'',Action:r.operation==='complete'?'Complete':'Withdraw',ActorId:s(r,'actor'),OccurredAt:stamp(s(r,'at')),Reason:s(p,'reason'),PayloadJson:JSON.stringify(p)});break;}
      default:return fail('SYNC_INVALID','同步类型无效，需管理员核查');
    }
  }
  return result;
}
async function sync(ctx:ServerContext){
  const job=await bridge({operation:'claimSync'});if(job.status!=='claimed')return String(job.status);
  const id=String(job.id),lease=String(job.lease),mappings=obj(job.mappings) as Record<string,string>;let ok=true;
  try{
    if(!Array.isArray(job.effects))throw new Error('Invalid effects');const planned=projections(job.effects,mappings);
    for(const table of Object.keys(TABLES) as (keyof typeof TABLES)[]){
      const writes=planned.filter(p=>p.table===table),creates=writes.filter(p=>!mappings[p.key]),updates=writes.filter(p=>mappings[p.key]);
      for(let i=0;i<creates.length;i+=200){const batch=creates.slice(i,i+200),result=await ctx.records.create(TABLES[table],batch.map(p=>p.fields));if(result.status!=='success'||result.appliedIds.length!==batch.length)throw new Error('Review required');batch.forEach((p,index)=>{mappings[p.key]=result.appliedIds[index];});}
      for(let i=0;i<updates.length;i+=200){const batch=updates.slice(i,i+200),result=await ctx.records.update(TABLES[table],Object.fromEntries(batch.map(p=>[mappings[p.key],p.fields])));if(result.status!=='success')throw new Error('Review required');}
    }
  }catch{ok=false;}
  await bridge({operation:'finishSync',payload:{id,lease,ok,mappings}});return ok?'synced':'review';
}
export default defineFunction({input,output,handler:async(p,ctx)=>{
  const actor=await member(ctx);
  if(p.operation==='workspace')return {payload:JSON.stringify({...await bridge({operation:'workspace',actor}),actor})};
  if(p.operation==='sync'){if(actor.role==='viewer')return fail('WRITE_ROLE_REQUIRED','只读用户不能执行台账同步');return {payload:JSON.stringify({sync:await sync(ctx)})};}
  if(actor.role==='viewer')return fail('READ_ONLY','只读用户不能修改');
  let command:unknown;try{command=JSON.parse(p.commandJson||'');}catch{return fail('INVALID_COMMAND','仓库操作参数无效');}
  const result=await bridge({operation:'mutate',command,actor});
  // Return the committed transaction first. The Page continues durable outbox
  // processing through separate sync calls; ledger latency cannot hide a commit.
  return {payload:JSON.stringify({...result,actor,sync:'pending'})};
}});
