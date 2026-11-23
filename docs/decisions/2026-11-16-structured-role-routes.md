# 决策：角色文件路由改为结构化对象

Status: accepted
Date: 2026-11-16
Scope: src/roles/**, src/models/**, src/compat/**, port/dsh.md, port/dsh.zh.md, docs/architecture.md, tests/**
Implemented-by: commit:461d4e2
Review: 2026-11-22

## 背景

角色文件 `$DSH_HOME/pstack-models.json` 里每个角色保存 `provider/model [effort]` 字符串数组。代码在读取时按第一个 `/` 拆分 provider 和 model。原先假设 provider 不含 `/`、只有 model 可能含 `/`，这个假设不成立，provider 也可能含 `/`，于是拆分会产生歧义，`budget` 里的 `splitRoute` 也有同样问题。

本条记录替代 [2026-11-14-role-file-json-migration.md](./2026-11-14-role-file-json-migration.md) 的存储 schema 与按行编辑机制，把该记录的 version 1 字符串路由升级为 version 2 结构化对象。

## 决策

角色文件的每条路由改为结构化对象：`{ "kind": "route", "provider", "model", "effort"? }`，继承用 `{ "kind": "inherit", "alias": "auto" | "inherit-parent" }`。角色文件版本升到 `version: 2`。读取前统一由 `compat/upgrade-role-file.ts` 的 `upgradeRoleFile` 检测并迁移：`.mdc` 由 `compat/mdc-to-json.ts` 迁移成 `version: 2` JSON 并删除旧文件，`version: 1` 由 `compat/version-1-to-2.ts` 原地重写成 `version: 2` 对象，之后正常读取只处理当前版本，`compat/` 可在大版本后整目录删除。`role-store` 读写对象，`role-wire`、`role-editor`、客户端共用同一个 `Route`/`RouteView` 形状。`pstack_models` 的 catalogue 去掉 `route: "provider/model"` 字符串，改带 `provider` 字段，`budget` 直接用 `provider` 和 `id`，删除 `splitRoute`。

## 替代方案

**保留字符串，仅修补拆分。** 被否决。provider 和 model 都可能含 `/`，单个字符串无法无歧义地编码两者，任何拆分规则都是猜测。

**用另一种分隔符编码。** 被否决。仍是把结构化数据压成字符串，分隔符逃逸和校验复杂度都会回来。

## 后果

- 角色文件升级到 `version: 2`，不再需要 join、split 字符串，provider 含 `/` 也能正确表达。`version: 1` 的字符串路由兼容读取，保存时升到 2。
- `pstack_models`、`pstack_roles`、`pstack_subagent`、角色编辑器在结构化数据上对齐，模型直接拿 `provider`、`model`、`effort`。
