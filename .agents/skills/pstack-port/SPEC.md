# pstack-port 技能规格

> Status: user-locked
> Owner: user
> 本文件是 `pstack-port` 技能重构、验收和后续变更的唯一依据。
> 任何 agent 不得修改本文件；只有用户明确要求时才允许追加场景或要求。追加时保留旧条目，不删除、不改写。
> 本文件只记录用户明确描述的场景与要求。未提到的异常、阻塞、并发、网络、权限场景不进入本规格，也不得由 agent 推断补充。

## 0. 读法

1. 重构前读 §1 的模型，再按 §2 的场景逐条实现。
2. 验收时用每条场景的「验收证据」和 §4 的门禁。
3. 本文件不是运行时指令；`SKILL.md` 不引用它。分支文件是实现细节，冲突以本文件为准。
4. 只追加：编号不复用；旧场景失效标 `Status: superseded-by S-xx`，保留原文。
5. 未提到的异常、阻塞、并发、网络、权限场景不进入本规格。
6. 本文件按 pstack 的 `technical-writing` 与 `unslop` 规则写：短句、直陈、一词一义；新增场景沿用同样写法。

### 0.1 快速索引

| 内容 | 位置 |
|---|---|
| 模型：五个词、状态文件、blocker、repair_target | §1 |
| 场景 S-01～S-24 | §2 |
| 要求 R-01～R-09 | §3 |
| 验收证据与门禁 | §4 |
| 重构验收清单 | §5 |

### 0.2 路径约定

- `<pstack>`：upstream pstack 的检出根，按当前工作区实际路径定位。需求里写到 `<pstack>/skills/...` 时，到该检出下按 `skills/<技能名>/SKILL.md` 查找，不写死当前仓库的上游检出前缀。
- `<dsh>`：DSH 的检出根，按当前工作区实际路径定位。
- `dsh.md`：本地主适配器，位于本地适配树 `docs/harness/dsh.md`；仓库结构变化时按实际路径定位。

## 1. 模型

### 1.1 五个词

| 词 | 含义 |
|---|---|
| **port 轮次** | `audit` 开始、`doc` 结束；`upstream` 与 `prepare` 是前置，不算开始 |
| **工作项** | `port`、`EXT-*`、`#编号`；`issue` 分支覆盖 EXT + GitHub |
| **blocker** | `docs/port-state.yaml` 的闸门；`allowed_routes` 之外一律拒绝 |
| **repair_target** | 修复动作落点：`extension`（只改扩展）/ `port`（改 port 基线）/ `external`（上游/DSH） |
| **FIX** | `FIX-*` 持久修复记录；`replay` 只跑 `status: active` |

`port` 链路：`prepare → audit → implement port ⇄ review port → doc`。

### 1.2 状态文件

| 文件 | 作用 | 生命周期 |
|---|---|---|
| `docs/port-state.yaml` | 唯一状态源：port 状态 + blocker | 常驻 |
| `docs/port-review.md` | 当前 port 轮次的工作证据 | `audit` 重置；`doc` 清空正文 |
| `docs/port-fixes.yaml` | 活跃或待修的 FIX 记录 | 常驻；`doc` 执行 compact |
| `docs/port-fixes-archive.yaml` | 已退役的 FIX 记录 | 常驻，只归档 |
| `docs/extensions.md` | EXT 登记与状态 | 常驻 |
| `docs/extensions/<EXT-ID>/review.md` | 单个 EXT 的工作记录 | EXT 验收后清理 |
| `docs/issues/<编号>/review.md` | GitHub issue 的分诊/映射/公开状态 | issue 验收后清理 |
| `pstack/README.md` | port 基线的能力、缺口、覆盖状态 | `audit` 重建，`implement`、`review`、`doc` 增量更新 |
| 根 `README.md` | 用户安装与使用摘要 | `doc` 同步（agent 执行） |

### 1.3 port 状态

`docs/port-state.yaml` 的固定结构：

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

- `idle`：没有活跃 port 轮次；blocker 可以为空，也可以存在（issue 工作不占用 port 轮次）。
- `active`：port 轮次进行中；blocker 可以暂停它。
- `done`：`doc` 已完成，但仍有 core issue 等待 `issue #编号` 验收；只允许 `issue #编号`。
- `blocker` 非空时，`allowed_routes` 是工作项层面的唯一可执行集合；其他路由一律拒绝并报告 blocker。
- `allowed_routes` 不是阶段顺序。每个路由还要检查自己的前置条件：`issue #n` 只在 `review #n` 通过后执行，`core` 的 `issue #n` 只在 `doc` 完成后执行。

### 1.4 blocker 两种模式

| mode | 含义 | 允许路由 |
|---|---|---|
| `issue` | 普通 EXT、bug、external issue | `implement EXT-*`、`review EXT-*`，或 `implement #n`、`review #n`、`issue #n` |
| `core` | 必须改 port 基线的 issue | `audit` → `implement port` ⇄ `review port` → `doc`；`doc` 完成后 `issue #n` 的前置条件满足 |

### 1.5 repair_target

发现 EXT 被破坏或 FIX 无效时，按修复动作的落点分类：

| repair_target | 判定 | 处理 |
|---|---|---|
| `extension` | 只改 `src/`、`EXT-*` 扩展代码 | `implement EXT-*` → `review EXT-*`；`mode: issue`，阻塞 port |
| `port` | 必须改 `pstack/runtime/`、`pstack/harness/` 或 port 能力行为 | 当前轮记为 port finding，走 `implement port` → `review port`；不建 issue、不写 blocker |
| `external` | 只能靠上游 pstack 或 DSH | 记录证据，停一次问用户 |

### 1.6 记录字段

- `docs/issues/<编号>/review.md` 记录 `target`、`status`、`required_behavior`、`port_round`。
- `target` 取 `undecided | core | extension | bug | external`。`status` 未完成时保持 `open`。`port_round` 取 `pending`、`no-impact` 或当前 port 轮次标识。
- `docs/extensions.md`：`status: proposed | active | broken | retired`。`broken` 表示被 port 改动破坏、等待修复；修复通过后回到 `active`。
- `docs/extensions/<EXT-ID>/review.md`：`status`、`repair_target`、`required_behavior`。
- `docs/port-review.md`：每个 finding 记录 `id`、`origin`、`status`、`affected_ext`、`required_behavior`、`evidence`。

