import {apply,emptyState,day,board,inventory,summary,pallets} from './domain/shipping.mjs';
import {fields,autoMapping,parseCSV,previewImport} from './domain/import.mjs';
import {readXlsx} from './xlsx.mjs';
import customersTemplateUrl from '../assets/templates/customers-template.xlsx?url';
import productsTemplateUrl from '../assets/templates/products-template.xlsx?url';
const bridge=window.__vijuBridge;
const $=id=>document.getElementById(id),key='viju-shipping-preview-v1';
let selectedMasters=new Set(); let boardPage=0; let state=load(),view='board',masterType='customers',reportCustomer='',reportProduct='',reportStart=day(),reportEnd=day();
function load(){if(bridge)return bridge.snapshot;try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):emptyState();}catch{throw new Error('本地预览数据损坏，请保留浏览器数据并联系开发人员');}}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>Number(v).toLocaleString('en-US'),quantity=o=>o.lines.reduce((n,l)=>n+l.qty,0);
const names={board:'发货工作台',orders:'订单管理',completed:'已完成装货',inventory:'仓库库存',reports:'汇总报表',production:'生产入库',admin:'管理后台',audit:'操作记录'};
const actor=()=>bridge?bridge.actor:({id:'local-demo',role:$('role').value,warehouses:state.warehouses.map(w=>w.code)});
const options=(rows,selected,blank='')=>(blank?`<option value="">${esc(blank)}</option>`:'')+rows.map(r=>`<option value="${esc(r.code)}" ${r.code===selected?'selected':''}>${esc(r.code)} · ${esc(r.name)}</option>`).join('');
const table=(headers,rows)=>`<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}" class="empty">暂无数据</td></tr>`}</tbody></table></div>`;
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',5000);}
function dialog(title,html){$('dialog-title').textContent=title;$('dialog-content').innerHTML=html;if(!$('dialog').open)$('dialog').showModal();}
function bind(id,event,fn){$(id)?.addEventListener(event,fn);}
async function commit(operation,payload,version=state.version){
  if(bridge){await bridge.mutate({operation,payload,requestId:crypto.randomUUID(),expectedVersion:version});state=load();render();return;}
  if(!navigator.locks)throw new Error('此预览需要支持 Web Locks 的新版 Edge/Chrome');
  await navigator.locks.request('viju-shipping-preview',()=>{
    const current=load(),next=apply(current,{operation,payload,requestId:crypto.randomUUID(),expectedVersion:version},actor());
    localStorage.setItem(key,JSON.stringify(next));state=next;
  });
  render();
}
async function perform(operation,payload){try{await commit(operation,payload);$('dialog').close();toast(bridge?'已保存':'已保存到本地预览');}catch(e){toast(e.message);}}
$('date').value=day();
function render(){
  const admin=actor().role==='admin';
  if(!admin&&['admin','audit'].includes(view))view='board';
  $('title').textContent=names[view];
  $('nav').innerHTML=Object.entries(names).filter(([id])=>admin||!['admin','audit'].includes(id)).map(([id,title])=>`<button data-nav="${id}" class="${view===id?'active':''}">${title}</button>`).join('');
  const oldFactory=$('factory').value; $('factory').innerHTML=options(state.factories,oldFactory,'全部工厂');
  const warehouses=state.warehouses.filter(w=>!$('factory').value||w.factory===$('factory').value),oldWarehouse=$('warehouse').value;
  $('warehouse').innerHTML=options(warehouses,oldWarehouse);const w=$('warehouse').value,date=$('date').value;
  const totals=summary(state,date,w);
  $('metrics').innerHTML=[['当日订单量',totals.ordered,'箱 · 按订单日期'],['当日已发货',totals.shipped,'箱 · 按完成日期'],['当日待装货',totals.pending,'箱 · 按订单日期'],['完成订单',totals.completed,'单 · 按完成日期'],['当日生产量',totals.production,'箱 · 按生产完成时间'],['生产待入库',totals.waiting,'箱 · 当前未满24小时']].map(([title,value,note])=>`<div class="metric">${title}<b>${number(value)}</b><span>${note}</span></div>`).join('');
  $('clock').textContent=new Date().toLocaleString('zh-CN',{timeZone:state.timeZone,hour12:false});
  const content=$('content');
  if(view==='board'){
    const slots=board(state,date,w,boardPage),active=slots.filter(s=>s.customer).length;
    content.innerHTML=`<div class="section-head"><div><h2>客户装货区 <span class="pill">${active} / 100</span></h2><p class="muted">每页10×10位置 · 点击客户查看订单并完成装货 · 红色为余箱 · 横向滚动查看全部位置</p></div><button class="primary" id="new-order">＋ 录入订单</button></div><div class="board-wrap"><div class="board">${slots.map(slot=>`<button class="slot ${slot.customer?'live':''}" ${slot.customer?`data-slot="${slot.slot}"`:'disabled'}><span class="position">位置 ${String(slot.slot).padStart(3,'0')}</span>${slot.customer?`<strong>${esc(slot.customer.code)}</strong><span class="customer-name">${esc(slot.customer.name)}</span>${slot.orders.map(o=>`<div class="line"><b>#${o.sequence} ${esc(o.number)}</b>${o.lines.map(l=>{const p=pallets(l.qty,l.cartonsPerPallet);return `<div>${esc(l.product)} ${esc(l.name)}<br>${number(l.qty)}箱 · ${p.full}整板 <span class="${p.remainder?'red':''}">余${p.remainder}箱</span> · 共${p.required}板位</div>`;}).join('')}</div>`).join('')}`:'<span class="empty-slot">暂无待装货订单</span>'}</button>`).join('')}</div></div>`;
    const pages=Math.max(1,Math.ceil(new Set(state.orders.filter(o=>o.date===date&&o.warehouse===w).map(o=>o.customer)).size/100));
    content.insertAdjacentHTML('beforeend',`<div class="actions"><button id="prev-page" ${boardPage===0?'disabled':''}>上一页</button><span>第${boardPage+1} / ${pages}页</span><button id="next-page" ${boardPage+1>=pages?'disabled':''}>下一页</button></div>`);
    bind('prev-page','click',()=>{boardPage--;render();});bind('next-page','click',()=>{boardPage++;render();});
    bind('new-order','click',()=>orderForm());
    content.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>customerDetail(slots[Number(b.dataset.slot)-boardPage*100-1]));
  }else if(view==='orders'||view==='completed'){
    const orders=state.orders.filter(o=>o.warehouse===w&&(view==='orders'?o.date===date:o.status==='completed'&&day(o.completedAt,state.timeZone)===date)).sort((a,b)=>a.sequence-b.sequence);
    content.innerHTML=`<div class="section-head"><h2>${view==='completed'?'按装货完成日期查看':'按订单日期查看'}</h2><button id="new-order" class="primary">＋ 录入订单</button></div><div class="panel">${orderTable(orders,true)}</div>`;
    bind('new-order','click',()=>orderForm());orderActions(content);
  }else if(view==='inventory'){
    content.innerHTML=`<div class="section-head"><h2>当前库存 <span class="pill">carton / 箱</span></h2><button id="opening">录入期初库存</button></div><p class="muted">可发库存 = 期初 + 已满24小时生产量 − 已发数量。待入库不参与可发库存；预计结余另扣除全部待装货订单。</p><div class="panel">${table(['产品代码 / 名称','期初','成熟生产','待入库','累计已发','可发库存','全部待装货','预计结余'],state.products.map(p=>{const i=inventory(state,w,p.code);return [esc(p.code)+'<br>'+esc(p.name),i.opening,i.matured,i.waiting,i.shipped,`<b>${number(i.available)}</b>`,i.pending,`<span class="${i.projected<0?'red':'green'}">${number(i.projected)}</span>`];}))}</div>`;bind('opening','click',()=>stockForm('opening'));
  }else if(view==='production'){
    content.innerHTML=`<div class="section-head"><h2>生产批次 · 满24小时自动计入可发库存</h2><button id="new-production" class="primary">＋ 生产入库</button></div><div class="panel">${table(['批次号','产品','数量 / 箱','生产完成时间','可发时间','当前状态'],state.batches.filter(b=>b.warehouse===w).map(b=>[esc(b.reference),esc(b.product),b.qty,esc(localTime(b.producedAt)),esc(localTime(Date.parse(b.producedAt)+86400000)),Date.now()-Date.parse(b.producedAt)>=86400000?'<span class="pill done">可发</span>':'<span class="pill">待入库</span>']))}</div>`;bind('new-production','click',()=>stockForm('production'));
  }else if(view==='admin')renderAdmin();
  else if(view==='reports')renderReports();
  else if(view==='audit')content.innerHTML=`<div class="panel"><h2>操作审计</h2><p class="muted">操作记录保存于Lark；撤回记录保留原因。</p>${table(['时间','操作人','动作','版本','单据 / 原因'],[...state.audit].reverse().map(a=>[esc(localTime(a.at)),esc(a.actor),esc(a.operation),a.version,esc(a.payload.reason||a.payload.number||a.payload.reference||a.payload.type||a.payload.id||a.payload.ids?.join(',')||'')]))}</div>`;
  content.querySelectorAll('button').forEach(b=>{if(actor().role==='viewer'&&!b.dataset.nav&&!b.id?.startsWith('export'))b.disabled=true;});
}
function localTime(time){return new Date(time).toLocaleString('zh-CN',{timeZone:state.timeZone,hour12:false});}
function orderTable(orders,actions=false){return table(['顺序','订单号 / 订单日期','客户','产品明细','数量 / 箱','状态',...(actions?['操作']:[])],orders.map(o=>[o.sequence,esc(o.number)+'<br><span class="muted">'+esc(o.date)+'</span>',esc(o.customer)+'<br>'+esc(state.customers.find(c=>c.code===o.customer)?.name),o.lines.map(l=>`${esc(l.product)} · ${esc(l.name)} · ${l.qty}箱`).join('<br>'),number(quantity(o)),`<span class="pill ${o.status==='completed'?'done':''}">${o.status==='completed'?'已装货':'待装货'}</span>`,...(actions?[o.status==='completed'?`<button data-withdraw="${esc(o.id)}">撤回修改</button>`:`<button data-edit="${esc(o.id)}">修改</button><button data-complete="${esc(o.id)}">完成装货</button>`]:[])]));}
function orderActions(root){root.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>orderForm(state.orders.find(o=>o.id===b.dataset.edit)));root.querySelectorAll('[data-complete]').forEach(b=>b.onclick=()=>completeDialog([b.dataset.complete]));root.querySelectorAll('[data-withdraw]').forEach(b=>b.onclick=()=>withdrawDialog(b.dataset.withdraw));}
function customerDetail(slot){dialog(slot.customer.code+' · '+slot.customer.name,`<p class="muted">订单按装货顺序显示。产品分别计算板数，不默认混板。下方按钮会一次性完成当前客户在此日期、仓库的全部待装货订单。</p>${orderTable(slot.orders,true)}<div class="actions"><button id="complete-customer" class="primary">完成本客户全部装货（${slot.orders.length}单）</button></div>`);orderActions($('dialog-content'));bind('complete-customer','click',()=>completeDialog(slot.orders.map(o=>o.id)));}
function completeDialog(ids){const orders=ids.map(id=>state.orders.find(o=>o.id===id));dialog('确认装货完成',`${orderTable(orders)}<p class="muted">确认现场实际已经发货后提交。系统将记录已发数量、更新账面库存，并将订单移至已完成。</p><div class="actions"><button class="primary" id="confirm-complete">确认完成 · ${orders.reduce((n,o)=>n+quantity(o),0)}箱</button></div>`);bind('confirm-complete','click',()=>perform('complete',{ids}));}
function withdrawDialog(id){dialog('撤回装货记录',`<p class="muted">撤回后恢复可发库存，订单回到原订单日期的待装货列表。修改完成后需重新确认装货。</p><form id="withdraw-form"><label>撤回原因<input id="reason" required maxlength="200"></label><div class="actions"><button class="primary">撤回并恢复库存</button></div></form>`);bind('withdraw-form','submit',e=>{e.preventDefault();perform('withdraw',{id,reason:$('reason').value});});}
function orderForm(order){
  if(!state.customers.length||!state.products.length||!state.warehouses.length){toast('请先在管理后台新增工厂、仓库、客户及产品');return;}
  dialog(order?'修改订单':'录入销售订单',`<form id="order-form"><div class="form"><label>订单号<input id="order-number" required maxlength="200" value="${esc(order?.number||'')}"></label><label>订单日期<input id="order-date" type="date" required value="${esc(order?.date||$('date').value)}"></label><label>客户<select id="order-customer">${options(state.customers,order?.customer)}</select></label><label>仓库<select id="order-warehouse">${options(state.warehouses,order?.warehouse||$('warehouse').value)}</select></label><label>装货顺序<input id="order-sequence" type="number" min="1" step="1" required value="${order?.sequence||state.orders.length+1}"></label></div><h3>产品明细（carton / 箱）</h3><div id="lines"></div><button type="button" id="add-line">＋ 增加产品</button><div class="actions"><button class="primary">保存订单</button></div></form>`);
  const addLine=line=>{const div=document.createElement('div');div.className='form-lines';div.innerHTML=`<select aria-label="产品">${options(state.products,line?.product)}</select><input aria-label="箱数" type="number" min="1" step="1" required value="${line?.qty||1}"><span>箱</span><button type="button" aria-label="删除产品行">×</button>`;div.querySelector('button').onclick=()=>div.remove();$('lines').append(div);};
  (order?.lines||[null]).forEach(addLine);bind('add-line','click',()=>addLine());
  bind('order-form','submit',e=>{e.preventDefault();perform('order',{...(order?{id:order.id}:{}),number:$('order-number').value.trim(),date:$('order-date').value,customer:$('order-customer').value,warehouse:$('order-warehouse').value,sequence:Number($('order-sequence').value),lines:[...$('lines').children].map(div=>({product:div.querySelector('select').value,qty:Number(div.querySelector('input').value)}))});});
}
function stockForm(type){dialog(type==='opening'?'设置期初库存':'录入生产完成批次',`<form id="stock-form" class="form"><label>仓库<select id="stock-warehouse">${options(state.warehouses,$('warehouse').value)}</select></label><label>产品<select id="stock-product">${options(state.products)}</select></label><label>箱数<input id="stock-qty" type="number" min="1" step="1" required></label><label>${type==='opening'?'期初单号':'生产批次号'}<input id="stock-ref" required maxlength="200"></label>${type==='production'?'<label class="wide">生产完成时间（Africa/Lagos）<input id="produced-at" type="datetime-local" required></label>':'<p class="muted wide">仅限启用前设置；同一仓库产品只能设置一次。</p>'}<div class="actions wide"><button class="primary">确认录入</button></div></form>`);bind('stock-form','submit',e=>{e.preventDefault();perform(type,{warehouse:$('stock-warehouse').value,product:$('stock-product').value,qty:Number($('stock-qty').value),reference:$('stock-ref').value.trim(),...(type==='production'?{producedAt:$('produced-at').value+':00+01:00'}:{})});});}
function renderAdmin(){
  const labels={customers:'客户',products:'产品',factories:'工厂',warehouses:'仓库'},type=masterType;
  $('content').innerHTML=`<div class="tabs">${Object.entries(labels).map(([k,v])=>`<button data-master="${k}" class="${k===type?'primary':''}">${v}</button>`).join('')}</div><div class="section-head"><div><h2>${labels[type]}资料</h2><p class="muted">代码按文本存储，保留前导零。看板按当日订单自动分配位置，每页100个客户。</p></div><div><button id="add-master" class="primary">＋ 新增${labels[type]}</button> ${fields[type]?`<button id="import-master">Excel / CSV 批量导入</button> <a id="template" class="template-download" href="${esc(type==='products'?productsTemplateUrl:customersTemplateUrl)}" download="${type==='products'?'产品':'客户'}导入模板.xlsx">下载Excel模板 (.xlsx)</a>`:''}</div></div><div class="panel">${table(['选择','代码','名称',...(type==='products'?['每箱件数','每板箱数']:type==='warehouses'?['所属工厂']:[]),'操作'],state[type].map(r=>[`<input type="checkbox" data-master-select="${esc(r.code)}" aria-label="选择 ${esc(r.code)}" ${selectedMasters.has(r.code)?'checked':''}>`,esc(r.code),esc(r.name),...(type==='products'?[r.pcsPerCarton,r.cartonsPerPallet]:type==='warehouses'?[esc(r.factory)]:[]),`<button data-master-edit="${esc(r.code)}">修改</button> <button data-master-delete="${esc(r.code)}">删除</button>`]))}</div>`;
  $('content').querySelectorAll('[data-master]').forEach(b=>b.onclick=()=>{masterType=b.dataset.master;selectedMasters.clear();render();});
  $('content').querySelectorAll('[data-master-edit]').forEach(b=>b.onclick=()=>masterForm(state[type].find(r=>r.code===b.dataset.masterEdit)));
  $('content').querySelector('.section-head').insertAdjacentHTML('afterend',`<div class="bulk-actions"><label><input id="master-select-all" type="checkbox"> 全选当前列表</label><button id="delete-selected" disabled>删除已选资料</button><span id="master-selection-count" class="muted"></span></div>`);
  const updateSelection=()=>{const count=state[type].filter(r=>selectedMasters.has(r.code)).length;$('delete-selected').disabled=!count;$('delete-selected').textContent='批量删除（'+count+'）';$('master-selection-count').textContent='每次最多200条；已有关联记录的资料不会删除';$('master-select-all').checked=count>0&&count===state[type].length;};
  $('content').querySelectorAll('[data-master-select]').forEach(c=>c.onchange=()=>{if(c.checked)selectedMasters.add(c.dataset.masterSelect);else selectedMasters.delete(c.dataset.masterSelect);updateSelection();});
  bind('master-select-all','change',()=>{$('content').querySelectorAll('[data-master-select]').forEach(c=>{c.checked=$('master-select-all').checked;if(c.checked)selectedMasters.add(c.dataset.masterSelect);else selectedMasters.delete(c.dataset.masterSelect);});updateSelection();});
  $('content').querySelectorAll('[data-master-delete]').forEach(b=>b.onclick=()=>deleteMasterDialog([b.dataset.masterDelete]));
  bind('delete-selected','click',()=>deleteMasterDialog(state[type].filter(r=>selectedMasters.has(r.code)).map(r=>r.code)));
  bind('add-master','click',()=>masterForm());bind('import-master','click',()=>importDialog(type));updateSelection();

}
function deleteMasterDialog(codes){
  if(!codes.length||codes.length>200){toast('每次请选择1到200条资料');return;}
  const type=masterType;dialog('确认删除基础资料',`<p>将删除以下 <b>${codes.length}</b> 条资料，请核对代码和名称。已被业务使用的资料会阻止本次删除。删除后无法在页面撤销。</p>${table(['代码','名称'],codes.map(code=>[esc(code),esc(state[type].find(r=>r.code===code)?.name)]))}<div class="actions"><button id="confirm-master-delete" class="danger">确认删除 ${codes.length} 条</button></div>`);
  bind('confirm-master-delete','click',async()=>{try{await commit('masterDelete',{type,codes});selectedMasters.clear();$('dialog').close();render();toast('已删除所选资料');}catch(e){toast(e.message);}});
}
function masterForm(row){
  const type=masterType,spec=fields[type]||[['code','代码'],['name','名称'],...(type==='warehouses'?[['factory','所属工厂']]:[])];
  dialog(row?'修改基础资料':'新增基础资料',`<form id="master-form" class="form">${spec.map(([k,label])=>`<label>${label}${k==='factory'?`<select id="master-${k}">${options(state.factories,row?.factory)}</select>`:`<input id="master-${k}" ${k==='code'&&row?'readonly':''} type="${['slot','pcsPerCarton','cartonsPerPallet'].includes(k)?'number':'text'}" min="1" ${k==='slot'?'max="100"':''} required value="${esc(row?.[k]??'')}" maxlength="200">`}</label>`).join('')}<div class="actions wide"><button class="primary">保存</button></div></form>`);
  bind('master-form','submit',e=>{e.preventDefault();const values=Object.fromEntries(spec.map(([k])=>[k,['slot','pcsPerCarton','cartonsPerPallet'].includes(k)?Number($('master-'+k).value):$('master-'+k).value.trim()]));perform('master',{type,rows:[values],mode:row?'update':'error'});});
}
async function importDialog(type){
  const version=state.version;let sheets=[],rows=[],preview=null;
  dialog('批量导入'+(type==='customers'?'客户':'产品'),`<p class="muted">支持 .xlsx、UTF-8 CSV，最大10MB / 5000行。第一行为表头。Excel 代码列请使用文本或00000数字格式；已丢失的前导零无法恢复。文件含公式时请先粘贴为值。旧版 .xls 请另存为 .xlsx。</p><label>选择文件<input id="import-file" type="file" accept=".xlsx,.csv"></label><div class="mapping"><label>工作表<select id="import-sheet"></select></label><label>已存在代码<select id="import-mode"><option value="error">报错，停止导入</option><option value="skip">跳过已存在代码</option><option value="update">更新已有资料</option></select></label></div><div id="mapping"></div><div id="import-preview"></div><div class="actions"><button id="validate-import">检查并预览</button><button id="confirm-import" class="primary" disabled>确认导入</button></div>`);
  const invalidate=()=>{preview=null;$('confirm-import').disabled=true;$('import-preview').innerHTML='';};
  const setSheet=async()=>{invalidate();try{rows=await sheets[Number($('import-sheet').value)].rows();if(!rows.length)throw new Error('工作表为空');const mapping=autoMapping(rows[0],type);$('mapping').innerHTML='<h3>字段匹配</h3><div class="mapping">'+fields[type].map(([k,label])=>`<label>${label}<select data-field="${k}"><option value="-1">请选择列</option>${rows[0].map((h,i)=>`<option value="${i}" ${mapping[k]===i?'selected':''}>${i+1} · ${esc(h)}</option>`).join('')}</select></label>`).join('')+'</div>';$('mapping').querySelectorAll('select').forEach(el=>el.onchange=invalidate);}catch(e){toast(e.message);}};
  bind('import-file','change',async()=>{invalidate();$('mapping').innerHTML='';sheets=[];rows=[];try{const file=$('import-file').files[0];if(!file)return;if(file.size>10*1024*1024)throw new Error('文件最大10MB');if(/\.xlsx$/i.test(file.name))sheets=await readXlsx(await file.arrayBuffer());else if(/\.csv$/i.test(file.name)){const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()),data=parseCSV(text);sheets=[{name:'CSV',rows:async()=>data}];}else throw new Error('请选择 .xlsx 或 .csv');if(!sheets.length)throw new Error('无可用工作表');$('import-sheet').innerHTML=sheets.map((s,i)=>`<option value="${i}">${esc(s.name)}</option>`).join('');await setSheet();}catch(e){toast(e.message);}});
  bind('import-sheet','change',setSheet);bind('import-mode','change',invalidate);
  bind('validate-import','click',()=>{try{if(!rows.length)throw new Error('请先选择文件');const mapping=Object.fromEntries([...$('mapping').querySelectorAll('[data-field]')].map(el=>[el.dataset.field,Number(el.value)]));preview=previewImport(state,type,rows.slice(1),mapping,$('import-mode').value);$('confirm-import').disabled=preview.errors.length>0;$('import-preview').innerHTML=`<div class="${preview.errors.length?'error':'success'}">${preview.records.length}行 · ${preview.errors.length}个错误 · ${preview.warnings.length}条重复处理提示</div>${preview.errors.length?table(['原始Excel/CSV行号','错误'],preview.errors.map(e=>[e.row||'全表',esc(e.message)])):''}${preview.warnings.length?table(['行号','重复处理'],preview.warnings.map(e=>[e.row,esc(e.message)])):''}<p class="muted">预览前20行；先检查全部数据，存在错误时不开始导入。确认后每批最多50行依次保存；中途失败保留已完成批次并停止，不自动重试。</p>${table(fields[type].map(x=>x[1]),preview.records.slice(0,20).map(r=>fields[type].map(([k])=>esc(r[k]))))}`;}catch(e){invalidate();toast(e.message);}});
  bind('confirm-import','click',async()=>{
    if(!preview||preview.errors.length)return;const button=$('confirm-import');button.disabled=true;let saved=0;
    try{
      if(state.version!==version)throw new Error('数据已更新，请重新打开导入并检查预览');
      const size=bridge?(type==='products'?25:50):5000;
      for(let start=0;start<preview.records.length;start+=size){const batch=preview.records.slice(start,start+size);await commit('master',{type,rows:batch,mode:$('import-mode').value});saved+=batch.length;button.textContent='已保存 '+saved+' / '+preview.records.length+' 行';}
      $('dialog').close();toast('批量导入完成，共 '+saved+' 行');
    }catch(e){toast('已确认完成 '+saved+' 行。'+e.message+'；请核查后重新预览剩余资料，不要整批重复导入');}
  });
}
function renderReports(){
  const w=$('warehouse').value;
  const rows=state.orders.filter(o=>o.warehouse===w&&o.date>=reportStart&&o.date<=reportEnd&&(!reportCustomer||o.customer===reportCustomer)).map(o=>({...o,lines:o.lines.filter(l=>!reportProduct||l.product===reportProduct)})).filter(o=>o.lines.length);
  const total=rows.reduce((n,o)=>n+quantity(o),0),done=rows.filter(o=>o.status==='completed'),pending=rows.filter(o=>o.status==='pending');
  const groups=(items,key)=>[...new Set(items.map(key))].map(code=>{const list=items.filter(o=>key(o)===code),completed=list.filter(o=>o.status==='completed');return [esc(code),list.length,completed.length,list.length-completed.length,number(list.reduce((n,o)=>n+quantity(o),0)),number(completed.reduce((n,o)=>n+quantity(o),0)),number(list.filter(o=>o.status==='pending').reduce((n,o)=>n+quantity(o),0))];});
  $('content').innerHTML=`<div class="section-head"><h2>仓库发货汇总</h2><button id="export-report">导出订单明细 CSV</button></div><div class="panel"><div class="report-filter"><label>订单开始日期<input type="date" id="report-start" value="${esc(reportStart)}"></label><label>订单结束日期<input type="date" id="report-end" value="${esc(reportEnd)}"></label><label>客户<select id="report-customer">${options(state.customers,reportCustomer,'全部客户')}</select></label><label>产品<select id="report-product">${options(state.products,reportProduct,'全部产品')}</select></label></div><p class="muted">本页按订单日期范围统计该批订单当前状态；顶部“当日已发货”按实际装货完成日期统计。二者口径不同。撤回立即冲回当前汇总，历史动作保留在操作记录中。</p>${table(['总订单','已装货','待装货','涉及客户','总箱数','已发箱数','待发箱数','完成率'],[[rows.length,done.length,pending.length,new Set(rows.map(o=>o.customer)).size,number(total),number(done.reduce((n,o)=>n+quantity(o),0)),number(pending.reduce((n,o)=>n+quantity(o),0)),total?Math.round(done.reduce((n,o)=>n+quantity(o),0)/total*100)+'%':'0%']])}</div><div class="panel"><h3>客户汇总</h3>${table(['客户代码','总订单','已装货订单','待装货订单','总箱数','已发箱数','待发箱数'],groups(rows,o=>o.customer))}</div><div class="panel"><h3>产品汇总</h3>${table(['产品代码','总箱数','已发箱数','待发箱数','当前可发库存','生产待入库','当前全部待装货'],state.products.filter(p=>!reportProduct||p.code===reportProduct).map(p=>{const all=rows.flatMap(o=>o.lines.filter(l=>l.product===p.code).map(l=>({...l,status:o.status}))),i=inventory(state,w,p.code);return [esc(p.code)+' · '+esc(p.name),all.reduce((n,l)=>n+l.qty,0),all.filter(l=>l.status==='completed').reduce((n,l)=>n+l.qty,0),all.filter(l=>l.status==='pending').reduce((n,l)=>n+l.qty,0),i.available,i.waiting,i.pending];}))}</div>`;
  for(const [id,assign] of [['report-start',v=>reportStart=v],['report-end',v=>reportEnd=v],['report-customer',v=>reportCustomer=v],['report-product',v=>reportProduct=v]])bind(id,'change',e=>{assign(e.target.value);renderReports();});
  bind('export-report','click',()=>downloadCSV(['订单号','订单日期','客户代码','仓库','产品代码','产品名称','箱数','状态','完成时间'],rows.flatMap(o=>o.lines.map(l=>[o.number,o.date,o.customer,o.warehouse,l.product,l.name,l.qty,o.status==='completed'?'已装货':'待装货',o.completedAt||''])),'shipping-report.csv'));
}
function downloadCSV(headers,rows,name){const safe=v=>{let text=String(v??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};const url=URL.createObjectURL(new Blob(['\ufeff'+[headers,...rows].map(r=>r.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('nav').onclick=e=>{const b=e.target.closest('[data-nav]');if(b){view=b.dataset.nav;render();}};
for(const id of ['date','warehouse','factory','role'])bind(id,'change',()=>{boardPage=0;render();});
bind('close','click',()=>$('dialog').close());bind('fullscreen','click',()=>{document.body.classList.toggle('wide');});
bind('seed','click',async()=>{
  if(state.version){toast('已有预览数据，示例仅可载入空工作区');return;}
  try{
    await commit('master',{type:'factories',rows:[{code:'F01',name:'VIJU 示例工厂'}],mode:'error'});
    await commit('master',{type:'warehouses',rows:[{code:'WH01',name:'成品仓一号',factory:'F01'}],mode:'error'});
    await commit('master',{type:'products',rows:[{code:'0012',name:'乳饮品 12pcs/carton',pcsPerCarton:12,cartonsPerPallet:130},{code:'0024',name:'饮用水 24pcs/carton',pcsPerCarton:24,cartonsPerPallet:100}],mode:'error'});
    await commit('master',{type:'customers',rows:Array.from({length:6},(_,i)=>({code:'C'+String(i+1).padStart(3,'0'),name:['Lagos Central','Ikeja Trading','Abuja North','Ibadan Market','Port Harcourt','Ogun Retail'][i],slot:i+1})),mode:'error'});
    for(const product of ['0012','0024'])await commit('opening',{warehouse:'WH01',product,qty:5000,reference:'OPEN-'+product});
    for(let i=0;i<6;i++)await commit('order',{number:'SO-DEMO-'+String(i+1).padStart(3,'0'),date:day(),warehouse:'WH01',customer:state.customers[i].code,sequence:i+1,lines:[{product:i%2?'0024':'0012',qty:[280,220,130,350,405,100][i]}]});
    await commit('production',{warehouse:'WH01',product:'0012',qty:800,reference:'BATCH-DEMO-001',producedAt:new Date(Date.now()-3600000).toISOString()});
    toast('示例数据已载入，可体验装货、撤回、报表与导入');
  }catch(e){toast(e.message);}
});
addEventListener('storage',e=>{if(e.key===key){state=load();render();}});
setInterval(async()=>{if(!$('dialog').open){try{if(bridge)await bridge.refresh();state=load();render();}catch(e){toast('数据刷新失败，请稍后重试');}}},30000);
render();

if(bridge){$('role').value=bridge.actor.role;$('role').disabled=true;$('seed').hidden=true;document.querySelector('.notice').textContent='已连接 Lark · 先实物发货，再确认已发 · 各仓库独立核算';window.addEventListener('viju-refresh',()=>{state=load();render();});}

