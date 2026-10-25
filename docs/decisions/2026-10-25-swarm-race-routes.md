# 决定：保留 roleIndex，把 `swarm workers` 改成 list

Status: accepted
Date: 2026-10-25

## 背景

单元 4 的 `swarm` 正文在 Phase A 第 4 条给了 model race 一条会失败的建议：让每个 arm 传 `role: "arena runners"` 加不同的 `roleIndex`。`arena runners` 在 manifest 里是 `autoPanel: true`，而 `selectRoleRoutes` 对 `autoPanel && roleIndex !== undefined` 直接抛错（`src/models.ts` 的自动 panel 分支），`tests/roles.test.ts` 也锁住了这个拒绝。也就是说照着正文做，调用会在启动任何 child 之前就失败。

同时 `roleIndex` 本身不能删。[委派契约](2026-10-25-delegation-host-contract.md)已经写明 `Agent` 只暴露 `id`，本插件读不到父会话的 route，更判断不了 provider/model 家族。`arena` 的 cross-judge 要求"优先选一个与父会话家族不同的 entry"，这个判断只能落在有全部候选清单的调用方身上；工具参数里又不能写 model id，否则等于把部署专属 route 写进正文。`roleIndex` 正好是"不暴露 id、又能从多个候选里选一个"的唯一表达，也是设计 §9.1、§9.2、§9.3、§6.11、§12.1 的明文要求。

`swarm workers` 当时是 `shape: "single"`：一个角色一条 route，所有 worker 共用。model race 需要"同一角色、不同 arm 用不同 route"，单值形状表达不了，正文只好去借 `arena runners`，于是撞上上面的拒绝。上游 swarm 的语义本来就是"一个默认 worker 模型 + race 时每个 arm 指定模型"，缺的只是"同键多值"这一层。

## 决定

把 `swarm workers` 的 `shape` 从 `single` 改成 `list`，`autoPanel` 保持 `false`。

- 不传 `roleIndex`：`selectRoleRoutes` 取首项，即每个 worker 的默认 route。普通 slice 与比较都这么用。
- 传 `roleIndex`：取该 entry，作为 race 里某个 arm 的 route。一次调用仍只启动一个 child，worker 数量由调用方逐个调用决定。
- 角色键仍是 17 个。`ROLE_MANIFEST` 的条数、示例文件的行数、`setup-pstack` 展示的清单都不变。
- `autoPanel` 的拒绝逻辑不动：`arena runners`、`architect runners`、`interrogate reviewers` 仍拒绝 `roleIndex`，`single` 角色也仍拒绝 `roleIndex`。
- 正文与运行期诊断改成 list 语义，并补上一句工具做不到的事：`pstack_subagent` 只报告本次调用选中的 entry 与 route，它无法比较两次调用，所以"两个 arm 落在同一 entry 就是同一条 route、不是跨模型 race"必须由主代理在汇总里写明，不能写成"结果会告诉你"。

## 备选方案

- 删掉 `roleIndex`，把 `arena cross-judge pool` 改成单值角色。放弃：`Agent` 只有 `id`，工具无法知道父会话的 route 与家族，cross-judge 的"换家族"判断就只能写死在配置文件里；一份 role file 也无法同时保留多个候选供不同任务挑选。这条同时删掉了 §9.1 的明文参数和它的越界、缺省、与 `single` 角色互斥等既有测试。
- 把 cross-judge 改成 panel。放弃：panel 的语义是"每条 entry 起一个 child"，而 judge 需要的是"从池里挑一个"。改成 panel 会起 N 个 judge，rubric 的应用方式、成本与结果都不再是原来那个流程。
- 新增第 18 个角色 `swarm race arms`。放弃：键数、manifest、`setup-pstack` 文案、示例 role file 与分类断言都要连带改动，而"同一角色的多个候选"本来就是 list 的既有表达。多一个键只是把同一种结构写两遍，还会让用户在两行里维护同一个模型池。
- 把 race 定义成"同一 route 重复采样"。放弃：那测的是采样方差，不是模型多样性，也给了"看起来是 race、其实是同一个模型跑两次"一个正当借口。正文要求每个 arm 的实际 route 可见，正是为了让这种情况被识别出来。

## 后果

`roleIndex` 现在服务两个 list 角色（`arena cross-judge pool` 与 `swarm workers`），不再只服务 cross-judge。`swarm workers` 走 list 分支后，越界索引会得到 `valid indexes are 0, 1` 这样的可操作错误，未配置时仍回落到 `inherit-parent`，`autoPanel` 的三个 panel 与 `single` 角色的拒绝行为都不变。角色键数量不变，因此 `setup-pstack` 的清单、示例文件和分类计数都不需要改数字。

代价是 `swarm workers` 的语义从"一条 route"变成"首项默认 + 可选 entry"，读正文的人必须知道"不传 index 取首项"这件事；这也是正文、示例注释和运行期诊断都要写明首项含义的原因。另外单元 4 的 `swarm` 与 `setup-pstack` 正文在这一处曾经是错的（让 race 去用会自动 panel 的角色），本次修正覆盖了它。

真实 arm route、两个 arm 的并发行为、以及"race 结果如何选择"都还没有实机验证：本阶段只有静态检查与单元测试，`swarm` 的 B 级用例仍按未验证处理。
