# 架构

本文件只描述系统现在的样子。为什么演变成这样，见 `docs/decisions/`。

## 模块

| 模块 | 目录与入口 | 职责 |
|---|---|---|
| 根打包 | 根 `vite.config.ts`、根 `package.json` | 用 vite-plus 打包，并把生成树与技能复制进 `dist/`；npm 只发布 `dist/`、`assets/`、`cordis.patch.yml` |
| pstack 工作区（`@internal/pstack`） | `pstack/package.json`、`pstack/vite.config.ts` | 编译运行时脚本、生成移植树、组装 `pstack/dist/` |
| 覆盖层 | `pstack/overlay/`、`pstack/overlay/overlay.yml` | 手写文件按路径镜像生成树，替换上游同名文件；`overlay.yml` 记 `replaces`、`revision`、`sha256` |
| 运行时 | `pstack/runtime/skills/<技能>/scripts/**` | 可执行脚本的 TS 源码，编译成 mjs 后替换随包树里上游附带的脚本 |
| 生成器 | `pstack/scripts/*.mjs` | `generate`（渲染生成树）、`copy:pstack`（拷贝）、`replace:scripts`（替换脚本） |
| 生成树 | `pstack/pstack/` | 由 `upstream/cursor-plugins/pstack` 加覆盖层渲染；每次构建整棵替换，不进 git |
| 技能工作区（`@internal/skills`） | `skills/package.json`、`skills/authored/`、`skills/vendored/`（→ `.agents/skills`） | 非上游技能；`authored/` 手写、`vendored/` 带哈希与提交号（记于 `skills-lock.json`） |
| 上游子模块 | `upstream/cursor-plugins`、`upstream/deepseek-harness` | 生成树的来源，与 DSH 宿主的参考实现 |
| 发布产物 | `dist/`（.gitignore） | npm 实际发布内容：`index.mjs`、`pstack/`、`skills/` |

## 依赖方向

```
upstream/cursor-plugins/pstack + pstack/overlay
        │ generate
        ▼
   pstack/pstack ──copy:pstack──▶ pstack/dist/pstack
                                      ▲
pstack/runtime ──vp pack──▶ pstack/dist/runtime ──replace:scripts──┘

skills/authored + skills/vendored ──根 vp pack──▶ dist/skills
根 src/*.ts ──根 vp pack──▶ dist/index.mjs
```

上游只向下游流动：生成树与 `dist/` 不反向修改上游；`pstack/pstack/` 是渲染结果，手写内容一律进 `pstack/overlay/`。

## 扩展点

- **改上游页面**：写 `pstack/overlay/<同路径>`，并在 `overlay.yml` 登记 `replaces`、`revision`、`sha256`；不要直接改 `pstack/pstack/`。
- **新增技能**：手写放 `skills/authored/<名>/SKILL.md`；第三方放 `skills/vendored/` 并登记哈希与提交号。
- **新增或修改脚本**：改 `pstack/runtime/skills/<技能>/scripts/`，并把技能名加入 `pstack/scripts/replace-scripts.mjs` 的 `REPLACED` 列表。

## 已知缺口

- 根 `src/` 不在本分支（由 `1a07502` 删除），但根 `vite.config.ts` 仍以 `./src/*.ts` 为打包入口；`dist/index.mjs` 是旧产物，当前无法从零重建插件入口。
- vendored 技能来源记在 `skills/skills-lock.json`，不存在单独的 `skills/sources.yml`。

本节记录的是当前事实；缺口修复或消失后同步更新。
