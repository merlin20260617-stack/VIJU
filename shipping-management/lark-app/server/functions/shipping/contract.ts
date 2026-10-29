import {z} from 'zod';
export const input=z.object({
  operation:z.enum(['workspace','mutate','sync']).describe('workspace读取当前授权仓库；mutate提交一个有操作编号的仓库事务；sync继续处理已提交事务的Lark台账同步'),
  commandJson:z.string().max(1048576).optional().describe('mutate所需业务命令JSON，包含operation、payload、requestId和expectedVersion；其他操作不传。身份及仓库权限由服务端读取，禁止自报身份。')
});
export const output=z.object({payload:z.string()});
