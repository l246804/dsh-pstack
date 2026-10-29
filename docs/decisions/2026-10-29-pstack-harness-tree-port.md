# 决定：pstack 生成树以上游原文加本地 harness 适配树为输入

Status: proposed
Date: 2026-10-29
Scope: pstack/**
Implemented-by: -
Review: 2027-04-29

## 背景

pstack 生成树此前由 `upstream/cursor-plugins/pstack` 加 `pstack/overlay/` 覆盖层渲染：覆盖层按生成树路径整份替换上游文件，`overlay.yml` 为每个被替换文件登记 `replaces`、`revision` 与 `sha256`，`verify:overlay` 在渲染前核对哈希，不符就让构建失败。

这带来三个问题：

- 覆盖层改写了上游页面本身（`docs/guide/01-setup.md`、`skills/poteto-help/SKILL.md` 等），把 DSH 文本混进上游正文；上游每次更新都要人工维护第二份正文，无法区分差异来源。
- 覆盖层每条都钉住上游文件的精确哈希，上游任何一次编辑都会让 `verify:overlay` 失败，即使该页仍然适用；`d1453c1..1ba91fc` 更新中 `skills/poteto-help/SKILL.md` 变更即触发该失败。
- 移植契约要求上游页面、技能、playbook、reference 保持原文，DSH 文本差异只进入本地 harness 适配树；覆盖层与该口径冲突。

## 决定

生成树以上游原文加本地 harness 适配树 `pstack/harness/` 为输入：

- 主适配器 `docs/harness/claude-code.md` 对应本地 `pstack/harness/docs/harness/dsh.md`；其他上游 `docs/harness/` 附件保持上游相对路径与文件名，按同一规则获得本地对应文件，不维护固定附件清单。
- 生成脚本 `pstack/scripts/generate-pstack-harness-tree.mjs` 逐路径优先读取 `pstack/harness/`，否则读取上游原文；主适配器替换上游 CC 适配器进入生成树，并按当前主适配器给使用 Cursor 名字的技能插入一次会话读取提示、检查名称映射与相对链接。
- 删除覆盖层 `pstack/overlay/`、`overlay.yml` 与 `verify:overlay`；上游页面、技能、playbook、reference 不再整份改写。
- 上游所有脚本仍按既有约定在 `pstack/runtime/skills/<技能>/scripts/**` 重写为 Node，并由 `vite-plus` 编译后经 `replace:scripts` 整目录替换随包脚本；本决定不改脚本执行模型。

## 备选方案

- **保留覆盖层整份替换。** 不选：它改写上游正文、每条钉死哈希，上游一改页就断构建，且与「上游原文 + 本地适配树」的移植口径冲突。
- **手工维护一份 fork 的 pstack 树。** 不选：上游每次更新都要人工 diff，无法区分差异来自上游还是本地。
- **把 DSH 差异继续写进上游页面（多层覆盖）。** 不选：仍是改写上游正文，只是换了目录名，不解决差异归属问题。

## 后果

- 得到一条与上游 CC 适配一致的结构：上游原文 + 一份 DSH 适配文档；`generate --check` 仍能发现生成树漂移。
- 代价：本地 harness 适配树只承载适配文档，不再能整份改写上游页面；页面级 DSH 差异（如安装命令、模型文件名）改由主适配器文档映射说明，阅读者需同时看原文与适配表。
- 代价：失去逐文件哈希这一层保护，上游适配文档变更不再在构建期被拦截；靠 `generate` 的名称映射与链接检查兜底，需在适配文档评审时人工留意。
- 重新考虑的条件：DSH 需要改写上游页面正文（而非映射），或上游提供官方的 DSH 适配附件。
