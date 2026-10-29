import {z} from 'zod';
export const input=z.object({
  operation:z.enum(['workspace','mutate','reconcile']).describe('workspace读取本人授权仓库的Lark台账；mutate记录实际已发生的仓库业务；reconcile核对上次写入结果，只在台账全部匹配后确认回执，不重放业务写入'),
  commandJson:z.string().max(1048576).optional().describe('mutate传业务命令JSON：operation、payload、requestId、expectedVersion；reconcile可传仅含requestId的JSON以核查指定操作；workspace不传。身份及仓库权限均由服务端读取。')
});
export const output=z.object({payload:z.string()});

