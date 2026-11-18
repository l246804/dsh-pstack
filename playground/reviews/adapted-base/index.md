# adapted/base 证据分析

> 本文件由 adapted 分析会话依据 `reviews/adapted-base/` 快照、`port/dsh.md`、当前适配实现写入。只审查适配实现，不读取 raw 证据结论。
>
> 本文件中的 DSH、adapted、pstack 版本是**采集时**的历史值，不代表当前仓库版本；当前版本以 `package.json` 的 `engines.dsh` 与 `version`、以及各 `manifest.json` 为准。

## 1. 本轮范围

- 基线批次：`full`，`adapted-base-20261117111536`，覆盖 adapted/base 全部 45 个适用场景，6 个 worker，2026-11-17 11:15 到 12:00（CST）。
- 决策后增量：按分析结论重跑 3 个场景。`adapted-base-20261117121719` 重跑 `skill-loading` 与 `role-panel-membership`；`adapted-base-20261117123653` 重跑 `stop-subagent`。三批合并成当前快照，未重跑的场景沿用基线。
- 环境（采集时）：`adapted` / `base`，加载 `dsh-pstack`（本地 link 构建）；DSH `0.2.2-rc.2`，adapted `0.4.1`，上游 revision `2f87c854fe3e2fcda44ca86b46ede35aad3c46b7`，config hash `3aa7db10df9015190040d91bf76064369bc294f09f374408e26a33a7804a5fbcb`。
- 会话配置：所有根会话跑内置 `standard` 预设（`agentPreset=standard`，路由 `magpie/workbuddy/minimax-m3.1-flash[low]`），并通过会话级开关注入 Poteto 工作流（截图页面顶部显示「标准模式 + Poteto 工作流」，系统提示实测包含 `Poteto workflow is enabled for this session`）。
- 覆盖：45 份 `record.json` + 45 张 `screenshot.png` 齐全，机械断言失败 0，无 blocked、无 `turnEnd=null`；`session.jsonl.zstd` 仅保留本地。
- 记录 verdict 全为 `inconclusive`（自动化运行的 `semanticReview` 恒为 `pending`，语义判定由本文件给出）。
- 覆盖缺口：`output-render` 的 7 个 `render-*` 探针只有 `phases: ["raw"]`，adapted/base 无直接渲染探针；`environment-browser-screenshot`、`skill-dependency-control-ui`、`skill-dependency-visualize` 的内联图片/图表渲染可作旁证。
- 关键前提修复：首轮 full 批次 45 个场景全部在选预设时报 `could not select preset poteto-mode` 直接 blocked。根因是提交 `968af9d` 用会话开关替换了 poteto 根预设，而 playground 仍选该预设。已在 playground 修复（见 Q1）后重跑。

能力类别分布（按 `capability-inventory.json`）：tool 7、delegation 14、environment 6、routing 9、skill-dependency 9、output-render 0。

## 2. 按能力类别汇总

### tool（7 个，7 通过）

`askquestion`、`file-read-write`、`grep-glob`、`open-a-todolist`、`skill-loading`、`task`、`tool-absent-fallback` 全部通过。`ask_user_question` 以选择卡片提问并被采纳；`todo_write` 三步清单贯穿并多次更新；`grep` 命中 `docs/deploy.md:3`；`file-read-write` 产出 `outputs/summary.md`。`skill-loading` 已按 Q2 决定去掉 `skill-loaded` 硬断言，移植后的上游技能通过 `read` 读取 `poteto-help/SKILL.md` 属于正确方式，回复给出了基于帮助内容的能力清单，判定通过。

### delegation（14 个，14 通过）

`comment-sicko`、`file-attachments`、`multi-phase-collaboration`、`parallel-delegation`、`poteto-agent`、`readonly-false`、`readonly-true`、`resume`、`run-in-background`、`subagent-general` 通过真实 `pstack_subagent` 子代理完成（`readonly-false` 的 `a = 2` 断言通过，`resume` 用 `send_message` 续跑同一子代理）。`cloud-base-branch`、`environment-cloud`、`environment-local` 按其 rubric 接受直接/替代结果。`stop-subagent` 重跑后根会话正确采证，`pstack_interrupt` 实测成功中断子代理并给出停点与后续计划，通过（Q3）。

