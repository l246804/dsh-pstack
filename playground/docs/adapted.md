# adapted 适配验证

本文件说明 adapted 阶段的验证边界、环境矩阵和特殊环境规则。阶段命令和交接见 [workflow.md](./workflow.md)。

## 目标

adapted 验证 pstack 的适配实现在真实 DSH Web 会话中是否成立。它不重新定义 raw 的能力答案，也不回到 raw 证据中找通过理由。

## 环境矩阵

`playground/scenarios/environments.ts` 定义环境：

- `id`：环境 id，也是 RunRecord 的 `environment.matrix.id`。
- `description`：中文说明为什么需要该环境。
- `kind`：`base`、`capability` 或 `conflict`。
- `enabledPluginPackages`：该环境额外加载的插件包。
- `versionExemptions`：仅用于已安装插件因 peer/runtime 版本不匹配而被禁用时的例外。

具体第三方包名只写在 `environments.ts`；文档只描述环境 id、用途和对照方式。环境矩阵不是能力清单。

## base

- `base` 不加载额外插件。
- adapted/base 验证 pstack 自身实现，不把第三方插件带来的能力当作 port 结果。

## 能力对照环境

- `render` 是 `kind: "capability"` 的渲染对照环境。
- 具体插件配置以 `environments.ts` 为准。
- 同一个 render probe 是单份定义，声明 `environments: ["base", "render"]`，在 base 和 render 两个单元跑同一份任务和观察。
- 同一能力在 base 和对照环境中的结果要同时保留，才能判断差异来自环境还是 port。

## 特殊环境

- `kind: "conflict"` 或用户明确指定的特殊环境，使用独立 probe，不复用 base prompt，也不走 re-export。
- 特殊环境只在用户明确指定时运行。
- 环境是否冲突、是否支持某项能力，由实际会话和 UI 结果判断，不在文档里预设。

## 阶段边界

- adapted 只读取 adapted 快照、`port/dsh.md`、当前适配实现和环境文件、当前 adapted session。
- adapted 不读取 `reviews/raw-*`、raw 分析结论或 raw 证据。
- raw 的缺失不能直接替代 adapted 的验证；adapted 的不支持也不能反推 raw 的能力。
- 跨阶段引用一旦发现，停止当前分析并重新基于当前阶段输入完成。

## 通过条件

- 每个 probe 的机械断言、rubric、实际 tool call、截图和产物共同支持结论。
- 分析维度按 [evidence-analysis.md](./evidence-analysis.md) 的能力类别执行，不写成一段总体结论。
- 非文本产物必须看到实际呈现，不能只用源码、路径或文件卡片。
- 不可用、被跳过或环境受限时，按 `ignore-environment` 或 `待你判断` 记录。
- 不做“没看到失败就当通过”的推断。
