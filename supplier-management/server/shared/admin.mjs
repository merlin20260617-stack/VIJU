import {BusinessError,validate,importPlan} from './domain.mjs';
import {has} from './access.mjs';
export const BULK_FIELDS={supplier:['国家','城市','地址','联系人','电话','WhatsApp','经营范围','负责工厂','维护负责人','合作状态','资料状态','推广阶段'],material:['类别','规格','型号','单位','适用设备与产线','主档来源','主档状态','关键备件']};
const fail=m=>{throw new BusinessError(m)};
export function bulkPlan(target,command,source,actor){
 if(!has(actor,'admin.bulk'))fail('当前角色无批量管理权限');
 if(!['supplier','material'].includes(target))fail('批量操作仅支持供应商与物料');
 const {action,ids,patch={}}=command;
 if(!['update','delete'].includes(action))fail('批量操作类型无效');
 if(!Array.isArray(ids)||!ids.length||ids.length>200||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^rec[A-Za-z0-9]{1,32}$/.test(id)))fail('每次选择1至200条不同的有效记录');
 const ordered=[...ids].sort(),rows=ordered.map(id=>source[target].find(r=>r.record_id===id));if(rows.some(r=>!r))fail('部分记录已不存在，请刷新后重新选择');
 const referenced=source.mapping.filter(m=>ordered.includes(target==='supplier'?m.supplier_id:m.material_id));
 if(target==='supplier')for(const module of ['qualification','evaluation','issue'])for(const r of source[module]||[])if(ordered.includes(r.supplier_id))referenced.push(r);
 const key=target==='supplier'?'供应商编号':'物料编码',name=target==='supplier'?'供应商名称':'物料名称';
 const blockers=action==='delete'?rows.filter(r=>referenced.some(m=>(target==='supplier'?m.supplier_id:m.material_id)===r.record_id)).map(r=>({recordId:r.record_id,code:r[key],name:r[name],reason:'存在供货、资质、绩效或整改关联，当前整批不会删除；建议停用保留历史'})):[];
 let plans=[];
 if(action==='update'){
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length||Object.keys(patch).some(k=>!BULK_FIELDS[target].includes(k)||typeof patch[k]!=='string'))fail('请选择允许批量修改的字段');
  plans=rows.map(r=>{const checked=validate(target,{recordId:r.record_id,fields:{...r,...patch}},source,{...actor,permissions:[...(actor.permissions||[]),target+'.write']});return {recordId:r.record_id,fields:Object.fromEntries(Object.keys(patch).map(k=>[k,checked.fields[k]]))}});
 }
 const items=rows.map(r=>({recordId:r.record_id,code:r[key],name:r[name]}));
 const previewKey=JSON.stringify({target,action,ids:ordered,patch,versions:rows.map(r=>[r.record_id,r['更新时间'],...Object.keys(patch).sort().map(k=>r[k])]),references:referenced.map(m=>[m.record_id,m.supplier_id,m.material_id]).sort((a,b)=>a[0].localeCompare(b[0]))});
 return {action,ids:ordered,count:rows.length,items,blockers,plans,previewKey};
}
export function previewImport(target,command,source,actor){if(!has(actor,'admin.import'))fail('当前角色无后台导入权限');return importPlan(target,command.mode,command.rows,source,actor,2000,{matchBy:command.matchBy})}