### 1.7 FIX 记录

- `docs/port-fixes.yaml` 只放 `status: open | active`。
- `docs/port-fixes-archive.yaml` 放 `status: upstream-fixed | obsolete`，带 `retired_at`、`retired_reason`。
- `FIX-*` 编号永不复用。
- `replay` 只读 `status: active`。

### 1.8 场景格式

每条场景固定七段：前置状态、触发、期望行为、状态与文件变化、下一步、明确不做、验收证据。场景里的下一步用路由名；每次执行报告必须给出完整的 `/pstack-port` 命令（R-09）。

## 2. 场景

| 组 | 场景 |
|---|---|
| 主链路 | S-01 |
| implement | S-02～S-04 |
| GitHub issue 分诊与创建 | S-05～S-07、S-22 |
| review port | S-08～S-12、S-23 |
| implement 后审查 | S-21 |
| doc | S-13、S-14、S-20 |
| issue 验收与阻塞 | S-15～S-18、S-24 |
| FIX 归档 | S-19 |

### S-01 从零完整移植

- **前置状态**：`docs/port-state.yaml` 不存在或 `port.state: idle`；`blocker: null`；无 port 基线。
- **触发**：用户从 `prepare` 或 `audit` 开始。
- **期望行为**：`prepare → audit → implement port ⇄ review port → doc` 完整执行；`audit` 是 port 开始，`doc` 是 port 结束；`audit` 重建 `pstack/README.md` 时按 R-08 用中文并优化结构。
- **状态与文件变化**：`audit` 设 `port.state: active`、`phase: audit`，重置 `docs/port-review.md`；`doc` 设 `port.state: idle`、`phase: done`，清空 `docs/port-review.md` 正文。
- **下一步**：本轮结束，所有路由可用。
- **明确不做**：不接 issue；不跳过 audit；不把 prepare 当作 port 开始。
- **验收证据**：`pstack/README.md` 具备完整能力表；`vp test`、`generate --check`、`port-fixes replay` 通过；`port-state.yaml` 为 `idle`。

### S-02 implement 选择 port

- **前置状态**：`port.state: active`、`phase: implement`；`blocker: null`。
- **触发**：`/pstack-port implement port`。
- **期望行为**：只处理 port core 和 `docs/port-fixes.yaml` 中 `status: active` 的修复；可能破坏 EXT 也不处理；无效 FIX 记录忽略；不汇报被忽略项。
- **状态与文件变化**：更新 `pstack/README.md` 对应能力行和 `docs/port-review.md` 实现字段；`docs/extensions.md` 不变；`phase: review`。
- **下一步**：`review port`。
- **明确不做**：不改 EXT 状态；不创建 issue；不写 blocker；不因 EXT 风险改变 port 实现。
- **验收证据**：`vp test`、`generate --check` 通过；`docs/extensions.md` 无差异；`phase` 为 `review`。

### S-03 implement 选择 EXT

- **前置状态**：blocker `mode: issue`、`active_item: EXT-001`；或 `port.state: idle`、`blocker: null` 且用户显式要处理一个本地 EXT。
- **触发**：`/pstack-port implement EXT-001`。
- **期望行为**：只改 EXT 扩展代码；不改 port 行为；发现必须改 port 时，停止并转 `core` 流程。
- **状态与文件变化**：`docs/extensions/EXT-001/review.md` 更新实现与验证，其阶段为 `review`；`docs/extensions.md` 只改该条目的实现记录。
- **下一步**：`review EXT-001`。
- **明确不做**：不改 `pstack/runtime/`、`pstack/harness/`、port 能力行。
- **验收证据**：EXT 验收测试通过；`git diff --name-only` 不含 port 基线路径。

### S-04 implement 选择 GitHub issue（extension/bug）

- **前置状态**：`review #123` 已写 `target: extension|bug`；blocker `mode: issue`、`active_item: #123`。
- **触发**：`/pstack-port implement #123`。
- **期望行为**：按 `docs/issues/123/review.md` 的映射实现 EXT 或 FIX；不改 port 行为。
- **状态与文件变化**：EXT review 或 `docs/port-fixes.yaml` 更新，实现审查阶段为 `review`；`FIX-*` 从 `open` 变为 `active`；blocker 不变。
- **下一步**：`review #123`。
- **明确不做**：不改 port 文件；不把 `core` 问题塞进 issue 实现。
- **验收证据**：EXT 测试或 FIX 测试通过；FIX 记录 `status: active`；无 port 路径 diff。

### S-05 review #编号 分诊 core

- **前置状态**：`port.state: idle`、`blocker: null`；GitHub issue #123 未分析。
- **触发**：`/pstack-port review #123`。
- **期望行为**：
  1. 分诊为 `core`。
  2. 写 `docs/issues/123/review.md`，记录 `target: core`、`status: open`、`required_behavior`、`port_round: pending`。
  3. 写 blocker，`mode: core`、`active_item: "#123"`、`allowed_routes: [audit, implement port, review port, doc, issue #123]`、`resume_route: idle`。
  4. 下一步进入 `audit`。
- **状态与文件变化**：`docs/port-state.yaml` 的 blocker 如上；`docs/issues/123/review.md` 建立。
- **下一步**：`/pstack-port audit`。
- **明确不做**：不执行 `implement #123`；不关闭 issue；不标记 deferred 后消失。
- **验收证据**：blocker 字段完整；`implement #123` 被拒绝；`audit` 可执行。

完整命令流程：

