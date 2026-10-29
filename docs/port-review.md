# pstack 移植审查报告

- 轮次：baseline
- 审查对象：当前分支 HEAD（`F-01`～`F-04` 修复；基于 `e826750`）
- 审查迭代：1（首次实现后审查）
- 上游提交：pstack `1ba91fc25c0977741dd0e267849e6234b037ed0a`（`0.15.36`）；DSH `f3803c96974ad4a94195fb97e5c637e9c2a3afe3`（`0.2.2-alpha.2`）
- 审查状态：待审查
- 收尾状态：未开始
- 阻断摘要：无
- 用户确认：-

## 1. 审查范围与依据

本轮审查 `port` 基线的实现提交，覆盖 `PI-01`～`PI-09`（`PI-04` 已随上游删除 `orch` 退役，不在实现范围）、对应 README 能力行、`pstack/runtime` 的 Node 等价移植、根 `src/**` 手写插件、`cordis.patch.yml`、`tests/**` 与 `pstack/runtime/**/*.test.ts`。平台排除项按 README 第 4 节复核，不进入实现验收。

依据：

- `pstack/README.md` 第 2～7 节的能力分类、既定适配与实现选择。
- `docs/decisions/2026-10-28-pstack-plugin-tools.md`（AD-01）、`docs/architecture.md` 与 `docs/port-prepare.md`。
- DSH 当前提交的公共 API：`packages/core/agent/src/runtime-types.ts`、`packages/core/agent-loop/src/agent.ts`、`packages/core/tools/src/schema.ts`、`packages/skill/skill/src/index.ts`、`packages/subagent/subagent/src/types.ts`、`packages/llm/llm/src/types.ts`、`packages/jobs/jobs/src/types.ts`。
- 上游 pstack 当前提交的脚本与测试原文。

`docs/port-review.md` 上一轮只有初始基线，没有可继承的 findings、修复或关闭记录；本轮为首次实现后审查。

### 1.1 受审文件与内容哈希

受审文件共 72 个：根 `src/**` 14 个、`tests/**` 4 个、根与 pstack 构建/包清单 8 个、`pstack/harness/docs/harness/dsh.md` 1 个、`pstack/runtime/**` 45 个。以下哈希为 `sha256sum` 对当前受审提交工作树的结果；`pstack/runtime/` 的相对路径在首列省略该前缀。

