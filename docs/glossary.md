# 术语表

只收录代码里已出现、且叫法不统一就会分歧的词。新增概念时在此补一条。

## 生成树（generated tree）

`pstack/pstack/`：`generate` 从 `upstream/cursor-plugins/pstack` 加本地 harness 适配树 `pstack/harness/` 渲染出的整棵树；每次构建整棵重建，生成结果提交进 git，`generate --check` 用它比对漂移。
反例：`pstack/` 是整个工作区（含源码与配置），不要把它叫“生成树”。

## 本地适配树（local harness tree）

`pstack/harness/`：DSH 宿主适配文档，按生成树相对路径镜像；主适配器 `docs/harness/dsh.md` 替换上游 `claude-code.md`，其他上游 harness 附件保持上游相对路径与文件名。只承载适配文档，不改写上游页面、技能、playbook、reference。
反例：不是覆盖层，不能整份替换上游正文；生成树里的结果也不叫“本地适配树”。

## 运行期替代项（runtime replacement）

上游 Cursor 语境有、DSH 没有同名能力，但存在可执行替代，且该名字出现在随包技能、playbook 或 reference 的运行期步骤里的项，例如 `create-skill`（替代为 `writing-for-agents`）、`/loop`（替代为 `create_goal` 加 `schedule_create`）。主适配器 `dsh.md` 的 `## Local replacements` 逐行记录这些替代。
反例：不是平台排除（整类舍弃、没有替代），也不是纯审查台账里的缺口（`G-xx`）或插件内部实现（`PI-xx`）。

## 适配文档对账（harness doc check）

`pstack/scripts/check-harness-doc.mjs` 与 `docs/harness-doc.yaml`：把 README 的运行期替代项与平台排除投影成清单，逐条核对 `dsh.md`、上游 `claude-code.md` 与 `src/`，入口是 `check:harness-doc` 任务（`vp run @internal/pstack#check:harness-doc`），是 `doc` 与 `review port` 的门禁。只读对账，从不改写 `dsh.md`。
反例：不是一类运行时能力，不产生宿主行为；也不是 `pstack/README.md` 的替代品，它只存映射不存正文。

## 随包内容（shipped payload）

`dist/`：根 `vp pack` 的发布产物（`index.mjs`、`pstack/`、`skills/`），被 `.gitignore` 忽略，npm 只发它和 `assets/`、`cordis.patch.yml`。
反例：不要叫它“构建树”或“源码”。

## 运行时（runtime）

`pstack/runtime/skills/<技能>/scripts/**` 的脚本源码，编译为 mjs 后经 `replace:scripts` 替换随包树里上游附带的脚本。
反例：不是泛指“运行环境”；指本仓这份脚本源码及其编译产物。

## pstack 工具（pstack tools）

根 `src/*.ts` 注册到 DSH 的模型可见工具：`pstack_skill`（按名加载隐藏技能）、`pstack_models`（只读模型目录）、`pstack_subagent`（按角色与 agent preset 委派）、`pstack_script`（运行随包 Node 脚本）。
反例：不是 pstack 上游技能里的 `Task`/`AskQuestion` 文本，也不是宿主标准工具。

## 代理预设（agent preset）

`cordis.patch.yml` 中以 `@deepseek-ai/dsh-agent-preset` 声明的 `poteto-agent`、`comment-sicko` 两个子代理人格与工具组合；`pstack_subagent` 的 `agent` 参数映射到 preset id，`general` 不挂 preset。
反例：不是上游的 `subagent_type` 值，也不是 `pstack_subagent` 的 `role`（模型路由）。

## 角色文件（role file）

`$DSH_HOME/pstack-models.mdc`：`/setup-pstack` 写入、`pstack_subagent` 每次委派重读的角色到 `provider/model [effort]` 映射；缺失表示全部角色继承父级路由。
反例：不是 DSH 的 `AGENTS.md`；与上游 Cursor 的 `pstack-models.mdc` 同名，但位于 `$DSH_HOME`，且只有 `pstack_subagent` 读取。

## bundle 配置模态框（bundle config dialog）

