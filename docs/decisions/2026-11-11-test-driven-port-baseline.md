# 决策：以场景测试与审核侧车驱动移植，发布兼容键迁到 baseline.json

Status: proposed
Date: 2026-11-11
Scope: playground/**, port/release-compatibility.ts, port/AGENTS.md, docs/architecture.md, docs/glossary.md
Implemented-by: -
Review: 2026-11-11

## 背景

旧的移植流程用 `playground/cases.lock.json` 同时保存固定上游基线的能力审核处置与发布兼容键。技能审核靠单 prompt 和浅层结构断言，raw 轮以短探针截断，adapted 轮从未真正跑过。它无法回答两个问题：上游技能在真实 DSH 会话里到底产出什么效果，以及当前适配是否真的让这些效果成立。同时，发布兼容键与审核状态共用一个文件，导致审核流程变化会打断发布脚本，删除旧流程也会同时删掉发布基线。

## 决策

- raw 基线独立生成。`playground/raw/dsh.md` 由 agent 按 `playground/raw/AGENTS.md` 的规则，从上游 `docs/harness/claude-code.md` 逐项改判为 DSH 真实能力，区分 base 原生、仅官方可选插件、无此能力三态。生成器只复制上游并插入 dsh 引用行，不改写上游任何文案。
- 场景注册表取代逐技能用例文件。`playground/scenarios/` 用同一份 `Scenario` 跨 raw 与 adapted 运行，覆盖上游技能主要能力，另设插件 UI、冲突回归与环境矩阵。上游技能必须有用例或明确排除，覆盖守卫测试在两者都缺时失败。
- 执行器等待每个 turn 的真实 `turn/end`，不做 probe 或到点中止。raw 四态为 observed、gap、blocked、unobserved，adapted 三态为 verified、not-verified、inconclusive。
- 语义审核独立于机械断言。审核侧车放在 `playground/reviews/<scenarioId>-<phase>-<environmentId>.json`，记录 supported、gap 或 inconclusive 与审核者；`review --apply` 合并成 append-only 的 RunRecord 修订。侧车早于最新记录时判 stale 并跳过。
- 发布兼容键迁到 `playground/baseline.json`，字段为 `compatibilityKey`、`dshVersion`、`pstackCommit`。`port/release-compatibility.ts` 从该文件读取，不再读取 cases.lock。
- 旧 cases lock、approve、lockfile、skill-audit 报告与其生成脚本删除，不保留兼容层。

## 替代方案

**保留 `cases.lock.json` 并只替换审核流程。** 这会让发布基线继续依赖一个审核文件，审核机制再变时发布链路会被一起打断；两种情况需要独立演进。该方案被否决。

**只保留场景注册表，发布兼容键继续写在旧 lock 里并改名为 audit 文件。** 改名不改变耦合，也没有减少阅读成本。该方案被否决。

**让场景注册表同时承担发布兼容键。** 场景随上游和测试调整频繁变化，兼容键需要稳定到发布系列，两者生命周期不同。该方案被否决。

## 后果

- 发布流程只依赖 `playground/baseline.json`，`vp run compatibility:check` 与 release 不再受审核文件影响。
- 审核结论以侧车形式进库，`review --apply` 产生可追溯的 RunRecord 修订。运行时证据仍在 gitignored 的 worker 目录与 `reports/evidence`，由重跑重新生成。
- 上游 pstack 或 DSH 升级时按 `playground/raw/AGENTS.md` 重新判定适配文档，按场景注册表重跑 raw 与 adapted，不需要旧 lock 或审批轮次。
- 本记录替代 [2026-11-08-release-compatibility-metadata.md](./2026-11-08-release-compatibility-metadata.md)。实现已落在 `refactor/test-driven-pstack-port` 分支的 `test-driven-pstack-port` 合并提交，合入默认分支后补实现锚点。
