# 证据分析

本文件定义 `run-batch` + `collect` 后的独立分析会话：输入、阶段隔离、判定原则、输出和 review 流程。证据脱敏见 [evidence-redaction.md](./evidence-redaction.md)，快照范围见 [workflow.md](./workflow.md)。

## 输入

| 输入 | 用途 |
| --- | --- |
| `evidence/runs/<variant>-<environment>/manifest.json` | 当前快照范围、批次和版本 |
| `evidence/runs/<variant>-<environment>/scenarios/**` | 每个场景的 `record.json`、`screenshot.png` |
| `native/gaps.json` | native 判断确认/推翻缺口；adapted 判断缺口是否闭合 |
| `playground/scenarios/probes/*.ts` | prompt、assertions、rubric、uiObservations；只作判据 |
| `native/dsh.md` | 仅 native 分析逐条对照 |
| `src/dsh.md` | 仅 adapted 分析逐条对照 |
| `native/dsh-evidence.md`、上游原文 | 必要时查证 |

完整 session 只在本地 worker；按 `record.session.sessionId` 读取，不把 session 文件复制进快照。

## 阶段隔离

- native 分析只读 native 快照、`native/dsh.md`、`native/dsh-evidence.md`、场景文件和本地 native session；不得读 `src/dsh.md`、当前插件实现或 adapted 证据。
- adapted 分析只读 adapted 快照、`src/dsh.md` 和当前适配实现；不得用 native 的缺失直接替代 adapted 验证。
- 违反隔离得出的结论无效，必须丢弃重做。
- 生成的状态表/对比只读合并，不把一侧结论写入另一侧 findings。

## 判定原则

1. 先区分“能力不存在”和“模型没有完成任务”：工具、能力或环境确实不存在才记 `gap` / `ignore-environment`；能力存在但模型没完成、质量不足或复杂度高，记 `inconclusive` 或 `待你判断`。
2. 机械断言是下限，rubric 是语义边界；两者都满足才算通过。不能因为“没看到失败”推断通过。
3. 性能、质量、精确数量不是默认门槛；有操作、测量、尝试和限制但未达目标时，优先 `inconclusive` 或 `待你判断`。
4. 非文本产物必须看到实际呈现；源码、路径、文件卡片和 assistant 文本不能替代渲染、播放或 UI 观察。
5. 证据不足一律 `待你判断`；不把模型表现当 DSH 能力结论。

## 输出

按 variant 手写 `playground/evidence/findings/<variant>.md`，固定包含：

1. 本轮范围：full/incremental、覆盖场景、沿用快照、`dshVersion` / `pstackVersion`。
2. 按 probe 汇总：通过、失败/未完成、未观察到、能力缺失。
3. 问题问答：按根因去重，每条带能力 id 和证据。
4. `dsh.md` 审查：逐章节/逐行判断 `够用` / `缺失` / `误导` / `不适用`。
5. 待用户判断的问题。
6. 后续动作：`dsh-md` / `plugin` / `upstream` / `ignore-environment`。

### 问题条目

```markdown
### Q1 标题

- 类型：dsh-md | plugin | upstream | ignore-environment | 待你判断
- 能力：<capability id>
- 通过方式：first-pass | recovered-after-failure | failed
- 影响场景：`a`、`b`
- 证据：
  - `evidence/runs/native-base/scenarios/a/native-base/record.json`
  - `evidence/runs/native-base/scenarios/a/native-base/screenshot.png`
- 现象：
- 根因：
- 与当前 variant dsh.md 的关系：
- 建议动作：
- 你的决定：
```

同一根因命中多个场景时只写一条，不按场景拆成多条。

### dsh.md 审查

native 只审查 `native/dsh.md`，adapted 只审查 `src/dsh.md`。

```markdown
| 章节/行 | 当前说明 | 相关证据 | 结论 | 建议 |
| --- | --- | --- | --- | --- |
```

`结论` 只能是 `够用`、`缺失`、`误导`、`不适用`。

## Review 流程

写完 findings 和每个场景的 `review.json`（`{ status, reason, reviewer }`）后：

```sh
vp run playground:review -- --variant <variant> --environment <environment> --apply
vp run playground:review -- --variant <variant> --environment <environment> --check
```

`--apply` 是 pending 变为 verified / not-verified 的唯一路径；`--check` 必须没有 pending。随后按 [evidence-redaction.md](./evidence-redaction.md) 生成 `record.safe.json` 并执行 `playground:redact --apply`。

## 完成标准

- 每个快照场景都有明确结论和 reason。
- 问题条目按根因去重，且带能力 id、证据和后续动作。
- `dsh.md` 审查只覆盖当前 variant 的那一份。
- `review --check` 通过，没有 pending。