| 步骤 | 用户命令 | 结果 | `port-state.yaml` |
|---|---|---|---|
| 1 | `/pstack-port review #123` | 分诊 core，写 issue 文件和 blocker | `port.state: idle`；`blocker.mode: core`；`active_item: "#123"`；`allowed_routes: [audit, implement port, review port, doc, issue #123]` |
| 2 | `/pstack-port upstream` | 拒绝（不在 allowed_routes） | 不变 |
| 3 | `/pstack-port prepare` | 拒绝 | 不变 |
| 4 | `/pstack-port review #456` | 拒绝（不能切换 issue） | 不变 |
| 5 | `/pstack-port audit` | 允许；把 #123 的 required_behavior 写进本轮 README | `port.state: active`、`phase: audit` |
| 6 | `/pstack-port implement port` | 允许 | `phase: implement` |
| 7 | `/pstack-port review port` | 允许；核对 #123 覆盖 | `phase: review` |
| 8 | `/pstack-port doc` | 允许；写最终覆盖；清空 `port-review.md` 正文 | `port.state: done`、`phase: done`；`issue #123` 的前置条件满足 |
| 9 | `/pstack-port issue #123` | 验收；清 blocker | `port.state: idle`；`blocker: null` |

core issue 防漏门禁：

- `audit` 完成前，每个 `target: core, status: open` 的 issue 必须映射到至少一个能力行，或给出“无 port 影响”的证据。
- `review port` 逐条核对 `required_behavior`。`doc` 写最终覆盖结论。
- `issue #123` 验收时缺一不可。
- audit 判定无 port 影响时，记录 `port_round: no-impact` 和证据，保持 `port.state: idle`、`phase: done`，下一步直接 `issue #123` 发布结论，不启动 port 实现。

### S-06 review #编号 分诊 extension、bug

- **前置状态**：`port.state: idle`、`blocker: null`；GitHub issue 未分析。
- **触发**：`/pstack-port review #123`。
- **期望行为**：
  1. 分诊为 `extension` 或 `bug`。
  2. `extension` 建或关联 `EXT-*`；`bug` 建 `FIX-*`，`status: open`。
  3. 写 blocker，`mode: issue`、`active_item: #123`、`allowed_routes: [implement #123, review #123, issue #123]`、`resume_route: idle`。
  4. 下一步 `implement #123`。
- **状态与文件变化**：`docs/extensions.md` 或 `docs/port-fixes.yaml` 新增/更新；`docs/issues/123/review.md` 写映射。
- **下一步**：`/pstack-port implement #123`。
- **明确不做**：不启动 port 链；不修改 `pstack/README.md`。
- **验收证据**：EXT 或 FIX 记录存在；blocker 为 `mode: issue`；`implement #123` 可执行。

### S-07 review #编号 分诊 external

- **前置状态**：`port.state: idle`、`blocker: null`；GitHub issue 未分析。
- **触发**：`/pstack-port review #123`。
- **期望行为**：记录外部责任层、最小复现、版本和外部链接；不修改本仓实现；写 blocker（`mode: issue`、`active_item: #123`、`allowed_routes: [issue #123]`、`resume_route: idle`）。
- **状态与文件变化**：`docs/issues/123/review.md` 写 `target: external`、`status: open`；不改本仓代码。
- **下一步**：`/pstack-port issue #123`。
- **明确不做**：不建 EXT/FIX；不改 port 状态。
- **验收证据**：issue 工作文件有外部证据；`git diff` 无本仓实现改动。

### S-08 review port 正常核查

- **前置状态**：`port.state: active`、`phase: review`；所有 `active` EXT 正常，所有 `active` FIX 正常。
- **触发**：`/pstack-port review port`。
- **期望行为**：运行全量检查：所有 `active` EXT 的验收测试 + 所有 `active` FIX 的 replay；全部通过则进入 `doc`。
- **状态与文件变化**：`docs/port-review.md` 记录本轮检查结果；`docs/extensions.md`、`docs/port-fixes.yaml` 不变；`phase: doc`。
- **下一步**：`/pstack-port doc`。
- **明确不做**：不抽查；不只检查本次改动涉及的文件。
- **验收证据**：`port-fixes replay` 全 PASS；所有 `active` EXT 测试通过；`docs/port-review.md` 无 open finding。

### S-09 review port 发现 EXT 被破坏（repair_target: extension）

- **前置状态**：`port.state: active`、`phase: review`；发现 `EXT-001` 被本轮 port 破坏；修复只需改扩展代码。
- **触发**：`/pstack-port review port`。
- **期望行为**：
  1. 在 `docs/extensions/EXT-001/review.md` 写 `status: broken`、`repair_target: extension`、`required_behavior`。
  2. 写 blocker：
     - `mode: issue`、`active_item: EXT-001`、`resume_route: review port`。
     - `allowed_routes: [implement EXT-001, review EXT-001]`。如果 EXT-001 有关联 GitHub issue，加 `issue #n`。
  3. 报告后停止。
- **状态与文件变化**：`docs/extensions.md` 中 EXT-001 变为 `broken`；blocker 非空；port 链暂停。修复后 `review EXT-001` 确认通过，EXT-001 回到 `active`，清 blocker，恢复 `review port`。
- **下一步**：`/pstack-port implement EXT-001`。
- **明确不做**：不在 `review port` 里直接改 EXT 代码；不把 EXT 修复塞进 port。
- **验收证据**：EXT 状态 `broken`；blocker 字段完整；`implement port` 被拒绝。

### S-10 review port 发现 EXT 被破坏（repair_target: port）

- **前置状态**：`port.state: active`、`phase: review`；发现 `EXT-001` 被破坏；修复必须改 port 基线。
- **触发**：`/pstack-port review port`。
- **期望行为**：
  1. 在 `docs/port-review.md` 记一条 finding，包含 `origin: review port`、`affected_ext: EXT-001`、`required_behavior`。
  2. 在 `docs/extensions/EXT-001/review.md` 写 `status: broken`、`repair_target: port`。
  3. 不写 blocker，下一步进入 `implement port`。
- **状态与文件变化**：`docs/extensions.md` 中 EXT-001 变为 `broken`；port finding 新增；`phase: implement`。`review port` 复核通过后，EXT-001 回到 `active`，由 `doc` 记录最终状态。
- **下一步**：`/pstack-port implement port`。
- **明确不做**：不建 issue；不写 blocker；不切出 port 链。
- **验收证据**：`docs/port-review.md` 有对应 finding；EXT 状态 `broken`；`blocker: null`。

### S-11 implement port 修复 finding 时发现 EXT 被破坏

