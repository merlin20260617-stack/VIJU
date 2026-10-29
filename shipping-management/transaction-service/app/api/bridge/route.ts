import {env} from 'cloudflare:workers';
import {initialize,snapshot,scopeSnapshot,transact,syncStatus,claimSync,finishSync} from '../../../lib/transaction-core.mjs';
export const dynamic='force-dynamic';
// Machine endpoint relies on the confirmed owner-private Sites dispatch boundary.
// Lark FaaS uses the platform-issued service token, never shipped to Page.
// Do not expand this Site's audience without adding service-only authorization.
export async function POST(request:Request){
  try{
    if(!env.DB)return Response.json({error:'TRANSACTION_STORE_UNAVAILABLE'},{status:503});
    if(Number(request.headers.get('content-length')||0)>1048576)return Response.json({error:'REQUEST_TOO_LARGE'},{status:413});
    const text=await request.text();if(text.length>1048576)return Response.json({error:'REQUEST_TOO_LARGE'},{status:413});
    const input=JSON.parse(text),db=env.DB.withSession('first-primary');await initialize(db);
    if(input.operation==='workspace'){if(!input.actor?.id||!['admin','warehouse','viewer'].includes(input.actor.role))return Response.json({error:'FORBIDDEN'},{status:403});return Response.json({state:scopeSnapshot(await snapshot(db),input.actor),sync:(await syncStatus(db)).results},{headers:{'cache-control':'no-store'}});}
    if(input.operation==='mutate')return Response.json(await transact(db,input.command,input.actor),{headers:{'cache-control':'no-store'}});
    if(input.operation==='claimSync')return Response.json(await claimSync(db));
    if(input.operation==='finishSync')return Response.json(await finishSync(db,input.payload));
    return Response.json({error:'INVALID_OPERATION'},{status:400});
  }catch(error){const e=error as Error&{status?:number};return Response.json({error:e.status?e.message:'TRANSACTION_SERVICE_ERROR'},{status:e.status||500,headers:{'cache-control':'no-store'}});}
}
