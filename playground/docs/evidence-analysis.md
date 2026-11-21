# 证据分析

本文件说明 `collect` 后的独立分析会话：输入、隔离、判定、输出和 review。脱敏见 [evidence-redaction.md](./evidence-redaction.md)，批次见 [workflow.md](./workflow.md)。

## 输入

- `playground/evidence/runs/<variant>-<environment>/manifest.json`：当前快照范围和批次信息。
- 快照下每个场景的 `record.json` 和 `screenshot.png`。
- `native/gaps.json`：native 判断缺口；adapted 判断缺口是否闭合。
- `playground/scenarios/`：prompt、assertions、rubric 和 UI 观察点。
- native 对照 `native/dsh.md`；adapted 对照 `src/dsh.md`。
- 场景声明了 `variants: ["native"]` 时，adapted 快照没有对应 record 是声明范围，不是缺失或 blocked。

完整 session 只保存在本地 worker。需要时按 record 的 `session.sessionId` 定位，不复制到快照。

## 隔离

- native 分析只读 native 快照、`native/dsh.md`、`native/dsh-evidence.md`、场景文件和本地 native session；不读 `src/dsh.md`、当前插件实现或 adapted 证据。
- adapted 分析只读 adapted 快照、`src/dsh.md` 和当前适配实现；不以 native 的缺失替代 adapted 验证。
- 合并视图只读，不把一侧结论写进另一侧 findings。

## 判定

1. 区分“能力不存在”和“模型没有完成任务”：能力确实缺失才是 `gap` / `ignore-environment`；能力存在但模型未完成或质量不足，记为 `inconclusive` 或待用户判断。
2. 机械断言是下限，rubric 是语义边界；两者都满足才算通过。没有看到失败不能推断通过。
3. 性能、质量和精确数量不是默认门槛；有操作或测量但未达目标时，优先 `inconclusive` 或待用户判断。
4. 非文本产物必须看到实际呈现；源码、路径、文件卡片和 assistant 文本不能替代渲染、播放或 UI 观察。
5. 证据不足时留给用户判断，不把模型表现当成 DSH 能力结论。

## 输出

按 variant 手写 `playground/evidence/findings/<variant>.md`，包含：

1. 本轮范围：full/incremental、覆盖场景、沿用快照、实际版本。
2. 按 probe 汇总：通过、失败或未完成、未观察到、能力缺失。
3. 按根因去重的问题问答，每条带 capability id 和证据。
4. `dsh.md` 审查：按章节或行判断 `够用`、`缺失`、`误导`、`不适用`。
5. 待用户判断的问题。
6. 后续动作：`dsh-md`、`plugin`、`upstream`、`ignore-environment`。

问题条目和 `dsh.md` 表格的字段以本文件的结构为准；`review.json` 由 `playground:review` 校验。不要为同一根因按场景重复建条目。

## Review

每个场景写 `review.json`，由 `playground:review` 解析。之后执行：

```sh
vp run playground:review -- --variant <variant> --environment <environment> --apply
vp run playground:review -- --variant <variant> --environment <environment> --check
```

`--apply` 是 pending 变成 verified / not-verified 的唯一路径；`--check` 必须没有 pending，且 record 与 review 内容一致。随后按 [evidence-redaction.md](./evidence-redaction.md) 生成 `record.safe.json` 并运行 `playground:redact --apply`。

## 完成标准

- 每个快照场景都有明确结论和 reason。
- 问题条目按根因去重，带 capability id、证据和后续动作。
- `dsh.md` 审查只覆盖当前 variant 的那一份。
- `review --check` 通过，没有 pending。
