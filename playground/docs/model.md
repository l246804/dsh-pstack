# Playground 运行矩阵

本文件定义 playground 的 run identity、证据布局和不变量。场景写法见 [scenario-rules.md](./scenario-rules.md)，执行流程见 [workflow.md](./workflow.md)。

## 运行维度

- `variant`：`native` 只运行 DSH 标准运行时，不加载被测插件；`adapted` 加载当前插件及适配配置。两者跑同一份场景定义，场景里不写 variant 专属期望。
- `environment`：由 `runner/scenario/environments.ts` 定义。`base` 是默认对照；`render`、`agent-team` 等能力环境按需启用，必须在同一 probe 上保留 base 结果才能区分环境效应与适配效应。
- `dshVersion`、`pstackVersion`、`environmentId`、`scenarioHash`、`configHash` 共同构成一次 run 的身份轴。`upstreamRevision` 只用于复现，不参与 identity 比较。
- `pstackVersion` 取自 `native/upstream.lock.json` 的固定发布版本；`adaptedVersion` 是 adapted worker 实际安装的插件版本。

## 场景与缺口

- 场景分两类：`kind: "gap"` 绑定 `native/gaps.json` 的 confirmed 缺口；`kind: "regression"` 独立记录回归行为，不声明 `gap`，也不进入 gap-lock。
- 一个能力可以有多个场景，覆盖不同分支或环境；一个场景只覆盖一个行为分支。回归场景可以随时补充，不需要先有缺口。
- 同一场景在 native 与 adapted 都运行，除非 `variants` 显式收窄；`environments` 默认 `["base"]`。

## 证据布局

- `playground/evidence/runs/<variant>-<environment>/scenarios/<scenarioId>/<variant>-<environment>/record.json` 和 `screenshot.png`。
- `playground/evidence/runs/<variant>-<environment>/manifest.json` 记录 variant、environment、`dshVersion`、`pstackVersion`、`scenarioIds` 和批次信息。
- `session.jsonl.zstd`、`record.source.json` 和 `record.safe.json` 只保留本地，不提交；提交门见 [evidence-redaction.md](./evidence-redaction.md)。

## 生成物与手写物

- 生成物必须支持 `--check`：状态表、跨单元透视、对比报告和 `gap-lock.json`。
- 手写物：`playground/scenarios/probes/` 的 probe、`playground/evidence/findings/<variant>.md` 的根因问答和适配答案审查。

## 不变量

- 阶段隔离：native 分析只读 native 单元，adapted 分析只读 adapted 单元；合并视图只读，不把一侧结论写进另一侧。
- 可比性：相同 `dshVersion`、相同 scenario hash、相同 environment、相同模型路由才比较；`pstackVersion` 是 adapted 来源信息，不是 native 行为的硬性相等条件。
- 场景 variant 中立；variant 专属判断属于分析规则，不进入场景。
- 所有生成物带 `--check` 守卫；任何快照变更都必须能从记录重建。

## 完成标准

- `manifest.json` 的 `scenarioIds` 与实际快照目录一致。
- 同一 `scenarioId` 的 native/adapted 记录使用同一 `scenarioHash`，且 environment 相同。
- 生成视图的 `--check` 通过，历史快照未被重写。
