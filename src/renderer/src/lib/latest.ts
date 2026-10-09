/**
 * 「只认最新请求」守卫。
 *
 * 场景：`load()` 与写操作后的 `refreshAll()` 会并发发起同名请求。
 * 若先发起的慢响应后到达，就会用**旧数据覆盖新数据**——
 * 表现为"刚保存的记录不显示，切走再切回又出现了"。
 *
 * 用法：
 *   const guard = new LatestGuard()
 *   const isLatest = guard.begin()
 *   const data = await fetchSomething()
 *   if (isLatest()) set({ data })   // 已被更新的请求取代则丢弃
 */
export class LatestGuard {
  private seq = 0

  /** 开始一次新请求；返回「这次结果是否仍是最新」的判定函数 */
  begin(): () => boolean {
    const mine = ++this.seq
    return () => mine === this.seq
  }
}
