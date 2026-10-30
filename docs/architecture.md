# 架构

本文件只描述系统现在的样子。为什么演变成这样，见 `docs/decisions/`。

## 模块

| 模块 | 目录与入口 | 职责 |
|---|---|---|
| 根打包 | 根 `vite.config.ts`、根 `package.json` | 用 vite-plus 打包 `src/*.ts` 与 `src/client/`，并把生成树与技能复制进 `dist/`；npm 发布 `dist/`、`assets/`、`cordis.patch.yml`、`locale/` 与各语言 README |
| 插件入口 | 根 `src/*.ts`、`cordis.patch.yml` | `pstack` 行注册 bundle 技能 provider 与 `pstack_skill`；`cordis.patch.yml` 另声明 `pstack-models`、`pstack-roles`、`pstack-subagent`、`pstack-script` 四行及 `poteto-agent`、`comment-sicko` 两个 agent preset；`roles.ts` 提供角色配置页的 Host Remote 服务 |
| 插件内部 | 根 `src/internal/*.ts` | 宿主契约、技能索引与角色配置：`host-contract.ts` 只从 `@deepseek-ai/*` 导入类型，`skill-provider.ts` 建 bundle 技能目录，`role-config.ts` 与 `role-manifest.ts` 解析角色文件，`role-editor.ts` 校验并单角色写回，`role-wire.ts` 定义 Host/Client 共享的线形状，`effort.ts` 校验 effort，`script-registry.ts` 列随包脚本，`optional-plugins.ts` 是推荐插件目录与 `OPT-*` 映射的唯一来源，`paths.ts` 定资源根，`frontmatter.ts` 读上游 frontmatter，`audit-context.ts` 注入 `.audit` 约定 |
| Client 插件半 | 根 `src/client/`、`src/remote.ts`、根 `package.json` 的 `dsh.client` | `remote.ts` 手写 Typert `TypertRemoteInfo`（无生成链），`client/index.ts` 用 `ctx.remote.$mount` 挂载贡献并注册 `plugins.bundle.config` 与 `plugins.bundle.activation`，`RoleSettingsPage.tsx` 渲染 17 个角色表单，`OptionalPluginsPage.tsx` 渲染推荐插件区与一次性启用引导，`optional-plugins-state.ts` 提供状态映射与一键启用序列，`PstackBundleConfigPage.tsx` 组合两区；`i18n.ts` 定义支持语言清单与通用词典类型，`locales.ts` 与 `optional-plugins-locales.ts` 分别是 `pstackRoles` / `pstackPlugins` 两个独立 locale 命名空间按语言组织的完整词典（当前 `en` / `zh`）；构建产出 `dist/client.mjs`（`__ModuleLoader__.load` CJS 包装） |
| 插件验证 | 根 `tests/**/*.test.ts`、`tests/**/*.test.tsx` | 驱动插件公共行为：隐藏技能加载、模型目录、角色文件解析与写回、Typert Remote 贡献、Host 服务注册、Client 页面与浏览器半接线、preset 选择、推荐插件目录与 README/dsh.md 对账、推荐区渲染与一键启用顺序、`pstackRoles` / `pstackPlugins` 命名空间隔离与各语言词典完整性 |
| pstack 工作区（`@internal/pstack`） | `pstack/package.json`、`pstack/vite.config.ts` | 编译运行时脚本、生成移植树、组装 `pstack/dist/` |
| 本地适配树 | `pstack/harness/docs/harness/dsh.md` | DSH 宿主适配文档，按生成树相对路径镜像；主适配器替换上游 `claude-code.md`，其他上游 harness 附件保持上游相对路径与文件名。上游页面、技能、playbook、reference 原文不改写 |
| 适配文档对账 | `pstack/scripts/check-harness-doc.mjs`、`docs/harness-doc.yaml` | 按清单对账 `dsh.md` 与 README、上游 `claude-code.md`、`src/`：覆盖行、模板漂移、`OPT-*` 集合、`AUT-*`/`EXCL-*`、章节、引用与过时名字；只读对账、从不改写文档，是 `doc` 与 `review port` 的门禁，入口任务 `check:harness-doc`（`vp run @internal/pstack#check:harness-doc`） |
| 运行时 | `pstack/runtime/skills/<技能>/scripts/**` | 可执行脚本的 TS 源码，编译成 mjs 后替换随包树里上游附带的脚本 |
| 生成器 | `pstack/scripts/*.mjs` | `generate`（以上游原文加本地适配树渲染生成树）、`copy:pstack`（拷贝）、`replace:scripts`（替换脚本） |
| 生成树 | `pstack/pstack/` | 由 `upstream/cursor-plugins/pstack` 加 `pstack/harness/` 渲染；每次构建整棵重建，生成结果提交进 git，`generate --check` 用它比对漂移 |
| 技能工作区（`@internal/skills`） | `skills/package.json`、`skills/authored/`、`skills/.agents/skills/`（`skills experimental_sync` 的落盘目录） | 随包发布的非上游技能；`authored/` 手写、`.agents/skills/` 是 vendored 技能（构建时以 `vendored/` 落进 `dist/skills`），带哈希与提交号（记于 `skills/skills-lock.json`） |
| 仓库维护技能 | 根 `.agents/skills/<名>/SKILL.md`、`README.md`、`references/` | 维护本仓的技能的入口、使用说明与按分支加载的指令；不进入 `dist/` 或随包技能工作区 |
| 本地扩展登记 | `docs/extensions.md` | 登记 DSH 版独立功能的 `EXT-*` 需求、DSH 依赖与验收；基线重建保留这些范围 |
| 上游反馈记录 | `docs/upstream-discussions.md` | 记录已提交到上游 DSH 的 Discussion 标题、URL、主题和更新时间，供后续追加与查重 |
| 上游子模块 | `upstream/cursor-plugins`、`upstream/deepseek-harness` | 生成树的来源，与 DSH 宿主的参考实现 |
| 发布产物 | `dist/`（.gitignore） | npm 实际发布内容：`index.mjs` 与各插件入口 `.mjs`、类型声明、`pstack/`、`skills/` |