```text
3a013868f6a82d633ef1a720eb62993745109a751968f080dd5c562252e023b2  src/index.ts
7c9eff832b2659e7a2f2359d642aaa672020c1adcf0732f71541b1abfbabe0eb  src/models.ts
14080e744b148dfefea84d6be4f51beccc4d4931aba46d9a863e9c9790836f18  src/script.ts
5854b53852681e28ce34e5a6fc04fc7ccde92d269c601313e28c690fcb6c8d60  src/skill.ts
65fcf34e0c903eca18c9144b18b454f46db10af40fe6ea69476bfee6b3241678  src/subagent.ts
081e008b488f91b647709257569b1f650ea8d41168fdf4786eab800fc47e80fb  src/internal/audit-context.ts
e254fab90a1c4e310377f77aff361a877a9bea8abbcef51ad02c2ba17e572a63  src/internal/effort.ts
9bfff613f9515784d52ebc00e709cad1093cb559988d55151d8570ef5d7df423  src/internal/frontmatter.ts
147d06881bbe0ec2b26d55c389a5a34dd180e17ccddb13f7fe6dc9854eb533d7  src/internal/host-contract.ts
67385d0f14fcb7195a9325e3c54fe595946a8dcecbb5d860eafea410bbc39d79  src/internal/paths.ts
d0dfc2343e15b8386a7538ef784a70af68114427c9ee8b9ea44afe83955bd76d  src/internal/role-config.ts
3b5311f20b53a2b63b966111e41be391a556973493966174185ec2c37f79425d  src/internal/role-manifest.ts
ac882ae0fad2601b6cfa4bc7a4903cd9fc61e562632469672af8873bc8b7d9b0  src/internal/script-registry.ts
58b85c9f4543619ef54e56389fb399282fdd762b148db706c9d4fc0c1a353197  src/internal/skill-provider.ts
2c25bbe1fb408bd3b9f62c0cb0693b375cb75a64a7c07c53a5a54bab2da3da25  tests/models.test.ts
ae53f15ac5067c8ede0f05e42e0072244cb96e1b7bf8e16446348943cccee8e8  tests/script.test.ts
b296e7bf69089f7a667ecd3156eba32fe09cc60d26c8d6fa85d327d944d484a0  tests/skill.test.ts
d4a71b6876d9ba8ca396d13b099f4e30dcc325fde8089be5dfb0b28af5f52c20  tests/subagent.test.ts
65da1f2ad7451b4b27cb8c2c8b93713ab6dba0c2619f9273042f7d8b9f78ee28  cordis.patch.yml
a1ec9d7994d59a5f4ffb53500419858036d4740db9f63fbd9f706edb252e744f  package.json
e775cf36610fe738679a48a6e8c7eb3b3dc6cd0ae418771404a2876e7f4400be  vite.config.ts
e80c8c10e5733611cd4cf93023a791e7b382040b97e94c84edf1065b8dc676bf  pstack/package.json
5b7f864115edf507c366cc03cac032cd83d794a3a5d29f93c4b530d38418389b  pstack/vite.config.ts
3e6e83473977b9b989a7bf5bdf12646ddc7384c659cd5e60af1f9bdf8012484b  pstack/scripts/copy-pstack.mjs
aa1f983934fdc6860fae4447933e3bafd2b3e68695d0b2a8faf30a0c4b22e60f  pstack/scripts/generate-pstack-harness-tree.mjs
0860f9cc81cc9f73bbba7a1cc6a7d3d0bb67ee13bc23343427bac22ec5814068  pstack/scripts/replace-scripts.mjs
10f9c053095bf1e2886b03b138374b54f26b36ee93605505a3aeab0ea9bf795e  pstack/harness/docs/harness/dsh.md
927f93922f2430dde507d1a7f6649e92e9aa9346d3b9ece8d25930b877d560e5  skills/poteto-mode/scripts/check-plan.mjs
965a56f9a1fc7296c106275dd05f7b2b8222f8d3e81f26642601d2a41fd7510d  skills/poteto-mode/scripts/check-plan.test.ts
cce554092f152b459e1299db78f2e88d3626be69bb0cf7daad26011327609d56  skills/poteto-mode/scripts/expect.ts
2ff48634a4ad6fc81d965ddde1533019ad1e564ab77bc0b835ca1ca32d02f5d7  skills/poteto-mode/scripts/support.ts
efa4c385d213beeb19b5bca5b6299dad543e5560f306496f7106bcb1ba9ef784  skills/poteto-mode/scripts/watch-pr/cli.test.ts
89c08863089181a232be782c4b2ed90a1552f44aeecb0dcb7aac2c623620e680  skills/poteto-mode/scripts/watch-pr/cli.ts
cf0c5ee61b4a73444c1b775cfb6c81a40d312e055dd21a1f5eae6276e54de13f  skills/poteto-mode/scripts/watch-pr/fakes.test-helper.ts
a172f8d635d6a8a05cb4d86d7cb8068fb2990c76d741c1a4f43134d629e9d18c  skills/poteto-mode/scripts/watch-pr/github.test.ts
7ba193190d488c8ce0982c85234ebea026e9a595703e99a3c3df0fcd640ddd18  skills/poteto-mode/scripts/watch-pr/github.ts
7aba96fd8227411c91ddd2a4b03d4438329cf9b74b5a5fd2bdd842107bd06eb9  skills/poteto-mode/scripts/watch-pr/policy.test.ts
2d4823aeea788acab258ec60eb52e7b9e3a23a6649850af128d6ada5c33d7778  skills/poteto-mode/scripts/watch-pr/policy.ts
2b709e86628d5b8fdb61f860e60ababc342b0626c67576305442cf548283a604  skills/poteto-mode/scripts/watch-pr/render.ts
daa66c56220bae084c18cc6d3b0a2c66c0e72206d298e40973b44ee085ce16d2  skills/poteto-mode/scripts/watch-pr/types.ts
da3863181428e3b835c4be09ab8f916f4ee59026e0a2d934aab16336b8e1940e  skills/poteto-mode/scripts/watch-pr/watch-pr
0172fad14b07876914af79d371b3a8781fd6247f29647e078b20854fbb708659  skills/poteto-mode/scripts/worktree-audit.test.ts
059c7a9434e8a648a937b8dcc01573280c9d1723878efe19159494e51f55c559  skills/poteto-mode/scripts/worktree-audit.ts
f2a3b7ead00edc7238986b783727b7a8dec459e2a850eba2bb9fc11c83fedcc9  skills/show-me-your-work/scripts/log.test.ts
b42ac40c37f4d7188896fe8c91913b84a1d048727414e5f56b5cd9f5e8ddd740  skills/show-me-your-work/scripts/log.ts
aea4d8766d214e7fa08f4881f1037319655e75eb56652e1b6d5d4f13a162e3e1  skills/statechart/scripts/backends/cfg.ts
75704b2704a9399a39479ff704a580d5b9a1d0fede01fe771df28bf799b434b6  skills/statechart/scripts/backends/mermaid.ts
e2bedb855eb3806ec3fe7a7bfa49baa309fb4cf0da425b5fe1e0686268ce255a  skills/statechart/scripts/backends/plain-text.ts
730b4048578ab0468e1581f16fec60b246e321161effb68e481efb373f0f2501  skills/statechart/scripts/backends/report.ts
5eeab1e755f20a2c83b408c6503fdc9c6b10c971d8dedad3f912bd15f9763daf  skills/statechart/scripts/frontends/config.ts
4eef9ec848557dcd01ca8dbbec75b71c0653c1b73583108bafbb6f559f6d677b  skills/statechart/scripts/frontends/dot.ts
eb0120e61a4004a435c7b7c46916da9dc8b2fa8696ed0d3eb64dc953fed3ab11  skills/statechart/scripts/frontends/marks.ts
36bfc6fb3ffa86897661efb2aa67bd95b55a4da9a3e952831f6e0668826b4b92  skills/statechart/scripts/frontends/messages.ts
450cdfc8d0577a96818ca3697efebbbf70b530a4ba7e3eee03cf1ba8d3f1a0fd  skills/statechart/scripts/frontends/spec.ts
7d083cf89b81c41556fc3fd5f07019886e0f6783c632475e7181ac4b81887367  skills/statechart/scripts/frontends/trace.ts
7c54be394b7a10f60591858a0f08fb1e8dc0941df1f38ede07fbe7719ff56da0  skills/statechart/scripts/frontends/value.ts
0d0a9d6b6d6da5a7c48851b86d9d041f22982404dda6288795a1715138d7008b  skills/statechart/scripts/frontends/verdict.ts
2c0af8939321c5aaed4b6ecac8ce6a98d0e6774d8bd15d4b02fe4f406b8c9620  skills/statechart/scripts/frontends/view.ts
5602beca4e4ac08421cfa07e4da989f0e75439f1d136cc923226909e771dc7ff  skills/statechart/scripts/ir.ts
dc8eeee09c3a9a0c060f32fb1d554e01bd80e5265751cdeb041ef3e19561b92a  skills/statechart/scripts/passes/annotate.ts
b5ef402369c5e7846be1fd39165e95cbfe715fc36eb9331a0401b26523c539c9  skills/statechart/scripts/passes/label.ts
8977dddc6c93bb2e3914d5b50760eb66876107ba51e2b8cf9e18611b4c40c89c  skills/statechart/scripts/passes/lift.ts
07d459385849aa35834040bf34e279c39baba68244ec9da17c57703a6ee8e2d4  skills/statechart/scripts/passes/loop-check.ts
9af1066b007ef86cb05c5e278eef09f090f1e46eb91d356e5146edbd4fee4ec7  skills/statechart/scripts/passes/paths.ts
b52b38f926814937b733221b40bd31075a69a2fb91ecbce2164752a8684bc5d6  skills/statechart/scripts/passes/reach.ts
8a6e0618740a14bb7048f6563b4324958177f4685d4d6d90364cc6245b1498b4  skills/statechart/scripts/passes/region-check.ts
d740ebfdbb5ec7b4984412a635a596b43af7a77b8bcb49a1463c8afa75299f72  skills/statechart/scripts/passes/regions.ts
8aa8d9295ab6762f7f2ffae91a0aee98b1a1314747c875edba4598fdab8ed543  skills/statechart/scripts/pipeline.ts
f330e0a3b0a9f8181c2e52252c4a47db3f0a64f79a7cca5490263e33a5f13c72  skills/statechart/scripts/run.ts
8015db27fce286dc9791696c0564c31b744604372b7ebebc07f59f9d1f7244ab  skills/statechart/scripts/statechart.test.ts
99ff16f9b529a3bd95980b4f89e57d1dfcb3968ae3e4545afc9432d8f39c1d3f  skills/statechart/scripts/statechart.ts
1f18ed5ef806982e05e8a40fc217e88257700b28b63cb4acbd647872f85f782b  skills/statechart/scripts/worker.ts
```

