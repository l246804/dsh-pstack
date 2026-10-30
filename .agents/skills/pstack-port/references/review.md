# review：分诊 Issue 或审查一个工作项

`review #编号` 首次分诊，已分诊后做实现审查。`review EXT-*` 与 `review port` 只审查实现，不修改实现或测试；本分支明确规定的退役清理除外。

## 1. 固定路由与前置

| 路由 | 前置 |
|---|---|
| `review port` | `port.state: active`、`phase: review`，core blocker 可允许本路由；issue blocker 会暂停 port |
| `review EXT-*` | 对应当前 issue blocker，或无 blocker 的独立本地 EXT；EXT 工作文件 `status: review` |
| `review #编号` 首次分诊 | 无 blocker，或当前 blocker 只允许该 Issue 的 review；其他工作项不得切入 |
| `review #编号` 实现审查 | `target: extension \| bug`，当前 issue blocker，对应 EXT/FIX 工作记录处于 review |

无参数时只列本地待办并请用户选择。已有活跃工作项 A 时拒绝 B，不创建 B 的文件，不改变 A 的状态。port 进行中收到新 Issue 时，首次分诊可以建立 blocker：`mode: issue` 保存当前 port 阶段到 `resume_route`；`mode: core` 以 `audit` 为恢复入口重新冻结需求。

完成标准：只处理一个工作项；首次分诊与实现后审查没有混淆；阶段不符时报告正确的完整命令。

## 2. 首次分诊 GitHub Issue（S-05～S-07、S-17）

读取原始 Issue、评论、当前提交和 `docs/issues/<编号>/review.md`。核实版本、环境、最小复现、预期与实际，不凭标题或标签修改代码。工作文件记录 `status: open`、`required_behavior`、映射、公开状态和以下一种 `target`：

| target | 本地记录与 blocker | 下一步 |
|---|---|---|
| `core` | `port_round: pending`。写 `mode: core`、`active_item: "#编号"`、`allowed_routes: [audit, implement port, review port, doc, issue #编号]`；idle 时 `resume_route: idle` | `/pstack-port audit` |
| `extension` | 新建或关联 EXT；新条目为 `proposed`，写入 Issue 编号与 URL。Issue 写 `stage: implement`；EXT 工作文件写 `status: implement`、`repair_target: extension`、`required_behavior`。写 `mode: issue` blocker，允许 implement/review 当前编号 | `/pstack-port implement #编号` |
| `bug` | 新建 `FIX-*`，`status: open`，关联当前 Issue；Issue 写 `stage: implement`。写 `mode: issue` blocker，允许 implement/review 当前编号 | `/pstack-port implement #编号` |
| `external` | 只记录外部责任层、复现、版本与外部链接，不建 EXT/FIX，不改本仓实现。blocker 仅允许 `issue #编号` | `/pstack-port issue #编号` |

`issue` blocker 的 `resume_route` 在 idle 时为 `idle`，在 port 中为被中断的 `implement port`、`review port` 或 `doc`。port 保持原阶段，由 blocker 拒绝所有 port 路由；issue 验收成功后按 `resume_route` 恢复。core blocker 在 idle 时为 `idle`，在活跃 port 中为 `audit`；同时把 `port.phase` 置为 `audit`，使其他 port 路由在重新冻结需求前不满足前置。首次分诊后停止，不直接实现，不关闭 Issue。

完成标准：Issue 字段、EXT/FIX 映射和 blocker 完整；core 可执行 audit，extension/bug 可执行 implement，external 只能验收；`implement #编号` 对 core 被拒绝；port README 未因 extension/bug/external 分诊改变。

## 3. 全量审查 port（S-08～S-12、S-23）

逐项审查 README 能力、core Issue 的 `required_behavior`、公共 API、权限、最小性与共享影响。运行所有 `active` EXT 的验收测试，不抽查；运行全部 `active` FIX replay，不只看本次改动。适配文档门禁的 FAIL 记开放 finding（R-12）。执行并记录：

```bash
vp check
vp test
vp run @internal/pstack#check:harness-doc
node pstack/scripts/generate-pstack-harness-tree.mjs --check
node pstack/scripts/port-fixes.mjs replay
```

将受审提交、文件、测试、退出码和 findings 写入 `docs/port-review.md`，更新 README 审查字段。`fixed-pending-review` 通过则 `closed`，失败则 `reopened`。普通 port 修复问题写开放 finding，设 `phase: implement`，下一步 `/pstack-port implement port`。

### 3.1 EXT 被破坏

按修复动作落点分类：