### environment（6 个，6 通过，均按环境限制忽略）

`environment-browser-screenshot` 用 CDP 截整页并用 Markdown 内联渲染出真实页面（截图可见）；`environment-desktop` 无桌面，改用 headless 驱动同源 Web 应用读主题；`environment-forge-pr` 无 remote/gh，给出本地替代；`environment-session-search` 说明拿不到历史并请用户补充；`environment-terminal` PTY 被禁，转用宿主 Web 终端的 PTY 面板实测 `help`/`exit`；`environment-worktree` 建独立 worktree 并给路径。六项都符合 rubric 的「能力不可用时说明并给替代」。

### routing（9 个，9 通过）

`inherit-parent`（子代理实测继承 `magpie/workbuddy/minimax-m3.1-flash[low]`）、`model-discovery`（实测区分 advertised 与可用）、`model-route`（先选再实测，发现 `deepseek-account` 402 后回落并落实执行）、`model-unavailable-fallback`（`anthropic` 无适配器，回落 minimax[high] 并说明）、`non-claude-route`（`magpie/workbuddy/deepseek-v4.1-flash[low]`，子代理自证路由）、`role-effort-domain`（确认档位集合后把 `low` 提到 `high`）、`role-file`（读 `pstack-models.json` 与 `pstack_roles` 一致后派发）、`role-value`（角色值拆 provider/model/effort 并实际使用）通过。`role-panel-membership` 按 Q4 加收敛条件后重跑通过：从 `interrogate reviewers` 名单取 2 条各跑 1 次，跑满即停，实际使用 minimax[high] 与 deepseek-v4.1[low] 两席。

### skill-dependency（9 个，9 通过）

`control-cli`（`dsh --profile pgh` 退出 0，PTY 受限说明并替代）、`control-ui`（真实驱动按钮，内联多张交互截图）、`create-skill`（产出 `.dsh/skills/pre-commit-check/SKILL.md`）、`deslop`（无已提交改动可清理，说明等价的 vendored 技能）、`loop`（同轮三次巡检，`counter.txt` 最终为 3）、`no-comments`（comment-sicko 独立审查只报告）、`technical-writing`（README 增加快速开始小节）、`unslop`（去 AI 腔改写）、`visualize`（真实渲染柱状图，截图可见）全部通过。

### output-render（0 覆盖）

本轮无 adapted 渲染探针。`render-audio`、`render-generated-image`、`render-mermaid-diagram`、`render-screenshot`、`render-svg-chart`、`render-ui`、`render-video` 只在 raw 阶段跑。这是相位覆盖缺口，不判为能力缺失，交用户判断是否补 adapted 渲染探针。

### 逐场景结论

