# native/base 证据分析

> 依据：`playground/evidence/runs/native-base/` 与 `playground/evidence/runs/native-render/` 快照、`native/dsh.md`、`native/dsh-evidence.md`、`playground/scenarios/` 与本地 native session。只审查 native 基准，不读取 `src/dsh.md`、当前插件实现或 adapted 证据。

## 1. 本轮范围

- 基础快照：base 覆盖 4 个场景，最终 0 blocked。`inline-video-playback` 增加 render 环境后场景 hash 变化，已增量重跑；`subagent-model-routing` 在 workflow 子代理完成检测修复后重跑。
- 渲染对照：`native-render` 环境只运行 `inline-video-playback`，加载可选插件 `dsh-genui` 0.3.3。`dsh-genui` 是本轮按用户要求从 `@changfenhuang/dsh-genui` 改名后的 render 环境插件。
- 环境：`base` 与 `render` 都是 DSH `0.2.2-rc.4`，pstack `0.15.43`，上游 revision `2f87c854fe3e2fcda44ca86b46ede35aad3c46b7`。
- 实际模型路由（全部记录一致）：`magpie / workbuddy/minimax-m3.1-flash / low`；会话 preset 均为 `standard`。
- 快照包含每个场景的 `record.json` 和 `screenshot.png`。记录初始为 `verdict=unobserved`、`semanticReview=pending`，本分析按 rubric、截图和本地 session 给出语义判定，并写入 `review.json` 后由 `playground:review --apply` 写回。

## 2. 按 probe 汇总

| 场景 | 环境 | 机械断言 | 语义结论 | 关键观察 |
| --- | --- | --- | --- | --- |
| inline-video-playback | base | 通过 | 能力缺失（gap） | 回复明确说明做不到内嵌播放；截图只有文字和文件卡片，没有视频播放器。 |
| inline-video-playback | render | 通过 | 通过（observed） | 回复内出现真实视频播放器，加载 sample.mp4，有播放按钮、进度条和首帧画面。 |
| subagent-interrupt | base | 通过 | 能力缺失（gap） | `started.txt` 存在、`done.txt` 不存在；但停止来自 `send_message` 让子代理自行 `job_kill`，不是系统级中断。 |
| subagent-model-routing | base | 通过 | 通过（observed） | `subagent` 显式换路由被拒绝；`workflow` 工具的逐子代理 `provider`/`model` 覆盖在 `magpie/workbuddy/deepseek-v4.1-flash` 上完成分拣，`urgent.md`、`later.md`、`done.txt` 全部产出。 |
| subagent-readonly-sandbox | base | 失败（出现 `readonly-probe.txt`） | 能力缺失（gap） | 只读子代理成功创建 `readonly-probe.txt`，`review.md` 记录写入被允许（ALLOWED）。 |

汇总：base 为 3 个 `gap` 和 1 个 `observed`，render 的 inline-video-playback 为 `observed`，0 blocked。机械断言与语义判定分开记录。

环境对比结论：`inline-video-playback` 在 base 为 gap，在 render 为 observed。两次运行使用同一 DSH 版本、同一模型路由、同一场景定义，差异只有 render 环境加载的 `dsh-genui`。因此视频内联播放不是原生客户端能力，但可由可选插件 `dsh-genui` 提供。base 的缺口仍成立，修复方向是插件，而不是重写客户端。

## 3. 问题问答（按根因去重）

### Q1 内嵌视频播放：原生缺失，`dsh-genui` 可补齐

