# Playground agent 须知

- 本目录执行真实浏览器场景。先运行 `vp run playground:raw-generate`，再准备环境。
- raw 生成只使用上游 pstack 与上游生成脚本的隔离副本。禁止读取 `port`、`src`、现行生成树或旧报告。
- raw 只允许 `base` 环境，不安装 dsh-pstack 或其他附加插件。raw 使用 standard preset 加 raw systemPrompt 提示。
- adapted 使用真实插件的 poteto-mode preset，不注入 raw 提示。插件环境用显式 id 和完整附加包清单描述，不能继承宿主状态。
- 每个 phase、environment 和 worker 使用独立的 home、浏览器、工作区、证据和动态端口。home、浏览器、证据、pid 和日志在仓库内 `.workers/<phase>/<environmentId>/w<k>` 便于审计；被测会话能触达的工作区、raw 技能挂载和运行时临时目录在仓库外隔离根 `<isolatedRoot>/<phase>/<environmentId>/w<k>`（默认 `os.tmpdir()/dsh-pstack-playground`，`PLAYGROUND_WORKSPACE_ROOT` 可覆盖）。`prepare --reset` 只清本 phase 与 environment，另一 phase 的证据必须保留。沙箱只限写不限读，工作区和挂载路径不得暴露仓库根，否则被测会话能读到场景断言与 rubric。
- 被测读隔离的残余风险已记录为已知限制：沙箱只限写不限读，被测会话仍可能靠猜测绝对路径，或读取 DSH_HOME 等指向仓库内的进程环境变量发现仓库根并读到场景文件。审核证据时不得假设被测读不到仓库；怀疑泄漏时用会话日志 toolCalls 的 argsSummary 核对实际读取目标。
- 一个浏览器操作序列只在单一进程中执行。并行只能通过多个 worker 子进程。
- 场景 prompt 使用自然语言。相同 Scenario id 跨 raw 和 adapted 复用，不复制用例。
- 执行器等待所有 turns 的真实 turn/end。禁止 probeSeconds、DEFAULT_PROBE_SECONDS、truncated 和到点自动中止。
- 真实模型选择由用户确认。记录实际路由、上下游版本、上游 revision 和配置 hash。证据与报告不得包含 apiKey。
- 截图里的编辑卡是 workspace 级聚合视图，不得单独作为某个会话写行为的证据；会话级写行为以该会话 toolCalls 的 argsSummary、会话日志与 artifact 断言为准。
- 技能加载只是过程证据。语义效果必须有独立 reviewer、状态和理由。未审不等于通过。
- raw 四态为 observed、gap、blocked、unobserved。adapted 三态为 verified、not-verified、inconclusive。
- 插件 UI 与冲突回归有独立类型。不要为 Agent Teams 假想共存场景。
- 排除只限强依赖 Cursor 云、Bot、Automations 或 Bugbot 的能力。提及 Cursor 名称不构成排除理由。
- 不恢复 cases.lock、审批流、旧 SkillCase、Finding 或 reports/skill-audit.md。
- 不修改 PNPM_HOME。不要把 config.json、worker 数据或临时设计提交进库。
