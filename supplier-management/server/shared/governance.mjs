import {BusinessError} from './domain.mjs';import {has,PERMISSIONS} from './access.mjs';
const fail=m=>{throw new BusinessError(m)},text=(p,k)=>typeof p[k]==='string'?p[k].trim():'';
const required=(p,k)=>{const v=text(p,k);if(!v)fail(`请填写${k}`);if(v.length>10000)fail(`${k}内容过长`);return v};
const select=(p,k,values)=>{const v=required(p,k);if(!values.includes(v))fail(`${k}选项无效`);return v};
function date(p,k,optional=false){const v=text(p,k);if(!v&&optional)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(new Date(v+'T00:00:00Z').getTime())||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)fail(`${k}须为有效YYYY-MM-DD日期`);return v+'T00:00:00+01:00';}
export const DEPENDENCIES={'supplier.write':['supplier.read'],'material.write':['material.read'],'mapping.write':['supplier.read','material.read','mapping.read'],'technical.confirm':['mapping.read'],'qualification.write':['qualification.read','supplier.read'],'qualification.approve':['qualification.read','qualification.write','supplier.read'],'evaluation.write':['evaluation.read','supplier.read'],'issue.write':['issue.read','supplier.read'],'lifecycle.manage':['supplier.read','qualification.read','issue.read'],'admin.bulk':['supplier.read','material.read','mapping.read','qualification.read','evaluation.read','issue.read'],'admin.import':['supplier.read','supplier.write','material.read','material.write'],'admin.roles':[]};
export function normalizePermissions(input){if(!Array.isArray(input)||input.some(x=>!PERMISSIONS.some(([p])=>p===x)))fail('权限代码无效');const s=new Set(input);for(const p of s)for(const dep of DEPENDENCIES[p]||[])s.add(dep);return [...s].sort()}
export function governancePlan(target,command,source,actor){
 const needed={qualification:'qualification.write',evaluation:'evaluation.write',issue:'issue.write',lifecycle:'lifecycle.manage',role:'admin.roles',member:'admin.roles'}[target];if(!needed||!has(actor,needed))fail('当前角色无此模块操作权限');
 const p=command.fields||{},id=command.recordId||null,rows=source[target==='lifecycle'?'supplier':target]||[],old=id?rows.find(r=>r.record_id===id):null;if(id&&!old)fail('记录已不存在，请刷新');let out={};
 if(target==='role'){
  const code=required(p,'角色编码');if(!/^[a-z][a-z0-9_-]{1,40}$/.test(code))fail('角色编码使用2至41位小写字母、数字、下划线或短横线');if(rows.some(r=>r.record_id!==id&&r['角色编码']===code))fail('角色编码重复');if(old&&old['角色编码']!==code)fail('角色编码不能修改');
  const permissions=normalizePermissions(p.permissions);if(old&&actor.roleCode===code&&(!permissions.includes('admin.roles')||p['启用']!==true))fail('不能移除本人角色的角色管理权限或停用本人角色');
  out={'角色编码':code,'角色名称':required(p,'角色名称'),'权限代码':'|'+permissions.join('|')+'|','启用':p['启用']===true};
 }else if(target==='member'){
  if(old&&old.user_id===actor.id)fail('不能通过成员管理修改本人权限，请由其他管理员处理');
  const uid=required(p,'用户ID');if(!/^[0-9]{5,30}$/.test(uid))fail('请使用成员选择器选择平台成员');if(rows.some(r=>r.record_id!==id&&r.user_id===uid))fail('此成员已存在');
  const role=source.role.find(r=>r['角色编码']===p['角色编码']&&r['启用']===true);if(!role)fail('请选择启用的角色');out={'成员姓名':required(p,'成员姓名'),'用户':[{id:uid}],'角色编码':role['角色编码'],'角色':'只读','状态':select(p,'状态',['启用','停用'])};
 }else if(target==='lifecycle'){
  if(!old)fail('请选择供应商');const life=select(p,'生命周期',['潜在','待准入','准入审核中','合格','暂停','退出']);out={'生命周期':life,'合作等级':select(p,'合作等级',['战略','优选','合格','观察']),'风险等级':select(p,'风险等级',['未评估','低','中','高']),'风险依据':text(p,'风险依据'),'主营类别':text(p,'主营类别'),'准入依据':text(p,'准入依据')};
  if(out['风险等级']!=='未评估'&&!out['风险依据'])fail('风险结论须有依据');
  if(life==='合格'){
   if(!out['准入依据'])fail('合格准入须填写评审依据');
   const docs=source.qualification.filter(r=>r.supplier_id===id&&r['审核状态']==='通过'&&(r['长期有效']===true||String(r['有效期']||'').slice(0,10)>=actor.today.slice(0,10)));if(!docs.length)fail('合格准入须有至少一项已审核且有效的资质记录');
   if(source.issue.some(r=>r.supplier_id===id&&r['风险等级']==='高'&&r['状态']!=='已关闭'))fail('存在未关闭高风险问题，不能通过准入');
  }
  if(life==='暂停')out['合作状态']='暂停合作';if(life==='退出')out['合作状态']='停止合作';
 }else{
  const supplier=source.supplier.find(r=>r.record_id===p.supplierId);if(!supplier)fail('请选择有权查看的供应商');out['供应商']=[supplier.record_id];
  if(target==='qualification'){
   out={...out,'资质名称':required(p,'资质名称'),'资质类型':select(p,'资质类型',['企业登记','税务','质量认证','行业许可','其他']),'证照编号':text(p,'证照编号'),'长期有效':p['长期有效']===true,'有效期':p['长期有效']===true?null:date(p,'有效期'),'审核状态':select(p,'审核状态',['待审核','通过','不通过']),'审核依据':text(p,'审核依据'),'维护负责人':required(p,'维护负责人'),'操作人':actor.name};
   if(out['审核状态']!=='待审核'&&(!has(actor,'qualification.approve')||!out['审核依据']))fail('资质结论须由有审核权限的人员填写依据');
  }else if(target==='evaluation'){
   if(old)fail('绩效评价保留历史，不允许覆盖；请新增评价或更正记录');out={...out,'评价编号':required(p,'评价编号'),'评价周期':required(p,'评价周期'),'工厂':required(p,'工厂'),'评价依据':required(p,'评价依据'),'评价人':actor.name};
   let score=0,weights=0;for(const dimension of ['质量','交付','服务','协同']){const value=Number(p[dimension+'得分']),weight=Number(p[dimension+'权重']);if(p[dimension+'得分']===''||p[dimension+'权重']===''||!Number.isFinite(value)||!Number.isFinite(weight)||value<0||value>100||weight<0||weight>100)fail('各项得分和权重须为0至100的数字');out[dimension+'得分']=value;out[dimension+'权重']=weight;score+=value*weight/100;weights+=weight;}if(Math.abs(weights-100)>0.001)fail('评价权重合计须为100%');out['综合得分']=Math.round(score*10)/10;
   if(rows.some(r=>r['评价编号']===out['评价编号']))fail('评价编号重复');
  }else{
   out={...out,'问题编号':required(p,'问题编号'),'问题主题':required(p,'问题主题'),'工厂':required(p,'工厂'),'风险等级':select(p,'风险等级',['低','中','高']),'责任人':required(p,'责任人'),'计划完成日期':date(p,'计划完成日期'),'状态':select(p,'状态',['待处理','整改中','待复核','已关闭']),'整改措施':text(p,'整改措施'),'关闭依据':text(p,'关闭依据'),'操作人':actor.name};
   if(rows.some(r=>r.record_id!==id&&r['问题编号']===out['问题编号']))fail('问题编号重复');if(old&&old['问题编号']!==out['问题编号'])fail('问题编号不能修改');if(out['状态']==='已关闭'&&!out['关闭依据'])fail('关闭问题须填写复核依据');if(out['状态']!=='待处理'&&!out['整改措施'])fail('请填写整改措施');
  }
 }
 return {recordId:id,fields:out};
}