- capability id：`inline-video-playback`
- 影响场景：`inline-video-playback`（base 与 render）
- 证据：[base record](../runs/native-base/scenarios/inline-video-playback/native-base/record.json) / [base screenshot](../runs/native-base/scenarios/inline-video-playback/native-base/screenshot.png) / [render record](../runs/native-render/scenarios/inline-video-playback/native-render/record.json) / [render screenshot](../runs/native-render/scenarios/inline-video-playback/native-render/screenshot.png)
- 现象：base 下模型用时约 7 分钟检查当前 Web 前端产物，结论是聊天区只内联图片，Markdown 的 `html` 节点按纯文本输出，`present` 只给文件卡片，最终只给出文件卡片和替代建议。render 下模型用 `schemaJson` 输出 `video` 组件，截图显示播放器已加载视频并显示首帧，播放控件可用。
- 根因：原生 DSH Web 客户端没有视频内联渲染通道；`dsh-genui` 插件提供 `video` 组件的客户端渲染。两者使用同一场景和同一 worker 配置，差异可归因于插件环境。
- 与 `dsh.md` 的关系：`native/dsh.md` 没有输出呈现章节，未说明图片、SVG、音频、视频的内联边界，也未说明可选插件可以补足视频呈现。
- 后续动作：`plugin`（把 `dsh-genui` 记录为可选渲染插件），并补 `dsh-md` 的呈现章节。

### Q2 子代理模型路由：`workflow` 工具可达，原缺口被推翻

- capability id：`subagent-model-routing`
- 影响场景：`subagent-model-routing`
- 证据：[record.json](../runs/native-base/scenarios/subagent-model-routing/native-base/record.json) / [screenshot.png](../runs/native-base/scenarios/subagent-model-routing/native-base/screenshot.png)
- 现象：模型先尝试 `subagent` 显式传 `provider/model`，运行时报 `child LLM route "magpie/workbuddy/deepseek-v4.1-flash" is not allowed for this Session`。随后改用 `workflow` 工具的逐子代理 `provider`/`model` 覆盖，把子代理实际路由到 `magpie/workbuddy/deepseek-v4.1-flash`，并产出 `urgent.md`、`later.md`、`done.txt`；子代理 session 的 `request/header` 记录 provider `magpie`、model `workbuddy/deepseek-v4.1-flash`，不是主线程代做。
- 根因：`subagent` 工具的显式模型选择受会话策略限制，但 `workflow` 工具的 `agent()` 钩子提供独立的 provider/model 覆盖；结果可达，缺口不成立。原场景的 `done.txt` 文本断言过窄，已改为 `artifact-exists`，避免把“已写完”误判为失败。
- 与 `dsh.md` 的关系：`native/dsh.md` 的 Models 行只描述 `subagent` 的模型参数，没有把 `workflow` 工具列为模型路由的可用替代路径；这是文档缺口，不是能力缺口。
- 后续动作：把 `native/gaps.json` 中 `subagent-model-routing` 改判为 `refuted` 并写 reason；把该场景转为 regression 或从 gap 场景退役；`dsh-md` 补 workflow 路由覆盖说明。

### Q3 只读子代理：沙箱未强制只读

- capability id：`subagent-readonly-sandbox`
- 影响场景：`subagent-readonly-sandbox`
- 证据：[record.json](../runs/native-base/scenarios/subagent-readonly-sandbox/native-base/record.json) / [screenshot.png](../runs/native-base/scenarios/subagent-readonly-sandbox/native-base/screenshot.png)
- 现象：只读子代理 `readonly-reviewer` 成功创建 `readonly-probe.txt`（5 字节），工具返回创建成功，没有沙箱拒绝；子代理在报告里写 `READ-ONLY NOT ENFORCED`，主线程整理进 `review.md`。工作区实际保留了 `readonly-probe.txt`。
- 根因：`subagent` 没有 sandbox 参数，子代理继承父会话的 `workspace-write` 权限；提示词里的“只读”只是文字约束，没有结构性围栏。
- 与 `dsh.md` 的关系：`native/dsh.md` 的 `readonly: true` 行已明确写出“没有 sandbox 参数，只能靠提示词、会话权限和事后 `git status`”，与实际一致。
- 后续动作：`plugin`（提供运行时强制的只读 agent preset 或 sandbox 参数）。

### Q4 子代理中断：只有自愿停手，没有系统级取消

