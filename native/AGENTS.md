# native 目录说明

本子包保存 DSH 标准模式的基准：钉定的上游 pstack、适配答案 dsh.md、缺口清单 gaps.json。本文件覆盖三件事：如何更新上游、如何维护 dsh.md、如何提取缺口。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `dsh.md` | DSH 标准模式的能力答案，逐条填写并经用户确认；生成器把它写进生成树 |
| `dsh.zh.md` | `dsh.md` 的本地化审阅译文，不参与生成 |
| `dsh-evidence.md` | `dsh.md` 每个替换项的事实证据 |
| `gaps.json` | 人工维护的缺口清单，含技能文件全量枚举 |
| `upstream/` | 钉定的上游 pstack 树，不入库，由 lock 重建，脚本维护 |
| `upstream.lock.json` | 钉定事实：版本、commit、来源路径 |
| `pstack/` | 生成树：`upstream/` 加注入行加 `dsh.md`，脚本维护 |
| `scripts/fetch-upstream.ts` | 维护 `upstream/` 与 lock |
| `scripts/generate-pstack.ts` | 生成 `pstack/` |

## 如何更新上游

钉定点是目标版本的 bump commit：把 `upstream/plugin.json` 的版本改成目标值的那个提交。

1. `vp run native:fetch` 按现有 lock 恢复 `upstream/`；没有 lock 时按 main 当前版本钉定。
2. `vp run native:fetch:latest` 把钉定移到 main 当前版本；`vp run native:fetch -- --version <x.y.z>` 钉定指定版本，加 `--commit <sha>` 钉定指定提交。
3. `vp run native:generate` 重建 `pstack/`，并按「如何提取缺口」重扫清单。
4. `upstream.lock.json`、`pstack/` 与 `gaps.json` 同波提交；`upstream/` 不入库。

完成标准：`vp run native:generate:check` 绿，提交只含本节的产物。

## 如何维护 dsh.md

- 模板、分块和写作约束见 [../docs/dsh-adapter.md](../docs/dsh-adapter.md)。
- 每个替换项的事实证据对应写进 `dsh-evidence.md`。
- 修改 `dsh.md` 后同步 `dsh.zh.md`，再 `vp run native:generate`。

完成标准：`vp run native:generate:check` 绿，`dsh.zh.md` 与 `dsh.md` 分节同构。

## 如何提取缺口

### 判据

先定对象，再量保证，后过排除。

- 缺口是行为：上游工作流必需、DSH 标准模式不能保证的用户可观察结果。
- 形态即结果：交付形态本身是可观察结果——上游要求以特定呈现交付（内嵌图像、图表、视频等），标准模式交不出该形态即为缺口。
- 量尺是结果可达，不是工具存在：内建工具、客户端的视觉与呈现能力、agent 自行构建的手段，任一能交付该结果即算标准模式已保证。
- 最终仲裁是 `native` 的实际运行结果：能通过 `native` 的行为不是缺口。
- 实现不进清单：满足该结果的工具、配置或文件是实现；缺口描述需要什么，不描述用什么补。
- 舍弃已定：`dsh.md` 标记为跳过的项是已终结的适配决策，不重开为缺口。
- 推导方向唯一：缺口只从上游要求推导，不从任何现成实现反推。

### 依据

封闭集合只允许：`pstack/` 生成树、`dsh.md`、`dsh-evidence.md`、当前安装 DSH 的公开文档、类型与可复查行为。集合之外的一切都不是依据。

### 流程

1. 枚举 `pstack/` 内 `skills/**`、`agents/**`、`docs/guide/**` 的全部 Markdown，不得只读与当前主题相关的文件。完成标准：文件清单与树内实际集合相等。
2. 逐文件判定，过每条判据：行为是否为上游工作流所必需；必需时标准模式是否保证它。`dsh.md` 与 `dsh-evidence.md` 是已确认答案，覆盖到的直接沿用；未覆盖的对运行时求证，未提及不等于保证。
3. 落盘：必需且未保证写成 `gaps[]` 条目，其余文件在 `files[]` 登记空数组。完成标准：守卫测试绿——`files` 集合与生成树相等，`files[].gaps` 与 `gaps[].id` 双向存在。
4. 确认：新条目为 `proposed`，由用户逐条确认为 `confirmed`，或改判 `refuted`、`excluded`，改判必须写 `reason`；只有 `confirmed` 驱动后续场景。改判与清理一律在清单内留档，历史条目不直接删除，整轮重扫同样适用。完成标准：每条 `status` 已由用户处理。

### 落盘格式

- `gaps[]` 条目：`{ "id", "description", "sources", "evidence", "status", "reason"? }`。
- `files[]` 条目：`{ "path", "gaps" }`，`path` 相对本包。
- `sources` 只能引用 `files[]` 已登记的路径，或 `dsh.md`、`dsh-evidence.md`。