补充的源码对照：

| 文件组 | 与上游对照 |
|---|---|
| `pstack/runtime/skills/poteto-mode/scripts/watch-pr/{cli,github,policy,render,types}.ts` | 与上游逐字相同（0 diff） |
| `pstack/runtime/skills/statechart/scripts/{ir,pipeline,run,worker}.ts`、`backends/**`、`frontends/**`、`passes/**` | 与上游逐字相同（0 diff） |
| `pstack/runtime/skills/statechart/scripts/statechart.ts` | 仅 4 行差异：从源码运行时选 `worker.ts`，从编译产物运行时选 `worker.mjs` |
| `pstack/runtime/skills/poteto-mode/scripts/check-plan.mjs` | 仅把 `/loop 1h` 检查扩展为 `/loop 1h` 或 `create_goal` + `schedule_create`（12 行） |
| `pstack/runtime/skills/poteto-mode/scripts/worktree-audit.ts`、`pstack/runtime/skills/show-me-your-work/scripts/log.ts` | 完整 Node 重写；各自有行为测试 |

### 1.2 验证命令与结果

| 命令 | 结果 |
|---|---|
| `vp check` | 通过；38 个文件格式正确，0 errors；1 warning：`pstack/scripts/generate-pstack-harness-tree.mjs:204` 的 `require-array-sort-compare` |
| `vp test` | 通过；4 个测试文件、20 tests passed |
| `cd pstack && vp run test` | 通过；74 tests passed（含 watch-pr、worktree-audit、log、statechart） |
| `vp run build` | 通过；`@internal/pstack#build` 与根 `vp pack` 均成功，产物含 `dist/pstack`、`dist/skills` 与五个入口 `.mjs` |
| `cd pstack && vp run generate --check` | 通过：`pstack/pstack is up to date.` |
| `node dist/script.mjs` 逐个调用五个 id | 路径均存在；`watch-pr --help` exit 0、`worktree-audit --help` exit 0、`check-plan` 无参数 exit 2、`log` 无参数 exit 1、`statechart` 无参数 exit 2，均符合脚本契约 |
| `DSH_HOME=.tmp/dsh-home2 dsh --profile pstack-verify --no-open --port 0` | profile 启动成功并打印 Web URL；`--dump-config` 含 `pstack`、`pstack-models`、`pstack-subagent`、`pstack-script` 四行及两个 agent preset |
| 同一 profile 移除 `@deepseek-ai/dsh-experimental-tool-worktree` 后启动 | 启动成功并打印 Web URL；证明 pstack 不依赖该可选 worktree bundle |
| 直接加载 `dist/index.mjs` 的技能索引 | 63 个技能加载成功；`pstack_skill` 能加载隐藏技能 `how` 及其 `references/explorer-prompt.md`（1135 bytes） |
| `pstack/dist/runtime/skills/statechart/scripts/statechart.test.mjs` | 6 tests passed；仅覆盖值语法、配置、消息、合成 pipeline 与缺 spec 的 CLI 错误 |
| `sizeColumn` 对符号链接目录的复现 | `.tmp/wt-symlink` 中 `real/big` 为 2 MiB、`link -> real`：`sizeColumn` 返回 `4.0M`，`du -sh` 返回 `2.1M` |

