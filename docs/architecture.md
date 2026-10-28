# 架构

本文件只描述系统现在的样子。为什么演变成这样，见 `docs/decisions/`。

## 模块

| 模块 | 目录与入口 | 职责 |
|---|---|---|
| 根打包 | 根 `vite.config.ts`、根 `package.json` | 用 vite-plus 打包，并把生成树与技能复制进 `dist/`；npm 只发布 `dist/`、`assets/`、`cordis.patch.yml` |
| pstack 工作区（`@internal/pstack`） | `pstack/package.json`、`pstack/vite.config.ts` | 编译运行时脚本、生成移植树、组装 `pstack/dist/` |
| 覆盖层 | `pstack/overlay/`、`pstack/overlay/overlay.yml` | 手写文件按路径镜像生成树，替换上游同名文件；`overlay.yml` 记 `replaces`、`revision`、`sha256`，`verify:overlay` 在渲染前核对上游哈希 |
| 运行时 | `pstack/runtime/skills/<技能>/scripts/**` | 可执行脚本的 TS 源码，编译成 mjs 后替换随包树里上游附带的脚本 |
| 生成器 | `pstack/scripts/*.mjs` | `verify:overlay`（渲染前校验覆盖层）、`generate`（渲染生成树）、`copy:pstack`（拷贝）、`replace:scripts`（替换脚本） |
| 生成树 | `pstack/pstack/` | 由 `upstream/cursor-plugins/pstack` 加覆盖层渲染；每次构建整棵重建，生成结果提交进 git，`generate --check` 用它比对漂移 |
| 技能工作区（`@internal/skills`） | `skills/package.json`、`skills/authored/`、`skills/.agents/skills/`（`skills experimental_sync` 的落盘目录） | 随包发布的非上游技能；`authored/` 手写、`.agents/skills/` 是 vendored 技能（构建时以 `vendored/` 落进 `dist/skills`），带哈希与提交号（记于 `skills-lock.json`） |
| 仓库维护技能 | 根 `.agents/skills/<名>/SKILL.md` | 供维护本仓使用，不进入 `dist/` 或随包技能工作区 |
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

skills/authored + skills/.agents/skills ──根 vp pack──▶ dist/skills
  （后者在 dist 里落名为 vendored/）
根 src/*.ts ──根 vp pack──▶ dist/index.mjs
```

上游只向下游流动：生成树与 `dist/` 不反向修改上游；`pstack/pstack/` 是渲染结果，手写内容一律进 `pstack/overlay/`。

## 扩展点

- **改上游页面**：写 `pstack/overlay/<同路径>`，并在 `overlay.yml` 登记 `replaces`、`revision`、`sha256`；不要直接改 `pstack/pstack/`。`generate` 依赖的 `verify:overlay` 会核对上游文件哈希，不符就停在渲染前。
- **新增技能**：随包手写技能放 `skills/authored/<名>/SKILL.md`，仅供维护本仓的技能放根 `.agents/skills/<名>/SKILL.md`；第三方随包技能把 `source` 与技能名加进 `skills/package.json` 的 `skills` 数组，跑 `skills experimental_sync`，哈希与提交号自动记入 `skills/skills-lock.json`。仓库里没有 `skills/vendored` 目录或符号链接：`vp pack` 的清理步骤会顺着指向 `.agents/skills` 的符号链接删掉源文件，拷贝步骤又会把链接按本机绝对路径写进产物；所以构建直接从 `.agents/skills` 拷贝并 `rename` 成 `vendored`。
- **新增或修改脚本**：改 `pstack/runtime/skills/<技能>/scripts/`，并把技能名加入 `pstack/scripts/replace-scripts.mjs` 的 `REPLACED` 列表。

## 已知缺口

- 根 `src/` 不在本分支（由 `1a07502` 删除），但根 `vite.config.ts` 仍以 `./src/*.ts` 为打包入口；`dist/index.mjs` 是旧产物，当前无法从零重建插件入口。
- vendored 技能来源记在 `skills/skills-lock.json`，不存在单独的 `skills/sources.yml`。

本节记录的是当前事实；缺口修复或消失后同步更新。
