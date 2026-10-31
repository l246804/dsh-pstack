# Issue #14：角色配置页需本地化角色标签、简化推理强度说明并调整下拉布局

- Issue: https://github.com/l246804/dsh-pstack/issues/14
- target: extension
- status: open
- port_round: no-impact
- stage: passed
- EXT: EXT-003
- 公开状态: open（2026-10-31 创建，无评论、无标签；2026-10-31 实现审查通过）
- 分诊证据提交: 本仓 `6686261fcd4b12bb17ae61dccef8b07dd32a371e` · DSH `ce7073d51254c26cd63b22a60835b8f948deb447` · 上游 pstack `4dd1d05818d19792e7cd6e818f1667f95f7e1dbe`

## 复核

- 版本与环境：dsh-pstack `0.2.0-beta.3`、DSH `0.2.2-alpha.2`、Node.js 24.22.1、Linux / Web GUI，与 Issue 声明一致；Issue 无评论（2026-10-31）。
- 当前行为（HEAD `6686261`）：`src/client/RoleSettingsPage.tsx` 的 `RoleCard` 头部只渲染 `role.key`（原始角色键）和 `singleRoute` / `listRoutes` 标记，没有本地化名称或用途说明；`src/client/locales.ts` 的 `pstackRoles` 也没有角色名/描述键。中文界面因此直接显示 `feature, refactoring`、`bug-fix` 等英文键。
- 推理强度说明（HEAD）：`effortBaselineTitle` / `effortBaselineIntro` 之外还有 `effortRuleRange`、`effortRuleUp`、`effortRuleDown`、`effortRuleTrigger`、`effortRuleBoundary` 五条规则；`effortRuleTrigger` 点名 `pstack_subagent` 的 `reasoningEffort` 与 `set_reasoning_effort`，超出页面配置语义。
- 下拉布局（HEAD）：`RoleRouteRow` 用单个 `display: flex; flex-wrap: wrap` 容器顺序渲染 provider / model / effort 三个 `<select>`，每个 `fieldStyle()` 只有 `minWidth: 0`、没有宽度基准；长 provider 名称与相邻控件互相挤压。
- Provider 边框：Issue 描述的是原生 `<select>` 焦点/外观行为；实测计算样式在选择前后一致（`1px solid`），本事项不要求修改。
- 最小复现（静态复核）：按上述 HEAD 代码打开角色配置页，中文界面角色卡片标题为原始英文键且无用途说明；推理强度说明包含工具名；三个下拉在同一行按内容宽度排布。
- 预期与实际：预期是角色标签本地化并说明用途、推理强度说明只保留“起步值 / 随难度浮动”、下拉分两层排布；实际为原始键、冗长工具说明与单行挤压布局。
- 分诊结论：`extension`。这是 EXT-003 角色模型配置页的展示层补充（角色标签、文案与布局），只改 `src/client/` 与测试，不触 `pstack/README.md`、`docs/harness/dsh.md`、生成树或运行时脚本，不属 port 基线（`core`）；当前行为与页面声明一致，是缺失的展示能力而非行为缺陷（`bug`）；无外部责任层（`external`）。关联现有 EXT-003，不新建 EXT。

## required_behavior

- 中文与英文界面分别为 17 个 manifest 角色显示非空本地化名称与用途说明，并保留原始角色键；覆盖检查遍历 `ROLE_MANIFEST` 与 `SUPPORTED_LOCALES`。
- 推理强度说明在中英文下都不包含 `pstack_subagent`、`set_reasoning_effort`，并明确“起步值 / 随任务难度浮动 / 非固定值”。
- 角色卡片中 provider 下拉独占一行，model 与 effort 在下一行；选择 provider 后长名称不被截断，选择前后边框计算样式一致。
- `pstackRoles` 的 `en` / `zh` 词典键集合完整一致；现有保存、校验、列表角色多路由行为不变；`vp check`、`vp test`、构建通过。
- 在 playground 的 17353 实例分别以中文和英文打开角色配置页验证，无控制台错误；真实保存/重置沿用现有验证方式。

## 映射