- **前置状态**：`port.state: active`、`phase: implement`；正在修 review finding；发现该修法会破坏 EXT。
- **触发**：`/pstack-port implement port`。
- **期望行为**：先按 `repair_target` 分类，不得先改坏再补：
  - `extension`：停止，写 EXT 工作记录和 blocker。
    - `mode: issue`、`active_item: EXT-ID`、`resume_route: implement port`。
    - `allowed_routes: [implement EXT-*, review EXT-*]`。
    - `review EXT-*` 通过后按 S-21 清 blocker，回到 `implement port`。
  - `port`：把 EXT 修复并入当前 fix 清单，继续 `implement port`。
  - `external`：记录证据，停一次问用户。
- **状态与文件变化**：按分类写 `docs/extensions/<EXT-ID>/review.md` 和/或 `docs/port-review.md`；port 实现不产生未登记的破坏。
- **下一步**：`review EXT-*` 或继续 `implement port`。
- **明确不做**：不默默破坏 EXT；不把 `port` 类修复写成 `implement issue`。
- **验收证据**：对应 blocker 或 finding 存在；最终 `review port` 时 EXT 恢复 `active`。

### S-12 review port 发现 FIX 无效

- **前置状态**：`port.state: active`、`phase: review`；`docs/port-fixes.yaml` 中某个 `status: active` 的 FIX replay 失败。
- **触发**：`/pstack-port review port`。
- **期望行为**：按原因处置：
  - `upstream-fixed`：标退役、删本地补丁、保留测试，移入 archive。
  - `obsolete`：标退役、删补丁和测试，移入 archive。
  - `conflict`：保留 `active`，按 S-23 转 issue 重修。
- **状态与文件变化**：`docs/port-fixes.yaml`、`docs/port-fixes-archive.yaml`、`docs/port-review.md` 更新。
- **下一步**：S-23 的 `implement #编号` 或继续 `review port`。
- **明确不做**：不静默删除；不把 `conflict` 当 `obsolete`。
- **验收证据**：replay 输出 FAIL；处置后 replay 全 PASS 或对应条目已归档；台账状态与报告一致。

### S-13 doc 发现不一致

- **前置状态**：`port.state: active`、`phase: doc`；`review port` 已通过。
- **触发**：`/pstack-port doc`。
- **期望行为**：向 `docs/port-review.md` 追加 `origin: doc` 的 `open` finding，写明证据；把 `phase` 置回 `review`；停止写入，不把任何能力标成通过。
- **状态与文件变化**：`docs/port-review.md` 新增 finding；`phase: review`；适配文档不留下未经验证的内容。
- **下一步**：`/pstack-port review port`。
- **明确不做**：不让 doc 直接改 finding 状态；不把文档缺口伪装成通过。
- **验收证据**：`docs/port-review.md` 有 `origin: doc` finding；`phase` 为 `review`。

### S-14 doc 正常完成

- **前置状态**：`port.state: active`、`phase: doc`；`review port` 通过；无 open finding。
- **触发**：`/pstack-port doc`。
- **期望行为**：
  1. 按上游 `claude-code.md` 的英文模板结构写本地适配树的适配文档。
  2. 按 R-07 写 `dsh.md` 的可选插件未启用降级说明。
  3. 按 R-08 用中文并保持 `pstack/README.md` 的可读结构。
  4. 用简体中文更新 `pstack/README.md` 的文档状态与最终覆盖。
  5. 按 R-01 核对并同步根 `README.md`，双语时同步所有语言版本。
  6. 清空 `docs/port-review.md` 正文，并设置 port 状态。
- **状态与文件变化**：`pstack/harness/`、`pstack/README.md`、根 `README.md` 更新；`docs/port-review.md` 只留完成头部；无 blocker 时 `port.state: idle`；有 core issue 待验收时 `port.state: done`。
- **下一步**：`idle` 或 `issue #编号`。
- **明确不做**：不跳过根 README 同步；不把 `port-review.md` 当长期状态文件。
- **验收证据**：`vp test`、`generate --check`、`port-fixes replay` 通过；根 `README.md` 已核对并按差异更新（无差异时记录“根 README 无差异”）；`port.state` 正确。

### S-15 issue 验收与恢复

- **前置状态**：blocker 非空；对应 EXT/FIX 已实现并通过 review；或 core issue 对应的 port 轮次已 `doc` 完成；或 external issue 的证据和结论已准备。
- **触发**：`/pstack-port issue #123`。
- **期望行为**：
  1. 核对验收行为、测试、真实安装验证和公开结论。
  2. 按 `target` 更新记录：
     - `extension`：验收通过后 `proposed → active`；部分实现保持 `proposed` 并记录缺口；`broken` 修复通过后回 `active`。
     - `bug`：保持 FIX `active`。
     - `core`：更新 `pstack/README.md` 的最终覆盖。
     - `external`：只发布结论，不改内部记录。
  3. 清理 `docs/issues/123/review.md`。
  4. 清 blocker。
  5. 按 `resume_route` 恢复，可选值为 `idle`、`audit`、`implement port`、`review port`、`doc`。
- **状态与文件变化**：blocker 清空；`port.state` 回到 `idle` 或恢复对应 phase；issue 工作文件删除。
- **下一步**：`resume_route`。验收失败时按 S-24 回退。
- **明确不做**：不带着未关闭的 blocker 恢复 port；不把 `open` FIX 当验收完成；`external` 不写内部实现记录。
- **验收证据**：blocker 为 `null`；issue 已关闭或发布结论；`resume_route` 可执行；失败时 blocker 仍非空。

### S-16 issue 串行

- **前置状态**：已有活跃 issue A（blocker 非空）；又出现 issue B。
- **触发**：用户尝试 `/pstack-port review #B`、`/pstack-port implement #B` 或任何 B 的路线。
- **期望行为**：拒绝 B；B 不开始，也不建立工作文件；A 的状态和工作文件不变。
- **状态与文件变化**：无；只报告当前活跃 issue A。
- **下一步**：继续 A 的 `allowed_routes`。
- **明确不做**：不切换、不并行、不合并两个 issue。
- **验收证据**：B 的路由被拒绝；A 的 blocker 和状态未变。