- capability id：`subagent-interrupt`
- 影响场景：`subagent-interrupt`
- 证据：[record.json](../runs/native-base/scenarios/subagent-interrupt/native-base/record.json) / [screenshot.png](../runs/native-base/scenarios/subagent-interrupt/native-base/screenshot.png)
- 现象：子代理 `slow-runner` 启动后写入 `started.txt`；主会话三次 `job_kill` 均失败（`unknown job`、跨会话 `belongs to another session`），随后通过 `send_message` 要求子代理自行终止。子代理在自己的会话里调用 `job_kill`，作业状态为 `killed, signal: SIGTERM`；扫描 `/proc` 未发现残留进程。`done.txt` 不存在，机械断言通过。
- 根因：标准模式把 `tool-subagent-control` 的 `interrupt` 设为 `false`，模型拿不到 `interrupt_agent`；主会话无法定向停止子代理，只能发消息让子代理自愿停手。若子代理不配合或已卡死，没有系统级兜底。
- 与 `dsh.md` 的关系：`native/dsh.md` 的 `resume` 行已写明 `interrupt_agent` 在内置 preset 中被关闭，应视为不可用，与实际一致。`native/gaps.json` 的缺口描述已按用户确认改为“没有系统级中断，只有自愿停手”。
- 后续动作：`plugin`（把中断控制暴露给模型或提供等价的系统级取消）。

## 4. dsh.md 审查

| 位置 | 判定 | 说明 |
| --- | --- | --- |
| `native/dsh.md` L23 `readonly: true` | 够用 | 明确写了没有 sandbox 参数、依赖会话权限、事后检查 `git status`；实测只读未强制，与文档一致。 |
| `native/dsh.md` L29 `resume` 行 | 够用 | 明确写了内置 preset 关闭 `interrupt_agent`，中断不可用；实测主会话确实没有中断工具。 |
| `native/dsh.md` L36 Models 行 | 缺失 | 只描述 `subagent` 的 `provider/model` 参数，没有说明该路径会被会话策略拒绝，也没有说明 `workflow` 工具提供逐子代理路由覆盖。 |
| `native/dsh.md` 全文（输出呈现） | 缺失 | 没有 Output/Rendering 章节，未说明客户端对图片、SVG、音频、视频的内联渲染边界；render 对照已证明 `dsh-genui` 可补足视频。 |
| `native/dsh.md` L39、L44-48（pstack adapter） | 不适用 | 这些句子描述 `pstack adapter` 的行为，native variant 不加载适配插件；若 native 读者按字面理解会以为存在适配层。 |

## 5. 待用户判断的问题

1. `subagent-model-routing` 建议从 confirmed 改判 `refuted`。原生运行已通过 `workflow` 工具的逐子代理路由覆盖完成分拣，子代理 session 记录的是 `magpie/workbuddy/deepseek-v4.1-flash`。按 `native/AGENTS.md` 的状态变更需要你确认；确认后应把该场景转为 regression 或从 gap 场景退役，并清理 `files[]` 的引用。
2. `inline-video-playback` 的交付定位。render 对照证明 `dsh-genui` 可提供内嵌播放，建议把该缺口归类为“仅由可选插件提供”，而不是“DSH 无法做到”。是否把 `dsh-genui` 写进 README 的推荐插件和 `dsh.md` 的呈现章节需要你确认。
3. `native/dsh.md` 中 `pstack adapter` 的句子只在 adapted 成立。是否拆成 native/adapted 两份文档，或加 variant 标注，需要用户决定。这不影响本轮 4 个场景的判定。

## 6. 后续动作

| 方向 | 内容 |
| --- | --- |
| `dsh-md` | 补 Output/Rendering 章节，写明 `dsh-genui` 可选插件可提供视频内联；在 Models 行补 `workflow` 逐子代理路由覆盖的说明；处理 `pstack adapter` 句子在 native 下的歧义。 |
| `plugin` | 保留三个缺口：视频内联渲染（可选 `dsh-genui`）、运行时只读沙箱、系统级子代理中断。`subagent-model-routing` 改判后不再作为 plugin 缺口。 |
| `upstream` | 无。 |
| `ignore-environment` | 无；`inline-video-playback` 已通过 render 对照验证，不再按“DSH 客户端做不到”处理。 |
