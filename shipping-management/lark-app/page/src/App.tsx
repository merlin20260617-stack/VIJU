import {useEffect,useState} from 'react';
import {DatabaseUserMenu,invokeDatabaseFunction} from '@lark-base-open/base-database-app-sdk/page';
import shell from './shell.html?raw';
type Actor={id:string;role:'admin'|'warehouse'|'viewer';warehouses:string[]};
type Snapshot=Record<string,unknown>;
type Bridge={snapshot:Snapshot;actor:Actor;refresh:()=>Promise<void>;mutate:(command:Record<string,unknown>)=>Promise<void>};
declare global{interface Window{__vijuBridge?:Bridge}}
const asObject=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('数据响应无效');return v as Record<string,unknown>;};
async function call(operation:'workspace'|'mutate'|'sync',command?:Record<string,unknown>){
  const response=await invokeDatabaseFunction('shipping',{operation,...(command?{commandJson:JSON.stringify(command)}:{})});
  if(response.code!==0)throw Object.assign(new Error(response.msg||'操作结果待确认，请保留操作编号'),{definite:[40001,40002,40901].includes(response.code)});
  if(!response.data||typeof response.data.payload!=='string')throw new Error('服务返回缺少仓库数据，请稍后核查');
  return asObject(JSON.parse(response.data.payload));
}
export default function App(){
  const [error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true;
    void (async()=>{
      try{
        setError('');const data=await call('workspace').catch(()=>call('workspace'));if(!active)return;
        const actor=asObject(data.actor);if(typeof actor.id!=='string'||!['admin','warehouse','viewer'].includes(String(actor.role)))throw new Error('仓库角色无效');
        const identity:Actor={id:actor.id,role:actor.role as Actor['role'],warehouses:Array.isArray(actor.warehouses)?actor.warehouses.filter((v):v is string=>typeof v==='string'):[]};
        let pending:Record<string,unknown>|null=null,syncing=false;
        const notify=(message:string)=>{const el=document.querySelector('.notice');if(el)el.textContent=message;};
        const drain=async()=>{if(syncing||identity.role==='viewer')return;syncing=true;try{for(let i=0;i<100;i++){const result=await call('sync');if(result.sync==='empty'){notify('已连接Lark · 库存与台账已同步');break;}if(result.sync!=='synced'){notify('库存已保存 · 台账同步待核查');break;}}}catch{try{const observed=await call('workspace');const settled=Array.isArray(observed.sync)&&observed.sync.every(v=>asObject(v).status==='synced');notify(settled?'库存与台账已确认同步':'库存已保存 · 台账同步待处理');}catch{notify('库存已保存 · 台账同步待核查');}}finally{syncing=false;}};
        const bridge:Bridge={snapshot:asObject(data.state),actor:identity,refresh:async()=>{try{const result=await call('workspace');bridge.snapshot=asObject(result.state);}catch(e){notify('数据刷新失败，当前显示上次数据，请核对后操作');throw e;}},mutate:async command=>{
          if(pending)throw new Error('上次操作结果待确认，请先点击“核查上次操作”');
          pending=command;try{const result=await call('mutate',command);bridge.snapshot=asObject(result.state);pending=null;notify(result.sync==='synced'?'库存已保存，台账已同步':'库存已保存，正在同步台账');void drain();}
          catch(e){if(e&&typeof e==='object'&&'definite' in e&&e.definite===true)pending=null;else notify('操作结果待确认，请核查后再进行新操作。编号：'+String(command.requestId));throw e;}
        }};
        window.__vijuBridge=bridge;
        // Imported after the real snapshot is available. No fixture or local fallback.
        await import('./lib/app.mjs');
        const actions=document.querySelector('.header-actions');
        const syncButton=document.createElement('button');syncButton.textContent='同步台账';syncButton.onclick=()=>void drain();syncButton.hidden=identity.role==='viewer';actions?.append(syncButton);
        const retry=document.createElement('button');retry.textContent='核查上次操作';retry.onclick=()=>{void (async()=>{try{await bridge.refresh();if(pending){const audit=bridge.snapshot.audit;const requestId=pending.requestId;if(!Array.isArray(audit)||!audit.some(v=>asObject(v).id===requestId)){notify('尚未查到确认记录，请稍后再次核查或联系管理员，勿重复录入');return;}pending=null;notify('上次操作已确认保存');void drain();}window.dispatchEvent(new Event('viju-refresh'));}catch{notify('结果核查暂不可用，请保留操作编号联系管理员');}})();};actions?.append(retry);
      }catch(e){if(active)setError(e instanceof Error?e.message:'无法连接发货平台');}
    })();
    return()=>{active=false;};
  },[attempt]);
  return <><div dangerouslySetInnerHTML={{__html:shell}}/>{error&&<div className="connection-error" role="alert"><h2>暂时无法读取发货数据</h2><p>{error}</p><button onClick={()=>setAttempt(v=>v+1)}>重试连接</button></div>}<div className="platform-user"><DatabaseUserMenu audience="enterprise"/></div></>;
}
