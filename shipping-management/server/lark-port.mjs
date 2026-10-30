/**
 * Live integration boundary. No fake Base IDs, credentials or sequential stock writes.
 * implement after installing the Lark skill and inspecting the project's real Catalog.
 */
export class LarkRepository {
  async readAuthorizedSnapshot(_verifiedIdentity, _scope) {
    throw new Error('LARK_NOT_BOUND: 尚未绑定本项目 Lark 数据底座');
  }
  async compareAndSwap(_verifiedIdentity, _expectedVersion, _nextState, _requestId) {
    throw new Error('LARK_NOT_BOUND: 需验证服务端原子事务、幂等、仓库权限及未知结果恢复');
  }
}
// Handler identities MUST come from the trusted Lark host, never request JSON.
// Authorization and warehouse scope must also apply to all reads and reports.
// compareAndSwap must commit stock/order/audit/request receipt in one transaction.
// A timeout means outcome unknown: look up requestId before any retry.
