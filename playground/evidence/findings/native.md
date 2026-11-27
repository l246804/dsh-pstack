# native 证据分析

## 结论

native `base` 的四个场景仍为 `gap`；`render` 只运行 `inline-video-playback`，结果为 `observed`。本轮是 DSH `0.2.3-alpha.2` 基线上的证据刷新：四条缺口全部复现，没有一条被新机制闭合，也没有新增缺口。

两处证据形态变了，判定没变：

- `inline-video-playback` base 的机械断言本轮通过，但截图里没有任何播放器。回复只在解释"做不到"时写到了 `sample.mp4` 路径，断言因此被踩中。这是误报，rubric 仍然是未通过。
- `subagent-interrupt` 本轮出现了 `done.txt`。上一轮是子代理自愿停手让断言通过；这一轮消息取消在子代理前台阻塞时根本没有送达，子代理跑完并写出 `done.txt`，失败模式比上一轮更彻底。

`dsh.md` 的 Models 行本轮先判「误导」，经用户确认后改写为三态写法，现在判「够用」。改写前的依据是 `0.2.3-alpha.2` 的 standard preset 同时打开 `modelSelection` 与 `modelDiscovery`，模型能看到 `provider`/`model` 参数、也能调用 `list_subagent_models`，但宿主设置默认关闭显式路由，委派照样被拒；旧文本把「委派工具开启模型选择」当成唯一门，实测和它相反。

## 范围与判据

- 快照：[base](../runs/native-base/) 为 full 批次 `native-base-20261127095521`，覆盖 4 个场景；[render](../runs/native-render/) 为 incremental 批次 `native-render-20261127101833`，只覆盖 `inline-video-playback`，加载可选渲染插件 `dsh-genui`。
- 版本：两个环境均为 DSH `0.2.3-alpha.2`、pstack `0.15.48`、上游 revision `9e278fe4d4ecd8bfe98b1b79bf4be662efb338cc`，与 `engines.dsh` 和 `native/upstream.lock.json` 一致。上一轮记录的 `0.2.2-rc.4`、`0.15.43`、`2f87c85` 已被替换。
- 场景对应：[`inline-video-playback`](../../scenarios/inline-video-playback.ts)、[`subagent-interrupt`](../../scenarios/subagent-interrupt.ts)、[`subagent-model-routing`](../../scenarios/subagent-model-routing.ts)、[`subagent-readonly-sandbox`](../../scenarios/subagent-readonly-sandbox.ts)。判定时五份 record 的 `scenarioHash` 与当时的场景定义逐条一致，上一轮"hash 仍是旧值"的保留意见撤回。
- 判定后的场景改动：`inline-video-playback` 删除了会误报的 `assistant-contains "sample.mp4"`，只保留 `turn-completed`。改后 hash 为 `5f6fc275…`，两份 record 仍持改前的 `802bf99e…`；按用户决定不重跑，两次判定的 rubric、prompt、workspace 均未变，只差这一条机械断言，结论不受影响。下一次运行会刷新 hash。
- 运行身份：全部记录使用 `magpie / workbuddy/minimax-m3.1-flash / low`，preset 为 `standard`。审查路由沿用上一轮 `magpie / workbuddy/deepseek-v4.1-flash / low`。
- 判定：记录初始为 `verdict=unobserved`、`semanticReview=pending`。机械断言是下限，语义结论按 rubric、截图和记录内工具轨迹判定；本分析写入 `review.json` 后由 `playground:review --apply` 回写。
- 场景边界：`inline-video-playback` 声明 `variants: ["native"]`，adapted 不运行；render 是 native 的可选插件环境，不是 adapted。
- 记录形态：`configHash` 与 `adaptedVersion` 已由 `4e67d8a` 移除，两份 native manifest 不再携带，这是当前字段集而不是缺失。

## 场景结果

| 场景 | 环境 | 机械断言 | 语义结论 | 关键观察 |
| --- | --- | --- | --- | --- |
| `inline-video-playback` | base | 通过 | `gap` | 截图只有文字与排查过程，没有播放器；`sample.mp4` 只作为路径出现，断言通过属误报。 |
| `inline-video-playback` | render | 通过 | `observed` | 截图内嵌真实播放器，加载 `sample.mp4`，显示首帧、`0:00 / 0:05` 与完整控件。 |
| `subagent-interrupt` | base | 失败（出现 `done.txt`） | `gap` | `started.txt` 与 `done.txt` 都存在；子智能体面板显示该子代理已完成。 |
| `subagent-model-routing` | base | 通过 | `gap` | `subagent` 两次显式换路由被运行时拒绝；实际换到异路由的是 `workflow` 派出的子代理。 |
| `subagent-readonly-sandbox` | base | 失败（出现 `readonly-probe.txt`） | `gap` | 只读子代理创建文件返回 `Created file`，没有沙箱拒绝；主线程把它整理进 `review.md`。 |

base 汇总为 4 个 `gap`；render 为 1 个 `observed`。

## dsh.md 审查

审查对象是 [native/dsh.md](../../../native/dsh.md)；结论按主题归档，不依赖行号。

| 主题 | 判定 | 依据 |
| --- | --- | --- |
| `readonly: true` | 够用 | 写明没有 sandbox 参数、依赖会话权限、事后查 `git status`；实测只读未强制，与文档描述一致。 |
| `resume` / `interrupt_agent` | 够用 | 写明内置 preset 关闭中断、按不可用处理；实测模型没有中断工具，只能 `send_message`，且阻塞时消息不送达。 |
| Models | 够用 | 改写后写清三态：工具未启用模型选择时没有参数；工具启用但宿主设置关闭时调用被拒、子代理留在父级路由；只有宿主允许的路由才生效。改写前把工具开关当成唯一门，本轮 native 运行照它走，两次被拒、整轮 62 次调用后才绕到 `workflow`。事实依据在 `dsh-evidence.md` 的 Models 行。 |
| 输出呈现 | 不适用 | native 客户端预期以文件卡片呈现视频，属预期降级；`native/dsh.md` 不承担可选渲染说明，render 只作对照。 |

