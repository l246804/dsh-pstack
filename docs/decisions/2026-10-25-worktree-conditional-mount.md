# 决定：worktree 由本 bundle 条件挂载，按组合行去重

Status: accepted
Date: 2026-10-25

## 背景

[README 内容决策](2026-10-24-readme-content.md)把 worktree 定为首版必要依赖：插件在未启用时自动启用它，已经启用时不重复启用，并且要求这个承诺"可验证"，检测不能依赖启动时的快照猜测。[移植总决策](2026-10-24-upstream-generated-port.md)因此放弃了"worktree 是可选依赖、由 playbook 各自声明门槛"的写法。

rc.3 的官方 worktree 是两行，不是一行：`@deepseek-ai/dsh-experimental-worktree` 提供 `worktrees` 服务，`@deepseek-ai/dsh-experimental-tool-worktree` 注册模型可调的 `create_worktree`。官方由 `@deepseek-ai/dsh-experimental-tool-worktree` 这一个 bundle 同时插入两行。

重复挂载不是无害重复。Cordis 的 `ctx.provide()` 在服务名已被占用时抛错（`service "worktrees" has been registered at <fiber>`），所以两条 provider 行同时挂载会在启动期报错。

## 决定

1. 本包 `cordis.patch.yml` 插入自己的两行 `pstack-worktree` 与 `pstack-tool-worktree`，各自带一个 `disabled: !!js` 守卫表达式。
2. 求值点是 Loader 的 `Entry.disabledOf`：`disabled` 每次挂载决策都重新求值，配置重载与热开关都会经过它，所以判定跟着当前组合走，不缓存启动快照。
3. 守卫判据是"组合行里是否存在另一条启用中的同名插件行"：读 `ctx.fiber.entry.parent.data`（父条目组在创建子项之前已赋值完整的组合行数组），按自己的行 id 排除自己。刻意不用 `ctx.get('worktrees')`：服务查询分不清自家 provider 与别家 provider，而且兄弟行还在 `import` 时服务尚未提供，按服务判断会把"已经启用"误判成"未启用"。
4. `disabled` 本身是 `!!js` 表达式的行按"提供者"处理，即偏向不重复挂载。读不到组合行（上下文形状变化）时返回 false，照常挂载：README 的承诺是"缺就装上"，判定失效时宁可多挂一次也不静默失去 worktree。
5. 表达式文本由 `scripts/worktree-mount.ts` 生成，`check:assets` 逐字节比对，`tests/worktree-mount.test.ts` 用 Loader 自己的求值语义核对两个方向：纯函数判定与文件里真正会跑的字符串。
6. 两份行只隔离工作目录与分支。端口、网络、凭据、全局缓存、外部服务和运行时不在隔离范围内，技能与帮助正文都按这个边界写。

## 备选方案

- 用 `ctx.get('worktrees')` 判断服务是否已存在。放弃：本行自身就是 provider，服务起来后会让本行把自己判成重复；兄弟行 import 尚未完成时又会把已配置的 provider 判成缺失。
- 插入与官方同 id（`worktree`、`tool-worktree`）的行，靠 Loader 的同 id 去重。放弃：重复 id 会留在组合数据里，配置回写后每次启动再追加一条；而且整行覆盖会连带丢掉用户在该行上配置的 `directory` 等字段。
- 把官方 worktree 实现复制进本包。放弃：违反运行时零 `@deepseek-ai` import 的边界，也不是"挂官方行"。
- 只挂运行时行、不挂工具行。放弃：模型拿不到 `create_worktree`，正文只能谈隔离而无法落地并行写。
- 每次启动读 profile 文件推断是否已启用。放弃：那正是启动快照，热开关和升级路径都会留盲区。

## 后果

worktree 从非必要依赖变成随包能力：能力表里 `worktree` 行从 `deferred` 变为 `mapped`，`check-assets` 里"worktree 必须保持 deferred"的断言同步改掉，四个真实路径的验收记入未验证清单。

代价是本包依赖两处 Loader 内部语义：`disabled` 的逐次求值，以及 `Entry.parent.data` 的结构。DSH 升级时必须重新核对 `scripts/worktree-mount.ts` 的守卫；守卫失效的表现是判定不再随组合变化，最坏情况是两条 provider 行同时挂载并在启动期报错。

判定按行 id 排除自己，因此行 id 属于兼容契约：改名等于允许重复挂载。若将来 DSH 提供"服务缺失才挂载"的一等机制，应新写一条记录取代本记录，而不是让两套机制并存。
