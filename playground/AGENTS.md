# Playground

本目录用真实 DSH Web 会话验证缺口与回归。场景保存在 `scenarios/*.ts`；缺口来源、对应关系与 gap-lock 维护遵循 [场景契约](./docs/scenarios.md)。

## 入口

| 任务 | 文档 |
| --- | --- |
| 配置、运行、检查进度或收集截图 | [docs/run.md](./docs/run.md) |
| Agent 检查客户端交互与截图 | [docs/ui.md](./docs/ui.md) |
| 新增或调整场景 | [docs/scenarios.md](./docs/scenarios.md) |
| 分析结果、提出建议、记录审批 | [docs/judge.md](./docs/judge.md) |
| 查看最近验证结论 | [results/README.md](./results/README.md) |

## 边界

- `native` 验证 DSH 标准运行时和最小适配答案；`adapted` 验证加载本插件后的行为。环境定义见 `runner/scenario/environments.ts`；`render` 是可选插件对照。
- 每个 worker 是独立 Docker 容器；挂载与隔离以 `runner/container/spec.ts` 为准。场景定义、仓库根和宿主 home 不进入容器。
- `config.ts` 是本地配置入口，字段见 [config.example.ts](./config.example.ts)。真实会话的模型选择遵循根目录规则。
- 运行记录和完整 session 留在 worker 本地；对外只提交 `results/` 中的简短结果和选用截图。每项结果与场景 id 对应。
- 真实会话按需运行，不承担发布门禁。上游或插件版本变化不要求刷新结果；行为或判据变化时复核受影响场景，由用户决定重跑。
