# adapted 证据分析

## 结论

adapted `base` 的三个场景全部 `verified`，没有 `not-verified` 或 `blocked`。`0.2.3-alpha.2` 基线上三条原生缺口都由插件闭合：`pstack_interrupt` 的系统级中断、按角色路由派发的 `pstack_subagent`、`readonly` preset 的只读沙箱。

上一轮留下的两处证据缺口这轮补上了。`subagent-model-routing` 的子会话 header 记录 `agentProvider=magpie`、`agentModel=workbuddy/deepseek-v4.1-flash`，与主会话的 `minimax-m3.1-flash` 不同，产物由子代理写出。`subagent-readonly-sandbox` 的子会话把 `sandbox/mode` 从 `workspace-write` 切到 `read-only`，四条写入路径全部 `EACCES`。两处证据都在 worker 本地 session 里，提交的快照不含 session。

`inline-video-playback` 声明 `variants: ["native"]`，adapted 不运行。

## 范围与判据

- 快照：[adapted-base](../runs/adapted-base/)，full 批次 `adapted-base-20261127110856`，覆盖 3 个场景。
- 版本：DSH `0.2.3-alpha.2`、pstack `0.15.48`、上游 revision `9e278fe4d4ecd8bfe98b1b79bf4be662efb338cc`，与两份 native 快照同基线。`prepare` 安装的插件包版本为 `0.5.2`。
- 运行身份：全部记录使用 `magpie / workbuddy/minimax-m3.1-flash / low`，preset 为 `standard`。审查路由为 `magpie / workbuddy/deepseek-v4.1-flash / low`。
- 判定：机械断言全部通过，语义结论按 rubric、截图和 worker 本地子会话判定；`review.json` 已应用，`playground:review --check` 通过，`playground:redact` 检查 `checked=3 errors=0`。
- 记录形态：`configHash` 与 `adaptedVersion` 已由 `4e67d8a` 移除，快照不再携带，这是当前字段集而不是缺失。
- 场景边界：本轮的三个场景与 native `base` 使用同一份场景定义和同一 environment，`scenarioHash` 与当前定义一致。

## 场景结果

| 场景 | 机械断言 | 语义结论 | 关键观察 |
| --- | --- | --- | --- |
| `subagent-interrupt` | 通过 | `verified` | `pstack_interrupt` 返回 `interrupt admitted to the child`；`started.txt` 6 秒内出现；越过脚本 90 秒边界后 `done.txt` 仍不存在；`/proc` 扫描无残留进程；面板显示该子智能体"未运行"。 |
| `subagent-model-routing` | 通过 | `verified` | 子会话 header 的 `agentProvider`/`agentModel` 为 `magpie`/`workbuddy/deepseek-v4.1-flash`，主会话是 `minimax-m3.1-flash`；`urgent.md`、`later.md`、`done.txt` 由子代理写出，主线程只读回核对。 |
| `subagent-readonly-sandbox` | 通过 | `verified` | 子会话 `agentPreset=readonly`，`sandbox/mode` 由 `workspace-write` 切到 `read-only`；shell 重定向、`touch`、`tee`、Node `writeFileSync` 四条路径全部 `EACCES`；`readonly-probe.txt` 不存在，`review.md` 记录了被拒报错。 |

## dsh.md 审查

审查对象是 [src/dsh.md](../../../src/dsh.md)；结论按主题归档，不依赖行号。

| 主题 | 判定 | 依据 |
| --- | --- | --- |
| `pstack_interrupt` 与 `resume` | 够用 | 文档写明内置 preset 关闭原生中断，`pstack_interrupt` 是按名称或 Session id 停止子代理的路径；实测返回 admitted 并让子代理停下。 |
| `pstack_subagent` 的路由参数与 `pstack_roles` | 够用 | 文档要求从 `pstack_roles` 取 `provider`/`model`/`reasoning_effort` 后传入；实测按指定路由派发成功，子会话 header 可核对。 |
| `readonly: true` 的 `agent_preset: "readonly"` | 够用 | 文档称它给子代理只读沙箱；实测子会话 sandbox 切到 `read-only`，四条写入路径被拒。 |
| `pstack_models` / `pstack_roles` 的分工 | 够用 | 文档区分发现路由与读取角色文件；两个工具在场景里都按预期返回。 |

`AskQuestion`、todolist、skill、Paths、setup-pstack 和 Agent Teams 不在本轮 adapted 场景范围内，未做判断。

## 问题与建议

本轮没有发现新的能力缺口，也不需要新增插件功能或修改 `src/dsh.md`。

一处记录边界的改进建议（不是能力缺口）：子代理的实际路由与沙箱模式只存在于 worker 本地 session，`record.json` 没有对应字段，跨会话复核必须按 `session.sessionId` 去本地找。若希望快照自带这类事实，可以把 `agentProvider`/`agentModel` 与 `sandbox/mode` 加进 session facts；这会改动快照结构并影响已有的 `record.json`，是否做由用户决定。