| 场景 | 类别 | 结论 | 关键观察 |
| --- | --- | --- | --- |
| askquestion | tool | 通过 | 选择卡片，采纳选项后继续 |
| file-read-write | tool | 通过 | 写 `outputs/summary.md` |
| grep-glob | tool | 通过 | 命中 `docs/deploy.md:3` |
| open-a-todolist | tool | 通过 | `todo_write` 三次更新贯穿 |
| skill-loading | tool | 通过 | `poteto-help` 通过 `read` 读取，给出能力清单（Q2） |
| task | tool | 通过 | 交 `readme-summarizer` 并带回摘要 |
| tool-absent-fallback | tool | 通过 | 说明拿不到聊天记录并给替代 |
| cloud-base-branch | delegation | 通过（替代） | 空仓且无 `create_worktree`，说明并给替代 |
| comment-sicko | delegation | 通过 | comment-sicko 只报告不改代码 |
| environment-cloud | delegation | 通过（替代） | 独立 git 仓库完成小改动 |
| environment-local | delegation | 通过 | 读 README 报标题 |
| file-attachments | delegation | 通过 | 子代理读两文件给一致性结论 |
| multi-phase-collaboration | delegation | 通过 | 两阶段两次交接，阶段二用阶段一产出 |
| parallel-delegation | delegation | 通过 | 三子代理并行并汇总成表 |
| poteto-agent | delegation | 通过 | poteto-agent 最小改动并回读验证 |
| readonly-false | delegation | 通过 | 子代理把 `a` 改为 2 |
| readonly-true | delegation | 通过 | 只读探查，未改文件 |
| resume | delegation | 通过 | `send_message` 续同一子代理 |
| run-in-background | delegation | 通过 | 两个子代理并行，汇总结果 |
| stop-subagent | delegation | 通过 | `pstack_interrupt` 成功中断并给停点（Q3） |
| subagent-general | delegation | 通过 | 子代理统计 3 个 Markdown 文件 |
| environment-browser-screenshot | environment | 通过 | 整页截图以 Markdown 内联渲染 |
| environment-desktop | environment | 通过 | 无桌面，CDP 驱动同源 Web 应用 |
| environment-forge-pr | environment | 通过 | 无 remote/gh，本地替代 |
| environment-session-search | environment | 通过 | 说明无历史并请用户补充 |
| environment-terminal | environment | 通过 | PTY 受限，转用宿主 Web 终端面板 |
| environment-worktree | environment | 通过 | 独立 worktree 给路径 |
| inherit-parent | routing | 通过 | 子代理继承父路由并自证 |
| model-discovery | routing | 通过 | 实测区分 advertised 与可用 |
| model-route | routing | 通过 | 选路由后实测回落并落实执行 |
| model-unavailable-fallback | routing | 通过 | `anthropic` 缺失，回落 minimax[high] |
| non-claude-route | routing | 通过 | 用 magpie/deepseek-v4.1-flash[low] |
| role-effort-domain | routing | 通过 | 确认档位后 `low` 提到 `high` |
| role-file | routing | 通过 | 读角色文件并派发（一次 `job_output` 误用，Q9） |
| role-panel-membership | routing | 通过 | 名单 2 条各跑 1 次即停（Q4） |
| role-value | routing | 通过 | 角色值拆三字段并生效 |
| skill-dependency-control-cli | skill-dependency | 通过 | `dsh` 退出 0，PTY 受限替代 |
| skill-dependency-control-ui | skill-dependency | 通过 | 真实点击，多张内联截图 |
| skill-dependency-create-skill | skill-dependency | 通过 | 产出合规 SKILL.md |
| skill-dependency-deslop | skill-dependency | 通过 | 无改动可清理，说明等价技能 |
| skill-dependency-loop | skill-dependency | 通过 | 三次巡检到 3 停止 |
| skill-dependency-no-comments | skill-dependency | 通过 | 独立审查只报告 |
| skill-dependency-technical-writing | skill-dependency | 通过 | 写快速开始小节 |
| skill-dependency-unslop | skill-dependency | 通过 | 去 AI 腔改写 |
| skill-dependency-visualize | skill-dependency | 通过 | 真实渲染柱状图 |

## 3. 问题问答

### Q1 adapted 全量用例因 `could not select preset poteto-mode` 全部 blocked（本轮已修）

- 类型：plugin（验证工具）
- 能力类别：environment
- 影响场景：全部 45 个
- 证据：
  - [run-batch 日志](../../.workers/adapted/base/batch.log)
  - 源码：[run-case.ts](../../scripts/run-case.ts)、[env.ts](../../scripts/lib/env.ts)、[prepare.ts](../../scripts/prepare.ts)
- 现象：首次 full 批次 45 个场景均在约 100 秒内产出 `verdict.status=inconclusive`、`reason="could not select preset poteto-mode"`，`session=null`、无截图。
- 根因：提交 `968af9d feat!: replace poteto root presets with a session workflow toggle` 移除了 `poteto-mode` 根预设，改为会话级开关 `dsh-pstack/poteto-toggle`（全局默认写在 `$DSH_HOME/pstack-settings.json` 的 `potetoDefault`）。playground 的 `run-case.ts` 仍按旧模型选 `poteto-mode` 预设并断言 `agentPreset`；同时 rc.2 预设菜单不再响应裸 `.click()`，只响应完整指针序列。
- 与当前阶段 dsh.md 的关系：不是 `port/dsh.md` 文案问题，是验证工具未跟随实现重构。
- 建议动作：adapted 用内置 `standard` 预设，并在 worker home 写 `pstack-settings.json` 打开 poteto 开关；`selectPreset` 在已是目标预设时直接返回，切换时用指针序列打开菜单。
- 你的决定：已修。`run-case.ts` 的 `expectedPreset` 改为 `standard` 且 `selectPreset` 幂等加指针序列；`env.ts` 新增 `writePstackSettings`，`prepare.ts` 对 adapted 写 `potetoDefault: true`。单场景验证后 full 重跑通过。

