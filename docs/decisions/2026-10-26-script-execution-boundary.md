# 决定：`pstack_script` 不经审批与 sandbox，如实声明并补超时预算

Status: accepted
Date: 2026-10-26

## 背景

[Node 原生脚本运行时决定](2026-10-25-node-native-script-runtime.md)把随包 CLI 定为 Node 产物，用 `process.execPath` 启动，理由之一是 Desktop 上 `PATH` 里没有 `node`（Electron 进程自身就是那个二进制）。这决定了 `pstack_script` 不能走"让模型写 `node <path> ...` 到 shell"的路线。

但它也带出一个副作用：本工具直接 `spawn` 子进程，绕过了 `tools/pre-execute` 的审批链，也不受 `dsh-sandbox-policy` 约束。官方 `dsh-tool-bash` 是另一条路线——它经 `ctx.shell.resolve()`，传 `sandboxPolicy`，并在需要升级时走 `approveBashEscalation`。于是同一个 profile 里两个工具对"权限模型"的关系完全不同，而 README 的表述是"代理在 DSH 权限模型下执行命令"。

这是取舍，不是缺陷修复：换成走 `ctx.shell` 会把上一段那个"零安装、用 `process.execPath`"的核心价值让掉。

## 决定

保持独立 `spawn`，并把代价显式化：

1. 工具 description 里直接写明「不经命令审批，Host 的 sandbox policy 不作用于它」，并说明这是为了让它在没有 `PATH` `node` 的环境里也能跑。模型在依赖这个差异时能说出来，而不是默认它等同 bash。
2. `cwd` 语义改为"会话目录"而不是"继承 Host 进程目录"（用 `ctx.workingDirectory.ensure(agent, signal)`，与 `dsh-tool-bash` 同一个 seam）。这是本次唯一的执行语义收紧，它让相对路径落回工作区/worktree，而不是落到 Host 进程启动目录。
3. `inject` 加入 `workingDirectory`；`jobs` 仍不进 `inject`，没有 job 控制器时工具照常注册、只有 `background: true` 被拒。
4. 不把 `pstack_script` 改成 `ctx.shell` 的封装，也不为它伪造一层 sandbox。
5. 工具定义上声明 `timeoutMs: MAX_TIMEOUT_MS`（600000），把宿主的 `dsh-tool-call-timeout-policy` 接成最后一层兜底。三条理由：
   - 字段真实存在，不是猜。宿主 `dsh-tools/lib/types/index.d.ts` 有 `timeoutMs?: number`，JSDoc 明确"由 `dsh-tool-call-timeout-policy` 执行"且"永不发给模型"。
   - 取 `MAX_TIMEOUT_MS` 而不是 `DEFAULT_TIMEOUT_MS`：工具自己的前台定时器（120000）在正常情况先触发，返回一个模型可读的 `timedOut` 结果；宿主预算只在**工具自身没能返回**时（挂起的 `await`、没跑的定时器）胜出。取默认值会让两者赛跑，宿主可能提前切断一次调用方本来允许的请求。它也不小于调用方可以请求的上限，所以不会切断合法调用。
   - 它**不**约束后台任务。`dsh-tool-call-timeout-policy` 在 `execute` settle 时立刻 `dispose` 掉定时器，而 `jobs.start` 返回只需毫秒级，所以后台子进程不受该预算影响。这一点是从宿主源码读出来的，不是推断（`tools/execute` 包装器 + `dsh-timeout` 的 `deadline`）。

## 备选方案

- 改走 `ctx.shell.resolve()`，传 `sandboxPolicy`，让 `background: true` 用 `ctx.shell` 的 spec 而不是自己 `spawn`。放弃：`dsh-bash-local` 的 `shell` 有自己的可执行路径解析，会把"用 `process.execPath`、零安装"这个前提让掉——而那正是本工具存在的理由（Desktop 上没有 `PATH` `node`）。另外背景任务改由 shell spec 驱动也会把 job 语义从"本工具自己的子进程"挪走，`background` 的拒绝理由要重写。
- 保持独立 `spawn`，但在 description 里不提审批与 sandbox。放弃：那就是当前状态，README 的承诺会被读者理解成"和 bash 一样受管"，模型也会按这个假设行动。说明成本比误判成本低。
- 声明 `timeoutMs` 让 `dsh-tool-call-timeout-policy` 施加预算。**后续已做**（同日后半段）：当时的理由是"`ToolDefinition` 在我们复述的契约里没有这个字段，硬加属于猜接口"，但这一条被证伪——宿主 0.2.1-rc.3 的 `dsh-tools/lib/types/index.d.ts` 里确实有 `timeoutMs?: number`，npm 那份与安装树逐字节相同，所以不是猜。见下面第 5 条。
- 给脚本加 `--dry-run` 或在派发前做静态白名单。放弃：脚本行为由各自的 `args` 决定，工具这一层没有能力判断"这次调用安全"，做了也只是把判断挪到一个看不到内部的地方。

## 后果

没有 `PATH` `node` 的部署仍然能用随包脚本，会话目录语义与官方 bash 工具一致。代价是这个工具在权限模型里是一个"已授权但不受 policy 约束"的通道：它只能跑本包审计过的产物（`id` 是封闭枚举，不接受路径或命令串），但脚本自身写什么、写到哪里，Host 不拦。

必须在 description 与 README 里保持这句声明与实际一致。若将来宿主提供"受 policy 约束的、指定解释器的执行"一等机制，应新写一条记录取代本记录，而不是让两套机制并存。`docs/release-verification-checklist.md` 里的相关用例仍需人工确认审批链实际未触发——静态门只能证明 description 说了什么，不能证明宿主行为。

`timeoutMs` 有一处后续风险：它依赖 `dsh-tool-call-timeout-policy` 在 `execute` settle 时 dispose 定时器这一行为。若宿主改成"预算覆盖整条调用链直到后台任务结束"，本工具的后台长任务就会被 600 秒切断。DSH 升级时必须重看那个包装器。`tests/script.test.ts` 只钉住"声明了这个值、且不小于前台默认与调用方上限"，钉不住宿主行为——后者只能靠升级时实测。