构建产物核验：`dist/pstack/skills/statechart` 为 200 KB、27 个文件，未包含上游 corpus；`dist/pstack/skills/poteto-mode/scripts` 与 `show-me-your-work/scripts` 均含编译后的 `.mjs` 与精选测试。真实安装验证只覆盖插件加载、组合和脚本路径；模型交互行为由上述单元测试与 DSH 公共 API 核对补充。

### 1.3 分类结论

| 审查类别 | 结论 |
|---|---|
| 安全 / 权限阻断 | 无新增阻断。`pstack_script` 不经过审批与文件系统沙箱是 `AD-01` 已接受的代价，见第 4 节；其余模型工具均经 DSH 服务面执行。 |
| 行为或公共 API 错误 | F-01、F-02、F-03。 |
| 非最小实现 | 无（新增文件均有当前范围消费者或验收依据；`pstack_skill`、`pstack_models`、`pstack_script`、`pstack_subagent` 分别对应 README PI-01、PI-02、PI-08 与脚本范围）。 |
| 冗余残留 | C-01、C-02、C-03（非阻断清理项）。 |
| 验证缺口 | F-04。 |
| 决策 / 依赖阻断 | 无。没有待选择实现方案；`set_reasoning_effort` 可用 DSH `Agent.model.select()` 公共 API 修复，不属于外部依赖阻断。 |

