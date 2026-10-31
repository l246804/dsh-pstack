# pstack 移植契约

`<root>` 为仓库根，相对路径从这里解析。`<pstack>` 与 `<dsh>` 分别按当前工作区定位 upstream pstack 与 DSH 检出。所有分支执行本契约；port 原子能力、分层与证据规则见 [`port-baseline.md`](port-baseline.md)。

## 1. 入口门禁

每次调用先读 `docs/port-state.yaml`。文件不存在时，仅 `upstream`、`prepare`、`audit` 可按 `port.state: idle`、`blocker: null` 继续；其他分支报告缺失并停止。

工作项是 `port`、一个 `EXT-*` 或一个 `#编号`。blocker 非空时，按顺序检查：

1. 将完整路由与 `allowed_routes` 逐项匹配。未列出时拒绝执行，报告 `active_item`、`mode`、`reason` 与允许路由，不写文件。
2. 不开始、切换、并行或合并其他 Issue 或 EXT，也不为它们建立工作文件（S-16）。
3. 匹配后检查分支阶段、工作文件与验收前置。`allowed_routes` 不代替阶段顺序。
4. `issue #n` 只在 `review #n` 通过后执行；core Issue 还须等 `doc` 完成。

port 轮次从 `audit` 开始，到 `doc` 结束。`upstream` 与 `prepare` 是前置。一次调用只执行一个分支，后续阶段由用户显式调用。

完成标准：路由属于当前工作项且满足前置；被拒绝的工作项没有文件或状态变化；报告含允许路由中的完整 `/pstack-port ...` 命令。

## 2. 状态与工作文件

`docs/port-state.yaml` 是 port 状态与 blocker 的唯一状态源：

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

- `idle`：没有活跃 port 轮次，可以存在 Issue blocker。
- `active`：port 轮次进行中；Issue blocker 可以暂停它。
- `done`：`doc` 已完成，仍有 core Issue 等待 `issue #编号` 验收；此时只允许该验收路由。
- `audit` 设 `active/audit`。`doc` 在无 core 验收事项时设 `idle/done`，有 core Issue 时设 `done/done`。
- port 进行中收到新 Issue 时写 blocker。`mode: issue` 保存被中断阶段到 `resume_route`，验收后先清 blocker 再恢复；`mode: core` 回到 `audit` 重新冻结需求。

| mode | 用途 | 路由形态 |
|---|---|---|
| `issue` | 普通 EXT、bug、external Issue | 当前 EXT 或 Issue 的 implement/review；满足验收前置后加 `issue #n` |
| `core` | 必须改 port 基线的 Issue 或 EXT | `audit → implement port ⇄ review port → doc`；满足前置后加 `issue #n` |

工作文件不驱动路由：

| 文件 | 职责与生命周期 |
|---|---|
| `docs/port-review.md` | 当前 port 轮次证据；`audit` 重置，`doc` 清空正文，只留完成头部 |
| `docs/port-fixes.yaml` | `open` 或 `active` FIX，以及待 compact 的退役候选 |
| `docs/port-fixes-archive.yaml` | `upstream-fixed` 或 `obsolete` FIX 历史 |
| `docs/extensions.md` | EXT 登记；状态只用 `proposed | active | broken | retired` |
| `docs/extensions/<EXT-ID>/review.md` | 记录 `status`、`repair_target`、`required_behavior` 与实现、审查、验收证据；EXT 验收后删除 |
| `docs/issues/<编号>/review.md` | 记录 `target`、`status`、`required_behavior`、`port_round`、映射与公开状态；Issue 验收后删除 |
| `pstack/README.md` | port 能力、缺口与覆盖；`audit` 重建，后续阶段增量更新 |

Issue 的 `target` 只用 `undecided | core | extension | bug | external`；未完成时 `status: open`。`port_round` 用 `pending`、`no-impact` 或当前轮次标识。Issue 的 `stage` 用 `implement | review | passed`，只有 `passed` 才能验收。EXT 工作文件的 `status` 用 `implement | review | passed | broken`；登记表的 `broken` 表示等待修复，通过后回到 `active`。

port finding 记录 `id`、`origin`、`status`、`affected_ext`、`required_behavior`、`evidence`。finding 状态用 `open | reopened | fixed-pending-review | closed | blocked`。外部责任或待用户决策项用 `blocked`；可修复项保持开放直至复核通过。Markdown 不另设路由、收尾或并行状态。

