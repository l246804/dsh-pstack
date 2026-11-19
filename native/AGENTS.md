# native 目录说明

本子包保存 DSH 标准模式的基准：钉定的已发布上游 pstack、适配答案和缺口清单。本文件只描述子包内的事，即如何更新上游、如何维护 dsh.md、如何提取缺口。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `dsh.md` | DSH 标准模式的能力答案，agent 逐条填写并经用户确认；生成器把它盖章进生成树 |
| `dsh.zh.md` | `dsh.md` 的本地化审阅译文；生成器不读取 |
| `dsh-evidence.md` | `dsh.md` 每个替换项对应的事实证据；只记录证据，不是能力清单 |
| `gaps.json` | 唯一人工维护的缺口清单，含技能文件全量枚举；提取规则见下文「如何提取缺口」 |
| `upstream/` | 已发布上游 pstack 树，由 fetch 脚本钉定；不入库，按 lock 重建；不手改 |
| `upstream.lock.json` | 版本钉定事实：`pstackVersion`、`commit`、`path`、`source` |
| `pstack/` | 生成树：`upstream/` 加注入行加 `dsh.md` 盖章；不手改，`vp run generate:check` 守卫 |
| `scripts/fetch-upstream.ts` | 按已发布版本钉定或按 lock 恢复 `upstream/` 并更新 lock |
| `scripts/generate-pstack.ts` | 唯一生成器，产出 `pstack/` |

## 如何更新上游

- 上游 monorepo 无 tag，marketplace 也不公开版本对应的 commit；仓库内唯一可重建的版本边界是把 `plugin.json` 改到目标版本的 bump commit。
- 日常只用无参运行 `vpx native/scripts/fetch-upstream.ts`：有 lock 时按 lock 恢复（树在位即零网络跳过），没有 lock 时自动按 `--latest` 引导。显式 `--latest` 强制对 main 做一次升级检查：读 main 上 `plugin.json` 的当前版本号，钉该版本的 bump commit。main 的版本可能领先 marketplace 的实际发布；需要严格对齐某个已发布版本时，人工从 marketplace 页面确认版本号后改用 `--version <x.y.z>`。bump 之后存在同版本改动时脚本列出并警告，核实后用 `--commit` 显式前移，绝不自动取 main 头部。
- `upstream/` 不入库（gitignore），由 lock 的 commit 确定性重建；缺失时克隆上游 monorepo（blobless）后按 commit 提取。`vp run generate` 与 `generate:check` 会先自动恢复。
- fetch 之后必须 `vp run generate` 重建生成树；`upstream.lock.json` 与 `pstack/` 同波提交。

## 如何维护 dsh.md

- 模板、分块、逐行同构和写作约束只看 [../docs/dsh-adapter.md](../docs/dsh-adapter.md)，本文件不重复。
- 每个替换项的依据落 `dsh-evidence.md`，证据不当作能力来源。
- 修改 `dsh.md` 后同步 `dsh.zh.md`，再 `vp run generate` 更新生成树并提交。

## 如何提取缺口

产物是 `gaps.json`，唯一人工维护的清单。

1. 输入边界：枚举与正文以 `pstack/` 唯一生成树为来源；DSH 事实只以 `dsh.md`、`dsh-evidence.md` 和当前安装的 DSH 公开文档与类型为依据。不得读 `src/`、根 `cordis.patch.yml`、插件 manifest 与插件实现，也不得以插件功能反推缺口。
2. 提取流程：先全量枚举生成树内的技能文件建立完整清单，不得只读与当前主题相关的文件；逐项判断上游工作流是否实际依赖该行为、native 是否已经保证它；只把"上游必需且 native 不能保证"的行为写入清单，能通过 native 的行为不是缺口。
3. 不进清单：插件自身提供的工具、preset、角色文件或命令；DSH 标准模式已提供的能力；可选插件或团队模式的内部契约，除非上游工作流明确依赖且标准模式缺失。
4. schema：`gaps[]` 为 `{ "id", "description", "sources", "evidence", "status", "reason"? }`，`status` 取 `proposed | confirmed | refuted | excluded`，`refuted` 和 `excluded` 必须写 `reason`；`files[]` 为 `{ "path", "gaps" }`，全量枚举 `pstack/` 内 `skills/**`、`agents/**`、`docs/guide/**` 的全部 Markdown，每项标注支撑的缺口 id（无缺口为空数组）。
5. `sources` 用包内相对路径，只能引用 `files` 内的路径或 `dsh.md`、`dsh-evidence.md`；文件集合与生成树实际集合严格相等、`files[].gaps` 与 `gaps[].id` 双向存在，由测试守卫，漏枚举即红。
6. `status` 由用户在提取会话中逐条确认，不得自行改判。
