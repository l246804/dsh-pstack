# 怎么判定

本文件说明 `collect` 后的独立分析会话：输入、隔离、判定、输出和 review。怎么跑见 [run.md](./run.md)，记录结构见 [records.md](./records.md)。

## 输入

- `playground/evidence/runs/<variant>-<environment>/manifest.json`：快照范围和批次信息。
- 快照下每个场景的 `record.json` 和 `screenshot.png`。
- `native/gaps.json`：native 判断缺口；adapted 判断缺口是否闭合。
- `playground/scenarios/`：prompt、assertions、rubric 和 UI 观察点。
- native 对照 `native/dsh.md`；adapted 对照 `src/dsh.md`。
- 场景声明 `variants: ["native"]` 时，adapted 快照没有对应 record 是声明范围，不是缺失或 blocked。

完整 session 的位置与提交边界见 [records.md](./records.md#证据布局)。需要时按 record 的 `session.sessionId` 定位。

## 隔离

- native 分析只读 native 快照、`native/dsh.md`、`native/dsh-evidence.md`、场景文件和本地 native session；不读 `src/dsh.md`、当前插件实现或 adapted 证据。
- adapted 分析只读 adapted 快照、`src/dsh.md` 和当前适配实现；不以 native 的缺失替代 adapted 验证。
- 合并视图只读，不把一侧结论写进另一侧 findings。

## 判定

1. 区分「能力不存在」和「模型没有完成任务」：能力确实缺失才记为 `gap`；能力存在但模型未完成或质量不足，记为 `inconclusive` 或待用户判断。
2. 机械断言是下限，rubric 是语义边界；两者都满足才算通过。
3. 性能、质量和精确数量不是默认门槛；有操作或测量但未达目标时，优先 `inconclusive` 或待用户判断。
4. 非文本产物必须看到实际呈现；源码、路径、文件卡片和 assistant 文本不能替代渲染、播放或 UI 观察。
5. 证据不足时留给用户判断，不把模型表现当成 DSH 能力结论。
6. `dsh.md` 审查只依据当前 variant 的实际实现、文档内容和实测证据；不把另一 variant 的结构或术语作为判定标准。

## 输出

按 variant 手写 `playground/evidence/findings/<variant>.md`，包含：

1. 本轮范围：full/incremental、覆盖场景、沿用快照、实际版本。
2. 按 probe 汇总：通过、失败或未完成、未观察到、能力缺失。
3. `dsh.md` 审查：按当前 variant 的实际实现和章节判断 `够用`、`缺失`、`误导`、`不适用`；判定只针对当前 variant，不与其他 variant 的组织方式比较。
4. 问题与建议：按根因去重，每条带 capability id、证据、建议和需要用户确认的事项。

`review.json` 的字段和校验见 `runner/evidence/review-snapshot.ts`；本文件只定义分析步骤，不复制记录结构。

## Review

每个场景写 `review.json`，由 `playground:review` 解析。之后执行：

```sh
vp run playground:review -- --variant <variant> --environment <environment> --apply
vp run playground:review -- --variant <variant> --environment <environment> --check
```

`--apply` 是 pending 变成 verified / not-verified 的唯一路径；`--check` 必须没有 pending，且 record 与 review 内容一致。判定完成后按 [run.md](./run.md#证据脱敏) 生成 `record.safe.json` 并运行 `playground:redact --apply`。

## 完成标准

- 每个快照场景都有明确结论和 reason。
- 问题条目按根因去重，带 capability id、证据、建议和需要用户确认的事项。
- `dsh.md` 审查只覆盖当前 variant 的那一份。
- `review --check` 通过，没有 pending。
