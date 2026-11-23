# 决策：pstack 全局文件收敛到 $DSH_HOME/pstack/

Status: proposed
Date: 2026-11-23
Scope: src/index.ts, src/lib/dsh-home.ts, src/pstack/**, src/roles/**, src/poteto/**, src/poteto-toggle.ts, src/compat/**, src/role-service.ts, src/role-catalog.ts, src/tests/**, playground/runner/worker/home.ts, README.md, README.zh.md, docs/architecture.md, docs/glossary.md, src/dsh.md, src/dsh.zh.md, docs/decisions/**
Implemented-by: -
Review: 2026-11-23

## 背景

pstack 的全局文件此前平铺在 `$DSH_HOME` 根目录，包括 `pstack-models.json`、`pstack-settings.json` 和一次性的 `pstack-repair.json`。根目录同时存放 DSH 和其他插件的文件。角色文件读取会在读路径上执行 `.mdc` 转 JSON、version 1 到 2 和当前版本清理，因此 `pstack_roles` 不能声明并发安全。Issue #36 还要新增运行时路径索引，如果继续平铺会增加一个全局文件。

## 决策

- pstack 的用户级配置和运行时数据统一放在 `$DSH_HOME/pstack/`，文件名为 `models.json`、`settings.json`、`repair.json`。
- `src/pstack/home.ts` 是当前路径和文件名的唯一来源，导出 `PstackHomePaths { root, models, settings, repair }` 和 `pstackHomePaths(dshHome = resolveDshHome())`。
- `src/compat/migrate-pstack-home.ts` 的 `migratePstackHome` 由 `src/index.ts` 的插件启动入口调用一次。它幂等迁移根目录旧 `pstack-models.json`、`pstack-models.mdc` 和 `pstack-settings.json`。当前文件存在时不覆盖，旧文件保持原样。
- 旧 `pstack-repair.json` 不迁移，也不读取。
- `readRoleConfiguration` 改为纯读，不再触发迁移。`pstack_roles` 声明为并发安全。
- 所有旧格式文件名常量、迁移脚本和兼容类型都放在 `src/compat/`。后续清理时删除该目录和 `src/index.ts` 的唯一一处调用。
- 后续 Issue #36 的 `paths.json` 使用同一目录。

## 替代方案

**保持 `$DSH_HOME` 根目录平铺。** 被否决。文件名虽有 `pstack-` 前缀，但 #36 会增加新的全局文件，目录边界会继续变宽。

**把用户级配置放进 `$DSH_HOME/profiles/<profile>/pstack/`。** 被否决。角色配置和 `potetoDefault` 需要跨 profile 共享，按 profile 放会让 Web 和 Desktop 分叉。

**放进 `$DSH_HOME/storages/`。** 被否决。`models.json` 是用户会直接编辑、`/setup-pstack` 会写入的文档，storage domain 的内部记录格式不适合。

**保留读取时迁移，只改路径。** 被否决。读路径会带写入副作用，`pstack_roles` 不能并发安全；启动时一次性迁移把副作用移出读路径。

## 后果

- 首次启动把旧根目录文件迁入 `$DSH_HOME/pstack/`，之后运行时只读写当前路径。
- 迁移重复执行不产生重复文件，当前文件优先。
- 文件移动失败或旧 `.mdc` 无法解析时记录到 `PstackHomeService.migrationErrors`，不阻止服务启动；角色页以可保存的 missing 状态显示错误，修复旧文件后可重试迁移或直接保存新的角色文件恢复。
- `pstack_roles` 变为并发安全，角色文件读取不再写盘。
- 旧 `pstack-repair.json` 保持原样，不再被读取。
- Issue #36 可以直接使用 `$DSH_HOME/pstack/paths.json`。
- 相关记录：[2026-11-16-structured-role-routes.md](./2026-11-16-structured-role-routes.md) 记录角色文件 schema；本记录改变其迁移执行时机，并把路径和目录决策统一到这里。
