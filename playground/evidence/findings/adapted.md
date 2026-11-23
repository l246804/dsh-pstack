# adapted 证据分析

## 结论

adapted `base` 的 3 个场景全部为 `verified`，没有 `blocked` 或 `not-verified`。`pstack_subagent` 的不同路由、`pstack_interrupt` 的系统级中断和 `readonly` preset 的只读沙箱均按预期工作。

## 范围与判据

- 快照：[adapted-base](../runs/adapted-base/) 覆盖 3 个场景；`inline-video-playback` 声明 `variants: ["native"]`，不在 adapted 运行。
- 版本：DSH `0.2.2-rc.4`、pstack `0.15.43`、adapted `0.5.0`、上游 revision `2f87c854fe3e2fcda44ca86b46ede35aad3c46b7`。
- 运行身份：全部记录使用 `magpie / workbuddy/minimax-m3.1-flash / low`，preset 为 `standard`，config hash 为 `7f65ea17946aefa3d4a21e251ae8e90eccb039e0e283d9660d6212fce5574b9e`。
- 判定：机械断言通过后，按 rubric、截图和本地 session 做语义审核；`review.json` 已应用，三个记录均为非 pending。

## 场景结果

| 场景 | 环境 | 机械断言 | 语义结论 | 关键观察 |
| --- | --- | --- | --- | --- |
| `subagent-interrupt` | base | 通过 | `verified` | `pstack_interrupt` 成功中断子代理；`started.txt` 存在，`done.txt` 不存在。 |
| `subagent-model-routing` | base | 通过 | `verified` | `pstack_subagent` 使用不同模型路由完成分拣，`urgent.md`、`later.md`、`done.txt` 均产出。 |
| `subagent-readonly-sandbox` | base | 通过 | `verified` | 只读子代理写入 `readonly-probe.txt` 被拒，`review.md` 记录 `DENIED`，文件不存在。 |

## dsh.md 审查

审查对象是 [src/dsh.md](../../../src/dsh.md)。本轮覆盖 `Plugin tools`、`Tools`、`Subagent fields` 和 `Models` 中与子代理相关的映射，结论与实测一致。

| 主题 | 判定 | 依据 |
| --- | --- | --- |
| `Plugin tools` / `Tools` | 够用 | `pstack_subagent` 的不同路由调用和 `pstack_interrupt` 的中断路径均按文档工作。 |
| `Subagent fields` / `Models` | 够用 | `readonly` preset 阻止写入；子代理路由使用 `pstack_models` 返回的值，未出现路由格式错误。 |

`AskQuestion`、todolist、skill、Paths、setup-pstack 和 Agent Teams 不在本轮 adapted 场景范围内，未做判断。

## 问题与建议

本轮没有发现新的能力缺口或文档阻塞问题，不需要新增插件功能或修改 `src/dsh.md`。