### Q2 `skill-loading` 用 `read` 读取上游技能不被算作加载（已按决定修改）

- 类型：plugin（场景）
- 能力类别：tool
- 影响场景：`capability-skill-loading`
- 证据：
  - [record](scenarios/capability-skill-loading/adapted-base/record.json)
  - [截图](scenarios/capability-skill-loading/adapted-base/screenshot.png)
- 现象：原断言 `skill-loaded: poteto-help` 失败；模型通过 `read` 读取 `poteto-help/SKILL.md` 后给出能力清单。
- 根因：帮助技能既可以经 `skill` 工具加载，也可以直接 `read` 其 `SKILL.md`，两者都是正确方式；原断言只认 `skill` 工具，把 `read` 路径判成失败。
- 与当前阶段 dsh.md 的关系：`port/dsh.md` 第 14 行已写明两条路径，`够用`。
- 建议动作：去掉 `skill-loaded` 硬断言，rubric 改成相位中立、同时接受 `skill` 与 `read`，只把「完全没有帮助内容或无关」算缺口。base 与 adapted 都适用。
- 你的决定：已改场景并单独重跑，机械失败 0，判定通过。

### Q3 `stop-subagent` 记录采到子代理会话，且应观察 `pstack_interrupt`（已按决定修改）

- 类型：plugin（验证工具 + 场景）
- 能力类别：delegation
- 影响场景：`capability-stop-subagent`
- 证据：
  - [record](scenarios/capability-stop-subagent/adapted-base/record.json)
  - [截图](scenarios/capability-stop-subagent/adapted-base/screenshot.png)
  - 源码：[run-case.ts](../../scripts/run-case.ts)、[evidence.ts](../../scripts/lib/evidence.ts)
- 现象：首轮记录 `agentPreset=poteto-agent`、202 次工具调用，是子代理会话，不是主会话。
- 根因：`findMatchingSession` 按首条用户消息匹配，子代理 prompt 与主 prompt 高度相似会命中子会话；此外原生 `interrupt_agent` 默认被运行时禁用，适配阶段应观察 `pstack_interrupt`。
- 与当前阶段 dsh.md 的关系：`port/dsh.md` 第 81 行已写明 `pstack_interrupt` 是中断路径，`够用`。
- 建议动作：`findMatchingSession` 只匹配根会话（用 `session` 头部的 `origin`/`delegationDepth` 过滤）；场景首轮要求交给执行者后立即结束本轮。次轮提示保持与环境无关，写「用你能用的中断手段」，因为 base 没有 `pstack_interrupt`，只有 adapted 才有；rubric 写明 adapted 走 `pstack_interrupt`、原生环境走 `interrupt_agent`。
- 你的决定：已修 `SessionEvent` 与 `findMatchingSession`，场景首轮要求立即结束本轮，次轮用与环境无关的中断提示，rubric 改为相位中立。重跑记录采到根会话（`agentPreset=standard`），模型在 adapted 环境自行选择了 `pstack_interrupt` 并成功中断，回复给出停点与后续，判定通过。

### Q4 `role-panel-membership` 缺收敛条件（已按决定修改）

- 类型：plugin（场景）
- 能力类别：routing
- 影响场景：`capability-role-panel-membership`
- 证据：
  - [record](scenarios/capability-role-panel-membership/adapted-base/record.json)
  - [截图](scenarios/capability-role-panel-membership/adapted-base/screenshot.png)
- 现象：原场景无明确终点，模型反复验证席位，约 20 分钟未收敛，被外部停止。
- 根因：场景缺少可判定的完成条件，模型倾向追加额外验证。
- 与当前阶段 dsh.md 的关系：不涉及 `port/dsh.md`。
- 建议动作：加「按名单条目各跑一次，跑满名单长度立即停止，不追加验证、不换人」。
- 你的决定：已改场景并重跑，模型从 `interrogate reviewers` 名单取 2 条各跑 1 次即停，实际使用 minimax[high] 与 deepseek-v4.1[low]，判定通过。

