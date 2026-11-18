# 证据分析规则

本文件定义每轮 `run-batch` + `collect` 之后的独立分析会话。采集只产生证据；本规则负责把证据变成可执行的问答文件。

## 输入

- `reviews/<treatment>-<environment>/manifest.json`：本轮覆盖的场景、最后批次，以及 `treatment`、`environment`、`dshVersion`、`pstackVersion`、`scenarioIds`。
- `reviews/<treatment>-<environment>/scenarios/**`：每个场景的 `record.json`、`screenshot.png`；`session.jsonl.zstd` 只保留本地，不提交。
- `scenarios/*.ts`：场景 prompt、assertions、rubric；只作为判据，不把 rubric 当答案抄进结论。
- `playground/raw/dsh.md`：只在 native 分析时逐条对照。
- `port/dsh.md`：只在 adapted 分析时逐条对照。
- 必要时读 `playground/raw/dsh-evidence.md` 和上游技能原文。
- `playground/data/capability-inventory.json`：agent 按 [capabilities.md](./capabilities.md) 手工维护的能力清单；不要从 DSH 运行时反推 native 能力需求。

## 阶段隔离

- native 分析只能读 `reviews/native-*/`、`playground/raw/dsh.md`、`playground/raw/dsh-evidence.md`、场景文件和相关原始 session。
- native 分析不得读取 `port/dsh.md`、当前适配实现、当前插件树或 adapted 证据，也不得引用这些内容作为 native 结论。
- adapted 分析只读 adapted 快照、`port/dsh.md` 和当前适配实现；不得用 native 的缺失直接替代 adapted 的验证。
- 违反阶段隔离得出的结论视为无效，必须丢弃并重新分析。

## 任务完成标准与结论

- 先区分“能力不存在”和“模型没有完成任务”：
  - 工具、能力或环境确实不存在：记 `gap` 或 `ignore-environment`。
  - 环境有对应能力、但模型因能力不足、复杂度过高、输出质量不够或没有完成：记 `inconclusive` 或 `待你判断`，不要记 `gap`。
- 性能、质量、精确数量等不是默认的通过门槛。没有达到某个数值或质量目标，但记录了操作、测量、尝试和限制时，按 `inconclusive` 或 `待你判断`，不直接判能力缺失。
- `findings/<treatment>.md` 的类别汇总要区分“通过”“失败/未完成（inconclusive）”“未观察到”和“能力缺失（gap）”。
- 分析只按当前证据下结论；证据不足时标 `待你判断`，不把模型表现当成 DSH 能力结论。

## 按能力类别分析

分析不能只写一段总体结论。每个 finding 必须先落到一个能力类别，再按该类别的证据维度判断。能力组与提取规则见 [capabilities.md](./capabilities.md)，下面给出的证据维度只对存在的 probe 适用；问题条目里的“类型”是后续动作分流，不是能力类别。

### tool

必看：

- `SessionAnalysis.tools` 的 `firstAttemptStatus`
- `attempts`
- `failures`
- `recovered`
- `finalStatus`
- 实际 tool call 的参数、错误文本和最终结果

判定：

- `firstAttemptStatus === "ok"` 且 `failures === 0`：一次通过。
- `recovered === true`：失败后重试成功。
- `finalStatus === "error"`：最终失败。
- 工具调用成功但结果内容错误，仍按对应能力缺陷记录，不能因为 tool status 为 ok 就判通过。
- 没有实际 tool call 或没有可观察结果时，不能推断工具可用。
- 如果环境明确提供了工具但模型没有调用或没有完成，先判为 `inconclusive` 或 `待你判断`，不要直接判为 `gap`。

### delegation

必看：

- 子代理是否真正启动
- role、model、reasoning effort、cwd 是否正确传递
- 子代理是否完成并发出完成通知
- 父会话是否转述子代理结果

判定：

- 主会话自己做完了任务，不算 delegation 通过。
- 子代理启动但中途失败、没有完成通知或没有产出，记录为失败分支。
- 多个子代理时，要分别记录每个分支，不把并行结果合并成一个“成功”。

### routing

必看：

- 实际 `target` 路由
- provider、model、effort
- 可用模型列表
- 继承、默认和 fallback 路径

判定：

- 实际路由必须和可用路由、声明路由一致。
- 不能凭 assistant 文本声称的模型名判断，要看记录中的实际路由。
- 模型不存在、effort 不允许或只能回退时，记录为路由缺口或环境限制。

### environment

必看：

- `environments.ts` 的环境配置
- 前置能力是否启用
- 跳过、blocked、环境限制或替代工具的实际行为

判定：

- 区分“能力本身不支持”和“当前环境未启用”。
- 环境未启用时按 `ignore-environment` 记录，不判为 native gap。
- 有替代工具且实际完成任务时，说明替代路径；没有实际完成时记录 gap 或待判断。

### output-render

必看：

- 完整页面截图
- 实际图像、图表或 Mermaid 渲染结果
- UI 实际呈现
- 视频或音频是否可播放

判定：

