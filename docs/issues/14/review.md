# Issue #14：角色配置页需本地化角色标签、简化推理强度说明并调整下拉布局

- Issue: https://github.com/l246804/dsh-pstack/issues/14
- target: extension
- status: open
- port_round: no-impact
- stage: implement
- EXT: EXT-003
- 公开状态: open（2026-10-31 创建，无评论、无标签）
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

待实现（下一步 `/pstack-port implement #14`）。工作区中上一轮角色配置页的未提交改动不视为本分支实现，`implement #14` 时按 `required_behavior` 核对、补齐并提交。

## 审查

待审查。
