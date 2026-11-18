# 能力提取与 probe 编写规则

本文件定义如何从上游 pstack 工作流和 DSH 运行时推导需要验证的行为，并写成 probe。它只给方法与判定标准，不列出应当实现或提取的具体能力；每次生成时都从当前上游和当前运行时重新推导。

## 1. 判定一个行为是否值得 probe

只有满足以下之一的行为才写 probe：

- 该行为是 pstack 工作流完成所必需的，且 DSH 标准模式（`native`，不加载被测插件）不能保证它。
- 被测插件对外提供了该行为的契约（工具、返回结构、会话注入等），可能回归。

判定基于当前运行时与当前上游，不预设结论；`native` 的运行结果是最终仲裁。三条都不满足的行为记入排除清单并写明原因。

## 2. 提取流程

1. 读当前上游 pstack 的技能、playbook、命令和 agent 文档，列出工作流实际依赖的用户可观察行为。按行为组织，不按文件数量组织。
2. 对每个行为写一个实现中立的任务级 probe：prompt 用自然语言描述目标和约束，不写工具名、包名或实现路径。
3. 在 `native` 与 `adapted` 两个 treatment 上运行同一 probe；`native` 观察 DSH 标准模式，`adapted` 观察插件加入后的结果。
4. 只保留能失败的行为：`assertions` 必须在行为缺失时失败，禁止只有 `turn-completed`。
5. 不需要或无法验证的行为写进排除清单并写明原因（需用户批准）。

不写自动解析上游文档的脚本；提取每次由人从当前来源判断。

## 3. 写一个 probe

- 一个文件一份 probe，放在 `playground/scenarios/`（扁平，无目录分组），默认导出 `BehaviorScenario`。
- 声明 `capability`（稳定 id）、`treatments`（默认两者）、`environments`（默认 `["base"]`）。
- `turns` 用自然语言描述用户目标，不写工具名或实现路径。
- `workspace` 放必要 fixture。
- `assertions` 只做机械事实，且必须能在行为缺失时失败。
- `rubric` 描述用户可观察的最低合格边界，允许合理的替代实现和降级路径。
- 需要看真实呈现时声明 `uiObservations`。
- 一个 probe 只覆盖一个行为分支。

## 4. inventory 与排除

- `playground/capabilities/capability-inventory.json`：每个能力一条，字段 `id`、`category`、`description`、`sources`、`requiredBy`、`status`（`covered` | `discovered` | `excluded`）、`probes`。
- `playground/capabilities/capability-exclusions.json`：`{ "<id>": { "reason": "...", "decidedBy": "user" } }`，只有用户明确批准才写。
- `playground/capabilities/capability-exclusions.proposed.json`：候选排除，agent 可写，不产生 `excluded` 状态。

## 5. 完成标准

- 每个从当前上游推导出的行为，都有 `covered` 的 probe，或有用户批准的 `excluded` 记录。
- inventory 中每个 `covered` 的 `probes.base` 指向真实存在的 probe。
- 没有孤儿 probe：每个 probe 的 `capability` 都在 inventory 里。
- 每个 probe 的机械断言能在行为缺失时失败。
- `vp run typecheck && vp run playground:typecheck && vp test` 通过。

## 6. 上游或 DSH 变化时

- 从变化的来源重新推导受影响的行为；新增行为补 probe 与 inventory，删除或改名的同步移除或更新。
- 重跑 `native` 基线，确认哪些行为已经由 DSH 原生支持；`native` 的结果改变 probe 的判定语义。
- 重建后重跑第 5 节的完成标准。
