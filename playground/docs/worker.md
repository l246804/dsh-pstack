# Worker

本文件说明 worker 的准备、启动、停止和检查入口。阶段与批次见 [workflow.md](./workflow.md)，配置见 [config.md](./config.md)。

## 容器

worker 是独立 Docker 容器。仓库根、`playground/scenarios`、宿主 home、Docker socket 和宿主 browser profile 不进入容器。挂载、隔离参数和路径以 `runner/container/spec.ts` 为准。

## 生命周期

- `prepare`：按场景数量、机器容量和 variant/environment 计算 worker 数量，写入 worker profile、模型和运行设置。
- `bootstrap`：打开每个 worker 页面，检查默认 workspace、模型、reasoning effort 和登录状态，并生成 readiness 证据。
- `open` / `close` / `reset`：预览、停止预览和重建 preview worker。
- `stop`：停止所有匹配的 worker；`stop-task` 写入当前场景的停止请求，由 `run-scenario` 在轮询点处理。
- `run-batch` 退出不会自动停止 worker；需要时运行 `playground:stop`。

## 单场景与检查

单场景调试使用 `playground:run`。长批次检查使用：

```sh
vp run playground:status -- --variant <variant> --environment <environment>
vp run playground:session-tail -- --variant <variant> --environment <environment> --worker <N> --scenario <scenarioId> --limit 10
```

`session-tail` 输出最后若干个事件的类型、时间和 `latestAge`；根据事件推进判断是否需要 `playground:stop-task`。`scenarioTimeoutMs` 是最终 hard timeout。

## 证据

`run-scenario` 在 worker evidence 目录写脱敏 record 和本地 source 文件；`collect` 只把 record 和截图复制到 `playground/evidence/runs/`。session 文件保留在 worker home，不进入快照。证据构造见 `runner/evidence/review-snapshot.ts`。

## 完成标准

- `prepare` 后 worker 的模型配置与当前 `config.ts` 一致。
- `bootstrap --all` 通过并生成环境级 readiness 标记。
- `run-scenario` 的 record 和截图能由 `collect` 收集。