- 扩展登记：`EXT-003`（[docs/extensions.md](../../extensions.md)）；工作文件 [docs/extensions/EXT-003/review.md](../../extensions/EXT-003/review.md)。
- 关联：EXT-003 pstack 角色模型配置页（`active`，主体已于 Issue #2 验收）。本事项是角色标签、说明文案与下拉布局的补充，非新 EXT。
- 行为依据（DSH 0.2.2-alpha.2，`ce7073d`）：`src/internal/role-manifest.ts` 是 17 个角色的唯一清单（逗号属于角色键）；`src/client/RoleSettingsPage.tsx` 的 `RoleCard` / `RoleRouteRow` 是角色卡片与下拉的渲染面；`src/client/locales.ts` 是 `pstackRoles` 词典。
- 适配契约：配置页文案遵循 [2026-10-30-pstack-config-page-i18n](../../decisions/2026-10-30-pstack-config-page-i18n.md)（按能力 locale 目录、`SUPPORTED_LOCALES` 全量补齐）；不得引入按语言分支的渲染逻辑。
- 候选实现面：`src/client/RoleSettingsPage.tsx`、`src/client/locales.ts`、`src/client/` 内的角色展示数据、`tests/role-page.test.tsx`、`tests/bundle-config-dialog.test.tsx`；必要时同步 `docs/architecture.md` 的 Client 模块说明。
- 约束：不新增后端字段；不改保存/校验行为；不改 port 基线路径；保留现有 `inherit-parent` / `auto` 与列表角色行为。

## 实现

- 落点：`extension`（EXT-003 角色配置页展示补充）。实现文件：`src/client/locales.ts`（`pstackRoles` 新增 17 个角色的本地化名称与用途键及 `rolePresentation`）、`src/client/RoleSettingsPage.tsx`（角色卡片名称/原始键/用途、推理强度说明简化、provider 独占一行且 model/effort 并排）、`src/client/PstackBundleConfigDialog.tsx`（导航宽度与移除 locale 注入）、`src/client/index.ts`（移除 detail action 的 locale 注入）、`tests/role-page.test.tsx`（中英文角色覆盖与页面断言）、`docs/architecture.md`（模块说明同步）。详见 [EXT-003 工作文件](../../extensions/EXT-003/review.md)。
- 行为：中文/英文界面按当前 UI 语言显示对应角色名称与用途，原始角色键保留；推理强度说明只保留“起步值 / 随任务难度浮动 / 非固定值”；provider 独占一行，model 与 effort 下一行并排，选择前后边框计算样式一致；未改保存/校验行为。
- 验证：`vp check` exit 0（仅既有 `generate-pstack-harness-tree.mjs` warning）；`vp test` 16 文件 96 项通过；`node pstack/scripts/generate-pstack-harness-tree.mjs --check` 输出 up to date；`vp run build` exit 0；playground `127.0.0.1:17353` 中文/英文实测通过，无控制台错误。
- 范围：`git diff --name-only` 无 port 基线路径；未新增后端字段，未改列表角色与保存/校验行为。

## 审查

- 审查（2026-10-31，`review #14`）：实现审查通过。实现提交 `ad7a284`（审查基线 `8bdc291`）；DSH `ce7073d51254c26cd63b22a60835b8f948deb447`；上游 pstack `4dd1d05818d19792e7cd6e818f1667f95f7e1dbe`。
- `required_behavior`：17 个角色在中英文下均有名称与用途，原始角色键保留；推理强度说明不含内部工具名；provider 独占一行、model/effort 并排；`pstackRoles` 词典完整一致，保存/校验行为未改。证据见 [EXT-003 工作文件](../../extensions/EXT-003/review.md)。
- 门禁：`vp check` exit 0；`vp test` exit 0（16 文件 / 96 用例）；`vp run @internal/pstack#check:harness-doc` exit 0；`node pstack/scripts/generate-pstack-harness-tree.mjs --check` exit 0；`node pstack/scripts/port-fixes.mjs replay` exit 0；`vp run build` exit 0。
- 真实运行：playground `127.0.0.1:17353` 中文/英文角色配置页通过，无控制台错误；provider 选择前后 border 计算样式一致。
- 范围：`git diff --name-only 8bdc291..ad7a284` 为 4 个实现/文档文件与 4 个工作记录文件；无 port 基线路径，未新增权限、Host 服务或 Remote 方法。
- 结论：审查通过，`stage: passed`。下一步 `/pstack-port issue #14` 验收。
