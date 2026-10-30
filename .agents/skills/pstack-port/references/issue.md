# issue：创建与验收 GitHub 事项

无参数或带尚无 Issue 的 `EXT-*` 时创建；带 `#编号` 时验收。本分支不实现功能。公开创建、评论、关闭、重开或标签变更前，每次展示目标仓库和完整内容并取得用户确认。

## 1. 选择模式并检查入口

创建要求 `port.state: idle`、`blocker: null`。验收要求当前 blocker 允许 `issue #编号`，并满足对应 target 的审查或 doc 前置。其他工作项的 blocker 会拒绝本路由，不创建或修改任何文件。

完成标准：只选定一个 Issue 或一个待创建事项；目标仓库、模式和入口前置明确；公开操作尚未执行；报告含当前可执行的完整 `/pstack-port ...` 命令。

## 2. 创建 GitHub Issue（S-22）

整理用户场景、最小复现（如适用）、预期/实际、验收行为、环境和版本，形成脱敏草稿。带 `EXT-*` 时引用其编号、状态和待验收项，不预置功能已被接受或缺陷已确认。

展示目标仓库和完整草稿，取得确认后创建。记录编号与 URL，初始化 `docs/issues/<编号>/review.md`：

- `target: undecided`
- `status: open`
- `required_behavior`
- `port_round: pending`
- `stage: review`
- Issue URL 与公开状态

带 EXT 时，把编号和 URL 写入 `docs/extensions.md` 的 `Issue` 字段。写 blocker：`mode: issue`、`active_item: "#编号"`、`allowed_routes: [review #编号]`、`resume_route: idle`。保持 `port.state: idle`。

完成标准（S-22、R-09）：Issue 已创建且内容经确认；工作文件与 blocker 完整；未开始实现；port 路由被拒绝；报告最后写 `/pstack-port review #编号`。

## 3. 验收已有 Issue（S-15）

读取原始 Issue、评论和工作文件，按 target 核对：

| target | 验收前置与内部结果 |
|---|---|
| `extension` | 对应 EXT review 已通过，验收测试与真实安装验证通过。全部实现后 `proposed → active`；部分实现保持 `proposed` 并记录缺口；`broken` 修复通过后回 `active` |
| `bug` | FIX 已实现、review 通过且 replay 通过；保持 FIX `active`，不把 `open` 当完成 |
| `core` | 有 port 影响时要求 `port.state: done`、`phase: done` 且 doc 已完成，逐项核对 `required_behavior`、测试、真实安装与 README 最终覆盖；`port_round: no-impact` 时改为核对 audit 的无影响证据和公开结论，保持 `idle/done` |
| `external` | 复现、版本、外部责任层、链接与结论齐全；只发布结论，不写内部实现记录 |

运行全部五条门禁并记录实际退出码：

```bash
vp check
vp test
vp run @internal/pstack#check:harness-doc
node pstack/scripts/generate-pstack-harness-tree.mjs --check
node pstack/scripts/port-fixes.mjs replay
```

另运行当前 EXT 验收、FIX 测试或 core 需求测试。真实安装验证不能只以 package 安装成功代替。验收中的补漏若改动 `pstack/README.md` 或 `dsh.md`，按 R-13 做一次整文档审查并重跑五条门禁（S-28）。形成与证据一致的公开结论，展示评论、关闭或其他公开操作，取得确认后执行。

完成标准：验收行为、测试、真实安装和公开结论互相一致；全部五条门禁通过；没有把技术验证通过描述成用户已接受结果；报告含完整下一步命令或结束语。

## 4. 验收成功：清理并恢复

按 target 更新最终记录：core 核对 README 最终覆盖；extension 更新 EXT 状态与关联；bug 保持 FIX active；external 不改内部实现记录。删除 `docs/issues/<编号>/review.md`，并删除已完成 EXT 的 `docs/extensions/<EXT-ID>/review.md`。其他工作文件不变。

清 blocker，再按 `resume_route` 恢复：

- `idle`：port 收尾后设 `idle/done`，本轮结束。
- `audit`：报告 `/pstack-port audit`。
- `implement port`：恢复 `port.state: active`、`phase: implement`，报告 `/pstack-port implement port`。
- `review port`：恢复 `active/review`，报告 `/pstack-port review port`。
- `doc`：恢复 `active/doc`，报告 `/pstack-port doc`。

core Issue 验收后统一回到 `idle`，不恢复一个已经完成的 port 轮次。报告 Issue、target、结论、验证、公开操作、清理和恢复状态，最后给出上述完整命令或「本轮结束，无下一步」。

完成标准（S-15、R-09）：blocker 为 null；Issue 已关闭或结论已发布；临时工作文件已清理；恢复路由与 port 状态一致；报告含完整下一步命令或结束语。

## 5. 验收失败：保留 blocker 并回退（S-24）

保持 Issue 打开和 blocker 非空，不写通过，不关闭 Issue。把缺口与失败证据写入 Issue、EXT review 或 FIX 记录，并按 target 回退：

- **extension / bug**：从 `allowed_routes` 移除 `issue #编号`。在 Issue 工作文件把 `stage` 显式设为 `review` 或 `implement`，并同步 EXT 工作文件的 `status` 或 FIX 的审查记录；下一步分别为 `/pstack-port review #编号` 或 `/pstack-port implement #编号`。`stage: review` 时先补齐实现证据，再由 review 核对；需要修改实现时使用 `stage: implement`。修复并通过 review 后把 `stage` 置为 `passed`，才能加回验收路由。
- **core，有 port 影响**：从 `allowed_routes` 移除 `issue #编号`，加回对应 port 路由，并在 `docs/port-review.md` 重开一条 finding。行为或实现缺口把 `port.state` 从 `done` 改回 `active`、`phase: review`，下一步 `/pstack-port review port`。仅文档缺口且实现审查证据仍有效时设 `active/doc`，将 finding 标为 documentation-only，下一步 `/pstack-port doc`；doc 修复并关闭该 finding 后才能加回验收路由。
- **core，no-impact**：保持 `port.state: idle`、`phase: done`，不启动 port 轮次。保留仅含 `issue #编号` 的路由，在 Issue 工作文件记录无影响证据或公开结论的缺口；补齐后重试 `/pstack-port issue #编号`。
- **external**：保留仅含 `issue #编号` 的路由，补齐证据后重试 `/pstack-port issue #编号`。

报告失败项、证据、保留的 blocker 和回退状态，最后给出参数完整的回退命令。

完成标准（S-24、R-09）：blocker 与 Issue 仍活跃；缺口记录存在；extension/bug 的 `stage` 与下一命令匹配；有影响的 core 已从 done 回退，no-impact core 保持 idle；`allowed_routes` 不含尚未满足前置的验收；报告含可执行的完整回退命令。
