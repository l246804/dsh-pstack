# 能力提取与 probe 编写规则

本文件是重新生成 playground 场景用例的唯一规则来源。旧的穷举式提取（扫描上游每个 skill 和 playbook 逐个建用例）已废弃。新规则是缺口和价值驱动：只测 DSH 真正缺、且由本插件补上的能力，以及插件新增的可能回归的契约。

## 1. 判定规则

一个能力值得一份 probe，当且仅当满足其一：

- (a) **native 与 adapted 会不同**：DSH 缺这个能力，插件把它补上。
- (b) **插件新增了可能回归的契约**：新增的工具、schema、路由或会话注入。
- (c) **一个可选环境会改变结果**：例如渲染插件、可选运行时插件。

三条都不满足的能力，写进 `playground/data/capability-exclusions.json` 并写明原因（需用户批准），不写 probe。

## 2. 核心能力组

只从下面五组提取，每组至少一个能失败的 probe：

- **delegation（核心）**：`pstack_subagent` 按角色文件的 provider/model/effort 动态派发；并行 fan-out；inherit；`pstack_interrupt` 中断；`send_message` 续聊；readonly 沙箱；agent-team 的 spawn/send/list/interrupt。
- **plugin-tools**：`pstack_models` 列可用模型；`pstack_roles` 报告已配置路由；模型不可用时的回退。
- **output-render**：mermaid、图表、图片、视频、音频、UI 的内联呈现，对比只有文件卡片；用 `render` 环境与 `base` 做同题对照。
- **skill-dependency（cursor-only）**：`visualize`、`cursor-team-kit`（`deslop`、`control-ui`、`control-cli`）、`loop`、`create-skill`；这些技能 DSH 没有，验证 adapted 的 fallback 或 vendored 是否成立。
- **session-workflow**：poteto 开关注入 `poteto-mode`；会话投影。

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
- 只靠 diff 判断不可靠时（major 变更），重新过一遍第 2 节的五组，确认没有新的真实缺口；其余按第 3 节默认排除。
- 重建后重跑第 6 节的完成标准。
