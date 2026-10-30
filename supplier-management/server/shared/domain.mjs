export const OPTIONS={cooperation:['待核实','合作中','暂停合作','停止合作'],profile:['待补充','已核实'],material:['有效','停用'],critical:['是','否'],supply:['待核实','确认可供应','实际采购过','已失效'],technical:['待技术确认','已验证适配','不适配','不适用']};
export class BusinessError extends Error{}
import {has} from './access.mjs';
const fail=m=>{throw new BusinessError(m)};
const clean=v=>typeof v==='string'?v.trim():'';
export const canonical=v=>clean(v).normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
const str=(p,k,max=3000)=>{const v=clean(p[k]);if(v.length>max)fail(`${k}超过${max}字符`);return v};
const required=(p,k)=>{const v=str(p,k);if(!v)fail(`请填写${k}`);return v};
const choice=(p,k,list,fallback)=>{const v=str(p,k)||fallback;if(!list.includes(v))fail(`${k}选项无效`);return v};
const isId=v=>typeof v==='string'&&/^rec[A-Za-z0-9]{1,32}$/.test(v);
export function authorize(role,action,permissions){
 if(permissions){if(!has({permissions},({supplier:'supplier.write',material:'material.write',mapping:'mapping.write',technical:'technical.confirm'})[action]))fail('当前角色无权执行此操作');return;}
 const allowed={supplier:['管理员','采购'],material:['管理员','中央仓'],mapping:['管理员','采购'],technical:['管理员','技术']};
 if(!allowed[action]?.includes(role))fail('当前角色无权执行此操作');
}
const keys={supplier:'供应商编号',material:'物料编码',mapping:'关系编号'};
export function validate(action,input,source,actor){
 authorize(actor.role,action,actor.permissions);
 if(!input||typeof input!=='object'||Array.isArray(input))fail('数据格式无效');
 const rid=input.recordId||null;if(rid&&!isId(rid))fail('记录编号无效');
 const table=action==='technical'?'mapping':action,rows=source[table]||[];
 const old=rid?rows.find(r=>r.record_id===rid):null;if(rid&&!old)fail('记录不存在，请刷新');
 const p=input.fields;if(!p||typeof p!=='object'||Array.isArray(p))fail('请填写业务字段');
 let out={};
 if(action==='supplier'){
  out={'供应商编号':required(p,'供应商编号'),'供应商名称':required(p,'供应商名称'),'国家':str(p,'国家')};
  out['推广阶段']=choice(p,'推广阶段',['试点','正式'],'试点');
  out['来源系统']=str(p,'来源系统');out['ERP供应商编码']=str(p,'ERP供应商编码');
  for(const k of ['城市','地址','联系人','电话','WhatsApp','经营范围','负责工厂','维护负责人','质量评价','交付与售后评价','评价依据与问题'])out[k]=str(p,k);
  out['合作状态']=choice(p,'合作状态',OPTIONS.cooperation,'待核实');
  out['资料状态']=choice(p,'资料状态',OPTIONS.profile,'待补充');
  if(out['资料状态']==='已核实'&&(!out['国家']||!out['城市']||!out['联系人']||!out['经营范围']||!(out['电话']||out['WhatsApp'])))fail('已核实供应商须有国家、城市、联系人、联系方式和经营范围');
  if((out['质量评价']||out['交付与售后评价'])&&!out['评价依据与问题'])fail('评价须填写具体依据');
  if(out['资料状态']==='已核实')out['最近核实日期']=actor.today;
  if(rows.some(r=>r.record_id!==rid&&canonical(r['供应商名称'])===canonical(out['供应商名称'])&&canonical(r['城市'])===canonical(out['城市'])))fail('同名同城市供应商已存在，请先核对档案');
 }else if(action==='material'){
  out={'物料编码':required(p,'物料编码'),'物料名称':required(p,'物料名称')};
  for(const k of ['类别','规格','型号','单位','适用设备与产线','主档来源'])out[k]=str(p,k);
  out['主档状态']=choice(p,'主档状态',OPTIONS.material,'有效');out['关键备件']=choice(p,'关键备件',OPTIONS.critical,'否');
  out['来源系统']=str(p,'来源系统');out['ERP物料编码']=str(p,'ERP物料编码');
  if(!out['主档来源'])fail('请填写中央仓主档来源');
  out['主档核实日期']=actor.today;
 }else if(action==='mapping'){
  out={'关系编号':required(p,'关系编号'),'供应商产品型号':str(p,'供应商产品型号'),'供货验证状态':choice(p,'供货验证状态',OPTIONS.supply,'待核实')};
  const supplier=source.supplier.find(r=>r.record_id===p.supplierId),material=source.material.find(r=>r.record_id===p.materialId);
  if(!supplier||!material)fail('请选择已存在的供应商和正式物料');
  if(material['主档状态']==='停用')fail('物料已停用');
  if(['暂停合作','停止合作'].includes(supplier['合作状态']))fail('供应商当前暂停或停止合作');
  out['供应商']=[supplier.record_id];out['物料']=[material.record_id];
  for(const k of ['供货核实依据','适用工厂','适用设备与产线','备注'])out[k]=str(p,k);
  if(['确认可供应','实际采购过'].includes(out['供货验证状态'])&&!out['供货核实依据'])fail('确认供货或历史采购须填写核实依据');
  const same=rows.some(r=>r.record_id!==rid&&r.supplier_id===supplier.record_id&&r.material_id===material.record_id&&canonical(r['供应商产品型号'])===canonical(out['供应商产品型号'])&&canonical(r['适用工厂'])===canonical(out['适用工厂'])&&canonical(r['适用设备与产线'])===canonical(out['适用设备与产线']));
  if(same)fail('相同供应商、物料、型号及适用范围的关系已存在');
  if(old&&(old.supplier_id!==supplier.record_id||old.material_id!==material.record_id||old['供应商产品型号']!==out['供应商产品型号']||old['适用设备与产线']!==out['适用设备与产线']||old['适用工厂']!==out['适用工厂'])){
   out['技术适配状态']='待技术确认';out['技术确认人']='';out['技术确认依据']='';out['技术确认日期']=null;
  }
  if(!old)out['技术适配状态']='待技术确认';
  out['供货核实人']=actor.name;out['供货核实日期']=actor.today;
 }else if(action==='technical'){
  if(!old)fail('请先建立供货关系');
  out['技术适配状态']=choice(p,'技术适配状态',OPTIONS.technical,'待技术确认');out['技术确认依据']=str(p,'技术确认依据');
  if(out['技术适配状态']!=='待技术确认'&&!out['技术确认依据'])fail('技术结论须填写规格、设备和核实依据');
  if(old['关键备件']==='是'&&out['技术适配状态']==='不适用')fail('关键备件必须经过技术确认');
  out['技术确认人']=actor.name;out['技术确认日期']=actor.today;
 }
 const key=keys[action];if(key){
  if(old&&out[key]!==old[key])fail('业务编号建立后不能修改，请核对原档案');
  if(rows.some(r=>r.record_id!==rid&&canonical(r[key])===canonical(out[key])))fail(`${key}重复`);
 }
 return {recordId:rid,fields:out};
}
export function importPlan(action,mode,rows,source,actor,limit=100,options={}){
 if(!['supplier','material'].includes(action)||!['新增','更新'].includes(mode))fail('导入类型无效');
 authorize(actor.role,action,actor.permissions);if(!Array.isArray(rows)||!rows.length||rows.length>limit)fail(`每次导入1至${limit}条`);
 const key=keys[action],seen=new Set(),plans=[],temp={...source,[action]:[...source[action]]};
 for(let i=0;i<rows.length;i++){
  try{
   const row=rows[i];if(!row||typeof row!=='object')fail('行格式无效');
   const externalField=action==='supplier'?'ERP供应商编码':'ERP物料编码',useERP=options.matchBy==='ERP编码';
   const code=useERP?required(row,externalField):required(row,key),system=useERP?required(row,'来源系统'):'';
   const norm=canonical(code),dedupe=useERP?canonical(system)+'|'+norm:norm;if(seen.has(dedupe))fail(`${useERP?externalField:key}在文件内重复`);seen.add(dedupe);
   const matches=source[action].filter(r=>useERP?canonical(r[externalField])===norm&&canonical(r['来源系统'])===canonical(system):canonical(r[key])===norm);if(matches.length>1)fail('底表存在重复编码，须先整理');
   const old=matches[0];if(mode==='新增'&&old)fail('编码已存在，请改用更新');if(mode==='更新'&&!old)fail('编码不存在，请改用新增');
   // Empty import cells do not erase maintained values. Import never submits attachment fields.
   const fields={...(old||{}),...Object.fromEntries(Object.entries(row).filter(([,v])=>clean(v)!==''))};
   if(useERP&&old)fields[key]=old[key];
   const plan=validate(action,{recordId:old?.record_id,fields},temp,actor);plans.push(plan);
   const merged={...(old||{}),...plan.fields,record_id:old?.record_id||`recImport${i}`};
   if(old)temp[action]=temp[action].map(r=>r.record_id===old.record_id?merged:r);else temp[action].push(merged);
  }catch(e){fail(`第${i+2}行：${e.message}`)}
 }
 return plans;
}
