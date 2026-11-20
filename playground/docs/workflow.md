# 验证流程

本文件说明 playground 的阶段、批次、命令和交接条件。运行维度见 [model.md](./model.md)，场景规则见 [scenario-rules.md](./scenario-rules.md)，worker 见 [worker.md](./worker.md)，分析见 [evidence-analysis.md](./evidence-analysis.md)。

## 前置

- Docker-compatible CLI 可用；Linux 原生、macOS 使用 Docker Desktop/Colima/OrbStack，Windows 在 WSL2 内运行。
- `vp run playground:doctor` 通过，worker 镜像与当前 DSH 版本匹配。
- `playground/config.ts` 已配置；字段见 [config.md](./config.md)。
- gap 流程需要 `native/gaps.json` 的 confirmed 缺口；只跑 regression 时不需要。

## 阶段

| 阶段 | 产物 | 出口 |
| --- | --- | --- |
| native 验证 | `evidence/runs/native-<environment>/` | 快照完整 |
| native 分析 | `playground/evidence/findings/native.md` | 每个场景有结论 |
| 适配开发 | 适配代码、`src/dsh.md`、build | adapted 可准备 |
| adapted 验证 | `evidence/runs/adapted-<environment>/` | 快照完整 |
| adapted 分析 | `playground/evidence/findings/adapted.md` | review 和 redaction 完成 |
| 发版准备 | README、兼容表、`vp run ci` | release-ready |

每个 variant 的 `collect` 后先按 [evidence-analysis.md](./evidence-analysis.md) 做语义审核，再按 [evidence-redaction.md](./evidence-redaction.md) 脱敏。

## 批次

- `--full`：按场景声明的 variants/environments 选择全部适用场景，成功后更新整个当前快照。
- `--scenarios a,b`：只替换本次跑到的场景，其他场景沿用当前快照。
- `--only-failed`：从已审核快照选择 native gap / adapted not-verified 场景。
- `batchId` 在启动时生成，写入 `current-batch.json` 和 `manifest.json`；同一单元只允许一个批次写快照。
- `run-batch` 退出不会自动停止 worker；需要时运行 `playground:stop`。

## 长批次检查

批次预计超过 10 分钟时，主 agent 创建每 10 分钟触发的 schedule，批次结束、失败或被停止后删除。

```sh
vp run playground:status -- --variant <variant> --environment <environment>
vp run playground:session-tail -- --variant <variant> --environment <environment> --worker <N> --scenario <scenarioId> --limit 10
```

检查最后 10 个事件的类型、时间和 `latestAge`。同一工具重复、连续轮询子代理但没有完成事件、`latestAge` 超过 5 分钟且仍在运行，或内容明显偏离当前 scenario 时，调用 `playground:stop-task`。`scenarioTimeoutMs` 仍是最终 hard timeout。

## 命令

### native 基线

```sh
vp run native:generate
vp run playground:prepare -- --variant native --environment base --reset
vp run playground:bootstrap -- --variant native --environment base --all
vp run playground:run-batch -- --variant native --environment base --full
vp run playground:collect -- --variant native --environment base
```

### adapted

```sh
vp run build
vp run playground:prepare -- --variant adapted --environment base --reset
vp run playground:bootstrap -- --variant adapted --environment base --all
vp run playground:run-batch -- --variant adapted --environment base --full
vp run playground:collect -- --variant adapted --environment base
```

adapted 的插件来自 `pnpm pack` 产物；`prepare` 前必须有最新 build。

### 增量与环境

```sh
vp run playground:run-batch -- --variant <variant> --environment <environment> --scenarios <ids>
vp run playground:collect -- --variant <variant> --environment <environment>
```

可选环境的 base 结果要保留，才能区分环境效应和适配效应。可用 environment 见 `runner/scenario/environments.ts`。

### 审核和生成物

```sh
vp run playground:review -- --variant <variant> --environment <environment> --apply
vp run playground:review -- --variant <variant> --environment <environment> --check
vp run playground:gap-lock -- --check
vp run playground:status-table -- --write
vp run playground:status-table -- --check
vp run playground:compare -- --environment <environment> --all
```

## 发版

更新 `README.md`、`README.zh.md` 和 `docs/architecture.md`，运行 `vp run compatibility:check` 和 `vp run ci`。agent 停在 release-ready；`vp run release` 由用户执行，边界见 [../../docs/release.md](../../docs/release.md)。

## 完成标准

- 当前 variant/environment 的 manifest、record 和截图完整。
- 分析、review `--check` 和 redaction `--apply` 完成。
- 状态表和对比检查通过，`vp run ci` 通过。
