# 决策：以显式兼容键和 x.y 槽位维护发布兼容表

Status: superseded
Date: 2026-11-08
Scope: bump.config.ts, package.json, tsconfig.json, vite.config.ts, README.md, README.zh.md, docs/architecture.md, port/AGENTS.md, playground/cases.lock.json, port/release-compatibility.ts, tests/release-compatibility.test.ts, .github/workflows/release.yml
Implemented-by: commit:0ae9631217ef3d30c3fdb3b118b27f3d1fa2c999
Review: 2026-11-11
Superseded-by: 2026-11-11-test-driven-port-baseline.md — cases.lock 已删除，发布兼容键迁到 playground/baseline.json

## 背景

`release` 原本只调用 `bumpp` 更新包版本并提交、打 tag，双语 README 的兼容表依赖人工同步。发布 beta、rc、正式版和补丁时，手工维护容易遗漏，也不能根据 semver 或 `type!:` 判断是否出现新的 DSH/pstack 兼容边界。

移植 lock 的 `baseline.id` 记录具体审核提交，会随普通上游升级变化；它不适合作为稳定的兼容系列标识。同时，同一兼容系列的不同 x.y 版本需要保留最新补丁，不能每次发布都新增整行，也不能让新版直接覆盖整个系列。

## 决策

- `playground/cases.lock.json` 的 `baseline.compatibilityKey` 标识一套兼容适配。普通上游升级保持该键；破坏性适配在实现提交中更新该键和 DSH 范围。发布脚本不从 semver 推断兼容性。
- 双语 README 在表格上方用不可见的兼容键元数据绑定每行。每行保留 DSH 范围、该系列各 x.y 的最新 z 版本和当前 pstack 基线。预发布、正式版和补丁替换同一 x.y 槽位，新 x.y 追加到同一单元格，新兼容键新增行。
- `port/release-compatibility.ts` 在 `bumpp` 更新版本后、发布提交前运行，同步双语 README；`bump.config.ts` 的 `execute` 钩子把双语 README 加入 `updatedFiles`，发布提交显式包含 `package.json` 与双语 README。
- 版本比较遵循 semver：允许 rc 晋升为正式版，拒绝用旧版本覆盖同 x.y 的较新版本。历史兼容行保持不变；元数据缺失、键范围冲突、双语不一致或表格格式异常时停止发布。
- `vp run compatibility:check` 和发布工作流以只读方式验证同步结果。

## 替代方案

**按 major、beta、rc 或 `type!:` 自动判断兼容边界。** 版本号只能描述本插件发布形态，不能证明 DSH 或 pstack 是否需要新适配，因此拒绝。

**每次发布追加完整历史行。** 这会让普通预发布和补丁不断膨胀表格，违背每行只保留各 x.y 最新补丁的目标，因此拒绝。

**每个兼容系列只保留最新一个插件版本。** 这会删除仍有用的旧 x.y 补丁入口，因此拒绝。

## 后果

- 普通发布自动更新当前行；破坏性适配仍需开发者在实现时明确更新兼容键，自动化不能替代这项判断。
- 修改兼容键元数据或表格格式需要同步更新解析器和测试。
- 本记录已由 `commit:0ae9631` 落地，实现锚点位于默认分支历史中。