### 1.4 模型可见工具与脚本入口的副作用

| 工具 / 入口 | 实际副作用 | 执行面与生命周期 |
|---|---|---|
| `pstack_skill` | 读取随包 `SKILL.md` 与技能目录内相对资源；不写文件、不联网。 | 直接读取包内资源；`resource` 只允许技能目录内的相对路径（词法检查，见第 4 节残余限制）。 |
| `pstack_models` | 读取 `ctx.llm` 的 live provider/model/effort 元数据；不写文件、不联网（adapter 自身的发现调用除外）。 | DSH LLM 服务；调用随 `exec.signal` 取消。 |
| `pstack_script` | 以 `process.execPath` 启动随包 Node 脚本；脚本可读写文件、启动 `git`/`gh`/`mise`/Java 等外部命令、联网；`background: true` 注册 `ctx.jobs` 后台任务。 | 前景直接 `spawn`；后台经 `ctx.jobs.start`，owner 为调用 Session；不经过 bash 审批与文件系统沙箱（AD-01 已接受）。 |
| `pstack_subagent` | 读取 `$DSH_HOME/poteto-models.mdc`；通过 `ctx.subagents.startActivation` 启动一个或多个子 Agent；向子 Agent 注入 poteto-mode 绝对路径；启动后可能在子 Agent 上注册 `set_reasoning_effort`。 | DSH subagent 服务管理子 Agent 生命周期；`cwd` 仅允许会话目录内或带 `.git` 的目录；子 Agent 的工具面由 agent preset 静态组合。 |
| `set_reasoning_effort`（子 Agent 工具） | 设计上改变子 Agent 后续模型请求的 reasoning effort；不写文件、不联网。 | 应由子 Agent 的 `Agent.model.select()` 执行；当前 F-01/F-02 证明该实现不成立，不进入 DSH 权限面。 |

## 2. 审查发现

### F-01 `set_reasoning_effort` 使用已废弃的 `agent/request` 修改 effort，下一次请求会抛错

