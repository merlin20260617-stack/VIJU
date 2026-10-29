export class BusinessError extends Error {}
const requireThat = (ok, message) => { if (!ok) throw new BusinessError(message); };
const integer = (n, min = 1) => Number.isSafeInteger(n) && n >= min && n <= 1000000000;
const text = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 200;
export const day = (time = Date.now(), timeZone = 'Africa/Lagos') => new Intl.DateTimeFormat('en-CA', {timeZone, year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
export const emptyState = () => ({version:0,timeZone:'Africa/Lagos',factories:[],warehouses:[],products:[],customers:[],orders:[],batches:[],opening:[],audit:[],requests:{}});
export function pallets(qty, standard) {
  requireThat(integer(qty,0) && integer(standard), '数量必须是非负整数，每板箱数必须大于零');
  return {full:Math.floor(qty/standard), remainder:qty%standard, required:Math.ceil(qty/standard)};
}
export function inventory(s, warehouse, product, now=Date.now()) {
  const opening=s.opening.filter(x=>x.warehouse===warehouse && x.product===product).reduce((n,x)=>n+x.qty,0);
  const batches=s.batches.filter(x=>x.warehouse===warehouse && x.product===product && Date.parse(x.producedAt)<=now);
  const matured=batches.filter(x=>now-Date.parse(x.producedAt)>=86400000).reduce((n,x)=>n+x.qty,0);
  const waiting=batches.filter(x=>now-Date.parse(x.producedAt)<86400000).reduce((n,x)=>n+x.qty,0);
  const shipped=s.orders.filter(o=>o.warehouse===warehouse && o.status==='completed').flatMap(o=>o.lines).filter(l=>l.product===product).reduce((n,l)=>n+l.qty,0);
  const pending=s.orders.filter(o=>o.warehouse===warehouse && o.status==='pending').flatMap(o=>o.lines).filter(l=>l.product===product).reduce((n,l)=>n+l.qty,0);
  return {opening,matured,waiting,shipped,available:opening+matured-shipped,pending,projected:opening+matured-shipped-pending};
}
export function summary(s, date, warehouse, now=Date.now()) {
  const orders=s.orders.filter(o=>(!warehouse||o.warehouse===warehouse));
  const qty=o=>o.lines.reduce((n,l)=>n+l.qty,0);
  return {
    ordered:orders.filter(o=>o.date===date).reduce((n,o)=>n+qty(o),0),
    pending:orders.filter(o=>o.date===date && o.status==='pending').reduce((n,o)=>n+qty(o),0),
    shipped:orders.filter(o=>o.status==='completed' && day(o.completedAt,s.timeZone)===date).reduce((n,o)=>n+qty(o),0),
    completed:orders.filter(o=>o.status==='completed' && day(o.completedAt,s.timeZone)===date).length,
    production:s.batches.filter(b=>(!warehouse||b.warehouse===warehouse)&&day(b.producedAt,s.timeZone)===date).reduce((n,b)=>n+b.qty,0),
    waiting:s.products.reduce((n,p)=>n+s.warehouses.filter(w=>!warehouse||w.code===warehouse).reduce((m,w)=>m+inventory(s,w.code,p.code,now).waiting,0),0)
  };
}
export function board(s,date,warehouse,page=0) {
  const customers=[...new Set(s.orders.filter(o=>o.date===date&&o.warehouse===warehouse).map(o=>o.customer))];
  return Array.from({length:100},(_,i)=>{
    const customer=s.customers.find(c=>c.code===customers[page*100+i]);
    const orders=customer?s.orders.filter(o=>o.customer===customer.code&&o.date===date&&o.status==='pending'&&o.warehouse===warehouse).sort((a,b)=>a.sequence-b.sequence||a.number.localeCompare(b.number)):[];
    return {slot:page*100+i+1,customer:orders.length?customer:null,orders};
  });
}
function validateMasters(s) {
  for(const type of ['factories','warehouses','products','customers']) {
    const rows=s[type]; requireThat(new Set(rows.map(r=>r.code)).size===rows.length,'代码重复');
    for(const r of rows) {
      requireThat(text(r.code)&&text(r.name),'代码和名称为必填文本');
      if(type==='warehouses')requireThat(s.factories.some(f=>f.code===r.factory),'仓库必须关联已存在的工厂');
      if(type==='products')requireThat(integer(r.pcsPerCarton)&&integer(r.cartonsPerPallet),'每箱件数和每板箱数必须是正整数');
    }
  }
}
// Pure transaction: caller persists the returned state with a compare-and-swap.
// An error never mutates the previous state. The browser demo uses a local lock.
export function apply(previous, command, actor, now=Date.now()) {
  requireThat(actor&&text(actor.id)&&['admin','warehouse','viewer'].includes(actor.role),'身份无效');
  requireThat(actor.role!=='viewer','只读用户不能修改');
  requireThat(text(command.requestId),'操作编号缺失');
  const fingerprint=JSON.stringify({actor:actor.id,operation:command.operation,payload:command.payload});
  const prior=previous.requests[command.requestId];
  if(prior){requireThat(prior===fingerprint,'操作编号重复且内容不同');return previous;}
  requireThat(command.expectedVersion===previous.version,'数据已更新，请刷新后重试');
  const s=structuredClone(previous), p=command.payload||{};
  const warehouse=code=>{const w=s.warehouses.find(w=>w.code===code);requireThat(w,'仓库不存在');if(actor.role!=='admin')requireThat(actor.warehouses?.includes(code),'没有该仓库权限');return w;};
  switch(command.operation) {
    case 'master': {
      requireThat(actor.role==='admin','仅管理员可维护基础数据');
      requireThat(['factories','warehouses','products','customers'].includes(p.type),'基础数据类型错误');
      requireThat(Array.isArray(p.rows)&&p.rows.length>0&&p.rows.length<=5000,'导入行数必须在1到5000之间');
      requireThat(['error','skip','update'].includes(p.mode),'重复处理方式无效');
      requireThat(new Set(p.rows.map(r=>r.code)).size===p.rows.length,'文件中存在重复代码');
      const keys={factories:['code','name'],warehouses:['code','name','factory'],products:['code','name','pcsPerCarton','cartonsPerPallet'],customers:['code','name']}[p.type];
      for(const row of p.rows) {
        const clean=Object.fromEntries(keys.map(k=>[k,row[k]])), idx=s[p.type].findIndex(r=>r.code===row.code);
        if(idx>=0){requireThat(p.mode!=='error','代码已存在：'+row.code);if(p.mode==='update')s[p.type][idx]=clean;}
        else s[p.type].push(clean);
      }
      validateMasters(s);break;
    }
    case 'masterDelete': {
      requireThat(actor.role==='admin','仅管理员可删除基础资料');
      requireThat(['factories','warehouses','products','customers'].includes(p.type),'基础资料类型无效');
      requireThat(Array.isArray(p.codes)&&p.codes.length>0&&p.codes.length<=200&&new Set(p.codes).size===p.codes.length&&p.codes.every(text),'每次请选择1到200个不同代码');
      for(const code of p.codes){
        requireThat(s[p.type].some(r=>r.code===code),'资料不存在或已删除：'+code);
        const used=p.type==='customers'?s.orders.some(o=>o.customer===code):p.type==='products'?s.orders.some(o=>o.lines.some(l=>l.product===code))||s.batches.some(b=>b.product===code)||s.opening.some(b=>b.product===code):p.type==='factories'?s.warehouses.some(w=>w.factory===code):s.orders.some(o=>o.warehouse===code)||s.batches.some(b=>b.warehouse===code)||s.opening.some(b=>b.warehouse===code);
        requireThat(!used,'代码 '+code+' 已被订单、入库、库存或仓库资料使用，不能删除；请先核对关联记录');
      }
      s[p.type]=s[p.type].filter(r=>!p.codes.includes(r.code));break;
    }
    case 'order': {
      warehouse(p.warehouse);requireThat(s.customers.some(c=>c.code===p.customer),'客户不存在');
      requireThat(text(p.number)&&/^\d{4}-\d{2}-\d{2}$/.test(p.date)&&day(p.date+'T12:00:00Z')===p.date,'订单号或日期无效');
      requireThat(integer(p.sequence),'装货顺序必须是正整数');
      const idx=s.orders.findIndex(o=>o.id===p.id);
      if(p.id){requireThat(idx>=0,'订单不存在');warehouse(s.orders[idx].warehouse);requireThat(s.orders[idx].status==='pending','已完成订单须先撤回再修改');}
      requireThat(!s.orders.some(o=>o.number===p.number&&o.id!==p.id),'订单号已存在');
      requireThat(Array.isArray(p.lines)&&p.lines.length>0,'订单至少有一个产品');
      requireThat(new Set(p.lines.map(l=>l.product)).size===p.lines.length,'同一订单中请合并相同产品');
      const lines=p.lines.map(l=>{const product=s.products.find(x=>x.code===l.product);requireThat(product&&integer(l.qty),'产品无效或数量不是正整数');return {product:product.code,name:product.name,qty:l.qty,pcsPerCarton:product.pcsPerCarton,cartonsPerPallet:product.cartonsPerPallet};});
      const record={id:p.id||command.requestId,number:p.number,date:p.date,warehouse:p.warehouse,customer:p.customer,sequence:p.sequence,lines,status:'pending',completedAt:null};
      if(idx>=0)s.orders[idx]=record;else s.orders.push(record);break;
    }
    case 'complete': {
      requireThat(Array.isArray(p.ids)&&p.ids.length>0&&new Set(p.ids).size===p.ids.length,'请选择有效订单');
      const orders=p.ids.map(id=>{const o=s.orders.find(x=>x.id===id);requireThat(o&&o.status==='pending','订单已变更');warehouse(o.warehouse);requireThat(o.date<=day(now,s.timeZone),'未来订单暂不能装货');return o;});
      const needed=new Map();for(const o of orders)for(const l of o.lines){const key=JSON.stringify([o.warehouse,l.product]);needed.set(key,(needed.get(key)||0)+l.qty);}
      for(const [key,qty] of needed){const [w,product]=JSON.parse(key);requireThat(inventory(s,w,product,now).available>=qty,product+' 可发库存不足（未满24小时不计入可发库存）');}
      for(const o of orders){o.status='completed';o.completedAt=new Date(now).toISOString();}break;
    }
    case 'withdraw': {
      const o=s.orders.find(x=>x.id===p.id);requireThat(o&&o.status==='completed','订单尚未完成或已撤回');warehouse(o.warehouse);requireThat(text(p.reason),'请填写撤回原因');o.status='pending';o.completedAt=null;break;
    }
    case 'production': case 'opening': {
      warehouse(p.warehouse);requireThat(s.products.some(x=>x.code===p.product)&&integer(p.qty),'产品无效或箱数不是正整数');
      requireThat(text(p.reference),'请输入批次号/期初单号');
      const list=command.operation==='opening'?s.opening:s.batches;
      requireThat(!list.some(x=>x.reference===p.reference),'单号已存在');
      if(command.operation==='opening'){requireThat(actor.role==='admin','期初库存仅管理员可录入');requireThat(!s.opening.some(x=>x.warehouse===p.warehouse&&x.product===p.product),'该仓库产品期初已设置');requireThat(!s.orders.some(o=>o.warehouse===p.warehouse&&o.status==='completed')&&!s.batches.some(b=>b.warehouse===p.warehouse),'已有业务后不能补录期初，请先核对库存');}
      else requireThat(Number.isFinite(Date.parse(p.producedAt))&&Date.parse(p.producedAt)<=now,'生产完成时间无效或在未来');
      list.push({id:command.requestId,warehouse:p.warehouse,product:p.product,qty:p.qty,reference:p.reference,...(command.operation==='production'?{producedAt:new Date(p.producedAt).toISOString()}:{})});break;
    }
    default:throw new BusinessError('操作不支持');
  }
  s.version++;
  s.audit.push({id:command.requestId,actor:actor.id,operation:command.operation,at:new Date(now).toISOString(),payload:structuredClone(p),version:s.version});
  s.requests[command.requestId]=fingerprint;
  return s;
}