### S-17 port 完成后新 issue 的分流与阻塞

- **前置状态**：`port.state: idle`、`phase: done`、`blocker: null`；出现新 GitHub issue，尚未分诊。
- **触发**：`/pstack-port review #123`。
- **期望行为**：先分诊，再按 `target` 分流：
  1. `core`：写 blocker。
     - `mode: core`、`active_item: "#123"`、`resume_route: idle`。
     - `allowed_routes: [audit, implement port, review port, doc, issue #123]`。
     - 下一步 `audit`。port 链放行，其他 issue 路由拒绝。
  2. `extension` 或 `bug`：写 blocker。
     - `mode: issue`、`active_item: "#123"`、`resume_route: idle`。
     - `allowed_routes: [implement #123, review #123, issue #123]`。
     - 下一步 `implement #123`。port 链全部拒绝。
  3. `external`：写 blocker。
     - `mode: issue`、`active_item: "#123"`、`resume_route: idle`。
     - `allowed_routes: [issue #123]`。
     - 下一步 `issue #123`。port 链全部拒绝。
- **状态与文件变化**：blocker 非空；`core` 在 `audit` 前保持 `port.state: idle`，`audit` 后进入 `active`；`extension`、`bug`、`external` 保持 `idle`。
- **下一步**：`audit`、`implement #123` 或 `issue #123`，取决于分诊结果。
- **明确不做**：不在分诊前拒绝所有 port 路由；不允许切换到另一个 issue。
- **验收证据**：`core` 可执行 `audit`；`extension`、`bug`、`external` 执行 `audit` 被拒绝；blocker 字段完整；验收后 `blocker: null`。

### S-18 port 完成后 EXT 修复需要改 port

- **前置状态**：`port.state: idle`、`phase: done`；发现 `EXT-001` 被破坏，且修复必须改 port 基线。
- **触发**：用户发起 EXT-001 修复。
- **期望行为**：
  1. 按 `core` 流程写 blocker：`mode: core`、`active_item: EXT-001`、`allowed_routes: [audit, implement port, review port, doc]`、`resume_route: idle`。
  2. `audit` 把 EXT-001 的 `required_behavior` 作为本轮 port 需求。
  3. `doc` 完成后把 EXT-001 恢复为 `active`，并清 blocker。如果 EXT-001 有关联 GitHub issue，把 blocker 的 `active_item` 改为 `#n`，把 `issue #n` 加入 `allowed_routes`，doc 完成后进入 `issue #n` 验收；否则直接清 blocker。
- **状态与文件变化**：blocker mode core；`port.state: active` → `done` → `idle`；`docs/extensions.md` 中 EXT-001 从 `broken` 回到 `active`。
- **下一步**：`audit`。
- **明确不做**：不建普通 issue 链；不走 `implement EXT-001` 修 port 行为。
- **验收证据**：blocker mode core；audit 有 EXT-001 需求；doc 后 EXT 为 `active`；`port-fixes replay` 通过。

### S-19 FIX 记录归档

- **前置状态**：`docs/port-fixes.yaml` 中存在 `upstream-fixed` 或 `obsolete` 的退役候选。
- **触发**：`/pstack-port doc` 的 `port-fixes compact`。
- **期望行为**：把上一轮之前退役的条目移入 `docs/port-fixes-archive.yaml`，带 `retired_at`、`retired_reason`；活跃台账只保留 `open`/`active`。
- **状态与文件变化**：两个 YAML 文件更新；`replay` 不读取归档。
- **下一步**：继续 `doc` 完成。
- **明确不做**：不删除历史；不复用 `FIX-*` 编号。
- **验收证据**：active 文件无退役条目；archive 有条目和退役原因；`replay` 只跑 active。

### S-20 doc 写 dsh.md 的可选插件降级说明

- **前置状态**：`port.state: active`、`phase: doc`；`pstack/README.md` 当前的可选插件条目已确定。
- **触发**：`/pstack-port doc`。
- **期望行为**：按 R-07 在 `dsh.md` 增加可选插件降级说明；每个 `OPT-*` 都有“启用后的能力”和“未启用时的替代路径或跳过行”，写法参照 `## Cursor-only features` 的平台排除表。
- **状态与文件变化**：`dsh.md` 新增/更新可选插件小节；`pstack/README.md` 的文档状态区记录该产物。
- **下一步**：继续 `doc` 完成。
- **明确不做**：不只写插件启用后的能力；不只写“不可用”而不给替代路径或 `Skipped in DeepSeek Harness` 行；不把未启用插件的步骤写成通过。
- **验收证据**：`dsh.md` 的 `OPT-*` 编号集合与 `pstack/README.md` 当前可选插件条目一致；每行有 `When not enabled` 或等价的“未启用”说明；跳过的步骤使用 `Skipped in DeepSeek Harness: <step>. <reason>.`。

### S-21 review #编号 与 EXT-* 实现后审查

- **前置状态**：blocker 存在，或独立本地 EXT 没有 blocker；对应工作文件处于 review。
- **触发**：`/pstack-port review #123` 或 `/pstack-port review EXT-001`。
- **期望行为**：
  1. 核对当前工作项的验收行为、测试和真实安装验证。
  2. 确认实现没有修改 port 基线。
  3. 通过：`#123` 进入 `issue #123`；有 GitHub issue 的 EXT 也进入 `issue #n`；没有 issue 的本地 `EXT-001` 恢复 `active`、清 blocker、按 `resume_route` 返回。没有 blocker 的独立 EXT 在 review 通过后直接结束，下一步 `idle`。
  4. 不通过：写 finding，状态回到 implement，下一步 `implement #123` 或 `implement EXT-001`。
- **状态与文件变化**：`docs/issues/123/review.md` 或 `docs/extensions/EXT-001/review.md` 的 review 状态更新；`#123` 的 blocker 保持到 `issue #123` 验收；本地 EXT 的 blocker 在通过后清空。
- **下一步**：`issue #123`、`implement #123`、`implement EXT-001` 或 `resume_route`。
- **明确不做**：不在 review 中改实现或测试；不把失败写成通过。
- **验收证据**：review 工作文件状态；失败时有 finding；通过后 `issue #123` 可执行，或本地 EXT 为 `active`。

