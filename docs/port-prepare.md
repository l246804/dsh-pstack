# pstack 移植结构整理报告

本文件是 `/pstack-port prepare` 的本轮产物，只记录结构、目录映射、最小修正与构建验证。需求调查、脚本行为等价与适配文档内容分别留给 `audit`、`implement`、`doc`。

## 1. 基线

| 上游 | 检出路径 | 提交 | 版本 |
|---|---|---|---|
| pstack | `upstream/cursor-plugins/pstack` | `1ba91fc25c0977741dd0e267849e6234b037ed0a` | `0.15.36`（`plugin.json`） |
| DSH | `upstream/deepseek-harness` | `f3803c96974ad4a94195fb97e5c637e9c2a3afe3` | `0.2.2-alpha.2` |

本轮由 `upstream` 分支把 pstack 从 `d1453c1`（0.15.29）更新到 `1ba91fc`（0.15.36），DSH 无更新。整理前仓库仍是 `pstack/overlay/` 覆盖层旧结构，与移植契约要求的「上游原文 + 本地 harness 适配树」口径不符；本轮迁移到 `pstack/harness/`。

## 2. 结构追踪表（上游路径 → 手写位置 → 生成位置 → 随包位置）

| 上游资产 | 手写位置 | 生成位置 | 随包位置 |
|---|---|---|---|
| `skills/<技能>/SKILL.md` 及其 `references/`、`playbooks/`、模板 | 无（上游原文；DSH 差异只进主适配器） | `pstack/pstack/skills/<技能>/…` | `dist/pstack/skills/<技能>/…` |
| `docs/harness/claude-code.md`（主适配器） | `pstack/harness/docs/harness/dsh.md`（替换主适配器；当前唯一上游 harness 附件） | `pstack/pstack/docs/harness/dsh.md` | `dist/pstack/docs/harness/dsh.md` |
| `docs/guide/**`、`README.md`、`agents/**`、`LICENSE` | 无（上游原文） | `pstack/pstack/…` | `dist/pstack/…` |
| `skills/poteto-mode/scripts/**`、`skills/show-me-your-work/scripts/**` | `pstack/runtime/skills/<技能>/scripts/**`（Node 等价实现） | `pstack/pstack/skills/<技能>/scripts/**`（上游原文，随后被 `replace:scripts` 整目录替换） | `dist/pstack/skills/<技能>/scripts/**`（编译 `.mjs`） |
| `skills/statechart/scripts/**` | 无（尚未移植，见 §4） | `pstack/pstack/skills/statechart/scripts/**`（上游原文） | `dist/pstack/skills/statechart/scripts/**`（上游 `.ts` + `sh` 启动器） |
| 根插件能力 | 根 `src/*.ts`、`cordis.patch.yml` | — | `dist/{index,models,script,skill,subagent}.mjs` |

生成器 `pstack/scripts/generate-pstack-harness-tree.mjs` 按生成树相对路径优先读取 `pstack/harness/`，否则读取上游原文；主适配器替换上游 CC 适配器进入生成树，并按主适配器为使用 Cursor 名字的技能插入一次会话读取提示、检查 frontmatter 名称与相对链接；`--check` 逐字节比对生成树漂移。

## 3. 最小修正

1. **迁移本地适配树**：`pstack/overlay/docs/harness/dsh.md` → `pstack/harness/docs/harness/dsh.md`（内容未改，内容修订留给 `doc`）。
2. **删除遗留覆盖层**：移除 `pstack/overlay/overlay.yml`、`pstack/overlay/docs/guide/01-setup.md`、`pstack/overlay/skills/poteto-help/SKILL.md` 与整个 `pstack/overlay/`。这三处是对上游页面/技能的整份改写，按契约不再保留；DSH 文本差异改由主适配器映射说明。`docs/guide/01-setup.md` 覆盖层原先把角色文件误写成 `pstack-models.mdc`，移除后该错误随之消失。
3. **生成器改读 harness**：`OVERLAY` 常量改为 `HARNESS`，`origin()` 改为优先读 `pstack/harness/`；注释同步。
4. **移除 `verify:overlay` 链路**：删除 `pstack/scripts/verify-overlay.mjs`、`pstack/vite.config.ts` 的 `verify:overlay` 任务与 `generate` 的 `dependsOn`；移除 `pstack/package.json` 已无用的 `js-yaml` devDependency，并同步 `pnpm-lock.yaml` 的 `pstack` importer。
5. **runtime 镜像对齐**：上游在 `poteto-mode/scripts/orch/` 删除 `orch.ts`、`store.ts`（Orchestrate 改为 agentic），删除本地孤儿镜像 `pstack/runtime/skills/poteto-mode/scripts/orch/`，并从 `src/internal/script-registry.ts` 的 `SCRIPT_ENTRIES` 移除 `orch` id。
6. **重生成生成树**：`node pstack/scripts/generate-pstack-harness-tree.mjs` 重建 `pstack/pstack/`（58 个技能，23 个 SKILL.md 带适配行）。

