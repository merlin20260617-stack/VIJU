import {useEffect,useState} from 'react';
import {DatabaseUserMenu,invokeDatabaseFunction} from '@lark-base-open/base-database-app-sdk/page';
import shell from './shell.html?raw';
type Actor={id:string;role:'admin'|'warehouse'|'viewer';warehouses:string[]};
type Snapshot=Record<string,unknown>;
type Bridge={snapshot:Snapshot;actor:Actor;refresh:()=>Promise<void>;mutate:(command:Record<string,unknown>)=>Promise<void>};
declare global{interface Window{__vijuBridge?:Bridge}}
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('数据响应无效');return v as Record<string,unknown>;};
async function call(operation:'workspace'|'mutate'|'reconcile',command?:Record<string,unknown>){
 const response=await invokeDatabaseFunction('shipping',{operation,...(command?{commandJson:JSON.stringify(command)}:{})});
 if(response.code!==0)throw Object.assign(new Error(response.msg||'操作结果待确认，请保留操作编号'),{definite:[40001,40002,40901].includes(response.code)});
 if(!response.data||typeof response.data.payload!=='string')throw new Error('未取得仓库响应，请核查后再操作');return object(JSON.parse(response.data.payload));
}
export default function App(){
 const [error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;void(async()=>{try{
  setError('');const initial=await call('workspace').catch(()=>call('workspace'));if(!active)return;
  const a=object(initial.actor);if(typeof a.id!=='string'||!['admin','warehouse','viewer'].includes(String(a.role)))throw new Error('仓库角色无效');
  const actor:Actor={id:a.id,role:a.role as Actor['role'],warehouses:Array.isArray(a.warehouses)?a.warehouses.filter((v):v is string=>typeof v==='string'):[]};
  const sessionKey='viju-shipping-pending:'+actor.id;
  let pending=sessionStorage.getItem(sessionKey)||'',busy=false,lastSaved='';
  const notify=(message:string)=>{const el=document.querySelector('.notice');if(el)el.textContent=message;};
  const accept=(data:Record<string,unknown>)=>{
   if(data.ready===false||lastSaved&&(!Array.isArray(data.confirmed)||!data.confirmed.includes(lastSaved)))throw new Error('上次保存正在显示，请稍后刷新');
   bridge.snapshot=object(data.state);
  };
  const bridge:Bridge={snapshot:object(initial.state),actor,refresh:async()=>{try{accept(await call('workspace'));}catch(e){notify('当前显示上次数据，请稍后刷新核对');throw e;}},mutate:async command=>{
   if(busy)throw new Error('正在保存，请勿重复点击');if(pending)throw new Error('上次操作待确认，请先核查操作结果');busy=true;
   pending=String(command.requestId);sessionStorage.setItem(sessionKey,pending);
   try{const result=await call('mutate',{...command,...(lastSaved?{afterRequestId:lastSaved}:{})});if(result.status!=='saved')throw new Error('操作结果待确认，请核查，勿重复录入');
    bridge.snapshot=object(result.state);lastSaved=pending;pending='';sessionStorage.removeItem(sessionKey);notify('已保存到 Lark · 实物发货后确认，数据按仓库独立核算');
   }catch(e){if(e&&typeof e==='object'&&'definite' in e&&e.definite===true){pending='';sessionStorage.removeItem(sessionKey);}else notify('操作待确认，请核查后再操作。编号：'+pending);throw e;}finally{busy=false;}
  }};
  window.__vijuBridge=bridge;await import('./lib/app.mjs');
  const actions=document.querySelector('.header-actions');
  const refresh=document.createElement('button');refresh.textContent='刷新数据';refresh.onclick=()=>void bridge.refresh().then(()=>window.dispatchEvent(new Event('viju-refresh'))).catch(e=>notify(e.message));actions?.append(refresh);
  const check=document.createElement('button');check.textContent='核查操作结果';check.hidden=actor.role==='viewer';check.onclick=()=>{void(async()=>{if(busy)return;busy=true;try{
   await call('reconcile');const data=await call('workspace');accept(data);
   if(pending){if(!Array.isArray(data.confirmed)||!data.confirmed.includes(pending)){notify('该操作仍需管理员核对，勿重复录入。编号：'+pending);return;}pending='';sessionStorage.removeItem(sessionKey);}
   notify(Array.isArray(data.pending)&&data.pending.length?'仍有操作需管理员核对，勿重复录入':'已核查 Lark 台账');window.dispatchEvent(new Event('viju-refresh'));
  }catch{notify('核查暂不可用，请保留操作编号联系管理员');}finally{busy=false;}})();};actions?.append(check);
  if(pending)notify('上次操作结果待核查，请先点击“核查操作结果”。编号：'+pending);
 }catch(e){if(active)setError(e instanceof Error?e.message:'无法连接发货平台');}})();return()=>{active=false;};},[attempt]);
 return <><div dangerouslySetInnerHTML={{__html:shell}}/>{error&&<div className="connection-error" role="alert"><h2>暂时无法读取发货数据</h2><p>{error}</p><button onClick={()=>setAttempt(v=>v+1)}>重试连接</button></div>}<div className="platform-user"><DatabaseUserMenu audience="enterprise"/></div></>;
}