Plugins → dsh-pstack bundle 详情页页头「配置」按钮打开的 Client 模态框：仿 Settings 的遮罩、居中圆角卡片与关闭方式，左侧为分区导航，右侧显示当前分区的表单。入口是 `plugins.detail.actions`，内部复用推荐插件区（EXT-004）与角色模型配置（EXT-003）；详情页不再通过 `plugins.bundle.config` 内联渲染配置。实现位于 `src/client/PstackBundleConfigDialog.tsx`。
反例：不是 Settings 本身（只仿视觉与交互，不复用 `dsh-client-ui-settings` 组件），也不是 port 基线能力。

## 角色模型配置（role model configuration）

bundle 配置模态框中的角色分区：读取角色文件的状态与 17 个角色值，按 `pstack_models` 实时目录选择 `provider/model [effort]`，单角色保存或重置回 `inherit-parent`。Host 侧服务是 `pstackRoles`（`src/roles.ts`），Client 侧是 `src/client/` 与手写的 `src/remote.ts`。
反例：不是 `pstack_models` 工具（只读目录），也不是角色文件本身；该分区只编辑角色文件，不改变 port 基线。

## 推荐插件区（recommended plugins section）

bundle 配置模态框中的推荐插件分区，以及 dsh-pstack 首次启用后经 `plugins.bundle.activation` 出现的一次性引导：按 `OPT-01` 至 `OPT-09` 展示可选 DSH 插件的分组、当前 bundle 状态、平台与冲突限制。默认推荐 `OPT-01` 与 `OPT-06`；逐项开关与「一键启用推荐项」都通过 `pluginManager` Remote 由用户点击触发。目录唯一来源是 `src/internal/optional-plugins.ts`。
反例：不是 README 的“可选 DSH 插件”说明表（只描述能力），也不是 port 基线能力；该分区不自动启用任何插件。

## 配置 locale 命名空间（config locale namespace）

每个插件配置能力独立的文案词典命名空间：角色模型配置用 `pstackRoles`（`src/client/locales.ts`），推荐插件区用 `pstackPlugins`（`src/client/optional-plugins-locales.ts`）。支持语言清单与通用词典类型在 `src/client/i18n.ts`；每个命名空间按该清单提供每种语言的完整词典，各语言键集合一致且不得相交；`common` 只放跨功能共享词。配置模态框按能力注入各自的 translator。
反例：不是一个分区只能有一个命名空间；也不把推荐插件文案写进 `pstackRoles` 或复用同义键。

## 上游（upstream）

`upstream/cursor-plugins`（生成树来源）与 `upstream/deepseek-harness`（DSH 宿主参考）两个 git 子模块。
反例：上游 ≠ 生成树；生成树是上游经渲染后的结果。

## 本地扩展（local extension）

上游 pstack 未声明、由 DSH 版插件独立维护的产品能力；在 `docs/extensions.md` 以 `EXT-*` 编号登记需求、DSH 依赖与验收，区别于 README 中的上游移植能力。

反例：不要把 Cursor 已有但 DSH 尚未完整覆盖的移植缺口叫作本地扩展。

## 审查 finding 状态（finding status）

技能审查工作文件中的 finding 状态：`open`（待修复）、`reopened`（重新打开）、`fixed-pending-review`（修复待复核）、`closed`（关闭）、`blocked`（需用户决策或缺少公共能力，不参与普通修复，汇总到 `阻断摘要`）。

## 真实插件测试场（playground）

`playground/`：开发期唯一的真实运行测试环境。提交的 `playground/profile/` 是从随附 `web` 模板复制后加入 `dsh-pstack` 的可移植 profile；运行期 DSH home 固定为 `playground/.dsh`（由 `playground/.gitignore` 忽略，不提交），启动端口固定 `17353`。`playground/` 是 vite-plus 子包 `@internal/playground`；`start.mjs` 每次启动前同步 profile、宿主凭据与模型配置并安装本仓插件（宿主模型更新后自动跟随），由根 `vite.config.ts` 的 `playground` task（`vp run playground`）启动；验证在终端直接对 `playground/.dsh` 与 profile 跑 `dsh` 命令，不内置断言脚本；UI 与真实会话行为由用户交互确认。
反例：不是 `tests/` 的 vitest（mock 宿主的单元测试）；也不是宿主 `~/.dsh` 或 `.tmp` 下的一次性测试环境。
