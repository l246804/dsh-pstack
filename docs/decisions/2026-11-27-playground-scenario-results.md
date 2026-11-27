# 决策：playground 以场景文件和简短结果维护验证

Status: proposed
Date: 2026-11-27
Scope: playground/**, native/AGENTS.md, native/tests/**, vite.config.ts, tsconfig.json, README.md, README.zh.md, docs/architecture.md, docs/glossary.md, docs/dsh-baseline-bump.md, docs/decisions/**
Implemented-by: -
Review: 2026-11-27

## 背景

场景覆盖与 native 缺口审批状态绑定，使用户调整验证范围时还要维护缺口指纹。运行记录、审核 JSON 和长篇 findings 重复保存结论；JSON 提交需要额外脱敏，却仍缺少部分只能在本地 session 查到的事实。按环境维护统一快照还会在增量记录跨版本时要求全量重跑，增加与验证目标无关的工作。

用户需要按场景检查最小适配下的能力缺口和适配答案，审批处理建议，再查看 adapted 是否通过。真实会话按需运行，不随每次升级或发版重跑。

## 决策

- `playground/scenarios/*.ts` 是运行范围的唯一来源，由用户主动维护。保留 gap/regression 分类和 variant/environment 声明；移除 native gap 状态、覆盖绑定与 gap-lock。
- worker 保留本地执行记录、会话与诊断信息。runner 只报告执行和机械检查结果；语义结论与用户审批写入 Markdown，不维护另一套审核 JSON。
- `collect` 只导出截图到 `playground/results/<scenario-id>/<variant>-<environment>.png`。每项 `result.md` 保存简短结论、必要观察、处理建议、审批与适配答案审查；`results/README.md` 提供短索引。
- native 判断只依据基准侧事实。render 是可选环境对照；adapted 通过表示适配弥补缺口，不改写 native 结论。用户批准方案与运行通过分别记录。
- 各场景独立更新。收集本批结果仍要求本批实际记录，允许不同场景的最近验证来自不同版本；结果中不维护版本对齐与 hash。
- 上游或插件版本变化不触发结果刷新。行为或判据变化时复核受影响项，用户按需决定重跑；未重跑项保留实际验证日期。
- native 清单自身的枚举与引用完整性检查归 `native/tests/`，不限制 playground 场景集合。

## 替代方案

**继续提交 JSON，缩短 findings。** 未采用。脱敏、审核回写和跨版本快照维护仍在，且提交记录不能独立支撑全部语义结论。

**允许 proposed gap 运行，保留缺口绑定。** 未采用。用户明确选择主动维护场景文件，场景是否可运行不取决于 native 审批状态。

**一张宽表装下所有依据。** 未采用。索引只承载短结果，依据与审批按场景放在同目录，保持可读性与截图对应关系。

## 后果

- 提交内容可直接审阅，日志和存储格式变化主要影响本地 runner 的读取边界。
- 新克隆仓库可阅读结论并复跑场景，但不会获得完整历史 session。调试记录在 worker 重建前按需分析；需要历史结论时查看 Git。
- 替代 [当前审核快照](./2026-11-13-current-review-snapshot.md)、[gap 驱动场景](./2026-11-23-gap-driven-scenarios.md) 与 [证据与判定](./2026-11-25-playground-evidence-only.md) 的提交和验证流程。
- 与 [native/playground/src 分层](./2026-11-23-native-playground-src-boundary.md) 重叠：保留模块分工，以本记录更新场景来源和验证产物。测试归属延续 [测试按包归属](./2026-11-19-package-owned-tests-and-runner-domains.md)。