### Q5 `pstack_models` 列出 advertised 但实际不可用的路由（已按决定改措辞）

- 类型：dsh-md
- 能力类别：routing
- 影响场景：`capability-model-discovery`、`capability-model-route`、`capability-non-claude-route`
- 证据：
  - [model-discovery record](scenarios/capability-model-discovery/adapted-base/record.json)
  - [model-route record](scenarios/capability-model-route/adapted-base/record.json)
- 现象：`pstack_models` 列出 `deepseek-account/deepseek-flash`、`deepseek-account/deepseek-v4-pro`，实测全部 402 `ACCOUNT_QUOTA`；`deepseek-official` 未声明模型、启动即失败。
- 根因：`pstack_models` 只报 advertised 路由，不探活。原 `port/dsh.md` 第 82 行写「routes this deployment serves」偏乐观。
- 与当前阶段 dsh.md 的关系：原文存在`误导`。
- 建议动作：改措辞为 advertised 并说明可用性以实际调用为准。
- 你的决定：已改 `port/dsh.md` 与 `port/dsh.zh.md` 的 `pstack_models` 行，中文删掉括号里的 advertised、与英文一致，重新生成并 build；按你的判断该用例本来不算问题，不重跑。

### Q6 `deepseek-account` / `deepseek-official` 在本 Session 被禁

- 类型：ignore-environment
- 能力类别：routing
- 影响场景：`capability-non-claude-route`、`capability-model-discovery`
- 证据：[non-claude-route record](scenarios/capability-non-claude-route/adapted-base/record.json)
- 现象：`list_subagent_models` 对 `deepseek-account`/`deepseek-official` 返回 `LLM provider ... is not allowed for this Session`；模型改用 `magpie/workbuddy/deepseek-v4.1-flash[low]` 并完成。
- 根因：worker 会话的 provider 白名单不含这两个 provider。
- 与当前阶段 dsh.md 的关系：环境限制，不改文档。
- 建议动作：记为 ignore-environment。
- 你的决定：接受。

### Q7 `plugin_manager` 提权被拒

- 类型：ignore-environment
- 能力类别：skill-dependency
- 影响场景：`capability-skill-dependency-deslop`、`capability-skill-dependency-technical-writing`、`capability-tool-absent-fallback`
- 证据：[deslop record](scenarios/capability-skill-dependency-deslop/adapted-base/record.json)、[technical-writing record](scenarios/capability-skill-dependency-technical-writing/adapted-base/record.json)
- 现象：`plugin_manager` 报 `the user rejected escalating this plugin management operation to "danger-full-access"`，模型改用 vendored 技能或说明替代。
- 根因：worker 沙箱 spot 权限，属预期限制。
- 建议动作：记为 ignore-environment。
- 你的决定：接受。

### Q8 无 PTY、无桌面、无 remote、无 `create_worktree`

- 类型：ignore-environment
- 能力类别：environment
- 影响场景：`environment-terminal`、`skill-dependency-control-cli`、`environment-desktop`、`environment-forge-pr`、`cloud-base-branch`、`environment-cloud`
- 证据：[terminal record](scenarios/capability-environment-terminal/adapted-base/record.json)、[desktop record](scenarios/capability-environment-desktop/adapted-base/record.json)、[forge-pr record](scenarios/capability-environment-forge-pr/adapted-base/record.json)
- 现象：`/dev/pts` 只读、`ptmxmode=000`，PTY 不可用；无 `DISPLAY`/Wayland；无 remote/gh 凭据；工具集无 `create_worktree`。模型分别用宿主 Web 终端、同源 Web 应用、本地替代、隔离 git 仓库完成，均符合 rubric。
- 根因：worker 运行环境限制。
- 建议动作：记为 ignore-environment。
- 你的决定：接受。

### Q9 `job_output` 被误用于子代理（历史回归）

- 类型：dsh-md（已覆盖）
- 能力类别：routing
- 影响场景：`capability-role-file`
- 证据：[role-file record](scenarios/capability-role-file/adapted-base/record.json)
- 现象：`job_output -> Error: unknown job x`，1 次失败，未重试。
- 根因：`port/dsh.md` 第 80 行已写明「A subagent is not a background job: never pass its name to `job_output`」，模型仍误用。
- 与当前阶段 dsh.md 的关系：已覆盖，`够用`；属模型未遵循。
- 建议动作：文档已覆盖，单个场景 1 次误用，不强化场景、不改文档。
- 你的决定：忽略，不重跑。

