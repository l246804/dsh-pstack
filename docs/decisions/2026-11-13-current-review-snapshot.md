# 决策：用每个 variant/environment 的当前快照取代 reports 汇总和 review sidecar

Status: accepted
Date: 2026-11-13
Scope: playground/runner/cli/collect.ts, playground/runner/evidence/review-snapshot.ts, playground/runner/cli/run-batch.ts, playground/runner/cli/run-scenario.ts, playground/AGENTS.md, playground/docs/run.md, playground/docs/records.md, playground/docs/judge.md, playground/evidence/runs/**
Implemented-by: commit:ef01e56
Review: 2026-11-23

## 背景

旧的 `reports/` 需要维护 `runs/`、`scenarios/`、`approvals/` 和 `history/` 多层目录，同时生成 summary、runtime-review 和 approval 等叙述文件。`reviews/scenarios/**/*.json` 和 `reviews/runtime-review/*.json` 又维护一套独立的审核 sidecar。随着证据量增加，自动汇总无法替代逐条判断，批次历史也不断膨胀，阅读和提交成本都在上升。

## 决策

- 每个 `variant/environment` 只保留一份当前完整快照：`playground/evidence/runs/<variant>-<environment>/`。
- 快照包含 `manifest.json`、`review.json` 和 `scenarios/<scenario>/<variant>-<environment>/`；每个场景目录保存 `record.json` 和 `screenshot.png`；`session.jsonl.zstd` 只保留本地，不提交。
- `collect` 只更新当前快照，不生成 summary、runtime-review、approval 或 history。
- `run-batch` 在批次开始时生成 `batchId`、mode 和 scope，并写入 `.workers` 的当前批次元数据；增量批次只替换本次跑到的场景。
- 全量批次整体更新快照；增量批次只替换选中场景，未覆盖场景保留。
- 逐条证据分析由独立会话按 [judge.md](../../playground/docs/judge.md) 写入 `playground/evidence/findings/<variant>.md` 和每个场景的 `review.json`，并按根因去重。
- `reports/`、review sidecar 和 history 不再写入工作区；需要历史查看 Git 提交。

## 替代方案

**保留旧 reports + runtime-review + approval + history。** 汇总文件不提供逐条判断，history 造成大量本地证据堆积，无法解决“证据太多但看不过来”的问题。该方案被否决。

**保留 review sidecar 作为唯一审核源。** sidecar 是逐场景的，同一根因跨场景时会重复；Q&A 文件更适合逐条判断和后续写 dsh.md。该方案被否决。

**只提交问答引用到的证据。** `record.json` 和截图必须提交；`session.jsonl.zstd` 含宿主路径和潜在凭证，只保留本地，不提交。

## 后果

- `playground/evidence/runs/<variant>-<environment>/` 是当前唯一审核快照；`reports/` 不再生成。
- `playground/evidence/findings/<variant>.md` 和 `review.json` 成为后续 dsh.md 和插件开发的问题来源。
- 提交体积从完整的多轮 history 降低为当前快照；历史依赖 Git，不在工作区保留。
- 本记录取代 [2026-11-11-test-driven-port-baseline.md](./2026-11-11-test-driven-port-baseline.md) 中 `reports/`、`reviews/scenarios`、`reviews/runtime-review` 和 `history` 相关部分；其余场景注册表与 baseline.json 决策仍有效。
- 当前的 `native`/`playground`/`src` 边界见 [2026-11-23-native-playground-src-boundary.md](./2026-11-23-native-playground-src-boundary.md)；快照原则仍适用，旧 `playground/harness` 路径属于历史路径。
