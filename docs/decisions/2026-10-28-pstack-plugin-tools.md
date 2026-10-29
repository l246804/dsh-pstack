# 决定：pstack 插件工具面按命名加载、角色文件与 agent preset 组织

Status: accepted
Date: 2026-10-28
Scope: src/**, tests/**, cordis.patch.yml
Implemented-by: commit:2d47218696015d461e93216cea3d9602d2d24917
Review: 2027-04-28

## 背景

pstack 的上游技能大多声明 `disable-model-invocation: true`，`poteto-mode` 又要求按名称路由到 `how`、`why`、`architect` 等隐藏技能；DSH 的 `skill` 工具只暴露模型可见目录。上游还把每个角色的模型写在 `pstack-models.mdc`，并要求 `poteto-agent`、`comment-sicko` 两种专用委派身份。DSH 没有与 Cursor 的 `subagent_type`、`readonly` 或角色规则文件一一对应的字段，但提供 `ctx.skills.get()`、`ctx.llm`、角色行可读的本地文件，以及 `@deepseek-ai/dsh-agent-preset` 的 persona/工具组合。

## 决定

插件入口在根 `src/`，由 `cordis.patch.yml` 声明为四个工具行与两个 agent preset：

- `pstack_skill` 通过 `ctx.skills.get()` 按名称加载 pstack 技能，可读取技能目录内的相对资源；它绕过模型目录策略，但只能访问本插件注册的 provider。
- `pstack_models` 只读枚举 `ctx.llm` 的实际 provider/model/effort；`/setup-pstack` 把角色写入 `$DSH_HOME/pstack-models.mdc`（2026-10-29 起与上游同名，此前为 `poteto-models.mdc`），`pstack_subagent` 每次委派重读该文件。
- `pstack_subagent` 按 `role` 解析 `provider/model [effort]`，并把 `agent` 映射到 `poteto-agent` 或 `comment-sicko` 的 preset id；`general` 不加 preset。
- `pstack_script` 以封闭的 `id` 枚举运行随包 Node 脚本，使用 `process.execPath` 与 Electron 的 `ELECTRON_RUN_AS_NODE=1`。
- `comment-sicko` 的只读约束由 preset 内的 `dsh-tool-fs` 关闭 `write`/`edit` 实现，而不是单次调用的 `readonly` 字段。

## 备选方案

- **把所有被路由技能改为 model-invocable。** 不选：技能目录膨胀，且与上游“隐藏大部分技能”的设计相反。
- **让路由技能直接 `read` 绝对路径。** 不选：安装路径、bundle 资源路径和相对引用容易断，且无法校验调用者。
- **用纯 agent preset 表达角色。** 不选：角色组合会爆炸，技能无法在一条委派里动态按角色选择。
- **用专用 `pstack_agent` 工具替代原生 preset。** 不选：会重复维护 persona、工具组合与恢复语义，原生 preset 已能表达同一约束。

## 后果

- 隐藏技能仍可被 pstack 路由，同时不进入模型的普通技能目录。
- 角色文件仍是可手改的纯文本；格式错误在委派时按行号报告，缺失文件回退到 `inherit-parent`。
- preset 的工具组合是静态的，修改 `comment-sicko` 的只读边界要改 `cordis.patch.yml` 并重新安装。
- `pstack_script` 不经过 bash 审批与文件系统沙箱；这是为了在 Desktop 的 Electron 运行时执行脚本而接受的代价。
