# Worker

本文件说明 worker 的容器隔离、准备、启动、停止和证据位置。阶段与批次见 [workflow.md](./workflow.md)，配置字段见 [config.md](./config.md)。

## 容器

一个 worker 是一个 Docker 容器。容器只挂载固定的 `/dsh` 路径，挂载定义和启动参数以 `runner/container/spec.ts` 为准。

| 容器路径 | 用途 |
| --- | --- |
| `/dsh/workspace` | 场景 workspace，可写 |
| `/dsh/home` | DSH home、stock `web` profile、角色文件和可选凭证 |
| `/dsh/tmp` | 临时目录 |
| `/dsh/runtime` | XDG runtime |
| `/dsh/native` | native 技能树，只读；仅 native variant 使用 |

宿主的 `playground/.workers/` 保存每个 worker 的 home、browser profile、evidence 和日志；`playground/.workspace/` 保存 workspace 及运行时目录。具体路径由 worker 配置和实现维护。

容器根文件系统只读，`/tmp` 是 tmpfs，使用宿主 uid/gid，启用 `cap-drop ALL` 和 `no-new-privileges`。仓库根、`playground/scenarios`、宿主 home、Docker socket 和宿主 browser profile 都不进入容器。

## 生命周期

- `prepare`：按场景数量、机器容量和 variant/environment 自动计算 worker 数量；写入 profile、模型和 runtime 配置。adapted 使用 `pnpm pack` 产物安装插件；默认不复制凭证。
- `bootstrap`：打开每个 worker 页面，检查默认 workspace、模型、reasoning effort、登录/401 状态，并生成 readiness 证据。
- `open` / `close` / `reset`：分别用于预览、停止预览和重建 preview worker。
- `stop`：停止所有匹配的 worker；`stop-task` 只写入当前场景的停止请求，由 `run-scenario` 在轮询点处理。
- `run-batch` 退出不会自动停止 worker；需要时运行 `playground:stop`。

## 单场景与检查

单场景调试使用 `playground:run`。长批次检查使用：

```sh
vp run playground:status -- --variant <variant> --environment <environment>
vp run playground:session-tail -- --variant <variant> --environment <environment> --worker <N> --scenario <scenarioId> --limit 10
```

`session-tail` 输出最后若干个事件的类型、时间和 `latestAge`；根据事件推进判断是否需要 `playground:stop-task`。`scenarioTimeoutMs` 是最终 hard timeout。

## 证据

`run-scenario` 在 worker evidence 目录写脱敏 record 和本地 source 文件；`collect` 只把 record 和截图复制到 `playground/evidence/runs/`。session 文件保留在 worker home，不进入快照。共享 evidence 的构造见 `runner/evidence/review-snapshot.ts`。

## 完成标准

- worker 只挂载上述 `/dsh` 路径，没有仓库根、场景目录或宿主 home。
- `prepare` 后 worker 的模型配置与当前 `config.ts` 一致。
- `bootstrap --all` 通过并生成环境级 readiness 标记。
- `run-scenario` 的 record 和截图能由 `collect` 收集。