- 状态：`fixed-pending-review`
- 范围：`port`
- 能力：`PI-08`；影响 `SUB-02`、`SUB-03`、`AGT-01`、`AGT-02`、`SKL-05`、`SKL-24`
- 严重度：行为 / 公共 API 错误（高）
- 文件：`src/internal/effort.ts:108-113`
- 证据：`installEffortControl` 在 `child.ctx.on("agent/request", ...)` 中返回 `{ ...config, reasoningEffort: current }`。DSH `packages/core/agent-loop/src/agent.ts:628-640` 明确比较 `agent/request` 提议的 `reasoningEffort` 与 step preparation 固定的 `selection.reasoningEffort`，不一致就直接抛错；`docs/upgrade-guide/v0.2.1-alpha.4/session-model-selection/guide.md:16` 说明 `agent/request` 已废弃，不能新增、修改或清除 reasoning effort，并要求改用 `agent.model.select()`。
- 影响：子代理调用 `set_reasoning_effort` 后，下一次模型请求会在 `prepareRequest` 抛错；`pstack_subagent` 工具描述和 `dsh.md` 对运行中子代理改 effort 的承诺不成立。子代理的初始 effort 仍可通过 `agentOptions` 设置，问题是运行中改 effort。
- 修复建议：删除 `agent/request` listener；在工具校验通过后调用 `child.model.select({ provider, model, reasoningEffort })`（provider/model 取自当前 `resolveEffortTarget`）。增加“改 effort 后下一请求使用新值”的行为回归，和“非法 effort 不改变当前选择”的失败路径。
- 修复记录（2026-10-29，`implement port`）：已删除 `agent/request` waterfall 与 `current` 局部状态；`set_reasoning_effort` 校验通过后调用执行方 Agent 的 `agent.model.select({ provider, model, reasoningEffort })`，由 DSH 在下一步准备时应用。新增 `tests/effort.test.ts`：断言安装时不注册任何 `agent/request` 监听；成功调用记录完整 selection；未知 effort 被拒绝且 selection 不变。`vp test`：5 files、23 tests passed。

### F-02 `set_reasoning_effort` 的 `parameters` 不是合法的对象 JSON Schema

- 状态：`fixed-pending-review`
- 范围：`port`
- 能力：`PI-08`；影响 `SUB-02`、`SUB-03`、`AGT-01`、`AGT-02`、`SKL-05`、`SKL-24`
- 严重度：公共 API / 行为错误（高）
- 文件：`src/internal/effort.ts:141-147`
- 证据：`parameters` 被写成 `{ effort: { type: "string", description: ... } }`，缺少 `type: "object"`、`properties` 和 `required`。DSH `ToolSchema.parameters` 定义为“JSON Schema object for the arguments”（`packages/llm/llm/src/types.ts:517-528`）；`ToolsService.schemas()` 原样投影 `definition.parameters`（`packages/core/tools/src/schema.ts:641-645`）；pi-ai adapter 也原样传给 provider（`packages/llm/llm-pi-ai/src/context.ts:131-133`）。该工具在 `installEffortControl` 中无条件注册到每个子代理。
- 影响：工具声明不是合法的对象 schema；严格 provider 会拒绝请求或模型无法正确调用。即使 F-01 修好，这个 schema 仍必须修。
- 修复建议：改为标准对象 schema：
  ```ts
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: { effort: { type: "string", description: "..." } },
    required: ["effort"],
  }
  ```
  增加一个断言工具根 schema 为 object 且含 `effort` 的回归测试。
- 修复记录（2026-10-29，`implement port`）：`parameters` 改为标准的对象 schema：`type: "object"`、`additionalProperties: false`、`properties: { effort: { type: "string" } }`、`required: ["effort"]`。`tests/effort.test.ts` 的 `toMatchObject` 断言根级 `type`、`properties` 与 `required`；`vp check` 无该文件类型错误。

### F-03 `worktree-audit` 的 SIZE 列跟随符号链接，与 `du` 不一致并可能无限递归

