# 决策：兼容表按 DSH 范围分组并拆历史文件，基线只记 pstack 版本

Status: accepted
Date: 2026-11-17
Scope: README.md, README.zh.md, package.json, bump.config.ts, changes/AGENTS.md, scripts/release-compatibility.ts, port/**, docs/**, tests/release-compatibility.test.ts, tests/playground-execution.test.ts, upstream/cursor-plugins
Implemented-by: commit:fcfd343
Review: 2026-11-22

## 背景

发布兼容表要同时表达三件事：某个 DSH 范围能用哪些 dsh-pstack 发布版本、每个发布版本打包了哪个 pstack、以及历史上 DSH 基线怎么演进。此前用一列 pstack 记录“当前移植基线”，pstack 一变就覆盖旧值，看不出哪个插件版本对应哪个 pstack；手写的 compatibilityKey 又和 package.json 的 engines.dsh、子模块里的 pstack 版本重复。Markdown 表格原生不支持跨行合并；按 (DSH 范围, pstack 版本) 一行一条又会随 pstack 变动不断膨胀。另外上游子模块此前指向没有发版的 main HEAD，把未发版的改动也带了进来。

## 决策

- 兼容表按 DSH 范围分组：每组一个加粗小标题，形如 `**DSH <range>**`，下面一张两列表，列为发布版本与 pstack 版本，一行一个发布版本及其打包 pstack。
- 行身份是 `package.json` 的 `engines.dsh`，不维护手写 compatibilityKey，删除 `compatibilityKey` 与 `compatibility-keys` 元数据。
- 发布时脚本按 `engines.dsh` 精确匹配已有分组：命中就在该组内新增或更新发布行（同一 x.y 保留最新 z），未命中就新建分组。
- 根 README 只保留最新三个 DSH 分组，更早的分组自动移入 `docs/compatibility-history.md` 与 `docs/compatibility-history.zh.md`；两个文件都按新的在前排列。
- `port/baseline.json` 只记录 `pstackVersion`，不再记 DSH 范围（以 engines.dsh 为准）或 pstack commit。
- 上游 `upstream/cursor-plugins` 子模块固定到该 pstack 版本的发版提交，未发版的 main 提交不移植；该仓库没有 git tag，用把 `pstack/plugin.json` 改到该版本的提交。
- `compatibility:check` 把当前 engines.dsh 尚未出现在表中视为待发布、不报错；发布由 `bump.config` 在 bumpp 升版本后调用 `syncCompatibility` 完成。

## 替代方案

**单表一行一个 (DSH 范围, pstack 版本)。** 被否决。pstack 每次上调就多一行，行数膨胀且相邻 DSH 重复，不直观。

**保留单行加一列“当前 pstack”，并用手写 compatibilityKey 当行主键。** 被否决。pstack 变化会覆盖旧值，丢失版本对应关系；compatibilityKey 与 engines.dsh、子模块 pstack 版本重复，还要额外校验防漂移。

**用原始 HTML `<table rowspan>` 合并 DSH 单元格。** 被否决。GitHub 能渲染，但 `release-compatibility` 按 `|` 解析会失效，其他渲染器不保证，维护成本高。

**单表里在每个发布版本格写“版本 (pstack X)”。** 被否决。行数少但单元格密，版本和 pstack 挤在一起，不如独立列直观。

## 后果

- 兼容表每条都能直接读出版本与 pstack 的对应；根 README 保持短小，历史可查。
- 兼容表完全由脚本按字面事实（engines.dsh、pstackVersion）维护，不再有手写兼容键和它的漂移校验。
- pstack 版本变化只在所属分组内增加发布行，不新增 DSH 分组；只有 DSH 破坏性变更才新增分组。
- engines.dsh 的空格或写法差异会被当成新分组，改范围时需保持写法一致。
