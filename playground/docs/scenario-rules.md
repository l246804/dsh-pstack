# 场景与缺口规则

本文件定义 playground 的生成顺序：先产出 native 缺口清单，再从缺口清单生成场景。场景只描述 treatment 中立的用户可观察结果；native 与 adapted 的判定规则分开，不写进场景。

## 1. 第一阶段：native 缺口清单

产物是 `native/gaps.json`，提取规则、输入边界、清单判据和 schema 全部见 [../../native/AGENTS.md](../../native/AGENTS.md) 的「如何提取缺口」，本文件不重复。`status` 由用户在 gap 生成会话中确认；只有 `confirmed` 的缺口进入第二阶段。

## 2. 第二阶段：从缺口生成场景

- 一个缺口至少一个 `kind: "gap"` 的场景，可以有多个分支或环境；场景与缺口不是一一对应。
- gap 场景必须声明 `gap: "<gap-id>"`，指向 `gaps.json` 中的条目。
- `kind: "regression"` 的场景不属于任何缺口，用于验证已经交付、可能回归的契约；回归场景是后续批次，不进入缺口清单。不要把插件工具用例伪装成 gap 场景。

## 3. 场景写法：treatment 中立

- 一个文件一份 probe，放在 `playground/scenarios/probes/`（扁平，无目录分组），默认导出 `BehaviorScenario`。
- 声明 `capability`（稳定 id）、`kind`（`gap` | `regression`）、`gap`（gap 场景必填）、`treatments`（gap 场景默认 native + adapted）、`environments`（默认 `["base"]`）。
- `turns` 用自然语言描述用户目标和约束，不写工具名、包名或实现路径。
- `workspace` 放必要 fixture。
- `assertions` 只做机械事实，且必须能在行为缺失时失败；禁止只有 `turn-completed`。
- `rubric` 只写用户可观察的合格边界，不写 adapted 该用哪个工具、哪个 preset、哪个返回结构。
- 需要看真实呈现时声明 `uiObservations`。
- 一个场景只覆盖一个行为分支。

## 4. native 与 adapted 的判定分工

- 同一个场景在 native 与 adapted 都运行；场景内容不包含任何 treatment 专属期望。
- native 分析：判断该场景是否确实暴露 DSH 标准模式的缺口，确认或推翻缺口清单条目。
- adapted 分析：判断同一场景在插件环境下是否达成同一用户可观察结果，即缺口是否闭合。
- 插件实现变化时，场景和缺口清单保持不变；只有 adapted 分析读取工具调用、截图等证据的方式可能随实现更新。

## 5. 缺口清单与场景

- `native/gaps.json` 的条目结构与字段约束见 [../../native/AGENTS.md](../../native/AGENTS.md) 的「如何提取缺口」。
- 已生成的场景就是场景集合本身：每个 `playground/scenarios/probes/*.ts` 文件声明自己的 `capability`、`kind`、`gap`、`treatments`、`environments`，不再维护单独的 inventory 或 exclusions 文件。
- 覆盖率由缺口清单和场景文件计算（见 `gapCoverageProblems`），不靠第三份清单同步。
- 不写自动解析上游文档的脚本；缺口与场景由 agent 从当前来源判断。

## 6. 完成标准

- `gaps.json` 中每个 `confirmed` 缺口至少有一个 `kind: "gap"` 且 `gap` 指向它的场景。
- 每个 gap 场景的 `gap` 都存在于 `gaps.json`，且同时运行在 native 与 adapted。
- 每个 regression 场景不声明 `gap`。
- 每个场景都有 `kind` 和非空的 `capability`。
- 每个场景的机械断言能在行为缺失时失败。
- `vp run typecheck && vp run playground:typecheck && vp test` 通过。

## 7. 上游或 DSH 变化时

- 重跑 `native` 基线，更新 `gaps.json`：新增、关闭或改判缺口。
- 缺口变化驱动场景增删；回归场景单独维护，不随缺口清单变化。
- 重建后重跑第 6 节的完成标准。
