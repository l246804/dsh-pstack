# Playground

本目录用真实 DSH Web 会话比较上游 pstack 与适配后的 dsh-pstack。先采集 raw 证据并审核实际效果，再开发最终适配。当前只有行为冒烟注册表，不代表所有技能已经覆盖。

## 生成 raw 输入

```sh
vp run playground:raw-generate
vp run playground:typecheck
```

生成器只复制 `upstream/cursor-plugins/pstack` 和上游 `scripts/generate-pstack-harness-trees.mjs` 到临时目录。上游脚本在该副本中执行。结果写入 `playground/raw/generated`，不会改写上游，也不读取 `port`、`src` 或旧报告。

`raw/generated/tree` 保留完整技能、agents、guide 和许可文件。`raw/generated/upstream` 保留除 Cursor Automations 外的原始 pstack 输入。`raw/generated/scripts` 保留上游生成器。`raw/dsh.md` 是提交进库的 DSH 适配文档，按 `raw/AGENTS.md` 的规则以上游 `docs/harness/claude-code.md` 为唯一结构来源逐项改判为 DSH 真实能力（base 原生 / 仅官方可选插件 / 没有三态）。生成器对它只做复制与引用替换：写入树的 `docs/harness/dsh.md`，并把技能文件的注入行与链接从 `claude-code.md` 换成 `dsh.md`，不做任何词面翻译。

`raw/generated/tree/README.md` 仍是上游 Claude Code 安装说明。它是待审核的 raw 输入，不是 DSH 安装文档。

## 配置真实模型

复制 `config.example.json` 到已忽略的 `config.json`，填写本机允许的 provider、model、effort 和凭据。`testModel` 必须在 `providers` 的允许清单中。示例不包含真实路由。不要提交该文件。

默认从当前用户的 DSH web profile 读取 `llm-pi-ai` 连接配置。可用 `hostPatchFile` 或 `PLAYGROUND_HOST_PATCH_FILE` 指定其他 patch。可用 `credentialsFile` 指定凭据副本来源。apiKey 可使用 `${ENVIRONMENT_VARIABLE}` 引用，避免把密钥写入配置。脚本不会把 API key 写入 RunRecord 或公开报告。

## 运行一个场景

```sh
vp run playground:raw-generate
vp run playground:prepare -- --phase raw --environment base --workers 1 --reset
vp run playground:bootstrap -- --worker 0 --environment base
vp run playground:run -- --worker 0 --environment base --phase raw --scenario poteto-help-smoke
vp run playground:collect -- --phase raw --environment base
```

raw 只允许无附加插件的 `base` 环境。它使用 standard preset，并通过 DSH 的标准 `systemPrompt.personaSuffix` 注入 raw poteto-mode。adapted 使用真实插件提供的 poteto-mode preset，不注入 raw 文件。两个阶段使用同一场景 id、自然语言 turns 和 `testModel`。RunRecord 记录实际路由、上游 revision、配置 hash 和安装版本。

```sh
vp run playground:run-batch -- --phase raw --environment base --scenarios poteto-help-smoke --workers 1
vp run playground:status -- --phase raw --environment base
vp run playground:stop -- --environment base
```

每个 worker 的 home、浏览器、工作区和证据按 phase 与 environment 双层隔离，位于 `.workers/<phase>/<environmentId>/w<k>`。raw 与 adapted 在同一环境下互不覆盖，环境切换也不复用这些目录。`prepare --reset` 只清本 phase 与 environment 的目录，不会删除另一 phase 已采集的证据。端口由 `dsh --port 0` 分配。浏览器操作保留在单一进程中。多 worker 通过独立子进程并行。

执行器等待每个自然语言 turn 的真实 `turn/end`。没有 probe、超时中止或 truncated 状态。模型或基础设施失败按 RunRecord 分类，不自动重试直到变绿。

## 审核证据

`Scenario` 包含稳定 id、skill、自然语言 turns、workspace fixture、可观察 assertions、语义 rubric、UI 观察点和来源。raw 与 adapted 是 Phase，不是两份场景。插件 UI 和冲突回归有独立类型。环境矩阵用 id 和启用的官方插件包标识完整环境。

技能加载只是过程证据。`semanticReview` 必须单独记录 supported、gap 或 inconclusive，并附审核者与理由。pending 不会使 raw 变为 observed，也不会使 adapted 变为 verified。raw 有 observed、gap、blocked、unobserved 四态，adapted 有 verified、not-verified、inconclusive 三态。

审核侧车文件名是 `<scenarioId>-<phase>-<environmentId>.json`。scenarioId 取自行为、插件 UI 与冲突回归三张注册表，因此 `plugin-ui-*` 与 `plugin-conflict-*` 的侧车同样可解析。

`collect` 从注册表补齐 unrun 和排除项。adapted 报告还检查 raw 对照的自然语言、实际模型、上游 revision 和配置 hash。排除目前只有 make-bot-ui 与 Benny Cursor Automations。提及 Cursor 的普通工作流不排除。

旧 cases、审批 lock 和 skill-audit 已删除。发布兼容键的新来源由后续适配阶段处理。
