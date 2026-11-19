# 发布边界

本文件记录版本事实的读取位置、README 兼容表分组规则和发布同步流程。发布说明的编写规则见 [changes/AGENTS.md](../changes/AGENTS.md)。

## 版本事实

- pstack 版本钉定在 `native/upstream.lock.json`（`pstackVersion` 与上游 commit），由 `native/scripts/fetch-upstream.ts` 维护；它不是 playground 的测试基线。
- DSH 兼容范围以 `package.json` 的 `engines.dsh` 为准，不维护手写兼容键。
- 公开工具清单在 `src/surface.json`，由 `scripts/release-surface.ts` 从工具工厂导出。

## README 兼容表规则

- 兼容表按 DSH 范围分组。每个分组是一个 `**DSH \`<range>\`**` 小标题加一张两列表，列出该范围内各 dsh-pstack 发布版本及其打包的 pstack 版本。
- 行身份是 DSH 范围，来自 `package.json` 的 `engines.dsh`。
- 根 README 只保留最新的三个 DSH 范围分组，更早的分组自动移入 `docs/compatibility-history.md` 与 `docs/compatibility-history.zh.md`。
- 只有 DSH 出现破坏性变更时才新增一个分组，例如 rc.1 → rc.2。非破坏性的 DSH 升级不新增分组，范围 `>=0.2.2-rc.2` 已包含后续 rc.3 等更新。
- pstack 版本变化不新增分组，只在该分组内新增一个发布行并标注 pstack；每个 x.y 只保留最新 z。
- 发布时 `bump.config.ts` 调用 `scripts/release-compatibility.ts` 的 `syncCompatibility`，按当前版本、`engines.dsh` 和钉定的 `pstackVersion` 维护兼容表。
- `vp run compatibility:check` 做只读一致性检查。

## 发布同步

- 发布版本变更、`pstackVersion` 变更和兼容表分组的增删在同一个发布准备批次中完成。
- 破坏性适配同时更新 `package.json` 的 DSH 范围，并在各本地化 README 新增对应兼容分组。
- 兼容表由 `scripts/release-compatibility.ts` 直接维护，不手写。
