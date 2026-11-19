# Playground 入口

本文件描述 playground 的环境、流程概览和硬约束。

## 环境

- 使用真实 DSH Web 会话，Linux 是 playground worker 运行时唯一支持的平台；其他平台先运行 `playground:doctor`。
- 每个 worker 使用独立 home、浏览器 profile、证据目录和隔离工作区；worker 不携带 Git/GitHub 凭证。
- 真实模型选择由用户确认；RunRecord 记录实际路由、DSH 版本、pstack 版本、上游 revision 和配置 hash。
- 运行矩阵是 treatment × environment：`native` 观察原生 DSH，`adapted` 验证适配实现；可选插件和 team 模式属于 environment，不属于目录名。

## 文档指针

| 文档 | 职责 |
| --- | --- |
| [docs/model.md](./docs/model.md) | run-matrix 模型：treatment/environment、run identity、证据布局和不变量 |
| [docs/scenario-rules.md](./docs/scenario-rules.md) | 场景写法、缺口绑定与 gap-lock 同步 |
| [docs/workflow.md](./docs/workflow.md) | 阶段、批次、命令、交接条件和增量流程 |
| [docs/worker.md](./docs/worker.md) | worker 隔离、prepare/bootstrap/run/stop 和就绪缓存 |
| [docs/evidence-analysis.md](./docs/evidence-analysis.md) | 证据分析输入、输出、treatment 隔离和 findings 格式 |
| [docs/evidence-redaction.md](./docs/evidence-redaction.md) | 证据脱敏和提交门 |

## 流程概览

1. 前置：`native/gaps.json` 存在 `confirmed` 缺口，且缺口场景已建好。
2. 生成 native 生成树，准备 `native` worker。
3. 运行 native probe，collect，写入 native 分析 `playground/evidence/findings/native.md`。
4. 根据 native 分析更新适配答案、适配代码和生成树，build 后运行 adapted。
5. 运行 adapted probe，collect 并分析 `playground/evidence/findings/adapted.md`。
6. 通过后更新 README/兼容表并停在 release-ready；可选环境按需启用，不默认运行。

具体命令、阶段入口和交接条件见 [docs/workflow.md](./docs/workflow.md)。

## 硬约束

- 阶段隔离按 [docs/evidence-analysis.md](./docs/evidence-analysis.md) 执行；场景与缺口绑定按 [docs/scenario-rules.md](./docs/scenario-rules.md) 执行。
- `prepare → bootstrap → run-batch → collect` 必须在同一个长期存活的 background job 中串行执行，shell 保持到 collect 结束。
- `native/scripts/generate-pstack.ts` 是唯一生成器；`vp run playground:gap-lock -- --check` 守卫缺口与场景的同步。
