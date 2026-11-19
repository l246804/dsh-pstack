# native 目录说明

本子包保存 DSH 标准模式的基准：钉定的上游 pstack、适配答案和缺口清单。本文件只描述子包内的事，即如何更新上游、如何维护 dsh.md、如何提取缺口。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `dsh.md` | DSH 标准模式的能力答案，逐条填写并经用户确认；生成器把它写进生成树 |
| `dsh.zh.md` | `dsh.md` 的本地化审阅译文，不参与生成 |
| `dsh-evidence.md` | `dsh.md` 每个替换项的事实证据 |
| `gaps.json` | 人工维护的缺口清单，含技能文件全量枚举 |
| `upstream/` | 钉定的上游 pstack 树，不入库，可由 lock 重建，不手改 |
| `upstream.lock.json` | 钉定事实：`pstackVersion`、`commit`、`path`、`source` |
| `pstack/` | 生成树：`upstream/` 加注入行加 `dsh.md`，不手改 |
| `scripts/fetch-upstream.ts` | 维护 `upstream/` 与 lock |
| `scripts/generate-pstack.ts` | 生成 `pstack/` |

## 如何更新上游

钉定点是目标版本的 bump commit，即把 `upstream/plugin.json` 的版本改成目标值的那个提交。

1. `vpx native/scripts/fetch-upstream.ts` 按现有 lock 恢复 `upstream/`；没有 lock 时按 main 当前版本钉定。
2. `vpx native/scripts/fetch-upstream.ts --latest` 把钉定移到 main 当前版本。
3. `vpx native/scripts/fetch-upstream.ts --version <x.y.z>` 钉定指定版本；加 `--commit <sha>` 钉定指定提交。
4. fetch 后运行 `vpx native/scripts/generate-pstack.ts` 重建 `pstack/`，并按「如何提取缺口」重扫清单。
5. 提交时 `upstream.lock.json` 与 `pstack/` 同波；`upstream/` 不入库。

## 如何维护 dsh.md

- 模板、分块和写作约束见 [../docs/dsh-adapter.md](../docs/dsh-adapter.md)，本文件不重复。
- 每个替换项的事实证据对应写进 `dsh-evidence.md`。
- 修改 `dsh.md` 后同步 `dsh.zh.md`，运行生成器更新 `pstack/`，一起提交。

## 如何提取缺口

产物是 `gaps.json`。依据是封闭集合：只允许本包的 `pstack/` 生成树、`dsh.md`、`dsh-evidence.md`，以及当前安装的 DSH 公开文档与类型；仓库内其余一切内容都不是依据，也不能由插件提供的功能反推缺口。

1. 枚举：遍历 `pstack/` 内 `skills/**`、`agents/**`、`docs/guide/**` 的全部 Markdown，建立完整文件清单；不得只读与当前主题相关的文件。
2. 判定：逐文件判断其中的行为是否为上游工作流完成所必需；再依 `dsh.md` 与 `dsh-evidence.md` 判断 DSH 标准模式是否已经保证它。
3. 落盘：只把"上游必需且标准模式不能保证"的行为写成 `gaps[]` 条目；其余文件在 `files[]` 中登记为空数组。
4. 不进清单：插件自身提供的工具、preset、角色文件或命令是实现而非能力；标准模式已提供的能力；可选插件或团队模式的内部契约，除非上游工作流明确依赖且标准模式缺失。
5. schema：`gaps[]` 条目为 `{ "id", "description", "sources", "evidence", "status", "reason"? }`；`files[]` 条目为 `{ "path", "gaps" }`，`path` 是相对本包的路径，`gaps` 列出该文件支撑的缺口 id。
6. `sources` 只能引用 `files[]` 已登记的路径，或 `dsh.md`、`dsh-evidence.md`。
7. `status` 生命周期：新条目为 `proposed`；由用户逐条确认为 `confirmed`，或改判 `refuted`、`excluded`，改判必须写 `reason`。只有 `confirmed` 的缺口驱动后续场景。
8. 守卫：`files` 集合与生成树实际集合相等、`files[].gaps` 与 `gaps[].id` 双向存在，由测试强制，违反即红。
