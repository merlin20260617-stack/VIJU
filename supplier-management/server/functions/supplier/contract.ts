import {z} from 'zod';
export const input=z.object({
 operation:z.enum(['snapshot','save','import','attach','bulk','importPreview','govern']).describe('snapshot只读加载本人有权使用的模块与看板；save维护主数据；import每批提交最多100条；importPreview校验2000行；bulk预览或确认批量修改/受保护删除；govern处理资质、绩效、整改、准入、角色或成员；attach追加附件'),
 target:z.enum(['supplier','material','mapping','technical','qualification','evaluation','issue','lifecycle','role','member']).optional().describe('固定业务对象；govern使用qualification/evaluation/issue/lifecycle/role/member，其他写操作使用对应主数据；snapshot不传'),
 commandJson:z.string().max(1500000).optional().describe('save传recordId/fields；import和importPreview传mode(新增/更新)/rows；bulk传action(update/delete)、ids、patch、preview、expectedPreviewKey，删除提交还须confirmation=删除 N 条；attach传recordId/files。ID来自snapshot，不传身份或表ID。')
});
export const output=z.object({payload:z.string()});
