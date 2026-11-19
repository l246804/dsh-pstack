# Playground 验证流程

本文件定义 playground 的阶段、批次、命令和交接条件。运行模型与证据布局见 [model.md](./model.md)，场景规则见 [scenario-rules.md](./scenario-rules.md)，分析规则见 [evidence-analysis.md](./evidence-analysis.md)，worker 操作见 [worker.md](./worker.md)。所有命令在仓库根执行，Linux 是 playground worker 运行时唯一支持的平台。

前置：`native/gaps.json` 存在 `confirmed` 缺口，且缺口场景已按 [scenario-rules.md](./scenario-rules.md) 建好。

## 阶段交接

| 阶段 | 进入条件 | 产物 | 出口 |
| --- | --- | --- | --- |
| 1. native 验证 | 无当前 native 快照 | `evidence/runs/native-<environment>/` 当前快照 | 分析写入 `playground/evidence/findings/native.md` |
| 2. native 分析 | native 快照完整 | `playground/evidence/findings/native.md` 与适配答案审查 | `dsh-md` / `plugin` / `upstream` / `ignore-environment` / `待你判断` 分流 |
| 3. 适配开发 | 分析给出当前单元的结论 | 更新当前单元的 dsh.md、适配代码、生成树和 build | adapted/<environment> |
| 4. adapted 验证 | 新 build 完成 | `evidence/runs/adapted-<environment>/` 当前快照 | 分析写入 `playground/evidence/findings/adapted.md` |
| 5. adapted 分析 | adapted 快照完整 | `playground/evidence/findings/adapted.md` 与当前单元适配答案审查 | 通过后进 README/release-ready；可选环境按需补跑 |
| 6. 可选环境 | 需要环境对照时 | `evidence/runs/<treatment>-<environment>/` 当前快照 | 对应分析 |
| 7. README + release-ready | 分析通过 | README/兼容表、`vp run ci` 通过 | 用户手动 `vp run release` |

每个 treatment 的 collect 与分析之后，先按 [evidence-analysis.md](./evidence-analysis.md) 完成语义审核，再按 [evidence-redaction.md](./evidence-redaction.md) 完成脱敏，才能进入下一阶段。

## 批次

- `run-batch --treatment <native|adapted> --environment <ID> --full`：覆盖该单元声明的全部适用场景（`scenario.treatments` 含该 treatment 且 `scenario.environments` 含该 environment），成功后整份当前快照更新。
- `run-batch --scenarios`：增量批次，只替换本次跑到的场景；未跑到的场景保留当前快照。
- `run-batch --only-failed`：native 只选择 gap，adapted 只选择 not-verified。
- `batchId` 在批次启动时生成，不按记录时间推导；它只写入 `current-batch.json` 和 `manifest.json`。
- 同一单元只允许一个批次写入；批次失败时 `.staging` 丢弃，当前快照不动。

## 命令

### native

```sh
vp run native:generate
vp run playground:prepare -- --treatment native --environment base --reset
vp run playground:bootstrap -- --treatment native --environment base --all
vp run playground:run-batch -- --treatment native --environment base --full
vp run playground:collect -- --treatment native --environment base
```

然后在新的分析会话按 [evidence-analysis.md](./evidence-analysis.md) 填写 `playground/evidence/findings/native.md`。

### adapted/base

```sh
vp run build
vp run playground:prepare -- --treatment adapted --environment base --reset
vp run playground:bootstrap -- --treatment adapted --environment base --all
vp run playground:run-batch -- --treatment adapted --environment base --full
vp run playground:collect -- --treatment adapted --environment base
```

adapted 的插件以 `pnpm pack` 产物安装，prepare 前必须有最新 `dist`；`vp run build` 同时刷新生成树和插件构建。

### 可选环境对照

可选环境按需启用，不默认运行。一个 probe 可声明多个 `environments`，在 base 与该环境各跑一次同一任务和观察。

```sh
vp run playground:prepare -- --treatment <native|adapted> --environment <environment> --reset
vp run playground:bootstrap -- --treatment <native|adapted> --environment <environment> --all
vp run playground:run-batch -- --treatment <native|adapted> --environment <environment> --full
vp run playground:collect -- --treatment <native|adapted> --environment <environment>
```

保留 base 的同题结果，才能判断差异来自环境还是适配。

### 增量与上游更新

上游更新只影响部分来源时，先用 diff 把改动映射到能力和场景，再跑对应增量：

```sh
vp run playground:run-batch -- --treatment native --environment base --scenarios <changed-scenario-a>,<changed-scenario-b>
vp run playground:collect -- --treatment native --environment base
```

完成适配修改后，用同一批场景跑 adapted 增量：

```sh
vp run playground:run-batch -- --treatment adapted --environment base --scenarios <changed-scenario-a>,<changed-scenario-b>
vp run playground:collect -- --treatment adapted --environment base
```

增量批次只替换本次跑到的场景；需要建立新基线时再跑一次 `--full`。

### 审核与生成

```sh
vp run playground:review -- --treatment <native|adapted> --environment <ID> --apply
vp run playground:review -- --treatment <native|adapted> --environment <ID> --check
vp run playground:gap-lock -- --check
vp run playground:status-table -- --write
vp run playground:status-table -- --check
vp run playground:compare -- --environment <ID> --all
```

`--check` 版本供 CI 和提交前校验使用；状态表没有任何快照时 `--check` 直接通过。

## 发版

更新根 `README.md`、`README.zh.md`、`docs/architecture.md`，运行 `vp run compatibility:check` 与 `vp run ci`。agent 停在 release-ready，`vp run release` 由用户手动执行；发布边界见 [../../docs/release.md](../../docs/release.md)。