完成标准（R-02、S-16、S-17）：状态结构与状态值合法；blocker 与 port 阶段匹配；工作文件只记录当前工作项证据，不作为第二套路由状态。

## 3. FIX 台账

`docs/port-fixes.yaml`：

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

`docs/port-fixes-archive.yaml` 使用同一记录结构，另加 `retired_at`、`retired_reason`，状态只用 `upstream-fixed | obsolete`。

- bug 分诊创建 `open`；实现填写 `files`、`test` 并转为 `active`；复核保持 `active`。
- `review port` 标退役并暂留候选；`doc` compact 将候选移入 archive。compact 后活跃台账只含 `open` 或 `active`。
- replay 只读活跃台账中的 `status: active`。`FIX-*` 编号永不复用，archive 保留历史。

完成标准（R-03、S-19）：两个 YAML 的状态与字段符合上述结构；退役候选只在 `doc` compact 时归档；`node pstack/scripts/port-fixes.mjs replay` 不运行 open 或 archive 记录。

## 4. 事实与写入边界

每轮分别冻结三类事实：

1. **上游需求**：`<pstack>` 的 Markdown、被调用脚本与配置声明行为。
2. **DSH 能力**：`<dsh>` 的源码、类型、包清单、插件声明和测试证明能力。
3. **本仓适配契约**：适用的 `AGENTS.md`、`docs/architecture.md`、适用的 accepted 决策与 `docs/extensions.md` 规定长期选择。涉及决策记录的读写、实现或审查时，先读 `docs/decisions/AGENTS.md`，再按当前变更路径核对 `Scope` 相交的记录。

当前实现、生成树、旧 README 和测试只证明各自直接表达的事实。用 `git -C <pstack> rev-parse HEAD` 与 `git -C <dsh> rev-parse HEAD` 绑定提交。只读子任务的结论由主任务打开原证据核验。

分支只写自己的产物与当前工作项所需文件。手写位置限于根 `src/`、`tests/`、`pstack/harness/`、`pstack/runtime/`、`pstack/scripts/`、`docs/harness-doc.yaml`、必要构建配置与上述状态文件。上游只由 `upstream` 更新；`pstack/pstack/` 与 `dist/` 只由生成器或构建改变。EXT 与 bug 工作不改 port 基线；port 工作不修改 EXT 登记，除非分支明确规定破坏或恢复状态。`dsh.md` 在上游模板外只保留 `## Local replacements` 与 `## Optional plugins`。

模型触发的进程、文件、网络、安装和远程操作进入 DSH 对应执行面，继承 sandbox、审批、取消和生命周期。公开 GitHub 操作每次先展示目标仓库与完整内容并取得确认。

完成标准：每项需求与实现可回溯到对应事实层；改动位于当前工作项允许的手写源；生成树和发布树没有手工编辑。

## 5. 验证与报告

执行测试或门禁前，按实际文件读取适用的 `AGENTS.md` 与决策约定，不只依据会话已加载的摘要。测试环境、命令和真实安装验证遵守其中的 accepted 决策；真实运行验证统一使用项目 `playground/`，不另建 home 或 profile（S-30）。

按场景运行最窄行为测试，再运行相关门禁：

```bash
vp check
vp test
vp run @internal/pstack#check:harness-doc
node pstack/scripts/generate-pstack-harness-tree.mjs --check
node pstack/scripts/port-fixes.mjs replay
```

每条命令记录实际退出码。相关测试写明文件或用例；状态验收同时给出文件字段、路由拒绝或通过的观察结果。验证报告列出适用的 `AGENTS.md`、accepted 决策和验证环境。`doc`、`review port` 与 Issue 验收运行全部五条门禁。

报告回查「需求 → 工作项 → 实现 → 验证 → 产物」。列出未覆盖、证据不足和有意跳过项；为空写「无」。报告最后按 R-09 给出参数完整的 `/pstack-port ...` 下一步命令；多个选择分别说明条件；没有下一步写「本轮结束，无下一步」。

完成标准：证据覆盖当前场景的行为、状态变化与验收要求；失败不写成通过；报告包含完整下一步命令或结束语。
