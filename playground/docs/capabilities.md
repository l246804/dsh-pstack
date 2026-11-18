# 能力提取与 probe 编写规则

本文件是 playground 场景用例的唯一规则来源。规则是缺口和价值驱动：只测 pstack 工作流需要、且 DSH 标准模式可能不保证的行为，以及本插件交付的契约。probe 保持实现中立，谁缺谁补由 native 运行结果决定。

## 1. 两类 probe，不要混为一谈

- **gap probe（native + adapted 都跑）**：一个实现中立的任务级探针，验证 pstack 工作流需要的某个行为在 DSH 里是否成立。`native` 不加载被测插件，只跑 DSH 标准模式；`adapted` 加载 `dsh-pstack`。两侧都跑，才能看出 DSH 是否原生支持、插件是否补齐。**不预设这个能力 DSH 一定缺**，谁缺谁补由 native 的运行结果决定。这样 DSH 更新后某个能力变成原生支持时，重跑 native 就能发现，不会被实现耦合掩盖。
- **contract probe（仅 adapted）**：我们交付的插件契约，例如 `pstack_subagent`、`pstack_models`、`pstack_roles`、`pstack_interrupt` 的行为与返回、poteto 会话注入。native 没有对应物，只跑 adapted，验证交付物本身。

probe 的 prompt 一律用自然语言描述目标和约束，不写工具名、包名或实现路径，保持实现中立。

## 2. 提取规则

gap probe 从一个中性的问题出发：这个行为是 pstack 工作流需要的吗，而且 DSH 标准模式可能不保证它吗？是，就建一个 gap probe，让 native 去观察、adapted 去验证。contract probe 则对应我们实际交付的插件工具与会话注入。其余不需要跑的行为默认排除（见第 3 节）。

候选范围按“工作流依赖”而不是“插件功能”来列：

- **子代理委派与角色路由**：工作流要求按角色表动态派发、并行、中断、续聊、只读、团队协同。native 观察 DSH 标准模式能否做到，adapted 验证插件把它补齐。
- **输出渲染**：工作流需要内联渲染 mermaid、图表、图片、视频、音频、UI。native 观察是否只有文件卡片，adapted 或 `render` 环境观察内联是否成立。
- **缺失的 cursor-only 技能**：`visualize`、`cursor-team-kit`（`deslop`、`control-ui`、`control-cli`）、`loop`、`create-skill`。native 观察缺失，adapted 验证 fallback 或 vendored。
- **插件契约（contract probe）**：`pstack_models`、`pstack_roles`、`pstack_subagent`、`pstack_interrupt`、poteto 会话注入。
- **会话工作流**：poteto 开关注入 `poteto-mode` 与会话投影。

## 3. 默认排除（写 reason，不写 probe）

- 24 个 `principle-*` 技能：纯指导文本，没有可运行行为。
- 纯 workflow playbook（`investigation`、`bug-fix`、`refactor` 等）：流程指导，不是可观察能力。
- DSH 原生通用工具（file read/write、grep/glob、todo、askquestion、skill loading）：native 本就支持、插件不改，最多留一个冒烟。
- environment extras（worktree、terminal、session-search、desktop、cloud、VM/SSH 虚拟机）：当前不缺或未支持，未来作为 `environment` 维度扩充，不进核心集。

## 4. 写一个 probe

- 一个文件一份 probe，放在 `playground/scenarios/`（扁平，无目录分组），默认导出 `BehaviorScenario`。
- 声明 `capability`（稳定 id）、`treatments`（默认两者）、`environments`（默认 `["base"]`）。
- `turns` 用自然语言描述用户目标，不写工具名或实现路径。
- `workspace` 放必要 fixture。
- `assertions` 只做机械事实，且必须能在能力缺失时失败；禁止只有 `turn-completed`。
- `rubric` 描述用户可观察的最低合格边界，允许合理的替代实现和降级路径。
- 需要看真实呈现时声明 `uiObservations`。
- 一个 probe 只覆盖一个能力分支。

## 5. inventory 与排除

- `playground/data/capability-inventory.json`：每个能力一条，字段 `id`、`category`、`description`、`sources`、`requiredBy`、`status`（`covered` | `discovered` | `excluded`）、`probes`。
- `playground/data/capability-exclusions.json`：`{ "<id>": { "reason": "...", "decidedBy": "user" } }`，只有用户明确批准才写。
- `playground/data/capability-exclusions.proposed.json`：候选排除，agent 可写，不产生 `excluded` 状态。
- 不写自动解析上游文档的脚本；inventory 由 agent 手工维护。

## 6. 完成标准

- 五个核心组每组至少一个 probe，且断言能在能力缺失时失败。
- inventory 中每个 `covered` 的 `probes.base` 指向真实存在的 probe。
- 每个 `excluded` 都有用户批准的原因。
- 没有孤儿 probe：每个 probe 的 `capability` 都在 inventory 里。
- `vp run typecheck && vp run playground:typecheck && vp test` 通过。

## 7. pstack 或 DSH 重大更新时

- 先用 `git diff 旧pin..新pin -- upstream/cursor-plugins/pstack` 判定受影响的核心组，只重建受影响组的 probe。
- 新增或改名的能力补 inventory 与 probe，删除或改名的同步移除。
- 只靠 diff 判断不可靠时（major 变更），重新过一遍第 2 节的候选范围，确认没有新的真实缺口；其余按第 3 节默认排除。
- **DSH 更新后必须重跑 native 基线**。native 不是预设，是权威观察：某个 gap probe 在 native 通过，说明 DSH 已原生支持它，要重评这个 probe 的语义（从“插件补缺口”改为“DSH 原生或回归”）以及插件是否还需要该能力。
- 重建后重跑第 6 节的完成标准。
