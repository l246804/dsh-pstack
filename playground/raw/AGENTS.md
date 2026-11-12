# playground/raw 适配文档规则

本目录的 `dsh.md` 是提交进库的 DSH 适配文档，由 agent 按本规则直接分析写成，不存在任何提取、快照或映射脚本。`generate.ts` 对它只做两件事：复制进生成树的 `docs/harness/dsh.md`，以及把技能文件里的注入行与链接引用从 `claude-code.md` 替换为 `dsh.md`。生成器不得包含任何适配逻辑。

## 生成器边界（复刻上游做法）

上游 `scripts/generate-pstack-harness-trees.mjs` 生成 Claude Code 树时只做复制与在技能 H1 后插入一行“读 claude-code.md”的引用说明，所有适配差异都写在 `claude-code.md` 里，其余内容一字不动。本仓的 DSH 生成链必须遵循同一原则：

- `playground/raw/generate.ts` 与 `port/generate.mjs` 只允许：复制上游文件、写入 `dsh.md`、在需要适配的技能 H1 后插入“读 dsh.md”的引用行、把指向 `claude-code.md` 的链接与适配行替换为 `dsh.md`。
- 不得改写上游的 README、docs/guide、技能正文、安装段、命令前缀说明或任何其他文案。上游原文即使对 DSH 用户不准确（例如 Claude Code 安装指令），也保持原样；这类信息只通过 `dsh.md` 的适配说明与根 README 提供给用户。
- 若认为某段上游文案必须改写，先在此文件记录理由并取得用户确认，不得由子代理自行添加替换规则表。
- 守卫测试只验证适配覆盖率与污染，不驱动任何正文改写。

## 生成规则

1. 唯一结构来源是 `upstream/cursor-plugins/pstack/docs/harness/claude-code.md`。保留其标题层级、全部六节（Tools、Subagent fields、Models、setup-pstack、Paths、Cursor-only features）、两列表结构与 Cursor 列原文；目标列表头写 `DSH`，标题与导语中的环境名做最小替换。
2. 每个适配项的目标单元格从 Claude Code 改判为 DSH，写 DSH 运行时真实有的能力，不做词面替换。平台事实只能读 DSH 实现 checkout 核实：bundle 清单（`dsh-base`、`dsh-web-app` 的 `cordis.patch.yml` 与 `presets/*.patch.yml`）、工具注册（各 `dsh-tool-*` 包的 `defineTool` 声明与参数 schema）、官方插件目录（`dsh-official-bundles`）、包内 README 与 `locale/en.json`。禁止读取 `port/dsh.md`、根 `pstack/`、`src/`、旧报告，禁止从现行安装包文档反推。
3. 三态写法：
   - base 原生有：写真实工具名与真实参数约束。例如原生 `subagent` 只有 `description`、`prompt`、可选 `cwd`，模型选择在启用时追加 `provider`/`model`/`reasoning_effort`，没有 subagent-type、readonly、environment 之类路由字段，就写明没有。
   - 仅官方可选插件提供：写明需启用 `<包名>`，以及未启用时 base 下的替代行为或跳过语义。例如 `create_worktree` 需启用 `@deepseek-ai/dsh-experimental-tool-worktree`（`@deepseek-ai/dsh-experimental-forge-bundle` 亦含之）。
   - 没有：写 DSH 无此能力，给出跳过或替代，沿用上游 skip-with-line 语义（`Skipped in DSH: <step>. <reason>.`）。
4. 未覆盖或运行时中立的行保留上游原文，并在下方清单列出。
5. 上游变更时，diff 上游 `claude-code.md`，对变动行按规则 2-3 重新判定并更新本文的依据记录，不做词面替换。

## 保留原文的行

以下行经判定后保留上游原文（判定为运行时中立，非遗漏）：

- Paths 表 `https://github.com/cursor/plugins/blob/main/pstack/<path>` 行：读本地副本、不 fetch 的语义与运行时无关。
- Cursor-only 表 Cursor Automations 行：目标单元格 `Skip with the line.` 语义不变，DSH 同样没有 Automations。
- Cursor-only 表 Cursor cloud agents 行：保留上游写法（worktree 替代 + 跳过语义），worktree 的启用条件已在 Subagent fields 表 `environment: "cloud"` 行写明。

其余行全部改判，无未覆盖行。

## 判定依据（DSH checkout 0.2.2-rc.1）

