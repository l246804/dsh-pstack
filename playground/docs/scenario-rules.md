# 场景规则

本文件定义 playground 如何把已确认的 native 缺口写成场景，以及场景与缺口如何保持同步。场景只描述 treatment 中立的用户可观察结果，不写任何 treatment 专属期望。

## 输入契约

- 缺口来源是 `native/gaps.json`，只读消费，不回写。缺口如何产生、如何改判见 [../../native/AGENTS.md](../../native/AGENTS.md)，本文件不重复。
- 只有 `status: "confirmed"` 的缺口可以生成 gap 场景。
- 一个缺口可以有多个场景（不同分支或环境）；场景与缺口不是一一对应。

## 场景定义

- 一个文件一份 probe，放在 `playground/scenarios/probes/`（扁平，无目录分组），默认导出 `BehaviorScenario`。
- `id`：稳定场景 id。
- `capability`：稳定能力 id；gap 场景的 `capability` 必须等于它的 `gap`。
- `kind`：`gap` | `regression`。
- `gap`：gap 场景必填，指向 `native/gaps.json` 的缺口 id；regression 不写。
- `treatments`：gap 场景默认 `["native", "adapted"]`。
- `environments`：默认 `["base"]`；可选环境 id 由 `runner/scenario/environments.ts` 定义，文档不枚举。
- `turns`：自然语言描述用户目标和约束，不写工具名、包名或实现路径。
- `workspace`：必要 fixture。
- `assertions`：只做机械事实，必须能在行为缺失时失败；禁止只有 `turn-completed`。
- `rubric`：只写用户可观察的合格边界，不写 adapted 该用哪个工具、哪个 preset、哪个返回结构。
- `uiObservations`：需要看真实呈现时声明。
- 一个场景只覆盖一个行为分支。

## 环境

- `base` 不加载额外插件，是默认对照。
- 可选环境按需启用，不默认运行；同一 probe 在 base 与该环境各跑一次，保留 base 结果才能判断差异来源。
- 需要独立对照的特殊环境使用独立 probe，不复用 base prompt。

## 缺口与场景同步

- 每个 `confirmed` 缺口至少有一个 `kind: "gap"` 且 `gap` 指向它的场景。
- 每个 gap 场景引用的缺口必须存在且为 `confirmed`；缺口改判为 `refuted` 或 `excluded` 时，删除对应场景，或转成 `regression` 并去掉 `gap`。
- gap 场景的 `capability` 必须等于 `gap`。
- 缺口描述变化时，场景必须重读；`gap-lock` 指纹不匹配会失败，确认场景仍成立后运行 `vp run playground:gap-lock -- --write` 重新落锁。
- 守卫：`gapCoverageProblems` 检查引用完整性，`gapLockProblems` 检查描述指纹；测试在 `playground/tests/playground-contracts.test.ts`。

## 完成标准

- `vp run typecheck && vp run playground:typecheck && vp test` 通过。
- `vp run playground:gap-lock -- --check` 通过。
- 每个 confirmed 缺口有场景；每个 gap 场景引用 confirmed 缺口且 capability 与 gap 相同；每个 regression 不声明 gap。
