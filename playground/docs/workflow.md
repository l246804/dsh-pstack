# Playground 验证流程

本文件定义阶段、批次、命令和交接条件。运行矩阵见 [model.md](./model.md)，场景见 [scenario-rules.md](./scenario-rules.md)，worker 见 [worker.md](./worker.md)，分析见 [evidence-analysis.md](./evidence-analysis.md)。

## 前置

- Docker-compatible CLI 可用；Linux 原生、macOS 使用 Docker Desktop/Colima/OrbStack、Windows 在 WSL2 内运行。
- 当前 DSH 与 playground 镜像架构/版本匹配；首次或升级后运行 `vp run playground:doctor`，缺镜像时运行 `vp run playground:image`。
- `playground/config.ts` 已按 [config.md](./config.md) 配好。
- gap 流程需要 `native/gaps.json` 有 `confirmed` 缺口；只跑 regression 时场景即可，不要求 gaps 文件。

## 阶段交接

| 阶段 | 进入条件 | 产物 | 出口 |
| --- | --- | --- | --- |
| 1. native 验证 | 当前 native 快照缺失或需要刷新 | `evidence/runs/native-<environment>/` | 快照完整 |
| 2. native 分析 | native 快照完整 | `evidence/findings/native.md` 与审查结果 | `dsh-md` / `plugin` / `upstream` / `ignore-environment` / `待你判断` |
| 3. 适配开发 | native 分析给出当前单元结论 | 更新 `src/dsh.md`、适配代码、生成树和 build | `adapted` 可准备 |
| 4. adapted 验证 | 新 build 完成 | `evidence/runs/adapted-<environment>/` | 快照完整 |
| 5. adapted 分析 | adapted 快照完整 | `evidence/findings/adapted.md` 与审查结果 | 通过后 release-ready |
| 6. 可选环境 | 需要环境对照 | 对应 variant/environment 快照 | 环境结论 |
| 7. README + release-ready | 分析通过 | README/兼容表、`vp run ci` 通过 | 用户执行 release |

每个 variant 的 collect 后先完成 [evidence-analysis.md](./evidence-analysis.md) 的语义审核，再按 [evidence-redaction.md](./evidence-redaction.md) 脱敏。

## 批次

- `run-batch --variant <native|adapted> --environment <ID> --full`：按场景声明的 `variants` 和 `environments` 选择全部适用场景；成功后整份当前快照更新。
- `run-batch --scenarios a,b`：增量批次，只替换本次跑到的场景，其他场景沿用当前快照。
- `run-batch --only-failed`：native 选择 gap，adapted 选择 not-verified。
- `batchId` 在批次启动时生成，写入 `current-batch.json` 和 `manifest.json`；同一单元只允许一个批次写快照，失败批次丢弃 `.staging`。

## 长批次检查

批次预计超过 10 分钟时，主 agent 创建每 10 分钟触发的 schedule 消息；批次结束、失败或被停止后删除该 schedule。

每次检查执行：

```sh
vp run playground:status -- --variant <variant> --environment <environment>
vp run playground:session-tail -- --variant <variant> --environment <environment> --worker <N> --limit 10
```

agent 直接看最后 10 个事件的 `type`、`time` 和 `latestAge`，出现以下任一情况就调用 `playground:stop-task`：

- 同一个 tool 在最后 10 个事件中重复 3 次以上，且没有新的 `assistant/message` 或有效 `tool/result`；
- 连续出现 `wait_agent`、`job_output` 或反复查看子代理进度，但没有 `subagent/finished`、新的 assistant 输出或任务推进；
- `latestAge` 超过 5 分钟，且状态仍显示 running；
- assistant 内容或 tool 参数明显偏离当前 `scenarioId`，或在反复空转。

不要使用固定的 15 分钟等待。`scenarioTimeoutMs` 仍是最终 hard timeout。

## 命令

### native

```sh
vp run native:generate
vp run playground:prepare -- --variant native --environment base --reset
vp run playground:bootstrap -- --variant native --environment base --all
vp run playground:run-batch -- --variant native --environment base --full
vp run playground:collect -- --variant native --environment base
```

然后在独立分析会话按 [evidence-analysis.md](./evidence-analysis.md) 写 `playground/evidence/findings/native.md`。

### adapted/base

```sh
vp run build
vp run playground:prepare -- --variant adapted --environment base --reset
vp run playground:bootstrap -- --variant adapted --environment base --all
vp run playground:run-batch -- --variant adapted --environment base --full
vp run playground:collect -- --variant adapted --environment base
```

adapted 的插件以 `pnpm pack` 产物安装进 worker profile；prepare 前必须有最新 `dist`。

### 可选环境

```sh
vp run playground:prepare -- --variant <native|adapted> --environment <environment> --reset
vp run playground:bootstrap -- --variant <native|adapted> --environment <environment> --all
vp run playground:run-batch -- --variant <native|adapted> --environment <environment> --full
vp run playground:collect -- --variant <native|adapted> --environment <environment>
```

同一 probe 的 base 结果要保留，才能区分环境效应与适配效应。

### 增量与上游更新

```sh
vp run playground:run-batch -- --variant native --environment base --scenarios <ids>
vp run playground:collect -- --variant native --environment base
# 修改适配后
vp run playground:run-batch -- --variant adapted --environment base --scenarios <ids>
vp run playground:collect -- --variant adapted --environment base
```

### 审核与生成

```sh
vp run playground:review -- --variant <native|adapted> --environment <ID> --apply
vp run playground:review -- --variant <native|adapted> --environment <ID> --check
vp run playground:gap-lock -- --check
vp run playground:status-table -- --write
vp run playground:status-table -- --check
vp run playground:compare -- --environment <ID> --all
```

## 发版

更新 `README.md`、`README.zh.md`、`docs/architecture.md`，运行 `vp run compatibility:check` 和 `vp run ci`。agent 停在 release-ready；`vp run release` 由用户手动执行，边界见 [../../docs/release.md](../../docs/release.md)。

## 完成标准

- 当前 variant/environment 的 `manifest.json`、记录和截图完整。
- 分析、review `--check`、redaction `--apply` 都完成。
- 状态表/对比生成物 `--check` 通过，`vp run ci` 通过。
