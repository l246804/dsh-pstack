# native 证据分析

## 结论

native `base` 的四个场景中，三个仍是 `gap`，一个被判定为 `observed`；`render` 只运行 `inline-video-playback`，结果为 `observed`，没有 `blocked`。

`inline-video-playback` 的原生缺口成立，但 `dsh-genui` 能补足视频内联播放，因此它属于“原生客户端的预期降级 + 可选插件补齐”，不是要求重写客户端。`subagent-model-routing` 的原缺口被 `workflow` 的逐子代理路由覆盖推翻。`subagent-readonly-sandbox` 和 `subagent-interrupt` 仍是需要插件解决的 native 缺口。

## 范围与判据

- 快照：[base](../runs/native-base/) 覆盖 4 个场景；[render](../runs/native-render/) 只覆盖 `inline-video-playback`，加载 `dsh-genui` 0.3.3。`inline-video-playback` 增加 render 环境后场景 hash 变化，已增量重跑。
- 版本：两个环境均为 DSH `0.2.2-rc.4`、pstack `0.15.43`、上游 revision `2f87c854fe3e2fcda44ca86b46ede35aad3c46b7`。
- 运行身份：全部记录使用 `magpie / workbuddy/minimax-m3.1-flash / low`，preset 为 `standard`。
- 判定：机械断言是下限；语义结论来自 rubric、截图和本地 session。记录初始为 `verdict=unobserved`、`semanticReview=pending`，本分析写入 `review.json` 后由 `playground:review --apply` 回写。
- 场景边界：`inline-video-playback` 当前声明 `variants: ["native"]`，adapted 不运行；render 是 native 的可选插件环境，不是 adapted。

## 场景结果

| 场景 | 环境 | 机械断言 | 语义结论 | 关键观察 |
| --- | --- | --- | --- | --- |
| `inline-video-playback` | base | 通过 | `gap` | 回复说明做不到内嵌播放；只有文字和文件卡片。 |
| `inline-video-playback` | render | 通过 | `observed` | 出现加载 `sample.mp4` 的真实视频播放器。 |
| `subagent-interrupt` | base | 通过 | `gap` | `started.txt` 存在、`done.txt` 不存在；但停止来自子代理自行 `job_kill`，不是系统级中断。 |
| `subagent-model-routing` | base | 通过 | `observed` | `subagent` 显式换路由被拒绝；`workflow` 的逐子代理路由覆盖完成分拣，三个产物齐全。 |
| `subagent-readonly-sandbox` | base | 失败（出现 `readonly-probe.txt`） | `gap` | 只读子代理成功创建文件，`review.md` 记录 `ALLOWED`。 |

base 汇总为 3 个 `gap`、1 个 `observed`；render 为 1 个 `observed`。

## 问题

### `inline-video-playback`：原生缺失，`dsh-genui` 可补齐

- 证据：[base record](../runs/native-base/scenarios/inline-video-playback/native-base/record.json) / [base screenshot](../runs/native-base/scenarios/inline-video-playback/native-base/screenshot.png) / [render record](../runs/native-render/scenarios/inline-video-playback/native-render/record.json) / [render screenshot](../runs/native-render/scenarios/inline-video-playback/native-render/screenshot.png)
- 现象：base 下模型检查 Web 前端后确认聊天区只内联图片，Markdown `html` 节点按纯文本输出，`present` 只给文件卡片。render 下模型用 `schemaJson` 输出 `video` 组件，截图显示播放器已加载视频并显示首帧。
- 根因：原生 DSH Web 客户端没有视频内联渲染通道；`dsh-genui` 提供 `video` 组件的客户端渲染。两次运行使用同一 DSH 版本、同一模型、同一场景，差异只有 render 插件。
- 文档影响：[native/dsh.md](../../../native/dsh.md) 没有输出呈现章节，未说明图片、SVG、音频、视频的内联边界，也未说明可选插件可以补足视频呈现。
- 边界：这是 native 客户端的预期降级，不需要 adapted 再证明；后续只需确认 `dsh-genui` 的插件定位和文档呈现方式。

### `subagent-model-routing`：`workflow` 路由可达，原缺口被推翻

- 证据：[record.json](../runs/native-base/scenarios/subagent-model-routing/native-base/record.json) / [screenshot.png](../runs/native-base/scenarios/subagent-model-routing/native-base/screenshot.png)
- 现象：模型先用 `subagent` 显式传 `provider/model`，运行时报 `child LLM route "magpie/workbuddy/deepseek-v4.1-flash" is not allowed for this Session`。改用 `workflow` 的逐子代理 `provider`/`model` 覆盖后，子代理实际路由到 `magpie/workbuddy/deepseek-v4.1-flash`，产出 `urgent.md`、`later.md`、`done.txt`；子代理 session 的 `request/header` 记录真实路由，不是主线程代做。
- 根因：`subagent` 工具的显式模型选择受会话策略限制，但 `workflow` 工具的 `agent()` 钩子提供独立的 provider/model 覆盖。结果是能力可达，`subagent-model-routing` 不再成立为缺口。
- 文档影响：[native/dsh.md](../../../native/dsh.md) 的 Models 行只描述 `subagent` 的参数，没有说明 `workflow` 的逐子代理路由覆盖，这是文档缺口而非能力缺口。
- 场景维护：`done.txt` 的文本断言已改为 `artifact-exists`，避免把“已写完”误判为失败。

