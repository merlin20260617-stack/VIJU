import {defineFunction,SDKError,type ServerContext,type JsonValue} from '@lark-base-open/base-database-app-sdk/server';
import {input,output} from './contract.js';
import {PROJECT_ID,TABLES} from './bindings.js';
import {validate,importPlan,authorize,BusinessError} from '../../shared/domain.mjs';
import {permissionsFor,has} from '../../shared/access.mjs';
import {governancePlan} from '../../shared/governance.mjs';
import {bulkPlan,previewImport} from '../../shared/admin.mjs';
type Row=Record<string,any>;
const reject=(message:string):never=>{throw new SDKError('SUPPLIER_REJECTED',message,{wireCode:40001})};
const object=(v:unknown):Row=>{if(!v||typeof v!=='object'||Array.isArray(v))return reject('读取数据失败，请稍后刷新');return v as Row};
async function query(ctx:ServerContext,id:string,params:unknown[]){const result=object(await ctx.invokeFunction({projectId:PROJECT_ID,functionId:id,params}));if(result.code!==0)reject('读取数据失败，请稍后刷新');const rows=object(result.data).rows;if(!Array.isArray(rows))reject('查询结果不完整，请稍后刷新');return rows as Row[];}
const readers={supplier:'listSuppliers',material:'listMaterials',mapping:'listSupplyMappings',qualification:'listQualifications',evaluation:'listEvaluations',issue:'listIssues',activity:'listActivity',role:'listRoles',member:'listMembers'};
async function load(ctx:ServerContext){const entries=await Promise.all(Object.entries(readers).map(async([key,id])=>{const rows:Row[]=[];for(let offset=0;offset<=10000;offset+=500){const page=await query(ctx,id,[offset]);rows.push(...page);if(rows.length>10000)reject('台账超出当前读取范围，需扩展服务端分页');if(page.length<500)break;}if(new Set(rows.map(r=>r.record_id)).size!==rows.length)reject('数据存在重复关联或角色配置，请管理员核对');return[key,rows] as const;}));return Object.fromEntries(entries);}

