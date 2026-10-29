import {apply,emptyState,BusinessError} from './shipping-domain.mjs';
const collections=['factories','warehouses','products','customers','orders','batches','opening','audit'];
const keyFor=(collection,row)=>['factories','warehouses','products','customers'].includes(collection)?row.code:row.id;
const guard="EXISTS(SELECT 1 FROM revisions WHERE key='warehouse' AND version=? AND last_request=?)";
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
export async function initialize(db){await db.prepare("INSERT OR IGNORE INTO revisions(key,version,last_request,sync_lock) VALUES('warehouse',0,'','')").run();}
export async function snapshot(db){
  const results=await db.batch([db.prepare("SELECT version FROM revisions WHERE key='warehouse'"),db.prepare('SELECT collection,entity_key,payload FROM entities LIMIT 20001')]);
  if(results[1].results.length>20000)fail('数据达到当前整仓读取上限，请升级查询分区后继续',503);
  const s=emptyState();s.version=results[0].results[0]?.version||0;
  for(const row of results[1].results){if(!collections.includes(row.collection))fail('仓库数据类型异常',500);s[row.collection].push(JSON.parse(row.payload));}
  s.orders.sort((a,b)=>(a.createdVersion||0)-(b.createdVersion||0)||a.id.localeCompare(b.id));return s;
}
export function scopeSnapshot(s,actor){
  if(actor.role==='admin')return s;
  const warehouses=new Set(actor.warehouses||[]),copy={...s};
  for(const key of ['orders','batches','opening'])copy[key]=s[key].filter(r=>warehouses.has(r.warehouse));
  copy.warehouses=s.warehouses.filter(w=>warehouses.has(w.code));const factories=new Set(copy.warehouses.map(w=>w.factory));copy.factories=s.factories.filter(f=>factories.has(f.code));copy.audit=[];return copy;
}
function changes(before,after){const output=[];for(const collection of collections){const existing=new Map(before[collection].map(row=>[keyFor(collection,row),JSON.stringify(row)]));for(const row of after[collection])if(existing.get(keyFor(collection,row))!==JSON.stringify(row))output.push({collection,key:keyFor(collection,row),row});}return output;}
export async function transact(db,command,actor,now=Date.now()){
  if(!actor?.id||!['admin','warehouse','viewer'].includes(actor.role))fail('未授权',403);
  if(!command||!/^[-A-Za-z0-9]{1,200}$/.test(command.requestId||''))fail('请求编号无效');
  const fingerprint=await hash(JSON.stringify({actor:actor.id,operation:command.operation,payload:command.payload}));
  const old=await db.prepare('SELECT fingerprint,version FROM receipts WHERE request_id=?').bind(command.requestId).first();
  if(old){if(old.fingerprint!==fingerprint)fail('请求编号已被其他内容使用',409);return {version:old.version,replayed:true,state:scopeSnapshot(await snapshot(db),actor)};}
  const before=await snapshot(db);let next;
  try{next=apply(before,command,actor,now);}catch(e){if(e instanceof BusinessError)fail(e.message,e.message.includes('刷新')?409:400);throw e;}
  if(command.operation==='order'){const target=next.orders.find(o=>o.id===(command.payload.id||command.requestId));target.createdVersion=before.orders.find(o=>o.id===target.id)?.createdVersion||next.version;}
  const delta=changes(before,next),stmt=[db.prepare("UPDATE revisions SET version=?,last_request=? WHERE key='warehouse' AND version=?").bind(next.version,command.requestId,before.version)];
  for(const item of delta)stmt.push(db.prepare(`INSERT INTO entities(collection,entity_key,payload) SELECT ?,?,? WHERE ${guard} ON CONFLICT(collection,entity_key) DO UPDATE SET payload=excluded.payload`).bind(item.collection,item.key,JSON.stringify(item.row),next.version,command.requestId));
  const projection=delta.filter(d=>d.collection!=='audit'||['complete','withdraw'].includes(d.row.operation)).map(d=>({...d,version:next.version}));
  for(let i=0;i<projection.length;i+=100)stmt.push(db.prepare(`INSERT INTO outbox(id,version,part,payload,status) SELECT ?,?,?,?,'pending' WHERE ${guard}`).bind(command.requestId+'-'+i,next.version,i,JSON.stringify(projection.slice(i,i+100)),next.version,command.requestId));
  stmt.push(db.prepare(`INSERT INTO receipts(request_id,fingerprint,version,at) SELECT ?,?,?,? WHERE ${guard}`).bind(command.requestId,fingerprint,next.version,new Date(now).toISOString(),next.version,command.requestId));
  try{const results=await db.batch(stmt);if(results[0].meta.changes!==1)fail('库存已被其他操作更新，请刷新后重试',409);}
  catch(e){const receipt=await db.prepare('SELECT fingerprint,version FROM receipts WHERE request_id=?').bind(command.requestId).first().catch(()=>null);if(receipt?.fingerprint===fingerprint)return {version:receipt.version,replayed:true,state:scopeSnapshot(await snapshot(db),actor)};if(e.status===409)throw e;fail('事务结果待确认，请保留操作编号后查询，勿重复录单',503);}
  return {version:next.version,replayed:false,state:scopeSnapshot(next,actor)};
}
export async function syncStatus(db){return db.prepare('SELECT status,COUNT(*) AS count FROM outbox GROUP BY status').all();}
export async function claimSync(db){
  const lease=crypto.randomUUID(),result=await db.prepare("UPDATE revisions SET sync_lock=? WHERE key='warehouse' AND sync_lock=''").bind(lease).run();if(result.meta.changes!==1)return {status:'busy'};
  const job=await db.prepare("SELECT id,payload,status FROM outbox WHERE status IN ('pending','review') ORDER BY version,part LIMIT 1").first();
  if(!job||job.status==='review'){await db.prepare("UPDATE revisions SET sync_lock='' WHERE key='warehouse' AND sync_lock=?").bind(lease).run();return job?{status:'review',id:job.id}:{status:'empty'};}
  await db.prepare("UPDATE outbox SET status='leased',lease=? WHERE id=? AND status='pending'").bind(lease,job.id).run();
  const effects=JSON.parse(job.payload),mappings={};
  const lookups=effects.map(effect=>{const entityKey=effect.collection+':'+effect.key,prefix=effect.collection==='orders'?'lines:'+effect.key+':':'';return db.prepare("SELECT entity_key,record_id FROM projections WHERE entity_key=? OR (?<>'' AND substr(entity_key,1,length(?))=?)").bind(entityKey,prefix,prefix,prefix);});
  for(const result of await db.batch(lookups))for(const row of result.results)mappings[row.entity_key]=row.record_id;
  return {status:'claimed',id:job.id,lease,effects,mappings};
}
export async function finishSync(db,p){
  const job=await db.prepare("SELECT id FROM outbox WHERE id=? AND lease=? AND status='leased'").bind(p.id,p.lease).first();if(!job)fail('同步任务已变更',409);
  const statements=[];for(const [key,recordId] of Object.entries(p.mappings||{})){if(!/^rec[A-Za-z0-9]{1,32}$/.test(recordId))fail('台账记录编号无效');statements.push(db.prepare('INSERT INTO projections(entity_key,record_id) VALUES(?,?) ON CONFLICT(entity_key) DO UPDATE SET record_id=excluded.record_id').bind(key,recordId));}
  statements.push(db.prepare('UPDATE outbox SET status=?,error=? WHERE id=? AND lease=?').bind(p.ok?'synced':'review',p.ok?'':'LARK_WRITE_REVIEW_REQUIRED',p.id,p.lease));statements.push(db.prepare("UPDATE revisions SET sync_lock='' WHERE key='warehouse' AND sync_lock=?").bind(p.lease));await db.batch(statements);return {status:p.ok?'synced':'review'};
}
