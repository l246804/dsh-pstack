# 证据分析规则

本文件定义每轮 `run-batch` + `collect` 之后的独立分析会话。采集只产生证据；本规则负责把证据变成可执行的 findings 和语义审核。

## 输入

- `evidence/runs/<treatment>-<environment>/manifest.json`：本轮覆盖的场景、最后批次，以及 `treatment`、`environment`、`dshVersion`、`pstackVersion`、`scenarioIds`。
- `evidence/runs/<treatment>-<environment>/scenarios/**`：每个场景的 `record.json`、`screenshot.png`；`session.jsonl.zstd` 只保留本地，不提交。
- `native/gaps.json`：native 缺口清单；native 分析据此确认或推翻缺口，adapted 分析据此判断缺口是否闭合。
- `playground/scenarios/probes/*.ts`：场景定义，包含 prompt、assertions、rubric、uiObservations；只作为判据，不把 rubric 当答案抄进结论。
- `native/dsh.md`：只在 native 分析时逐条对照。
- `src/dsh.md`：只在 adapted 分析时逐条对照。
- 必要时读 `native/dsh-evidence.md` 和上游技能原文。
- `native/gaps.json`：按 [scenario-rules.md](./scenario-rules.md) 维护的 native 缺口清单。

## 阶段隔离

- native 分析只能读 `evidence/runs/native-*/`、`native/dsh.md`、`native/dsh-evidence.md`、场景文件和相关原始 session。
- native 分析不得读取 `src/dsh.md`、当前适配实现、当前插件树或 adapted 证据，也不得引用这些内容作为 native 结论。
- adapted 分析只读 adapted 快照、`src/dsh.md` 和当前适配实现；不得用 native 的缺失直接替代 adapted 的验证。
- 违反阶段隔离得出的结论视为无效，必须丢弃并重新分析。

## native 与 adapted 的判定分工

- 同一个场景定义在 native 和 adapted 都运行，场景里没有 treatment 专属期望。
- native 分析只判断该场景是否确实暴露 DSH 标准模式的缺口，据此确认或推翻 `gaps.json` 的条目。
- adapted 分析只判断同一场景在插件环境下是否达成同一用户可观察结果，即缺口是否闭合。
- 插件实现变化不修改场景或缺口清单；adapted 分析可以按当前实现读取工具调用、截图和产物作为证据。

## 判定原则

- 先区分“能力不存在”和“模型没有完成任务”：工具、能力或环境确实不存在时记 `gap` 或 `ignore-environment`；能力存在但模型因能力不足、复杂度过高、输出质量不够或没有完成时记 `inconclusive` 或 `待你判断`，不要记 `gap`。
- 性能、质量、精确数量等不是默认的通过门槛。没有达到某个数值或质量目标，但记录了操作、测量、尝试和限制时，按 `inconclusive` 或 `待你判断`，不直接判能力缺失。
- 判定依据是当前 probe 的机械断言、rubric、实际 tool call、截图和产物。机械断言是下限，rubric 是语义边界；两者都必须满足才算通过。
- 非文本产物必须看到实际呈现，源码、路径、文件卡片和 assistant 文本不能替代渲染、播放或 UI 观察。
- 证据不足时一律标 `待你判断`，不把模型表现当成 DSH 能力结论。
- 不做“没看到失败就当通过”的推断。

## 输出

按 treatment 手写 `playground/evidence/findings/<treatment>.md`（`playground/evidence/findings/native.md`、`playground/evidence/findings/adapted.md`）。写完后必须先在 `evidence/runs/<treatment>-<environment>/review.json` 里按 `scenarioId` 声明每个场景的 `{ status, reason, reviewer }`，运行 `vp run playground:review -- --treatment <treatment> --environment <environment> --apply`，再用 `--check` 确认没有 pending。这是记录从 pending 变为 verified / not-verified 的唯一路径。审核完成后按 [evidence-redaction.md](./evidence-redaction.md) 生成 `record.safe.json` 并通过 `playground:redact --apply`。

