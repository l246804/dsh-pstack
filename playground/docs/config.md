# Playground 配置

本文件定义 `playground/config.ts` 的字段、provider 来源和凭证/浏览器策略。命令与阶段见 [workflow.md](./workflow.md)。

## 本地配置

- 复制 [config.example.ts](../config.example.ts) 为 `playground/config.ts`，填写真实值。`config.ts` 已 gitignore；所有 `*.local` 文件也不入库。
- `config.ts` 使用 `vite-plus` 的 `loadEnv("playground", process.cwd(), "PLAYGROUND_")` 读取 `.env`、`.env.local`、`.env.playground` 和 `.env.playground.local`。
- 字段顺序：`copyCredentials`、`providers`、`testModel`、`roleModels`，然后是 `browser`。
- `testModel` 必须指向 `providers` 中已有的 provider 和 model；`roleModels` 的每条路由也必须在同一模型目录内。

## Provider

`ProviderConfig` 是判别联合，按 `kind` 分三种。

| kind | 必填 | 可选 | 说明 |
| --- | --- | --- | --- |
| `pi-ai` | `apiKey`、`apiKeyEnv`、`reasoning`、`models` | `api`、`baseURL` | 自定义网关或 pi-ai 路由；`models` 每项必须含 `id`，efforts 只写模型自己的 `reasoningEfforts` |
| `deepseek-api-key` | `apiKey`、`models` | `apiKeyEnv` | provider key 必须是 `deepseek-official`；`apiKeyEnv` 默认 `DEEPSEEK_API_KEY` |
| `deepseek-account` | 无模型字段 | `modelOverrides` | provider key 必须是 `deepseek-account`；模型目录由账号 `/models` 返回，不能用 `modelOverrides` 新增模型 |

`pi-ai` 的 `reasoning` 是 provider 级默认档位，必填；模型级 `reasoningEfforts` 只保留需要测试的档位。默认成本策略是 `low`，需要更强档位时显式加 `high`。

## 从宿主提取

`fromHost(selections, { env })` 从宿主 DSH web profile 的 `cordis.patch.yml` 读取 provider、模型和 effort，避免手抄。

```ts
import { loadEnv } from "vite-plus";
import { fromHost } from "./runner/config/config-host.ts";

const env = loadEnv("playground", process.cwd(), "PLAYGROUND_");

export default {
  copyCredentials: false,
  providers: fromHost(
    {
      "your-provider": {
        reasoning: "low",
        models: [
          { id: "model-a", efforts: ["low", "high"] },
          { id: "model-b", efforts: ["low"] },
        ],
      },
    },
    { env },
  ),
  testModel: { provider: "your-provider", model: "model-a", effort: "low" },
  roleModels: {},
} satisfies PlaygroundConfig;
```

- `models` 必填，只接受 `{ id, efforts? }` 对象；不再接受字符串简写。
- `reasoning` 必填；`efforts` 必须写在具体模型上，provider 级不再有 `efforts`。
- 模型未写 `efforts` 时默认 `["low", "high"]`。
- 宿主 patch 默认是 `~/.dsh/profiles/web/cordis.patch.yml`，可用 `PLAYGROUND_HOST_PATCH_FILE` 指定。
- `config.ts` 可以直接写 `apiKey: "..."`；它已被 gitignore，适合本地密钥。
- 也可以用 `apiKeyEnv` 从环境或 `.credentials.yaml` 解析，避免把密钥写进文件。
- Linux 默认 `PLAYGROUND_NETWORK_MODE=host`：容器共享宿主网络命名空间，loopback 和路由与宿主一致，baseURL 保持 `127.0.0.1`。
- macOS/Windows 默认 `bridge`：baseURL 的 `127.0.0.1` / `localhost` 会重写为 `host.docker.internal`，Docker 以 host-gateway 暴露宿主回环；可用 `PLAYGROUND_NETWORK_MODE=host` 强制尝试；若 Docker 不支持宿主网络，prepare 会失败，改用 bridge。
- 运行目录默认 `$HOME/.dsh-playground/isolated` 和 `playground/.workers`；`PLAYGROUND_WORKSPACE_ROOT` / `PLAYGROUND_WORKERS_DIR` 只用于测试隔离，不作为日常配置。

## 凭证

- `copyCredentials` 默认 `false`：worker 不复制宿主 `.credentials.yaml`，模型密钥只通过环境变量进入容器。
- 显式设为 `true` 才复制；文件不存在时 `prepare` 直接失败，不静默跳过。
- `deepseek-account` 依赖账号登录凭证，必须在 `config.ts` 同时设置 `copyCredentials: true`；否则 `loadProviderPlan` 直接报错。
- `doctor` 只报告凭证文件是否存在，不作为默认前置失败。

## 浏览器

- `browser.mode: "managed"`（默认）：每个 worker 启动独立无头 Chrome，`agent-browser` 使用 worker 自己的 profile 目录。
- `browser.mode: "cdp"`：连接宿主 Chrome，必须提供 `browser.cdpUrl`，并使用专用 `--user-data-dir`；`agent-browser` 会加 `--pin-tab`。
- `browser.headed` 只对 managed 模式生效。
- 不使用 `--state`。需要复现登录态时再单独评审，不把 auth 文件作为默认路径。

## 单个场景超时

- `PLAYGROUND_CASE_TIMEOUT_MS` 控制一个 `run-scenario` 的最长执行时间，默认 `600000`（10 分钟），必须为正整数毫秒。
- 超时后 native 写 `blocked`、adapted 写 `inconclusive` record，批次继续执行后续场景。
- 需要跑耗时长的 probe 时显式设置，例如 `PLAYGROUND_CASE_TIMEOUT_MS=1200000`；不要把默认值改成无限。

## 完成标准

- `vp run playground:doctor` 通过；`config.ts` 存在且 provider 路由可解析。
- `vp run playground:prepare` 能生成 worker home patch，且 `agent-default-model` 与 `testModel` 一致。
- `copyCredentials: true` 时凭证文件确实存在；`deepseek-account` 不会在未复制凭证时静默启动。
