# 怎么跑

本文件说明 playground 的前置、配置、worker、批次、命令与脱敏。场景契约见 [scenarios.md](./scenarios.md)，记录结构见 [records.md](./records.md)，判定见 [judge.md](./judge.md)。

## 前置

- Docker-compatible CLI 可用；Linux 原生、macOS 使用 Docker Desktop/Colima/OrbStack，Windows 在 WSL2 内运行。
- `vp run playground:doctor` 通过，worker 镜像与当前 DSH 版本匹配。
- `playground/config.ts` 已配置。
- gap 流程需要 `native/gaps.json` 的 confirmed 缺口；只跑 regression 时不需要。

## 配置

`playground/config.ts` 是唯一用户配置源。复制 [config.example.ts](../config.example.ts) 并填写；`config.ts` 和 `*.local` 不入库。字段、默认值和类型以 [config.example.ts](../config.example.ts) 与 `runner/types.ts` 为准，加载和校验见 `runner/config/config.ts`。

环境变量通过 `vite-plus` 的 `loadEnv("playground", ...)` 读取。配置在加载时解析；缺少必填字段、provider 路由无效或凭证无法解析会直接报错。

`copyCredentials` 默认关闭；开启时只复制配置的 DSH 凭证文件。

完成标准：`config.ts` 能加载并解析，`testModel` 与 `roleModels` 路由有效。

## Worker

worker 是独立 Docker 容器。仓库根、`playground/scenarios`、宿主 home、Docker socket 和宿主 browser profile 不进入容器。挂载、隔离参数和路径以 `runner/container/spec.ts` 为准。

- `prepare`：按场景数量、机器容量和 variant/environment 计算 worker 数量，写入 worker profile、模型和运行设置。
- `bootstrap`：打开每个 worker 页面，检查默认 workspace、模型、reasoning effort 和登录状态，并生成 readiness 证据。
- `open` / `close` / `reset`：预览、停止预览和重建 preview worker。
- `stop`：停止所有匹配的 worker；`stop-task` 写入当前场景的停止请求，由 `run-scenario` 在轮询点处理。
- `run-batch` 退出不会自动停止 worker；需要时运行 `playground:stop`。

完成标准：`prepare` 后 worker 的模型配置与当前 `config.ts` 一致；`bootstrap --all` 通过并生成环境级 readiness 标记。

## 阶段

| 阶段 | 产物 | 出口 |
| --- | --- | --- |
| native 验证 | `evidence/runs/native-<environment>/` | 快照完整 |
| native 分析 | `playground/evidence/findings/native.md` | 每个场景有结论 |
| 适配开发 | 适配代码、`src/dsh.md`、build | adapted 可准备 |
| adapted 验证 | `evidence/runs/adapted-<environment>/` | 快照完整 |
| adapted 分析 | `playground/evidence/findings/adapted.md` | review 和 redaction 完成 |

每个 variant 的 `collect` 后先按 [judge.md](./judge.md) 做语义审核，再按本文件的提交流程脱敏。

批次必须按 `prepare → bootstrap → run-batch → collect` 串行执行。

完成标准：当前 variant/environment 的 manifest、record 和截图完整。

## 批次

- `--full`：按场景声明的 variants/environments 选择全部适用场景，成功后更新整个当前快照。
- `--scenarios a,b`：只替换本次跑到的场景，其他场景沿用当前快照。
- `--only-failed`：从已审核快照选择 native gap / adapted not-verified 场景。
- `batchId` 在启动时生成，写入 `current-batch.json` 和 `manifest.json`；同一单元只允许一个批次写快照。

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

### 审核与守卫

```sh
vp run playground:review -- --variant <variant> --environment <environment> --apply
vp run playground:review -- --variant <variant> --environment <environment> --check
vp run playground:gap-lock -- --check
```

## 长批次检查

批次预计超过 10 分钟时，主 agent 创建每 10 分钟触发的 schedule，批次结束、失败或被停止后删除。

```sh
vp run playground:status -- --variant <variant> --environment <environment>
vp run playground:session-tail -- --variant <variant> --environment <environment> --worker <N> --scenario <scenarioId> --limit 10
```

检查最后 10 个事件的类型、时间和 `latestAge`。同一工具重复、连续轮询子代理但没有完成事件、`latestAge` 超过 5 分钟且仍在运行，或内容明显偏离当前 scenario 时，调用 `playground:stop-task`。`scenarioTimeoutMs` 仍是最终 hard timeout。

## 证据脱敏

哪些文件留在本地、哪些可以提交，见 [records.md](./records.md#证据布局)。脱敏规则、敏感类别和残留检查由 `runner/evidence/redaction.ts` 实现，本文件不复制规则列表。

1. `run-scenario` 生成 record 和本地 `record.source.json`；`collect` 从 worker evidence 读取 record，`record.source.json` 只用于定位截图。
2. 独立分析会话生成 `record.safe.json` 并检查 record 内容。
3. 检查候选文件：

```sh
vp run playground:redact -- --variant <variant> --environment <environment>
```

4. 只有检查通过的 safe record 才能应用：

```sh
vp run playground:redact -- --variant <variant> --environment <environment> --apply
```

`--apply` 会用 safe record 替换 `record.json`。

分析会话只读已机械脱敏的 record，不读取或粘贴原始 session；无法判断的字段标记为 `needs-human`，不要猜测放行；需要记录决定时，在同目录写本地 `redaction-notes.md`。

提交门：`evidence/runs/**/session.jsonl.zstd`、`record.source.json`、`record.safe.json` 永不提交；只有 `redact --apply` 成功后的 `record.json` 和人工确认的截图进入提交。

完成标准：`playground:redact` 检查没有残留 secret 或 host-path 类别。

## 收尾检查

一轮改动落地前，手动运行 `vp run typecheck`、`vp run playground:typecheck` 和 `vp test`。