- 委派工具：`dsh-base/cordis.patch.yml` 与 `dsh-web-app/presets/standard.patch.yml` 挂载 `dsh-tool-subagent` 两次（`toolName: subagent`/`subagent_fork`，standard preset 启用 `modelSelection`/`modelDiscovery`）。`dsh-tool-subagent/lib/index.js` 的 schema 给出 `cwd`/`description`/`prompt` 与 `provider`/`model`/`reasoning_effort` 参数、立即返回子代理 id、完成时通知；`list_subagent_models` 仅在 `modelDiscovery` 时注册，逐级列出 provider/model/effort。
- 续聊与中止：`dsh-tool-subagent-control` 注册 `send_message`/`list_agents`/`interrupt_agent`；`resume` 行与 `run_in_background` 行按这些工具描述改写。
- 其余 base 工具：`ask_user_question`（dsh-tool-ask-user）、`todo_write`（dsh-tool-todo，整表替换语义来自参数描述）、`skill`（dsh-tool-skill，"Load the full instructions for a skill"）、`grep`/`glob`（dsh-tool-fs-search）、`read`/`write`/`edit`/`read_image`（dsh-tool-fs，`applyPatch: false` 故无 apply_patch）、`bash`（win32 为 `pwsh`）、`web_search`/`web_fetch`（dsh-tool-web）、`plugin_manager`（dsh-plugin-manager/tools）、`present`、`working_directory`、`exit_plan_mode`（dsh-plan-mode）。
- 技能可见性与用户调用：`dsh-skill` README 的 modelInvocable/userInvocable 四象限与 `dsh-skill-filesystem` 对 frontmatter `disable-model-invocation` 的解析支撑 Tools 表第 4 行；web 输入以 `/` 触发命令菜单，技能无 `pstack:` 命名空间。
- 模型机制：base 无 `.mdc`、无 `rules/` 目录（`dsh-base`、`dsh-web-app` 清单均无此行）。每会话加载的是 `dsh-agent-instructions` 的 AGENTS.md 兼容链：项目 `AGENTS.md`/`AGENTS.local.md`/`CLAUDE.md`/`CLAUDE.local.md`，用户全局文件为 `$DSH_HOME/AGENTS.md`（`USER_GLOBAL_FILE = "AGENTS.md"`）。setup-pstack 三步骤据此改写。
- 路径约定：`dsh-home-paths` 常量（`DSH_HOME` 默认 `~/.dsh`，`DSH_AGENTS_HOME` 默认 `~/.agents`）；技能根 `.dsh/skills`、`.agents/skills`、`$DSH_HOME/skills`、`$DSH_AGENTS_HOME/skills`（dsh-skill-filesystem 的 join 声明）；profile 为 `$DSH_HOME/profiles/<name>`，含 `package.json`（bundle 清单）与 `cordis.patch.yml`（dsh-app-boot 的 `PROFILES_DIR`/`PROFILE_PATCH_FILENAME` 与模块注释）；插件 manifest 是 `package.json` 的 `dsh` 段（dsh-package-manifest）；会话转录在 `$DSH_HOME/sessions/<workspace-key>/<session>.jsonl`（base 清单 `root: dshHomePath('sessions')`，dsh-session-persistence-jsonl 的 `projectKey`/`encodeSegment`）。
- 官方插件目录：`dsh-official-bundles` 的 `OPTIONAL_BUNDLES`/`ON_DEMAND_BUNDLES`/`OFFICIAL_ON_DEMAND_CATALOG`。`create_worktree` 来自 `@deepseek-ai/dsh-experimental-tool-worktree`（参数 `name`/`from`，切换会话工作目录）；`@deepseek-ai/dsh-experimental-forge-bundle`（"Change requests & worktrees"）含该成员并依赖宿主 `gh` CLI；`@deepseek-ai/dsh-experimental-session-search` 挂载 `dsh-tool-session-query`（`session_search`/`session_trace`/`session_event_*` 五工具），base 只挂 `session-query-sqlite` 服务且 `openAt: never`，无模型可见搜索工具；`@deepseek-ai/dsh-experimental-terminal-bundle` 提供 `terminal_*` 六工具。
- Cursor-only 判定：官方目录中无 Automations、Bugbot、云代理对应物；PR 操作走 base `bash` + 宿主 `gh`，可选 forge-bundle 提供 PR 跟踪（Bugbot 行、built-in PR tool 行据此改写）。
- 沙箱语义：base `dsh-sandbox-policy`/`dsh-permission-presets` 声明 `read-only`/`workspace-write`/`danger-full-access` 会话级权限预设；`subagent` schema 无沙箱参数，故 `readonly` 两行写"无此字段 + 会话权限模式 + prompt 约束 + git status 复查"。

## 守卫

`tests/playground-raw-adapter.test.ts` 只验证不生成：上游技能语料用到的每个 TERMS 术语（沿用上游生成器词表，含漂移绑定）在 `dsh.md` 有对应行；六节表结构与 Cursor 列逐行保留；`dsh.md` 不得出现 "Claude Code"（不得把 Claude Code 写成目标运行时）；不得出现 `pstack_subagent`、`pstack_skill`、`pstack_models`、`pstack_roles` 等本插件产物名。`tests/playground-raw-generator.test.ts` 保留独立性（不读 `port`/`src`）、上游输入不变与两次生成字节一致的性质。
