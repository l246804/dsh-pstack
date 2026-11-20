# Worker 运行说明

本文件说明 worker 的容器隔离、prepare/bootstrap/run/stop、预览和证据目录。阶段与批次见 [workflow.md](./workflow.md)。

## 容器

一个 worker 是一个 Docker 容器。容器只看到固定 `/dsh` 路径：

| 容器路径 | 宿主来源 | 用途 |
| --- | --- | --- |
| `/dsh/workspace` | `<workspaceRoot>/workspace` | 场景 workspace，可写 |
| `/dsh/home` | `playground/.workers/<variant>/<env>/w<k>/home` | DSH home、stock `web` profile、AGENTS.md、角色文件和可选凭证 |
| `/dsh/tmp` | `<workspaceRoot>/tmp` | tmp |
| `/dsh/runtime` | `<workspaceRoot>/xdg-runtime` | XDG runtime |
| `/dsh/native` | `<workspaceRoot>/native` | native 生成树，只读；仅 native variant |

`workspaceRoot` 默认是 `playground/.workspace`，`.workspace` 和 `.workers` 目录都被忽略；只有 workspace、home 等子目录挂载，仓库根、场景定义、rubric、证据目录和 Docker socket 都不挂载。容器根文件系统只读，`/tmp` 是 tmpfs，使用宿主 uid/gid，启用 `cap-drop ALL` 和 `no-new-privileges`。

宿主状态保存在 `playground/.workers/<variant>/<environmentId>/w<k>`：home、browser profile、evidence 和日志；隔离 workspace 在 `workspaceRoot`。

镜像名是 `dsh-playground:<dsh version>-<arch>`。`playground:doctor` 检查 Docker daemon、镜像存在、架构和版本；`playground:image` 按宿主架构在本机构建。

宿主平台：

- Linux：Docker Engine 原生运行。
- macOS：Docker Desktop、Colima 或 OrbStack 提供 Docker-compatible CLI；Apple Silicon 构建 arm64，Intel 构建 amd64。
- Windows：在 WSL2 内运行，仓库放在 WSL 文件系统；原生 Windows 不作为 worker host。

## prepare

worker 数量自动计算为 `max(1, min(机器容量, 当前任务数))`；容量策略见 [config.md](./config.md) 的 `runtime.workerCapacity`。

`prepare` 为每个 worker：

- 初始化 stock `web` profile；adapted 安装 `pnpm pack` 产物，不挂载仓库。
- 写 `AGENTS.md` 读边界、`pstack-models.json`、`pstack-settings.json` 和 `cordis.patch.yml`。
- 用当前 `config.ts` 重建 `agent-default-model` 和 provider 行；`--reuse` 也会刷新这些行，避免使用旧配置。
- 可选复制宿主凭证；默认不复制。
- 注册场景 workspace，初始化本地 `git init`，不设置 origin。

`prepare --reset` 清空该 variant/environment 的 worker；`--reuse` 复用已有 home/profile 但刷新配置并重启 Web。

## bootstrap

`bootstrap` 打开每个 worker 页面，检查 preview notice、默认 workspace、模型/provider、reasoning effort、登录/401 状态，并写 `ready.png`。`--all` 通过后写环境级 `bootstrap-ready.json`；单 worker 检查不写总标记。`prepare --reset`、`prepare --reuse` 或 `stop` 会清除就绪缓存。

## 直接预览

```sh
vp run playground:open
```

启动独立的 `adapted/preview` w0 并输出 URL，不打开浏览器、不处理 preview notice、不截图、不写 readiness。关闭和重建：

```sh
vp run playground:close
vp run playground:reset
```

## 单场景调试

```sh
vp run playground:run -- --worker 0 --environment base --variant native --scenario <probe-id>
vp run playground:run -- --worker 0 --environment base --variant adapted --scenario <probe-id>
```

完整批次见 [workflow.md](./workflow.md)。

## 外部停止

任务长时间无有效推进时，读取最新 session 判断，再写停止请求：

```sh
vp run playground:stop-task -- --variant native --environment base --worker <N>
```

`run-scenario` 在下一个轮询点保存当前截图和会话证据，写 `blocked` record，`run-batch` 继续后续任务。不要用 `playground:status` 的摘要替代 session 判断。

## 证据

`run-scenario` 在 worker evidence 目录写机械脱敏后的 `record.json` 和本地 `record.source.json`。`collect` 只从 `record.source.json` 复制截图和记录到 `evidence/runs/<variant>-<environment>/scenarios/<scenario>/<variant>-<environment>/`；`session.jsonl.zstd` 只保留本地。`manifest.json` 记录快照范围和批次。`record.source.json`、`record.safe.json`、session 文件都不提交。

## 完成标准

- 容器只挂载上表路径；没有仓库根、宿主 home 或场景目录。
- `prepare --reuse` 后 worker home patch 的模型与当前 `config.ts` 一致。
- `bootstrap --all` 通过并生成 `bootstrap-ready.json`。
- 每个 worker 的 `record.json` 与截图能从 `record.source.json` 收集。