- 状态：`fixed-pending-review`
- 范围：`port`
- 能力：`PI-06`；影响 `SCR-03`、`PB-22`
- 严重度：行为错误（中高）
- 文件：`pstack/runtime/skills/poteto-mode/scripts/worktree-audit.ts:190-215`
- 证据：`directorySize` 对每个路径使用 `statSync`（默认跟随符号链接）并据此 `readdirSync` 递归；文件注释却声称 “A symlink contributes its own block and is never traversed, matching `du` without `-L`”。实测 `.tmp/wt-symlink`（`real/big` 2 MiB、`link -> real`）得到 `sizeColumn` = `4.0M`，而 `du -sh` = `2.1M`；说明链接目录被遍历并重复计数。符号链接目录成环时，该递归没有超时，审计可能挂死。
- 影响：`SIZE` 虚高，worktree 清理 playbook 的容量判断失真；在含 `node_modules` 符号链接或指向共享缓存的工作树中风险更高。
- 修复建议：使用 `lstatSync` 判定 `isSymbolicLink()`，对符号链接只计入自身块（按 `du` 语义不递归）；补充“含符号链接目录”的测试。
- 修复记录（2026-10-29，`implement port`）：`directorySize` 改用 `lstatSync`，计数后对 `isSymbolicLink()` 直接跳过递归。新增 `worktree-audit.test.ts` 用例：2 MiB 外部目录经目录符号链接挂入工作树，`sizeColumn(worktree)` 低于 1 MiB，而外部目录自身不低于 2 MiB。`cd pstack && vp run test`：76 tests passed。

### F-04 `statechart` 的 worker 路径没有验收测试，README 7.1 的“worker 路径冒烟”不成立

- 状态：`fixed-pending-review`
- 范围：`port`
- 能力：`PI-09`；影响 `SCR-05`、`SKL-33`
- 严重度：验证缺口（中）
- 文件：`pstack/runtime/skills/statechart/scripts/statechart.test.ts:104-111`；`pstack/README.md:575`
- 证据：本地 `statechart.test.ts` 只有 6 个测试；CLI 用例只 spawn 一个缺少 spec 的进程，命中 usage/exit 2，不会进入 `statechart.ts` 的 worker spawn、`worker.ts` 的 `check()` 或 `run.ts` 的 TLC 调用。`grep -n "worker\|TLA2TOOLS\|corpus" statechart.test.ts` 无结果。README 7.1 的 B 方案对照表却把 “worker 路径冒烟” 列为 `cli.test.ts` 的覆盖项。上游 `test/cli.test.ts` 有 `JAVA`/`TLA2TOOLS`/`STATECHART_REPLAY` 的 fake TLC 端到端测试，可作最小参照。
- 影响：新入口 `statechart.mjs` → `worker.mjs` 的路径选择、参数传递、输出目录、退出码和 `report.md`/`chart.mmd` 行为未经验收；打包或运行壳漂移不会被测试发现。
- 修复建议：增加一个 fake TLC/worker 的 smoke test（不必引入上游整个 corpus），或明确删除 README 7.1 的“worker 路径冒烟”声明并把该覆盖项标为未覆盖；不能只保留文档声明。
- 修复记录（2026-10-29，`implement port`）：`statechart.test.ts` 新增 worker 冒烟用例：设置 `TLA2TOOLS` 与 `JAVA` 指向临时 fake TLC，真实启动 `statechart.ts` → `worker.ts`；fake 返回 SANY XML、TLC stats 与 `graph.dot`，断言 exit 0，`report.md`/`chart.mmd`/`tlc.out` 三件产物存在且报告含 `# Smoke` 与 `NoDeadlock`。`cd pstack && vp run test`：76 tests passed。

## 3. 非阻断清理项

以下不影响本轮能力验收，但属于可执行的清理建议，由用户决定本轮或后续维护处理：

| ID | 类型 | 文件/行 | 建议 |
|---|---|---|---|
| C-01 | 过期注释 | `src/internal/role-config.ts:2` | 注释写成 `$DSH_HOME/pstack-models.md`，实际 `PSTACK_MODELS_FILENAME` 是 `poteto-models.mdc`；改为与 README 6.1、`docs/glossary.md` 一致。 |
| C-02 | 冗余残留 | `src/internal/paths.ts:38,60-62` | `AGENTS_ROOT` 与 `agentPreamblePath` 没有任何消费者；删除，或让 `pstack_subagent` 真正使用生成的 `agents/*.md` 并补测试。 |
| C-03 | lint warning | `pstack/scripts/generate-pstack-harness-tree.mjs:204` | 为 `.sort()` 提供 compare，消掉 `vp check` 的 `require-array-sort-compare` warning。 |