- 源码、路径、文件卡片和 assistant 文本不能替代实际呈现。
- inventory 没有对应 `render-*` capability 或 probe，本身就是覆盖缺口。
- 用户明确要求源码或格式时，源码可以作为该格式结果，但仍要确认内容完整并实际出现。
- 渲染、播放或查看能力缺失时，记录为环境限制或待判断，不判通过。
- 没有实际呈现证据时，先判断环境是否提供对应能力：能力不存在记 `gap` 或 `ignore-environment`；能力存在但模型没有完成、没有使用工具或产物质量不足，记 `inconclusive` 或 `待你判断`。

### skill-dependency

必看：

- 上游文档要求依赖的技能或内置能力
- 被依赖技能是否存在、可加载
- 是否有本地替代、vendored skill 或 fallback
- 依赖缺失时整个任务是否仍能完成

判定：

- `skill-dependency` 不是 `tool` 的普通调用，也不是单纯 `skill-loading`；它验证的是依赖链是否完整。
- 被依赖技能不存在且没有替代时，记录为能力缺口。
- 有替代且任务实际完成时，写清替代路径和证据。
- 不能因为当前 pstack 没自带该技能，就把它当成不需要分析。

## 输出

按 treatment 手写 `findings/<treatment>.md`（`findings/native.md`、`findings/adapted.md`），不再生成每快照的 `index.md`。分析完成后按 [evidence-redaction.md](./evidence-redaction.md) 生成 `record.safe.json` 并通过 `playground:redact --apply`。

`findings/<treatment>.md` 固定包含：

1. 本轮范围：mode（full / incremental）、覆盖场景、未覆盖但沿用当前快照的场景，以及本轮的 `dshVersion` / `pstackVersion`。
2. 按能力类别汇总：每一类覆盖了哪些场景，哪些通过、哪些失败、哪些未观察到。
3. 问题问答：按「根因 + 建议动作」去重，每个问题带能力类别和证据。
4. `dsh.md` 适配说明审查：逐章节/逐行判断 `够用 / 缺失 / 误导 / 不适用`。
5. 待用户判断的问题：所有分类不确定的问题都放这里。
6. 后续动作：只列明确落到 `dsh-md`、`plugin`、`upstream`、`ignore-environment` 的结论。

## 问题条目格式

```markdown
### Q1 标题

- 类型：dsh-md | plugin | upstream | ignore-environment | 待你判断
- 能力类别：tool | delegation | routing | environment | output-render | skill-dependency
- 通过方式（仅 tool）：first-pass | recovered-after-failure | failed
- 影响场景：`a`、`b`
- 证据：
  - [record](reviews/native-base/scenarios/a/native-base/record.json)
  - [截图](reviews/native-base/scenarios/a/native-base/screenshot.png)
  - session 只在本地 worker，按 `record.session.sessionId` 读取，不在快照中链接
- 现象：
- 根因：
- 与当前 treatment dsh.md 的关系：native 写 `playground/raw/dsh.md`，adapted 写 `port/dsh.md`
- 建议动作：
- 你的决定：
```

同一根因命中多个场景时只写一条，把所有影响场景和证据列在下面；不要按 scenario 或 finding id 拆成多条。

## dsh.md 审查格式

native 分析只审查 `playground/raw/dsh.md`，adapted 分析只审查 `port/dsh.md`。不要把两个 treatment 合成一张表。

```markdown
| 章节/行 | 当前说明 | 相关证据 | 结论 | 建议 |
| --- | --- | --- | --- | --- |
```

`结论` 只能是 `够用`、`缺失`、`误导`、`不适用`。

## 判定顺序

1. 先判问题是否真实：看 `record.json` 的 assistant 文本、工具调用、完整页面截图；需要完整事件时再按 sessionId 读取本地 worker session。
2. 再判问题性质：先区分能力缺失和模型未完成；模型能力、复杂度、质量或输出不稳定属于 `inconclusive` 或 `待你判断`，只有能力、工具或环境确实不存在才是 `gap` 或 `ignore-environment`。
3. 再判能力类别和根因：场景 prompt、技能或依赖、环境前提、适配说明、上游文档是否覆盖。
4. native 分析只判断 `playground/raw/dsh.md` 是否缺失或误导；adapted 分析只判断 `port/dsh.md` 是否缺失或误导。
5. 当前 treatment 的 `dsh-md` 结论只改当前 treatment 对应的 dsh.md；native 分析不改 `port/dsh.md`。
6. 当前 treatment 的 `plugin` 结论才进入插件、工具或预设开发。
7. 上游自身问题进入 `upstream`，不在本仓修。
8. 环境权限、凭据、网络或无头限制进入 `ignore-environment`。
9. 证据不足或分类会影响方案时，一律标 `待你判断`，不得默认忽略。

批次模式和快照范围的完整规则见 [workflow.md](./workflow.md)。分析会话只需处理当前快照；删除场景时，同步删除只指向该场景的问答条目。

## 链接与提交

- `findings/<treatment>.md` 使用相对链接直接指向对应 `reviews/<treatment>-<environment>/` 快照里的证据文件。
- `record.json` 和截图提交；`session.jsonl.zstd` 只保留本地，不提交，避免泄露宿主路径或凭证。
- `.staging` 不提交。
