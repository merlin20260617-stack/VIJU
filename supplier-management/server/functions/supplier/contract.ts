import {z} from 'zod';
export const input=z.object({
 operation:z.enum(['snapshot','save','import','attach']).describe('snapshot只读加载供应商、物料及供货关系；save维护一条业务记录；import预览或提交受控批量资料；attach追加新附件，均由服务端核验职责'),
 target:z.enum(['supplier','material','mapping','technical']).optional().describe('save/import/attach的固定业务对象；technical只更新已有供货关系的技术适配结论，snapshot不传'),
 commandJson:z.string().max(500000).optional().describe('save传recordId和fields；import传mode(新增/更新)、rows及preview布尔值；attach传recordId及files数组。记录ID来自snapshot；不传身份、表ID或权限。')
});
export const output=z.object({payload:z.string()});