const targets={supplier:TABLES.Suppliers,material:TABLES.Materials,mapping:TABLES.SupplyMappings,technical:TABLES.SupplyMappings,qualification:TABLES.SupplierQualifications,evaluation:TABLES.SupplierEvaluations,issue:TABLES.SupplierIssues,lifecycle:TABLES.Suppliers,role:TABLES.Roles,member:TABLES.Members};
const attachmentFields={supplier:'供应商附件',material:'物料照片',mapping:'产品照片与目录',qualification:'资质附件'} as const;
export default defineFunction({input,output,handler:async(p,ctx)=>{
 let attempted=false;let operationId:string|null=null;
 try{
  const members=await query(ctx,'whoami',[]);if(members.length!==1||!members[0].user_id)reject('请管理员在成员表配置唯一的启用角色');
  const m=members[0];const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const actor:Row={permissions:permissionsFor(m),id:String(m.user_id),roleCode:m.role_code||null,role:String(m.role),name:`${m.name||m.user_id} (${m.user_id})`,today:`${day}T00:00:00+01:00`};
  const source=await load(ctx);
  if(p.operation==='snapshot'){const summaries=has(actor,'dashboard.view')||has(actor,'reports.view')?Object.fromEntries(await Promise.all(['summarySuppliers','summaryMaterials','summaryMappings','summaryQualifications'].map(async id=>[id,await query(ctx,id,[])]))):{};return {payload:JSON.stringify({status:'ready',source,summaries,actor:{name:m.name,role:m.role,permissions:actor.permissions}})}};
  if(!p.target)reject('请指定业务对象');const target=p.target!;
  let command:Row;try{command=object(JSON.parse(p.commandJson||''));}catch{reject('业务参数格式错误')}
  const table=targets[target];
  async function tracked(run:()=>Promise<any>,recordIds:string[],summary:string){
   attempted=true;operationId='OP-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
   const log=await ctx.records.create(TABLES.ActivityLog,[{'操作编号':operationId,'业务对象':target,'操作类型':p.operation,'操作人':actor.name,'影响记录':recordIds.join(','),'变更摘要':summary.slice(0,10000),'结果':'待核查'}]);
   if(log.status!=='success')return {status:log.status==='failed'?'failed':'unknown',operationId};
   const result=await run();const status=result.status==='success'?'已完成':result.status==='partial'?'部分完成':result.status==='failed'?'未执行':'待核查';
   const finished=await ctx.records.update(TABLES.ActivityLog,{[log.appliedIds[0]]:{'结果':status,'影响记录':(result.appliedIds||recordIds).join(',')}});
   return {...result,status:finished.status==='success'?result.status:'partial',operationId,auditRecordId:log.appliedIds[0]};
  }
  if(p.operation==='govern'){
   const plan=governancePlan(target,command!,source,actor);
   const r=await tracked(()=>plan.recordId?ctx.records.update(table,{[plan.recordId]:plan.fields}):ctx.records.create(table,[plan.fields]),plan.recordId?[plan.recordId]:[],JSON.stringify({fields:Object.keys(plan.fields)}));
   return {payload:JSON.stringify({status:r.status==='success'?'saved':r.status==='failed'?'rejected':'review',result:r})};
  }

  if(p.operation==='importPreview'){
   const plans=previewImport(target,command!,source,actor);return {payload:JSON.stringify({status:'preview',count:plans.length,plans})};
  }
  if(p.operation==='bulk'){
   const plan=bulkPlan(target,command!,source,actor);
   if(command!.preview!==false)return {payload:JSON.stringify({status:'preview',...plan})};
   if(plan.blockers.length)reject('所选资料存在供货关系，整批删除已拦截');
   if(command!.expectedPreviewKey!==plan.previewKey)reject('资料已变更，请重新预览后确认');
   if(plan.action==='delete'&&command!.confirmation!==`删除 ${plan.count} 条`)reject('请填写删除确认文字');
   attempted=true;
   const r=await tracked(()=>plan.action==='delete'?ctx.records.delete(table,plan.ids):ctx.records.update(table,Object.fromEntries(plan.plans.map(x=>[x.recordId,x.fields]))),plan.ids,JSON.stringify({action:plan.action,patch:command!.patch||{},count:plan.count}));
   return {payload:JSON.stringify({status:r.status==='success'?'saved':r.status==='failed'?'rejected':'review',result:r,message:r.status==='failed'?'本次操作被拒绝，请刷新核对资料':undefined})};
  }
  if(p.operation==='attach'){
   if(!['supplier','material','mapping','qualification'].includes(target))reject('此模块不支持附件追加');if(target==='qualification'){if(!has(actor,'qualification.write'))reject('无资质维护权限')}else authorize(actor.role,target,actor.permissions);
   const recordId=command!.recordId;if(!source[target].some(r=>r.record_id===recordId))reject('目标记录不存在');
   const files=command!.files;if(!Array.isArray(files)||files.length<1||files.length>10)reject('每次追加1至10个附件');
   const items=files.map((f:Row)=>{if(typeof f.file_token!=='string'||!/^[A-Za-z0-9_-]{1,256}$/.test(f.file_token))reject('附件标识无效');const item:Row={file_token:f.file_token};if(f.image_width!==undefined||f.image_height!==undefined){if(!Number.isInteger(f.image_width)||!Number.isInteger(f.image_height)||f.image_width<=0||f.image_height<=0)reject('图片尺寸无效');item.image_width=f.image_width;item.image_height=f.image_height;}return item});
   attempted=true;const r=await tracked(()=>ctx.records.appendAttachments(table,{[recordId]:{[attachmentFields[target as keyof typeof attachmentFields]]:items}}),[recordId],'追加附件 '+items.length+' 个');
   return {payload:JSON.stringify({status:r.status==='success'?'saved':'review',result:r})};
  }
  let plans;
  if(p.operation==='import'){
   if(!['supplier','material'].includes(target))reject('仅支持供应商和物料资料导入');
   plans=importPlan(target,command!.mode,command!.rows,source,actor,100,{matchBy:command!.matchBy});
   if(command!.preview!==false)return {payload:JSON.stringify({status:'preview',count:plans.length,plans})};
  }else {if(!['supplier','material','mapping','technical'].includes(target))reject('请选择正确业务操作');plans=[validate(target,command!,source,actor)];}
  const creates=plans.filter(r=>!r.recordId),updates=plans.filter(r=>r.recordId);
  if(creates.length&&updates.length)reject('请将新增与更新分批提交');
  attempted=true;
  const r=await tracked(()=>creates.length?ctx.records.create(table,creates.map(r=>r.fields as Record<string,JsonValue>)):ctx.records.update(table,Object.fromEntries(updates.map(r=>[r.recordId!,r.fields]))),updates.map(r=>r.recordId!),JSON.stringify({count:plans.length,fields:[...new Set(plans.flatMap(r=>Object.keys(r.fields)))],batchId:command!.batchId||null}));
  return {payload:JSON.stringify({status:r.status==='success'?'saved':r.status==='failed'?'rejected':'review',result:r,message:r.status==='failed'?'本次写入被拒绝，请核对资料后再操作':undefined})};
 }catch(e){
  if(!attempted&&e instanceof BusinessError)return {payload:JSON.stringify({status:'rejected',message:e.message})};
  if(!attempted&&e instanceof SDKError)throw e;
  // A transport error after a create/append may hide a successful write. Never retry automatically.
  if(attempted)return {payload:JSON.stringify({status:'review',operationId,message:'保存结果尚未确认，请在操作日志核对记录；不要重复提交'})};
  throw new SDKError('SUPPLIER_FAILED','暂时无法处理，请刷新后重试',{wireCode:50001});
 }
}});
