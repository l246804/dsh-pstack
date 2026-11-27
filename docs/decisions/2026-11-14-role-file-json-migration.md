# 决策：角色文件从 mdc 行格式迁移为 pstack-models.json

Status: superseded
Date: 2026-11-14
Scope: src/**, docs/architecture.md, docs/glossary.md, port/dsh.md, port/dsh.zh.md, README.md, README.zh.md, tests/**
Implemented-by: commit:50eb307
Review: 2026-11-17
Superseded-by: docs/decisions/2026-11-16-structured-role-routes.md — 角色文件路由改为 version 2 结构化对象，旧的行文档与字符串编辑机制不再适用

## 背景

角色文件此前是 `$DSH_HOME/pstack-models.mdc`，沿用 Cursor 的 always-applied 规则行格式：`# budget:` 注释行加每角色一行 `<role>: <route>[, <route>...]`。DSH 从不把 `.mdc` 当作会话规则加载，这个文件只是本插件自己读写的配置；`playground/scripts/lib/env.ts` 的 `writeRoleFile` 已经改为写入 `{ "version": 1, "roles": { ... } }` 的 JSON。行格式因此带来几处实际成本：解析要维护逐行文档模型（`RoleFileDocument`/`RoleFileLine`），重复角色行要按“最后一行胜”合并，错误按行号报告，编辑器要按行替换与删除并处理 BOM/CRLF，预算应用要把计划重新渲染成 `# budget` 注释行与角色行。这些机制都服务于一个本插件独占、且已有结构化表示的配置文件，而不是任何外部约束。

## 决策

- 角色文件路径改为 `$DSH_HOME/pstack-models.json`，schema 固定为 `{ "version": 1, "budget"?: "<tier> (<target>)", "roles": { "<role key>": ["provider/model [effort]", ...] } }`。`budget` 存 `budgetValueFor(tier)` 的结果，仍由 `budgetTierFromLabel` 解析。
- 读取顺序：JSON 存在则读 JSON；JSON 缺失但同目录 `pstack-models.mdc` 存在，则用 legacy 行解析器读出 budget 与各角色路由，写成 JSON、删除 `.mdc`，再加载；两者都没有则为 missing（所有角色继承父路由），首次保存时创建 JSON。两份都在时以 JSON 为准，保留 `.mdc` 不自动删除。迁移幂等、原子写，失败时报错，不静默按 missing 处理。
- 生产路径只保留 typed JSON 文档：语义视图把每条路由解析成 `Route`，编辑视图保留原始路由字符串以便只改一个角色时其他条目逐字节不变；删除按行文档模型与按行预算文本渲染（`parseRoleFileDocument`、`updateRoleText`、`removeRoleText` 及 `# budget` 渲染）。旧的 `.mdc` 行解析器只作为迁移用的 legacy 解析保留在 `src/compat/mdc-to-json.ts`，字符串路由语法在 `src/compat/legacy-route.ts`。
- 角色选择不再由工具固化：`pstack_subagent` 直接收 `provider`、`model`、`reasoningEffort`，把这三个值转成子代理的 `agentOptions`；选哪个角色、用哪个模型，由调用方读取角色文件后自行决定，工具不做角色解析。

## 替代方案

**保留行格式内部模型，只把存储换成 JSON。** 被否决。这样做保留了只对文本文件有意义的机制：重复行按“最后一行胜”合并、错误按行号报告、按行替换/删除与 BOM/CRLF 处理，以及把预算计划重新渲染回 `# budget` 注释行。它迫使代码同时维护“按行文档”和“typed 文档”两份平行模型，并让 wire 上的 `RoleView` 为 JSON 不存在的行号伪造数值。JSON 已经有结构化角色映射，原子整文档写入即可，不需要行号或逐行编辑；保留行模型只是把旧的复杂度平移到新存储上。

**继续使用 `.mdc` 行格式。** 被否决。DSH 从不加载 `.mdc`，这个文件本来就只由本插件读写；playground 的 worker 已写入 JSON。继续用行格式会让插件、playground 和文档三方对同一份配置用两种格式。

**迁移时同时保留 `.mdc` 与 JSON 并都当作输入。** 被否决。两份都可写会产生互相覆盖的漂移来源；只允许“JSON 优先、缺失时从 `.mdc` 迁移并删除”，能让单一事实来源明确。

## 后果

- 角色文件成为带 `version` 的 typed JSON，读取和保存按整文档原子完成；设置页与委派链路共用同一语义解析。
- 委派参数直接对应原生委派字段（`provider`/`model`/`reasoningEffort`），不再有 `role`/`roleRoute`/`roleIndex` 这类补偿概念；角色到路由的映射由调用方读取角色文件决定。
- 旧的 `.mdc` 在首次读取时自动迁移并删除；迁移逻辑集中在 `src/compat/`，将来清理兼容只需删除该目录内的文件。
- 相关引用（架构文档、术语表、README、port 适配文档、测试）同步更新为 JSON 存储与直接传模型路由；`pstack/` 生成树由生成器重建，不手工编辑。
