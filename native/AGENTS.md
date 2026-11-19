# native 目录说明

`native/` 是基准子包：钉定的已发布上游 pstack、DSH 标准模式适配答案和 native 缺口清单。playground 的 `native` treatment 与缺口提取只消费本目录。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `dsh.md` | native 基准的 DSH 能力答案，agent 逐条填写并经用户确认；生成器把它盖章进生成树 |
| `dsh.zh.md` | `dsh.md` 的本地化审阅译文；生成器不读取 |
| `dsh-evidence.md` | `dsh.md` 每个替换项对应的 DSH 事实证据；只记录证据，不是能力清单 |
| `gaps.json` | 唯一人工维护的 native 缺口清单，含技能文件全量枚举；格式与场景生成规则见 [../playground/docs/scenario-rules.md](../playground/docs/scenario-rules.md) |
| `upstream/` | 已发布上游 pstack 树，由 fetch 脚本钉定；不手改 |
| `upstream.lock.json` | 版本钉定事实：`pstackVersion`、`commit`、`path`、`source`；run 记录与发布元数据从这里读版本 |
| `pstack/` | 生成树：`upstream/` 加注入行加 `dsh.md` 盖章；不手改，`vp run generate:check` 守卫 |
| `scripts/fetch-upstream.mjs` | 拉取指定已发布版本到 `upstream/` 并更新 lock |
| `scripts/generate-pstack.mjs` | 唯一生成器，产出 `pstack/` |

`dsh.md` 与 `dsh.zh.md` 的模板、分块和写作约束以 [../docs/dsh-adapter.md](../docs/dsh-adapter.md) 为准，本文件不重复。

## 上游钉定

- 上游 monorepo 无 tag，Cursor marketplace 也不公开版本对应的 commit；仓库内唯一可重建的版本边界是把 `plugin.json` 改到目标版本的 bump commit。
- 升级时人工从 marketplace 页面确认已发布版本号，运行 `vpx native/scripts/fetch-upstream.mjs --version <x.y.z>`。脚本默认钉 bump commit；bump 之后存在同版本改动时列出并警告，核实后用 `--commit` 显式前移，绝不自动取 main。
- fetch 之后必须 `vp run generate` 重建生成树，再按场景规则重扫缺口。
- 本仓不保留上游子模块；`upstream/` 提交进仓，构建与测试离线可用。

## 缺口提取硬规则

1. 缺口只从本目录提取。枚举与正文以 `pstack/` 完整生成树为唯一上游来源；DSH 事实只以 `dsh.md`、`dsh-evidence.md` 和当前安装的 DSH 公开文档与类型为依据。不得读 `src/`、根 `cordis.patch.yml`、插件 manifest 与插件实现，也不得以插件功能反推缺口。
2. `gaps.json` 的 `files` 必须全量枚举 `pstack/` 内 `skills/**`、`agents/**`、`docs/guide/**` 的全部 Markdown，每项标注支撑的缺口 id（无缺口为空数组）。文件集合与生成树实际集合严格相等，`files[].gaps` 与 `gaps[].id` 双向存在，测试守卫，漏枚举即红。

## 修改流程

- 修改 `dsh.md` 后同步 `dsh.zh.md`，再 `vp run generate` 更新生成树并提交。
- 版本升级按「上游钉定」一节执行；`upstream/`、`upstream.lock.json`、`pstack/` 三者同波提交。