## 问题与建议

### `inline-video-playback`：缺口成立，机械断言已失去区分度

- 证据：[base record](../runs/native-base/scenarios/inline-video-playback/native-base/record.json) / [base screenshot](../runs/native-base/scenarios/inline-video-playback/native-base/screenshot.png) / [render record](../runs/native-render/scenarios/inline-video-playback/native-render/record.json) / [render screenshot](../runs/native-render/scenarios/inline-video-playback/native-render/screenshot.png)
- 现象：base 下模型查了渲染管线、媒体路由、侧边栏预览与附件通道，结论是客户端没有承载 `<video>` 的渲染出口，截图里只有文字；render 下同一场景用 `schemaJson` 的 `video` 组件渲染出可播放播放器。
- 根因：原生 Web 客户端没有视频内联渲染通道，`/api/file` 只能被 `<img>`、iframe 一类消费者引用。两次运行同版本、同模型、同场景，差异只有 render 插件。
- 建议：保留 native-only `gap`，不补 `dsh.md` 的呈现章节，不推荐三方插件。`assistant-contains "sample.mp4"` 在"做不到"的回复里也会通过，已经删除，只保留 `turn-completed`；按用户决定本轮不重跑。
- 已确认：按预期降级处理，不补 `dsh.md`，不推荐三方插件；场景定义按上面的方式改，不重跑。

### `subagent-interrupt`：缺口成立，且消息取消不是兜底

- 证据：[record.json](../runs/native-base/scenarios/subagent-interrupt/native-base/record.json) / [screenshot.png](../runs/native-base/scenarios/subagent-interrupt/native-base/screenshot.png)
- 现象：子代理 `slow-runner` 前台运行 `slow_task.mjs`，写入 `started.txt`；主会话没有中断工具，只能 `send_message` 要求它自行停手，消息被子代理的前台阻塞命令挡住，脚本 90 秒后写出 `done.txt`。面板显示该子代理已完成，`ps` 无残留，是跑完而不是被终止。
- 根因：standard preset 把 `tool-subagent-control` 的 `config.interrupt` 设为 `false`，模型拿不到系统级中断；消息式取消要等子代理空闲才被处理，阻塞中的子代理等不到。
- 建议：保留 native `gap`，由插件提供系统级子代理中断；`dsh.md` 现有的"按不可用处理"足够，不需要把消息取消写成替代路径。
- 已确认：由插件提供适配。

### `subagent-model-routing`：缺口成立，门在宿主设置

- 证据：[record.json](../runs/native-base/scenarios/subagent-model-routing/native-base/record.json) / [screenshot.png](../runs/native-base/scenarios/subagent-model-routing/native-base/screenshot.png)
- 现象：`subagent` 传入异路由两次，均被 `MODEL_ROUTE_NOT_ALLOWED` 拒绝，错误文本指明显式选择被限制为父级路由；模型随后探测设置页、配置编辑接口与宿主设置文件，确认开关由宿主所有，最终用 `workflow` 的 `provider`/`model` 覆盖派出子代理，产出 `urgent.md`、`later.md`、`done.txt`。
- 根因：路由授权每次委派读宿主设置，默认为关闭；`workflow` 的 `startChild` 直接写 `agentOptions`，不校验授权。按 `native/AGENTS.md` 的判据，`workflow` 是另一种动作形态（脚本编排、不接受 `agent_preset`），不算同一动作可达。
- 建议：保留 `gap`，由插件提供按角色派发并指定路由的工具。`dsh.md` 的 Models 行已按用户确认改写，补上宿主授权门与默认继承父级路由的规则。
- 已确认：由插件提供适配。

### `subagent-readonly-sandbox`：缺口成立，只读仍靠提示词

- 证据：[record.json](../runs/native-base/scenarios/subagent-readonly-sandbox/native-base/record.json) / [screenshot.png](../runs/native-base/scenarios/subagent-readonly-sandbox/native-base/screenshot.png)
- 现象：只读子代理 `readonly-reviewer` 创建 `readonly-probe.txt` 返回 `Created file`，没有 `[sandbox: file access denied ...]`；文件 6 字节，子代理报告写入被允许，主线程整理进 `review.md`。
- 根因：standard preset 的 `tool-subagent` 只有 `provider`/`toolName`/`modelSelection`/`modelDiscovery`，没有 sandbox 字段，也没有 `agentPreset`/`allowedAgentPresets` 白名单；子代理继承父会话的 `workspace-write`，收紧不到比父会话更严。`preset-selection.ts` 的 `agent_preset` 只在部署配置给出白名单时开放，standard 未配置。
- 建议：保留 `gap`，由插件提供运行时强制的只读 preset。上一轮"由插件内提供子代理只读环境"的确认仍然有效。
- 已确认：由插件提供适配。

### 跨 variant 一致性：两侧已对齐

- 证据：[adapted-base manifest](../runs/adapted-base/manifest.json) 与本轮两份 native manifest。
- 现象：native 快照为 `0.2.3-alpha.2` / `0.15.48` / `9e278fe`；adapted 快照在本次重跑前停在 `0.2.2-rc.4` / `0.15.43` / `2f87c85`，现已重跑为同一组版本与上游 revision。合并视图不再混版本。
- 建议：adapted 侧的结论见 [adapted.md](./adapted.md)；本条只说明两侧版本对齐，不把 adapted 结论写进 native。
