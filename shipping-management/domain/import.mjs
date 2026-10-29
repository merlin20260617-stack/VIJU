import {apply} from './shipping.mjs';
export const fields={
  customers:[['code','客户代码'],['name','客户名称']],
  products:[['code','产品代码'],['name','产品名称'],['pcsPerCarton','每箱件数'],['cartonsPerPallet','每板箱数']]
};
export const aliases={code:['code','客户代码','客户编码','customer code','产品代码','产品编码','product code','item code'],name:['name','客户名称','customer name','产品名称','product name','item name'],slot:['slot','看板位置','位置'],pcsPerCarton:['pcspercarton','每箱件数','pcs/carton'],cartonsPerPallet:['cartonsperpallet','每板箱数','每板标准装载数','cartons/pallet']};
export function parseCSV(text) {
  const rows=[];let row=[],value='',quoted=false,closed=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else {quoted=false;closed=true;}}else value+=c;}
    else if(c==='"'){if(value||closed)throw new Error('CSV 引号位置错误');quoted=true;}
    else if(c===','||c==='\n'||c==='\r'){row.push(value);value='';closed=false;if(c!==','){rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}}
    else {if(closed)throw new Error('CSV 闭合引号后出现无效字符');value+=c;}
  }
  if(quoted)throw new Error('CSV 引号未闭合');
  if(value||row.length){row.push(value);rows.push(row);}return rows;
}
export function autoMapping(headers,type){return Object.fromEntries(fields[type].map(([key])=>[key,headers.findIndex(h=>(aliases[key]||[]).includes(String(h).trim().toLowerCase()))]));}
export function previewImport(s,type,rows,mapping,mode='error') {
  if(!fields[type])throw new Error('只支持客户或产品导入');
  const indexes=fields[type].map(([key])=>mapping[key]);
  if(indexes.some(i=>!Number.isInteger(i)||i<0)||new Set(indexes).size!==indexes.length)throw new Error('每个必填字段必须匹配不同的列');
  const records=[],errors=[],warnings=[],seen=new Set();
  if(rows.length>5000)throw new Error('每次最多导入5000行');
  rows.forEach((row,i)=>{
    if(row.every(x=>String(x??'').trim()===''))return;
    const r={};for(const [key] of fields[type]){const value=String(row[mapping[key]]??'').trim();r[key]=['slot','pcsPerCarton','cartonsPerPallet'].includes(key)?(value?Number(value):NaN):value;}
    if(!r.code||!r.name)errors.push({row:i+2,message:'代码、名称不能为空'});
    if(seen.has(r.code))errors.push({row:i+2,message:'文件中代码重复：'+r.code});seen.add(r.code);
    for(const [key,label] of fields[type])if(typeof r[key]==='number'&&(!Number.isSafeInteger(r[key])||r[key]<1||(key==='slot'&&r[key]>100)))errors.push({row:i+2,message:label+'必须是范围内的正整数'});
    if(s[type].some(x=>x.code===r.code)){if(mode==='error')errors.push({row:i+2,message:'代码已存在：'+r.code});else warnings.push({row:i+2,message:(mode==='skip'?'跳过：':'更新：')+r.code});}
    records.push(r);
  });
  if(!records.length)errors.push({row:1,message:'没有可导入的数据'});
  if(!errors.length)try{apply(s,{requestId:'import-validation',expectedVersion:s.version,operation:'master',payload:{type,rows:records,mode}},{id:'validation',role:'admin'});}catch(e){errors.push({row:0,message:e.message});}
  return {records,errors,warnings};
}
