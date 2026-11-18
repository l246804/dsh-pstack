# DSH 适配文档编写规则

适用于 `playground/fixtures/native/dsh.md`、`playground/fixtures/native/dsh.zh.md`、`port/dsh.md` 和 `port/dsh.zh.md`。本文件定义模板、块职责和写法约束。

## 模板

```markdown
# pstack in DSH

pstack skills use Cursor names. In DSH, read this file once per session, then map each Cursor name from the skill with the tables below. `<pstack>` means the folder that holds `skills/` and `docs/`.

Use only tools visible in the current session. If a mapped tool or optional capability is unavailable, follow the fallback in that row. Do not assume optional plugins are enabled because a name appears here.

## Tools

## Subagent fields

## Models

## setup-pstack

## Paths

## Cursor-only features
```

`port/dsh.md` 在核心块之后追加：

```markdown
## Plugin tools

## Agent Teams

## Local replacements
```

`native/dsh.md` 不写 `Plugin tools`、`Local replacements` 或 `Optional plugins`。`port/dsh.md` 也不写 `Optional plugins`；具体可选项和安装方式放在根 `README.md`。

## 通用写作约束

以下约束适用于每一个块，块规则之外优先遵守。

- 这张表是运行时适配卡，不是 schema 手册、参数手册或安装教程。每行只回答“这一项在 DSH 里映射成什么，缺失或不可用时怎么办”，不回答“它内部怎么做”。
- 不复述运行时契约：不写参数必填或可选清单、枚举、返回结构、错误分支、schema 版本号、字段字面量、默认家目录或环境变量默认值。这些由运行时工具和实际配置决定，抄进文档只会过期并误导；需要时指向对应工具或配置位置。
- 不写入当前环境真实存在的具体实例值，例如具体模型、provider、模型路由、主机名、账号、私有仓库或本地路径。需要说明时用占位符或通用记法（如 `<provider>/<model> [effort]`），让规则与实际部署解耦，不把某个环境的取值写进通用文档。
- 不引入只有本仓库内部才懂的简称或基线名。需要指代某个运行时能力时，用读者在会话里能看到的名称，或直接省略；不要用未定义的内部词汇解释另一个概念。
- 一个事实只写一次。同一信息不要在 Tools、Plugin tools、Subagent fields 之间重复；重复时保留最靠近使用动作的一处，其余删除或指向该处。
- 描述插件提供的工具时，作用范围只限该插件实际提供的资源。不要用“另一个工具隐藏了什么”来定义本工具的能力，也不要把原生工具与插件工具的边界混写。
- 每格默认不超过三句。写不下通常说明这一格在抄实现细节，应删减或移到证据。
- 全表按“Cursor 项 → DSH 差异”组织，不列官方能力清单，不写具体包名、开关名和安装步骤。

## 模板块规则

### 开头说明

- 说明本文件是运行时适配卡，不是 schema 手册或插件目录。
- 只写一句通用可用性规则：使用当前 session 实际可见的工具；缺失时按对应行 fallback；不假设可选插件已启用。
- 不写具体插件包名、开关名称、安装步骤或“当前一定有什么工具”。
- 不列官方插件能力清单。

### Tools

- 每个 Cursor 工具或操作一个单元格。
- 先写 DSH 替代名称，再写字段不存在、工具不存在或不可用时的动作。
- 替代工具是本插件提供时，只写替代关系和调用者必须知道的一条约束；完整用途写在 `Plugin tools`，参数和返回结构都不写。
- 不写必填或可选参数清单、内部校验、返回结构或错误分支。
- 默认三句以内；工具名变化不应要求改写本块之外的规则。

### Subagent fields

- 按上游 harness 文档的字段全集逐项映射，一个 Cursor 字段一行，不自行增删字段行。
- 写清字段在本运行时不存在时是省略、由 prompt 承载、由 agent 文件承载，还是用另一个字段替代。
- 每行只写该字段的映射和缺失时的处理；不要在这里重复工具级的必填或可选参数要求。
- 不重复 Tools 或 Plugin tools 已经写过的工具说明。

### Models

- 写清 provider、model、reasoning effort 的映射，以及发现能力不可用时的默认或继承规则。
- 角色文件行只写三件事：文件位置、谁在什么时机读取、缺失时的默认行为。不写默认家目录、内部基线术语、schema 版本号或字段清单。
- 不写具体模型清单；模型列表由当前运行时提供。

### setup-pstack

- 说明 DSH 的配置文件位置、持久化和覆盖规则，以及检测失败或模型不可用时的 fallback。
- 不复制上游完整步骤，只写与 DSH 不同的部分。
- 写入步骤只写行为：覆盖整文件保证幂等、缺失角色继承父路由、检测失败请用户补充。不写 schema 版本号或字段字面量。

### Paths

- 一个路径差异一个单元格，写清 DSH 路径、读取限制和生成物边界。
- 不写安装路径或包布局细节，不写环境变量默认值。

### Cursor-only features

- 每个 Cursor 专属能力一行，写清实际处理：跳过、替代、阻止或报告。
- 不使用“应该”“可以尝试”等不确定语气；明确默认动作。
- 这里的“替代”只指行为层的处理说明；需要专门技能或工具的本地替代方案写在 `Local replacements`。

### Plugin tools（仅 port）

- 每个插件工具一行，写名称、用途和边界；这是唯一展开工具用途的地方。
- 不写参数 schema、必填项、枚举或返回结构；没有该工具时不写占位行，也不假设插件未安装。
- 工具作用范围只写本插件实际提供的资源，不用原生工具的行为来定义它。

### Agent Teams（仅 port）

- 只在会话启用 Agent Teams 时说明 `pstack_subagent` 与团队任务的配合：先建共享任务，再用 `name` 启动子代理，最后把任务 reassign 给该名字，并把任务 id 写进子代理 prompt。
- 不写团队工具的 schema、参数清单或返回结构；`pstack_roles` 报告的是模型路由而非团队成员，这点只写一次。
- 默认三句以内，块规则之外优先遵守通用写作约束。

### Local replacements（仅 port）

- 只登记确实需要本地替代实现的依赖技能或外部技能，一行一个，写替代技能或 fallback。
- 已在能力分析里判定为“无需处理”或“显式跳过”的项不要登记在这里。确需跳过或报告的能力放 `Cursor-only features`，不要伪装成替代方案。
- 不写包名、安装方法，也不写渲染或运行时实现细节。

## 证据和检查

- native 的逐行证据放在 `playground/fixtures/native/dsh-evidence.md`；每条核心表格行必须有对应证据。
- 修改任一 `dsh.md` 后同步对应的 `dsh.zh.md`，保持 section 数、行数、Cursor 单元格和代码标识符一致。
- 生成前对照本文件自检：没有抄运行时 schema 字面量，没有跨块重复，没有未定义的内部简称，`Local replacements` 只含真实替代项。
- `scripts/generate-pstack.mjs --target port|native` 负责生成树；修改后人工检查结构并运行 `vp run generate:check`。
- 结构只允许模板中的核心块；`port` 只追加 `Plugin tools`、`Agent Teams` 和 `Local replacements`。
