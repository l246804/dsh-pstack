# Playground

Playground 用真实 DSH Web 会话验证 native 运行时与当前适配实现。先读本文件；细节只在对应分支触发时读取。

## 先读

| 触发 | 文档 |
| --- | --- |
| 改配置、provider、凭证或浏览器 | [docs/config.md](./docs/config.md) |
| 理解 variant、environment、运行身份或证据布局 | [docs/model.md](./docs/model.md) |
| 新增或修改场景、gap 或 regression | [docs/scenario-rules.md](./docs/scenario-rules.md) |
| 跑阶段、批次、增量或发版 | [docs/workflow.md](./docs/workflow.md) |
| 改容器、prepare、bootstrap、预览或停止 | [docs/worker.md](./docs/worker.md) |
| 分析记录、写 findings 或 review | [docs/evidence-analysis.md](./docs/evidence-analysis.md) |
| 脱敏或提交证据 | [docs/evidence-redaction.md](./docs/evidence-redaction.md) |

## 事实源

- 用户配置：[config.example.ts](./config.example.ts) 和本地的 `playground/config.ts`。
- 场景定义：`playground/scenarios/probes/`；结构和断言类型见 `runner/types.ts`。
- 容器挂载和启动参数：`runner/container/spec.ts`。
- worker 路径、状态和 workspace 布局：`runner/worker/worker.ts`。
- 证据快照：`runner/evidence/review-snapshot.ts`。

## 边界

- 运行维度是 variant × environment。`native` 只使用 DSH 标准运行时；`adapted` 使用当前适配实现。
- worker 是独立 Docker 容器，只挂载固定 `/dsh` 路径。仓库根、`playground/scenarios`、宿主 home、Docker socket 和宿主的 browser profile 都不进入容器。
- `playground/config.ts` 是唯一用户配置源；字段和默认值从示例与类型读取，不在文档中复制。
- `copyCredentials` 默认关闭；开启时只复制 DSH 的 `.credentials.yaml`。
- `prepare` 自动计算 worker 数量；`run-batch` 退出后不会自动停止 worker，需要时运行 `playground:stop`。
- 批次必须按 `prepare → bootstrap → run-batch → collect` 串行执行。提交前运行 `vp run ci`。