## 依赖方向

```
upstream/cursor-plugins/pstack + pstack/harness
        │ generate
        ▼
   pstack/pstack ──copy:pstack──▶ pstack/dist/pstack
                                      ▲
pstack/runtime ──vp pack──▶ pstack/dist/runtime ──replace:scripts──┘

pstack/dist/pstack ──根 vp pack（copy）──▶ dist/pstack
skills/authored + skills/.agents/skills ──根 vp pack──▶ dist/skills
  （后者在 dist 里落名为 vendored/）
根 src/*.ts ──根 vp pack──▶ dist/{index,models,remote,roles,script,skill,subagent}.mjs
src/client/ ──根 vp pack（第二个 pack 配置）──▶ dist/client.mjs
```

上游只向下游流动：生成树与 `dist/` 不反向修改上游；`pstack/pstack/` 是渲染结果，手写内容一律进 `pstack/harness/`（仅适配文档）与 `pstack/runtime/`（脚本），不改写上游页面。

## 扩展点

- **DSH 文本差异**：只写 `pstack/harness/<生成树相对路径>`；主适配器是 `docs/harness/dsh.md`（替换上游 `claude-code.md`），其他上游 harness 附件按上游相对路径与文件名建同名文件。上游页面、技能、playbook、reference 保持原文，不写覆盖层、不改上游内容；生成器渲染时本地适配树优先于上游。不要直接改 `pstack/pstack/`。`dsh.md` 在上游模板章节外只保留两个固定追加小节：`## Local replacements`（运行期替代项，R-11）与 `## Optional plugins`（可选插件降级，R-07）。两节与 README 的一致性由 `check:harness-doc` 任务（`vp run @internal/pstack#check:harness-doc`）按 `docs/harness-doc.yaml` 核对，不再靠人工记忆。
- **新增技能**：随包手写技能放 `skills/authored/<名>/SKILL.md`，仅供维护本仓的技能放根 `.agents/skills/<名>/SKILL.md`；第三方随包技能把 `source` 与技能名加进 `skills/package.json` 的 `skills` 数组，跑 `skills experimental_sync`，哈希与提交号自动记入 `skills/skills-lock.json`。仓库里没有 `skills/vendored` 目录或符号链接：`vp pack` 的清理步骤会顺着指向 `.agents/skills` 的符号链接删掉源文件，拷贝步骤又会把链接按本机绝对路径写进产物；所以构建直接从 `.agents/skills` 拷贝并 `rename` 成 `vendored`。
- **新增或修改脚本**：改 `pstack/runtime/skills/<技能>/scripts/`，并把技能名加入 `pstack/scripts/replace-scripts.mjs` 的 `REPLACED` 列表。模型通过 `pstack_script` 的 `id` 调用，不直接拼路径；新增脚本必须同步 `src/internal/script-registry.ts` 的 `SCRIPT_ENTRIES`。
- **新增或修改插件工具**：改 `src/*.ts`，在 `cordis.patch.yml` 增加对应 `dsh-pstack/<入口>` 行；`package.json` 的 `exports` 由 `vite.config.ts` 的 `pack.exports` 生成，新增入口要同时改这两处，非入口资源（如 `./locale/*.json`）用 `customExports` 声明，不要手写进 `package.json`。普通插件入口只从 `@deepseek-ai/*` 导入类型，运行时保持自包含。
- **新增或修改 Client 配置页**：Client 半放 `src/client/`，由 `package.json` 的 `dsh.client`（`platform: 'web'`）声明，`./client` 出口指向 `dist/client.mjs`；`vite.config.ts` 的 `pack` 数组第二项按 DSH `dsh-client-modules` 的协议把入口包成 `window.__ModuleLoader__.load({ id, factory })` 的 CJS 包装，React 与平台模块保持 external。每个配置能力使用独立的 locale 命名空间与按语言组织的完整词典（角色页 `pstackRoles`、推荐插件页 `pstackPlugins`）；支持语言清单与通用词典类型在 `src/client/i18n.ts`，新增语言由类型与测试强制每个能力补齐，不同能力之间不共享命名空间或复用同义键；组合页通过注入的 translator 把各自词典交给对应区块。Host 侧需要 Remote 时，在 `src/remote.ts` 手写 `TypertRemoteInfo` 并用 `ctx.typert.register()` 注册 strict 描述符；这是 EXT-003 的例外：`roles.ts` 运行时导入 `@deepseek-ai/cordis` 与 `@deepseek-ai/dsh-typert-protocol`，二者由包依赖或 DSH profile 提供。

## 已知缺口

- vendored 技能来源记在 `skills/skills-lock.json`，不存在单独的 `skills/sources.yml`。

本节记录的是当前事实；缺口修复或消失后同步更新。
