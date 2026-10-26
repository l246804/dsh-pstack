# 决定：构建写入、校验只读，发布拒绝过期

Status: accepted
Date: 2026-10-26

> **部分被取代（2026-10-26）。** 下面"聚合"一节里 `"release": "check && build:bundle && check:pack"` 与 `"prepublishOnly": "release"` 两个名字已改：`release` 现在就是 `bumpp`，发布门移到 `prepublishOnly` 里写一次。理由是 `release` 在 main 分支和多数 npm 项目里指"发一个版本"，放在只读校验命令上名不符实。见 [发布流程决策](2026-10-26-release-automation.md)。本记录其余判断（`build` 负责写、`check` 只读、`build:assets` 自带 `build:runtime`、`check:runtime` 放进 `check:assets`）全部继续有效，正文保留原文不改写。
>
> **`check:pack` 与 `check:upstream` 已删除（2026-10-26）。** 本记录为 `check:pack` 论证的三个缺口仍然真实，结论改为"不值得为一条低频、单人、有 `pnpm publish --dry-run` 可看输出的人工发布路径维持一道 439 行的门"。`check` 现为 `check:assets && check:scripts && typecheck && test`，`prepublishOnly` 为 `check && build:bundle`。见 [V2 后收敛决策](2026-10-26-slimming-after-v2.md)。下面提到这两道门的段落按该记录理解。

本记录取代[发布验收分期](2026-10-25-release-verification-staging.md)第 1 条里那份逐条列出的静态门顺序：门的内容不变，命令名与分层按本文。旧记录不改写。

## 背景

`package.json` 里原来有九个命令，`build` 只是 `vp pack`。三种产物构成一条单向链：

```
src/ + scripts/runtime/  →  runtime/  →  assets/  →  dist/
```

每一跳都可能断，且断掉时 `pnpm build` 一律返回 0。实测到的四种断法：

1. **`runtime/` 落后于源码时，`assets/` 看起来"对得上"。** 改 `scripts/runtime/log.ts` 的一个字面量后只跑 `pnpm sync`，它把**旧的** `runtime/log.mjs` 复制进 `assets/`，紧接着 `sync:check` 报 "assets/ matches a fresh build"。只有 `check:runtime` 能看出 `runtime/log.mjs` 与源码不一致。也就是说 `sync` 不是"从源码重建"，是"把当前 `runtime/` 搬进 `assets/`"。
2. **`dist/` 与 manifest 对不上，没有任何门在看。** `dist` 在 `.gitignore` 里；`check:assets` 的 `checkPackageManifest` 只验证 `exports` 的**键**存在，不验证目标文件存在。往 `dist/script.mjs` 追加一行垃圾后，`check:assets` 与 `pnpm test` 都退出 0。
3. **缺 `dist/` 仍能打包。** 把 `dist/` 挪走，`pnpm pack --dry-run` 退出 0，条目从 166 掉到 149。发布链上没有任何一步读 tarball。
4. **`check` 里的 `check:runtime` 是空转。** 它前面紧跟 `build:runtime`，所以永远绿。

命名层面还有三个问题：`sync` 名不副实（不同步 submodule），`check` 既写盘又验证，`sync:check` 与 `check:assets` 把"assets 与源码一致"和"assets 内部规则一致"分成两个容易只跑一个的名字。

## 决定

按**写不写 tracked 文件**分两层，三个聚合命令。

```jsonc
// 写：build:<target>
"build:runtime": "node scripts/build-runtime.ts",                  // 写 /runtime（gitignored）
"build:assets":  "pnpm run build:runtime && node scripts/sync-upstream.ts",  // 再写 assets/（tracked）
"build:bundle":  "vp pack",                                        // 写 dist/（gitignored）
"build":         "pnpm run build:assets && pnpm run build:bundle", // 完整构建
"dev":           "pnpm run build:assets && vp pack --watch",

// 读：check:<target>
"check:upstream": "node scripts/check-upstream-tree.mjs",
"check:runtime":  "node scripts/build-runtime.ts --check",
"check:assets":   "pnpm run check:runtime && node scripts/sync-upstream.ts --check && node scripts/check-assets.ts",
"check:scripts":  "node scripts/check-scripts.ts",
"check:pack":     "node scripts/check-pack.ts",                    // 新增
"typecheck":      "tsc --noEmit",
"test":           "vp test",

// 聚合
"check":   "check:upstream && check:assets && check:scripts && typecheck && test",  // 只读
"release": "check && build:bundle && check:pack",
"prepublishOnly": "release"
```

四条关键取舍。

**`build:assets` 自带 `build:runtime`。** 这直接封掉 §背景 第 1 条：想让 `assets/` 更新，就必须先让 `runtime/` 从源码重建。

**`check:assets` 自带两个 `--check` 前置。** "assets 与源码一致"和"assets 内部规则一致"合成一个门。只跑 `check-assets.ts` 的人现在拿不到假绿：前置先比字节。第二个前置写成裸 `node scripts/sync-upstream.ts --check` 而不是一个具名脚本，是因为它只在这里有第二个用处，多一个 `sync:check` 就是多一个"只跑其中一个"的机会。

