# 纯Lark接入验收 — 2026-10-29

本次已将运行代码改为全部使用Lark Base与FaaS，不再调用独立Sites/D1服务。Base实际时区已核对为Africa/Lagos。

- 官方完整check通过：project、functionMetadata、serverValidation、dependencies、pageBuild、faasBuild；10个只读Database Function及1个FaaS。
- 20项业务规则测试与9项Base转换/回执核对测试通过。这些测试不表示Base拥有数据库事务。
- 实际Preview已回读管理员角色、1个工厂、1个仓库、1个产品、1个客户、2张示例订单、1个生产批次与1个期初；库存源返回lark-base。
- 真实浏览器点击确认发货280箱，订单进入已完成，已发280、待发130、可发720；点击撤回并填写原因后，可发恢复1000、已发0、待发410，两张订单回到待装货。未成熟生产500箱始终隔离。
- 页面同一路径FaaS再次回读：ready=true、2个操作回执已确认、pending为空，确认及撤回审计均存在。未重放业务写入。
- 现有示例数据明确标记为示例，未导入ERP真实数据。
- Excel解析/字段匹配/前导零已在隔离浏览器验证；真实Lark宿主文件选择自动化此前未完成，ERP样本试导仍待用户验收。
- 当前账号为Admin，不能据此宣称多仓管真实账号权限验收已完成。
- 当前为Preview，正式版未发布。
