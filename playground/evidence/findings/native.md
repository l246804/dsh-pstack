# native 证据分析

## 结论

native `base` 的四个场景均为 `gap`；`render` 只运行 `inline-video-playback`，结果为 `observed`，没有 `blocked`。

`inline-video-playback` 属于原生客户端的预期降级，render 证明可选插件可以提供视频内联，但不推荐三方插件，也不为这个预期降级补充 `native/dsh.md`。`subagent-model-routing` 仍未闭合：`workflow` 的逐子代理路由只是可达的绕过路径，正规的 `subagent` 派发仍缺少插件提供的工具。`subagent-readonly-sandbox` 和 `subagent-interrupt` 同样需要插件解决。

## 范围与判据

- 快照：[base](../runs/native-base/) 覆盖 4 个场景；[render](../runs/native-render/) 只覆盖 `inline-video-playback`，加载可选渲染插件 `dsh-genui`。两份 `inline-video-playback` record 的 `scenarioHash` 仍是旧值，结论对应当时场景；验证当前定义时需要重跑，不构成发布门禁。
- 版本：两个环境均为 DSH `0.2.2-rc.4`、pstack `0.15.43`、上游 revision `2f87c854fe3e2fcda44ca86b46ede35aad3c46b7`。
- 运行身份：全部记录使用 `magpie / workbuddy/minimax-m3.1-flash / low`，preset 为 `standard`。
- 判定：机械断言是下限；语义结论来自 rubric、截图和本地 session。记录初始为 `verdict=unobserved`、`semanticReview=pending`，本分析写入 `review.json` 后由 `playground:review --apply` 回写。
- 场景边界：`inline-video-playback` 当前声明 `variants: ["native"]`，adapted 不运行；render 是 native 的可选插件环境，不是 adapted。

## 场景结果

| 场景 | 环境 | 机械断言 | 语义结论 | 关键观察 |
| --- | --- | --- | --- | --- |
| `inline-video-playback` | base | 失败（assistant reply lacks `sample.mp4`） | `gap` | 回复说明做不到内嵌播放；只有文字和文件卡片。 |
| `inline-video-playback` | render | 通过 | `observed` | 出现加载 `sample.mp4` 的真实视频播放器。 |
| `subagent-interrupt` | base | 通过 | `gap` | `started.txt` 存在、`done.txt` 不存在；但停止来自子代理自行 `job_kill`，不是系统级中断。 |
| `subagent-model-routing` | base | 通过 | `gap` | `subagent` 显式换路由被拒绝；`workflow` 的逐子代理路由覆盖完成分拣，但这是绕过路径，不是正规的 subagent 派发方式。 |
| `subagent-readonly-sandbox` | base | 失败（出现 `readonly-probe.txt`） | `gap` | 只读子代理成功创建文件，`review.md` 记录 `ALLOWED`。 |

base 汇总为 4 个 `gap`；render 为 1 个 `observed`。

## dsh.md 审查

审查对象是 [native/dsh.md](../../../native/dsh.md)；结论按主题归档，不依赖行号。

| 主题 | 判定 | 依据 | 关联问答 |
| --- | --- | --- | --- |
| `readonly: true` | 够用 | 明确写了没有 sandbox 参数、依赖会话权限、事后检查 `git status`；实测只读未强制。 | Q3 |
| `resume` / `interrupt_agent` | 够用 | 明确写了内置 preset 关闭中断；实测主会话没有中断工具。 | Q4 |
| Models | 缺失 | 只描述 `subagent` 的 provider/model 参数，没有说明模型路由受会话策略限制，也没有说明正规的 subagent 派发需要插件提供路由工具。 | Q2 |
| 输出呈现 | 不适用 | native 客户端预期以文件卡片呈现视频；这是预期降级，`native/dsh.md` 不承担可选渲染说明，render 只作为对照。 | Q1 |

## 问题与建议

### `inline-video-playback`：原生缺失，按预期降级处理