**`check:runtime` 在 `check:assets` 里，不在 `check` 顶端。** 它本身没错，错在原来的位置——紧跟在 `build:runtime` 后面必然通过。放进 `check:assets` 后，它比较的是"仓库里的 `runtime/`"与"从源码重建的结果"，也就是真的在验证时效。

**`check` 不写任何 tracked 文件，`release` 才打包。** 于是 CI 的固定序列是 `build:runtime` → `check` → `build:bundle` → `check:pack`。`check:assets` 里的字节比对拿到的基准是刚重建的 `runtime/`，而 `assets/` 仍是仓库原样，它才真的能证明"提交的生成树可由源码重建"。

新增的 `check:pack`（`scripts/check-pack.ts`）补三件事：

- 从生成器、`dist/`、`locale/`、`static/`、根文件**推导**应有条目集合，与 `pnpm pack --dry-run --json` 逐条比对，并按 `assets`/`dist`/`locale`/`static`/`root` 五栏打印。发布清单里的 166 从"手抄的基线"变成"现场可复现的输出"。
- 校验 `exports` 里每个目标**文件存在**、不是目录、且在 `files` 覆盖范围内。这是缺 `dist/` 时唯一会红的门。
- 读 `dist/script.mjs` 与 `dist/subagent.mjs`，确认它们分别携带 `RUNTIME_CLIS[].assetPath` 和 `ROLE_MANIFEST[].key`。这两个表在编译期被内联进字节，manifest 改了没重打包，运行时症状是"脚本找不到"，与已修复的 `pstack_script` 缺陷同一形态。

## 备选方案

- **只把 `build` 改成 `vp pack` + `sync` + `build:runtime`，其余不动。** 放弃：这只解决了"忘了某一步"，不解决"忘了之后还能拿到假绿"。`check:runtime` 继续空转，`check:pack` 缺口继续存在，`sync` 继续会把过期 `runtime/` 搬进 tracked 树。
- **让 `build` 直接包含 `check`。** 放弃：那会让"构建"在生成树漂移时失败，而漂移正是 `build:assets` 要修的。构建负责写，校验负责读，一个命令兼两个语义就是原来 `check` 的问题。
- **让 `prepublishOnly` 跑 `build`（写）+ `check:pack`。** 放弃：发布时静默改写 `assets/` 会打出一个仓库里不存在的树，而 npm 的 tarball 与 git 内容不一致时，问题在下一次 `git diff` 才暴露。发布应当**拒绝**过期状态，不是修复它。
- **`check:pack` 里重跑 `vp pack` 到临时目录再逐字节比对。** 放弃：`vp pack` 的输出目录固定由 `vite.config.ts` 决定（`clean: true`），指向 `dist`。我实测过同一目录连跑两次字节一致，不同深度的 out-dir 因 sourcemap 里 `sources` 的相对路径而不同——所以"在仓库根另开一个输出树"既不可比，也正是[静态资源目录决策](2026-10-26-static-resource-directory.md)反对的"根目录随手放东西"。改为：打包在 `release`/`prepublishOnly` 里必跑，`check:pack` 只验证产物形状。
- **保留 `sync` 与 `sync:check` 作为别名。** 放弃：别名让"同一个行为两个名字"永久留在脚本表里，读的人要多记一层，而旧名出现在文档里正是本次要一并改掉的东西。改名成本只有三处文档 + 两条提示文案，一次改完，不留双写。
- **统一成 `build:*` / `check:*` 之后连 `typecheck`、`test` 一起改名。** 放弃：`test` 被 npm 生命周期和所有编辑器识别，`typecheck` 是社区通名；为一致性返工会让既有文档和肌肉记忆全部失效，收益只有命名好看。

## 后果

得到：一条命令写到底（`pnpm run build`），一条命令只读验证（`pnpm run check`），一条命令做完整发布前检查（`pnpm run release`，也是 `prepublishOnly`）。缺 `dist/`、`exports` 指向不存在的文件、manifest 改了没重打包、tarball 少了条目——四类原来静默的问题现在都有门。`check` 从 17.5s 降到 15.7s（少了空转的 `check:runtime` 与最终 `build` 的重复，代价是多了 `check:assets` 里的字节比对前置），`release` 约 17.4s。脚本表从 9 条变成 15 条，但每个名字只对应一个行为，没有别名。

代价：`check` 不再顺带产出 `dist/`，所以"跑完 check 就有可安装的包"不再成立，需要显式 `build:bundle`。`check:assets` 现在有两个前置子命令，单独跑它比原来慢约 1s。旧名 `sync` / `sync:check` 已删除，凡是照着旧文档敲命令的人需要改用 `build:assets` / `check:assets`。

重新考虑的条件：如果未来 `vp pack` 支持把输出写到临时目录并保留可比性，`check:pack` 可以升级成"重建并逐字节比对 `dist/`"，那时 `dist` 的过期就由门直接封住，而不是靠 `prepublishOnly` 必跑。另一个触发点是 CI：如果 CI 只允许一条命令，就需要一个 `ci` 聚合把 `build:runtime`、`check`、`build:bundle`、`check:pack` 串起来，而不是让 `check` 承担写盘。
