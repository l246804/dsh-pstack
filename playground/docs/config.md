# 配置

`playground/config.ts` 是唯一用户配置源。复制 [config.example.ts](../config.example.ts) 并填写；`config.ts` 和 `*.local` 不入库。字段、默认值和类型以 [config.example.ts](../config.example.ts) 与 `runner/types.ts` 为准，加载和校验见 `runner/config/config.ts`。

环境变量通过 `vite-plus` 的 `loadEnv("playground", ...)` 读取。配置在加载时解析；缺少必填字段、provider 路由无效或凭证无法解析会直接报错。

## 完成标准

- `vp run playground:doctor` 通过。
- `config.ts` 能被加载并解析，`testModel` 与 `roleModels` 路由有效。
- `copyCredentials: true` 时 DSH 凭证文件存在；`deepseek-account` 不会在缺少凭证时启动。