- 证据：[base record](../runs/native-base/scenarios/inline-video-playback/native-base/record.json) / [base screenshot](../runs/native-base/scenarios/inline-video-playback/native-base/screenshot.png) / [render record](../runs/native-render/scenarios/inline-video-playback/native-render/record.json) / [render screenshot](../runs/native-render/scenarios/inline-video-playback/native-render/screenshot.png)
- 现象：base 下模型检查 Web 前端后确认聊天区只内联图片，Markdown `html` 节点按纯文本输出，`present` 只给文件卡片。render 下模型用 `schemaJson` 输出 `video` 组件，截图显示播放器已加载视频并显示首帧。
- 根因：原生 DSH Web 客户端没有视频内联渲染通道；render 环境加载的可选插件提供 `video` 组件的客户端渲染。两次运行使用同一 DSH 版本、同一模型、同一场景，差异只有 render 插件。
- 建议：保持 `inline-video-playback` 的 native-only gap；不补 `native/dsh.md` 的呈现章节，不推荐三方插件。render 只作为预期降级的对照证据。
- 已确认：按预期降级处理，不补 `dsh.md`，不推荐三方插件。

### `subagent-model-routing`：`workflow` 路由可达，正规 subagent 路由仍缺失

- 证据：[record.json](../runs/native-base/scenarios/subagent-model-routing/native-base/record.json) / [screenshot.png](../runs/native-base/scenarios/subagent-model-routing/native-base/screenshot.png)
- 现象：模型先用 `subagent` 显式传 `provider/model`，运行时报 `child LLM route "magpie/workbuddy/deepseek-v4.1-flash" is not allowed for this Session`。改用 `workflow` 的逐子代理 `provider`/`model` 覆盖后，子代理实际路由到 `magpie/workbuddy/deepseek-v4.1-flash`，产出 `urgent.md`、`later.md`、`done.txt`；子代理 session 的 `request/header` 记录真实路由，不是主线程代做。
- 根因：`subagent` 工具的显式模型选择受会话策略限制；`workflow` 的 `agent()` 钩子能落到该路由，但这是绕过路径，不是正规的 subagent 派发方式，因此不能据此判定能力已补齐。
- 建议：保留 `subagent-model-routing` 为 confirmed gap，由插件提供 subagent 派发的模型路由工具；不要把该场景转为 regression 或退役。
- 已确认：由插件内提供工具解决，workflow 不作为正规替代路径。

### `subagent-readonly-sandbox`：只读沙箱未强制

- 证据：[record.json](../runs/native-base/scenarios/subagent-readonly-sandbox/native-base/record.json) / [screenshot.png](../runs/native-base/scenarios/subagent-readonly-sandbox/native-base/screenshot.png)
- 现象：只读子代理 `readonly-reviewer` 成功创建 `readonly-probe.txt`（5 字节），工具返回创建成功，没有沙箱拒绝；子代理报告 `READ-ONLY NOT ENFORCED`，主线程整理进 `review.md`，工作区保留该文件。
- 根因：`subagent` 没有 sandbox 参数，子代理继承父会话的 `workspace-write` 权限；提示词里的“只读”只是文字约束，没有结构性围栏。
- 建议：保留为 native `gap`，由插件提供运行时强制的只读 agent preset 或 sandbox 参数。
- 已确认：由插件内提供子代理只读环境。

### `subagent-interrupt`：只有自愿停手，没有系统级取消

- 证据：[record.json](../runs/native-base/scenarios/subagent-interrupt/native-base/record.json) / [screenshot.png](../runs/native-base/scenarios/subagent-interrupt/native-base/screenshot.png)
- 现象：子代理 `slow-runner` 写入 `started.txt`；主会话调用 `job_kill` 返回 `unknown job runner`，随后通过 `send_message` 要求子代理自行终止。子代理在自己的会话里调用 `job_kill`，扫描 `/proc` 未发现残留进程，`done.txt` 不存在。
- 根因：标准模式把 `tool-subagent-control` 的 `interrupt` 设为 `false`，模型拿不到 `interrupt_agent`；主会话无法定向停止子代理，只能发消息让子代理自愿停手。若子代理不配合或已卡死，没有系统级兜底。
- 建议：保留为 native `gap`，由插件提供系统级子代理中断能力。
- 已确认：将系统级中断列入插件实现范围。
