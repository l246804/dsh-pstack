# 决定：pnpm 依赖声明按用途使用 catalog 分类

Status: accepted
Date: 2026-10-30
Scope: package.json, pnpm-workspace.yaml, pnpm-lock.yaml
Implemented-by: commit:45d44ebd3f7ea93ea6a354724a5679d5d5ecd302
Review: 2027-04-30

## 背景

根包和两个内部工作区共享同一套依赖版本；`pnpm-workspace.yaml` 已用 `types`、`cli`、`testing`、`inlined` 等 catalog 管理版本，避免多个 `package.json` 出现同一包的字面版本。新增角色配置页引入 DSH 客户端包、Typert 运行时和 React 工具链；若在 `package.json` 写死版本，升级 DSH 或 React 时要逐处同步，且 `catalog:` 名称无法表达依赖用途。

## 决定

依赖按用途登记到 `pnpm-workspace.yaml` 的 catalog，`package.json` 只引用 `catalog:<名称>`：

- `catalog:types`：DSH 运行时/类型包（`dsh-typert-protocol`、`dsh-api-gateway`、`dsh-client-*`、`dsh-typert-registry`）与 `@types/node`。
- `catalog:ui`：`react`、`react-dom`、`@types/react`、`@types/react-dom`。
- 既有 `agentic`、`cli`、`testing`、`inlined` 分类保持不变。

`pnpm-lock.yaml` 由 pnpm 生成并提交；`pnpm pack` 会把 `catalog:` 引用改写为实际版本。

## 备选方案

- 在 `package.json` 写死版本。不选：同类依赖容易版本漂移，升级时需逐处修改。
- 全部依赖放进 `types` catalog。不选：React/类型工具链与 DSH 包用途不同，混合后升级边界和分类含义不清。
- 每个包单独 catalog。不选：增加命名和同步成本，当前仓库规模不需要。

## 后果

DSH 与 React 升级只需修改 catalog 条目；依赖用途可从 `catalog:` 名称直接看出。新增依赖必须先选择分类，不能回退到字面版本；改 catalog 后必须用 pnpm 重新生成锁文件。