### S-22 issue 创建

- **前置状态**：`port.state: idle`、`blocker: null`；用户要创建一个新的 GitHub issue，可带一个尚无追踪入口的 `EXT-*`。
- **触发**：`/pstack-port issue` 或 `/pstack-port issue EXT-001`。
- **期望行为**：
  1. 起草 Issue 内容，展示目标仓库和完整草稿，取得用户确认。
  2. 创建 GitHub issue，记录编号和 URL。
  3. 初始化 `docs/issues/<编号>/review.md`，写 `target: undecided`、`status: open` 和公开状态，不写技术 findings。带 `EXT-001` 时，把 Issue 编号和 URL 写入 `docs/extensions.md` 的 `Issue` 字段。
  4. 写 blocker，`mode: issue`、`active_item: "#编号"`、`allowed_routes: [review #编号]`、`resume_route: idle`。
- **状态与文件变化**：`docs/issues/<编号>/review.md` 建立；blocker 非空；`port.state` 保持 `idle`。
- **下一步**：`/pstack-port review #编号`。
- **明确不做**：不开始 implement；不把创建 Issue 当作接受功能或确认缺陷；不跳过 `review #编号` 分诊。
- **验收证据**：Issue 已创建且内容经确认；工作文件字段完整；blocker 字段完整；`review #编号` 可执行，port 路由被拒绝。

### S-23 FIX conflict 转 issue

- **前置状态**：`port.state: active`、`phase: review`；`docs/port-fixes.yaml` 中某个 `active` FIX replay 失败，原因是 `conflict`，问题仍存在。
- **触发**：`/pstack-port review port`。
- **期望行为**：
  1. FIX 保持 `active`，不归档。
  2. 写 blocker，`mode: issue`、`active_item` 为 FIX 的 `issue` 值（`#编号` 或 `EXT-*`）、`resume_route: review port`。
  3. `#编号` 用 `allowed_routes: [implement #编号, review #编号, issue #编号]`；`EXT-*` 用 `allowed_routes: [implement EXT-*, review EXT-*]`。
  4. 下一步 `implement #编号` 或 `implement EXT-*`。
- **状态与文件变化**：blocker 非空；port 链暂停；FIX 仍为 `active`。
- **下一步**：`implement #编号` 或 `implement EXT-*`。
- **明确不做**：不静默删除；不归档；不把 `conflict` 当 `obsolete`。
- **验收证据**：blocker 字段完整；FIX 仍为 `active`；`resume_route` 为 `review port`。

### S-24 issue 验收失败回退

- **前置状态**：blocker 非空；`issue #123` 的验收检查不通过。
- **触发**：`/pstack-port issue #123`。
- **期望行为**：
  1. 保持 blocker；保持 Issue 打开；不写通过。
  2. 把缺口写进对应工作文件：Issue、EXT review 或 FIX 记录。
  3. 按缺口回退：
     - `extension` 或 `bug`：把 `issue #n` 从 `allowed_routes` 移除，回 `review #123` 或 `implement #123`；修完 review 通过后再加回。
     - `core`：把 `port.state` 从 `done` 改回 `active`，`phase` 设为 `review` 或 `doc`，把 `issue #n` 从 `allowed_routes` 移除，把对应 port 路由加回；在 `docs/port-review.md` 重开一条 finding；修完重新 `doc`，再加回 `issue #n`。
     - `external`：补证据后重试 `issue #123`。
- **状态与文件变化**：blocker 不变；`core` 缺口时 port 从 `done` 回到 `active`；Issue 工作文件记录缺口。
- **下一步**：上述回退路由。
- **明确不做**：不清 blocker；不关闭 Issue；不把部分实现写成完成。
- **验收证据**：blocker 仍非空；Issue 仍打开；缺口记录存在；下一路由可执行。

## 3. 技能要求

### R-01 根 README 动态内容同步（doc 最后一步）

`doc` 完成前，执行 `doc` 的 agent 逐项核对当前 `pstack/README.md`，检查根 `README.md` 中会随 port 结果变化的动态内容。这是 `doc` 的完成条件，不是交给用户复核。**没有差异就不改。**

检查范围（按根 README 当前结构定位，不绑定固定章节号）：

- 版本与兼容性：DSH、pstack、Node.js、Cordis 的版本，pstack 上游基线提交。
- 顶部统计与简介数字：技能、playbook、原生工具、preset、随包脚本的数量。
- `常用入口`：上游技能入口的新增或删除。
- `能力`：原生工具与随包脚本的清单。
- `可选 DSH 插件`：清单、默认状态、实验性、启用条件、能力、边界与冲突。
- `兼容性`：版本表、冲突与降级说明。
- `实现方式`：仅在架构变化时检查。

要求：

- 写入根 README 前，先按 R-08 的 `technical-writing` 与 `unslop` 写法整理要写入的内容。
- 根 README 的主语言不固定：可能是英文主文件加中文版，也可能是中文主文件加英文版；先识别实际文件，不假定 `README.md` 是中文。
- 根 README 如果是双语，同步更新所有语言版本。语言版本可能是同一文件内的双语段落，也可能是 `README*.md` 多文件；先识别实际结构，再按段落一一对应替换。
- 不能同步所有语言版本时，在 `doc` 报告中列出缺失的语言和段落，不静默只改一种语言。
- 可选插件清单与 `pstack/README.md` 中当前的可选插件条目一一对应；新增或删除插件时同步增删。
- 每项写清包名、默认状态、是否实验性、启用条件、能力、边界与冲突。
- 浏览器 provider 的组合与当前可选插件条目一致。
- 互斥、单 provider 槽、替换全局工具等冲突与 `pstack/README.md` 当前内容一致。

`pstack/README.md` 的 `doc` 写入范围：按当前结构更新文档状态与最终覆盖相关字段；上游需求、分类、既定适配和实现记录保持原样。

