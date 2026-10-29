# pstack 移植契约

`<root>` 为仓库根。相对路径从 `<root>` 解析。`<pstack>` 与 `<dsh>` 分别按当前工作区定位 upstream pstack 与 DSH 检出，不写死检出前缀。本文件适用于全部分支；port 原子能力、分层与证据规则见 [`port-baseline.md`](port-baseline.md)。

## 1. 入口门禁与串行工作项

每次分支调用先读 `docs/port-state.yaml`。文件不存在时，仅 `upstream`、`prepare`、`audit` 可按 `port.state: idle`、`blocker: null` 继续；其他分支报告缺少状态文件并停止。

工作项是 `port`、一个 `EXT-*` 或一个 `#编号`。blocker 非空时，`allowed_routes` 是工作项层面的唯一可执行集合：

1. 将本次完整路由与列表逐项匹配。未列出时拒绝执行，报告 `active_item`、`mode`、`reason` 和允许路由，不写任何文件。
2. 其他 Issue 或 EXT 不得切换、并行或合并；不得为它们建立工作文件。
3. 匹配后再检查该分支的阶段、工作文件和验收前置。`allowed_routes` 不替代阶段顺序。
4. `issue #n` 只在对应实现审查通过后执行；core Issue 还必须等 `doc` 完成。

blocker 有两种模式：

| mode | 用途 | 路由形态 |
|---|---|---|
| `issue` | 普通 EXT、bug、external Issue | `implement/review` 当前 EXT 或 Issue；满足验收前置后加 `issue #n` |
| `core` | 必须改 port 基线的 Issue 或 EXT | `audit → implement port ⇄ review port → doc`；满足验收前置后加 `issue #n` |

port 进行中收到新工作项时，`mode: issue` 把当前阶段保存到 `resume_route`，验收后恢复。`mode: core` 把需求交回 `audit` 重新冻结，不在 `implement` 或 `review` 中直接加入。任何恢复都先清 blocker。

## 2. 唯一状态源与轮次

`docs/port-state.yaml` 是 port 状态与 blocker 的唯一状态源，固定结构为：

```yaml
schema: 1
port:
  state: idle | active | done
  round: baseline | "#123" | "EXT-001"
  phase: audit | implement | review | doc | done
  started_at: <ISO 时间>
  updated_at: <ISO 时间>
blocker:
  active_item: null | "#123" | "EXT-001"
  mode: issue | core
  allowed_routes: []
  resume_route: idle | audit | implement port | review port | doc
  reason: <一句话>
```

无 blocker 时写 `blocker: null`。每次状态变更更新 `updated_at`；新 port 轮次同时写 `started_at`。保留 YAML 中编号与 EXT ID 的引号。

- `idle`：没有活跃 port 轮次；可以存在 issue blocker。
- `active`：port 轮次进行中；blocker 可以暂停它。
- `done`：`doc` 已完成，仍有 core Issue 等待 `issue #编号` 验收。
- `audit` 设置 `active/audit`；`doc` 在无 core 验收事项时设置 `idle/done`，有 core Issue 时设置 `done/done`。

工作文件不驱动路由：

| 文件 | 职责与生命周期 |
|---|---|
| `docs/port-review.md` | 当前 port 轮次证据；`audit` 重置，`doc` 清空正文，只留完成头部 |
| `docs/extensions.md` | EXT 登记；状态只用 `proposed \| active \| broken \| retired` |
| `docs/extensions/<EXT-ID>/review.md` | 记录 `status`、`repair_target`、`required_behavior` 及实现、审查、验收证据；EXT 验收后删除 |
| `docs/issues/<编号>/review.md` | 记录 `target`、`status`、`required_behavior`、`port_round`、映射和公开状态；Issue 验收后删除 |
| `pstack/README.md` | port 能力、缺口与覆盖；`audit` 重建，后续阶段增量更新 |

Issue 的 `target` 只用 `undecided | core | extension | bug | external`；未完成时 `status: open`。`port_round` 用 `pending`、`no-impact` 或当前 port 轮次标识。Issue 的 `stage` 用 `implement | review | passed`，与 EXT/FIX 审查进度同步；只有 `passed` 才能验收。EXT 工作文件的 `status` 用 `implement | review | passed | broken`；登记表的 `broken` 表示等待修复，修复通过后回到 `active`。

port finding 记录 `id`、`origin`、`status`、`affected_ext`、`required_behavior`、`evidence`。finding 状态用 `open | reopened | fixed-pending-review | closed | blocked`；外部责任或待用户决策项用 `blocked`，可修复项保持开放直至复核通过。Markdown 中不另设路由或收尾状态。

## 3. FIX 台账

`docs/port-fixes.yaml` 只保存 `open` 与 `active`：

```yaml
schema: 1
fixes:
  - id: FIX-001
    issue: "#123" | "EXT-001"
    kind: bug | extension | adapter | runtime | plugin | docs
    title: "..."
    files: [...]
    test: "..."
    status: open | active
    verified_against:
      pstack: <sha>
      dsh: <sha>
    note: "..."
```

`docs/port-fixes-archive.yaml` 使用同一记录结构，另加 `retired_at`、`retired_reason`，状态只用 `upstream-fixed | obsolete`。`FIX-*` 编号永不复用。bug 分诊创建 `open`；实现填 `files`、`test` 并转为 `active`；复核保持 `active`。退役条目移入 archive，`doc` 再执行 compact 清理遗留候选。replay 只读活跃台账中的 `status: active`。

## 4. 事实、写入与权限边界

每轮分别冻结三类事实：

1. **上游需求**：`<pstack>` 的 Markdown、被调用脚本与配置声明行为。
2. **DSH 能力**：`<dsh>` 的源码、类型、包清单、插件声明和测试证明能力。
3. **本仓适配契约**：`docs/architecture.md`、适用的 accepted 决策与 `docs/extensions.md` 规定长期选择。

当前实现、生成树、旧 README 和测试只证明各自直接表达的事实。用 `git -C <pstack> rev-parse HEAD` 与 `git -C <dsh> rev-parse HEAD` 绑定提交。只读子任务的结论须由主任务打开原证据核验。

分支只写自己的产物与当前工作项所需文件。手写位置限于根 `src/`、`tests/`、`pstack/harness/`、`pstack/runtime/`、必要构建配置和上述状态文件。上游只由 `upstream` 更新；`pstack/pstack/` 与 `dist/` 只由生成器或构建改变。EXT 与 bug 工作不改 port 基线；port 工作不修改 EXT 登记，除非分支明确规定破坏或恢复状态。

模型触发的进程、文件、网络、安装和远程操作进入 DSH 对应执行面，继承 sandbox、审批、取消和生命周期。公开 GitHub 操作每次先展示目标仓库与完整内容并取得确认。

## 5. 共同验证与报告

按场景运行最窄行为测试，再运行相关门禁：

```bash
vp check
vp test
node pstack/scripts/generate-pstack-harness-tree.mjs --check
node pstack/scripts/port-fixes.mjs replay
```

每条命令记录实际退出码；相关测试写明文件或用例。状态验收同时给出文件字段、路由拒绝或通过的观察结果。`doc` 与 Issue 验收运行全部四条门禁。

报告回查“需求 → 工作项 → 实现 → 验证 → 产物”。列出未覆盖、证据不足和有意跳过项；为空写“无”。报告最后给出参数齐全的 `/pstack-port ...` 下一步命令；多个选择分别说明条件；没有下一步写“本轮结束，无下一步”。
