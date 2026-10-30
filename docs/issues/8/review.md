# Issue #8：角色配置页需说明推理强度是基准值而非固定值，并说明浮动规则

- Issue: https://github.com/l246804/dsh-pstack/issues/8
- target: extension
- status: open
- port_round: no-impact
- stage: passed
- EXT: EXT-003
- 公开状态: open（2026-10-30 创建；2026-10-30 分诊为 EXT-003 的补充文案事项；2026-10-30 实现审查通过）
- 分诊证据提交: 本仓 `32a5464c19bd5828d22e6d1d694c1000e78656a2` · DSH `ce7073d51254c26cd63b22a60835b8f948deb447` · 上游 pstack `4dd1d05818d19792e7cd6e818f1667f95f7e1dbe`

## 复核

- 版本与环境：dsh-pstack 0.2.0-beta.3、DSH 0.2.2-alpha.2、Node.js 24.22.1、Linux / Web GUI，与 Issue 一致；Issue 无评论（2026-10-30）。
- 当前行为：`src/client/locales.ts` 的 `pstackRoles` 命名空间里，`subtitle`（`en` / `zh`）只说明编辑 `$DSH_HOME/pstack-models.mdc` 与每次保存重读模型目录；“推理强度”下拉只有 `effort`、`effortUnset`（未指定 / not set）、`effortDefault`（默认（{effort}） / default ({effort})），没有任何关于该值实际含义的说明。
- 最小复现（静态复核）：打开 Plugins → dsh-pstack → 角色模型配置页，`en` / `zh` 两版副标题与“推理强度”下拉均无“基准值/浮动规则”说明；`src/client/locales.ts` 与 `src/client/RoleSettingsPage.tsx` 中不存在相关说明键或文案。
- 预期与实际：预期是页面在 `en` / `zh` 两版说明 effort 是**起步值而非固定值**，并给出浮动规则（阶梯内上下移、何时上/下、触发方式、边界）；实际只有编辑文件与重读目录的描述，缺该说明。
- 分诊结论：`extension`。这是 EXT-003 角色模型配置页的展示文案补充，只改 `pstackRoles` locale 与页面渲染测试，不触及 port 基线的上游需求、`pstack/pstack/`、`pstack/harness/`、`pstack/README.md`。不选 `core`（不改上游能力与 README 基线）；不选 `bug`（现状与声明一致，是缺失说明而非行为缺陷）；不选 `external`（DSH 0.2.2-alpha.2 与现有页面已具备承载能力，责任在本仓插件）。

## required_behavior

- 角色模型配置页（`pstackRoles` 命名空间）在 `en` 与 `zh` 两种文案中都说明：配置的推理强度是**基准值（起步值）而非固定值**。
- 浮动规则说明：
  - 范围：只在**该模型声明的强度阶梯内**上下移动（即下拉里列出的那组 token，如 `low → medium → high`），无固定数值幅度。
  - 向上升级：任务比角色预设更难时（如复杂设计、并发、算法工作），调到更高 token。
  - 向下降低：剩余工作转为机械、常规时，调到更低 token。
  - 触发方式：单次委派用 `pstack_subagent` 的 `reasoningEffort` 覆盖；运行中的子代理用 `set_reasoning_effort` 调整，从下一步生效。
  - 边界：模型未声明任何 effort 时不浮动；「未指定」＝适配器默认。
- 说明可复用页面已有的 `efforts` 列表引用当前模型声明的强度阶梯，无需新增后端字段。
- `pstackRoles` 命名空间保持 `en` / `zh` 键集合完整且一致；现有 locale 完整性与页面渲染测试通过；不改变保存/校验行为。

## 映射