完成标准：上述动态内容与当前 `pstack/README.md` 和实现一致；没有差异时在 `doc` 报告中写“根 README 无差异”，不修改文件；有多个语言版本时，每个版本都完成对应检查。具体章节名和排版随 README 优化调整，本规格不绑定。

### R-02 port 状态与 blocker

- 每次分支调用先读 `docs/port-state.yaml`；`blocker` 非空时只执行 `allowed_routes`，其他路由拒绝并报告。
- `port` 轮次进行中收到新 issue：写 blocker；`mode: issue` 时阻塞 port，验收后按 `resume_route` 回到中断的阶段；`mode: core` 时把该 issue 作为 core 输入回到 `audit` 重新冻结需求，不在 `implement`/`review` 中直接塞入。
- `audit` 把 `port.state` 置 `active`、`phase: audit`，重置 `docs/port-review.md`。
- `doc` 清空 `docs/port-review.md` 正文；无 blocker 时置 `idle`，有 core issue 待验收时置 `done`。
- `docs/port-review.md` 只是轮次工作文件，不作为路由状态。
- 不再在 Markdown 文件里维护 `审查状态`、`收尾状态`、`阻断-可修复`、`阻断-待决策`、`阻断摘要`、`用户确认` 这类并行状态；所有状态以 `docs/port-state.yaml` 为准。

### R-03 FIX 台账

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

`docs/port-fixes-archive.yaml`：

```yaml
schema: 1
fixes:
  - id: FIX-001
    ...
    status: upstream-fixed | obsolete
    retired_at: <ISO 日期>
    retired_reason: "..."
```

规则：

- `review #编号` 分诊为 bug 时创建 `status: open` 的 FIX。
- `implement #编号` 填 `files` 与 `test`，改 `status: active`。
- `review port` 判定无效时按 S-12 处置。
- `doc` 执行 `port-fixes compact`，把上一轮之前退役的条目移入 archive。
- `replay` 只读 `docs/port-fixes.yaml` 的 `status: active`。

### R-04 命令表面

| 命令 | 作用 |
|---|---|
| `/pstack-port upstream` | 更新上游检出并给出影响评估；port 前置，不算开始 |
| `/pstack-port prepare` | 整理移植树与构建链；port 前置，不算开始 |
| `/pstack-port audit` | 重建 `pstack/README.md` 与 `docs/port-review.md`，开始 port 轮次 |
| `/pstack-port implement port` | 实现/修复 port core |
| `/pstack-port implement EXT-*` | 实现/修复一个本地 EXT |
| `/pstack-port implement #编号` | 实现/修复一个 GitHub issue 映射的 EXT 或 FIX |
| `/pstack-port review port` | 审查 port 实现，核查 EXT 与 FIX |
| `/pstack-port review EXT-*` | 审查一个本地 EXT 的实现 |
| `/pstack-port review #编号` | 首次分诊 GitHub issue；已分诊后做实现审查 |
| `/pstack-port doc` | 写适配文档，更新 `pstack/README.md` 与根 `README.md`，结束 port 轮次 |
| `/pstack-port issue [EXT-* 或 #编号]` | 创建/验收 GitHub 事项 |

`implement` 无参数时：不自动发现 GitHub issue；只询问用户选择 `port`、`EXT-*` 或填写 `#编号`。可列出本地已有的 `docs/issues/*` 和 `docs/extensions.md` 待处理项，但不得访问 GitHub 自动发现。

### R-05 场景到分支的映射

| 场景 | 主要分支 |
|---|---|
| S-01 | `prepare`、`audit`、`implement`、`review`、`doc` |
| S-02 | `implement`（port） |
| S-03 | `implement`、`review`（EXT） |
| S-04 | `implement`、`review`、`issue`（GitHub） |
| S-05 | `review`（#编号分诊）、`audit` |
| S-06 | `review`（#编号分诊）、`implement` |
| S-07 | `review`（#编号分诊）、`issue` |
| S-08 | `review`（port） |
| S-09 | `review`（port）、`implement`（EXT） |
| S-10 | `review`（port）、`implement`（port） |
| S-11 | `implement`（port）、`review`（port） |
| S-12 | `review`（port） |
| S-13 | `doc`、`review`（port） |
| S-14 | `doc` |
| S-15 | `issue` |
| S-16 | 所有路由的入口门禁 |
| S-17 | 所有路由的入口门禁 |
| S-18 | `review`（port）、`audit`、`doc` |
| S-19 | `doc` |
| S-20 | `doc` |
| S-21 | `review`（#编号或 EXT） |
| S-22 | `issue`（创建） |
| S-23 | `review`（port）、`implement` |
| S-24 | `issue`、`review`、`implement`、`doc` |

重构完成标准：每个 `S-xx` 至少映射到一个分支文件，且在对应分支的完成标准中有可执行的检查；没有场景落空。

### R-06 锁定与变更

- `SPEC.md` 文件头标记 `Status: user-locked`、`Owner: user`。
- 根 `AGENTS.md` 增加一条：重构 `pstack-port` 前先读 `.agents/skills/pstack-port/SPEC.md`；该文件用户锁定，任何 agent 不得修改，只能由用户明确要求追加。
- `SKILL.md` 不引用 `SPEC.md`，避免正常调用技能时加载重构文档。
- 只追加；旧场景失效标 `superseded-by`，保留原文；编号不复用。

### R-07 dsh.md 可选插件降级说明

`doc` 写本地主适配器 `dsh.md` 时，必须同时写清可选插件**默认未启用**时的行为，不能只写启用后的能力。当前 `dsh.md` 只有零散的 `session-search`、`forge` 说明，缺少覆盖当前全部 `OPT-*` 的系统性降级表；本轮重构由 `doc` 补齐。

- **覆盖范围**：`pstack/README.md` 当前可选插件条目中的全部 `OPT-*`（当前为 `OPT-01`～`OPT-09`），不得只挑与当前技能相关的几项。
- **位置**：在 `dsh.md` 增加 `## Optional plugins`（英文）一节，按 `OPT-*` 编号逐行说明；如果同时在 Tools、Subagent fields、Paths 等表格里分散说明，仍要在该节保留索引，保证可逐项检查。
- **每行至少包含**：
  - `OPT-*` 编号与插件包名；
  - 启用后能做什么；
  - 未启用时的替代路径（fallback），或 `Skipped in DeepSeek Harness: <step>. <reason>.` 跳过行；
  - 未启用时不得声称该步骤通过。
