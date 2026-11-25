# Playground

Playground 用真实 DSH Web 会话验证 native 运行时与当前适配实现。先读本文件；细节只在对应分支触发时读取。

## 先读

| 触发 | 文档 |
| --- | --- |
| 准备环境、改配置、跑批次、脱敏提交 | [docs/run.md](./docs/run.md) |
| 理解 variant、environment、运行身份或证据布局 | [docs/records.md](./docs/records.md) |
| 分析记录、写 findings、判定或 review | [docs/judge.md](./docs/judge.md) |

## 事实源

- 用户配置：[config.example.ts](./config.example.ts) 和本地的 `playground/config.ts`。
- 场景定义：`playground/scenarios/`；结构和断言类型见 `runner/types.ts`。
- 容器挂载和启动参数：`runner/container/spec.ts`。
- worker 路径、状态和 workspace 布局：`runner/worker/worker.ts`。
- 证据快照：`runner/evidence/review-snapshot.ts`。

## 边界

- 运行维度是 variant × environment。`native` 只使用 DSH 标准运行时；`adapted` 使用当前适配实现。
- worker 是独立 Docker 容器，只挂载固定 `/dsh` 路径。仓库根、`playground/scenarios`、宿主 home、Docker socket 和宿主的 browser profile 都不进入容器。
- `playground/config.ts` 是唯一用户配置源；字段和默认值从示例与类型读取，不在文档中复制。
- playground 不作为发布门禁，发布检查见 [../docs/architecture.md](../docs/architecture.md)。
- 跑批次、改配置、脱敏提交的操作顺序见 [docs/run.md](./docs/run.md)。