### `subagent-readonly-sandbox`：只读沙箱未强制

- 证据：[record.json](../runs/native-base/scenarios/subagent-readonly-sandbox/native-base/record.json) / [screenshot.png](../runs/native-base/scenarios/subagent-readonly-sandbox/native-base/screenshot.png)
- 现象：只读子代理 `readonly-reviewer` 成功创建 `readonly-probe.txt`（5 字节），工具返回创建成功，没有沙箱拒绝；子代理报告 `READ-ONLY NOT ENFORCED`，主线程整理进 `review.md`，工作区保留该文件。
- 根因：`subagent` 没有 sandbox 参数，子代理继承父会话的 `workspace-write` 权限；提示词里的“只读”只是文字约束，没有结构性围栏。
- 文档影响：[native/dsh.md](../../../native/dsh.md) 的 `readonly: true` 行已说明没有 sandbox 参数、依赖会话权限和事后 `git status`，与实测一致。

### `subagent-interrupt`：只有自愿停手，没有系统级取消

- 证据：[record.json](../runs/native-base/scenarios/subagent-interrupt/native-base/record.json) / [screenshot.png](../runs/native-base/scenarios/subagent-interrupt/native-base/screenshot.png)
- 现象：子代理 `slow-runner` 写入 `started.txt`；主会话三次 `job_kill` 均失败（`unknown job`、跨会话 `belongs to another session`），随后通过 `send_message` 要求子代理自行终止。子代理在自己的会话里调用 `job_kill`，作业状态为 `killed, signal: SIGTERM`，扫描 `/proc` 未发现残留进程，`done.txt` 不存在。
- 根因：标准模式把 `tool-subagent-control` 的 `interrupt` 设为 `false`，模型拿不到 `interrupt_agent`；主会话无法定向停止子代理，只能发消息让子代理自愿停手。若子代理不配合或已卡死，没有系统级兜底。
- 文档影响：[native/dsh.md](../../../native/dsh.md) 的 `resume` 行已写明 `interrupt_agent` 在内置 preset 中被关闭，应视为不可用，与实测一致。

## 文档审查

审查对象是 [native/dsh.md](../../../native/dsh.md)；以下结论按主题归档，不依赖行号。

| 主题 | 判定 | 依据 |
| --- | --- | --- |
| `readonly: true` | 够用 | 明确写了没有 sandbox 参数、依赖会话权限、事后检查 `git status`；实测只读未强制。 |
| `resume` / `interrupt_agent` | 够用 | 明确写了内置 preset 关闭中断；实测主会话没有中断工具。 |
| Models | 缺失 | 只描述 `subagent` 的 provider/model 参数，没有说明会话策略拒绝和 `workflow` 的逐子代理路由覆盖。 |
| 输出呈现 | 缺失 | 没有 Output/Rendering 章节，未说明图片、SVG、音频、视频的内联边界；render 对照证明 `dsh-genui` 可补视频。 |
| pstack adapter 句子 | 不适用 | 这些句子描述 `pstack adapter`；native 不加载适配插件，native 读者按字面理解会产生歧义。 |

## 待确认

1. `subagent-model-routing` 是否按 `refuted` 处理。需要你确认后修改 [native/gaps.json](../../../native/gaps.json) 的状态和 reason，并把该场景转为 regression 或退役。
2. `inline-video-playback` 是否把 `dsh-genui` 写进 README 推荐插件，并在 `native/dsh.md` 增加输出呈现章节。
3. `native/dsh.md` 中 `pstack adapter` 的句子是否拆成 native/adapted 两份，或增加 variant 标注。

## 后续动作

| 方向 | 内容 |
| --- | --- |
| `dsh-md` | 增加 Output/Rendering 章节，说明 `dsh-genui` 可提供视频内联；在 Models 行补充 `workflow` 的逐子代理路由覆盖；处理 `pstack adapter` 的 native 歧义。 |
| `plugin` | 保留视频内联（可选 `dsh-genui`）、运行时只读沙箱和系统级子代理中断三个方向；`subagent-model-routing` 改判后不再作为 plugin 缺口。 |
| `upstream` | 无。 |
| `ignore-environment` | 无；`inline-video-playback` 已通过 render 对照验证，不按“DSH 客户端完全做不到”处理。 |