- **与平台排除的区别**：平台排除是 DSH 没有对应能力；可选插件是 DSH 有能力但默认关闭。因此可选插件行要先写“启用 `<package>` 可获得 `<capability>`”，再写未启用时的 fallback 或 skip；不要把可选插件写成永久不支持。
- **写法参照 `## Cursor-only features`**：跳过行原样使用，不停止、不重试、不把跳过写成通过；有替代路径时写清替代命令或工具。
- **示例（只示意）**：
  - `OPT-02` forge bundle 未启用 → 用 `gh`；`gh` 不可用时报 blocked。
  - `OPT-01` worktree bundle 未启用 → 用 `bash` 执行 `git worktree add` 并传 `cwd`。
  - `OPT-06` session search 未启用 → 只处理当前会话，跨会话读取标记为不可用。
- **完成标准**：`dsh.md` 的 `OPT-*` 编号集合与 `pstack/README.md` 当前可选插件条目一致；每个编号都有非空的“未启用”说明；`Skipped in DeepSeek Harness` 行存在；没有“未启用但写成通过”的表述。

### R-08 pstack/README.md 与根 README 的写作优化

`audit` 重建 `pstack/README.md`、`doc` 更新 `pstack/README.md` 或根 `README.md` 时，先到 upstream pstack 检出里找两个写作技能并读文件：

- `skills/technical-writing/SKILL.md`
- `skills/unslop/SKILL.md`

按 `<pstack>` 下的 `skills/<技能名>/SKILL.md` 定位，不写死上游检出路径。这两个技能声明了 `disable-model-invocation: true`。直接读文件内容，不依赖 skill catalog。根 README 只在有差异时更新。

- 一份文档只选一个 mode：`pstack/README.md` 以 reference 为主，根 README 的安装与使用段以 how-to 为主；同一节不混用教程、参考和论证。
- `pstack/README.md` 用简体中文。它是移植审查记录，不翻成英文。
- `dsh.md` 以上游 `claude-code.md` 的英文结构、措辞和章节为主。只替换宿主名、字段、路径和行为，不把模板翻译成中文，不新增与模板无关的章节。
- 按 Google developer style 写：用“你”、现在时、主动语态；指令用命令句；条件放在指令前；常用情况在前。
- 按 STE 规则写：一句一个动作或一个意思；长句拆短；警告和条件放在步骤前。
- 按 Global English 写：一个概念只用一个名字；代词指向明确；少用 slash、缩写和隐喻。
- 先给结论或能力总表，再给证据、缺口、平台排除；审查过程不混进能力结论。
- 每个能力 ID 的状态只在分阶段状态表定义一次，其他章节引用，不重复状态表。
- 长证据、脚本细节和逐行引用放到附录或链接，主表只保留决策所需信息。
- 统一术语：能力 ID、最终覆盖、缺口 G-xx、平台排除、既定适配。
- 写完按 `unslop` 扫一遍，删掉 AI 词汇、空洞的 -ing 句、强行三段式、破折号和冒号滥用、粗体滥用、chatbot 话术、填充词、过度 hedging、抽象隐喻。

完成标准：`pstack/README.md` 和根 `README.md` 的目标段落能从上到下读完并定位每个能力的状态与证据；没有重复状态表；没有为排版服务的重复段落；没有差异的段落不改；`technical-writing` 和 `unslop` 都过了一遍。

### R-09 下一步命令

- 每次分支执行结束，报告必须给出下一条可执行命令。
- 命令写成完整的 `/pstack-port ...` 形式，参数齐全。
- 没有下一步时写“本轮结束，无下一步”。
- 有多个选择时，列出每个命令和适用条件，让用户选择。
- 每个分支文件的完成标准必须包含这条检查。

## 4. 验收证据规范

每条场景的「验收证据」至少使用以下一种，并写明具体命令或可观察结果：

| 类型 | 要求 |
|---|---|
| 命令 | 写明完整命令和期望退出码，例如 `node pstack/scripts/port-fixes.mjs replay` 退出 0 |
| 测试 | 写明测试文件/用例，例如 `tests/port-fixes/FIX-001.test.ts`：无修复失败、有修复通过 |
| 可观察结果 | 写明文件/字段/路由行为，例如 `docs/port-state.yaml` 的 `blocker.mode: core`；`implement port` 被拒绝并打印 blocker |

通用门禁：

```bash
vp check
vp test
node pstack/scripts/generate-pstack-harness-tree.mjs --check
node pstack/scripts/port-fixes.mjs replay
```

所有场景验收时至少运行与场景相关的门禁；S-14、S-15 必须运行全部四条。

## 5. 重构验收清单

- [ ] 24 个场景全部有对应分支和验收证据。
- [ ] `docs/port-state.yaml` 是唯一状态源；`docs/port-review.md` 只做轮次工作文件。
- [ ] blocker 的 `mode: issue` 与 `mode: core` 路由与 S-05、S-09、S-10、S-15、S-17、S-18 一致。
- [ ] `docs/port-fixes.yaml` 与 `docs/port-fixes-archive.yaml` 的 schema、状态、compact 与 R-03 一致。
- [ ] 根 `README.md` 的 R-01 动态内容检查已在 `doc` 完成标准中列出；无差异时允许不更新。
- [ ] `dsh.md` 的全部 `OPT-*` 未启用降级/跳过说明已按 R-07 写入 `doc` 完成标准。
- [ ] `pstack/README.md` 的 R-08 写作优化已进入 `audit` 与 `doc` 完成标准。
- [ ] 每个分支的完成标准包含 R-09 的下一步命令检查。
- [ ] 所有分支文件不再维护旧的 `审查状态`、`收尾状态`、`阻断-*`、`用户确认` 状态。
- [ ] `SKILL.md` 不引用 `SPEC.md`；根 `AGENTS.md` 有锁定指针。
- [ ] `vp check`、`vp test`、`generate --check`、`port-fixes replay` 全绿。
