# 决定：pstack 以生成树为唯一产物，脚本在 runtime 重写为 Node

Status: proposed
Date: 2026-10-28
Scope: pstack/**
Implemented-by: -
Review: 2027-04-28

## 背景

pstack 是上游 `cursor/plugins` 里的 Cursor 插件（`upstream/cursor-plugins/pstack`）。它的技能文本全是 Cursor 语境：工具名（`Task`、`AskQuestion`）、子代理字段、模型 slug、`.cursor/` 路径；脚本则绑死两个运行时前提——`bun`（`#!/usr/bin/env bun`、`bun:test`、`bootstrap.ts` 里的 `bun install`）和 `bash`（`scripts/log.sh`、`scripts/worktree-audit.sh` 依赖 `bash`、`jq`、`awk`）。

要把它作为 DeepSeek Harness 插件发布，必须同时满足三件事：

- 技能与文档能在 DSH 里读到、并照着做；
- 脚本能在 DSH 的 Node 运行时里执行，桌面端这个 Node 是内置 Electron 带的 Node；
- 脚本用到的三方依赖在安装插件时由 profile 的 pnpm 装好，而不是让用户再手工准备一套。

上游自己给的适配先例是 `docs/harness/claude-code.md`：技能原文不动，另写一份宿主适配文档，把 Cursor 名字逐项映射到目标宿主的工具与路径。DSH 的移植沿用这种「原文 + 一份宿主适配文档」的形态。

## 决定

`pstack/pstack/` 是 `pstack/scripts/generate-pstack-harness-tree.mjs` 从上游渲染出的生成树，是唯一要发布的内容，不手工编辑。文本差异放到 `pstack/overlay/`，按生成树内的路径镜像；`overlay.yml` 为每个改写上游文件登记 `replaces`、`revision`、`sha256`，`verify:overlay` 在渲染前核对上游文件哈希与 pin 的 revision，不符就让构建失败。宿主适配文档 `docs/harness/dsh.md` 登记为 `replaces: none`，是 DSH 自己的文档，没有可比对的上游文件；它的内容规则不在本记录范围内。

上游所有脚本在 `pstack/runtime/skills/<技能>/scripts/**` 下重写为 Node 脚本，目录结构逐一对应上游脚本的真实路径：

- `bun:test` 改为 `node:test`，用一个最小的 `expect` 适配层和三方 `Bun.spawnSync` / `Bun.spawn` 适配层替掉 Bun 专有 API，测试断言体尽量保持上游原文；
- `scripts/*.sh` 与 `#!/usr/bin/env bun` 的入口改写为 Node 等价实现（Git 操作走 `node:child_process`，会话 JSON 走 `JSON.parse`）；
- 上游入口里用 `bootstrap.ts` 自装依赖的步骤删除，依赖改由包自己的 pnpm 安装。

这些脚本由 `vite-plus` 以 `root: "."`、`unbundle: true` 编译成 `.mjs`，输出路径与源树镜像（`dist/runtime/skills/<技能>/scripts/...`）。`pstack/scripts/replace-scripts.mjs` 再把 `dist/runtime/.../scripts` 整目录替换进 `dist/pstack/skills/<技能>/scripts`，于是随包树里只剩可执行的 `.mjs`，不再留 `.sh`、`.ts` 或 `bun.lock`。替换哪些技能由该脚本的 `REPLACED` 列表显式声明，多出一个没有登记的技能脚本目录就报错，避免「复制决定发布内容」。

脚本需要的三方依赖（目前是 `commander`）声明为包的生产依赖，由安装插件的 pnpm 自动装好；编译产物里不再复制一份依赖。

移植后的正确性分两处校验——覆盖层由 `pstack/scripts/verify-overlay.mjs` 在 `generate` 前独立校验，其余由生成器在渲染时对照上游校验：

- `overlay.yml` 里每个 `sha256` 必须等于它声明的上游文件当前哈希，`path` 与 `replaces` 必须成对，且 `pstack/overlay/` 下不能有未登记的文件；
- 每个技能的 frontmatter `name` 必须等于文件夹名，且符合技能名格式；
- 技能正文里出现的每个 Cursor 专有名词（`Task`、`AskQuestion`、模型 slug、`.cursor/` 路径等）必须在宿主适配文档里有对应行；
- 相对链接指向的文件必须在生成树里存在，否则改写成上游 GitHub 地址，指向树内却缺失即失败；
- `--check` 模式把磁盘上的 `pstack/pstack/` 与当前渲染结果逐字节比对，漂移即失败。

## 备选方案

- **手工维护一份 fork 的 pstack 树。** 不选：上游每次更新都要人工 diff，无法区分差异来自上游还是本地；覆盖层的 `sha256` 与漂移检查也就失去意义。
- **保留上游的 bun/bash 脚本，运行时再装 bun 和 bash 工具链。** 不选：DSH 用 Node 执行脚本，桌面端是 Electron 的 Node，没有 `bun`；`.sh` 还依赖 `bash`、`jq`、`awk`，目标环境不保证存在。
- **直接在生成树里改脚本，或把脚本也逐文件放进覆盖层。** 不选：生成树每次构建整棵重建，就地改动会丢；脚本是整目录替换且带测试，用覆盖层逐文件镜像既啰嗦又容易漏。放在 `runtime` 按真实路径重写、构建后整目录替换，才既保留可读的源路径又可预测地落位。
- **把 `commander` 等依赖随包 vendored。** 不选：安装插件时 profile 的 pnpm 已按 `dependencies` 装好依赖，再带一份会钉死本仓构建版本并遮蔽实际安装的版本。

## 后果

- 得到一条可重复的移植流程：改上游页面写覆盖层，改脚本写 `runtime`，其余由 `generate` 与 `replace:scripts` 产出。
- 上游改动会在构建期暴露：被覆盖的上游文件哈希不符，或新出现的 Cursor 专有名词没有适配行，都会让 `generate` 直接失败，而不是静默发布一棵过时的树。
- 代价：`runtime` 里的脚本是上游脚本的第二实现，上游脚本行为改变时要人工同步（`support.ts` / `expect.ts` 适配层把同步面压到最小，但不为零）。
- 代价：上游的 `automations/`、`.cursor-plugin/`、`assets/` 等 Cursor 专有目录不进入生成树，相关步骤只能靠宿主适配文档里「跳过」的规则处理。
- 重新考虑的条件：DSH 运行时改变脚本执行模型（例如不再用 Node，或自带 bun），或上游 pstack 不再提供可生成的结构、需要改为独立维护。