- **extension**：EXT 工作文件写 `status: broken`、`repair_target: extension`、`required_behavior`；登记表标 `broken`。写 `mode: issue` blocker，`active_item: EXT-ID`、`resume_route: review port`、`allowed_routes: [implement EXT-ID, review EXT-ID]`；有关联 Issue 时加 `issue #编号`，但仍须先通过 EXT review。报告后停止，下一步 `/pstack-port implement EXT-ID`。
- **port**：在 `docs/port-review.md` 写 `origin: review port`、`affected_ext`、`required_behavior` 的开放 finding；EXT 工作文件写 `broken/port`，登记表标 `broken`。不写 blocker，设 `phase: implement`，下一步 `/pstack-port implement port`。
- **external**：记录责任层与证据，停止并询问用户一次；不伪写本地修复通过。

`repair_target: port` 的 EXT 由后续 `review port` 复核。通过后登记表恢复 `active`，工作文件写 `passed`，由 `doc` 记录最终状态。

### 3.2 active FIX replay 失败

- `upstream-fixed`：记录 replay FAIL 与上游修复证据，删除本地补丁、保留测试，标记退役并加 `retired_at`、`retired_reason`，暂留活跃台账等待 `doc` compact。
- `obsolete`：记录 replay FAIL 与失效证据，删除补丁和测试，标记退役并加退役字段，暂留活跃台账等待 `doc` compact。
- `conflict`：FIX 保持 `active`，不归档。重建或更新对应 Issue/EXT 工作文件，写入 conflict finding 与 `required_behavior`，作废旧 review passed；Issue 写 `stage: implement`，EXT 写 `status: implement`，并同步 FIX 审查记录。写 `mode: issue` blocker，`active_item` 取 FIX 的 `issue` 值，`resume_route: review port`。`#编号` 允许 `[implement #编号, review #编号, issue #编号]`；`EXT-*` 允许 `[implement EXT-ID, review EXT-ID]`。下一步 `/pstack-port implement <active_item>`；新 review 通过前不得执行 issue 验收路由。

退役或冲突处置写入 `docs/port-review.md`。退役候选由 `doc` compact 移入 archive；compact 后台账只保留 `open/active`，archive 保留完整历史。`upstream-fixed` 与 `obsolete` 处置后继续 `/pstack-port review port`；冲突先完成指定工作项。

### 3.3 通过

所有 `active` EXT 测试和 FIX replay 通过、core 需求逐项覆盖、无开放 finding 时，设 `phase: doc`。保持 core blocker，下一步 `/pstack-port doc`。

完成标准：全量测试与 replay 有实际结果；`check:harness-doc` 任务退出 0；每个 EXT/FIX 异常都有规定的状态、finding 或 blocker；通过时 `phase: doc`，未通过时不进入 doc；报告含唯一完整下一步命令。

## 4. 审查 EXT 或 Issue 实现（S-21）

读取当前 EXT/FIX、Issue 映射和 `required_behavior`。核对验收测试、真实安装验证、权限与共享回归，并用 `git diff --name-only` 确认没有 port 基线路径。审查中不改实现或测试。

- **不通过**：在 EXT 工作文件或 FIX 记录写 finding 与证据，状态回到 implement；Issue 工作文件同步 `stage: implement`，从 blocker 移除 `issue #编号`。下一步 `/pstack-port implement EXT-ID` 或 `/pstack-port implement #编号`。
- **`review #编号` 通过**：Issue 工作文件保持 `status: open`，写 `stage: passed`；bug 的 FIX 保持 `active`。确保 blocker 允许 `issue #编号`，下一步 `/pstack-port issue #编号`。
- **有关联 Issue 的本地 EXT 通过**：EXT 恢复 `active`，工作文件写 `passed`；blocker 的 `active_item` 改为对应 `#编号`，保留 `mode: issue` 与 `resume_route`，`allowed_routes` 设为 `[issue #编号]`，下一步 `/pstack-port issue #编号`。
- **无 Issue 的本地 EXT 通过且有 blocker**：EXT 恢复 `active`，工作文件写 `passed`，清 blocker，按 `resume_route` 报告 `/pstack-port implement port`、`/pstack-port review port`、`/pstack-port doc` 或 idle。
- **无 blocker 的独立本地 EXT 通过**：EXT 恢复或转为 `active`，记录验证，本轮结束，无下一步。

完成标准：审查证据与 finding 一致；失败回到实现且不能验收；通过后只有规定的 Issue 验收或恢复路由；报告含完整下一步命令，独立 EXT 完成时写“本轮结束，无下一步”。