## 4. dsh.md 适配说明审查（port/dsh.md）

| 章节/行 | 当前说明 | 相关证据 | 结论 | 建议 |
| --- | --- | --- | --- | --- |
| Tools / `Task` → `pstack_subagent` | 一次一个子代理；传 `provider`/`model`/`reasoning_effort` 或继承 | parallel、file-attachments、model-route | 够用 | 无 |
| Tools / skill 工具 | 用原生 `skill` 加载；帮助技能 `poteto-help`；隐藏技能用 `read` 读 SKILL.md | skill-loading | 够用 | Q2 已确认 `read` 路径正确 |
| Tools / `ask_user_question` | 批量问题，仅 root 有人答 | askquestion | 够用 | 无 |
| Tools / `todo_write` | 无 skipped，跳过写进 content | open-a-todolist | 够用 | 无 |
| Tools / `grep`+`glob` | 原生工具直接调用 | grep-glob | 够用 | 无 |
| Subagent fields / 各字段 | `agent_preset`、`cwd`、`resume`、`file_attachments` 映射 | readonly-false/true、resume、file-attachments | 够用 | 无 |
| Models / 路由拆分与 `reasoning_effort` | 结构化路由对象；不拆 `provider/model` 串；不支持的档位要显式传 | model-discovery、role-effort-domain、role-file | 够用 | role-panel 曾误串 provider/model，已随场景收敛 |
| Models / 角色文件 | `$DSH_HOME/pstack-models.json`，用 `pstack_roles` 映射 | role-file、role-value | 够用 | 无 |
| Plugin tools / `pstack_models` | 列出 advertised 路由，可用性以实际调用为准 | model-discovery、model-route | 够用 | Q5 已改措辞 |
| Plugin tools / `pstack_subagent` | 完成走通知，禁止 `job_output` | role-file | 够用 | 模型仍偶发误用（Q9） |
| Plugin tools / `pstack_interrupt` | pstack 子代理的中断路径 | stop-subagent | 够用 | 已实测成功中断 |
| setup-pstack | 写 `version:2 roles` 覆盖文件幂等 | role-value | 够用 | 本轮未触及沙箱写限制 |
| Paths / transcripts | `$DSH_HOME/sessions/<workspace-key>/<session>.jsonl` | environment-session-search | 够用 | 无 |
| Cursor-only features | 写 `Skipped in DeepSeek Harness:` 行继续 | cloud-base-branch、forge-pr、poteto-agent | 够用 | 无 |
| Local replacements / `control-ui`、`control-cli` | 用 vendored 指令技能 | control-ui、control-cli、terminal | 够用 | 无 |
| 渲染能力（无对应章节） | 未描述 output-render | 本轮无 adapted 渲染探针 | 不适用 | 若验收渲染需补探针 |

## 5. 待用户判断

1. 是否给 `output-render` 补 adapted 渲染探针（7 个 `render-*` 目前只在 raw）。
2. 截图脱敏：多张整页截图（如 `environment-browser-screenshot`、`skill-dependency-visualize`、`skill-dependency-control-ui`）的侧栏含账号显示名，提交前需人工确认或裁剪。
3. `askquestion` 的自动答题选中了「只做功能」，而场景配置为「连测试一起做」，属 playground 选项选择逻辑，不影响本 rubric（有卡片且采纳），是否修由你决定。

## 6. 后续动作

- `dsh-md`：Q5 已改 `port/dsh.md` 与 `port/dsh.zh.md` 的 `pstack_models` 措辞，重新生成并 build，`generate:check` 通过。
- `plugin`：Q1 已修 playground（`standard` 预设 + `pstack-settings.json` 打开 poteto 开关 + 幂等选预设）；Q3 已修会话匹配只取根会话并改场景；Q2、Q4 已改场景并重跑。
- `upstream`：无。
- `ignore-environment`：Q6 provider 白名单、Q7 `plugin_manager` 权限、Q8 无 PTY/桌面/remote/`create_worktree`。
- 结论计数：通过 45，inconclusive 0，capability gap 0。