## 4. 已接受风险与残余限制

- `pstack_skill` 的 `readSkillResource` 只做词法路径检查，不调用 `realpath`；技能目录内若存在指向外部的符号链接，`readFile` 会跟随。当前技能目录是随包可信资源，且 `skills.get()` 只返回本 provider 的候选，因此不构成本轮未授权旁路；若未来允许第三方技能目录，需要补 `realpath` 检查。
- `pstack_script` 直接使用 `spawn` 启动随包 Node 脚本，不经过 bash 审批和文件系统沙箱；`AD-01` 已记录为 Desktop Electron 运行时的已接受代价，本轮不重新打开为 finding。残余风险：脚本参数含用户可控路径时可写任意绝对路径；`outputLimitBytes` 只限制捕获字符串长度，不限制字节数。
- `pstack_subagent` 的 `cwd` 只要求“会话目录内或带 `.git` 的目录”，不能证明目录属于同一仓库的 Git worktree；这是隔离性残余限制，不是本轮新引入的安全阻断。
- `statechart` 依赖外部 `mise`/Java/TLC，且编排器使用 `/bin/sh`；Windows 没有 `/bin/sh` 时该路径不可用。README 已按 `G-15` 记录外部依赖，不属于本插件实现的宿主能力。
- `dsh.md` 仍把已退役的 `orch` 列在脚本清单中，且尚未映射 `statechart`；README 第 9 节已把它列为留给 `doc` 的适配文档修订，不作为本轮 finding。

## 5. 能力状态映射

本轮 README 审查状态区按以下口径更新：

- `通过`：112 项。映射、标准模式、可选插件和插件内实现均有对应证据；本审查未发现实现偏差或必要验收缺口。
- `通过（平台排除）`：13 项。`AUT-01`～`AUT-06`、`EXCL-01`～`EXCL-06` 与 `SKL-31` 的 Cursor 专属部分按上游排除基线处理。
- `阻断（F-01/F-02）`：6 项。`SUB-02`、`SUB-03`、`AGT-01`、`AGT-02`、`SKL-05`、`SKL-24` 依赖 `pstack_subagent` 的子代理工具面，需先修复 F-01、F-02。
- `阻断（F-03）`：2 项。`SCR-03`、`PB-22` 使用 `worktree-audit`。
- `阻断（F-04）`：2 项。`SCR-05`、`SKL-33` 是 `statechart` 的脚本与技能入口。

平台排除项按排除基线不实现；其余 112 项通过。没有 `blocked` finding，不需要用户作实现/范围决策。

## 6. 结论与下一步

本轮发现 4 个可修复 finding（2 个行为/公共 API 错误、1 个行为错误、1 个验证缺口），没有需要用户决策的安全阻断或外部依赖阻断。按契约将 `审查状态` 置为 `阻断-可修复`，`收尾状态` 保持 `未开始`。

唯一下一步：运行 `/pstack-port implement port`，处理 F-01～F-04；修复完成后重新运行 `review port`，通过后才进入 `doc`。不得在本轮直接写 `pstack/pstack/`、`dist/` 或修改上游原文；`pstack/README.md` 只更新了审查状态区，能力需求与实现记录未改动。

## 7. 修复轮次（2026-10-29）

`implement port` 已处理 F-01～F-04，逐项修复与验证记录见第 2 节各 finding；`pstack/README.md` 的对应能力审查列已置为 `待审查`。本轮修复后的验证：`vp check` 0 errors（保留既有 C-03 warning）；`vp test` 5 files、23 tests；`cd pstack && vp run test` 76 tests；`vp run build` 与 `generate --check` 通过；DSH profile 在有/无 `@deepseek-ai/dsh-experimental-tool-worktree` 两种组合下均成功启动。

下一步：运行 `/pstack-port review port`。
