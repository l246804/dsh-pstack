# 场景规则

本文件定义 `playground/scenarios/probes/` 的场景结构、gap 绑定和回归场景边界。运行矩阵见 [model.md](./model.md)，缺口生成规则见 [../../native/AGENTS.md](../../native/AGENTS.md)。

## 场景来源

场景有两条独立来源：

- **gap 场景**：从 `native/gaps.json` 的 `status: "confirmed"` 缺口生成，用来验证一个具体 DSH 能力缺口。必须声明 `kind: "gap"` 和对应的 `gap` id。
- **regression 场景**：记录已经验证过、后续需要持续防止回归的行为。必须声明 `kind: "regression"`，不写 `gap`，不依赖 `gaps.json` 是否存在。回归场景可以在任何时候补充。

两条来源共用同一个 probe 目录和同一套执行器。不要为了增加回归用例而先往 `gaps.json` 里造缺口；也不要把 regression 场景写进 gap-lock。

## 场景定义

一个文件一份 probe，放在 `playground/scenarios/probes/`，默认导出 `BehaviorScenario`。

| 字段 | 规则 |
| --- | --- |
| `id` | 稳定、唯一；跨 native/adapted 保持同一 id |
| `kind` | 必填：`gap` 或 `regression` |
| `capability` | 稳定能力 id；gap 场景必须等于 `gap` |
| `gap` | gap 场景必填；regression 不写 |
| `treatments` | 默认 `["native", "adapted"]`；gap 场景应覆盖两侧 |
| `environments` | 默认 `["base"]`；可选 id 见 `runner/scenario/environments.ts` |
| `turns` | 用户可观察目标，不写工具名、包名或实现路径 |
| `workspace` | 必要 fixture；不引用宿主路径 |
| `assertions` | 只做机械事实，必须能随行为缺失而失败；禁止只有 `turn-completed` |
| `rubric` | 用户可观察的合格边界，不写 adapted 工具或返回结构 |
| `uiObservations` | 需要真实呈现时声明 |
| `answers` | 需要自动回答 ask_user_question 时声明 |

`assertions` 可用：`turn-completed`、`skill-loaded`、`no-tool-error`、`artifact-contains`、`artifact-dir-nonempty`、`artifact-absent`、`assistant-contains`。`turn-completed` 只能作为基础项，必须至少有一个能随目标行为缺失而失败的断言。

一个场景只覆盖一个行为分支。场景定义是 treatment 中立的；同一个 probe 不在文件内分支 treatment。

## Gap 同步

- 每个 `confirmed` 缺口至少有一个 `kind: "gap"` 且 `gap` 指向它的场景。
- gap 场景引用的缺口必须存在且仍为 `confirmed`；缺口改判为 `refuted` 或 `excluded` 时，删除该场景或转成 `kind: "regression"` 并去掉 `gap`。
- gap 场景的 `capability` 必须等于 `gap`。
- 缺口描述变化后，先重读场景；`gap-lock` 指纹不匹配会失败，确认场景仍成立后运行 `vp run playground:gap-lock -- --write` 重新落锁。
- 回归场景不参与 `gapCoverageProblems` 的 gap 计数，也不参与 `gap-lock`。

## 守卫

`vp run playground:gap-lock -- --check` 同时运行 `gapCoverageProblems`（gap 场景引用、状态、capability 和两侧 treatment）与 `gapLockProblems`（confirmed gap 描述指纹）。测试在 `playground/tests/playground-contracts.test.ts`。

## 完成标准

- `vp run typecheck && vp run playground:typecheck && vp test` 通过。
- `vp run playground:gap-lock -- --check` 通过。
- 每个 confirmed 缺口有 gap 场景；每个 gap 场景引用 confirmed 缺口且 capability 与 gap 相同；每个 regression 场景不声明 `gap`。
- 新加的回归场景不需要修改 `native/gaps.json` 或 `playground/scenarios/gap-lock.json`。
