# 决定：委派契约集中复述在一处，运行时仍不依赖宿主包

Status: accepted
Date: 2026-10-25

## 背景

单元 3 要让 `pstack_subagent` 接宿主的 `tools`、`subagents`、`llm` 和调用方 `Agent`。这比单元 2 的 `skills` seam 宽得多：`ToolDefinition` 带 `output.schema` 与 `render`，`SubagentActivationSpec` 带嵌套的 `request` 与能力位，`LlmCallConfig` 与 `LlmResolvedModelInfo` 要参与真实校验。

[单元 2 的决定](2026-10-25-self-contained-skill-provider.md)已经确立：包内复述宿主契约，运行时零 `@deepseek-ai` import。理由是工作区目录按链接安装，profile 的 `pnpm-workspace.yaml` 设 `autoInstallPeers: false`，运行时 import 解析不到宿主包。该记录末尾也写明，单元 3 要重新评估这条边界。

三条候选路：(a) 继续逐模块复述；(b) 引入 devDependency 只做类型检查，运行时仍不 import；(c) 把复述集中到一份契约副本。

(b) 在本仓库不可行。依赖安装需要可写 store，当前环境是只读，装不进去；宿主包只存在于 DSH 安装树的 `node_modules` 里，没有可指向的 registry 来源。即使装进来，`tsconfig` 也要指向本机 DSH 安装路径才能解析，那份绝对路径无法提交，静态检查会变成机器相关。

(a) 会让同一批声明散落在 `roles.ts`、`models.ts`、`subagent.ts` 三处，DSH 升级时要逐处核对，且容易漏。

## 决定

选 (c)：新增 `src/host-contract.ts`，作为委派相关 rc.3 契约的唯一复述点。

1. 该模块只声明本插件实际绑定的切片：`Agent`、`AgentOptions`、`LlmCallConfig`、`LlmResolvedModelInfo`、`SubagentCapabilities`、`SubagentProvider`、`SubagentStartRequest`、`SubagentActivationSpec`、`SubagentActivation`、`ToolDefinition`、`ToolRunContext`、`ToolOutputDefinition`，以及驱动它们所需的服务切片（`ToolsHost`、`SubagentsHost`、`LlmHost`）。
2. 文件头写明版本 `0.2.1-rc.3`、四条 Inspect 取证方法，以及两处有意的简化：品牌 id 退化为 `string`；`ContentBlock` 只具名本插件会发出的文本块，其余变体保持不透明。
3. `roles.ts`、`models.ts`、`subagent.ts` 从该模块导入类型，不再各自复述。
4. 运行时仍然零 `@deepseek-ai` import。`package.json` 的 peerDependencies 不新增条目。
5. DSH 升级时以 Inspect 重新核对并只改这一个文件，然后跑委派测试与真实 profile 验收。

## 备选方案

- 继续逐模块复述（方案 a）。放弃，因为同一批声明会分裂成三份，升级核对成本和漏改概率都随模块数增长。
- devDependency 加 `import type`（方案 b）。放弃，因为当前只读 store 装不进去，宿主包也没有可安装来源；靠 `tsconfig` 指本机安装路径会让静态检查不可提交、不可复现。
- 直接把 `@deepseek-ai/*` 当 peerDependency 并运行时 import。放弃，理由与单元 2 同一条：链接安装解析不到，等于让插件只在特定安装方式下可用。
- 引入 schemastery 或 zod 来写行 Config。放弃，因为 Cordis 只消费 Standard Schema 的 `validate`，本单元的四个字段用手写校验即可，多一个运行时依赖不换来校验能力。
- 复制官方 `dsh-tool-subagent` 的实现（含 `allowedModels`、`parentAgentOptionsForDelegation`）。放弃，因为那些是宿主私有投影，本单元的 `allowedModels` 是 pstack 行配置自己的限制，不能混同。

## 后果

委派契约只有一个修改点，静态检查在无宿主包的仓库里仍然可跑，链接安装也不必解析宿主包。代价是这份副本没有编译期约束：宿主改签名时，类型检查不会报错，只能靠 Inspect 复核和真实 profile 验收发现。每次 DSH 版本升级都要把 `src/host-contract.ts` 当成必查项。

`Agent` 只有 `id`，因此本插件无法读到父会话的实际 route。`inherit-parent` 的语义是"不传 `agentOptions`"，由宿主合并，而不是本插件算出父 route 再显式传入。若将来宿主公开父 route 的读取 seam，可新写一条记录扩展这一点。

若某天本仓库的依赖安装改为可写、且宿主包有可安装来源，(b) 会重新变得可行，那时应新写一条记录取代本记录，而不是在两套机制之间并存。
