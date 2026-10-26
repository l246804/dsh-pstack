# 决定：route 值在第一个 `/` 处切分，model id 可以含 `/`

Status: accepted
Date: 2026-10-26

## 背景

role file 的值语法原本是 `<provider>/<model>`，其中 model 段的正则是 `[^\s/,[\]]+`，明确排除 `/`。这条规则隐含了一个假设：部署里的 model id 不带斜杠，比如 `local/model-a`。

真实部署不满足这个假设。一个 provider 常同时代理多家上游，model id 的厂商前缀就是 id 的一部分，形如 `vendor-a/model-x`、`vendor-b/model-y`。于是出现了一个死结：

- `/setup-pstack` 从 adapter 元数据读到的 route 只能是 `gateway/vendor-a/model-x`；
- 写进 role file 后，`parseRoute` 判定它不是 route，报告 "is not a route"；
- `roleFile.roles` 里没有这条，该角色静默回落到 `inherit-parent`。

也就是说，整个部署里没有任何一个可写的显式 route 能通过解析。解析器必须能表达部署实际提供的 route，否则 role file 这个机制在该部署上等于不存在。

## 决定

`src/models.ts` 的 `parseRoute` 在**第一个** `/` 处切分：provider 是第一个斜杠之前的全部文本，model 是之后的全部文本，model 内部允许出现 `/`。

model 段写成"一段或多段非空、以 `/` 分隔"，正则从 `^([^\s/,[]+)\/([^\s/,[\]]+)...` 改为 `^([^\s/,[]+)\/([^\s/,[\]]+(?:\/[^\s/,[\]]+)*)...`。这不是只删掉一个字符类：单纯删掉 `/` 排除会让 `[^\s,[\]]+` 同时接受 `gateway//model-x`、`gateway/vendor-a/`、`gateway/vendor-a//model-x`，三者都不是任何 adapter 会服务的 route。把它们留给 preflight，等于把一条能在 role file 那一行带行号报出的错误，推迟到第一次 delegation 才以另一种形式暴露。

其余约束（不许空白、不许逗号、不许方括号、effort 必须是单个 token）一条不动。

- `gateway/vendor-a/model-x` → provider `gateway`，model `vendor-a/model-x`。
- `local/model-a` 的解析结果与改前完全一致，旧写法继续有效。
- `/model-a`、`local/`、`gateway/` 仍然被拒绝：切分后两侧都必须非空。
- `gateway//model-x`、`gateway/vendor-a/`、`gateway/vendor-a//model-x` 同样被拒绝。
- 生成资产 `assets/docs/pstack-models.example.md` 的取值说明写明切分规则，并给出 `gateway/vendor-a/model-x` 的例子；`scripts/capabilities.ts` 的 `model-route` 行同步写上切分约定，否则 `assets/docs/harness/dsh.md` 里只剩 `<provider>/<model>`，读者会以为 provider 可以含斜杠。

## 备选方案

- **在 role file 里给分隔符换个字符**，比如 `gateway :: vendor-a/model-x`。放弃：`:` 是键值分隔符，`::` 要引入转义；换分隔符还会让所有现存 role file 和文档失效，而斜杠切分对旧值向后兼容，是一次纯放宽。
- **要求部署把 model id 里的斜杠去掉**（在 profile 的 provider 配置里改 id）。放弃：id 是 adapter 侧的模型标识，改它等于改部署的模型注册，而且每个用厂商前缀的 provider 都要改一遍。role file 是策略文件，不该反向约束部署的命名。
- **解析时取最后一个 `/` 作分隔**，即 provider 允许含 `/`、model 单段。放弃：provider 名由 profile 配置声明，是单段标识；model id 才是常带前缀的那一侧。取最后一个斜杠会让 `gateway/vendor-a/model-x` 得到 provider `gateway/vendor-a`，与 adapter 实际注册的 provider *名* 不符，preflight 必然失败。
- **只删掉 model 段的 `/` 排除，不补非空约束**（本条记录初稿的写法）。放弃：如"决定"一节所述，它会把空段的 route 放进来，失败点从解析挪到 preflight，而解析器本来就是为"在写文件时就报错"存在的。
- **不做改动，所有角色写 `inherit-parent`**。放弃：那样 role file 形同虚设，per-role 模型选择这个机制在该部署上完全不可用，而它正是本插件相对"直接用原生 subagent"的差别。

## 后果

role file 能表达厂商前缀式 model id 了，`/setup-pstack` 在 `list_subagent_models` 缺失时也能写出经过人工确认的真实 route。

代价是语法变宽了一格：一个带斜杠的 model id 与"provider/model"在字面上不再有区分，切分位置由"第一个斜杠"这条约定固定。这条约定必须明写，否则读 body 的人会以为 provider 可以含斜杠。`tests/roles.test.ts` 用 `gateway/vendor-a/model-x` 与 `gateway/vendor-b/model-y` 锁住切分位置，并把 `/model-a`、`local/`、`gateway/`、`gateway//model-x`、`gateway/vendor-a/`、`gateway/vendor-a//model-x` 的拒绝一并锁住，防止后续"顺手"改成贪心匹配。

改动没有解决 effort 名字的问题：该部署的 model 只广告一部分档位，没有预算目标里的每一档。这是无关的另一件事，由 `/setup-pstack` 的 budget 回退规则处理，不写进解析器。

本决定只靠单元测试与解析器直调验证；真实 child 起没起来，要看第一次带显式 route 的 `pstack_subagent` 调用。
