import {defineFunction,SDKError,type ServerContext,type JsonValue} from '@lark-base-open/base-database-app-sdk/server';
import {input,output} from './contract.js';
import {PROJECT_ID,TABLES} from './bindings.js';
import {validate,importPlan,authorize,BusinessError} from '../../shared/domain.mjs';
type Row=Record<string,any>;
const reject=(message:string):never=>{throw new SDKError('SUPPLIER_REJECTED',message,{wireCode:40001})};
const object=(v:unknown):Row=>{if(!v||typeof v!=='object'||Array.isArray(v))return reject('读取数据失败，请稍后刷新');return v as Row};
async function query(ctx:ServerContext,id:string,params:unknown[]){const result=object(await ctx.invokeFunction({projectId:PROJECT_ID,functionId:id,params}));if(result.code!==0)reject('读取数据失败，请稍后刷新');const rows=object(result.data).rows;if(!Array.isArray(rows))reject('查询结果不完整，请稍后刷新');return rows as Row[];}
async function load(ctx:ServerContext){const entries=await Promise.all(Object.entries({supplier:'listSuppliers',material:'listMaterials',mapping:'listSupplyMappings'}).map(async([key,id])=>{const rows:Row[]=[];for(let offset=0;offset<=10000;offset+=500){const page=await query(ctx,id,[offset]);rows.push(...page);if(rows.length>10000)reject('当前台账超过试点读取范围，需先扩展查询');if(page.length<500)break;}if(new Set(rows.map(r=>r.record_id)).size!==rows.length)reject('供货关系存在多重关联，请管理员核对一条关系仅关联一家供应商和一项物料');return[key,rows] as const;}));return Object.fromEntries(entries);}
const targets={supplier:TABLES.Suppliers,material:TABLES.Materials,mapping:TABLES.SupplyMappings,technical:TABLES.SupplyMappings};
const attachmentFields={supplier:'供应商附件',material:'物料照片',mapping:'产品照片与目录'} as const;
export default defineFunction({input,output,handler:async(p,ctx)=>{
 let attempted=false;
 try{
  const members=await query(ctx,'whoami',[]);if(members.length!==1||!members[0].user_id)reject('请管理员在成员表配置唯一的启用角色');
  const m=members[0];const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const actor={role:String(m.role),name:`${m.name||m.user_id} (${m.user_id})`,today:`${day}T00:00:00+01:00`};
  const source=await load(ctx);
  if(p.operation==='snapshot')return {payload:JSON.stringify({status:'ready',source,actor:{name:m.name,role:m.role}})};
  if(!p.target)reject('请指定业务对象');const target=p.target!;
  let command:Row;try{command=object(JSON.parse(p.commandJson||''));}catch{reject('业务参数格式错误')}
  const table=targets[target];
  if(p.operation==='attach'){
   if(target==='technical')reject('技术确认不修改附件');authorize(actor.role,target);
   const recordId=command!.recordId;if(!source[target].some(r=>r.record_id===recordId))reject('目标记录不存在');
   const files=command!.files;if(!Array.isArray(files)||files.length<1||files.length>10)reject('每次追加1至10个附件');
   const items=files.map((f:Row)=>{if(typeof f.file_token!=='string'||!/^[A-Za-z0-9_-]{1,256}$/.test(f.file_token))reject('附件标识无效');const item:Row={file_token:f.file_token};if(f.image_width!==undefined||f.image_height!==undefined){if(!Number.isInteger(f.image_width)||!Number.isInteger(f.image_height)||f.image_width<=0||f.image_height<=0)reject('图片尺寸无效');item.image_width=f.image_width;item.image_height=f.image_height;}return item});
   attempted=true;const r=await ctx.records.appendAttachments(table,{[recordId]:{[attachmentFields[target as keyof typeof attachmentFields]]:items}});
   return {payload:JSON.stringify({status:r.status==='success'?'saved':'review',result:r})};
  }
  let plans;
  if(p.operation==='import'){
   if(!['supplier','material'].includes(target))reject('仅支持供应商和物料资料导入');
   plans=importPlan(target,command!.mode,command!.rows,source,actor);
   if(command!.preview!==false)return {payload:JSON.stringify({status:'preview',count:plans.length,plans})};
  }else plans=[validate(target,command!,source,actor)];
  const creates=plans.filter(r=>!r.recordId),updates=plans.filter(r=>r.recordId);
  if(creates.length&&updates.length)reject('请将新增与更新分批提交');
  attempted=true;
  const r=creates.length?await ctx.records.create(table,creates.map(r=>r.fields as Record<string,JsonValue>)):await ctx.records.update(table,Object.fromEntries(updates.map(r=>[r.recordId!,r.fields])));
  return {payload:JSON.stringify({status:r.status==='success'?'saved':r.status==='failed'?'rejected':'review',result:r,message:r.status==='failed'?'本次写入被拒绝，请核对资料后再操作':undefined})};
 }catch(e){
  if(!attempted&&e instanceof BusinessError)return {payload:JSON.stringify({status:'rejected',message:e.message})};
  if(!attempted&&e instanceof SDKError)throw e;
  // A transport error after a create/append may hide a successful write. Never retry automatically.
  if(attempted)return {payload:JSON.stringify({status:'review',message:'保存结果尚未确认，请刷新核对记录；不要重复提交'})};
  throw new SDKError('SUPPLIER_FAILED','暂时无法处理，请刷新后重试',{wireCode:50001});
 }
}});
