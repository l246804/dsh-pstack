# 决定：从原始 pstack 生成 DSH 专用资产并显式降级宿主能力

Status: accepted
Date: 2026-10-24

> 本文提到的 `docs/pstack-dsh-port-development-design.md` 已随 [V2 后收敛决策](2026-10-26-slimming-after-v2.md)删除。本记录的决定本身已经落地在 `scripts/build-assets.ts`、`scripts/patches.ts` 与 `assets/`，不再依赖那份文档。

## 背景

`refactor/plugin-v2` 需要重建 dsh-pstack。上游 `cursor/plugins` 在 `d1453c11d1dde9714d4c313c97d3a68432265c7f` 的 pstack 有 56 个技能。Claude Code 版本通过生成器复制原始技能，给 23 个 `SKILL.md` 插入统一适配导读，其余技能资源保持原样。真正的语义适配由人工维护的映射文档承担。

DSH 的技能调用、子代理、模型配置、会话历史和工作区能力与 Claude Code 不同。仅替换 Cursor 术语会产生不存在的工具和错误的验证承诺。旧 `main` 的逐文件替换加全局替换也可能二次改写已适配文本。需要一种能持续同步上游、又能明确说明 DSH 能力边界的实现方式。

## 决定

以原始 `pstack/` 为唯一技能源，以 Claude Code 目录和生成器为机制参考。建立“源文件、适配声明、生成资产、Host 能力”四层结构。生成资产提交到 `assets/`，只能由确定性生成器更新。具体方案见 `docs/pstack-dsh-port-development-design.md`。

适配采用有精确锚点和期望命中次数的文件级 patch。替换区间不得重叠，已替换内容不得再被通用规则改写。`--check` 比较路径、bytes、可执行位、链接和资源闭包，并单独运行脚本测试。

首版生成并注册 55 个技能。`make-bot-ui` 的 Cursor webhook routine 和 secret-request 唤醒闭环不移植。55 表示资产覆盖，不表示所有功能在缺少可选能力时仍可运行。相关 playbook 必须显式说明降级或未验证状态。

保留 `pstack_subagent` 和统一角色 manifest，经 `ctx.subagents` 创建 fresh child。三类 panel 角色逐 entry 展开。模型配置只通过元数据和配置预检，不能把预检当作真实模型调用证明。复用官方 worktree、session search 和子代理控制能力，不引入 Agent Teams 作为依赖。

历史读取以 `sessionQuery` 为后端。新增受限只读工具，从同一份完整逻辑快照分页返回原始事件，按调用 Agent 和直接父子关系授权。不得直接扫描整个会话目录或把压缩 JSONL 当普通文本。`typescript-best-practices` 的 `paths` 自动触发不在首版实现，技能仍可显式使用。

## 备选方案

- 直接复制 Claude Code 生成树，再把 Claude 名称替换为 DSH。放弃，因为 Claude 工具、路径、manifest、跳过规则和运行时映射是目标平台专有的，且 agents 与非 Markdown 资源没有完成宿主适配。
- 只复制原始技能并插入一份 DSH 运行时映射。放弃，因为模型路由、会话读取、脚本协议和自动化边界需要具体实现，不能只靠提示词声明。
- 全量恢复旧 `main` 的 `scripts/adapt.ts`。放弃，因为它把局部替换结果继续交给全局规则，角色列表多处维护，同步检查漏比 executable bit，而且部分能力描述落后于 rc.3。
- 用 vendored 原文加每技能运行时覆盖说明。放弃，因为相邻旧实验不支持角色路由，且无法解决脚本和当前会话审计的真实行为差异。
- 首版移植全部 56 个技能。放弃，因为 `make-bot-ui` 需要独立的 ingress、认证、凭据和唤醒生命周期设计，普通 reminder 或 Tailscale 不构成等价替代。
- 原生 `subagent`、Agent Teams 或 workflow 替代 `pstack_subagent`。放弃，因为它们没有同时提供 pstack 的角色文件、agent preamble 和三类 panel 语义。大型独立矩阵任务可选用 workflow，但不改变主工作流。
- 把 worktree、history、session search 设为所有技能的硬依赖。放弃，因为基础技能不需要这些能力。改为按 playbook 声明能力门槛和可见降级。

## 后果

上游文本可以持续同步，DSH 差异集中在可审查的规则和 Host 模块中。生成资产较大，但同步 diff 可直接评审。55 个技能有明确的来源和去向，新会话能按单元实施，不必重新做术语调查。

代价是需要维护一批精确 patch，并新增会话历史授权工具。复杂 playbook 需要分阶段验证，不能以技能注册成功代替运行等价。可选能力缺失会降低 recall、完整审计、并行写入、模型多样性和长任务自动化的可用范围。

当上游改动使锚点失效时，同步必须停止并由开发者重新审查语义，不能静默跳过。若未来 DSH 提供通用路径触发、公开子代理模型策略或完整自动化入口，应新写决策记录并链接本记录，再调整降级方案。
