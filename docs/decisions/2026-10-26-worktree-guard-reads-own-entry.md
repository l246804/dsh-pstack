# 决定：worktree 守卫读本行 entry，不读外层 include 行

Status: accepted
Date: 2026-10-26

取代 [2026-10-25-worktree-conditional-mount.md](2026-10-25-worktree-conditional-mount.md) 第 3 条的事实前提。

## 背景

[worktree 条件挂载决定](2026-10-25-worktree-conditional-mount.md)第 3 条把守卫判据写成"读 `ctx.fiber.entry.parent.data`"，并在括号里断言「父条目组在创建子项之前已赋值完整的组合行数组」。前半句是表达式的写法，后半句是对它读到什么的判断。

那个判断是错的。在真实 Loader 里求值 `disabled` 时，`ctx.fiber.entry` 指向的不是被求值的那一行，而是外层 `include` 根条目。实测（在一次求值里同时打印三条数据）：

```text
ownId:          include:guarded            # 本次求值的行
ownSiblings:    ["alpha", "guarded"]       # 这一行真正所在的组
fiberEntryId:   include                    # 表达式实际读到的条目
fiberSiblings:  ["include"]                # 表达式实际读到的数组
```

`include` 这一行的 `name` 是 `cordis:include`，永远不等于 `@deepseek-ai/dsh-experimental-worktree`，所以 `rows.some(...)` 恒为 `false`，`disabled` 恒为 `false`：**两行在任何 profile 里都会挂载**。

后果是 [worktree 条件挂载决定](2026-10-25-worktree-conditional-mount.md) 明确要避免的那个失败：在已装官方 worktree 的 profile 里，两个 provider 同时提供 `worktrees`，启动期抛

```text
service "worktrees" has been registered at <...>
```

四种组合的实测结果：

| 守卫写法 | profile 无官方行 | profile 已装官方行 |
|---|---|---|
| `ctx.fiber.entry`（旧） | 两行挂载 ✅ | 两行也挂载 ❌ 启动期服务冲突 |
| `ctx[Symbol.for('cordis.entry')]`（新） | 两行挂载 ✅ | 两行 `DISABLED` ✅，无冲突 |

旧记录能成立，是因为当时的测试用手搓的 ctx 驱动守卫：

```ts
function contextWith(rows) {
  return { fiber: { entry: { parent: { data: rows } } } };
}
```

这个假 ctx 恰好把"读哪个 entry"这个唯一缺陷点绕过去了：测试作者选定的 entry 就是他期望的那个。所以旧记录的判断既没有被测试挑战过，也无法被挑战。

## 决定

守卫读 `ctx[Symbol.for("cordis.entry")]`，也就是 Loader 为**每个条目自身**挂在 context 上的那个句柄（`cordis-plugin-loader/lib/index.js:312` 定义 `Entry.key = Symbol.for("cordis.entry")`，`:324` 执行 `this.ctx = loader.ctx.extend({ [Entry.key]: this })`）。其余判据不变：仍是"组合行里是否存在另一条启用中的同名插件行"，仍按自己的行 id 排除自己，读不到组合行时仍返回 `false`（缺就装上）。

表达式文本仍由 `scripts/worktree-mount.ts` 单一生成，`check:assets` 逐字节比对 `cordis.patch.yml`；`tests/worktree-mount.test.ts` 的假 ctx 改成同一形状，`tests/plugin-wiring.test.ts` 用真实 `Loader` + `cordis:include` 断言四个场景：无官方行时两行挂载、有官方行时两行 `DISABLED`、只有工具行时运行时行仍挂载，以及三种情形下 `logs` 都没有服务冲突。

## 备选方案

- 继续读 `ctx.fiber.entry`。放弃：就是本记录要修的缺陷，已装官方 worktree 的 profile 启动失败。
- 读 `ctx.get("worktrees")` 判断服务是否已存在。仍然放弃，理由与旧记录相同且未变：本行自身就是 provider，服务起来后会让本行把自己判成重复；兄弟行 import 尚未完成时又会把已配置的 provider 判成缺失。
- 改成静态开启，放弃条件挂载。放弃：违反 README 对"必要时自动启用、已启用则不重复"的承诺。
- 每次启动读 profile 文件推断。放弃：那正是启动快照，热开关和升级路径都会留盲区，与旧记录否决它的理由相同。
- 插入与官方同 id 的行，靠 Loader 同 id 去重。仍然放弃：重复 id 会留在组合数据里，配置回写后每次启动再追加一条。

## 后果

"已装官方 worktree 的 profile 启动失败"这个唯一的启动阻断项消除了，并且第一次有了能在真实 Loader 上证明它的测试：旧测试形态在结构上不可能发现这个缺陷。

代价是兼容契约从"行 id + 组合行数组的结构"扩大到"行 id + 该 Symbol 的语义"。`Symbol.for("cordis.entry")` 是 Loader 的实现细节而非公开 API，DSH 升级时必须重跑 `tests/plugin-wiring.test.ts`；守卫失效的表现不再是不随组合变化（那是旧缺陷），而可能是表达式求值抛错或恒返回 `false`——两者都会让两行重新同时挂载。

若将来 DSH 提供"服务缺失才挂载"的一等机制，应新写一条记录取代本记录，而不是让两套机制并存。
