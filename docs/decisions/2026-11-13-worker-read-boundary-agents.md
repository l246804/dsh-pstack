# 决策：用结构化 $DSH_HOME/AGENTS.md 约束 worker 的读取边界

Status: accepted
Date: 2026-11-13
Scope: playground/harness/lib/env.ts, playground/harness/cli/prepare.ts, playground/harness/cli/run-case.ts, playground/scenarios/capabilities/, playground/AGENTS.md, playground/docs/worker.md
Implemented-by: commit:7d7ba2f
Review: 2026-11-22

## 背景

playground 的真实 DSH worker 之前没有任何文件读取边界。被测会话可以直接读取宿主仓库里的场景定义、rubric 和断言，导致 raw/adapted 结果不能代表技能独立效果。`system-prompt` 和 profile patch 都试过注入读策略，但 standard preset 的 `dsh-persona` 会遮蔽全局 `personaSuffix`，提示词没有进入请求。目录级 `chmod` 又会在进程异常退出时留下 `000` 权限，已经造成过 `collect EACCES` 和 `unknown scenario`。

## 决策

- `prepare` 为每个 worker 写入结构化的 `$DSH_HOME/AGENTS.md`，所有 phase 生效；`prepare --reuse` 也刷新该文件。
- 指令文件由固定结构的 `WorkerInstructionSection[]` 渲染，包含 `Read boundary`、`External path requests`、`External side effects` 和 `Reporting` 四节，不是一段散文本。
- 读边界只允许当前工作区和系统显式挂载的只读运行时输入；禁止读取、列出、统计、搜索或推断其他路径，包括用户给出的绝对路径。
- 该文件走 `dsh-agent-instructions` 的 user-global 链，不依赖 standard preset 的 persona 配置，也不写入具体仓库路径或场景文件名。
- 每个 workspace 由 runner 执行本地 `git init`，不设置 origin；DSH 进程移除 Git/GitHub token 并使用空的 `GH_CONFIG_DIR`，避免真实远端副作用。
- `system-prompt`、profile patch 和目录权限方案不再作为 worker 读边界的实现。

## 替代方案

**写 `home/cordis.patch.yml` 或 profile patch 的 `system-prompt.personaSuffix`。** standard preset 的 `dsh-persona` 用空 suffix 遮蔽全局配置，策略不会进入实际请求。该方案被否决。

**批处理期间对场景目录 `chmod 000`，结束后恢复。** 同用户下能暂时挡住读取，但异常退出会残留权限，已经污染过后续 `collect` 和场景加载。该方案被否决。

**完全依赖 prompt 的“只读工作区”文字。** 实测模型会忽略，无法作为隔离保证。该方案只保留为 AGENTS.md 的辅助约束。

**容器或独立用户隔离。** 防护更强，但当前环境需要额外的容器/宿主权限和挂载管理，成本高于本决策；保留为后续升级方向。

## 后果

- 所有 phase 的 worker 会话都会看到同一套结构化读边界，读策略不再依赖具体模型或 preset。
- 这是指令级边界，不是文件系统的硬隔离；如果模型绕过 AGENTS.md，仍需后续用容器或工具层限制补齐。
- `writeHomePatch` 负责生成该文件；`prepare --reuse` 也会重写，避免复用旧 worker 时缺失边界。
- `run-case` 在物化 workspace 后执行 `git init`；`startWeb` 隔离 Git/GitHub 凭证，避免场景创建真实远端仓库。
- 验证探针 `read-scenario-probe` 使用当前 minimax 配置时，模型明确拒绝读取 `playground/scenarios` 外路径并说明工作区限制。
- 该约束会改变 raw 会话的提示环境；raw 证据应记录这一环境事实，不能把它误当作技能自身行为。
