# 决策：以 native 基准、playground 验证、src 产品实现分层

Status: accepted
Date: 2026-11-23
Scope: native/**, src/**, playground/**, docs/architecture.md, docs/glossary.md, docs/decisions/**
Implemented-by: PR #43
Review: 2026-11-28

## 背景

旧结构把上游基准、适配答案、验证场和发布产物混在 `port/`、`playground/raw`、`playground/reviews` 等路径中。阅读者很难判断一份文件是上游事实、验证证据还是产品实现，升级 DSH 或 pstack 时也容易把不同生命周期的产物一起改写。

当前实现已经按 `native/`、`playground/`、`src/` 分层，但缺少一份记录说明分层的目标、约束和被否决的替代方案。相关旧记录中仍保留旧的路径和 `raw/adapted` 术语；本记录描述当前边界，不重写这些历史记录。

## 决策

- `native/` 是基准子包。它钉定已发布上游 pstack，维护 `native/dsh.md`、`native/dsh-evidence.md` 和 `native/gaps.json`，并由生成器产出唯一生成树 `native/pstack/`。
- `playground/` 是验证场。它用真实 DSH Web 会话运行 `native` 和 `adapted` 场景，收集运行事实并分析结果；它不承载产品实现。
- `src/` 是产品实现。它包含随包的 `src/dsh.md`、Host/Client 实现、角色与工作流配置，并负责生成 `dist/`。
- 构建链固定为 `native/upstream/ → native/pstack/ → dist/pstack/`，适配答案由 `src/dsh.md` 在构建时盖章；`native/pstack/` 不由手工编辑。
- `playground/scenarios/` 保存验证场景，使用 `native`/`adapted` variant 和各对照 environment；场景来源与覆盖遵循 [gap 驱动场景](./2026-11-23-gap-driven-scenarios.md)。

## 替代方案

**继续保留 `port/`、`playground/raw` 和 `playground/reviews`。** 这些路径把上游基准、验证证据和产品交付物放在不同但语义重叠的目录里，升级时需要同时维护多套路径，且容易把历史快照当作当前实现。该方案被否决。

**只保留一棵 `pstack/` 生成树。** 这样 native 基准和产品实现无法独立演进，native 验证会被产品改动污染，发布树的来源也不可区分。该方案被否决。

**让 playground 同时承担产品实现。** 验证场会再次变成产品源码目录，测试输入和交付物无法隔离，也无法保证 native worker 只观察标准 DSH。该方案被否决。

**只保留原生测试，不记录 adapted 结果。** 无法证明适配层是否真正闭合 gap，也无法比较 native 与 adapted 的运行身份。该方案被否决。

## 后果

- `native/`、`playground/`、`src/` 的职责和输入输出固定，新增文件先按这三层归档。
- `native/pstack/` 是唯一生成树，`src/dsh.md` 是唯一产品适配答案；文档和测试均引用当前路径。
- 验证场的运行数据与提交结果按 [逐场景结果](./2026-11-27-playground-scenario-results.md) 管理，历史结论依赖 Git。
- 相关记录：[2026-11-23-playground-worker-container-isolation.md](./2026-11-23-playground-worker-container-isolation.md) 承接 worker 读取边界；旧记录中的 `port/`、`playground/raw`、`playground/reviews`、根 `pstack/`、根 `tests/` 下的产品测试和 `port/surface.json` 路径属于历史，当前对应 `src/`、`playground/runner`、`native/`、`src/tests/` 和 `src/surface.json`。
- 本记录已在 PR #43 合并后更新为 `Status: accepted`、`Implemented-by: PR #43`。