## 4. runtime 镜像逐脚本去向

| 上游脚本 | 镜像 | 去向 |
|---|---|---|
| `poteto-mode/scripts/check-plan.mjs` | `pstack/runtime/skills/poteto-mode/scripts/check-plan.mjs` | Node 等价实现；上游本轮有改动，待 `implement` 同步 |
| `poteto-mode/scripts/watch-pr/**` | `pstack/runtime/skills/poteto-mode/scripts/watch-pr/**` | Node 等价实现；上游本轮有改动，待 `implement` 同步 |
| `poteto-mode/scripts/worktree-audit.sh` | `pstack/runtime/skills/poteto-mode/scripts/worktree-audit.ts` | Node 等价实现；上游本轮有改动，待 `implement` 同步 |
| `poteto-mode/scripts/orch/{orch,store}.ts` | 无 | 上游已删除，本地镜像与 `orch` 登记一并移除 |
| `show-me-your-work/scripts/log.sh` | `pstack/runtime/skills/show-me-your-work/scripts/log.ts` | Node 等价实现；上游本轮无改动 |
| `statechart/scripts/**`（`run.ts`、`statechart.ts`、`worker.ts`、`backends/`、`frontends/`、`passes/`、`pipeline.ts`、`ir.ts`、`statechart` 启动器、`test/` 语料） | 无 | **尚未移植**：随包树原样发布上游 `.ts` 与 `sh`，运行时需 TypeScript 执行器；由 `implement` 决定 Node 等价移植方式 |

无多套散置实现；`REPLACED` 仍为 `poteto-mode`、`show-me-your-work` 两项，`replace:scripts` 整目录替换只发布生产 `.mjs`。

## 5. 构建与结构验证

| 检查 | 命令 | 结果 |
|---|---|---|
| 生成树漂移 | `node pstack/scripts/generate-pstack-harness-tree.mjs --check` | 通过（`pstack/pstack is up to date.`） |
| pstack 构建链 | `vp run build`（`pstack/`：generate → build:runtime → copy:pstack → replace:scripts） | 通过，替换 2 个技能脚本目录 |
| 根发布构建 | `vp run build`（根） | 通过（5/5 任务成功，`dist/*.mjs` 与 `.d.mts` 产出） |
| runtime 行为测试 | `vp run test`（`pstack/`，`node --test dist/runtime/**/*.test.mjs`） | 57 通过、0 失败 |
| 插件测试 | `vp test`（根，`tests/**/*.test.ts`） | 10 通过、0 失败 |
| 格式/类型/静态检查 | `vp check` | 0 错误；1 条既有 warning（`generate` 内 `.sort()` 缺 compare，非本轮引入） |

生成树 `pstack/pstack/` 只由生成器改变；`docs/architecture.md` 与新增决策记录已反映迁移后的实际结构。

## 6. 仍需 `implement` 的行为问题

- `statechart` 脚本尚未 Node 等价移植；当前随包为上游 `.ts` + `sh`，`pstack_script` 无对应 id。需决定移植方式、入口映射，以及是否裁剪 `statechart/scripts/test/` 语料（约 4MB、405 个文件，占生成树大部分体积）。
- `poteto-mode` 的 `check-plan`、`watch-pr`、`worktree-audit` 上游脚本在 `d1453c1..1ba91fc` 间有改动，本地 runtime 移植未同步，行为可能落后于上游。

## 7. 未决项与后续

- 主适配器 `pstack/harness/docs/harness/dsh.md` 内容仍是旧版：脚本清单还列 `orch` id，且需补 statechart、ketchup-video 与新增 playbook 的映射。内容更新由 `doc` 阶段处理（`audit` 先重建需求基线）。
- `pstack/README.md` 审查基线仍记 `d1453c1` / `0.15.29` 与旧 `orch` 实现范围，须由下一次 `audit` 重建。