`playground/evidence/findings/<treatment>.md` 固定包含：

1. 本轮范围：mode（full / incremental）、覆盖场景、未覆盖但沿用当前快照的场景，以及本轮的 `dshVersion` / `pstackVersion`。
2. 按 probe 汇总：每个 probe 的结论，通过、失败/未完成、未观察到、能力缺失分别列出。
3. 问题问答：按「根因 + 建议动作」去重，每个问题带能力 id 和证据。
4. `dsh.md` 适配说明审查：逐章节/逐行判断 `够用 / 缺失 / 误导 / 不适用`。
5. 待用户判断的问题：所有分类不确定的问题都放这里。
6. 后续动作：只列明确落到 `dsh-md`、`plugin`、`upstream`、`ignore-environment` 的结论。

## 问题条目格式

```markdown
### Q1 标题

- 类型：dsh-md | plugin | upstream | ignore-environment | 待你判断
- 能力：<capability id>（来自 probe 与 inventory）
- 通过方式（仅机械断言相关的 tool）：first-pass | recovered-after-failure | failed
- 影响场景：`a`、`b`
- 证据：
  - [record](evidence/runs/native-base/scenarios/a/native-base/record.json)
  - [截图](evidence/runs/native-base/scenarios/a/native-base/screenshot.png)
  - session 只在本地 worker，按 `record.session.sessionId` 读取，不在快照中链接
- 现象：
- 根因：
- 与当前 treatment dsh.md 的关系：native 写 `native/dsh.md`，adapted 写 `src/dsh.md`
- 建议动作：
- 你的决定：
```

同一根因命中多个场景时只写一条，把所有影响场景和证据列在下面；不要按 scenario 或 finding id 拆成多条。

## dsh.md 审查格式

native 分析只审查 `native/dsh.md`，adapted 分析只审查 `src/dsh.md`。不要把两个 treatment 合成一张表。

```markdown
| 章节/行 | 当前说明 | 相关证据 | 结论 | 建议 |
| --- | --- | --- | --- | --- |
```

`结论` 只能是 `够用`、`缺失`、`误导`、`不适用`。

## 判定顺序

1. 先判问题是否真实：看 `record.json` 的 assistant 文本、工具调用、完整页面截图；需要完整事件时再按 sessionId 读取本地 worker session。
2. 再判问题性质：先区分能力缺失和模型未完成；模型能力、复杂度、质量或输出不稳定属于 `inconclusive` 或 `待你判断`，只有能力、工具或环境确实不存在才是 `gap` 或 `ignore-environment`。
3. 再判根因：场景 prompt、技能或依赖、环境前提、适配说明、上游文档是否覆盖。
4. native 分析只判断 `native/dsh.md` 是否缺失或误导；adapted 分析只判断 `src/dsh.md` 是否缺失或误导。
5. 当前 treatment 的 `dsh-md` 结论只改当前 treatment 对应的 dsh.md；native 分析不改 `src/dsh.md`。
6. 当前 treatment 的 `plugin` 结论才进入插件、工具或预设开发。
7. 上游自身问题进入 `upstream`，不在本仓修。
8. 环境权限、凭据、网络或无头限制进入 `ignore-environment`。
9. 证据不足或分类会影响方案时，一律标 `待你判断`，不得默认忽略。

批次模式和快照范围的完整规则见 [workflow.md](./workflow.md)。分析会话只需处理当前快照；删除场景时，同步删除只指向该场景的问答条目。

## 链接与提交

- `playground/evidence/findings/<treatment>.md` 使用相对链接直接指向对应 `evidence/runs/<treatment>-<environment>/` 快照里的证据文件。
- `record.json` 和截图提交；`session.jsonl.zstd` 只保留本地，不提交，避免泄露宿主路径或凭证。
- `.staging` 不提交。
