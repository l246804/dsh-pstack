# 配置

本文件说明 `playground/config.ts` 的配置边界。字段、默认值和类型定义分别由 [config.example.ts](../config.example.ts) 与 `runner/types.ts` 维护。

## 设置

复制 [config.example.ts](../config.example.ts) 为 `playground/config.ts` 并填写。`config.ts` 和 `*.local` 不入库。环境变量通过 `vite-plus` 的 `loadEnv("playground", ...)` 读取。

配置在加载时完成解析和校验；缺少必填字段、provider 路由无效或凭证无法解析都会直接报错。解析代码见 `runner/config/config.ts`。

## Provider

`providers` 支持 `pi-ai`、`deepseek-api-key` 和 `deepseek-account` 三种路由。`testModel` 和 `roleModels` 中的每条路由都必须能在已配置的 provider/model/effort 目录中解析；provider 的校验与模型目录逻辑见 `runner/config/provider.ts`。

`fromHost` 从宿主 DSH web profile 提取 provider、模型和 effort，避免手工抄写。选择结构和默认宿主 patch 路径见 `runner/config/config-host.ts`。

## 凭证

`copyCredentials` 默认 `false`。开启后只复制 DSH 的 `.credentials.yaml` 到 worker home；文件不存在时 `prepare` 失败，不静默跳过。

`deepseek-account` 需要账号登录，因此必须同时开启 `copyCredentials`。`doctor` 会报告凭证文件是否存在。

## 浏览器

`browser.mode` 支持 `managed` 和 `cdp`；`headed` 只影响 managed 模式。浏览器配置、Chrome 路径和 `agent-browser` 启动逻辑见 `runner/browser/session.ts`。

## Runtime

`runtime` 是唯一的运行时配置来源，按用途分为：

- 场景、turn、子代理超时；
- worker 容量与端口；
- workspace、worker 状态目录；
- Docker、DSH、Vite+、pnpm 和 Chrome 路径；
- worker 网络模式。

字段和默认值只从 [config.example.ts](../config.example.ts) 读取；校验见 `runner/config/config.ts`，容量计算见 `runner/worker/capacity.ts`。Linux 原生 Docker 可使用 host 网络；macOS、Windows 和 WSL2 使用 bridge。worker 数量自动计算；`prepare` 的 `--port` 只用于覆盖起始端口。

## 完成标准

- `vp run playground:doctor` 通过。
- `config.ts` 能被加载并解析，`testModel` 与 `roleModels` 路由有效。
- `copyCredentials: true` 时 DSH 凭证文件存在；`deepseek-account` 不会在缺少凭证时启动。