- 扩展登记：`EXT-003`（[docs/extensions.md](../../extensions.md)）；工作文件 [docs/extensions/EXT-003/review.md](../../extensions/EXT-003/review.md)。
- 关联：EXT-003 pstack 角色模型配置页（`active`，主体已于 Issue #2 验收）。本事项是该页的文案补充，非新 EXT。
- 行为依据（DSH 0.2.2-alpha.2，`ce7073d`）：`src/internal/effort.ts` 定义角色行 effort 为子代理「起步」强度，调用方可用 `reasoningEffort` 覆盖、运行中用 `set_reasoning_effort` 从下一步生效，且只接受模型声明的 token；`src/subagent.ts` 的 `reasoningEffort` 覆盖角色行（role line is a starting level）；`src/models.ts` 每 route 的 `efforts` 按从低到高顺序暴露。
- 候选实现面：`src/client/locales.ts`（`pstackRoles` 的 `en` / `zh` 新增说明键，键集合保持一致）、`src/client/RoleSettingsPage.tsx`（渲染新说明）、`tests/`（locale 完整性与页面渲染测试）。
- 约束：不新增后端字段，复用页面已有 `efforts` 列表；不改保存/校验行为；不改 port 基线路径。

## 实现

- 落点：`extension`（EXT-003 页面文案补充）。实现文件：`src/client/locales.ts`（`pstackRoles` 新增 7 个说明键，`en` / `zh` 键集合一致）、`src/client/RoleSettingsPage.tsx`（新增 `RoleEffortNote` 说明区块）、`tests/role-page.test.tsx`（中英渲染断言）。详见 [EXT-003 工作文件](../../extensions/EXT-003/review.md)。
- 行为：页面在 `en` / `zh` 两版说明推理强度是基准值（起步值）而非固定值，并给出浮动规则：只在模型声明的强度阶梯内移动、更难时上调、转机械时下调、单次委派用 `pstack_subagent` 的 `reasoningEffort` 覆盖、运行中用 `set_reasoning_effort` 从下一步生效、未声明 effort 时不浮动且「未指定」为适配器默认。未新增后端字段，未改保存/校验行为。
- 验证：`vp test tests/role-page.test.tsx` 8 passed；`vp test` 97 passed；`vp check` exit 0；`node pstack/scripts/generate-pstack-harness-tree.mjs --check` 输出 up to date，exit 0。
- 范围：实现代码仅上述三文件（提交另含 EXT-003 / Issue #8 工作记录更新），无 port 基线路径。

## 审查

- 审查（2026-10-30，`review #8`）：实现审查通过。实现提交 `ff4731e1a5884d26f027f0dd13ca015b8000e3e8`（审查基线 `b37c5a0a67c8423fb43c088952a2d153d2d843be`）；DSH `ce7073d51254c26cd63b22a60835b8f948deb447`；上游 pstack `4dd1d05818d19792e7cd6e818f1667f95f7e1dbe`。
- `required_behavior`：`pstackRoles` 的 `en` / `zh` 均说明推理强度是基准值（起步值）而非固定值，并覆盖阶梯范围、上调/下调、`pstack_subagent` 单次 `reasoningEffort` 覆盖、`set_reasoning_effort` 下一步生效、未声明 effort 不浮动与「未指定」为适配器默认；键集合完整一致，未改保存/校验路径，未新增后端字段。
- 门禁：`vp check` exit 0（71 文件格式通过，0 errors，仅既有 `require-array-sort-compare` warning）；`vp test` exit 0（16 文件 / 97 用例）；`vp run @internal/pstack#check:harness-doc` exit 0（2/2）；`node pstack/scripts/generate-pstack-harness-tree.mjs --check` exit 0；`node pstack/scripts/port-fixes.mjs replay` exit 0（无 active FIX）；`vp run build` exit 0。
- 真实安装：`pnpm pack` 产物在临时 `$DSH_HOME` 的新 `review8web` profile 安装并启动 `dsh --profile review8web --port 3228 --no-open`；boot 模块图含 `dsh-pstack/client.js`，client combo HTTP 200（69,931 bytes），served client 包含新中英文案与 `plugins.bundle.config`。未用真实浏览器查看视觉；页面结构由静态渲染测试覆盖。
- 范围：`git diff --name-only b37c5a0..ff4731e` 为 6 个文件：3 个实现文件和 3 个工作记录；未改 `pstack/pstack/`、`pstack/runtime/`、`pstack/harness/`、`pstack/README.md` 等 port 基线路径，未新增权限、Host 服务或 Remote 方法。
- 结论：审查通过，`stage: passed`。下一步 `/pstack-port issue #8` 验收。
